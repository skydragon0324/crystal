const repo = require('../repositories/analysis.repository');
const { HttpError } = require('../utils/response');

const HEALTH_PAGE = '/admin/analysis/agency-health';
const DEFECT_PAGE = '/admin/analysis/defect-watch';
const MONTHLY_PAGE = '/admin/analysis/monthly';

/**
 * Reading the scoreboard.
 *
 * Thin on purpose.  The arithmetic is in the views, so what is left is the
 * two decisions that are genuinely about presentation rather than about data:
 * which way a column should sort when nobody has said, and how far back "the
 * last year" reaches.
 */

const HEALTH_SORTABLE = [
  'risk_score', 'agency_name', 'open_cnt', 'overdue_cnt', 'avg_turnaround_days',
  'sla_breach_ratio', 'repeat_ratio', 'csat', 'load_ratio', 'tickets_90d', 'covered_90d'
];
const HEALTH_DEFAULT_SORT = 'risk_score';

const DEFECT_SORTABLE = [
  'cnt_90d', 'rate_per_1k', 'trend_pct', 'product_name', 'symptom_name',
  'device_cnt_90d', 'agency_cnt_90d', 'covered_90d', 'severity'
];
const DEFECT_DEFAULT_SORT = 'rate_per_1k';

/**
 * Sorts where the interesting end is the large one, so they start there.
 *
 * Both of these tables exist to answer "what is worst", and a risk board that
 * opens on the healthiest centre in the country is a board nobody uses twice.
 */
const DESC_BY_DEFAULT = [
  'risk_score', 'open_cnt', 'overdue_cnt', 'avg_turnaround_days', 'sla_breach_ratio',
  'repeat_ratio', 'load_ratio', 'tickets_90d', 'covered_90d',
  'cnt_90d', 'rate_per_1k', 'trend_pct', 'device_cnt_90d', 'agency_cnt_90d', 'severity'
];

function resolveDirection(paging, explicitDir) {
  if (explicitDir) return paging.dir;
  return DESC_BY_DEFAULT.indexOf(paging.sort) >= 0 ? 'desc' : 'asc';
}

function health(filters, paging) {
  return repo.health(filters, paging);
}

async function healthSummary(filters) {
  const row = await repo.healthSummary(filters || {});
  return {
    total: Number(row.total),
    high_risk: Number(row.high_risk),
    overdue: Number(row.overdue),
    parts_bound: Number(row.parts_bound),
    over_capacity: Number(row.over_capacity),
    quality: Number(row.quality),
    unstaffed: Number(row.unstaffed),
    open_tickets: Number(row.open_tickets),
    overdue_tickets: Number(row.overdue_tickets),
    // Both can be null when nothing has closed yet, and null is the honest
    // answer - a turnaround of 0 days would read as "instant" rather than
    // "nothing to measure".
    avg_turnaround_days: row.avg_turnaround_days === null ? null : Number(row.avg_turnaround_days),
    csat: row.csat === null ? null : Number(row.csat)
  };
}

async function healthOf(agencyId) {
  const row = await repo.healthOf(agencyId);
  if (!row) throw new HttpError(404, 'common.notFound');
  return row;
}

function defects(filters, paging) {
  return repo.defects(filters, paging);
}

async function defectSummary() {
  const row = await repo.defectSummary();
  return {
    total: Number(row.total),
    alert_cnt: Number(row.alert_cnt),
    watch_cnt: Number(row.watch_cnt),
    product_cnt: Number(row.product_cnt),
    covered_90d: Number(row.covered_90d),
    repair_cnt: Number(row.repair_cnt)
  };
}

/**
 * What is behind one defect row: which batches, and which centres.
 *
 * The screen flags a symptom; this is what tells an engineer whether they are
 * looking at a design problem or at one bad week in one factory.
 */
async function defectDetail(productId, symptomId) {
  const batches = await repo.batchesOf(productId, symptomId);
  return { batches: batches };
}

function monthly(filters) {
  return repo.monthly(filters);
}

function monthlyTotals(filters) {
  return repo.monthlyTotals(filters);
}

function stockValue() {
  return repo.stockValue();
}

module.exports = {
  HEALTH_PAGE: HEALTH_PAGE,
  DEFECT_PAGE: DEFECT_PAGE,
  MONTHLY_PAGE: MONTHLY_PAGE,
  HEALTH_SORTABLE: HEALTH_SORTABLE,
  HEALTH_DEFAULT_SORT: HEALTH_DEFAULT_SORT,
  DEFECT_SORTABLE: DEFECT_SORTABLE,
  DEFECT_DEFAULT_SORT: DEFECT_DEFAULT_SORT,

  resolveDirection: resolveDirection,
  health: health,
  healthSummary: healthSummary,
  healthOf: healthOf,
  defects: defects,
  defectSummary: defectSummary,
  defectDetail: defectDetail,
  monthly: monthly,
  monthlyTotals: monthlyTotals,
  stockValue: stockValue
};
