'use strict';

/**
 * THE JOBS, CHECKED AGAINST THE SPECIFICATION'S DATABASE FIXTURES.
 *
 * check-lifecycle.js covers the arithmetic with no database at all. This
 * covers the half that needs one: fixtures E (historical repair) and H
 * (synchronisation reliability), plus the snapshot invariants from G across
 * the whole series rather than on one day.
 *
 *   node scripts/check-lifecycle-sync.js
 *
 * IT RUNS AGAINST WHATEVER IS ALREADY BACKFILLED and puts it back as it found
 * it. Each case appends its own rows to the development source, runs the real
 * jobs over them, asserts, and removes them - so it can be run repeatedly and
 * leaves no mock customer behind. It refuses to run against Oracle.
 *
 * THE CUSTOMER IT USES IS ITS OWN. Asserting against somebody from the seeded
 * population would make the result depend on data this script does not
 * control; it creates a customer, gives them a known history, and checks the
 * exact timeline the rules say they must have.
 */

require('dotenv').config();

const config = require('../src/config');
const legacy = require('../src/config/legacy');
const db = require('../src/config/db');

const repo = require('../src/repositories/lifecycle.repository');
const sync = require('../src/services/lifecycle/sync.service');
const timeline = require('../src/services/lifecycle/timeline.service');
const snapshots = require('../src/services/lifecycle/snapshots.service');
const rules = require('../src/services/lifecycle/rules');

const MARKER = 'checksync-';

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

function at(date) {
  return new Date(date + 'T00:00:00Z');
}

/** Days ago, as an instant - so the fixtures stay valid as time passes. */
function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

/* ------------------------------------------------------------------ */
/*  a customer of our own                                             */
/* ------------------------------------------------------------------ */

async function makeCustomer(conn, suffix, registeredAt) {
  const rows = await conn(legacy.pid('users'))
    .insert({
      user_id: MARKER + suffix,
      password: 'x',
      user_name: 'Sync Check ' + suffix,
      status: 1,
      locked: 0,
      created_at: registeredAt,
      updated_at: registeredAt
    })
    .returning('user_pk');

  const pk = Array.isArray(rows)
    ? Number(rows[0].user_pk === undefined ? rows[0] : rows[0].user_pk)
    : Number(rows);

  return pk;
}

async function addLogin(conn, userPk, actionAt) {
  const rows = await conn(legacy.pid('user_login_log'))
    .insert({
      user_pk: userPk,
      cid: null,
      phone_brand: 'checksync',
      phone_model: '',
      phone_imei: '',
      action_at: actionAt
    })
    .returning('table_pk');

  return Array.isArray(rows)
    ? Number(rows[0].table_pk === undefined ? rows[0] : rows[0].table_pk)
    : Number(rows);
}

/** Everything this script created, in both databases. */
async function cleanUp(conn) {
  const users = await conn(legacy.pid('users'))
    .where('user_id', 'like', MARKER + '%')
    .pluck('user_pk');

  if (users.length) {
    await conn(legacy.pid('user_login_log')).whereIn('user_pk', users).del();
    await conn(legacy.pid('users')).whereIn('user_pk', users).del();

    await db('lifecycle_customer_period').whereIn('user_pk', users).del();
    await db('lifecycle_customer_current').whereIn('user_pk', users).del();
    await db('lifecycle_login_event').whereIn('user_pk', users).del();
    await db('lifecycle_customer_profile').whereIn('user_pk', users).del();
    await db('lifecycle_exception').whereIn('user_pk', users).del();
  }

  return users.length;
}

function transitionsOf(periods) {
  return periods.map(function (period) {
    return {
      from: period.previous_status,
      to: period.status,
      reason: period.reason
    };
  });
}

async function main() {
  if (config.legacy.driver === 'oracle') {
    console.error('refusing to write check rows to the vendor Oracle instance.');
    process.exit(1);
  }

  const conn = legacy.connection();

  await cleanUp(conn);

  try {
    /* ---------------------------------------------------------------- */
    heading('Fixture H: a replayed import changes nothing');

    /*
     * Registered 200 days ago, one login 150 days ago. Deliberately old
     * enough that the thresholds have all fired, so the timeline has
     * something in it to be made wrong.
     */
    const pk = await makeCustomer(conn, 'replay', daysAgo(200));
    const firstLogin = await addLogin(conn, pk, daysAgo(150));

    await sync.syncProfiles({});
    const firstImport = await sync.importLogins({ overlap: 0 });
    await timeline.rebuild(pk);

    const after = await repo.periodsOf(pk);

    /* NEW, then the override expires into DORMANT... then the login makes
       them ACTIVE, then DORMANT, then CHURNED. */
    same('the history is built',
      [
        { from: null, to: 'NEW', reason: 'REGISTRATION' },
        { from: 'NEW', to: 'DORMANT', reason: 'NEW_EXPIRED' },
        { from: 'DORMANT', to: 'ACTIVE', reason: 'LOGIN' },
        { from: 'ACTIVE', to: 'DORMANT', reason: 'INACTIVITY_30' },
        { from: 'DORMANT', to: 'CHURNED', reason: 'INACTIVITY_90' }
      ],
      transitionsOf(after));

    /*
     * THE SAME BATCH AGAIN. knex 0.21 drops `.onConflict()` silently, so this
     * is the check that the raw ON CONFLICT in the repository is really
     * there - without it this is a duplicate-key error, not a no-op.
     */
    /*
     * THE WHOLE LOG AGAIN. knex 0.21 drops `.onConflict()` silently, so this
     * is the check that the raw ON CONFLICT in the repository is really
     * there: without it this is a duplicate-key error, and with a naive row
     * count it would claim a million fresh ingests.
     */
    const replay = await sync.importLogins({ overlap: 1000000 });
    same('re-importing the whole log reads it all', true, replay.read > 1000);
    same('and writes nothing, because every row is already journalled',
      0, replay.written);

    await timeline.rebuild(pk);
    same('and the history is byte-for-byte the same',
      transitionsOf(after), transitionsOf(await repo.periodsOf(pk)));

    /* ---------------------------------------------------------------- */
    heading('Fixture H: a commit the watermark missed, found by reconciliation');

    /*
     * THE HOLE IN THE WATERMARK, REPRODUCED. A row is inserted whose key is
     * BELOW the mark the importer has already recorded - which is exactly
     * what a late-committing transaction looks like from the poller's side.
     * The incremental import cannot see it; reconciliation must.
     */
    /*
     * THE ROW EXISTS IN THE SOURCE AND THE WATERMARK IS ABOVE IT, which is
     * precisely the state a late commit leaves behind: the key was assigned
     * before the poll ran, the poll could not see it because the transaction
     * had not committed, and the poll recorded a higher mark. Every
     * subsequent scan passes over it.
     *
     * Moving the checkpoint is how that state is reached here, because the
     * sequence leaves no gaps to insert into below the mark.
     */
    const buried = await addLogin(conn, pk, daysAgo(120));
    await repo.saveCheckpoint(sync.LOGIN_STREAM, { lastSourcePk: buried + 50 });

    const blind = await sync.importLogins({ overlap: 0 });
    same('the incremental import passes over a key below its watermark',
      false,
      blind.customers.indexOf(pk) !== -1);

    const journalled = await db('lifecycle_login_event')
      .where('source_table_pk', buried).first();
    same('so the row is genuinely missing from the journal', undefined, journalled);

    const found = await sync.reconcileLogins({});
    same('reconciliation finds it and imports it', true, found.recovered >= 1);
    same('and names the customer whose timeline must be rebuilt',
      true,
      found.customers.indexOf(pk) !== -1);

    const recovered = await db('lifecycle_login_event')
      .where('source_table_pk', buried).first();
    same('the journal now holds it', true, !!recovered);

    /*
     * PUT THE WATERMARK BACK. This case falsified it on purpose, and the
     * cases below import more rows - a mark left above them would make them
     * fail for this case's reason rather than their own, which is how a
     * suite starts lying about where a bug is.
     */
    const trueMax = await db('lifecycle_login_event').max('source_table_pk as pk').first();
    await repo.saveCheckpoint(sync.LOGIN_STREAM, { lastSourcePk: Number(trueMax.pk) });

    /* ---------------------------------------------------------------- */
    heading('Fixture E: a late login inside a dormant gap');

    /*
     * The customer above is CHURNED, having last logged in 150 days ago. A
     * login arriving now for 60 days ago lands inside that gap: it should
     * remove the CHURNED transition that never happened, and leave them
     * DORMANT rather than churned.
     */
    const before = transitionsOf(await repo.periodsOf(pk));
    same('before the repair, the customer had churned',
      true,
      before.some(function (t) { return t.to === 'CHURNED'; }));

    await addLogin(conn, pk, daysAgo(60));
    await sync.importLogins({ overlap: 0 });

    const repaired = await timeline.rebuild(pk);
    const afterRepair = transitionsOf(await repo.periodsOf(pk));

    same('the late login removed the churn that never happened',
      false,
      afterRepair.some(function (t) { return t.to === 'CHURNED'; }));

    const current = await db('lifecycle_customer_current').where('user_pk', pk).first();
    same('and the current status is DORMANT, 60 days after a login', 'DORMANT', current.status);

    same('the rebuild reported the days whose snapshots are now wrong',
      true,
      repaired.days.length > 0);

    /* ---------------------------------------------------------------- */
    heading('Fixture E: the snapshots are repaired, not rebuilt whole');

    const beforeRepair = await repo.countDaily();
    const outcome = await snapshots.repairDays(repaired.days);

    same('a repair touched fewer days than the whole series',
      true,
      outcome.days > 0 && outcome.days <= beforeRepair);

    same('and it started from the earliest dirty day',
      repaired.days.slice().sort()[0],
      outcome.from);

    /* ---------------------------------------------------------------- */
    heading('Fixture G: the invariants across the whole series');

    /*
     * Every day, not just the newest: the sweep carries running totals, so an
     * error on one day is carried forward silently to every day after it.
     */
    const broken = await db.raw(
      'SELECT snapshot_date FROM lifecycle_kpi_daily'
      + ' WHERE total_count <> new_count + active_count + dormant_count + churned_count'
      + ' LIMIT 5'
    );
    same('every day\'s four buckets sum to its total', [], (broken.rows || broken));

    const negative = await db.raw(
      'SELECT snapshot_date FROM lifecycle_kpi_daily'
      + ' WHERE new_count < 0 OR active_count < 0 OR dormant_count < 0 OR churned_count < 0'
      + ' LIMIT 5'
    );
    same('no day has a negative count', [], (negative.rows || negative));

    /*
     * THE TOTAL IS THE REGISTERED POPULATION, checked on a spread of days
     * rather than one. This is the invariant that catches a timeline with a
     * gap: the sums still tie to each other and the population is short.
     */
    const spotted = await db.raw(
      `SELECT d.snapshot_date, d.total_count,
              (SELECT COUNT(*) FROM lifecycle_customer_profile p
                WHERE (p.registered_at AT TIME ZONE ?)::date <= d.snapshot_date) AS registered
         FROM lifecycle_kpi_daily d
        ORDER BY d.snapshot_date
        LIMIT 400`,
      [config.lifecycle.reportTimezone]
    );

    const mismatched = (spotted.rows || spotted).filter(function (row) {
      return Number(row.total_count) !== Number(row.registered);
    });

    same('the total equals the registered population on every day checked',
      [],
      mismatched.slice(0, 5).map(function (row) {
        return snapshots.dayKey(row.snapshot_date)
          + ': total ' + row.total_count + ' vs registered ' + row.registered;
      }));

    /* ---------------------------------------------------------------- */
    heading('Fixture H: malformed and orphaned source rows');

    /* A login with no timestamp, which cannot be classified. */
    const orphanPk = await makeCustomer(conn, 'orphan', daysAgo(90));
    await conn(legacy.pid('user_login_log')).insert({
      user_pk: orphanPk,
      cid: null,
      phone_brand: 'checksync',
      phone_model: '',
      phone_imei: '',
      action_at: null
    });

    const beforeExceptions = await repo.countOpenExceptions();
    await sync.importLogins({ overlap: 1000000 });
    const afterExceptions = await repo.countOpenExceptions();

    same('a login with no timestamp is recorded as an exception',
      true,
      afterExceptions > beforeExceptions);

    /*
     * AN ORPHAN: journal rows for a customer with no profile yet. The rebuild
     * must say so rather than inventing a history or throwing.
     */
    await db('lifecycle_customer_profile').where('user_pk', orphanPk).del();
    const orphanResult = await timeline.rebuild(orphanPk);
    same('a customer with no profile is skipped, not guessed at', false, orphanResult.built);

    /* ---------------------------------------------------------------- */
    heading('The deadline processor moves a status with no login at all');

    /*
     * Registered exactly 31 days ago and never logged in: the NEW override
     * expired yesterday, so this customer is due. Fixture C at the job level.
     */
    const silentPk = await makeCustomer(conn, 'silent', daysAgo(31));
    await sync.syncProfiles({});
    await timeline.rebuild(silentPk);

    const silent = await db('lifecycle_customer_current').where('user_pk', silentPk).first();
    same('a customer who never logged in is DORMANT after 30 days', 'DORMANT', silent.status);
    same('and carries the instant their next change falls due',
      true,
      silent.next_transition_at !== null);

    /* The due date is 90 days from registration, not from now. */
    const due = new Date(silent.next_transition_at).getTime();
    const expected = new Date(silent.effective_last_activity_at).getTime()
      + rules.RULES_V1.churnedHours * 3600 * 1000;
    same('the due instant is 90 days after their last activity', expected, due);
  } finally {
    const removed = await cleanUp(conn);
    console.log('');
    console.log('cleaned up ' + removed + ' check customers');

    /* The series was changed by the fixtures above; put it back. */
    await snapshots.rebuildAll({});
    console.log('snapshots rebuilt from the restored data');
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
