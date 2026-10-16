/**
 * Delta 062, as a migration: external_account_id -> external_account_pk and
 * external_login -> external_account_id on crm_project_account, and the same
 * keys in saved registrations (sql/deltas/062_account_pk_and_id.sql).
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '062_account_pk_and_id.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  await knex.raw(`
    CREATE OR REPLACE FUNCTION pg_temp.crm_account_keys_back(doc jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
    BEGIN
      IF jsonb_typeof(doc) = 'object' THEN
        RETURN (SELECT COALESCE(jsonb_object_agg(
                  CASE key WHEN 'external_account_id' THEN 'external_login' WHEN 'external_account_pk' THEN 'external_account_id' ELSE key END,
                  pg_temp.crm_account_keys_back(value)), '{}'::jsonb) FROM jsonb_each(doc));
      ELSIF jsonb_typeof(doc) = 'array' THEN
        RETURN (SELECT COALESCE(jsonb_agg(pg_temp.crm_account_keys_back(element) ORDER BY position), '[]'::jsonb)
                  FROM jsonb_array_elements(doc) WITH ORDINALITY AS item(element, position));
      END IF;
      RETURN doc;
    END $$;
    ALTER TABLE crm_project_account RENAME COLUMN external_account_id TO external_login;
    ALTER TABLE crm_project_account RENAME COLUMN external_account_pk TO external_account_id;
    UPDATE crm_registration_intake SET payload = pg_temp.crm_account_keys_back(payload), candidates = pg_temp.crm_account_keys_back(candidates);
  `);
};
