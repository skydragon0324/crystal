'use strict';

const db = require('../../config/db');
const config = require('../../config');
const repo = require('../../repositories/lifecycle.repository');
const rules = require('./rules');
const snapshots = require('./snapshots.service');

/**
 * WHAT THE DASHBOARD ASKS, ANSWERED FROM THE READ MODELS.
 *
 * Three metric modes and they are never mixed, because requirement 5 is
 * emphatic that conflating them is the mistake this feature exists to avoid:
 *
 *   STOCK   how many customers are in each status at the END of a bucket.
 *           Read from lifecycle_kpi_daily, one row per day, and for a bucket
 *           it is the LAST day's row - never the sum of the days in it.
 *           Summing stock counts is adding the same person once per day.
 *
 *   FLOW    how many status CHANGES happened inside a bucket. Counted from
 *           lifecycle_customer_period, where every row but a registration is
 *           a transition. One customer can contribute several, so the unique
 *           count is reported separately and labelled.
 *
 *   COHORT  one pair of statuses per customer: where they were at the start
 *           instant and where they were at the end. Not the same as counting
 *           the transitions between - somebody who went DORMANT and came back
 *           contributes two flows and one unchanged cohort pair.
 *
 * EVERY REPLY SAYS WHICH MODE IT IS, in `metricType`, so a chart cannot label
 * a flow as a stock by accident.
 *
 * ARBITRARY INSTANTS DO NOT GO THROUGH THE SNAPSHOTS. A daily table can only
 * answer about the end of a day; "as of 14:30 last Tuesday" is answered from
 * lifecycle_customer_period by temporal containment, which is exact. The
 * snapshots exist to make the COMMON case - a daily chart - one indexed read
 * instead of a classification pass.
 */

const STATUSES = ['NEW', 'ACTIVE', 'DORMANT', 'CHURNED'];

const PERIOD = 'lifecycle_customer_period';
const PROFILE = 'lifecycle_customer_profile';
const CURRENT = 'lifecycle_customer_current';

function zone() {
  return config.lifecycle.reportTimezone;
}

/** A plain YYYY-MM-DD, or null. */
function dayOf(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

/**
 * The instant a local day ENDS, which is the next local midnight.
 *
 * Every "as of the end of this day" question becomes `< this instant`, which
 * is the same half-open convention the periods are stored with - so a
 * transition stamped exactly at midnight belongs to the day beginning, not
 * the day ending, and the API, the charts and the snapshots all agree.
 */
function endOfDay(day) {
  return db.raw('((? ::date)::timestamp AT TIME ZONE ?)', [snapshots.nextDay(day), zone()]);
}

/** The instant a local day BEGINS. */
function startOfDay(day) {
  return db.raw('((? ::date)::timestamp AT TIME ZONE ?)', [day, zone()]);
}

/* ------------------------------------------------------------------ */
/*  freshness                                                          */
/* ------------------------------------------------------------------ */

/**
 * THE TWO TIMESTAMPS A REPORT HAS TO SHOW, and nothing else.
 *
 * Requirement 11 asks every stock answer to carry freshness metadata, and
 * requirement 8 asks the limitation to be visible: these counts are complete
 * as of the last reconciliation, not as of this second.
 *
 * Read from the checkpoints rather than from jobs.health(), which is the
 * operations aggregate - eight queries including a count over the whole
 * journal. A chart redraw should not pay for the job-health tab.
 */
async function freshness() {
  const login = await repo.checkpointOf('login');
  const reconciled = await repo.checkpointOf('reconcile');

  const lastSync = login && login.last_success_at ? new Date(login.last_success_at) : null;
  const staleAfter = config.lifecycle.freshnessWarnMinutes * 60 * 1000;

  return {
    lastSynchronizedAt: lastSync,
    lastReconciledAt: reconciled && reconciled.last_reconciled_at
      ? new Date(reconciled.last_reconciled_at)
      : null,
    isStale: !lastSync || (Date.now() - lastSync.getTime()) > staleAfter
  };
}

/* ------------------------------------------------------------------ */
/*  stock at an instant, from the periods                              */
/* ------------------------------------------------------------------ */

/**
 * WHO WAS IN WHAT STATUS AT AN INSTANT - the exact answer.
 *
 * Containment on the half-open interval: the period that was open at T is the
 * one with `valid_from < T` and either no end or an end after T. Every
 * registered customer has exactly one such period, which is what the
 * one-open-interval index and the no-gaps rule buy.
 */
async function stockAt(instant) {
  const rows = await db(PERIOD)
    .select('status')
    .count('* as n')
    .where('valid_from', '<=', instant)
    .andWhere(function () {
      this.whereNull('valid_to').orWhere('valid_to', '>', instant);
    })
    .groupBy('status');

  const counts = { NEW: 0, ACTIVE: 0, DORMANT: 0, CHURNED: 0 };
  rows.forEach(function (row) { counts[row.status] = Number(row.n); });
  counts.TOTAL = counts.NEW + counts.ACTIVE + counts.DORMANT + counts.CHURNED;

  return counts;
}

/**
 * THE OVERVIEW CARDS.
 *
 * `asOf` is a day, and the answer is the state at its end - taken from the
 * snapshot when there is one, because that is what the snapshots are for, and
 * computed from the periods when there is not (a day in the future of the
 * last snapshot run, or one before the series begins).
 */
async function overview(options) {
  const asOf = dayOf(options && options.asOf) || snapshots.today(zone());

  const snapshot = await repo.dailyOn(asOf);

  let counts;
  let from;

  if (snapshot) {
    counts = {
      NEW: Number(snapshot.new_count),
      ACTIVE: Number(snapshot.active_count),
      DORMANT: Number(snapshot.dormant_count),
      CHURNED: Number(snapshot.churned_count),
      TOTAL: Number(snapshot.total_count)
    };
    from = 'SNAPSHOT';
  } else {
    counts = await stockAt(endOfDay(asOf));
    from = 'PERIODS';
  }

  /*
   * PERCENTAGES OF THE REGISTERED POPULATION, and only when there is one. A
   * zero denominator is reported as null rather than as 0%, which would read
   * as "none of them" rather than "there is nobody".
   */
  const share = {};
  STATUSES.forEach(function (status) {
    share[status] = counts.TOTAL ? Math.round((counts[status] / counts.TOTAL) * 1000) / 10 : null;
  });

  const fresh = await freshness();

  return {
    asOf: asOf,
    reportTimezone: zone(),
    metricType: 'STOCK_END_OF_DAY',
    computedFrom: from,
    counts: counts,
    sharePercent: share,
    /* Registrations ON that day - a flow, kept separate and labelled. */
    registeredThatDay: snapshot ? Number(snapshot.registered_count) : null,
    rule: {
      version: config.lifecycle.ruleVersion,
      newDays: rules.RULES_V1.newHours / 24,
      dormantDays: rules.RULES_V1.dormantHours / 24,
      churnedDays: rules.RULES_V1.churnedHours / 24,
      basis: 'LOGIN_BASED'
    },
    freshness: {
      lastSynchronizedAt: fresh.lastSynchronizedAt,
      lastReconciledAt: fresh.lastReconciledAt,
      isStale: fresh.isStale,
      snapshotIsFinal: snapshot ? snapshot.is_final : null
    }
  };
}

/* ------------------------------------------------------------------ */
/*  buckets                                                           */
/* ------------------------------------------------------------------ */

/**
 * THE BUCKETS A RANGE DIVIDES INTO.
 *
 *   DAY     one per calendar day
 *   WEEK    Monday to Sunday in the report zone, truncated at both edges so
 *           a range starting on a Wednesday has a three-day first bucket
 *           rather than silently reaching back into the previous week
 *   CUSTOM  consecutive N-day buckets from the start of the range
 *
 * Each bucket carries its own `snapshotDate` - the LAST day in it - because
 * that is the day whose stock represents the bucket (requirement 10).
 */
function bucketsOf(from, to, groupBy, intervalDays) {
  const buckets = [];

  if (groupBy === 'DAY') {
    for (let day = from; day <= to; day = snapshots.nextDay(day)) {
      buckets.push({ periodStart: day, periodEnd: day, snapshotDate: day });
    }
    return buckets;
  }

  if (groupBy === 'WEEK') {
    let start = from;

    while (start <= to) {
      /* Monday is 1; walk forward to the Sunday, or to the range's end. */
      const weekday = isoWeekday(start);
      const daysLeftInWeek = 7 - weekday;
      let end = start;
      for (let i = 0; i < daysLeftInWeek; i += 1) {
        const next = snapshots.nextDay(end);
        if (next > to) break;
        end = next;
      }
      buckets.push({ periodStart: start, periodEnd: end, snapshotDate: end });
      start = snapshots.nextDay(end);
    }

    return buckets;
  }

  /* CUSTOM: consecutive runs of N days from the start of the range. */
  const size = Math.max(1, Math.min(90, Number(intervalDays) || 1));
  let start = from;

  while (start <= to) {
    let end = start;
    for (let i = 1; i < size; i += 1) {
      const next = snapshots.nextDay(end);
      if (next > to) break;
      end = next;
    }
    buckets.push({ periodStart: start, periodEnd: end, snapshotDate: end });
    start = snapshots.nextDay(end);
  }

  return buckets;
}

/** Monday = 1 ... Sunday = 7, from a plain date. */
function isoWeekday(day) {
  const parts = day.split('-').map(Number);
  const at = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const sunday0 = at.getUTCDay();
  return sunday0 === 0 ? 7 : sunday0;
}

/**
 * THE TREND: stock at the end of each bucket.
 *
 * One read of the snapshot table for the whole range, then the bucket's last
 * day is looked up in it. A bucket whose last day has no snapshot reports
 * nulls rather than zeros - "we have not computed this" and "there was
 * nobody" are different answers and a chart must not draw them the same.
 */
async function trend(options) {
  const from = dayOf(options.from);
  const to = dayOf(options.to);
  const groupBy = options.groupBy || 'DAY';

  const rows = await repo.dailyBetween(from, to);
  const byDay = {};
  rows.forEach(function (row) { byDay[snapshots.dayKey(row.snapshot_date)] = row; });

  const buckets = bucketsOf(from, to, groupBy, options.intervalDays).map(function (bucket) {
    const row = byDay[bucket.snapshotDate];

    /*
     * REGISTRATIONS ARE SUMMED ACROSS THE BUCKET, because they are a flow.
     * The stock counts are taken from the last day alone. Two different
     * kinds of number in one row, which is exactly why each is labelled.
     */
    let registered = 0;
    for (let day = bucket.periodStart; day <= bucket.periodEnd; day = snapshots.nextDay(day)) {
      if (byDay[day]) registered += Number(byDay[day].registered_count);
    }

    return {
      periodStart: bucket.periodStart,
      periodEnd: bucket.periodEnd,
      snapshotDate: bucket.snapshotDate,
      new: row ? Number(row.new_count) : null,
      active: row ? Number(row.active_count) : null,
      dormant: row ? Number(row.dormant_count) : null,
      churned: row ? Number(row.churned_count) : null,
      total: row ? Number(row.total_count) : null,
      registeredInBucket: registered,
      isFinal: row ? row.is_final : null
    };
  });

  const fresh = await freshness();

  return {
    reportTimezone: zone(),
    metricType: 'STOCK_END_OF_BUCKET',
    groupBy: groupBy,
    intervalDays: groupBy === 'CUSTOM' ? Math.max(1, Number(options.intervalDays) || 1) : null,
    from: from,
    to: to,
    buckets: buckets,
    lastSynchronizedAt: fresh.lastSynchronizedAt,
    note: 'Stock counts are the state at the end of each bucket and are never'
      + ' summed across buckets. registeredInBucket is a flow.'
  };
}

/* ------------------------------------------------------------------ */
/*  instants, moved by calendar days                                   */
/* ------------------------------------------------------------------ */

/**
 * AN INSTANT, N WHOLE DAYS EARLIER OR LATER, IN THE REPORT TIMEZONE.
 *
 * Not `instant - N * 86400000`. A day is 24 hours only where the clock never
 * changes, and an operator asking for "the seven days before the launch"
 * means the same wall-clock time on the earlier date - which across a
 * daylight-saving boundary is 167 or 169 hours, not 168. Requirement 14's
 * fixture F asks for exactly this distinction.
 *
 * Done in PostgreSQL rather than in JavaScript because this build of Node has
 * small-icu: it has the whole timezone database but only English locale data,
 * so date arithmetic through `Intl` is reliable for naming parts and not for
 * much else. The database has the same tz database and no such gap.
 */
async function shiftDays(instant, days) {
  const rows = await db.raw(
    'SELECT (timezone(?, timezone(?, ?::timestamptz) + make_interval(days => ?))) AS at',
    [zone(), zone(), instant, Math.round(days)]
  );

  return (rows.rows || rows)[0].at;
}

/* ------------------------------------------------------------------ */
/*  flows                                                            */
/* ------------------------------------------------------------------ */

/**
 * THE TRANSITION MATRIX BETWEEN TWO INSTANTS, with both counts.
 *
 * `[start, end)` - the start is included and the end is not, which is what
 * lets a before window and an after window share a boundary instant without
 * either double-counting a transition or losing one.
 *
 * EVENTS AND UNIQUE CUSTOMERS ARE BOTH RETURNED AND NEITHER IS DERIVABLE FROM
 * THE OTHER. The window total of unique customers is NOT the sum of the
 * cells': a customer who went DORMANT and then came back inside one window
 * appears in two cells and is one customer. So it is counted once, over the
 * whole window, by its own query - requirement 5.
 */
async function matrixBetween(startInstant, endInstant) {
  const scope = function () {
    return db(PERIOD)
      .whereNotNull('previous_status')
      .andWhere('valid_from', '>=', startInstant)
      .andWhere('valid_from', '<', endInstant);
  };

  const cells = await scope()
    .select('previous_status', 'status')
    .count('* as events')
    .countDistinct('user_pk as customers')
    .groupBy('previous_status', 'status')
    .orderBy('events', 'desc');

  const totals = await scope()
    .count('* as events')
    .countDistinct('user_pk as customers')
    .first();

  return {
    matrix: cells.map(function (row) {
      return {
        fromStatus: row.previous_status,
        toStatus: row.status,
        events: Number(row.events),
        uniqueCustomers: Number(row.customers)
      };
    }),
    events: Number(totals.events),
    uniqueCustomers: Number(totals.customers)
  };
}


/**
 * THE TRANSITION MATRIX for a window, plus per-bucket flows.
 *
 * `[from, to)` - the start instant is included and the end is NOT, which is
 * requirement 14's fixture F: an event stamped exactly at the range end
 * belongs to the next window. Half-open everywhere, so two adjacent windows
 * never double-count a transition and never miss one.
 */
async function transitionSummary(options) {
  const from = dayOf(options.from);
  const to = dayOf(options.to);

  const startInstant = startOfDay(from);
  const endInstant = endOfDay(to);

  /* The same matrix the event comparison draws, from the same place. */
  const window = await matrixBetween(startInstant, endInstant);

  const buckets = bucketsOf(from, to, options.groupBy || 'DAY', options.intervalDays);

  /*
   * PER-BUCKET FLOWS IN ONE QUERY, grouped by the local day, then folded into
   * the buckets here. A query per bucket would be ninety round trips for a
   * three-month daily chart.
   */
  const daily = await db(PERIOD)
    .select(
      db.raw('(valid_from AT TIME ZONE ?)::date AS day', [zone()]),
      'previous_status',
      'status'
    )
    .count('* as events')
    .countDistinct('user_pk as customers')
    .whereNotNull('previous_status')
    .andWhere('valid_from', '>=', startInstant)
    .andWhere('valid_from', '<', endInstant)
    .groupByRaw('1, 2, 3');

  const byDay = {};
  daily.forEach(function (row) {
    const key = snapshots.dayKey(row.day);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(row);
  });

  const series = buckets.map(function (bucket) {
    const flows = {};
    let events = 0;

    for (let day = bucket.periodStart; day <= bucket.periodEnd; day = snapshots.nextDay(day)) {
      (byDay[day] || []).forEach(function (row) {
        const key = row.previous_status + '->' + row.status;
        flows[key] = (flows[key] || 0) + Number(row.events);
        events += Number(row.events);
      });
    }

    return {
      periodStart: bucket.periodStart,
      periodEnd: bucket.periodEnd,
      events: events,
      flows: flows
    };
  });

  return {
    reportTimezone: zone(),
    metricType: 'TRANSITION_FLOW',
    from: from,
    to: to,
    window: '[from, to) - a transition exactly at the end belongs to the next window',
    matrix: window.matrix,

    /*
     * The window's own totals, and the two are different numbers on purpose:
     * one customer may transition several times inside it, so the unique
     * count is smaller than the event count and is not the sum of the cells.
     */
    events: window.events,
    uniqueCustomers: window.uniqueCustomers,

    buckets: series
  };
}

/**
 * THE TRANSITION LIST, paginated and joined to the display profile.
 *
 * ONE ROW PER TRANSITION, and the join cannot multiply it: `display_phone` is
 * a column on the profile, chosen once by the sync, rather than a join to the
 * phone table. Requirement 3 is explicit that a customer with three handsets
 * must not become three rows.
 *
 * `statusAtEnd` and `currentStatus` are deliberately both present and
 * deliberately different things - requirement 12 asks for the event-time
 * status to be distinguishable from where the customer is now.
 */
async function transitions(options) {
  const from = dayOf(options.from);
  const to = dayOf(options.to);

  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = Math.max(1, Math.min(200, Number(options.pageSize) || 50));

  const base = function () {
    const qb = db(PERIOD + ' as p')
      .whereNotNull('p.previous_status')
      .andWhere('p.valid_from', '>=', startOfDay(from))
      .andWhere('p.valid_from', '<', endOfDay(to));

    if (options.fromStatus) qb.andWhere('p.previous_status', options.fromStatus);
    if (options.toStatus) qb.andWhere('p.status', options.toStatus);

    if (options.search) {
      const term = '%' + String(options.search).trim().toLowerCase() + '%';
      qb.andWhere(function () {
        this.whereRaw('LOWER(f.user_id) LIKE ?', [term])
          .orWhereRaw('LOWER(f.user_name) LIKE ?', [term])
          .orWhereRaw('f.display_phone LIKE ?', ['%' + String(options.search).trim() + '%']);
      });
    }

    return qb.leftJoin(PROFILE + ' as f', 'f.user_pk', 'p.user_pk');
  };

  const counted = await base().count('* as n').first();
  const total = Number(counted.n);

  const rows = await base()
    .leftJoin(CURRENT + ' as c', 'c.user_pk', 'p.user_pk')
    .select(
      'p.user_pk',
      'p.previous_status',
      'p.status',
      'p.valid_from',
      'p.reason',
      'f.user_id',
      'f.user_name',
      'f.birthday',
      'f.display_phone',
      'f.job_code',
      'f.location_pk',
      'f.oracle_account_status',
      'c.status as current_status',
      'c.last_login_at'
    )
    .orderBy([{ column: 'p.valid_from', order: 'desc' }, { column: 'p.user_pk', order: 'asc' }])
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    rows: rows.map(function (row) {
      return {
        userPk: Number(row.user_pk),
        userId: row.user_id,
        userName: row.user_name,
        birthday: row.birthday,
        displayPhone: row.display_phone,
        jobCode: row.job_code,
        locationPk: row.location_pk,
        oracleAccountStatus: row.oracle_account_status,
        transitionedAt: row.valid_from,
        fromStatus: row.previous_status,
        toStatus: row.status,
        reason: row.reason,
        /* Where this transition left them, which is not where they are now. */
        statusAsOfEvent: row.status,
        currentStatus: row.current_status,
        lastLoginAt: row.last_login_at
      };
    }),
    total: total,
    page: page,
    limit: pageSize,
    summary: {
      metricType: 'TRANSITION_FLOW',
      reportTimezone: zone(),
      note: 'statusAsOfEvent is the status this transition produced;'
        + ' currentStatus is where the customer is today.'
    }
  };
}

/* ------------------------------------------------------------------ */
/*  customers                                                         */
/* ------------------------------------------------------------------ */

/**
 * WHO WAS IN A STATUS AT THE END OF A DAY.
 *
 * By containment on the periods, not by the current state - the whole point
 * is to be able to ask "who was dormant in March", and `lifecycle_customer_current`
 * can only answer about today.
 */
async function customersInStatus(options) {
  const asOf = dayOf(options.asOf) || snapshots.today(zone());
  const status = options.status;

  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = Math.max(1, Math.min(200, Number(options.pageSize) || 50));

  const instant = endOfDay(asOf);

  const base = function () {
    const qb = db(PERIOD + ' as p')
      .where('p.valid_from', '<=', instant)
      .andWhere(function () {
        this.whereNull('p.valid_to').orWhere('p.valid_to', '>', instant);
      });

    if (status) qb.andWhere('p.status', status);
    return qb.leftJoin(PROFILE + ' as f', 'f.user_pk', 'p.user_pk');
  };

  const counted = await base().count('* as n').first();

  const rows = await base()
    .leftJoin(CURRENT + ' as c', 'c.user_pk', 'p.user_pk')
    .select(
      'p.user_pk', 'p.status', 'p.valid_from', 'p.reason',
      'f.user_id', 'f.user_name', 'f.display_phone', 'f.birthday',
      'f.job_code', 'f.location_pk', 'f.registered_at',
      'c.status as current_status', 'c.last_login_at'
    )
    .orderBy([{ column: 'p.valid_from', order: 'desc' }, { column: 'p.user_pk', order: 'asc' }])
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    rows: rows.map(function (row) {
      return {
        userPk: Number(row.user_pk),
        userId: row.user_id,
        userName: row.user_name,
        displayPhone: row.display_phone,
        birthday: row.birthday,
        jobCode: row.job_code,
        locationPk: row.location_pk,
        registeredAt: row.registered_at,
        statusAsOf: row.status,
        statusSince: row.valid_from,
        reason: row.reason,
        currentStatus: row.current_status,
        lastLoginAt: row.last_login_at
      };
    }),
    total: Number(counted.n),
    page: page,
    limit: pageSize,
    summary: { asOf: asOf, status: status || null, metricType: 'STOCK_END_OF_DAY' }
  };
}

/**
 * ONE CUSTOMER'S WHOLE TIMELINE.
 *
 * THE PERIOD OVERLAPPING THE START IS INCLUDED, which requirement 11 asks for
 * explicitly: a window beginning in March must show that the customer was
 * already DORMANT when it opened, or the first thing a reader sees is a
 * transition out of a status that appears to have come from nowhere.
 */
async function timelineOf(userPk, options) {
  const profile = await repo.profileOf(userPk);
  if (!profile) return null;

  const current = await db(CURRENT).where('user_pk', userPk).first();

  const from = dayOf(options && options.from);
  const to = dayOf(options && options.to);

  const qb = db(PERIOD)
    .select('status', 'previous_status', 'valid_from', 'valid_to', 'reason', 'rule_version')
    .where('user_pk', userPk);

  if (from) {
    /* Overlapping, not contained: the period that was open at the start. */
    qb.andWhere(function () {
      this.whereNull('valid_to').orWhere('valid_to', '>', startOfDay(from));
    });
  }
  if (to) qb.andWhere('valid_from', '<', endOfDay(to));

  const periods = await qb.orderBy('valid_from', 'asc');

  /*
   * THE RECENT LOGINS, BOUNDED. A customer in this dataset can have thousands;
   * a timeline view needs the shape of their recency, not every row ever, and
   * requirement 11 forbids loading an unbounded set into a browser.
   */
  const logins = await db('lifecycle_login_event')
    .select('source_table_pk', 'action_at')
    .where('user_pk', userPk)
    .orderBy('action_at', 'desc')
    .limit(50);

  const loginCount = await db('lifecycle_login_event')
    .where('user_pk', userPk).count('* as n').first();

  return {
    customer: {
      userPk: Number(profile.user_pk),
      userId: profile.user_id,
      userName: profile.user_name,
      birthday: profile.birthday,
      displayPhone: profile.display_phone,
      jobCode: profile.job_code,
      locationPk: profile.location_pk,
      registeredAt: profile.registered_at,
      /* The OPERATIONAL account flag, named so nobody reads it as lifecycle. */
      oracleAccountStatus: profile.oracle_account_status
    },
    current: current ? {
      status: current.status,
      statusSince: current.status_since,
      lastLoginAt: current.last_login_at,
      effectiveLastActivityAt: current.effective_last_activity_at,
      nextTransitionAt: current.next_transition_at
    } : null,
    periods: periods.map(function (row) {
      return {
        status: row.status,
        previousStatus: row.previous_status,
        validFrom: row.valid_from,
        validTo: row.valid_to,
        reason: row.reason,
        ruleVersion: row.rule_version
      };
    }),
    recentLogins: logins.map(function (row) {
      return { sourcePk: Number(row.source_table_pk), at: row.action_at };
    }),
    loginCount: Number(loginCount.n),
    reportTimezone: zone()
  };
}

/* ------------------------------------------------------------------ */
/*  cohort matrix                                                     */
/* ------------------------------------------------------------------ */

/**
 * WHERE EACH CUSTOMER WAS AT TWO INSTANTS - one pair per customer.
 *
 * NOT the same as the transition matrix, and requirement 5 insists on the
 * distinction: a customer who went DORMANT in week one and came back in week
 * two contributes two transition events and ONE unchanged cohort pair. A
 * dashboard that showed only the flows would say two things happened; this
 * says the population is where it started.
 */
async function cohortMatrix(startInstant, endInstant) {
  const rows = await db.raw(
    `WITH at_start AS (
       SELECT user_pk, status FROM ${PERIOD}
        WHERE valid_from <= ? AND (valid_to IS NULL OR valid_to > ?)
     ), at_end AS (
       SELECT user_pk, status FROM ${PERIOD}
        WHERE valid_from <= ? AND (valid_to IS NULL OR valid_to > ?)
     )
     SELECT s.status AS from_status, e.status AS to_status, COUNT(*)::bigint AS customers
       FROM at_start s
       JOIN at_end e ON e.user_pk = s.user_pk
      GROUP BY 1, 2
      ORDER BY customers DESC`,
    [startInstant, startInstant, endInstant, endInstant]
  );

  return (rows.rows || rows).map(function (row) {
    return {
      fromStatus: row.from_status,
      toStatus: row.to_status,
      customers: Number(row.customers),
      unchanged: row.from_status === row.to_status
    };
  });
}

module.exports = {
  STATUSES: STATUSES,
  dayOf: dayOf,
  bucketsOf: bucketsOf,
  isoWeekday: isoWeekday,
  stockAt: stockAt,
  freshness: freshness,
  overview: overview,
  trend: trend,
  transitionSummary: transitionSummary,
  transitions: transitions,
  customersInStatus: customersInStatus,
  timelineOf: timelineOf,
  cohortMatrix: cohortMatrix,
  matrixBetween: matrixBetween,
  shiftDays: shiftDays,
  startOfDay: startOfDay,
  endOfDay: endOfDay
};
