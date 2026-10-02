const db = require('../../config/db');

/**
 * Reading what the analysis run wrote - design sections 3.7 and 3.8.
 *
 * The run keeps one snapshot per party, scope and reference date; screens
 * almost always want the LATEST reference date, so every list defaults to it
 * and can be pointed at an earlier one to compare.
 */

async function latestDate() {
  const row = await db('crm_party_analysis_snapshot').max({ d: 'reference_date' }).first();
  return row && row.d ? String(row.d).slice(0, 10) : null;
}

async function dates() {
  const rows = await db('crm_party_analysis_snapshot').distinct('reference_date').orderBy('reference_date', 'desc').limit(60);
  return rows.map(function (row) { return String(row.reference_date).slice(0, 10); });
}

function snapshotQuery(filters, date) {
  const qb = db('crm_party_analysis_snapshot as s')
    .join('crm_party as p', 'p.party_id', 's.party_id')
    .leftJoin('crm_project as j', 'j.project_id', 's.project_id')
    .leftJoin('crm_corporate_grade as g', 'g.corporate_grade_id', 's.corporate_grade_id')
    .where('s.reference_date', date);
  if (filters.scope === 'project') {
    qb.whereNotNull('s.project_id');
    if (filters.project_id) qb.where('s.project_id', filters.project_id);
  } else {
    qb.whereNull('s.project_id');
  }
  if (filters.corporate_grade_id) qb.where('s.corporate_grade_id', filters.corporate_grade_id);
  if (filters.activity_status) qb.where('s.activity_status', filters.activity_status);
  if (filters.q) {
    const like = '%' + String(filters.q).trim() + '%';
    qb.where(function () { this.where('p.display_name', 'ilike', like).orWhere('p.party_no', 'ilike', like); });
  }
  return qb;
}

const SORTS = ['corporate_score', 'purchase_amount_12m', 'purchase_amount_lifetime', 'transaction_count_12m',
  'active_purchase_days_12m', 'last_transaction_at', 'service_case_count_12m', 'registered_device_count'];

async function snapshots(filters, paging) {
  const date = filters.reference_date || await latestDate();
  if (!date) return { rows: [], total: 0, summary: { reference_date: null } };

  const count = await snapshotQuery(filters, date).count({ c: '*' }).first();
  const sort = SORTS.indexOf(paging.sort) !== -1 ? 's.' + paging.sort : 's.corporate_score';
  const rows = await snapshotQuery(filters, date)
    .select('s.*', 'p.party_no', 'p.display_name as party_name', 'p.party_type', 'j.project_code',
      'g.grade_code', 'g.grade_name')
    .orderByRaw(sort + ' ' + (paging.dir === 'asc' ? 'ASC' : 'DESC') + ' NULLS LAST')
    .limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.c), summary: { reference_date: date } };
}

/** The Dream-wide picture on one date: grade bands, activity, spend by project. */
async function summary(referenceDate) {
  const date = referenceDate || await latestDate();
  if (!date) return { reference_date: null, grades: [], activity: [], projects: [], totals: {}, dates: [] };

  const [grades, activity, projects, totals, available] = await Promise.all([
    db.raw(`SELECT g.corporate_grade_id, g.grade_code, g.grade_name, g.rank_no, g.min_score, g.max_score,
                   COUNT(s.analysis_snapshot_id)::int AS parties,
                   COALESCE(SUM(s.purchase_amount_12m), 0) AS spend_12m
              FROM crm_corporate_grade g
              LEFT JOIN crm_party_analysis_snapshot s
                ON s.corporate_grade_id = g.corporate_grade_id AND s.project_id IS NULL AND s.reference_date = ?
             WHERE g.is_active GROUP BY g.corporate_grade_id ORDER BY g.rank_no DESC`, [date]).then(function (result) { return result.rows; }),
    db.raw(`SELECT activity_status, COUNT(*)::int AS parties FROM crm_party_analysis_snapshot
             WHERE project_id IS NULL AND reference_date = ? GROUP BY 1 ORDER BY 2 DESC`, [date]).then(function (result) { return result.rows; }),
    db.raw(`SELECT j.project_id, j.project_code, j.project_name, COUNT(*)::int AS parties,
                   COALESCE(SUM(s.purchase_amount_12m), 0) AS spend_12m,
                   COALESCE(SUM(s.transaction_count_12m), 0)::int AS transactions_12m,
                   COALESCE(SUM(s.service_case_count_12m), 0)::int AS cases_12m
              FROM crm_party_analysis_snapshot s JOIN crm_project j ON j.project_id = s.project_id
             WHERE s.reference_date = ? GROUP BY j.project_id ORDER BY spend_12m DESC`, [date]).then(function (result) { return result.rows; }),
    db.raw(`SELECT COUNT(*)::int AS parties, COALESCE(SUM(purchase_amount_12m), 0) AS spend_12m,
                   COALESCE(SUM(transaction_count_12m), 0)::int AS transactions_12m,
                   ROUND(AVG(corporate_score), 2) AS average_score,
                   COUNT(*) FILTER (WHERE activity_status IN ('AT_RISK', 'LAPSED'))::int AS at_risk,
                   MAX(calculated_at) AS calculated_at, MAX(model_version) AS model_version
              FROM crm_party_analysis_snapshot WHERE project_id IS NULL AND reference_date = ?`, [date]).then(function (result) { return result.rows[0]; }),
    dates()
  ]);
  return { reference_date: date, grades: grades, activity: activity, projects: projects, totals: totals, dates: available };
}

/** One party's analysis over time, its latest rows per scope, and its latest metric values. */
async function forParty(partyId) {
  const [history, latest, metrics] = await Promise.all([
    db('crm_party_analysis_snapshot as s').leftJoin('crm_corporate_grade as g', 'g.corporate_grade_id', 's.corporate_grade_id')
      .where('s.party_id', partyId).whereNull('s.project_id').orderBy('s.reference_date', 'desc').limit(24)
      .select('s.reference_date', 's.corporate_score', 's.purchase_amount_12m', 's.activity_status', 'g.grade_code'),
    db.raw(`SELECT DISTINCT ON (COALESCE(s.project_id, 0)) s.*, j.project_code, g.grade_code, g.grade_name
              FROM crm_party_analysis_snapshot s
              LEFT JOIN crm_project j ON j.project_id = s.project_id
              LEFT JOIN crm_corporate_grade g ON g.corporate_grade_id = s.corporate_grade_id
             WHERE s.party_id = ?
             ORDER BY COALESCE(s.project_id, 0), s.reference_date DESC`, [partyId]).then(function (result) { return result.rows; }),
    db.raw(`SELECT DISTINCT ON (v.metric_definition_id, COALESCE(v.project_id, 0))
                   v.*, d.metric_code, d.metric_name, d.value_type, d.unit_code, j.project_code
              FROM crm_party_metric_value v
              JOIN crm_metric_definition d ON d.metric_definition_id = v.metric_definition_id
              LEFT JOIN crm_project j ON j.project_id = v.project_id
             WHERE v.party_id = ?
             ORDER BY v.metric_definition_id, COALESCE(v.project_id, 0), v.reference_date DESC`, [partyId]).then(function (result) { return result.rows; })
  ]);
  return { history: history, latest: latest, metrics: metrics };
}

/** Values of one metric across the base, latest date first - the metric browser. */
async function metricValues(filters, paging) {
  const qb = function () {
    const query = db('crm_party_metric_value as v')
      .join('crm_party as p', 'p.party_id', 'v.party_id')
      .join('crm_metric_definition as d', 'd.metric_definition_id', 'v.metric_definition_id');
    if (filters.metric_definition_id) query.where('v.metric_definition_id', filters.metric_definition_id);
    if (filters.reference_date) query.where('v.reference_date', filters.reference_date);
    else query.where('v.reference_date', db('crm_party_metric_value').max('reference_date'));
    if (filters.q) {
      const like = '%' + String(filters.q).trim() + '%';
      query.where(function () { this.where('p.display_name', 'ilike', like).orWhere('p.party_no', 'ilike', like); });
    }
    return query;
  };
  const count = await qb().count({ c: '*' }).first();
  const rows = await qb()
    .select('v.*', 'p.party_no', 'p.display_name as party_name', 'd.metric_code', 'd.metric_name', 'd.value_type', 'd.unit_code')
    .orderByRaw('v.numeric_value ' + (paging.dir === 'asc' ? 'ASC' : 'DESC') + ' NULLS LAST, v.party_id')
    .limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.c) };
}

module.exports = { latestDate: latestDate, snapshots: snapshots, summary: summary, forParty: forParty, metricValues: metricValues };
