'use strict';

const db = require('../config/db');

/**
 * THE ABOUT PAGE'S PICTURES, and nothing else.
 *
 * This service used to assemble ten chapters of copy out of three tables in
 * three queries. It does not any more: the copy is
 * crystal-web/src/pages/about/content.js, under review with the rest of the
 * project's words, and only the photographs are data. See sql/deltas/019.
 *
 * ONE QUERY, GROUPED BY SLOT. The page needs every picture at once - it is one
 * long scroll and a band with no image is a visible hole - so there is nothing
 * to gain from asking per chapter, and eleven requests for eleven photographs
 * is eleven round trips before the page can paint.
 *
 * The reply is a MAP, not a list:
 *
 *   { hero: [{...}], "factory.floor": [{...}], certificate: [{...}, ...] }
 *
 * Always an array, even for a slot that holds one picture. A slot that grows
 * from one image to a gallery then changes nothing on either side, and the
 * page never has to know which kind it asked for.
 */

const TABLE = 'about_images';

const COLUMNS = ['id', 'slot', 'file_path', 'file_path_dark', 'alt_text', 'caption', 'sort_order'];

async function images() {
  const rows = await db(TABLE)
    .where({ is_deleted: false, status: 'ACTIVE' })
    .orderBy([{ column: 'slot' }, { column: 'sort_order' }, { column: 'id' }])
    .select(COLUMNS);

  const bySlot = {};

  rows.forEach(function (row) {
    if (!bySlot[row.slot]) bySlot[row.slot] = [];

    bySlot[row.slot].push({
      id: row.id,
      /*
       * `dark` is null when there is no dark variant rather than a copy of the
       * light one. The page falls back on its own, and a copy here would make
       * "no dark version was uploaded" indistinguishable from "the dark
       * version is the same picture", which for a diagram it sometimes is.
       */
      src: row.file_path,
      dark: row.file_path_dark || null,
      alt: row.alt_text || null,
      caption: row.caption || null
    });
  });

  return bySlot;
}

/**
 * What the storefront asks for.
 *
 * Still called `page()` because the route is still `/about` - the shape of the
 * reply changed and its name did not need to.
 */
async function page() {
  return { images: await images() };
}

module.exports = {
  TABLE: TABLE,
  images: images,
  page: page
};
