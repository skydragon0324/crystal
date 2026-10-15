/**
 * Delta 058, as a migration: the phone that linked a project account
 * (sql/deltas/058_smartphone_offline_link.sql).
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '058_smartphone_offline_link.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_crm_project_account_phone; ALTER TABLE crm_project_account DROP COLUMN IF EXISTS matched_phone;');
};
