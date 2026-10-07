const crypto = require('crypto');
const db = require('../../config/db');
const vocabulary = require('../../repositories/crm/vocabulary.repository');
const ledger = require('./ledger');
const analysis = require('./analysis.service');
const audit = require('../audit.service');
const { transaction } = require('../../repositories/shared/transaction');
const { HttpError } = require('../../utils/response');
const { searchId } = require('./partyId');

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
  const qb = db('crm_product_instance as instance')
    .join('crm_product_catalog as product', 'product.product_id', 'instance.product_id')
    .join('crm_project as project', 'project.project_id', 'instance.project_id')
    .leftJoin('crm_product_class as product_class', 'product_class.product_class_id', 'product.product_class_id');

  if (filters.project_id) qb.where('instance.project_id', filters.project_id);
  if (filters.instance_kind) qb.where('instance.instance_kind', filters.instance_kind);
  if (filters.status) qb.where('instance.status', filters.status);
  if (filters.product_class_id) qb.where('product.product_class_id', filters.product_class_id);
  if (filters.q) {
    const like = '%' + String(filters.q).trim() + '%';
    qb.where(function () {
      this.where('instance.external_product_instance_id', 'ilike', like)
        .orWhere('instance.serial_number', 'ilike', like)
        .orWhere('instance.imei', 'ilike', like)
        .orWhere('product.product_name', 'ilike', like);
    });
  }
  return qb;
}

async function searchInstances(filters, paging) {
  const count = await instanceQuery(filters).count({ total: '*' }).first();
  const rows = await instanceQuery(filters)
    .select('instance.*', 'product.product_name', 'product.product_code', 'project.project_code',
      'product_class.class_code', 'product_class.class_name',
      db.raw(`(SELECT holder.display_name FROM crm_product_registration registration
                 JOIN crm_party holder ON holder.party_pk = registration.party_pk
                WHERE registration.product_instance_id = instance.product_instance_id AND registration.valid_to IS NULL
                  AND registration.relationship_code IN ('OWNER', 'LICENSEE') LIMIT 1) AS holder_name`),
      db.raw(`(SELECT COUNT(*) FROM crm_product_registration registration
                WHERE registration.product_instance_id = instance.product_instance_id)::int AS registration_cnt`))
    .orderBy(paging.sort === 'created_at' ? 'instance.created_at' : 'instance.product_instance_id', paging.dir)
    .limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.total) };
}

/** One instance, its whole holding history, the requests against it, and its service record. */
async function instanceDetail(id) {
  const instance = await instanceQuery({}).where('instance.product_instance_id', id)
    .leftJoin('crm_product_instance as bound_instance', 'bound_instance.product_instance_id', 'instance.bound_instance_id')
    .first('instance.*', 'product.product_name', 'product.product_code', 'project.project_code',
      'product_class.class_code', 'product_class.class_name', 'bound_instance.external_product_instance_id as bound_external_id');
  if (!instance) throw new HttpError(404, 'common.notFound');

  const [registrations, transfers, cases, licences] = await Promise.all([
    registrationQuery({}).where('registration.product_instance_id', id).orderBy('registration.valid_from', 'desc')
      .select(REGISTRATION_COLUMNS),
    transferQuery({}).where('transfer.product_instance_id', id).orderBy('transfer.requested_at', 'desc').select(TRANSFER_COLUMNS),
    db('crm_service_case as service_case')
      .join('crm_service_status as st', 'st.service_status_id', 'service_case.service_status_id')
      .join('crm_service_case_type as ct', 'ct.case_type_id', 'service_case.case_type_id')
      .where('service_case.related_product_instance_id', id).orderBy('service_case.received_at', 'desc').limit(50)
      .select('service_case.case_id', 'service_case.external_case_id', 'service_case.received_at', 'service_case.closed_at',
        'st.display_name as status_name', 'st.is_terminal', 'ct.display_name as case_type_name'),
    db('crm_product_instance as licence_instance')
      .join('crm_product_catalog as product', 'product.product_id', 'licence_instance.product_id')
      .where('licence_instance.bound_instance_id', id)
      .select('licence_instance.product_instance_id', 'licence_instance.external_product_instance_id',
        'licence_instance.status', 'licence_instance.valid_until', 'product.product_name')
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
  'registration.*', 'party.party_pk', 'party.display_name as party_name',
  'instance.external_product_instance_id', 'instance.serial_number', 'instance.imei', 'instance.instance_kind',
  'product.product_name', 'product.product_code', 'product_class.class_code', 'product_class.class_name',
  'project.project_code', 'relationship_type.relationship_name', 'center.service_center_name as registered_at_location_name',
  'pv.display_name as previous_owner_name'
];

function registrationQuery(filters) {
  const qb = db('crm_product_registration as registration')
    .join('crm_party as party', 'party.party_pk', 'registration.party_pk')
    .join('crm_product_instance as instance', 'instance.product_instance_id', 'registration.product_instance_id')
    .join('crm_product_catalog as product', 'product.product_id', 'instance.product_id')
    .join('crm_project as project', 'project.project_id', 'registration.project_id')
    .leftJoin('crm_product_class as product_class', 'product_class.product_class_id', 'product.product_class_id')
    .leftJoin('crm_product_relationship_type as relationship_type',
      'relationship_type.relationship_type_id', 'registration.relationship_type_id')
    .leftJoin('crm_service_center as center', 'center.service_center_id', 'registration.registered_at_service_center_id')
    .leftJoin('crm_party as pv', 'pv.party_pk', 'registration.previous_owner_party_pk');

  if (filters.project_id) qb.where('registration.project_id', filters.project_id);
  if (filters.relationship_code) qb.where('registration.relationship_code', filters.relationship_code);
  if (filters.registration_status) qb.where('registration.registration_status', filters.registration_status);
  if (filters.product_class_id) qb.where('product.product_class_id', filters.product_class_id);
  if (filters.party_pk) qb.where('registration.party_pk', filters.party_pk);
  if (filters.current === '1' || filters.current === 1 || filters.current === true) qb.whereNull('registration.valid_to');
  if (filters.q) {
    const like = '%' + String(filters.q).trim() + '%';
    qb.where(function () {
      this.where('instance.external_product_instance_id', 'ilike', like)
        .orWhere('instance.serial_number', 'ilike', like)
        .orWhere('instance.imei', 'ilike', like)
        .orWhere('party.display_name', 'ilike', like)
        .orWhereRaw('??::text ILIKE ?', ['party.party_pk', searchId(like)])
        .orWhere('product.product_name', 'ilike', like);
    });
  }
  return qb;
}

async function searchRegistrations(filters, paging) {
  const count = await registrationQuery(filters).count({ total: '*' }).first();
  const sort = {
    registered_at: 'registration.registered_at', valid_from: 'registration.valid_from', valid_to: 'registration.valid_to'
  }[paging.sort] || 'registration.product_registration_id';
  const rows = await registrationQuery(filters).select(REGISTRATION_COLUMNS)
    .orderBy(sort, paging.dir).limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.total) };
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
  if (!body.party_pk) throw new HttpError(400, 'crm.chooseACustomer');

  const relationship = await db('crm_product_relationship_type')
    .where('relationship_code', body.relationship_code || 'OWNER').first();
  if (!relationship) throw new HttpError(400, 'crm.unknownRelationship');

  const channel = body.registration_channel || 'CONSOLE';
  if (CHANNELS.indexOf(channel) === -1) throw new HttpError(400, 'crm.unknownChannel');

  const result = await transaction(async function (trx) {
    const party = await trx('crm_party').where('party_pk', body.party_pk).first();
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
      const holder = await trx('crm_product_registration as registration')
        .join('crm_party as party', 'party.party_pk', 'registration.party_pk')
        .where('registration.product_instance_id', instance.product_instance_id)
        .whereIn('registration.relationship_code', ['OWNER', 'LICENSEE'])
        .whereNull('registration.valid_to')
        .first('party.party_pk', 'party.display_name');
      if (holder) {
        throw new HttpError(409, 'crm.thisProductAlreadyHasAnOwner', null, {
          holder: (holder.display_name || '') + ' (' + holder.party_pk + ')'
        });
      }
    }

    // The database's clock, as endRegistration uses for valid_to: an app-server
    // clock running ahead would put valid_from after a valid_to written moments
    // later and trip chk_crm_reg_period.
    const now = trx.fn.now();
    const [registration] = await trx('crm_product_registration').insert({
      party_pk: party.party_pk,
      product_instance_id: instance.product_instance_id,
      relationship_type_id: relationship.relationship_type_id,
      relationship_code: relationship.relationship_code,
      project_id: body.project_id || instance.project_id,
      registration_channel: channel,
      registered_at_service_center_id: body.registered_at_service_center_id || null,
      purchase_purpose_id: body.purchase_purpose_id || null,
      usage_type_id: body.usage_type_id || null,
      acquisition_type_id: body.acquisition_type_id || null,
      previous_owner_party_pk: body.previous_owner_party_pk || null,
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
    if (registration.registered_at_service_center_id && channel === 'AGENCY') {
      const typeId = await vocabulary.idOf('crm_service_center_activity_type', 'REGISTRATION_ASSIST', trx);
      if (typeId) {
        await trx('crm_service_center_activity').insert({
          service_center_id: registration.registered_at_service_center_id,
          activity_type_id: typeId,
          project_id: registration.project_id,
          occurred_at: registration.registered_at,
          party_pk: party.party_pk,
          performed_by_manager_id: actor ? actor.manager_id : null,
          related_product_instance_id: instance.product_instance_id,
          external_activity_id: 'registration:' + registration.product_registration_id
        });
      }
    }

    return { registration: registration, instance: instance, point_event: pointEvent };
  });

  if (!opts.skipStats) await analysis.recalculateClassStats({ partyIds: [body.party_pk] });
  audit.created(actor, 'crm_product_registration', result.registration.product_registration_id, result.registration, PAGE);
  return result;
}

async function payRegistrationPoints(trx, registration, instance, product, actor) {
  const rule = await registrationRule(trx, product, registration.project_id);
  if (!rule) return null;

  const paid = await trx('crm_point_event as point_event')
    .join('crm_product_registration as registration',
      'registration.product_registration_id', 'point_event.related_product_registration_id')
    .where('point_event.point_rule_id', rule.point_rule_id)
    .where('registration.product_instance_id', instance.product_instance_id)
    .first('point_event.point_event_id');
  if (paid) return null;

  return ledger.post(trx, {
    party_pk: registration.party_pk,
    point_type_id: rule.point_type_id,
    event_code: 'EARN',
    points_delta: Number(rule.points),
    point_rule_id: rule.point_rule_id,
    project_id: registration.project_id,
    related_product_registration_id: registration.product_registration_id,
    performed_by_service_center_id: registration.registered_at_service_center_id,
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
    await analysis.recalculateClassStats({ partyIds: [done.after.party_pk] });
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
  'transfer.*', 'instance.external_product_instance_id', 'instance.serial_number', 'instance.instance_kind', 'product.product_name',
  'from_party.display_name as from_name',
  'to_party.display_name as to_name',
  'ti.external_product_instance_id as to_instance_external_id',
  'center.service_center_name as handled_at_location_name', 'manager.name as requested_by_manager_name'
];

function transferQuery(filters) {
  const qb = db('crm_product_transfer as transfer')
    .join('crm_product_instance as instance', 'instance.product_instance_id', 'transfer.product_instance_id')
    .join('crm_product_catalog as product', 'product.product_id', 'instance.product_id')
    .leftJoin('crm_party as from_party', 'from_party.party_pk', 'transfer.from_party_pk')
    .leftJoin('crm_party as to_party', 'to_party.party_pk', 'transfer.to_party_pk')
    .leftJoin('crm_product_instance as ti', 'ti.product_instance_id', 'transfer.to_instance_id')
    .leftJoin('crm_service_center as center', 'center.service_center_id', 'transfer.handled_at_service_center_id')
    .leftJoin('managers as manager', 'manager.id', 'transfer.requested_by_manager_id');

  if (filters.status) qb.where('transfer.status', filters.status);
  if (filters.transfer_kind) qb.where('transfer.transfer_kind', filters.transfer_kind);
  if (filters.open === '1') qb.whereIn('transfer.status', ['REQUESTED', 'ACCEPTED']);
  if (filters.q) {
    const like = '%' + String(filters.q).trim() + '%';
    qb.where(function () {
      this.where('instance.external_product_instance_id', 'ilike', like)
        .orWhere('instance.serial_number', 'ilike', like)
        .orWhere('from_party.display_name', 'ilike', like)
        .orWhere('to_party.display_name', 'ilike', like)
        .orWhereRaw('??::text ILIKE ?', ['from_party.party_pk', searchId(like)])
        .orWhereRaw('??::text ILIKE ?', ['to_party.party_pk', searchId(like)]);
    });
  }
  return qb;
}

async function searchTransfers(filters, paging) {
  const count = await transferQuery(filters).count({ total: '*' }).first();
  const rows = await transferQuery(filters).select(TRANSFER_COLUMNS)
    .orderBy(paging.sort === 'completed_at' ? 'transfer.completed_at' : 'transfer.requested_at', paging.dir)
    .limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.total) };
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

  let fromPartyId = body.from_party_pk || null;
  if (effect.close || body.transfer_kind === 'ASSIGN_USER' || body.transfer_kind === 'LEASE_START') {
    const code = effect.close || 'OWNER';
    const current = await db('crm_product_registration')
      .where({ product_instance_id: instance.product_instance_id, relationship_code: code })
      .whereNull('valid_to')
      .modify(function (qb) { if (fromPartyId && effect.close) qb.where('party_pk', fromPartyId); })
      .orderBy('valid_from', 'desc').first();
    if (!current && effect.close) throw new HttpError(409, 'crm.nobodyHoldsItThatWay');
    fromPartyId = current ? current.party_pk : null;
  }

  if (body.transfer_kind === 'LICENCE_REBIND') {
    if (instance.instance_kind !== 'LICENCE') throw new HttpError(409, 'crm.onlyALicenceCanBeRebound');
    if (!body.to_instance_id) throw new HttpError(400, 'crm.chooseTheNewDevice');
  }
  if (effect.open && !body.to_party_pk) throw new HttpError(400, 'crm.chooseWhoReceivesIt');

  const [row] = await db('crm_product_transfer').insert({
    product_instance_id: instance.product_instance_id,
    transfer_kind: body.transfer_kind,
    from_party_pk: fromPartyId,
    to_party_pk: body.to_party_pk || null,
    to_instance_id: body.to_instance_id || null,
    acquisition_type_id: body.acquisition_type_id || null,
    requested_by_type: 'MANAGER',
    requested_by_manager_id: actor.manager_id,
    handled_at_service_center_id: body.handled_at_service_center_id || null,
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
          .modify(function (qb) { if (transfer.from_party_pk) qb.where('party_pk', transfer.from_party_pk); })
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
          party_pk: transfer.to_party_pk,
          product_instance_id: transfer.product_instance_id,
          relationship_type_id: relationship.relationship_type_id,
          relationship_code: relationship.relationship_code,
          project_id: instance.project_id,
          registration_channel: 'TRANSFER',
          registered_at_service_center_id: transfer.handled_at_service_center_id,
          acquisition_type_id: acquisition,
          previous_owner_party_pk: effect.open === 'OWNER' ? transfer.from_party_pk : null,
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
    const parties = [result.after.from_party_pk, result.after.to_party_pk].filter(Boolean);
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
