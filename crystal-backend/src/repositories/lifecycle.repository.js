'use strict';

const db = require('../config/db');
const config = require('../config');

/**
 * THE ANALYTICS SIDE: every read and write of the nine lifecycle tables.
 *
 * All of it is derived data. Nothing here is a source of truth, which is what
 * makes "rebuild it" an ordinary operation rather than a disaster - see the
 * head of sql/deltas/054_customer_lifecycle.sql.
 *
 * UPSERTS ARE WRITTEN AS RAW `ON CONFLICT`, and that is not a style choice.
 * This project is on knex 0.21, where `.onConflict().ignore()` compiles to an
 * ordinary INSERT with the clause SILENTLY DROPPED - it was added in 0.95.
 * Relying on it here would mean a replayed import raised a duplicate-key
 * error instead of being idempotent, which is precisely the behaviour
 * requirement 8 and fixture H exist to guarantee. So the clause is written
 * out, with bind parameters, and a replay is a no-op.
 *
 * EVERY MULTI-ROW WRITE IS CHUNKED under PostgreSQL's 65,535 bind-parameter
 * ceiling. A million-row journal import that tried one statement would simply
 * be refused.
 */

const PROFILE = 'lifecycle_customer_profile';
const JOURNAL = 'lifecycle_login_event';
const CURRENT = 'lifecycle_customer_current';
const PERIOD = 'lifecycle_customer_period';
const DAILY = 'lifecycle_kpi_daily';
const EVENT = 'lifecycle_business_event';
const CHECKPOINT = 'lifecycle_sync_checkpoint';
const JOB = 'lifecycle_job_run';
const EXCEPTION = 'lifecycle_exception';

/** PostgreSQL's hard limit, less a little room. */
const MAX_BINDINGS = 60000;

/** How many rows of `columns` fit in one statement. */
function chunkFor(columns) {
  return Math.max(1, Math.floor(MAX_BINDINGS / columns));
}

/**
 * A multi-row INSERT ... ON CONFLICT, in chunks.
 *
 * `conflict` is the column list the uniqueness is on; `update` is the columns
 * to overwrite, or null for DO NOTHING.
 */
async function upsert(trx, table, columns, rows, conflict, update) {
  if (!rows.length) return 0;

  const runner = trx || db;
  const size = chunkFor(columns.length);
  let written = 0;

  for (let at = 0; at < rows.length; at += size) {
    const slice = rows.slice(at, at + size);

    const placeholders = slice
      .map(function () { return '(' + columns.map(function () { return '?'; }).join(', ') + ')'; })
      .join(', ');

    const bindings = [];
    slice.forEach(function (row) {
      columns.forEach(function (column) { bindings.push(row[column] === undefined ? null : row[column]); });
    });

    const action = update && update.length
      ? 'UPDATE SET ' + update.map(function (c) { return '"' + c + '" = EXCLUDED."' + c + '"'; }).join(', ')
      : 'NOTHING';

    /*
     * THE REAL COUNT, not the number attempted.
     *
     * ON CONFLICT DO NOTHING tells nobody what it skipped, so counting the
     * rows handed in reports a million ingests for a poll that stored none -
     * which is exactly what the replay check caught. pg returns rowCount for
     * the rows actually written, and that is the number the checkpoint and
     * the health view have to carry.
     */
    const result = await runner.raw(
      'INSERT INTO ' + table
        + ' (' + columns.map(function (c) { return '"' + c + '"'; }).join(', ') + ')'
        + ' VALUES ' + placeholders
        + ' ON CONFLICT (' + conflict.map(function (c) { return '"' + c + '"'; }).join(', ') + ')'
        + ' DO ' + action,
      bindings
    );

    written += result && result.rowCount !== undefined
      ? Number(result.rowCount)
      : slice.length;
  }

  return written;
}

/* ------------------------------------------------------------------ */
/*  profiles                                                           */
/* ------------------------------------------------------------------ */

const PROFILE_COLUMNS = [
  'user_pk', 'user_id', 'user_name', 'birthday', 'job_code', 'location_pk',
  'display_phone', 'oracle_account_status', 'registered_at',
  'source_updated_at', 'synced_at'
];

function saveProfiles(rows, trx) {
  return upsert(
    trx, PROFILE, PROFILE_COLUMNS,
    rows.map(function (row) {
      return {
        user_pk: row.userPk,
        user_id: row.userId,
        user_name: row.userName,
        birthday: row.birthday,
        job_code: row.jobCode,
        location_pk: row.locationPk,
        display_phone: row.displayPhone,
        oracle_account_status: row.accountStatus,
        registered_at: row.registeredAt,
        source_updated_at: row.sourceUpdatedAt,
        synced_at: new Date()
      };
    }),
    ['user_pk'],
    PROFILE_COLUMNS.filter(function (c) { return c !== 'user_pk'; })
  );
}

/**
 * WHICH OF THESE CUSTOMERS HAVE NO PROFILE YET.
 *
 * Asked by the login poll about the customers whose logins it has just
 * imported: a rebuild without a profile builds nothing, so the ones missing
 * one are fetched from the source before the rebuild rather than waiting for
 * the daily sweep. Answered with one query over the batch rather than a
 * lookup per customer.
 */
async function profilesMissing(userPks) {
  const wanted = (userPks || [])
    .map(Number)
    .filter(function (key) { return Number.isFinite(key) && key > 0; });

  if (!wanted.length) return [];

  const known = {};
  const CHUNK = 20000;

  for (let at = 0; at < wanted.length; at += CHUNK) {
    const slice = wanted.slice(at, at + CHUNK);
    /* eslint-disable no-await-in-loop */
    const rows = await db(PROFILE).whereIn('user_pk', slice).pluck('user_pk');
    /* eslint-enable no-await-in-loop */
    rows.forEach(function (key) { known[Number(key)] = true; });
  }

  return wanted.filter(function (key) { return !known[key]; });
}

function profileOf(userPk) {
  return db(PROFILE).where('user_pk', userPk).first();
}

async function countProfiles() {
  const row = await db(PROFILE).count('* as n').first();
  return Number(row.n);
}

/* ------------------------------------------------------------------ */
/*  the login journal                                                  */
/* ------------------------------------------------------------------ */

const JOURNAL_COLUMNS = ['source_table_pk', 'user_pk', 'action_at', 'ingested_at'];

/**
 * Journal rows, idempotently.
 *
 * DO NOTHING rather than UPDATE: a login that has already been recorded is
 * the same login, and rewriting `ingested_at` would destroy the only record
 * of when it first arrived.
 */
function saveLogins(rows, trx) {
  const now = new Date();

  return upsert(
    trx, JOURNAL, JOURNAL_COLUMNS,
    rows.map(function (row) {
      return {
        source_table_pk: row.sourcePk,
        user_pk: row.userPk,
        action_at: row.actionAt,
        ingested_at: now
      };
    }),
    ['source_table_pk'],
    null
  );
}

/** One customer's logins, in the order the timeline builder wants them. */
function loginsOf(userPk, trx) {
  return (trx || db)(JOURNAL)
    .select('source_table_pk', 'action_at')
    .where('user_pk', userPk)
    .orderBy([{ column: 'action_at', order: 'asc' }, { column: 'source_table_pk', order: 'asc' }]);
}

/** Which of these source keys the journal already holds. */
async function knownLoginKeys(keys) {
  if (!keys.length) return [];

  const held = [];
  const size = chunkFor(1);

  for (let at = 0; at < keys.length; at += size) {
    const rows = await db(JOURNAL)
      .select('source_table_pk')
      .whereIn('source_table_pk', keys.slice(at, at + size));
    rows.forEach(function (row) { held.push(Number(row.source_table_pk)); });
  }

  return held;
}

async function journalStats() {
  const row = await db(JOURNAL)
    .count('* as n')
    .max('source_table_pk as max_pk')
    .max('action_at as latest')
    .first();

  return {
    rows: Number(row.n),
    maxSourcePk: row.max_pk === null ? 0 : Number(row.max_pk),
    latestActionAt: row.latest || null
  };
}

/** Customers with at least one journal row - the ones a backfill must visit. */
function customersWithLogins() {
  return db(JOURNAL).distinct('user_pk').orderBy('user_pk', 'asc');
}

/* ------------------------------------------------------------------ */
/*  periods and current state                                          */
/* ------------------------------------------------------------------ */

const PERIOD_COLUMNS = [
  'user_pk', 'status', 'previous_status', 'valid_from', 'valid_to',
  'reason', 'rule_version', 'computed_at'
];

/**
 * ONE CUSTOMER'S HISTORY, REPLACED WHOLE, IN ONE TRANSACTION.
 *
 * Requirement 9 asks for a rebuild that replaces the affected periods
 * transactionally and serialises against a concurrent writer. Replacing the
 * whole customer rather than splicing is the simpler and safer shape: the
 * builder is deterministic, so what it produces from the journal IS the
 * history, and there is no partial-update path to get wrong.
 *
 * The advisory lock is transaction-scoped and keyed on the customer, which
 * follows the idiom already in crm/registrationIntake.service.js. Two workers
 * rebuilding the same customer serialise; two rebuilding different customers
 * do not block each other.
 */
async function replaceTimeline(userPk, periods, current, trx) {
  const runner = trx || db;

  await runner.raw('SELECT pg_advisory_xact_lock(hashtext(?))', ['lifecycle_customer_' + userPk]);

  await runner(PERIOD).where('user_pk', userPk).del();

  const now = new Date();
  await upsert(
    runner, PERIOD, PERIOD_COLUMNS,
    periods.map(function (period) {
      return {
        user_pk: userPk,
        status: period.status,
        previous_status: period.previousStatus,
        valid_from: period.validFrom,
        valid_to: period.validTo,
        reason: period.reason,
        rule_version: period.ruleVersion || config.lifecycle.ruleVersion,
        computed_at: now
      };
    }),
    ['user_pk', 'valid_from'],
    ['status', 'previous_status', 'valid_to', 'reason', 'rule_version', 'computed_at']
  );

  await upsert(
    runner, CURRENT,
    ['user_pk', 'status', 'status_since', 'last_login_at', 'effective_last_activity_at',
      'next_transition_at', 'computed_at', 'rule_version'],
    [{
      user_pk: userPk,
      status: current.status,
      status_since: current.statusSince,
      last_login_at: current.lastLoginAt,
      effective_last_activity_at: current.effectiveLastActivityAt,
      next_transition_at: current.nextTransitionAt,
      computed_at: now,
      rule_version: config.lifecycle.ruleVersion
    }],
    ['user_pk'],
    ['status', 'status_since', 'last_login_at', 'effective_last_activity_at',
      'next_transition_at', 'computed_at', 'rule_version']
  );
}

/** Customers whose automatic transition is now due. */
function dueForTransition(asOf, limit) {
  return db(CURRENT)
    .select('user_pk')
    .whereNotNull('next_transition_at')
    .andWhere('next_transition_at', '<=', asOf)
    .orderBy('next_transition_at', 'asc')
    .limit(limit);
}

/** One customer's periods, newest last. */
function periodsOf(userPk) {
  return db(PERIOD)
    .select('status', 'previous_status', 'valid_from', 'valid_to', 'reason', 'rule_version')
    .where('user_pk', userPk)
    .orderBy('valid_from', 'asc');
}

async function countPeriods() {
  const row = await db(PERIOD).count('* as n').first();
  return Number(row.n);
}

/* ------------------------------------------------------------------ */
/*  the raw material for snapshots                                     */
/* ------------------------------------------------------------------ */

/**
 * REGISTRATIONS PER LOCAL DAY.
 *
 * `AT TIME ZONE` twice is not a mistake and it is the only correct form:
 * the first reads the `timestamptz` as an instant and renders it in the
 * report zone, the second takes the resulting local wall-clock value as a
 * date. Truncating a `timestamptz` without that conversion gives UTC days,
 * which is the off-by-one-day bug requirement 12 warns about.
 */
function registrationsByDay(zone) {
  return db(PROFILE)
    .select(db.raw('(registered_at AT TIME ZONE ?)::date AS day', [zone]))
    .count('* as n')
    /*
     * GROUP BY THE POSITION, not the expression again. Repeating
     * `(registered_at AT TIME ZONE ?)` would bind a SECOND parameter, and
     * PostgreSQL compares expressions before it knows the two placeholders
     * carry the same value - so it refuses the query, saying the column must
     * appear in the GROUP BY clause. The ordinal is unambiguous.
     */
    .groupByRaw('1')
    .orderByRaw('1 ASC');
}

/**
 * TRANSITIONS PER LOCAL DAY, as deltas.
 *
 * The sweep line needs "on this day, this many left that status and joined
 * this one" - which is exactly a group by day and status pair. The
 * registration row (previous_status IS NULL) is counted as an arrival with no
 * departure, which is what makes the running totals add up to the registered
 * population at every cutoff.
 */
function transitionsByDay(zone) {
  return db(PERIOD)
    .select(
      db.raw('(valid_from AT TIME ZONE ?)::date AS day', [zone]),
      'previous_status',
      'status'
    )
    .count('* as n')
    /* Positional, for the reason given in registrationsByDay above. */
    .groupByRaw('1, 2, 3')
    .orderByRaw('1 ASC');
}

const DAILY_COLUMNS = [
  'snapshot_date', 'new_count', 'active_count', 'dormant_count', 'churned_count',
  'total_count', 'registered_count', 'rule_version', 'is_final', 'recalculated_at'
];

function saveDaily(rows, trx) {
  return upsert(
    trx, DAILY, DAILY_COLUMNS, rows, ['snapshot_date'],
    DAILY_COLUMNS.filter(function (c) { return c !== 'snapshot_date'; })
  );
}

function dailyBetween(from, to) {
  return db(DAILY)
    .select('*')
    .where('snapshot_date', '>=', from)
    .andWhere('snapshot_date', '<=', to)
    .orderBy('snapshot_date', 'asc');
}

function dailyOn(date) {
  return db(DAILY).where('snapshot_date', date).first();
}

async function countDaily() {
  const row = await db(DAILY).count('* as n').first();
  return Number(row.n);
}

/* ------------------------------------------------------------------ */
/*  checkpoints, runs and exceptions                                   */
/* ------------------------------------------------------------------ */

function checkpointOf(stream) {
  return db(CHECKPOINT).where('stream', stream).first();
}

function saveCheckpoint(stream, patch, trx) {
  return upsert(
    trx, CHECKPOINT,
    ['stream', 'last_source_pk', 'last_source_at', 'last_success_at',
      'last_reconciled_at', 'rows_ingested', 'rule_version', 'updated_at'],
    [{
      stream: stream,
      last_source_pk: patch.lastSourcePk === undefined ? null : patch.lastSourcePk,
      last_source_at: patch.lastSourceAt === undefined ? null : patch.lastSourceAt,
      last_success_at: patch.lastSuccessAt === undefined ? null : patch.lastSuccessAt,
      last_reconciled_at: patch.lastReconciledAt === undefined ? null : patch.lastReconciledAt,
      rows_ingested: patch.rowsIngested === undefined ? 0 : patch.rowsIngested,
      rule_version: config.lifecycle.ruleVersion,
      updated_at: new Date()
    }],
    ['stream'],
    /* Only the keys the caller actually set, so a login poll does not wipe
       the reconciliation timestamp and vice versa. */
    Object.keys({
      last_source_pk: patch.lastSourcePk,
      last_source_at: patch.lastSourceAt,
      last_success_at: patch.lastSuccessAt,
      last_reconciled_at: patch.lastReconciledAt,
      rows_ingested: patch.rowsIngested
    }).filter(function (key) {
      const camel = key.replace(/_([a-z])/g, function (m, c) { return c.toUpperCase(); });
      return patch[camel] !== undefined;
    }).concat(['rule_version', 'updated_at'])
  );
}

function allCheckpoints() {
  return db(CHECKPOINT).select('*').orderBy('stream', 'asc');
}

async function startRun(job, requestedBy) {
  const rows = await db(JOB)
    .insert({ job: job, status: 'RUNNING', requested_by: requestedBy || null })
    .returning('id');

  return Array.isArray(rows) ? Number(rows[0].id === undefined ? rows[0] : rows[0].id) : Number(rows);
}

function finishRun(id, status, totals) {
  return db(JOB).where('id', id).update({
    status: status,
    finished_at: new Date(),
    rows_read: (totals && totals.rowsRead) || 0,
    rows_written: (totals && totals.rowsWritten) || 0,
    customers_rebuilt: (totals && totals.customersRebuilt) || 0,
    dates_touched: (totals && totals.datesTouched) || 0,
    error: (totals && totals.error) || null
  });
}

function recentRuns(limit) {
  return db(JOB).select('*').orderBy('started_at', 'desc').limit(limit || 20);
}

function noteException(row, trx) {
  return (trx || db)(EXCEPTION).insert({
    kind: row.kind,
    user_pk: row.userPk === undefined ? null : row.userPk,
    source_table_pk: row.sourcePk === undefined ? null : row.sourcePk,
    action_at: row.actionAt === undefined ? null : row.actionAt,
    detail: row.detail === undefined ? null : row.detail
  });
}

function openExceptions(limit) {
  return db(EXCEPTION)
    .select('*')
    .whereNull('resolved_at')
    .orderBy('noticed_at', 'desc')
    .limit(limit || 50);
}

async function countOpenExceptions() {
  const row = await db(EXCEPTION).whereNull('resolved_at').count('* as n').first();
  return Number(row.n);
}

/* ------------------------------------------------------------------ */
/*  business events                                                    */
/* ------------------------------------------------------------------ */

function events() {
  return db(EVENT).select('*').orderBy('event_at', 'desc');
}

function eventOf(id) {
  return db(EVENT).where('event_id', id).first();
}

/**
 * One event, written. `returning('*')` because the audit trail records the
 * row that landed rather than the body that was sent - the serial key and the
 * defaulted timestamps are part of what was created.
 */
async function insertEvent(row) {
  const rows = await db(EVENT).insert(row).returning('*');
  return rows[0];
}

/** An edit. Returns null when the id matched nothing, so the caller can 404. */
async function updateEvent(id, patch) {
  const rows = await db(EVENT).where('event_id', id).update(patch).returning('*');
  return rows[0] || null;
}

/**
 * A removal, and a hard one.
 *
 * Every other table in this console deletes softly, because its rows are
 * business records somebody may need back. An event here is a REPORT
 * PARAMETER - a named instant to compare around - and a soft-deleted one
 * would have to be filtered out of the picker, out of the impact endpoint and
 * out of the audit view by hand, in three places, for ever. There is nothing
 * to preserve: the comparison it produced was computed from the periods and
 * can be computed again from any timestamp.
 */
function deleteEvent(id) {
  return db(EVENT).where('event_id', id).del();
}

/* ------------------------------------------------------------------ */
/*  what the operations view measures                                  */
/* ------------------------------------------------------------------ */

/**
 * HOW LONG EACH JOB TAKES, off its own history.
 *
 * Requirement 13 asks for job duration and the time taken to generate
 * snapshots to be observable. Both are already recorded - every run writes
 * `started_at` and `finished_at` - so this reads them rather than adding a
 * metrics table nobody would keep in step.
 *
 * ONLY FINISHED RUNS ARE MEASURED. A row still RUNNING has no duration yet,
 * and counting it as zero would drag every average down - which would make
 * the metric read best exactly when a job had hung.
 */
async function runStats(limit) {
  const rows = await db.raw(
    `WITH recent AS (
       SELECT job, status, started_at, finished_at,
              EXTRACT(EPOCH FROM (finished_at - started_at)) AS seconds,
              row_number() OVER (PARTITION BY job ORDER BY started_at DESC) AS rank
         FROM ${JOB}
        WHERE finished_at IS NOT NULL
     )
     SELECT job,
            COUNT(*)::bigint                                       AS runs,
            COUNT(*) FILTER (WHERE status = 'FAILED')::bigint       AS failed,
            COUNT(*) FILTER (WHERE status = 'SKIPPED')::bigint      AS skipped,
            ROUND(AVG(seconds)::numeric, 3)                         AS avg_seconds,
            ROUND(MAX(seconds)::numeric, 3)                         AS max_seconds,
            ROUND(MAX(seconds) FILTER (WHERE rank = 1)::numeric, 3)  AS last_seconds,
            MAX(started_at)                                         AS last_started_at
       FROM recent
      WHERE rank <= ?
      GROUP BY job
      ORDER BY job`,
    [limit || 50]
  );

  return (rows.rows || rows).map(function (row) {
    return {
      job: row.job,
      runs: Number(row.runs),
      failed: Number(row.failed),
      skipped: Number(row.skipped),
      averageSeconds: row.avg_seconds === null ? null : Number(row.avg_seconds),
      slowestSeconds: row.max_seconds === null ? null : Number(row.max_seconds),
      lastSeconds: row.last_seconds === null ? null : Number(row.last_seconds),
      lastStartedAt: row.last_started_at
    };
  });
}

/** The malformed and orphan rows, counted by kind rather than in one lump. */
async function exceptionsByKind() {
  const rows = await db(EXCEPTION)
    .select('kind')
    .count('* as n')
    .whereNull('resolved_at')
    .groupBy('kind')
    .orderBy('n', 'desc');

  return rows.map(function (row) { return { kind: row.kind, open: Number(row.n) }; });
}

/** The newest snapshot - its day AND when it was built, which differ. */
function latestDaily() {
  return db(DAILY).orderBy('snapshot_date', 'desc').first();
}

module.exports = {
  /* for the services that need a transaction across several of these */
  db: db,

  saveProfiles: saveProfiles,
  profileOf: profileOf,
  profilesMissing: profilesMissing,
  countProfiles: countProfiles,

  saveLogins: saveLogins,
  loginsOf: loginsOf,
  knownLoginKeys: knownLoginKeys,
  journalStats: journalStats,
  customersWithLogins: customersWithLogins,

  replaceTimeline: replaceTimeline,
  dueForTransition: dueForTransition,
  periodsOf: periodsOf,
  countPeriods: countPeriods,

  registrationsByDay: registrationsByDay,
  transitionsByDay: transitionsByDay,
  saveDaily: saveDaily,
  dailyBetween: dailyBetween,
  dailyOn: dailyOn,
  countDaily: countDaily,

  checkpointOf: checkpointOf,
  saveCheckpoint: saveCheckpoint,
  allCheckpoints: allCheckpoints,
  startRun: startRun,
  finishRun: finishRun,
  recentRuns: recentRuns,
  noteException: noteException,
  openExceptions: openExceptions,
  countOpenExceptions: countOpenExceptions,

  events: events,
  eventOf: eventOf,
  insertEvent: insertEvent,
  updateEvent: updateEvent,
  deleteEvent: deleteEvent,

  runStats: runStats,
  exceptionsByKind: exceptionsByKind,
  latestDaily: latestDaily
};
