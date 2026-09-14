const express = require('express');
const router = express.Router();
const authController = require('../../controllers/authController');
const newsController = require('../../controllers/client/clientNewsController');
const { validateGetNewsArticleLob, validateToggleNewsFavorite } = require('../../middleware/clientNewsValidators');

router.get('/news_articles', authController.verifyUserToken, newsController.fetchNewsArticles);
router.get('/news_article_lob', authController.verifyUserToken, validateGetNewsArticleLob, newsController.fetchNewsArticleLob);
router.get('/news_favorites', authController.verifyUserToken, newsController.fetchNewsFavorites);
router.post('/news_favorite_toggle', authController.verifyUserToken, validateToggleNewsFavorite, newsController.toggleNewsFavorite);

module.exports = router;
