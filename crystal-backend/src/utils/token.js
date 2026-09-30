const jwt = require('jsonwebtoken');
const config = require('../config');
const { HttpError } = require('./response');

/**
 * JWT issuing and verification.
 *
 * Member tokens and administrator tokens are signed with DIFFERENT secrets on
 * purpose: a stolen member token must be useless against /api/admin, and the
 * two audiences also have different expiry policies - a member session lasts
 * hours, a console session lasts a working day.
 *
 * The member payload carries the device class and auth type it was issued for
 * (spec 5), so a token minted through mobile OTP stays identifiable as such
 * for the whole of its life.
 *
 * Both audiences get a refresh token, because both have the same problem: an
 * access token short enough to be worth having is short enough to expire
 * while somebody is still typing.
 */

const ACCESS_EXPIRES = config.auth.adminExpiresIn;
const REFRESH_EXPIRES = config.auth.refreshExpiresIn;

function signUserToken(user, device, authType, deviceId) {
  const payload = { userId: user.id, device: device, authType: authType };
  if (deviceId) payload.deviceId = deviceId;
  return jwt.sign(payload, config.auth.jwtSecret, { expiresIn: config.auth.jwtExpiresIn });
}

function signUserRefreshToken(user, device) {
  return jwt.sign(
    { userId: user.id, device: device, kind: 'refresh' },
    config.auth.refreshSecret,
    { expiresIn: REFRESH_EXPIRES }
  );
}

function signAdminToken(admin) {
  return jwt.sign(
    { adminId: admin.id, roleId: admin.role_id, kind: 'admin' },
    config.auth.adminSecret,
    { expiresIn: ACCESS_EXPIRES }
  );
}

function signAdminRefreshToken(admin) {
  return jwt.sign(
    { adminId: admin.id, kind: 'admin-refresh' },
    config.auth.refreshSecret,
    { expiresIn: REFRESH_EXPIRES }
  );
}

/**
 * An expired token and a forged one are different answers on purpose: the
 * console retries the first silently against /auth/refresh and gives up on
 * the second, and it can only tell them apart if the API says which it was.
 */
function verify(token, secret) {
  try {
    return jwt.verify(token, secret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw new HttpError(401, 'token.tokenExpired');
    throw new HttpError(401, 'common.invalidToken');
  }
}

function expect(payload, kind) {
  if (payload.kind !== kind) throw new HttpError(401, 'common.invalidToken');
  return payload;
}

function verifyUserToken(token) {
  return verify(token, config.auth.jwtSecret);
}

function verifyUserRefreshToken(token) {
  return expect(verify(token, config.auth.refreshSecret), 'refresh');
}

function verifyAdminToken(token) {
  return expect(verify(token, config.auth.adminSecret), 'admin');
}

function verifyAdminRefreshToken(token) {
  return expect(verify(token, config.auth.refreshSecret), 'admin-refresh');
}

/** Pulls a bearer token out of the Authorization header. */
function fromHeader(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

module.exports = {
  ACCESS_EXPIRES: ACCESS_EXPIRES,
  REFRESH_EXPIRES: REFRESH_EXPIRES,
  signUserToken: signUserToken,
  signUserRefreshToken: signUserRefreshToken,
  signAdminToken: signAdminToken,
  signAdminRefreshToken: signAdminRefreshToken,
  verifyUserToken: verifyUserToken,
  verifyUserRefreshToken: verifyUserRefreshToken,
  verifyAdminToken: verifyAdminToken,
  verifyAdminRefreshToken: verifyAdminRefreshToken,
  fromHeader: fromHeader
};
