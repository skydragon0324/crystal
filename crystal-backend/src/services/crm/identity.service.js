const contact = require('./contact');
const parties = require('./parties.service');

/**
 * IDENTITY RESOLUTION - design section 3, "Customer registration".
 *
 * Every project adapter (Crystal, the Eshop, the Appstore, and the ones still
 * to come) hands each account it sees to `resolveAccount`, and gets back the
 * party it belongs to. The steps, in order:
 *
 *   1. THE ACCOUNT IS ALREADY LINKED - (project, external account id) is
 *      found. Nothing new is created; the account's status and any new
 *      contacts are brought up to date.
 *
 *   2. THE PLATFORM SAYS WHO IT IS. The vendor platform keeps its own map of
 *      which Eshop and Appstore accounts belong to which platform user. When
 *      an adapter has that answer it passes `known_party_id`, and the account
 *      is linked with method PLATFORM - no guessing.
 *
 *   3. OUTCOME A - one strong match. Exactly one active party already holds
 *      BOTH the email and the mobile this account brings, or holds one of them
 *      verified on both sides. The account is linked to that party (MATCHED).
 *
 *   4. OUTCOME B - an uncertain match. Some party shares a contact, but not
 *      strongly enough to be sure. The account gets a party of its own, so it
 *      stays identifiable, and every plausible pairing is queued in
 *      crm_identity_match_candidate for a person to accept or reject. Nothing
 *      is merged here: merging two real people is worse than a queue.
 *
 *   5. OUTCOME C - no reasonable match. A new party, its person or
 *      organization row, the account, and its contacts.
 */

const MATCHABLE = ['EMAIL', 'MOBILE', 'SIM_CID'];

/** Parties sharing any of these contacts, with what they share. */
async function evidence(trx, contacts) {
  const wanted = (contacts || [])
    .filter(function (contactInput) { return contactInput && contactInput.contact_value && MATCHABLE.indexOf(contactInput.contact_type) !== -1; })
    .map(function (contactInput) {
      return { type: contactInput.contact_type, value: contact.normalise(contactInput.contact_type, contactInput.contact_value), verified: !!contactInput.is_verified };
    })
    .filter(function (contactInput) { return contactInput.value; });
  if (!wanted.length) return [];

  const rows = await trx('crm_contact_point as contact_point').join('crm_party as party', 'party.party_id', 'contact_point.party_id')
    .where('contact_point.status', 'ACTIVE').where('party.party_status', 'ACTIVE')
    .where(function () {
      wanted.forEach((wantedContact) => {
        this.orWhere(function () { this.where('contact_point.contact_type', wantedContact.type).where('contact_point.normalized_value', wantedContact.value); });
      });
    })
    .select('contact_point.party_id', 'contact_point.contact_type', 'contact_point.is_verified');

  const byParty = {};
  rows.forEach(function (row) {
    const entry = byParty[row.party_id] = byParty[row.party_id] || { party_id: row.party_id, types: {}, verified: false };
    entry.types[row.contact_type] = true;
    const incoming = wanted.filter(function (wantedContact) { return wantedContact.type === row.contact_type; })[0];
    if (row.is_verified && incoming && incoming.verified) entry.verified = true;
  });
  return Object.keys(byParty).map(function (partyKey) { return byParty[partyKey]; });
}

function strength(entry) {
  if (entry.types.EMAIL && (entry.types.MOBILE || entry.types.SIM_CID)) return 0.95;
  if (entry.verified) return 0.9;
  return entry.types.MOBILE || entry.types.SIM_CID ? 0.7 : 0.6;
}

async function addContacts(trx, partyId, contacts, projectId) {
  for (let index = 0; index < (contacts || []).length; index += 1) {
    const contactInput = contacts[index];
    if (!contactInput || !contactInput.contact_value) continue;
    // eslint-disable-next-line no-await-in-loop
    await parties.insertContact(trx, partyId, Object.assign({ is_primary: true, source_project_id: projectId }, contactInput));
  }
}

/**
 * The party an account belongs to - found, linked or created.
 *
 *   input.project_id, input.external_account_id     required
 *   input.external_login, external_account_type, account_status, crystal_user_id
 *   input.source_created_at, source_updated_at
 *   input.party       { party_type, display_name, full_name, ... } for a new party
 *   input.contacts    [{ contact_type, contact_value, is_verified }]
 *   input.known_party_id   the platform's answer, when there is one
 *
 * Returns { party_id, outcome: EXISTING | PLATFORM | MATCHED | QUEUED | NEW, candidates }.
 */
async function resolveAccount(trx, input) {
  const external = String(input.external_account_id);
  const accountFields = {
    external_login: input.external_login || null,
    external_account_type: input.external_account_type || null,
    account_status: input.account_status || null,
    crystal_user_id: input.crystal_user_id || null,
    source_created_at: input.source_created_at || null,
    source_updated_at: input.source_updated_at || null
  };

  /* 1. already linked */
  const linked = await trx('crm_project_account')
    .where({ project_id: input.project_id, external_account_id: external }).whereNull('unlinked_at').first();
  if (linked) {
    await trx('crm_project_account').where('project_account_id', linked.project_account_id).update(accountFields);
    await addContacts(trx, linked.party_id, input.contacts, input.project_id);
    return { party_id: linked.party_id, outcome: 'EXISTING', candidates: 0 };
  }

  const link = async function (partyId, method, confidence) {
    const primary = await trx('crm_project_account')
      .where({ party_id: partyId, project_id: input.project_id }).whereNull('unlinked_at').first('project_account_id');
    await trx('crm_project_account').insert(Object.assign({
      party_id: partyId,
      project_id: input.project_id,
      external_account_id: external,
      is_primary: !primary,
      link_method: method,
      link_confidence: confidence
    }, accountFields));
    await addContacts(trx, partyId, input.contacts, input.project_id);
    const seen = input.source_updated_at || input.source_created_at;
    if (seen) {
      await trx('crm_party').where('party_id', partyId).update({ last_seen_at: trx.raw('GREATEST(last_seen_at, ?)', [seen]) });
    }
  };

  /* 2. the platform knows */
  if (input.known_party_id) {
    await link(input.known_party_id, 'PLATFORM', 1);
    return { party_id: input.known_party_id, outcome: 'PLATFORM', candidates: 0 };
  }

  const found = await evidence(trx, input.contacts);
  const strong = found.filter(function (entry) { return strength(entry) >= 0.9; });

  /* 3. outcome A */
  if (strong.length === 1 && found.length === 1) {
    await link(strong[0].party_id, 'MATCHED', strength(strong[0]));
    return { party_id: strong[0].party_id, outcome: 'MATCHED', candidates: 0 };
  }

  /* 4 and 5: a party of its own */
  const party = await parties.createParty(trx, Object.assign({
    party_type: 'PERSON',
    origin_project_id: input.project_id,
    first_seen_at: input.source_created_at || null,
    last_seen_at: input.source_updated_at || null
  }, input.party || {}));
  await link(party.party_id, 'EXACT', 1);

  for (let index = 0; index < found.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await trx.raw(`
      INSERT INTO crm_identity_match_candidate
        (incoming_project_id, incoming_external_record_id, incoming_party_id, candidate_party_id,
         match_rule_code, match_score, explanation_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (incoming_project_id, incoming_external_record_id, candidate_party_id) DO NOTHING`,
    [input.project_id, external, party.party_id, found[index].party_id,
      'SHARED_' + Object.keys(found[index].types).sort().join('_'), strength(found[index]),
      JSON.stringify({ shared: Object.keys(found[index].types), verified: found[index].verified })]);
  }

  return { party_id: party.party_id, outcome: found.length ? 'QUEUED' : 'NEW', candidates: found.length };
}

module.exports = { resolveAccount: resolveAccount };
