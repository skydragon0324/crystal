/**
 * Delta 038 - the job list, the manual check on a person, an organization's
 * location (sql/deltas/038_person_job_titles_and_org_location.sql).
 *
 * A database built from the CURRENT schema.sql already has crm_job_title,
 * because the init migration ran it; the delta runs only where the CRM exists
 * and crm_job_title does not, so both routes end with the same tables.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '038_person_job_titles_and_org_location.sql');

exports.up = async function up(knex) {
  const crm = await knex.raw("SELECT to_regclass('crm_person') AS found");
  if (!crm.rows[0].found) return;
  const built = await knex.raw("SELECT to_regclass('crm_job_title') AS found");
  if (!built.rows[0].found) {
    await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
  }
};

/* The dropped columns held data the delta does not keep, so there is nothing to roll back to. */
exports.down = async function down() {
  throw new Error('038 cannot be rolled back: nationality, language and ID card columns were dropped');
};
