const token = require('../utils/token');
const managers = require('../repositories/managers.repository');
const users = require('../repositories/users.repository');
const { HttpError } = require('../utils/response');

/**
 * Authentication for the two audiences.
 *
 *   authenticate  - the whole /api/admin surface, sets req.admin
 *   requireUser   - the member area, sets req.user
 *   optionalUser  - public endpoints that personalise when signed in
 *
 * Each verifies against its own secret and then RE-READS the account row.  A
 * token stays valid until it expires, so an administrator deactivated a
 * minute ago would otherwise keep the whole console for the rest of the
 * working day - and a member locked for fraud would keep their wallet.
 */

const ACCESS_EXPIRES = token.ACCESS_EXPIRES;
const REFRESH_EXPIRES = token.REFRESH_EXPIRES;

async function authenticate(req, res, next) {
  const raw = token.fromHeader(req);
  if (!raw) return next(new HttpError(401, 'auth.administratorSignInRequired'));

  const payload = token.verifyAdminToken(raw);
  const admin = await managers.findLive(payload.adminId);

  if (!admin) return next(new HttpError(401, 'auth.administratorSignInRequired'));
  if (admin.status !== 'ACTIVE') return next(new HttpError(403, 'auth.thisAdministratorAccountIs'));

  req.admin = admin;
  req.auth = payload;
  return next();
}

async function requireUser(req, res, next) {
  const raw = token.fromHeader(req);
  if (!raw) return next(new HttpError(401, 'auth.pleaseSignInTo'));

  const payload = token.verifyUserToken(raw);
  const user = await users.findLive(payload.userId);

  if (!user) return next(new HttpError(401, 'auth.pleaseSignInTo'));
  if (user.status !== 'ACTIVE') return next(new HttpError(403, 'common.thisAccountIs', null, {
    status: String(user.status).toLowerCase()
  }));

  req.user = user;
  req.auth = payload;
  return next();
}

/**
 * An expired or malformed token on a public endpoint is not an error - the
 * caller simply gets the anonymous view of the page.
 */
async function optionalUser(req, res, next) {
  const raw = token.fromHeader(req);
  if (!raw) return next();

  try {
    const payload = token.verifyUserToken(raw);
    const user = await users.findLive(payload.userId);
    if (user && user.status === 'ACTIVE') {
      req.user = user;
      req.auth = payload;
    }
  } catch (err) {
    /* anonymous it is */
  }
  return next();
}

module.exports = {
  ACCESS_EXPIRES: ACCESS_EXPIRES,
  REFRESH_EXPIRES: REFRESH_EXPIRES,
  authenticate: authenticate,
  requireUser: requireUser,
  optionalUser: optionalUser
};
