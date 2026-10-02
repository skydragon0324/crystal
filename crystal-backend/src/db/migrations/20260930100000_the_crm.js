/**
 * Delta 036 - the CRM - and the console pages that open it.
 *
 * THREE STEPS, each safe to repeat:
 *
 *   1. The tables. A database built from the CURRENT schema.sql already has
 *      section 10, because the init migration ran it; replaying 036 there
 *      would fail on its first CREATE TABLE. So the delta runs only where
 *      crm_party does not exist yet - a database migrated forward from before
 *      the CRM - and both routes end with the same tables.
 *
 *   2. The pages, from the seed's canonical list, exactly as
 *      20260916110000 does it.
 *
 *   3. The grants. syncPages gives a new page its parent's level, and the
 *      parent of every CRM page is itself new, so on an existing install it
 *      would grant nothing - not even to the super administrator. Each role's
 *      level is therefore worked out from its grid in the seed, with the
 *      seed's own longest-prefix rule, and written only where the role has no
 *      row for that page yet. A grant an administrator has since changed is
 *      left alone.
 */
const fs = require('fs');
const path = require('path');

const { syncPages } = require('../syncPages');
const { PAGES, ROLES, levelFor } = require('../seeds/01_management');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '036_the_crm.sql');

const PREFIX = '/admin/crm';

function isCrmPage(url) {
  return url === PREFIX || url.indexOf(PREFIX + '/') === 0;
}

async function grantCrmPages(knex) {
  const pages = await knex('manager_pages')
    .whereIn('page_url', PAGES.map(function (row) { return row[0]; }).filter(isCrmPage))
    .select('id', 'page_url');

  const roles = await knex('manager_roles').select('id', 'role_code');
  let granted = 0;

  for (let roleIndex = 0; roleIndex < roles.length; roleIndex += 1) {
    const declared = ROLES.filter(function (role) { return role.code === roles[roleIndex].role_code; })[0];
    if (!declared) continue;

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      const level = levelFor(declared.grants, pages[pageIndex].page_url);
      if (level <= 0) continue;

      // eslint-disable-next-line no-await-in-loop
      const existing = await knex('manager_permissions')
        .where({ role_id: roles[roleIndex].id, page_id: pages[pageIndex].id }).first();
      if (existing) continue;

      // eslint-disable-next-line no-await-in-loop
      await knex('manager_permissions').insert({
        role_id: roles[roleIndex].id, page_id: pages[pageIndex].id, permission: level
      });
      granted += 1;
    }
  }

  return granted;
}

exports.up = async function up(knex) {
  const built = await knex.raw("SELECT to_regclass('crm_party') AS found");
  if (!built.rows[0].found) {
    await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
  }

  /* The one setting the CRM reads, for installs whose settings were seeded before it. */
  await knex.raw(`
    INSERT INTO system_settings (setting_key, setting_val, value_type, category, label, description, sort_order)
    SELECT 'company.native_currency_rate', '0.01', 'number', 'company',
           'Native currency to reporting currency rate',
           'Used by the CRM to add Eshop and Appstore amounts paid in native currency to Dream-wide figures.',
           COALESCE(MAX(sort_order), 0) + 10
      FROM system_settings
    HAVING NOT EXISTS (SELECT 1 FROM system_settings WHERE setting_key = 'company.native_currency_rate')
  `);

  const result = await syncPages(knex);
  if (result.added.length) {
    console.log('  registered ' + result.added.length + ' console page(s): ' + result.added.join(', '));
  }

  const granted = await grantCrmPages(knex);
  if (granted) console.log('  granted ' + granted + ' CRM page permission(s) from the role grids');
};

exports.down = async function down(knex) {
  /*
   * Everything section 10 created, found by name rather than listed: a list
   * here would be an eighty-eight line copy of the delta to keep in step.
   * CASCADE takes the foreign keys between them; no Crystal table refers to
   * a crm_ table, so nothing outside the section goes with them.
   */
  const views = await knex.raw(
    "SELECT table_name FROM information_schema.views WHERE table_schema = current_schema() AND table_name LIKE 'v\\_crm\\_%'"
  );
  const tables = await knex.raw(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' AND table_name LIKE 'crm\\_%'"
  );

  const quote = function (row) { return '"' + row.table_name + '"'; };

  if (views.rows.length) await knex.raw('DROP VIEW IF EXISTS ' + views.rows.map(quote).join(', ') + ' CASCADE');
  if (tables.rows.length) await knex.raw('DROP TABLE IF EXISTS ' + tables.rows.map(quote).join(', ') + ' CASCADE');

  await knex('system_settings').where('setting_key', 'company.native_currency_rate').del();

  await knex.raw(`
    DROP FUNCTION IF EXISTS crm_check_party_subtype() CASCADE;
    DROP FUNCTION IF EXISTS crm_check_metric_type() CASCADE;
    DROP FUNCTION IF EXISTS crm_check_point_direction() CASCADE;
    DROP SEQUENCE IF EXISTS crm_party_no_seq;
  `);

  /* The pages go too: a menu entry for tables that no longer exist is a 500. */
  const pageIds = knex('manager_pages').where('page_url', PREFIX).orWhere('page_url', 'like', PREFIX + '/%').select('id');
  await knex('manager_permissions').whereIn('page_id', pageIds).del();
  await knex('manager_roles').whereIn('default_page', pageIds).update({ default_page: null });
  await knex('manager_pages').where('page_url', 'like', PREFIX + '/%').update({ parent_id: null });
  await knex('manager_pages').where('page_url', PREFIX).orWhere('page_url', 'like', PREFIX + '/%').del();
};
