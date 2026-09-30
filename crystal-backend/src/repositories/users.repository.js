const db = require('../config/db');
const { applySearch } = require('../utils/query');

const TABLE = 'users';
const PK = 'id';

/**
 * Members.
 *
 * password_hash is READ by exactly one function here - findForSignIn.  The
 * only other mention of it tests whether it is null, and returns that test
 * rather than the column.  Every read lists its columns, so a hash cannot
 * reach a response because somebody wrote `select('*')`.
 */
const SELECT = [
  /*
   * `login` leads, because it is what identifies this person on the platform -
   * the console lists members by it, and it is the only one of these the member
   * actually signs in with.
   */
  'u.id', 'u.login', 'u.email', 'u.phone', 'u.nickname', 'u.avatar', 'u.status',
  'u.last_login_at', 'u.created_at', 'u.updated_at',
  /*
   * WHETHER there is a password, never the password.
   *
   * The settings page has to know if it is asking for a current password or
   * setting the first one - an account created with a phone number has never
   * had one - and computing the answer in the query is what lets that be
   * known without the hash leaving the database.
   */
  db.raw('(u.password_hash IS NOT NULL) AS has_password')
];

const SEARCHABLE = ['u.nickname', 'u.email', 'u.phone'];

function scope() {
  return db(TABLE + ' as u');
}

function applyFilters(qb, filters) {
  if (filters.status) qb.where('u.status', filters.status);
  if (filters.from) qb.where('u.created_at', '>=', filters.from);
  if (filters.to) qb.whereRaw("u.created_at < (?::date + interval '1 day')", [filters.to]);
  return qb;
}

/**
 * The console's member list, with the two numbers every row is judged on:
 * how many devices this member has registered, and what their points balance
 * is.  Sub-selects rather than joins - a join to two one-to-many tables at
 * once multiplies the rows, and the fix for that is usually a GROUP BY over
 * every column in SELECT.
 */
async function search(filters, paging) {
  const qb = applyFilters(applySearch(scope(), SEARCHABLE, filters.q), filters);

  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const rows = await qb.select(SELECT)
    .select(
      db.raw('(SELECT COUNT(*) FROM registered_products rp WHERE rp.user_id = u.id) AS device_cnt'),
      db.raw('(SELECT COUNT(*) FROM repair_tickets t WHERE t.user_id = u.id AND t.is_deleted = false) AS ticket_cnt'),
      db.raw('COALESCE((SELECT w.point_balance FROM wallets w WHERE w.user_id = u.id), 0) AS point_balance'),
      db.raw('COALESCE((SELECT w.balance FROM wallets w WHERE w.user_id = u.id), 0) AS balance')
    )
    .orderBy('u.' + paging.sort, paging.dir)
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
}

function findById(id) {
  return scope().where('u.id', id).first(SELECT);
}

/** The row the auth middleware re-reads on every request. */
function findLive(id) {
  /*
   * `login` is on this list because every authenticated request may need it:
   * the blog records an author by login and the storefront identity fallback
   * looks a member up by it. Leaving it off made req.user.login undefined and
   * the article query bind nothing.
   */
  return db(TABLE).where(PK, id)
    .first('id', 'email', 'phone', 'login', 'nickname', 'avatar', 'status');
}

/** The sign-in read, and the only one that returns the hash. */
function findForSignIn(criteria) {
  const qb = db(TABLE);
  if (criteria.email) qb.whereRaw('lower(email) = lower(?)', [String(criteria.email).trim()]);
  else qb.where('phone', String(criteria.phone || '').trim());
  return qb.first();
}

function findByPhone(phone, trx) {
  return (trx || db)(TABLE).where('phone', String(phone || '').trim()).first();
}

function findByEmail(email, trx) {
  return (trx || db)(TABLE).whereRaw('lower(email) = lower(?)', [String(email || '').trim()]).first();
}

function findRow(id, trx) {
  return (trx || db)(TABLE).where(PK, id).first();
}

function insert(data, trx) {
  return (trx || db)(TABLE).insert(data).returning('*');
}

function update(id, data, trx) {
  return (trx || db)(TABLE).where(PK, id).update(data).returning('*');
}

/**
 * A member whose id is CHOSEN, not generated.
 *
 * Sign-in happens against ora_pid.users and this row mirrors it locally, so
 * the id has to be that table's `user_pk` - it is what every user_id column in
 * Crystal's schema and every user_pk in the vendor's have in common, and what
 * lets a feedback thread written on one side be read from the other.
 *
 * The sequence is then pushed past the id. `users.id` is a serial and knows
 * nothing about ids that arrive from elsewhere, so without this the next
 * locally-created member is handed a key that is already taken - which fails
 * on the insert, at some unrelated moment, for no visible reason.
 */
async function insertWithId(data, trx) {
  const conn = trx || db;

  const rows = await conn(TABLE).insert(data).returning('*');

  await conn.raw(
    "SELECT setval(pg_get_serial_sequence(?, ?), GREATEST((SELECT MAX(id) FROM " + TABLE + "), ?))",
    [TABLE, PK, Number(data.id)]
  );

  return rows[0];
}

/**
 * Records the sign-in and, at most once a day, claims the daily award.
 *
 * The date guard is in the UPDATE rather than in a read-then-write, so two
 * tabs signing in at the same moment cannot both see "not awarded today" and
 * both award.  The number of rows affected is the answer: 1 means this call
 * won the award, 0 means somebody already had it.
 */
async function claimDailyLogin(id) {
  const affected = await db(TABLE)
    .where(PK, id)
    .where(function () {
      this.whereNull('last_login_award_on').orWhere('last_login_award_on', '<', db.raw('CURRENT_DATE'));
    })
    .update({ last_login_award_on: db.raw('CURRENT_DATE'), last_login_at: db.fn.now() });

  if (!affected) await db(TABLE).where(PK, id).update({ last_login_at: db.fn.now() });
  return affected > 0;
}

module.exports = {
  TABLE: TABLE,
  PK: PK,
  search: search,
  findById: findById,
  insertWithId: insertWithId,
  findLive: findLive,
  findForSignIn: findForSignIn,
  findByPhone: findByPhone,
  findByEmail: findByEmail,
  findRow: findRow,
  insert: insert,
  update: update,
  claimDailyLogin: claimDailyLogin
};
