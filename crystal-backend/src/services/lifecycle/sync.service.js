'use strict';

const config = require('../../config');
const source = require('../../repositories/legacy/lifecycleSource.repository');
const repo = require('../../repositories/lifecycle.repository');

/**
 * GETTING THE PLATFORM'S FACTS INTO THE ANALYTICS DATABASE, SAFELY.
 *
 * Three jobs, and the third exists because the second cannot be trusted on
 * its own.
 *
 *   syncProfiles      customers, by key, in pages
 *   importLogins      new login rows above a watermark, with an overlap
 *   reconcileLogins   every source key compared against the journal
 *
 * THE WATERMARK IS NOT A GUARANTEE, and this is the single most important
 * thing to understand about this file. `USER_LOGIN_LOG.TABLE_PK` comes from a
 * sequence, and a sequence hands out its number when the INSERT runs - not
 * when the transaction commits. So two concurrent writers can take 500 and
 * 501, and 501 can commit first. A poll that reads up to 501 and records 501
 * as its high-water mark will never return 500: it was not visible when the
 * poll ran, and it is below the mark for every poll afterwards.
 *
 * `ACTION_AT` does not help - requirement 8 is explicit that it is the event
 * time and can be backdated, so it is not an insert watermark either.
 *
 * TWO MITIGATIONS, AND NEITHER IS PRETENDED TO BE A FIX:
 *
 *   The overlap window re-reads a configurable band below the mark on every
 *   poll, which catches anything that committed within that band. It is cheap
 *   and it covers the ordinary case.
 *
 *   The reconciliation pass streams every key in the source and compares it
 *   with the journal. That is what actually closes the hole, and it runs on a
 *   schedule rather than per poll because it reads the whole table.
 *
 * Between a missed commit and the next reconciliation the analytics data is
 * incomplete. That window is a property of polling a log with no trustworthy
 * commit-time column, not a bug in this code, and requirement 8 asks for it
 * to be visible in job health rather than quietly tolerated - which is why
 * the checkpoint carries `last_reconciled_at` and the health endpoint reports
 * it. The lossless alternatives, Oracle CDC or a transactional outbox, both
 * change the source and need separate approval.
 *
 * NOTHING HERE WRITES TO ORACLE.
 */

const LOGIN_STREAM = 'login';
const PROFILE_STREAM = 'profile';
const RECONCILE_STREAM = 'reconcile';

/** Everything the lifecycle feature reads out of configuration. */
function settings() {
  return config.lifecycle;
}

/* ------------------------------------------------------------------ */
/*  customers                                                          */
/* ------------------------------------------------------------------ */

/**
 * Every customer, or every customer after a key.
 *
 * WHY THE WHOLE TABLE AND NOT A CHANGED-SINCE QUERY: requirement 8 says
 * `USERS.UPDATED_AT DEFAULT CURRENT_TIMESTAMP` does not prove the column is
 * maintained on UPDATE, and it does not - a DEFAULT fires on INSERT. Until
 * somebody confirms the source actually touches it, a profile sync that
 * trusted it would silently stop seeing changes. So this walks by key, which
 * is correct whatever the source does with its timestamps, and is affordable
 * because the customer table is small next to the login log.
 *
 * It is still incremental in the sense that matters: pages are bounded, the
 * cursor is recorded, and an interrupted run resumes where it stopped.
 */
async function syncProfiles(options) {
  const limit = (options && options.batch) || settings().importBatch;
  const resume = options && options.resume;

  const checkpoint = resume ? await repo.checkpointOf(PROFILE_STREAM) : null;
  let cursor = checkpoint && checkpoint.last_source_pk ? Number(checkpoint.last_source_pk) : 0;

  let read = 0;
  let written = 0;

  for (;;) {
    const page = await source.customersAfter(cursor, limit);
    if (!page.length) break;

    read += page.length;

    /*
     * A CUSTOMER WITH NO REGISTRATION INSTANT CANNOT BE CLASSIFIED. The rules
     * return no status without one, so storing the row would put a customer
     * in the population who can never appear in any bucket - and the stock
     * counts would stop summing to the total. It goes to the exception
     * channel instead.
     */
    const usable = [];
    for (let i = 0; i < page.length; i += 1) {
      if (!page[i].registeredAt) {
        await repo.noteException({
          kind: 'PROFILE_NO_REGISTRATION',
          userPk: page[i].userPk,
          detail: 'users.created_at is null, so no lifecycle status can be computed'
        });
      } else {
        usable.push(page[i]);
      }
    }

    written += await repo.saveProfiles(usable);
    cursor = Number(page[page.length - 1].userPk);

    await repo.saveCheckpoint(PROFILE_STREAM, {
      lastSourcePk: cursor,
      rowsIngested: written
    });

    if (page.length < limit) break;
  }

  await repo.saveCheckpoint(PROFILE_STREAM, { lastSuccessAt: new Date() });

  return { read: read, written: written, cursor: cursor };
}

/* ------------------------------------------------------------------ */
/*  the login journal                                                  */
/* ------------------------------------------------------------------ */

/**
 * New login rows, from the watermark less the overlap.
 *
 * Returns the customers it touched, because they are the ones whose timeline
 * has to be rebuilt - the caller decides when, so that an import and a
 * rebuild can be separate jobs with separate failure modes.
 */
async function importLogins(options) {
  const limit = (options && options.batch) || settings().importBatch;
  const overlap = options && options.overlap !== undefined
    ? options.overlap
    : settings().pkOverlap;

  const checkpoint = await repo.checkpointOf(LOGIN_STREAM);
  const mark = checkpoint && checkpoint.last_source_pk ? Number(checkpoint.last_source_pk) : 0;

  /* The overlap band: re-read below the mark, never below zero. */
  let cursor = Math.max(0, mark - overlap);

  const now = Date.now();
  const skew = settings().clockSkewMinutes * 60 * 1000;

  let read = 0;
  let written = 0;
  let highest = mark;
  const touched = {};

  for (;;) {
    const page = await source.loginsAfter(cursor, limit);
    if (!page.length) break;

    read += page.length;

    const rows = [];

    for (let i = 0; i < page.length; i += 1) {
      const row = page[i];
      const pk = Number(row.table_pk);
      if (pk > highest) highest = pk;

      const at = row.action_at ? new Date(row.action_at) : null;

      if (!at || Number.isNaN(at.getTime())) {
        await repo.noteException({
          kind: 'LOGIN_NO_TIMESTAMP',
          userPk: row.user_pk,
          sourcePk: pk,
          detail: 'user_login_log.action_at is null or unparseable'
        });
        continue;
      }

      /*
       * A LOGIN FROM THE FUTURE is a broken clock somewhere, not a fact.
       * Importing it would make the customer ACTIVE until it passes and then
       * silently correct itself, which is worse than being told.
       */
      if (at.getTime() > now + skew) {
        await repo.noteException({
          kind: 'LOGIN_IN_FUTURE',
          userPk: row.user_pk,
          sourcePk: pk,
          actionAt: at,
          detail: 'action_at is beyond the tolerated clock skew'
        });
        continue;
      }

      rows.push({ sourcePk: pk, userPk: row.user_pk, actionAt: at });
      touched[row.user_pk] = true;
    }

    /*
     * ORPHANS ARE STAGED, NOT DISCARDED. Requirement 8 forbids dropping an
     * event whose customer has not been synced yet - which happens routinely,
     * because somebody can register and log in between two profile syncs. The
     * journal has no foreign key for exactly this reason, so the row is kept
     * and the exception records that the profile was missing; the next
     * profile sync plus a rebuild picks it up.
     */
    written += await repo.saveLogins(rows);

    cursor = Number(page[page.length - 1].table_pk);
    if (page.length < limit) break;
  }

  await repo.saveCheckpoint(LOGIN_STREAM, {
    lastSourcePk: highest,
    lastSuccessAt: new Date(),
    rowsIngested: written
  });

  return {
    read: read,
    written: written,
    highestPk: highest,
    customers: Object.keys(touched).map(Number)
  };
}

/**
 * EVERY KEY IN THE SOURCE, COMPARED WITH THE JOURNAL.
 *
 * This is the pass that makes completeness a fact rather than a hope. It
 * walks the source key space in bands, asks the journal which of each band it
 * holds, and imports the difference.
 *
 * It reads keys only - a million bigints, not a million rows - which is what
 * makes running it off-peak affordable rather than a second full import.
 */
async function reconcileLogins(options) {
  const band = (options && options.batch) || settings().reconcileBatch;
  const top = await source.maxLoginPk();

  let from = 0;
  let checked = 0;
  let recovered = 0;
  const touched = {};

  while (from < top) {
    const to = Math.min(top, from + band);

    const keys = (await source.loginKeysBetween(from, to))
      .map(function (row) { return Number(row.table_pk); });

    checked += keys.length;

    if (keys.length) {
      const known = {};
      (await repo.knownLoginKeys(keys)).forEach(function (pk) { known[pk] = true; });

      const missing = keys.filter(function (pk) { return !known[pk]; });

      if (missing.length) {
        /* Fetch and store only what is actually absent. */
        const rows = await source.loginsByKeys(missing);
        const usable = [];

        rows.forEach(function (row) {
          const at = row.action_at ? new Date(row.action_at) : null;
          if (!at || Number.isNaN(at.getTime())) return;
          usable.push({ sourcePk: Number(row.table_pk), userPk: row.user_pk, actionAt: at });
          touched[row.user_pk] = true;
        });

        recovered += await repo.saveLogins(usable);
      }
    }

    from = to;
  }

  await repo.saveCheckpoint(RECONCILE_STREAM, {
    lastSourcePk: top,
    lastReconciledAt: new Date(),
    lastSuccessAt: new Date(),
    rowsIngested: recovered
  });

  return {
    checked: checked,
    recovered: recovered,
    customers: Object.keys(touched).map(Number)
  };
}

module.exports = {
  LOGIN_STREAM: LOGIN_STREAM,
  PROFILE_STREAM: PROFILE_STREAM,
  RECONCILE_STREAM: RECONCILE_STREAM,
  syncProfiles: syncProfiles,
  importLogins: importLogins,
  reconcileLogins: reconcileLogins
};
