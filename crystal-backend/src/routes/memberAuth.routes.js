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
/* Desktop sign-in with an X.509 certificate, through the member's certificate agent. */
router.post('/x509/primary_data', controller.x509PrimaryData);
router.post('/x509/x509_login', controller.x509Login);
/* Phone sign-in with the SIM's own MIK certificate, through the customised browser. */
router.post('/mik/register', controller.mikRegister);
router.post('/mik/challenge', controller.mikChallenge);
router.post('/mik/login', controller.mikLogin);
router.post('/otp/request', controller.requestOtp);
router.post('/otp/verify', controller.verifyOtp);
router.post('/refresh', controller.refresh);

router.use(requireUser);

router.get('/me', controller.me);
router.post('/password', controller.changePassword);
router.post('/phone', controller.bindPhone);
router.post('/logout', controller.logout);

module.exports = router;
