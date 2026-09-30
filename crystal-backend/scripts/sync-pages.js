'use strict';

/**
 * Registers every console screen the database is missing.
 *
 *   npm run pages:sync
 *
 * The console's screens are declared in src/db/seeds/01_management.js, and
 * `manager_pages` is what makes them real: middleware/permission.js refuses a
 * request for a url it cannot find there, and crystal-admin draws its sidebar
 * from the same table. A page with no row has no menu entry AND no working
 * endpoints.
 *
 * A fresh install gets the whole list from the seed. A database that has been
 * migrated forward instead gets only the pages some delta inserted by hand -
 * so a screen added to the seed and to no delta is present on one machine and
 * missing on another, with nothing to say why. `/admin/base/footer` is the
 * one that was reported; it was not the only one.
 *
 * Migration 20260916110000 does this once, for databases that run it. This
 * exists so that the NEXT screen added to the seed needs no migration at all:
 * run it after a pull, on any database, as often as you like.
 *
 * IT ONLY ADDS. A page already registered is left exactly as it is - name,
 * icon, sort order and menu flag included, because those can be edited in the
 * console on purpose - and nothing is ever deleted. Running it on a database
 * that is already complete prints "nothing to add" and writes nothing.
 */

const db = require('../src/config/db');
const { syncPages } = require('../src/db/syncPages');

async function main() {
  const result = await syncPages(db);

  if (!result.added.length) {
    console.log('every console page is registered - nothing to add');
    return;
  }

  console.log('registered ' + result.added.length + ' page(s):');
  result.added.forEach(function (url) { console.log('  ' + url); });

  /*
   * Said out loud because it is the half people forget: a page row with no
   * permissions is a menu entry that 403s, which looks like a different bug.
   */
  console.log(result.granted + ' role grant(s) inherited from the parent pages');
}

main()
  .then(function () { return db.destroy(); })
  .catch(async function (err) {
    console.error('pages:sync failed: ' + err.message);
    await db.destroy();
    process.exit(1);
  });
