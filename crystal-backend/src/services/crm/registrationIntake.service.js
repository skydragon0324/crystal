const crypto = require('crypto');
const db = require('../../config/db');
const duplicates = require('./personDuplicates');
const { HttpError } = require('../../utils/response');
const { transaction } = require('../../repositories/shared/transaction');
const audit = require('../audit.service');
const PAGE = '/admin/crm/customers';
const { publicParty } = require('./partyId');

async function lock(trx) { await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', ['crm_identity_registration']); }
async function candidates(trx, data) {
 const found = await duplicates.findSimilar(data, { trx });
 const pending = await trx('crm_registration_intake').where({ status: 'PENDING', category: 'PERSON' });
 pending.forEach(row => {
  const match = duplicates.score(data, row.payload.party);
  if (match.score > 40) found.push(Object.assign({ intake_id: row.intake_id, display_name: row.payload.party.full_name || row.payload.party.display_name }, match));
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
 for (const item of (data.contacts || [])) if (item && item.contact_value) await parties.insertContact(trx, partyPk, item);
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
async function finish(trx, intake, party, status, actor) {
 await addEvidence(trx, party.party_pk, intake.payload.party || {});
 await attachAccount(trx, party.party_pk, intake.payload.account, !!actor);
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
 const found = category === 'ESHOP' ? (opts.candidates || []) : data.party_type === 'ORGANIZATION' ? [] : await candidates(trx, data);
 if (category !== 'ESHOP') (opts.candidates || []).forEach(hint => {
  if (!found.some(row => String(row.party_pk) === String(hint.party_pk))) found.push(Object.assign({ reason: 'Unverified project assignment' }, hint));
 });
 const [intake] = await trx('crm_registration_intake').insert({ source_project_id: project, source_record_id: source, category, payload: JSON.stringify({ party: data, account: opts.account || null }), candidates: JSON.stringify(found) }).returning('*');
 const strong = found.filter(row => row.score >= 70);
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
 const [count, rows] = await Promise.all([base.clone().count({ total: '*' }).first(), base.clone().select('intake.*','project.project_name').orderBy('intake.created_at','desc').limit(limit).offset((page-1)*limit)]);
 return { rows, total: Number(count.total), page, limit };
}
async function decide(id, body, actor) {
 const result = await transaction(async trx => {
  await lock(trx);
  const intake = await trx('crm_registration_intake').where('intake_id', id).forUpdate().first();
  if (!intake) throw new HttpError(404, 'common.notFound');
  if (intake.status !== 'PENDING') throw new HttpError(409, 'crm.alreadyDecided');
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
module.exports = { submit, candidates, list, decide, resolutions, acknowledge, lock, attachAccount, addEvidence };
