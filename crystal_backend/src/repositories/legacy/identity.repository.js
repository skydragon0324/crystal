const legacy = require('../../config/legacy');

/**
 * WHO THIS MEMBER IS IN THE OTHER SYSTEMS.
 *
 * One person has four identifiers and only one of them is Crystal's:
 *
 *   users.id            Crystal, and ora_pid.users.user_pk - the same number
 *   eshop_pk            the Eshop's own key
 *   appstore_pk         the Appstore WALLET's unique_id
 *   appstore_id         the Appstore STORE's customer_id
 *
 * They live in `ora_pid.user_merge_ids`, one row per person, and every remote
 * call needs the right one. Passing the wrong key does not fail - the service
 * answers about whoever that key belongs to, which is somebody else's orders
 * shown to the wrong member. That is why this is its own file and why nothing
 * outside it guesses.
 *
 * THE FALLBACK IS THE VENDOR'S, and it is worth keeping. When no merge row
 * exists the vendor looks the member up in the legacy customer database by
 * LOGIN NAME and uses that key instead - accounts predating the merge have no
 * row but do have a customer record. Crystal does the same, and answers null
 * when neither finds anything, which the services above turn into "this member
 * has no Eshop account" rather than an error.
 */

const MERGE = 'user_merge_ids';

function conn() {
  return legacy.connection();
}

/**
 * The merge row, or null.
 *
 * Keyed on `pvendor_pk`, which is the platform id - the same number as
 * Crystal's users.id under the identity bridge.
 */
function mergeRow(userId) {
  return conn()(legacy.pid(MERGE)).where('pvendor_pk', userId).first();
}

/**
 * The legacy customer record, by login name.
 *
 * `ora_old_db.customers` is a THIRD database and is not part of this
 * integration - it is read here and nowhere else, only to resolve an id, and
 * only when the merge row is missing. A failure is swallowed rather than
 * raised: an unreachable legacy customer database means this member has no
 * Eshop key, which is a state the pages already handle.
 */
async function customerByLogin(login) {
  if (!login) return null;

  try {
    return await conn()('ora_old_db.customers').where('user_userid', login).first();
  } catch (err) {
    return null;
  }
}

/**
 * Every key this member is known by, resolved once.
 *
 * Called once per request by the services that need it, rather than per
 * remote call - four calls to the Appstore for one page should not be four
 * lookups of the same row.
 */
async function keysOf(userId, login) {
  const merged = await mergeRow(userId);

  if (merged && (merged.eshop_pk || merged.appstore_pk)) {
    return {
      user_pk: Number(userId),
      eshop_pk: merged.eshop_pk || null,
      eshop_id: merged.eshop_id || null,
      appstore_unique_id: merged.appstore_pk || null,
      appstore_customer_id: merged.appstore_id || merged.appstore_pk || null,
      /* The eproduct site is keyed by the LOGIN, not by any of the pks. */
      login: merged.pvendor_id || login || null,
      source: 'merge'
    };
  }

  const customer = await customerByLogin(login || (merged && merged.pvendor_id));

  return {
    user_pk: Number(userId),
    eshop_pk: customer ? customer.user_pk : null,
    eshop_id: customer ? customer.user_userid : null,
    appstore_unique_id: customer ? customer.user_pk : null,
    appstore_customer_id: customer ? customer.user_userid : null,
    login: (customer && customer.user_userid) || login || null,
    source: customer ? 'customers' : 'none'
  };
}

module.exports = {
  MERGE: MERGE,
  mergeRow: mergeRow,
  keysOf: keysOf
};
