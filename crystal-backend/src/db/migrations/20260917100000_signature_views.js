/**
 * Delta 030, as a migration.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas',
  '030_signature_views.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  /*
   * Rolling back loses every recorded audit verdict and nothing else: the
   * signatures stay, and the storefront never read these columns. The views
   * go first, because they depend on the columns.
   *
   * Code that records verdicts - `npm run sign:audit` and the nightly sweep -
   * fails against a database without the columns (the script exits 2, the
   * sweep logs it and carries on), so roll the code back with the migration,
   * or migrate forward again.
   */
  await knex.raw(`
    DROP VIEW IF EXISTS
      v_notice_signatures, v_faq_signatures, v_advert_signatures,
      v_product_image_signatures, v_image_signatures;
    ALTER TABLE content_signatures
      DROP COLUMN IF EXISTS audit_status,
      DROP COLUMN IF EXISTS audit_reason,
      DROP COLUMN IF EXISTS audited_at;
  `);
};
