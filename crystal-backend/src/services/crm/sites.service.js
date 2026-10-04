const db = require('../../config/db');
const audit = require('../audit.service');
const { transaction } = require('../../repositories/shared/transaction');
const { HttpError } = require('../../utils/response');

/**
 * SERVICE CENTRES (crm_service_center), and what actually happens at them.
 *
 * A site is one physical place whoever runs it - a Crystal service centre, a
 * vendor sales agency, a collection point, a partner shop. Crystal's
 * `agencies` stays the source of truth for the storefront's centre locator;
 * the CRM keeps its own row per site (linked by crystal_agency_id) because a
 * sales agency the storefront never lists is still somewhere a customer
 * collects a reserved phone.
 *
 * The ACTIVITY LOG is the fact table: one row per thing done at a site - a
 * repair taken in, a device sold, an app installed, a prize handed over. Some
 * rows are written by the CRM itself (a reservation collected, an award
 * picked up, a registration done at the counter, the Crystal ticket import);
 * the rest are recorded here by the site. TARGETS are set per site and
 * activity for a period and read against the log.
 */

const PAGE = '/admin/crm/sites';
const ACTIVITY_PAGE = '/admin/crm/site-activity';

const KINDS = ['SERVICE_CENTER', 'SALES_AGENCY', 'COLLECTION_POINT', 'PARTNER_SHOP', 'OFFICE', 'EVENT_VENUE'];
const SITE_COLUMNS = ['service_center_code', 'service_center_name', 'service_center_kind', 'operator_party_id', 'location_pk',
  'address_line', 'landmark', 'map_position', 'rating', 'status', 'opened_on', 'closed_on'];
const EVENT_TYPES = ['PROMOTION_DAY', 'PRODUCT_LAUNCH', 'ROADSHOW', 'TRAINING', 'INSPECTION', 'PROGRAM_PICKUP_DAY', 'COMMUNITY_EVENT'];
const EVENT_STATUS = ['PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const EVENT_COLUMNS = ['service_center_id', 'event_type_code', 'title', 'description', 'project_id',
  'activity_program_id', 'campaign_id', 'planned_start_at', 'planned_end_at', 'actual_start_at',
  'actual_end_at', 'capacity', 'attendee_count', 'status', 'owner_manager_id', 'outcome_note'];

function pick(body, columns) {
  const out = {};
  columns.forEach(function (column) { if (body[column] !== undefined) out[column] = body[column] === '' ? null : body[column]; });
  return out;
}

/* ------------------------------------------------------------ sites */

function siteQuery(filters) {
  const qb = db('crm_service_center as center')
    .leftJoin('crm_location as place', 'place.location_pk', 'center.location_pk')
    .leftJoin('crm_party as operator_party', 'operator_party.party_id', 'center.operator_party_id')
    .leftJoin('crm_project as project', 'project.project_id', 'center.source_project_id');
  if (filters.service_center_kind) qb.where('center.service_center_kind', filters.service_center_kind);
  if (filters.status) qb.where('center.status', filters.status);
  if (filters.location_pk) qb.where('center.location_pk', filters.location_pk);
  if (filters.q) {
    const like = '%' + String(filters.q).trim() + '%';
    qb.where(function () {
      this.where('center.service_center_code', 'ilike', like).orWhere('center.service_center_name', 'ilike', like)
        .orWhere('center.address_line', 'ilike', like);
    });
  }
  return qb;
}

async function searchSites(filters, paging) {
  const count = await siteQuery(filters).count({ total: '*' }).first();
  const sort = {
    service_center_code: 'center.service_center_code',
    service_center_name: 'center.service_center_name',
    rating: 'center.rating'
  }[paging.sort] || 'center.service_center_name';
  const rows = await siteQuery(filters)
    .select('center.*', 'place.location_name as area_name', 'operator_party.display_name as operator_name',
      'project.project_code as source_project_code',
      db.raw(`(SELECT string_agg(DISTINCT capability.capability_code, ',') FROM crm_service_center_capability capability
                WHERE capability.service_center_id = center.service_center_id AND capability.is_active) AS capabilities`),
      db.raw(`(SELECT COUNT(*) FROM crm_service_center_activity activity
                WHERE activity.service_center_id = center.service_center_id AND activity.status = 'COMPLETED'
                  AND activity.occurred_at >= now() - interval '30 days')::int AS activity_30d`))
    .orderBy(sort, paging.dir).limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.total) };
}

/** Every active site, for a picker. */
function siteOptions() {
  return db('crm_service_center').whereNot('status', 'CLOSED')
    .orderBy('service_center_name').limit(2000)
    .select('service_center_id', 'service_center_code', 'service_center_name', 'service_center_kind');
}

async function siteDetail(id) {
  const site = await siteQuery({}).where('center.service_center_id', id)
    .first('center.*', 'place.location_name as area_name', 'operator_party.display_name as operator_name',
      'project.project_code as source_project_code');
  if (!site) throw new HttpError(404, 'common.notFound');

  const [capabilities, programs] = await Promise.all([
    db('crm_service_center_capability as capability')
      .leftJoin('crm_project as project', 'project.project_id', 'capability.project_id')
      .where('capability.service_center_id', id)
      .orderBy([{ column: 'capability.is_active', order: 'desc' }, { column: 'capability.capability_code' }])
      .select('capability.*', 'project.project_code'),
    db('crm_activity_program_service_center as program_center')
      .join('crm_activity_program as program', 'program.activity_program_id', 'program_center.activity_program_id')
      .where('program_center.service_center_id', id).orderBy('program.activity_program_id', 'desc').limit(20)
      .select('program.activity_program_id', 'program.program_code', 'program.program_name', 'program.status',
        'program_center.service_center_role')
  ]);
  return { site: site, capabilities: capabilities, programs: programs };
}

async function saveSite(id, body, actor) {
  const data = pick(body, SITE_COLUMNS);
  if (data.service_center_kind && KINDS.indexOf(data.service_center_kind) === -1) throw new HttpError(400, 'crm.chooseASiteKind');

  if (id) {
    const before = await db('crm_service_center').where('service_center_id', id).first();
    if (!before) throw new HttpError(404, 'common.notFound');
    if (!Object.keys(data).length) throw new HttpError(400, 'common.nothingToUpdate');
    const [after] = await db('crm_service_center').where('service_center_id', id).update(data).returning('*');
    audit.updated(actor, 'crm_service_center', id, before, after, PAGE);
    return after;
  }

  if (!data.service_center_code || !data.service_center_name || !data.service_center_kind) {
    throw new HttpError(400, 'crm.codeNameAndKindAreRequired');
  }
  const [row] = await db('crm_service_center').insert(data).returning('*');
  audit.created(actor, 'crm_service_center', row.service_center_id, row, PAGE);
  return row;
}

async function addCapability(siteId, body, actor) {
  if (!body.capability_code) throw new HttpError(400, 'crm.aCapabilityIsRequired');
  const [row] = await db('crm_service_center_capability').insert({
    service_center_id: siteId,
    project_id: body.project_id || null,
    capability_code: String(body.capability_code).trim().toUpperCase(),
    crystal_section: body.crystal_section || null,
    valid_from: body.valid_from || null,
    valid_to: body.valid_to || null
  }).returning('*');
  audit.created(actor, 'crm_service_center_capability', row.capability_id, row, PAGE);
  return row;
}

async function endCapability(siteId, capabilityId, actor) {
  const before = await db('crm_service_center_capability').where({ capability_id: capabilityId, service_center_id: siteId }).first();
  if (!before) throw new HttpError(404, 'common.notFound');
  const [after] = await db('crm_service_center_capability').where('capability_id', capabilityId)
    .update({ is_active: false, valid_to: db.raw('COALESCE(valid_to, CURRENT_DATE)') }).returning('*');
  audit.updated(actor, 'crm_service_center_capability', capabilityId, before, after, PAGE);
  return after;
}

/* ------------------------------------------------------------ activity log */

function activityQuery(filters) {
  const qb = db('crm_service_center_activity as activity')
    .join('crm_service_center_activity_type as activity_type', 'activity_type.activity_type_id', 'activity.activity_type_id')
    .join('crm_service_center as center', 'center.service_center_id', 'activity.service_center_id')
    .leftJoin('crm_party as party', 'party.party_id', 'activity.party_id')
    .leftJoin('crm_project as project', 'project.project_id', 'activity.project_id')
    .leftJoin('managers as manager', 'manager.id', 'activity.performed_by_manager_id');

  if (filters.service_center_id) qb.where('activity.service_center_id', filters.service_center_id);
  if (filters.activity_type_id) qb.where('activity.activity_type_id', filters.activity_type_id);
  if (filters.status) qb.where('activity.status', filters.status);
  if (filters.from) qb.where('activity.occurred_at', '>=', filters.from);
  if (filters.to) qb.where('activity.occurred_at', '<', db.raw("?::date + 1", [filters.to]));
  if (filters.q) {
    const like = '%' + String(filters.q).trim() + '%';
    qb.where(function () {
      this.where('center.service_center_name', 'ilike', like).orWhere('party.display_name', 'ilike', like)
        .orWhere('activity.note', 'ilike', like);
    });
  }
  return qb;
}

async function searchActivities(filters, paging) {
  const count = await activityQuery(filters).count({ total: '*' }).first();
  const rows = await activityQuery(filters)
    .select('activity.*', 'activity_type.activity_code', 'activity_type.activity_name', 'activity_type.activity_group',
      'center.service_center_code', 'center.service_center_name',
      'party.party_id', 'party.display_name as party_name', 'project.project_code', 'manager.name as manager_name')
    .orderBy([{ column: 'activity.occurred_at', order: paging.dir }, { column: 'activity.service_center_activity_id', order: paging.dir }])
    .limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.total) };
}

/**
 * Something done at a site, recorded by the site.
 *
 * If the activity type needs a capability, the site has to hold it: a
 * collection point cannot record a repair it is not equipped to do, and a
 * target report built on that row would be wrong in a way nobody notices.
 */
async function recordActivity(body, actor) {
  if (!body.service_center_id || !body.activity_type_id) throw new HttpError(400, 'crm.siteAndActivityAreRequired');

  const type = await db('crm_service_center_activity_type').where('activity_type_id', body.activity_type_id).first();
  if (!type || !type.is_active) throw new HttpError(400, 'crm.unknownActivity');

  if (type.required_capability_code) {
    const holds = await db('crm_service_center_capability')
      .where({ service_center_id: body.service_center_id, capability_code: type.required_capability_code, is_active: true })
      .first();
    if (!holds) throw new HttpError(409, 'crm.thisSiteCannotDoThat', null, { capability: type.required_capability_code });
  }

  const amount = body.amount === '' || body.amount === undefined ? null : body.amount;
  const [row] = await db('crm_service_center_activity').insert({
    service_center_id: body.service_center_id,
    activity_type_id: type.activity_type_id,
    project_id: body.project_id || null,
    service_center_event_id: body.service_center_event_id || null,
    occurred_at: body.occurred_at || db.fn.now(),
    party_id: body.party_id || null,
    performed_by_manager_id: actor.manager_id,
    quantity: body.quantity === undefined || body.quantity === '' ? 1 : body.quantity,
    amount: type.counts_amount ? amount : null,
    currency_code: type.counts_amount && amount !== null ? (body.currency_code || 'USD') : null,
    related_product_instance_id: body.related_product_instance_id || null,
    note: body.note ? String(body.note).slice(0, 500) : null
  }).returning('*');

  audit.created(actor, 'crm_service_center_activity', row.service_center_activity_id, row, ACTIVITY_PAGE);
  return row;
}

/** A row recorded in error is reversed, never deleted - the target report reads the status. */
async function reverseActivity(id, note, actor) {
  const before = await db('crm_service_center_activity').where('service_center_activity_id', id).first();
  if (!before) throw new HttpError(404, 'common.notFound');
  if (before.status !== 'COMPLETED') throw new HttpError(409, 'crm.alreadyReversed');

  const [after] = await db('crm_service_center_activity').where('service_center_activity_id', id).update({
    status: 'REVERSED',
    note: [before.note, note].filter(Boolean).join(' | ').slice(0, 500) || null
  }).returning('*');
  audit.updated(actor, 'crm_service_center_activity', id, before, after, ACTIVITY_PAGE);
  return after;
}

/* ------------------------------------------------------------ events */

async function searchEvents(filters, paging) {
  const qb = function () {
    const query = db('crm_service_center_event as center_event')
      .join('crm_service_center as center', 'center.service_center_id', 'center_event.service_center_id')
      .leftJoin('crm_activity_program as program', 'program.activity_program_id', 'center_event.activity_program_id')
      .leftJoin('crm_campaign as campaign', 'campaign.campaign_id', 'center_event.campaign_id')
      .leftJoin('managers as manager', 'manager.id', 'center_event.owner_manager_id');
    if (filters.service_center_id) query.where('center_event.service_center_id', filters.service_center_id);
    if (filters.status) query.where('center_event.status', filters.status);
    if (filters.upcoming === '1') query.where('center_event.planned_end_at', '>=', db.fn.now());
    if (filters.q) {
      const like = '%' + String(filters.q).trim() + '%';
      query.where(function () {
        this.where('center_event.title', 'ilike', like).orWhere('center.service_center_name', 'ilike', like);
      });
    }
    return query;
  };
  const count = await qb().count({ total: '*' }).first();
  const rows = await qb()
    .select('center_event.*', 'center.service_center_name', 'program.program_name', 'campaign.campaign_name',
      'manager.name as owner_name',
      db.raw(`(SELECT COUNT(*) FROM crm_service_center_activity activity
                WHERE activity.service_center_event_id = center_event.service_center_event_id
                  AND activity.status = 'COMPLETED')::int AS activity_cnt`))
    .orderBy('center_event.planned_start_at', paging.dir).limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.total) };
}

async function saveEvent(id, body, actor) {
  const data = pick(body, EVENT_COLUMNS);
  if (data.event_type_code && EVENT_TYPES.indexOf(data.event_type_code) === -1) throw new HttpError(400, 'crm.chooseAnEventType');
  if (data.status && EVENT_STATUS.indexOf(data.status) === -1) throw new HttpError(400, 'crm.notAStatusYouCanSet');

  if (id) {
    const before = await db('crm_service_center_event').where('service_center_event_id', id).first();
    if (!before) throw new HttpError(404, 'common.notFound');
    const [after] = await db('crm_service_center_event').where('service_center_event_id', id).update(data).returning('*');
    audit.updated(actor, 'crm_service_center_event', id, before, after, ACTIVITY_PAGE);
    return after;
  }

  if (!data.owner_manager_id) data.owner_manager_id = actor.manager_id;
  const [row] = await db('crm_service_center_event').insert(data).returning('*');
  audit.created(actor, 'crm_service_center_event', row.service_center_event_id, row, ACTIVITY_PAGE);
  return row;
}

/* ------------------------------------------------------------ targets */

async function searchTargets(filters, paging) {
  const qb = function () {
    const query = db('v_crm_service_center_activity_progress as progress')
      .join('crm_service_center_activity_type as activity_type', 'activity_type.activity_type_id', 'progress.activity_type_id')
      .join('crm_service_center_activity_target as target',
        'target.service_center_activity_target_id', 'progress.service_center_activity_target_id');
    if (filters.service_center_id) query.where('progress.service_center_id', filters.service_center_id);
    if (filters.activity_type_id) query.where('progress.activity_type_id', filters.activity_type_id);
    if (filters.current === '1') {
      query.where('progress.period_end', '>=', db.raw('CURRENT_DATE')).where('progress.period_start', '<=', db.raw('CURRENT_DATE'));
    }
    if (filters.q) query.where('progress.service_center_name', 'ilike', '%' + String(filters.q).trim() + '%');
    return query;
  };
  const count = await qb().count({ total: '*' }).first();
  const rows = await qb()
    .select('progress.*', 'activity_type.activity_name', 'target.note', 'target.currency_code',
      db.raw(`CASE WHEN progress.target_amount > 0 THEN round(progress.actual_amount / progress.target_amount * 100, 1) END AS amount_pct`))
    .orderBy([{ column: 'progress.period_start', order: 'desc' }, { column: 'progress.service_center_name' }])
    .limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.total) };
}

async function saveTarget(id, body, actor) {
  const data = pick(body, ['service_center_id', 'activity_type_id', 'period_start', 'period_end',
    'target_quantity', 'target_amount', 'currency_code', 'note']);
  if (data.target_amount !== undefined && data.target_amount !== null && !data.currency_code) data.currency_code = 'USD';

  if (id) {
    const before = await db('crm_service_center_activity_target').where('service_center_activity_target_id', id).first();
    if (!before) throw new HttpError(404, 'common.notFound');
    const [after] = await db('crm_service_center_activity_target').where('service_center_activity_target_id', id)
      .update(data).returning('*');
    audit.updated(actor, 'crm_service_center_activity_target', id, before, after, ACTIVITY_PAGE);
    return after;
  }

  const [row] = await db('crm_service_center_activity_target')
    .insert(Object.assign(data, { set_by_manager_id: actor.manager_id })).returning('*');
  audit.created(actor, 'crm_service_center_activity_target', row.service_center_activity_target_id, row, ACTIVITY_PAGE);
  return row;
}

async function removeTarget(id, actor) {
  const before = await db('crm_service_center_activity_target').where('service_center_activity_target_id', id).first();
  if (!before) throw new HttpError(404, 'common.notFound');
  await transaction(function (trx) {
    return trx('crm_service_center_activity_target').where('service_center_activity_target_id', id).del();
  });
  audit.deleted(actor, 'crm_service_center_activity_target', id, before, ACTIVITY_PAGE);
}

module.exports = {
  PAGE: PAGE,
  ACTIVITY_PAGE: ACTIVITY_PAGE,
  searchSites: searchSites,
  siteOptions: siteOptions,
  siteDetail: siteDetail,
  saveSite: saveSite,
  addCapability: addCapability,
  endCapability: endCapability,
  searchActivities: searchActivities,
  recordActivity: recordActivity,
  reverseActivity: reverseActivity,
  searchEvents: searchEvents,
  saveEvent: saveEvent,
  searchTargets: searchTargets,
  saveTarget: saveTarget,
  removeTarget: removeTarget
};
