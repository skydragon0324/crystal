const db = require('../../config/db');
const repo = require('../../repositories/crm/parties.repository');
const vocabulary = require('../../repositories/crm/vocabulary.repository');
const contact = require('./contact');
const ledger = require('./ledger');
const audit = require('../audit.service');
const { transaction } = require('../../repositories/shared/transaction');
const { HttpError } = require('../../utils/response');

const PAGE = '/admin/crm/customers';

const CONTACT_TYPES = ['EMAIL', 'MOBILE', 'PHONE', 'SIM_CID', 'WECHAT_ID', 'WHATSAPP', 'PUSH_TOKEN'];
const CONSENT = ['GRANTED', 'DENIED', 'WITHDRAWN', 'NOT_REQUIRED'];
const PERSON_COLUMNS = ['full_name', 'gender_code', 'birth_date', 'birth_year', 'job_title',
  'preferred_language', 'nationality_code', 'home_location_id', 'address_line'];
const ORG_COLUMNS = ['legal_name', 'trading_name', 'registration_number', 'website_url',
  'founded_date', 'organization_status', 'local_name', 'employee_count_band', 'description',
  'headquarters_location_id', 'headquarters_address'];

function pickFrom(body, columns) {
  const out = {};
  columns.forEach(function (column) {
    if (body && body[column] !== undefined) out[column] = body[column] === '' ? null : body[column];
  });
  return out;
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

  const [party] = await trx('crm_party').insert({
    party_type: type,
    party_status: 'ACTIVE',
    display_name: name ? String(name).slice(0, 250) : null,
    origin_project_id: data.origin_project_id || null,
    first_seen_at: data.first_seen_at || trx.fn.now(),
    last_seen_at: data.last_seen_at || null
  }).returning('*');

  if (type === 'PERSON') {
    await trx('crm_person').insert(Object.assign(
      { party_id: party.party_id },
      pickFrom(Object.assign({ full_name: name }, data), PERSON_COLUMNS),
      data.id_card_hash ? { id_card_hash: data.id_card_hash, id_card_masked: data.id_card_masked || null } : {}
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

async function create(body, actor) {
  const crystal = await vocabulary.idOf('crm_project', 'CRYSTAL');

  const contacts = [];
  if (body.mobile) contacts.push({ contact_type: 'MOBILE', contact_value: body.mobile, source_project_id: crystal });
  if (body.email) contacts.push({ contact_type: 'EMAIL', contact_value: body.email, source_project_id: crystal });

  const party = await transaction(function (trx) {
    return createParty(trx, Object.assign({}, body, {
      origin_project_id: body.origin_project_id || crystal,
      contacts: contacts
    }));
  });

  audit.created(actor, 'crm_party', party.party_id, party, PAGE);
  return party;
}

/* ------------------------------------------------------------ editing */

async function update(id, body, actor) {
  const before = await repo.findParty(id);
  if (!before) throw new HttpError(404, 'common.notFound');
  if (before.party_status === 'MERGED') throw new HttpError(409, 'crm.thisPartyWasMerged');

  const after = await transaction(async function (trx) {
    const patch = {};
    if (body.display_name !== undefined) patch.display_name = body.display_name || null;
    if (Object.keys(patch).length) await trx('crm_party').where('party_id', id).update(patch);

    if (before.party_type === 'PERSON') {
      const person = pickFrom(body, PERSON_COLUMNS);
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
  return after;
}

async function addContact(partyId, body, actor) {
  const party = await repo.findParty(partyId);
  if (!party) throw new HttpError(404, 'common.notFound');

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
  survivorId = Number(survivorId);
  mergedId = Number(mergedId);
  if (!mergedId || survivorId === mergedId) throw new HttpError(400, 'crm.chooseAnotherPartyToMerge');

  const result = await transaction(async function (trx) {
    // Lock in id order, so two merges touching the same pair cannot deadlock.
    const first = await repo.lockParty(Math.min(survivorId, mergedId), trx);
    const second = await repo.lockParty(Math.max(survivorId, mergedId), trx);
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
      `UPDATE crm_contact_point c SET party_id = ?, is_primary = false
        WHERE c.party_id = ? AND NOT EXISTS (
          SELECT 1 FROM crm_contact_point s
           WHERE s.party_id = ? AND s.contact_type = c.contact_type AND s.normalized_value = c.normalized_value)`,
      [survivorPartyId, mergedPartyId, survivorPartyId]).then(function (queryResult) { return queryResult.rowCount; }));

    count('crm_party_communication_consent', await trx.raw(
      `UPDATE crm_party_communication_consent c SET party_id = ?, contact_point_id = NULL
        WHERE c.party_id = ? AND NOT EXISTS (
          SELECT 1 FROM crm_party_communication_consent s
           WHERE s.party_id = ? AND s.project_communication_option_id = c.project_communication_option_id)`,
      [survivorPartyId, mergedPartyId, survivorPartyId]).then(function (queryResult) { return queryResult.rowCount; }));

    /* A device both parties hold the same way today: the merged party's copy ends. */
    await trx.raw(
      `UPDATE crm_product_registration r
          SET valid_to = now(), registration_status = 'ENDED', end_reason_code = 'MERGE'
        WHERE r.party_id = ? AND r.valid_to IS NULL AND EXISTS (
          SELECT 1 FROM crm_product_registration s
           WHERE s.party_id = ? AND s.valid_to IS NULL
             AND s.product_instance_id = r.product_instance_id
             AND s.relationship_type_id = r.relationship_type_id)`,
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
    count('crm_location_activity', await trx('crm_location_activity').where('party_id', mergedPartyId).update({ party_id: survivorPartyId }));
    await trx('crm_location_activity').where('performed_by_party_id', mergedPartyId).update({ performed_by_party_id: survivorPartyId });

    count('crm_transaction_party', await trx.raw(
      `UPDATE crm_transaction_party t SET party_id = ?
        WHERE t.party_id = ? AND NOT EXISTS (
          SELECT 1 FROM crm_transaction_party s
           WHERE s.party_id = ? AND s.transaction_id = t.transaction_id AND s.party_role_code = t.party_role_code)`,
      [survivorPartyId, mergedPartyId, survivorPartyId]).then(function (queryResult) { return queryResult.rowCount; }));

    count('crm_membership', await trx.raw(
      `UPDATE crm_membership m SET party_id = ?
        WHERE m.party_id = ? AND NOT EXISTS (
          SELECT 1 FROM crm_membership s WHERE s.party_id = ? AND s.project_id = m.project_id)`,
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
    const targets = await trx('crm_activity_target as t').where('t.party_id', mergedPartyId)
      .whereNotExists(function () {
        this.select(trx.raw(1)).from('crm_activity_target as s')
          .whereRaw('s.party_id = ? AND s.activity_program_id = t.activity_program_id AND s.entry_type = t.entry_type', [survivorPartyId]);
      }).select('t.activity_target_id');
    const targetIds = targets.map(function (t) { return t.activity_target_id; });

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
        PERSON_COLUMNS.concat(['id_card_hash', 'id_card_masked']).forEach(function (column) {
          if ((survivorPerson[column] === null || survivorPerson[column] === undefined) && mergedPerson[column] !== null && mergedPerson[column] !== undefined) fill[column] = mergedPerson[column];
        });
        if (Object.keys(fill).length) await trx('crm_person').where('party_id', survivorPartyId).update(fill);
      }
    } else {
      count('crm_organization_person_relationship', await trx('crm_organization_person_relationship')
        .where('organization_party_id', mergedPartyId).update({ organization_party_id: survivorPartyId }));
      await trx('crm_service_location').where('operator_party_id', mergedPartyId).update({ operator_party_id: survivorPartyId });
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
    SELECT DISTINCT ON (n.party_id, o.party_id)
           COALESCE(n.origin_project_id, ?), n.party_no, n.party_id, o.party_id,
           'SAME_' || c1.contact_type,
           CASE c1.contact_type WHEN 'MOBILE' THEN 0.9 ELSE 0.85 END,
           json_build_object('contact_type', c1.contact_type, 'value', c1.normalized_value)
      FROM crm_contact_point c1
      JOIN crm_contact_point c2
        ON c2.contact_type = c1.contact_type
       AND c2.normalized_value = c1.normalized_value
       AND c2.party_id < c1.party_id
      JOIN crm_party n ON n.party_id = c1.party_id
      JOIN crm_party o ON o.party_id = c2.party_id
     WHERE c1.contact_type IN ('MOBILE', 'EMAIL')
       AND c1.status = 'ACTIVE' AND c2.status = 'ACTIVE'
       AND n.party_status = 'ACTIVE' AND o.party_status = 'ACTIVE'
       AND n.party_type = o.party_type
     ORDER BY n.party_id, o.party_id, c1.contact_type DESC
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
    db('crm_transaction as x').join('crm_transaction_party as tp', 'tp.transaction_id', 'x.transaction_id')
      .join('crm_project as j', 'j.project_id', 'x.project_id')
      .where('tp.party_id', id).where('tp.party_role_code', 'BUYER')
      .orderBy('x.transaction_at', 'desc').limit(50)
      .select('x.transaction_id', 'x.external_transaction_id', 'x.transaction_type_code', 'x.transaction_status',
        'x.currency_code', 'x.net_amount', 'x.reporting_net_amount', 'x.points_used', 'x.transaction_at',
        'x.original_transaction_id', 'j.project_code'),
    db('crm_membership_tier_history as h').join('crm_membership as m', 'm.membership_id', 'h.membership_id')
      .join('crm_project as j', 'j.project_id', 'm.project_id')
      .leftJoin('crm_project_tier as o', 'o.project_tier_id', 'h.old_tier_id')
      .join('crm_project_tier as n', 'n.project_tier_id', 'h.new_tier_id')
      .where('m.party_id', id).orderBy('h.changed_at', 'desc').limit(30)
      .select('h.*', 'j.project_code', 'o.tier_name as old_tier_name', 'n.tier_name as new_tier_name'),
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
