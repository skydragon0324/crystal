/**
 * Delta 040 - a service centre is called a service centre
 * (sql/deltas/040_service_centers_are_named_service_centers.sql).
 *
 * Renames only. A database built from the CURRENT schema.sql already has
 * crm_service_center, so the delta runs only where crm_service_location is
 * still there.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '040_service_centers_are_named_service_centers.sql');

exports.up = async function up(knex) {
  const oldName = await knex.raw("SELECT to_regclass('crm_service_location') AS found");
  if (!oldName.rows[0].found) return;
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

/* A pure rename could go back, but the code that reads the old names is gone with it. */
exports.down = async function down() {
  throw new Error('040 cannot be rolled back: the application reads only the new names');
};
