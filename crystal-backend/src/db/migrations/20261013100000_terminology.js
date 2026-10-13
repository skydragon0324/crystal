/**
 * Delta 052, as a migration: the terminology table, and its console page
 * registered from the seed's page list (granted at the Base group's level,
 * as every newly synced page is).
 */
const fs = require('fs');
const path = require('path');
const { syncPages } = require('../syncPages');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '052_terminology.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
  await syncPages(knex);
};

exports.down = async function down(knex) {
  await knex.raw('DROP TABLE IF EXISTS terms CASCADE;');
};
