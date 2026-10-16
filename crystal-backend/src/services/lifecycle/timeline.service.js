'use strict';

const db = require('../../config/db');
const config = require('../../config');
const repo = require('../../repositories/lifecycle.repository');
const rules = require('./rules');

/**
 * TURNING A CUSTOMER'S LOGINS INTO THEIR HISTORY, AND KEEPING IT TRUE.
 *
 * The arithmetic is in rules.js and has no idea a database exists. This file
 * is the part that does: read one customer's journal, build their timeline,
 * and replace what was stored - in one transaction, under a per-customer
 * advisory lock.
 *
 * REBUILD, DO NOT PATCH. A late login arriving in the middle of a dormant gap
 * invalidates everything after it: the deadlines move, transitions that were
 * recorded never happened, and the current status may be wrong. Splicing that
 * correctly is a great deal of careful code with a lot of ways to be subtly
 * wrong. Rebuilding the customer from their journal is a few lines, is
 * deterministic, and gives the same answer whether the event arrived on time,
 * late, or twice - which is what requirement 9 and fixture E ask for.
 *
 * It is affordable because the journal exists. Rebuilding one customer reads
 * their own login rows and nothing else; it never touches Oracle and never
 * scans the other customers.
 *
 * THE HORIZON IS "NOW". Deadlines are computed up to the current instant and
 * the next one is stored in `next_transition_at`, which is what the deadline
 * processor selects on. A transition that falls due tomorrow is not written
 * today - it is not true yet, and writing it would make every stock count for
 * tomorrow wrong today.
 */

/**
 * WHICH LOCAL DAY AN INSTANT FALLS IN, as YYYY-MM-DD.
 *
 * ASSEMBLED FROM NAMED PARTS, not from a locale's date format. The obvious
 * version asks a locale that happens to format dates the ISO way - 'sv-SE' -
 * and this Node is built with small-icu: it has the whole time-zone database
 * but only English locale data, so any other locale silently falls back to
 * en-US and returns "10/14/2026". Nothing throws; the caller just gets a
 * string that sorts wrongly. Reading the parts by name cannot go that way.
 *
 * The ZONE is what does the real work here, and it is the reason this is not
 * `toISOString().slice(0, 10)`: in Asia/Shanghai, 2026-10-14 20:30 UTC is
 * already the 15th, and counting that login on the 14th is the off-by-one-day
 * error requirement 12 warns about.
 */
function localDay(instant, zone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(instant);

  const got = {};
  parts.forEach(function (part) { got[part.type] = part.value; });

  return got.year + '-' + got.month + '-' + got.day;
}

/**
 * One customer, rebuilt.
 *
 * Returns the local days its transitions landed on, so the caller can mark
 * exactly those snapshot dates dirty rather than recomputing the year.
 */
async function rebuild(userPk, options) {
  const asOf = (options && options.asOf) || new Date();
  const zone = config.lifecycle.reportTimezone;

  const profile = await repo.profileOf(userPk);

  if (!profile) {
    /*
     * A journal row whose customer is not synced yet. Requirement 8 says
     * stage it rather than discard it - the row stays in the journal, this
     * says why nothing was built from it, and the next profile sync plus a
     * rebuild will produce the history.
     */
    await repo.noteException({
      kind: 'REBUILD_NO_PROFILE',
      userPk: userPk,
      detail: 'journal rows exist but no lifecycle_customer_profile row yet'
    });
    return { userPk: userPk, built: false, days: [] };
  }

  const logins = (await repo.loginsOf(userPk)).map(function (row) {
    return { at: row.action_at, sourcePk: Number(row.source_table_pk) };
  });

  const built = rules.buildTimeline(profile.registered_at, logins, asOf);

  /* Anything the rules refused is a data-quality fact, not a silent drop. */
  for (let i = 0; i < built.rejected.length; i += 1) {
    const bad = built.rejected[i];
    await repo.noteException({
      kind: 'EVENT_' + bad.reason,
      userPk: userPk,
      sourcePk: bad.event && bad.event.sourcePk,
      actionAt: bad.event && bad.event.at,
      detail: 'rejected by the lifecycle rules while rebuilding'
    });
  }

  if (!built.periods.length) return { userPk: userPk, built: false, days: [] };

  const open = built.periods[built.periods.length - 1];

  await db.transaction(async function (trx) {
    await repo.replaceTimeline(userPk, rules.asDates(built.periods), {
      status: open.status,
      statusSince: new Date(open.validFrom),
      lastLoginAt: built.lastLoginAt,
      effectiveLastActivityAt: built.effectiveLastActivityAt,
      nextTransitionAt: built.nextTransitionAt
    }, trx);
  });

  /* The local days this customer's history touches - registration included,
     because a registration is a flow the snapshot for that day counts. */
  const days = {};
  built.periods.forEach(function (period) {
    days[localDay(new Date(period.validFrom), zone)] = true;
  });

  return {
    userPk: userPk,
    built: true,
    status: open.status,
    periods: built.periods.length,
    days: Object.keys(days).sort()
  };
}

/**
 * Many customers, rebuilt one at a time.
 *
 * SEQUENTIAL ON PURPOSE. Each rebuild takes a per-customer advisory lock and
 * runs its own transaction; doing a hundred at once would hold a hundred
 * connections from a pool sized for the API. Requirement 13 asks for capped
 * concurrency, and the cap that never starves the request path is one.
 */
async function rebuildMany(userPks, options) {
  const outcome = { rebuilt: 0, skipped: 0, days: {} };

  for (let i = 0; i < userPks.length; i += 1) {
    const result = await rebuild(userPks[i], options);

    if (result.built) outcome.rebuilt += 1;
    else outcome.skipped += 1;

    result.days.forEach(function (day) { outcome.days[day] = true; });

    if (options && options.onProgress && (i + 1) % 100 === 0) {
      options.onProgress(i + 1, userPks.length);
    }
  }

  outcome.dirtyDays = Object.keys(outcome.days).sort();
  delete outcome.days;

  return outcome;
}

/**
 * EVERY CUSTOMER WHOSE STATUS IS DUE TO CHANGE, PROCESSED.
 *
 * This is the job that makes a status change without a login. It selects on
 * the partial index over `next_transition_at`, so the cost is the number of
 * customers due tonight rather than the size of the population - which is the
 * difference between a sweep that finishes in a second and one that
 * reclassifies half a million people to find four hundred changes.
 *
 * The rebuild recomputes from the journal rather than nudging the status
 * along, so a customer whose deadline was missed for three days lands in the
 * state they should be in now, with the intermediate transitions recorded at
 * the instants they actually happened.
 */
async function processDeadlines(options) {
  const asOf = (options && options.asOf) || new Date();
  const limit = (options && options.limit) || 10000;

  const due = await repo.dueForTransition(asOf, limit);
  const keys = due.map(function (row) { return Number(row.user_pk); });

  const outcome = await rebuildMany(keys, { asOf: asOf });

  return {
    due: keys.length,
    rebuilt: outcome.rebuilt,
    dirtyDays: outcome.dirtyDays
  };
}

/**
 * THE WHOLE POPULATION, built from nothing.
 *
 * Walks the profiles by key rather than the journal, because a customer who
 * has never logged in still has a history - NEW, then DORMANT, then CHURNED -
 * and fixture C is exactly that customer. Building only from the journal
 * would leave the silent majority with no periods at all and every stock
 * count short by however many of them there are.
 */
async function backfill(options) {
  const batch = (options && options.batch) || 500;
  const asOf = (options && options.asOf) || new Date();

  let cursor = 0;
  const outcome = { rebuilt: 0, skipped: 0, days: {} };

  for (;;) {
    const page = await repo.db('lifecycle_customer_profile')
      .select('user_pk')
      .where('user_pk', '>', cursor)
      .orderBy('user_pk', 'asc')
      .limit(batch);

    if (!page.length) break;

    for (let i = 0; i < page.length; i += 1) {
      const result = await rebuild(Number(page[i].user_pk), { asOf: asOf });
      if (result.built) outcome.rebuilt += 1;
      else outcome.skipped += 1;
      result.days.forEach(function (day) { outcome.days[day] = true; });
    }

    cursor = Number(page[page.length - 1].user_pk);

    if (options && options.onProgress) outcome.onProgress = options.onProgress(outcome.rebuilt);
    if (page.length < batch) break;
  }

  outcome.dirtyDays = Object.keys(outcome.days).sort();
  delete outcome.days;
  delete outcome.onProgress;

  return outcome;
}

module.exports = {
  localDay: localDay,
  rebuild: rebuild,
  rebuildMany: rebuildMany,
  processDeadlines: processDeadlines,
  backfill: backfill
};
