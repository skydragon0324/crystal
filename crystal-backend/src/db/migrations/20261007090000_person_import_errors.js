/**
 * Delta 047 - customer import rows that failed the file check are kept
 * (sql/deltas/047_person_import_errors.sql).
 *
 * The delta is written to run twice, so it also runs on a database built from
 * the current schema.sql.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '047_person_import_errors.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down() {
  throw new Error('047 cannot be rolled back automatically; restore a backup if needed.');
};
