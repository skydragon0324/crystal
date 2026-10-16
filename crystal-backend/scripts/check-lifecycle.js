'use strict';

/**
 * THE LIFECYCLE RULES, CHECKED AGAINST THE SPECIFICATION'S OWN FIXTURES.
 *
 * CUSTOMER_LIFECYCLE_KPI_REQUIREMENTS.md section 14 lists eight fixtures and
 * calls them exact. The ones that are pure arithmetic - A, B, C, D, F and the
 * invariants in G - are checked here, against services/lifecycle/rules.js and
 * nothing else: no Oracle, no PostgreSQL, no clock. H and E need the
 * synchroniser and the snapshot repair, which are not built yet.
 *
 * WHY A SCRIPT AND NOT A TEST FILE. This project has no test runner in the
 * backend - `npm test` is still the Create-React-App placeholder - and the
 * way backend logic is verified here is a check script: see check.js,
 * check-crm.js and check-crm-integration.js, which this follows. Adding jest
 * to the backend for one feature is a bigger decision than this feature, and
 * one to make deliberately rather than in passing.
 *
 *   node scripts/check-lifecycle.js
 *
 * FIXTURE A DISAGREED WITH THE RULES IT IS MEANT TO DEMONSTRATE, and the
 * question was settled in favour of the rule: section 4 is authoritative and
 * fixture A's expected table is incomplete. See the note on it below for the
 * arithmetic and for the two rows the table is missing.
 */

const rules = require('../src/services/lifecycle/rules');

const { STATUS, REASON } = rules;

let failures = 0;
let checks = 0;

function heading(text) {
  console.log('');
  console.log(text);
  console.log('-'.repeat(text.length));
}

function ok(what) {
  checks += 1;
  console.log('  ok    ' + what);
}

function bad(what, expected, actual) {
  checks += 1;
  failures += 1;
  console.log('  FAIL  ' + what);
  console.log('        expected ' + JSON.stringify(expected));
  console.log('        actual   ' + JSON.stringify(actual));
}

function same(what, expected, actual) {
  if (JSON.stringify(expected) === JSON.stringify(actual)) ok(what);
  else bad(what, expected, actual);
}

/** Midnight UTC on a plain date, which is what the fixtures use. */
function at(date) {
  return new Date(date + 'T00:00:00Z');
}

/** A timeline as the fixtures write it: date, from, to, why. */
function transitions(result) {
  return result.periods.map(function (period) {
    return {
      on: new Date(period.validFrom).toISOString().slice(0, 10),
      from: period.previousStatus,
      to: period.status,
      reason: period.reason
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Fixture A - automatic decay and reactivation                      */
/* ------------------------------------------------------------------ */

heading('Fixture A: automatic decay and reactivation');

/*
 * THE FIXTURE AND THE RULE DO NOT AGREE, and the arithmetic is not close.
 *
 * As written: registers and logs in 2026-05-04, then logs in 2026-06-05,
 * 2026-07-21 and 2026-11-06. Its expected table goes straight from
 * DORMANT -> ACTIVE on 06-05 to ACTIVE -> DORMANT on 08-20, and notes that
 * "the July 21 login must extend the Active period and not create
 * Active -> Active".
 *
 * But 06-05 to 07-21 is FORTY-SIX DAYS. Section 4 makes a customer DORMANT
 * thirty days after their last activity, so the deadline falls on 07-05 -
 * sixteen days before that login. Under the stated rule the customer is
 * DORMANT when they log in on 07-21, so that login is a real
 * DORMANT -> ACTIVE transition and two rows are missing from the table.
 *
 * The note gives the author's intent away: "extends the Active period" is
 * only true if the login lands inside thirty days of the previous one. So
 * either the table is missing two rows, or the third login was meant to be a
 * date like 07-01.
 *
 * DECIDED: SECTION 4 IS AUTHORITATIVE and fixture A's table is incomplete.
 * The rule is implemented as section 4 states it - that section is internally
 * consistent and fixtures B, C and F all agree with it - so the eight-row
 * timeline below is the acceptance expectation, and the two rows the fixture
 * omits (07-05 and 07-21) are real transitions.
 *
 * The second check is kept as documentation rather than as a correction: it
 * shows what the fixture's author was describing - a login inside the window
 * extending an Active period without writing an ACTIVE -> ACTIVE row - which
 * is a real property of the engine and worth holding onto. It is not a claim
 * that the fixture's dates were changed.
 */

const A_AS_WRITTEN = rules.buildTimeline(
  at('2026-05-04'),
  [
    { at: at('2026-05-04'), sourcePk: 1 },
    { at: at('2026-06-05'), sourcePk: 2 },
    { at: at('2026-07-21'), sourcePk: 3 },
    { at: at('2026-11-06'), sourcePk: 4 }
  ],
  at('2026-12-01')
);

same(
  'as written (46-day gap): the 07-05 deadline fires, so 07-21 reactivates',
  [
    { on: '2026-05-04', from: null, to: STATUS.NEW, reason: REASON.REGISTRATION },
    { on: '2026-06-03', from: STATUS.NEW, to: STATUS.DORMANT, reason: REASON.NEW_EXPIRED },
    { on: '2026-06-05', from: STATUS.DORMANT, to: STATUS.ACTIVE, reason: REASON.LOGIN },
    { on: '2026-07-05', from: STATUS.ACTIVE, to: STATUS.DORMANT, reason: REASON.INACTIVITY_30 },
    { on: '2026-07-21', from: STATUS.DORMANT, to: STATUS.ACTIVE, reason: REASON.LOGIN },
    { on: '2026-08-20', from: STATUS.ACTIVE, to: STATUS.DORMANT, reason: REASON.INACTIVITY_30 },
    { on: '2026-10-19', from: STATUS.DORMANT, to: STATUS.CHURNED, reason: REASON.INACTIVITY_90 },
    { on: '2026-11-06', from: STATUS.CHURNED, to: STATUS.ACTIVE, reason: REASON.LOGIN }
  ],
  transitions(A_AS_WRITTEN)
);

/* The same customer with the third login inside the thirty-day window, which
   is what the fixture's own note describes. This produces its table exactly. */
const A_AS_INTENDED = rules.buildTimeline(
  at('2026-05-04'),
  [
    { at: at('2026-05-04'), sourcePk: 1 },
    { at: at('2026-06-05'), sourcePk: 2 },
    { at: at('2026-07-01'), sourcePk: 3 },
    { at: at('2026-11-06'), sourcePk: 4 }
  ],
  at('2026-12-01')
);

same(
  'the property the fixture was describing: a login inside 30 days extends Active',
  [
    { on: '2026-05-04', from: null, to: STATUS.NEW, reason: REASON.REGISTRATION },
    { on: '2026-06-03', from: STATUS.NEW, to: STATUS.DORMANT, reason: REASON.NEW_EXPIRED },
    { on: '2026-06-05', from: STATUS.DORMANT, to: STATUS.ACTIVE, reason: REASON.LOGIN },
    { on: '2026-07-31', from: STATUS.ACTIVE, to: STATUS.DORMANT, reason: REASON.INACTIVITY_30 },
    { on: '2026-09-29', from: STATUS.DORMANT, to: STATUS.CHURNED, reason: REASON.INACTIVITY_90 },
    { on: '2026-11-06', from: STATUS.CHURNED, to: STATUS.ACTIVE, reason: REASON.LOGIN }
  ],
  transitions(A_AS_INTENDED)
);

/* The fixture's two as-of claims, which hold under the rule as written. */
same(
  'as-of 2026-09-05 the status is DORMANT',
  STATUS.DORMANT,
  rules.statusAt(at('2026-05-04'), at('2026-07-21'), at('2026-09-05'))
);

same(
  'exactly one DORMANT -> CHURNED transition during October',
  1,
  A_AS_WRITTEN.periods.filter(function (period) {
    const on = new Date(period.validFrom).toISOString().slice(0, 10);
    return period.previousStatus === STATUS.DORMANT
      && period.status === STATUS.CHURNED
      && on >= '2026-10-01' && on < '2026-11-01';
  }).length
);

/* ------------------------------------------------------------------ */
/*  Fixture B - new customer with a recent login                      */
/* ------------------------------------------------------------------ */

heading('Fixture B: NEW takes precedence over activity');

const B = rules.buildTimeline(
  at('2026-05-04'),
  [{ at: at('2026-05-20'), sourcePk: 1 }],
  at('2026-07-01')
);

same(
  'NEW until 06-03 despite the 05-20 login, then ACTIVE, then DORMANT on 06-19',
  [
    { on: '2026-05-04', from: null, to: STATUS.NEW, reason: REASON.REGISTRATION },
    { on: '2026-06-03', from: STATUS.NEW, to: STATUS.ACTIVE, reason: REASON.NEW_EXPIRED },
    { on: '2026-06-19', from: STATUS.ACTIVE, to: STATUS.DORMANT, reason: REASON.INACTIVITY_30 }
  ],
  transitions(B)
);

/* The login inside the NEW window adds no row - it moves the deadline. */
same('the 05-20 login created no transition of its own', 3, B.periods.length);

/* ------------------------------------------------------------------ */
/*  Fixture C - never logged in                                       */
/* ------------------------------------------------------------------ */

heading('Fixture C: never logged in');

const C = rules.buildTimeline(at('2026-05-04'), [], at('2026-09-01'));

same(
  'NEW -> DORMANT on 06-03 and DORMANT -> CHURNED on 08-02, with no login at all',
  [
    { on: '2026-05-04', from: null, to: STATUS.NEW, reason: REASON.REGISTRATION },
    { on: '2026-06-03', from: STATUS.NEW, to: STATUS.DORMANT, reason: REASON.NEW_EXPIRED },
    { on: '2026-08-02', from: STATUS.DORMANT, to: STATUS.CHURNED, reason: REASON.INACTIVITY_90 }
  ],
  transitions(C)
);

/* ------------------------------------------------------------------ */
/*  Fixture D - one customer, many logins                             */
/* ------------------------------------------------------------------ */

heading('Fixture D: repeated logins do not multiply a customer');

const D = rules.buildTimeline(
  at('2026-05-04'),
  [
    { at: at('2026-06-10'), sourcePk: 1 },
    { at: at('2026-06-11'), sourcePk: 2 },
    { at: at('2026-06-12'), sourcePk: 3 },
    /* Two at the same instant, which is what three phone records can look
       like once the device columns are dropped. */
    { at: at('2026-06-20'), sourcePk: 4 },
    { at: at('2026-06-20'), sourcePk: 5 }
  ],
  at('2026-07-01')
);

/*
 * FIVE LOGINS, ONE TRANSITION BETWEEN THEM. The customer went DORMANT when
 * the NEW override expired - their first login is 06-10, a week after 06-03,
 * so there was no activity to be judged on - and the first login brought them
 * back. The four that follow, including the two at the same instant, change
 * nothing and write nothing: that is what fixture D is for.
 */
same(
  'five logins produce exactly one login-caused transition, not five',
  [
    { on: '2026-05-04', from: null, to: STATUS.NEW, reason: REASON.REGISTRATION },
    { on: '2026-06-03', from: STATUS.NEW, to: STATUS.DORMANT, reason: REASON.NEW_EXPIRED },
    { on: '2026-06-10', from: STATUS.DORMANT, to: STATUS.ACTIVE, reason: REASON.LOGIN }
  ],
  transitions(D)
);

same(
  'the four later logins, two of them simultaneous, added no rows',
  1,
  D.periods.filter(function (period) { return period.reason === REASON.LOGIN; }).length
);

same(
  'the deadline moved with the last login, not the first',
  at('2026-07-20').toISOString(),
  D.nextTransitionAt.toISOString()
);

/* ------------------------------------------------------------------ */
/*  Fixture F - boundaries                                            */
/* ------------------------------------------------------------------ */

heading('Fixture F: the exact boundaries');

const REG = at('2026-05-04');

/*
 * AT exactly thirty days the customer is no longer ACTIVE, and at exactly
 * ninety they are CHURNED. One millisecond either side of each, so a `<=`
 * creeping into the rules fails here rather than in a quarterly report.
 */
same('one ms before +30d is ACTIVE',
  STATUS.ACTIVE,
  rules.statusAt(REG, at('2026-06-05'), new Date(at('2026-06-05').getTime() + 30 * 24 * 3600 * 1000 - 1)));

same('exactly +30d is DORMANT',
  STATUS.DORMANT,
  rules.statusAt(REG, at('2026-06-05'), new Date(at('2026-06-05').getTime() + 30 * 24 * 3600 * 1000)));

same('one ms before +90d is DORMANT',
  STATUS.DORMANT,
  rules.statusAt(REG, at('2026-06-05'), new Date(at('2026-06-05').getTime() + 90 * 24 * 3600 * 1000 - 1)));

same('exactly +90d is CHURNED',
  STATUS.CHURNED,
  rules.statusAt(REG, at('2026-06-05'), new Date(at('2026-06-05').getTime() + 90 * 24 * 3600 * 1000)));

/* The NEW override is measured from registration and ends exactly. */
same('one ms before registration +30d is still NEW',
  STATUS.NEW,
  rules.statusAt(REG, REG, new Date(REG.getTime() + 720 * 3600 * 1000 - 1)));

same('exactly registration +30d is no longer NEW',
  STATUS.DORMANT,
  rules.statusAt(REG, REG, new Date(REG.getTime() + 720 * 3600 * 1000)));

/* Before registration there is no status to report. */
same('a customer has no status before they registered',
  null,
  rules.statusAt(REG, REG, at('2026-05-03')));

/*
 * THIRTY DAYS IS 720 HOURS ACROSS A DAYLIGHT-SAVING BOUNDARY, not "the same
 * clock time thirty calendar days later". These two instants are 720 hours
 * apart by construction; a rule that did calendar arithmetic in a zone that
 * shifts would put the boundary an hour out.
 */
const beforeDst = new Date('2026-10-20T00:00:00Z');
same('the threshold is elapsed hours, not a calendar date in a shifting zone',
  STATUS.DORMANT,
  rules.statusAt(new Date('2026-01-01T00:00:00Z'), beforeDst,
    new Date(beforeDst.getTime() + 720 * 3600 * 1000)));

/* ------------------------------------------------------------------ */
/*  Fixture G - invariants                                            */
/* ------------------------------------------------------------------ */

heading('Fixture G: the structural invariants');

/* Every fixture's periods must tile the timeline with no gap and no overlap,
   and exactly one interval may be left open. */
function wellFormed(name, result) {
  const periods = result.periods;

  let contiguous = true;
  for (let i = 1; i < periods.length; i += 1) {
    if (periods[i - 1].validTo !== periods[i].validFrom) contiguous = false;
  }
  same(name + ': half-open intervals meet exactly, no gaps', true, contiguous);

  same(name + ': exactly one open interval',
    1,
    periods.filter(function (p) { return p.validTo === null; }).length);

  same(name + ': no transition from a status to itself',
    [],
    periods.filter(function (p) { return p.previousStatus === p.status; }));

  const statuses = Object.keys(STATUS);
  same(name + ': every status is one of the four',
    [],
    periods.filter(function (p) { return statuses.indexOf(p.status) === -1; }));
}

wellFormed('A', A_AS_WRITTEN);
wellFormed('B', B);
wellFormed('C', C);
wellFormed('D', D);

/*
 * THE STOCK COUNTS SUM TO THE REGISTERED POPULATION at every cutoff, which is
 * section 10's invariant and the one a dashboard gets wrong by summing daily
 * numbers. Checked here over the four fixture customers at a spread of dates:
 * every registered customer has exactly one status, so the four buckets add
 * up to the number registered by that instant and nothing is double-counted.
 */
const POPULATION = [
  { registeredAt: at('2026-05-04'), activity: at('2026-07-21') },
  { registeredAt: at('2026-05-04'), activity: at('2026-05-20') },
  { registeredAt: at('2026-05-04'), activity: at('2026-05-04') },
  { registeredAt: at('2026-06-01'), activity: at('2026-06-20') }
];

['2026-05-10', '2026-06-03', '2026-06-19', '2026-08-02', '2026-10-19', '2026-12-31']
  .forEach(function (date) {
    const counts = { NEW: 0, ACTIVE: 0, DORMANT: 0, CHURNED: 0 };
    let registered = 0;

    POPULATION.forEach(function (person) {
      const status = rules.statusAt(person.registeredAt, person.activity, at(date));
      if (status === null) return;
      registered += 1;
      counts[status] += 1;
    });

    const total = counts.NEW + counts.ACTIVE + counts.DORMANT + counts.CHURNED;
    same('as of ' + date + ': the four buckets sum to the registered population',
      registered, total);
  });

/* ------------------------------------------------------------------ */
/*  data-quality channel                                              */
/* ------------------------------------------------------------------ */

heading('Invalid events are set aside, not misclassified');

const DIRTY = rules.buildTimeline(
  at('2026-05-04'),
  [
    { at: at('2026-05-01'), sourcePk: 1 },
    { at: null, sourcePk: 2 },
    { at: at('2026-06-10'), sourcePk: 3 }
  ],
  at('2026-07-01')
);

same('a login before registration and one with no timestamp are rejected',
  ['BEFORE_REGISTRATION', 'NO_TIMESTAMP'],
  DIRTY.rejected.map(function (r) { return r.reason; }).sort());

same('and the valid login still built the timeline',
  at('2026-06-10').toISOString(),
  DIRTY.lastLoginAt.toISOString());

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  a login exactly on a deadline                                     */
/* ------------------------------------------------------------------ */

heading('A login landing exactly on a deadline');

/*
 * ONLY THE NET STATE AT AN INSTANT IS PERSISTED - section 9. This is the case
 * that proves it: a customer whose 90-day churn falls due at the very moment
 * they log in.
 *
 * The first implementation applied the deadline first and then the login,
 * which wrote DORMANT -> CHURNED and CHURNED -> ACTIVE at the same instant -
 * a churn that never happened, for zero length of time. It would also have
 * produced a period whose valid_from equals its valid_to, which the
 * lifecycle_customer_period check constraint refuses, so the rebuild would
 * have FAILED the first time a real login coincided with a deadline rather
 * than merely misreporting.
 */
const COINCIDENT = rules.buildTimeline(
  at('2026-01-01'),
  [
    { at: at('2026-03-01'), sourcePk: 1 },
    /* 2026-03-01 plus ninety days, to the day: the churn deadline. */
    { at: at('2026-05-30'), sourcePk: 2 }
  ],
  at('2026-07-01')
);

same(
  'no churn is recorded for the instant the login arrived',
  false,
  transitions(COINCIDENT).some(function (row) { return row.to === STATUS.CHURNED; })
);

same(
  'and no period has zero length, which the database would refuse',
  [],
  COINCIDENT.periods.filter(function (period) {
    return period.validTo !== null && period.validTo <= period.validFrom;
  })
);

wellFormed('coincident', COINCIDENT);


console.log('');
console.log('='.repeat(60));
console.log(failures
  ? failures + ' of ' + checks + ' checks FAILED'
  : 'all ' + checks + ' checks passed');
console.log('='.repeat(60));

process.exit(failures ? 1 : 0);
