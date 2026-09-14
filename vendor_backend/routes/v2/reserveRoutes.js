const express = require('express');
const router = express.Router();
const authController = require('../../controllers/authController');
const reserveController = require('../../controllers/client/clientReserveController');
const { validateCheckReservePhone, validateSubmitReserveInfo, validateCheckDuplicateIdCard } = require('../../middleware/clientReserveValidators');

router.get('/reserve_infos', authController.verifyUserToken, reserveController.fetchReserveInfo);
router.get('/reserve_log_count', authController.verifyUserToken, reserveController.fetchReserveLogCount);
router.post('/reserve_info_submit', authController.verifyUserToken, validateSubmitReserveInfo, reserveController.submitReserveInfo);
router.post('/reserve_id_card_check', authController.verifyUserToken, validateCheckDuplicateIdCard, reserveController.checkIdCardDuplication);
router.post('/register_phone_reserve_check', authController.verifyUserToken, validateCheckReservePhone, reserveController.checkReservePhoneLog);

module.exports = router;
