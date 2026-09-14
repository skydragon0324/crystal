const repo = require('../repositories/dashboard.repository');
const codes = require('../utils/codes');

const PAGE = '/admin/dashboard';

/**
 * The front page, assembled.
 *
 * Seven reads, issued together rather than one after another: none of them
 * depends on another, and a dashboard that waits for each in turn is seven
 * round trips of latency for a page whose whole job is to load quickly.
 *
 * IT IS THE WHOLE ESTATE, for everybody who can open it.
 *
 * A branch account used to see only its own centre here, taken from
 * `managers.agency_id`. That column is gone: an account is a login and a role,
 * and what it may open is the permission grid's answer alone.
 *
 * The repository functions still TAKE an agency and still narrow when given
 * one - the monthly report and the centre screens pass one from the query.
 * This page passes none, which is why the two blocks that only ever made
 * sense estate-wide - the riskiest centres, the defect alerts - are no longer
 * behind a condition that can now only go one way.
 */
async function overview() {
  const [counters, statuses, daily, overdue, risky, defects, platform, legacyCounts] = await Promise.all([
    repo.counters(null),
    repo.statusBreakdown(null),
    repo.daily(null, 30),
    repo.overdueTickets(null, 8),
    repo.riskyAgencies(5),
    repo.defectAlerts(5),
    repo.platformCounters(),
    /* Feedback and the blog answer from the vendor's database now. */
    repo.legacyCounters()
  ]);

  return {
    scope: 'platform',
    agency_id: null,
    counters: {
      open_cnt: Number(counters.open_cnt),
      overdue_cnt: Number(counters.overdue_cnt),
      waiting_parts_cnt: Number(counters.waiting_parts_cnt),
      ready_cnt: Number(counters.ready_cnt),
      today_cnt: Number(counters.today_cnt),
      closed_today_cnt: Number(counters.closed_today_cnt),
      revenue_mtd: Number(counters.revenue_mtd),
      covered_mtd: Number(counters.covered_mtd),
      member_cnt: Number(platform.member_cnt),
      product_cnt: Number(platform.product_cnt),
      registration_cnt: Number(platform.registration_cnt),
      warranty_cnt: Number(platform.warranty_cnt),
      feedback_open_cnt: legacyCounts.feedback_open_cnt,
      article_review_cnt: legacyCounts.article_review_cnt
    },
    // The label travels with the code so the chart legend and the ticket list
    // cannot end up calling status 2 two different things.
    statuses: statuses.map(function (row) {
      return {
        status: row.status,
        label: codes.labelOf(codes.TICKET_STATUS, row.status),
        cnt: Number(row.cnt)
      };
    }),
    daily: daily.map(function (row) {
      return {
        day: row.day,
        received_cnt: Number(row.received_cnt),
        closed_cnt: Number(row.closed_cnt),
        charged_amount: Number(row.charged_amount)
      };
    }),
    overdue: overdue,
    risky_agencies: risky,
    defect_alerts: defects
  };
}

module.exports = { PAGE: PAGE, overview: overview };
