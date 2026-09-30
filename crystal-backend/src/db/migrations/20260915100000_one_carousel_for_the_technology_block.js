/**
 * Delta 025, as a migration.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas',
  '025_one_carousel_for_the_technology_block.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down() {
  /*
   * There is no way back that means anything: the rows were merged into one
   * slot and the slot each came from was not kept. Guessing it from the sort
   * offset would be a guess.
   */
  throw new Error(
    'delta 025 cannot be rolled back: certificates were merged into one slot '
    + 'and the per-technology slot each came from was not recorded'
  );
};
