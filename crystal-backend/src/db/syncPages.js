'use strict';

/**
 * EVERY CONSOLE SCREEN REACHES A DATABASE THAT WAS MIGRATED, NOT RESEEDED.
 *
 * `manager_pages` is not decoration. middleware/permission.js refuses any
 * request for a page url it cannot find - 500, 'page not registered in
 * manager_pages' - and crystal-admin draws its sidebar from the same table.
 * A screen with no row therefore does not exist twice over: the menu entry is
 * absent and the endpoints behind it fail.
 *
 * The seed writes the whole list on a fresh install. A machine that has been
 * migrated forward since gets only what a delta happened to insert - and a
 * delta is written by hand, one page at a time, so a screen added to the seed
 * and nowhere else never arrives. `/admin/base/footer` was exactly that: it
 * works on any database built from scratch and is invisible on every one that
 * was migrated, which is why it looked like a machine-specific fault.
 *
 * THIS IS THE GENERAL FIX, and it is deliberately not a .sql delta like its
 * neighbours. The list lives in src/db/seeds/01_management.js as JavaScript -
 * url, name, icon, parent, is_menu - and the sort order is derived from its
 * POSITION in that array. Transcribing it into SQL would create a second copy
 * to keep in step with the first, which is the problem this exists to remove.
 * So the migration requires the seed and does the work in knex; the seed
 * stays the single source of truth and this file is the only thing that reads
 * it besides the seed itself.
 *
 * IT ONLY EVER ADDS. A page already in the table is left exactly as it is -
 * its name, icon, position and menu flag may well have been edited in the
 * console on purpose, and this has no business overwriting that. Nothing is
 * deleted either: a row for a screen that has since been removed is somebody
 * else's decision.
 */

const { PAGES } = require('./seeds/01_management');

/** `id` out of a knex insert, whichever shape this driver returns. */
function idOf(rows) {
  return typeof rows[0] === 'object' ? rows[0].id : rows[0];
}

/**
 * Adds every page in the canonical list that is missing, and returns the urls.
 *
 * Three passes rather than one, because a page's parent and its grants both
 * need ids that do not exist until the inserts have run - and a parent can
 * itself be one of the rows being added.
 */
async function syncPages(knex) {
  const existing = await knex('manager_pages').select('id', 'page_url');

  const idByUrl = {};
  existing.forEach(function (row) { idByUrl[row.page_url] = row.id; });

  /* ---- 1. the rows themselves ---- */
  const added = [];

  for (let i = 0; i < PAGES.length; i += 1) {
    const url = PAGES[i][0];
    if (idByUrl[url]) continue;

    const name = PAGES[i][1];
    const icon = PAGES[i][2];
    const isMenu = PAGES[i][4];

    /*
     * `sort_order` is (position + 1) * 10, exactly as the seed computes it,
     * so a page added here lands where a fresh install would have put it
     * rather than at the end of its section.
     */
    // eslint-disable-next-line no-await-in-loop
    const rows = await knex('manager_pages').insert({
      page_url: url,
      page_name: name,
      icon: icon,
      is_menu: isMenu === undefined ? true : !!isMenu,
      sort_order: (i + 1) * 10
    }).returning('id');

    idByUrl[url] = idOf(rows);
    added.push(url);
  }

  if (!added.length) return { added: [], granted: 0 };

  /* ---- 2. parents, now that every id exists ---- */
  for (let i = 0; i < PAGES.length; i += 1) {
    const url = PAGES[i][0];
    const parent = PAGES[i][3];

    if (!parent || added.indexOf(url) === -1) continue;
    if (!idByUrl[parent]) continue;

    // eslint-disable-next-line no-await-in-loop
    await knex('manager_pages').where('id', idByUrl[url]).update({ parent_id: idByUrl[parent] });
  }

  /* ---- 3. grants, the way sql/deltas/023 settled it ---- */
  let granted = 0;

  for (let i = 0; i < added.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    granted += await inheritGrants(knex, added[i], parentOf(added[i]), idByUrl);
  }

  return { added: added, granted: granted };
}

/** The parent url the canonical list gives one page, or null. */
function parentOf(url) {
  for (let i = 0; i < PAGES.length; i += 1) {
    if (PAGES[i][0] === url) return PAGES[i][3] || null;
  }
  return null;
}

/**
 * A new page inherits its PARENT's level, not a sibling's.
 *
 * The seed computes a role's level from its LONGEST MATCHING PREFIX grant, so
 * a role granted `/admin` at level 3 owns every page under it including ones
 * that did not exist when the grant was written. Copying a sibling's level
 * instead is what locked the super administrator out of the wallets screen -
 * see sql/deltas/023, which had to undo it.
 *
 * A page with no parent - a top-level section - is granted nothing here. Its
 * own children inherit from it, and who may open a whole section of the
 * console is a decision for an administrator rather than for a migration.
 */
async function inheritGrants(knex, url, parentUrl, idByUrl) {
  if (!parentUrl || !idByUrl[parentUrl]) return 0;

  const inserted = await knex.raw(`
    INSERT INTO manager_permissions (role_id, page_id, permission)
    SELECT parent.role_id, ?, parent.permission
      FROM manager_permissions AS parent
     WHERE parent.page_id = ?
       AND parent.permission > 0
       AND NOT EXISTS (
             SELECT 1 FROM manager_permissions existing
              WHERE existing.role_id = parent.role_id
                AND existing.page_id = ?
           )
  `, [idByUrl[url], idByUrl[parentUrl], idByUrl[url]]);

  return inserted.rowCount || 0;
}

module.exports = { syncPages: syncPages, PAGES: PAGES };
