/**
 * Delta 026, as a migration.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas',
  '026_adverts_are_not_products.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  /*
   * Reversible, because the move kept everything a media row needs: the
   * smartphone adverts go back onto the SMARTPHONE category as its HERO run.
   * Homepage adverts had nowhere to come from and have nowhere to go, so a
   * rollback loses them - which is what rolling back this feature means.
   */
  await knex.raw(`
    INSERT INTO media_assets (owner_type, owner_id, purpose, device_type, file_path, alt_text, link_url, sort_order, created_at)
    SELECT 'CATEGORY', c.id, 'HERO', a.device_type, a.file_path, a.alt_text, a.link_url, a.sort_order, a.created_at
      FROM site_adverts a
      JOIN product_categories c ON c.type = 'SMARTPHONE'
     WHERE a.placement = 'SMARTPHONE' AND a.is_deleted = false;

    DELETE FROM manager_permissions
     WHERE page_id IN (SELECT id FROM manager_pages
                        WHERE page_url IN ('/admin/catalog/adverts/home', '/admin/catalog/adverts/smartphone'));

    DELETE FROM manager_pages
     WHERE page_url IN ('/admin/catalog/adverts/home', '/admin/catalog/adverts/smartphone');

    DROP TABLE IF EXISTS site_adverts;
    DROP TYPE IF EXISTS advert_placement;
  `);
};
