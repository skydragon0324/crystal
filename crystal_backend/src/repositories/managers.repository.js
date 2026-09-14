const db = require('../config/db');
const { applySearch } = require('../utils/query');

const TABLE = 'managers';
const PK = 'id';

/**
 * A console account never comes back without its role in words.
 *
 * Every screen that shows an administrator shows it beside the name, and
 * joining once here is cheaper than a lookup per row upstairs. It used to
 * join `agencies` too, for the centre an account was pinned to; that
 * column is gone, and the join with it.
 */
const SELECT = [
  'a.id', 'a.username', 'a.name', 'a.avatar', 'a.role_id',
  'a.status', 'a.last_login_at', 'a.is_deleted', 'a.created_at', 'a.updated_at',
  'r.role_code', 'r.role_name', 'r.default_page',
  'p.page_url as default_page_url'
];

const SEARCHABLE = ['a.username', 'a.name'];

function scope(deleted) {
  return db(TABLE + ' as a')
    .join('manager_roles as r', 'r.id', 'a.role_id')
    .leftJoin('manager_pages as p', 'p.id', 'r.default_page')
    .where('a.is_deleted', !!deleted);
}

function applyFilters(qb, filters) {
  if (filters.role_id) qb.where('a.role_id', filters.role_id);
  if (filters.status) qb.where('a.status', filters.status);
  return qb;
}

async function search(filters, paging) {
  const qb = applyFilters(applySearch(scope(filters.deleted), SEARCHABLE, filters.q), filters);

  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const rows = await qb.select(SELECT)
    .orderBy('a.' + paging.sort, paging.dir)
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
}

function findById(id, deleted) {
  return scope(deleted).where('a.id', id).first(SELECT);
}

/**
 * The sign-in read, and the only one that returns the hash.
 *
 * Everything else goes through SELECT above, which does not name the column -
 * so a password hash cannot reach a response by accident, only by a caller
 * deliberately asking this function for one.
 */
function findForSignIn(username) {
  return db(TABLE + ' as a')
    .join('manager_roles as r', 'r.id', 'a.role_id')
    .whereRaw('lower(a.username) = lower(?)', [String(username || '').trim()])
    .where('a.is_deleted', false)
    .first('a.*', 'r.role_code', 'r.role_name', 'r.default_page');
}

/** The row the auth middleware re-reads on every request. */
function findLive(id) {
  return db(TABLE + ' as a')
    .join('manager_roles as r', 'r.id', 'a.role_id')
    .where('a.id', id)
    .where('a.is_deleted', false)
    .first('a.id', 'a.username', 'a.name', 'a.avatar', 'a.role_id',
      'a.status', 'r.role_code', 'r.role_name');
}

function findByUsername(username, exceptId) {
  const qb = db(TABLE).whereRaw('lower(username) = lower(?)', [String(username || '').trim()]);
  if (exceptId) qb.whereNot(PK, exceptId);
  return qb.first(PK);
}

function findRow(id, trx) {
  return (trx || db)(TABLE).where(PK, id).first();
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

function touchSignIn(id) {
  return db(TABLE).where(PK, id).update({ last_login_at: db.fn.now() });
}

/** How many accounts a role still has, so the last one cannot be orphaned. */
function countByRole(roleId) {
  return db(TABLE).where({ role_id: roleId, is_deleted: false }).count({ c: '*' }).first();
}

module.exports = {
  TABLE: TABLE,
  PK: PK,
  search: search,
  findById: findById,
  findForSignIn: findForSignIn,
  findLive: findLive,
  findByUsername: findByUsername,
  findRow: findRow,
  insert: insert,
  update: update,
  softDelete: softDelete,
  restore: restore,
  touchSignIn: touchSignIn,
  countByRole: countByRole
};
