/**
 * Delta 059, as a migration: reward points per business-system account, the
 * project weights, and the company-wide score (sql/deltas/059_project_point_balances.sql).
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '059_project_point_balances.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  await knex.raw(`
    DROP VIEW IF EXISTS v_crm_party_company_points;
    DROP TABLE IF EXISTS crm_reward_points;
    ALTER TABLE crm_project DROP CONSTRAINT IF EXISTS chk_crm_project_point_weight;
    ALTER TABLE crm_project DROP COLUMN IF EXISTS point_weight;
    UPDATE crm_metric_definition SET metric_name = 'Points balance, all types',
           description = 'Sum of balances across point types - for ranking only, never for spending.'
     WHERE metric_code = 'POINTS_BALANCE';
  `);
};
