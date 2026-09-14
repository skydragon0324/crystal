const Router = require('express-promise-router');
const controller = require('../controllers/warranties.controller');
const { requirePermission, LEVEL } = require('../middleware/permission');
const { PAGE } = require('../services/warranties.service');
const mountPurge = require('./purge.routes');

const router = Router();

router.get('/', requirePermission(PAGE, LEVEL.READ), controller.list);
router.get('/device/:serial', requirePermission(PAGE, LEVEL.READ), controller.ofDevice);
router.get('/:id', requirePermission(PAGE, LEVEL.READ), controller.detail);

router.post('/', requirePermission(PAGE, LEVEL.WRITE), controller.create);
router.put('/:id', requirePermission(PAGE, LEVEL.WRITE), controller.update);
router.delete('/:id', requirePermission(PAGE, LEVEL.WRITE), controller.remove);
router.post('/:id/restore', requirePermission(PAGE, LEVEL.WRITE), controller.restore);

// Cancelling somebody's cover is not an ordinary edit.
router.post('/:id/void', requirePermission(PAGE, LEVEL.SUPER), controller.voidCover);

/*
 * Permanent delete, written once and mounted rather than repeated - see
 * purge.routes.js. Same two rails as everywhere else: the row has to be in
 * the recycle bin, and anything still referring to it refuses the delete
 * with a list of what and how many.
 */
mountPurge(router, { table: 'warranties', pk: 'id', page: PAGE });

module.exports = router;
