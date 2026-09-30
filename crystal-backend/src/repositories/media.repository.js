const db = require('../config/db');

const TABLE = 'media_assets';

/**
 * Polymorphic media.
 *
 * (owner_type, owner_id) with no foreign key - one column cannot point at
 * four tables.  The cost of that is paid here: deleting an owner has to
 * delete its assets explicitly, so `removeForOwner` exists and every service
 * that deletes a product, series, category or article calls it.
 */

const OWNERS = ['PRODUCT', 'SERIES', 'CATEGORY', 'ARTICLE', 'OS_VERSION'];

function assertOwnerType(ownerType) {
  return OWNERS.indexOf(String(ownerType).toUpperCase()) !== -1;
}

/**
 * One owner's assets.
 *
 * `device` narrows to the artwork a client should actually be served: a
 * mobile browser gets the mobile files plus the ones marked `all`, and never
 * the 1920x900 desktop hero.  Nothing is narrowed when no device is asked
 * for, which is what the console wants - it manages both.
 */
function ofOwner(ownerType, ownerId, options) {
  const opts = options || {};
  const qb = db(TABLE)
    .where({ owner_type: String(ownerType).toUpperCase(), owner_id: ownerId })
    .orderBy([{ column: 'purpose' }, { column: 'sort_order' }, { column: 'id' }]);

  if (opts.purpose) qb.where('purpose', String(opts.purpose).toUpperCase());
  if (opts.device) qb.whereIn('device_type', [opts.device, 'all']);

  return qb.select('*');
}

/** The same, for many owners at once - a list page needs every row's thumbnail. */
function ofOwners(ownerType, ownerIds, options) {
  if (!ownerIds || !ownerIds.length) return Promise.resolve([]);
  const opts = options || {};

  const qb = db(TABLE)
    .where('owner_type', String(ownerType).toUpperCase())
    .whereIn('owner_id', ownerIds)
    .orderBy([{ column: 'owner_id' }, { column: 'sort_order' }, { column: 'id' }]);

  if (opts.purpose) qb.where('purpose', String(opts.purpose).toUpperCase());
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

function remove(id, trx) {
  return (trx || db)(TABLE).where('id', id).del();
}

/** Everything belonging to an owner that is going away. */
function removeForOwner(ownerType, ownerId, trx) {
  return (trx || db)(TABLE)
    .where({ owner_type: String(ownerType).toUpperCase(), owner_id: ownerId })
    .del();
}

/**
 * How many an owner has.
 *
 * Added for the blog, whose article rows moved to the vendor's database: the
 * shared purge route finds dependents by reading PostgreSQL's foreign keys, and
 * there is no foreign key to find when the two rows are in different
 * databases. So the one relationship that does exist is counted directly.
 */
async function countForOwner(ownerType, ownerId) {
  const row = await db(TABLE)
    .where({ owner_type: String(ownerType).toUpperCase(), owner_id: ownerId })
    .count({ c: '*' }).first();

  return Number(row.c);
}

/** The console's library view: everything, newest first, filterable. */
async function search(filters, paging) {
  const qb = db(TABLE);

  if (filters.owner_type) qb.where('owner_type', String(filters.owner_type).toUpperCase());
  if (filters.owner_id) qb.where('owner_id', filters.owner_id);
  if (filters.purpose) qb.where('purpose', String(filters.purpose).toUpperCase());
  if (filters.device_type) qb.where('device_type', filters.device_type);
  if (filters.q) qb.where(function () {
    this.whereRaw('file_path ILIKE ?', ['%' + filters.q + '%'])
      .orWhereRaw('alt_text ILIKE ?', ['%' + filters.q + '%']);
  });

  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const rows = await qb.select('*')
    .orderBy(paging.sort, paging.dir)
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
}

module.exports = {
  TABLE: TABLE,
  OWNERS: OWNERS,
  assertOwnerType: assertOwnerType,
  ofOwner: ofOwner,
  ofOwners: ofOwners,
  findById: findById,
  insert: insert,
  update: update,
  remove: remove,
  removeForOwner: removeForOwner,
  countForOwner: countForOwner,
  search: search
};
