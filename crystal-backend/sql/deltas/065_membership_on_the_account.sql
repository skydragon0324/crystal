-- ---------------------------------------------------------------------
-- Delta 065 - a membership hangs on its project account, and on nothing else.
--
-- A membership is one account's tier on one kind of ladder. The account row
-- (crm_project_account) already says whose account it is (party_pk), in which
-- project (project_id) and by which Account ID (external_account_id), so the
-- membership keeps only project_account_id and repeats none of them:
--   - the customer is the account's party_pk - a merge moves the account, and
--     its tiers with it;
--   - a tier of an unlinked account is not shown anywhere;
--   - "the tier is of the account's project" is checked by the code that sets
--     tiers (memberships.service), the kind by the key below.
-- Unique per (project_account_id, tier_kind).
--
-- Memberships named by Account ID (delta 063) are given the account that
-- Account ID is linked to now, else the latest one that had it; one whose
-- Account ID no account ever had is removed with its tier history.
--
-- Runs only while external_account_id is on crm_membership, so it is safe to
-- run twice; on a database built from the current schema.sql it does nothing.
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema() AND table_name = 'crm_membership' AND column_name = 'external_account_id') THEN
    ALTER TABLE crm_membership ADD COLUMN IF NOT EXISTS project_account_id bigint NULL;
    UPDATE crm_membership membership SET project_account_id = (
           SELECT account.project_account_id FROM crm_project_account account
            WHERE account.project_id = membership.project_id AND account.external_account_id = membership.external_account_id
            ORDER BY account.unlinked_at DESC NULLS FIRST, account.project_account_id DESC LIMIT 1)
     WHERE membership.project_account_id IS NULL;
    UPDATE crm_point_account SET membership_id = NULL
     WHERE membership_id IN (SELECT membership_id FROM crm_membership WHERE project_account_id IS NULL);
    DELETE FROM crm_membership WHERE project_account_id IS NULL;

    -- The tier's kind is the membership's; its project is the account's (checked in code).
    ALTER TABLE crm_project_tier DROP CONSTRAINT IF EXISTS uq_crm_tier_kind_ref;
    ALTER TABLE crm_project_tier ADD CONSTRAINT uq_crm_tier_kind_ref UNIQUE (project_tier_id, tier_kind);
    ALTER TABLE crm_membership DROP CONSTRAINT IF EXISTS fk_crm_membership_tier;
    ALTER TABLE crm_membership ADD CONSTRAINT fk_crm_membership_tier FOREIGN KEY (current_tier_id, tier_kind)
      REFERENCES crm_project_tier(project_tier_id, tier_kind) ON UPDATE CASCADE;

    DROP INDEX IF EXISTS uq_crm_membership_account_kind;
    DROP INDEX IF EXISTS uq_crm_membership_ext_kind;
    DROP INDEX IF EXISTS idx_crm_membership_tier;
    ALTER TABLE crm_membership DROP COLUMN external_account_id;
    ALTER TABLE crm_membership DROP COLUMN project_id;

    ALTER TABLE crm_membership ALTER COLUMN project_account_id SET NOT NULL;
    ALTER TABLE crm_membership ADD CONSTRAINT fk_crm_membership_account FOREIGN KEY (project_account_id) REFERENCES crm_project_account(project_account_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_membership_account_kind ON crm_membership(project_account_id, tier_kind);
CREATE INDEX IF NOT EXISTS idx_crm_membership_tier ON crm_membership(current_tier_id);

COMMENT ON TABLE crm_membership IS 'One project account''s tier on one kind of ladder: unique per (project_account_id, tier_kind). Customer, project and Account ID are the account''s; a tier of an unlinked account is not shown.';
COMMENT ON COLUMN crm_membership.project_account_id IS 'The account (crm_project_account) holding the tier - which also says whose it is, in which project, by which Account ID.';
COMMENT ON COLUMN crm_membership.tier_kind IS 'The ladder (crm_tier_kind); current_tier_id is a tier of this kind, and of the account''s project.';
