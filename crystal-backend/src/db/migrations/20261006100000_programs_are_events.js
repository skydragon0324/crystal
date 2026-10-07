/**
 * Delta 045 - an activity "program" is an "event" (sql/deltas/045_programs_are_events.sql):
 * tables, columns, constraints, code values and the console page.
 *
 * The delta finds what to rename in the catalog, so on a database built from
 * the current schema.sql it has nothing to do.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '045_programs_are_events.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down() {
  throw new Error('045 cannot be rolled back automatically; restore a backup if needed.');
};
