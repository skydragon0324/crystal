/**
 * Delta 060, as a migration: phone numbers stored as digits only
 * (sql/deltas/060_phone_digits.sql). Not reversible: the symbols typed
 * with a number were never meaning, and are not kept.
 */
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', '..', '..', 'sql', 'deltas', '060_phone_digits.sql');

exports.up = async function up(knex) {
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));
};

exports.down = async function down() {};
