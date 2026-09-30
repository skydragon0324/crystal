const Router = require('express-promise-router');
const controller = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const { attachActor } = require('../utils/actor');

const router = Router();

/*
 * Unauthenticated, necessarily - these are what produce a session.  They
 * still attach an actor, so a sign-in can be recorded against the ip and
 * user-agent it came from even though nobody is signed in yet.
 */
router.use(attachActor);

router.post('/login', controller.login);
router.post('/refresh', controller.refresh);

router.use(authenticate);

router.get('/profile', controller.profile);
router.post('/password', controller.changePassword);
router.post('/logout', controller.logout);

module.exports = router;
