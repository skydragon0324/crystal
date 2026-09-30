const crypto = require('crypto');
const legacy = require('../../config/legacy');

/**
 * THE PLATFORM'S USER TABLE — `ora_pid.users`, and it is the one that decides
 * who may sign in.
 *
 * Crystal does not own its members. It shares them with the vendor's platform,
 * the Eshop and the Appstore, and a person changing their password there has
 * to be able to sign in here with the new one. So the credential lives in ONE
 * place and this file is the only thing that reads it.
 *
 * Crystal's own `users` table does not go away: wallets, registered products,
 * point ledgers and feedback all reference `users.id`, and those are Crystal's
 * own records about a shared person. What changes is which of the two is
 * authoritative — the vendor's row proves who you are, and Crystal's row is a
 * local mirror created on first sign-in with THE SAME ID. That is the identity
 * bridge, and making it happen at login is what turns it from an assumption
 * into a fact; see services/memberAuth.service.js.
 *
 * MD5, UNSALTED, AND THAT IS NOT A CHOICE MADE HERE.
 *
 * `ora_pid.users.password` holds an unsalted MD5 - the vendor's platform has
 * hashed that way for years and the same hashes are checked by the Eshop, the
 * Appstore and the mobile app. Crystal cannot upgrade it unilaterally: a
 * bcrypt hash written here would be a password the rest of the platform could
 * no longer verify, and the member would be locked out of everything else.
 *
 * So it is matched as it is, and the weakness is stated rather than hidden:
 *
 *   - it is fast, so it is brute-forceable. Rate limiting on sign-in is the
 *     mitigation that IS available to Crystal, and it is not optional.
 *   - it is unsalted, so identical passwords have identical hashes across
 *     every account.
 *
 * Moving the platform to a modern hash is a change all four systems have to
 * make together. It is worth doing and it is not Crystal's to do alone.
 */

const USERS = 'users';

/** Status and lock codes, as the platform writes them. */
const STATUS = { INACTIVE: 0, ACTIVE: 1 };
const LOCKED = { NO: 0, YES: 1 };

function conn() {
  return legacy.connection();
}

/** The stored form of a password. See the note above about MD5. */
function hash(password) {
  return crypto.createHash('md5').update(String(password || '')).digest('hex');
}

/**
 * A CONSTANT-TIME COMPARISON, because the fast hash makes the timing matter.
 *
 * `a === b` on a hex string returns as soon as two characters differ, which
 * leaks how much of a guess was right. With bcrypt the work factor buries
 * that; with MD5 there is nothing to bury it, so the comparison is done
 * properly.
 */
function matches(password, stored) {
  const given = Buffer.from(hash(password), 'utf8');
  const known = Buffer.from(String(stored || ''), 'utf8');

  if (given.length !== known.length) return false;
  return crypto.timingSafeEqual(given, known);
}

/** By login name, which is what the sign-in form asks for. */
function findByLogin(login) {
  return conn()(legacy.pid(USERS))
    .whereRaw('LOWER(user_id) = ?', [String(login || '').trim().toLowerCase()])
    .first();
}

function findByPk(userPk) {
  return conn()(legacy.pid(USERS)).where('user_pk', userPk).first();
}

/**
 * The row in Crystal's words.
 *
 * `user_name` is the display name and `user_alias` is what the member chose to
 * be called, so the alias wins when it is set - which is the whole reason the
 * platform has both columns.
 */
function decode(row) {
  if (!row) return null;

  return {
    id: Number(row.user_pk),
    login: row.user_id,
    nickname: row.user_alias || row.user_name,
    avatar: row.user_avatar || null,
    gender: row.gender || null,
    birthday: row.birthday || null,
    cid: row.cid || null,
    active: Number(row.status) === STATUS.ACTIVE,
    locked: Number(row.locked) === LOCKED.YES
  };
}

/**
 * Verify a login and a password.
 *
 * Returns the member, or null - never a reason. WHICH of login, password,
 * status or lock failed is deliberately not distinguishable to the caller,
 * because "that account exists but the password is wrong" is an account
 * enumeration oracle. The service turns null into one message.
 *
 * The dummy comparison on a missing account is not theatre: without it a
 * missing login returns measurably faster than a wrong password, and that
 * difference is enough to enumerate accounts over a few thousand requests.
 */
async function verify(login, password) {
  const row = await findByLogin(login);

  if (!row) {
    matches(password, hash('a-login-that-does-not-exist'));
    return null;
  }

  if (!matches(password, row.password)) return null;

  const member = decode(row);
  if (!member.active || member.locked) return { blocked: true, member: member };

  return { blocked: false, member: member };
}

/**
 * CREATE A PLATFORM ACCOUNT.
 *
 * Registering on Crystal has to mean registering on the PLATFORM, because the
 * platform is what sign-in checks. A Crystal-only row would be an account
 * whose owner could never sign in - which is what registration quietly became
 * the moment the credential moved here, and this is the other half of that
 * change.
 *
 * The key is allocated by the platform's own sequence (or, on Oracle, its
 * insert trigger) rather than chosen, and it comes back as the id Crystal
 * mirrors under. `status` and `locked` take the column defaults - active and
 * unlocked - so this file never encodes what those numbers mean twice.
 */
async function create(input) {
  const row = {
    user_id: String(input.login).trim(),
    password: hash(input.password),
    user_name: input.nickname || String(input.login).trim()
  };

  if (input.gender) row.gender = input.gender;
  if (input.birthday) row.birthday = input.birthday;

  const returned = await conn()(legacy.pid(USERS)).insert(row).returning('user_pk');

  const first = Array.isArray(returned) ? returned[0] : returned;
  const userPk = first && typeof first === 'object'
    ? Number(first[Object.keys(first)[0]])
    : Number(first);

  return decode(await findByPk(userPk));
}

/**
 * Change a password.
 *
 * Writes the same MD5 the rest of the platform expects, so a password changed
 * in Crystal works in the Eshop, the Appstore and the mobile app. Writing
 * anything stronger here would lock the member out of all three.
 */
function setPassword(userPk, password) {
  return conn()(legacy.pid(USERS))
    .where('user_pk', userPk)
    .update({ password: hash(password), updated_at: new Date() });
}

/** Profile fields Crystal is allowed to edit on the shared row. */
function updateProfile(userPk, patch) {
  const row = {};
  if (patch.nickname !== undefined) row.user_alias = patch.nickname;
  if (patch.avatar !== undefined) row.user_avatar = patch.avatar;
  if (patch.gender !== undefined) row.gender = patch.gender;
  if (patch.birthday !== undefined) row.birthday = patch.birthday;

  if (!Object.keys(row).length) return Promise.resolve(0);

  row.updated_at = new Date();
  return conn()(legacy.pid(USERS)).where('user_pk', userPk).update(row);
}

/**
 * The member whose SIM id is this, for a certificate issued against a `cid`.
 *
 * Exact match: a cid is an identifier, not a name, and folding its case would
 * make two different SIMs the same person.
 */
function findByCid(cid) {
  return conn()(legacy.pid(USERS)).where('cid', String(cid || '').trim()).first();
}

const LOGIN_LOG = 'user_login_log';

/**
 * A sign-in, written where the platform's own apps write theirs.
 *
 * `ora_pid.user_login_log` is the vendor's record of who signed in with which
 * SIM, and the mobile /login asks for a `cid` so that a web sign-in lands in it
 * too. The phone columns are NOT NULL and a browser has no IMEI or handset
 * model to give, so they are empty strings - which is exactly what the
 * vendor's own login writes when a model is missing (see authController's
 * `words[0] || ""`), rather than a placeholder that would look like data.
 *
 * The key comes from the table's own sequence, or its insert trigger on
 * Oracle, as everywhere else in this file.
 */
function recordLogin(userPk, cid) {
  return conn()(legacy.pid(LOGIN_LOG)).insert({
    user_pk: userPk,
    cid: cid || null,
    phone_brand: '',
    phone_model: '',
    phone_imei: '',
    action_at: new Date()
  });
}

module.exports = {
  USERS: 'ora_pid.' + USERS,
  STATUS: STATUS,
  hash: hash,
  matches: matches,
  findByLogin: findByLogin,
  findByPk: findByPk,
  findByCid: findByCid,
  recordLogin: recordLogin,
  decode: decode,
  verify: verify,
  create: create,
  setPassword: setPassword,
  updateProfile: updateProfile
};
