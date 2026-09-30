/**
 * Delta 010, as a migration.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas', '010_faq_sections_and_notice_origins.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  /*
   * The FAQ topics are NOT restored: this migration mapped five topics onto
   * five systems, and the mapping is one-way - ORDER and ACCOUNT can be read
   * back out of ESHOP and CRYSTAL_APP, but WARRANTY, REPAIR and OS all became
   * SMARTPHONE and nothing in the row says which. Dropping the constraint is
   * the honest half of the reversal; inventing the topics back would be the
   * dishonest one.
   */
  await knex.raw('ALTER TABLE faqs DROP CONSTRAINT IF EXISTS chk_faqs_category;');

  await knex.raw('ALTER TABLE site_notices DROP CONSTRAINT IF EXISTS fk_site_notices_origin;');
  await knex.raw('ALTER TABLE site_notices DROP COLUMN IF EXISTS origin_id;');
  await knex.raw('DROP TABLE IF EXISTS notice_origins CASCADE;');

  await knex.raw('DROP INDEX IF EXISTS idx_site_notices_live;');
  await knex.raw(
    'CREATE INDEX idx_site_notices_live ON site_notices(status, sort_order DESC, starts_at);'
  );
};
