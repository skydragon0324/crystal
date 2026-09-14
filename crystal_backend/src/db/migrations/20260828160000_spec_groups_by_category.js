/**
 * Delta 005, as a migration.
 *
 * Executes the file from sql/deltas rather than describing the change with
 * knex's schema builder - two descriptions of the same tables is two things to
 * keep in step and no way to tell which one the database matches.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas', '005_spec_groups_by_category.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

/** Both columns are additive, so this one rolls back cleanly. */
exports.down = async function down(knex) {
  await knex.raw(`
    DROP INDEX IF EXISTS idx_spec_groups_category;
    ALTER TABLE specification_groups DROP COLUMN IF EXISTS product_category_id;
    ALTER TABLE products DROP COLUMN IF EXISTS show_service_pricing;
  `);
};
