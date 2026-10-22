-- ---------------------------------------------------------------------
-- Delta 068 - an organization's company name.
--
-- An organization is shown and searched by its Name (crm_party.display_name).
-- Its company name - the name it is registered under, when that is not the
-- Name - is kept beside it, optional, and shown on the record.
--
-- Safe to run twice, and on a database built from the current schema.sql,
-- which already has it.
-- ---------------------------------------------------------------------

ALTER TABLE crm_organization ADD COLUMN IF NOT EXISTS company_name varchar(250) NULL;
COMMENT ON COLUMN crm_organization.company_name IS 'The company name the organization is registered under, when it is not the Name (crm_party.display_name). Optional.';
