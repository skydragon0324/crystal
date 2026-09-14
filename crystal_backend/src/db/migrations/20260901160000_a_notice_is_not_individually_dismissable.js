/**
 * Delta 018, as a migration.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas',
  '018_a_notice_is_not_individually_dismissable.sql'
);

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down(knex) {
  /*
   * Back with its old default. The per-notice choice cannot be recovered - it
   * was not kept anywhere else - so every notice returns as dismissible, which
   * is the safe direction: nothing is accidentally locked open.
   */
  await knex.raw(
    'ALTER TABLE site_notices ADD COLUMN IF NOT EXISTS dismissible boolean NOT NULL DEFAULT true'
  );
};
