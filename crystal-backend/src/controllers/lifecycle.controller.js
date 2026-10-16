'use strict';

const { ok, page, HttpError } = require('../utils/response');
const reports = require('../services/lifecycle/reports.service');
const events = require('../services/lifecycle/events.service');
const sheets = require('../services/lifecycle/export.service');
const audit = require('../services/audit.service');
const jobs = require('../services/lifecycle/jobs.service');
const snapshots = require('../services/lifecycle/snapshots.service');
const rules = require('../services/lifecycle/rules');
const config = require('../config');

/**
 * THE LIFECYCLE REPORTS' HTTP HALF: query string in, the envelope out.
 *
 * Every handler validates before it reaches a service, because a report
 * endpoint takes more free-form input than the rest of this console - two
 * dates, a grouping, an interval, two statuses, a page and a search term -
 * and an unchecked date range is both a wrong answer and a table scan.
 *
 * WHAT IS REFUSED, AND WHY EACH ONE MATTERS:
 *
 *   a malformed date          an ISO day or nothing; a half-parsed date is a
 *                             silently wrong window
 *   a reversed range          `to` before `from` returns nothing and looks
 *                             like "no transitions", which is a lie
 *   an unbounded range        capped, because a chart of ten years of daily
 *                             buckets is four thousand points nobody reads
 *                             and a response nobody wants to send
 *   an unknown status         refused rather than ignored, or a filter for a
 *                             typo would quietly report the unfiltered total
 *   an unknown grouping       same reasoning
 *
 * NO SQL IS BUILT FROM ANY OF IT. Every value that reaches the services is
 * already a known constant or a bound parameter - requirement 13.
 */

/** The longest window a single chart request may cover. */
const MAX_RANGE_DAYS = 1100;

const GROUPINGS = ['DAY', 'WEEK', 'CUSTOM'];

/** An ISO day, or a refusal naming the parameter. */
function day(value, name, fallback) {
  if (value === undefined || value === null || value === '') {
    if (fallback !== undefined) return fallback;
    throw new HttpError(400, 'lifecycle.aDateIsRequired', null, { name: name });
  }

  const parsed = reports.dayOf(value);
  if (!parsed) throw new HttpError(400, 'lifecycle.thatIsNotADate', null, { name: name });

  return parsed;
}

/** Both ends of a window, in order and within the cap. */
function range(query) {
  const to = day(query.to, 'to', snapshots.today(config.lifecycle.reportTimezone));
  const from = day(query.from, 'from', to);

  if (from > to) throw new HttpError(400, 'lifecycle.theRangeEndsBeforeIt');

  const days = Math.round(
    (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000
  ) + 1;

  if (days > MAX_RANGE_DAYS) {
    throw new HttpError(400, 'lifecycle.thatRangeIsTooLong', null, { days: MAX_RANGE_DAYS });
  }

  return { from: from, to: to, days: days };
}

function grouping(query) {
  const groupBy = String(query.groupBy || 'DAY').toUpperCase();
  if (GROUPINGS.indexOf(groupBy) === -1) {
    throw new HttpError(400, 'lifecycle.thatIsNotAGrouping');
  }

  if (groupBy !== 'CUSTOM') return { groupBy: groupBy, intervalDays: null };

  const interval = Number(query.intervalDays);
  if (!Number.isFinite(interval) || interval < 2 || interval > 90) {
    throw new HttpError(400, 'lifecycle.aCustomIntervalIsBetween');
  }

  return { groupBy: groupBy, intervalDays: Math.round(interval) };
}

/** A status, or nothing. A typo is refused, never ignored. */
function status(value, name) {
  if (value === undefined || value === null || value === '') return null;

  const wanted = String(value).toUpperCase();
  if (reports.STATUSES.indexOf(wanted) === -1) {
    throw new HttpError(400, 'lifecycle.thatIsNotAStatus', null, { name: name });
  }

  return wanted;
}

/** The page this feature's grant is on - the audit entries say where. */
const PAGE = '/admin/crm/lifecycle';

/** The table an event lives in, which is also what the audit trail calls it. */
const EVENT_ENTITY = 'lifecycle_business_event';

/** The column widths the table has - refused here rather than by the database. */
const LIMITS = { name: 120, category: 40, description: 4000 };

/**
 * AN INSTANT, not a day.
 *
 * An event happened at a time of day and its windows are measured from that
 * instant, so this takes a full timestamp. The year bound is a typo catch:
 * '0226-09-15' parses, and a comparison centred on the third century returns
 * an empty window that looks exactly like a quiet fortnight.
 */
function instantOf(value, name) {
  if (value === undefined || value === null || value === '') {
    throw new HttpError(400, 'lifecycle.aDateIsRequired', null, { name: name });
  }

  const at = new Date(value);
  if (isNaN(at.getTime())) {
    throw new HttpError(400, 'lifecycle.thatIsNotAnInstant', null, { name: name });
  }

  const year = at.getUTCFullYear();
  if (year < 2000 || year > 2100) {
    throw new HttpError(400, 'lifecycle.thatIsNotAnInstant', null, { name: name });
  }

  return at;
}

/** One side of a comparison window, in whole days and within the cap. */
function windowDays(value) {
  if (value === undefined || value === null || value === '') {
    return events.DEFAULT_WINDOW_DAYS;
  }

  const days = Number(value);
  if (!Number.isFinite(days) || days < 1 || days > events.MAX_WINDOW_DAYS) {
    throw new HttpError(400, 'lifecycle.aWindowIsBetween', null, {
      days: events.MAX_WINDOW_DAYS
    });
  }

  return Math.round(days);
}

/** An event key from the path. */
function eventIdOf(req) {
  const id = Number(req.params.eventId);
  if (!Number.isFinite(id) || id <= 0 || Math.round(id) !== id) {
    throw new HttpError(400, 'lifecycle.thatIsNotAnEvent');
  }

  return id;
}

/**
 * An event's fields, checked before anything reaches the table.
 *
 * Length is checked here rather than left to the column, so an over-long name
 * is a refusal naming the field and its limit instead of a 500 carrying a
 * PostgreSQL message about varchar(120) to somebody filling in a form.
 */
function eventBody(req) {
  const body = req.body || {};

  const name = String(body.name === undefined || body.name === null ? '' : body.name).trim();
  if (!name || name.length > LIMITS.name) {
    throw new HttpError(400, 'lifecycle.anEventNeedsAName', null, { max: LIMITS.name });
  }

  if (body.description && String(body.description).length > LIMITS.description) {
    throw new HttpError(400, 'lifecycle.thatTextIsTooLong', null, {
      name: 'description', max: LIMITS.description
    });
  }

  if (body.category && String(body.category).trim().length > LIMITS.category) {
    throw new HttpError(400, 'lifecycle.thatTextIsTooLong', null, {
      name: 'category', max: LIMITS.category
    });
  }

  return {
    name: name,
    description: body.description,
    category: body.category,
    eventAt: instantOf(body.eventAt, 'eventAt')
  };
}

/* ------------------------------------------------------------------ */

async function overview(req, res) {
  const asOf = day(req.query.asOf, 'asOf', snapshots.today(config.lifecycle.reportTimezone));
  return ok(res, await reports.overview({ asOf: asOf }));
}

async function trend(req, res) {
  const window = range(req.query);
  const group = grouping(req.query);

  return ok(res, await reports.trend({
    from: window.from,
    to: window.to,
    groupBy: group.groupBy,
    intervalDays: group.intervalDays
  }));
}

async function transitionSummary(req, res) {
  const window = range(req.query);
  const group = grouping(req.query);

  return ok(res, await reports.transitionSummary({
    from: window.from,
    to: window.to,
    groupBy: group.groupBy,
    intervalDays: group.intervalDays
  }));
}

async function transitions(req, res) {
  const window = range(req.query);

  const result = await reports.transitions({
    from: window.from,
    to: window.to,
    fromStatus: status(req.query.fromStatus, 'fromStatus'),
    toStatus: status(req.query.toStatus, 'toStatus'),
    search: req.query.search,
    page: req.query.page,
    pageSize: req.query.pageSize
  });

  return page(res, result, { page: result.page, limit: result.limit });
}

async function customers(req, res) {
  const asOf = day(req.query.asOf, 'asOf', snapshots.today(config.lifecycle.reportTimezone));

  const result = await reports.customersInStatus({
    asOf: asOf,
    status: status(req.query.status, 'status'),
    page: req.query.page,
    pageSize: req.query.pageSize
  });

  return page(res, result, { page: result.page, limit: result.limit });
}

async function timeline(req, res) {
  const userPk = Number(req.params.userPk);
  if (!Number.isFinite(userPk) || userPk <= 0) {
    throw new HttpError(400, 'lifecycle.thatIsNotACustomer');
  }

  const found = await reports.timelineOf(userPk, {
    from: req.query.from ? day(req.query.from, 'from') : null,
    to: req.query.to ? day(req.query.to, 'to') : null
  });

  if (!found) throw new HttpError(404, 'lifecycle.noSuchCustomer');

  return ok(res, found);
}

/**
 * THE DEFINITIONS, SERVED RATHER THAN RESTATED IN THE UI.
 *
 * Requirement 12 asks for a popover explaining the rules. Reading them from
 * the same place the engine reads them means the explanation cannot drift
 * from the behaviour - which is exactly what happens when a threshold is
 * written into a help string by hand.
 */
async function definitions(req, res) {
  return ok(res, {
    basis: 'LOGIN_BASED',
    ruleVersion: config.lifecycle.ruleVersion,
    reportTimezone: config.lifecycle.reportTimezone,
    sourceTimezone: config.lifecycle.sourceTimezone,
    thresholds: {
      newDays: rules.RULES_V1.newHours / 24,
      dormantDays: rules.RULES_V1.dormantHours / 24,
      churnedDays: rules.RULES_V1.churnedHours / 24,
      measuredAs: 'ELAPSED_HOURS'
    },
    statuses: reports.STATUSES,
    notes: [
      'NEW takes precedence: for the first 30 days after registering, a'
        + ' customer is NEW however often they log in.',
      'A customer who has never logged in is measured from their'
        + ' registration, so they become DORMANT and then CHURNED with no'
        + ' login records at all.',
      'The boundaries are exact: at 30 elapsed days a customer is no longer'
        + ' ACTIVE, and at 90 they are CHURNED.',
      'This classification is based on LOGINS only. It does not measure'
        + ' purchases, support contact or any other engagement.',
      'The account status held in the platform (USERS.STATUS) is an'
        + ' operational flag and is reported separately. It is not a'
        + ' lifecycle status.'
    ]
  });
}

async function health(req, res) {
  return ok(res, await jobs.health());
}

/**
 * AN OPERATOR-TRIGGERED RECONCILIATION.
 *
 * Protected against a duplicate concurrent run by the same advisory lock the
 * schedule uses, so pressing the button twice does not start two passes over
 * the source - the second is recorded as SKIPPED and says so.
 */
async function reconcile(req, res) {
  /*
   * `req.admin`, which is what middleware/auth.js sets. This read
   * `req.manager` until phase 4 and so recorded every operator-triggered
   * reconciliation against nobody - the one field that makes the run
   * attributable, quietly null on every row.
   */
  const who = req.admin && req.admin.id;
  const outcome = await jobs.reconcile(who);

  /*
   * AND IT GOES IN THE AUDIT TRAIL TOO, not only in lifecycle_job_run.
   * Requirement 13 asks for admin-triggered reconciliations to be audited,
   * and an operator action recorded only in the feature's own table is one
   * nobody reviewing the console's trail will ever see. Recorded as an import
   * because that is what it is: it reads the whole source key space and
   * imports whatever the journal is missing.
   */
  audit.imported(req.actor, 'lifecycle_login_event', {
    trigger: 'operator',
    skipped: !!outcome.skipped,
    rowsRead: outcome.rowsRead || 0,
    rowsWritten: outcome.rowsWritten || 0,
    customersRebuilt: outcome.customersRebuilt || 0
  }, PAGE);

  if (outcome.skipped) {
    return ok(res, outcome, 'lifecycle.aReconciliationIsAlready');
  }

  return ok(res, outcome, 'lifecycle.reconciliationFinished');
}

/* ------------------------------------------------------------------ */
/*  business events                                                    */
/* ------------------------------------------------------------------ */

async function eventList(req, res) {
  return ok(res, await events.list());
}

async function eventDetail(req, res) {
  const found = await events.get(eventIdOf(req));
  if (!found) throw new HttpError(404, 'lifecycle.noSuchEvent');

  return ok(res, found);
}

/**
 * Created, and recorded.
 *
 * The audit entry is written from the ROW THAT LANDED rather than the body
 * that arrived, so the trail shows what the table holds - the key the
 * sequence chose, the authorship the server set, the timestamps the defaults
 * filled in.
 */
async function eventCreate(req, res) {
  const body = eventBody(req);
  const row = await events.create(body, req.admin && req.admin.id);

  audit.created(req.actor, EVENT_ENTITY, row.event_id, row, PAGE);

  return ok(res, events.present(row));
}

async function eventUpdate(req, res) {
  const eventId = eventIdOf(req);
  const body = eventBody(req);

  /* Read first: the trail records what MOVED, which needs both sides. */
  const before = await events.get(eventId);
  if (!before) throw new HttpError(404, 'lifecycle.noSuchEvent');

  const row = await events.update(eventId, body);
  if (!row) throw new HttpError(404, 'lifecycle.noSuchEvent');

  audit.updated(req.actor, EVENT_ENTITY, eventId, before, events.present(row), PAGE);

  return ok(res, events.present(row));
}

async function eventRemove(req, res) {
  const eventId = eventIdOf(req);

  const before = await events.get(eventId);
  if (!before) throw new HttpError(404, 'lifecycle.noSuchEvent');

  await events.remove(eventId);
  audit.deleted(req.actor, EVENT_ENTITY, eventId, before, PAGE);

  return ok(res, { eventId: eventId, deleted: true });
}

/**
 * THE COMPARISON, around a stored event or around a bare instant.
 *
 * `:eventId` may be the literal 'ad-hoc', which is requirement 12.D's "or
 * enter an event timestamp ad hoc": an operator comparing around a date they
 * heard in a meeting should not have to create a record first, and a record
 * created to answer one question is a record nobody deletes afterwards.
 */
async function eventImpact(req, res) {
  const before = windowDays(req.query.beforeDays);
  const after = windowDays(req.query.afterDays);

  const adHoc = String(req.params.eventId) === 'ad-hoc';

  const event = adHoc ? null : await events.get(eventIdOf(req));
  if (!adHoc && !event) throw new HttpError(404, 'lifecycle.noSuchEvent');

  const at = adHoc ? instantOf(req.query.eventAt, 'eventAt') : new Date(event.eventAt);

  return ok(res, await events.impact({
    event: event,
    eventAt: at,
    beforeDays: before,
    afterDays: after
  }));
}

/* ------------------------------------------------------------------ */
/*  exports                                                            */
/* ------------------------------------------------------------------ */

/**
 * ONE PLACE WHERE A SHEET IS SENT, AND IT IS AUDITED THERE.
 *
 * Every export goes through this, so there is exactly one line that decides
 * what the headers say and exactly one that writes the trail - requirement 13
 * asks for sensitive exports to be audited, and an audit call copied into
 * three handlers is an audit call that will be missing from the fourth.
 *
 * THE ROW COUNT AND THE TRUE TOTAL ARE BOTH SENT, and a truncated export says
 * so in its own header: a spreadsheet that quietly stopped at five thousand
 * of thirty-six thousand rows is one somebody will total up and believe.
 */
async function sendSheet(req, res, sheet, request) {
  const built = await sheets.workbook(sheet);

  audit.exported(req.actor, sheet.entity, request, {
    rows: built.rows,
    total: built.total,
    truncated: built.truncated,
    limit: sheets.LIMIT,
    reportTimezone: config.lifecycle.reportTimezone
  }, PAGE);

  res.setHeader('Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="' + built.filename + '"');
  res.setHeader('X-Total-Rows', String(built.rows));
  res.setHeader('X-Available-Rows', String(built.total));
  res.setHeader('X-Truncated', built.truncated ? 'true' : 'false');

  return res.send(built.buffer);
}

async function exportTransitions(req, res) {
  const window = range(req.query);

  const filters = {
    from: window.from,
    to: window.to,
    fromStatus: status(req.query.fromStatus, 'fromStatus'),
    toStatus: status(req.query.toStatus, 'toStatus'),
    search: req.query.search
  };

  return sendSheet(req, res, await sheets.transitions(filters), filters);
}

async function exportCustomers(req, res) {
  const filters = {
    asOf: day(req.query.asOf, 'asOf', snapshots.today(config.lifecycle.reportTimezone)),
    status: status(req.query.status, 'status')
  };

  return sendSheet(req, res, await sheets.customers(filters), filters);
}

async function exportTrend(req, res) {
  const window = range(req.query);
  const group = grouping(req.query);

  const filters = {
    from: window.from,
    to: window.to,
    groupBy: group.groupBy,
    intervalDays: group.intervalDays
  };

  return sendSheet(req, res, await sheets.trend(filters), filters);
}

/** The open data-quality exceptions, for the operations view. */
async function exceptions(req, res) {
  return ok(res, { rows: await jobs.exceptions(req.query.limit) });
}

module.exports = {
  overview: overview,
  trend: trend,
  transitionSummary: transitionSummary,
  transitions: transitions,
  customers: customers,
  timeline: timeline,
  definitions: definitions,
  health: health,
  reconcile: reconcile,
  exceptions: exceptions,

  eventList: eventList,
  eventDetail: eventDetail,
  eventCreate: eventCreate,
  eventUpdate: eventUpdate,
  eventRemove: eventRemove,
  eventImpact: eventImpact,

  exportTransitions: exportTransitions,
  exportCustomers: exportCustomers,
  exportTrend: exportTrend,
  /* exported for the check script */
  MAX_RANGE_DAYS: MAX_RANGE_DAYS
};
