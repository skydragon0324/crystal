/**
 * Delta 065, as a migration: a membership hangs on its project account and
 * repeats nothing of it (sql/deltas/065_membership_on_the_account.sql).
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '065_membership_on_the_account.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

/* Back to project_id + Account ID, read from each membership's account. */
exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE crm_membership ADD COLUMN project_id int NULL REFERENCES crm_project(project_id);
    ALTER TABLE crm_membership ADD COLUMN external_account_id varchar(250) NULL;
    UPDATE crm_membership membership SET project_id = account.project_id, external_account_id = account.external_account_id
      FROM crm_project_account account WHERE account.project_account_id = membership.project_account_id;
    ALTER TABLE crm_membership ALTER COLUMN project_id SET NOT NULL;
    ALTER TABLE crm_membership ALTER COLUMN external_account_id SET NOT NULL;
    ALTER TABLE crm_membership DROP CONSTRAINT IF EXISTS fk_crm_membership_tier;
    ALTER TABLE crm_membership ADD CONSTRAINT fk_crm_membership_tier FOREIGN KEY (current_tier_id, project_id, tier_kind)
      REFERENCES crm_project_tier(project_tier_id, project_id, tier_kind) ON UPDATE CASCADE;
    ALTER TABLE crm_project_tier DROP CONSTRAINT IF EXISTS uq_crm_tier_kind_ref;
    DROP INDEX IF EXISTS uq_crm_membership_account_kind;
    DROP INDEX IF EXISTS idx_crm_membership_tier;
    ALTER TABLE crm_membership DROP CONSTRAINT IF EXISTS fk_crm_membership_account;
    ALTER TABLE crm_membership DROP COLUMN project_account_id;
    CREATE UNIQUE INDEX uq_crm_membership_account_kind ON crm_membership(project_id, external_account_id, tier_kind);
    CREATE INDEX idx_crm_membership_tier ON crm_membership(project_id, current_tier_id);
  `);
};
