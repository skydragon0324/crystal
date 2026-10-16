/**
 * Delta 063, as a migration: a membership names its account by Account ID
 * (sql/deltas/063_membership_by_account_id.sql). Down puts the account and
 * customer back from the live link of each Account ID; a membership whose
 * Account ID is not linked cannot be given a customer and is left out.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '063_membership_by_account_id.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE crm_membership ADD COLUMN party_pk bigint NULL REFERENCES crm_party(party_pk);
    ALTER TABLE crm_membership ADD COLUMN project_account_id bigint NULL;
    UPDATE crm_membership membership SET party_pk = account.party_pk, project_account_id = account.project_account_id
      FROM crm_project_account account
     WHERE account.project_id = membership.project_id AND account.external_account_id = membership.external_account_id AND account.unlinked_at IS NULL;
    UPDATE crm_point_account SET membership_id = NULL WHERE membership_id IN (SELECT membership_id FROM crm_membership WHERE party_pk IS NULL);
    DELETE FROM crm_membership WHERE party_pk IS NULL;
    ALTER TABLE crm_membership ALTER COLUMN party_pk SET NOT NULL;
    DROP INDEX IF EXISTS uq_crm_membership_account_kind;
    ALTER TABLE crm_project_account ADD CONSTRAINT uq_crm_project_account_project UNIQUE (project_account_id, project_id);
    ALTER TABLE crm_membership ADD CONSTRAINT fk_crm_membership_account FOREIGN KEY (project_account_id, project_id) REFERENCES crm_project_account(project_account_id, project_id);
    CREATE UNIQUE INDEX uq_crm_membership_account_kind ON crm_membership(project_account_id, tier_kind) WHERE project_account_id IS NOT NULL;
    CREATE UNIQUE INDEX uq_crm_membership_party_kind ON crm_membership(party_pk, project_id, tier_kind) WHERE project_account_id IS NULL;
    CREATE INDEX idx_crm_membership_account ON crm_membership(project_account_id);
    ALTER TABLE crm_membership DROP COLUMN external_account_id;
  `);
};
