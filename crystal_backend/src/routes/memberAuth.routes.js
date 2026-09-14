const Router = require('express-promise-router');
const controller = require('../controllers/memberAuth.controller');
const { requireUser } = require('../middleware/auth');

/**
 * Member authentication (spec 5).
 *
 * Mounted at /api/auth, which the console's own sign-in also lives under -
 * see routes/index.js, where /auth/admin is mounted first.  Two audiences,
 * two secrets, one prefix, and the paths do not overlap.
 */
const router = Router();

router.get('/methods', controller.methods);
router.post('/register', controller.register);
router.post('/login', controller.login);
router.post('/otp/request', controller.requestOtp);
router.post('/otp/verify', controller.verifyOtp);
router.post('/refresh', controller.refresh);

router.use(requireUser);

router.get('/me', controller.me);
router.post('/password', controller.changePassword);
router.post('/phone', controller.bindPhone);
router.post('/logout', controller.logout);

module.exports = router;
