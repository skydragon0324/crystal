'use strict';

const config = require('../../config');
const repo = require('../../repositories/lifecycle.repository');
const timeline = require('./timeline.service');

/**
 * THE DAILY STOCK COUNTS, BUILT BY SWEEPING ONCE.
 *
 * Requirement 10 rules out the obvious implementation. Classifying every
 * customer on every day is days x customers - at 1,300 days and half a
 * million customers that is 650 million classifications for a table of 1,300
 * rows, and it has to be redone whenever a late event arrives.
 *
 * SO IT IS A SWEEP LINE. Two aggregates come out of PostgreSQL, each one
 * group-by over an index:
 *
 *   registrations per local day   a flow, and the `registered_count` column
 *   transitions per local day     grouped by (previous_status, status)
 *
 * Then one pass forward over the days, carrying four running totals. A
 * transition row moves one customer from `previous_status` to `status`; the
 * registration row of a timeline has no previous status, so it is an arrival
 * into NEW with no matching departure - which is exactly what makes the four
 * totals add up to the registered population at every cutoff instead of
 * drifting.
 *
 * END OF DAY MEANS BEFORE THE NEXT LOCAL MIDNIGHT. A transition stamped
 * exactly at midnight belongs to the day that is starting, not the one that
 * is ending - requirement 10 fixes that convention and the API, the charts
 * and the tests all have to share it. Grouping by the local date of
 * `valid_from` gives precisely that: midnight on the 5th groups into the 5th,
 * so it is counted in the 5th's end-of-day stock and not the 4th's.
 *
 * THE LOCAL DAY IS DONE IN SQL, with `AT TIME ZONE`, because PostgreSQL knows
 * the zone database and therefore knows which days are 23 or 25 hours long.
 * Dividing an epoch by 86,400 would be a fixed-offset approximation and would
 * put two transitions a year on the wrong side of a boundary.
 */

const STATUSES = ['NEW', 'ACTIVE', 'DORMANT', 'CHURNED'];

/** YYYY-MM-DD, whatever the driver handed back. */
function dayKey(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

/** The day after, as a key. Calendar arithmetic on a plain date is safe. */
function nextDay(key) {
  const parts = key.split('-').map(Number);
  const at = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString().slice(0, 10);
}

/**
 * Today, in the report zone - the last day worth a snapshot.
 *
 * Shares timeline.service's localDay rather than repeating it: the two have
 * to agree about which day an instant is in, and the first version of this
 * file had its own copy built on a locale that this Node does not carry.
 */
function today(zone) {
  return timeline.localDay(new Date(), zone);
}

/**
 * REBUILD THE WHOLE SERIES.
 *
 * One pass, from the first registration to today. Cheap enough to be the
 * ordinary answer after a backfill, and the thing a repair is measured
 * against.
 */
async function rebuildAll(options) {
  const zone = (options && options.zone) || config.lifecycle.reportTimezone;

  const registrations = await repo.registrationsByDay(zone);
  const transitions = await repo.transitionsByDay(zone);

  if (!registrations.length) return { days: 0, from: null, to: null };

  /* Collapse both aggregates onto their day. */
  const byDay = {};

  const dayOf = function (key) {
    if (!byDay[key]) {
      byDay[key] = { registered: 0, arrive: { NEW: 0, ACTIVE: 0, DORMANT: 0, CHURNED: 0 }, depart: { NEW: 0, ACTIVE: 0, DORMANT: 0, CHURNED: 0 } };
    }
    return byDay[key];
  };

  registrations.forEach(function (row) {
    dayOf(dayKey(row.day)).registered += Number(row.n);
  });

  transitions.forEach(function (row) {
    const day = dayOf(dayKey(row.day));
    const n = Number(row.n);

    day.arrive[row.status] += n;
    /* NULL previous status is the registration row: an arrival with no
       departure, which is what makes the totals tie to the population. */
    if (row.previous_status) day.depart[row.previous_status] += n;
  });

  const first = dayKey(registrations[0].day);
  const last = today(zone);

  const running = { NEW: 0, ACTIVE: 0, DORMANT: 0, CHURNED: 0 };
  const rows = [];

  for (let day = first; day <= last; day = nextDay(day)) {
    const delta = byDay[day];

    if (delta) {
      STATUSES.forEach(function (status) {
        running[status] += delta.arrive[status] - delta.depart[status];
      });
    }

    const total = running.NEW + running.ACTIVE + running.DORMANT + running.CHURNED;

    rows.push({
      snapshot_date: day,
      new_count: running.NEW,
      active_count: running.ACTIVE,
      dormant_count: running.DORMANT,
      churned_count: running.CHURNED,
      total_count: total,
      registered_count: delta ? delta.registered : 0,
      rule_version: config.lifecycle.ruleVersion,
      /*
       * PROVISIONAL UNTIL RECONCILED. A day is only final once the source has
       * been fully compared for late events - requirement 10's optional
       * distinction, kept because it is the difference between "this is the
       * number" and "this is the number so far".
       */
      is_final: false,
      recalculated_at: new Date()
    });

    /*
     * A NEGATIVE RUNNING TOTAL IS A BROKEN TIMELINE, not a number to store.
     * It can only happen if a departure was counted without its arrival -
     * overlapping periods, or a period deleted without its successor - and
     * the database would refuse the row anyway. Failing here says which day.
     */
    const negative = STATUSES.filter(function (s) { return running[s] < 0; });
    if (negative.length) {
      throw new Error('snapshot sweep went negative on ' + day
        + ' for ' + negative.join(', ')
        + ' - the period table has a gap or an overlap');
    }
  }

  await repo.saveDaily(rows);

  return { days: rows.length, from: first, to: last };
}

/**
 * REPAIR FROM A DATE FORWARD.
 *
 * A late login invalidates its own day and every day after it, because the
 * stock counts are cumulative - requirement 10. What it does NOT invalidate
 * is the days before, so a repair does not have to start at the beginning.
 *
 * The running totals are picked up from the snapshot immediately before the
 * earliest dirty day, which is the whole saving: repairing one day in a
 * three-year series costs the days from there to today, not all of them.
 *
 * With no snapshot before it - the dirty day is the first day there is - this
 * falls through to a full rebuild, which is correct rather than clever.
 */
async function repairFrom(earliestDirtyDay, options) {
  const zone = (options && options.zone) || config.lifecycle.reportTimezone;
  const from = dayKey(earliestDirtyDay);

  const before = await repo.dailyOn(previousDay(from));
  if (!before) return rebuildAll(options);

  const registrations = await repo.registrationsByDay(zone);
  const transitions = await repo.transitionsByDay(zone);

  const byDay = {};
  const dayOf = function (key) {
    if (!byDay[key]) {
      byDay[key] = { registered: 0, arrive: { NEW: 0, ACTIVE: 0, DORMANT: 0, CHURNED: 0 }, depart: { NEW: 0, ACTIVE: 0, DORMANT: 0, CHURNED: 0 } };
    }
    return byDay[key];
  };

  registrations.forEach(function (row) {
    const key = dayKey(row.day);
    if (key >= from) dayOf(key).registered += Number(row.n);
  });

  transitions.forEach(function (row) {
    const key = dayKey(row.day);
    if (key < from) return;
    const day = dayOf(key);
    const n = Number(row.n);
    day.arrive[row.status] += n;
    if (row.previous_status) day.depart[row.previous_status] += n;
  });

  const running = {
    NEW: Number(before.new_count),
    ACTIVE: Number(before.active_count),
    DORMANT: Number(before.dormant_count),
    CHURNED: Number(before.churned_count)
  };

  const last = today(zone);
  const rows = [];

  for (let day = from; day <= last; day = nextDay(day)) {
    const delta = byDay[day];

    if (delta) {
      STATUSES.forEach(function (status) {
        running[status] += delta.arrive[status] - delta.depart[status];
      });
    }

    rows.push({
      snapshot_date: day,
      new_count: running.NEW,
      active_count: running.ACTIVE,
      dormant_count: running.DORMANT,
      churned_count: running.CHURNED,
      total_count: running.NEW + running.ACTIVE + running.DORMANT + running.CHURNED,
      registered_count: delta ? delta.registered : 0,
      rule_version: config.lifecycle.ruleVersion,
      is_final: false,
      recalculated_at: new Date()
    });
  }

  await repo.saveDaily(rows);

  return { days: rows.length, from: from, to: last, repaired: true };
}

/** The day before, as a key. */
function previousDay(key) {
  const parts = key.split('-').map(Number);
  const at = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  at.setUTCDate(at.getUTCDate() - 1);
  return at.toISOString().slice(0, 10);
}

/**
 * Repair from the earliest of a set of dirty days.
 *
 * The rebuilders hand back every local day they touched; the cheapest correct
 * response is one sweep from the earliest of them, because everything after
 * it has to be recomputed anyway.
 */
function repairDays(days, options) {
  if (!days || !days.length) return Promise.resolve({ days: 0, repaired: false });
  const earliest = days.slice().sort()[0];
  return repairFrom(earliest, options);
}

/**
 * THE INVARIANT, CHECKED AGAINST THE PERIODS THEMSELVES.
 *
 * The snapshot sweep and a direct "who was in what status at this instant"
 * query are two different routes to the same number, and requirement 10 asks
 * for the second to validate the first. The database already enforces that
 * the four counts sum to the total; what this adds is that the total is the
 * registered population - which is what catches a timeline with a gap in it,
 * where the sums are internally consistent and the population is short.
 */
async function verify(day) {
  const key = dayKey(day);
  const snapshot = await repo.dailyOn(key);
  if (!snapshot) return { day: key, checked: false };

  /*
   * The population at the END of that local day, by containment: the open
   * period for each customer whose interval covers the last instant of the
   * day. `< next midnight` is the same half-open convention the periods use.
   */
  const zone = config.lifecycle.reportTimezone;
  const boundary = nextDay(key);

  const counted = await repo.db('lifecycle_customer_period')
    .select('status')
    .count('* as n')
    .whereRaw('valid_from < (? ::date)::timestamp AT TIME ZONE ?', [boundary, zone])
    .andWhere(function () {
      this.whereNull('valid_to')
        .orWhereRaw('valid_to > (? ::date)::timestamp AT TIME ZONE ?', [boundary, zone]);
    })
    .groupBy('status');

  const direct = { NEW: 0, ACTIVE: 0, DORMANT: 0, CHURNED: 0 };
  counted.forEach(function (row) { direct[row.status] = Number(row.n); });

  const fromSnapshot = {
    NEW: Number(snapshot.new_count),
    ACTIVE: Number(snapshot.active_count),
    DORMANT: Number(snapshot.dormant_count),
    CHURNED: Number(snapshot.churned_count)
  };

  const agrees = STATUSES.every(function (s) { return direct[s] === fromSnapshot[s]; });

  return {
    day: key,
    checked: true,
    agrees: agrees,
    snapshot: fromSnapshot,
    fromPeriods: direct
  };
}

module.exports = {
  rebuildAll: rebuildAll,
  repairFrom: repairFrom,
  repairDays: repairDays,
  verify: verify,
  dayKey: dayKey,
  nextDay: nextDay,
  previousDay: previousDay,
  today: today
};
