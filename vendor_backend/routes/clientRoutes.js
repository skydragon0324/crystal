// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const userController = require('../controllers/client/clientUserController');
const blogController = require('../controllers/client/clientBlogController');
const apiController = require('../controllers/client/clientApiController');
const deviceController = require('../controllers/client/clientDeviceController');
const { validateEditUser, validateChangePassword, validateLastUserId, validateAddAchievement, validateMergeUserId, validateRegisterUserId, validateAddPhone, validateDeletePhone, validateRegisteredUserId } = require('../middleware/clientUserValidators');
const { validateDeleteDevice, validateReportDevice, validateCancelDevice } = require('../middleware/clientDeviceValidators');
const { validateAddCidLock, validateDeleteCidLock } = require('../middleware/clientProductValidators');

router.post('/user_phone_add', authController.verifyUserToken, validateAddPhone, userController.addPhone);
router.post('/user_phone_delete', authController.verifyUserToken, validateDeletePhone, userController.deletePhone);
router.post('/user_edit', authController.verifyUserToken, validateEditUser, userController.editUser);
router.post('/password_change', authController.verifyUserToken, validateChangePassword, userController.changePassword);
router.get('/last_userid_by_cid', validateLastUserId, userController.fetchLastUserId);
router.get('/registered_userid_by_cid', validateRegisteredUserId, userController.fetchRegisteredUserId);
router.post('/achievement_add', authController.verifyUserToken, validateAddAchievement, userController.addAchievement);
router.get('/merge_status', authController.verifyUserToken, userController.getMergeStatus);
router.get('/merge_cancel', authController.verifyUserToken, userController.cancelMergeFixedId);
router.post('/merge_userid', authController.verifyUserToken, validateMergeUserId, apiController.mergeUserId);
router.post('/register_userid', authController.verifyUserToken, validateRegisterUserId, apiController.registerUserId);
router.get('/user_cid_locks', authController.verifyUserToken, userController.fetchUserCidLockList);
router.post('/user_cid_lock_add', authController.verifyUserToken, validateAddCidLock, userController.addUserCidLock);
router.post('/user_cid_lock_delete', authController.verifyUserToken, validateDeleteCidLock, userController.deleteUserCidLock);
router.get('/blog_home_articles', authController.parseUserToken, blogController.fetchHomeArticles);

router.get('/devices', authController.verifyUserToken, deviceController.fetchDevices);
router.post('/device_delete', authController.verifyUserToken, validateDeleteDevice, deviceController.deleteDevice);
router.post('/device_report', authController.verifyUserToken, validateReportDevice, deviceController.reportDevice);
router.post('/device_cancel', authController.verifyUserToken, validateCancelDevice, deviceController.cancelDevice);

module.exports = router;
