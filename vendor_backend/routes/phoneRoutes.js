const express = require('express');
const router = express.Router();
const commonPrhnController = require('../controllers/common/commonPrhnController');
const adminUserController = require('../controllers/admin/adminUserController');
const { validateGetUserInfoByDevice } = require('../middleware/adminUserValidators');
const { validateCheckUserForAS } = require('../middleware/commonNewsValidators');

router.get('/user_check_for_as', validateCheckUserForAS, commonPrhnController.checkUserForAS);
router.post('/user_info_by_device', validateGetUserInfoByDevice, adminUserController.fetchUserInfoByDevice);

module.exports = router;
