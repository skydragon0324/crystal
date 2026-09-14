const express = require('express');
const router = express.Router();
const commonPrhnController = require('../controllers/common/commonPrhnController');
const { validateRegisterUserByAppstore } = require('../middleware/commonPrhnValidators');

router.post('/user_register', validateRegisterUserByAppstore, commonPrhnController.registerUserByAppstore);

module.exports = router;
