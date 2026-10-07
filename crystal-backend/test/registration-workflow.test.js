/* Workflow regression tests use an in-memory repository. They exercise production
 * intake/import code without contacting PostgreSQL or changing application data. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const matching = require('../src/services/crm/personDuplicates');
const realDb = require('../src/config/db');
const ExcelJS = require('exceljs');
const tables = {};
let candidateLoads = 0;
let pendingLoads = 0;
const keys = { crm_party: 'party_pk', crm_registration_intake: 'intake_id', crm_identity_resolution: 'resolution_id', crm_project_account: 'project_account_id' };
function records(name) { return tables[name] || (tables[name] = []); }
function query(name) {
 const filters = []; let operation; let payload; let first = false; let returning = false;
 const q = {
  where(key, value) { if (typeof key === 'object') Object.entries(key).forEach(([k,v]) => q.where(k,v)); else filters.push(r => r[key] == value); return q; },
  whereIn(key, values) { filters.push(r => values.some(v => v == r[key])); return q; },
  whereNull(key) { filters.push(r => r[key] == null); return q; },
  whereNot(key, value) { filters.push(r => r[key] != value); return q; },
  first() { first = true; return q; }, select() { return q; }, forUpdate() { return q; }, orderBy() { return q; }, limit() { return q; },
  insert(data) { operation = 'insert'; payload = data; return q; },
  update(data) { operation = 'update'; payload = data; return q; },
  returning() { returning = true; return q; }, onConflict() { return q; }, ignore() { return q; },
  then(resolve, reject) {
   try {
    let rows = records(name).filter(r => filters.every(test => test(r)));
    if (name === 'crm_registration_intake' && !operation && !first) pendingLoads += 1;
    if (operation === 'insert') {
     const row = Object.assign({ status: 'PENDING' }, payload);
     if (keys[name]) row[keys[name]] = String(records(name).length + 1);
     ['payload','candidates'].forEach(k => { if (typeof row[k] === 'string') row[k] = JSON.parse(row[k]); });
     records(name).push(row); rows = [row];
    }
    if (operation === 'update') rows.forEach(r => { Object.assign(r, payload); ['payload','candidates'].forEach(k => { if (typeof r[k] === 'string') r[k] = JSON.parse(r[k]); }); });
    return Promise.resolve(first ? rows[0] : operation === 'update' && !returning ? rows.length : rows).then(resolve,reject);
   } catch (error) { return Promise.reject(error).then(resolve,reject); }
  }
 };
 return q;
}
query.fn = { now: () => '2026-10-05T00:00:00Z' };
query.raw = async sql => { assert(sql.includes('pg_advisory_xact_lock')); };
const parties = {
 async insertParty(trx, data) {
  const [party] = await trx('crm_party').insert({ party_type: data.party_type || 'PERSON', party_status: 'ACTIVE', display_name: data.full_name || data.display_name }).returning('*');
  await trx('crm_person').insert(Object.assign({}, data, { party_pk: party.party_pk }));
  return party;
 },
 async insertContact(trx, pk, item) { await trx('crm_contact_point').insert(Object.assign({ party_pk: pk }, item)); }
};
const duplicateStub = Object.assign({}, matching, {
 async loadCandidates(people, options) {
  candidateLoads += 1;
  return records('crm_person').filter(row => !options.partyPk || row.party_pk === options.partyPk)
   .map(row => Object.assign({}, row, { contacts: records('crm_contact_point').filter(c => c.party_pk === row.party_pk) }));
 },
 async findSimilar(person) {
  return records('crm_person').map(existing => Object.assign({}, existing, matching.score(person, existing)))
   .filter(row => row.score > 40).sort((a,b) => b.score-a.score);
 }
});
function load(file, stubs) {
 const filename = path.join(__dirname, '../src/services/crm', file);
 const module = { exports: {} };
 const requireLocal = name => Object.prototype.hasOwnProperty.call(stubs, name) ? stubs[name] : require(require.resolve(name, { paths: [path.dirname(filename)] }));
 vm.runInNewContext(fs.readFileSync(filename,'utf8'), { module, exports: module.exports, require: requireLocal, Buffer, console }, { filename });
 return module.exports;
}
const common = {
 '../../config/db': query,
 './personDuplicates': duplicateStub,
 './parties.service': parties,
 '../audit.service': { updated() {}, imported() {} },
 '../../repositories/shared/transaction': { transaction: fn => fn(query) }
};
const intake = load('registrationIntake.service.js', common);
const importPeople = load('personImport.service.js', Object.assign({}, common, {
 './registrationIntake.service': intake,
 '../../repositories/crm/vocabulary.repository': { idOf: async () => 1 },
 './locations': { all: async () => records('crm_location') }
}));
const identity = load('identity.service.js', Object.assign({}, common, { './registrationIntake.service': intake }));
const person = { party_type: 'PERSON', full_name: 'Ada', mobile: '1234567890', birth_date: '1980-01-01', origin_project_id: 1 };
const actor = { manager_id: 1 };
const submit = (data, source) => intake.submit(query, data, { source_record_id: source });
async function main() {
 const original = await submit(person, 'first');
 assert.equal(original.outcome,'CREATED');
 assert.equal(records('crm_party').length,1);
 const strong = await submit(person, 'same');
 assert.equal(strong.outcome,'MERGED');
 assert.equal(strong.party_pk, original.party_pk);
 assert.equal(records('crm_party').length,1);
 const uncertain = await submit(Object.assign({}, person, { birth_date: null }), 'uncertain');
 assert.equal(uncertain.outcome,'QUEUED'); assert.equal(uncertain.party_pk,null);
 assert.equal(records('crm_party').length,1);
 const repeat = await submit(person, 'uncertain');
 assert.equal(repeat.intake_id, uncertain.intake_id, 'retry must reuse the pending submission');
 const resolved = await intake.decide(uncertain.intake_id, { action: 'MERGE', party_pk: original.party_pk }, actor);
 assert.equal(resolved.outcome,'MERGED');
 await assert.rejects(() => intake.decide(uncertain.intake_id, { action: 'NEW' }, actor), e => e.status === 409);
 assert.equal(records('crm_identity_resolution').length,3);
 const weak = await submit({ full_name: 'Different', mobile: person.mobile }, 'weak');
 assert.equal(weak.outcome,'CREATED', '40 points creates a new person');
 // Repeated rows matching a pending record must not create a party.
 const staged = await submit({ full_name: 'Ada', birth_date: person.birth_date, mobile: '9999999999' }, 'stage');
 assert.equal(staged.outcome,'QUEUED');
 const stagedCopy = await submit({ full_name: 'Ada', birth_date: person.birth_date, mobile: '9999999999' }, 'stage-copy');
 assert.equal(stagedCopy.outcome,'QUEUED');
 assert.equal(records('crm_party').length,2);
 await assert.rejects(() => intake.decide(stagedCopy.intake_id, { action: 'MERGE', candidate_intake_id: staged.intake_id }, actor), e => e.status === 409);
 const approvedNew = await intake.decide(staged.intake_id, { action: 'NEW' }, actor);
 const pendingMerged = await intake.decide(stagedCopy.intake_id, { action: 'MERGE', candidate_intake_id: staged.intake_id }, actor);
 assert.equal(approvedNew.party_pk,pendingMerged.party_pk);
 records('crm_project').push({ project_id: 2, project_code: 'ESHOP' }, { project_id: 3, project_code: 'APPSTORE' });
 const eshop = await identity.resolveAccount(query, { project_id: 2, external_account_id: 'shop-1', known_party_pk: original.party_pk });
 assert.equal(eshop.outcome,'QUEUED'); assert.equal(records('crm_project_account').length,0);
 await identity.resolveAccount(query, { project_id: 2, external_account_id: 'shop-1', known_party_pk: weak.party_pk });
 assert.equal(records('crm_registration_intake').find(r => r.intake_id === eshop.intake_id).candidates.length,2, 'retain conflicting e-shop suggestions');
 await intake.decide(eshop.intake_id, { action: 'ASSIGN', party_pk: weak.party_pk }, actor);
 assert.equal(records('crm_project_account')[0].party_pk,weak.party_pk);
 const again = await identity.resolveAccount(query, { project_id: 2, external_account_id: 'shop-1', known_party_pk: original.party_pk });
 assert.equal(again.party_pk,weak.party_pk,'a verified e-shop assignment overrides a platform suggestion');
 const rejected = await identity.resolveAccount(query, { project_id: 2, external_account_id: 'shop-2', known_party_pk: original.party_pk });
 await intake.decide(rejected.intake_id, { action: 'REJECT' }, actor);
 const retryRejected = await identity.resolveAccount(query, { project_id: 2, external_account_id: 'shop-2', known_party_pk: original.party_pk });
 assert.equal(retryRejected.outcome,'REJECTED'); assert.equal(retryRejected.party_pk,null);
 const app = await identity.resolveAccount(query, { project_id: 3, external_account_id: 'app-1', known_party_pk: original.party_pk });
 assert.equal(app.outcome, 'QUEUED', 'unverified subproject hints cannot bypass review');
 assert.equal(app.party_pk, null);
 // A department's own e-shop registration is matched and linked, not queued.
 const apiNew = await identity.resolveAccount(query, { project_id: 2, external_account_id: 'shop-api-1', external_login: 'grace',
  party: { full_name: 'Grace', birth_date: '1970-02-02', mobile: '6060606060' }, contacts: [{ contact_type: 'MOBILE', contact_value: '6060606060' }] });
 assert.equal(apiNew.outcome, 'CREATED', 'an API e-shop registration with no match creates a customer');
 assert(records('crm_project_account').some(r => r.external_account_id === 'shop-api-1' && r.party_pk === apiNew.party_pk && r.link_method === 'MATCHED'));
 const apiSame = await identity.resolveAccount(query, { project_id: 2, external_account_id: 'shop-api-2',
  party: { full_name: 'Grace', birth_date: '1970-02-02', mobile: '6060606060' }, contacts: [{ contact_type: 'MOBILE', contact_value: '6060606060' }] });
 assert.equal(apiSame.outcome, 'MERGED'); assert.equal(apiSame.party_pk, apiNew.party_pk);
 assert(records('crm_project_account').some(r => r.external_account_id === 'shop-api-2' && r.party_pk === apiNew.party_pk));
 // Exercise the actual Excel parser and two-pass import with duplicates in this dataset.
 // Phase 1 rows are complete and carry the person's e-shop PK and ID.
 records('crm_location').push({ location_pk: 701, full_name: 'Province / City' });
 records('crm_job_title').push(
  { job_title_id: 903, job_name: 'Database job', is_active: true },
  { job_title_id: 904, job_name: 'Inactive job', is_active: false }
 );
 const HEADER = ['E-shop PK', 'E-shop ID', 'Full name', 'Gender', 'Birthday', 'Mobile', 'Location ID', 'Address', 'Job title ID', 'Email'];
 const row = (pk, login, name, birthday, mobile, address, job) => [pk, login, name, 'F', birthday, mobile, 701, address, job || '', ''];
 const workbook = rows => { const book = new ExcelJS.Workbook(); book.addWorksheet('Customers').addRows([HEADER].concat(rows)); return book; };
 const book = workbook([
  row('9001', 'sheet1', 'Spreadsheet Person', '1991-07-03', '5555555555', '1 First Street'),
  row('9001', 'sheet1', 'Spreadsheet Person', '1991-07-03', '5555555555', '1 First Street'),
  row('9002', 'sheet2', 'Spreadsheet Person', '1992-01-01', '5555555555', '2 Other Street')
 ]);
 const bytes = await book.xlsx.writeBuffer();
 const preview = await importPeople.preview(bytes);
 assert.equal(preview.rows.map(r => r.status).join(','),'NEW,DUPLICATE,REVIEW');
 const before = records('crm_party').length;
 const accountsBefore = records('crm_project_account').length;
 const imported = await importPeople.importPeople(bytes, actor);
 assert.equal(imported.summary.created,1); assert.equal(imported.summary.duplicate,1); assert.equal(imported.summary.review,1);
 assert.equal(records('crm_party').length,before+1);
 assert.equal(imported.rows[0].party_pk,imported.rows[1].party_pk);
 assert.equal(imported.rows[2].party_pk,null);
 assert.equal(records('crm_project_account').length, accountsBefore, 'spreadsheet e-shop identifiers are never committed as accounts');
 const eshopReview = pk => records('crm_registration_intake').find(r => r.category === 'ESHOP' && r.source_record_id === pk);
 assert.equal(eshopReview('9001').status, 'PENDING');
 assert.equal(eshopReview('9001').candidates.length, 1, 'the repeated row adds no second candidate');
 assert.equal(eshopReview('9001').candidates[0].party_pk, String(imported.rows[0].party_pk));
 assert.equal(eshopReview('9001').payload.account.external_login, 'sheet1');
 assert.equal(eshopReview('9002'), undefined, 'identifiers wait until the person is resolved');
 assert.equal(records('crm_registration_intake').find(r => r.intake_id === imported.rows[2].intake_id).payload.unverified_accounts[0].external_account_id, '9002');
 const reviewedNew = await intake.decide(imported.rows[2].intake_id, { action: 'NEW' }, actor);
 assert.equal(eshopReview('9002').candidates[0].party_pk, String(reviewedNew.party_pk), 'resolving the person stages its identifiers');
 await intake.decide(eshopReview('9001').intake_id, { action: 'ASSIGN', party_pk: imported.rows[0].party_pk }, actor);
 assert(records('crm_project_account').some(r => r.external_account_id === '9001' && r.party_pk === imported.rows[0].party_pk && r.link_method === 'REVIEWED'));
 const partiesAfterImport = records('crm_party').length;
 await importPeople.importPeople(bytes, actor);
 assert.equal(records('crm_party').length,partiesAfterImport,'reimport is idempotent');
 // Incomplete rows and one e-shop account claimed by two people are errors.
 const incomplete = await importPeople.preview(await workbook([
  ['', '', 'No Identifiers', 'F', '1991', '5151515151', 701, '', '', ''],
  row('9100', 'first', 'First Owner', '1980-01-01', '5252525252', '3 Street'),
  row('9100', 'second', 'Second Owner', '1981-01-01', '5353535353', '4 Street')
 ]).xlsx.writeBuffer());
 assert.equal(incomplete.rows[0].status, 'ERROR');
 ['E-shop PK is required', 'E-shop ID is required', 'Birthday is required as YYYY-MM-DD', 'Address is required']
  .forEach(message => assert(incomplete.rows[0].errors.includes(message), message));
 assert.equal(incomplete.rows[1].status, 'NEW');
 assert.equal(incomplete.rows[2].status, 'ERROR');
 assert(/also on row 3/.test(incomplete.rows[2].errors[0]));
 await assert.rejects(() => importPeople.importPeople(Buffer.from([1, 2, 3]), actor), e => e.status === 400);
 // Lookup IDs come from database records, not workbook list sheets or row positions.
 const lookupBook = workbook([row('9200', 'lookup', 'Lookup Customer', '1975-03-03', '7777777777', '5 Lookup Road', 903)]);
 lookupBook.addWorksheet('Locations').addRows([['ID', 'Location'], [701, 'Wrong workbook location']]);
 lookupBook.addWorksheet('Job titles').addRows([['ID', 'Job title'], [903, 'Wrong workbook job']]);
 const lookupSheet = lookupBook.getWorksheet('Customers');
 const lookupBytes = await lookupBook.xlsx.writeBuffer();
 const lookupPreview = await importPeople.preview(lookupBytes);
 assert.equal(lookupPreview.rows[0].status, 'NEW');
 assert.equal(lookupPreview.rows[0].values.home_location_pk, 701);
 assert.equal(lookupPreview.rows[0].values.location_label, 'Province / City');
 assert.equal(lookupPreview.rows[0].values.job_title_id, 903);
 assert.equal(lookupPreview.rows[0].values.job_name, 'Database job');
 const lookupImport = await importPeople.importPeople(lookupBytes, actor);
 const saved = records('crm_person').find(entry => entry.party_pk === lookupImport.rows[0].party_pk);
 assert.equal(saved.home_location_pk, 701);
 assert.equal(saved.job_title_id, 903);
 lookupSheet.getCell('G2').value = 999999;
 lookupSheet.getCell('I2').value = 904;
 const invalidLookup = await importPeople.preview(await lookupBook.xlsx.writeBuffer());
 assert.equal(invalidLookup.rows[0].status, 'ERROR');
 assert.equal(invalidLookup.rows[0].errors.length, 2, 'unknown locations and inactive jobs are rejected');
 const templateBook = new ExcelJS.Workbook();
 await templateBook.xlsx.load(await importPeople.template());
 assert.deepEqual(templateBook.getWorksheet('Customers').getRow(1).values.slice(1),
  ['E-shop PK *', 'E-shop ID *', 'Full name *', 'Gender *', 'Birthday *', 'Mobile *', 'Location ID *', 'Address *', 'Job title ID', 'Email']);
 assert.equal(templateBook.getWorksheet('Locations').getCell('A2').value, 701);
 assert.equal(templateBook.getWorksheet('Job titles').getCell('A2').value, 903);
 assert.equal(templateBook.getWorksheet('Job titles').actualRowCount, 2, 'template excludes inactive jobs');
 // A merge adds job evidence that must be visible to the next row:
 // row 3 scores phone 40 + birthday 25 + job 5 = 70 only with row 2's job.
 const enriched = await importPeople.importPeople(await workbook([
  row('9301', 'cache', 'Cache Customer', '1993-05-09', '8888888888', '6 Cache Road'),
  row('9301', 'cache', 'Cache Customer', '1993-05-09', '8888888888', '6 Cache Road', 903),
  row('9302', 'changed', 'Changed Name', '1993-05-09', '8888888888', '7 Elsewhere', 903)
 ]).xlsx.writeBuffer(), actor);
 assert.equal(enriched.summary.created, 1);
 assert.equal(enriched.summary.duplicate, 2, 'later rows see evidence added by a merge');
 // Increasing file sizes must not reload the database per preview row.
 for (const size of [2000, 1000, 1000, 500]) {
  const rows = [];
  for (let i = 0; i < size; i += 1) rows.push(row(String(700000 + i), 'bulk' + i, 'Bulk ' + i, new Date(Date.UTC(1950, 0, 1) + i * 86400000).toISOString().slice(0, 10), String(3000000000 + i), i + ' Bulk Road'));
  const loadsBefore = candidateLoads; const pendingBefore = pendingLoads;
  const bulkReport = await importPeople.preview(await workbook(rows).xlsx.writeBuffer());
  assert.equal(bulkReport.summary.new, size);
  assert.equal(candidateLoads - loadsBefore, 1, 'one customer candidate load per preview');
  assert.equal(pendingLoads - pendingBefore, 1, 'one pending registration load per preview');
 }
 const feed = await intake.resolutions(1);
 assert(feed.length > 0 && feed.every(r => r.party_pk));
 await intake.acknowledge(feed[0].resolution_id,1);
 assert.equal((await intake.resolutions(1)).length,feed.length-1);
 console.log('Registration workflow tests passed: creation, staging, merging, review decisions, retries, Excel, e-shop and acknowledgement feed');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => realDb.destroy());
