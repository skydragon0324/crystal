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
-- RUNS ONLY WHILE `external_login` IS STILL THERE, which is what makes it
-- safe to run twice AND on a database built from the current schema.sql.
--
-- That guard is not decoration. Delta 062 later RENAMES these two columns to
-- say what they are - external_account_id -> external_account_pk, and
-- external_login -> external_account_id - and schema.sql has been regenerated
-- since, so a fresh install arrives with the finished names and no
-- `external_login` at all. Without the guard this delta is the first thing
-- `npm run migrate` hits on a new database, and it stops the whole chain with
-- "column external_login does not exist". The work below is the step from the
-- OLD shape to the new one; where there is no old shape there is nothing to
-- do, and saying so is the difference between a delta that is history and a
-- delta that is a blocker.
--
-- Delta 062 is written the same way, for the same reason.
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'crm_project_account'
       AND column_name = 'external_login'
  ) THEN
    RETURN;
  END IF;

  -- An account linked without an Account ID gets its PK as one, so no link is lost.
  UPDATE crm_project_account
     SET external_login = external_account_id
   WHERE external_login IS NULL OR btrim(external_login) = '';

  ALTER TABLE crm_project_account ALTER COLUMN external_login TYPE varchar(250);
  ALTER TABLE crm_project_account ALTER COLUMN external_login SET NOT NULL;
  ALTER TABLE crm_project_account ALTER COLUMN external_account_id DROP NOT NULL;

  -- The key moves to the Account ID. On a fresh install the index schema.sql
  -- ships is already on the column this one would have created it on - the
  -- same key under its finished name - so leaving it alone is correct.
  DROP INDEX IF EXISTS uq_crm_project_account;
  CREATE UNIQUE INDEX uq_crm_project_account
      ON crm_project_account(project_id, external_login) WHERE unlinked_at IS NULL;

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
END $$;

-- Delta 051's index, for a database that predates it. schema.sql now ships
-- the same one, so on a fresh install this is a no-op by name.
CREATE INDEX IF NOT EXISTS idx_crm_intake_eshop_record ON crm_registration_intake(source_record_id) WHERE category = 'ESHOP';
