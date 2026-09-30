'use strict';

/**
 * PostgreSQL's date-time type is timestamp/timestamptz; `(0)` gives business
 * scheduling fields whole-second precision instead of retaining fractional
 * seconds supplied by a JavaScript Date.
 */
exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE site_notices
      ALTER COLUMN starts_at TYPE timestamptz(0),
      ALTER COLUMN ends_at TYPE timestamptz(0)
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE site_notices
      ALTER COLUMN starts_at TYPE timestamptz,
      ALTER COLUMN ends_at TYPE timestamptz
  `);
};
