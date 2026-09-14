const express = require('express');
const router = express.Router();
const commonPrhnController = require('../controllers/common/commonPrhnController');
const { validateRegisterUserByEshop } = require('../middleware/commonPrhnValidators');

router.post('/user_register', validateRegisterUserByEshop, commonPrhnController.registerUserByEshop);

module.exports = router;
