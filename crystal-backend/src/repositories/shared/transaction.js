const db = require('../../config/db');

/**
 * The unit of work.
 *
 * A service decides that several writes have to succeed or fail together;
 * only a repository is allowed to know that "together" means a knex
 * transaction.  This is the seam between those two facts: the service calls
 * `transaction(fn)` and passes the `trx` it receives down into whichever
 * repository functions take part, and every repository function in this
 * codebase takes an optional trailing `trx` for exactly that reason.
 *
 *   await transaction(async function (trx) {
 *     await stock.consume(agencyId, partId, qty, trx);
 *     await tickets.addItem(ticketId, line, trx);
 *   });
 *
 * Called with no transaction a repository uses the pooled connection, so a
 * single write needs none of this.
 */
function transaction(handler) {
  return db.transaction(handler);
}

module.exports = { transaction: transaction };
