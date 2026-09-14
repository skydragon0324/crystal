const repo = require('../repositories/replenishments.repository');
const parts = require('../repositories/parts.repository');
const agencies = require('../repositories/agencies.repository');
const stockRepo = require('../repositories/stock.repository');
const stock = require('./stock.service');
const { transaction } = require('../repositories/shared/transaction');
const { HttpError } = require('../utils/response');
const { money } = require('../utils/query');
const audit = require('./audit.service');

const PAGE = '/admin/service/replenishments';
const TABLE = repo.TABLE;

const SORTABLE = ['id', 'order_no', 'requested_on', 'expected_on', 'status', 'total_cost'];
const DEFAULT_SORT = 'requested_on';

/** 0 draft, 1 submitted, 2 approved, 3 shipped, 4 received, 9 cancelled. */
const STATUS = { DRAFT: 0, SUBMITTED: 1, APPROVED: 2, SHIPPED: 3, RECEIVED: 4, CANCELLED: 9 };

const FLOW = {
  0: [1, 9],
  1: [2, 9],
  2: [3, 9],
  3: [4, 9],
  4: [],
  9: []
};

/**
 * Getting parts to the centres that need them.
 *
 * The only genuinely interesting moment is receipt: that is where a piece of
 * paper becomes stock, and it is the only place in this file that writes to
 * the ledger.  Everything before it is a document.
 */

function search(filters, paging) {
  return repo.search(filters, paging);
}

async function detail(id, deleted) {
  const order = await repo.findById(id, deleted);
  if (!order) throw new HttpError(404, 'common.notFound');
  const items = await repo.itemsOf(id);
  return { order: order, items: items };
}

async function create(body, actor) {
  if (!body.agency_id) throw new HttpError(400, 'common.aServiceCentreIs');

  const agency = await agencies.findRow(body.agency_id);
  if (!agency) throw new HttpError(404, 'common.notFound');

  return transaction(async function (trx) {
    const rows = await repo.insert({
      order_no: await repo.nextNumber('P' + stamp(), trx),
      agency_id: body.agency_id,
      status: STATUS.DRAFT,
      expected_on: body.expected_on || null,
      is_auto: !!body.is_auto,
      remark: body.remark || null
    }, trx);

    audit.created(actor, TABLE, rows[0].id, rows[0], PAGE);
    return rows[0];
  });
}

function stamp() {
  const now = new Date();
  return String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, '0');
}

/**
 * Everything one centre is short of, as a draft order.
 *
 * The quantity is the shortfall the balance view already worked out, so what
 * gets ordered is what brings the shelf back to its reorder level and not a
 * number somebody guessed.  Marked is_auto, because an order nobody has
 * looked at is a different thing from one somebody asked for - and the list
 * says which.
 */
async function fromShortages(agencyId, actor) {
  const shortages = await stock.shortagesOf(agencyId);
  if (!shortages.length) throw new HttpError(400, 'replenishments.aReplenishmentNeedsAt');

  const order = await create({ agency_id: agencyId, is_auto: true }, actor);

  for (let i = 0; i < shortages.length; i += 1) {
    const line = shortages[i];
    // eslint-disable-next-line no-await-in-loop
    await addItem(order.id, {
      part_id: line.part_id,
      quantity: line.shortfall,
      unit_cost: line.unit_cost
    }, actor);
  }

  return detail(order.id, false);
}

async function addItem(id, input, actor) {
  return transaction(async function (trx) {
    const order = await repo.lockRow(id, trx);
    if (!order || order.is_deleted) throw new HttpError(404, 'common.notFound');
    if (order.status >= STATUS.SHIPPED) throw new HttpError(409, 'replenishments.thisReplenishmentHasAlready');

    const part = await parts.findRow(input.part_id, trx);
    if (!part) throw new HttpError(404, 'common.partNotFound');

    const quantity = Math.max(1, Math.round(Number(input.quantity) || 1));
    const unitCost = input.unit_cost === undefined ? Number(part.unit_cost) : money(input.unit_cost);

    const rows = await repo.upsertItem(id, {
      part_id: part.id,
      quantity: quantity,
      unit_cost: unitCost,
      amount: money(unitCost * quantity)
    }, trx);

    await recalculate(id, trx);
    audit.created(actor, repo.ITEMS, rows[0].id, rows[0], PAGE);
    return rows[0];
  });
}

async function updateItem(id, itemId, input, actor) {
  return transaction(async function (trx) {
    const order = await repo.lockRow(id, trx);
    if (!order || order.is_deleted) throw new HttpError(404, 'common.notFound');
    if (order.status >= STATUS.RECEIVED) throw new HttpError(409, 'replenishments.thisReplenishmentHasAlready');

    const item = await repo.findItem(itemId, trx);
    if (!item || item.replenishment_id !== Number(id)) throw new HttpError(404, 'common.notFound');

    const quantity = input.quantity === undefined
      ? item.quantity
      : Math.max(1, Math.round(Number(input.quantity)));
    const unitCost = input.unit_cost === undefined ? Number(item.unit_cost) : money(input.unit_cost);

    const rows = await repo.updateItem(itemId, {
      quantity: quantity,
      unit_cost: unitCost,
      amount: money(unitCost * quantity)
    }, trx);

    await recalculate(id, trx);
    audit.updated(actor, repo.ITEMS, itemId, item, rows[0], PAGE);
    return rows[0];
  });
}

async function removeItem(id, itemId, actor) {
  return transaction(async function (trx) {
    const order = await repo.lockRow(id, trx);
    if (!order || order.is_deleted) throw new HttpError(404, 'common.notFound');
    if (order.status >= STATUS.RECEIVED) throw new HttpError(409, 'replenishments.thisReplenishmentHasAlready');

    const item = await repo.findItem(itemId, trx);
    if (!item || item.replenishment_id !== Number(id)) throw new HttpError(404, 'common.notFound');

    await repo.removeItem(itemId, trx);
    await recalculate(id, trx);
    audit.deleted(actor, repo.ITEMS, itemId, item, PAGE);
  });
}

async function recalculate(id, trx) {
  const totals = await repo.totalsOf(id, trx);
  return repo.update(id, { total_cost: money(totals.total_cost) }, trx);
}

async function transition(id, to, input, actor) {
  const next = Number(to);

  return transaction(async function (trx) {
    const order = await repo.lockRow(id, trx);
    if (!order || order.is_deleted) throw new HttpError(404, 'common.notFound');
    if (order.status === next) return order;

    const allowed = FLOW[order.status] || [];
    if (allowed.indexOf(next) === -1) {
      if (order.status === STATUS.RECEIVED) {
        throw new HttpError(409, 'replenishments.thisReplenishmentHasAlready');
      }
      throw new HttpError(409, 'common.valueFailedAValidation');
    }

    const totals = await repo.totalsOf(id, trx);
    if (next === STATUS.SUBMITTED && !Number(totals.line_cnt)) {
      throw new HttpError(400, 'replenishments.aReplenishmentNeedsAt');
    }

    const patch = { status: next };

    if (next === STATUS.APPROVED) {
      patch.approved_by = actor ? actor.manager_id : null;
      patch.approved_at = new Date();
    }

    if (next === STATUS.RECEIVED) {
      patch.received_on = (input && input.received_on) || new Date().toISOString().slice(0, 10);
      await receiveInto(order, input, actor, trx);
    }

    const rows = await repo.update(id, patch, trx);
    audit.updated(actor, TABLE, id, order, rows[0], PAGE);
    return rows[0];
  });
}

/**
 * Receipt: the document becomes stock.
 *
 * A short delivery is normal and has to be recordable, so the movement is
 * written for what ARRIVED rather than for what was ordered - and the line
 * keeps both numbers, because "we ordered ten and six came" is a fact the
 * parts desk needs next month when it decides whether to order from this
 * supplier again.
 *
 * All of it inside the caller's transaction: a receipt that half wrote its
 * movements is a shelf that disagrees with its own ledger, which is the one
 * outcome the whole stock module exists to prevent.
 */
async function receiveInto(order, input, actor, trx) {
  const items = await repo.itemsOf(order.id, trx);
  if (!items.length) throw new HttpError(400, 'replenishments.aReplenishmentNeedsAt');

  // The receipt form sends what actually turned up, line by line. Nothing
  // sent means the whole order arrived, which is the common case.
  const received = {};
  ((input && input.lines) || []).forEach(function (line) {
    received[Number(line.item_id)] = Math.max(0, Math.round(Number(line.received_quantity) || 0));
  });

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const quantity = received[item.id] === undefined ? item.quantity : Math.min(received[item.id], item.quantity);
    if (!quantity) continue;

    // eslint-disable-next-line no-await-in-loop
    await repo.updateItem(item.id, { received_quantity: quantity }, trx);

    // eslint-disable-next-line no-await-in-loop
    await stock.move({
      agency_id: order.agency_id,
      part_id: item.part_id,
      movement: 'RECEIPT',
      quantity: quantity,
      unit_cost: item.unit_cost,
      reference_type: 'REPLENISHMENT',
      reference_id: order.id,
      note: order.order_no
    }, actor, trx);
  }
}

async function update(id, data, actor) {
  if (!Object.keys(data).length) throw new HttpError(400, 'common.nothingToUpdate');

  const previous = await repo.findRow(id);
  if (!previous) throw new HttpError(404, 'common.notFound');
  if (previous.status >= STATUS.RECEIVED) {
    throw new HttpError(409, 'replenishments.thisReplenishmentHasAlready');
  }

  const rows = await repo.update(id, data);
  audit.updated(actor, TABLE, id, previous, rows[0], PAGE);
  return rows[0];
}

async function remove(id, actor) {
  const previous = await repo.findRow(id);
  if (!previous) throw new HttpError(404, 'common.notFound');
  if (previous.status === STATUS.RECEIVED) {
    throw new HttpError(409, 'replenishments.thisReplenishmentHasAlready');
  }

  await repo.softDelete(id);
  audit.deleted(actor, TABLE, id, previous, PAGE);
}

/**
 * The nightly reorder run.
 *
 * One draft order per centre that is short of something, and nothing at all
 * for a centre that already has an open one - raising a second order for
 * parts that are already on their way is how a stock room ends up with twice
 * what it needs and no money left.
 */
async function sweep(actor) {
  const counts = await stockRepo.shortageCounts();
  const raised = [];

  for (let i = 0; i < counts.length; i += 1) {
    const agencyId = counts[i].agency_id;

    // eslint-disable-next-line no-await-in-loop
    const open = await repo.search({ agency_id: agencyId, open: true }, { sort: 'id', dir: 'asc', limit: 1, offset: 0 });
    if (open.total) continue;

    try {
      // eslint-disable-next-line no-await-in-loop
      const created = await fromShortages(agencyId, actor);
      raised.push(created.order.order_no);
    } catch (err) {
      console.warn('[replenishment] could not raise an order for agency ' + agencyId + ': ' + err.message);
    }
  }

  return raised;
}

module.exports = {
  PAGE: PAGE,
  STATUS: STATUS,
  SORTABLE: SORTABLE,
  DEFAULT_SORT: DEFAULT_SORT,
  COLUMNS: ['agency_id', 'expected_on', 'remark'],

  search: search,
  detail: detail,
  create: create,
  fromShortages: fromShortages,
  addItem: addItem,
  updateItem: updateItem,
  removeItem: removeItem,
  transition: transition,
  update: update,
  remove: remove,
  sweep: sweep
};
