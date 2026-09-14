/**
 * Delta 001, as a migration.
 *
 * Like the init migration, this executes a file from sql/ rather than
 * describing the change with knex's schema builder - two descriptions of the
 * same tables is two things to keep in step and no way to tell which one the
 * database actually matches.
 *
 * A database created FROM schema.sql already has every one of these changes,
 * which is why the delta is written to be safe to run twice: this migration
 * is a no-op there rather than an error.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas', '001_service_pricing_and_os_media.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS service_price_attachments CASCADE;
    ALTER TABLE service_prices DROP COLUMN IF EXISTS sale_price;
    ALTER TABLE service_prices DROP COLUMN IF EXISTS approval_no;
    ALTER TABLE media_assets DROP CONSTRAINT IF EXISTS media_assets_owner_type_check;
    ALTER TABLE media_assets ADD CONSTRAINT media_assets_owner_type_check
      CHECK (owner_type IN ('PRODUCT','SERIES','CATEGORY','ARTICLE'));
  `);
};
