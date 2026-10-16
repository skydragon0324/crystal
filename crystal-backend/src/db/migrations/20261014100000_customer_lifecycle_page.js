/**
 * Delta 055 - the Customer Lifecycle KPIs page and its permission
 * (sql/deltas/055_customer_lifecycle_page.sql).
 *
 * The delta is written to run twice, so it also runs on a database built from
 * the current schema.sql.
 *
 * `down` removes the page, and with it any grant a role was given on it -
 * `manager_permissions.page_id` references it. That is the correct behaviour
 * for a rollback: a grant on a page that no longer exists would be a
 * permission nobody could see or revoke.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas', '055_customer_lifecycle_page.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  await knex('manager_pages').where('page_url', '/admin/crm/lifecycle').del();
};
