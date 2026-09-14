const db = require('../config/db');

const WALLETS = 'wallets';
const TRANSACTIONS = 'wallet_transactions';
const POINTS = 'point_logs';

/**
 * The member's two ledgers.
 *
 * Same shape as the parts shelf in stock.repository, and for the same reason:
 * `wallets.balance` and `wallets.point_balance` are caches, the two log
 * tables are the truth, and nothing writes one without the other inside a
 * transaction under a row lock.
 *
 * `balance_after` is stored on every row so a statement renders without
 * replaying the history - and so a drifted cache is one query away from being
 * found rather than being discovered by a member.
 */

function find(userId, trx) {
  return (trx || db)(WALLETS).where('user_id', userId).first();
}

/** Locked until the transaction ends - the point of the whole file. */
function lock(userId, trx) {
  return trx(WALLETS).where('user_id', userId).forUpdate().first();
}

/**
 * Creates the wallet if this member has never had one.
 *
 * Every member gets one at registration, so this is belt and braces for
 * accounts that predate that - and ON CONFLICT DO NOTHING means two
 * concurrent first writes do not race into a duplicate.
 */
function ensure(userId, trx) {
  return (trx || db)(WALLETS)
    .insert({ user_id: userId })
    .onConflict('user_id')
    .ignore();
}

function setBalances(userId, patch, trx) {
  return trx(WALLETS)
    .where('user_id', userId)
    .update(Object.assign({ updated_at: db.fn.now() }, patch))
    .returning('*');
}

function insertTransaction(data, trx) {
  return (trx || db)(TRANSACTIONS).insert(data).returning('*');
}

function insertPointLog(data, trx) {
  return (trx || db)(POINTS).insert(data).returning('*');
}

async function transactions(userId, filters, paging) {
  const qb = db(TRANSACTIONS).where('user_id', userId);
  if (filters.type) qb.where('type', filters.type);
  if (filters.from) qb.where('created_at', '>=', filters.from);
  if (filters.to) qb.whereRaw("created_at < (?::date + interval '1 day')", [filters.to]);

  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const rows = await qb.select('*')
    .orderBy('created_at', 'desc')
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
}

async function points(userId, filters, paging) {
  const qb = db(POINTS).where('user_id', userId);
  if (filters.type) qb.where('type', filters.type);
  if (filters.from) qb.where('created_at', '>=', filters.from);
  if (filters.to) qb.whereRaw("created_at < (?::date + interval '1 day')", [filters.to]);

  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const rows = await qb.select('*')
    .orderBy('created_at', 'desc')
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
}

/**
 * Points earned and spent, by reason.
 *
 * The member centre shows this as "where your points came from", which is
 * only legible if earning and spending are separated - a single net figure
 * per type would show LICENSE as a negative and PRODUCT_REGISTER as a
 * positive and invite somebody to add them up wrongly.
 */
function pointSummary(userId) {
  return db(POINTS)
    .where('user_id', userId)
    .groupBy('type')
    .orderBy('type')
    .select(
      'type',
      db.raw('COUNT(*) AS entry_cnt'),
      db.raw('COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0) AS earned'),
      db.raw('COALESCE(-SUM(amount) FILTER (WHERE amount < 0), 0) AS spent')
    );
}

/**
 * EVERY WALLET, for the console.
 *
 * The member's own pages read one wallet by id; an operator answering "where
 * did my top-up go" has a name and needs to find it. So this joins the user
 * on and searches what somebody is asked for on the phone - login, nickname,
 * email, phone - rather than the user id nobody knows.
 */
async function list(filters, paging) {
  const qb = db(WALLETS + ' as w').join('users as u', 'u.id', 'w.user_id');

  const term = (filters.q || '').trim();
  if (term) {
    const like = '%' + term.toLowerCase() + '%';

    /*
     * COALESCE on every nullable column: `LOWER(NULL) LIKE '%x%'` is NULL,
     * not false, so a member with no email would drop out of an OR that
     * should have matched them on their login.
     */
    qb.where(function () {
      this.whereRaw('LOWER(u.login) LIKE ?', [like])
        .orWhereRaw("LOWER(COALESCE(u.nickname, '')) LIKE ?", [like])
        .orWhereRaw("LOWER(COALESCE(u.email, '')) LIKE ?", [like])
        .orWhereRaw("COALESCE(u.phone, '') LIKE ?", [like]);
    });
  }

  /* A wallet holding nothing is noise on a support screen. */
  if (filters.funded === 'true') qb.where(function () {
    this.where('w.balance', '>', 0).orWhere('w.point_balance', '>', 0);
  });

  if (filters.currency) qb.where('w.currency', filters.currency);

  const countRow = await qb.clone().clearSelect().clearOrder().count({ c: '*' }).first();

  const sortable = ['balance', 'point_balance', 'frozen', 'updated_at', 'login'];
  const sort = sortable.indexOf(filters.sort) === -1 ? 'balance' : filters.sort;
  const column = sort === 'login' ? 'u.login' : 'w.' + sort;

  const rows = await qb
    .select(
      'w.user_id', 'w.balance', 'w.frozen', 'w.currency', 'w.point_balance', 'w.updated_at',
      'u.login', 'u.nickname', 'u.email', 'u.phone', 'u.status',
      db.raw('(w.pay_password_hash IS NOT NULL) AS has_pay_password')
    )
    .orderBy(column, filters.dir === 'asc' ? 'asc' : 'desc')
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
}

/** One wallet with the member on it, for the detail screen's header. */
function findWithMember(userId) {
  return db(WALLETS + ' as w')
    .join('users as u', 'u.id', 'w.user_id')
    .where('w.user_id', userId)
    .select(
      'w.user_id', 'w.balance', 'w.frozen', 'w.currency', 'w.point_balance',
      'w.created_at', 'w.updated_at',
      'u.login', 'u.nickname', 'u.email', 'u.phone', 'u.status'
    )
    .first();
}

/** Used by the check script: the ledgers must sum to the cached totals. */
function reconcile() {
  return db(WALLETS + ' as w')
    .leftJoin(
      db(POINTS).select('user_id', db.raw('SUM(amount) AS ledger'))
        .groupBy('user_id').as('p'),
      'p.user_id', 'w.user_id'
    )
    .whereRaw('w.point_balance <> COALESCE(p.ledger, 0)')
    .select('w.user_id', 'w.point_balance', db.raw('COALESCE(p.ledger, 0) AS ledger'));
}

module.exports = {
  WALLETS: WALLETS,
  TRANSACTIONS: TRANSACTIONS,
  POINTS: POINTS,
  find: find,
  lock: lock,
  ensure: ensure,
  setBalances: setBalances,
  insertTransaction: insertTransaction,
  insertPointLog: insertPointLog,
  transactions: transactions,
  points: points,
  pointSummary: pointSummary,
  list: list,
  findWithMember: findWithMember,
  reconcile: reconcile
};
