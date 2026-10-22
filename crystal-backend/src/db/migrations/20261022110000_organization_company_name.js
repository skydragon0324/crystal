/**
 * Delta 068, as a migration: an organization's optional company name
 * (sql/deltas/068_organization_company_name.sql).
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '068_organization_company_name.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  await knex.raw('ALTER TABLE crm_organization DROP COLUMN IF EXISTS company_name;');
};
