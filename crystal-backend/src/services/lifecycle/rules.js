'use strict';

/**
 * THE LIFECYCLE RULES, AND NOTHING ELSE.
 *
 * Four statuses from one input: when somebody registered, and when they
 * logged in. No database, no clock of its own, no configuration read at call
 * time - every answer is a function of its arguments. That is deliberate and
 * it is the whole reason this file exists separately from the jobs that use
 * it: the classification is the part that has to be RIGHT, it is the part a
 * specification can be written against, and it is the part that is impossible
 * to test if it can only be reached through Oracle, PostgreSQL and a cron
 * schedule.
 *
 * See CUSTOMER_LIFECYCLE_KPI_REQUIREMENTS.md sections 4 and 9.
 *
 * ROLLING ELAPSED TIME, NOT CALENDAR MONTHS. 30 days is 720 hours and 90 days
 * is 2160 hours, measured between instants. The reporting time zone decides
 * which local DAY a transition lands in - that is a question for the snapshot
 * builder - and never how long thirty days is. A daylight-saving boundary
 * must not quietly turn thirty days into twenty-nine days and twenty-three
 * hours, which is exactly what calendar arithmetic in a local zone does.
 *
 * EVERYTHING HERE IS UTC MILLISECONDS inside, and Date objects at the edges.
 *
 * NEW TAKES PRECEDENCE OVER ACTIVITY. For the first thirty days after
 * registration a customer is NEW whatever they do - logging in on day two
 * does not make them ACTIVE, it moves the deadline they will be judged
 * against when the NEW override expires.
 *
 * THE BOUNDARIES ARE EXACT AND THEY ARE CLOSED AT THE FAR END: at exactly
 * thirty elapsed days the customer is no longer ACTIVE, and at exactly ninety
 * they are CHURNED. `<` throughout, never `<=`, which is the one line of this
 * file most likely to be "tidied" into an off-by-one.
 */

/** The four statuses. Mutually exclusive and exhaustive once registered. */
const STATUS = {
  NEW: 'NEW',
  ACTIVE: 'ACTIVE',
  DORMANT: 'DORMANT',
  CHURNED: 'CHURNED'
};

/** Why a period began. Stored on every row - see requirements 7.4. */
const REASON = {
  REGISTRATION: 'REGISTRATION',
  LOGIN: 'LOGIN',
  NEW_EXPIRED: 'NEW_EXPIRED',
  INACTIVITY_30: 'INACTIVITY_30',
  INACTIVITY_90: 'INACTIVITY_90'
};

const HOUR = 60 * 60 * 1000;

/**
 * THE THRESHOLDS, IN HOURS, because that is what the specification fixes:
 * 720 and 2160. Written as hours rather than as `30 * DAY` so that the
 * numbers in the code are the numbers in the contract.
 *
 * `version` is carried onto every period row. Changing either threshold is a
 * new version and requires an explicit backfill of the periods and snapshots
 * computed under the old one - history is never silently reinterpreted.
 */
const RULES_V1 = {
  version: 1,
  newHours: 720,
  dormantHours: 720,
  churnedHours: 2160
};

/** Milliseconds, from whatever the caller had. */
function instant(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

/**
 * THE STATUS AT AN INSTANT - the whole of section 4 in one function.
 *
 * `effectiveLastActivityAt` is MAX(registration, the latest login at or
 * before T). A customer who has never logged in is judged against their
 * registration, which is what makes "never logged in" an ordinary case
 * rather than a null to special-case downstream.
 *
 * Returns null before registration: the status set is exhaustive only for
 * customers who exist, and inventing a status for someone who had not yet
 * registered would put them in a stock count they cannot belong to.
 */
function statusAt(registeredAt, effectiveLastActivityAt, at, rules) {
  const rule = rules || RULES_V1;

  const registered = instant(registeredAt);
  const when = instant(at);
  if (registered === null || when === null) return null;
  if (when < registered) return null;

  /* MAX, so a caller cannot produce an activity earlier than registration. */
  const activity = Math.max(registered, instant(effectiveLastActivityAt) === null
    ? registered
    : instant(effectiveLastActivityAt));

  if (when < registered + rule.newHours * HOUR) return STATUS.NEW;
  if (when < activity + rule.dormantHours * HOUR) return STATUS.ACTIVE;
  if (when < activity + rule.churnedHours * HOUR) return STATUS.DORMANT;
  return STATUS.CHURNED;
}

/**
 * WHEN THE STATUS WILL CHANGE NEXT IF NOBODY LOGS IN, and why.
 *
 * This is what makes the timeline possible without scanning every day: from
 * any state there is exactly one next automatic deadline, so the builder can
 * jump from event to event instead of walking a calendar. It is also what the
 * deadline processor stores in `next_transition_at` to find the customers due
 * for a change tonight.
 *
 * CHURNED has no deadline - it is the end of the road until a login.
 */
function nextDeadline(status, registeredAt, effectiveLastActivityAt, rules) {
  const rule = rules || RULES_V1;

  const registered = instant(registeredAt);
  if (registered === null) return null;

  const activity = Math.max(registered, instant(effectiveLastActivityAt) === null
    ? registered
    : instant(effectiveLastActivityAt));

  if (status === STATUS.NEW) {
    return { at: registered + rule.newHours * HOUR, reason: REASON.NEW_EXPIRED };
  }
  if (status === STATUS.ACTIVE) {
    return { at: activity + rule.dormantHours * HOUR, reason: REASON.INACTIVITY_30 };
  }
  if (status === STATUS.DORMANT) {
    return { at: activity + rule.churnedHours * HOUR, reason: REASON.INACTIVITY_90 };
  }
  return null;
}

/**
 * EVERY PERIOD A CUSTOMER HAS BEEN THROUGH, as half-open intervals.
 *
 * The algorithm is a merge of two streams - the logins that happened, and the
 * deadlines that fire on their own - taking whichever comes first and
 * recomputing from there. Section 9 spells it out; the parts worth naming
 * here are the ones that are easy to get wrong:
 *
 *   A DEADLINE AT THE SAME INSTANT AS A LOGIN IS APPLIED FIRST. The
 *   specification resolves same-instant ordering by applying the event and
 *   then evaluating the status, and only the net state at that instant is
 *   persisted - so a deadline and a login that coincide produce one row, not
 *   two, and the login wins because it is evaluated last.
 *
 *   A LOGIN THAT DOES NOT CHANGE THE STATUS ADDS NO ROW. An ACTIVE customer
 *   logging in again stays ACTIVE: the period is extended and the deadlines
 *   are recomputed from the new activity. Writing a row would invent an
 *   ACTIVE -> ACTIVE transition that never happened, and every flow count
 *   downstream would be wrong by however often people use the product.
 *
 *   THE PERIOD'S TIMESTAMP IS THE EFFECTIVE INSTANT, never the moment the job
 *   got round to noticing. A status that changed at 02:00 on the 19th is a
 *   fact about the 19th whether the job ran that night, the next night, or
 *   during a backfill six months later.
 *
 * @param registeredAt   when the customer registered
 * @param logins         [{ at, sourcePk }] - any order; sorted here
 * @param horizon        compute up to this instant (default: the last event)
 * @returns { periods, nextTransitionAt, lastLoginAt, effectiveLastActivityAt,
 *            status, rejected }
 */
function buildTimeline(registeredAt, logins, horizon, rules) {
  const rule = rules || RULES_V1;

  const registered = instant(registeredAt);
  if (registered === null) {
    return {
      periods: [],
      nextTransitionAt: null,
      lastLoginAt: null,
      effectiveLastActivityAt: null,
      status: null,
      rejected: [{ reason: 'NO_REGISTRATION', event: null }]
    };
  }

  /*
   * INVALID EVENTS ARE SET ASIDE, NOT SILENTLY DROPPED. A login before the
   * customer existed, or one with no timestamp, is a data-quality fact that
   * belongs in an exception channel - section 9 is explicit that it must not
   * become a silent misclassification. They are returned for the caller to
   * audit; the timeline is built from what remains.
   */
  const rejected = [];
  const events = [];

  (logins || []).forEach(function (login) {
    const at = instant(login && login.at !== undefined ? login.at : login);
    if (at === null) {
      rejected.push({ reason: 'NO_TIMESTAMP', event: login });
      return;
    }
    if (at < registered) {
      rejected.push({ reason: 'BEFORE_REGISTRATION', event: login });
      return;
    }
    events.push({ at: at, sourcePk: login && login.sourcePk !== undefined ? login.sourcePk : null });
  });

  /* By instant, then by source key - a stable order for same-instant logins. */
  events.sort(function (a, b) {
    if (a.at !== b.at) return a.at - b.at;
    return Number(a.sourcePk || 0) - Number(b.sourcePk || 0);
  });

  const lastEvent = events.length ? events[events.length - 1].at : registered;
  const until = instant(horizon) === null ? lastEvent : instant(horizon);

  const periods = [];

  /* The registration row: NEW, from the instant they existed. */
  let status = STATUS.NEW;
  let activity = registered;
  periods.push({
    status: STATUS.NEW,
    previousStatus: null,
    validFrom: registered,
    validTo: null,
    reason: REASON.REGISTRATION,
    ruleVersion: rule.version
  });

  const moveTo = function (next, at, reason) {
    if (next === status) return;
    periods[periods.length - 1].validTo = at;
    periods.push({
      status: next,
      previousStatus: status,
      validFrom: at,
      validTo: null,
      reason: reason,
      ruleVersion: rule.version
    });
    status = next;
  };

  let index = 0;

  /*
   * One step per iteration, and every step strictly advances either the clock
   * or the event index - so this cannot spin. The guard is a safety net for a
   * rule change that breaks that property, not a load-bearing limit.
   */
  const LIMIT = 100000;
  let steps = 0;

  while (steps < LIMIT) {
    steps += 1;

    const due = nextDeadline(status, registered, activity, rule);
    const login = index < events.length ? events[index] : null;

    /*
     * A LOGIN LANDING EXACTLY ON A DEADLINE WINS, and the comparison is
     * STRICT for that reason - not as a tie-break preference but because
     * section 9 says only the NET state at an instant is persisted.
     *
     * Applying the deadline first and then the login would emit the
     * intermediate status: a customer whose 90-day churn falls due at the
     * very moment they log in would get a DORMANT -> CHURNED row and a
     * CHURNED -> ACTIVE row at the same instant, reporting a churn that
     * never happened for zero length of time. It would also produce a
     * period whose valid_from equals its valid_to, which
     * lifecycle_customer_period refuses outright - so the rebuild would
     * fail rather than merely mislead.
     */
    const deadlineFirst = due
      && due.at <= until
      && (!login || due.at < login.at);

    if (deadlineFirst) {
      /*
       * The status AT the deadline, recomputed rather than assumed: when the
       * NEW override expires the answer depends on the most recent login, and
       * may be ACTIVE (fixture B) or DORMANT (fixtures A and C).
       */
      const next = statusAt(registered, activity, due.at, rule);
      moveTo(next, due.at, due.reason);

      /* A deadline that changed nothing would loop forever; it cannot
         happen with these rules, and if a rule change makes it possible we
         stop rather than spin. */
      if (next === null || due.at >= (nextDeadline(status, registered, activity, rule) || { at: Infinity }).at) {
        if (next === status && !login) break;
      }
      continue;
    }

    if (login && login.at <= until) {
      const at = login.at;

      /* Every login at this same instant, applied together. */
      while (index < events.length && events[index].at === at) {
        activity = Math.max(activity, events[index].at);
        index += 1;
      }

      const next = statusAt(registered, activity, at, rule);
      /* No row when the status is unchanged - the period is extended and the
         deadlines move with the new activity. */
      moveTo(next, at, REASON.LOGIN);
      continue;
    }

    break;
  }

  const upcoming = nextDeadline(status, registered, activity, rule);

  return {
    periods: periods,
    /* Only a deadline still ahead of the horizon is "upcoming". */
    nextTransitionAt: upcoming && upcoming.at > until ? new Date(upcoming.at) : null,
    lastLoginAt: events.length ? new Date(events[events.length - 1].at) : null,
    effectiveLastActivityAt: new Date(activity),
    status: status,
    rejected: rejected
  };
}

/**
 * The periods with Date objects rather than milliseconds, which is what the
 * repository layer wants to insert. Kept separate so the builder stays
 * arithmetic and the conversion happens once, at the edge.
 */
function asDates(periods) {
  return (periods || []).map(function (period) {
    return {
      status: period.status,
      previousStatus: period.previousStatus,
      validFrom: new Date(period.validFrom),
      validTo: period.validTo === null ? null : new Date(period.validTo),
      reason: period.reason,
      ruleVersion: period.ruleVersion
    };
  });
}

module.exports = {
  STATUS: STATUS,
  REASON: REASON,
  RULES_V1: RULES_V1,
  statusAt: statusAt,
  nextDeadline: nextDeadline,
  buildTimeline: buildTimeline,
  asDates: asDates
};
