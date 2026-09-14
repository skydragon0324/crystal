/**
 * Delta 003, as a migration.
 *
 * Executes the file from sql/deltas rather than describing the change with
 * knex's schema builder - two descriptions of the same table is two things to
 * keep in step and no way to tell which one the database matches.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas', '003_colour_swatches_are_hex_only.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

/**
 * The column comes back empty, which is honest: the paths it held pointed at
 * files nothing rendered, and re-inventing them would be worse than a blank.
 */
exports.down = async function down(knex) {
  await knex.raw('ALTER TABLE product_colors ADD COLUMN IF NOT EXISTS image varchar(255) NULL;');
};
