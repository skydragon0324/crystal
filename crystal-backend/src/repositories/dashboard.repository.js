const db = require('../config/db');
const legacy = require('../config/legacy');
const codes = require('./legacy/codes');

/**
 * The console's front page.
 *
 * Every function here answers one tile or one chart, and each is scoped by an
 * optional agency so a branch account sees its own centre rather than the
 * whole country - the same query, one WHERE clause different.
 */

function scoped(qb, agencyId, column) {
  if (agencyId) qb.where(column || 't.agency_id', agencyId);
  return qb;
}

/** The five numbers across the top. */
function counters(agencyId) {
  const tickets = scoped(
    db('repair_tickets as t').where('t.is_deleted', false).whereNot('t.status', 9),
    agencyId
  );

  return tickets.first(
    db.raw('COUNT(*) FILTER (WHERE t.status < 7) AS open_cnt'),
    db.raw('COUNT(*) FILTER (WHERE t.status < 7 AND t.promised_at < now()) AS overdue_cnt'),
    db.raw('COUNT(*) FILTER (WHERE t.status = 2) AS waiting_parts_cnt'),
    db.raw('COUNT(*) FILTER (WHERE t.status = 6) AS ready_cnt'),
    db.raw("COUNT(*) FILTER (WHERE t.received_at >= date_trunc('day', now())) AS today_cnt"),
    db.raw("COUNT(*) FILTER (WHERE t.closed_at >= date_trunc('day', now())) AS closed_today_cnt"),
    db.raw("COALESCE(SUM(t.total_amount) FILTER (WHERE t.closed_at >= date_trunc('month', now())), 0) AS revenue_mtd"),
    db.raw("COALESCE(SUM(t.covered_amount) FILTER (WHERE t.closed_at >= date_trunc('month', now())), 0) AS covered_mtd")
  );
}

/** How the open queue is spread across the workflow, for the status donut. */
function statusBreakdown(agencyId) {
  return scoped(
    db('repair_tickets as t').where('t.is_deleted', false).where('t.status', '<', 7),
    agencyId
  ).groupBy('t.status').orderBy('t.status')
    .select('t.status', db.raw('COUNT(*) AS cnt'));
}

/**
 * The last thirty days, one row per day.
 *
 * generate_series rather than a GROUP BY over the tickets, so a day with no
 * repairs is a zero rather than a gap - a line chart that simply skips the
 * quiet days draws a smooth line through a weekend nobody worked.
 */
function daily(agencyId, days) {
  const span = Number(days) || 30;

  return db
    .select(
      db.raw("to_char(d.day, 'YYYY-MM-DD') AS day"),
      db.raw('COUNT(t.id) AS received_cnt'),
      db.raw('COUNT(t.id) FILTER (WHERE t.closed_at::date = d.day) AS closed_cnt'),
      db.raw('COALESCE(SUM(t.total_amount), 0) AS charged_amount')
    )
    .from(db.raw(
      "generate_series(CURRENT_DATE - ?::int, CURRENT_DATE, interval '1 day') AS d(day)",
      [span - 1]
    ))
    .leftJoin('repair_tickets as t', function () {
      this.on(db.raw('t.received_at::date = d.day'))
        .andOn(db.raw('t.is_deleted = false'))
        .andOn(db.raw('t.status <> 9'));
      if (agencyId) this.andOn(db.raw('t.agency_id = ?', [agencyId]));
    })
    .groupBy('d.day')
    .orderBy('d.day');
}

/** What is aging in the queue, oldest promise first. */
function overdueTickets(agencyId, limit) {
  return scoped(
    db('repair_tickets as t')
      .join('agencies as g', 'g.id', 't.agency_id')
      .leftJoin('products as p', 'p.id', 't.product_id')
      .where('t.is_deleted', false)
      .where('t.status', '<', 7)
      .whereRaw('t.promised_at < now()'),
    agencyId
  ).orderBy('t.promised_at').limit(limit || 8)
    .select('t.id', 't.ticket_no', 't.status', 't.priority', 't.customer_name',
      't.serial_number', 't.received_at', 't.promised_at',
      'g.name as agency_name', 'p.name as product_name',
      db.raw('ROUND(EXTRACT(EPOCH FROM (now() - t.promised_at))::numeric / 3600.0, 1) AS hours_late'));
}

/** The riskiest centres, straight off the health view. */
function riskyAgencies(limit) {
  return db('v_agency_health')
    .whereNot('health_status', 'CLEAR')
    .orderBy('risk_score', 'desc')
    .limit(limit || 5)
    .select('agency_id', 'agency_name', 'province', 'risk_score', 'risk_level',
      'health_status', 'open_cnt', 'overdue_cnt', 'avg_turnaround_days');
}

/** Anything the defect watch has raised to ALERT. */
function defectAlerts(limit) {
  return db('v_defect_watch')
    .where('watch_level', 'ALERT')
    .orderBy('rate_per_1k', 'desc')
    .limit(limit || 5)
    .select('product_id', 'product_name', 'symptom_id', 'symptom_name', 'component',
      'severity', 'cnt_90d', 'trend_pct', 'rate_per_1k', 'agency_cnt_90d');
}

/**
 * The catalogue and membership counts, for the secondary tiles.
 *
 * TWO OF THESE USED TO BE HERE AND ARE NOT ANY MORE - the open-feedback count
 * and the articles awaiting review. Both of those tables now live in the
 * vendor's database (see config/legacy.js), and a scalar subquery cannot
 * reach across a connection: on Oracle the whole statement would have failed,
 * and in development, where the stand-in schemas sit in the same PostgreSQL
 * database, it would have kept working - which is the worse of the two.
 *
 * They are counted by legacyCounters() below and merged by the service.
 */
function platformCounters() {
  return db.first(
    db.raw('(SELECT COUNT(*) FROM users WHERE status = ?) AS member_cnt', ['ACTIVE']),
    db.raw('(SELECT COUNT(*) FROM products WHERE is_deleted = false AND status = ?) AS product_cnt', ['PUBLISHED']),
    db.raw('(SELECT COUNT(*) FROM registered_products) AS registration_cnt'),
    db.raw('(SELECT COUNT(*) FROM warranties WHERE status = ? AND end_date >= CURRENT_DATE) AS warranty_cnt', ['ACTIVE'])
  );
}

/**
 * The same two tiles, from the database that now holds them.
 *
 * Two round trips rather than one, and they are worth it: the alternative is
 * a dashboard tile that silently reports zero once feedback moves - a queue
 * that looks empty is indistinguishable from a queue that is empty.
 *
 * The codes are spelled through codes.js rather than written as numbers; see
 * the note there about why no bare code appears outside it.
 */
async function legacyCounters() {
  const conn = legacy.connection();

  const [feedback, articles] = await Promise.all([
    conn(legacy.pid('feedback_threads'))
      .where('is_deleted', 0)
      .where('status', codes.STATUS.DISCUSSING)
      .count({ c: '*' }).first(),
    conn(legacy.blog('blog_article'))
      .where('state', codes.ARTICLE_STATE.PUB_REQUEST)
      .count({ c: '*' }).first()
  ]);

  return {
    feedback_open_cnt: Number(feedback.c),
    article_review_cnt: Number(articles.c)
  };
}

module.exports = {
  counters: counters,
  legacyCounters: legacyCounters,
  statusBreakdown: statusBreakdown,
  daily: daily,
  overdueTickets: overdueTickets,
  riskyAgencies: riskyAgencies,
  defectAlerts: defectAlerts,
  platformCounters: platformCounters
};
