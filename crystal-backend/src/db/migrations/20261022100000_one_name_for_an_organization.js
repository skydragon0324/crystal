/**
 * Delta 067, as a migration: an organization is known by one name - its legal,
 * trading and local names go (sql/deltas/067_one_name_for_an_organization.sql).
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '067_one_name_for_an_organization.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

/* The columns come back empty: what they held was dropped with them. */
exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE crm_organization ADD COLUMN IF NOT EXISTS legal_name varchar(250) NULL;
    ALTER TABLE crm_organization ADD COLUMN IF NOT EXISTS trading_name varchar(250) NULL;
    ALTER TABLE crm_organization ADD COLUMN IF NOT EXISTS local_name varchar(250) NULL;
  `);
};
