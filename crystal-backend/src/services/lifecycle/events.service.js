'use strict';

const config = require('../../config');
const repo = require('../../repositories/lifecycle.repository');
const reports = require('./reports.service');

/**
 * BUSINESS EVENTS, AND WHAT HAPPENED AROUND THEM.
 *
 * An event here is a named instant - a campaign launch, a price change, an
 * outage - kept so that the same comparison can be drawn again next month
 * without somebody having to remember the date. Requirement 7.6.
 *
 * WHAT A COMPARISON IS, AND WHAT IT IS NOT
 *
 * The impact view answers three different questions about one instant, and
 * they disagree on purpose:
 *
 *   THE BOUNDARIES are stock - how many customers were in each status at the
 *   window's start, at the event itself, and at the window's end. Stock is
 *   never summed across boundaries; it is three photographs.
 *
 *   THE FLOWS are the transitions inside each half-window. A customer who
 *   went DORMANT and came back contributes two of them.
 *
 *   THE COHORT is one pair per customer: where the SAME population stood at
 *   the start and where it stood at the end. The customer above contributes
 *   one unchanged pair, because the population is where it began.
 *
 * So a dashboard reading only the flows would report that two things
 * happened; reading only the cohort it would report that nothing did. Both
 * are true of different questions, which is why all three are returned and
 * each carries its own metric type - requirement 5.
 *
 * THE COHORT IS FIXED AT THE WINDOW'S START. Customers who registered inside
 * the window have no status at the start, so they are not in it - otherwise
 * the "after" column would be inflated by arrivals the event cannot have
 * moved anywhere, and a campaign that recruited well would appear to have
 * made existing customers more active. How many were excluded is returned,
 * because a denominator nobody can see is a denominator nobody can check
 * (requirement 12.D).
 *
 * AND NO CAUSALITY IS CLAIMED. A before/after difference around an instant is
 * a correlation: the window also contains every other thing that happened
 * that fortnight, the season included. The caveat travels with the numbers
 * rather than living in a comment here, because the person reading the chart
 * is the person who needs it - requirements 7.6 and 12.D.
 */

/** The longest half-window a comparison may ask for, in days. */
const MAX_WINDOW_DAYS = 180;

/** The default on each side, which is requirement 11's example. */
const DEFAULT_WINDOW_DAYS = 7;

/* ------------------------------------------------------------------ */
/*  the events themselves                                             */
/* ------------------------------------------------------------------ */

function present(row) {
  if (!row) return null;

  return {
    eventId: Number(row.event_id),
    name: row.name,
    description: row.description,
    category: row.category,
    eventAt: row.event_at,
    createdBy: row.created_by === null ? null : Number(row.created_by),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function list() {
  const rows = await repo.events();
  return { rows: rows.map(present), total: rows.length };
}

async function get(eventId) {
  return present(await repo.eventOf(eventId));
}

/**
 * The columns a request may set, and only those.
 *
 * Built field by field rather than from the body, so a request carrying
 * `event_id`, `created_by` or `created_at` cannot rewrite the key, claim
 * somebody else's authorship or backdate the record. Requirement 13 asks for
 * no SQL to be built from input; this takes the same idea one step further
 * back and does not trust the shape of the body either.
 */
function columnsOf(body, actorId, creating) {
  const row = {
    name: String(body.name).trim(),
    description: body.description === undefined || body.description === null
      ? null
      : String(body.description),
    category: body.category === undefined || body.category === null || body.category === ''
      ? null
      : String(body.category).trim(),
    event_at: body.eventAt
  };

  /* Authorship is recorded once, by the server, from the signed-in admin. */
  if (creating) row.created_by = actorId === undefined ? null : actorId;

  return row;
}

function create(body, actorId) {
  return repo.insertEvent(columnsOf(body, actorId, true));
}

function update(eventId, body) {
  return repo.updateEvent(eventId, columnsOf(body, null, false));
}

function remove(eventId) {
  return repo.deleteEvent(eventId);
}

/* ------------------------------------------------------------------ */
/*  the comparison                                                     */
/* ------------------------------------------------------------------ */

/** The cohort's size is the sum of its pairs - one pair per customer. */
function cohortSizeOf(pairs) {
  return pairs.reduce(function (sum, pair) { return sum + pair.customers; }, 0);
}

/**
 * ONE INSTANT, THREE BOUNDARIES, TWO WINDOWS AND ONE COHORT.
 *
 * `eventAt` may come from a stored event or straight from the request -
 * requirement 12.D asks for both, because an operator comparing around a date
 * they heard in a meeting should not have to create a record first.
 */
async function impact(options) {
  const beforeDays = options.beforeDays || DEFAULT_WINDOW_DAYS;
  const afterDays = options.afterDays || DEFAULT_WINDOW_DAYS;

  const eventAt = options.eventAt instanceof Date
    ? options.eventAt
    : new Date(options.eventAt);

  const start = await reports.shiftDays(eventAt, -beforeDays);
  const end = await reports.shiftDays(eventAt, afterDays);

  const stock = await Promise.all([
    reports.stockAt(start),
    reports.stockAt(eventAt),
    reports.stockAt(end)
  ]);

  const flows = await Promise.all([
    reports.matrixBetween(start, eventAt),
    reports.matrixBetween(eventAt, end),
    reports.cohortMatrix(start, end)
  ]);

  const before = flows[0];
  const after = flows[1];
  const pairs = flows[2];

  const atEnd = stock[2];
  const cohortSize = cohortSizeOf(pairs);
  const unchanged = cohortSizeOf(pairs.filter(function (pair) { return pair.unchanged; }));

  return {
    reportTimezone: config.lifecycle.reportTimezone,
    ruleVersion: config.lifecycle.ruleVersion,

    event: options.event || null,
    eventAt: eventAt,

    window: {
      beforeDays: beforeDays,
      afterDays: afterDays,
      start: start,
      end: end,
      convention: '[start, event) and [event, end) - a transition exactly at'
        + ' the event belongs to the after window'
    },

    /*
     * THREE PHOTOGRAPHS, NOT A SERIES TO ADD UP. Each is the whole registered
     * population at that instant, so the same customer is in all three.
     */
    boundaries: {
      metricType: 'STOCK_AT_INSTANT',
      atWindowStart: stock[0],
      atEvent: stock[1],
      atWindowEnd: atEnd
    },

    flows: {
      metricType: 'TRANSITION_FLOW',
      before: before,
      after: after,
      /*
       * The difference an operator reads first, stated rather than left to be
       * worked out - and as events, which is what each side counts. The two
       * windows may be different lengths, which would make a bare difference
       * misleading, so the per-day rate is given beside it.
       */
      difference: {
        events: after.events - before.events,
        uniqueCustomers: after.uniqueCustomers - before.uniqueCustomers,
        beforeEventsPerDay: Number((before.events / beforeDays).toFixed(2)),
        afterEventsPerDay: Number((after.events / afterDays).toFixed(2))
      }
    },

    cohort: {
      metricType: 'COHORT_ENDPOINT_MIGRATION',
      basis: 'FIXED_AT_WINDOW_START',
      size: cohortSize,
      unchanged: unchanged,
      moved: cohortSize - unchanged,
      matrix: pairs,

      /*
       * The denominator, in full. Everybody registered by the window's start
       * is in the cohort; everybody who arrived during it is not, and is
       * counted here so that the two add up to the population at the end.
       */
      registeredDuringWindow: Math.max(0, atEnd.TOTAL - cohortSize),
      note: 'One pair per customer: where this fixed population stood at the'
        + ' window start and where the same customers stood at its end.'
        + ' Customers who registered inside the window are excluded, because'
        + ' they had no status to move from.'
    },

    caution: 'A before/after difference around an instant is a correlation.'
      + ' The window contains everything else that happened in it, including'
      + ' seasonal effects, so these numbers do not establish that the event'
      + ' caused the change.'
  };
}

module.exports = {
  MAX_WINDOW_DAYS: MAX_WINDOW_DAYS,
  DEFAULT_WINDOW_DAYS: DEFAULT_WINDOW_DAYS,

  list: list,
  get: get,
  create: create,
  update: update,
  remove: remove,
  present: present,
  impact: impact
};
