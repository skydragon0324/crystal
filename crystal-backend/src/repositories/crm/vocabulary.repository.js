const db = require('../../config/db');

/**
 * THE CRM'S WORD LISTS, looked up by code.
 *
 * The design keys every vocabulary by a surrogate id and gives each row a
 * stable code - `CRYSTAL`, `OWNER`, `EARN`. Code that means "the Crystal
 * project" says the code and asks for the id here, rather than carrying an id
 * that is only true for the database it was read from: the seed values are
 * identity columns, and two installs number them differently.
 *
 * Not cached. A lookup is one indexed read, the lists are edited from the
 * console, and a cache would have to be told when that happens.
 */

/* table -> [id column, code column] */
const LISTS = {
  crm_project: ['project_id', 'project_code'],
  crm_currency: ['currency_code', 'currency_code'],
  crm_product_class: ['product_class_id', 'class_code'],
  crm_product_relationship_type: ['relationship_type_id', 'relationship_code'],
  crm_acquisition_type: ['acquisition_type_id', 'acquisition_code'],
  crm_purchase_purpose: ['purchase_purpose_id', 'purpose_code'],
  crm_product_usage_type: ['usage_type_id', 'usage_code'],
  crm_point_type: ['point_type_id', 'point_type_code'],
  crm_point_event_type: ['point_event_type_id', 'event_code'],
  crm_service_case_type: ['case_type_id', 'case_type_code'],
  crm_service_status: ['service_status_id', 'status_code'],
  crm_service_priority: ['service_priority_id', 'priority_code'],
  crm_location_activity_type: ['activity_type_id', 'activity_code'],
  crm_communication_channel: ['channel_id', 'channel_code'],
  crm_communication_purpose: ['purpose_id', 'purpose_code']
};

/** The id for one code, or null. */
async function idOf(list, code, trx) {
  const cols = LISTS[list];
  if (!cols) throw new Error('not a CRM vocabulary: ' + list);
  if (code === null || code === undefined || code === '') return null;

  const row = await (trx || db)(list).where(cols[1], code).first(cols[0] + ' as id');
  return row ? row.id : null;
}

/** The code for one id, or null. */
async function codeOf(list, id, trx) {
  const cols = LISTS[list];
  if (!cols) throw new Error('not a CRM vocabulary: ' + list);
  if (id === null || id === undefined || id === '') return null;

  const row = await (trx || db)(list).where(cols[0], id).first(cols[1] + ' as code');
  return row ? row.code : null;
}

/** code -> id for the whole list, for the importers that map a column at a time. */
async function mapOf(list, trx) {
  const cols = LISTS[list];
  const rows = await (trx || db)(list).select(cols[0] + ' as id', cols[1] + ' as code');
  const out = {};
  rows.forEach(function (row) { out[row.code] = row.id; });
  return out;
}

/**
 * EVERY LIST THE CONSOLE'S CRM SCREENS OFFER, in one read.
 *
 * Twenty small tables that change a few times a year, and nearly every CRM
 * form needs five of them. One round trip on the screen's first render is
 * cheaper than twenty, and far cheaper than twenty per form.
 */
async function all() {
  const tableOf = function (name) { return db(name); };

  const [
    projects, currencies, classes, relationships, acquisitions, purposes, usages,
    pointTypes, pointEventTypes, caseTypes, statuses, priorities, issues, faults,
    rootCauses, resolutions, activityTypes, tiers, grades, channels, commPurposes,
    orgTypes, contactRoles, departments, industries, metrics, areas, tags, partyRelationshipTypes, staff
  ] = await Promise.all([
    tableOf('crm_project').orderBy('project_id'),
    tableOf('crm_currency').orderBy('currency_code'),
    tableOf('crm_product_class').orderBy([{ column: 'product_domain' }, { column: 'rank_no', order: 'desc' }, { column: 'class_code' }]),
    tableOf('crm_product_relationship_type').orderBy('relationship_type_id'),
    tableOf('crm_acquisition_type').orderBy('acquisition_type_id'),
    tableOf('crm_purchase_purpose').orderBy('purchase_purpose_id'),
    tableOf('crm_product_usage_type').orderBy('usage_type_id'),
    tableOf('crm_point_type').orderBy('point_type_id'),
    tableOf('crm_point_event_type').orderBy('point_event_type_id'),
    tableOf('crm_service_case_type').orderBy('case_type_id'),
    tableOf('crm_service_status').orderBy('sequence_no'),
    tableOf('crm_service_priority').orderBy('rank_no'),
    tableOf('crm_issue_category').orderBy('display_name'),
    tableOf('crm_fault_category').orderBy('display_name'),
    tableOf('crm_root_cause').orderBy('display_name'),
    tableOf('crm_resolution_category').orderBy('display_name'),
    tableOf('crm_location_activity_type').orderBy('activity_type_id'),
    tableOf('crm_project_tier').orderBy([{ column: 'project_id' }, { column: 'rank_no' }]),
    tableOf('crm_corporate_grade').orderBy('rank_no'),
    tableOf('crm_communication_channel').orderBy('channel_id'),
    tableOf('crm_communication_purpose').orderBy('purpose_id'),
    tableOf('crm_organization_type').orderBy('organization_type_id'),
    tableOf('crm_org_contact_role').orderBy('contact_role_id'),
    tableOf('crm_department').orderBy('department_name'),
    tableOf('crm_industry').orderBy('industry_name'),
    tableOf('crm_metric_definition').orderBy('metric_code'),
    tableOf('crm_location').whereIn('location_type', ['COUNTRY', 'PROVINCE']).orderBy('location_name').limit(500),
    tableOf('crm_tag').where('is_active', true).orderBy('tag_name'),
    tableOf('crm_party_relationship_type').where('is_active', true).orderBy('sort_order'),
    /* Who can be put in a customer's account team: names only, never anything about the account itself. */
    db('managers').where({ is_deleted: false, status: 'ACTIVE' }).orderBy('name').select('id as manager_id', 'name')
  ]);

  return {
    projects: projects,
    currencies: currencies,
    product_classes: classes,
    relationship_types: relationships,
    acquisition_types: acquisitions,
    purchase_purposes: purposes,
    usage_types: usages,
    point_types: pointTypes,
    point_event_types: pointEventTypes,
    case_types: caseTypes,
    service_statuses: statuses,
    priorities: priorities,
    issue_categories: issues,
    fault_categories: faults,
    root_causes: rootCauses,
    resolution_categories: resolutions,
    activity_types: activityTypes,
    project_tiers: tiers,
    corporate_grades: grades,
    channels: channels,
    communication_purposes: commPurposes,
    organization_types: orgTypes,
    contact_roles: contactRoles,
    departments: departments,
    industries: industries,
    metric_definitions: metrics,
    areas: areas,
    tags: tags,
    party_relationship_types: partyRelationshipTypes,
    staff: staff
  };
}

module.exports = {
  LISTS: LISTS,
  idOf: idOf,
  codeOf: codeOf,
  mapOf: mapOf,
  all: all
};
