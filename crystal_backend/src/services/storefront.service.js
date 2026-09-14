const catalog = require('../repositories/catalog.repository');
const products = require('../repositories/products.repository');
const specifications = require('../repositories/specifications.repository');
const media = require('../repositories/media.repository');
const productImages = require('../repositories/productImages.repository');
const os = require('../repositories/os.repository');
const support = require('../repositories/support.repository');
const agencies = require('../repositories/agencies.repository');
const { HttpError } = require('../utils/response');
const { SYSTEMS, rankOf } = require('../utils/systems');

/**
 * Everything the customer website reads.
 *
 * There is no write path in this file at all, and that is the point: the
 * storefront router mounts only this service, so a public endpoint cannot
 * mutate the catalogue even by mistake.  Every read also writes
 * `status = 'PUBLISHED'` into the query itself rather than taking it as a
 * filter - an unreleased handset must not be reachable by guessing a
 * parameter.
 *
 * The page builders below - `landing`, `detail`, `supportHome` - each assemble
 * several repositories into one payload.  They exist because the alternative
 * is a browser making six requests to draw one screen, and because the
 * ordering rules between those six (which artwork for which device, which
 * series to hide) are business decisions rather than presentation.
 */

const COMPARE_MIN = 2;
const COMPARE_MAX = 4;

/**
 * The sections, each with the banner for the requesting device.
 *
 * The artwork is a media asset rather than a column - a category has a
 * desktop banner and a mobile one - so it is attached here, in one extra
 * query for the whole list.  Without it a page listing five sections either
 * draws five blank panels or guesses at a file path, and a guessed path is a
 * broken image the moment somebody uploads a real one.
 */
async function categories(type, device) {
  const rows = await catalog.activeCategories(type);
  if (!rows.length) return rows;

  const banners = await media.ofOwners('CATEGORY', rows.map(function (row) { return row.id; }),
    { purpose: 'BANNER', device: device });

  const byOwner = {};
  banners.forEach(function (asset) {
    if (!byOwner[asset.owner_id]) byOwner[asset.owner_id] = asset;
  });

  return rows.map(function (row) {
    return Object.assign({}, row, {
      banner_image: byOwner[row.id] ? byOwner[row.id].file_path : null
    });
  });
}

function series(filters) {
  return catalog.activeSeries(filters || {});
}

function list(filters) {
  return products.published(filters || {});
}

/**
 * The catalogue grid (spec 7.2).
 *
 * Paged, because a section with sixty products is three screens of scrolling
 * with no way to link to the second one, and the browser should not be
 * receiving sixty rows to draw twelve.
 *
 * The finishes are attached HERE rather than being a second call from the
 * page: the swatch row is part of the card, and a listing that has to fetch
 * per tile draws twenty-four times.
 */
async function browse(filters, paging) {
  const [result, bounds] = await Promise.all([
    products.browse(filters, paging),
    products.browseBounds(filters)
  ]);

  return {
    rows: await withColors(result.rows),
    total: result.total,
    page: paging.page,
    limit: paging.limit,
    // What the filter panel may offer, taken from the data rather than from a
    // constant the browser would have to keep in step with the catalogue.
    bounds: bounds
  };
}

/** Attaches each product's finishes, in one extra query for the whole page. */
async function withColors(rows) {
  if (!rows.length) return rows;

  const colors = await products.colorsOf(rows.map(function (row) { return row.id; }));
  const byProduct = {};
  colors.forEach(function (color) {
    (byProduct[color.product_id] = byProduct[color.product_id] || []).push(color);
  });

  return rows.map(function (row) {
    return Object.assign({}, row, { colors: byProduct[row.id] || [] });
  });
}

/**
 * The landing page for a section (spec 7).
 *
 * One builder for the smartphone page and for every Eproducts section,
 * because only the category type differs - and two copies of this would drift
 * the moment somebody added a block to one of them.
 */
async function landing(type, device) {
  const category = await catalog.findCategoryByType(type);
  if (!category) throw new HttpError(404, 'common.notFound');

  const [heroSlides, hero, lines, featured, latest, osRelease, centres]
    = await Promise.all([
      /*
       * THE SECTION'S OWN ADVERTISING, and the reason this exists.
       *
       * The hero used to be a PRODUCT - whichever one was flagged - so the
       * top of the page was that product's studio photograph. What belongs
       * there is advertising for the range: "the C9 line", "fast charging
       * on the C7 Pro". Those are pictures of nothing in particular and
       * belong to the SECTION, which is what these are.
       */
      media.ofOwner('CATEGORY', category.id, { purpose: 'HERO', device: device }),
      products.published({ category_id: category.id, is_hero: true, limit: 1 }),
      catalog.activeSeries({ category_id: category.id }),
      products.published({ category_id: category.id, is_featured: true, limit: 8 }),
      products.published({ category_id: category.id, limit: 12 }),
      os.latest(),
      agencies.nearest({
        limit: 6,
        service_type: 'REPAIR',
        // The centres that serve THIS section, with this section's services.
        section: type === 'SMARTPHONE' ? 'SMARTPHONE' : 'EPRODUCT'
      })
    ]);

  // A hero is optional; falling back to the newest published product means the
  // page always has something at the top rather than a hole.
  const heroProduct = hero[0] || latest[0] || null;

  return {
    category: category,
    /*
     * The advertising run for the top of the page. Empty is a normal
     * answer - a section with none falls back to the flagged product
     * below, so the page still opens with something.
     */
    hero_slides: heroSlides,
    hero: heroProduct ? await withMedia(heroProduct, device) : null,
    // A series with nothing published in it is a tile that goes nowhere.
    series: lines.filter(function (line) { return Number(line.product_cnt) > 0; }),
    featured: await withColors(featured),
    latest: await withColors(latest),
    os: osRelease,
    support: {
      centres: centres,
      // The questions this section's customers actually ask, not all of them.
      faqs: await support.publishedFaqs({ product_category_id: category.id, limit: 6 })
    }
  };
}

/** A product with the artwork this device should be served. */
async function withMedia(product, device) {
  const assets = await media.ofOwner('PRODUCT', product.id, { device: device });
  return Object.assign({}, product, { media: assets });
}

/**
 * One product, with the five tabs the spec lists.
 *
 * Read in parallel: none of them depends on another, and a detail page that
 * issues them one after another is five round trips for one screen.
 */
async function detail(slug, device) {
  const product = await products.findPublishedBySlug(slug);
  if (!product) throw new HttpError(404, 'common.notFound');

  const [assets, mainImages, specs, pricing, history, siblings, colors, accessories]
    = await Promise.all([
    media.ofOwner('PRODUCT', product.id, { device: device }),
    // The studio set: 1 to 3 square shots at the top of the page.
    productImages.ofProduct(product.id, { kind: 'MAIN', device: device }),
    specifications.sheetOf(product.id),
    support.pricesOf(product.id),
    os.historyOf(product.id),
    product.series_id
      ? products.published({ series_id: product.series_id, limit: 6 })
      : Promise.resolve([]),
    products.colorsOf([product.id]),
    products.accessoriesOf(product.id)
  ]);

  return {
    product: product,
    media: assets,
    images: mainImages,
    // The finishes and the box are the product's own lists, so they sit beside
    // it rather than inside the specification sheet - a sheet is what the
    // compare matrix reads, and neither of these lines up against anything.
    colors: colors,
    accessories: accessories,
    specifications: groupSpecs(specs),
    /*
     * The published price list, and whether the product wants it shown.
     *
     * Some products have prices recorded but nothing worth publishing, so the
     * switch is on the product rather than inferred from the list being
     * empty - the storefront hides the tab for either reason.
     */
    service_pricing: product.show_service_pricing === false ? [] : pricing,
    os_history: history,
    // The rest of the line, so a customer who wants the bigger one can find it
    // without going back to the landing page.
    related: await withColors(siblings.filter(function (item) { return item.id !== product.id; }))
  };
}

/**
 * The flat specification rows, folded into the groups they belong to.
 *
 * Done here rather than in the browser so that the website and the console
 * draw the same sheet in the same order, and so a group with no values in it
 * simply does not appear.
 */
function groupSpecs(rows) {
  const groups = [];
  const index = {};

  rows.forEach(function (row) {
    if (!index[row.group_id]) {
      index[row.group_id] = {
        group_id: row.group_id,
        group_name: row.group_name,
        group_code: row.group_code,
        items: []
      };
      groups.push(index[row.group_id]);
    }

    index[row.group_id].items.push({
      specification_id: row.specification_id,
      name: row.name,
      unit: row.unit,
      value: row.value,
      compare_enabled: row.compare_enabled
    });
  });

  return groups;
}

/**
 * The gallery tab: the ADVERTISING run for a product, not its catalogue shots.
 *
 * These are the long marketing panels - the ones a phone maker publishes down
 * a product page, each one a whole picture with its own copy burnt in - which
 * is the ADVERT kind in product_images.  MAIN is the studio set (front, back,
 * angle) and that already appears as the images at the top of the page;
 * showing it again under a tab is the same four photographs twice.
 */
async function galleryOf(slug, device) {
  const product = await products.findPublishedBySlug(slug);
  if (!product) throw new HttpError(404, 'common.notFound');

  const adverts = await productImages.ofProduct(product.id,
    { kind: 'ADVERT', device: device });
  if (adverts.length) return adverts;

  // A product with no advertising run falls back to its studio set, so a
  // tab that would otherwise be empty still shows something.
  return productImages.ofProduct(product.id, { kind: 'MAIN', device: device });
}

/**
 * The published price list for one product, a page at a time.
 *
 * Paged because it is a published document rather than a summary: every line
 * carries the part price, the labour and the reference the figure was
 * approved under, and thirty of those is a page of its own.
 */
async function servicePricingOf(slug, paging, term) {
  const product = await products.findPublishedBySlug(slug);
  if (!product) throw new HttpError(404, 'common.notFound');

  const result = await support.pricesPageOf(product.id, paging, term);

  return {
    rows: result.rows,
    total: result.total,
    page: paging.page,
    limit: paging.limit
  };
}

async function osHistoryOf(slug) {
  const product = await products.findPublishedBySlug(slug);
  if (!product) throw new HttpError(404, 'common.notFound');
  return os.historyOf(product.id);
}

/**
 * The comparison matrix (spec 7).
 *
 * Two to four products, because one is not a comparison and five does not fit
 * on a screen the customer is holding.  The pivot itself is done in the
 * specification repository so that both frontends render the same table
 * without either re-implementing the alignment.
 */
async function compare(ids) {
  const wanted = String(ids || '')
    .split(',')
    .map(function (id) { return Number(String(id).trim()); })
    .filter(function (id) { return id > 0; });

  if (wanted.length < COMPARE_MIN) {
    throw new HttpError(400, 'storefront.chooseAtLeastProducts', null, { n: COMPARE_MIN });
  }

  const matrix = await specifications.compare(wanted.slice(0, COMPARE_MAX));
  if (!matrix.products.length) throw new HttpError(404, 'common.notFound');
  return matrix;
}

/**
 * What can be put in a comparison.
 *
 * Only published products in a section, because comparing a phone with a
 * television produces a table of eighty blank cells.
 */
function comparable(type) {
  return products.published({ category_type: type || 'SMARTPHONE', limit: 40 });
}

/* ------------------------------------------------------------------ */
/*  the support section                                                */
/* ------------------------------------------------------------------ */

/**
 * The support landing page (spec's "Support Page" section).
 *
 * Assembled here for the same reason the product landing page is: the browser
 * would otherwise make five calls, and which six questions count as "popular"
 * is a decision rather than a rendering detail.
 */
async function supportHome(device) {
  const [popular, centres, provinces, latestOs, categories_] = await Promise.all([
    support.popularFaqs(6),
    agencies.nearest({ limit: 8 }),
    agencies.provinces(),
    os.latest(),
    catalog.activeCategories()
  ]);

  return {
    popular_faqs: popular,
    centres: centres,
    provinces: provinces,
    os: latestOs,
    categories: categories_
  };
}

/**
 * The published questions.
 *
 * Paged when the caller asks for a page - the FAQ page has a hundred of
 * them and a search box, and a search that only looks at the first fifty
 * is worse than no search. Unpaged for the bands that want a handful.
 */
function faqs(filters, paging) {
  return support.publishedFaqs(filters || {}, paging);
}

/**
 * One answer, and the fact that somebody read it.
 *
 * The count is what "Popular Problems" is ordered by, so it has to be
 * incremented on a read - and it is done as an UPDATE rather than a
 * read-modify-write so two people opening the same answer add two.
 */
async function faq(id) {
  const row = await support.findFaq(id);
  if (!row || row.is_deleted || row.status !== 'PUBLISHED') throw new HttpError(404, 'common.notFound');

  await support.countFaqView(id);
  return row;
}

/**
 * The filter chips above the FAQ, with what each one holds.
 *
 * IN THE VOCABULARY'S OWN ORDER, not in the order the rows happened to come
 * back. The five systems have a reading order - the two catalogue sections
 * first, because most questions are about a product somebody is holding -
 * and a list of chips that reorders itself as questions are published is a
 * list nobody can build a habit on.
 *
 * A category with nothing published in it is left out rather than shown
 * empty: a chip that answers "no questions here" is a click that cost the
 * reader something and returned nothing.
 */
function faqCategories() {
  return support.publishedFaqs({ limit: 1000 }).then(function (rows) {
    const counts = {};
    rows.forEach(function (row) {
      counts[row.category] = (counts[row.category] || 0) + 1;
    });

    const known = SYSTEMS
      .filter(function (code) { return counts[code]; })
      .map(function (code) { return { category: code, count: counts[code] }; });

    /*
     * Anything outside the vocabulary still gets a chip, after the five. The
     * check constraint should make this impossible; a database restored from
     * before delta 010 is exactly when "impossible" turns out not to be, and
     * silently hiding those questions would be worse than an odd chip.
     */
    const strays = Object.keys(counts)
      .filter(function (code) { return rankOf(code) === -1; })
      .sort()
      .map(function (code) { return { category: code, count: counts[code] }; });

    return known.concat(strays);
  });
}

function centres(filters) {
  return agencies.nearest(filters || {});
}

/** The locator, a page at a time - see the repository. */
function centrePage(filters, paging) {
  return agencies.nearestPage(filters || {}, paging);
}

async function centre(id) {
  const row = await agencies.findById(id, false);
  if (!row || row.status !== 'ACTIVE') throw new HttpError(404, 'common.notFound');
  const services = await agencies.servicesOf(id);
  return Object.assign({}, row, { services: services });
}

function regions() {
  return agencies.provinces();
}

/**
 * The Crystal OS releases, each with the pictures published alongside it.
 *
 * A release note is a wall of text on its own, and the page that shows it is
 * a marketing page rather than a changelog - so the artwork is fetched with
 * the list, in one query for all of them, and a release with none simply
 * falls back to its cover image.
 */
async function osVersions() {
  const rows = await os.published(20);
  if (!rows.length) return rows;

  const shots = await media.ofOwners('OS_VERSION',
    rows.map(function (row) { return row.id; }));

  const byOwner = {};
  shots.forEach(function (asset) {
    if (!byOwner[asset.owner_id]) byOwner[asset.owner_id] = [];
    byOwner[asset.owner_id].push(asset);
  });

  return rows.map(function (row) {
    return Object.assign({}, row, { images: byOwner[row.id] || [] });
  });
}

function latestOs() {
  return os.latest();
}

module.exports = {
  COMPARE_MIN: COMPARE_MIN,
  COMPARE_MAX: COMPARE_MAX,

  categories: categories,
  series: series,
  list: list,
  browse: browse,
  landing: landing,
  detail: detail,
  galleryOf: galleryOf,
  servicePricingOf: servicePricingOf,
  osHistoryOf: osHistoryOf,
  compare: compare,
  comparable: comparable,

  supportHome: supportHome,
  faqs: faqs,
  faq: faq,
  faqCategories: faqCategories,
  centres: centres,
  centrePage: centrePage,
  centre: centre,
  regions: regions,
  osVersions: osVersions,
  latestOs: latestOs
};
