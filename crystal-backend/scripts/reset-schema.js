'use strict';

/**
 * EMPTIES THE APPLICATION SCHEMA, for `npm run db:reset`.
 *
 *   node scripts/reset-schema.js
 *
 * `db:reset` used to begin with `knex migrate:rollback --all`, and it could
 * never have finished: six migrations refuse to roll back on purpose, because
 * the data they reshaped cannot be put back (see the `down` of
 * 20260915100000_one_carousel_for_the_technology_block.js and its five older
 * siblings). The rollback stopped at the first of them - with every newer
 * migration already undone and nothing reseeded - which leaves a development
 * database in a state no migration expects.
 *
 * A reset does not need the chain run backwards. It needs an empty schema, and
 * `npm run migrate` already builds one from nothing: `npm run migrate:verify`
 * proves exactly that on every run, in a throwaway schema. So this drops the
 * application schema and lets the migrations build it again.
 *
 * WHAT IT DROPS: the schema in PG_SCHEMA (crystal_v1), with everything in it -
 * tables, enum types, functions, and knex's own migration bookkeeping, which
 * lives there too (src/db/knexfile.js). WHAT IT LEAVES: the legacy schemas
 * (ora_pid, ora_blog and the satellites), which hold the vendor's own data and
 * which `npm run legacy:install` only ever adds to; the upload directory; and
 * the content-signing keys.
 *
 * It refuses outright in production, and refuses the `public` schema, where
 * dropping would take whatever else shares the database with it.
 */

const config = require('../src/config');
const db = require('../src/config/db');

async function main() {
  const schema = config.db.schema;

  if (config.isProduction) {
    throw new Error('refusing to drop a schema with NODE_ENV=production');
  }
  if (!schema || schema === 'public') {
    throw new Error('refusing to drop the public schema - set PG_SCHEMA to the application schema');
  }

  await db.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
  await db.raw('CREATE SCHEMA ??', [schema]);

  console.log('schema ' + schema + ' emptied (database ' + config.db.database + ') - run the migrations next');
  await db.destroy();
}

main().catch(async function (err) {
  console.error('could not reset the schema: ' + err.message);
  try { await db.destroy(); } catch (e) { /* the pool was never opened */ }
  process.exit(1);
});
