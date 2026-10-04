const db = require('../../config/db');
const repo = require('../../repositories/crm/parties.repository');
const vocabulary = require('../../repositories/crm/vocabulary.repository');
const contact = require('./contact');
const duplicates = require('./personDuplicates');
const rules = require('./personRules');
const ledger = require('./ledger');
const partyIds = require('./partyId');
const audit = require('../audit.service');
const { transaction } = require('../../repositories/shared/transaction');
const { HttpError } = require('../../utils/response');

const PAGE = '/admin/crm/customers';

const CONTACT_TYPES = ['EMAIL', 'MOBILE', 'PHONE', 'SIM_CID', 'WECHAT_ID', 'WHATSAPP', 'PUSH_TOKEN'];
const CONSENT = ['GRANTED', 'DENIED', 'WITHDRAWN', 'NOT_REQUIRED'];
const PERSON_COLUMNS = ['full_name', 'gender_code', 'birth_date', 'birth_year', 'job_title_id',
  'home_location_pk', 'address_line'];
const ORG_COLUMNS = ['legal_name', 'trading_name', 'registration_number', 'website_url',
  'founded_date', 'organization_status', 'local_name', 'employee_count_band', 'description',
  'location_id', 'headquarters_address'];

function pickFrom(body, columns) {
  const out = {};
  columns.forEach(function (column) {
    if (body && body[column] !== undefined) out[column] = body[column] === '' ? null : body[column];
  });
  return out;
}

/** A person's columns, with the birth year following the birthday whenever a birthday is given. */
function personRow(body) {
  const row = pickFrom(body, PERSON_COLUMNS);
  if (row.birth_date) row.birth_year = Number(String(row.birth_date).slice(0, 4));
  return row;
}

/* ------------------------------------------------------------ creating */

/**
 * ONE PARTY, with its subtype row and its first contacts, in the caller's
 * transaction.
 *
 * Shared by the console and by the Crystal import, so a customer created at a
 * counter and one imported from a member account have exactly the same shape.
 */
async function createParty(trx, data) {
  const type = data.party_type === 'ORGANIZATION' ? 'ORGANIZATION' : 'PERSON';

  const name = data.display_name
    || (type === 'PERSON' ? data.full_name : (data.trading_name || data.legal_name))
    || null;

  // A party_id given by the caller (the User ID of an imported customer) is kept; otherwise the database makes one.
  let givenId = null;
  if (data.party_id !== undefined && data.party_id !== null && String(data.party_id).trim() !== '') {
    givenId = String(data.party_id).trim();
    if (!partyIds.isPartyId(givenId)) throw new HttpError(400, 'crm.checkTheDetails', [{ field: 'party_id', message: 'User ID must be 1-32 letters, digits, "-" or "_"' }]);
    const taken = await trx('crm_party').where('party_id', givenId).first('party_id');
    if (taken) throw new HttpError(409, 'crm.thatUserIdIsTaken', null, { party_id: givenId });
  }

  const [party] = await trx('crm_party').insert(Object.assign(givenId ? { party_id: givenId } : {}, {
    party_type: type,
    party_status: 'ACTIVE',
    display_name: name ? String(name).slice(0, 250) : null,
    origin_project_id: data.origin_project_id || null,
    first_seen_at: data.first_seen_at || trx.fn.now(),
    last_seen_at: data.last_seen_at || null
  })).returning('*');

  if (type === 'PERSON') {
    await trx('crm_person').insert(Object.assign(
      { party_id: party.party_id },
      personRow(Object.assign({ full_name: name }, data))
    ));
  } else {
    await trx('crm_organization').insert(Object.assign(
      { party_id: party.party_id },
      pickFrom(Object.assign({ trading_name: name }, data), ORG_COLUMNS)
    ));
  }

  const contacts = (data.contacts || []).filter(function (contactInput) { return contactInput && contactInput.contact_value; });
  for (let index = 0; index < contacts.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await insertContact(trx, party.party_id, Object.assign({ is_primary: true }, contacts[index]));
  }

  return party;
}

/** A contact, normalised, primary-flag kept unique per type. Returns null for a duplicate. */
async function insertContact(trx, partyId, data) {
  const type = String(data.contact_type || '').toUpperCase();
  if (CONTACT_TYPES.indexOf(type) === -1) throw new HttpError(400, 'crm.unknownContactType');

  const normalised = contact.normalise(type, data.contact_value);
  if (!normalised) throw new HttpError(400, 'crm.contactValueIsRequired');

  const existing = await trx('crm_contact_point')
    .where({ party_id: partyId, contact_type: type, normalized_value: normalised }).first();
  if (existing) return null;

  const hasPrimary = await trx('crm_contact_point')
    .where({ party_id: partyId, contact_type: type, is_primary: true }).first();

  const [row] = await trx('crm_contact_point').insert({
    party_id: partyId,
    contact_type: type,
    contact_value: String(data.contact_value).trim().slice(0, 500),
    normalized_value: normalised,
    label: data.label || null,
    is_verified: !!data.is_verified,
    is_primary: !!data.is_primary && !hasPrimary,
    status: 'ACTIVE',
    source_project_id: data.source_project_id || null,
    valid_from: trx.fn.now()
  }).returning('*');

  return row;
}

/**
 * A NEW CUSTOMER from the console.
 *
 * A person is checked against the customers already on file first
 * (personDuplicates.js). If any look like the same human, nothing is created
 * and the answer is 409 with the look-alikes in `detail`, so the form can show
 * them. The manager can still go ahead - `confirm_not_duplicate: true` - and
 * then each look-alike pair goes into the duplicate review queue, so the
 * decision is seen again by whoever works that queue.
 */
async function create(body, actor) {
  const crystal = await vocabulary.idOf('crm_project', 'CRYSTAL');
  const isPerson = body.party_type !== 'ORGANIZATION';

  rules.assert(await rules.check(body, 'create', isPerson ? 'PERSON' : 'ORGANIZATION'));

  const similar = isPerson ? await duplicates.findSimilar(body) : [];
  if (similar.length && !body.confirm_not_duplicate) {
    throw new HttpError(409, 'crm.similarCustomersExist', similar);
  }

  const contacts = [];
  if (body.mobile) contacts.push({ contact_type: 'MOBILE', contact_value: body.mobile, source_project_id: crystal });
  if (body.email) contacts.push({ contact_type: 'EMAIL', contact_value: body.email, source_project_id: crystal });

  const party = await transaction(async function (trx) {
    const created = await createParty(trx, Object.assign({}, body, {
      origin_project_id: body.origin_project_id || crystal,
      contacts: contacts
    }));
    await queueLookAlikes(trx, created, similar, crystal);
    return created;
  });

  audit.created(actor, 'crm_party', party.party_id, party, PAGE);
  return partyIds.publicParty(party);
}

/** Look-alikes a manager chose to create anyway, into the duplicate review queue. */
async function queueLookAlikes(trx, party, similar, projectId) {
  for (let index = 0; index < similar.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await trx('crm_identity_match_candidate').insert({
      incoming_project_id: projectId,
      incoming_external_record_id: String(party.party_id),
      incoming_party_id: party.party_id,
      candidate_party_id: similar[index].party_id,
      match_rule_code: similar[index].rule_code,
      match_score: similar[index].score,
      explanation_json: JSON.stringify({ reason: similar[index].reason, created_anyway: true })
    }).onConflict(['incoming_project_id', 'incoming_external_record_id', 'candidate_party_id']).ignore();
  }
}

/** The look-alikes of a person not yet saved, for the form to show while it is being filled in. */
function similarTo(query) {
  return duplicates.findSimilar(query, { excludePartyId: query.exclude_party_id });
}

/**
 * A MANAGER HAS LOOKED AT THIS PERSON BY HAND - or takes that back.
 *
 * Only a flag on the person; who set it and when is in the audit trail, which
 * is where the customer record reads it from.
 */
async function setChecked(id, checked, actor) {
  const before = await db('crm_person').where('party_id', id).first();
  if (!before) throw new HttpError(404, 'common.notFound');

  const [after] = await db('crm_person').where('party_id', id)
    .update({ is_checked_manually: !!checked }).returning('*');
  audit.updated(actor, 'crm_person', id, before, after, PAGE);
  return after;
}

/* ------------------------------------------------------------ editing */

async function update(id, body, actor) {
  const before = await repo.findParty(id);
  if (!before) throw new HttpError(404, 'common.notFound');
  if (before.party_status === 'MERGED') throw new HttpError(409, 'crm.thisPartyWasMerged');

  const currentPerson = before.party_type === 'PERSON' ? await db('crm_person').where('party_id', id).first() : null;
  rules.assert(await rules.check(body, 'update', before.party_type, currentPerson));

  const after = await transaction(async function (trx) {
    const patch = {};
    if (body.display_name !== undefined) patch.display_name = body.display_name || null;
    if (Object.keys(patch).length) await trx('crm_party').where('party_id', id).update(patch);

    if (before.party_type === 'PERSON') {
      const person = personRow(body);
      if (Object.keys(person).length) await trx('crm_person').where('party_id', id).update(person);
    } else {
      const org = pickFrom(body, ORG_COLUMNS);
      if (Object.keys(org).length) await trx('crm_organization').where('party_id', id).update(org);
    }

    return trx('crm_party').where('party_id', id).first();
  });

  audit.updated(actor, 'crm_party', id, before, after, PAGE);
  return after;
}

async function setStatus(id, status, actor) {
  if (['ACTIVE', 'INACTIVE'].indexOf(status) === -1) throw new HttpError(400, 'crm.notAStatusYouCanSet');

  const before = await repo.findParty(id);
  if (!before) throw new HttpError(404, 'common.notFound');
  if (before.party_status === 'MERGED') throw new HttpError(409, 'crm.thisPartyWasMerged');

  const [after] = await db('crm_party').where('party_id', id).update({ party_status: status }).returning('*');
  audit.updated(actor, 'crm_party', id, before, after, PAGE);
  return partyIds.publicParty(after);
}

async function addContact(partyId, body, actor) {
  const party = await repo.findParty(partyId);
  if (!party) throw new HttpError(404, 'common.notFound');

  const problem = rules.contactProblem(body.contact_type, body.contact_value);
  rules.assert(problem ? [{ field: 'contact_value', message: problem }] : []);

  const row = await transaction(async function (trx) {
    if (body.is_primary) {
      await trx('crm_contact_point')
        .where({ party_id: partyId, contact_type: String(body.contact_type || '').toUpperCase() })
        .update({ is_primary: false });
    }
    return insertContact(trx, partyId, body);
  });
  if (!row) throw new HttpError(409, 'crm.thisContactIsAlready');

  audit.created(actor, 'crm_contact_point', row.contact_point_id, row, PAGE);
  return row;
}

async function updateContact(partyId, contactId, body, actor) {
  const before = await db('crm_contact_point').where({ party_id: partyId, contact_point_id: contactId }).first();
  if (!before) throw new HttpError(404, 'common.notFound');

  if (body.contact_value !== undefined) {
    const problem = rules.contactProblem(before.contact_type, body.contact_value);
    rules.assert(problem ? [{ field: 'contact_value', message: problem }] : []);
  }

  const after = await transaction(async function (trx) {
    const patch = {};
    if (body.contact_value !== undefined) {
      patch.contact_value = String(body.contact_value).trim();
      patch.normalized_value = contact.normalise(before.contact_type, body.contact_value);
      if (!patch.normalized_value) throw new HttpError(400, 'crm.contactValueIsRequired');
    }
    if (body.label !== undefined) patch.label = body.label || null;
    if (body.is_verified !== undefined) patch.is_verified = !!body.is_verified;
    if (body.status !== undefined) {
      if (['ACTIVE', 'INVALID', 'RETIRED'].indexOf(body.status) === -1) throw new HttpError(400, 'crm.notAStatusYouCanSet');
      patch.status = body.status;
      if (body.status !== 'ACTIVE') { patch.is_primary = false; patch.valid_to = trx.fn.now(); }
    }
    if (body.is_primary) {
      await trx('crm_contact_point')
        .where({ party_id: partyId, contact_type: before.contact_type })
        .whereNot('contact_point_id', contactId)
        .update({ is_primary: false });
      patch.is_primary = true;
    } else if (body.is_primary === false) {
      patch.is_primary = false;
    }

    const rows = await trx('crm_contact_point').where('contact_point_id', contactId).update(patch).returning('*');
    return rows[0];
  });

  audit.updated(actor, 'crm_contact_point', contactId, before, after, PAGE);
  return after;
}

async function linkAccount(partyId, body, actor) {
  const party = await repo.findParty(partyId);
  if (!party) throw new HttpError(404, 'common.notFound');
  if (!body.project_id || !body.external_account_id) throw new HttpError(400, 'crm.projectAndAccountAreRequired');

  const [row] = await db('crm_project_account').insert({
    party_id: partyId,
    project_id: body.project_id,
    external_account_id: String(body.external_account_id).trim(),
    external_login: body.external_login || null,
    external_account_type: body.external_account_type || null,
    account_status: body.account_status || null,
    is_primary: !!body.is_primary,
    link_method: 'MANUAL'
  }).returning('*');

  audit.created(actor, 'crm_project_account', row.project_account_id, row, PAGE);
  return row;
}

async function unlinkAccount(partyId, accountId, actor) {
  const before = await db('crm_project_account').where({ party_id: partyId, project_account_id: accountId }).first();
  if (!before) throw new HttpError(404, 'common.notFound');
  if (before.unlinked_at) throw new HttpError(409, 'crm.alreadyUnlinked');

  const [after] = await db('crm_project_account').where('project_account_id', accountId)
    .update({ unlinked_at: db.fn.now() }).returning('*');
  audit.updated(actor, 'crm_project_account', accountId, before, after, PAGE);
  return after;
}

/**
 * A CONSENT, as a manager records it.
 *
 * The current state is one row per party and option; every change to it is
 * also an append-only event with who, when and why. A manager changing a
 * customer's consent on their behalf must say why - "customer phoned to opt
 * out" - because that sentence is what answers the complaint later, and the
 * table refuses an event without it.
 */
async function setConsent(partyId, body, actor) {
  if (CONSENT.indexOf(body.consent_status) === -1) throw new HttpError(400, 'crm.notAConsentStatus');
  if (!body.reason || !String(body.reason).trim()) throw new HttpError(400, 'crm.aReasonIsRequired');

  const party = await repo.findParty(partyId);
  if (!party) throw new HttpError(404, 'common.notFound');

  const option = await db('crm_project_communication_option')
    .where('project_communication_option_id', body.project_communication_option_id).first();
  if (!option) throw new HttpError(404, 'common.notFound');

  const result = await transaction(async function (trx) {
    const current = await trx('crm_party_communication_consent')
      .where({ party_id: partyId, project_communication_option_id: option.project_communication_option_id })
      .forUpdate().first();

    let row;
    if (current) {
      [row] = await trx('crm_party_communication_consent')
        .where('party_communication_consent_id', current.party_communication_consent_id)
        .update({
          consent_status: body.consent_status,
          contact_point_id: body.contact_point_id === undefined ? current.contact_point_id : (body.contact_point_id || null),
          captured_via: 'CONSOLE',
          captured_at: trx.fn.now(),
          effective_from: trx.fn.now()
        }).returning('*');
    } else {
      [row] = await trx('crm_party_communication_consent').insert({
        party_id: partyId,
        project_communication_option_id: option.project_communication_option_id,
        contact_point_id: body.contact_point_id || null,
        consent_status: body.consent_status,
        captured_via: 'CONSOLE',
        effective_from: trx.fn.now()
      }).returning('*');
    }

    await trx('crm_consent_event').insert({
      party_communication_consent_id: row.party_communication_consent_id,
      old_status: current ? current.consent_status : null,
      new_status: body.consent_status,
      changed_by_type: 'MANAGER',
      changed_by_manager_id: actor.manager_id,
      reason: String(body.reason).trim().slice(0, 255)
    });

    return row;
  });

  audit.updated(actor, 'crm_party_communication_consent', result.party_communication_consent_id, null, result, PAGE);
  return result;
}

/* ------------------------------------------------------------ merging */

/**
 * TWO PARTIES THAT TURNED OUT TO BE ONE PERSON.
 *
 * The survivor keeps its id and number; everything that belonged to the
 * merged party is moved onto it where the move cannot collide with something
 * the survivor already has. The merged party is not deleted - it is marked
 * MERGED and points at the survivor, so an old id in a project's system still
 * resolves, and the history rows it keeps are still reachable.
 *
 * What stays behind, and why:
 *   a membership in a project the survivor is already a member of - the
 *     project decides which account is real, not the CRM;
 *   a consent for an option the survivor already answered - the survivor's
 *     answer is newer information about the same person's wishes;
 *   a program entry for a program the survivor is also in - one person, one
 *     entry, and the survivor's is the one being used;
 *   campaign history - a frozen audience is a record of who was sent what,
 *     and rewriting it would be rewriting what happened.
 *
 * Points are not re-pointed when the survivor already has an account in the
 * same currency: the balance is carried across as a pair of
 * MERGE_CARRY_OVER events, so each ledger still sums to its own balance.
 */
async function merge(survivorId, mergedId, reason, method, actor) {
  survivorId = String(survivorId || '');
  mergedId = String(mergedId || '');
  if (!mergedId || survivorId === mergedId) throw new HttpError(400, 'crm.chooseAnotherPartyToMerge');

  const result = await transaction(async function (trx) {
    // Lock in id order, so two merges touching the same pair cannot deadlock.
    const lockOrder = survivorId < mergedId ? [survivorId, mergedId] : [mergedId, survivorId];
    const first = await repo.lockParty(lockOrder[0], trx);
    const second = await repo.lockParty(lockOrder[1], trx);
    const survivor = first && first.party_id === survivorId ? first : second;
    const merged = first && first.party_id === mergedId ? first : second;

    if (!survivor || !merged) throw new HttpError(404, 'common.notFound');
    if (survivor.party_status === 'MERGED' || merged.party_status === 'MERGED') {
      throw new HttpError(409, 'crm.thisPartyWasMerged');
    }
    if (survivor.party_type !== merged.party_type) throw new HttpError(409, 'crm.onlyPartiesOfOneType');

    const moved = {};
    const count = function (name, rowCount) { moved[name] = (moved[name] || 0) + Number(rowCount || 0); };
    const survivorPartyId = survivorId;
    const mergedPartyId = mergedId;

    count('crm_project_account', await trx('crm_project_account').where('party_id', mergedPartyId).update({ party_id: survivorPartyId, is_primary: false }));

    count('crm_contact_point', await trx.raw(
      `UPDATE crm_contact_point moved_row SET party_id = ?, is_primary = false
        WHERE moved_row.party_id = ? AND NOT EXISTS (
          SELECT 1 FROM crm_contact_point survivor_row
           WHERE survivor_row.party_id = ? AND survivor_row.contact_type = moved_row.contact_type AND survivor_row.normalized_value = moved_row.normalized_value)`,
      [survivorPartyId, mergedPartyId, survivorPartyId]).then(function (queryResult) { return queryResult.rowCount; }));

    count('crm_party_communication_consent', await trx.raw(
      `UPDATE crm_party_communication_consent moved_row SET party_id = ?, contact_point_id = NULL
        WHERE moved_row.party_id = ? AND NOT EXISTS (
          SELECT 1 FROM crm_party_communication_consent survivor_row
           WHERE survivor_row.party_id = ? AND survivor_row.project_communication_option_id = moved_row.project_communication_option_id)`,
      [survivorPartyId, mergedPartyId, survivorPartyId]).then(function (queryResult) { return queryResult.rowCount; }));

    /* A device both parties hold the same way today: the merged party's copy ends. */
    await trx.raw(
      `UPDATE crm_product_registration moved_row
          SET valid_to = now(), registration_status = 'ENDED', end_reason_code = 'MERGE'
        WHERE moved_row.party_id = ? AND moved_row.valid_to IS NULL AND EXISTS (
          SELECT 1 FROM crm_product_registration survivor_row
           WHERE survivor_row.party_id = ? AND survivor_row.valid_to IS NULL
             AND survivor_row.product_instance_id = moved_row.product_instance_id
             AND survivor_row.relationship_type_id = moved_row.relationship_type_id)`,
      [mergedPartyId, survivorPartyId]);
    count('crm_product_registration', await trx('crm_product_registration').where('party_id', mergedPartyId)
      .update({
        party_id: survivorPartyId,
        previous_owner_party_id: trx.raw('CASE WHEN previous_owner_party_id = ? THEN NULL ELSE previous_owner_party_id END', [survivorPartyId])
      }));
    await trx('crm_product_registration').where('previous_owner_party_id', mergedPartyId).whereNot('party_id', survivorPartyId)
      .update({ previous_owner_party_id: survivorPartyId });

    count('crm_product_transfer', await trx('crm_product_transfer').where('from_party_id', mergedPartyId)
      .where(function () { this.whereNull('to_party_id').orWhereNot('to_party_id', survivorPartyId); })
      .update({ from_party_id: survivorPartyId }));
    count('crm_product_transfer', await trx('crm_product_transfer').where('to_party_id', mergedPartyId)
      .where(function () { this.whereNull('from_party_id').orWhereNot('from_party_id', survivorPartyId); })
      .update({ to_party_id: survivorPartyId }));
    await trx('crm_product_transfer').where('requested_by_party_id', mergedPartyId).update({ requested_by_party_id: survivorPartyId });

    count('crm_service_case', await trx('crm_service_case').where('party_id', mergedPartyId).update({ party_id: survivorPartyId }));
    count('crm_service_center_activity', await trx('crm_service_center_activity').where('party_id', mergedPartyId).update({ party_id: survivorPartyId }));
    await trx('crm_service_center_activity').where('performed_by_party_id', mergedPartyId).update({ performed_by_party_id: survivorPartyId });

    count('crm_transaction_party', await trx.raw(
      `UPDATE crm_transaction_party moved_row SET party_id = ?
        WHERE moved_row.party_id = ? AND NOT EXISTS (
          SELECT 1 FROM crm_transaction_party survivor_row
           WHERE survivor_row.party_id = ? AND survivor_row.transaction_id = moved_row.transaction_id AND survivor_row.party_role_code = moved_row.party_role_code)`,
      [survivorPartyId, mergedPartyId, survivorPartyId]).then(function (queryResult) { return queryResult.rowCount; }));

    count('crm_membership', await trx.raw(
      `UPDATE crm_membership moved_row SET party_id = ?
        WHERE moved_row.party_id = ? AND NOT EXISTS (
          SELECT 1 FROM crm_membership survivor_row WHERE survivor_row.party_id = ? AND survivor_row.project_id = moved_row.project_id)`,
      [survivorPartyId, mergedPartyId, survivorPartyId]).then(function (queryResult) { return queryResult.rowCount; }));

    /* Points: re-point where the survivor has no account in that currency, carry over where it does. */
    const accounts = await trx('crm_point_account').where('party_id', mergedPartyId);
    for (let index = 0; index < accounts.length; index += 1) {
      const account = accounts[index];
      // eslint-disable-next-line no-await-in-loop
      const clash = await trx('crm_point_account').where({ party_id: survivorPartyId, point_type_id: account.point_type_id }).first();

      if (!clash) {
        // eslint-disable-next-line no-await-in-loop
        await trx('crm_point_account').where('point_account_id', account.point_account_id).update({ party_id: survivorPartyId });
        count('crm_point_account', 1);
      } else if (Number(account.balance) !== 0) {
        const carry = {
          point_type_id: account.point_type_id,
          event_code: 'MERGE_CARRY_OVER',
          performed_by_manager_id: actor.manager_id,
          allow_negative: true,
          allow_inactive: true
        };
        // eslint-disable-next-line no-await-in-loop
        await ledger.post(trx, Object.assign({}, carry, {
          party_id: mergedPartyId, points_delta: -Number(account.balance),
          description: 'Carried over to the surviving party on merge'
        }));
        // eslint-disable-next-line no-await-in-loop
        await ledger.post(trx, Object.assign({}, carry, {
          party_id: survivorPartyId, points_delta: Number(account.balance),
          description: 'Carried over from a merged party'
        }));
        count('crm_point_event', 2);
      }
    }

    /*
     * Program entries. A reservation names its target through (target, program,
     * party), so the pair has to move together: the reservations let go of
     * their target, the target moves, the reservations follow and take it back.
     */
    const targets = await trx('crm_activity_target as moved_row').where('moved_row.party_id', mergedPartyId)
      .whereNotExists(function () {
        this.select(trx.raw(1)).from('crm_activity_target as survivor_row')
          .whereRaw('survivor_row.party_id = ? AND survivor_row.activity_program_id = moved_row.activity_program_id AND survivor_row.entry_type = moved_row.entry_type', [survivorPartyId]);
      }).select('moved_row.activity_target_id');
    const targetIds = targets.map(function (target) { return target.activity_target_id; });

    if (targetIds.length) {
      const held = await trx('crm_activity_reservation').whereIn('activity_target_id', targetIds)
        .select('reservation_id', 'activity_target_id');
      await trx('crm_activity_reservation').whereIn('activity_target_id', targetIds).update({ activity_target_id: null });
      count('crm_activity_target', await trx('crm_activity_target').whereIn('activity_target_id', targetIds).update({ party_id: survivorPartyId }));
      for (let index = 0; index < held.length; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        await trx('crm_activity_reservation').where('reservation_id', held[index].reservation_id)
          .update({ party_id: survivorPartyId, activity_target_id: held[index].activity_target_id });
      }
    }
    count('crm_activity_reservation', await trx('crm_activity_reservation').where('party_id', mergedPartyId).whereNull('activity_target_id').update({ party_id: survivorPartyId }));
    count('crm_activity_award', await trx('crm_activity_award').where('party_id', mergedPartyId).update({ party_id: survivorPartyId }));

    /* Relationships an organization or a person has. */
    if (survivor.party_type === 'PERSON') {
      count('crm_organization_person_relationship', await trx('crm_organization_person_relationship')
        .where('person_party_id', mergedPartyId).update({ person_party_id: survivorPartyId }));

      /* Fill what the survivor does not know from what the merged party did. */
      const mergedPerson = await trx('crm_person').where('party_id', mergedPartyId).first();
      const survivorPerson = await trx('crm_person').where('party_id', survivorPartyId).first();
      if (mergedPerson && survivorPerson) {
        const fill = {};
        PERSON_COLUMNS.forEach(function (column) {
          if ((survivorPerson[column] === null || survivorPerson[column] === undefined) && mergedPerson[column] !== null && mergedPerson[column] !== undefined) fill[column] = mergedPerson[column];
        });
        if (Object.keys(fill).length) await trx('crm_person').where('party_id', survivorPartyId).update(fill);
      }
    } else {
      count('crm_organization_person_relationship', await trx('crm_organization_person_relationship')
        .where('organization_party_id', mergedPartyId).update({ organization_party_id: survivorPartyId }));
      await trx('crm_service_center').where('operator_party_id', mergedPartyId).update({ operator_party_id: survivorPartyId });
    }

    /* Derived rows are rebuilt rather than moved. */
    await trx('crm_segment_membership').where('party_id', mergedPartyId).whereNull('unmatched_at').update({ unmatched_at: trx.fn.now() });
    await trx('crm_party_product_class_stat').where('party_id', mergedPartyId).del();

    await trx('crm_identity_match_candidate')
      .where('match_status', 'PENDING')
      .where(function () {
        this.where({ incoming_party_id: mergedPartyId, candidate_party_id: survivorPartyId })
          .orWhere({ incoming_party_id: survivorPartyId, candidate_party_id: mergedPartyId });
      })
      .update({ match_status: 'ACCEPTED', reviewed_at: trx.fn.now(), reviewed_by_manager_id: actor.manager_id });

    await trx('crm_party').where('party_id', mergedPartyId).update({
      party_status: 'MERGED', merged_into_party_id: survivorPartyId
    });
    await trx('crm_party').where('party_id', survivorPartyId).update({
      first_seen_at: trx.raw('LEAST(first_seen_at, ?)', [merged.first_seen_at || survivor.first_seen_at]),
      last_seen_at: trx.raw('GREATEST(last_seen_at, ?)', [merged.last_seen_at || survivor.last_seen_at])
    });

    const [history] = await trx('crm_party_merge_history').insert({
      surviving_party_id: survivorPartyId,
      merged_party_id: mergedPartyId,
      merge_reason: reason ? String(reason).slice(0, 250) : null,
      merge_method: method || 'MANUAL',
      moved_rows: JSON.stringify(moved),
      merged_by_manager_id: actor.manager_id
    }).returning('*');

    return history;
  });

  // The stats are recalculated outside the merge so a slow rebuild cannot hold its locks.
  await require('./analysis.service').recalculateClassStats({ partyIds: [survivorId] });

  audit.updated(actor, 'crm_party', mergedId, null, { merged_into_party_id: survivorId, moved_rows: result.moved_rows }, PAGE);
  return result;
}

/* ------------------------------------------------------------ duplicates */

/**
 * PARTIES THAT SHARE A MOBILE OR AN EMAIL, queued for a person to decide.
 *
 * Never merged automatically: two members of one household share a landline,
 * a shop registers its customers' devices under its own email, and the cost
 * of merging two real people is far higher than the cost of a queue. The
 * newer party is the "incoming" one and the older the candidate it would be
 * merged into.
 */
async function scanDuplicates(actor) {
  const platform = await vocabulary.idOf('crm_project', 'PLATFORM');

  const inserted = await db.raw(`
    INSERT INTO crm_identity_match_candidate
      (incoming_project_id, incoming_external_record_id, incoming_party_id, candidate_party_id,
       match_rule_code, match_score, explanation_json)
    SELECT DISTINCT ON (newer_party.party_id, older_party.party_id)
           COALESCE(newer_party.origin_project_id, ?), newer_party.party_id, newer_party.party_id, older_party.party_id,
           'SAME_' || newer_contact.contact_type,
           CASE newer_contact.contact_type WHEN 'MOBILE' THEN 0.9 ELSE 0.85 END,
           json_build_object('contact_type', newer_contact.contact_type, 'value', newer_contact.normalized_value)
      FROM crm_contact_point newer_contact
      JOIN crm_contact_point older_contact
        ON older_contact.contact_type = newer_contact.contact_type
       AND older_contact.normalized_value = newer_contact.normalized_value
       AND older_contact.party_id <> newer_contact.party_id
      JOIN crm_party newer_party ON newer_party.party_id = newer_contact.party_id
      JOIN crm_party older_party ON older_party.party_id = older_contact.party_id
     WHERE newer_contact.contact_type IN ('MOBILE', 'EMAIL')
       AND newer_contact.status = 'ACTIVE' AND older_contact.status = 'ACTIVE'
       AND newer_party.party_status = 'ACTIVE' AND older_party.party_status = 'ACTIVE'
       AND newer_party.party_type = older_party.party_type
       AND older_party.party_pk < newer_party.party_pk
     ORDER BY newer_party.party_id, older_party.party_id, newer_contact.contact_type DESC
    ON CONFLICT (incoming_project_id, incoming_external_record_id, candidate_party_id) DO NOTHING
  `, [platform]);

  audit.imported(actor, 'crm_identity_match_candidate', { found: inserted.rowCount }, PAGE);
  return { found: inserted.rowCount };
}

async function decideCandidate(id, accept, actor) {
  const candidate = await db('crm_identity_match_candidate').where('match_candidate_id', id).first();
  if (!candidate) throw new HttpError(404, 'common.notFound');
  if (candidate.match_status !== 'PENDING') throw new HttpError(409, 'crm.alreadyDecided');

  if (accept) {
    if (!candidate.incoming_party_id) throw new HttpError(409, 'crm.nothingToMerge');
    await merge(candidate.candidate_party_id, candidate.incoming_party_id,
      'Duplicate by ' + candidate.match_rule_code, 'REVIEWED_MATCH', actor);
  }

  const [row] = await db('crm_identity_match_candidate').where('match_candidate_id', id).update({
    match_status: accept ? 'ACCEPTED' : 'REJECTED',
    reviewed_at: db.fn.now(),
    reviewed_by_manager_id: actor.manager_id
  }).returning('*');

  return row;
}

/* ------------------------------------------------------------ the record */

/**
 * EVERYTHING ABOUT ONE CUSTOMER, for the customer record.
 *
 * The party's own rows (repositories/crm/parties.repository.js) plus what
 * other parts of the CRM know about them: the latest analysis per scope with
 * its history and metric values, recent transactions, organization links,
 * and the audit trail of changes made to the record by staff.
 */
async function detail(id) {
  const found = await repo.detail(id);
  if (!found) throw new HttpError(404, 'common.notFound');

  const analysisRead = require('./analysisRead.service');
  const organizations = require('./organizations.service');

  const ids = function (list, key) { return (list || []).map(function (row) { return String(row[key]); }); };
  const audited = [
    ['crm_party', [String(id)]],
    ['crm_contact_point', ids(found.contacts, 'contact_point_id')],
    ['crm_project_account', ids(found.accounts, 'project_account_id')],
    ['crm_membership', ids(found.memberships, 'membership_id')],
    ['crm_party_communication_consent', ids(found.consents.filter(function (consent) { return consent.party_communication_consent_id; }), 'party_communication_consent_id')]
  ];

  const [analysis, orgs, transactions, tierHistory, auditTrail] = await Promise.all([
    analysisRead.forParty(id),
    organizations.forParty(id),
    db('crm_transaction as txn').join('crm_transaction_party as tp', 'tp.transaction_id', 'txn.transaction_id')
      .join('crm_project as project', 'project.project_id', 'txn.project_id')
      .where('tp.party_id', id).where('tp.party_role_code', 'BUYER')
      .orderBy('txn.transaction_at', 'desc').limit(50)
      .select('txn.transaction_id', 'txn.external_transaction_id', 'txn.transaction_type_code', 'txn.transaction_status',
        'txn.currency_code', 'txn.net_amount', 'txn.reporting_net_amount', 'txn.points_used', 'txn.transaction_at',
        'txn.original_transaction_id', 'project.project_code'),
    db('crm_membership_tier_history as tier_history').join('crm_membership as membership', 'membership.membership_id', 'tier_history.membership_id')
      .join('crm_project as project', 'project.project_id', 'membership.project_id')
      .leftJoin('crm_project_tier as old_tier', 'old_tier.project_tier_id', 'tier_history.old_tier_id')
      .join('crm_project_tier as new_tier', 'new_tier.project_tier_id', 'tier_history.new_tier_id')
      .where('membership.party_id', id).orderBy('tier_history.changed_at', 'desc').limit(30)
      .select('tier_history.*', 'project.project_code', 'old_tier.tier_name as old_tier_name', 'new_tier.tier_name as new_tier_name'),
    db('audit_log').where(function () {
      audited.forEach((pair) => {
        if (pair[1].length) this.orWhere(function () { this.where('entity', pair[0]).whereIn('entity_pk', pair[1]); });
      });
    }).orderBy('created_at', 'desc').limit(50)
      .select('id', 'manager_name', 'entity', 'entity_pk', 'action', 'changed', 'created_at')
  ]);

  return Object.assign(found, {
    analysis: analysis,
    organization_links: orgs,
    transactions: transactions,
    tier_history: tierHistory,
    audit: auditTrail
  });
}

module.exports = {
  PAGE: PAGE,
  CONTACT_TYPES: CONTACT_TYPES,
  createParty: createParty,
  insertContact: insertContact,
  search: repo.search,
  lookup: repo.lookup,
  detail: detail,
  create: create,
  similarTo: similarTo,
  setChecked: setChecked,
  queueLookAlikes: queueLookAlikes,
  update: update,
  setStatus: setStatus,
  addContact: addContact,
  updateContact: updateContact,
  linkAccount: linkAccount,
  unlinkAccount: unlinkAccount,
  setConsent: setConsent,
  merge: merge,
  scanDuplicates: scanDuplicates,
  pendingCandidates: repo.pendingCandidates,
  decideCandidate: decideCandidate
};
