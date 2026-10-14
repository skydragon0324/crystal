'use strict';

/**
 * A MILLION LOGINS, SO THE LIFECYCLE WORK CAN BE MEASURED RATHER THAN GUESSED.
 *
 * Requirement 13 sets the first target at 1M+ login records and asks for a
 * design that holds at 10M. The dev platform schema has 139 of them across
 * three customers, which is enough to prove a query runs and nothing at all
 * about whether a backfill finishes, whether the sweep-line snapshot builder
 * beats a per-day reclassification, or which index the transition list
 * actually uses. So this fills ora_pid.user_login_log with a realistic
 * history for the 551 customers already there.
 *
 *   node scripts/mock-login-history.js            generate (default 1,050,000)
 *   node scripts/mock-login-history.js --rows 3000000
 *   node scripts/mock-login-history.js --customers 2000
 *   node scripts/mock-login-history.js --reset    remove what it generated
 *
 * IT CAN ADD CUSTOMERS TOO, and by default it does. The dev seed registered
 * 538 of its 551 customers inside one month, so a three-year login history
 * has nothing to attach to: nobody is old enough to reach CHURNED and a
 * third of the population is permanently NEW. Churn inflow, the transition
 * matrix and the trend chart all come out empty, and a metric that cannot be
 * exercised cannot be trusted.
 *
 * So it appends customers whose registrations are spread across the whole
 * window. APPEND, NEVER MODIFY: no existing registration date is rewritten,
 * so every other feature reading ora_pid.users sees what it saw before.
 *
 * ONLY EVER THE DEVELOPMENT SCHEMA. It writes through config/legacy, which in
 * development is `ora_pid` in the same PostgreSQL server and in deployment is
 * the vendor's real Oracle. It refuses to run against the Oracle driver: this
 * is mock data, and the vendor's login log is not Crystal's to write
 * speculative rows into.
 *
 * WHAT IT GENERATED IS MARKED - logins by `phone_brand = 'mock'` and customers
 * by a `mock-` user_id prefix - so --reset removes exactly those and leaves
 * the real rows alone. Neither marker is copied into the analytics tables
 * (requirement 3), so neither is visible to anything the feature computes.
 *
 * THE SHAPE IS DELIBERATE, because uniform noise would make every customer
 * ACTIVE and there would be no transitions to count. Four behaviours, assigned
 * by a hash of the customer key so the dataset is the same every time it is
 * built:
 *
 *   regular   (20%)  logs in across the whole window, up to today
 *   lapsed    (30%)  logs in densely, then goes quiet for a stretch measured
 *                    in DAYS rather than as a fraction of their window -
 *                    which is what actually produces DORMANT and CHURNED.
 *                    A proportional gap gives a customer who registered
 *                    last month a silence of a few days, and no decay.
 *   sporadic  (30%)  scattered thinly over the whole window, so the gaps
 *                    cross the 30 and 90 day thresholds repeatedly and one
 *                    customer accumulates many transitions
 *   silent    (20%)  never logs in at all - fixture C at scale
 *
 * Every instant lands between that customer's registration and their own
 * engagement end, so no generated row is ever before its customer existed -
 * the one shape the rules would reject as a data-quality exception.
 */

require('dotenv').config();

const config = require('../src/config');
const legacy = require('../src/config/legacy');

const TARGET_DEFAULT = 1050000;

/**
 * HOW MANY CUSTOMERS TO APPEND, so the population has a real age spread.
 *
 * Thirty thousand against a million logins is about thirty-five logins each,
 * which is a believable year of use for a consumer app and - more to the
 * point - makes the backfill, the transition list and the snapshot sweep run
 * against a population big enough for their costs to be visible. At 2,000
 * everything is fast whether or not it is written well.
 */
const CUSTOMERS_DEFAULT = 30000;

/**
 * How far back the appended registrations reach.
 *
 * Comfortably over a year, because a year is the shortest window in which a
 * customer can register, lapse, churn and come back - and a dataset that
 * cannot show that cycle cannot exercise the metrics built to count it.
 */
const HISTORY_DAYS = int(argOf('--history-days', 1280), 1280);

const DAY = 24 * 60 * 60 * 1000;

/** The user_id prefix that marks an appended customer. */
const CUSTOMER_MARKER = 'mock-';

/* phone_brand on a generated row. The real ones carry a real brand or ''. */
const MARKER = 'mock';

/**
 * ROWS PER INSERT, AND THE CEILING IS NOT TASTE.
 *
 * PostgreSQL accepts at most 65,535 bind parameters in one statement, and a
 * row here carries six - so anything above ~10,900 rows is refused outright.
 * 5,000 leaves room and still makes this two hundred statements for a
 * million rows rather than two hundred thousand.
 */
const BATCH = 5000;

/** A positive integer from the command line, or the fallback. */
function int(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

function argOf(name, fallback) {
  const at = process.argv.indexOf(name);
  if (at === -1) return fallback;
  return process.argv[at + 1];
}

/** A deterministic 0..9 bucket from the customer key. */
function bucketOf(userPk) {
  let hash = 2166136261;
  const text = String(userPk);

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }

  return hash % 10;
}

/** The four behaviours, by bucket. `share` is this pattern's slice of rows. */
function behaviourOf(bucket) {
  if (bucket < 2) return { name: 'regular', weight: 4.0, engagedTo: 1 };
  if (bucket < 5) return { name: 'lapsed', weight: 3.2, engagedTo: null };
  if (bucket < 8) return { name: 'sporadic', weight: 0.6, engagedTo: 1 };
  return { name: 'silent', weight: 0, engagedTo: 0 };
}

/*
 * A SMALL DETERMINISTIC GENERATOR, not Math.random: the dataset has to be the
 * same on every machine that builds it, or a measurement taken here cannot be
 * compared with one taken there. Mulberry32, seeded from the customer key.
 */
function randomFor(seed) {
  let state = (seed + 0x6d2b79f5) >>> 0;

  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * APPEND CUSTOMERS, REGISTERED ACROSS THE WHOLE WINDOW.
 *
 * Spread evenly rather than randomly, so the population has customers of
 * every age and the NEW cohort is a slice of the window rather than most of
 * it. A deterministic jitter inside each slot keeps them off a grid without
 * making the dataset different on every machine.
 *
 * The columns that are NOT NULL in the source get real values; the ones that
 * carry identity - password, id_card, cid - get nothing worth having, because
 * mock rows should not look like credentials. `status` is 1 and `locked` 0,
 * the source's own defaults for an ordinary account.
 */
async function appendCustomers(conn, wanted) {
  const table = legacy.pid('users');

  const existing = await conn(table)
    .where('user_id', 'like', CUSTOMER_MARKER + '%')
    .count('* as n')
    .first();

  if (Number(existing.n) > 0) {
    console.log(Number(existing.n).toLocaleString()
      + ' mock customers are already present');
    return 0;
  }

  /* A location to point at, if the source has any. */
  const locations = await conn(legacy.pid('locations')).select('location_pk').orderBy('location_pk');
  const now = Date.now();
  const rows = [];

  for (let i = 0; i < wanted; i += 1) {
    const random = randomFor(900000 + i);

    /*
     * Evenly across the window, oldest first, with a jitter of up to one
     * slot so the registrations do not all land at the same time of day.
     */
    const slot = (HISTORY_DAYS / wanted) * i;
    const registered = new Date(now - (HISTORY_DAYS - slot - random() * (HISTORY_DAYS / wanted)) * DAY);

    const id = CUSTOMER_MARKER + String(i + 1).padStart(6, '0');

    rows.push({
      user_id: id,
      /* Not a hash of anything and not usable: a mock row is not an account. */
      password: 'x',
      user_name: 'Mock Customer ' + (i + 1),
      gender: i % 2 === 0 ? 'M' : 'F',
      birthday: new Date(Date.UTC(1970 + (i % 35), i % 12, 1 + (i % 27))),
      job: (i % 9) + 1,
      location_pk: locations.length ? locations[i % locations.length].location_pk : null,
      status: 1,
      locked: 0,
      created_at: registered,
      updated_at: registered
    });
  }

  const size = 2000;
  for (let at = 0; at < rows.length; at += size) {
    await conn(table).insert(rows.slice(at, at + size));
  }

  console.log('appended ' + rows.length.toLocaleString() + ' customers, registered '
    + new Date(now - HISTORY_DAYS * DAY).toISOString().slice(0, 10) + ' onwards');

  return rows.length;
}

async function main() {
  if (config.legacy.driver === 'oracle') {
    console.error('refusing to write mock rows to the vendor Oracle instance.');
    console.error('this script is for LEGACY_DRIVER=postgres (development) only.');
    process.exit(1);
  }

  const conn = legacy.connection();
  const table = legacy.pid('user_login_log');

  try {
    if (process.argv.indexOf('--reset') !== -1) {
      const gone = await conn(table).where('phone_brand', MARKER).del();
      console.log('removed ' + gone.toLocaleString() + ' generated login rows');

      /*
       * The customers go after their logins, so there is never a moment when
       * a journal row points at a customer who is gone - which is the shape
       * that would land in the exception channel as an orphan.
       */
      const users = legacy.pid('users');
      const customers = await conn(users)
        .where('user_id', 'like', CUSTOMER_MARKER + '%')
        .del();
      console.log('removed ' + customers.toLocaleString() + ' mock customers');

      const left = await conn(table).count('* as n').first();
      console.log(Number(left.n).toLocaleString() + ' login rows remain (the real ones)');
      return;
    }

    const target = Number(argOf('--rows', TARGET_DEFAULT));
    if (!Number.isFinite(target) || target < 1) throw new Error('--rows must be a number');

    const customersWanted = Number(argOf('--customers', CUSTOMERS_DEFAULT));
    if (customersWanted > 0) await appendCustomers(conn, customersWanted);

    const users = await conn(legacy.pid('users'))
      .select('user_pk', 'created_at')
      .orderBy('user_pk');

    if (!users.length) throw new Error('no customers in ora_pid.users to generate for');

    const already = await conn(table).where('phone_brand', MARKER).count('* as n').first();
    if (Number(already.n) > 0) {
      console.log(Number(already.n).toLocaleString()
        + ' generated rows are already present - run with --reset first to rebuild');
      return;
    }

    const now = Date.now();

    /*
     * The weights decide each customer's share of the target, so the total
     * lands where it was asked to rather than wherever the per-pattern
     * constants happen to add up to.
     */
    let weightTotal = 0;
    const plan = users.map(function (user) {
      const bucket = bucketOf(user.user_pk);
      const behaviour = behaviourOf(bucket);
      weightTotal += behaviour.weight;
      return { user: user, bucket: bucket, behaviour: behaviour };
    });

    const counts = { regular: 0, lapsed: 0, sporadic: 0, silent: 0 };
    let planned = 0;

    plan.forEach(function (entry) {
      const registered = new Date(entry.user.created_at).getTime();
      const window = Math.max(0, now - registered);
      const random = randomFor(Number(entry.user.user_pk));

      entry.registered = registered;
      entry.rows = Math.round(target * (entry.behaviour.weight / weightTotal));

      /*
       * WHEN THIS CUSTOMER STOPPED, AS AN ABSOLUTE SILENCE.
       *
       * A lapsed customer goes quiet 40 to 400 days ago - not "two thirds of
       * the way through their window", which was the first attempt and was
       * wrong: for somebody who registered last month that is a silence of a
       * few days, so they never decay at all and the churn metrics stay
       * empty. Days are what the thresholds are measured in, so days are
       * what the gap has to be measured in.
       *
       * Clamped so it never precedes registration: a customer cannot fall
       * silent before they existed, and a login before registration is the
       * one shape the rules reject outright.
       */
      if (entry.behaviour.name === 'lapsed') {
        const silentDays = 40 + random() * 360;
        entry.engagedTo = Math.max(
          registered + Math.min(DAY, window * 0.1),
          now - silentDays * DAY
        );
      } else {
        entry.engagedTo = now;
      }

      /* A customer registered minutes ago has no window to put logins in. */
      if (entry.engagedTo - registered < 60000) entry.rows = 0;

      counts[entry.behaviour.name] += 1;
      planned += entry.rows;
    });

    console.log('customers        ' + users.length.toLocaleString()
      + '  (regular ' + counts.regular + ', lapsed ' + counts.lapsed
      + ', sporadic ' + counts.sporadic + ', silent ' + counts.silent + ')');
    console.log('rows to generate ' + planned.toLocaleString());
    console.log('');

    const started = Date.now();
    let written = 0;
    let rows = [];

    const flush = async function () {
      if (!rows.length) return;
      await conn(table).insert(rows);
      written += rows.length;
      rows = [];
      const seconds = (Date.now() - started) / 1000;
      console.log('  ' + written.toLocaleString() + ' rows  ('
        + Math.round(written / Math.max(seconds, 0.001)).toLocaleString() + '/s)');
    };

    for (let i = 0; i < plan.length; i += 1) {
      const entry = plan[i];
      if (!entry.rows) continue;

      const random = randomFor(Number(entry.user.user_pk) * 7919);
      const span = entry.engagedTo - entry.registered;

      for (let n = 0; n < entry.rows; n += 1) {
        rows.push({
          user_pk: entry.user.user_pk,
          cid: null,
          phone_brand: MARKER,
          phone_model: '',
          phone_imei: '',
          action_at: new Date(entry.registered + random() * span)
        });

        if (rows.length >= BATCH) await flush();
      }
    }

    await flush();

    const total = await conn(table).count('* as n').first();
    const span = await conn(table).min('action_at as lo').max('action_at as hi').first();

    console.log('');
    console.log('wrote ' + written.toLocaleString() + ' rows in '
      + ((Date.now() - started) / 1000).toFixed(1) + 's');
    console.log('table now holds ' + Number(total.n).toLocaleString() + ' rows, '
      + new Date(span.lo).toISOString().slice(0, 10) + ' to '
      + new Date(span.hi).toISOString().slice(0, 10));
  } finally {
    await legacy.disconnect();
  }
}

main().then(
  function () { process.exit(0); },
  function (err) {
    console.error(err.message);
    process.exit(1);
  }
);
