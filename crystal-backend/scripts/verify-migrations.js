'use strict';

/**
 * Does `knex migrate:latest` still build a database, from nothing?
 *
 * `schema:verify` proves sql/schema.sql is a valid file. It does NOT prove the
 * MIGRATION CHAIN works, and on this project those are two different things:
 * the init migration executes the CURRENT schema.sql, and then fourteen
 * historical deltas are replayed on top of it. Each of those was written
 * against the shape of its own day.
 *
 * Most survive that, because a delta is written to be safe to run twice -
 * IF NOT EXISTS, IF EXISTS, a guard around a trigger. What does NOT survive it
 * is a delta that names a VALUE:
 *
 *   delta 002 inserted 'MAIN' into product_images.kind as text. Delta 011 made
 *   that column an enum, so on a new machine the column is already an enum by
 *   the time delta 002 runs, and text does not go into one. It failed to
 *   parse, not to find rows.
 *
 *   delta 010 remapped faqs.category from 'ORDER' to 'ESHOP'. Delta 011 made
 *   that column an enum too, and ORDER is not one of its values - so the
 *   comparison did not return false, it raised.
 *
 * Both were invisible on every existing database, which had migrated one delta
 * at a time in the order they were written, and both meant a fresh install
 * could not be migrated at all. Nothing in the project would have caught it.
 *
 * So this builds the whole chain in a THROWAWAY schema, seeds it, and compares
 * the result column by column against what schema.sql builds on its own. The
 * two have to agree: that is the promise the init migration makes.
 *
 *   node scripts/verify-migrations.js
 *
 * It touches nothing the application uses, and drops both schemas either way.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const db = require('../src/config/db');

const BUILT = 'crystal_migrate_verify';
const REFERENCE = 'crystal_migrate_reference';
const ROOT = path.join(__dirname, '..');

/** Every column of every table, as one comparable line each. */
async function shapeOf(schema) {
  const rows = await db('information_schema.columns')
    .where('table_schema', schema)
    .select('table_name', 'column_name', 'udt_name', 'is_nullable')
    .orderBy(['table_name', 'column_name']);

  return rows
    // knex's own bookkeeping is in one and not the other, correctly.
    .filter(function (row) { return row.table_name.indexOf('knex_') !== 0; })
    .map(function (row) {
      return [row.table_name, row.column_name, row.udt_name, row.is_nullable].join(' | ');
    });
}

function run(command, args, schema) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    shell: true,
    encoding: 'utf8',
    env: Object.assign({}, process.env, { PG_SCHEMA: schema })
  });

  if (result.status !== 0) {
    const output = String(result.stdout || '') + String(result.stderr || '');
    /* The useful line is the database's, not the stack above it. */
    const reason = (output.match(/error: ([^\n]*)/) || [])[1]
      || (output.split('\n').filter(Boolean).pop() || 'no output');
    throw new Error(command + ' ' + args.join(' ') + ' failed: ' + reason);
  }
}

async function drop() {
  await db.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [BUILT]);
  await db.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [REFERENCE]);
}

async function main() {
  await drop();

  /* ---- 1. the chain, from an empty schema ---- */
  await db.raw('CREATE SCHEMA ??', [BUILT]);
  run('npx', ['knex', '--knexfile', 'src/db/knexfile.js', 'migrate:latest'], BUILT);
  run('npx', ['knex', '--knexfile', 'src/db/knexfile.js', 'seed:run'], BUILT);

  /* ---- 2. the file, on its own ---- */
  await db.raw('CREATE SCHEMA ??', [REFERENCE]);
  await db.raw('SET search_path TO ??, public', [REFERENCE]);
  await db.raw(fs.readFileSync(path.join(ROOT, 'sql', 'schema.sql'), 'utf8'));

  /* ---- 3. they have to be the same database ---- */
  const built = await shapeOf(BUILT);
  const reference = await shapeOf(REFERENCE);

  const missing = reference.filter(function (line) { return built.indexOf(line) === -1; });
  const extra = built.filter(function (line) { return reference.indexOf(line) === -1; });

  if (missing.length || extra.length) {
    console.error('the migrations and schema.sql have drifted apart:');
    missing.forEach(function (line) { console.error('  only in schema.sql:  ' + line); });
    extra.forEach(function (line) { console.error('  only in migrations:  ' + line); });
    throw new Error(missing.length + ' missing, ' + extra.length + ' unexpected');
  }

  const seeded = await db(BUILT + '.products').count({ c: '*' }).first();

  console.log('migrations build cleanly from empty: '
    + built.length + ' columns, identical to schema.sql, '
    + seeded.c + ' products seeded');
}

main()
  .then(async function () {
    await drop();
    await db.destroy();
  })
  .catch(async function (err) {
    console.error('MIGRATIONS ARE BROKEN: ' + err.message);
    try { await drop(); } catch (e) { /* best effort */ }
    await db.destroy();
    process.exit(1);
  });
