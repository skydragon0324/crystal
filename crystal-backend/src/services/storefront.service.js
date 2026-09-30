const catalog = require('../repositories/catalog.repository');
const products = require('../repositories/products.repository');
const specifications = require('../repositories/specifications.repository');
const media = require('../repositories/media.repository');
const adverts = require('../repositories/adverts.repository');
const productImages = require('../repositories/productImages.repository');
const os = require('../repositories/os.repository');
const support = require('../repositories/support.repository');
const agencies = require('../repositories/agencies.repository');
const integrity = require('./integrity.service');
const { HttpError } = require('../utils/response');
const { FAQ_CATEGORIES, rankOf } = require('../utils/faqCategories');

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

  const signedBanners = await integrity.images(banners);
  const byOwner = {};
  signedBanners.forEach(function (asset) {
    if (!byOwner[asset.owner_id]) byOwner[asset.owner_id] = asset;
  });

  return rows.map(function (row) {
    return Object.assign({}, row, {
      banner_image: byOwner[row.id] ? byOwner[row.id].file_path : null
      , banner_integrity: byOwner[row.id] ? byOwner[row.id].integrity : null
    });
  });
}

async function series(filters, device) {
  const rows = await catalog.activeSeries(filters || {});
  return attachSeriesBanners(rows, device);
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
    rows: await withColors(await attachImageIntegrity(result.rows, 'main_image', 'main_image_integrity')),
    total: result.total,
    page: paging.page,
    limit: paging.limit,
    // What the filter panel may offer, taken from the data rather than from a
    // constant the browser would have to keep in step with the catalogue.
    bounds: bounds
  };
}

async function attachImageIntegrity(rows, column, envelopeColumn) {
  return Promise.all((rows || []).map(async function (row) {
    const envelope = await integrity.imageEnvelope(row[column]);
    return Object.assign({}, row, { [envelopeColumn]: envelope });
  }));
}

/** Sign both series crops and expose the crop for this device under the
 * existing banner_image name consumed by the cards. */
async function attachSeriesBanners(rows, device) {
  return Promise.all((rows || []).map(async function (row) {
    const desktop = await integrity.imageEnvelope(row.banner_image);
    const mobile = await integrity.imageEnvelope(row.banner_image_mobile);
    const useMobile = device === 'mobile' && row.banner_image_mobile;
    return Object.assign({}, row, {
      banner_image: useMobile ? row.banner_image_mobile : row.banner_image,
      banner_integrity: useMobile ? mobile : desktop,
      banner_image_mobile_integrity: mobile
    });
  }));
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
 * How many products the "latest" block shows.
 *
 * One row of tiles on the smartphone page, and the same number on every
 * eproduct section so the two pages are built the same way. A shortlist that
 * is long enough to scroll is a catalogue, and the catalogue is one click
 * away under its own heading.
 */
const LATEST_LIMIT = 4;

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
      /*
       * The smartphone page's run is an ADVERT placement of its own, run
       * from the console's Smartphone adverts page; the eproduct sections
       * keep theirs on the category. Same row shape either way, so the page
       * draws both without knowing which it was given.
       */
      type === 'SMARTPHONE'
        ? adverts.live('SMARTPHONE', device)
        : media.ofOwner('CATEGORY', category.id, { purpose: 'HERO', device: device }),
      products.published({ category_id: category.id, is_hero: true, limit: 1 }),
      catalog.activeSeries({ category_id: category.id }),
      products.published({ category_id: category.id, is_featured: true, limit: 8 }),
      /*
       * "LATEST" IS THE RELEASE DATE, and no more than four of them.
       *
       * It used to be `published()` with its default order, which is
       * `sort_order` first - somebody's arrangement of the shelf, with the
       * date only breaking ties. So the block called "latest" showed whatever
       * had been dragged to the top of the console list, and a phone released
       * last month sat below one from two years ago because nobody had
       * re-ordered anything. It was not wrong by a little; it was answering a
       * different question.
       *
       * `products.release_date` is what decides it - the column the catalogue
       * already sorts its "newest" browse by, and the only date on the row
       * that means anything to a customer. `created_at` is when somebody
       * typed the product into the console, which is close enough to be
       * tempting and is a fact about the office rather than the product.
       *
       * FOUR, because the block is one row of tiles. Twelve filled the page
       * with everything the category had and stopped being a shortlist.
       */
      products.published({
        category_id: category.id,
        order: 'NEWEST',
        limit: LATEST_LIMIT
      }),
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

  /*
   * THE TWO HERO RUNS AND THE FAQ BLOCK carry `integrity` envelopes - the
   * storefront draws a slide only once its bytes hash to what was signed, and
   * an answer only once its signature verifies. See integrity.service.js.
   */
  const heroWithMedia = heroProduct ? await withMedia(heroProduct, device) : null;
  if (heroWithMedia) heroWithMedia.media = await integrity.images(heroWithMedia.media);

  return {
    category: category,
    /*
     * The advertising run for the top of the page. Empty is a normal
     * answer - a section with none falls back to the flagged product
     * below, so the page still opens with something.
     */
    /* The smartphone run may hold a film; integrity.media leaves those unsigned. */
    hero_slides: await integrity.media(heroSlides),
    hero: heroWithMedia,
    // A series with nothing published in it is a tile that goes nowhere.
    series: await attachSeriesBanners(
      lines.filter(function (line) { return Number(line.product_cnt) > 0; }), device),
    featured: await withColors(await attachImageIntegrity(featured, 'main_image', 'main_image_integrity')),
    latest: await withColors(await attachImageIntegrity(latest, 'main_image', 'main_image_integrity')),
    os: osRelease ? Object.assign({}, osRelease, {
      cover_image_integrity: await integrity.imageEnvelope(osRelease.cover_image)
    }) : null,
    support: {
      centres: centres,
      /*
       * The questions this section's customers actually ask, not all of them -
       * asked for by the section's PRODUCT KIND, which is an FAQ category
       * value for value (sql/deltas/033). It used to be the catalogue section's
       * id plus every question pinned to no section at all, which put "how do
       * I sign in to the Crystal App" on the television page.
       */
      faqs: await integrity.faqs(await support.publishedFaqs({ category: category.type, limit: 6 }))
    }
  };
}

/**
 * One advertising run - HOME or SMARTPHONE - for this device.
 *
 * The homepage's run is not the smartphone page's and never was meant to be:
 * the homepage used to show the flagged smartphone's photographs, because it
 * had nothing of its own to show.
 */
async function advertsFor(placement, device) {
  if (!adverts.isPlacement(placement)) throw new HttpError(404, 'common.notFound');
  return adverts.live(placement, device);
}

/**
 * The popups running today, for the homepage to show over itself.
 *
 * WHETHER a visitor has already seen them is not decided here. The server
 * says what is live; the browser remembers, for its own session, which of
 * these it has shown - so the answer is the same for everybody and stays
 * cacheable, and a member reading on two devices is not told by the server
 * that one of them has already had its turn.
 */
async function popups() {
  return adverts.livePopups();
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

  /*
   * EVERY PICTURE THE PAGE DRAWS carries an `integrity` envelope: the studio
   * set, the product's media, and the cover image the page falls back to when
   * there is no studio set - that one as `product.main_image_integrity`,
   * beside the column it describes.
   */
  const [signedAssets, signedImages, mainImageIntegrity] = await Promise.all([
    integrity.images(assets),
    integrity.images(mainImages),
    integrity.imageEnvelope(product.main_image)
  ]);

  return {
    product: Object.assign({}, product, { main_image_integrity: mainImageIntegrity }),
    media: signedAssets,
    images: signedImages,
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
  if (adverts.length) return integrity.images(adverts);

  // A product with no advertising run falls back to its studio set, so a
  // tab that would otherwise be empty still shows something.
  return integrity.images(await productImages.ofProduct(product.id, { kind: 'MAIN', device: device }));
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
  matrix.products = await attachImageIntegrity(matrix.products, 'main_image', 'main_image_integrity');
  return matrix;
}

/**
 * What can be put in a comparison.
 *
 * Only published products in a section, because comparing a phone with a
 * television produces a table of eighty blank cells.
 */
async function comparable(type) {
  return attachImageIntegrity(
    await products.published({ category_type: type || 'SMARTPHONE', limit: 40 }),
    'main_image', 'main_image_integrity'
  );
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
 * back. The categories have a reading order - the product kinds first,
 * because most questions are about something somebody is holding, then the
 * Crystal App, the Eshop and the Appstore - and a list of chips that reorders
 * itself as questions are published is a list nobody can build a habit on.
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

    const known = FAQ_CATEGORIES
      .filter(function (code) { return counts[code]; })
      .map(function (code) { return { category: code, count: counts[code] }; });

    /*
     * Anything outside the vocabulary still gets a chip, after the eight. The
     * enum should make this impossible; a database restored from before delta
     * 033 is exactly when "impossible" turns out not to be, and silently
     * hiding those questions would be worse than an odd chip.
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

/**
 * One centre, as a visitor may see it.
 *
 * The PUBLIC columns only (agencies.repository.js) - this used to read the
 * console's `a.*`, which sent the SLA, the daily capacity and the audit
 * timestamps to anybody who asked for a centre by id, and would have sent the
 * landmark too.
 */
async function centre(id) {
  const row = await agencies.publicById(id);
  if (!row) throw new HttpError(404, 'common.notFound');
  const services = await agencies.servicesOf(id);
  return Object.assign({}, row, { services: services });
}

/**
 * The province filter's entries, in the order set on the Provinces screen -
 * narrowed to the centres of one counter when the page is one counter's.
 */
function regions(filters) {
  return agencies.provinces(filters || {});
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

  const shots = await integrity.images(await media.ofOwners('OS_VERSION',
    rows.map(function (row) { return row.id; })));

  const byOwner = {};
  shots.forEach(function (asset) {
    if (!byOwner[asset.owner_id]) byOwner[asset.owner_id] = [];
    byOwner[asset.owner_id].push(asset);
  });

  return Promise.all(rows.map(async function (row) {
    return Object.assign({}, row, {
      images: byOwner[row.id] || [],
      cover_image_integrity: await integrity.imageEnvelope(row.cover_image)
    });
  }));
}

async function latestOs() {
  const row = await os.latest();
  return row ? Object.assign({}, row, {
    cover_image_integrity: await integrity.imageEnvelope(row.cover_image)
  }) : null;
}

module.exports = {
  COMPARE_MIN: COMPARE_MIN,
  COMPARE_MAX: COMPARE_MAX,

  categories: categories,
  series: series,
  list: list,
  browse: browse,
  landing: landing,
  advertsFor: advertsFor,
  popups: popups,
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
