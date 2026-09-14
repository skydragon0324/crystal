const Router = require('express-promise-router');
const controller = require('../controllers/claims.controller');
const { requirePermission, LEVEL } = require('../middleware/permission');
const { PAGE } = require('../services/claims.service');

const router = Router();

router.get('/meta', requirePermission(PAGE, LEVEL.READ), controller.meta);
router.get('/preview', requirePermission(PAGE, LEVEL.READ), controller.preview);
router.get('/', requirePermission(PAGE, LEVEL.READ), controller.list);
router.get('/:id', requirePermission(PAGE, LEVEL.READ), controller.detail);

router.post('/', requirePermission(PAGE, LEVEL.WRITE), controller.build);
router.put('/:id', requirePermission(PAGE, LEVEL.WRITE), controller.update);
router.delete('/:id', requirePermission(PAGE, LEVEL.WRITE), controller.remove);

/*
 * One endpoint, two levels.  Which of them applies depends on WHICH way the
 * claim is being moved, so the guard here is the lower of the two and the
 * controller refuses the rest - see claims.controller.transition.  A branch
 * can build and submit its own claim; deciding what head office owes it is
 * not a decision the centre being paid should be able to make.
 */
router.post('/:id/status', requirePermission(PAGE, LEVEL.WRITE), controller.transition);

module.exports = router;
