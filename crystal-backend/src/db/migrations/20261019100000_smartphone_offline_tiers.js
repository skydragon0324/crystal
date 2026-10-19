/**
 * Delta 066, as a migration: the SMARTPHONE_OFFLINE system's levels and
 * grades as tiers (sql/deltas/066_smartphone_offline_tiers.sql).
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '066_smartphone_offline_tiers.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

/* The tiers the delta added, while nothing holds them; a tier that predates it (LEVEL 1) stays. */
exports.down = async function down(knex) {
  await knex.raw(`
    DELETE FROM crm_project_tier tier
     USING crm_project project
     WHERE project.project_id = tier.project_id AND project.project_code = 'SMARTPHONE_OFFLINE'
       AND tier.tier_name ~ '^(Level|Grade) [1-5]$'
       AND NOT EXISTS (SELECT 1 FROM crm_membership membership WHERE membership.current_tier_id = tier.project_tier_id)
       AND NOT EXISTS (SELECT 1 FROM crm_membership_tier_history history WHERE history.new_tier_id = tier.project_tier_id OR history.old_tier_id = tier.project_tier_id);
  `);
};
