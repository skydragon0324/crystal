const Router = require('express-promise-router');
const controller = require('../controllers/account.controller');
const storefronts = require('../controllers/storefronts.controller');
const { requireUser } = require('../middleware/auth');

/**
 * The member centre.
 *
 * One guard for the whole router, because there is no endpoint under here
 * that a signed-out visitor has any business reaching - and a per-route guard
 * is a per-route chance to forget one.
 *
 * The spec's member menu also lists Eshop and Appstore branches.  Section 1.1
 * of the same specification lists both systems as external, and the database
 * specification defines no tables for orders, purchases, comments or
 * favourites - so there is nothing here for a local page to read, and the
 * website links out to the real stores instead of this API inventing data.
 * The two items that DO have backing - transactions and the point log - are
 * the wallet statement and the points ledger below.
 */
const router = Router();

router.use(requireUser);

router.get('/dashboard', controller.dashboard);
router.get('/profile', controller.profile);
router.patch('/profile', controller.updateProfile);
router.put('/profile', controller.updateProfile);

/* ---- registered devices ---- */
router.get('/products/check', controller.checkSerial);
router.get('/products', controller.registrations);
router.post('/products', controller.registerProduct);
router.delete('/products/:id', controller.removeRegistration);

/* ---- licences ---- */
router.get('/licenses/devices', controller.licensableDevices);
router.get('/licenses', controller.licenses);
router.post('/licenses', controller.issueLicense);

/* ---- wallet ---- */
router.get('/wallet/transactions', controller.walletTransactions);
router.get('/wallet', controller.wallet);
router.post('/wallet/charge', controller.charge);
router.post('/wallet/transfer', controller.transfer);
router.post('/wallet/pay-password', controller.setPayPassword);

/* ---- points ---- */
router.get('/points/summary', controller.pointSummary);

/* Declared before '/points' so it is not read as a filter on the ledger. */
router.get('/points/systems', controller.pointSystems);
router.get('/points', controller.points);

/* ---- cover, and buying more of it ---- */
router.get('/warranties', controller.warranties);
router.get('/warranties/options/:registrationId', controller.extensionOptions);
router.post('/warranties/extend', controller.extendWarranty);

/* ---- repairs ---- */
router.get('/repairs', controller.repairs);
router.get('/repairs/:id', controller.repairDetail);
router.post('/repairs/:id/rating', controller.rateRepair);

/* ---- the two storefronts ----
 *
 * The Eshop and the Appstore are separate businesses on separate deployments,
 * reached over HTTP rather than read from a table - see config/remote.js. The
 * member has an account in each and Crystal shows it; nothing here writes.
 *
 * The two routes that take an id check it against the member's own list before
 * fetching, because both upstream endpoints are keyed by that id and nothing
 * else. See services/storefronts.service.js.
 */
router.get('/eshop/card', storefronts.eshopCard);
router.get('/eshop/orders', storefronts.eshopOrders);
router.get('/eshop/orders/:orderId', storefronts.eshopOrderDetail);
router.get('/eshop/log', storefronts.eshopLog);

router.get('/appstore/balance', storefronts.appstoreBalance);
router.get('/appstore/transactions', storefronts.appstoreTransactions);
router.get('/appstore/purchases', storefronts.appstorePurchases);
router.get('/appstore/purchases/:purchaseId/license', storefronts.appstoreLicense);
router.get('/appstore/comments', storefronts.appstoreComments);
router.get('/appstore/favourites', storefronts.appstoreFavorites);

/* ---- the eproduct site ----
 *
 * A third outside system, reached the same way. Its registration log is NOT
 * the same list as '/products' above: that one is what Crystal knows about,
 * this is what the eproduct site knows about, and a member can appear in one
 * and not the other.
 */
router.get('/eproduct/balance', storefronts.eprodBalance);
router.get('/eproduct/registrations', storefronts.eprodRegisterLog);
router.get('/eproduct/keygen/karaoke', storefronts.karaokeKeygenLog);
router.get('/eproduct/keygen/manbang', storefronts.manbangKeygenLog);
router.get('/eproduct/keygen/bmedia', storefronts.bmediaKeygenLog);

/* ---- the three systems that ran before this one ----
 *
 * Database reads, not HTTP: the karaoke, media and prize systems left their
 * records behind and a member's history did not start when Crystal did.
 * The filtering is the vendor's - see repositories/legacy/oldlogs.
 */
router.get('/history/karaoke', storefronts.karaokeOldLog);
router.get('/history/media', storefronts.mediaOldLog);
router.get('/history/activity', storefronts.activityOldLog);

/* ---- the member's own articles, drafts included ---- */
router.get('/articles', controller.articles);

/* ---- feedback ---- */
router.get('/feedback', controller.feedback);
router.get('/feedback/:id', controller.feedbackDetail);
router.post('/feedback', controller.submitFeedback);

/* A follow-up joins the same chain; closing it is the member saying fixed. */
router.post('/feedback/:id/messages', controller.postFeedback);
router.post('/feedback/:id/close', controller.closeFeedback);

/*
 * A member removing a conversation of their own.
 *
 * A soft delete, like the console's - the thread leaves the member's list and
 * the support queue, and is recoverable by somebody with the recycle bin. The
 * service checks it is theirs and answers 404 when it is not, because "you may
 * not" would tell them the row exists.
 */
router.delete('/feedback/:id', controller.removeFeedback);

module.exports = router;
