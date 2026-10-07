/**
 * Delta 048 - crm_party.party_id is no longer generated in phase 1
 * (sql/deltas/048_party_id_not_generated.sql).
 *
 * The delta is written to run twice, so it also runs on a database built from
 * the current schema.sql.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '048_party_id_not_generated.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down() {
  throw new Error('048 cannot be rolled back automatically; restore a backup if needed.');
};
