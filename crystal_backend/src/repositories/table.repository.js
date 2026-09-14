const db = require('../config/db');

/**
 * Row operations that are the same whatever the table is.
 *
 * Every one of them takes the table and its primary key as arguments, which
 * is what lets the audit helpers and the generic CRUD stack share a single
 * implementation instead of each carrying their own copy of "insert and hand
 * the row back".
 *
 * A table with rules of its own gets its own repository and does not come
 * through here; this is for the shapes that genuinely have no rules - "read
 * one by id", "set is_deleted".  Every function takes an optional trailing
 * `trx` so a service can pull it into a transaction.
 */

/** One row by primary key, whatever its is_deleted says. */
function findById(table, pk, id, trx) {
  return (trx || db)(table).where(pk, id).first();
}

/** One row by primary key, restricted to the named columns. */
function findColumnsById(table, pk, id, columns, trx) {
  return (trx || db)(table).where(pk, id).first(columns);
}

/**
 * One row by primary key, locked until the transaction ends.
 *
 * The ledgers need this: reading a stock level, deciding it is enough and
 * then decrementing it is only correct if nothing else can read the same
 * level in between.  It takes a transaction rather than defaulting to the
 * pool because a row lock outside one is a lock that ends immediately, which
 * would be a silent no-op rather than an error.
 */
function lockById(table, pk, id, trx) {
  return trx(table).where(pk, id).forUpdate().first();
}

function insert(table, data, trx) {
  return (trx || db)(table).insert(data).returning('*');
}

/** Insert handing back only the named columns - for tables holding secrets. */
function insertReturning(table, data, columns, trx) {
  return (trx || db)(table).insert(data).returning(columns);
}

function update(table, pk, id, data, trx) {
  return (trx || db)(table).where(pk, id).update(data).returning('*');
}

function updateReturning(table, pk, id, data, columns, trx) {
  return (trx || db)(table).where(pk, id).update(data).returning(columns);
}

/** Rows affected, so the caller still decides what a miss means. */
function softDelete(table, pk, id, trx) {
  return (trx || db)(table).where(pk, id).update({ is_deleted: true });
}

function hardDelete(table, pk, id, trx) {
  return (trx || db)(table).where(pk, id).del();
}

function restore(table, pk, id, trx) {
  return (trx || db)(table).where(pk, id).update({ is_deleted: false }).returning('*');
}

module.exports = {
  findById: findById,
  findColumnsById: findColumnsById,
  lockById: lockById,
  insert: insert,
  insertReturning: insertReturning,
  update: update,
  updateReturning: updateReturning,
  softDelete: softDelete,
  hardDelete: hardDelete,
  restore: restore
};
