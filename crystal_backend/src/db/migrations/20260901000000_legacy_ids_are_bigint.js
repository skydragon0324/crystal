/**
 * Delta 015, as a migration.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas', '015_legacy_ids_are_bigint.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  /*
   * Narrowing back is only safe while nothing outside 32 bits is stored, which
   * is exactly what this delta existed to allow - so the rows are checked
   * rather than the column being truncated silently.
   */
  const row = await knex('media_assets').max({ m: 'owner_id' }).first();
  if (Number(row.m || 0) > 2147483647) {
    throw new Error('media_assets holds an owner_id that does not fit in an integer');
  }

  await knex.raw('ALTER TABLE media_assets ALTER COLUMN owner_id TYPE integer');
};
