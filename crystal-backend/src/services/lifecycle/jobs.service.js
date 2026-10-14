'use strict';

const db = require('../../config/db');
const config = require('../../config');
const repo = require('../../repositories/lifecycle.repository');
const sync = require('./sync.service');
const timeline = require('./timeline.service');
const snapshots = require('./snapshots.service');

/**
 * THE SCHEDULED WORK, AND THE LOCK THAT STOPS TWO OF IT.
 *
 * Four jobs, each of which is a writer, and the application runs on more than
 * one Node process. Two copies of the deadline processor rebuilding the same
 * customer would serialise on the per-customer lock and do the work twice;
 * two copies of the snapshot sweep would both write the whole series. So
 * every job here takes a NAMED ADVISORY LOCK first and declines if somebody
 * else holds it (requirement 7.7).
 *
 * `pg_try_advisory_lock` RATHER THAN `pg_advisory_lock`: the blocking form
 * would queue the second instance behind the first and then run it anyway,
 * which for a nightly sweep means doing it twice in a row rather than once.
 * Trying and declining is the behaviour wanted, and the declined run is
 * still recorded - a job that found the lock held is a fact worth keeping,
 * which is why 'SKIPPED' is one of the statuses lifecycle_job_run allows.
 *
 * THE LOCK IS SESSION-SCOPED, so it has to be released by hand, which means
 * it has to be released in a `finally` and on its own connection. A
 * transaction-scoped lock would be released at the first commit, and these
 * jobs commit many times.
 *
 * EVERY FAILURE IS CAUGHT AND RECORDED. A scheduled job that throws takes the
 * process with it, and an API that dies at 03:00 because a sweep met a bad
 * row is worse than a sweep that skipped a night - the same reasoning the
 * existing sweeps.service.js is built on.
 */

/** One lock per job name, so different jobs never block each other. */
async function withLock(name, work) {
  /*
   * ITS OWN CONNECTION. A session lock belongs to the session that took it,
   * and a pooled connection handed back to the pool mid-job would take the
   * lock with it.
   */
  const holder = await db.client.acquireConnection();

  try {
    const key = 'lifecycle_job_' + name;
    const got = await db.raw('SELECT pg_try_advisory_lock(hashtext(?)) AS ok', [key])
      .connection(holder);

    const rows = got.rows || got;
    if (!rows.length || rows[0].ok !== true) {
      return { skipped: true };
    }

    try {
      return await work();
    } finally {
      await db.raw('SELECT pg_advisory_unlock(hashtext(?))', [key]).connection(holder);
    }
  } finally {
    await db.client.releaseConnection(holder);
  }
}

/** Runs `work` under the lock, recording a row in lifecycle_job_run. */
async function run(name, work, requestedBy) {
  const id = await repo.startRun(name, requestedBy);

  try {
    const outcome = await withLock(name, work);

    if (outcome && outcome.skipped) {
      await repo.finishRun(id, 'SKIPPED', { error: 'another instance holds the lock' });
      return { job: name, skipped: true };
    }

    await repo.finishRun(id, 'SUCCEEDED', outcome || {});
    return Object.assign({ job: name }, outcome || {});
  } catch (err) {
    await repo.finishRun(id, 'FAILED', { error: err.message });
    console.error('[lifecycle] ' + name + ' failed: ' + err.message);
    return { job: name, failed: true, error: err.message };
  }
}

/* ------------------------------------------------------------------ */
/*  the jobs                                                           */
/* ------------------------------------------------------------------ */

/**
 * THE POLL: new logins, the customers they touch, and the days that changed.
 *
 * Import, rebuild, repair - in that order, because each needs the one before
 * it. The repair is scoped to the days the rebuilds actually touched, which
 * for an ordinary poll is today and yesterday rather than three years.
 */
function poll() {
  return run('lifecycle_poll', async function () {
    const imported = await sync.importLogins({});

    const rebuilt = imported.customers.length
      ? await timeline.rebuildMany(imported.customers)
      : { rebuilt: 0, dirtyDays: [] };

    const repaired = rebuilt.dirtyDays.length
      ? await snapshots.repairDays(rebuilt.dirtyDays)
      : { days: 0 };

    return {
      rowsRead: imported.read,
      rowsWritten: imported.written,
      customersRebuilt: rebuilt.rebuilt,
      datesTouched: repaired.days
    };
  });
}

/**
 * THE DEADLINES: statuses that change because time passed.
 *
 * This is the job that makes the feature correct without any login at all -
 * fixture C's customer becomes DORMANT and then CHURNED entirely here.
 */
function deadlines() {
  return run('lifecycle_deadlines', async function () {
    const processed = await timeline.processDeadlines({});

    const repaired = processed.dirtyDays.length
      ? await snapshots.repairDays(processed.dirtyDays)
      : { days: 0 };

    return {
      customersRebuilt: processed.rebuilt,
      datesTouched: repaired.days
    };
  });
}

/**
 * THE RECONCILIATION: every source key compared with the journal.
 *
 * The expensive one, and the one that makes completeness a fact rather than a
 * hope - see the note at the head of sync.service.js. Off-peak, because it
 * reads the whole source key space.
 */
function reconcile(requestedBy) {
  return run('lifecycle_reconcile', async function () {
    const found = await sync.reconcileLogins({});

    const rebuilt = found.customers.length
      ? await timeline.rebuildMany(found.customers)
      : { rebuilt: 0, dirtyDays: [] };

    const repaired = rebuilt.dirtyDays.length
      ? await snapshots.repairDays(rebuilt.dirtyDays)
      : { days: 0 };

    return {
      rowsRead: found.checked,
      rowsWritten: found.recovered,
      customersRebuilt: rebuilt.rebuilt,
      datesTouched: repaired.days
    };
  }, requestedBy);
}

/**
 * THE PROFILES: new customers and changed details.
 *
 * Separate from the login poll because a new customer with no logins still
 * has a history, and because requirement 8 is explicit that
 * `USERS.UPDATED_AT` cannot be trusted as a changed-since cursor - so this
 * walks the customer table rather than filtering on it.
 */
function profiles() {
  return run('lifecycle_profiles', async function () {
    const out = await sync.syncProfiles({});
    return { rowsRead: out.read, rowsWritten: out.written };
  });
}

/* ------------------------------------------------------------------ */
/*  what the admin health view reads                                   */
/* ------------------------------------------------------------------ */

/**
 * FRESHNESS, AND WHAT IS KNOWN NOT TO BE GUARANTEED.
 *
 * `reconciliationIsTheOnlyCompletenessGuarantee` is not a decorative field.
 * Requirement 8 asks for the limitation to be visible to an operator rather
 * than buried in a comment: between a missed commit and the next
 * reconciliation the data is incomplete, and the person looking at the
 * dashboard is the person who needs to know that.
 */
/**
 * WHAT THE CONNECTION POOL IS DOING, right now.
 *
 * Requirement 13 asks for pool usage to be observable, and this feature is
 * the reason to ask: four scheduled writers, a reconciliation that streams
 * the whole source key space and a dashboard all draw on the same pool. The
 * number that matters is not how many connections are in use - a busy pool is
 * a working pool - but `pendingAcquires`: a request that is waiting for a
 * connection is a request that is waiting for somebody else's job.
 *
 * Read from tarn through knex rather than counted here, so it is the real
 * pool and not a tally this file would have to keep in step.
 */
function poolUsage() {
  const pool = db.client && db.client.pool;
  if (!pool) return null;

  const settings = (db.client.config && db.client.config.pool) || {};

  return {
    used: pool.numUsed(),
    free: pool.numFree(),
    pendingAcquires: pool.numPendingAcquires(),
    pendingCreates: pool.numPendingCreates(),
    min: settings.min === undefined ? null : settings.min,
    max: settings.max === undefined ? null : settings.max
  };
}

/** Whole minutes between an instant and now, or null when there is no instant. */
function minutesSince(instant) {
  if (!instant) return null;
  return Math.round((Date.now() - new Date(instant).getTime()) / 60000);
}

async function health() {
  const checkpoints = await repo.allCheckpoints();
  const runs = await repo.recentRuns(10);
  const journal = await repo.journalStats();
  const exceptions = await repo.countOpenExceptions();
  const snapshotRows = await repo.countDaily();
  const byKind = await repo.exceptionsByKind();
  const latestSnapshot = await repo.latestDaily();
  const durations = await repo.runStats(50);

  const byStream = {};
  checkpoints.forEach(function (row) { byStream[row.stream] = row; });

  const login = byStream[sync.LOGIN_STREAM];
  const reconciled = byStream[sync.RECONCILE_STREAM];

  const lastSync = login && login.last_success_at ? new Date(login.last_success_at) : null;
  const staleAfter = config.lifecycle.freshnessWarnMinutes * 60 * 1000;

  return {
    reportTimezone: config.lifecycle.reportTimezone,
    sourceTimezone: config.lifecycle.sourceTimezone,
    ruleVersion: config.lifecycle.ruleVersion,

    journalRows: journal.rows,
    highestSourceKey: journal.maxSourcePk,
    latestLoginAt: journal.latestActionAt,

    lastSynchronizedAt: lastSync,
    isStale: !lastSync || (Date.now() - lastSync.getTime()) > staleAfter,
    staleAfterMinutes: config.lifecycle.freshnessWarnMinutes,

    lastReconciledAt: reconciled && reconciled.last_reconciled_at
      ? new Date(reconciled.last_reconciled_at)
      : null,

    /*
     * The honest caveat, carried to the screen. See sync.service.js.
     */
    completeness: {
      watermarkIsNotAGuarantee: true,
      note: 'USER_LOGIN_LOG.TABLE_PK is assigned before commit, so a late'
        + ' commit can sit below the high-water mark. The overlap window'
        + ' catches the common case; only a full key reconciliation closes'
        + ' it. Data is complete as of the last reconciliation.',
      overlapWindow: config.lifecycle.pkOverlap
    },

    snapshotDays: snapshotRows,
    openExceptions: exceptions,

    /*
     * MALFORMED AND ORPHAN ROWS BY KIND, not in one lump. "Fourteen
     * exceptions" is a number nobody can act on; "fourteen logins with no
     * customer" names the thing to go and look at.
     */
    exceptionsByKind: byKind,

    /*
     * HOW FAR BEHIND THE SOURCE THIS IS, in two different senses, because
     * they fail separately. `syncLagMinutes` is how long since a poll
     * succeeded - a job problem. `sourceLagMinutes` is how old the newest
     * login in the journal is - which on a quiet night is simply how long
     * since anybody logged in, and is NOT a fault. Reporting one number for
     * both is how a dashboard ends up alarming at four in the morning.
     */
    syncLagMinutes: minutesSince(lastSync),
    sourceLagMinutes: minutesSince(journal.latestActionAt),

    /*
     * THE SNAPSHOT SERIES: how far it reaches and when it was last built.
     * Those are two different dates, and the gap between them is the one that
     * matters - a series that ends today but was built a week ago is a series
     * that has not seen a week of transitions.
     */
    snapshots: {
      days: snapshotRows,
      latestDay: latestSnapshot ? latestSnapshot.snapshot_date : null,
      builtAt: latestSnapshot ? latestSnapshot.recalculated_at : null,
      builtMinutesAgo: minutesSince(latestSnapshot && latestSnapshot.recalculated_at)
    },

    /* Per job: how long it takes, how long the last one took, how many failed. */
    jobDurations: durations,

    pool: poolUsage(),
    recentRuns: runs
  };
}

/** The open data-quality exceptions themselves, newest first. */
function exceptions(limit) {
  return repo.openExceptions(Math.max(1, Math.min(200, Number(limit) || 50)));
}

module.exports = {
  poll: poll,
  exceptions: exceptions,
  deadlines: deadlines,
  reconcile: reconcile,
  profiles: profiles,
  health: health,
  withLock: withLock
};
