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

/*
 * The two columns that hold an animated scene, whose pictures are NOT in a
 * column of their own: they are `src` values inside the JSON. A file used
 * only by a scene would otherwise look unreferenced, and the first delete of
 * anything that shared it would take the scene's artwork with it.
 */
const SCENE_COLUMNS = [
  ['site_adverts', 'scene'],
  ['product_images', 'scene']
];

async function isReferencedByScene(path) {
  for (let i = 0; i < SCENE_COLUMNS.length; i += 1) {
    const ref = SCENE_COLUMNS[i];

    /* A layer's src, or the background's. */
    // eslint-disable-next-line no-await-in-loop
    const found = await db.raw(
      'SELECT 1 FROM ?? AS t'
      + ' WHERE t.?? IS NOT NULL'
      + '   AND ('
      + '     t.??->\'background\'->>\'src\' = ?'
      + '     OR EXISTS ('
      + '       SELECT 1 FROM jsonb_array_elements(COALESCE(t.??->\'layers\', \'[]\'::jsonb)) AS layer'
      + '        WHERE layer->>\'src\' = ?'
      + '     )'
      + '   )'
      + ' LIMIT 1',
      [ref[0], ref[1], ref[1], path, ref[1], path]
    );

    if (found && found.rows && found.rows.length) return true;
  }

  return false;
}

async function isReferenced(path) {
  for (let i = 0; i < REFERENCES.length; i += 1) {
    const ref = REFERENCES[i];
    // eslint-disable-next-line no-await-in-loop
    const row = await db(ref[0]).where(ref[1], path).first(ref[1]);
    if (row) return true;
  }

  return isReferencedByScene(path);
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
