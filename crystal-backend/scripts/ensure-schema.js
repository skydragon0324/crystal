/**
 * Creates PG_SCHEMA before the knex CLI runs.
 *
 * The CLI writes its knex_migrations bookkeeping table into that schema (see
 * src/db/knexfile.js) and will not create the schema itself, so on a fresh
 * database `migrate:latest` fails with "schema does not exist" unless this
 * runs first.  It is chained into the migrate and seed npm scripts.
 */
const config = require('../src/config');
const db = require('../src/config/db');

async function main() {
  if (config.db.schema && config.db.schema !== 'public') {
    await db.raw('CREATE SCHEMA IF NOT EXISTS ??', [config.db.schema]);
    console.log('schema ready: ' + config.db.schema + ' (database ' + config.db.database + ')');
  } else {
    console.log('using the public schema');
  }
  await db.destroy();
}

main().catch(function (err) {
  console.error('could not prepare the schema: ' + err.message);
  process.exit(1);
});
