/**
 * Delta 002, as a migration.
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
  __dirname, '..', '..', '..', 'sql', 'deltas',
  '002_product_images_pricing_and_os_history.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

/**
 * There is no honest `down` for this one.
 *
 * The columns it drops carried values that are not recoverable - which shelf a
 * price line consumed, its bench minutes - and the os_versions link it
 * replaced with a string cannot be rebuilt from the string, because the whole
 * point is that a device's version is not a Crystal OS release. Recreating
 * empty columns of the right shape would be a rollback that reports success
 * and leaves the data gone.
 *
 * Restore from a dump instead. Rolling this back is a deliberate act, not a
 * routine one.
 */
exports.down = async function down() {
  throw new Error(
    'delta 002 cannot be rolled back - it drops columns whose values cannot be '
    + 'reconstructed. Restore from a backup taken before it ran.'
  );
};
