/**
 * Delta 013, as a migration.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas', '013_admins_are_a_login_and_a_role.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  /*
   * The COLUMNS come back; what was in them does not.
   *
   * Which centre each account belonged to, and each account's address, are
   * recorded nowhere else - dropping the columns dropped the only copy. So
   * this restores the shape and leaves every row NULL, which is the honest
   * reversal: an empty column somebody has to fill in again, rather than a
   * guess that looks like data.
   */
  await knex.raw('ALTER TABLE managers ADD COLUMN IF NOT EXISTS email varchar(190) NULL;');
  await knex.raw('ALTER TABLE managers ADD COLUMN IF NOT EXISTS agency_id integer NULL;');

  await knex.raw(`
    DO $$
    BEGIN
        ALTER TABLE managers ADD CONSTRAINT admins_email_key UNIQUE (email);
    EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw(`
    DO $$
    BEGIN
        ALTER TABLE managers
            ADD CONSTRAINT fk_admins_agency
            FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_admins_agency ON admins(agency_id);');
};
