'use strict';

/**
 * THE LIFECYCLE ENDPOINTS, OVER REAL HTTP.
 *
 *   node scripts/check-lifecycle-api.js
 *
 * An Express app is built here with the real router mounted, and the real
 * controller, services and database behind it - the only thing stubbed is the
 * permission middleware, because this is checking the reports and not the
 * console's access control (which managers.test and the permission middleware
 * have their own coverage for).
 *
 * WHAT IT IS FOR is the half that unit-testing a service cannot reach: the
 * query string. A report endpoint takes two dates, a grouping, an interval,
 * two statuses, a page and a search term, and every one of them is a way to
 * get a wrong answer quietly - a reversed range that returns nothing and
 * looks like "no transitions", a status typo that reports the unfiltered
 * total, a ten-year window that scans the table. Those are the cases here.
 */

require('dotenv').config();

const express = require('express');
const http = require('http');

const db = require('../src/config/db');
const legacy = require('../src/config/legacy');
const config = require('../src/config');

let failures = 0;
let checks = 0;

function heading(text) {
  console.log('');
  console.log(text);
  console.log('-'.repeat(text.length));
}

function same(what, expected, actual) {
  checks += 1;
  if (JSON.stringify(expected) === JSON.stringify(actual)) {
    console.log('  ok    ' + what);
  } else {
    failures += 1;
    console.log('  FAIL  ' + what);
    console.log('        expected ' + JSON.stringify(expected));
    console.log('        actual   ' + JSON.stringify(actual));
  }
}

function truthy(what, value) {
  checks += 1;
  if (value) console.log('  ok    ' + what);
  else {
    failures += 1;
    console.log('  FAIL  ' + what + ' (got ' + JSON.stringify(value) + ')');
  }
}

/* ------------------------------------------------------------------ */

/**
 * The app, with permission stubbed and nothing else.
 *
 * `express-promise-router` is what the real routes use, so a handler that
 * rejects becomes a normal error rather than an unhandled promise - which
 * means the error middleware below reports it the way the API would.
 */
function buildApp() {
  /* Stub the permission middleware before the router requires it. */
  const permissionPath = require.resolve('../src/middleware/permission');
  require(permissionPath);
  require.cache[permissionPath].exports = {
    LEVEL: { READ: 1, WRITE: 2 },
    requirePermission: function () {
      return function (req, res, next) {
        req.manager = { id: 1, name: 'check' };
        next();
      };
    }
  };

  const app = express();
  app.use(express.json());

  /* The locale the response envelope translates against. */
  app.use(function (req, res, next) { req.locale = 'en'; next(); });

  app.use('/api/admin/customer-lifecycle', require('../src/routes/lifecycle.routes'));
  /* The real handler, so a refusal comes back in the project envelope
     with the project status code rather than as an Express stack trace. */
  app.use(require('../src/middleware/error').errorHandler);

  return app;
}

function get(server, path) {
  return new Promise(function (resolve, reject) {
    const port = server.address().port;

    http.get({ host: '127.0.0.1', port: port, path: path }, function (res) {
      let body = '';
      res.on('data', function (chunk) { body += chunk; });
      res.on('end', function () {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (err) { parsed = { raw: body }; }
        resolve({ status: res.statusCode, body: parsed });
      });
    }).on('error', reject);
  });
}

async function main() {
  const app = buildApp();
  const server = app.listen(0);

  await new Promise(function (resolve) { server.on('listening', resolve); });

  const today = require('../src/services/lifecycle/snapshots.service')
    .today(config.lifecycle.reportTimezone);

  try {
    /* ---------------------------------------------------------------- */
    heading('The overview');

    const overview = await get(server, '/api/admin/customer-lifecycle/overview');
    same('answers 200', 200, overview.status);
    truthy('in the project envelope', overview.body.success === true);

    const counts = overview.body.data.counts;
    same('and the four buckets sum to the total',
      counts.TOTAL,
      counts.NEW + counts.ACTIVE + counts.DORMANT + counts.CHURNED);

    same('labelled as a stock, not a flow', 'STOCK_END_OF_DAY', overview.body.data.metricType);
    truthy('and carries the rule it was computed under',
      overview.body.data.rule.version === config.lifecycle.ruleVersion);
    same('and says the classification is login-based', 'LOGIN_BASED', overview.body.data.rule.basis);

    /* ---------------------------------------------------------------- */
    heading('The trend, and the three groupings');

    const daily = await get(server,
      '/api/admin/customer-lifecycle/trend?from=2026-10-01&to=2026-10-07&groupBy=DAY');
    same('daily gives one bucket per day', 7, daily.body.data.buckets.length);
    same('each bucket is its own snapshot day',
      true,
      daily.body.data.buckets.every(function (b) {
        return b.periodStart === b.periodEnd && b.snapshotDate === b.periodEnd;
      }));

    const weekly = await get(server,
      '/api/admin/customer-lifecycle/trend?from=2026-09-30&to=2026-10-14&groupBy=WEEK');
    const weeks = weekly.body.data.buckets;
    truthy('weekly buckets are returned', weeks.length >= 2);
    same('the first week is truncated to the range start, not reaching back',
      '2026-09-30',
      weeks[0].periodStart);
    same('and each bucket takes the stock of its LAST day',
      true,
      weeks.every(function (b) { return b.snapshotDate === b.periodEnd; }));

    const custom = await get(server,
      '/api/admin/customer-lifecycle/trend?from=2026-10-01&to=2026-10-14&groupBy=CUSTOM&intervalDays=3');
    same('a custom 3-day grouping gives five buckets over fourteen days',
      5, custom.body.data.buckets.length);
    same('the last one is truncated at the range end',
      '2026-10-14',
      custom.body.data.buckets[4].periodEnd);

    /*
     * THE INVARIANT A DASHBOARD GETS WRONG. Requirement 5 forbids summing
     * stock counts, and this is what that forbids: the sum of five buckets'
     * totals is nearly five times the population.
     */
    const summed = custom.body.data.buckets.reduce(function (a, b) { return a + b.total; }, 0);
    truthy('summing bucket stocks really does overstate the population '
      + '(' + summed.toLocaleString() + ' vs ' + counts.TOTAL.toLocaleString() + ')',
      summed > counts.TOTAL * 2);
    same('which is why the reply names the metric',
      'STOCK_END_OF_BUCKET', custom.body.data.metricType);

    /* ---------------------------------------------------------------- */
    heading('What the query string is not allowed to do');

    const reversed = await get(server,
      '/api/admin/customer-lifecycle/trend?from=2026-10-14&to=2026-10-01');
    same('a reversed range is refused, not answered with nothing', 400, reversed.status);

    const nonsense = await get(server,
      '/api/admin/customer-lifecycle/trend?from=last-tuesday&to=2026-10-01');
    same('a date that is not a date is refused', 400, nonsense.status);

    const huge = await get(server,
      '/api/admin/customer-lifecycle/trend?from=2000-01-01&to=2026-10-01');
    same('a decade-long window is refused rather than scanned', 400, huge.status);

    const badGroup = await get(server,
      '/api/admin/customer-lifecycle/trend?from=2026-10-01&to=2026-10-07&groupBy=FORTNIGHT');
    same('an unknown grouping is refused', 400, badGroup.status);

    const badInterval = await get(server,
      '/api/admin/customer-lifecycle/trend?from=2026-10-01&to=2026-10-07&groupBy=CUSTOM');
    same('CUSTOM without an interval is refused', 400, badInterval.status);

    const badStatus = await get(server,
      '/api/admin/customer-lifecycle/transitions?from=2026-09-01&to=2026-09-30&toStatus=CHURNNED');
    same('a misspelt status is refused, not quietly ignored', 400, badStatus.status);

    /* ---------------------------------------------------------------- */
    heading('Transitions: the matrix and the list');

    const matrix = await get(server,
      '/api/admin/customer-lifecycle/transitions/summary?from=2026-09-01&to=2026-09-30');
    same('the matrix is labelled a flow', 'TRANSITION_FLOW', matrix.body.data.metricType);
    truthy('and has rows', matrix.body.data.matrix.length > 0);
    same('every row carries BOTH an event count and a unique-customer count',
      true,
      matrix.body.data.matrix.every(function (row) {
        return typeof row.events === 'number' && typeof row.uniqueCustomers === 'number';
      }));

    const list = await get(server,
      '/api/admin/customer-lifecycle/transitions'
      + '?from=2026-09-01&to=2026-09-30&fromStatus=DORMANT&toStatus=CHURNED&pageSize=5');
    same('the filtered list answers 200', 200, list.status);
    same('a page is five rows', 5, list.body.data.rows.length);
    truthy('with a total beyond the page', list.body.data.total > 5);
    same('and every row matches the filter',
      true,
      list.body.data.rows.every(function (row) {
        return row.fromStatus === 'DORMANT' && row.toStatus === 'CHURNED';
      }));

    /*
     * THE DISTINCTION REQUIREMENT 12 ASKS FOR: the status this transition
     * produced, and where the customer is today, are different fields.
     */
    truthy('each row distinguishes the event-time status from the current one',
      list.body.data.rows.every(function (row) {
        return row.statusAsOfEvent !== undefined && row.currentStatus !== undefined;
      }));

    /* One customer, one row - a customer with several phones must not
       multiply (requirement 3, fixture D). */
    const keys = list.body.data.rows.map(function (row) { return row.userPk; });
    same('no customer appears twice in one page of transitions',
      keys.length, new Set(keys).size);

    /* ---------------------------------------------------------------- */
    heading('A historical status list, and one timeline');

    const dormant = await get(server,
      '/api/admin/customer-lifecycle/customers?status=DORMANT&asOf=2026-06-30&pageSize=5');
    same('who was DORMANT in June answers 200', 200, dormant.status);
    same('and they were all DORMANT then',
      true,
      dormant.body.data.rows.every(function (row) { return row.statusAsOf === 'DORMANT'; }));

    const subject = list.body.data.rows[0].userPk;
    const timeline = await get(server,
      '/api/admin/customer-lifecycle/customers/' + subject + '/timeline');

    same('a timeline answers 200', 200, timeline.status);
    truthy('with periods in it', timeline.body.data.periods.length > 0);
    same('beginning at registration',
      'REGISTRATION', timeline.body.data.periods[0].reason);
    truthy('and reporting the login count rather than every login',
      timeline.body.data.recentLogins.length <= 50
        && timeline.body.data.loginCount >= timeline.body.data.recentLogins.length);

    /*
     * THE OPERATIONAL FLAG IS PRESENT AND NAMED AS SUCH - requirement 4
     * forbids conflating it with the lifecycle status.
     */
    truthy('the platform account flag is carried separately',
      Object.prototype.hasOwnProperty.call(timeline.body.data.customer, 'oracleAccountStatus'));

    /* A window beginning mid-history still shows the period it opened in. */
    const windowed = await get(server,
      '/api/admin/customer-lifecycle/customers/' + subject + '/timeline'
      + '?from=' + today + '&to=' + today);
    truthy('a narrow window still includes the period overlapping its start',
      windowed.body.data.periods.length >= 1);

    const missing = await get(server,
      '/api/admin/customer-lifecycle/customers/999999999/timeline');
    same('an unknown customer is a 404', 404, missing.status);

    /* ---------------------------------------------------------------- */
    heading('Definitions and health');

    const definitions = await get(server, '/api/admin/customer-lifecycle/definitions');
    same('the thresholds are served from the engine, not restated',
      { newDays: 30, dormantDays: 30, churnedDays: 90 },
      {
        newDays: definitions.body.data.thresholds.newDays,
        dormantDays: definitions.body.data.thresholds.dormantDays,
        churnedDays: definitions.body.data.thresholds.churnedDays
      });
    same('and measured as elapsed hours',
      'ELAPSED_HOURS', definitions.body.data.thresholds.measuredAs);

    const health = await get(server, '/api/admin/customer-lifecycle/health');
    same('health answers 200', 200, health.status);
    truthy('and reports the journal size', health.body.data.journalRows > 0);
    same('and states the watermark caveat rather than hiding it',
      true, health.body.data.completeness.watermarkIsNotAGuarantee);
  } finally {
    server.close();
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(failures
    ? failures + ' of ' + checks + ' checks FAILED'
    : 'all ' + checks + ' checks passed');
  console.log('='.repeat(60));

  return failures ? 1 : 0;
}

main().then(
  async function (code) {
    await legacy.disconnect();
    await db.destroy();
    process.exit(code);
  },
  async function (err) {
    console.error(err.stack || err.message);
    try { await legacy.disconnect(); await db.destroy(); } catch (e) { /* closing down */ }
    process.exit(1);
  }
);
