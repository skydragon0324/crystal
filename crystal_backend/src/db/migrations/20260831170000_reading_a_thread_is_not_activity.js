/**
 * Delta 012, as a migration.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas', '012_reading_a_thread_is_not_activity.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  await knex.raw('DROP TRIGGER IF EXISTS trg_feedback_threads_updated ON feedback_threads;');
  await knex.raw(`
    CREATE TRIGGER trg_feedback_threads_updated
        BEFORE UPDATE ON feedback_threads
        FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
  `);
  await knex.raw('DROP FUNCTION IF EXISTS set_updated_at_unless_read();');
};
