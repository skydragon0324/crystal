const Router = require('express-promise-router');
const controller = require('../controllers/storefront.controller');

/**
 * Everything the customer website reads, and nothing it can write.
 *
 * There is no auth middleware on this router and there is no write verb on it
 * either - the two facts belong together.  The member area, which needs both,
 * is account.routes.js.
 *
 * Order matters: /compare and /comparable are literal paths that /:slug would
 * otherwise swallow, so they are declared first.
 */
const router = Router();

/* ---- catalogue ---- */
/* The footer, on every page and for everybody. */
router.get('/site/footer', controller.siteFooter);

router.get('/categories', controller.categories);
router.get('/series', controller.series);

router.get('/products/compare', controller.compare);
router.get('/products/comparable', controller.comparable);
router.get('/products', controller.list);
router.get('/products/:slug', controller.detail);
router.get('/products/:slug/gallery', controller.gallery);
router.get('/products/:slug/service-pricing', controller.servicePricing);
router.get('/products/:slug/os-history', controller.osHistory);

/*
 * Spec 7 addresses the smartphone landing page as /api/smartphones/home.  The
 * same builder serves every Eproducts section - only the category type
 * differs - so the named route simply fills the parameter in.
 */
router.get('/smartphones/home', function (req, res, next) {
  req.params.type = 'SMARTPHONE';
  return controller.landing(req, res, next);
});
router.get('/sections/:type/home', controller.landing);

/* ---- support ---- */
router.get('/support/home', controller.supportHome);
router.get('/support/agencies/regions', controller.regions);
router.get('/support/agencies', controller.centres);
router.get('/support/agencies/:id', controller.centre);
router.get('/support/faqs/categories', controller.faqCategories);
router.get('/support/faqs', controller.faqs);
router.get('/support/faqs/:id', controller.faq);
router.get('/support/os/latest', controller.latestOs);
router.get('/support/os', controller.osVersions);

/*
 * Every notice that is live right now, highest first. Public and
 * unauthenticated: it is the first request the storefront makes, before
 * anybody has signed in.
 *
 * A list rather than the single notice this used to answer - the storefront
 * greets an arrival with the first of them and keeps the rest on the
 * notification page, which is a decision about the dialog rather than about
 * what there is to say.
 */
router.get('/notices', controller.liveNotices);

/*
 * THE COMPANY INTRODUCTION, in one answer.
 *
 * Ten chapters of storytelling, and a request per chapter would be ten round
 * trips to draw one page. Public and unauthenticated, like the rest of this
 * router - it is a company describing itself.
 */
router.get('/about', controller.aboutPage);

/*
 * Tracking a repair by its ticket number, with no account.
 *
 * The number is the credential - a customer holding a printed receipt has to
 * be able to see where their device is - so the reply is narrowed to what a
 * receipt already tells them plus the updates the centre chose to publish.
 */
router.get('/support/repairs/:ticketNo', controller.trackRepair);

/* ---- blog ---- */
router.get('/blog/categories', controller.blogCategories);
router.get('/blog/featured', controller.blogFeatured);
router.get('/blog', controller.blogList);
router.get('/blog/:slug', controller.blogDetail);

module.exports = router;
