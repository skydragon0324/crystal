/**
 * Delta 051 - indexes for the registration review screens' two lookups, by
 * customer and by account id (sql/deltas/051_registration_lookups.sql).
 *
 * The delta is written to run twice, so it also runs on a database built from
 * the current schema.sql.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '051_registration_lookups.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_crm_intake_party; DROP INDEX IF EXISTS idx_crm_intake_eshop_record;');
};
