-- ---------------------------------------------------------------------
-- Delta 062 - a project account's two identifiers, named for what they are.
--
--   external_account_id  -> external_account_pk   the account's PK in its project (optional)
--   external_login       -> external_account_id   the Account ID the customer is known by (the key)
--
-- In this order, so the new external_account_id never meets the old one.
-- The same keys inside saved registrations (crm_registration_intake.payload
-- and .candidates: the account a project sent, the identifiers an Excel row
-- listed) are renamed with them, at any depth - the duplicate check reads
-- them from there.
--
-- Runs only while the old column is there, so it is safe to run twice; on a
-- database built from the current schema.sql it does nothing.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.crm_account_keys(doc jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF jsonb_typeof(doc) = 'object' THEN
    RETURN (SELECT COALESCE(jsonb_object_agg(
              CASE key WHEN 'external_account_id' THEN 'external_account_pk' WHEN 'external_login' THEN 'external_account_id' ELSE key END,
              pg_temp.crm_account_keys(value)), '{}'::jsonb)
              FROM jsonb_each(doc));
  ELSIF jsonb_typeof(doc) = 'array' THEN
    RETURN (SELECT COALESCE(jsonb_agg(pg_temp.crm_account_keys(element) ORDER BY position), '[]'::jsonb)
              FROM jsonb_array_elements(doc) WITH ORDINALITY AS item(element, position));
  END IF;
  RETURN doc;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema() AND table_name = 'crm_project_account' AND column_name = 'external_login') THEN
    ALTER TABLE crm_project_account RENAME COLUMN external_account_id TO external_account_pk;
    ALTER TABLE crm_project_account RENAME COLUMN external_login TO external_account_id;
    UPDATE crm_registration_intake
       SET payload = pg_temp.crm_account_keys(payload),
           candidates = pg_temp.crm_account_keys(candidates)
     WHERE payload::text LIKE '%external_login%' OR payload::text LIKE '%external_account_id%'
        OR candidates::text LIKE '%external_login%' OR candidates::text LIKE '%external_account_id%';
  END IF;
END $$;

COMMENT ON COLUMN crm_project_account.external_account_id IS 'The Account ID the customer is known by in the project - the key an account is linked by.';
COMMENT ON COLUMN crm_project_account.external_account_pk IS 'The account''s PK in its project, when the project has one.';
