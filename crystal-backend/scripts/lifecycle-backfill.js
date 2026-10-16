'use strict';

/**
 * THE BACKFILL, AS AN OPERATOR RUNS IT.
 *
 *   node scripts/lifecycle-backfill.js            profiles, logins, timelines, snapshots
 *   node scripts/lifecycle-backfill.js --step logins
 *   node scripts/lifecycle-backfill.js --verify    check the invariants only
 *
 * Four steps in order, because each needs the one before it: a timeline needs
 * the journal and the profile, and a snapshot needs the timelines. Each step
 * records a row in lifecycle_job_run, so an interrupted backfill leaves
 * evidence of how far it got rather than silence.
 *
 * SAFE TO RUN AGAIN. Every step is idempotent - the imports upsert by source
 * key, the rebuild replaces a customer's history with what the journal says
 * it is, and the snapshot sweep overwrites the series. Running it twice gives
 * the same database, which is what requirement 8 means by replay.
 */

require('dotenv').config();

const config = require('../src/config');
const legacy = require('../src/config/legacy');
const db = require('../src/config/db');

const repo = require('../src/repositories/lifecycle.repository');
const sync = require('../src/services/lifecycle/sync.service');
const timeline = require('../src/services/lifecycle/timeline.service');
const snapshots = require('../src/services/lifecycle/snapshots.service');

function argOf(name, fallback) {
  const at = process.argv.indexOf(name);
  return at === -1 ? fallback : process.argv[at + 1];
}

function seconds(from) {
  return ((Date.now() - from) / 1000).toFixed(1) + 's';
}

/** Runs one step inside a job_run row, so a failure is recorded. */
async function step(name, work) {
  const id = await repo.startRun(name, null);
  const started = Date.now();

  try {
    const totals = await work();
    await repo.finishRun(id, 'SUCCEEDED', totals);
    console.log('  ' + name + ' finished in ' + seconds(started));
    return totals;
  } catch (err) {
    await repo.finishRun(id, 'FAILED', { error: err.message });
    console.error('  ' + name + ' FAILED after ' + seconds(started) + ': ' + err.message);
    throw err;
  }
}

async function main() {
  const only = argOf('--step', null);
  const wanted = function (name) { return !only || only === name; };

  console.log('report timezone  ' + config.lifecycle.reportTimezone);
  console.log('source timezone  ' + config.lifecycle.sourceTimezone);
  console.log('rule version     ' + config.lifecycle.ruleVersion);
  console.log('');

  if (process.argv.indexOf('--verify') !== -1) {
    await verify();
    return;
  }

  if (wanted('profiles')) {
    await step('backfill_profiles', async function () {
      const out = await sync.syncProfiles({});
      console.log('    customers read ' + out.read.toLocaleString()
        + ', stored ' + out.written.toLocaleString());
      return { rowsRead: out.read, rowsWritten: out.written };
    });
  }

  if (wanted('logins')) {
    await step('backfill_logins', async function () {
      const out = await sync.importLogins({ overlap: 0 });
      console.log('    login rows read ' + out.read.toLocaleString()
        + ', journalled ' + out.written.toLocaleString()
        + ', high key ' + out.highestPk.toLocaleString());
      return { rowsRead: out.read, rowsWritten: out.written };
    });
  }

  if (wanted('timelines')) {
    await step('backfill_timelines', async function () {
      const started = Date.now();
      let last = 0;

      const out = await timeline.backfill({
        batch: 500,
        onProgress: function (done) {
          if (done - last >= 100) {
            last = done;
            console.log('    ' + done.toLocaleString() + ' customers in ' + seconds(started));
          }
        }
      });

      console.log('    timelines built ' + out.rebuilt.toLocaleString()
        + ', skipped ' + out.skipped.toLocaleString()
        + ', dirty days ' + out.dirtyDays.length.toLocaleString());

      return { customersRebuilt: out.rebuilt, datesTouched: out.dirtyDays.length };
    });
  }

  if (wanted('snapshots')) {
    await step('backfill_snapshots', async function () {
      const out = await snapshots.rebuildAll({});
      console.log('    ' + out.days.toLocaleString() + ' daily snapshots, '
        + out.from + ' to ' + out.to);
      return { rowsWritten: out.days, datesTouched: out.days };
    });
  }

  console.log('');
  await verify();
}

/** What is in the analytics tables now, and whether it holds together. */
async function verify() {
  const profiles = await repo.countProfiles();
  const journal = await repo.journalStats();
  const periods = await repo.countPeriods();
  const days = await repo.countDaily();
  const exceptions = await repo.countOpenExceptions();

  console.log('profiles   ' + profiles.toLocaleString());
  console.log('journal    ' + journal.rows.toLocaleString()
    + '  (high key ' + journal.maxSourcePk.toLocaleString() + ')');
  console.log('periods    ' + periods.toLocaleString());
  console.log('snapshots  ' + days.toLocaleString());
  console.log('exceptions ' + exceptions.toLocaleString());
  console.log('');

  /* The newest snapshot, and the same numbers computed straight from the
     periods - two routes to one answer. */
  const latest = await db('lifecycle_kpi_daily').orderBy('snapshot_date', 'desc').first();

  if (!latest) {
    console.log('no snapshots to check');
    return;
  }

  const check = await snapshots.verify(latest.snapshot_date);

  console.log('latest snapshot ' + snapshots.dayKey(latest.snapshot_date));
  console.log('  NEW ' + latest.new_count
    + '  ACTIVE ' + latest.active_count
    + '  DORMANT ' + latest.dormant_count
    + '  CHURNED ' + latest.churned_count
    + '  = TOTAL ' + latest.total_count);
  console.log('  registrations that day ' + latest.registered_count);
  console.log('');
  console.log('cross-checked against the period table: '
    + (check.agrees ? 'AGREES' : 'DISAGREES'));

  if (!check.agrees) {
    console.log('  snapshot    ' + JSON.stringify(check.snapshot));
    console.log('  periods     ' + JSON.stringify(check.fromPeriods));
  }

  /* And the population invariant: every registered customer in exactly one
     bucket at that cutoff. */
  const registered = await db('lifecycle_customer_profile')
    .count('* as n')
    .whereRaw('(registered_at AT TIME ZONE ?)::date <= ?',
      [config.lifecycle.reportTimezone, snapshots.dayKey(latest.snapshot_date)])
    .first();

  const matches = Number(registered.n) === Number(latest.total_count);
  console.log('total equals customers registered by that day: '
    + (matches ? 'YES' : 'NO (' + registered.n + ' registered vs ' + latest.total_count + ')'));
}

main().then(
  async function () {
    await legacy.disconnect();
    await db.destroy();
    process.exit(0);
  },
  async function (err) {
    console.error(err.stack || err.message);
    try { await legacy.disconnect(); await db.destroy(); } catch (e) { /* closing down */ }
    process.exit(1);
  }
);
