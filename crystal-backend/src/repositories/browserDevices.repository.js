'use strict';

const db = require('../config/db');

const DEVICES = 'browser_device_identities';
const CHALLENGES = 'login_challenges';

/**
 * THE SIM CARDS THE BROWSER MAY SIGN WITH, and the challenges they are asked.
 *
 * A row here is a CARD, not a member: there is no user id in the table and no
 * foreign key to one, because the rule this is built to is that a valid card
 * may sign in any account whose user ID and password are correct. See
 * sql/deltas/036 and the note in services/memberAuth.service.js.
 */

/** The card with this number, if it is one we accept today. */
function findByCid(cid) {
  return db(DEVICES)
    .where({ cid: String(cid || '').trim(), status: 'ACTIVE', is_deleted: false })
    .first('id', 'cid', 'public_key', 'subject', 'serial_number', 'not_after', 'last_login_at');
}

/** Registered at all - including suspended ones, which a re-register revives. */
function findAnyByCid(cid) {
  return db(DEVICES).where({ cid: String(cid || '').trim() }).first();
}

/**
 * Remembers a card, or replaces what we knew about it.
 *
 * A card that registers again - a reissued SIM, a certificate renewed - keeps
 * its row and its id, so the challenges already written against it stay
 * attached to the thing they were issued for.
 */
async function register(card) {
  const existing = await findAnyByCid(card.cid);

  const values = {
    cid: String(card.cid).trim(),
    mik_certificate: card.certificate,
    public_key: card.publicKey,
    subject: card.subject || null,
    serial_number: card.serialNumber || null,
    not_after: card.notAfter || null,
    status: 'ACTIVE',
    is_deleted: false
  };

  if (existing) {
    const updated = await db(DEVICES).where({ id: existing.id }).update(values).returning('*');
    return updated[0];
  }

  const inserted = await db(DEVICES).insert(values).returning('*');
  return inserted[0];
}

function touch(id) {
  return db(DEVICES).where({ id: id }).update({ last_login_at: db.fn.now() });
}

/* ------------------------------------------------------------------ */
/*  challenges                                                         */
/* ------------------------------------------------------------------ */

function issue(deviceId, challenge, seconds) {
  return db(CHALLENGES)
    .insert({
      device_id: deviceId,
      challenge: challenge,
      expires_at: db.raw("now() + (? || ' seconds')::interval", [String(seconds)])
    })
    .returning('*')
    .then(function (rows) { return rows[0]; });
}

/**
 * SPENDS A CHALLENGE, and says whether it was there to spend.
 *
 * One statement, not a read and then a write: two of them would let the same
 * challenge be claimed twice by two requests arriving together, which is the
 * one thing this table exists to prevent. `used_at IS NULL` is part of the
 * UPDATE, so the second request changes no rows and is told no.
 */
async function spend(deviceId, challenge) {
  const spent = await db(CHALLENGES)
    .where({ device_id: deviceId, challenge: String(challenge || '') })
    .whereNull('used_at')
    .where('expires_at', '>', db.fn.now())
    .update({ used_at: db.fn.now() })
    .returning('*');

  return spent[0] || null;
}

/**
 * Forgets the challenges that are spent or out of time.
 *
 * Called on the way in to issuing one, so the table stays the size of what is
 * outstanding rather than of every sign-in this deployment has ever served.
 */
function sweep() {
  return db(CHALLENGES)
    .where('expires_at', '<', db.fn.now())
    .orWhereNotNull('used_at')
    .del();
}

module.exports = {
  findByCid: findByCid,
  findAnyByCid: findAnyByCid,
  register: register,
  touch: touch,
  issue: issue,
  spend: spend,
  sweep: sweep
};
