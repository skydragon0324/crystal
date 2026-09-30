const db = require('../config/db');
const { applySearch } = require('../utils/query');

const TABLE = 'part_replenishments';
const PK = 'id';
const ITEMS = 'part_replenishment_items';

const SEARCHABLE = ['r.order_no', 'a.name', 'a.code'];

function scope(deleted) {
  return db(TABLE + ' as r')
    .join('agencies as a', 'a.id', 'r.agency_id')
    .leftJoin('managers as ad', 'ad.id', 'r.approved_by')
    .where('r.is_deleted', !!deleted);
}

function applyFilters(qb, filters) {
  if (filters.agency_id) qb.where('r.agency_id', filters.agency_id);
  if (filters.status !== undefined && filters.status !== '' && filters.status !== null) {
    qb.where('r.status', filters.status);
  }
  if (filters.is_auto !== undefined && filters.is_auto !== '') {
    qb.where('r.is_auto', filters.is_auto === true || filters.is_auto === '1' || filters.is_auto === 'true');
  }
  if (filters.open) qb.whereIn('r.status', [0, 1, 2, 3]);
  if (filters.from) qb.where('r.requested_on', '>=', filters.from);
  if (filters.to) qb.where('r.requested_on', '<=', filters.to);
  return qb;
}

async function search(filters, paging) {
  const qb = applyFilters(applySearch(scope(filters.deleted), SEARCHABLE, filters.q), filters);

  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const sumRow = await qb.clone().clearSelect().first(
    db.raw('COALESCE(SUM(r.total_cost), 0) AS total_cost'),
    db.raw('COUNT(*) FILTER (WHERE r.status IN (0,1,2,3)) AS open_cnt'),
    db.raw('COUNT(*) FILTER (WHERE r.is_auto AND r.status = 0) AS unreviewed_auto_cnt')
  );

  const rows = await qb.select('r.*', 'a.name as agency_name', 'a.code as agency_code',
    'ad.name as approved_by_name')
    .select(db.raw('(SELECT COUNT(*) FROM ' + ITEMS + ' i WHERE i.replenishment_id = r.id) AS line_cnt'))
    .orderBy('r.' + paging.sort, paging.dir)
    .limit(paging.limit).offset(paging.offset);

  return {
    rows: rows,
    total: Number(countRow.c),
    summary: {
      total_cost: Number(sumRow.total_cost),
      open_cnt: Number(sumRow.open_cnt),
      unreviewed_auto_cnt: Number(sumRow.unreviewed_auto_cnt)
    }
  };
}

function findById(id, deleted) {
  return scope(deleted).where('r.id', id)
    .first('r.*', 'a.name as agency_name', 'a.code as agency_code', 'ad.name as approved_by_name');
}

function findRow(id, trx) {
  return (trx || db)(TABLE).where(PK, id).first();
}

function lockRow(id, trx) {
  return trx(TABLE).where(PK, id).forUpdate().first();
}

function insert(data, trx) {
  return (trx || db)(TABLE).insert(data).returning('*');
}

function update(id, data, trx) {
  return (trx || db)(TABLE).where(PK, id).update(data).returning('*');
}

function softDelete(id, trx) {
  return (trx || db)(TABLE).where(PK, id).update({ is_deleted: true });
}

/* ---- lines ---- */

function itemsOf(replenishmentId, trx) {
  return (trx || db)(ITEMS + ' as i')
    .join('parts as p', 'p.id', 'i.part_id')
    .where('i.replenishment_id', replenishmentId)
    .orderBy('p.part_no')
    .select('i.*', 'p.part_no', 'p.name as part_name', 'p.component', 'p.lead_days');
}

function findItem(itemId, trx) {
  return (trx || db)(ITEMS).where('id', itemId).first();
}

/**
 * Adds a line, or adds to one that is already there.
 *
 * Ordering the same part twice on one order is a mistake nobody means to
 * make, and refusing it would send the clerk to find the first line and edit
 * it.  Merging is what they meant.
 */
function upsertItem(replenishmentId, data, trx) {
  return (trx || db)(ITEMS)
    .insert(Object.assign({ replenishment_id: replenishmentId }, data))
    .onConflict(['replenishment_id', 'part_id'])
    .merge({
      quantity: db.raw(ITEMS + '.quantity + EXCLUDED.quantity'),
      amount: db.raw(ITEMS + '.amount + EXCLUDED.amount')
    })
    .returning('*');
}

function updateItem(itemId, data, trx) {
  return (trx || db)(ITEMS).where('id', itemId).update(data).returning('*');
}

function removeItem(itemId, trx) {
  return (trx || db)(ITEMS).where('id', itemId).del();
}

function totalsOf(replenishmentId, trx) {
  return (trx || db)(ITEMS)
    .where('replenishment_id', replenishmentId)
    .first(
      db.raw('COALESCE(SUM(amount), 0) AS total_cost'),
      db.raw('COALESCE(SUM(quantity), 0) AS quantity'),
      db.raw('COALESCE(SUM(received_quantity), 0) AS received_quantity'),
      db.raw('COUNT(*) AS line_cnt')
    );
}

async function nextNumber(prefix, trx) {
  const row = await (trx || db)(TABLE)
    .where('order_no', 'like', prefix + '%')
    .first(db.raw('MAX(order_no) AS last_no'));

  const last = row && row.last_no ? Number(String(row.last_no).slice(prefix.length)) : 0;
  return prefix + String((isFinite(last) ? last : 0) + 1).padStart(4, '0');
}

module.exports = {
  TABLE: TABLE,
  PK: PK,
  ITEMS: ITEMS,
  search: search,
  findById: findById,
  findRow: findRow,
  lockRow: lockRow,
  insert: insert,
  update: update,
  softDelete: softDelete,
  itemsOf: itemsOf,
  findItem: findItem,
  upsertItem: upsertItem,
  updateItem: updateItem,
  removeItem: removeItem,
  totalsOf: totalsOf,
  nextNumber: nextNumber
};
