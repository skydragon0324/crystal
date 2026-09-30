const Router = require('express-promise-router');
const controller = require('../controllers/managers.controller');
const { requirePermission, LEVEL } = require('../middleware/permission');
const { PAGE } = require('../services/managers.service');
const mountPurge = require('./purge.routes');

const router = Router();

router.get('/', requirePermission(PAGE, LEVEL.READ), controller.list);
router.get('/:id', requirePermission(PAGE, LEVEL.READ), controller.detail);

router.post('/', requirePermission(PAGE, LEVEL.WRITE), controller.create);
router.put('/:id', requirePermission(PAGE, LEVEL.WRITE), controller.update);
router.delete('/:id', requirePermission(PAGE, LEVEL.WRITE), controller.remove);
router.post('/:id/restore', requirePermission(PAGE, LEVEL.WRITE), controller.restore);

/*
 * Permanent delete, written once and mounted rather than repeated - see
 * purge.routes.js. Same two rails as everywhere else: the row has to be in
 * the recycle bin, and anything still referring to it refuses the delete
 * with a list of what and how many.
 */
mountPurge(router, { table: 'managers', pk: 'id', page: PAGE });

module.exports = router;
