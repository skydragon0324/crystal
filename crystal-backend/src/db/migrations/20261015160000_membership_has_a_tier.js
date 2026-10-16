/**
 * Delta 064, as a migration: a membership always has a tier
 * (sql/deltas/064_membership_has_a_tier.sql). Down only lifts the rule; the
 * memberships without a tier that were removed are not brought back.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '064_membership_has_a_tier.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  await knex.raw('ALTER TABLE crm_membership ALTER COLUMN current_tier_id DROP NOT NULL;');
};
