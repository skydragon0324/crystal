-- ---------------------------------------------------------------------
-- Delta 056 - a project account is known by its Account ID.
--
-- Until now a project account was keyed by its Account PK
-- (external_account_id, the project's internal key) and the Account ID
-- (external_login, the id the customer signs in with) was optional. It is now
-- the other way round: every link, lookup and review between the CRM and the
-- other projects goes by the Account ID, and the PK is kept only when known.
--
--   crm_project_account       external_login required (and as long as the
--                             PK was), unique per project while linked;
--                             external_account_id optional
--   crm_registration_intake   registrations that carry an account are keyed
--                             by its Account ID (source_record_id)
--   crm_identity_resolution   the same key, for the feed the projects read
--
-- Safe to run twice and on a database built from the current schema.sql.
-- ---------------------------------------------------------------------

-- An account linked without an Account ID gets its PK as one, so no link is lost.
UPDATE crm_project_account SET external_login = external_account_id WHERE external_login IS NULL OR btrim(external_login) = '';

ALTER TABLE crm_project_account ALTER COLUMN external_login TYPE varchar(250);
ALTER TABLE crm_project_account ALTER COLUMN external_login SET NOT NULL;
ALTER TABLE crm_project_account ALTER COLUMN external_account_id DROP NOT NULL;

DROP INDEX IF EXISTS uq_crm_project_account;
CREATE UNIQUE INDEX uq_crm_project_account ON crm_project_account(project_id, external_login) WHERE unlinked_at IS NULL;

UPDATE crm_identity_resolution AS resolution
   SET source_record_id = intake.payload->'account'->>'external_login'
  FROM crm_registration_intake AS intake
 WHERE intake.intake_id = resolution.intake_id
   AND COALESCE(intake.payload->'account'->>'external_login', '') <> ''
   AND resolution.source_record_id IS DISTINCT FROM intake.payload->'account'->>'external_login';

UPDATE crm_registration_intake
   SET source_record_id = payload->'account'->>'external_login'
 WHERE COALESCE(payload->'account'->>'external_login', '') <> ''
   AND source_record_id IS DISTINCT FROM payload->'account'->>'external_login';

-- schema.sql shipped this index with an invalid condition; the one delta 051 made is the right one.
CREATE INDEX IF NOT EXISTS idx_crm_intake_eshop_record ON crm_registration_intake(source_record_id) WHERE category = 'ESHOP';
