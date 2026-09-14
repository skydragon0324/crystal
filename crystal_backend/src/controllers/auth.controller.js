const service = require('../services/auth.service');
const { ok } = require('../utils/response');

async function login(req, res) {
  const session = await service.signIn(req.body.username, req.body.password, req.actor);
  return ok(res, session, 'common.signedIn');
}

async function refresh(req, res) {
  return ok(res, await service.refresh(req.body.refresh_token));
}

async function profile(req, res) {
  return ok(res, await service.profile(req.admin));
}

async function changePassword(req, res) {
  await service.changePassword(req.admin, req.body.old_password, req.body.new_password, req.actor);
  return ok(res, null, 'common.updated');
}

/**
 * Signing out is the client dropping its tokens.
 *
 * The endpoint exists so that "sign out" is one call the console makes and
 * one line in the trail, rather than a thing that only ever happens in a
 * browser and is therefore invisible to anybody reading the audit log.
 */
async function logout(req, res) {
  return ok(res, null, 'common.signedOut');
}

module.exports = {
  login: login,
  refresh: refresh,
  profile: profile,
  changePassword: changePassword,
  logout: logout
};
