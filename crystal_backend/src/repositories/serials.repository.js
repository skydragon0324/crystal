const db = require('../config/db');
const oracle = require('../config/oracle');

const MIRROR = 'oracle_serials';

/**
 * Serial numbers, which live in the vendor's warehouse and are mirrored here.
 *
 * This is the one repository bound to two engines, and the only place in the
 * codebase that knows Oracle exists at all.  Everything above it asks
 * `lookup()` and gets the same shape back either way.
 *
 * The fallback is not an error path.  ORACLE_ENABLED=false is the normal
 * development configuration and a supported production one, and an Oracle
 * that is switched on but unreachable degrades to the same place - because a
 * warehouse outage must not stop a member registering a device they are
 * physically holding.
 */

const WAREHOUSE_TABLE = 'CRYSTAL_SERIALS';

/** The Oracle row, reshaped into the mirror's column names. */
function fromWarehouse(row) {
  if (!row) return null;
  return {
    serial_number: row.SERIAL_NUMBER,
    model_code: row.MODEL_CODE,
    product_id: null,          // the warehouse has never heard of Crystal's ids
    manufactured_on: row.MANUFACTURED_ON,
    warranty_until: row.WARRANTY_UNTIL,
    factory_code: row.FACTORY_CODE,
    batch_code: row.BATCH_CODE,
    status: row.STATUS || 'AVAILABLE',
    source: 'oracle'
  };
}

/**
 * One serial, from the warehouse when it can be reached and from the mirror
 * when it cannot.
 *
 * Every Oracle failure is caught and answered with the mirror.  That is
 * deliberate and is not swallowing an error: the mirror is a correct answer,
 * and the alternative is telling a customer standing at a counter that their
 * device does not exist because a database three provinces away is down.
 */
async function lookup(serialNumber) {
  const serial = String(serialNumber || '').trim().toUpperCase();
  if (!serial) return null;

  const warehouse = oracle.connection();
  if (warehouse) {
    try {
      const row = await warehouse(WAREHOUSE_TABLE)
        .whereRaw('UPPER(SERIAL_NUMBER) = ?', [serial])
        .first();
      if (row) return fromWarehouse(row);
    } catch (err) {
      console.warn('[serials] warehouse lookup failed, using the mirror - ' + err.message);
    }
  }

  const mirrored = await db(MIRROR).whereRaw('UPPER(serial_number) = ?', [serial]).first();
  if (!mirrored) return null;

  return Object.assign({}, mirrored, { source: 'mirror' });
}

function findRow(serialNumber, trx) {
  return (trx || db)(MIRROR)
    .whereRaw('UPPER(serial_number) = ?', [String(serialNumber || '').trim().toUpperCase()])
    .first();
}

/** Marks a mirrored serial as taken, so a second registration can be refused early. */
function markRegistered(serialNumber, trx) {
  return (trx || db)(MIRROR)
    .whereRaw('UPPER(serial_number) = ?', [String(serialNumber || '').trim().toUpperCase()])
    .update({ status: 'REGISTERED' });
}

/**
 * The batch a device came from.
 *
 * Only the mirror carries this - the defect watch groups by it, and grouping
 * has to happen in one database.  A serial only the warehouse knows about
 * contributes to the counts without contributing to the batch breakdown,
 * which is the honest answer rather than a guess.
 */
function batchOf(serialNumber) {
  return db(MIRROR)
    .whereRaw('UPPER(serial_number) = ?', [String(serialNumber || '').trim().toUpperCase()])
    .first('batch_code', 'factory_code', 'manufactured_on');
}

module.exports = {
  MIRROR: MIRROR,
  lookup: lookup,
  findRow: findRow,
  markRegistered: markRegistered,
  batchOf: batchOf
};
