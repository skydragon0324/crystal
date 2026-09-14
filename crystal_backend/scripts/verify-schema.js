'use strict';

/**
 * Does sql/schema.sql actually build a database?
 *
 * It is the source of truth for the whole schema, and NOTHING routinely runs
 * it: the init migration executes it once on a fresh database, and after that
 * every change arrives as a numbered delta. So a file that has been broken -
 * a table declared twice, a statement half-edited by a script - keeps passing
 * every test in the project, because the tests run against a database that was
 * built before the damage.
 *
 * That happened: a patch script duplicated everything from the support section
 * down, and the file sat at twice its size through two commits while the API,
 * the migrations and all 73 end-to-end checks stayed green.
 *
 * So this builds the file, in a THROWAWAY schema that is dropped either way,
 * and reports what it got. It touches nothing the application uses.
 *
 *   node scripts/verify-schema.js
 */

const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');

const SCHEMA = 'crystal_schema_verify';
const SQL_FILE = path.join(__dirname, '..', 'sql', 'schema.sql');

/**
 * A table declared twice is the failure that started this, and Postgres would
 * catch it - but only after the first half had already run. Reading the file
 * first means the error names the table rather than a line number.
 */
function duplicateDeclarations(sql) {
  const seen = {};
  const dupes = [];
  const re = /^CREATE\s+(?:TABLE|VIEW|MATERIALIZED\s+VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gim;

  let match = re.exec(sql);
  while (match !== null) {
    const name = match[1].toLowerCase();
    if (seen[name]) dupes.push(name);
    seen[name] = true;
    match = re.exec(sql);
  }
  return dupes;
}

async function main() {
  const sql = fs.readFileSync(SQL_FILE, 'utf8');

  const dupes = duplicateDeclarations(sql);
  if (dupes.length) {
    throw new Error('declared more than once in schema.sql: ' + dupes.join(', '));
  }

  await db.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [SCHEMA]);
  await db.raw('CREATE SCHEMA ??', [SCHEMA]);

  try {
    // The file names no schema, so the search path decides where it lands.
    await db.raw('SET search_path TO ??', [SCHEMA]);
    await db.raw(sql);

    const tables = await db('information_schema.tables')
      .where({ table_schema: SCHEMA, table_type: 'BASE TABLE' }).count({ c: '*' }).first();
    const views = await db('information_schema.views')
      .where('table_schema', SCHEMA).count({ c: '*' }).first();

    console.log('schema.sql builds cleanly: '
      + tables.c + ' tables, ' + views.c + ' views, no duplicate declarations');
  } finally {
    await db.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [SCHEMA]);
  }
}

main()
  .then(function () { return db.destroy(); })
  .catch(async function (err) {
    console.error('schema.sql is BROKEN: ' + err.message);
    try { await db.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [SCHEMA]); } catch (e) { /* best effort */ }
    await db.destroy();
    process.exit(1);
  });
