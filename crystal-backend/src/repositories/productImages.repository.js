const db = require('../config/db');

const TABLE = 'product_images';

/**
 * A product's own two runs of artwork.
 *
 * Split out of media_assets, which is polymorphic - (owner_type, owner_id)
 * with no foreign key, because one column cannot point at five tables. That is
 * the right shape for artwork hanging off four different kinds of owner and
 * the wrong shape for the two runs every single product has: there is no
 * owner_type to resolve, no chance of an id pointing into the wrong table, and
 * no reason a product's own pictures should be unreachable by a join.
 *
 *   MAIN    the studio set - front, back, three quarter. The row of 1 to 3
 *           square images at the top of the product page.
 *   ADVERT  the advertising run - full width marketing panels, shown down the
 *           gallery tab, 1 x n.
 */

const KINDS = ['MAIN', 'ADVERT'];

function isKind(kind) {
  return KINDS.indexOf(String(kind).toUpperCase()) !== -1;
}

function scope(deleted) {
  return db(TABLE).where('is_deleted', !!deleted);
}

/**
 * One product's pictures.
 *
 * `device` narrows to what a client should actually be served: a phone gets
 * the mobile crops plus the ones marked `all`, and never the 1600px desktop
 * panel. Nothing is narrowed when no device is asked for, which is what the
 * console wants - it manages both.
 */
function ofProduct(productId, options) {
  const opts = options || {};
  const qb = scope(false)
    .where('product_id', productId)
    .orderBy([{ column: 'kind' }, { column: 'sort_order' }, { column: 'id' }]);

  if (opts.kind) qb.where('kind', String(opts.kind).toUpperCase());
  if (opts.device) qb.whereIn('device_type', [opts.device, 'all']);

  return qb.select('*');
}

/** The same, for many products at once - a listing page needs every tile. */
function ofProducts(productIds, options) {
  if (!productIds || !productIds.length) return Promise.resolve([]);
  const opts = options || {};

  const qb = scope(false)
    .whereIn('product_id', productIds)
    .orderBy([{ column: 'product_id' }, { column: 'sort_order' }, { column: 'id' }]);

  if (opts.kind) qb.where('kind', String(opts.kind).toUpperCase());
  if (opts.device) qb.whereIn('device_type', [opts.device, 'all']);

  return qb.select('*');
}

function findById(id, trx) {
  return (trx || db)(TABLE).where('id', id).first();
}

function insert(data, trx) {
  return (trx || db)(TABLE).insert(data).returning('*');
}

function update(id, data, trx) {
  return (trx || db)(TABLE).where('id', id).update(data).returning('*');
}

/** Soft, like every other table the console edits. */
function remove(id, trx) {
  return (trx || db)(TABLE).where('id', id).update({ is_deleted: true });
}

function restore(id, trx) {
  return (trx || db)(TABLE).where('id', id).update({ is_deleted: false }).returning('*');
}

/** The console's list, filterable and paged. */
async function search(filters, paging) {
  const qb = db(TABLE + ' as i')
    .join('products as p', 'p.id', 'i.product_id')
    .where('i.is_deleted', !!filters.deleted);

  if (filters.product_id) qb.where('i.product_id', filters.product_id);
  if (filters.kind) qb.where('i.kind', String(filters.kind).toUpperCase());
  if (filters.device_type) qb.where('i.device_type', filters.device_type);
  if (filters.q) qb.where(function () {
    this.whereRaw('i.file_path ILIKE ?', ['%' + filters.q + '%'])
      .orWhereRaw('i.alt_text ILIKE ?', ['%' + filters.q + '%'])
      .orWhereRaw('p.name ILIKE ?', ['%' + filters.q + '%']);
  });

  const countRow = await qb.clone().clearSelect().clearOrder().count({ c: '*' }).first();

  const rows = await qb.clone()
    .select('i.*', 'p.name as product_name', 'p.slug as product_slug')
    .orderBy(paging.sort, paging.dir)
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
}

module.exports = {
  TABLE: TABLE,
  KINDS: KINDS,
  isKind: isKind,
  ofProduct: ofProduct,
  ofProducts: ofProducts,
  findById: findById,
  insert: insert,
  update: update,
  remove: remove,
  restore: restore,
  search: search
};
