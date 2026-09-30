/**
 * Delta 027, as a migration.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas',
  '027_points_are_not_whole_numbers.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  /*
   * NARROWING LOSES DATA, and it does it silently: numeric -> integer rounds
   * every fractional amount on the way back, and the balance it rounds to no
   * longer agrees with the ledger it came from.
   *
   * The rollback is written anyway, because a chain with a hole in it cannot
   * be rolled back past this point at all - but it rounds, and a database
   * that held fractional points does not come back the way it went in.
   */
  await knex.raw(`
    ALTER TABLE point_logs ALTER COLUMN amount        TYPE integer USING ROUND(amount);
    ALTER TABLE point_logs ALTER COLUMN balance_after TYPE integer USING ROUND(balance_after);
    ALTER TABLE wallets    ALTER COLUMN point_balance TYPE integer USING ROUND(point_balance);
    ALTER TABLE wallets    ALTER COLUMN point_balance SET DEFAULT 0;
  `);
};
