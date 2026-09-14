// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateAdminLogin, validateUserLogin, validateUserRegister, validateEccFunc, validateVerifyCode } = require('../middleware/authValidators');

router.post('/admin_login', validateAdminLogin, authController.adminLogin);
router.get('/admin_logout', authController.adminLogout);
router.get('/admin_auth', authController.checkAdminAuth);
router.get('/refresh_token', authController.refreshToken);
router.post('/user_login', validateUserLogin, authController.userLogin);
router.post('/user_register', validateUserRegister, authController.userRegister);
router.get('/user_logout', authController.userLogout);
router.get('/user_auth', authController.checkUserAuth);
router.get('/ecc_server', authController.eccServer);
router.post('/check_verify_code', validateVerifyCode, authController.checkVerifyCode);

module.exports = router;
