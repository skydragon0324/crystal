const repo = require('../repositories/permissions.repository');
const permissions = require('../services/permissions.service');
const { HttpError } = require('../utils/response');

/**
 * The HTTP guard.
 *
 * Only the guarding lives here.  What a role may actually do is a question
 * about the business, not about a request, so it is answered by
 * services/permissions.service.js.
 */

const LEVEL = permissions.LEVEL;

/**
 * The page url -> id map, cached.
 *
 * Read on every single request, and admin_pages changes about once a year.  A
 * minute of staleness costs nothing; a round trip per request costs a round
 * trip per request.
 */
let cache = { at: 0, map: null };
const TTL = 60 * 1000;

async function pageMap() {
  if (cache.map && Date.now() - cache.at < TTL) return cache.map;
  const rows = await repo.allPages();
  const map = {};
  rows.forEach(function (r) { map[r.page_url] = r.id; });
  cache = { at: Date.now(), map: map };
  return map;
}

function clearPageCache() { cache = { at: 0, map: null }; }

/**
 * Guard a route by the page it belongs to.
 *
 *   requirePermission('/admin/service/tickets', LEVEL.WRITE)
 *
 * A page url that is not registered is a 500 rather than a 403, and says so:
 * it means a route was added and its row was not, which is a mistake in this
 * codebase and not a decision about this user.  Answering 403 would send
 * somebody to ask for a permission that does not exist.
 */
function requirePermission(pageUrl, level) {
  return async function (req, res, next) {
    const map = await pageMap();
    const pageId = map[pageUrl];
    if (!pageId) {
      return next(new HttpError(500, 'permission.pageNotRegisteredIn', null, { page: pageUrl }));
    }

    const row = await repo.levelOf(req.admin.role_id, pageId);

    const granted = row ? row.permission : LEVEL.NONE;
    if (granted < level) return next(new HttpError(403, 'common.permissionDenied'));

    req.permission = granted;
    return next();
  };
}

module.exports = {
  LEVEL: LEVEL,
  requirePermission: requirePermission,
  clearPageCache: clearPageCache
};
