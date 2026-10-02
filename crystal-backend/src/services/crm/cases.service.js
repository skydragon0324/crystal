const db = require('../../config/db');
const audit = require('../audit.service');
const { transaction } = require('../../repositories/shared/transaction');
const { HttpError } = require('../../utils/response');

/**
 * SERVICE CASES: one summary per service event, whichever project ran it.
 *
 * A Crystal repair keeps living in repair_tickets, with its parts, its bench
 * time and its warranty claim - none of that moves here. What the CRM keeps is
 * the part every project's service has in common: who, what for, where, how
 * long, how it ended and how the customer felt. Tickets arrive through the
 * Crystal import; complaints, enquiries and other projects' cases can be
 * opened here directly.
 *
 * A case that came FROM a ticket is the ticket's summary, so its workflow
 * fields are not edited here - the ticket is where that work happens, and an
 * edit here would be overwritten by the next import. Its classification is
 * the CRM's own and stays editable.
 */

const PAGE = '/admin/crm/service-cases';

const CHANNELS = ['WALK_IN', 'MAIL_IN', 'ON_SITE', 'COURIER', 'PHONE', 'APP', 'WEB', 'AGENCY'];
const EDITABLE = ['service_location_id', 'service_priority_id', 'reception_channel_code',
  'related_product_instance_id', 'is_warranty', 'title', 'description', 'due_at',
  'total_cost', 'customer_paid_amount', 'currency_code', 'satisfaction_rating', 'first_response_at'];

function caseQuery(filters) {
  const qb = db('crm_service_case as s')
    .join('crm_party as p', 'p.party_id', 's.party_id')
    .join('crm_project as j', 'j.project_id', 's.project_id')
    .join('crm_service_case_type as ct', 'ct.case_type_id', 's.case_type_id')
    .join('crm_service_status as st', 'st.service_status_id', 's.service_status_id')
    .leftJoin('crm_service_priority as pr', 'pr.service_priority_id', 's.service_priority_id')
    .leftJoin('crm_service_location as l', 'l.service_location_id', 's.service_location_id')
    .leftJoin('crm_product_instance as i', 'i.product_instance_id', 's.related_product_instance_id')
    .leftJoin('crm_product_catalog as c', 'c.product_id', 'i.product_id')
    .leftJoin('crm_service_case_classification as k', 'k.case_id', 's.case_id');

  ['project_id', 'case_type_id', 'service_status_id', 'service_location_id', 'party_id'].forEach(function (col) {
    if (filters[col]) qb.where('s.' + col, filters[col]);
  });
  if (filters.open === '1') qb.where('st.is_terminal', false);
  if (filters.overdue === '1') qb.where('st.is_terminal', false).where('s.due_at', '<', db.fn.now());
  if (filters.unclassified === '1') qb.whereNull('k.service_case_classification_id');
  if (filters.q) {
    const like = '%' + String(filters.q).trim() + '%';
    qb.where(function () {
      this.where('s.external_case_id', 'ilike', like)
        .orWhere('s.title', 'ilike', like)
        .orWhere('p.display_name', 'ilike', like)
        .orWhere('p.party_no', 'ilike', like)
        .orWhere('i.serial_number', 'ilike', like);
    });
  }
  return qb;
}

const LIST_COLUMNS = [
  's.case_id', 's.party_id', 's.project_id', 's.external_case_id', 's.crystal_repair_ticket_id', 's.title',
  's.received_at', 's.due_at', 's.completed_at', 's.closed_at', 's.is_warranty', 's.satisfaction_rating',
  's.total_cost', 's.customer_paid_amount', 's.currency_code', 's.reception_channel_code',
  's.service_location_id', 's.case_type_id', 's.service_status_id', 's.service_priority_id',
  'p.party_no', 'p.display_name as party_name', 'j.project_code',
  'ct.case_type_code', 'ct.display_name as case_type_name',
  'st.status_code', 'st.display_name as status_name', 'st.is_terminal',
  'pr.priority_code', 'pr.priority_name', 'l.location_name',
  'i.external_product_instance_id', 'c.product_name',
  db.raw('(k.service_case_classification_id IS NOT NULL) AS is_classified')
];

async function search(filters, paging) {
  const count = await caseQuery(filters).count({ c: '*' }).first();
  const sort = { received_at: 's.received_at', due_at: 's.due_at', closed_at: 's.closed_at' }[paging.sort] || 's.received_at';
  const rows = await caseQuery(filters).select(LIST_COLUMNS)
    .orderBy(sort, paging.dir).limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.c) };
}

async function detail(id) {
  const row = await caseQuery({}).where('s.case_id', id).first(LIST_COLUMNS.concat([
    's.description', 's.first_response_at', 's.reopened_from_case_id', 's.related_product_instance_id',
    's.related_transaction_id', 's.source_created_at', 's.source_updated_at', 's.ingested_at',
    's.created_at', 's.updated_at'
  ]));
  if (!row) throw new HttpError(404, 'common.notFound');

  const [classification, activities] = await Promise.all([
    db('crm_service_case_classification as k')
      .leftJoin('crm_issue_category as ic', 'ic.issue_category_id', 'k.issue_category_id')
      .leftJoin('crm_fault_category as fc', 'fc.fault_category_id', 'k.fault_category_id')
      .leftJoin('crm_root_cause as rc', 'rc.root_cause_id', 'k.root_cause_id')
      .leftJoin('crm_resolution_category as rs', 'rs.resolution_category_id', 'k.resolution_category_id')
      .leftJoin('managers as m', 'm.id', 'k.classified_by_manager_id')
      .where('k.case_id', id)
      .first('k.*', 'ic.display_name as issue_name', 'fc.display_name as fault_name',
        'rc.display_name as root_cause_name', 'rs.display_name as resolution_name', 'm.name as classified_by_name'),
    db('crm_location_activity as a')
      .join('crm_location_activity_type as t', 't.activity_type_id', 'a.activity_type_id')
      .join('crm_service_location as l', 'l.service_location_id', 'a.service_location_id')
      .where('a.related_service_case_id', id).orderBy('a.occurred_at')
      .select('a.location_activity_id', 'a.occurred_at', 'a.status', 't.activity_name', 'l.location_name')
  ]);

  return { case: row, classification: classification || null, activities: activities };
}

async function create(body, actor) {
  if (!body.party_id || !body.case_type_id) throw new HttpError(400, 'crm.customerAndCaseTypeAreRequired');
  if (body.reception_channel_code && CHANNELS.indexOf(body.reception_channel_code) === -1) {
    throw new HttpError(400, 'crm.unknownChannel');
  }

  const status = body.service_status_id
    ? await db('crm_service_status').where('service_status_id', body.service_status_id).first()
    : await db('crm_service_status').orderBy('sequence_no').first();

  const insert = {
    party_id: body.party_id,
    project_id: body.project_id,
    case_type_id: body.case_type_id,
    service_status_id: status.service_status_id,
    received_at: body.received_at || db.fn.now(),
    external_case_id: body.external_case_id || null
  };
  EDITABLE.forEach(function (column) { if (body[column] !== undefined && body[column] !== '') insert[column] = body[column]; });
  if (!insert.project_id) throw new HttpError(400, 'crm.chooseAProject');

  const [row] = await db('crm_service_case').insert(insert).returning('*');
  audit.created(actor, 'crm_service_case', row.case_id, row, PAGE);
  return row;
}

/**
 * Status and details of a case opened HERE. A case that mirrors a Crystal
 * ticket is refused, and says where to go instead.
 */
async function update(id, body, actor) {
  const before = await db('crm_service_case').where('case_id', id).first();
  if (!before) throw new HttpError(404, 'common.notFound');
  if (before.crystal_repair_ticket_id) throw new HttpError(409, 'crm.thisCaseFollowsARepairTicket');

  const patch = {};
  EDITABLE.forEach(function (column) { if (body[column] !== undefined) patch[column] = body[column] === '' ? null : body[column]; });

  if (body.service_status_id && String(body.service_status_id) !== String(before.service_status_id)) {
    const status = await db('crm_service_status').where('service_status_id', body.service_status_id).first();
    if (!status) throw new HttpError(400, 'crm.unknownStatus');
    patch.service_status_id = status.service_status_id;
    if (status.is_terminal) {
      patch.closed_at = db.fn.now();
      if (status.status_code === 'CLOSED' && !before.completed_at) patch.completed_at = db.fn.now();
    } else {
      patch.closed_at = null;
    }
    if (!before.first_response_at) patch.first_response_at = db.fn.now();
  }
  if (!Object.keys(patch).length) throw new HttpError(400, 'common.nothingToUpdate');

  const [after] = await db('crm_service_case').where('case_id', id).update(patch).returning('*');
  audit.updated(actor, 'crm_service_case', id, before, after, PAGE);
  return after;
}

/** The CRM's own reading of a case: what was reported, what was found, why, and what fixed it. */
async function classify(id, body, actor) {
  const found = await db('crm_service_case').where('case_id', id).first();
  if (!found) throw new HttpError(404, 'common.notFound');

  const values = {
    issue_category_id: body.issue_category_id || null,
    fault_category_id: body.fault_category_id || null,
    root_cause_id: body.root_cause_id || null,
    resolution_category_id: body.resolution_category_id || null,
    resolution_text: body.resolution_text || null,
    classified_at: db.fn.now(),
    classified_by_manager_id: actor.manager_id
  };

  const row = await transaction(async function (trx) {
    const current = await trx('crm_service_case_classification').where('case_id', id).forUpdate().first();
    if (current) {
      const rows = await trx('crm_service_case_classification').where('case_id', id).update(values).returning('*');
      return rows[0];
    }
    const rows = await trx('crm_service_case_classification').insert(Object.assign({ case_id: id }, values)).returning('*');
    return rows[0];
  });

  audit.updated(actor, 'crm_service_case_classification', row.service_case_classification_id, null, row, PAGE);
  return row;
}

module.exports = {
  PAGE: PAGE,
  search: search,
  detail: detail,
  create: create,
  update: update,
  classify: classify
};
