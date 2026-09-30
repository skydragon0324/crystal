'use strict';

const db = require('../config/db');
const storage = require('../config/storage');
const { service: signing } = require('../security/signingService');

/* Every ordinary column that can point at an uploaded image. Keep this list
 * beside deletion, so bytes are removed only after the last live reference
 * has gone. Sharing a path intentionally therefore remains safe. */
const REFERENCES = [
  ['managers', 'avatar'], ['users', 'avatar'],
  ['products', 'main_image'], ['products', 'main_image_mobile'],
  ['product_series', 'banner_image'], ['product_series', 'banner_image_mobile'],
  ['product_accessories', 'image'],
  ['product_categories', 'icon'], ['os_versions', 'cover_image'],
  ['articles', 'cover_image'], ['articles', 'cover_image_mobile'],
  ['site_adverts', 'file_path'], ['site_popups', 'file_path'],
  ['media_assets', 'file_path'],
  ['product_images', 'file_path']
];

function uploaded(path) {
  return typeof path === 'string' && path.indexOf('/uploads/') === 0;
}

async function isReferenced(path) {
  for (let i = 0; i < REFERENCES.length; i += 1) {
    const ref = REFERENCES[i];
    // eslint-disable-next-line no-await-in-loop
    const row = await db(ref[0]).where(ref[1], path).first(ref[1]);
    if (row) return true;
  }
  return false;
}

async function removeIfUnreferenced(path) {
  if (!uploaded(path) || await isReferenced(path)) return false;
  const removed = storage.remove(path);
  if (removed) await signing().forget('image', path).catch(function () {});
  return removed;
}

async function replaced(previous, current, columns) {
  const names = columns || [];
  for (let i = 0; i < names.length; i += 1) {
    const column = names[i];
    if (previous && previous[column] && previous[column] !== (current && current[column])) {
      // eslint-disable-next-line no-await-in-loop
      await removeIfUnreferenced(previous[column]);
    }
  }
}

module.exports = {
  REFERENCES: REFERENCES,
  uploaded: uploaded,
  isReferenced: isReferenced,
  removeIfUnreferenced: removeIfUnreferenced,
  replaced: replaced
};
