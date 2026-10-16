-- ---------------------------------------------------------------------
-- Delta 064 - a membership always has a tier.
--
-- A membership is one account's tier on one kind of ladder; one with no tier
-- says nothing. Earlier data (the demo data among it) made a membership for
-- every account whether or not the project gave it a tier. Those are removed
-- here, and current_tier_id becomes required: adding a tier is what creates a
-- membership.
--
-- Safe to run twice and on a database built from the current schema.sql.
-- ---------------------------------------------------------------------

UPDATE crm_point_account SET membership_id = NULL
 WHERE membership_id IN (SELECT membership_id FROM crm_membership WHERE current_tier_id IS NULL);
DELETE FROM crm_membership WHERE current_tier_id IS NULL;
ALTER TABLE crm_membership ALTER COLUMN current_tier_id SET NOT NULL;

COMMENT ON COLUMN crm_membership.current_tier_id IS 'The tier the account holds on this kind of ladder - required: a membership is a tier held.';
