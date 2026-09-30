'use strict';

/**
 * Footer contacts and download links are shared operational data: the web
 * storefront and native apps read the same public API document, while the
 * admin console owns it. This intentionally follows the earlier migration
 * that made the footer static; installations that already ran that migration
 * get their editor, setting, inherited permissions and API data back here.
 */

const footer = require('../../services/footer.service');
const { syncPages } = require('../syncPages');

exports.up = async function up(knex) {
  await knex('system_settings').insert({
    setting_key: footer.KEY,
    setting_val: JSON.stringify(footer.DEFAULT),
    value_type: 'json',
    category: 'site',
    label: 'Website and app footer',
    description: 'Downloads, contact numbers, support links, company details, and site buttons shared by web and apps.',
    sort_order: 0
  }).onConflict('setting_key').ignore();

  await syncPages(knex);
};

exports.down = function down() {
  /* Operational contacts may have changed after deployment. A rollback must
   * not erase that data; an older release simply leaves the rows unused. */
  return Promise.resolve();
};
