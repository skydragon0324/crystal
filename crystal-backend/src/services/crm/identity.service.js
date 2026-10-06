const intake = require('./registrationIntake.service');
async function resolveAccount(trx, input) {
 await intake.lock(trx);
 const key = { project_id: input.project_id, external_account_id: String(input.external_account_id) };
 const linked = await trx('crm_project_account').where(key).whereNull('unlinked_at').first();
 if (linked) {
  const patch = {};
  ['external_login','external_account_type','account_status','source_created_at','source_updated_at'].forEach(key => { if (input[key] !== undefined) patch[key] = input[key]; });
  if (Object.keys(patch).length) await trx('crm_project_account').where('project_account_id', linked.project_account_id).update(patch);
  await intake.addEvidence(trx, linked.party_pk, Object.assign({}, input.party || {}, { contacts: input.contacts || [] }));
  return { party_pk: linked.party_pk, outcome: 'EXISTING' };
 }
 const project = await trx('crm_project').where('project_id', input.project_id).first();
 const eshop = project && project.project_code === 'ESHOP';
 // The PLATFORM alias is written only after Crystal has resolved this person.
 // Other project hints are candidates and must pass matching or review.
 if (input.resolved_party_pk && project && project.project_code === 'PLATFORM') {
  await intake.attachAccount(trx, input.resolved_party_pk, input, false);
  return { party_pk: input.resolved_party_pk, outcome: 'PLATFORM' };
 }
 const candidate = input.known_party_pk ? await trx('crm_party').where('party_pk', input.known_party_pk).first('party_pk','display_name') : null;
 const data = Object.assign({ party_type: 'PERSON', origin_project_id: input.project_id, first_seen_at: input.source_created_at, last_seen_at: input.source_updated_at }, input.party || {}, { contacts: input.contacts || [] });
 return intake.submit(trx, data, { project_id: input.project_id, source_record_id: key.external_account_id, account: input, category: eshop ? 'ESHOP' : 'PERSON', candidates: candidate ? [candidate] : [] });
}
module.exports = { resolveAccount };
