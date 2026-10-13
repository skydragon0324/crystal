/**
 * Delta 053, as a migration: the terminology screen moves under the CRM,
 * keeping every role's level on it.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '053_terminology_under_crm.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  await knex.raw(`
    UPDATE manager_pages AS page
       SET page_url = '/admin/base/terminology', parent_id = base.id
      FROM manager_pages AS base
     WHERE base.page_url = '/admin/base'
       AND page.page_url = '/admin/crm/terminology'
  `);
};
