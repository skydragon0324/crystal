/**
 * Delta 041 - party_id is the customer number
 * (sql/deltas/041_party_id_is_the_customer_number.sql).
 *
 * A database built from the CURRENT schema.sql has no crm_party.party_no, so
 * the delta runs only where that column is still there.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '041_party_id_is_the_customer_number.sql');

exports.up = async function up(knex) {
  const column = await knex.raw(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'crm_party' AND column_name = 'party_no'"
  );
  if (!column.rows.length) return;
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

/* The numbers it held are gone with the column. */
exports.down = async function down() {
  throw new Error('041 cannot be rolled back: crm_party.party_no is dropped');
};
