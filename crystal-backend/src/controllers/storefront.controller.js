const service = require('../services/storefront.service');
const footer = require('../services/footer.service');
const blog = require('../services/blog.service');
const notices = require('../services/notices.service');
const integrity = require('../services/integrity.service');
const { ok, HttpError } = require('../utils/response');
const { flag } = require('../utils/query');

/**
 * The customer website's half of the API.
 *
 * `req.device.mediaDevice` is what decides which artwork comes back - the
 * middleware resolved it once, from the User-Agent and the client's override
 * header, and nothing here re-reads either.
 */
function deviceOf(req) {
  return req.device ? req.device.mediaDevice : 'desktop';
}

/* ---- catalogue ---- */

async function categories(req, res) {
  return ok(res, await service.categories(req.query.type, deviceOf(req)));
}

async function series(req, res) {
  return ok(res, await service.series({
    category_id: req.query.category_id,
    category_type: req.query.type,
    category_slug: req.query.category
  }, deviceOf(req)));
}

/**
 * The catalogue grid.
 *
 * Filters arrive as SLUGS (`?series=c9`, `?category=smartphones`) because that
 * is what a link somebody pastes into a chat window carries - an id would tie
 * a shared URL to one database.  Ids are still accepted for the callers that
 * already hold one.
 */
async function list(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 12));

  return ok(res, await service.browse({
    category_id: req.query.category_id,
    series_id: req.query.series_id,
    category_type: req.query.type,
    category_slug: req.query.category,
    series_slug: req.query.series,
    q: req.query.q,
    price_min: req.query.price_min,
    price_max: req.query.price_max,
    screen_min: req.query.screen_min,
    screen_max: req.query.screen_max,
    is_featured: req.query.featured,
    sort: req.query.sort
  }, { page: page, limit: limit, offset: (page - 1) * limit }));
}

async function landing(req, res) {
  return ok(res, await service.landing(String(req.params.type).toUpperCase(), deviceOf(req)));
}

async function detail(req, res) {
  return ok(res, await service.detail(req.params.slug, deviceOf(req)));
}

async function gallery(req, res) {
  return ok(res, await service.galleryOf(req.params.slug, deviceOf(req)));
}

async function servicePricing(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));

  return ok(res, await service.servicePricingOf(req.params.slug, {
    page: page, limit: limit, offset: (page - 1) * limit
  }, req.query.q));
}

async function osHistory(req, res) {
  return ok(res, await service.osHistoryOf(req.params.slug));
}

async function compare(req, res) {
  return ok(res, await service.compare(req.query.id));
}

async function comparable(req, res) {
  return ok(res, await service.comparable(req.query.type));
}

/* ---- support ---- */

/** Shared by the website and native apps; the console owns the document. */
async function siteFooter(req, res) {
  return ok(res, await footer.get());
}

/**
 * Serves only the exact upload bytes whose stored admin signature is valid.
 * The URL contains the signed SHA-256, so a successful response is immutable:
 * replacing an image produces a new URL instead of invalidating an old one.
 */
async function verifiedImage(req, res) {
  const result = await integrity.verifiedImage(req.query.path, req.query.sha256);
  if (!result) throw new HttpError(404, 'common.notFound');

  res.setHeader('Content-Type', result.content.mimeType);
  res.setHeader('Content-Length', String(result.buffer.length));
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.setHeader('ETag', '"sha256-' + result.content.sha256 + '"');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  return res.status(200).send(result.buffer);
}

/** GET /site/showcase/:placement - `home` or `smartphone`, for the requesting device. */
async function adverts(req, res) {
  const rows = await service.advertsFor(String(req.params.placement).toUpperCase(), deviceOf(req));
  /* A picture is drawn only once its bytes hash to what was signed; a film is not signed at all. */
  return ok(res, await integrity.media(rows));
}

/**
 * GET /site/popups - the full-screen adverts running today.
 *
 * Signed like every other advert: the browser draws one only once the bytes
 * it downloaded hash to what was signed, so the one picture a visitor cannot
 * scroll past is the one picture that is checked hardest.
 */
async function popups(req, res) {
  return ok(res, await integrity.media(await service.popups()));
}

async function supportHome(req, res) {
  return ok(res, await service.supportHome(deviceOf(req)));
}

async function faqs(req, res) {
  const filters = {
    category: req.query.category,
    q: req.query.q
  };

  /*
   * Paged only when a page is asked for, so the bands that want six
   * questions still get a plain array and no count query.
   */
  if (!req.query.page && !req.query.paged) {
    filters.limit = Math.min(200, Number(req.query.limit) || 50);
    return ok(res, await integrity.faqs(await service.faqs(filters)));
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));

  const result = await service.faqs(filters, {
    page: page, limit: limit, offset: (page - 1) * limit
  });

  return ok(res, {
    rows: await integrity.faqs(result.rows), total: result.total, page: page, limit: limit
  });
}

async function faq(req, res) {
  return ok(res, await integrity.faq(await service.faq(req.params.id)));
}

async function faqCategories(req, res) {
  return ok(res, await service.faqCategories());
}

async function centres(req, res) {
  const filters = {
    province: req.query.province,
    /*
     * The section a visitor is browsing from. Smartphone and eproduct
     * customers are served at different counters, so the same building
     * can appear on both section pages with a different service list.
     */
    section: req.query.section,
    service_type: req.query.service_type,
    q: req.query.q
  };

  /*
   * A hundred centres is more than a page. Paged when asked, so the bands
   * that want six for a landing page still get a plain array.
   */
  if (!req.query.page && !req.query.paged) {
    filters.limit = Math.min(100, Number(req.query.limit) || 30);
    return ok(res, await service.centres(filters));
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12));

  const result = await service.centrePage(filters, {
    page: page, limit: limit, offset: (page - 1) * limit
  });

  return ok(res, {
    rows: result.rows, total: result.total, page: page, limit: limit
  });
}

async function centre(req, res) {
  return ok(res, await service.centre(req.params.id));
}

async function regions(req, res) {
  return ok(res, await service.regions({ section: req.query.section }));
}

async function osVersions(req, res) {
  return ok(res, await service.osVersions());
}

async function latestOs(req, res) {
  return ok(res, await service.latestOs());
}

/**
 * Repair tracking, by ticket number.
 *
 * The number IS the credential here, deliberately: a customer with a printed
 * receipt and no account has to be able to see where their device is.  What
 * comes back is therefore narrowed hard - no bill breakdown, no internal
 * notes, only the events the centre marked public.
 */
async function trackRepair(req, res) {
  const tickets = require('../services/repairTickets.service');
  return ok(res, await tickets.publicStatusOf(String(req.params.ticketNo).toUpperCase()));
}

/* ---- blog ---- */

async function blogList(req, res) {
  const result = await blog.publicList({
    category: req.query.category,
    /*
     * ABSENT MEANS EITHER, not "not featured". flag() answers false for a
     * missing parameter, and false is a filter - so every article with a gold
     * recommendation was missing from the plain index, including the ones the
     * homepage was linking to from "From the blog".
     */
    featured: req.query.featured === undefined || req.query.featured === ''
      ? undefined
      : flag(req.query.featured),
    subject: req.query.subject,
    q: req.query.q,
    sort: req.query.sort,
    page: req.query.page,
    limit: req.query.limit
  });
  return ok(res, result);
}

/*
 * THE VISITOR IS THE ADDRESS, the way the vendor counts one: a read counts
 * once per address per article per day. `req.ip` is already the client's
 * address rather than the proxy's - app.js trusts one hop.
 */
async function blogDetail(req, res) {
  return ok(res, await blog.publicDetail(req.params.slug, req.ip));
}

async function blogReplies(req, res) {
  return ok(res, await blog.publicReplies(req.params.slug, req.query));
}

async function blogReply(req, res) {
  return ok(res, await blog.publicReply(req.params.id, req.query, req.ip));
}

async function blogCategories(req, res) {
  return ok(res, await blog.publicCategories());
}

async function blogSubjects(req, res) {
  return ok(res, await blog.publicSubjects());
}

async function blogFeatured(req, res) {
  return ok(res, await blog.featured(req.query.limit));
}

/**
 * THE COMPANY INTRODUCTION, in one answer.
 *
 * Ten chapters, and the storefront asks for them once - a request per chapter
 * would be ten round trips to draw one page, and a page that settles ten
 * times while somebody reads the first paragraph of it.
 */
/**
 * Everything live right now, highest first.
 *
 * An empty array is a completely normal answer - most days there is nothing
 * to say - so it is a 200 with an empty list rather than a 404, which the
 * storefront would have to treat as an error.
 *
 * A LIST rather than the one notice it used to be. The old endpoint answered
 * `.first()`, which meant a second thing worth saying on the same day waited
 * for the first to expire; the "only one at a time" rule belongs to the
 * dialog, and the dialog is where it now lives.
 */
async function liveNotices(req, res) {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  /* Each with its `integrity` envelope - the storefront renders a notice only once it verifies. */
  return ok(res, await integrity.notices(await notices.live(limit)));
}

module.exports = {
  siteFooter: siteFooter,
  verifiedImage: verifiedImage,
  adverts: adverts,
  popups: popups,
  liveNotices: liveNotices,
  categories: categories,
  series: series,
  list: list,
  landing: landing,
  detail: detail,
  gallery: gallery,
  servicePricing: servicePricing,
  osHistory: osHistory,
  compare: compare,
  comparable: comparable,

  supportHome: supportHome,
  faqs: faqs,
  faq: faq,
  faqCategories: faqCategories,
  centres: centres,
  centre: centre,
  regions: regions,
  osVersions: osVersions,
  latestOs: latestOs,
  trackRepair: trackRepair,

  blogList: blogList,
  blogDetail: blogDetail,
  blogReplies: blogReplies,
  blogReply: blogReply,
  blogCategories: blogCategories,
  blogSubjects: blogSubjects,
  blogFeatured: blogFeatured
};
