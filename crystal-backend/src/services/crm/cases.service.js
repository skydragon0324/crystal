const db = require('../../config/db');
const audit = require('../audit.service');
const { transaction } = require('../../repositories/shared/transaction');
const { HttpError } = require('../../utils/response');
const { searchId } = require('./partyId');

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
const EDITABLE = ['service_center_id', 'service_priority_id', 'reception_channel_code',
  'related_product_instance_id', 'is_warranty', 'title', 'description', 'due_at',
  'total_cost', 'customer_paid_amount', 'currency_code', 'satisfaction_rating', 'first_response_at'];

function caseQuery(filters) {
  const qb = db('crm_service_case as service_case')
    .join('crm_party as party', 'party.party_pk', 'service_case.party_pk')
    .join('crm_project as project', 'project.project_id', 'service_case.project_id')
    .join('crm_service_case_type as ct', 'ct.case_type_id', 'service_case.case_type_id')
    .join('crm_service_status as st', 'st.service_status_id', 'service_case.service_status_id')
    .leftJoin('crm_service_priority as pr', 'pr.service_priority_id', 'service_case.service_priority_id')
    .leftJoin('crm_service_center as center', 'center.service_center_id', 'service_case.service_center_id')
    .leftJoin('crm_product_instance as instance', 'instance.product_instance_id', 'service_case.related_product_instance_id')
    .leftJoin('crm_product_catalog as product', 'product.product_id', 'instance.product_id')
    .leftJoin('crm_service_case_classification as classification', 'classification.case_id', 'service_case.case_id');

  ['project_id', 'case_type_id', 'service_status_id', 'service_center_id', 'party_pk'].forEach(function (col) {
    if (filters[col]) qb.where('service_case.' + col, filters[col]);
  });
  if (filters.open === '1') qb.where('st.is_terminal', false);
  if (filters.overdue === '1') qb.where('st.is_terminal', false).where('service_case.due_at', '<', db.fn.now());
  if (filters.unclassified === '1') qb.whereNull('classification.service_case_classification_id');
  if (filters.q) {
    const like = '%' + String(filters.q).trim() + '%';
    qb.where(function () {
      this.where('service_case.external_case_id', 'ilike', like)
        .orWhere('service_case.title', 'ilike', like)
        .orWhere('party.display_name', 'ilike', like)
        .orWhereRaw('??::text ILIKE ?', ['party.party_pk', searchId(like)])
        .orWhere('instance.serial_number', 'ilike', like);
    });
  }
  return qb;
}

const LIST_COLUMNS = [
  'service_case.case_id', 'service_case.party_pk', 'service_case.project_id', 'service_case.external_case_id',
  'service_case.crystal_repair_ticket_id', 'service_case.title',
  'service_case.received_at', 'service_case.due_at', 'service_case.completed_at', 'service_case.closed_at',
  'service_case.is_warranty', 'service_case.satisfaction_rating',
  'service_case.total_cost', 'service_case.customer_paid_amount', 'service_case.currency_code', 'service_case.reception_channel_code',
  'service_case.service_center_id', 'service_case.case_type_id', 'service_case.service_status_id', 'service_case.service_priority_id',
  'party.party_pk', 'party.display_name as party_name', 'project.project_code',
  'ct.case_type_code', 'ct.display_name as case_type_name',
  'st.status_code', 'st.display_name as status_name', 'st.is_terminal',
  'pr.priority_code', 'pr.priority_name', 'center.service_center_name',
  'instance.external_product_instance_id', 'product.product_name',
  db.raw('(classification.service_case_classification_id IS NOT NULL) AS is_classified')
];

async function search(filters, paging) {
  const count = await caseQuery(filters).count({ total: '*' }).first();
  const sort = {
    received_at: 'service_case.received_at', due_at: 'service_case.due_at', closed_at: 'service_case.closed_at'
  }[paging.sort] || 'service_case.received_at';
  const rows = await caseQuery(filters).select(LIST_COLUMNS)
    .orderBy(sort, paging.dir).limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.total) };
}

async function detail(id) {
  const row = await caseQuery({}).where('service_case.case_id', id).first(LIST_COLUMNS.concat([
    'service_case.description', 'service_case.first_response_at', 'service_case.reopened_from_case_id',
    'service_case.related_product_instance_id', 'service_case.related_transaction_id',
    'service_case.source_created_at', 'service_case.source_updated_at', 'service_case.ingested_at',
    'service_case.created_at', 'service_case.updated_at'
  ]));
  if (!row) throw new HttpError(404, 'common.notFound');

  const [classification, activities] = await Promise.all([
    db('crm_service_case_classification as classification')
      .leftJoin('crm_issue_category as ic', 'ic.issue_category_id', 'classification.issue_category_id')
      .leftJoin('crm_fault_category as fc', 'fc.fault_category_id', 'classification.fault_category_id')
      .leftJoin('crm_root_cause as rc', 'rc.root_cause_id', 'classification.root_cause_id')
      .leftJoin('crm_resolution_category as rs', 'rs.resolution_category_id', 'classification.resolution_category_id')
      .leftJoin('managers as manager', 'manager.id', 'classification.classified_by_manager_id')
      .where('classification.case_id', id)
      .first('classification.*', 'ic.display_name as issue_name', 'fc.display_name as fault_name',
        'rc.display_name as root_cause_name', 'rs.display_name as resolution_name', 'manager.name as classified_by_name'),
    db('crm_service_center_activity as activity')
      .join('crm_service_center_activity_type as activity_type', 'activity_type.activity_type_id', 'activity.activity_type_id')
      .join('crm_service_center as center', 'center.service_center_id', 'activity.service_center_id')
      .where('activity.related_service_case_id', id).orderBy('activity.occurred_at')
      .select('activity.service_center_activity_id', 'activity.occurred_at', 'activity.status',
        'activity_type.activity_name', 'center.service_center_name')
  ]);

  return { case: row, classification: classification || null, activities: activities };
}

async function create(body, actor) {
  if (!body.party_pk || !body.case_type_id) throw new HttpError(400, 'crm.serviceCases.customerAndCaseTypeAreRequired');
  if (body.reception_channel_code && CHANNELS.indexOf(body.reception_channel_code) === -1) {
    throw new HttpError(400, 'crm.common.unknownChannel');
  }

  const status = body.service_status_id
    ? await db('crm_service_status').where('service_status_id', body.service_status_id).first()
    : await db('crm_service_status').orderBy('sequence_no').first();

  const insert = {
    party_pk: body.party_pk,
    project_id: body.project_id,
    case_type_id: body.case_type_id,
    service_status_id: status.service_status_id,
    received_at: body.received_at || db.fn.now(),
    external_case_id: body.external_case_id || null
  };
  EDITABLE.forEach(function (column) { if (body[column] !== undefined && body[column] !== '') insert[column] = body[column]; });
  if (!insert.project_id) throw new HttpError(400, 'crm.serviceCases.chooseAProject');

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
  if (before.crystal_repair_ticket_id) throw new HttpError(409, 'crm.serviceCases.thisCaseFollowsARepairTicket');

  const patch = {};
  EDITABLE.forEach(function (column) { if (body[column] !== undefined) patch[column] = body[column] === '' ? null : body[column]; });

  if (body.service_status_id && String(body.service_status_id) !== String(before.service_status_id)) {
    const status = await db('crm_service_status').where('service_status_id', body.service_status_id).first();
    if (!status) throw new HttpError(400, 'crm.serviceCases.unknownStatus');
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
