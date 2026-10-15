/**
 * Delta 056, as a migration: a project account is keyed by its Account ID
 * (external_login), not its Account PK (sql/deltas/056_account_id_is_the_key.sql).
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '056_account_id_is_the_key.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

/* Back to the PK as the key. Registrations keep their new keys: an account's PK may not be known any more. */
exports.down = async function down(knex) {
  await knex.raw(`
    UPDATE crm_project_account SET external_account_id = external_login WHERE external_account_id IS NULL;
    ALTER TABLE crm_project_account ALTER COLUMN external_account_id SET NOT NULL;
    ALTER TABLE crm_project_account ALTER COLUMN external_login DROP NOT NULL;
    DROP INDEX IF EXISTS uq_crm_project_account;
    CREATE UNIQUE INDEX uq_crm_project_account ON crm_project_account(project_id, external_account_id) WHERE unlinked_at IS NULL;
  `);
};
