const db = require('../config/db');
const { applySearch } = require('../utils/query');

const TABLE = 'parts';
const PK = 'id';
const COMPAT = 'part_compatibility';

/**
 * The parts catalogue.  What is on a shelf is stock.repository's problem;
 * this is the list of things that could be.
 */

const SEARCHABLE = ['p.part_no', 'p.name'];

function scope(deleted) {
  return db(TABLE + ' as p').where('p.is_deleted', !!deleted);
}

function applyFilters(qb, filters) {
  if (filters.component) qb.where('p.component', filters.component);
  if (filters.status) qb.where('p.status', filters.status);
  // "Parts that fit this handset" - an EXISTS rather than a join, so a part
  // that fits three products still comes back once.
  if (filters.product_id) {
    qb.whereExists(function () {
      this.select(db.raw(1)).from(COMPAT + ' as pc')
        .whereRaw('pc.part_id = p.id')
        .where('pc.product_id', filters.product_id);
    });
  }
  return qb;
}

async function search(filters, paging) {
  const qb = applyFilters(applySearch(scope(filters.deleted), SEARCHABLE, filters.q), filters);

  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const rows = await qb
    .select('p.*')
    .select(
      db.raw('(SELECT COUNT(*) FROM ' + COMPAT + ' pc WHERE pc.part_id = p.id) AS product_cnt'),
      db.raw('COALESCE((SELECT SUM(s.on_hand) FROM part_stock s WHERE s.part_id = p.id), 0) AS total_on_hand')
    )
    .orderBy('p.' + paging.sort, paging.dir)
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
}

function options(deleted) {
  return scope(deleted).orderBy('p.part_no').limit(1000)
    .select('p.id', 'p.part_no', 'p.name', 'p.component', 'p.unit_cost', 'p.currency');
}

function findById(id, deleted) {
  return scope(deleted).where('p.id', id).first('p.*');
}

function findRow(id, trx) {
  return (trx || db)(TABLE).where(PK, id).first();
}

function findByNo(partNo, exceptId, trx) {
  const qb = (trx || db)(TABLE).whereRaw('lower(part_no) = lower(?)', [String(partNo || '').trim()]);
  if (exceptId) qb.whereNot(PK, exceptId);
  return qb.first(PK);
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

function restore(id, trx) {
  return (trx || db)(TABLE).where(PK, id).update({ is_deleted: false }).returning('*');
}

/* ---- which products a part fits ---- */

function compatibilityOf(partId) {
  return db(COMPAT + ' as pc')
    .join('products as pr', 'pr.id', 'pc.product_id')
    .where('pc.part_id', partId)
    .orderBy('pr.name')
    .select('pc.id', 'pc.product_id', 'pr.name as product_name', 'pr.slug', 'pr.model_code');
}

/**
 * Replaces the whole compatibility list for a part.
 *
 * Delete-then-insert rather than a diff, because the list is short, it is
 * edited as a multi-select, and a diff of a set of integers is more code than
 * it saves.  Inside a transaction so a part is never briefly compatible with
 * nothing.
 */
async function replaceCompatibility(partId, productIds, trx) {
  await (trx || db)(COMPAT).where('part_id', partId).del();
  if (!productIds || !productIds.length) return [];

  const rows = productIds.map(function (productId) {
    return { part_id: partId, product_id: Number(productId) };
  });
  return (trx || db)(COMPAT).insert(rows).returning('*');
}

module.exports = {
  TABLE: TABLE,
  PK: PK,
  COMPAT: COMPAT,
  search: search,
  options: options,
  findById: findById,
  findRow: findRow,
  findByNo: findByNo,
  insert: insert,
  update: update,
  softDelete: softDelete,
  restore: restore,
  compatibilityOf: compatibilityOf,
  replaceCompatibility: replaceCompatibility
};
