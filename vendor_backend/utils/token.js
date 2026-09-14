/**
 * Central JWT issuing / verification.
 *
 * The previous implementation spread `jwt.sign` calls across
 * authController and got the refresh flow wrong in four separate ways:
 *
 *   1. Login set `adminRefreshToken` / `userRefreshToken` cookies, but the
 *      refresh handler read `refreshAdminToken` / `refreshUserToken`. The
 *      names never matched, so refresh always answered "No refresh token
 *      found" no matter how valid the cookie was.
 *   2. The `web` role (the whole vendor site) had no refresh branch at all.
 *   3. The refreshed access token was signed as `{ role }` only. Every
 *      other claim - user_pk, user_id, manager_pk, role_pk - was dropped,
 *      so the first protected call after a refresh saw `req.user.user_pk`
 *      as undefined and returned somebody else's rows, or none.
 *   4. The access token lived 24h while the refresh token expired in 1h,
 *      which is backwards: the refresh token died first, so refresh could
 *      only ever fail.
 *
 * Everything token-shaped now goes through here so those cannot drift
 * apart again.
 */
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'refresh_secret_key';

// Short-lived access token, long-lived refresh token. The refresh token
// MUST outlive the access token or there is nothing left to refresh with.
const ACCESS_EXPIRE = process.env.JWT_EXPIRE || '15m';
const REFRESH_EXPIRE = process.env.REFRESH_EXPIRE || '7d';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

// Cookie maxAge is kept in lockstep with the token lifetimes above. A
// cookie that outlives its token leaves the browser sending a token the
// server will only reject; one that dies first drops a valid session.
const ACCESS_COOKIE_AGE = Number(process.env.JWT_COOKIE_AGE_MS) || 15 * MINUTE;
const REFRESH_COOKIE_AGE = Number(process.env.REFRESH_COOKIE_AGE_MS) || 7 * DAY;

const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

/**
 * SameSite was previously left unset, which means "Lax" on Chrome 80+ and
 * "None" on the Chrome 72-79 this project still targets. Lax is the safer
 * default and is correct for the documented setup: the site and the API
 * differ only by port, and ports do not make two origins cross-*site*.
 *
 * It is configurable because a deployment that puts the API on a genuinely
 * different registrable domain needs 'None', and 'None' additionally
 * requires Secure - browsers reject the combination otherwise, and the
 * symptom is a session that silently never persists.
 */
const COOKIE_SAMESITE = process.env.COOKIE_SAMESITE || 'Lax';

if (COOKIE_SAMESITE.toLowerCase() === 'none' && !COOKIE_SECURE) {
  console.warn(
    '[token] COOKIE_SAMESITE=None requires COOKIE_SECURE=true; ' +
    'browsers will reject these cookies and every login will appear to succeed but not stick.'
  );
}

const cookieOptions = {
  httpOnly: true,             // not reachable from JS, so XSS cannot lift it
  secure: COOKIE_SECURE,      // set COOKIE_SECURE=true once the site is on HTTPS
  sameSite: COOKIE_SAMESITE,  // Lax blocks cross-site POST, still allows top-level GET
  path: '/',                  // must match on clearCookie or logout leaves it behind
};

/**
 * Roles are the only thing that varies between the three login flows, so
 * the cookie names are derived from the role rather than hand-written at
 * each call site. This is what makes bug (1) above impossible to repeat.
 */
const ROLES = ['admin', 'user', 'web'];

const accessCookieName = (role) => `${role}AccessToken`;
const refreshCookieName = (role) => `${role}RefreshToken`;

/**
 * Strip the registered claims jsonwebtoken adds itself. Re-signing a
 * payload that still carries `exp`/`iat` makes jsonwebtoken throw
 * ("Bad options.expiresIn"), which is why refresh has to rebuild the
 * payload rather than pass the decoded token straight back in.
 */
const identityClaims = (decoded) => {
  const { iat, exp, nbf, iss, aud, sub, jti, typ, ...claims } = decoded;
  return claims;
};

const signAccessToken = (claims) =>
  jwt.sign({ ...claims, typ: 'access' }, JWT_SECRET, { expiresIn: ACCESS_EXPIRE });

/**
 * The refresh token carries the same identity claims as the access
 * token. That is what lets a refresh mint a *complete* access token
 * instead of the claim-less stub the old code produced.
 */
const signRefreshToken = (claims) =>
  jwt.sign({ ...claims, typ: 'refresh' }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRE });

/**
 * Issue both tokens for a role and put them in cookies.
 * `claims` must include everything the protected routes read off req.user.
 */
const issueTokens = (res, role, claims) => {
  const payload = { ...claims, role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  res.cookie(accessCookieName(role), accessToken, { ...cookieOptions, maxAge: ACCESS_COOKIE_AGE });
  res.cookie(refreshCookieName(role), refreshToken, { ...cookieOptions, maxAge: REFRESH_COOKIE_AGE });

  return { accessToken, refreshToken };
};

const clearTokens = (res, role) => {
  res.clearCookie(accessCookieName(role), cookieOptions);
  res.clearCookie(refreshCookieName(role), cookieOptions);
};

/**
 * Verify an access token. Returns the claims, or null when the token is
 * missing, expired, tampered with, or is a refresh token being replayed
 * as an access token.
 */
const verifyAccessToken = (token) => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Reject a refresh token presented as an access token. Tokens signed
    // before this module landed have no `typ` at all, so those still pass.
    if (decoded.typ === 'refresh') return null;
    return decoded;
  } catch (err) {
    return null;
  }
};

const verifyRefreshToken = (token) => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, REFRESH_SECRET);
    if (decoded.typ && decoded.typ !== 'refresh') return null;
    return decoded;
  } catch (err) {
    return null;
  }
};

/**
 * Find whichever role has a refresh cookie on this request. A browser can
 * legitimately hold more than one (an admin tab and a site tab), so the
 * caller gets every match and decides.
 */
const rolesWithRefreshCookie = (cookies = {}) =>
  ROLES.filter((role) => !!cookies[refreshCookieName(role)]);

module.exports = {
  ROLES,
  cookieOptions,
  accessCookieName,
  refreshCookieName,
  identityClaims,
  issueTokens,
  clearTokens,
  verifyAccessToken,
  verifyRefreshToken,
  rolesWithRefreshCookie,
  ACCESS_EXPIRE,
  REFRESH_EXPIRE,
};
