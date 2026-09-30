/**
 * Delta 035, as a migration.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas',
  '035_an_advert_can_be_a_scene.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  /*
   * Dropping the columns loses the scenes, and there is nowhere else they
   * could go: an advert that was a scene becomes an advert that is whatever
   * `file_path` holds, which is the still it was always shown beside.
   */
  await knex.raw(`
    DROP INDEX IF EXISTS idx_site_adverts_scene;
    ALTER TABLE site_adverts DROP COLUMN IF EXISTS scene;
    ALTER TABLE product_images DROP COLUMN IF EXISTS scene;
  `);
};
