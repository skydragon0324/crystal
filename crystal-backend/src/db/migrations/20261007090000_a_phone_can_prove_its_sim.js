/**
 * Delta 036, as a migration.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas',
  '036_a_phone_can_prove_its_sim.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  /*
   * Rolling back loses the registered cards, and there is nowhere else they
   * could live: a phone signs in with its user ID, password and typed cid
   * again, which is exactly what it did before this delta.
   */
  await knex.raw(`
    DROP TABLE IF EXISTS login_challenges;
    DROP TABLE IF EXISTS browser_device_identities;
  `);
};
