/**
 * Delta 050 - a project's role in customer identity (ESHOP, USER_MANAGEMENT)
 * is chosen in Settings instead of being fixed by its code
 * (sql/deltas/050_project_identity_role.sql).
 *
 * The delta is written to run twice, so it also runs on a database built from
 * the current schema.sql.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '050_project_identity_role.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down() {
  throw new Error('050 cannot be rolled back automatically; restore a backup if needed.');
};
