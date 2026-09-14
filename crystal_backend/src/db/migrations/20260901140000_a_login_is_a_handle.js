/**
 * Delta 017, as a migration.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas', '017_a_login_is_a_handle.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  /*
   * Narrowing back would refuse every member who has only a login, so the rows
   * are checked rather than the constraint being forced on and left broken.
   */
  const row = await knex('users')
    .whereNull('email').whereNull('phone').count({ c: '*' }).first();

  if (Number(row.c) > 0) {
    throw new Error(row.c + ' members have only a login and would violate the old constraint');
  }

  await knex.raw('ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_user_has_a_handle');
  await knex.raw(
    'ALTER TABLE users ADD CONSTRAINT chk_user_has_a_handle '
    + 'CHECK (email IS NOT NULL OR phone IS NOT NULL)'
  );
};
