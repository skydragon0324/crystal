const express = require('express');
const router = express.Router();
const weatherController = require('../../controllers/common/commonWeatherController');

router.get('/weather_info', weatherController.fetchWeatherInfo);

module.exports = router;
