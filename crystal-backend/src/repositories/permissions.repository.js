const db = require('../config/db');
const table = require('./table.repository');

const PAGES = 'manager_pages';
const ROLES = 'manager_roles';
const PERMS = 'manager_permissions';

/** Every registered page, for the guard's url -> id map. */
function allPages() {
  return db(PAGES).select('id', 'page_url').orderBy('id');
}

/** The sidebar's tree, in the order it is drawn. */
function menuPages() {
  return db(PAGES).select('*').orderBy([{ column: 'sort_order' }, { column: 'id' }]);
}

/** One role's level on one page. */
function levelOf(roleId, pageId) {
  return db(PERMS).where({ role_id: roleId, page_id: pageId }).first('permission');
}

/**
 * Every page with the level this role has on it, including the pages it has
 * no row for.
 *
 * A LEFT JOIN rather than a lookup of the rows that exist, because the
 * permission screen has to draw a checkbox for every page - including the
 * ones nobody has granted yet, which are exactly the interesting ones.
 */
function matrixOf(roleId) {
  return db(PAGES + ' as p')
    .leftJoin(PERMS + ' as x', function () {
      this.on('x.page_id', 'p.id').andOn('x.role_id', db.raw('?', [roleId]));
    })
    .orderBy([{ column: 'p.sort_order' }, { column: 'p.id' }])
    .select(
      'p.id as page_id', 'p.parent_id', 'p.page_url', 'p.page_name', 'p.icon',
      'p.sort_order', 'p.is_menu',
      db.raw('COALESCE(x.permission, 0) AS permission')
    );
}

/**
 * What one signed-in administrator may see, which is what the console builds
 * its sidebar from.
 *
 * Only pages with a level above none come back: a menu that draws entries the
 * user is refused on is a menu that teaches people the app is broken.
 */
function grantsOf(roleId) {
  return db(PAGES + ' as p')
    .join(PERMS + ' as x', 'x.page_id', 'p.id')
    .where('x.role_id', roleId)
    .where('x.permission', '>', 0)
    .orderBy([{ column: 'p.sort_order' }, { column: 'p.id' }])
    .select('p.id as page_id', 'p.parent_id', 'p.page_url', 'p.page_name',
      'p.icon', 'p.sort_order', 'p.is_menu', 'x.permission');
}

/**
 * Sets one level, inserting or updating as needed.
 *
 * ON CONFLICT rather than a read followed by a write: the permission screen
 * saves a whole grid at once, and a check-then-insert would race with itself
 * the moment two rows in that grid are for the same page.
 */
function setLevel(roleId, pageId, level, trx) {
  return (trx || db)(PERMS)
    .insert({ role_id: roleId, page_id: pageId, permission: level })
    .onConflict(['role_id', 'page_id'])
    .merge({ permission: level, updated_at: db.fn.now() });
}

/** Everything granted to a role, so a saved grid can be diffed against it. */
function rowsOf(roleId, trx) {
  return (trx || db)(PERMS).where('role_id', roleId).select('page_id', 'permission');
}

function findRole(id, trx) {
  return table.findById(ROLES, 'id', id, trx);
}

function findRoleByCode(code, trx) {
  return (trx || db)(ROLES).where('role_code', code).first();
}

function findPageByUrl(url, trx) {
  return (trx || db)(PAGES).where('page_url', url).first();
}

module.exports = {
  PAGES: PAGES,
  ROLES: ROLES,
  PERMS: PERMS,
  allPages: allPages,
  menuPages: menuPages,
  levelOf: levelOf,
  matrixOf: matrixOf,
  grantsOf: grantsOf,
  setLevel: setLevel,
  rowsOf: rowsOf,
  findRole: findRole,
  findRoleByCode: findRoleByCode,
  findPageByUrl: findPageByUrl
};
