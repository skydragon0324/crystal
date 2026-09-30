'use strict';

/** The storefront footer is bundled in crystal-web. Remove the obsolete
 * editable setting and console page from existing installations. */
exports.up = async function (knex) {
  await knex('system_settings').where({ setting_key: 'site.footer' }).del();
  await knex('manager_pages').where({ page_url: '/admin/base/footer' }).del();
};

exports.down = function () {
  // Static content has no authoritative database value to restore.
  return Promise.resolve();
};
