const express = require('express');
const router = express.Router();
const commonNewsController = require('../controllers/common/commonNewsController');
const { validateCancelPolestarNews } = require('../middleware/commonNewsValidators');

router.get('/news_cancel', validateCancelPolestarNews, commonNewsController.cancelPolestarNews);

module.exports = router;
