const express = require('express');
const router = express.Router();
const authController = require('../../controllers/authController');
const blogController = require('../../controllers/client/clientBlogController');
const { validateBlogReplies, validateSubmitBlogRating, validateViewBlogArticle, validateGetPremiumDiscussBlog, validateViewBlogReply } = require('../../middleware/clientBlogValidators');

router.get('/blog_articles', blogController.fetchOldArticles);
router.get('/blog_replies', validateBlogReplies, blogController.fetchOldRepliesV2);
router.post('/blog_rating_submit', authController.verifyUserToken, validateSubmitBlogRating, blogController.submitBlogRating);
router.post('/blog_article_view', authController.parseUserToken, validateViewBlogArticle, blogController.viewBlogArticle);
router.post('/blog_reply_view', authController.parseUserToken, validateViewBlogReply, blogController.viewBlogReply);
router.get('/premium_womens_blog', authController.verifyUserToken, validateGetPremiumDiscussBlog, blogController.fetchPremiumWomenDiscussBlog);

module.exports = router;
