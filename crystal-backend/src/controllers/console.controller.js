const search = require('../services/search.service');
const notifications = require('../services/notifications.service');
const { ok } = require('../utils/response');

/**
 * The two endpoints the console's chrome asks for rather than any one screen:
 * the header search box and the header bell.
 *
 * Neither sits behind `requirePermission`, and that is deliberate - there is
 * no page to name, because both read across half the system.  What they may
 * see is decided INSIDE, against the same permission grid the menu is built
 * from, so a role gets exactly the groups whose screens it could have opened
 * anyway.
 */

async function globalSearch(req, res) {
  return ok(res, await search.query(req.query.q, req.admin));
}

async function bell(req, res) {
  return ok(res, await notifications.summary(req.admin));
}

module.exports = { globalSearch: globalSearch, bell: bell };
