/**
 * Delta 028 - and it is JAVASCRIPT, not a .sql file like its neighbours.
 *
 * Every other migration in this directory is a four-line wrapper reading a
 * numbered file out of sql/deltas/. This one is not, and the reason is worth
 * stating rather than discovering:
 *
 *   THE LIST IS JAVASCRIPT. The console's screens are declared in
 *   src/db/seeds/01_management.js as an array of [url, name, icon, parent,
 *   is_menu], and each page's `sort_order` is derived from its POSITION in
 *   that array. Writing this as SQL would mean transcribing the whole list
 *   into a second file that has to be kept in step with the first - which is
 *   precisely the failure being fixed here, repeated in a new place.
 *
 * WHAT IT FIXES. A database built by `npm run seed` has every page. A
 * database MIGRATED forward has only the pages some delta happened to insert
 * by hand - 010 (notice origins), 014/019 (about), 021 (wallets), 026 (the
 * two advert screens) - and nothing else. A screen added to the seed and to
 * no delta therefore exists on fresh installs and nowhere else:
 * `/admin/base/footer` is one, and it is not the only one. The symptom is a
 * menu entry that will not appear and endpoints that answer 500 'page not
 * registered in manager_pages', on one machine and not another.
 *
 * So this adds whatever is missing, from the canonical list, and grants each
 * new page its parent's level the way sql/deltas/023 settled. It only ever
 * adds: a page already present is left alone, name, icon, order and menu flag
 * included, because those may have been edited on purpose.
 *
 * On a database that already has every page - the development one, and any
 * fresh install - it writes nothing at all.
 *
 * It is also available at any time as `npm run pages:sync`, so the NEXT
 * screen added to the seed does not need a migration of its own.
 */
const { syncPages } = require('../syncPages');

exports.up = async function up(knex) {
  const result = await syncPages(knex);

  if (result.added.length) {
    console.log('  registered ' + result.added.length + ' missing console page(s): '
      + result.added.join(', '));
  }
};

exports.down = async function down() {
  /*
   * NOTHING TO UNDO, on purpose.
   *
   * This migration's effect is "the pages table agrees with the seed". The
   * rows it adds are indistinguishable from the ones a fresh install writes,
   * and it cannot tell which of them it put there - so a rollback that
   * deleted pages would delete screens that were always meant to be there,
   * along with every permission hanging off them.
   *
   * Rolling back past this point leaves the pages registered, which is the
   * state a fresh install is in anyway.
   */
};
