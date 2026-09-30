'use strict';

/**
 * Delta 033, as a migration - and the FAQ signatures carried across it.
 *
 * The delta rewrites two fields of every FAQ's SIGNED payload: `category`
 * takes new words, and `productCategoryId` leaves the payload altogether
 * (src/security/schemas.js). Every stored signature is over the old shape, so
 * without this every answer on the storefront would read "could not be
 * verified" the moment the delta ran - and the backfill would not help, because
 * it refuses, on purpose, to re-sign anything whose signature fails.
 *
 * SO TRUST IS MOVED FORWARD, THE WAY ROTATION MOVES IT (security/maintenance.js):
 *
 *   1. before the delta, each FAQ's stored signature is checked against the
 *      payload AS IT WAS - the pre-033 field list, frozen below, because the
 *      code on disk already describes the new one;
 *   2. the delta runs;
 *   3. the rows whose signature verified are re-signed, as they are now, in
 *      this migration's transaction.
 *
 * A ROW WHOSE SIGNATURE DID NOT VERIFY IS NOT RE-SIGNED. It was changed behind
 * the console (or never signed) before this ran, and a migration that signed
 * it would put a valid signature on exactly the change somebody needs to look
 * at. It keeps its failing signature; `npm run sign:audit` names it, and a
 * person re-signs it after review with
 * `npm run sign:backfill -- --force-resign --type faq --ref <id>`.
 *
 * It needs the signing key only when there is something to carry. A fresh
 * install - `npm run migrate:verify` included - has no FAQs yet at this point
 * and never loads one. With FAQs and no key it stops with the same sentence the
 * API refuses to start with: the API cannot serve these rows without that key
 * either, so there is no configuration in which going ahead would help.
 */
const fs = require('fs');
const path = require('path');

const contentOf = require('../../security/contentOf');
const signingService = require('../../security/signingService');
const canonical = require('../../security/canonicalPayload');
const store = require('../../repositories/contentSignatures.repository');

const SQL_FILE = path.join(
  __dirname, '..', '..', '..', 'sql', 'deltas', '033_the_faq_is_filed_by_product.sql'
);

/*
 * THE PRE-033 FAQ PAYLOAD, frozen.
 *
 * Exactly what contentOf.faq built and schemas.js ordered before this change -
 * productCategoryId included, the category as the crystal_system word. A copy
 * rather than an import because the code it copies has moved on; this is the
 * one place the old bytes still need to be spelled.
 */
function preContent(row) {
  return {
    id: row.id,
    category: row.category,
    productCategoryId: row.product_category_id === undefined ? null : row.product_category_id,
    question: row.question,
    answer: row.answer,
    sortOrder: row.sort_order,
    status: row.status,
    createdAt: contentOf.time(row.created_at),
    updatedAt: contentOf.time(row.updated_at)
  };
}

function preBytes(row, v, alg, kid) {
  return Buffer.from(JSON.stringify({ v: v, type: 'faq', alg: alg, kid: kid, content: preContent(row) }), 'utf8');
}

async function hasColumn(knex, table, column) {
  const found = await knex('information_schema.columns')
    .whereRaw('table_schema = current_schema()')
    .where({ table_name: table, column_name: column })
    .first('column_name');
  return !!found;
}

/** Each FAQ with its stored signature, as pairs. Rows with no signature are left out. */
async function signedFaqs(knex) {
  const rows = await knex('faqs').select('*');
  const signatures = await store.ofType('faq', knex);

  const byRef = {};
  signatures.forEach(function (sig) { byRef[sig.content_ref] = sig; });

  return rows
    .filter(function (row) { return byRef[String(row.id)]; })
    .map(function (row) { return { row: row, sig: byRef[String(row.id)] }; });
}

/** Does a pre-033 signature still hold over the pre-033 bytes? */
function verifiesBefore(keys, row, sig) {
  const key = keys.resolve(sig.key_id);
  if (!key || key.revoked || !key.algorithm) return false;
  if (key.algorithm.name !== sig.algorithm || key.algorithm.encoding !== sig.encoding) return false;

  const value = Buffer.from(String(sig.signature || ''), 'base64');
  if (!value.length) return false;

  return key.algorithm.verify(key.publicKey, preBytes(row, sig.schema_version, sig.algorithm, sig.key_id), value);
}

exports.up = async function up(knex) {
  /* ---- 1. which signatures hold, over the shape they were made for ---- */
  const before = await hasColumn(knex, 'faqs', 'product_category_id') ? await signedFaqs(knex) : [];
  let trusted = [];

  if (before.length) {
    const svc = signingService.service();
    const keys = svc.keys();
    trusted = before
      .filter(function (pair) { return verifiesBefore(keys, pair.row, pair.sig); })
      .map(function (pair) { return pair.row.id; });
  }

  /* ---- 2. the delta ---- */
  await knex.raw(fs.readFileSync(SQL_FILE, 'utf8'));

  /* ---- 3. the ones that held, re-signed as they are now ---- */
  if (!trusted.length) return;

  const svc = signingService.service();
  const rows = await knex('faqs').whereIn('id', trusted).select('*');

  for (let i = 0; i < rows.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await svc.sign('faq', rows[i].id, contentOf.faq(rows[i]), knex);
  }

  const left = before.length - trusted.length;
  console.log('delta 033: re-signed ' + rows.length + ' FAQ(s) under the new categories'
    + (left ? '; ' + left + ' did not verify before the change and were left for `npm run sign:audit`' : ''));
};

/**
 * Back to five systems and a section - the same care, in the other direction.
 *
 * Each FAQ whose signature holds over the CURRENT payload is re-signed over the
 * pre-033 one once the columns are back, so the code of that era verifies it.
 *
 * WHAT IS APPROXIMATE: a TV, STB, COMPUTER or CAMERA answer becomes EPRODUCT
 * pinned to the first catalogue section of that kind - which is what said
 * "television" before. A SMARTPHONE answer comes back with no section, which
 * meant "every smartphone section"; the ones that named one line had that line
 * in their wording anyway.
 */
exports.down = async function down(knex) {
  const svc = signingService.service();

  const now = await signedFaqs(knex);
  let trusted = [];
  if (now.length) {
    trusted = now
      .filter(function (pair) {
        return svc.checkRow('faq', contentOf.faq(pair.row), pair.sig).status === signingService.STATUS.VALID;
      })
      .map(function (pair) { return pair.row.id; });
  }

  await knex.raw(`
    DO $$
    BEGIN
        CREATE TYPE crystal_system AS ENUM ('SMARTPHONE', 'EPRODUCT', 'ESHOP', 'APPSTORE', 'CRYSTAL_APP');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    DO $$
    DECLARE
        view_sql     text;
        view_comment text;
    BEGIN
        IF to_regclass('v_faq_signatures') IS NOT NULL THEN
            view_sql := pg_get_viewdef(to_regclass('v_faq_signatures'), true);
            view_comment := obj_description(to_regclass('v_faq_signatures'), 'pg_class');
            EXECUTE 'DROP VIEW v_faq_signatures';
        END IF;

        ALTER TABLE faqs ADD COLUMN IF NOT EXISTS product_category_id integer NULL
            REFERENCES product_categories(id) ON DELETE SET NULL;
        ALTER TABLE faqs ALTER COLUMN category TYPE varchar(20) USING category::text;

        UPDATE faqs f
           SET product_category_id = (SELECT c.id FROM product_categories c
                                       WHERE c.type::text = f.category ORDER BY c.id LIMIT 1),
               category = 'EPRODUCT'
         WHERE f.category IN ('TV', 'STB', 'COMPUTER', 'CAMERA');

        ALTER TABLE faqs ALTER COLUMN category TYPE crystal_system USING category::crystal_system;

        IF view_sql IS NOT NULL THEN
            EXECUTE 'CREATE VIEW v_faq_signatures AS ' || view_sql;
            IF view_comment IS NOT NULL THEN
                EXECUTE format('COMMENT ON VIEW v_faq_signatures IS %L', view_comment);
            END IF;
        END IF;
    END $$;

    DROP TYPE IF EXISTS faq_category;

    COMMENT ON COLUMN faqs.product_category_id IS
      'which storefront catalogue section, one level finer than the category above
       and only meaningful under SMARTPHONE and EPRODUCT; NULL applies to all';
  `);

  if (!trusted.length) return;

  /*
   * Signed over the pre-033 bytes with the active key, by hand: the signing
   * service on disk builds the post-033 payload and cannot be asked for the
   * old one. Checked against the public key before it is stored, as
   * signContent checks its own.
   */
  const active = svc.keys().active();
  const rows = await knex('faqs').whereIn('id', trusted).select('*');

  for (let i = 0; i < rows.length; i += 1) {
    const bytes = preBytes(rows[i], 1, active.algorithm.name, active.keyId);
    const value = active.algorithm.sign(active.privateKey, bytes);
    if (!active.algorithm.verify(active.publicKey, bytes, value)) {
      throw new Error('a signature made with "' + active.keyId + '" did not verify against its own public key');
    }

    // eslint-disable-next-line no-await-in-loop
    await store.upsert({
      content_type: 'faq',
      content_ref: String(rows[i].id),
      schema_version: 1,
      algorithm: active.algorithm.name,
      key_id: active.keyId,
      encoding: active.algorithm.encoding,
      signature: value.toString('base64'),
      payload_sha256: canonical.payloadSha256(bytes),
      signed_at: new Date()
    }, knex);
  }
};
