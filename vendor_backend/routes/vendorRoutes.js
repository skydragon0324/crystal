const express = require('express');
const router = express.Router();
const commonController = require('../controllers/common/commonPrhnController');
const userController = require('../controllers/web/webUserController');
const productController = require('../controllers/client/clientProductController');
const agencyController = require('../controllers/client/clientAgencyController');
const messageController = require('../controllers/client/clientMessageController');
const eshopController = require('../controllers/web/webEshopController');
const appstoreController = require('../controllers/web/webAppstoreController');
const blogController = require('../controllers/web/webBlogController');
const x509Controller = require('../controllers/web/x509Controller');
const authController = require('../controllers/authController');
const { validateGetPhoneSpecs, validateGetPhoneImages, validateGetPhoneAccessories, validateGetPhoneChangelog } = require('../middleware/clientProductValidators');
const { validateWebLogin } = require('../middleware/authValidators');
const { validateGetEshopDetail, validateGetEshopWalletTransactions, validateGetAppstoreLicenseQr } = require('../middleware/clientEshopValidators');
const { validateGetSoftPointLog, validateAddFeedbackMessage, validateGetFeedbackMessages, validateEditFeedbackThread, validateGetBMediaKeygenById, validateAddEprodLicenseReport } = require('../middleware/clientUserValidators');
const { validateGetBlogContent, validateBlogReplies, validateViewBlogReplyWeb, validateSubmitBlogRating, validateAddBlog, validateEditBlog, validateDeleteBlog } = require('../middleware/clientBlogValidators');
const { validatePrimaryData, validateLoginVerify } = require('../middleware/x509Validators');

router.get('/provinces', commonController.fetchProvinces);
router.get('/phone_products', productController.fetchPhoneProducts);
router.get('/phone_specs', validateGetPhoneSpecs, productController.fetchPhoneSpecs);
router.get('/phone_images', validateGetPhoneImages, productController.fetchPhoneImages);
router.get('/phone_accessories', validateGetPhoneAccessories, productController.fetchPhoneAccessories);
router.get('/phone_changelog', validateGetPhoneChangelog, productController.fetchPhoneChangelogs);
router.get('/phone_agencies', agencyController.fetchPhoneAgenciesForWeb);
router.get('/phone_faqs', messageController.fetchFaqsForPhoneWeb);
router.get('/blog_articles', blogController.fetchOldBlogArticles);
router.get('/admin_recom_blogs', blogController.fetchOldBlogAdminRecoms);
router.get('/honormans', blogController.fetchHonormans);
router.get('/blog_replies', validateBlogReplies, blogController.fetchOldBlogReplies);
router.post('/blog_reply_view', authController.parseWebToken, validateViewBlogReplyWeb, blogController.viewBlogReply);
router.post('/blog_rating_submit', authController.parseWebToken, validateSubmitBlogRating, blogController.submitBlogRating);
router.post('/blog_add', authController.parseWebToken, validateAddBlog, blogController.addBlog);
router.post('/blog_update', authController.parseWebToken, validateEditBlog, blogController.editBlog);
router.post('/blog_delete', authController.parseWebToken, validateDeleteBlog, blogController.deleteBlog);
router.post('/blog_contribute', authController.parseWebToken, validateEditBlog, blogController.contributeBlog);

router.post('/auth/web_login', validateWebLogin, authController.webLogin);
router.get('/auth/web_logout', authController.webLogout);
router.get('/auth/web_auth', authController.checkWebAuth);
router.get('/auth/refresh_token', authController.refreshToken);

router.post('/x509/primary_data', validatePrimaryData, x509Controller.primaryData);
router.post('/x509/x509_login', validateLoginVerify, x509Controller.x509Login);

router.get('/eshop_wallet_balance', authController.verifyWebToken, eshopController.fetchEshopWalletBalance);
router.get('/eshop_order_list', authController.verifyWebToken, eshopController.fetchEshopOrderList);
router.get('/eshop_order_detail', authController.verifyWebToken, validateGetEshopDetail, eshopController.fetchEshopOrderDetail);
router.get('/eshop_wallet_transactions', authController.verifyWebToken, validateGetEshopWalletTransactions, eshopController.fetchEshopeWalletTransactions);

router.get('/appstore_purchase_log', authController.verifyWebToken, appstoreController.fetchAppstorePurchaseLog);
router.get('/appstore_license_qr', authController.verifyWebToken, validateGetAppstoreLicenseQr, appstoreController.fetchAppstoreLicenseQr);
router.get('/appstore_comments', authController.verifyWebToken, appstoreController.fetchAppstoreComments);
router.get('/appstore_favorites', authController.verifyWebToken, appstoreController.fetchAppstoreFavorites);
router.get('/appstore_wallet_transactions', authController.verifyWebToken, appstoreController.fetchWalletTransactions);
router.get('/soft_point_log', authController.verifyWebToken, validateGetSoftPointLog, userController.fetchSoftPointLog);
router.get('/karaoke_old_log', authController.verifyWebToken, userController.fetchKaraOldLog);
router.get('/bmedia_old_log', authController.verifyWebToken, userController.fetchBMediaOldLog);
router.get('/activity_point_log', authController.verifyWebToken, userController.fetchActivityPointLog);
router.get('/activity_old_log', authController.verifyWebToken, userController.fetchActivityOldLog);

router.get('/eprod_regist_add_log', authController.verifyWebToken, userController.fetchEprodRegistAddLog);
router.post('/eprod_license_error_report', authController.verifyWebToken, validateAddEprodLicenseReport, userController.sendEprodLicenseErrorReport);
router.get('/karaoke_keygen_log', authController.verifyWebToken, userController.fetchKaraokeKeygenLog);
router.get('/manbang_keygen_log', authController.verifyWebToken, userController.fetchManbangKeygenLog);
router.get('/bmedia_providers', authController.verifyWebToken, userController.fetchBMediaProviders);
router.get('/bmedia_keygen_log', authController.verifyWebToken, userController.fetchBMediaKeygenLog);
router.get('/bmedia_keygen_by_id', authController.verifyWebToken, validateGetBMediaKeygenById, userController.fetchBMediaKeygenById);

router.get('/feedback_threads', authController.verifyWebToken, userController.fetchFeedbackThreads);
router.post('/feedback_thread_edit', authController.verifyWebToken, validateEditFeedbackThread, userController.editFeedbackThread);
router.get('/feedback_messages', authController.verifyWebToken, validateGetFeedbackMessages, userController.fetchFeedbackMessages);
router.post('/feedback_message_add', authController.verifyWebToken, validateAddFeedbackMessage, userController.addFeedbackMessage);

router.get('/blog_my_articles', authController.verifyWebToken, blogController.fetchOldBlogMyArticles);
router.get('/blog_article_content', authController.verifyWebToken, validateGetBlogContent, blogController.fetchOldBlogContent);

module.exports = router;
