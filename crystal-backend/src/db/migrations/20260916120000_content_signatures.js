/**
 * Delta 029, as a migration.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas',
  '029_content_signatures.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  /*
   * Rolling back drops every signature, and a storefront still built to verify
   * will then show every signed item as invalid - which is correct: there is
   * nothing left to verify against. The FAQ trigger goes back to moving
   * updated_at on every update, views included.
   */
  await knex.raw(`
    DROP TRIGGER IF EXISTS trg_faqs_updated ON faqs;
    CREATE TRIGGER trg_faqs_updated
        BEFORE UPDATE ON faqs
        FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
    DROP FUNCTION IF EXISTS set_updated_at_unless_viewed();
    DROP TABLE IF EXISTS content_signatures;
  `);
};
