const crypto = require('crypto');
const config = require('../config');
const users = require('../repositories/users.repository');
const members = require('../repositories/legacy/members.repository');
const otp = require('../repositories/otp.repository');
const walletRepo = require('../repositories/wallet.repository');
const wallet = require('./wallet.service');
const settings = require('./settings.service');
const deviceUtil = require('../utils/device');
const fs = require('fs');
const x509 = require('../utils/x509');
const token = require('../utils/token');
const { transaction } = require('../repositories/shared/transaction');
const { HttpError } = require('../utils/response');

/**
 * Device-aware authentication (spec 5).
 *
 *   desktop  email + password
 *   mobile   phone + OTP
 *   tablet   either
 *
 * The rule is enforced against `req.device.detected` - the User-Agent - and
 * never against the client-supplied override header, so a mobile client
 * cannot ask to be treated as a desktop in order to skip the code.  That
 * header only chooses which artwork is served.
 *
 * Two deliberate choices about what the failures say:
 *   - a rejected sign-in never distinguishes "no such account" from "wrong
 *     password", because that difference is a membership oracle;
 *   - a code request answers the same way whether or not the phone is known,
 *     for the same reason.
 */


/**
 * Keeps a leading + and digits only, so "+86 138 0000 0000" and
 * "+8613800000000" are the same account rather than two.
 */
function normalisePhone(phone) {
  return String(phone || '').replace(/[^\d+]/g, '');
}

function generateOtp() {
  const max = Math.pow(10, config.otp.length);
  const value = crypto.randomBytes(4).readUInt32BE(0) % max;
  return String(value).padStart(config.otp.length, '0');
}

/**
 * The member, as anything outside this service may see them.
 *
 * `has_password` rather than the hash, for the same reason the wallet sends
 * `has_pay_password`: the settings page has to know whether it is asking for
 * a CURRENT password or setting the first one, and an account created with a
 * phone number has never had one.  Whether a password exists is not a secret;
 * the password is.
 */
function publicUser(user) {
  return {
    id: user.id,
    /*
     * THE USER ID THEY TYPED, and it was the one thing missing here.
     *
     * `users.login` is the platform id - the same string as
     * ora_pid.users.user_id - and it is what the member signs in with, what
     * the account sidebar shows them, and what the eshop, the appstore and
     * the eproduct site all key them by. The id below is Crystal's row
     * number, which is a fact about this database and means nothing to
     * anybody reading it.
     *
     * Null rather than absent for a row that predates the login column: the
     * sidebar draws the name alone when there is nothing to show, and an
     * absent key and an empty one should not read differently.
     */
    login: user.login || null,
    email: user.email,
    phone: user.phone,
    nickname: user.nickname,
    avatar: user.avatar,
    status: user.status,
    /*
     * Two shapes reach here: the listed-columns read, which computes this,
     * and the sign-in read, which is the one function allowed to select the
     * hash itself.  Accepting either is what keeps the answer true whichever
     * one the caller happened to have.
     */
    has_password: !!(user.has_password || user.password_hash)
  };
}

function buildSession(user, device, authType, deviceId) {
  return {
    user: publicUser(user),
    token: token.signUserToken(user, device, authType, deviceId),
    refreshToken: token.signUserRefreshToken(user, device),
    device: device,
    authType: authType
  };
}

/** Which credentials this device may present - the sign-in page asks first. */
function methods(device) {
  return {
    device: device,
    allowed: deviceUtil.allowedAuthTypes(device),
    // The page draws whichever form this names, rather than deciding locally,
    // so the client and the server cannot disagree about what is accepted.
    primary: deviceUtil.allowedAuthTypes(device)[0],
    /*
     * The /login page's form, which is a different pair from `allowed` above -
     * that one still drives /auth/reganam. See device.loginFormFor.
     */
    login: deviceUtil.loginFormFor(device),
    /* Whether the certificate button can work at all on this deployment. */
    certificate: x509Ready()
  };
}

/* ------------------------------------------------------------------ */
/*  registration                                                       */
/* ------------------------------------------------------------------ */

/**
 * REGISTERING CREATES A PLATFORM ACCOUNT, not a Crystal one.
 *
 * Sign-in checks ora_pid.users, so an account that exists only in Crystal is
 * an account whose owner can never sign in - which is exactly what this used
 * to build once the credential moved. It now writes the platform row first,
 * takes the id it allocates, and mirrors locally under that id, which is the
 * same shape the sign-in path uses.
 *
 * A USER ID, not an email. The platform has no email column and identifies a
 * person by `user_id`; Crystal's own email column is kept for contacting
 * somebody, and is optional because plenty of members do not have one on file.
 *
 * The two writes are NOT one transaction and cannot be - they are two
 * databases. The platform row goes first because it is the one that has to be
 * unique: if the local mirror then fails, the member has an account they can
 * sign in with, and signing in creates the mirror. The other order would leave
 * a Crystal row pointing at a platform user that does not exist.
 */
async function register(payload, device) {
  const login = String(payload.user_id || payload.login || '').trim();
  const password = String(payload.password || '');

  if (!/^[a-zA-Z0-9._-]{4,40}$/.test(login)) {
    throw new HttpError(400, 'memberAuth.aUserIdOf');
  }
  if (password.length < 8) {
    throw new HttpError(400, 'memberAuth.aPasswordOfAt');
  }

  if (await members.findByLogin(login)) throw new HttpError(409, 'common.duplicatedValue');

  const email = payload.email ? String(payload.email).trim().toLowerCase() : null;
  const phone = payload.phone ? normalisePhone(payload.phone) : null;

  if (email && await users.findByEmail(email)) throw new HttpError(409, 'common.duplicatedValue');
  if (phone && await users.findByPhone(phone)) throw new HttpError(409, 'common.duplicatedValue');

  const member = await members.create({
    login: login,
    password: password,
    nickname: payload.nickname || login
  });

  const created = await transaction(async function (trx) {
    const row = await users.insertWithId({
      id: member.id,
      login: member.login,
      email: email,
      phone: phone,
      /*
       * No local hash. The credential is the platform's, and a second one here
       * could drift out of step with it - a password changed in the Eshop would
       * leave this row still accepting the old one if anything ever read it.
       */
      password_hash: null,
      nickname: member.nickname,
      status: 'ACTIVE'
    }, trx);

    // Every member has a wallet from the first moment, so no later code path
    // has to cope with its absence.
    await walletRepo.ensure(row.id, trx);
    return row;
  });

  return buildSession(Object.assign({}, created, { login: member.login }), device, 'password');
}

/* ------------------------------------------------------------------ */
/*  desktop: email and password                                        */
/* ------------------------------------------------------------------ */

/**
 * SIGN IN AGAINST ora_pid.users, NOT AGAINST CRYSTAL'S OWN TABLE.
 *
 * Members are shared with the vendor's platform, the Eshop and the Appstore.
 * One person, one credential - so the password is checked where the platform
 * keeps it, and a password changed anywhere works everywhere.
 *
 * The form asks for a USER ID, because that is the only thing the platform
 * identifies a person by - ora_pid.users has no email column. Crystal's own
 * users table still carries one, but nothing signs in with it.
 *
 * AND THE LOCAL MIRROR IS GUARANTEED HERE.
 *
 * Crystal's own `users` row still exists - wallets, registered products, point
 * ledgers and feedback threads all reference `users.id`, and those are
 * Crystal's records about a shared person. It is created on first sign-in with
 * THE SAME ID as `user_pk`.
 *
 * That is the identity bridge, and doing it at login is what turns it from an
 * assumption the whole account area rests on into something that cannot be
 * false: you cannot hold a Crystal session without the matching row existing.
 */
async function loginWithPassword(login, password, device, cid) {
  /*
   * A phone may use a password only from the /login mobile form, which sends
   * the SIM's cid with it. The original page at /auth/reganam never sends one,
   * so on a phone it is still held to the code - see device.allowsPassword.
   */
  if (!deviceUtil.allowsPassword(device, cid)) {
    throw new HttpError(400, 'memberAuth.passwordSignInIs');
  }

  /*
   * THE USER ID, AND ONLY THE USER ID.
   *
   * ora_pid.users has no email column at all - the platform identifies a
   * person by `user_id` and nothing else. An earlier version of this also
   * tried an email's local part as a login, which was a guess dressed up as a
   * convenience: two different people can hold "ming@a.com" and "ming@b.com"
   * and both would have resolved to the same account.
   */
  const found = await members.verify(String(login || '').trim(), password);
  if (!found) throw new HttpError(401, 'memberAuth.thoseSignInDetails');

  /*
   * Blocked is told apart from wrong, and only AFTER the password matched.
   * Saying "this account is locked" to somebody who did not know the password
   * would confirm the account exists.
   */
  if (found.blocked) {
    throw new HttpError(403, 'common.thisAccountIs', null, {
      status: found.member.locked ? 'locked' : 'inactive'
    });
  }

  const user = await mirrorOf(found.member);

  await afterLogin(user);
  if (cid) await recordCid(found.member.id, cid);
  return buildSession(user, device, 'password');
}

/**
 * THE cid IS RECORDED AND NEVER CHECKED - a decision, not an omission.
 *
 * It goes into the platform's login log, where the vendor's apps put theirs,
 * and it does not refuse anybody: a member on a new SIM signs in exactly as
 * they would on the old one. The vendor's app goes further and locks an
 * account to its known cid; Crystal's web sign-in deliberately does not.
 *
 * A failure to write it is logged and swallowed, like the sign-in points
 * below: a log row that could not be written must never cost somebody the
 * session they just proved they own.
 */
/*
 * The width of ora_pid.user_login_log.cid. A longer value is not cut down to
 * fit - a truncated cid is a DIFFERENT cid, recorded as if it were the real
 * one - it is left out, with a warning that says so. The sign-in form caps the
 * field at this length, so a member cannot type one.
 */
const CID_MAX = 12;

async function recordCid(userPk, cid) {
  const value = String(cid || '').trim();
  if (!value) return;

  if (value.length > CID_MAX) {
    console.warn('[auth] not recording a ' + value.length + '-character cid for user ' + userPk + ': the column holds ' + CID_MAX);
    return;
  }

  try {
    await members.recordLogin(userPk, value);
  } catch (err) {
    console.warn('[auth] could not record the cid for user ' + userPk + ': ' + err.message);
  }
}

/* ------------------------------------------------------------------ */
/*  desktop: an X.509 certificate, the vendor's way                    */
/* ------------------------------------------------------------------ */

/*
 * CHALLENGES WAITING FOR THEIR SIGNATURE, keyed by what the signed text
 * starts with: the agent's random number followed by the server's.
 *
 * THE VENDOR DOES NOT KEEP THESE, and that is the one thing added here. Its
 * login verifies that the signature matches the text it came with - and never
 * that the text was a challenge it issued. So a signature captured once (from
 * a proxy log, a shared machine, a browser extension) signs that member in
 * again, forever. Here a challenge is issued once, used once, and expires.
 *
 * IN MEMORY, which is one process's memory. Behind a load balancer with more
 * than one API process, the two steps of one sign-in must reach the same
 * process (sticky sessions) or this moves to the database.
 */
const challenges = new Map();

function sweepChallenges(now) {
  challenges.forEach(function (entry, key) {
    if (entry.expires <= now) challenges.delete(key);
  });
}

/** The host the agent's signed text ends with - the server certificate's. */
function challengeHost() {
  try {
    return new URL(config.x509.serverCertUrl).host;
  } catch (err) {
    return '';
  }
}

/** Configured enough to sign anybody in; see config.x509. */
function x509Ready() {
  const c = config.x509;
  return !!(c.enabled && c.serverKey && c.serverCertUrl && (c.caRsaChain || c.caEccChain));
}

/**
 * STEP ONE: the server's half of the challenge.
 *
 * The agent sent its random number, its version and the user ID it holds a
 * certificate for. The server adds a random number of its own and signs the
 * three with its private key, so the agent can tell it is talking to this
 * server before it signs anything with the member's key.
 *
 * An agent older than the configured version is refused with version 'fail',
 * which the browser turns into "please use the latest version" - the vendor's
 * reply, kept so an existing agent reads it the same way.
 */
async function x509PrimaryData(body) {
  if (!x509Ready()) throw new HttpError(404, 'memberAuth.certificateSignInIsNotEnabled');

  const clientRand = String(body.client_rand || '').trim();
  const userId = String(body.userid || '').trim();
  const version = Number(body.version);

  if (!clientRand || !userId || !version) throw new HttpError(400, 'common.valueFailedAValidation');

  if (version < config.x509.minClientVersion) {
    throw new HttpError(400, 'memberAuth.certificateAgentTooOld', { version: 'fail' });
  }

  const now = Date.now();
  sweepChallenges(now);

  /* Three digits, as the vendor's - the agent may expect the width. */
  const serverRand = crypto.randomBytes(2).readUInt16BE(0) % 1000;

  let keyPem;
  try {
    keyPem = fs.readFileSync(config.x509.serverKey);
  } catch (err) {
    console.error('[auth] the x509 server key could not be read: ' + err.message);
    throw new HttpError(503, 'memberAuth.certificateSignInIsNotEnabled');
  }

  const serverSign = x509.signChallenge(clientRand + serverRand + userId, keyPem);

  challenges.set(clientRand + serverRand, { expires: now + config.x509.challengeSeconds * 1000 });

  return { url: config.x509.serverCertUrl, server_rand: serverRand, server_sign: serverSign };
}

/**
 * STEP TWO: the member's certificate and signature.
 *
 * In the vendor's order: the certificate against the CA chain and the personal
 * policies, then the signature, then the member named by the CN. Plus the step
 * the vendor lacks - the signed text must be a challenge this server issued
 * in the last two minutes and has not seen used.
 *
 * EVERY REFUSAL BEFORE THE ACCOUNT IS FOUND SAYS THE SAME THING to the caller.
 * Which check failed goes to the log, where somebody fixing a deployment can
 * read it; telling the browser "wrong CA" versus "wrong policy" helps nobody
 * but a person trying certificates until one works.
 */
async function loginWithX509(body, device) {
  if (!x509Ready()) throw new HttpError(404, 'memberAuth.certificateSignInIsNotEnabled');

  const refused = new HttpError(401, 'memberAuth.certificateNotAccepted');
  const certType = String(body.certType || 'RSA').toUpperCase() === 'ECDSA' ? 'ECDSA' : 'RSA';

  if (!body.plainData || !body.signData || !body.certData) {
    throw new HttpError(400, 'common.valueFailedAValidation');
  }

  /* The signed text is base64 of client_rand + server_rand + the host. */
  const signed = Buffer.from(String(body.plainData), 'base64').toString('utf8');
  const host = challengeHost();

  const now = Date.now();
  sweepChallenges(now);

  let challengeKey = null;
  challenges.forEach(function (entry, key) {
    if (!challengeKey && signed === key + host) challengeKey = key;
  });
  if (!challengeKey) {
    console.warn('[auth] x509 sign-in with no matching challenge (expired, reused or never issued)');
    throw refused;
  }

  const pem = Buffer.from(String(body.certData), 'base64').toString('utf8');

  const checked = await x509.checkCertificate(pem, certType, config.x509);
  if (!checked.ok) {
    console.warn('[auth] x509 certificate refused: ' + checked.reason);
    if (checked.reason === 'unavailable') throw new HttpError(503, 'memberAuth.certificateSignInIsNotEnabled');
    throw refused;
  }

  if (!x509.verifySignature(body.plainData, body.signData, pem, certType)) {
    console.warn('[auth] x509 signature did not verify for ' + checked.userId);
    throw refused;
  }

  /* Used: the same signature cannot sign anybody in a second time. */
  challenges.delete(challengeKey);

  const row = await members.findByLogin(checked.userId);
  if (!row) throw refused;

  const member = members.decode(row);
  if (!member.active || member.locked) {
    throw new HttpError(403, 'common.thisAccountIs', null, {
      status: member.locked ? 'locked' : 'inactive'
    });
  }

  const user = await mirrorOf(member);

  await afterLogin(user);
  return buildSession(user, device, 'certificate');
}

/**
 * Crystal's row for a platform member, created if this is their first visit.
 *
 * The id is NOT generated. It is `user_pk`, written explicitly, which is what
 * makes every `user_id` column in Crystal's schema and every `user_pk` in the
 * vendor's name the same person. The sequence behind `users.id` is pushed past
 * it so a later local insert cannot collide.
 *
 * The nickname is refreshed on every sign-in because the platform owns it: a
 * member who renames themselves elsewhere should not see a stale name here.
 */
async function mirrorOf(member) {
  const existing = await users.findById(member.id);

  if (existing) {
    /*
     * The platform owns both of these, so both are refreshed on every sign-in:
     * a member who renamed themselves or changed their login elsewhere should
     * not see a stale one here, and `login` is what the blog records an author
     * by.
     */
    const stale = existing.nickname !== member.nickname || existing.login !== member.login;
    if (stale) await users.update(member.id, { nickname: member.nickname, login: member.login });

    return Object.assign({}, existing, { nickname: member.nickname, login: member.login });
  }

  const created = await users.insertWithId({
    id: member.id,
    /*
     * Crystal's own users table requires an email and holds a password hash.
     * Neither is a credential any more - the platform's row is - so the email
     * is a placeholder derived from the login, and the hash column is left
     * unusable on purpose rather than filled with something that could be
     * signed in against.
     */
    email: member.login + '@platform.local',
    login: member.login,
    nickname: member.nickname,
    avatar: member.avatar,
    status: 'ACTIVE'
  });

  return Object.assign({}, created, { login: member.login });
}

/* ------------------------------------------------------------------ */
/*  mobile: phone and a code                                           */
/* ------------------------------------------------------------------ */

/**
 * Issues a code.
 *
 * The reply is the same shape whether or not the phone belongs to an account,
 * because the difference is a list of who is a customer.  `isNewAccount` is
 * the one hint given, and only so the next screen can be worded - it is
 * returned after the code has been sent either way.
 */
async function requestOtp(rawPhone, purpose) {
  const phone = normalisePhone(rawPhone);
  if (phone.length < 6) throw new HttpError(400, 'common.valueFailedAValidation');

  const kind = purpose || 'LOGIN';

  // The cooldown is read from the table rather than held in memory, so it
  // survives a restart and applies across every API process.
  const last = await otp.lastIssuedAt(phone, kind);
  if (last) {
    const elapsed = (Date.now() - new Date(last.created_at).getTime()) / 1000;
    if (elapsed < config.otp.resendSeconds) {
      throw new HttpError(429, 'memberAuth.pleaseWaitSecondsBefore', null, {
        n: Math.ceil(config.otp.resendSeconds - elapsed)
      });
    }
  }

  const user = await users.findByPhone(phone);
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + config.otp.ttlSeconds * 1000);

  await transaction(async function (trx) {
    await otp.invalidateAll(phone, kind, trx);
    await otp.issue({
      phone: phone, code: code, purpose: kind,
      device_id: null, expires_at: expiresAt
    }, trx);
  });

  /*
   * A real SMS gateway goes here.  Until there is one the code is logged
   * server-side and, in development only, returned to the caller so the whole
   * mobile flow is exercisable without one.  OTP_ECHO_IN_RESPONSE must never
   * be left on in production - it hands anybody a code for any number.
   */
  console.log('[otp] ' + phone + ' (' + kind + '): ' + code);

  const result = {
    sent: true,
    expiresIn: config.otp.ttlSeconds,
    resendIn: config.otp.resendSeconds,
    isNewAccount: !user
  };
  if (config.otp.echoInResponse && !config.isProduction) result.debugCode = code;
  return result;
}

async function loginWithOtp(rawPhone, code, device, deviceId) {
  if (!deviceUtil.supports(device, 'otp')) {
    throw new HttpError(400, 'memberAuth.verificationCodeSignIn');
  }

  const phone = normalisePhone(rawPhone);
  const record = await otp.findActive(phone, 'LOGIN');
  if (!record) throw new HttpError(401, 'memberAuth.thatCodeHasExpired');

  if (record.attempts >= config.otp.maxAttempts) {
    throw new HttpError(429, 'memberAuth.tooManyAttemptsOn');
  }

  if (String(record.code) !== String(code || '').trim()) {
    await otp.incrementAttempts(record.id);
    throw new HttpError(401, 'memberAuth.thatVerificationCodeIs');
  }

  await otp.consume(record.id);

  let user = await users.findByPhone(phone);

  if (!user) {
    /*
     * First sign-in from a phone number creates the account: spec 5 has no
     * separate mobile sign-up step, and inventing one would put a form
     * between a customer and the thing they came to do.
     */
    user = await transaction(async function (trx) {
      const rows = await users.insert({
        phone: phone,
        nickname: 'Crystal' + phone.slice(-4),
        status: 'ACTIVE'
      }, trx);
      await walletRepo.ensure(rows[0].id, trx);
      return rows[0];
    });
  }

  if (user.status !== 'ACTIVE') {
    throw new HttpError(403, 'common.thisAccountIs', null, { status: String(user.status).toLowerCase() });
  }

  await afterLogin(user);
  return buildSession(user, device, 'otp', deviceId || record.device_id);
}

/* ------------------------------------------------------------------ */
/*  sessions and profile                                               */
/* ------------------------------------------------------------------ */

async function refresh(refreshToken, device) {
  const payload = token.verifyUserRefreshToken(refreshToken);

  const account = await users.findRow(payload.userId);
  if (!account) throw new HttpError(401, 'common.invalidToken');
  if (account.status !== 'ACTIVE') {
    throw new HttpError(403, 'common.thisAccountIs', null, { status: String(account.status).toLowerCase() });
  }

  /*
   * The new token is minted for the device making the REFRESH call, not for
   * the one named in the old payload - a member who moves from their phone to
   * a laptop keeps one session rather than being silently left holding a
   * token that says "mobile".
   */
  const authType = deviceUtil.supports(device, 'password') && account.password_hash
    ? 'password'
    : 'otp';

  return buildSession(account, device, authType);
}

/**
 * The daily sign-in award (spec 11, type LOGIN).
 *
 * The once-a-day guard is a column moved in the same statement that stamps
 * the login, so two parallel sign-ins cannot both win it.  A failure to award
 * is swallowed: a points hiccup must never cost a member their session.
 */
async function afterLogin(user) {
  let won = false;
  try {
    won = await users.claimDailyLogin(user.id);
  } catch (err) {
    console.warn('[auth] could not stamp the sign-in for user ' + user.id + ': ' + err.message);
    return;
  }

  if (!won) return;

  try {
    const award = await settings.number('points.daily_login', config.points.dailyLogin);
    if (award > 0) {
      await wallet.recordPoints({
        user_id: user.id, type: 'LOGIN', amount: award,
        description: 'Daily sign-in reward'
      });
    }
  } catch (err) {
    console.warn('[auth] could not award sign-in points to user ' + user.id + ': ' + err.message);
  }
}

async function changePassword(userId, currentPassword, newPassword) {
  if (String(newPassword || '').length < 8) {
    throw new HttpError(400, 'common.theNewPasswordMust', null, { n: 8 });
  }

  /*
   * THE PASSWORD IS THE PLATFORM'S, so it is checked and written there.
   *
   * This used to compare and update `users.password_hash` in Crystal's own
   * table - a column nothing reads any more. The change would have reported
   * success and altered nothing anybody could sign in with, which is the worst
   * possible outcome for this particular operation.
   *
   * Writing it here also means the new password works in the Eshop, the
   * Appstore and the mobile app immediately, because all four check the same
   * row.
   */
  const member = await members.findByPk(userId);
  if (!member) throw new HttpError(404, 'common.notFound');

  if (!members.matches(currentPassword, member.password)) {
    throw new HttpError(400, 'common.theOldPasswordIs');
  }

  if (String(newPassword || '').length < 8) {
    throw new HttpError(400, 'memberAuth.aPasswordOfAt');
  }

  await members.setPassword(userId, newPassword);
  return { updated: true };
}

async function bindPhone(userId, rawPhone, code) {
  const phone = normalisePhone(rawPhone);

  const record = await otp.findActive(phone, 'BIND');
  if (!record) throw new HttpError(400, 'memberAuth.thatCodeHasExpired');

  if (String(record.code) !== String(code || '').trim()) {
    await otp.incrementAttempts(record.id);
    throw new HttpError(400, 'memberAuth.thatVerificationCodeIs');
  }

  const taken = await users.findByPhone(phone);
  if (taken && taken.id !== userId) throw new HttpError(409, 'common.duplicatedValue');

  await otp.consume(record.id);
  await users.update(userId, { phone: phone });

  return users.findById(userId);
}

module.exports = {
  normalisePhone: normalisePhone,
  publicUser: publicUser,
  methods: methods,
  register: register,
  loginWithPassword: loginWithPassword,
  x509PrimaryData: x509PrimaryData,
  loginWithX509: loginWithX509,
  requestOtp: requestOtp,
  loginWithOtp: loginWithOtp,
  refresh: refresh,
  changePassword: changePassword,
  bindPhone: bindPhone
};
