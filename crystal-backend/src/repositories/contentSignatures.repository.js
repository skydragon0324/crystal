'use strict';

const db = require('../config/db');

const TABLE = 'content_signatures';

/**
 * ONE CURRENT SIGNATURE PER SIGNED ITEM.
 *
 * Keyed by (content_type, content_ref): a notice's id as text, or an image's
 * storage key. Re-signing REPLACES the row - there is no history here, because
 * a table of every signature ever made is a table of old signatures that must
 * not verify, and the only safe thing to do with one of those is not to have
 * it. Who changed what, and when, is the audit log's job.
 *
 * Every function takes an optional trailing `trx`, like every repository in
 * this codebase, and it matters more here than usual: a signature written on
 * the pool while the edit it covers is still inside a transaction would be
 * visible before the edit is - or survive the edit being rolled back. The
 * seeds pass their own knex handle through the same argument, which is how a
 * seed run against a throwaway schema signs into that schema.
 */

function find(type, ref, trx) {
  return (trx || db)(TABLE).where({ content_type: type, content_ref: String(ref) }).first();
}

function findMany(type, refs, trx) {
  if (!refs || !refs.length) return Promise.resolve([]);
  return (trx || db)(TABLE).where('content_type', type).whereIn('content_ref', refs.map(String));
}

/** Insert, or replace the item's existing signature. Answers [row]. */
function upsert(row, trx) {
  return (trx || db)(TABLE)
    .insert(row)
    .onConflict(['content_type', 'content_ref'])
    .merge()
    .returning('*');
}

function remove(type, ref, trx) {
  return (trx || db)(TABLE).where({ content_type: type, content_ref: String(ref) }).del();
}

/** Every signature of a type - for the audit, which reads them all. */
function ofType(type, trx) {
  return (trx || db)(TABLE).where('content_type', type).orderBy('content_ref');
}

function all(trx) {
  return (trx || db)(TABLE).orderBy(['content_type', 'content_ref']);
}

/* Four hundred rows is 2,400 bindings a statement - well inside what PostgreSQL takes. */
const AUDIT_CHUNK = 400;

/**
 * The audit's verdicts, written beside the signatures they are about.
 *
 *   verdicts  [{ id, signature, signedAt, status, reason, at }]
 *
 * One UPDATE ... FROM (VALUES ...) per chunk rather than a statement per row:
 * the nightly audit covers well over a thousand images.
 *
 * ONLY ONTO THE SIGNATURE THAT WAS CHECKED. A row is matched by its id AND the
 * signature value and signed_at the audit read, so an item re-signed between
 * the audit reading it and this write gets no verdict at all rather than the
 * old signature's. Re-signing does not clear the columns either; signed_at
 * moving past audited_at is what tells the views a verdict is stale.
 *
 * Answers the number of rows written.
 */
async function recordAudits(verdicts, trx) {
  const handle = trx || db;
  let written = 0;

  for (let i = 0; i < verdicts.length; i += AUDIT_CHUNK) {
    const chunk = verdicts.slice(i, i + AUDIT_CHUNK);
    const bindings = [TABLE];
    const values = chunk.map(function (verdict) {
      bindings.push(verdict.id, verdict.signature, verdict.signedAt, verdict.status, verdict.reason, verdict.at);
      return '(?::integer, ?::text, ?::timestamptz, ?::text, ?::text, ?::timestamptz)';
    });

    // eslint-disable-next-line no-await-in-loop
    const result = await handle.raw(
      'UPDATE ?? AS s' +
      '   SET audit_status = v.audit_status, audit_reason = v.audit_reason, audited_at = v.audited_at' +
      '  FROM (VALUES ' + values.join(', ') + ') AS v (id, signature, signed_at, audit_status, audit_reason, audited_at)' +
      /* node-postgres hands a time back to the millisecond; the column may hold microseconds. */
      ' WHERE s.id = v.id AND s.signature = v.signature' +
      "   AND date_trunc('milliseconds', s.signed_at) = v.signed_at",
      bindings
    );
    written += result.rowCount;
  }

  return written;
}

module.exports = {
  TABLE: TABLE,
  find: find,
  findMany: findMany,
  upsert: upsert,
  remove: remove,
  ofType: ofType,
  all: all,
  recordAudits: recordAudits
};
