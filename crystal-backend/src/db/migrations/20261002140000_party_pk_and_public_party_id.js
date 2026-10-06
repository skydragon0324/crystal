/**
 * Delta 042 - crm_party.party_pk is the internal key, party_id the public id
 * (sql/deltas/042_party_pk_and_public_party_id.sql).
 *
 * A database built from the CURRENT schema.sql already has party_pk, so the
 * delta runs only where crm_party has none.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '042_party_pk_and_public_party_id.sql');

exports.up = async function up(knex) {
  const column = await knex.raw(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'crm_party' AND column_name = 'party_pk'"
  );
  if (column.rows.length) return;
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

/* Every link was rewritten to the new codes; the old numbers survive only as party_pk. */
exports.down = async function down() {
  throw new Error('042 cannot be rolled back: every party link now holds the public party_id');
};
