/**
 * Delta 049 - "location activity" is "service center activity"
 * (sql/deltas/049_service_center_activity.sql): code values, the console page
 * name and constraint names.
 *
 * The delta is written to run twice, so it also runs on a database built from
 * the current schema.sql.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '049_service_center_activity.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down() {
  throw new Error('049 cannot be rolled back automatically; restore a backup if needed.');
};
