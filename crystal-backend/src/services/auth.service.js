const bcrypt = require('bcryptjs');
const config = require('../config');
const managers = require('../repositories/managers.repository');
const permissions = require('./permissions.service');
const token = require('../utils/token');
const { HttpError } = require('../utils/response');
const audit = require('./audit.service');

/**
 * The console's sign-in.
 *
 * Two deliberate choices about what it says when it refuses:
 *
 *  - a failed sign-in never distinguishes "no such account" from "wrong
 *    password", because that difference is a list of who works here;
 *  - a missing account still pays for a bcrypt comparison, because otherwise
 *    the two cases are told apart by how long the answer takes.
 */

/** A bcrypt hash of nothing, so a missing account costs the same as a wrong password. */
const DUMMY_HASH = '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';

const MIN_PASSWORD = 8;

function hashPassword(plain) {
  return bcrypt.hash(String(plain), config.auth.bcryptRounds);
}

/**
 * Everything the console needs to draw itself, in one answer.
 *
 * The sidebar is built from `pages` rather than from a constant in the
 * frontend: what a role may open is a question this server answers, and a
 * menu drawn from a hardcoded list is a menu that shows entries the user is
 * refused on - which teaches people the app is broken.
 */
async function sessionOf(admin) {
  const pages = await permissions.grantsOf(admin.role_id);

  return {
    admin: {
      id: admin.id,
      username: admin.username,
      name: admin.name,
      avatar: admin.avatar,
      role_id: admin.role_id,
      role_code: admin.role_code,
      role_name: admin.role_name
    },
    pages: pages,
    token: token.signAdminToken(admin),
    refresh_token: token.signAdminRefreshToken(admin),
    expires_in: token.ACCESS_EXPIRES
  };
}

async function signIn(username, password, actor) {
  const admin = await managers.findForSignIn(username);

  if (!admin || admin.status !== 'ACTIVE') {
    await bcrypt.compare(String(password || ''), DUMMY_HASH);
    throw new HttpError(401, 'auth.incorrectUsernameOrPassword');
  }

  const matches = await bcrypt.compare(String(password || ''), admin.password_hash);
  if (!matches) throw new HttpError(401, 'auth.incorrectUsernameOrPassword');

  await managers.touchSignIn(admin.id);

  /*
   * Recorded against the account that just signed in rather than against the
   * request's actor, which at this point is still nobody - authenticate has
   * not run, because this IS the thing that lets it run.
   */
  audit.created(
    Object.assign({}, actor, {
      manager_id: admin.id, manager_login: admin.username, manager_name: admin.name
    }),
    'sign_in', admin.id, { username: admin.username }, '/admin/auth/login'
  );

  return sessionOf(admin);
}

/**
 * A new access token from a refresh token.
 *
 * The account is re-read rather than trusted from the token: a refresh token
 * lives for thirty days, and an administrator deactivated last week must not
 * be able to trade one in for another working day of access.
 */
async function refresh(refreshToken) {
  const payload = token.verifyAdminRefreshToken(refreshToken);

  const admin = await managers.findLive(payload.adminId);
  if (!admin) throw new HttpError(401, 'common.invalidToken');
  if (admin.status !== 'ACTIVE') throw new HttpError(403, 'auth.thisAdministratorAccountIs');

  return sessionOf(admin);
}

/** The signed-in account, re-read - the console calls this on every page load. */
function profile(admin) {
  return sessionOf(admin);
}

async function changePassword(admin, oldPassword, newPassword, actor) {
  if (String(newPassword || '').length < MIN_PASSWORD) {
    throw new HttpError(400, 'common.theNewPasswordMust', null, { n: MIN_PASSWORD });
  }

  const row = await managers.findRow(admin.id);
  const matches = await bcrypt.compare(String(oldPassword || ''), row.password_hash);
  if (!matches) throw new HttpError(400, 'common.theOldPasswordIs');

  await managers.update(admin.id, { password_hash: await hashPassword(newPassword) });

  // The hash itself never reaches the trail - see the SECRET list in
  // audit.service - so the entry says that it changed and nothing more.
  audit.updated(actor, managers.TABLE, admin.id,
    { password_hash: 'old' }, { password_hash: 'new' }, '/admin/auth/password');
}

module.exports = {
  MIN_PASSWORD: MIN_PASSWORD,
  hashPassword: hashPassword,
  sessionOf: sessionOf,
  signIn: signIn,
  refresh: refresh,
  profile: profile,
  changePassword: changePassword
};
