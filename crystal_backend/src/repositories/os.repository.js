const db = require('../config/db');

const VERSIONS = 'os_versions';
const HISTORY = 'product_os_history';

/**
 * TWO LISTS THAT ARE NOT THE SAME LIST, and this file holds both.
 *
 * `os_versions` is the Crystal OS product itself - what is in a release, what
 * it looks like, when it came out. That is the Support / Crystal OS page.
 *
 * `product_os_history` is a PRODUCT's own update record, and it no longer
 * joins to os_versions at all. The firmware a television or a set-top box
 * ships is not a Crystal OS build, and even on the handsets the version a
 * device reports is its own string - so tying the two together meant a
 * version could only be recorded against a device if somebody first invented
 * a matching release row for it.
 *
 * The date on a history row is the date THIS MODEL received the version,
 * which is not the date the version was released: a build reaches the
 * flagship in March and the budget line in June, and showing one date for
 * both is what makes people think their phone has been forgotten.
 */

function published(limit) {
  return db(VERSIONS)
    .where({ is_deleted: false, status: 'PUBLISHED' })
    .orderBy('release_date', 'desc')
    .limit(limit || 20)
    .select('*');
}

function findRow(id, trx) {
  return (trx || db)(VERSIONS).where('id', id).first();
}

function latest() {
  return db(VERSIONS)
    .where({ is_deleted: false, status: 'PUBLISHED' })
    .orderBy('release_date', 'desc')
    .first();
}

/** One product's update history, in the order the console put them in. */
function historyOf(productId) {
  return db(HISTORY)
    .where('product_id', productId)
    .where('is_deleted', false)
    .orderBy([{ column: 'sort_order' }, { column: 'release_date', order: 'desc' }])
    .select('*');
}

/**
 * The same, for many products at once.
 *
 * The listing pages want to know whether a device has a tracked update
 * record at all; doing that per tile is twenty queries to draw one screen.
 */
function historyOfProducts(productIds) {
  if (!productIds || !productIds.length) return Promise.resolve([]);

  return db(HISTORY)
    .whereIn('product_id', productIds)
    .where('is_deleted', false)
    .orderBy([{ column: 'product_id' }, { column: 'sort_order' }])
    .select('*');
}

/*
 * `rolloutOf` USED TO LIVE HERE and is gone.
 *
 * It answered "which handsets has release 5.2 reached", which was only a
 * question while a history row pointed at a release. It does not any more:
 * a device records the version string it is running, and two devices
 * reporting "5.2" are not evidence that they got the same build.
 */

function addHistory(data, trx) {
  return (trx || db)(HISTORY).insert(data).returning('*');
}

function updateHistory(id, data, trx) {
  return (trx || db)(HISTORY).where('id', id).update(data).returning('*');
}

/** Soft, like every other table the console edits. */
function removeHistory(id, trx) {
  return (trx || db)(HISTORY).where('id', id).update({ is_deleted: true });
}

function removeHistoryForProduct(productId, trx) {
  return (trx || db)(HISTORY).where('product_id', productId).del();
}

module.exports = {
  VERSIONS: VERSIONS,
  HISTORY: HISTORY,
  published: published,
  findRow: findRow,
  latest: latest,
  historyOf: historyOf,
  historyOfProducts: historyOfProducts,
  addHistory: addHistory,
  updateHistory: updateHistory,
  removeHistory: removeHistory,
  removeHistoryForProduct: removeHistoryForProduct
};
