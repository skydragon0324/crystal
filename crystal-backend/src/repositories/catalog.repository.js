const db = require('../config/db');

const CATEGORIES = 'product_categories';
const SERIES = 'product_series';

/**
 * The two lookup tables above products.
 *
 * Both have a console half that goes through the CRUD factory and a
 * storefront half that lives here, and the storefront half always writes
 * `status = 'ACTIVE'` into the query rather than accepting it as a filter -
 * a public endpoint that can be talked into returning a draft category is a
 * section of the website leaked by a query parameter.
 */

/**
 * The sections, each with how many published products it holds.
 *
 * The count is here for the same reason it is on a series: a section tile
 * that cannot say how much is behind it reads as decoration, and the
 * alternative - a request per tile - is five requests to draw one row.
 */
function activeCategories(type) {
  const qb = db(CATEGORIES)
    .where({ is_deleted: false, status: 'ACTIVE' })
    .orderBy([{ column: 'sort_order' }, { column: 'id' }]);

  if (type) qb.where('type', type);
  return qb.select(
    'id', 'name', 'slug', 'type', 'icon', 'description', 'sort_order',
    db.raw("(SELECT COUNT(*) FROM products p WHERE p.category_id = product_categories.id AND p.is_deleted = false AND p.status = 'PUBLISHED') AS product_cnt")
  );
}

function findCategoryBySlug(slug) {
  return db(CATEGORIES)
    .where({ slug: slug, is_deleted: false, status: 'ACTIVE' })
    .first();
}

function findCategoryByType(type) {
  return db(CATEGORIES)
    .where({ type: type, is_deleted: false, status: 'ACTIVE' })
    .orderBy('sort_order')
    .first();
}

/**
 * Series in a category, each with how many published products it holds.
 *
 * The count is what lets the landing page skip a series that has nothing in
 * it yet - an empty C3 tile is worse than no C3 tile.
 */
function activeSeries(filters) {
  const qb = db(SERIES + ' as s')
    .join(CATEGORIES + ' as c', 'c.id', 's.category_id')
    .where('s.is_deleted', false)
    .where('s.status', 'ACTIVE')
    .where('c.is_deleted', false)
    .orderBy([{ column: 's.sort_order' }, { column: 's.id' }]);

  if (filters.category_id) qb.where('s.category_id', filters.category_id);
  if (filters.category_type) qb.where('c.type', filters.category_type);
  if (filters.category_slug) qb.where('c.slug', filters.category_slug);

  return qb.select(
    's.id', 's.name', 's.slug', 's.description', 's.banner_image',
    's.banner_image_mobile', 's.sort_order', 's.category_id',
    'c.name as category_name', 'c.slug as category_slug', 'c.type as category_type',
    db.raw("(SELECT COUNT(*) FROM products p WHERE p.series_id = s.id AND p.is_deleted = false AND p.status = 'PUBLISHED') AS product_cnt")
  );
}

function findSeriesBySlug(slug) {
  return db(SERIES).where({ slug: slug, is_deleted: false }).first();
}

module.exports = {
  CATEGORIES: CATEGORIES,
  SERIES: SERIES,
  activeCategories: activeCategories,
  findCategoryBySlug: findCategoryBySlug,
  findCategoryByType: findCategoryByType,
  activeSeries: activeSeries,
  findSeriesBySlug: findSeriesBySlug
};
