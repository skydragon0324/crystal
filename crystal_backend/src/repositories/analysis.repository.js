const db = require('../config/db');
const { applySearch } = require('../utils/query');

/**
 * The four views in section 9 of the schema, read.
 *
 * Nothing here computes anything: the arithmetic is in the views, where the
 * dashboard, an export and somebody checking by hand in psql all get the same
 * answer.  This file is filters, paging and sorting over them.
 */

const HEALTH = 'v_agency_health';
const DEFECTS = 'v_defect_watch';
const MONTHLY = 'v_repair_monthly_stats';
const BALANCE = 'v_part_balance';

/* ------------------------------------------------------------------ */
/*  service centre health                                              */
/* ------------------------------------------------------------------ */

const HEALTH_SEARCHABLE = ['h.agency_name', 'h.agency_code', 'h.province'];

function healthFilters(qb, filters) {
  if (filters.province) qb.where('h.province', filters.province);
  if (filters.risk) qb.where('h.risk_level', filters.risk);
  if (filters.health_status) qb.where('h.health_status', filters.health_status);
  if (filters.tier !== undefined && filters.tier !== '') qb.where('h.tier', filters.tier);
  if (filters.min_score) qb.where('h.risk_score', '>=', Number(filters.min_score));
  if (filters.agency_id) qb.where('h.agency_id', filters.agency_id);
  return qb;
}

async function health(filters, paging) {
  const qb = healthFilters(applySearch(db(HEALTH + ' as h'), HEALTH_SEARCHABLE, filters.q), filters);

  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const rows = await qb.select('h.*')
    .orderBy('h.' + paging.sort, paging.dir)
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
}

/**
 * The tiles above the table.
 *
 * Taken over the whole estate rather than over the filtered list, because the
 * tiles are what somebody clicks to APPLY a filter - counting only what is
 * already filtered would make every tile read zero as soon as one was used.
 */
function healthSummary(filters) {
  const qb = db(HEALTH + ' as h');
  if (filters.province) qb.where('h.province', filters.province);

  return qb.first(
    db.raw('COUNT(*) AS total'),
    db.raw("COUNT(*) FILTER (WHERE h.risk_level = 'HIGH') AS high_risk"),
    db.raw("COUNT(*) FILTER (WHERE h.health_status = 'OVERDUE') AS overdue"),
    db.raw("COUNT(*) FILTER (WHERE h.health_status = 'PARTS_BOUND') AS parts_bound"),
    db.raw("COUNT(*) FILTER (WHERE h.health_status = 'OVER_CAPACITY') AS over_capacity"),
    db.raw("COUNT(*) FILTER (WHERE h.health_status = 'QUALITY') AS quality"),
    db.raw("COUNT(*) FILTER (WHERE h.health_status = 'UNSTAFFED') AS unstaffed"),
    db.raw('COALESCE(SUM(h.open_cnt), 0) AS open_tickets'),
    db.raw('COALESCE(SUM(h.overdue_cnt), 0) AS overdue_tickets'),
    db.raw('ROUND(AVG(h.avg_turnaround_days) FILTER (WHERE h.closed_90d > 0), 2) AS avg_turnaround_days'),
    db.raw('ROUND(AVG(h.csat) FILTER (WHERE h.rating_cnt >= 5), 2) AS csat')
  );
}

function healthOf(agencyId) {
  return db(HEALTH + ' as h').where('h.agency_id', agencyId).first('h.*');
}

/* ------------------------------------------------------------------ */
/*  defect watch                                                       */
/* ------------------------------------------------------------------ */

const DEFECT_SEARCHABLE = ['d.product_name', 'd.symptom_name', 'd.model_code', 'd.symptom_code'];

function defectFilters(qb, filters) {
  if (filters.category_id) qb.where('d.category_id', filters.category_id);
  if (filters.product_id) qb.where('d.product_id', filters.product_id);
  if (filters.component) qb.where('d.component', filters.component);
  if (filters.watch_level) qb.where('d.watch_level', filters.watch_level);
  if (filters.severity !== undefined && filters.severity !== '') qb.where('d.severity', filters.severity);
  if (filters.min_count) qb.where('d.cnt_90d', '>=', Number(filters.min_count));
  return qb;
}

async function defects(filters, paging) {
  const qb = defectFilters(applySearch(db(DEFECTS + ' as d'), DEFECT_SEARCHABLE, filters.q), filters);

  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const rows = await qb.select('d.*')
    .orderBy('d.' + paging.sort, paging.dir)
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
}

function defectSummary() {
  return db(DEFECTS + ' as d').first(
    db.raw('COUNT(*) AS total'),
    db.raw("COUNT(*) FILTER (WHERE d.watch_level = 'ALERT') AS alert_cnt"),
    db.raw("COUNT(*) FILTER (WHERE d.watch_level = 'WATCH') AS watch_cnt"),
    db.raw('COUNT(DISTINCT d.product_id) AS product_cnt'),
    db.raw('COALESCE(SUM(d.covered_90d), 0) AS covered_90d'),
    db.raw('COALESCE(SUM(d.cnt_90d), 0) AS repair_cnt')
  );
}

/**
 * Which production batches a symptom is turning up in.
 *
 * The point of the whole defect watch: a fault that is really a bad batch
 * looks like a bad product until somebody can group by the batch code, and
 * only the local serial mirror carries one.  Serials the mirror has never
 * seen are grouped as 'unknown' rather than dropped - a batch breakdown that
 * quietly ignores half the devices is worse than none.
 */
function batchesOf(productId, symptomId) {
  return db('repair_tickets as t')
    .leftJoin('oracle_serials as s', db.raw('UPPER(s.serial_number)'), db.raw('UPPER(t.serial_number)'))
    .where('t.product_id', productId)
    .where('t.symptom_id', symptomId)
    .where('t.is_deleted', false)
    .whereNot('t.status', 9)
    .whereRaw("t.received_at >= now() - interval '180 days'")
    .groupBy('s.batch_code', 's.factory_code')
    .orderBy('repair_cnt', 'desc')
    .limit(20)
    .select(
      db.raw("COALESCE(s.batch_code, 'unknown') AS batch_code"),
      db.raw("COALESCE(s.factory_code, 'unknown') AS factory_code"),
      db.raw('COUNT(*) AS repair_cnt'),
      db.raw('COUNT(DISTINCT t.serial_number) AS device_cnt'),
      db.raw('MIN(t.received_at) AS first_seen_at'),
      db.raw('MAX(t.received_at) AS last_seen_at')
    );
}

/* ------------------------------------------------------------------ */
/*  the month                                                          */
/* ------------------------------------------------------------------ */

function monthly(filters) {
  const qb = db(MONTHLY + ' as m');
  if (filters.agency_id) qb.where('m.agency_id', filters.agency_id);
  if (filters.from) qb.where('m.period_month', '>=', filters.from);
  if (filters.to) qb.where('m.period_month', '<=', filters.to);
  return qb.orderBy('m.period_month', 'desc').limit(filters.limit || 36).select('m.*');
}

/** The same months rolled up across every centre, for the dashboard chart. */
function monthlyTotals(filters) {
  const qb = db(MONTHLY + ' as m');
  if (filters.from) qb.where('m.period_month', '>=', filters.from);
  if (filters.to) qb.where('m.period_month', '<=', filters.to);

  return qb.groupBy('m.period_month')
    .orderBy('m.period_month')
    .select(
      'm.period_month',
      db.raw('SUM(m.ticket_cnt) AS ticket_cnt'),
      db.raw('SUM(m.closed_cnt) AS closed_cnt'),
      db.raw('SUM(m.warranty_cnt) AS warranty_cnt'),
      db.raw('SUM(m.repeat_cnt) AS repeat_cnt'),
      db.raw('SUM(m.breach_cnt) AS breach_cnt'),
      db.raw('SUM(m.charged_amount) AS charged_amount'),
      db.raw('SUM(m.covered_amount) AS covered_amount'),
      db.raw('ROUND(AVG(m.avg_turnaround_days), 2) AS avg_turnaround_days'),
      db.raw('ROUND(AVG(m.csat), 2) AS csat')
    );
}

/** Stock value by centre, for the operations overview. */
function stockValue() {
  return db(BALANCE + ' as b')
    .groupBy('b.agency_id', 'b.agency_name')
    .orderBy('stock_value', 'desc')
    .select('b.agency_id', 'b.agency_name',
      db.raw('SUM(b.stock_value) AS stock_value'),
      db.raw("COUNT(*) FILTER (WHERE b.stock_state <> 'OK') AS short_cnt"));
}

module.exports = {
  HEALTH: HEALTH,
  DEFECTS: DEFECTS,
  MONTHLY: MONTHLY,
  health: health,
  healthSummary: healthSummary,
  healthOf: healthOf,
  defects: defects,
  defectSummary: defectSummary,
  batchesOf: batchesOf,
  monthly: monthly,
  monthlyTotals: monthlyTotals,
  stockValue: stockValue
};
