/**
 * Delta 046 - a manager can assign a customer's corporate grade by hand
 * (sql/deltas/046_assigned_corporate_grade.sql).
 *
 * The delta is written to run twice, so it also runs on a database built from
 * the current schema.sql.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '046_assigned_corporate_grade.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down() {
  throw new Error('046 cannot be rolled back automatically; restore a backup if needed.');
};
