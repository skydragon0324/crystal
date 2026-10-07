/**
 * Delta 044 - free project types, department API keys
 * (sql/deltas/044_free_project_types_and_department_keys.sql).
 *
 * The delta is written to run twice, so it also runs on a database built from
 * the current schema.sql.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '044_free_project_types_and_department_keys.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down() {
  throw new Error('044 cannot be rolled back automatically; restore a backup if needed.');
};
