/**
 * Delta 006, as a migration. Executes the file from sql/deltas rather than
 * describing the change with knex's schema builder.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '006_media_link_url.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  await knex.raw('ALTER TABLE media_assets DROP COLUMN IF EXISTS link_url;');
};
