/**
 * Delta 061, as a migration: managed tier kinds, and a membership per account
 * and kind (sql/deltas/061_tier_kinds.sql).
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '061_tier_kinds.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

/* Back to one membership per customer and project: only possible while no customer has two. */
exports.down = async function down(knex) {
  await knex.raw(`
    DROP INDEX IF EXISTS idx_crm_membership_account;
    DROP INDEX IF EXISTS uq_crm_membership_ext_kind;
    DROP INDEX IF EXISTS uq_crm_membership_party_kind;
    DROP INDEX IF EXISTS uq_crm_membership_account_kind;
    ALTER TABLE crm_membership DROP CONSTRAINT IF EXISTS fk_crm_membership_tier;
    ALTER TABLE crm_membership DROP CONSTRAINT IF EXISTS fk_crm_membership_account;
    ALTER TABLE crm_membership DROP CONSTRAINT IF EXISTS fk_crm_membership_kind;
    ALTER TABLE crm_membership DROP COLUMN IF EXISTS tier_kind;
    ALTER TABLE crm_membership DROP COLUMN IF EXISTS project_account_id;
    ALTER TABLE crm_membership ADD CONSTRAINT uq_crm_membership UNIQUE (party_pk, project_id);
    ALTER TABLE crm_membership ADD CONSTRAINT fk_crm_membership_tier FOREIGN KEY (current_tier_id, project_id) REFERENCES crm_project_tier(project_tier_id, project_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_membership_ext ON crm_membership(project_id, external_member_id) WHERE external_member_id IS NOT NULL;
    ALTER TABLE crm_project_account DROP CONSTRAINT IF EXISTS uq_crm_project_account_project;
    ALTER TABLE crm_project_tier DROP CONSTRAINT IF EXISTS uq_crm_tier_project_kind;
    ALTER TABLE crm_project_tier DROP CONSTRAINT IF EXISTS fk_crm_project_tier_kind;
    ALTER TABLE crm_project_tier ADD CONSTRAINT crm_project_tier_tier_kind_check CHECK (tier_kind IN ('LEVEL','GRADE','CARD_CLASS'));
    DROP TABLE IF EXISTS crm_tier_kind;
  `);
};
