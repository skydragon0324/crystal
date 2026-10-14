/**
 * Delta 056 - 'export' becomes an audit action
 * (sql/deltas/056_exports_are_audited.sql).
 *
 * `ALTER TYPE ... ADD VALUE` IS ALLOWED INSIDE A TRANSACTION on PostgreSQL 12
 * and later, which is what knex wraps a migration in, PROVIDED the new value
 * is not also used in that transaction. This migration only adds it; the
 * first row carrying it is written by a later request.
 *
 * `down` IS DELIBERATELY A NO-OP. PostgreSQL has no DROP VALUE: undoing this
 * means creating a new type, rewriting every audit_log row onto it and
 * swapping the column - on the one table whose contents must not be rewritten.
 * An enum label nothing uses costs nothing, so the rollback is to leave it.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas', '056_exports_are_audited.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down() {
  /* See the note above: an added enum value is not removable, and does no harm. */
};
