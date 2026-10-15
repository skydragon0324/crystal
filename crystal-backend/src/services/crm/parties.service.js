const db = require('../../config/db');
const repo = require('../../repositories/crm/parties.repository');
const vocabulary = require('../../repositories/crm/vocabulary.repository');
const contact = require('./contact');
const phoneOwners = require('./phoneOwners');
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
async function insertParty(trx, data) {
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
      { party_pk: party.party_pk },
      personRow(Object.assign({ full_name: name }, data))
    ));
  } else {
    await trx('crm_organization').insert(Object.assign(
      { party_pk: party.party_pk },
      pickFrom(Object.assign({ trading_name: name }, data), ORG_COLUMNS)
    ));
  }

  const contacts = (data.contacts || []).filter(function (contactInput) { return contactInput && contactInput.contact_value; });
  for (let index = 0; index < contacts.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await insertContact(trx, party.party_pk, Object.assign({ is_primary: true }, contacts[index]));
  }

  return party;
}

async function createParty(trx, data) {
  return require('./registrationIntake.service').submit(trx, data);
}

/** A contact, normalised, primary-flag kept unique per type. Returns null for a duplicate. */
async function insertContact(trx, partyId, data) {
  const type = String(data.contact_type || '').toUpperCase();
  if (CONTACT_TYPES.indexOf(type) === -1) throw new HttpError(400, 'crm.customers.unknownContactType');

  const normalised = contact.normalise(type, data.contact_value);
  if (!normalised) throw new HttpError(400, 'crm.customers.contactValueIsRequired');

  const existing = await trx('crm_contact_point')
    .where({ party_pk: partyId, contact_type: type, normalized_value: normalised }).first();
  if (existing) return null;
  // One number, one customer: never give a phone another customer already has.
  if (phoneOwners.PHONE_TYPES.indexOf(type) !== -1) await phoneOwners.assertFree(trx, partyId, normalised);

  const hasPrimary = await trx('crm_contact_point')
    .where({ party_pk: partyId, contact_type: type, is_primary: true }).first();

  const [row] = await trx('crm_contact_point').insert({
    party_pk: partyId,
    contact_type: type,
    // A phone is kept as its digits; anything else as it was typed.
    contact_value: contact.isPhone(type) ? normalised : String(data.contact_value).trim().slice(0, 500),
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

/** Console registrations use the same pre-creation gate as imports and projects. */
async function create(body, actor) {
  const isPerson = body.party_type !== 'ORGANIZATION';

  rules.assert(await rules.check(body, 'create', isPerson ? 'PERSON' : 'ORGANIZATION'));

  /* Where the customer came from is chosen on the form; no project is assumed. */
  const origin = /^[1-9][0-9]*$/.test(String(body.origin_project_id || ''))
    ? await db('crm_project').where({ project_id: body.origin_project_id, status: 'ACTIVE' }).first('project_id') : null;
  if (!origin) rules.assert([{ field: 'origin_project_id', message: 'crm.customers.chooseTheOriginProject' }]);

  const contacts = [];
  if (body.mobile) contacts.push({ contact_type: 'MOBILE', contact_value: body.mobile, source_project_id: origin.project_id });
  if (body.email) contacts.push({ contact_type: 'EMAIL', contact_value: body.email, source_project_id: origin.project_id });

  const party = await transaction(async function (trx) {
    const created = await createParty(trx, Object.assign({}, body, {
      origin_project_id: origin.project_id,
      contacts: contacts
    }));
    return created;
  });

  audit.created(actor, 'crm_registration_intake', party.intake_id, party, PAGE);
  return partyIds.publicParty(party);
}

/** The look-alikes of a person not yet saved, for the form to show while it is being filled in. */
function similarTo(query) {
  return duplicates.findSimilar(query, { excludePartyId: query.exclude_party_pk });
}

/**
 * A MANAGER HAS LOOKED AT THIS PERSON BY HAND - or takes that back.
 *
 * Only a flag on the person; who set it and when is in the audit trail, which
 * is where the customer record reads it from.
 */
async function setChecked(id, checked, actor) {
  const before = await db('crm_person').where('party_pk', id).first();
  if (!before) throw new HttpError(404, 'common.notFound');

  const [after] = await db('crm_person').where('party_pk', id)
    .update({ is_checked_manually: !!checked }).returning('*');
  audit.updated(actor, 'crm_person', id, before, after, PAGE);
  return after;
}

/* ------------------------------------------------------------ editing */

async function update(id, body, actor) {
  const before = await repo.findParty(id);
  if (!before) throw new HttpError(404, 'common.notFound');
  if (before.party_status === 'MERGED') throw new HttpError(409, 'crm.common.thisPartyWasMerged');

  const currentPerson = before.party_type === 'PERSON' ? await db('crm_person').where('party_pk', id).first() : null;
  rules.assert(await rules.check(body, 'update', before.party_type, currentPerson));

  const after = await transaction(async function (trx) {
    const patch = {};
    if (body.display_name !== undefined) patch.display_name = body.display_name || null;
    if (Object.keys(patch).length) await trx('crm_party').where('party_pk', id).update(patch);

    if (before.party_type === 'PERSON') {
      const person = personRow(body);
      if (Object.keys(person).length) await trx('crm_person').where('party_pk', id).update(person);
    } else {
      const org = pickFrom(body, ORG_COLUMNS);
      if (Object.keys(org).length) await trx('crm_organization').where('party_pk', id).update(org);
    }

    return trx('crm_party').where('party_pk', id).first();
  });

  audit.updated(actor, 'crm_party', id, before, after, PAGE);
  return after;
}

async function setStatus(id, status, actor) {
  if (['ACTIVE', 'INACTIVE'].indexOf(status) === -1) throw new HttpError(400, 'crm.common.notAStatusYouCanSet');

  const before = await repo.findParty(id);
  if (!before) throw new HttpError(404, 'common.notFound');
  if (before.party_status === 'MERGED') throw new HttpError(409, 'crm.common.thisPartyWasMerged');

  const [after] = await db('crm_party').where('party_pk', id).update({ party_status: status }).returning('*');
  audit.updated(actor, 'crm_party', id, before, after, PAGE);
  return partyIds.publicParty(after);
}

/**
 * A corporate grade given by hand. While set it is the grade the record, the
 * customer list, segments and event eligibility go by; the analysis run keeps
 * computing its own grade on the snapshots underneath. An empty grade clears it.
 */
async function assignGrade(id, body, actor) {
  const before = await repo.findParty(id);
  if (!before) throw new HttpError(404, 'common.notFound');
  if (before.party_status === 'MERGED') throw new HttpError(409, 'crm.common.thisPartyWasMerged');

  const gradeId = body.corporate_grade_id === undefined || body.corporate_grade_id === null || body.corporate_grade_id === ''
    ? null : Number(body.corporate_grade_id);
  if (gradeId !== null) {
    const grade = await db('crm_corporate_grade').where({ corporate_grade_id: gradeId, is_active: true }).first();
    if (!grade) throw new HttpError(400, 'crm.customers.chooseAGrade');
  }

  const [after] = await db('crm_party').where('party_pk', id).update({
    assigned_grade_id: gradeId,
    assigned_grade_reason: gradeId === null ? null : (String(body.reason || '').trim().slice(0, 500) || null),
    assigned_grade_at: gradeId === null ? null : db.fn.now(),
    assigned_grade_by_manager_id: gradeId === null ? null : (actor && actor.manager_id) || null,
    updated_at: db.fn.now()
  }).returning('*');
  audit.updated(actor, 'crm_party', id, before, after, PAGE);
  return partyIds.publicParty(after);
}

async function addContact(partyId, body, actor) {
  const party = await repo.findParty(partyId);
  if (!party) throw new HttpError(404, 'common.notFound');

  const problem = rules.contactProblem(body.contact_type, body.contact_value);
  rules.assert(problem ? [Object.assign({ field: 'contact_value' }, problem)] : []);

  const row = await transaction(async function (trx) {
    if (body.is_primary) {
      await trx('crm_contact_point')
        .where({ party_pk: partyId, contact_type: String(body.contact_type || '').toUpperCase() })
        .update({ is_primary: false });
    }
    return insertContact(trx, partyId, body);
  });
  if (!row) throw new HttpError(409, 'crm.customers.thisContactIsAlready');

  audit.created(actor, 'crm_contact_point', row.contact_point_id, row, PAGE);
  return row;
}

async function updateContact(partyId, contactId, body, actor) {
  const before = await db('crm_contact_point').where({ party_pk: partyId, contact_point_id: contactId }).first();
  if (!before) throw new HttpError(404, 'common.notFound');

  if (body.contact_value !== undefined) {
    const problem = rules.contactProblem(before.contact_type, body.contact_value);
    rules.assert(problem ? [Object.assign({ field: 'contact_value' }, problem)] : []);
  }

  const after = await transaction(async function (trx) {
    const patch = {};
    if (body.contact_value !== undefined) {
      patch.normalized_value = contact.normalise(before.contact_type, body.contact_value);
      patch.contact_value = contact.isPhone(before.contact_type) ? patch.normalized_value : String(body.contact_value).trim();
      if (!patch.normalized_value) throw new HttpError(400, 'crm.customers.contactValueIsRequired');
    }
    if (body.label !== undefined) patch.label = body.label || null;
    if (body.is_verified !== undefined) patch.is_verified = !!body.is_verified;
    if (body.status !== undefined) {
      if (['ACTIVE', 'INVALID', 'RETIRED'].indexOf(body.status) === -1) throw new HttpError(400, 'crm.common.notAStatusYouCanSet');
      patch.status = body.status;
      /* Switched off, it stops being anyone's first choice; switched back on, it is current again. */
      if (body.status !== 'ACTIVE') { patch.is_primary = false; patch.valid_to = before.valid_to || trx.fn.now(); }
      else patch.valid_to = null;
    }
    const status = patch.status || before.status;
    if (body.is_primary && status !== 'ACTIVE') throw new HttpError(400, 'crm.customers.onlyAnActiveContactCanBePrimary');
    // A number changed, or switched back on, must not be another customer's.
    if (phoneOwners.PHONE_TYPES.indexOf(before.contact_type) !== -1 && status === 'ACTIVE' && (patch.normalized_value || before.status !== 'ACTIVE')) {
      await phoneOwners.assertFree(trx, partyId, patch.normalized_value || before.normalized_value);
    }
    if (body.is_primary) {
      await trx('crm_contact_point')
        .where({ party_pk: partyId, contact_type: before.contact_type })
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

/*
 * A contact typed in by mistake can go. One that was ever used - a consent
 * names it, a campaign sent to it, an interaction went through it - is part of
 * that history, so it is refused: mark it RETIRED (no longer theirs) or
 * INVALID (never worked) instead, and the history still says where things went.
 */
async function deleteContact(partyId, contactId, actor) {
  if (!/^[1-9][0-9]*$/.test(String(partyId)) || !/^[1-9][0-9]*$/.test(String(contactId))) throw new HttpError(404, 'common.notFound');
  const before = await db('crm_contact_point').where({ party_pk: partyId, contact_point_id: contactId }).first();
  if (!before) throw new HttpError(404, 'common.notFound');

  const uses = await Promise.all(['crm_party_communication_consent', 'crm_campaign_recipient', 'crm_party_interaction'].map(function (table) {
    return db(table).where('contact_point_id', contactId).first(db.raw(1));
  }));
  if (uses.some(Boolean)) throw new HttpError(409, 'crm.customers.contactIsInUse');

  await db('crm_contact_point').where('contact_point_id', contactId).del();
  audit.deleted(actor, 'crm_contact_point', contactId, before, PAGE);
  return { contact_point_id: contactId };
}

/**
 * Refuses an account another customer (or this one) already has in that
 * project - by its Account ID, or by its PK when one is given - naming who
 * has it, so nothing is linked twice. Unlinked accounts do not count.
 */
async function assertAccountFree(trx, partyId, projectId, login, pk, exceptAccountId) {
  const query = trx('crm_project_account as account').join('crm_party as party', 'party.party_pk', 'account.party_pk')
    .where('account.project_id', projectId).whereNull('account.unlinked_at')
    .where(function () {
      this.where('account.external_account_id', login);
      if (pk) this.orWhere('account.external_account_pk', pk);
    });
  if (exceptAccountId) query.whereNot('account.project_account_id', exceptAccountId);
  const taken = await query.first('account.party_pk', 'party.display_name', 'account.external_account_id');
  if (!taken) return;
  if (String(taken.party_pk) === String(partyId)) throw new HttpError(409, 'crm.customers.thisCustomerAlreadyHasThatAccount', null, { account: taken.external_account_id });
  throw new HttpError(409, 'crm.customers.accountLinkedToAnother', [{ field: 'external_account_id', message: 'crm.customers.accountLinkedToAnother',
    params: { customer: (taken.display_name || '') + ' #' + taken.party_pk } }], { customer: (taken.display_name || '') + ' #' + taken.party_pk });
}

async function linkAccount(partyId, body, actor) {
  const party = await repo.findParty(partyId);
  if (!party) throw new HttpError(404, 'common.notFound');
  // The Account ID is the key every project links by; the PK is optional.
  const login = String(body.external_account_id == null ? '' : body.external_account_id).trim();
  if (!body.project_id || !login) throw new HttpError(400, 'crm.customers.projectAndAccountAreRequired');
  // Already someone's: the link is not made, and the reader is told whose it is.
  await assertAccountFree(db, partyId, body.project_id, login, String(body.external_account_pk == null ? '' : body.external_account_pk).trim() || null);

  const [row] = await db('crm_project_account').insert({
    party_pk: partyId,
    project_id: body.project_id,
    external_account_pk: String(body.external_account_pk == null ? '' : body.external_account_pk).trim() || null,
    external_account_id: login,
    external_account_type: body.external_account_type || null,
    account_status: body.account_status || null,
    is_primary: !!body.is_primary,
    link_method: 'MANUAL'
  }).returning('*');

  audit.created(actor, 'crm_project_account', row.project_account_id, row, PAGE);
  return row;
}

/**
 * A linked account corrected by hand: its Account ID, PK and type, and whether
 * it is the customer's primary account in that project. Making one primary
 * makes the customer's other accounts there not primary.
 */
async function updateAccount(partyId, accountId, body, actor) {
  const before = await db('crm_project_account').where({ party_pk: partyId, project_account_id: accountId }).first();
  if (!before) throw new HttpError(404, 'common.notFound');
  if (before.unlinked_at) throw new HttpError(409, 'crm.customers.alreadyUnlinked');

  const patch = {};
  if (body.external_account_id !== undefined) {
    patch.external_account_id = String(body.external_account_id == null ? '' : body.external_account_id).trim();
    if (!patch.external_account_id) throw new HttpError(400, 'crm.customers.projectAndAccountAreRequired');
  }
  if (body.external_account_pk !== undefined) patch.external_account_pk = String(body.external_account_pk == null ? '' : body.external_account_pk).trim() || null;
  if (body.external_account_type !== undefined) patch.external_account_type = String(body.external_account_type == null ? '' : body.external_account_type).trim().slice(0, 50) || null;
  if (body.is_primary !== undefined) patch.is_primary = !!body.is_primary;
  if (!Object.keys(patch).length) return before;
  if (patch.external_account_id !== undefined || patch.external_account_pk) {
    await assertAccountFree(db, partyId, before.project_id, patch.external_account_id !== undefined ? patch.external_account_id : before.external_account_id,
      patch.external_account_pk !== undefined ? patch.external_account_pk : before.external_account_pk, accountId);
  }

  const after = await transaction(async function (trx) {
    if (patch.is_primary) {
      await trx('crm_project_account').where({ party_pk: partyId, project_id: before.project_id }).whereNull('unlinked_at')
        .whereNot('project_account_id', accountId).update({ is_primary: false });
    }
    try {
      const [row] = await trx('crm_project_account').where('project_account_id', accountId).update(patch).returning('*');
      return row;
    } catch (error) {
      if (error.code === '23505') throw new HttpError(409, 'crm.customers.thatAccountIsAlreadyLinked');
      throw error;
    }
  });

  audit.updated(actor, 'crm_project_account', accountId, before, after, PAGE);
  return after;
}

async function unlinkAccount(partyId, accountId, actor) {
  const before = await db('crm_project_account').where({ party_pk: partyId, project_account_id: accountId }).first();
  if (!before) throw new HttpError(404, 'common.notFound');
  if (before.unlinked_at) throw new HttpError(409, 'crm.customers.alreadyUnlinked');

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
  if (CONSENT.indexOf(body.consent_status) === -1) throw new HttpError(400, 'crm.customers.notAConsentStatus');
  if (!body.reason || !String(body.reason).trim()) throw new HttpError(400, 'crm.common.aReasonIsRequired');

  const party = await repo.findParty(partyId);
  if (!party) throw new HttpError(404, 'common.notFound');

  const option = await db('crm_project_communication_option')
    .where('project_communication_option_id', body.project_communication_option_id).first();
  if (!option) throw new HttpError(404, 'common.notFound');

  const result = await transaction(async function (trx) {
    const current = await trx('crm_party_communication_consent')
      .where({ party_pk: partyId, project_communication_option_id: option.project_communication_option_id })
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
        party_pk: partyId,
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
 *   an event entry for an event the survivor is also in - one person, one
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
  if (!mergedId || survivorId === mergedId) throw new HttpError(400, 'crm.customers.chooseAnotherPartyToMerge');

  const result = await transaction(async function (trx) {
    await require('./registrationIntake.service').lock(trx);
    // Lock in id order, so two merges touching the same pair cannot deadlock.
    const lockOrder = survivorId < mergedId ? [survivorId, mergedId] : [mergedId, survivorId];
    const first = await repo.lockParty(lockOrder[0], trx);
    const second = await repo.lockParty(lockOrder[1], trx);
    const survivor = first && first.party_pk === survivorId ? first : second;
    const merged = first && first.party_pk === mergedId ? first : second;

    if (!survivor || !merged) throw new HttpError(404, 'common.notFound');
    if (survivor.party_status === 'MERGED' || merged.party_status === 'MERGED') {
      throw new HttpError(409, 'crm.common.thisPartyWasMerged');
    }
    if (survivor.party_type !== merged.party_type) throw new HttpError(409, 'crm.customers.onlyPartiesOfOneType');

    const moved = {};
    const count = function (name, rowCount) { moved[name] = (moved[name] || 0) + Number(rowCount || 0); };
    const survivorPartyId = survivorId;
    const mergedPartyId = mergedId;

    /*
     * THE UNDO LOG. Every row the merge changes is listed with its key and the
     * values the change overwrote, so unmerge() can put exactly those rows back.
     * `guard` is what the row must still hold for the undo to touch it: a row
     * that has since been moved again, or ended, is left as it is.
     */
    const undo = [];
    const change = async function (table, key, rows, patch, guardColumn, guardValue) {
      if (!rows.length) return 0;
      const columns = Object.keys(patch);
      undo.push({
        table: table, key: key, guard: [guardColumn, guardValue],
        rows: rows.map(function (row) {
          const was = {};
          columns.forEach(function (column) { was[column] = row[column] === undefined ? null : row[column]; });
          return { id: row[key], was: was };
        })
      });
      await trx(table).whereIn(key, rows.map(function (row) { return row[key]; })).update(patch);
      return rows.length;
    };
    /* Rows of `table` whose `column` is the merged party, optionally narrowed by `where`. */
    const owned = function (table, column, where) {
      const query = trx(table + ' as moved_row').where('moved_row.' + column, mergedPartyId).select('moved_row.*');
      return where ? where(query) : query;
    };
    /* ...that the survivor has no row of its own for: `same` lists the columns that would collide. */
    const notHeldBySurvivor = function (table, same) {
      return function (query) {
        return query.whereNotExists(function () {
          const inner = this.select(trx.raw(1)).from(table + ' as survivor_row').where('survivor_row.party_pk', survivorPartyId);
          same.forEach(function (column) { inner.whereRaw('survivor_row.' + column + ' = moved_row.' + column); });
        });
      };
    };

    count('crm_project_account', await change('crm_project_account', 'project_account_id',
      await owned('crm_project_account', 'party_pk'), { party_pk: survivorPartyId, is_primary: false }, 'party_pk', survivorPartyId));

    count('crm_contact_point', await change('crm_contact_point', 'contact_point_id',
      await owned('crm_contact_point', 'party_pk', notHeldBySurvivor('crm_contact_point', ['contact_type', 'normalized_value'])),
      { party_pk: survivorPartyId, is_primary: false }, 'party_pk', survivorPartyId));

    count('crm_party_communication_consent', await change('crm_party_communication_consent', 'party_communication_consent_id',
      await owned('crm_party_communication_consent', 'party_pk', notHeldBySurvivor('crm_party_communication_consent', ['project_communication_option_id'])),
      { party_pk: survivorPartyId, contact_point_id: null }, 'party_pk', survivorPartyId));

    /* A device both parties hold the same way today: the merged party's copy ends. */
    await change('crm_product_registration', 'product_registration_id',
      await owned('crm_product_registration', 'party_pk', function (query) {
        return query.whereNull('moved_row.valid_to').whereExists(function () {
          this.select(trx.raw(1)).from('crm_product_registration as survivor_row')
            .where('survivor_row.party_pk', survivorPartyId).whereNull('survivor_row.valid_to')
            .whereRaw('survivor_row.product_instance_id = moved_row.product_instance_id AND survivor_row.relationship_type_id = moved_row.relationship_type_id');
        });
      }),
      { valid_to: trx.fn.now(), registration_status: 'ENDED', end_reason_code: 'MERGE' }, 'end_reason_code', 'MERGE');
    const registrations = await owned('crm_product_registration', 'party_pk');
    for (let index = 0; index < registrations.length; index += 1) {
      const registration = registrations[index];
      // eslint-disable-next-line no-await-in-loop
      await change('crm_product_registration', 'product_registration_id', [registration], {
        party_pk: survivorPartyId,
        previous_owner_party_pk: String(registration.previous_owner_party_pk) === String(survivorPartyId) ? null : registration.previous_owner_party_pk
      }, 'party_pk', survivorPartyId);
    }
    count('crm_product_registration', registrations.length);
    await change('crm_product_registration', 'product_registration_id',
      await owned('crm_product_registration', 'previous_owner_party_pk', function (query) { return query.whereNot('moved_row.party_pk', survivorPartyId); }),
      { previous_owner_party_pk: survivorPartyId }, 'previous_owner_party_pk', survivorPartyId);

    count('crm_product_transfer', await change('crm_product_transfer', 'product_transfer_id',
      await owned('crm_product_transfer', 'from_party_pk', function (query) {
        return query.where(function () { this.whereNull('moved_row.to_party_pk').orWhereNot('moved_row.to_party_pk', survivorPartyId); });
      }), { from_party_pk: survivorPartyId }, 'from_party_pk', survivorPartyId));
    count('crm_product_transfer', await change('crm_product_transfer', 'product_transfer_id',
      await owned('crm_product_transfer', 'to_party_pk', function (query) {
        return query.where(function () { this.whereNull('moved_row.from_party_pk').orWhereNot('moved_row.from_party_pk', survivorPartyId); });
      }), { to_party_pk: survivorPartyId }, 'to_party_pk', survivorPartyId));
    await change('crm_product_transfer', 'product_transfer_id', await owned('crm_product_transfer', 'requested_by_party_pk'),
      { requested_by_party_pk: survivorPartyId }, 'requested_by_party_pk', survivorPartyId);

    count('crm_service_case', await change('crm_service_case', 'case_id', await owned('crm_service_case', 'party_pk'),
      { party_pk: survivorPartyId }, 'party_pk', survivorPartyId));
    count('crm_service_center_activity', await change('crm_service_center_activity', 'service_center_activity_id',
      await owned('crm_service_center_activity', 'party_pk'), { party_pk: survivorPartyId }, 'party_pk', survivorPartyId));
    await change('crm_service_center_activity', 'service_center_activity_id', await owned('crm_service_center_activity', 'performed_by_party_pk'),
      { performed_by_party_pk: survivorPartyId }, 'performed_by_party_pk', survivorPartyId);

    count('crm_transaction_party', await change('crm_transaction_party', 'transaction_party_id',
      await owned('crm_transaction_party', 'party_pk', notHeldBySurvivor('crm_transaction_party', ['transaction_id', 'party_role_code'])),
      { party_pk: survivorPartyId }, 'party_pk', survivorPartyId));

    /* Memberships hang on their account: the accounts moved above, and their tiers with them. */

    /* Points: re-point where the survivor has no account in that currency, carry over where it does. */
    const carried = [];
    const accounts = await trx('crm_point_account').where('party_pk', mergedPartyId);
    for (let index = 0; index < accounts.length; index += 1) {
      const account = accounts[index];
      // eslint-disable-next-line no-await-in-loop
      const clash = await trx('crm_point_account').where({ party_pk: survivorPartyId, point_type_id: account.point_type_id }).first();

      if (!clash) {
        // eslint-disable-next-line no-await-in-loop
        await change('crm_point_account', 'point_account_id', [account], { party_pk: survivorPartyId }, 'party_pk', survivorPartyId);
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
          party_pk: mergedPartyId, points_delta: -Number(account.balance),
          description: 'Carried over to the surviving party on merge'
        }));
        // eslint-disable-next-line no-await-in-loop
        await ledger.post(trx, Object.assign({}, carry, {
          party_pk: survivorPartyId, points_delta: Number(account.balance),
          description: 'Carried over from a merged party'
        }));
        carried.push({ point_type_id: account.point_type_id, points: Number(account.balance) });
        count('crm_point_event', 2);
      }
    }

    /*
     * Event entries. A reservation names its target through (target, event,
     * party), so the pair has to move together: the reservations let go of
     * their target, the target moves, the reservations follow and take it back.
     */
    const targets = await owned('crm_activity_target', 'party_pk', notHeldBySurvivor('crm_activity_target', ['event_id', 'entry_type']));
    const targetIds = targets.map(function (target) { return target.activity_target_id; });
    let held = [];
    if (targetIds.length) {
      held = await trx('crm_activity_reservation').whereIn('activity_target_id', targetIds).select('reservation_id', 'activity_target_id');
      await moveTargets(trx, targetIds, held, survivorPartyId);
      count('crm_activity_target', targetIds.length);
    }
    count('crm_activity_reservation', await change('crm_activity_reservation', 'reservation_id',
      await owned('crm_activity_reservation', 'party_pk', function (query) { return query.whereNull('moved_row.activity_target_id'); }),
      { party_pk: survivorPartyId }, 'party_pk', survivorPartyId));
    count('crm_activity_award', await change('crm_activity_award', 'award_id', await owned('crm_activity_award', 'party_pk'),
      { party_pk: survivorPartyId }, 'party_pk', survivorPartyId));

    /* Relationships an organization or a person has. */
    const filled = {};
    if (survivor.party_type === 'PERSON') {
      count('crm_organization_person_relationship', await change('crm_organization_person_relationship', 'org_person_relationship_id',
        await owned('crm_organization_person_relationship', 'person_party_pk'), { person_party_pk: survivorPartyId }, 'person_party_pk', survivorPartyId));

      /* Fill what the survivor does not know from what the merged party did. */
      const mergedPerson = await trx('crm_person').where('party_pk', mergedPartyId).first();
      const survivorPerson = await trx('crm_person').where('party_pk', survivorPartyId).first();
      if (mergedPerson && survivorPerson) {
        PERSON_COLUMNS.forEach(function (column) {
          if ((survivorPerson[column] === null || survivorPerson[column] === undefined) && mergedPerson[column] !== null && mergedPerson[column] !== undefined) filled[column] = mergedPerson[column];
        });
        if (Object.keys(filled).length) await trx('crm_person').where('party_pk', survivorPartyId).update(filled);
      }
    } else {
      count('crm_organization_person_relationship', await change('crm_organization_person_relationship', 'org_person_relationship_id',
        await owned('crm_organization_person_relationship', 'organization_party_pk'), { organization_party_pk: survivorPartyId }, 'organization_party_pk', survivorPartyId));
      await change('crm_service_center', 'service_center_id', await owned('crm_service_center', 'operator_party_pk'),
        { operator_party_pk: survivorPartyId }, 'operator_party_pk', survivorPartyId);
    }

    /* Derived rows are rebuilt rather than moved. */
    const segments = await trx('crm_segment_membership').where('party_pk', mergedPartyId).whereNull('unmatched_at').pluck('segment_membership_id');
    if (segments.length) await trx('crm_segment_membership').whereIn('segment_membership_id', segments).update({ unmatched_at: trx.fn.now() });
    await trx('crm_party_product_class_stat').where('party_pk', mergedPartyId).del();

    const accepted = await trx('crm_identity_match_candidate')
      .where('match_status', 'PENDING')
      .where(function () {
        this.where({ incoming_party_pk: mergedPartyId, candidate_party_pk: survivorPartyId })
          .orWhere({ incoming_party_pk: survivorPartyId, candidate_party_pk: mergedPartyId });
      })
      .pluck('match_candidate_id');
    if (accepted.length) {
      await trx('crm_identity_match_candidate').whereIn('match_candidate_id', accepted)
        .update({ match_status: 'ACCEPTED', reviewed_at: trx.fn.now(), reviewed_by_manager_id: actor.manager_id });
    }

    await change('crm_registration_intake', 'intake_id', await owned('crm_registration_intake', 'party_pk'),
      { party_pk: survivorPartyId }, 'party_pk', survivorPartyId);
    /* E-shop identifiers still waiting for review were proposed for the merged customer: propose them for the survivor. */
    const proposals = (await trx('crm_registration_intake').where({ category: 'ESHOP', status: 'PENDING' }).select('intake_id', 'candidates'))
      .filter(function (row) { return (row.candidates || []).some(function (candidate) { return String(candidate.party_pk) === String(mergedPartyId); }); });
    for (let index = 0; index < proposals.length; index += 1) {
      const seen = new Set();
      const candidates = (proposals[index].candidates || []).map(function (candidate) {
        return String(candidate.party_pk) === String(mergedPartyId) ? Object.assign({}, candidate, { party_pk: String(survivorPartyId), display_name: survivor.display_name }) : candidate;
      }).filter(function (candidate) {
        const key = String(candidate.party_pk || 'intake:' + candidate.intake_id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      // eslint-disable-next-line no-await-in-loop
      await trx('crm_registration_intake').where('intake_id', proposals[index].intake_id).update({ candidates: JSON.stringify(candidates) });
    }
    await change('crm_identity_resolution', 'resolution_id', await owned('crm_identity_resolution', 'party_pk'),
      { party_pk: survivorPartyId, acknowledged_at: null }, 'party_pk', survivorPartyId);
    await trx('crm_party').where('party_pk', mergedPartyId).update({
      party_status: 'MERGED', merged_into_party_pk: survivorPartyId
    });
    await trx('crm_party').where('party_pk', survivorPartyId).update({
      first_seen_at: trx.raw('LEAST(first_seen_at, ?)', [merged.first_seen_at || survivor.first_seen_at]),
      last_seen_at: trx.raw('GREATEST(last_seen_at, ?)', [merged.last_seen_at || survivor.last_seen_at])
    });

    const [history] = await trx('crm_party_merge_history').insert({
      surviving_party_pk: survivorPartyId,
      merged_party_pk: mergedPartyId,
      merge_reason: reason ? String(reason).slice(0, 250) : null,
      merge_method: method || 'MANUAL',
      moved_rows: JSON.stringify(moved),
      merged_by_manager_id: actor.manager_id,
      // What unmerge() needs to separate the two again.
      merge_metadata: JSON.stringify({
        undo: undo,
        targets: targetIds,
        reservations: held,
        carried: carried,
        filled: filled,
        segments: segments,
        accepted_matches: accepted,
        proposals: proposals.map(function (row) { return { intake_id: row.intake_id, candidates: row.candidates || [] }; }),
        merged_status: merged.party_status,
        survivor_first_seen_at: survivor.first_seen_at
      })
    }).returning('*');

    return history;
  });

  // The stats are recalculated outside the merge so a slow rebuild cannot hold its locks.
  await require('./analysis.service').recalculateClassStats({ partyIds: [survivorId] });

  audit.updated(actor, 'crm_party', mergedId, null, { merged_into_party_pk: survivorId, moved_rows: result.moved_rows }, PAGE);
  return result;
}

/* Event entries move with the reservations that name them: let go, move the entries, take them back. */
async function moveTargets(trx, targetIds, held, toPartyId) {
  await trx('crm_activity_reservation').whereIn('activity_target_id', targetIds).update({ activity_target_id: null });
  await trx('crm_activity_target').whereIn('activity_target_id', targetIds).update({ party_pk: toPartyId });
  for (let index = 0; index < held.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await trx('crm_activity_reservation').where('reservation_id', held[index].reservation_id)
      .update({ party_pk: toPartyId, activity_target_id: held[index].activity_target_id });
  }
}

/* A value as stored in the undo log (JSON) and as read back, compared as text. */
function sameValue(left, right) {
  const text = function (value) { return value instanceof Date ? value.toISOString() : value == null ? '' : String(value); };
  return text(left) === text(right);
}

/**
 * SEPARATING TWO CUSTOMERS THAT WERE MERGED BY MISTAKE.
 *
 * Only a merge of two customers is undone here - the duplicate check, a
 * reviewed match, the "merge a duplicate" button. A pending registration
 * merged into a customer was never a customer of its own and has nothing to
 * separate.
 *
 * The merge wrote down every row it moved and what it overwrote; unmerge
 * puts exactly those rows back on the merged customer and leaves everything
 * else where it is:
 *
 *   - what the survivor gained after the merge (new orders, cases, contacts)
 *     stays with the survivor - it may belong to either person, and only a
 *     manager can tell; it can be moved by hand afterwards;
 *   - a moved row that has changed hands again since (another merge, a
 *     transfer) is left alone;
 *   - details the merge filled in on the survivor are cleared again, unless
 *     someone has changed them since;
 *   - a points balance carried across is carried back; a points account that
 *     moved whole goes back whole, with whatever it holds now.
 *
 * The merged customer gets its old status back and becomes searchable again.
 * Merges are undone newest first: a survivor that was itself merged into a
 * third customer has to be separated from that one before.
 */
async function unmerge(mergeId, partyId, reason, actor) {
  if (!/^[1-9][0-9]*$/.test(String(mergeId || ''))) throw new HttpError(404, 'common.notFound');

  const result = await transaction(async function (trx) {
    await require('./registrationIntake.service').lock(trx);
    const history = await trx('crm_party_merge_history').where('merge_id', mergeId).forUpdate().first();
    if (!history) throw new HttpError(404, 'common.notFound');
    const survivorId = String(history.surviving_party_pk);
    const mergedId = String(history.merged_party_pk);
    if (partyId && String(partyId) !== survivorId && String(partyId) !== mergedId) throw new HttpError(404, 'common.notFound');
    if (history.unmerged_at) throw new HttpError(409, 'crm.customers.alreadyUnmerged');
    const log = history.merge_metadata || {};
    if (!Array.isArray(log.undo)) throw new HttpError(409, 'crm.customers.mergeCannotBeUndone');

    const lockOrder = survivorId < mergedId ? [survivorId, mergedId] : [mergedId, survivorId];
    const first = await repo.lockParty(lockOrder[0], trx);
    const second = await repo.lockParty(lockOrder[1], trx);
    const survivor = first && first.party_pk === survivorId ? first : second;
    const merged = first && first.party_pk === mergedId ? first : second;
    if (!survivor || !merged) throw new HttpError(404, 'common.notFound');
    if (merged.party_status !== 'MERGED' || String(merged.merged_into_party_pk) !== survivorId) throw new HttpError(409, 'crm.customers.mergeCannotBeUndone');
    if (survivor.party_status === 'MERGED') throw new HttpError(409, 'crm.customers.unmergeTheLaterMergeFirst');

    const restored = {};
    const count = function (name, rowCount) { if (rowCount) restored[name] = (restored[name] || 0) + Number(rowCount); };

    /* Newest change first, so a row changed twice ends where it started. */
    const changes = log.undo.slice().reverse();
    for (let index = 0; index < changes.length; index += 1) {
      const step = changes[index];
      // A merge from before memberships hung on their account moved them; now they follow the account, which is restored here too.
      if (step.table === 'crm_membership') continue;
      for (let row = 0; row < step.rows.length; row += 1) {
        const entry = step.rows[row];
        try {
          // eslint-disable-next-line no-await-in-loop
          count(step.table, await trx.transaction(function (inner) {
            return inner(step.table).where(step.key, entry.id).where(step.guard[0], step.guard[1]).update(entry.was);
          }));
        } catch (error) {
          // The merged customer has since gained a row this one would collide with: this one stays.
          if (error.code !== '23505') throw error;
        }
      }
    }

    if ((log.targets || []).length) {
      const targets = await trx('crm_activity_target').whereIn('activity_target_id', log.targets).where('party_pk', survivorId).pluck('activity_target_id');
      const held = (log.reservations || []).filter(function (reservation) { return targets.some(function (id) { return String(id) === String(reservation.activity_target_id); }); });
      if (targets.length) {
        await moveTargets(trx, targets, held, mergedId);
        count('crm_activity_target', targets.length);
      }
    }

    const carried = log.carried || [];
    for (let index = 0; index < carried.length; index += 1) {
      const carry = {
        point_type_id: carried[index].point_type_id, event_code: 'MERGE_CARRY_OVER',
        performed_by_manager_id: actor.manager_id, allow_negative: true, allow_inactive: true
      };
      // eslint-disable-next-line no-await-in-loop
      await ledger.post(trx, Object.assign({}, carry, { party_pk: survivorId, points_delta: -carried[index].points, description: 'Returned to a separated party' }));
      // eslint-disable-next-line no-await-in-loop
      await ledger.post(trx, Object.assign({}, carry, { party_pk: mergedId, points_delta: carried[index].points, description: 'Returned on separation from a merge' }));
      count('crm_point_event', 2);
    }

    const filled = log.filled || {};
    if (Object.keys(filled).length) {
      const person = await trx('crm_person').where('party_pk', survivorId).first();
      const clear = {};
      Object.keys(filled).forEach(function (column) { if (person && sameValue(person[column], filled[column])) clear[column] = null; });
      if (Object.keys(clear).length) await trx('crm_person').where('party_pk', survivorId).update(clear);
    }

    if ((log.segments || []).length) {
      await trx.raw(
        `UPDATE crm_segment_membership kept SET unmatched_at = NULL
          WHERE kept.segment_membership_id = ANY(?) AND kept.party_pk = ? AND NOT EXISTS (
            SELECT 1 FROM crm_segment_membership other
             WHERE other.segment_id = kept.segment_id AND other.party_pk = kept.party_pk AND other.unmatched_at IS NULL)`,
        [log.segments, mergedId]);
    }

    /* The pair was judged one person; separating them says they are two. */
    if ((log.accepted_matches || []).length) {
      await trx('crm_identity_match_candidate').whereIn('match_candidate_id', log.accepted_matches).where('match_status', 'ACCEPTED')
        .update({ match_status: 'REJECTED', reviewed_at: trx.fn.now(), reviewed_by_manager_id: actor.manager_id });
    }

    const proposals = log.proposals || [];
    for (let index = 0; index < proposals.length; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      await trx('crm_registration_intake').where({ intake_id: proposals[index].intake_id, status: 'PENDING' })
        .update({ candidates: JSON.stringify(proposals[index].candidates) });
    }

    await trx('crm_party').where('party_pk', mergedId).update({
      party_status: log.merged_status && log.merged_status !== 'MERGED' ? log.merged_status : 'ACTIVE',
      merged_into_party_pk: null, updated_at: trx.fn.now()
    });
    if (log.survivor_first_seen_at !== undefined && sameValue(survivor.first_seen_at, merged.first_seen_at)) {
      await trx('crm_party').where('party_pk', survivorId).update({ first_seen_at: log.survivor_first_seen_at });
    }

    const [after] = await trx('crm_party_merge_history').where('merge_id', mergeId).update({
      unmerged_at: trx.fn.now(),
      unmerged_by_manager_id: actor.manager_id,
      unmerge_reason: reason ? String(reason).slice(0, 250) : null,
      restored_rows: JSON.stringify(restored)
    }).returning(['merge_id', 'surviving_party_pk', 'merged_party_pk', 'unmerged_at', 'unmerge_reason', 'restored_rows']);
    return after;
  });

  await require('./analysis.service').recalculateClassStats({ partyIds: [String(result.surviving_party_pk), String(result.merged_party_pk)] });
  audit.updated(actor, 'crm_party', result.merged_party_pk, { merged_into_party_pk: result.surviving_party_pk }, { merged_into_party_pk: null, restored_rows: result.restored_rows }, PAGE);
  return result;
}

/* ------------------------------------------------------------ duplicates */

/** Apply the weighted matcher to historical parties; review existing pairs manually. */
async function scanDuplicates(actor) {
 let found = 0;
 await transaction(async trx => {
  const people = await trx('crm_party as p').join('crm_person as person','person.party_pk','p.party_pk')
   .whereIn('p.party_status',['ACTIVE','INACTIVE']).select('person.*','p.origin_project_id');
  for (const person of people) {
   // A pair is filed under the newer person's origin project; one without an origin cannot be filed.
   if (!person.origin_project_id) continue;
   person.contacts = await trx('crm_contact_point').where({ party_pk: person.party_pk, status: 'ACTIVE' });
   const matches = await duplicates.findSimilar(person, { trx, excludePartyId: person.party_pk });
   for (const match of matches) {
    if (BigInt(match.party_pk) >= BigInt(person.party_pk)) continue;
    const inserted = await trx('crm_identity_match_candidate').insert({
     incoming_project_id: person.origin_project_id, incoming_external_record_id: String(person.party_pk),
     incoming_party_pk: person.party_pk, candidate_party_pk: match.party_pk,
     match_rule_code: match.rule_code, match_score: match.score, explanation_json: JSON.stringify({ reason: match.reason })
    }).onConflict(['incoming_project_id','incoming_external_record_id','candidate_party_pk']).ignore().returning('match_candidate_id');
    found += inserted.length;
   }
  }
 });
 audit.imported(actor, 'crm_identity_match_candidate', { found }, PAGE);
 return { found };
}

async function decideCandidate(id, accept, actor) {
  const candidate = await db('crm_identity_match_candidate').where('match_candidate_id', id).first();
  if (!candidate) throw new HttpError(404, 'common.notFound');
  if (candidate.match_status !== 'PENDING') throw new HttpError(409, 'crm.common.alreadyDecided');

  if (accept) {
    if (!candidate.incoming_party_pk) throw new HttpError(409, 'crm.customers.nothingToMerge');
    await merge(candidate.candidate_party_pk, candidate.incoming_party_pk,
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
  // An account once unlinked is as good as gone: its link and unlink stay in the change history above, but it is not listed.
  found.accounts = (found.accounts || []).filter(function (account) { return !account.unlinked_at; });

  const [analysis, orgs, transactions, tierHistory, auditTrail] = await Promise.all([
    analysisRead.forParty(id),
    organizations.forParty(id),
    db('crm_transaction as txn').join('crm_transaction_party as tp', 'tp.transaction_id', 'txn.transaction_id')
      .join('crm_project as project', 'project.project_id', 'txn.project_id')
      .where('tp.party_pk', id).where('tp.party_role_code', 'BUYER')
      .orderBy('txn.transaction_at', 'desc').limit(50)
      .select('txn.transaction_id', 'txn.external_transaction_id', 'txn.transaction_type_code', 'txn.transaction_status',
        'txn.currency_code', 'txn.net_amount', 'txn.reporting_net_amount', 'txn.points_used', 'txn.transaction_at',
        'txn.original_transaction_id', 'project.project_code'),
    db('crm_membership_tier_history as tier_history').join('crm_membership as membership', 'membership.membership_id', 'tier_history.membership_id')
      .join('crm_project_account as account', 'account.project_account_id', 'membership.project_account_id')
      .join('crm_project as project', 'project.project_id', 'account.project_id')
      .leftJoin('crm_project_tier as old_tier', 'old_tier.project_tier_id', 'tier_history.old_tier_id')
      .join('crm_project_tier as new_tier', 'new_tier.project_tier_id', 'tier_history.new_tier_id')
      // The tiers of the accounts linked to this customer now.
      .where('account.party_pk', id).whereNull('account.unlinked_at').orderBy('tier_history.changed_at', 'desc').limit(30)
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
  insertParty: insertParty,
  insertContact: insertContact,
  search: repo.search,
  lookup: repo.lookup,
  detail: detail,
  create: create,
  similarTo: similarTo,
  setChecked: setChecked,
  update: update,
  setStatus: setStatus,
  assignGrade: assignGrade,
  addContact: addContact,
  updateContact: updateContact,
  deleteContact: deleteContact,
  linkAccount: linkAccount,
  updateAccount: updateAccount,
  unlinkAccount: unlinkAccount,
  setConsent: setConsent,
  merge: merge,
  unmerge: unmerge,
  scanDuplicates: scanDuplicates,
  pendingCandidates: repo.pendingCandidates,
  decideCandidate: decideCandidate
};
