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
 './locations': { all: async () => [] }
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
 // Exercise the actual Excel parser and two-pass import with duplicates in this dataset.
 const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Customers');
 sheet.addRow(['Full name', 'Mobile', 'Birthday']);
 sheet.addRow(['Spreadsheet Person','5555555555','1991-07-03']);
 sheet.addRow(['Spreadsheet Person','5555555555','1991-07-03']);
 sheet.addRow(['Spreadsheet Person','5555555555','']);
 const bytes = await book.xlsx.writeBuffer();
 const preview = await importPeople.preview(bytes);
 assert.equal(preview.rows.map(r => r.status).join(','),'NEW,DUPLICATE,REVIEW');
 const before = records('crm_party').length;
 const imported = await importPeople.importPeople(bytes, actor);
 assert.equal(imported.summary.created,1); assert.equal(imported.summary.duplicate,1); assert.equal(imported.summary.review,1);
 assert.equal(records('crm_party').length,before+1);
 assert.equal(imported.rows[0].party_pk,imported.rows[1].party_pk);
 assert.equal(imported.rows[2].party_pk,null);
 await importPeople.importPeople(bytes, actor);
 assert.equal(records('crm_party').length,before+1,'reimport is idempotent');
 const feed = await intake.resolutions(1);
 assert(feed.length > 0 && feed.every(r => r.party_pk));
 await intake.acknowledge(feed[0].resolution_id,1);
 assert.equal((await intake.resolutions(1)).length,feed.length-1);
 console.log('Registration workflow tests passed: creation, staging, merging, review decisions, retries, Excel, e-shop and acknowledgement feed');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => realDb.destroy());
