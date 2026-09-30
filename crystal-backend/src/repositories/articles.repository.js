/*
 * ============================================================
 * DORMANT. Nothing imports this file, and that is deliberate.
 * ============================================================
 *
 * The blog moved to the vendor's database; the live implementation is
 * repositories/legacy/articles.repository.js.
 *
 * This is the PostgreSQL one, and it is kept rather than deleted because the
 * tables it reads are kept: sql/schema.sql still declares them, they are
 * still seeded, and they are where this data lands when it is migrated back.
 * On that day this file is what gets wired up again - so it stays here,
 * unreferenced, next to the schema it belongs to.
 *
 * Do not import it. Two repositories answering for the same rows out of two
 * different databases is the one way this integration can go quietly wrong.
 */
const db = require('../config/db');
const { applySearch } = require('../utils/query');

const TABLE = 'articles';
const PK = 'id';

const SEARCHABLE = ['a.title', 'a.summary', 'a.author'];

function scope(deleted) {
  return db(TABLE + ' as a')
    .leftJoin('managers as ad', 'ad.id', 'a.author_id')
    .where('a.is_deleted', !!deleted);
}

function applyFilters(qb, filters) {
  if (filters.category) qb.where('a.category', filters.category);
  if (filters.status) qb.where('a.status', filters.status);
  if (filters.author_id) qb.where('a.author_id', filters.author_id);
  if (filters.is_featured !== undefined && filters.is_featured !== '') {
    qb.where('a.is_featured', filters.is_featured === true || filters.is_featured === '1');
  }
  return qb;
}

/**
 * The console's list.
 *
 * `content` is deliberately left out: an article body is measured in
 * kilobytes and a page of twenty of them is a megabyte the list has no use
 * for.  It comes back on the detail read.
 */
const LIST_COLUMNS = [
  'a.id', 'a.title', 'a.slug', 'a.cover_image', 'a.cover_image_mobile', 'a.summary',
  'a.author', 'a.author_id', 'a.category', 'a.status', 'a.view_count', 'a.is_featured',
  'a.published_at', 'a.is_deleted', 'a.created_at', 'a.updated_at',
  'ad.name as author_name'
];

async function search(filters, paging) {
  const qb = applyFilters(applySearch(scope(filters.deleted), SEARCHABLE, filters.q), filters);

  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const rows = await qb.select(LIST_COLUMNS)
    .orderBy('a.' + paging.sort, paging.dir)
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
}

function findById(id, deleted) {
  return scope(deleted).where('a.id', id).first('a.*', 'ad.name as author_name');
}

function findRow(id, trx) {
  return (trx || db)(TABLE).where(PK, id).first();
}

function findBySlug(slug, exceptId, trx) {
  const qb = (trx || db)(TABLE).where('slug', slug);
  if (exceptId) qb.whereNot(PK, exceptId);
  return qb.first(PK);
}

/** The storefront's list: published only, newest first. */
function published(filters) {
  const qb = scope(false).where('a.status', 'PUBLISHED');
  applyFilters(qb, filters);

  return qb.orderBy('a.published_at', 'desc')
    .limit(filters.limit || 12).offset(filters.offset || 0)
    .select(LIST_COLUMNS);
}

function countPublished(filters) {
  const qb = scope(false).where('a.status', 'PUBLISHED');
  applyFilters(qb, filters);
  return qb.clearSelect().count({ c: '*' }).first();
}

function findPublishedBySlug(slug) {
  return scope(false).where('a.slug', slug).where('a.status', 'PUBLISHED')
    .first('a.*', 'ad.name as author_name');
}

/** The categories that actually have something published in them. */
function publishedCategories() {
  return db(TABLE)
    .where({ is_deleted: false, status: 'PUBLISHED' })
    .groupBy('category')
    .orderBy('category')
    .select('category', db.raw('COUNT(*) AS article_cnt'));
}

function countView(id) {
  return db(TABLE).where(PK, id).increment('view_count', 1);
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

module.exports = {
  TABLE: TABLE,
  PK: PK,
  search: search,
  findById: findById,
  findRow: findRow,
  findBySlug: findBySlug,
  published: published,
  countPublished: countPublished,
  findPublishedBySlug: findPublishedBySlug,
  publishedCategories: publishedCategories,
  countView: countView,
  insert: insert,
  update: update,
  softDelete: softDelete,
  restore: restore
};
