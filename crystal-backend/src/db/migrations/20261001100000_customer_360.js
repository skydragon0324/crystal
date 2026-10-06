/**
 * Delta 037 - what the Customer 360 record keeps that the CRM did not:
 * tags, relationships between customers, interactions, notes and files, the
 * account team, agreements, and the organization profile columns.
 *
 * A database built from the CURRENT schema.sql already has these, because the
 * init migration ran it; the delta runs only where crm_party_note does not
 * exist yet, so both routes end with the same tables.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '037_customer_360.sql');

const TABLES = ['crm_party_agreement', 'crm_party_team_member', 'crm_party_file', 'crm_party_note', 'crm_party_interaction',
  'crm_party_relationship', 'crm_party_relationship_type', 'crm_party_tag', 'crm_tag'];
const ORG_COLUMNS = ['local_name', 'employee_count_band', 'description', 'headquarters_location_id', 'headquarters_address'];
const NEW_ROLES = ['DECISION_MAKER', 'INFLUENCER', 'PURCHASING', 'OPERATIONAL', 'REPRESENTATIVE'];

exports.up = async function up(knex) {
  const crm = await knex.raw("SELECT to_regclass('crm_party') AS found");
  if (!crm.rows[0].found) return;
  const built = await knex.raw("SELECT to_regclass('crm_party_note') AS found");
  if (!built.rows[0].found) {
    await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
  }
};

exports.down = async function down(knex) {
  for (let position = 0; position < TABLES.length; position += 1) {
    // eslint-disable-next-line no-await-in-loop
    await knex.raw('DROP TABLE IF EXISTS ?? CASCADE', [TABLES[position]]);
  }
  const crm = await knex.raw("SELECT to_regclass('crm_organization') AS found");
  if (!crm.rows[0].found) return;
  for (let position = 0; position < ORG_COLUMNS.length; position += 1) {
    // eslint-disable-next-line no-await-in-loop
    await knex.raw('ALTER TABLE crm_organization DROP COLUMN IF EXISTS ??', [ORG_COLUMNS[position]]);
  }
  await knex('crm_org_contact_role').whereIn('role_code', NEW_ROLES)
    .whereNotExists(knex('crm_organization_person_role as person_role').whereRaw('person_role.contact_role_id = crm_org_contact_role.contact_role_id'))
    .del();
};
