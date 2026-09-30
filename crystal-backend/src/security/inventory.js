'use strict';

const fs = require('fs');
const path = require('path');

const contentOf = require('./contentOf');
const imageFile = require('./imageFile');

/**
 * EVERYTHING THAT IS, OR SHOULD BE, SIGNED - as it stands right now.
 *
 * The audit and the backfill both start here, so "what the audit checks" and
 * "what the backfill signs" cannot be two different lists. Each lister answers
 *
 *   [{ ref, content, problem, referenced }]
 *
 * with `content` built from the CURRENT row or file through contentOf.js - the
 * same functions the write paths sign with and the storefront replies are
 * built from - or null with the `problem` that stopped it.
 *
 * SOFT-DELETED ROWS ARE INCLUDED. A notice in the recycle bin keeps its
 * signature (a restore is refused if it no longer matches), so it is audited
 * like any other.
 *
 * `db` is a knex handle for Crystal's own tables - the pool, or the handle a
 * seed was given, which is how a seed run against a throwaway schema audits
 * and signs that schema.
 */

/*
 * EVERY COLUMN THAT HOLDS AN UPLOAD PATH - the same list
 * scripts/generate-mock-images.js draws placeholders for. A path that is not a
 * plain /uploads/... key (an absolute URL, an empty string) is not signable
 * and is left out rather than reported.
 */
const IMAGE_COLUMNS = [
  ['products', ['main_image', 'main_image_mobile']],
  ['product_series', ['banner_image', 'banner_image_mobile']],
  ['product_accessories', ['image']],
  ['product_categories', ['icon']],
  ['media_assets', ['file_path']],
  ['site_adverts', ['file_path']],
  ['product_images', ['file_path']],
  ['articles', ['cover_image', 'cover_image_mobile']],
  ['os_versions', ['cover_image']]
];

function built(ref, build, row) {
  try {
    return { ref: String(ref), content: build(row), problem: null, referenced: true };
  } catch (err) {
    return { ref: String(ref), content: null, problem: 'the row does not fit the schema: ' + err.message, referenced: true };
  }
}

async function notifications(db) {
  const rows = await db('site_notices').orderBy('id');
  return rows.map(function (row) { return built(row.id, contentOf.notification, row); });
}

async function faqs(db) {
  const rows = await db('faqs').orderBy('id');
  return rows.map(function (row) { return built(row.id, contentOf.faq, row); });
}

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    return [];
  }

  return entries.reduce(function (out, entry) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return out.concat(walk(full));
    return entry.isFile() ? out.concat([full]) : out;
  }, []);
}

/** Every storage key the database mentions. */
async function referencedImageKeys(db) {
  const keys = {};

  for (let i = 0; i < IMAGE_COLUMNS.length; i += 1) {
    const table = IMAGE_COLUMNS[i][0];
    const columns = IMAGE_COLUMNS[i][1];
    // eslint-disable-next-line no-await-in-loop
    const rows = await db(table).select(columns);
    rows.forEach(function (row) {
      columns.forEach(function (column) {
        if (!imageFile.storageKeyProblem(row[column])) keys[row[column]] = true;
      });
    });
  }

  return keys;
}

/**
 * Every image: the files on disk, the paths the database references, and the
 * paths that already have a signature - one entry per storage key.
 *
 * A file that is not an image (a PDF on the document route, a .gitkeep) is
 * dropped unless something signed or references it. A referenced or signed
 * path with no file is kept with problem 'missing'.
 */
async function images(db, uploadDir, signedKeys) {
  const referenced = await referencedImageKeys(db);
  const signed = {};
  (signedKeys || []).forEach(function (key) { signed[key] = true; });
  const keys = {};

  walk(uploadDir).forEach(function (file) {
    const key = imageFile.storageKeyFor(file, uploadDir);
    if (key) keys[key] = true;
  });
  Object.keys(referenced).forEach(function (key) { keys[key] = true; });
  Object.keys(signed).forEach(function (key) { keys[key] = true; });

  const out = [];
  const list = Object.keys(keys).sort();

  for (let i = 0; i < list.length; i += 1) {
    const key = list[i];
    const known = !!referenced[key] || !!signed[key];

    try {
      // eslint-disable-next-line no-await-in-loop
      const described = await imageFile.describe(key, uploadDir);
      out.push({ ref: key, content: contentOf.image(described), problem: null, referenced: !!referenced[key] });
    } catch (err) {
      if (err.code === 'not-an-image' && !known) continue;
      if (!err.code) throw err;
      out.push({ ref: key, content: null, problem: err.code, referenced: !!referenced[key] });
    }
  }

  return out;
}

module.exports = {
  IMAGE_COLUMNS: IMAGE_COLUMNS,
  notifications: notifications,
  faqs: faqs,
  referencedImageKeys: referencedImageKeys,
  images: images
};
