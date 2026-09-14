/**
 * Delta 016, as a migration.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas', '016_members_carry_their_platform_login.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_users_login');
  await knex.raw('ALTER TABLE users DROP COLUMN IF EXISTS login');
};
