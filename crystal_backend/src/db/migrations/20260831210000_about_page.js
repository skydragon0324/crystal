/**
 * Delta 014, as a migration.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '014_about_page.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  await knex.raw("DELETE FROM manager_pages WHERE page_url LIKE '/admin/company%';");
  await knex.raw('DROP TABLE IF EXISTS about_certificates CASCADE;');
  await knex.raw('DROP TABLE IF EXISTS about_items CASCADE;');
  await knex.raw('DROP TABLE IF EXISTS about_sections CASCADE;');
  await knex.raw('DROP TYPE IF EXISTS certificate_kind;');
  await knex.raw('DROP TYPE IF EXISTS about_item_kind;');
  await knex.raw('DROP TYPE IF EXISTS about_section;');
};
