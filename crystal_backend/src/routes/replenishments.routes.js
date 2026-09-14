const Router = require('express-promise-router');
const controller = require('../controllers/replenishments.controller');
const { requirePermission, LEVEL } = require('../middleware/permission');
const { PAGE } = require('../services/replenishments.service');

const router = Router();

router.get('/meta', requirePermission(PAGE, LEVEL.READ), controller.meta);
router.get('/', requirePermission(PAGE, LEVEL.READ), controller.list);
router.get('/:id', requirePermission(PAGE, LEVEL.READ), controller.detail);

router.post('/', requirePermission(PAGE, LEVEL.WRITE), controller.create);
router.post('/from-shortages', requirePermission(PAGE, LEVEL.WRITE), controller.fromShortages);
router.put('/:id', requirePermission(PAGE, LEVEL.WRITE), controller.update);
router.delete('/:id', requirePermission(PAGE, LEVEL.WRITE), controller.remove);

router.post('/:id/status', requirePermission(PAGE, LEVEL.WRITE), controller.transition);
router.post('/:id/items', requirePermission(PAGE, LEVEL.WRITE), controller.addItem);
router.put('/:id/items/:itemId', requirePermission(PAGE, LEVEL.WRITE), controller.updateItem);
router.delete('/:id/items/:itemId', requirePermission(PAGE, LEVEL.WRITE), controller.removeItem);

module.exports = router;
