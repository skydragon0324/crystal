const db = require('../../config/db');
const { searchId } = require('./partyId');

/**
 * Reading what the analysis run wrote - design sections 3.7 and 3.8.
 *
 * The run keeps one snapshot per party, scope and reference date; screens
 * almost always want the LATEST reference date, so every list defaults to it
 * and can be pointed at an earlier one to compare.
 */

async function latestDate() {
  const row = await db('crm_party_analysis_snapshot').max({ latest_date: 'reference_date' }).first();
  return row && row.latest_date ? String(row.latest_date).slice(0, 10) : null;
}

async function dates() {
  const rows = await db('crm_party_analysis_snapshot').distinct('reference_date').orderBy('reference_date', 'desc').limit(60);
  return rows.map(function (row) { return String(row.reference_date).slice(0, 10); });
}

function snapshotQuery(filters, date) {
  const qb = db('crm_party_analysis_snapshot as snapshot')
    .join('crm_party as party', 'party.party_pk', 'snapshot.party_pk')
    .leftJoin('crm_project as project', 'project.project_id', 'snapshot.project_id')
    .leftJoin('crm_corporate_grade as grade', 'grade.corporate_grade_id', 'snapshot.corporate_grade_id')
    .where('snapshot.reference_date', date);
  if (filters.scope === 'project') {
    qb.whereNotNull('snapshot.project_id');
    if (filters.project_id) qb.where('snapshot.project_id', filters.project_id);
  } else {
    qb.whereNull('snapshot.project_id');
  }
  if (filters.corporate_grade_id) qb.where('snapshot.corporate_grade_id', filters.corporate_grade_id);
  if (filters.activity_status) qb.where('snapshot.activity_status', filters.activity_status);
  if (filters.q) {
    const like = '%' + String(filters.q).trim() + '%';
    qb.where(function () { this.where('party.display_name', 'ilike', like).orWhereRaw('??::text ILIKE ?', ['party.party_pk', searchId(like)]); });
  }
  return qb;
}

const SORTS = ['corporate_score', 'purchase_amount_12m', 'purchase_amount_lifetime', 'transaction_count_12m',
  'active_purchase_days_12m', 'last_transaction_at', 'service_case_count_12m', 'registered_device_count'];

async function snapshots(filters, paging) {
  const date = filters.reference_date || await latestDate();
  if (!date) return { rows: [], total: 0, summary: { reference_date: null } };

  const count = await snapshotQuery(filters, date).count({ total: '*' }).first();
  const sort = SORTS.indexOf(paging.sort) !== -1 ? 'snapshot.' + paging.sort : 'snapshot.corporate_score';
  const rows = await snapshotQuery(filters, date)
    .select('snapshot.*', 'party.party_pk', 'party.display_name as party_name', 'party.party_type', 'project.project_code',
      'grade.grade_code', 'grade.grade_name')
    .orderByRaw(sort + ' ' + (paging.dir === 'asc' ? 'ASC' : 'DESC') + ' NULLS LAST')
    .limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.total), summary: { reference_date: date } };
}

/** The Dream-wide picture on one date: grade bands, activity, spend by project. */
async function summary(referenceDate) {
  const date = referenceDate || await latestDate();
  if (!date) return { reference_date: null, grades: [], activity: [], projects: [], totals: {}, dates: [] };

  const [grades, activity, projects, totals, available] = await Promise.all([
    db.raw(`SELECT grade.corporate_grade_id, grade.grade_code, grade.grade_name, grade.rank_no, grade.min_score, grade.max_score,
                   COUNT(snapshot.analysis_snapshot_id)::int AS parties,
                   COALESCE(SUM(snapshot.purchase_amount_12m), 0) AS spend_12m
              FROM crm_corporate_grade grade
              LEFT JOIN crm_party_analysis_snapshot snapshot
                ON snapshot.corporate_grade_id = grade.corporate_grade_id AND snapshot.project_id IS NULL AND snapshot.reference_date = ?
             WHERE grade.is_active GROUP BY grade.corporate_grade_id ORDER BY grade.rank_no DESC`, [date]).then(function (result) { return result.rows; }),
    db.raw(`SELECT activity_status, COUNT(*)::int AS parties FROM crm_party_analysis_snapshot
             WHERE project_id IS NULL AND reference_date = ? GROUP BY 1 ORDER BY 2 DESC`, [date]).then(function (result) { return result.rows; }),
    db.raw(`SELECT project.project_id, project.project_code, project.project_name, COUNT(*)::int AS parties,
                   COALESCE(SUM(snapshot.purchase_amount_12m), 0) AS spend_12m,
                   COALESCE(SUM(snapshot.transaction_count_12m), 0)::int AS transactions_12m,
                   COALESCE(SUM(snapshot.service_case_count_12m), 0)::int AS cases_12m
              FROM crm_party_analysis_snapshot snapshot JOIN crm_project project ON project.project_id = snapshot.project_id
             WHERE snapshot.reference_date = ? GROUP BY project.project_id ORDER BY spend_12m DESC`, [date]).then(function (result) { return result.rows; }),
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
    db('crm_party_analysis_snapshot as snapshot').leftJoin('crm_corporate_grade as grade', 'grade.corporate_grade_id', 'snapshot.corporate_grade_id')
      .where('snapshot.party_pk', partyId).whereNull('snapshot.project_id').orderBy('snapshot.reference_date', 'desc').limit(24)
      .select('snapshot.reference_date', 'snapshot.corporate_score', 'snapshot.purchase_amount_12m', 'snapshot.activity_status', 'grade.grade_code'),
    db.raw(`SELECT DISTINCT ON (COALESCE(snapshot.project_id, 0)) snapshot.*, project.project_code, grade.grade_code, grade.grade_name
              FROM crm_party_analysis_snapshot snapshot
              LEFT JOIN crm_project project ON project.project_id = snapshot.project_id
              LEFT JOIN crm_corporate_grade grade ON grade.corporate_grade_id = snapshot.corporate_grade_id
             WHERE snapshot.party_pk = ?
             ORDER BY COALESCE(snapshot.project_id, 0), snapshot.reference_date DESC`, [partyId]).then(function (result) { return result.rows; }),
    db.raw(`SELECT DISTINCT ON (metric_value.metric_definition_id, COALESCE(metric_value.project_id, 0))
                   metric_value.*, definition.metric_code, definition.metric_name, definition.value_type, definition.unit_code, project.project_code
              FROM crm_party_metric_value metric_value
              JOIN crm_metric_definition definition ON definition.metric_definition_id = metric_value.metric_definition_id
              LEFT JOIN crm_project project ON project.project_id = metric_value.project_id
             WHERE metric_value.party_pk = ?
             ORDER BY metric_value.metric_definition_id, COALESCE(metric_value.project_id, 0), metric_value.reference_date DESC`, [partyId]).then(function (result) { return result.rows; })
  ]);
  return { history: history, latest: latest, metrics: metrics };
}

/** Values of one metric across the base, latest date first - the metric browser. */
async function metricValues(filters, paging) {
  const qb = function () {
    const query = db('crm_party_metric_value as metric_value')
      .join('crm_party as party', 'party.party_pk', 'metric_value.party_pk')
      .join('crm_metric_definition as definition', 'definition.metric_definition_id', 'metric_value.metric_definition_id');
    if (filters.metric_definition_id) query.where('metric_value.metric_definition_id', filters.metric_definition_id);
    if (filters.reference_date) query.where('metric_value.reference_date', filters.reference_date);
    else query.where('metric_value.reference_date', db('crm_party_metric_value').max('reference_date'));
    if (filters.q) {
      const like = '%' + String(filters.q).trim() + '%';
      query.where(function () { this.where('party.display_name', 'ilike', like).orWhereRaw('??::text ILIKE ?', ['party.party_pk', searchId(like)]); });
    }
    return query;
  };
  const count = await qb().count({ total: '*' }).first();
  const rows = await qb()
    .select('metric_value.*', 'party.party_pk', 'party.display_name as party_name', 'definition.metric_code', 'definition.metric_name', 'definition.value_type', 'definition.unit_code')
    .orderByRaw('metric_value.numeric_value ' + (paging.dir === 'asc' ? 'ASC' : 'DESC') + ' NULLS LAST, metric_value.party_pk')
    .limit(paging.limit).offset(paging.offset);
  return { rows: rows, total: Number(count.total) };
}

module.exports = { latestDate: latestDate, snapshots: snapshots, summary: summary, forParty: forParty, metricValues: metricValues };
