-- ---------------------------------------------------------------------
-- Delta 058 - customers linked to the SMARTPHONE_OFFLINE system by phone.
--
-- The SMARTPHONE_OFFLINE system treats one mobile number as one
-- user. The CRM asks it which user has each of a customer's phone numbers and
-- links the answers as project accounts. matched_phone is the number (as
-- normalised in crm_contact_point) that found the account: a number already
-- linked this way is not asked about again.
--
-- The project itself is the one whose code is SMARTPHONE_OFFLINE_PROJECT_CODE
-- (SMARTPHONE_OFFLINE unless set), added in Settings > Projects.
--
-- Safe to run twice and on a database built from the current schema.sql.
-- ---------------------------------------------------------------------

ALTER TABLE crm_project_account ADD COLUMN IF NOT EXISTS matched_phone varchar(50) NULL;
COMMENT ON COLUMN crm_project_account.matched_phone IS 'The customer phone number (normalised) that found this account in a phone-keyed system such as SMARTPHONE_OFFLINE; NULL for accounts linked any other way.';
CREATE INDEX IF NOT EXISTS idx_crm_project_account_phone ON crm_project_account(project_id, matched_phone) WHERE matched_phone IS NOT NULL;
