-- ---------------------------------------------------------------------
-- Delta 063 - a membership names its account by Account ID.
--
-- A membership is one account's place on one kind of tier ladder in its
-- project. Delta 061 pointed it at the crm_project_account row; it now
-- carries the account's Account ID itself (external_account_id), the
-- identifier the project knows the account by. With project_id it names the
-- account; the customer is whoever that Account ID is linked to now - so
-- party_pk and project_account_id go:
--   - a project can report a tier by Account ID, linked to a customer or not;
--   - a merge or a relink moves nothing: the tier follows the account;
--   - a tier whose account is unlinked is not shown, until it is linked again.
-- Unique per (project_id, external_account_id, tier_kind). The Account ID is
-- not a foreign key: an account is unique by it only while linked.
--
-- Memberships with no account (from before accounts were required) belong to
-- no one once party_pk goes, and are removed with their tier history.
--
-- Runs only while project_account_id is there, so it is safe to run twice;
-- on a database built from the current schema.sql it does nothing.
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema() AND table_name = 'crm_membership' AND column_name = 'project_account_id') THEN
    ALTER TABLE crm_membership ADD COLUMN IF NOT EXISTS external_account_id varchar(250) NULL;
    UPDATE crm_membership membership SET external_account_id = account.external_account_id
      FROM crm_project_account account
     WHERE account.project_account_id = membership.project_account_id AND membership.external_account_id IS NULL;

    UPDATE crm_point_account SET membership_id = NULL
     WHERE membership_id IN (SELECT membership_id FROM crm_membership WHERE external_account_id IS NULL);
    DELETE FROM crm_membership WHERE external_account_id IS NULL;

    ALTER TABLE crm_membership DROP CONSTRAINT IF EXISTS fk_crm_membership_account;
    DROP INDEX IF EXISTS uq_crm_membership_account_kind;
    DROP INDEX IF EXISTS uq_crm_membership_party_kind;
    DROP INDEX IF EXISTS idx_crm_membership_account;
    ALTER TABLE crm_membership DROP COLUMN project_account_id;
    ALTER TABLE crm_membership DROP COLUMN party_pk;
    ALTER TABLE crm_project_account DROP CONSTRAINT IF EXISTS uq_crm_project_account_project;

    ALTER TABLE crm_membership ALTER COLUMN external_account_id SET NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_membership_account_kind ON crm_membership(project_id, external_account_id, tier_kind);

COMMENT ON TABLE crm_membership IS 'One account''s place on one kind of tier ladder in its project: unique per (project_id, external_account_id, tier_kind). The customer is whoever the Account ID is linked to (crm_project_account); a tier of an unlinked account is not shown.';
COMMENT ON COLUMN crm_membership.external_account_id IS 'The Account ID (crm_project_account.external_account_id) in this project that holds the tier.';
