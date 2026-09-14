const db = require('../config/db');
const { applySearch } = require('../utils/query');

const TABLE = 'products';
const PK = 'id';
const COLORS = 'product_colors';
const ACCESSORIES = 'product_accessories';

/**
 * The catalogue's centre.
 *
 * Two audiences read this table and they want different things: the console
 * wants every product with its counts, and the storefront wants published
 * products with their artwork.  Both are here, and the storefront reads are
 * the ones with `PUBLISHED` written into them - a public endpoint that could
 * be talked into returning a draft is a launch leaked by a query parameter.
 */

const SELECT = [
  'p.*',
  'c.name as category_name', 'c.slug as category_slug', 'c.type as category_type',
  's.name as series_name', 's.slug as series_slug'
];

const SEARCHABLE = ['p.name', 'p.slug', 'p.model_code', 'p.tagline'];

function scope(deleted) {
  return db(TABLE + ' as p')
    .join('product_categories as c', 'c.id', 'p.category_id')
    .leftJoin('product_series as s', 's.id', 'p.series_id')
    .where('p.is_deleted', !!deleted);
}

function applyFilters(qb, filters) {
  if (filters.category_id) qb.where('p.category_id', filters.category_id);
  if (filters.series_id) qb.where('p.series_id', filters.series_id);
  if (filters.category_type) qb.where('c.type', filters.category_type);

  /*
   * A SECTION, which is a set of category types rather than one.
   *
   * "Eproduct" is televisions, set-top boxes, computers and cameras - a
   * section of the storefront, not a category - so the console page that owns
   * it filters on a list. Set from the page the request was authorised
   * against, never from the query string; see middleware/section.js.
   */
  if (filters.category_types && filters.category_types.length) {
    qb.whereIn('c.type', filters.category_types);
  }
  if (filters.status) qb.where('p.status', filters.status);
  if (filters.is_featured !== undefined && filters.is_featured !== '') {
    qb.where('p.is_featured', filters.is_featured === true || filters.is_featured === '1');
  }
  return qb;
}

async function search(filters, paging) {
  const qb = applyFilters(applySearch(scope(filters.deleted), SEARCHABLE, filters.q), filters);

  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const rows = await qb.select(SELECT)
    .select(
      db.raw('(SELECT COUNT(*) FROM product_specifications ps WHERE ps.product_id = p.id) AS spec_cnt'),
      db.raw("(SELECT COUNT(*) FROM media_assets m WHERE m.owner_type = 'PRODUCT' AND m.owner_id = p.id) AS media_cnt"),
      db.raw('(SELECT COUNT(*) FROM service_prices sp WHERE sp.product_id = p.id AND sp.is_deleted = false) AS price_cnt')
    )
    .orderBy('p.' + paging.sort, paging.dir)
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
}

function options(deleted) {
  return scope(deleted).orderBy('p.name').limit(1000)
    // The category TYPE rides along so a section-scoped screen can offer
    // only the products it owns - a smartphone price list must not be able
    // to name a television.
    .select('p.id', 'p.name', 'p.slug', 'p.model_code', 'p.category_id', 'p.series_id',
      'p.currency', 'c.type as category_type');
}

function findById(id, deleted) {
  return scope(deleted).where('p.id', id).first(SELECT);
}

/** The storefront's read: published only, addressed by slug as the spec writes it. */
function findPublishedBySlug(slug) {
  return scope(false).where('p.slug', slug).where('p.status', 'PUBLISHED').first(SELECT);
}

function findRow(id, trx) {
  return (trx || db)(TABLE).where(PK, id).first();
}

/** The serial lookup arrives with a model code, not a slug. */
function findByModelCode(modelCode, trx) {
  return (trx || db)(TABLE)
    .whereRaw('lower(model_code) = lower(?)', [String(modelCode || '').trim()])
    .where('is_deleted', false)
    .first();
}

function findBySlug(slug, exceptId, trx) {
  const qb = (trx || db)(TABLE).where('slug', slug);
  if (exceptId) qb.whereNot(PK, exceptId);
  return qb.first(PK);
}

/**
 * The storefront's browse: published only, paged, filtered and sorted.
 *
 * Separate from `search` because the two have different jobs.  `search` is the
 * console's grid - it counts specifications and media and it can be asked for
 * drafts.  This one can never return anything but PUBLISHED, takes its filters
 * as SLUGS because that is what a shareable catalogue URL carries, and sorts
 * off a whitelist: letting the caller name the ORDER BY column is how a
 * catalogue endpoint gets talked into paging out a table it does not own.
 */
const BROWSE_SORTS = {
  recommended: [{ column: 'p.sort_order', order: 'asc' }, { column: 'p.id', order: 'asc' }],
  newest: [{ column: 'p.release_date', order: 'desc' }, { column: 'p.id', order: 'desc' }],
  'price-asc': [{ column: 'p.price', order: 'asc' }],
  'price-desc': [{ column: 'p.price', order: 'desc' }],
  name: [{ column: 'p.name', order: 'asc' }],
  rating: [{ column: 'p.rating_avg', order: 'desc' }, { column: 'p.rating_count', order: 'desc' }]
};

/*
 * Screen size is a SPECIFICATION, not a column, so both the filter and its
 * bounds reach into the dictionary rather than the products table.  Matching
 * the definition BY NAME keeps this from hard-coding an id the seed happens
 * to produce.
 *
 * The guard is shared so the filter and the bounds cannot come to disagree
 * about what counts as a number: a sheet is free text, and one product with
 * "6.7 inches" typed into it must simply not count rather than fail the cast
 * and take the whole query down with it.  It is BOUND rather than inlined
 * because knex reads a `?` in raw SQL as a placeholder, and this pattern
 * carries one.
 */
const SCREEN_SPEC = 'screen size';
const SCREEN_NUMERIC = '^[0-9]+(\\.[0-9]+)?$';

function screenScope(qb) {
  return qb
    .join('specification_definitions as sdx', 'sdx.id', 'psx.specification_id')
    .whereRaw('lower(sdx.name) = ?', [SCREEN_SPEC])
    .whereRaw('psx.value ~ ?', [SCREEN_NUMERIC]);
}

function browseScope(filters) {
  const qb = applySearch(scope(false).where('p.status', 'PUBLISHED'), SEARCHABLE, filters.q);

  applyFilters(qb, filters);
  if (filters.category_slug) qb.where('c.slug', filters.category_slug);
  if (filters.series_slug) qb.where('s.slug', filters.series_slug);
  if (present(filters.price_min)) qb.where('p.price', '>=', Number(filters.price_min));
  if (present(filters.price_max)) qb.where('p.price', '<=', Number(filters.price_max));

  if (present(filters.screen_min) || present(filters.screen_max)) {
    qb.whereExists(function () {
      const inner = screenScope(this.select(db.raw('1')).from('product_specifications as psx'))
        .whereRaw('psx.product_id = p.id');

      // The cast is because a spec value is text, and '6.9' sorts before '10'
      // as one.  Max is exclusive so adjacent bands do not both claim 6.5.
      if (present(filters.screen_min)) {
        inner.whereRaw('CAST(psx.value AS numeric) >= ?', [Number(filters.screen_min)]);
      }
      if (present(filters.screen_max)) {
        inner.whereRaw('CAST(psx.value AS numeric) < ?', [Number(filters.screen_max)]);
      }
      return inner;
    });
  }

  return qb;
}

/** A filter the caller actually sent, as opposed to one it left blank. */
function present(value) {
  return value !== undefined && value !== null && value !== '';
}

async function browse(filters, paging) {
  const qb = browseScope(filters);

  const countRow = await qb.clone().clearSelect().clearOrder().count({ c: '*' }).first();

  const rows = await qb.select(SELECT)
    .orderBy(BROWSE_SORTS[filters.sort] || BROWSE_SORTS.recommended)
    .limit(paging.limit)
    .offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
}

/**
 * The price range and the screen sizes actually present in a result set.
 *
 * The filter panel offers bands, and a band that matches nothing is a dead
 * control - so the bounds come from the data rather than from a constant in
 * the browser.  Deliberately computed WITHOUT the price and screen filters
 * applied, or narrowing the price would immediately narrow the slider that
 * did the narrowing and there would be no way back.
 */
async function browseBounds(filters) {
  const base = Object.assign({}, filters);
  delete base.price_min;
  delete base.price_max;
  delete base.screen_min;
  delete base.screen_max;

  const scoped = browseScope(base).clearSelect().clearOrder();

  const [price, screen] = await Promise.all([
    scoped.clone().first(
      db.raw('MIN(p.price) AS price_min'),
      db.raw('MAX(p.price) AS price_max')
    ),
    // Read off the sheet of whatever products the scope selected, rather than
    // as a correlated column, so this stays one flat aggregate.
    screenScope(db('product_specifications as psx'))
      .whereIn('psx.product_id', scoped.clone().select('p.id'))
      .first(
        db.raw('MIN(CAST(psx.value AS numeric)) AS screen_min'),
        db.raw('MAX(CAST(psx.value AS numeric)) AS screen_max')
      )
  ]);

  return {
    price_min: num(price && price.price_min, 0),
    price_max: num(price && price.price_max, 0),
    // Null rather than zero: a section whose products have no screen at all
    // should get no screen control, and a zeroed band is not the same thing.
    screen_min: num(screen && screen.screen_min, null),
    screen_max: num(screen && screen.screen_max, null)
  };
}

function num(value, fallback) {
  return value === null || value === undefined ? fallback : Number(value);
}

/**
 * The finishes for a set of products, in one query.
 *
 * Taking a list rather than one id is what keeps a listing page of twenty-four
 * products at two queries instead of twenty-five.
 */
function colorsOf(productIds) {
  if (!productIds || !productIds.length) return Promise.resolve([]);
  return db(COLORS)
    .whereIn('product_id', productIds)
    .orderBy([{ column: 'product_id' }, { column: 'sort_order' }])
    .select('id', 'product_id', 'name', 'hex', 'sort_order');
}

/** What ships in the box, for one product. */
function accessoriesOf(productId) {
  return db(ACCESSORIES)
    .where('product_id', productId)
    .orderBy([{ column: 'sort_order' }, { column: 'id' }])
    .select('id', 'product_id', 'name', 'image', 'sort_order');
}

/**
 * Replaces a product's finishes, and its box, with the list the editor saved.
 *
 * Delete-then-insert rather than a diff: both lists are short, both are
 * edited as an ordered table, and reordering four rows through a diff is more
 * code than it saves.  The caller wraps it in a transaction so a product is
 * never briefly offered in no colour at all.
 *
 * `sort_order` comes from the POSITION in the array, not from the payload -
 * the console reorders by dragging, and asking an editor to keep a column of
 * numbers in step with what they can see is how two rows end up on 20.
 */
async function replaceColors(productId, entries, trx) {
  await (trx || db)(COLORS).where('product_id', productId).del();
  if (!entries || !entries.length) return [];

  return (trx || db)(COLORS).insert(entries.map(function (entry, index) {
    return {
      product_id: productId,
      name: entry.name,
      // A finish is a name and a hex. There is no image: the swatch is
      // painted from the hex, so the column it used to write is gone.
      hex: entry.hex,
      sort_order: (index + 1) * 10
    };
  })).returning('*');
}

async function replaceAccessories(productId, entries, trx) {
  await (trx || db)(ACCESSORIES).where('product_id', productId).del();
  if (!entries || !entries.length) return [];

  return (trx || db)(ACCESSORIES).insert(entries.map(function (entry, index) {
    return {
      product_id: productId,
      name: entry.name,
      image: entry.image || null,
      sort_order: (index + 1) * 10
    };
  })).returning('*');
}

/** Published products in a category or series, for the landing pages. */
function published(filters) {
  const qb = scope(false).where('p.status', 'PUBLISHED');
  applyFilters(qb, filters);
  if (filters.is_hero) qb.where('p.is_hero', true);
  return qb.orderBy([{ column: 'p.sort_order' }, { column: 'p.release_date', order: 'desc' }])
    .limit(filters.limit || 100)
    .select(SELECT);
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

/**
 * Only one product is the hero, so promoting one demotes the rest.
 *
 * Done as one UPDATE over everything else rather than as a read of the
 * current hero followed by a write: if two ever ended up set, this fixes it
 * on the next promotion instead of preserving the mistake.
 */
function clearHero(exceptId, trx) {
  return (trx || db)(TABLE).whereNot(PK, exceptId).where('is_hero', true).update({ is_hero: false });
}

module.exports = {
  COLORS: COLORS,
  ACCESSORIES: ACCESSORIES,
  TABLE: TABLE,
  PK: PK,
  search: search,
  options: options,
  findById: findById,
  findPublishedBySlug: findPublishedBySlug,
  findRow: findRow,
  findByModelCode: findByModelCode,
  findBySlug: findBySlug,
  browse: browse,
  browseBounds: browseBounds,
  colorsOf: colorsOf,
  accessoriesOf: accessoriesOf,
  replaceColors: replaceColors,
  replaceAccessories: replaceAccessories,
  published: published,
  insert: insert,
  update: update,
  softDelete: softDelete,
  restore: restore,
  clearHero: clearHero
};
