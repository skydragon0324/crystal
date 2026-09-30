'use strict';

/**
 * Delta 032, as a migration - and the console screen it needs.
 *
 * The SQL lives in sql/deltas, like every delta's. The screen does not: a new
 * page is registered by syncPages from the canonical list in
 * seeds/01_management.js, which is the only list of console pages there is
 * (see src/db/syncPages.js). /admin/support/provinces is added there, and this
 * brings a migrated database up to it with the grants its parent already has.
 */
const fs = require('fs');
const path = require('path');
const { syncPages } = require('../syncPages');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas',
  '032_centres_have_an_order_several_numbers_and_a_landmark.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
  await syncPages(knex);
};

/**
 * Back to one phone column, no order and no landmark - WITH LOSSES, stated.
 *
 * What comes back: agencies.phone, holding each centre's FIRST number (the
 * one its card led with), and province as plain text again.
 *
 * What does not: every other number and every label, the display order, the
 * landmarks, and the province order - the tables and columns that held them
 * are dropped. That is the honest shape of a rollback here; the alternative,
 * joining the numbers back into one string, would overflow a varchar(40) on
 * exactly the centres that had the most of them.
 */
exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE agencies ADD COLUMN IF NOT EXISTS phone varchar(40) NULL;

    UPDATE agencies a
       SET phone = first.phone
      FROM (
            SELECT DISTINCT ON (p.agency_id) p.agency_id, p.phone
              FROM agency_phones p
             ORDER BY p.agency_id, p.sort_order, p.id
           ) first
     WHERE first.agency_id = a.id;

    DROP TABLE IF EXISTS agency_phones;

    DROP INDEX IF EXISTS idx_agencies_order;
    ALTER TABLE agencies DROP COLUMN IF EXISTS sort_order;
    ALTER TABLE agencies DROP COLUMN IF EXISTS landmark;

    ALTER TABLE agencies DROP CONSTRAINT IF EXISTS fk_agencies_province;
    DROP TABLE IF EXISTS provinces;

    -- The screen, and every grant on it: manager_permissions references the
    -- page ON DELETE CASCADE.
    DELETE FROM manager_pages WHERE page_url = '/admin/support/provinces';
  `);
};
