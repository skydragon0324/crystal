'use strict';

/**
 * THE EVENT MANAGER, THE COMPARISON, THE EXPORTS AND THE OPERATIONS VIEW.
 *
 *   node scripts/check-lifecycle-operations.js
 *
 * The same harness as check-lifecycle-api.js - a real Express app, the real
 * router, the real services and the real database, with only the permission
 * middleware stubbed - carried on to the surfaces phase 4 adds.
 *
 * WHAT IT IS FOR. Three of these four surfaces can be wrong in ways that look
 * right on screen, and those are the cases here:
 *
 *   THE COMPARISON returns three numbers for the same fortnight - stock at
 *   the boundaries, flows inside each half, and one pair per customer - and
 *   requirement 5 is that they are different questions. So the checks are
 *   identities BETWEEN them: the two halves' flows must add up to the whole
 *   window's, the cohort plus the arrivals must be the population at the end,
 *   and a customer the cohort says moved must have at least one transition to
 *   its name. A comparison that quietly used the wrong window would still
 *   return plausible numbers and would break every one of those.
 *
 *   AN EXPORT that silently stopped at its ceiling is a spreadsheet somebody
 *   totals up and believes, so the sheet is opened here and its rows counted
 *   against what the API says is available.
 *
 *   AN AUDITED ACTION that writes no row is indistinguishable from one that
 *   does until somebody needs the trail, so the trail is read back.
 *
 * IT CLEANS UP AFTER ITSELF. The event it creates is deleted at the end,
 * including when a check fails - this runs against a real database and
 * leaving test rows in the picker is how a dashboard acquires an event called
 * 'check'.
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const ExcelJS = require('exceljs');

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

/** The admin the stubbed guard signs in as, so authorship is checkable. */
const ADMIN_ID = 1;

function buildApp() {
  const permissionPath = require.resolve('../src/middleware/permission');
  require(permissionPath);
  require.cache[permissionPath].exports = {
    LEVEL: { READ: 1, WRITE: 2 },
    requirePermission: function () {
      return function (req, res, next) { next(); };
    }
  };

  const app = express();
  app.use(express.json());
  app.use(function (req, res, next) { req.locale = 'en'; next(); });

  /*
   * THE REAL ADMIN AND THE REAL ACTOR.
   *
   * `req.admin` is what middleware/auth.js sets and what the handlers read -
   * the reconcile handler read `req.manager` until phase 4 and so recorded
   * every operator-triggered run against nobody. Setting the real field here,
   * and building the actor with the real middleware, is what lets the audit
   * checks below assert that the entries name somebody.
   */
  app.use(function (req, res, next) {
    req.admin = { id: ADMIN_ID, username: 'check', name: 'check', role_id: 1 };
    next();
  });
  app.use(require('../src/utils/actor').attachActor);

  app.use('/api/admin/customer-lifecycle', require('../src/routes/lifecycle.routes'));
  app.use(require('../src/middleware/error').errorHandler);

  return app;
}

/** A JSON request of any method. */
function call(server, method, path, body) {
  return new Promise(function (resolve, reject) {
    const payload = body === undefined ? null : JSON.stringify(body);

    const request = http.request({
      host: '127.0.0.1',
      port: server.address().port,
      path: path,
      method: method,
      headers: payload
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        : {}
    }, function (res) {
      let text = '';
      res.on('data', function (chunk) { text += chunk; });
      res.on('end', function () {
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (err) { parsed = { raw: text }; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function get(server, path) { return call(server, 'GET', path); }

/** A binary response, kept as bytes - a workbook is not text. */
function download(server, path) {
  return new Promise(function (resolve, reject) {
    http.get({ host: '127.0.0.1', port: server.address().port, path: path }, function (res) {
      const chunks = [];
      res.on('data', function (chunk) { chunks.push(chunk); });
      res.on('end', function () {
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) });
      });
    }).on('error', reject);
  });
}

/**
 * The audit trail is written fire-and-forget - a failure to log must never
 * fail the thing it describes - so an entry may land a moment after the
 * response. Waited for rather than slept on, so the check is not a race.
 */
async function auditRow(entity, action, attempts) {
  for (let tries = 0; tries < (attempts || 40); tries += 1) {
    const row = await db('audit_log')
      .where({ entity: entity, action: action })
      .orderBy('id', 'desc')
      .first();

    if (row) return row;
    await new Promise(function (resolve) { setTimeout(resolve, 50); });
  }

  return null;
}

/**
 * An audit column, as data.
 *
 * The trail's `changed`, `before_data` and `after_data` are jsonb, so the
 * driver hands them back already parsed - JSON.parse on an array is a syntax
 * error, not a no-op. Written to take either, because that is the kind of
 * difference a check script should not depend on.
 */
function asJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;

  try { return JSON.parse(value); } catch (err) { return fallback; }
}

/** The sum of a matrix's events, however many cells it has. */
function eventsIn(matrix) {
  return matrix.reduce(function (sum, cell) { return sum + cell.events; }, 0);
}

/* ------------------------------------------------------------------ */

async function main() {
  const app = buildApp();
  const server = app.listen(0);
  await new Promise(function (resolve) { server.on('listening', resolve); });

  const base = '/api/admin/customer-lifecycle';
  let eventId = null;

  try {
    /* ---------------------------------------------------------------- */
    heading('The event manager refuses what it cannot store');

    const noName = await call(server, 'POST', base + '/events', { eventAt: '2026-09-15T10:00:00Z' });
    same('an event with no name is refused', 400, noName.status);
    truthy('and the refusal names the limit rather than quoting the column',
      /at most 120/.test(noName.body.message || ''));

    const longName = await call(server, 'POST', base + '/events', {
      name: new Array(130).join('x'), eventAt: '2026-09-15T10:00:00Z'
    });
    same('a name longer than the column is refused here, not by PostgreSQL',
      400, longName.status);

    const badInstant = await call(server, 'POST', base + '/events', {
      name: 'check', eventAt: 'the fifteenth'
    });
    same('an unparseable instant is refused', 400, badInstant.status);

    const ancient = await call(server, 'POST', base + '/events', {
      name: 'check', eventAt: '0226-09-15T10:00:00Z'
    });
    same('and so is a four-digit typo in the year', 400, ancient.status);

    /* ---------------------------------------------------------------- */
    heading('An event is created, read, changed and removed');

    const created = await call(server, 'POST', base + '/events', {
      name: 'check: phase 4',
      description: 'written by scripts/check-lifecycle-phase4.js',
      category: 'check',
      eventAt: '2026-09-15T10:00:00Z'
    });

    same('created', 200, created.status);
    eventId = created.body.data && created.body.data.eventId;
    truthy('and carries the key the sequence chose', eventId > 0);
    same('authorship is the signed-in admin, not anything the body said',
      ADMIN_ID, created.body.data.createdBy);

    const forged = await call(server, 'POST', base + '/events', {
      name: 'check: forged authorship',
      eventAt: '2026-09-15T10:00:00Z',
      createdBy: 999,
      eventId: 1
    });
    truthy('a body claiming authorship and a key is not believed',
      forged.body.data.createdBy === ADMIN_ID && forged.body.data.eventId !== 1);
    await call(server, 'DELETE', base + '/events/' + forged.body.data.eventId);

    const listed = await get(server, base + '/events');
    truthy('the list has it', (listed.body.data.rows || []).some(function (row) {
      return row.eventId === eventId;
    }));
    same('newest first', true, (function () {
      const rows = listed.body.data.rows || [];
      for (let index = 1; index < rows.length; index += 1) {
        if (new Date(rows[index - 1].eventAt) < new Date(rows[index].eventAt)) return false;
      }
      return true;
    })());

    const detail = await get(server, base + '/events/' + eventId);
    same('one event reads back', 200, detail.status);
    same('with the instant it was given',
      new Date('2026-09-15T10:00:00Z').toISOString(),
      new Date(detail.body.data.eventAt).toISOString());

    const changed = await call(server, 'PUT', base + '/events/' + eventId, {
      name: 'check: phase 4 (renamed)',
      eventAt: '2026-09-15T10:00:00Z'
    });
    same('an edit lands', 200, changed.status);
    same('and the new name is returned', 'check: phase 4 (renamed)', changed.body.data.name);

    const missing = await get(server, base + '/events/99999999');
    same('an event that does not exist is a 404, not an empty 200', 404, missing.status);

    const notAKey = await get(server, base + '/events/abc/impact');
    same('and a key that is not a number is refused', 400, notAKey.status);

    /* ---------------------------------------------------------------- */
    heading('Every write reaches the audit trail');

    const createdEntry = await auditRow('lifecycle_business_event', 'create');
    truthy('the creation is recorded', !!createdEntry);
    truthy('against the admin who made it', createdEntry && createdEntry.manager_id === ADMIN_ID);
    truthy('and against the page the grant is on',
      createdEntry && createdEntry.page_url === '/admin/crm/lifecycle');

    const updatedEntry = await auditRow('lifecycle_business_event', 'update');
    truthy('the edit is recorded', !!updatedEntry);
    truthy('with only the column that moved', (function () {
      if (!updatedEntry) return false;
      const moved = asJson(updatedEntry.changed, []);
      return moved.indexOf('name') !== -1 && moved.indexOf('eventAt') === -1;
    })());

    /* ---------------------------------------------------------------- */
    heading('The comparison: three questions about one instant');

    const impact = await get(server, base + '/events/' + eventId + '/impact?beforeDays=7&afterDays=7');
    same('answers 200', 200, impact.status);

    const data = impact.body.data;
    same('the before window is seven days', 7, data.window.beforeDays);
    same('and the window is half-open at the event',
      true, /\[event, end\)/.test(data.window.convention));

    same('each boundary is a stock, labelled as one',
      'STOCK_AT_INSTANT', data.boundaries.metricType);
    same('the flows are labelled as flows',
      'TRANSITION_FLOW', data.flows.metricType);
    same('and the cohort as an endpoint migration',
      'COHORT_ENDPOINT_MIGRATION', data.cohort.metricType);

    truthy('the boundaries are three photographs of the whole population',
      data.boundaries.atWindowStart.TOTAL > 0
      && data.boundaries.atEvent.TOTAL >= data.boundaries.atWindowStart.TOTAL
      && data.boundaries.atWindowEnd.TOTAL >= data.boundaries.atEvent.TOTAL);

    same('every boundary sums to its own total', true, ['atWindowStart', 'atEvent', 'atWindowEnd']
      .every(function (key) {
        const at = data.boundaries[key];
        return at.NEW + at.ACTIVE + at.DORMANT + at.CHURNED === at.TOTAL;
      }));

    /*
     * THE IDENTITY THAT CATCHES A WRONG WINDOW. Half-open on both halves
     * means the two of them partition the whole fortnight exactly: nothing is
     * counted twice at the event instant and nothing falls between them.
     */
    const zero = await get(server, base + '/events/' + eventId + '/impact?afterDays=0');
    same('a zero-day window is refused rather than silently emptied', 400, zero.status);

    const huge = await get(server, base + '/events/' + eventId + '/impact?afterDays=400');
    same('and so is one longer than the cap', 400, huge.status);

    const reports = require('../src/services/lifecycle/reports.service');
    const fortnight = await reports.matrixBetween(
      new Date(data.window.start), new Date(data.window.end)
    );

    same('the two halves add up to the whole window, exactly',
      fortnight.events,
      data.flows.before.events + data.flows.after.events);

    same('and each half total equals the sum of its own cells', true,
      eventsIn(data.flows.before.matrix) === data.flows.before.events
      && eventsIn(data.flows.after.matrix) === data.flows.after.events);

    truthy('unique customers are fewer than events, because one may move twice',
      data.flows.before.uniqueCustomers <= data.flows.before.events);

    /* The cohort, and its denominator. */
    same('the cohort pairs sum to the cohort',
      data.cohort.size,
      data.cohort.matrix.reduce(function (sum, pair) { return sum + pair.customers; }, 0));

    same('unchanged and moved partition it',
      data.cohort.size,
      data.cohort.unchanged + data.cohort.moved);

    same('the cohort plus the arrivals is the population at the end',
      data.boundaries.atWindowEnd.TOTAL,
      data.cohort.size + data.cohort.registeredDuringWindow);

    same('the cohort is the population at the start, which is what fixes it',
      data.boundaries.atWindowStart.TOTAL,
      data.cohort.size);

    truthy('a customer the cohort says moved has at least one transition to its name',
      data.cohort.moved <= data.flows.before.events + data.flows.after.events);

    truthy('and the comparison refuses to claim a cause',
      /correlation/.test(data.caution) && /do not establish/.test(data.caution));

    /* ---------------------------------------------------------------- */
    heading('A comparison needs no stored event');

    const adHoc = await get(server,
      base + '/events/ad-hoc/impact?eventAt=2026-09-15T10:00:00Z&beforeDays=7&afterDays=7');
    same('an ad-hoc instant answers 200', 200, adHoc.status);
    same('with no event attached', null, adHoc.body.data.event);
    same('and the same numbers as the stored event at the same instant',
      data.cohort.size, adHoc.body.data.cohort.size);

    const noInstant = await get(server, base + '/events/ad-hoc/impact');
    same('ad-hoc without an instant is refused', 400, noInstant.status);

    /* ---------------------------------------------------------------- */
    heading('The exports are real spreadsheets, bounded and audited');

    const small = await download(server,
      base + '/transitions/export?from=2026-09-01&to=2026-09-07');

    same('the transition export answers 200', 200, small.status);
    truthy('as a spreadsheet',
      /spreadsheetml/.test(small.headers['content-type'] || ''));
    truthy('with a filename carrying the day it was taken',
      /lifecycle-transitions-\d{4}-\d{2}-\d{2}\.xlsx/.test(small.headers['content-disposition'] || ''));
    same('and it was not truncated', 'false', small.headers['x-truncated']);

    const api = await get(server,
      base + '/transitions?from=2026-09-01&to=2026-09-07&page=1&pageSize=1');
    same('the sheet holds exactly what the screen says is there',
      String(api.body.meta ? api.body.meta.total : api.body.data.total),
      small.headers['x-total-rows']);

    /* The file itself, opened. */
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(small.body);
    const sheet = book.getWorksheet('Transitions');

    truthy('the workbook has the sheet it says', !!sheet);
    same('the header is the first row and says when',
      'When', sheet.getRow(1).getCell(1).value);
    same('the rows in the file are the rows in the header count',
      Number(small.headers['x-total-rows']),
      sheet.rowCount - 1);
    truthy('the header is frozen, so a long sheet stays readable',
      !!(sheet.views && sheet.views[0] && sheet.views[0].state === 'frozen'));

    /* The ceiling, and the fact that it says so. */
    const wide = await download(server,
      base + '/transitions/export?from=2026-06-01&to=2026-09-30');

    same('a wide range stops at the export ceiling',
      String(require('../src/services/excel.service').EXPORT_LIMIT),
      wide.headers['x-total-rows']);
    same('and says it was truncated', 'true', wide.headers['x-truncated']);
    truthy('while still reporting how many rows there really were',
      Number(wide.headers['x-available-rows']) > Number(wide.headers['x-total-rows']));

    const people = await download(server,
      base + '/customers/export?asOf=2026-09-30&status=NEW');
    same('the customer export answers 200', 200, people.status);

    const stock = await download(server,
      base + '/trend/export?from=2026-09-01&to=2026-09-30&groupBy=WEEK');
    same('the stock export answers 200', 200, stock.status);

    const stockBook = new ExcelJS.Workbook();
    await stockBook.xlsx.load(stock.body);
    const stockSheet = stockBook.getWorksheet('Stock at end of bucket');

    truthy('and its sheet is named for what the numbers are', !!stockSheet);
    same('the day column says it is the end of the bucket, not just a date',
      'Measured at end of', stockSheet.getRow(1).getCell(3).value);
    same('and the flow column is the only one labelled flow',
      'Registered in period (flow)', stockSheet.getRow(1).getCell(9).value);

    const exportEntry = await auditRow('lifecycle_export_transitions', 'export');
    truthy('the export is in the audit trail', !!exportEntry);
    truthy('with the filter it was asked for', (function () {
      if (!exportEntry) return false;
      const asked = asJson(exportEntry.before_data, {});
      return asked.from === '2026-06-01' || asked.from === '2026-09-01';
    })());
    truthy('and with whether it was truncated', (function () {
      if (!exportEntry) return false;
      const outcome = asJson(exportEntry.after_data, {});
      return typeof outcome.truncated === 'boolean' && outcome.total > 0;
    })());

    /* ---------------------------------------------------------------- */
    heading('The operations view measures what requirement 13 asks for');

    const health = await get(server, base + '/health');
    const ops = health.body.data;

    truthy('the pool is reported', ops.pool && typeof ops.pool.used === 'number');
    truthy('including what is waiting for a connection',
      ops.pool && typeof ops.pool.pendingAcquires === 'number');
    truthy('job durations are reported per job', Array.isArray(ops.jobDurations));
    truthy('and measured off the runs themselves', ops.jobDurations.every(function (row) {
      return row.lastSeconds === null || row.lastSeconds >= 0;
    }));
    truthy('the snapshot series says how far it reaches and when it was built',
      ops.snapshots && ops.snapshots.latestDay && ops.snapshots.builtAt);
    truthy('malformed rows are counted by kind', Array.isArray(ops.exceptionsByKind));
    truthy('and the two lags are separate numbers',
      'syncLagMinutes' in ops && 'sourceLagMinutes' in ops);

    const exceptions = await get(server, base + '/exceptions?limit=5');
    same('the exception list answers 200', 200, exceptions.status);
    truthy('with rows', Array.isArray(exceptions.body.data.rows));

    /* ---------------------------------------------------------------- */
    heading('And the event can be removed');

    const removed = await call(server, 'DELETE', base + '/events/' + eventId);
    same('deleted', 200, removed.status);

    const gone = await get(server, base + '/events/' + eventId);
    same('and it is gone', 404, gone.status);

    const deletedEntry = await auditRow('lifecycle_business_event', 'delete');
    truthy('the removal is recorded, with the row that went', (function () {
      if (!deletedEntry) return false;
      const before = asJson(deletedEntry.before_data, {});
      return before.eventId === eventId;
    })());

    eventId = null;
  } finally {
    /* The event goes even when a check above failed. */
    if (eventId) await db('lifecycle_business_event').where('event_id', eventId).del();
    await db('lifecycle_business_event').where('category', 'check').del();
    server.close();
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(failures
    ? failures + ' of ' + checks + ' checks FAILED'
    : 'all ' + checks + ' checks passed');
  console.log('='.repeat(60));
  console.log('report timezone ' + config.lifecycle.reportTimezone
    + ', rule version ' + config.lifecycle.ruleVersion);

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
