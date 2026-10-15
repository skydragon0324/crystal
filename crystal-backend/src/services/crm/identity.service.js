const intake = require('./registrationIntake.service');
async function resolveAccount(trx, input) {
 await intake.lock(trx);
 // An account is known by its Account ID (external_login); its PK is extra detail.
 const key = { project_id: input.project_id, external_login: String(input.external_login) };
 const linked = await trx('crm_project_account').where(key).whereNull('unlinked_at').first();
 if (linked) {
  const patch = {};
  ['external_account_id','external_account_type','account_status','source_created_at','source_updated_at'].forEach(key => { if (input[key] !== undefined) patch[key] = input[key]; });
  if (Object.keys(patch).length) await trx('crm_project_account').where('project_account_id', linked.project_account_id).update(patch);
  await intake.addEvidence(trx, linked.party_pk, Object.assign({}, input.party || {}, { contacts: input.contacts || [] }));
  return { party_pk: linked.party_pk, outcome: 'EXISTING' };
 }
 // A new account, from whichever project, is matched against the customers already known and linked when the match is certain.
 const data = Object.assign({ party_type: 'PERSON', origin_project_id: input.project_id, first_seen_at: input.source_created_at, last_seen_at: input.source_updated_at }, input.party || {}, { contacts: input.contacts || [] });
 return intake.submit(trx, data, { project_id: input.project_id, source_record_id: key.external_login, account: input, category: 'PERSON' });
}
module.exports = { resolveAccount };
