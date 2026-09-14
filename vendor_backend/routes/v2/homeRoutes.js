const express = require('express');
const router = express.Router();
const authController = require('../../controllers/authController');
const homeController = require('../../controllers/client/clientHomeController');

router.get('/home_common_info', homeController.fetchHomeCommonInfoV2);
router.get('/company_contacts', homeController.fetchCompanyContacts);
router.get('/home_user_info', authController.verifyUserToken, homeController.fetchHomeUserInfoV2);

module.exports = router;
