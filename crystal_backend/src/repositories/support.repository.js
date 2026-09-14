const db = require('../config/db');
const { applySearch } = require('../utils/query');

const FAQS = 'faqs';
const PRICES = 'service_prices';

/**
 * The two support tables that are not the service centres: the FAQ, and the
 * published repair price list.
 *
 * The price list is read by the storefront and, from section 8, is also what
 * a repair line is priced from - so `pricesOf` is deliberately the same query
 * for both callers.  A customer quoted a figure on the website and charged a
 * different one at the counter is the failure this avoids.
 */

const FAQ_SEARCHABLE = ['f.question', 'f.answer'];

function faqScope(deleted) {
  return db(FAQS + ' as f')
    .leftJoin('product_categories as c', 'c.id', 'f.product_category_id')
    .where('f.is_deleted', !!deleted);
}

function faqFilters(qb, filters) {
  if (filters.category) qb.where('f.category', filters.category);
  if (filters.product_category_id) {
    // A question with no category applies everywhere, so it belongs in every
    // section's list rather than in none of them.
    qb.where(function () {
      this.where('f.product_category_id', filters.product_category_id)
        .orWhereNull('f.product_category_id');
    });
  }
  if (filters.status) qb.where('f.status', filters.status);
  return qb;
}

async function faqs(filters, paging) {
  const qb = faqFilters(applySearch(faqScope(filters.deleted), FAQ_SEARCHABLE, filters.q), filters);

  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const rows = await qb.select('f.*', 'c.name as product_category_name')
    .orderBy('f.' + paging.sort, paging.dir)
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
}

/** The storefront's list: published only, in editorial order. */
/**
 * The published questions, filtered and PAGED.
 *
 * There are a hundred of them, so the storefront cannot fetch the lot and
 * filter in the browser: the search would quietly only look at whatever
 * the limit happened to let through, which is the one thing a search box
 * must not do.
 *
 * `paging` is optional - the support home page wants a handful for its
 * band and has no interest in a total.
 */
async function publishedFaqs(filters, paging) {
  const build = () => faqFilters(
    applySearch(faqScope(false).where('f.status', 'PUBLISHED'), FAQ_SEARCHABLE, filters.q),
    filters
  );

  const ordered = build().orderBy([{ column: 'f.sort_order' }, { column: 'f.id' }])
    .select('f.id', 'f.category', 'f.question', 'f.answer', 'f.view_count', 'f.product_category_id');

  if (!paging) return ordered.limit(filters.limit || 100);

  const countRow = await build().clearSelect().clearOrder().count({ c: '*' }).first();
  const rows = await ordered.limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
}

/** "Popular Problems" on the support page is literally this. */
function popularFaqs(limit) {
  return db(FAQS)
    .where({ is_deleted: false, status: 'PUBLISHED' })
    .orderBy('view_count', 'desc')
    .limit(limit || 6)
    .select('id', 'category', 'question', 'view_count');
}

/**
 * A view, counted.
 *
 * An UPDATE rather than a read-modify-write: the count is only ever going up
 * by one, and two people opening the same answer at the same moment should
 * add two.
 */
function countFaqView(id) {
  return db(FAQS).where('id', id).increment('view_count', 1);
}

function findFaq(id, trx) {
  return (trx || db)(FAQS).where('id', id).first();
}

/* ---- repair prices ---- */

/**
 * A product's price list, with the part each line consumes.
 *
 * The join to `parts` is what lets a repair line added from this list know
 * which shelf to take stock off - without it a clerk would have to pick the
 * part a second time, from a different list, and the two would drift.
 */
function priceScopeOf(productId) {
  /*
   * No join to `parts` any more.
   *
   * A published line used to carry the shelf item it consumed, so this
   * query dragged the parts catalogue along to show the part number. The
   * price list names things the way a CUSTOMER would recognise them, and
   * the shelf names them the way a technician orders them; they are two
   * lists and this is the customer one, so `part_name` is its own string.
   */
  return db(PRICES + ' as sp')
    .where('sp.product_id', productId)
    .where('sp.is_deleted', false)
    .orderBy([{ column: 'sp.sort_order' }, { column: 'sp.id' }]);
}

const PRICE_COLUMNS = ['sp.*'];

function pricesOf(productId) {
  return priceScopeOf(productId).select(PRICE_COLUMNS);
}

/**
 * One PAGE of a product's price list, with the row count behind it.
 *
 * A handset carries twenty-odd priced jobs and a published list has to show
 * the approval reference beside each one, so the tab is a paged table rather
 * than one long scroll - and paging it here rather than in the browser is
 * what stops the API sending sixty rows to draw ten.
 */
async function pricesPageOf(productId, paging, term) {
  const qb = priceScopeOf(productId);

  /*
   * SEARCHED ON THE SERVER, because the list is paged.
   *
   * Filtering the page already on screen would search ten rows out of
   * thirty and quietly miss the rest - the one thing a search box must not
   * do. The approval number is searchable too: a centre quoting from a
   * printed schedule has the reference in front of them, not the wording.
   */
  if (term && String(term).trim()) {
    const needle = '%' + String(term).trim().toLowerCase() + '%';
    qb.where(function () {
      this.whereRaw('LOWER(sp.part_name) LIKE ?', [needle])
        .orWhereRaw('LOWER(sp.approval_no) LIKE ?', [needle]);
    });
  }

  const countRow = await qb.clone().clearSelect().clearOrder().count({ c: '*' }).first();
  const rows = await qb.clone().select(PRICE_COLUMNS)
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
}

function findPrice(id, trx) {
  return (trx || db)(PRICES).where('id', id).first();
}

async function prices(filters, paging) {
  const qb = db(PRICES + ' as sp')
    .join('products as pr', 'pr.id', 'sp.product_id')
    .where('sp.is_deleted', !!filters.deleted);

  if (filters.product_id) qb.where('sp.product_id', filters.product_id);
  if (filters.q) qb.whereRaw('sp.part_name ILIKE ?', ['%' + filters.q + '%']);

  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const rows = await qb.select('sp.*', 'pr.name as product_name', 'pr.slug as product_slug')
    .orderBy('sp.' + paging.sort, paging.dir)
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
}

module.exports = {
  FAQS: FAQS,
  PRICES: PRICES,
  faqs: faqs,
  publishedFaqs: publishedFaqs,
  popularFaqs: popularFaqs,
  countFaqView: countFaqView,
  findFaq: findFaq,
  pricesOf: pricesOf,
  pricesPageOf: pricesPageOf,
  findPrice: findPrice,
  prices: prices
};
