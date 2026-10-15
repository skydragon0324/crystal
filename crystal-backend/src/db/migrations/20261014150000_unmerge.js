/**
 * Delta 057, as a migration: a merge can be undone (sql/deltas/057_unmerge.sql).
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '057_unmerge.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE crm_party_merge_history DROP COLUMN IF EXISTS restored_rows;
    ALTER TABLE crm_party_merge_history DROP COLUMN IF EXISTS unmerge_reason;
    ALTER TABLE crm_party_merge_history DROP COLUMN IF EXISTS unmerged_by_manager_id;
    ALTER TABLE crm_party_merge_history DROP COLUMN IF EXISTS unmerged_at;
  `);
};
