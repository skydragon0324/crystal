const repo = require('../repositories/wallet.repository');
const { transaction } = require('../repositories/shared/transaction');
const { HttpError } = require('../utils/response');
const { money, points: exactPoints } = require('../utils/query');
const audit = require('./audit.service');

/* The console screen these console-only functions belong to. */
const PAGE = '/admin/members/wallets';

/**
 * The member's wallet and points.
 *
 * The same rule as the parts shelf: the cached total on `wallets` and the row
 * in the log are written together, inside one transaction, after the wallet
 * row has been locked.  `spendPoints`, `awardPoints`, `credit` and `debit`
 * below all funnel into two functions that do that, and nothing else in the
 * codebase writes to either table.
 *
 * Affordability is enforced by the spend itself rather than by a check
 * beforehand: reading a balance, deciding it is enough and then decrementing
 * it is only correct if nothing else can read the same balance in between,
 * which is exactly what the lock guarantees and a prior check does not.
 */

function overview(userId) {
  return repo.find(userId);
}

function transactions(userId, filters, paging) {
  return repo.transactions(userId, filters, paging);
}

function points(userId, filters, paging) {
  return repo.points(userId, filters, paging);
}

function pointSummary(userId) {
  return repo.pointSummary(userId);
}

/**
 * One point movement, and the cached total it implies.
 *
 * `amount` is signed - LICENSE and WARRANTY_EXTENSION are negative, because
 * they spend - so SUM(amount) is the balance and the check script can prove
 * the cache has not drifted.
 *
 * Runs inside the caller's transaction when given one, because awarding
 * points for a registration has to succeed or fail WITH the registration:
 * points handed out for a device that did not persist are points nobody can
 * account for.
 */
async function recordPoints(input, trx) {
  /*
   * THE EXACT AMOUNT, to the column's own three decimals.
   *
   * This used to round to a whole number, because point_logs.amount was an
   * integer and PostgreSQL rejects '0.4' for one - so an award of four tenths
   * of a point was silently written as a movement of zero. The column is
   * numeric(14,3) now (sql/deltas/027) and the figure is kept; `exactPoints`
   * only trims binary float error, which is not the same operation.
   */
  const amount = exactPoints(input.amount);
  if (!amount) return null;

  const run = async function (tx) {
    await repo.ensure(input.user_id, tx);

    const wallet = await repo.lock(input.user_id, tx);
    if (!wallet) throw new HttpError(404, 'common.notFound');

    /*
     * Number() on the balance, and it is not decoration. A numeric column
     * arrives from node-postgres as a STRING, so `wallet.point_balance +
     * amount` would concatenate rather than add - '12' + 0.4 = '120.4' -
     * and write a balance nobody could explain. It was safe to leave off
     * while the column was an integer; it is not now.
     */
    const after = exactPoints(Number(wallet.point_balance) + amount);
    if (after < 0) throw new HttpError(409, 'wallet.notEnoughPoints');

    await repo.setBalances(input.user_id, { point_balance: after }, tx);

    const rows = await repo.insertPointLog({
      user_id: input.user_id,
      type: input.type,
      amount: amount,
      balance_after: after,
      description: input.description || null,
      reference: input.reference || null
    }, tx);

    return rows[0];
  };

  return trx ? run(trx) : transaction(run);
}

/** One money movement, same discipline. */
async function recordTransaction(input, trx) {
  const amount = money(input.amount);
  if (!amount) return null;

  const run = async function (tx) {
    await repo.ensure(input.user_id, tx);

    const wallet = await repo.lock(input.user_id, tx);
    if (!wallet) throw new HttpError(404, 'common.notFound');

    const after = money(Number(wallet.balance) + amount);
    if (after < 0) throw new HttpError(409, 'wallet.notEnoughBalance');

    await repo.setBalances(input.user_id, { balance: after }, tx);

    const rows = await repo.insertTransaction({
      user_id: input.user_id,
      type: input.type,
      amount: amount,
      balance_after: after,
      currency: input.currency || wallet.currency,
      reference: input.reference || null,
      description: input.description || null,
      counterparty_id: input.counterparty_id || null,
      status: 'SUCCESS'
    }, tx);

    return rows[0];
  };

  return trx ? run(trx) : transaction(run);
}

/**
 * A transfer between two members.
 *
 * Both sides in one transaction, and the wallets are locked in ascending user
 * id order - not in "sender then recipient" order.  Two people transferring
 * to each other at the same moment would otherwise each hold the lock the
 * other is waiting for, and the database would break the deadlock by killing
 * one of them at random.
 */
async function transfer(fromUserId, toUserId, amount, description) {
  const value = money(amount);
  if (value <= 0) throw new HttpError(400, 'common.valueFailedAValidation');
  if (Number(fromUserId) === Number(toUserId)) throw new HttpError(400, 'common.valueFailedAValidation');

  return transaction(async function (trx) {
    const first = Math.min(Number(fromUserId), Number(toUserId));
    const second = Math.max(Number(fromUserId), Number(toUserId));

    await repo.ensure(first, trx);
    await repo.ensure(second, trx);
    await repo.lock(first, trx);
    await repo.lock(second, trx);

    const out = await recordTransaction({
      user_id: fromUserId, type: 'TRANSFER_OUT', amount: -value,
      counterparty_id: toUserId, description: description || 'Transfer out'
    }, trx);

    const inbound = await recordTransaction({
      user_id: toUserId, type: 'TRANSFER_IN', amount: value,
      counterparty_id: fromUserId, description: description || 'Transfer in'
    }, trx);

    return { sent: out, received: inbound };
  });
}

/** Used by the check script: the point ledger must sum to the cached total. */
function reconcile() {
  return repo.reconcile();
}

/* ------------------------------------------------------------- the console */

/**
 * Every wallet, for an operator who has a name rather than a user id.
 */
function list(filters, paging) {
  return repo.list(filters || {}, paging);
}

/** One wallet with its member, for the detail screen. */
async function detail(userId) {
  const wallet = await repo.findWithMember(userId);
  if (!wallet) throw new HttpError(404, 'common.notFound');
  return wallet;
}

/**
 * AN OPERATOR MOVING MONEY OR POINTS BY HAND.
 *
 * Support has to be able to put back a top-up that was taken twice, and there
 * is no honest way to do that without a screen - the alternative is somebody
 * with database access and no audit trail, which is the arrangement this
 * exists to replace.
 *
 * THREE THINGS MAKE IT SAFE ENOUGH TO OFFER.
 *
 * It goes through recordTransaction and recordPoints like every other
 * movement, so it takes the same row lock, refuses the same overdraft, and
 * writes the same ledger row. There is no second path to a balance.
 *
 * It uses the enum values that were put there for it - COMPENSATION for
 * money, ADJUST for points - so an adjustment is one filter away from being
 * listed, rather than hiding among genuine top-ups.
 *
 * And a REASON IS REQUIRED, stored as the description the member will see on
 * their own statement. An adjustment nobody can explain later is the thing
 * that makes a ledger stop being evidence.
 */
async function adjust(userId, payload, actor) {
  const kind = payload.kind === 'points' ? 'points' : 'money';
  const reason = String(payload.description || '').trim();

  if (!reason) throw new HttpError(400, 'wallet.anAdjustmentNeedsA');

  const wallet = await repo.find(userId);
  if (!wallet) throw new HttpError(404, 'common.notFound');

  const written = kind === 'points'
    ? await adjustPoints(userId, payload, reason)
    : await adjustMoney(userId, payload, reason);

  /*
   * Logged against the LEDGER ROW, not the wallet.
   *
   * The wallet is a cached total that every purchase rewrites; its audit
   * history would be a list of numbers with no reason attached. The ledger
   * row is the event, it is immutable, and it is what somebody reading the
   * log a year later needs to find.
   */
  audit.created(
    actor,
    kind === 'points' ? 'point_logs' : 'wallet_transactions',
    written.id,
    written,
    PAGE
  );

  return written;
}

async function adjustPoints(userId, payload, reason) {
  /* Exact, like every other point movement - see recordPoints. */
  const amount = exactPoints(payload.amount);
  if (!amount) throw new HttpError(400, 'common.valueFailedAValidation');

  return recordPoints({
    user_id: userId,
    type: 'ADJUST',
    amount: amount,
    description: reason,
    reference: payload.reference || null
  });
}

async function adjustMoney(userId, payload, reason) {
  const amount = money(payload.amount);
  if (!amount) throw new HttpError(400, 'common.valueFailedAValidation');

  return recordTransaction({
    user_id: userId,
    type: 'COMPENSATION',
    amount: amount,
    description: reason,
    reference: payload.reference || null
  });
}

module.exports = {
  overview: overview,
  transactions: transactions,
  points: points,
  pointSummary: pointSummary,
  recordPoints: recordPoints,
  recordTransaction: recordTransaction,
  transfer: transfer,
  reconcile: reconcile,
  list: list,
  detail: detail,
  adjust: adjust
};
