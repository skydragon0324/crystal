/**
 * Delta 023, as a migration.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas',
  '023_a_new_page_inherits_its_parents_grant.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down() {
  /*
   * There is no way back that means anything. This raised some roles' level
   * on one page to what their prefix grant already entitled them to; undoing
   * it would mean lowering a permission to a number this migration did not
   * record, and guessing at that is worse than refusing.
   */
  throw new Error(
    'delta 023 cannot be rolled back: it raised permissions to the level the '
    + 'role grants already implied, and did not keep the previous values'
  );
};
