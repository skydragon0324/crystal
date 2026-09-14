/**
 * Emit sql_pg/seed_mock_data.sql from mock/fixtures.js.
 *
 *   node mock/generate_seed_sql.js
 *
 * Generating the seed rather than hand-writing it means the database and
 * the mock API serve the same rows. Two hand-maintained copies of the same
 * fixture drift within a week, and then "it works against the mock but not
 * the database" becomes a bug hunt instead of a diff.
 *
 * Column lists follow sql_pg/*.sql. Where the schema is narrower than the
 * fixture (phone_accessories.resource_price is NUMERIC(6,2)) the fixture
 * was adjusted to fit, not the seed, so both sides still agree.
 */
const fs = require('fs');
const path = require('path');
const F = require('./fixtures');

/* ---------- SQL literal helpers ---------- */

const q = (value) => {
  if (value === null || value === undefined) return 'NULL';
  return "'" + String(value).replace(/'/g, "''") + "'";
};

const n = (value) => {
  if (value === null || value === undefined || value === '') return 'NULL';
  return String(value);
};

const ts = (value) => (value ? q(value) + '::timestamp' : 'NULL');

/**
 * One INSERT ... VALUES statement with all rows in a single tuple list.
 *
 * `onConflict` appends a conflict clause, for the tables whose rows
 * cannot simply be deleted and reinserted on a reload.
 */
function insert(table, columns, rows, toValues, onConflict) {
  if (!rows.length) return '';
  const tuples = rows.map((row) => '  (' + toValues(row).join(', ') + ')');
  return (
    'INSERT INTO ' + table + ' (' + columns.join(', ') + ') VALUES\n' +
    tuples.join(',\n') + (onConflict ? '\n' + onConflict : '') + ';\n'
  );
}

const out = [];
const say = (line) => out.push(line);

say(`-- =====================================================================
-- seed_mock_data.sql - fixture data for the vendor site
--
-- GENERATED FILE. Do not edit by hand.
--   Source:    mock/fixtures.js
--   Generator: node mock/generate_seed_sql.js
--
-- These are the same rows the mock API serves with USE_MOCK=true, so a
-- page behaves identically against either.
--
-- Prerequisites: run sql_pg/00_compat.sql and the numbered schema files
-- first. This file only inserts rows.
--
-- Schema: models/ qualify every table as "ora_pid.<table>", so the tables
-- have to live in a schema called ora_pid. The search_path below points
-- there and falls back to public. Adjust if your deployment differs.
--
-- Re-runnable: every statement is preceded by a DELETE of the rows it
-- inserts, so running this twice leaves the same state as running it once.
-- It touches ONLY the pk ranges used below and will not disturb real data,
-- but do not run it against production.
-- =====================================================================

SET search_path TO ora_pid, public;

BEGIN;
`);

/* ---------- clean out previous runs, children before parents ---------- */

say(`-- ---------------------------------------------------------------
-- Remove any previous seed. Ordered children-first so the foreign
-- keys never block the delete.
-- ---------------------------------------------------------------
DELETE FROM phone_changelog     WHERE product_pk BETWEEN 101 AND 199;
DELETE FROM phone_accessories   WHERE product_pk BETWEEN 101 AND 199;
DELETE FROM product_models      WHERE product_pk BETWEEN 101 AND 199;
DELETE FROM product_spec_values WHERE product_pk BETWEEN 101 AND 199;
DELETE FROM product_spec_orders WHERE root_pk = ${F.ROOT_CATEGORY.category_pk};
DELETE FROM product_images      WHERE product_pk BETWEEN 101 AND 199;
DELETE FROM products            WHERE product_pk BETWEEN 101 AND 199;
DELETE FROM product_spec_keys   WHERE spec_pk BETWEEN 1 AND 99;
DELETE FROM product_categories  WHERE category_pk IN (${[F.ROOT_CATEGORY.category_pk].concat(F.CATEGORIES.map((c) => c.category_pk)).join(', ')});
DELETE FROM faqs                WHERE faq_pk BETWEEN 1 AND 999;
DELETE FROM phone_agencies      WHERE agency_pk BETWEEN 1 AND 999;
-- users and locations are deliberately absent: both are upserted
-- further down instead. See the comment on the users INSERT.
DELETE FROM managers            WHERE manager_pk = 1;
`);

/* ---------- locations ---------- */

say(`
-- ---------------------------------------------------------------
-- Locations (provinces).
--
-- parent_code is the STRING '0' for a top-level region, not NULL:
-- userModel.findProvinces filters on .where("loc.parent_code", "0"),
-- so a NULL here means /vendor/api/provinces answers 200 with an empty
-- list and every province dropdown on the site is blank.
--
-- Upserted for the same reason as users, which references it through
-- users.location_pk.
-- ---------------------------------------------------------------`);
say(insert(
  'locations',
  ['location_pk', 'location_name', 'location_code', 'parent_code', 'position'],
  F.PROVINCES,
  (row, i) => [n(row.location_pk), q(row.location_name), q(row.location_code), q('0'), n(row.location_pk)],
  `ON CONFLICT (location_pk) DO UPDATE SET
  location_name = EXCLUDED.location_name,
  location_code = EXCLUDED.location_code,
  parent_code   = EXCLUDED.parent_code,
  position      = EXCLUDED.position`
));

/* ---------- managers ---------- */

say(`
-- ---------------------------------------------------------------
-- One manager. faqs.created_by is a NOT NULL foreign key onto this
-- table, so the FAQ rows below cannot be inserted without it.
-- Password is MD5('1234').
-- ---------------------------------------------------------------`);
say(insert(
  'managers',
  ['manager_pk', 'manager_id', 'manager_name', 'password', 'role_pk'],
  [{ manager_pk: 1, manager_id: 'seedadmin', manager_name: 'Seed Administrator', password: '81dc9bdb52d04dc20036dbd8313ed055' }],
  (row) => [n(row.manager_pk), q(row.manager_id), q(row.manager_name), q(row.password), 'NULL']
));

/* ---------- users ---------- */

say(`
-- ---------------------------------------------------------------
-- Users. Passwords are stored as the MD5 the client posts:
--   demo    / 1234
--   tester  / 123456
--   fixed01 / 1234
-- gender is CHAR(1) constrained to 'M' or 'F'.
--
-- Upserted rather than deleted and reinserted. Almost every table in the
-- account area is a child of users, so once seed_mock_account.sql has
-- run, a DELETE here fails on whichever foreign key it meets first -
-- and listing them all would mean this file had to be edited every time
-- the account seed grew a table.
-- ---------------------------------------------------------------`);
say(insert(
  'users',
  ['user_pk', 'user_id', 'password', 'user_name', 'gender', 'birthday', 'location_pk', 'cid', 'status', 'locked', 'created_at'],
  F.USERS,
  (row) => [
    n(row.user_pk), q(row.user_id), q(row.password), q(row.user_name),
    q(row.gender === 1 ? 'M' : 'F'), ts(row.birthday + ' 00:00:00'),
    n(F.PROVINCES[row.user_pk % F.PROVINCES.length].location_pk),
    q(row.cid), n(row.status), '0', ts(row.created_at),
  ],
  `ON CONFLICT (user_pk) DO UPDATE SET
  user_id     = EXCLUDED.user_id,
  password    = EXCLUDED.password,
  user_name   = EXCLUDED.user_name,
  gender      = EXCLUDED.gender,
  birthday    = EXCLUDED.birthday,
  location_pk = EXCLUDED.location_pk,
  cid         = EXCLUDED.cid,
  status      = EXCLUDED.status,
  locked      = EXCLUDED.locked`
));

/* ---------- product categories ---------- */

say(`
-- ---------------------------------------------------------------
-- Product categories.
--
-- productModel.findProductPhonesForWeb joins products.root_pk to the
-- category whose parent_pk = 0 and whose category_name is exactly the
-- PRODUCT_CATEGORY_PHONE string from lang/en.js. Rename the root and the
-- product list on the site goes empty with no error anywhere.
-- ---------------------------------------------------------------`);
say(insert(
  'product_categories',
  ['category_pk', 'category_name', 'node_value', 'parent_pk', 'position', 'is_leaf', 'is_deleted'],
  [F.ROOT_CATEGORY].concat(F.CATEGORIES),
  (row) => [
    n(row.category_pk), q(row.category_name), q(String(row.category_pk)),
    n(row.parent_pk || 0), n(row.position),
    row.parent_pk ? '1' : '0', '0',
  ]
));

/* ---------- products ---------- */

say(`
-- ---------------------------------------------------------------
-- Products. status = 1 (SYNC_STATUS.APPROVED) and is_deleted = 0
-- (FLAG_EXIST) are both required by the web query.
-- price = -1 is the "price on request" sentinel the grid renders as "--".
-- ---------------------------------------------------------------`);
say(insert(
  'products',
  ['product_pk', 'product_name', 'simple_name', 'category_pk', 'root_pk', 'image_url', 'price', 'position', 'is_new', 'is_deleted', 'status', 'created_at'],
  F.PRODUCTS,
  (row) => [
    n(row.product_pk), q(row.product_name), q(row.model_name),
    n(row.category_pk), n(row.root_pk), q(row.image_url),
    n(row.price), n(row.position), row.position === 1 ? '1' : '0',
    '0', '1', ts(row.created_at),
  ]
));

/* ---------- product images ---------- */

say(`
-- ---------------------------------------------------------------
-- Product images. image_type 0 = main (the hero on the spec tab),
-- 1 = intro (the gallery). status = 1 so the client filter passes.
-- ---------------------------------------------------------------`);
say(insert(
  'product_images',
  ['table_pk', 'product_pk', 'image_type', 'image_url', 'image_ratio', 'position', 'is_deleted', 'status'],
  F.PRODUCT_IMAGES,
  (row) => [
    n(row.table_pk), n(row.product_pk), n(row.image_type), q(row.image_url),
    '1.0000', n(row.position), '0', '1',
  ]
));

/* ---------- spec keys / orders / values ---------- */

// Spec keys are global; the fixture repeats the same list per product, so
// dedupe on spec_key_pk to get the distinct key set.
const specKeys = [];
const seenKeys = new Set();
for (const spec of F.PRODUCT_SPECS) {
  if (seenKeys.has(spec.spec_key_pk)) continue;
  seenKeys.add(spec.spec_key_pk);
  specKeys.push({ spec_pk: spec.spec_key_pk, spec_name: spec.spec_name, position: spec.position });
}

say(`
-- ---------------------------------------------------------------
-- Spec keys are shared across products; the per-product text lives in
-- product_spec_values. spec_type 0 = plain string, which is the only
-- type the client spec table renders.
-- ---------------------------------------------------------------`);
say(insert(
  'product_spec_keys',
  ['spec_pk', 'spec_name', 'spec_type', 'is_deleted'],
  specKeys,
  (row) => [n(row.spec_pk), q(row.spec_name), '0', '0']
));

say(`
-- ---------------------------------------------------------------
-- Spec ordering, per root category. findSpecKeyAndValues drives the
-- whole spec table off this table, left-joining the values - so a key
-- missing from here never appears, however many values it has.
-- ---------------------------------------------------------------`);
say(insert(
  'product_spec_orders',
  ['table_pk', 'root_pk', 'spec_pk', 'position', 'is_deleted'],
  specKeys,
  (row) => [n(row.spec_pk), n(F.ROOT_CATEGORY.category_pk), n(row.spec_pk), n(row.position), '0']
));

say(`
-- ---------------------------------------------------------------
-- Spec values, unique per (product_pk, spec_pk).
-- ---------------------------------------------------------------`);
say(insert(
  'product_spec_values',
  ['table_pk', 'product_pk', 'spec_pk', 'spec_value', 'position'],
  F.PRODUCT_SPECS,
  (row) => [n(row.spec_pk), n(row.product_pk), n(row.spec_key_pk), q(row.spec_value), n(row.position)]
));

/* ---------- product models ---------- */

say(`
-- ---------------------------------------------------------------
-- Product models, one per product (the column is UNIQUE).
-- ---------------------------------------------------------------`);
say(insert(
  'product_models',
  ['model_pk', 'product_pk', 'model_name', 'reservable', 'is_deleted', 'created_by'],
  F.PRODUCTS,
  (row) => [n(row.product_pk), n(row.product_pk), q(row.model_name), '0', '0', '1']
));

/* ---------- accessories ---------- */

say(`
-- ---------------------------------------------------------------
-- Service / accessory pricing.
-- resource_price and service_price are NUMERIC(6,2), so 9999.99 is the
-- ceiling - the fixture values are scaled to fit and the client's
-- formatPrice handles the display.
-- ---------------------------------------------------------------`);
say(insert(
  'phone_accessories',
  ['accessory_pk', 'product_pk', 'product_name', 'accessory_name', 'resource_price', 'service_price', 'allow_num', 'is_deleted', 'created_at'],
  F.ACCESSORIES,
  (row) => {
    const product = F.PRODUCTS.find((p) => p.product_pk === row.product_pk);
    return [
      n(row.accessory_pk), n(row.product_pk), q(product ? product.model_name : ''),
      q(row.accessory_name), n(row.resource_price.toFixed(2)), n(row.service_price.toFixed(2)),
      q(row.allow_num), '0', ts(row.created_at),
    ];
  }
));

/* ---------- changelog ---------- */

say(`
-- ---------------------------------------------------------------
-- OS changelog per product.
-- ---------------------------------------------------------------`);
say(insert(
  'phone_changelog',
  ['table_pk', 'product_pk', 'product_name', 'title', 'content', 'publish_num', 'position', 'is_deleted', 'created_at'],
  F.CHANGELOGS,
  (row) => {
    const product = F.PRODUCTS.find((p) => p.product_pk === row.product_pk);
    return [
      n(row.table_pk), n(row.product_pk), q(product ? product.model_name : ''),
      q(row.title), q(row.content), q(row.publish_num), n(row.position), '0', ts(row.created_at),
    ];
  }
));

/* ---------- agencies ---------- */

say(`
-- ---------------------------------------------------------------
-- Service agencies.
-- The business column is a positional flag string read by index on the client:
-- 0 = OS, 1 = Repair, 2 = Insurance, 3 = Change. It must stay exactly
-- four characters of '0'/'1'.
-- ---------------------------------------------------------------`);
say(insert(
  'phone_agencies',
  ['agency_pk', 'agency_name', 'phone_numbers', 'business', 'location_pk', 'location_more', 'agency_rating', 'is_deleted', 'created_at'],
  F.AGENCIES,
  (row) => [
    n(row.agency_pk), q(row.agency_name), q(row.phone_numbers), q(row.business),
    n(row.location_pk), q(row.address), n(row.agency_rating.toFixed(2)), '0', ts(row.created_at),
  ]
));

/* ---------- faqs ---------- */

say(`
-- ---------------------------------------------------------------
-- FAQs. category = 1 is FAQ_CATEGORY.PHONE, which is what the vendor
-- site's /phone_faqs endpoint filters on.
-- ---------------------------------------------------------------`);
say(insert(
  'faqs',
  ['faq_pk', 'question', 'answer', 'category', 'position', 'is_deleted', 'created_by', 'created_at'],
  F.FAQ_ROWS,
  (row) => [
    n(row.faq_pk), q(row.question), q(row.answer), '1',
    n(row.position), '0', '1', ts(row.created_at),
  ]
));

/* ---------- sequence fix-up ---------- */

say(`
-- ---------------------------------------------------------------
-- Explicit pks were supplied above, which leaves every sequence behind
-- the data. Without this the next application insert collides on the
-- primary key. setval is guarded so a missing sequence is skipped
-- rather than aborting the transaction.
-- ---------------------------------------------------------------
DO $seed$
DECLARE
  pair    RECORD;
  seq_min BIGINT;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('locations_s',           'locations',           'location_pk'),
      ('managers_s',            'managers',            'manager_pk'),
      ('users_s',               'users',               'user_pk'),
      ('product_categories_s',  'product_categories',  'category_pk'),
      ('products_s',            'products',            'product_pk'),
      ('product_images_s',      'product_images',      'table_pk'),
      ('product_spec_keys_s',   'product_spec_keys',   'spec_pk'),
      ('product_spec_orders_s', 'product_spec_orders', 'table_pk'),
      ('product_spec_values_s', 'product_spec_values', 'table_pk'),
      ('product_models_s',      'product_models',      'model_pk'),
      ('phone_accessories_s',   'phone_accessories',   'accessory_pk'),
      ('phone_changelog_s',     'phone_changelog',     'table_pk'),
      ('phone_agencies_s',      'phone_agencies',      'agency_pk'),
      ('faqs_s',                'faqs',                'faq_pk')
    ) AS t(seq, tbl, col)
  LOOP
    IF to_regclass(pair.seq) IS NOT NULL AND to_regclass(pair.tbl) IS NOT NULL THEN
      -- Clamp to the sequence's OWN minimum, not to 1. Several of these
      -- sequences start at 1000 to leave room below for reserved rows,
      -- and setval rejects a value under MINVALUE outright - which
      -- aborted the whole seed at the very last statement, after every
      -- insert had already run.
      SELECT min_value INTO seq_min
        FROM pg_sequences
       WHERE schemaname || '.' || sequencename = pair.seq
          OR (sequencename = pair.seq AND schemaname = current_schema());

      EXECUTE format(
        'SELECT setval(%L, GREATEST((SELECT COALESCE(MAX(%I), 0) FROM %I), %s))',
        pair.seq, pair.col, pair.tbl, COALESCE(seq_min, 1)
      );
    END IF;
  END LOOP;
END
$seed$;

COMMIT;

-- ---------------------------------------------------------------
-- Row counts, for a quick check that the load did what it should.
-- ---------------------------------------------------------------
SELECT 'locations'          AS table_name, COUNT(*) AS rows FROM locations
UNION ALL SELECT 'users',               COUNT(*) FROM users
UNION ALL SELECT 'product_categories',  COUNT(*) FROM product_categories
UNION ALL SELECT 'products',            COUNT(*) FROM products
UNION ALL SELECT 'product_images',      COUNT(*) FROM product_images
UNION ALL SELECT 'product_spec_keys',   COUNT(*) FROM product_spec_keys
UNION ALL SELECT 'product_spec_orders', COUNT(*) FROM product_spec_orders
UNION ALL SELECT 'product_spec_values', COUNT(*) FROM product_spec_values
UNION ALL SELECT 'product_models',      COUNT(*) FROM product_models
UNION ALL SELECT 'phone_accessories',   COUNT(*) FROM phone_accessories
UNION ALL SELECT 'phone_changelog',     COUNT(*) FROM phone_changelog
UNION ALL SELECT 'phone_agencies',      COUNT(*) FROM phone_agencies
UNION ALL SELECT 'faqs',                COUNT(*) FROM faqs;
`);

const target = path.join(__dirname, '..', 'sql_pg', 'seed_mock_data.sql');
fs.writeFileSync(target, out.join('\n'));

console.log('wrote ' + target);
console.log(
  '  locations %d, users %d, categories %d, products %d, images %d,\n' +
  '  spec keys %d, spec values %d, accessories %d, changelog %d,\n' +
  '  agencies %d, faqs %d',
  F.PROVINCES.length, F.USERS.length, F.CATEGORIES.length + 1, F.PRODUCTS.length,
  F.PRODUCT_IMAGES.length, specKeys.length, F.PRODUCT_SPECS.length,
  F.ACCESSORIES.length, F.CHANGELOGS.length, F.AGENCIES.length, F.FAQ_ROWS.length
);
