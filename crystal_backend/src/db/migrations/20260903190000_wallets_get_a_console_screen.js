/**
 * Delta 021, as a migration.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas',
  '021_wallets_get_a_console_screen.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  /*
   * Reversible, unlike most of these, because it added no data of its own -
   * a page row and the read grants that follow from it.
   *
   * The permissions go with the page whether this deletes them or not:
   * manager_permissions.page_id is ON DELETE CASCADE. They are named here
   * anyway, because a rollback that relies on a foreign key doing the second
   * half of its job reads as though it forgot.
   */
  await knex.raw(`
    DELETE FROM manager_permissions
     WHERE page_id IN (SELECT id FROM manager_pages WHERE page_url = '/admin/members/wallets');

    DELETE FROM manager_pages WHERE page_url = '/admin/members/wallets';
  `);
};
