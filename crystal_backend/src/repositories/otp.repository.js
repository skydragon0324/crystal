const db = require('../config/db');

const TABLE = 'otp_codes';

/**
 * One-time codes for the mobile sign-in (spec 5).
 *
 * Append only: a consumed or expired code is kept rather than deleted,
 * because "I never received a code" and "I received three" are both questions
 * somebody asks later, and neither can be answered from a table that threw
 * the evidence away.
 */

/**
 * The newest code for a phone and purpose that is still usable.
 *
 * Unconsumed and unexpired are both conditions here rather than checks in the
 * caller, so there is no window in which a service reads an expired row and
 * decides for itself whether it counts.
 */
function findActive(phone, purpose, trx) {
  return (trx || db)(TABLE)
    .where({ phone: phone, purpose: purpose || 'LOGIN' })
    .whereNull('consumed_at')
    .where('expires_at', '>', db.fn.now())
    .orderBy('created_at', 'desc')
    .first();
}

/**
 * Retires every outstanding code for a phone before a new one is issued.
 *
 * Without this a member who asks twice has two live codes and the older one
 * keeps working - which is a longer window than the expiry was meant to give.
 */
function invalidateAll(phone, purpose, trx) {
  return (trx || db)(TABLE)
    .where({ phone: phone, purpose: purpose || 'LOGIN' })
    .whereNull('consumed_at')
    .update({ consumed_at: db.fn.now() });
}

function issue(data, trx) {
  return (trx || db)(TABLE).insert(data).returning('*');
}

function incrementAttempts(id, trx) {
  return (trx || db)(TABLE).where('id', id).increment('attempts', 1);
}

function consume(id, trx) {
  return (trx || db)(TABLE).where('id', id).update({ consumed_at: db.fn.now() });
}

/**
 * When the last code for this phone was sent, for the resend cooldown.
 *
 * Read from the table rather than held in memory, so the cooldown survives a
 * restart and applies across however many API processes are running.
 */
function lastIssuedAt(phone, purpose) {
  return db(TABLE)
    .where({ phone: phone, purpose: purpose || 'LOGIN' })
    .orderBy('created_at', 'desc')
    .first('created_at');
}

module.exports = {
  TABLE: TABLE,
  findActive: findActive,
  invalidateAll: invalidateAll,
  issue: issue,
  incrementAttempts: incrementAttempts,
  consume: consume,
  lastIssuedAt: lastIssuedAt
};
