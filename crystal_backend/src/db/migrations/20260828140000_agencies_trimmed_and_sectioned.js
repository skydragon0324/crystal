/**
 * Delta 004, as a migration.
 *
 * Executes the file from sql/deltas rather than describing the change with
 * knex's schema builder - two descriptions of the same tables is two things to
 * keep in step and no way to tell which one the database matches.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas', '004_agencies_trimmed_and_sectioned.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

/**
 * No honest rollback: seven columns of addresses and coordinates cannot be
 * reconstructed once dropped. Restore from a dump instead.
 */
exports.down = async function down() {
  throw new Error(
    'delta 004 cannot be rolled back - it drops address columns whose values '
    + 'cannot be reconstructed. Restore from a backup taken before it ran.'
  );
};
