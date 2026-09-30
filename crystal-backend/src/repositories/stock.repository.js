const db = require('../config/db');
const { applySearch } = require('../utils/query');

const STOCK = 'part_stock';
const MOVES = 'part_movements';
const BALANCE = 'v_part_balance';

/**
 * Parts on shelves, and every movement of them.
 *
 * The read side is the v_part_balance view, which already knows what
 * "available" and "low" mean; the write side is a locked read of part_stock
 * followed by a movement row and a new cached total, always inside one
 * transaction.  Nothing in this file writes one of those two without the
 * other - see services/stock.service.js, which is the only caller that may.
 */

const SEARCHABLE = ['b.part_no', 'b.part_name', 'b.agency_name', 'b.bin'];

function applyFilters(qb, filters) {
  if (filters.agency_id) qb.where('b.agency_id', filters.agency_id);
  if (filters.part_id) qb.where('b.part_id', filters.part_id);
  if (filters.component) qb.where('b.component', filters.component);
  if (filters.state) qb.where('b.stock_state', filters.state);
  // "Anything I should be ordering" is two states, and asking for it as two
  // separate filters is how a stock desk misses half its shortages.
  if (filters.short) qb.whereIn('b.stock_state', ['OUT', 'LOW']);
  return qb;
}

async function search(filters, paging) {
  const qb = applyFilters(applySearch(db(BALANCE + ' as b'), SEARCHABLE, filters.q), filters);

  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const sumRow = await qb.clone().clearSelect().first(
    db.raw("COUNT(*) FILTER (WHERE b.stock_state = 'OUT') AS out_cnt"),
    db.raw("COUNT(*) FILTER (WHERE b.stock_state = 'LOW') AS low_cnt"),
    db.raw('COALESCE(SUM(b.stock_value), 0) AS stock_value'),
    db.raw('COALESCE(SUM(b.shortfall), 0) AS shortfall')
  );

  const rows = await qb.select('b.*')
    .orderBy('b.' + paging.sort, paging.dir)
    .limit(paging.limit).offset(paging.offset);

  return {
    rows: rows,
    total: Number(countRow.c),
    summary: {
      out_cnt: Number(sumRow.out_cnt),
      low_cnt: Number(sumRow.low_cnt),
      stock_value: Number(sumRow.stock_value),
      shortfall: Number(sumRow.shortfall)
    }
  };
}

/** One shelf line, as the view sees it. */
function findBalance(agencyId, partId) {
  return db(BALANCE + ' as b').where({ 'b.agency_id': agencyId, 'b.part_id': partId }).first('b.*');
}

/** Everything short at one centre, for the automatic reorder run. */
function shortagesOf(agencyId) {
  return db(BALANCE + ' as b')
    .where('b.agency_id', agencyId)
    .whereIn('b.stock_state', ['OUT', 'LOW'])
    .orderBy('b.shortfall', 'desc')
    .select('b.*');
}

/** Every centre with something short, for the console's alert badge. */
function shortageCounts() {
  return db(BALANCE + ' as b')
    .whereIn('b.stock_state', ['OUT', 'LOW'])
    .groupBy('b.agency_id', 'b.agency_name')
    .orderBy('out_cnt', 'desc')
    .select(
      'b.agency_id', 'b.agency_name',
      db.raw("COUNT(*) FILTER (WHERE b.stock_state = 'OUT') AS out_cnt"),
      db.raw("COUNT(*) FILTER (WHERE b.stock_state = 'LOW') AS low_cnt")
    );
}

/* ------------------------------------------------------------------ */
/*  the write side                                                     */
/* ------------------------------------------------------------------ */

/**
 * The stock row for one part at one centre, locked until the transaction
 * ends.
 *
 * This is the whole of the concurrency story.  Two clerks issuing the last
 * screen at the same moment both read on_hand = 1, both decide it is enough
 * and both decrement - unless the second one is made to wait here until the
 * first has finished.  It takes a `trx` rather than defaulting to the pool
 * because a row lock outside a transaction is released immediately, which
 * would look like it worked.
 */
function lock(agencyId, partId, trx) {
  return trx(STOCK).where({ agency_id: agencyId, part_id: partId }).forUpdate().first();
}

/**
 * Creates the shelf line if this centre has never held this part.
 *
 * A first receipt should not have to be preceded by somebody setting the part
 * up by hand, and ON CONFLICT DO NOTHING means two concurrent first receipts
 * do not race each other into a duplicate.
 */
function ensure(agencyId, partId, trx) {
  return (trx || db)(STOCK)
    .insert({ agency_id: agencyId, part_id: partId, on_hand: 0, reserved: 0 })
    .onConflict(['agency_id', 'part_id'])
    .ignore();
}

function setOnHand(agencyId, partId, onHand, trx) {
  return trx(STOCK)
    .where({ agency_id: agencyId, part_id: partId })
    .update({ on_hand: onHand, updated_at: db.fn.now() })
    .returning('*');
}

/**
 * Moves the reservation without touching on_hand.
 *
 * Reserving is a promise, not a movement: the part is still on the shelf and
 * still in the stock value.  Only issuing takes it off, which is why this
 * writes no ledger row - there is nothing to record until something physically
 * moves.
 */
function addReserved(agencyId, partId, delta, trx) {
  return trx(STOCK)
    .where({ agency_id: agencyId, part_id: partId })
    .update({
      reserved: db.raw('GREATEST(reserved + ?, 0)', [Number(delta)]),
      updated_at: db.fn.now()
    })
    .returning('*');
}

function setReorderLevel(agencyId, partId, level, bin, trx) {
  const patch = { reorder_level: Number(level) || 0, updated_at: db.fn.now() };
  if (bin !== undefined) patch.bin = bin;
  return (trx || db)(STOCK)
    .where({ agency_id: agencyId, part_id: partId })
    .update(patch)
    .returning('*');
}

function insertMovement(data, trx) {
  return (trx || db)(MOVES).insert(data).returning('*');
}

const MOVE_SEARCHABLE = ['p.part_no', 'p.name', 'm.note', 'm.manager_name'];

/** The ledger, which is what somebody reads when the cache looks wrong. */
async function movements(filters, paging) {
  const qb = applySearch(
    db(MOVES + ' as m')
      .join('parts as p', 'p.id', 'm.part_id')
      .join('agencies as g', 'g.id', 'm.agency_id'),
    MOVE_SEARCHABLE, filters.q
  );

  if (filters.agency_id) qb.where('m.agency_id', filters.agency_id);
  if (filters.part_id) qb.where('m.part_id', filters.part_id);
  if (filters.movement) qb.where('m.movement', filters.movement);
  if (filters.reference_type) qb.where('m.reference_type', filters.reference_type);
  if (filters.reference_id) qb.where('m.reference_id', filters.reference_id);
  if (filters.from) qb.where('m.created_at', '>=', filters.from);
  if (filters.to) qb.whereRaw("m.created_at < (?::date + interval '1 day')", [filters.to]);

  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const rows = await qb.select(
    'm.*', 'p.part_no', 'p.name as part_name', 'p.component', 'g.name as agency_name'
  ).orderBy('m.' + paging.sort, paging.dir).limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
}

/**
 * The ledger against the cache, one row per disagreement.
 *
 * Nothing calls this in the request path.  It exists because a cached total
 * is only trustworthy if somebody can prove it, and `npm run check` does -
 * the same way the wallet's point ledger is reconciled in section 7.
 */
function reconcile() {
  return db(STOCK + ' as s')
    .leftJoin(
      db(MOVES).select('agency_id', 'part_id', db.raw('SUM(quantity) AS ledger'))
        .groupBy('agency_id', 'part_id').as('m'),
      function () {
        this.on('m.agency_id', 's.agency_id').andOn('m.part_id', 's.part_id');
      }
    )
    .whereRaw('s.on_hand <> COALESCE(m.ledger, 0)')
    .select('s.agency_id', 's.part_id', 's.on_hand', db.raw('COALESCE(m.ledger, 0) AS ledger'));
}

module.exports = {
  STOCK: STOCK,
  MOVES: MOVES,
  BALANCE: BALANCE,

  search: search,
  findBalance: findBalance,
  shortagesOf: shortagesOf,
  shortageCounts: shortageCounts,

  lock: lock,
  ensure: ensure,
  setOnHand: setOnHand,
  addReserved: addReserved,
  setReorderLevel: setReorderLevel,
  insertMovement: insertMovement,

  movements: movements,
  reconcile: reconcile
};
