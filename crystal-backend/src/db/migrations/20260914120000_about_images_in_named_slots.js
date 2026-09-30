/**
 * Delta 024, as a migration.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas',
  '024_about_images_in_named_slots.sql'
);

const RETIRED = [
  'hero', 'businesses', 'growth', 'factory.floor', 'factory.line',
  'manufacturing', 'shop.interior', 'presence', 'certificate'
];

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

/*
 * Restores the retired rows. It cannot tell a row this migration retired from
 * one somebody deleted in those slots by hand beforehand, and it restores both;
 * for slots the page does not render, that is harmless.
 */
exports.down = async function down(knex) {
  await knex('about_images')
    .whereIn('slot', RETIRED)
    .where('is_deleted', true)
    .update({ is_deleted: false, updated_at: knex.fn.now() });
};
