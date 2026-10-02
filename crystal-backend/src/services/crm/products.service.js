const crypto = require('crypto');
const db = require('../../config/db');
const vocabulary = require('../../repositories/crm/vocabulary.repository');
const ledger = require('./ledger');
const analysis = require('./analysis.service');
const audit = require('../audit.service');
const { transaction } = require('../../repositories/shared/transaction');
const { HttpError } = require('../../utils/response');

/**
 * PRODUCTS AS THE CRM SEES THEM: a thing, and who holds it how.
 *
 * An INSTANCE is one concrete thing - a phone by IMEI, a television by serial,
 * a licence by its key, bound to the device it unlocks. A REGISTRATION is one
 * party's relationship to it for a period: owner, assigned user, lessee,
 * licence holder. Phone, eproduct, licence, app and Crystal registrations are
 * all rows of the same table, which is the consolidation the design asked for.
 *
 * `valid_to IS NULL` means "now". Nothing is ever updated into a different
 * holder: a change of hands ends one row and starts another, so "who had this
 * phone in March" is a question the table can answer.
 */

const PAGE = '/admin/crm/products';
const TRANSFER_PAGE = '/admin/crm/transfers';

const CHANNELS = ['APP', 'WEB', 'AGENCY', 'CONSOLE', 'IMPORT', 'TRANSFER'];
const END_REASONS = ['TRANSFER', 'ASSIGNMENT_END', 'CANCELLED', 'LOST', 'SCRAPPED', 'RETURNED', 'EXPIRED', 'MERGE'];
const INSTANCE_STATUS = ['ACTIVE', 'LOST', 'STOLEN', 'SCRAPPED', 'VOID', 'EXPIRED'];

/* ------------------------------------------------------------ instances */

function instanceQuery(filters) {
  const qb = db('crm_product_instance as i')
    .join('crm_product_catalog as c', 'c.product_id', 'i.product_id')
    .join('crm_project as j', 'j.project_id', 'i.project_id')
    .leftJoin('crm_product_class as k', 'k.product_class_id', 'c.product_class_id');

  if (filters.project_id) qb.where('i.project_id', filters.project_id);
  if (filters.instance_kind) qb.where('i.instance_kind', filters.instance_kind);
  if (filters.status) qb.where('i.status', filters.status);
  if (filters.product_class_id) qb.where('c.product_class_id', filters.product_class_id);
  if (filters.q) {
    const like = '%' + String(filters.q).trim() + '%';
    qb.where(function () {
      this.where('i.external_product_instance_id', 'ilike', like)
        .orWhere('i.serial_number', 'ilike', like)
        .orWhere('i.imei', 'ilike', like)
        .orWhere('c.product_name', 'ilike', like);
    });
  }
  return qb;
}

async function searchInstances(filters, paging) {
  const count = await instanceQuery(filters).count({ c: '*' }).first();
  const rows = await instanceQuery(filters)
    .select('i.*', 'c.product_name', 'c.product_code', 'j.project_code', 'k.class_code', 'k.class_name',
      db.raw(`(SELECT p.display_name FROM crm_product_registration r JOIN crm_party p ON p.party_id = r.party_id
                WHERE r.product_instance_id = i.product_instance_id AND r.valid_to IS NULL
                  AND r.relationship_code IN ('OWNER', 'LICENSEE') LIMIT 1) AS holder_name`),
      db.raw(`(SELECT COUNT(*) FROM crm_product_registration r
                WHERE r.product_instance_id = i.product_instance_id)::int AS registration_cnt`))
    .orderBy(paging.sort === 'created_at' ? 'i.created_at' : 'i.product_instance_id', paging.dir)
    .limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.c) };
}

/** One instance, its whole holding history, the requests against it, and its service record. */
async function instanceDetail(id) {
  const instance = await instanceQuery({}).where('i.product_instance_id', id)
    .leftJoin('crm_product_instance as b', 'b.product_instance_id', 'i.bound_instance_id')
    .first('i.*', 'c.product_name', 'c.product_code', 'j.project_code', 'k.class_code', 'k.class_name',
      'b.external_product_instance_id as bound_external_id');
  if (!instance) throw new HttpError(404, 'common.notFound');

  const [registrations, transfers, cases, licences] = await Promise.all([
    registrationQuery({}).where('r.product_instance_id', id).orderBy('r.valid_from', 'desc')
      .select(REGISTRATION_COLUMNS),
    transferQuery({}).where('x.product_instance_id', id).orderBy('x.requested_at', 'desc').select(TRANSFER_COLUMNS),
    db('crm_service_case as s')
      .join('crm_service_status as st', 'st.service_status_id', 's.service_status_id')
      .join('crm_service_case_type as ct', 'ct.case_type_id', 's.case_type_id')
      .where('s.related_product_instance_id', id).orderBy('s.received_at', 'desc').limit(50)
      .select('s.case_id', 's.external_case_id', 's.received_at', 's.closed_at',
        'st.display_name as status_name', 'st.is_terminal', 'ct.display_name as case_type_name'),
    db('crm_product_instance as l').join('crm_product_catalog as c', 'c.product_id', 'l.product_id')
      .where('l.bound_instance_id', id)
      .select('l.product_instance_id', 'l.external_product_instance_id', 'l.status', 'l.valid_until', 'c.product_name')
  ]);

  return { instance: instance, registrations: registrations, transfers: transfers, cases: cases, licences: licences };
}

async function updateInstance(id, body, actor) {
  const before = await db('crm_product_instance').where('product_instance_id', id).first();
  if (!before) throw new HttpError(404, 'common.notFound');

  const patch = {};
  if (body.status !== undefined) {
    if (INSTANCE_STATUS.indexOf(body.status) === -1) throw new HttpError(400, 'crm.notAStatusYouCanSet');
    patch.status = body.status;
  }
  ['serial_number', 'imei', 'batch_code', 'manufactured_at', 'valid_until', 'activated_at'].forEach(function (column) {
    if (body[column] !== undefined) patch[column] = body[column] === '' ? null : body[column];
  });
  if (!Object.keys(patch).length) throw new HttpError(400, 'common.nothingToUpdate');

  const [after] = await db('crm_product_instance').where('product_instance_id', id).update(patch).returning('*');
  audit.updated(actor, 'crm_product_instance', id, before, after, PAGE);
  return after;
}

/* ------------------------------------------------------------ registrations */

const REGISTRATION_COLUMNS = [
  'r.*', 'p.party_no', 'p.display_name as party_name', 'i.external_product_instance_id', 'i.serial_number',
  'i.imei', 'i.instance_kind', 'c.product_name', 'c.product_code', 'k.class_code', 'k.class_name',
  'j.project_code', 't.relationship_name', 'l.location_name as registered_at_location_name',
  'pv.display_name as previous_owner_name'
];

function registrationQuery(filters) {
  const qb = db('crm_product_registration as r')
    .join('crm_party as p', 'p.party_id', 'r.party_id')
    .join('crm_product_instance as i', 'i.product_instance_id', 'r.product_instance_id')
    .join('crm_product_catalog as c', 'c.product_id', 'i.product_id')
    .join('crm_project as j', 'j.project_id', 'r.project_id')
    .leftJoin('crm_product_class as k', 'k.product_class_id', 'c.product_class_id')
    .leftJoin('crm_product_relationship_type as t', 't.relationship_type_id', 'r.relationship_type_id')
    .leftJoin('crm_service_location as l', 'l.service_location_id', 'r.registered_at_location_id')
    .leftJoin('crm_party as pv', 'pv.party_id', 'r.previous_owner_party_id');

  if (filters.project_id) qb.where('r.project_id', filters.project_id);
  if (filters.relationship_code) qb.where('r.relationship_code', filters.relationship_code);
  if (filters.registration_status) qb.where('r.registration_status', filters.registration_status);
  if (filters.product_class_id) qb.where('c.product_class_id', filters.product_class_id);
  if (filters.party_id) qb.where('r.party_id', filters.party_id);
  if (filters.current === '1' || filters.current === 1 || filters.current === true) qb.whereNull('r.valid_to');
  if (filters.q) {
    const like = '%' + String(filters.q).trim() + '%';
    qb.where(function () {
      this.where('i.external_product_instance_id', 'ilike', like)
        .orWhere('i.serial_number', 'ilike', like)
        .orWhere('i.imei', 'ilike', like)
        .orWhere('p.display_name', 'ilike', like)
        .orWhere('p.party_no', 'ilike', like)
        .orWhere('c.product_name', 'ilike', like);
    });
  }
  return qb;
}

async function searchRegistrations(filters, paging) {
  const count = await registrationQuery(filters).count({ c: '*' }).first();
  const sort = { registered_at: 'r.registered_at', valid_from: 'r.valid_from', valid_to: 'r.valid_to' }[paging.sort]
    || 'r.product_registration_id';
  const rows = await registrationQuery(filters).select(REGISTRATION_COLUMNS)
    .orderBy(sort, paging.dir).limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.c) };
}

/**
 * The rule that pays points for registering this product, if there is one.
 *
 * The narrowest rule wins, the same way a warranty policy pinned to a series
 * beats one pinned to its section: one for this exact product, then one for
 * its class or the nearest class above it, then one for the whole project.
 */
async function registrationRule(trx, product, projectId) {
  const rules = await trx('crm_point_rule')
    .where({ trigger_code: 'PRODUCT_REGISTRATION', is_active: true })
    .where(function () { this.whereNull('valid_from').orWhere('valid_from', '<=', trx.fn.now()); })
    .where(function () { this.whereNull('valid_to').orWhere('valid_to', '>=', trx.fn.now()); })
    .where(function () { this.whereNull('project_id').orWhere('project_id', projectId); });

  const exact = rules.filter(function (rule) { return String(rule.product_id) === String(product.product_id); })[0];
  if (exact) return exact;

  /* The class, then each class above it. */
  let classId = product.product_class_id;
  const seen = {};
  while (classId && !seen[classId]) {
    seen[classId] = true;
    const id = classId;
    const byClass = rules.filter(function (rule) { return !rule.product_id && String(rule.product_class_id) === String(id); })[0];
    if (byClass) return byClass;
    // eslint-disable-next-line no-await-in-loop
    const parent = await trx('crm_product_class').where('product_class_id', classId).first('parent_product_class_id');
    classId = parent ? parent.parent_product_class_id : null;
  }

  return rules.filter(function (rule) { return !rule.product_id && !rule.product_class_id && rule.project_id; })[0]
    || rules.filter(function (rule) { return !rule.product_id && !rule.product_class_id && !rule.project_id; })[0]
    || null;
}

/**
 * A NEW REGISTRATION, and the instance it is for if the CRM has never seen it.
 *
 * An exclusive relationship - OWNER, LICENSEE - can be held by one party at a
 * time. The database refuses a second current owner outright; the service
 * says so first, naming who holds it, because "duplicated value" helps nobody
 * standing at a counter with a customer.
 *
 * Points are paid only when the relationship type says registering earns
 * them, only when a rule covers the product, and only ONCE PER DEVICE for
 * that rule - a phone passed around a family must not pay out at every
 * registration. The serial-farming guard Crystal has on registered_products,
 * carried across.
 */
async function register(body, actor, options) {
  const opts = options || {};
  if (!body.party_id) throw new HttpError(400, 'crm.chooseACustomer');

  const relationship = await db('crm_product_relationship_type')
    .where('relationship_code', body.relationship_code || 'OWNER').first();
  if (!relationship) throw new HttpError(400, 'crm.unknownRelationship');

  const channel = body.registration_channel || 'CONSOLE';
  if (CHANNELS.indexOf(channel) === -1) throw new HttpError(400, 'crm.unknownChannel');

  const result = await transaction(async function (trx) {
    const party = await trx('crm_party').where('party_id', body.party_id).first();
    if (!party) throw new HttpError(404, 'common.notFound');
    if (['ACTIVE', 'INACTIVE'].indexOf(party.party_status) === -1) throw new HttpError(409, 'crm.thisPartyWasMerged');

    let instance;
    if (body.product_instance_id) {
      instance = await trx('crm_product_instance').where('product_instance_id', body.product_instance_id).forUpdate().first();
      if (!instance) throw new HttpError(404, 'common.notFound');
    } else {
      instance = await findOrCreateInstance(trx, body);
    }
    if (['VOID', 'SCRAPPED'].indexOf(instance.status) !== -1) throw new HttpError(409, 'crm.thisProductIsOutOfService');

    const product = await trx('crm_product_catalog').where('product_id', instance.product_id).first();

    if (relationship.is_exclusive) {
      const holder = await trx('crm_product_registration as r')
        .join('crm_party as p', 'p.party_id', 'r.party_id')
        .where('r.product_instance_id', instance.product_instance_id)
        .whereIn('r.relationship_code', ['OWNER', 'LICENSEE'])
        .whereNull('r.valid_to')
        .first('p.party_no', 'p.display_name');
      if (holder) {
        throw new HttpError(409, 'crm.thisProductAlreadyHasAnOwner', null, {
          holder: (holder.display_name || '') + ' (' + holder.party_no + ')'
        });
      }
    }

    const now = new Date();
    const [registration] = await trx('crm_product_registration').insert({
      party_id: party.party_id,
      product_instance_id: instance.product_instance_id,
      relationship_type_id: relationship.relationship_type_id,
      relationship_code: relationship.relationship_code,
      project_id: body.project_id || instance.project_id,
      registration_channel: channel,
      registered_at_location_id: body.registered_at_location_id || null,
      purchase_purpose_id: body.purchase_purpose_id || null,
      usage_type_id: body.usage_type_id || null,
      acquisition_type_id: body.acquisition_type_id || null,
      previous_owner_party_id: body.previous_owner_party_id || null,
      transfer_id: body.transfer_id || null,
      purchase_date: body.purchase_date || null,
      purchase_place: body.purchase_place || null,
      sim_cid: body.sim_cid || null,
      registration_status: 'ACTIVE',
      registered_at: body.registered_at || now,
      valid_from: body.valid_from || body.registered_at || now,
      source_record_id: body.source_record_id || null,
      crystal_registered_product_id: body.crystal_registered_product_id || null
    }).returning('*');

    let pointEvent = null;
    if (relationship.awards_registration_points && !opts.noPoints) {
      pointEvent = await payRegistrationPoints(trx, registration, instance, product, actor);
    }

    /* Registering at a counter is something the counter did - site activity counts it. */
    if (registration.registered_at_location_id && channel === 'AGENCY') {
      const typeId = await vocabulary.idOf('crm_location_activity_type', 'REGISTRATION_ASSIST', trx);
      if (typeId) {
        await trx('crm_location_activity').insert({
          service_location_id: registration.registered_at_location_id,
          activity_type_id: typeId,
          project_id: registration.project_id,
          occurred_at: registration.registered_at,
          party_id: party.party_id,
          performed_by_manager_id: actor ? actor.manager_id : null,
          related_product_instance_id: instance.product_instance_id,
          external_activity_id: 'registration:' + registration.product_registration_id
        });
      }
    }

    return { registration: registration, instance: instance, point_event: pointEvent };
  });

  if (!opts.skipStats) await analysis.recalculateClassStats({ partyIds: [Number(body.party_id)] });
  audit.created(actor, 'crm_product_registration', result.registration.product_registration_id, result.registration, PAGE);
  return result;
}

async function payRegistrationPoints(trx, registration, instance, product, actor) {
  const rule = await registrationRule(trx, product, registration.project_id);
  if (!rule) return null;

  const paid = await trx('crm_point_event as e')
    .join('crm_product_registration as r', 'r.product_registration_id', 'e.related_product_registration_id')
    .where('e.point_rule_id', rule.point_rule_id)
    .where('r.product_instance_id', instance.product_instance_id)
    .first('e.point_event_id');
  if (paid) return null;

  return ledger.post(trx, {
    party_id: registration.party_id,
    point_type_id: rule.point_type_id,
    event_code: 'EARN',
    points_delta: Number(rule.points),
    point_rule_id: rule.point_rule_id,
    project_id: registration.project_id,
    related_product_registration_id: registration.product_registration_id,
    performed_by_location_id: registration.registered_at_location_id,
    performed_by_manager_id: actor ? actor.manager_id : null,
    description: rule.rule_name,
    occurred_at: registration.registered_at
  });
}

/** The instance a serial or IMEI names in a project, created from the catalogue if it is new. */
async function findOrCreateInstance(trx, body) {
  const product = await trx('crm_product_catalog').where('product_id', body.product_id).first();
  if (!product) throw new HttpError(400, 'crm.chooseAProduct');

  const external = String(body.external_product_instance_id || body.serial_number || body.imei || '').trim();
  if (!external) throw new HttpError(400, 'crm.aSerialOrImeiIsRequired');

  const existing = await trx('crm_product_instance')
    .where({ project_id: product.project_id, external_product_instance_id: external }).forUpdate().first();
  if (existing) {
    if (String(existing.product_id) !== String(product.product_id)) throw new HttpError(409, 'crm.thatSerialBelongsToAnotherProduct');
    return existing;
  }

  const kind = product.product_kind === 'LICENCE' ? 'LICENCE'
    : (['SOFTWARE', 'SUBSCRIPTION'].indexOf(product.product_kind) !== -1 ? 'ENTITLEMENT' : 'DEVICE');

  const [row] = await trx('crm_product_instance').insert({
    product_id: product.product_id,
    project_id: product.project_id,
    external_product_instance_id: external,
    instance_kind: kind,
    serial_number: body.serial_number || (kind === 'DEVICE' ? external : null),
    imei: body.imei || null,
    license_key_hash: body.license_key ? crypto.createHash('sha256').update(String(body.license_key)).digest('hex') : null,
    bound_instance_id: body.bound_instance_id || null,
    valid_until: body.valid_until || null,
    activated_at: body.activated_at || null
  }).returning('*');
  return row;
}

/** Ends a registration now, for a stated reason. */
async function endRegistration(id, reason, actor, trx) {
  if (END_REASONS.indexOf(reason) === -1) throw new HttpError(400, 'crm.chooseAnEndReason');

  const run = async function (connection) {
    const before = await connection('crm_product_registration').where('product_registration_id', id).forUpdate().first();
    if (!before) throw new HttpError(404, 'common.notFound');
    if (before.valid_to) throw new HttpError(409, 'crm.thisRegistrationHasEnded');

    const [after] = await connection('crm_product_registration').where('product_registration_id', id).update({
      valid_to: connection.fn.now(),
      registration_status: reason === 'CANCELLED' ? 'CANCELLED' : 'ENDED',
      end_reason_code: reason
    }).returning('*');
    return { before: before, after: after };
  };

  const done = trx ? await run(trx) : await transaction(run);
  if (!trx) {
    await analysis.recalculateClassStats({ partyIds: [done.after.party_id] });
    audit.updated(actor, 'crm_product_registration', id, done.before, done.after, PAGE);
  }
  return done.after;
}

/* ------------------------------------------------------------ transfers */

const TRANSFER_KINDS = ['OWNERSHIP_TRANSFER', 'ASSIGN_USER', 'END_ASSIGNMENT', 'RETURN_TO_OWNER',
  'LEASE_START', 'LEASE_END', 'LICENCE_REBIND'];

/** Which open relationship a kind closes, and which it opens. */
const TRANSFER_EFFECT = {
  OWNERSHIP_TRANSFER: { close: 'OWNER', closeReason: 'TRANSFER', open: 'OWNER', acquisition: 'TRANSFER' },
  ASSIGN_USER: { open: 'USER', acquisition: 'COMPANY_ASSIGNED' },
  END_ASSIGNMENT: { close: 'USER', closeReason: 'ASSIGNMENT_END' },
  RETURN_TO_OWNER: { close: 'USER', closeReason: 'RETURNED' },
  LEASE_START: { open: 'LESSEE' },
  LEASE_END: { close: 'LESSEE', closeReason: 'ASSIGNMENT_END' },
  LICENCE_REBIND: {}
};

const TRANSFER_FLOW = {
  REQUESTED: ['ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'EXPIRED'],
  ACCEPTED: ['COMPLETED', 'CANCELLED', 'EXPIRED'],
  REJECTED: [],
  CANCELLED: [],
  COMPLETED: [],
  EXPIRED: []
};

const TRANSFER_COLUMNS = [
  'x.*', 'i.external_product_instance_id', 'i.serial_number', 'i.instance_kind', 'c.product_name',
  'f.party_no as from_party_no', 'f.display_name as from_name',
  't.party_no as to_party_no', 't.display_name as to_name',
  'ti.external_product_instance_id as to_instance_external_id',
  'l.location_name as handled_at_location_name', 'm.name as requested_by_manager_name'
];

function transferQuery(filters) {
  const qb = db('crm_product_transfer as x')
    .join('crm_product_instance as i', 'i.product_instance_id', 'x.product_instance_id')
    .join('crm_product_catalog as c', 'c.product_id', 'i.product_id')
    .leftJoin('crm_party as f', 'f.party_id', 'x.from_party_id')
    .leftJoin('crm_party as t', 't.party_id', 'x.to_party_id')
    .leftJoin('crm_product_instance as ti', 'ti.product_instance_id', 'x.to_instance_id')
    .leftJoin('crm_service_location as l', 'l.service_location_id', 'x.handled_at_location_id')
    .leftJoin('managers as m', 'm.id', 'x.requested_by_manager_id');

  if (filters.status) qb.where('x.status', filters.status);
  if (filters.transfer_kind) qb.where('x.transfer_kind', filters.transfer_kind);
  if (filters.open === '1') qb.whereIn('x.status', ['REQUESTED', 'ACCEPTED']);
  if (filters.q) {
    const like = '%' + String(filters.q).trim() + '%';
    qb.where(function () {
      this.where('i.external_product_instance_id', 'ilike', like)
        .orWhere('i.serial_number', 'ilike', like)
        .orWhere('f.display_name', 'ilike', like)
        .orWhere('t.display_name', 'ilike', like)
        .orWhere('f.party_no', 'ilike', like)
        .orWhere('t.party_no', 'ilike', like);
    });
  }
  return qb;
}

async function searchTransfers(filters, paging) {
  const count = await transferQuery(filters).count({ c: '*' }).first();
  const rows = await transferQuery(filters).select(TRANSFER_COLUMNS)
    .orderBy(paging.sort === 'completed_at' ? 'x.completed_at' : 'x.requested_at', paging.dir)
    .limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.c) };
}

/**
 * A REQUEST to change who holds a product.
 *
 * Recorded before anything changes: the current holder may have to agree, a
 * leased phone may need to come back first, a licence move may need checking.
 * The FROM party is worked out from the registrations rather than taken from
 * the form, so a request can only ever move a product away from whoever
 * actually holds it.
 */
async function requestTransfer(body, actor) {
  if (TRANSFER_KINDS.indexOf(body.transfer_kind) === -1) throw new HttpError(400, 'crm.chooseWhatShouldHappen');

  const effect = TRANSFER_EFFECT[body.transfer_kind];
  const instance = await db('crm_product_instance').where('product_instance_id', body.product_instance_id).first();
  if (!instance) throw new HttpError(404, 'common.notFound');

  let fromPartyId = body.from_party_id || null;
  if (effect.close || body.transfer_kind === 'ASSIGN_USER' || body.transfer_kind === 'LEASE_START') {
    const code = effect.close || 'OWNER';
    const current = await db('crm_product_registration')
      .where({ product_instance_id: instance.product_instance_id, relationship_code: code })
      .whereNull('valid_to')
      .modify(function (qb) { if (fromPartyId && effect.close) qb.where('party_id', fromPartyId); })
      .orderBy('valid_from', 'desc').first();
    if (!current && effect.close) throw new HttpError(409, 'crm.nobodyHoldsItThatWay');
    fromPartyId = current ? current.party_id : null;
  }

  if (body.transfer_kind === 'LICENCE_REBIND') {
    if (instance.instance_kind !== 'LICENCE') throw new HttpError(409, 'crm.onlyALicenceCanBeRebound');
    if (!body.to_instance_id) throw new HttpError(400, 'crm.chooseTheNewDevice');
  }
  if (effect.open && !body.to_party_id) throw new HttpError(400, 'crm.chooseWhoReceivesIt');

  const [row] = await db('crm_product_transfer').insert({
    product_instance_id: instance.product_instance_id,
    transfer_kind: body.transfer_kind,
    from_party_id: fromPartyId,
    to_party_id: body.to_party_id || null,
    to_instance_id: body.to_instance_id || null,
    acquisition_type_id: body.acquisition_type_id || null,
    requested_by_type: 'MANAGER',
    requested_by_manager_id: actor.manager_id,
    handled_at_location_id: body.handled_at_location_id || null,
    status: 'REQUESTED',
    reason: body.reason ? String(body.reason).slice(0, 500) : null,
    expires_at: body.expires_at || null
  }).returning('*');

  audit.created(actor, 'crm_product_transfer', row.product_transfer_id, row, TRANSFER_PAGE);
  return row;
}

/**
 * Move a request along. COMPLETING it is what changes hands, and it happens
 * in one transaction: the old registration ends and the new one starts, or
 * neither does.
 */
async function transitionTransfer(id, status, note, actor) {
  const result = await transaction(async function (trx) {
    const transfer = await trx('crm_product_transfer').where('product_transfer_id', id).forUpdate().first();
    if (!transfer) throw new HttpError(404, 'common.notFound');

    const allowed = TRANSFER_FLOW[transfer.status] || [];
    if (allowed.indexOf(status) === -1) {
      throw new HttpError(409, 'crm.cannotMoveFromTo', null, { from: transfer.status, to: status });
    }

    const patch = { status: status };
    if (note) patch.reason = String(note).slice(0, 500);
    if (['ACCEPTED', 'REJECTED'].indexOf(status) !== -1) patch.responded_at = trx.fn.now();

    if (status === 'COMPLETED') {
      const effect = TRANSFER_EFFECT[transfer.transfer_kind];
      patch.completed_at = trx.fn.now();

      if (effect.close) {
        const current = await trx('crm_product_registration')
          .where({ product_instance_id: transfer.product_instance_id, relationship_code: effect.close })
          .whereNull('valid_to')
          .modify(function (qb) { if (transfer.from_party_id) qb.where('party_id', transfer.from_party_id); })
          .forUpdate().first();
        if (!current) throw new HttpError(409, 'crm.nobodyHoldsItThatWay');
        await endRegistration(current.product_registration_id, effect.closeReason, actor, trx);
        patch.closed_registration_id = current.product_registration_id;
      }

      if (effect.open) {
        const relationship = await trx('crm_product_relationship_type').where('relationship_code', effect.open).first();
        const acquisition = transfer.acquisition_type_id
          || (effect.acquisition ? await vocabulary.idOf('crm_acquisition_type', effect.acquisition, trx) : null);
        const instance = await trx('crm_product_instance').where('product_instance_id', transfer.product_instance_id).first();

        const [created] = await trx('crm_product_registration').insert({
          party_id: transfer.to_party_id,
          product_instance_id: transfer.product_instance_id,
          relationship_type_id: relationship.relationship_type_id,
          relationship_code: relationship.relationship_code,
          project_id: instance.project_id,
          registration_channel: 'TRANSFER',
          registered_at_location_id: transfer.handled_at_location_id,
          acquisition_type_id: acquisition,
          previous_owner_party_id: effect.open === 'OWNER' ? transfer.from_party_id : null,
          transfer_id: transfer.product_transfer_id,
          registration_status: 'ACTIVE',
          registered_at: trx.fn.now(),
          valid_from: trx.fn.now()
        }).returning('*');
        patch.created_registration_id = created.product_registration_id;
      }

      if (transfer.transfer_kind === 'LICENCE_REBIND') {
        await trx('crm_product_instance').where('product_instance_id', transfer.product_instance_id)
          .update({ bound_instance_id: transfer.to_instance_id });
      }
    }

    const [after] = await trx('crm_product_transfer').where('product_transfer_id', id).update(patch).returning('*');
    return { before: transfer, after: after };
  });

  if (status === 'COMPLETED') {
    const parties = [result.after.from_party_id, result.after.to_party_id].filter(Boolean);
    if (parties.length) await analysis.recalculateClassStats({ partyIds: parties });
  }
  audit.updated(actor, 'crm_product_transfer', id, result.before, result.after, TRANSFER_PAGE);
  return result.after;
}

module.exports = {
  PAGE: PAGE,
  TRANSFER_PAGE: TRANSFER_PAGE,
  END_REASONS: END_REASONS,
  TRANSFER_KINDS: TRANSFER_KINDS,
  searchInstances: searchInstances,
  instanceDetail: instanceDetail,
  updateInstance: updateInstance,
  searchRegistrations: searchRegistrations,
  register: register,
  findOrCreateInstance: findOrCreateInstance,
  endRegistration: endRegistration,
  searchTransfers: searchTransfers,
  requestTransfer: requestTransfer,
  transitionTransfer: transitionTransfer
};
