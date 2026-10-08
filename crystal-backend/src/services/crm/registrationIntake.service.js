const crypto = require('crypto');
const db = require('../../config/db');
const duplicates = require('./personDuplicates');
const { HttpError } = require('../../utils/response');
const { transaction } = require('../../repositories/shared/transaction');
const audit = require('../audit.service');
const PAGE = '/admin/crm/customers';
const { publicParty } = require('./partyId');

async function lock(trx) { await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', ['crm_identity_registration']); }
// Request-scoped only. For writes, build this after taking the registration
// lock and refresh affected evidence after every submission in that transaction.
async function candidateContext(trx, people, options) {
 const persons = duplicates.createIndex(); const pending = duplicates.createIndex();
 const existing = await duplicates.loadCandidates(people, { trx });
 existing.forEach(row => persons.set(String(row.party_pk), row));
 const staged = await trx('crm_registration_intake').where({ status: 'PENDING', category: 'PERSON' });
 const addPending = row => pending.set(String(row.intake_id), Object.assign({}, row.payload.party, { intake_id: row.intake_id }));
 staged.forEach(addPending);
 return {
  persons, pending, scoring: options || {},
  async refresh(result) {
   if (result.party_pk) {
    const rows = await duplicates.loadCandidates([], { trx, partyPk: result.party_pk });
    rows.forEach(row => persons.set(String(row.party_pk), row));
   } else if (result.outcome === 'QUEUED') {
    const row = await trx('crm_registration_intake').where('intake_id', result.intake_id).first();
    if (row && row.category === 'PERSON') addPending(row);
   }
  }
 };
}
async function candidates(trx, data, context) {
 const scoring = context ? context.scoring : {};
 const found = context ? duplicates.rank(data, context.persons.find(data), scoring) : await duplicates.findSimilar(data, { trx });
 const pending = context ? context.pending.find(data).map(party => ({ intake_id: party.intake_id, payload: { party } }))
  : await trx('crm_registration_intake').where({ status: 'PENDING', category: 'PERSON' });
 pending.forEach(row => {
  const match = duplicates.score(data, row.payload.party, scoring);
  if (match.score >= duplicates.REVIEW_FROM) found.push(Object.assign({ intake_id: row.intake_id, display_name: row.payload.party.full_name || row.payload.party.display_name }, match));
 });
 return found.sort((a,b) => b.score-a.score);
}
async function addEvidence(trx, partyPk, data) {
 const parties = require('./parties.service');
 const current = await trx('crm_person').where('party_pk', partyPk).first();
 if (current) {
  const patch = {};
  ['full_name','birth_date','birth_year','gender_code','address_line','home_location_pk','job_title_id'].forEach(key => {
   if (current[key] == null && data[key] != null && data[key] !== '') patch[key] = data[key];
  });
  if (patch.birth_date && current.birth_year == null) patch.birth_year = Number(String(patch.birth_date).slice(0,4));
  if (Object.keys(patch).length) await trx('crm_person').where('party_pk', partyPk).update(patch);
 }
 // A merged person keeps every phone: numbers the customer already has are
 // skipped by insertContact, new ones are added. A bare `mobile` with no
 // matching contact row is added as well, so no entry path can lose it.
 const contacts = (data.contacts || []).filter(item => item && item.contact_value);
 const digits = value => String(value || '').replace(/\D/g, '');
 if (data.mobile && !contacts.some(item => digits(item.contact_value) === digits(data.mobile))) contacts.push({ contact_type: 'MOBILE', contact_value: data.mobile });
 for (const item of contacts) await parties.insertContact(trx, partyPk, item);
}
async function attachAccount(trx, partyPk, account, reviewed) {
 if (!account) return;
 const key = { project_id: account.project_id, external_account_id: String(account.external_account_id) };
 const existing = await trx('crm_project_account').where(key).whereNull('unlinked_at').first();
 if (existing) {
  if (String(existing.party_pk) !== String(partyPk)) throw new HttpError(409, 'Account is already assigned to another customer');
  return;
 }
 const primary = await trx('crm_project_account').where({ party_pk: partyPk, project_id: account.project_id }).whereNull('unlinked_at').first();
 const values = {};
 ['external_login','external_account_type','account_status','crystal_user_id','source_created_at','source_updated_at'].forEach(k => { if (account[k] != null) values[k] = account[k]; });
 await trx('crm_project_account').insert(Object.assign(values, key, { party_pk: partyPk, is_primary: !primary, link_method: reviewed ? 'REVIEWED' : 'MATCHED' }));
}
// Identifiers a spreadsheet claims for a person are not trusted enough for
// crm_project_account. Once the person is resolved they become assignment
// candidates for that party, which an administrator verifies or rejects.
async function stageUnverifiedAccounts(trx, party, accounts) {
 for (const account of (accounts || [])) {
  const linked = await trx('crm_project_account').where({ project_id: account.project_id, external_account_id: String(account.external_account_id), party_pk: party.party_pk }).whereNull('unlinked_at').first();
  if (linked) continue;
  await submit(trx, { display_name: party.display_name }, { project_id: account.project_id, source_record_id: account.external_account_id, category: 'ESHOP', account,
   candidates: [{ party_pk: String(party.party_pk), display_name: party.display_name, reason: 'Listed for this customer in an imported spreadsheet (unverified)' }] });
 }
}
async function finish(trx, intake, party, status, actor) {
 await addEvidence(trx, party.party_pk, intake.payload.party || {});
 await attachAccount(trx, party.party_pk, intake.payload.account, !!actor);
 await stageUnverifiedAccounts(trx, party, intake.payload.unverified_accounts);
 await trx('crm_registration_intake').where('intake_id', intake.intake_id).update({ status, party_pk: party.party_pk, reviewed_at: trx.fn.now(), reviewed_by_manager_id: actor ? actor.manager_id : null });
 await trx('crm_identity_resolution').insert({ intake_id: intake.intake_id, source_project_id: intake.source_project_id, source_record_id: intake.source_record_id, party_pk: party.party_pk, outcome: status }).onConflict('intake_id').ignore();
 return Object.assign({}, publicParty(party), { intake_id: intake.intake_id, outcome: status });
}
async function submit(trx, data, options) {
 const opts = options || {};
 await lock(trx);
 const project = opts.project_id || data.origin_project_id || null;
 const source = opts.source_record_id == null ? crypto.randomBytes(16).toString('hex') : String(opts.source_record_id);
 const category = opts.category || 'PERSON';
 const existing = await trx('crm_registration_intake').where({ source_project_id: project, source_record_id: source, category }).first();
 if (existing) {
  if (category === 'ESHOP' && existing.status === 'PENDING') {
   const proposed = existing.candidates || [];
   (opts.candidates || []).forEach(candidate => {
    if (!proposed.some(row => String(row.party_pk) === String(candidate.party_pk))) proposed.push(candidate);
   });
   await trx('crm_registration_intake').where('intake_id', existing.intake_id).update({ candidates: JSON.stringify(proposed) });
  }
  if (!existing.party_pk) return { intake_id: existing.intake_id, party_pk: null, outcome: existing.status === 'PENDING' ? 'QUEUED' : existing.status };
  const party = await trx('crm_party').where('party_pk', existing.party_pk).first();
  return Object.assign({}, publicParty(party), { intake_id: existing.intake_id, outcome: existing.status });
 }
 const found = category === 'ESHOP' ? (opts.candidates || []) : data.party_type === 'ORGANIZATION' ? [] : await candidates(trx, data, opts.candidateContext);
 if (category !== 'ESHOP') (opts.candidates || []).forEach(hint => {
  if (!found.some(row => String(row.party_pk) === String(hint.party_pk))) found.push(Object.assign({ reason: 'Unverified project assignment' }, hint));
 });
 const [intake] = await trx('crm_registration_intake').insert({ source_project_id: project, source_record_id: source, category, payload: JSON.stringify({ party: data, account: opts.account || null, unverified_accounts: opts.unverified_accounts || [] }), candidates: JSON.stringify(found) }).returning('*');
 const strong = found.filter(row => row.score >= duplicates.MERGE_FROM);
 if (category !== 'ESHOP' && strong.length === 1 && strong[0].party_pk) {
  const party = await trx('crm_party').where('party_pk', strong[0].party_pk).first();
  return finish(trx, intake, party, 'MERGED');
 }
 if (category === 'ESHOP' || found.length) return { intake_id: intake.intake_id, party_pk: null, outcome: 'QUEUED', candidates: found };
 const party = await require('./parties.service').insertParty(trx, data);
 return finish(trx, intake, party, 'CREATED');
}
async function list(filters) {
 const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
 const page = Math.max(1, Number(filters.page) || 1);
 const base = db('crm_registration_intake as intake').leftJoin('crm_project as project', 'project.project_id', 'intake.source_project_id');
 if (filters.status === 'RESOLVED') base.whereNot('intake.status', 'PENDING'); else base.where('intake.status', 'PENDING');
 if (filters.category) base.where('intake.category', filters.category);
 // One box searches the registration number, the customer number, the source project and record, and
 // everything the registration carried - name, phones, birthday, address, e-shop and user identifiers.
 const term = String(filters.q || '').trim();
 if (term) base.where(function () {
  this.whereRaw('intake.intake_id::text = ?', [term]).orWhereRaw('intake.party_pk::text = ?', [term])
   .orWhere('intake.source_record_id', 'ilike', '%' + term + '%').orWhere('project.project_name', 'ilike', '%' + term + '%')
   .orWhereRaw('intake.payload::text ILIKE ?', ['%' + term + '%']).orWhereRaw('intake.candidates::text ILIKE ?', ['%' + term + '%']);
 });
 const [count, rows] = await Promise.all([base.clone().count({ total: '*' }).first(), base.clone().select('intake.*','project.project_name').orderBy('intake.created_at','desc').limit(limit).offset((page-1)*limit)]);
 return { rows, total: Number(count.total), page, limit };
}
async function decide(id, body, actor) {
 const result = await transaction(async trx => {
  await lock(trx);
  const intake = await trx('crm_registration_intake').where('intake_id', id).forUpdate().first();
  if (!intake) throw new HttpError(404, 'common.notFound');
  if (intake.status !== 'PENDING') throw new HttpError(409, 'crm.common.alreadyDecided');
  if (body.action === 'REJECT' && intake.category === 'ESHOP') {
   await trx('crm_registration_intake').where('intake_id', id).update({ status: 'REJECTED', reviewed_at: trx.fn.now(), reviewed_by_manager_id: actor.manager_id });
   return { intake_id: id, outcome: 'REJECTED' };
  }
  let party;
  if (body.action === 'NEW' && intake.category === 'PERSON') {
   party = await require('./parties.service').insertParty(trx, intake.payload.party);
  } else if (body.action === 'MERGE' || body.action === 'ASSIGN') {
   let pk = body.party_pk;
   if (body.candidate_intake_id) {
    const other = await trx('crm_registration_intake').where('intake_id', body.candidate_intake_id).first();
    if (!other || !other.party_pk) throw new HttpError(409, 'Resolve the matching pending registration first');
    pk = other.party_pk;
   }
   if (!/^[1-9][0-9]*$/.test(String(pk || ''))) throw new HttpError(400, 'Choose a customer');
   party = await trx('crm_party').where('party_pk', pk).whereIn('party_status',['ACTIVE','INACTIVE']).first();
   if (!party) throw new HttpError(404, 'common.notFound');
   if (party.party_type !== 'PERSON') throw new HttpError(400, 'Choose a person');
  } else throw new HttpError(400, 'Choose merge, register as new, or assign');
  return finish(trx, intake, party, intake.category === 'ESHOP' ? 'ASSIGNED' : body.action === 'NEW' ? 'CREATED' : 'MERGED', actor);
 });
 audit.updated(actor, 'crm_registration_intake', id, null, result, PAGE);
 return result;
}
async function resolutions(projectId) {
 if (!/^[1-9][0-9]*$/.test(String(projectId || ''))) throw new HttpError(400, 'Project is required');
 return db('crm_identity_resolution').where('source_project_id', projectId).whereNull('acknowledged_at').orderBy('resolution_id').limit(500);
}
async function acknowledge(id, projectId) {
 const rows = await db('crm_identity_resolution').where({ resolution_id: id, source_project_id: projectId }).update({ acknowledged_at: db.fn.now() }).returning('resolution_id');
 if (!rows.length) throw new HttpError(404, 'common.notFound');
 return rows[0];
}
// Department identifiers recorded for a customer without being committed as
// project accounts, with where each assignment review stands. Shown on the
// customer record so an administrator can check a caller's identity.
async function unverifiedAccounts(partyPk) {
 const intakes = await db('crm_registration_intake').where({ party_pk: partyPk, category: 'PERSON' })
  .whereRaw("jsonb_array_length(COALESCE(payload->'unverified_accounts', '[]'::jsonb)) > 0").orderBy('created_at').select('intake_id', 'payload', 'created_at');
 // Rows merged into one customer may repeat an identifier; list each once, as first recorded.
 const listed = []; const seen = new Set();
 intakes.forEach(row => row.payload.unverified_accounts.forEach(account => {
  const key = account.project_id + ':' + account.external_account_id;
  if (seen.has(key)) return;
  seen.add(key);
  listed.push({ account, intake_id: row.intake_id, recorded_at: row.created_at });
 }));
 if (!listed.length) return [];
 const [reviews, projects] = await Promise.all([
  db('crm_registration_intake').where('category', 'ESHOP').whereIn('source_record_id', Array.from(new Set(listed.map(item => String(item.account.external_account_id)))))
   .select('intake_id', 'source_project_id', 'source_record_id', 'status', 'party_pk'),
  db('crm_project').whereIn('project_id', Array.from(new Set(listed.map(item => item.account.project_id)))).select('project_id', 'project_name')
 ]);
 return listed.map(item => {
  const review = reviews.find(row => String(row.source_project_id) === String(item.account.project_id) && row.source_record_id === String(item.account.external_account_id));
  const project = projects.find(row => String(row.project_id) === String(item.account.project_id));
  return {
   project_id: item.account.project_id, project_name: project ? project.project_name : null,
   external_account_id: item.account.external_account_id, external_login: item.account.external_login || null,
   recorded_at: item.recorded_at, registration_intake_id: item.intake_id, review_intake_id: review ? review.intake_id : null,
   // PENDING, REJECTED, ASSIGNED (to this customer) or ASSIGNED_ELSEWHERE.
   review_status: !review ? null : review.status === 'ASSIGNED' && String(review.party_pk) !== String(partyPk) ? 'ASSIGNED_ELSEWHERE' : review.status
  };
 });
}
// EVERYTHING A REVIEWER COMPARES, for one staged registration: the incoming
// person's basic information with the project it came from and the
// identifiers it carries, and the same for every candidate - a customer's
// linked project accounts and the unverified identifiers an Excel import
// listed for them, or another pending registration's own payload.
async function detail(id) {
 if (!/^[1-9][0-9]*$/.test(String(id || ''))) throw new HttpError(404, 'common.notFound');
 const intake = await db('crm_registration_intake').where('intake_id', id).first();
 if (!intake) throw new HttpError(404, 'common.notFound');
 const candidates = intake.candidates || [];
 const partyPks = candidates.filter(c => c.party_pk).map(c => String(c.party_pk));
 const intakeIds = candidates.filter(c => !c.party_pk && c.intake_id).map(c => String(c.intake_id));
 const [projects, jobs, places, persons, contacts, accounts, others] = await Promise.all([
  db('crm_project').select('project_id', 'project_code', 'project_name'),
  db('crm_job_title').select('job_title_id', 'job_name'),
  db('crm_location').select('location_pk', db.raw(require('./locations').fullNameOf('crm_location.location_pk') + ' AS full_name')),
  partyPks.length ? db('crm_party as party').leftJoin('crm_person as person', 'person.party_pk', 'party.party_pk').whereIn('party.party_pk', partyPks)
   .select('party.party_pk', 'party.display_name', 'party.party_status', 'party.origin_project_id', 'person.full_name', 'person.gender_code',
    'person.birth_date', 'person.birth_year', 'person.home_location_pk', 'person.address_line', 'person.job_title_id') : [],
  partyPks.length ? db('crm_contact_point').whereIn('party_pk', partyPks).where('status', 'ACTIVE').orderBy([{ column: 'is_primary', order: 'desc' }, 'contact_point_id'])
   .select('party_pk', 'contact_type', 'contact_value') : [],
  partyPks.length ? db('crm_project_account').whereIn('party_pk', partyPks).whereNull('unlinked_at')
   .select('party_pk', 'project_id', 'external_account_id', 'external_login') : [],
  intakeIds.length ? db('crm_registration_intake').whereIn('intake_id', intakeIds).select('intake_id', 'source_project_id', 'payload') : []
 ]);
 const projectName = pid => { const p = projects.find(row => String(row.project_id) === String(pid)); return p ? p.project_name : null; };
 const jobName = jid => { const j = jobs.find(row => String(row.job_title_id) === String(jid)); return j ? j.job_name : null; };
 const placeName = lid => { const l = places.find(row => String(row.location_pk) === String(lid)); return l ? l.full_name : null; };
 const identifier = (account, kind) => ({ project_id: account.project_id, project_name: projectName(account.project_id),
  account_pk: account.external_account_id, account_id: account.external_login || null, kind });
 // One person's basic information, the same shape for the incoming row and every candidate.
 const basic = (person, phones, emails, originProjectId) => ({
  full_name: person.full_name || person.display_name || null, gender_code: person.gender_code || null,
  birth_date: person.birth_date || null, birth_year: person.birth_year || null,
  phones: Array.from(new Set(phones.filter(Boolean))), emails: Array.from(new Set(emails.filter(Boolean))),
  location_id: person.home_location_pk || null, location_name: placeName(person.home_location_pk),
  address_line: person.address_line || null, job_title_name: jobName(person.job_title_id),
  origin_project_name: projectName(originProjectId)
 });
 const fromPayload = (payload, sourceProjectId) => {
  const party = payload.party || {};
  const list = (party.contacts || []);
  const ids = [];
  if (payload.account) ids.push(identifier(Object.assign({ project_id: payload.account.project_id || sourceProjectId }, payload.account), 'INCOMING'));
  (payload.unverified_accounts || []).forEach(account => ids.push(identifier(account, 'CANDIDATE')));
  return {
   person: basic(party, [party.mobile].concat(list.filter(c => ['MOBILE', 'PHONE'].includes(c.contact_type)).map(c => c.contact_value)),
    [party.email].concat(list.filter(c => c.contact_type === 'EMAIL').map(c => c.contact_value)), party.origin_project_id || sourceProjectId),
   identifiers: ids
  };
 };
 const incoming = fromPayload(intake.payload || {}, intake.source_project_id);
 const enriched = await Promise.all(candidates.map(async candidate => {
  const base = { party_pk: candidate.party_pk || null, intake_id: candidate.intake_id || null, score: candidate.score, reason: candidate.reason,
   evidence: candidate.evidence || [], display_name: candidate.display_name || null };
  if (candidate.party_pk) {
   const pk = String(candidate.party_pk);
   const person = persons.find(row => String(row.party_pk) === pk) || {};
   const own = contacts.filter(row => String(row.party_pk) === pk);
   const linked = accounts.filter(row => String(row.party_pk) === pk);
   // An Excel identifier that has since been verified is listed once, as linked.
   const listed = (await unverifiedAccounts(pk)).filter(row => !linked.some(account =>
    String(account.project_id) === String(row.project_id) && String(account.external_account_id) === String(row.external_account_id)));
   return Object.assign(base, {
    party_status: person.party_status || null,
    person: basic(person, own.filter(c => ['MOBILE', 'PHONE'].includes(c.contact_type)).map(c => c.contact_value),
     own.filter(c => c.contact_type === 'EMAIL').map(c => c.contact_value), person.origin_project_id),
    // Linked project accounts, then the unverified identifiers an Excel import listed for this customer.
    identifiers: linked.map(row => identifier(row, 'LINKED'))
     .concat(listed.map(row => Object.assign(identifier({ project_id: row.project_id, external_account_id: row.external_account_id, external_login: row.external_login }, 'CANDIDATE'),
      { review_status: row.review_status })))
   });
  }
  const other = others.find(row => String(row.intake_id) === String(candidate.intake_id));
  return Object.assign(base, other ? fromPayload(other.payload || {}, other.source_project_id) : { person: null, identifiers: [] });
 }));
 return {
  intake_id: intake.intake_id, category: intake.category, status: intake.status, created_at: intake.created_at,
  party_pk: intake.party_pk, source_project_name: projectName(intake.source_project_id), source_record_id: intake.source_record_id,
  incoming: incoming, candidates: enriched
 };
}

// Link or reject one of those identifiers from the customer record itself.
// It goes through the same assignment review as Customers > E-shop
// assignments; an identifier never staged for review is staged first.
async function decideUnverified(partyPk, body, actor) {
 if (body.action !== 'LINK' && body.action !== 'REJECT') throw new HttpError(400, 'Choose link or reject');
 const item = (await unverifiedAccounts(partyPk)).find(row => String(row.project_id) === String(body.project_id) && String(row.external_account_id) === String(body.external_account_id));
 if (!item) throw new HttpError(404, 'common.notFound');
 if (item.review_status && item.review_status !== 'PENDING') throw new HttpError(409, 'crm.common.alreadyDecided');
 let reviewId = item.review_intake_id;
 if (!reviewId) {
  const party = await db('crm_party').where('party_pk', partyPk).first();
  const account = { project_id: item.project_id, external_account_id: item.external_account_id, external_login: item.external_login };
  await transaction(trx => stageUnverifiedAccounts(trx, party, [account]));
  const staged = await db('crm_registration_intake').where({ category: 'ESHOP', source_project_id: item.project_id, source_record_id: String(item.external_account_id) }).first('intake_id');
  // Already linked to this customer: staging had nothing to do.
  if (!staged) throw new HttpError(409, 'crm.common.alreadyDecided');
  reviewId = staged.intake_id;
 }
 return decide(reviewId, body.action === 'LINK' ? { action: 'ASSIGN', party_pk: partyPk } : { action: 'REJECT' }, actor);
}
module.exports = { detail, unverifiedAccounts, decideUnverified, submit, candidates, candidateContext, list, decide, resolutions, acknowledge, lock, attachAccount, addEvidence };
