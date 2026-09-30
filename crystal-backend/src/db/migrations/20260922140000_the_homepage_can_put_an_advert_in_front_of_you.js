/**
 * Delta 034, as a migration.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas',
  '034_the_homepage_can_put_an_advert_in_front_of_you.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  /*
   * Rolling this back loses the campaigns, because there is nowhere else they
   * could have come from - the table was new and nothing was moved into it.
   */
  await knex.raw(`
    DELETE FROM manager_permissions
     WHERE page_id IN (SELECT id FROM manager_pages WHERE page_url = '/admin/catalog/adverts/popup');

    DELETE FROM manager_pages WHERE page_url = '/admin/catalog/adverts/popup';

    DROP TABLE IF EXISTS site_popups;
  `);
};
