const service = require('../services/analysis.service');
const { ok, page } = require('../utils/response');
const { readPaging } = require('../utils/query');

/* ---- service centre health ---- */

async function health(req, res) {
  const paging = readPaging(req.query, service.HEALTH_SORTABLE, service.HEALTH_DEFAULT_SORT);
  paging.dir = service.resolveDirection(paging, req.query.dir);

  const filters = {
    q: req.query.q,
    province: req.query.province,
    risk: req.query.risk,
    health_status: req.query.health_status,
    tier: req.query.tier,
    min_score: req.query.min_score,
    agency_id: req.query.agency_id
  };

  const [result, summary] = await Promise.all([
    service.health(filters, paging),
    service.healthSummary(filters)
  ]);

  result.summary = summary;
  return page(res, result, paging);
}

async function healthOf(req, res) {
  return ok(res, await service.healthOf(req.params.agencyId));
}

/* ---- defect watch ---- */

async function defects(req, res) {
  const paging = readPaging(req.query, service.DEFECT_SORTABLE, service.DEFECT_DEFAULT_SORT);
  paging.dir = service.resolveDirection(paging, req.query.dir);

  const [result, summary] = await Promise.all([
    service.defects({
      q: req.query.q,
      category_id: req.query.category_id,
      product_id: req.query.product_id,
      component: req.query.component,
      watch_level: req.query.watch_level,
      severity: req.query.severity,
      min_count: req.query.min_count
    }, paging),
    service.defectSummary()
  ]);

  result.summary = summary;
  return page(res, result, paging);
}

/** Which batches one symptom is turning up in - see analysis.repository. */
async function defectDetail(req, res) {
  return ok(res, await service.defectDetail(req.params.productId, req.params.symptomId));
}

/* ---- the month ---- */

async function monthly(req, res) {
  const agencyId = req.query.agency_id;

  const [rows, totals] = await Promise.all([
    service.monthly({ agency_id: agencyId, from: req.query.from, to: req.query.to }),
    service.monthlyTotals({ from: req.query.from, to: req.query.to })
  ]);

  return ok(res, { rows: rows, totals: totals });
}

async function stockValue(req, res) {
  return ok(res, await service.stockValue());
}

module.exports = {
  health: health,
  healthOf: healthOf,
  defects: defects,
  defectDetail: defectDetail,
  monthly: monthly,
  stockValue: stockValue
};
