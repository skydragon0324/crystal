const repo = require('../repositories/legacy/articles.repository');
const media = require('../repositories/media.repository');
const { HttpError } = require('../utils/response');
const audit = require('./audit.service');

const PAGE = '/admin/blog/articles';
const TABLE = repo.TABLE;

/*
 * NO 'slug' AND NO 'cover_image_mobile'.
 *
 * The blog is stored in the vendor's database now (repositories/legacy/), and
 * that schema has neither: a slug is DERIVED from the title and the id on
 * every read, and there is one image column rather than a desktop/mobile
 * pair. Accepting either from the console would be accepting a value that is
 * silently dropped on the way to the database, which is worse than not
 * offering the field.
 */
const COLUMNS = ['title', 'cover_image', 'summary',
  'content', 'author', 'category', 'is_featured'];

const SORTABLE = ['id', 'title', 'category', 'status', 'published_at', 'view_count', 'created_at'];
const DEFAULT_SORT = 'created_at';

/**
 * The blog, and its one real rule: the workflow.
 *
 * DRAFT -> REVIEW -> PUBLISHED, and `published_at` is stamped only on the
 * transition INTO published.  Re-editing a live article must not move it back
 * to the top of the list, which is what would happen if the column were
 * touched on every save - and is the sort of thing nobody notices until an
 * old article reappears as news.
 */

const STATUS = { DRAFT: 'DRAFT', REVIEW: 'REVIEW', PUBLISHED: 'PUBLISHED' };

const FLOW = {
  DRAFT: ['REVIEW', 'PUBLISHED'],
  REVIEW: ['DRAFT', 'PUBLISHED'],
  PUBLISHED: ['DRAFT']
};

/* ------------------------------------------------------------------ */
/*  the storefront                                                     */
/* ------------------------------------------------------------------ */

async function publicList(filters) {
  const limit = Math.min(48, Math.max(1, Number(filters.limit) || 12));
  const page = Math.max(1, Number(filters.page) || 1);

  const scoped = {
    category: filters.category,
    is_featured: filters.featured,
    limit: limit,
    offset: (page - 1) * limit
  };

  const [rows, countRow] = await Promise.all([
    repo.published(scoped),
    repo.countPublished(scoped)
  ]);

  return { rows: rows, total: Number(countRow.c), page: page, limit: limit };
}

async function publicDetail(slug) {
  const article = await repo.findPublishedBySlug(slug);
  if (!article) throw new HttpError(404, 'common.notFound');

  await repo.countView(article.id);

  const assets = await media.ofOwner('ARTICLE', article.id, {});
  return Object.assign({}, article, { media: assets });
}

/**
 * The member centre's "My Articles".
 *
 * The author is the LOGIN, resolved from the session rather than taken from
 * the request - an author parameter on this endpoint would let anyone read
 * anyone's drafts.
 */
function mine(login, filters, paging) {
  return repo.mine(login, filters, paging);
}

function publicCategories() {
  return repo.publishedCategories();
}

function featured(limit) {
  return repo.published({ is_featured: true, limit: Math.min(12, Number(limit) || 4) });
}

/* ------------------------------------------------------------------ */
/*  the console                                                        */
/* ------------------------------------------------------------------ */

function search(filters, paging) {
  return repo.search(filters, paging);
}

async function detail(id, deleted) {
  const row = await repo.findById(id, deleted);
  if (!row) throw new HttpError(404, 'common.notFound');
  return row;
}

/**
 * NO SLUG IS CHOSEN HERE ANY MORE.
 *
 * There used to be a uniqueness loop with a -2, -3 suffix, because two
 * articles genuinely can be called the same thing a year apart. The legacy
 * schema has no slug column at all, so one is derived on read from the title
 * AND THE ARTICLE ID - which cannot collide, whatever anything is called.
 * The loop had nothing left to resolve; see the note in
 * repositories/legacy/articles.repository.js.
 */

async function create(body, admin, actor) {
  const data = Object.assign({}, body);

  if (!data.title) throw new HttpError(400, 'common.valueFailedAValidation');

  /*
   * THE BYLINE IS A LOGIN NAME, not a display name and not an id.
   *
   * blog_article.user_userid is a varchar the vendor's own console fills with
   * the author's login, and its blog joins that string to resolve a name.
   * Writing an admin's display name there would put a value in the column
   * that nothing on the vendor's side can resolve, so the login goes in and
   * the display name is not stored at all - there is nowhere to put it.
   */
  data.author = data.author || (admin ? (admin.username || admin.name) : null);
  data.status = STATUS.DRAFT;

  const rows = await repo.insert(data);
  audit.created(actor, TABLE, rows[0].id, rows[0], PAGE);
  return rows[0];
}

async function update(id, body, actor) {
  const data = Object.assign({}, body);

  const previous = await repo.findRow(id);
  if (!previous) throw new HttpError(404, 'common.notFound');

  delete data.slug;

  if (!Object.keys(data).length) throw new HttpError(400, 'common.nothingToUpdate');

  const rows = await repo.update(id, data);
  audit.updated(actor, TABLE, id, previous, rows[0], PAGE);
  return rows[0];
}

/**
 * A move through the workflow.
 *
 * Publishing is separated from editing on purpose: the permission grid gives
 * an editor WRITE on this page and keeps the publish button behind SUPER, so
 * "who may write" and "who may put it in front of customers" are two
 * different answers.
 */
async function transition(id, to, actor) {
  const previous = await repo.findRow(id);
  if (!previous) throw new HttpError(404, 'common.notFound');
  if (previous.status === to) return previous;

  const allowed = FLOW[previous.status] || [];
  if (allowed.indexOf(to) === -1) throw new HttpError(409, 'common.valueFailedAValidation');

  const patch = { status: to };

  // Stamped once, on the first time it goes live, and never moved again.
  if (to === STATUS.PUBLISHED && !previous.published_at) patch.published_at = new Date();

  const rows = await repo.update(id, patch);
  audit.updated(actor, TABLE, id, previous, rows[0], PAGE);
  return rows[0];
}

/**
 * Removing an article also removes its images.
 *
 * media_assets has no foreign key - it cannot, it points at four tables - so
 * this is the price of that decision, paid explicitly here.
 *
 * IT IS NO LONGER ONE TRANSACTION, and it cannot be: the article is in the
 * vendor's database and its artwork is in Crystal's. So the order is chosen
 * instead. The article goes to the bin FIRST, because the failure that leaves
 * a hidden article with its images still on disk is invisible and reversible,
 * and the one that leaves a live article with no artwork is neither.
 */
async function remove(id, actor) {
  const previous = await repo.findRow(id);
  if (!previous) throw new HttpError(404, 'common.notFound');

  const affected = await repo.softDelete(id);
  if (!affected) throw new HttpError(404, 'common.notFound');

  await media.removeForOwner('ARTICLE', id);

  audit.deleted(actor, TABLE, id, previous, PAGE);
}

async function restore(id, actor) {
  const rows = await repo.restore(id);
  if (!rows.length || !rows[0]) throw new HttpError(404, 'common.notFound');
  audit.restored(actor, TABLE, id, rows[0], PAGE);
}

/**
 * WHAT STILL POINTS AT AN ARTICLE, and why this is hand-written.
 *
 * Every other table in this API gets its dependents from routes/purge.routes.js,
 * which asks PostgreSQL's catalogue which foreign keys reference the row. That
 * cannot answer for an article any more: the row is in a database whose
 * catalogue is not Crystal's to read, and the only thing on Crystal's side
 * that refers to it is artwork.
 *
 * So the one real answer is given directly. It never blocks - media_assets is
 * a CASCADE relationship in intent, deleted alongside rather than protecting -
 * but it is reported, because a permanent delete that silently takes six
 * images with it should say so first.
 */
async function dependents(id) {
  const article = await repo.findRow(id);
  if (!article) throw new HttpError(404, 'common.notFound');

  const images = await media.countForOwner('ARTICLE', id);

  return {
    dependents: images ? [{ table: 'media_assets', count: images, on_delete: 'CASCADE' }] : [],
    blockers: [],
    can_purge: true
  };
}

/**
 * Gone for good - the article, its counters, its body and its artwork.
 *
 * The recycle-bin rail is the same one every other table has: a live article
 * cannot be destroyed in one click. Here "in the bin" is a state rather than
 * a flag, so it reads ARCHIVED; see codes.js.
 */
async function purge(id, actor) {
  const article = await repo.findRow(id);
  if (!article) throw new HttpError(404, 'common.notFound');
  if (article.status !== 'ARCHIVED') {
    throw new HttpError(409, 'common.moveItToThe');
  }

  await repo.purge(id);
  await media.removeForOwner('ARTICLE', id);

  audit.deleted(actor, TABLE, id, article, PAGE);
}

module.exports = {
  PAGE: PAGE,
  COLUMNS: COLUMNS,
  SORTABLE: SORTABLE,
  DEFAULT_SORT: DEFAULT_SORT,
  STATUS: STATUS,

  publicList: publicList,
  publicDetail: publicDetail,
  mine: mine,
  publicCategories: publicCategories,
  featured: featured,

  search: search,
  detail: detail,
  create: create,
  update: update,
  transition: transition,
  remove: remove,
  restore: restore,
  dependents: dependents,
  purge: purge
};
