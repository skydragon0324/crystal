/**
 * Delta 019, as a migration.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas',
  '019_about_is_static_except_its_images.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down() {
  /*
   * There is no way back. The copy the three tables held has moved into
   * crystal-web/src/pages/about/content.js and this migration did not keep a
   * copy of it - deliberately, because two sources for the same words is how
   * they drift apart.
   *
   * Rolling back would rebuild three empty tables and ten console screens
   * with nothing to edit, which is worse than refusing.
   */
  throw new Error(
    'delta 019 cannot be rolled back: the About copy now lives in '
    + 'crystal-web/src/pages/about/content.js, not in the database'
  );
};
