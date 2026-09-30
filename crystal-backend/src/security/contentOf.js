'use strict';

/**
 * A DATABASE ROW, AS THE CONTENT A SIGNATURE COVERS.
 *
 * One function per type, and the only place a column name meets a signed
 * field name. Every path that signs a notice - the console's save, a
 * spreadsheet import, a restore, the backfill, the seeds - and every path that
 * serves one goes through the same function, so "what was signed" and "what
 * is shown" cannot be two slightly different readings of the same row.
 *
 * THE ROW MUST BE THE ONE THE DATABASE HOLDS. A notice is signed from what
 * `UPDATE ... RETURNING *` handed back, not from the request body: the
 * updated_at trigger has moved the timestamp by then, and a body is what the
 * caller asked for rather than what was stored.
 *
 * TIMES: node-postgres hands a timestamp back as a Date with millisecond
 * precision, and toISOString is the representation the canonical payload
 * demands. PostgreSQL keeps microseconds; the three digits past the
 * millisecond are not signed, which is a smaller difference than any edit a
 * person can make through a form.
 */

function time(value) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) throw new Error('not a time: ' + String(value));
  return date.toISOString();
}

function requiredTime(value, column) {
  const out = time(value);
  if (out === null) throw new Error(column + ' is empty');
  return out;
}

/*
 * Integer columns are signed as they come back. node-postgres answers `integer`
 * as a number and `bigint` as a string, and the schema refuses a string where
 * an int belongs - a column that changed type is a failure worth seeing, not a
 * value to coerce.
 */
function nullableInt(value) {
  return value === null || value === undefined ? null : value;
}

/** site_notices */
function notification(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    originId: nullableInt(row.origin_id),
    status: row.status,
    startsAt: time(row.starts_at),
    endsAt: time(row.ends_at),
    sortOrder: row.sort_order,
    createdAt: requiredTime(row.created_at, 'created_at'),
    updatedAt: requiredTime(row.updated_at, 'updated_at')
  };
}

/** faqs - view_count deliberately absent, and no catalogue section since delta 033 */
function faq(row) {
  return {
    id: row.id,
    category: row.category,
    question: row.question,
    answer: row.answer,
    sortOrder: row.sort_order,
    status: row.status,
    createdAt: requiredTime(row.created_at, 'created_at'),
    updatedAt: requiredTime(row.updated_at, 'updated_at')
  };
}

/** imageFile.describe()'s answer is already the content. */
function image(described) {
  return {
    storageKey: described.storageKey,
    mimeType: described.mimeType,
    size: described.size,
    sha256: described.sha256
  };
}

module.exports = {
  time: time,
  notification: notification,
  faq: faq,
  image: image
};
