const service = require('../services/memberAuth.service');
const users = require('../repositories/users.repository');
const { ok } = require('../utils/response');

/**
 * The member sign-in endpoints.
 *
 * Every one of them reads `req.device.detected` rather than `effective`.  The
 * override header a client can set chooses which artwork is served and must
 * never choose which credentials are accepted, or the whole device rule in
 * spec 5 is one header away from being optional.
 */
function detected(req) {
  return req.device ? req.device.detected : 'desktop';
}

/** Which form the sign-in page should draw. */
async function methods(req, res) {
  return ok(res, service.methods(detected(req)));
}

async function register(req, res) {
  return ok(res, await service.register(req.body, detected(req)), 'common.created');
}

async function login(req, res) {
  /*
   * THE USER ID. `login` and `username` are accepted as names for the same
   * field because clients spell it differently; an EMAIL is not, because
   * ora_pid.users has no email column and accepting one would only ever be a
   * guess at which account was meant.
   */
  const session = await service.loginWithPassword(
    req.body.user_id || req.body.login || req.body.username,
    req.body.password,
    detected(req),
    /* Only the /login mobile form sends one. */
    req.body.cid
  );
  return ok(res, session, 'common.signedIn');
}

/**
 * The desktop Sign in button, in the vendor's two steps - see
 * config.x509 and services/memberAuth.service.js. The certificate agent on
 * the member's PC does the signing; these only answer it.
 */
async function x509PrimaryData(req, res) {
  return ok(res, await service.x509PrimaryData(req.body || {}));
}

async function x509Login(req, res) {
  const session = await service.loginWithX509(req.body || {}, detected(req));
  return ok(res, session, 'common.signedIn');
}

async function requestOtp(req, res) {
  return ok(res, await service.requestOtp(req.body.phone, req.body.purpose), 'common.sent');
}

async function verifyOtp(req, res) {
  const session = await service.loginWithOtp(
    req.body.phone, req.body.code, detected(req), req.body.deviceId
  );
  return ok(res, session, 'common.signedIn');
}

async function refresh(req, res) {
  const supplied = req.body.refreshToken || req.body.refresh_token;
  return ok(res, await service.refresh(supplied, detected(req)));
}

async function me(req, res) {
  return ok(res, service.publicUser(await users.findById(req.user.id)));
}

async function changePassword(req, res) {
  await service.changePassword(
    req.user.id,
    req.body.currentPassword || req.body.current_password,
    req.body.newPassword || req.body.new_password
  );
  return ok(res, null, 'common.updated');
}

async function bindPhone(req, res) {
  return ok(res, await service.bindPhone(req.user.id, req.body.phone, req.body.code), 'common.updated');
}

/**
 * Signing out is the client dropping its tokens.
 *
 * The endpoint exists so the website has one call to make rather than a thing
 * that only ever happens in a browser - and so a support conversation about
 * "it signed me out" has a request to look for.
 */
async function logout(req, res) {
  return ok(res, null, 'common.signedOut');
}

module.exports = {
  methods: methods,
  register: register,
  login: login,
  x509PrimaryData: x509PrimaryData,
  x509Login: x509Login,
  requestOtp: requestOtp,
  verifyOtp: verifyOtp,
  refresh: refresh,
  me: me,
  changePassword: changePassword,
  bindPhone: bindPhone,
  logout: logout
};
