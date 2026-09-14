/**
 * Delta 007, as a migration.
 *
 * Executes the file from sql/deltas rather than describing the change with
 * knex's schema builder - two descriptions of the same tables is two things to
 * keep in step and no way to tell which one the database matches.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas', '007_feedback_threads.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

/**
 * No honest rollback: the old single-row shape cannot hold a conversation, so
 * putting the table back would mean choosing which messages to throw away.
 * Restore from a dump instead.
 */
exports.down = async function down() {
  throw new Error(
    'delta 007 cannot be rolled back - a thread with several messages does not '
    + 'fit the single-reply table it replaced. Restore from a backup.'
  );
};
