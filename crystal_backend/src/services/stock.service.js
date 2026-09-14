const repo = require('../repositories/stock.repository');
const parts = require('../repositories/parts.repository');
const { transaction } = require('../repositories/shared/transaction');
const { HttpError } = require('../utils/response');
const audit = require('./audit.service');

const PAGE = '/admin/service/stock';

const SORTABLE = ['part_no', 'part_name', 'agency_name', 'on_hand', 'available', 'shortfall', 'stock_value'];
const DEFAULT_SORT = 'part_no';

const MOVE_SORTABLE = ['id', 'created_at', 'quantity', 'part_no'];
const MOVE_DEFAULT_SORT = 'created_at';

/**
 * The parts ledger.
 *
 * One rule, applied everywhere: a movement row and the cached total are
 * written together, inside one transaction, after the stock row has been
 * locked.  `move()` below is the only function in the codebase that writes
 * either of them, and every other operation here - receiving, issuing,
 * returning, scrapping, a stocktake correction - is a call to it with a
 * different sign and a different reason.
 *
 * That is deliberate.  The moment there are two places that can decrement a
 * shelf, one of them is the one that forgets the lock.
 */

/** The signs, so a caller cannot pass RECEIPT and a negative quantity. */
const DIRECTION = {
  RECEIPT: 1,
  RETURN: 1,
  ISSUE: -1,
  SCRAP: -1,
  TRANSFER: -1,
  ADJUST: 0   // an adjustment is signed by the caller: it can go either way
};

function search(filters, paging) {
  return repo.search(filters, paging);
}

function movements(filters, paging) {
  return repo.movements(filters, paging);
}

function shortagesOf(agencyId) {
  return repo.shortagesOf(agencyId);
}

function shortageCounts() {
  return repo.shortageCounts();
}

/**
 * One movement, and the cached total it implies.
 *
 * `quantity` is always given as a positive number and the direction decides
 * the sign, except for ADJUST where the caller genuinely means either.  That
 * removes the whole class of bug where a receipt is recorded with a minus in
 * front of it and the shelf quietly empties.
 *
 * Runs inside the caller's transaction when it is given one - issuing a part
 * has to succeed or fail with the ticket line that consumed it, not
 * separately.
 */
async function move(input, actor, trx) {
  const direction = DIRECTION[input.movement];
  if (direction === undefined) throw new HttpError(400, 'common.valueFailedAValidation');

  const magnitude = Math.abs(Math.round(Number(input.quantity) || 0));
  if (!magnitude) throw new HttpError(400, 'stock.aMovementNeedsA');

  const quantity = direction === 0
    ? Math.round(Number(input.quantity))
    : magnitude * direction;

  if (!quantity) throw new HttpError(400, 'stock.aMovementNeedsA');

  const run = async function (tx) {
    await repo.ensure(input.agency_id, input.part_id, tx);

    const shelf = await repo.lock(input.agency_id, input.part_id, tx);
    if (!shelf) throw new HttpError(404, 'stock.thisPartIsNot');

    const after = shelf.on_hand + quantity;
    if (after < 0) {
      const part = await parts.findRow(input.part_id, tx);
      throw new HttpError(409, 'stock.onlyOfAreAvailable', null, {
        n: shelf.on_hand,
        part: part ? part.name : input.part_id
      });
    }

    await repo.setOnHand(input.agency_id, input.part_id, after, tx);

    const rows = await repo.insertMovement({
      agency_id: input.agency_id,
      part_id: input.part_id,
      movement: input.movement,
      quantity: quantity,
      balance_after: after,
      unit_cost: input.unit_cost === undefined ? 0 : input.unit_cost,
      reference_type: input.reference_type || null,
      reference_id: input.reference_id || null,
      note: input.note || null,
      manager_id: actor ? actor.manager_id : null,
      manager_name: actor ? actor.manager_name : null
    }, tx);

    return rows[0];
  };

  const row = trx ? await run(trx) : await transaction(run);

  audit.created(actor, repo.MOVES, row.id, row, PAGE);
  return row;
}

/**
 * A promise against stock, made when a part goes onto a ticket's bill and
 * released when it comes off it.
 *
 * No ledger row: nothing has moved.  The part is still on the shelf, still in
 * the stock value, and still countable by anyone doing a stocktake - it is
 * simply spoken for.  What changes is what the NEXT ticket can be told.
 */
async function reserve(agencyId, partId, quantity, trx) {
  const run = async function (tx) {
    await repo.ensure(agencyId, partId, tx);
    const shelf = await repo.lock(agencyId, partId, tx);
    if (!shelf) throw new HttpError(404, 'stock.thisPartIsNot');

    const available = shelf.on_hand - shelf.reserved;
    if (quantity > 0 && available < quantity) {
      const part = await parts.findRow(partId, tx);
      throw new HttpError(409, 'stock.onlyOfAreAvailable', null, {
        n: available,
        part: part ? part.name : partId
      });
    }

    const rows = await repo.addReserved(agencyId, partId, quantity, tx);
    return rows[0];
  };

  return trx ? run(trx) : transaction(run);
}

/** Releasing is reserving a negative amount, and can never fail on stock. */
function release(agencyId, partId, quantity, trx) {
  return reserve(agencyId, partId, -Math.abs(Number(quantity) || 0), trx);
}

/**
 * A part leaving the shelf for a ticket: the reservation becomes a movement.
 *
 * Both halves in the caller's transaction, because a released reservation
 * with no matching issue is a shelf that says it has stock it does not have -
 * which is the one failure this whole file exists to prevent.
 */
async function issueToTicket(agencyId, partId, quantity, ticketId, unitCost, actor, trx) {
  await release(agencyId, partId, quantity, trx);
  return move({
    agency_id: agencyId,
    part_id: partId,
    movement: 'ISSUE',
    quantity: quantity,
    unit_cost: unitCost,
    reference_type: 'TICKET',
    reference_id: ticketId
  }, actor, trx);
}

/** The other direction: a part put back because the repair did not need it. */
function returnFromTicket(agencyId, partId, quantity, ticketId, unitCost, actor, trx) {
  return move({
    agency_id: agencyId,
    part_id: partId,
    movement: 'RETURN',
    quantity: quantity,
    unit_cost: unitCost,
    reference_type: 'TICKET',
    reference_id: ticketId
  }, actor, trx);
}

/**
 * A stocktake correction.
 *
 * Given as the counted figure rather than as a difference, because that is
 * what the person holding the clipboard actually knows.  Working out the
 * delta is arithmetic; asking them to do it is how a correction of -3 gets
 * entered as 3.
 */
async function stocktake(agencyId, partId, counted, note, actor) {
  return transaction(async function (trx) {
    await repo.ensure(agencyId, partId, trx);
    const shelf = await repo.lock(agencyId, partId, trx);
    if (!shelf) throw new HttpError(404, 'stock.thisPartIsNot');

    const delta = Math.round(Number(counted)) - shelf.on_hand;
    if (!delta) return null;   // counted what was expected: nothing happened

    return move({
      agency_id: agencyId,
      part_id: partId,
      movement: 'ADJUST',
      quantity: delta,
      reference_type: 'STOCKTAKE',
      note: note || ('counted ' + counted + ', system had ' + shelf.on_hand)
    }, actor, trx);
  });
}

/** The reorder level is a setting on the shelf, not a movement. */
async function setLevel(agencyId, partId, level, bin, actor) {
  await repo.ensure(agencyId, partId);
  const rows = await repo.setReorderLevel(agencyId, partId, level, bin);
  if (!rows.length) throw new HttpError(404, 'common.notFound');

  audit.updated(actor, repo.STOCK, rows[0].id, null, rows[0], PAGE);
  return rows[0];
}

/** Used by `npm run check`: the ledger and the cache must agree. */
function reconcile() {
  return repo.reconcile();
}

module.exports = {
  PAGE: PAGE,
  SORTABLE: SORTABLE,
  DEFAULT_SORT: DEFAULT_SORT,
  MOVE_SORTABLE: MOVE_SORTABLE,
  MOVE_DEFAULT_SORT: MOVE_DEFAULT_SORT,

  search: search,
  movements: movements,
  shortagesOf: shortagesOf,
  shortageCounts: shortageCounts,

  move: move,
  reserve: reserve,
  release: release,
  issueToTicket: issueToTicket,
  returnFromTicket: returnFromTicket,
  stocktake: stocktake,
  setLevel: setLevel,
  reconcile: reconcile
};
