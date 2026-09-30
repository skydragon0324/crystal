const Router = require('express-promise-router');
const controller = require('../controllers/repairTickets.controller');
const { requirePermission, LEVEL } = require('../middleware/permission');
const { PAGE } = require('../services/repairTickets.service');

const router = Router();

router.get('/meta', requirePermission(PAGE, LEVEL.READ), controller.meta);
router.get('/', requirePermission(PAGE, LEVEL.READ), controller.list);
router.get('/:id', requirePermission(PAGE, LEVEL.READ), controller.detail);
router.get('/:id/technician-suggestions', requirePermission(PAGE, LEVEL.READ), controller.suggestTechnician);

router.post('/', requirePermission(PAGE, LEVEL.WRITE), controller.create);
router.put('/:id', requirePermission(PAGE, LEVEL.WRITE), controller.update);
router.delete('/:id', requirePermission(PAGE, LEVEL.WRITE), controller.remove);
router.post('/:id/restore', requirePermission(PAGE, LEVEL.WRITE), controller.restore);

router.post('/:id/status', requirePermission(PAGE, LEVEL.WRITE), controller.transition);
router.post('/:id/assign', requirePermission(PAGE, LEVEL.WRITE), controller.assign);
router.post('/:id/pay', requirePermission(PAGE, LEVEL.WRITE), controller.pay);

/*
 * Rating is the customer's, and the console only ever records one taken over
 * the counter or on the phone.  It sits behind WRITE like everything else
 * here; the public route that lets a customer rate their own repair is in
 * support.routes.js and is guarded by the ticket number instead.
 */
router.post('/:id/rating', requirePermission(PAGE, LEVEL.WRITE), controller.rate);

router.post('/:id/items', requirePermission(PAGE, LEVEL.WRITE), controller.addItem);
router.put('/:id/items/:itemId', requirePermission(PAGE, LEVEL.WRITE), controller.updateItem);
router.delete('/:id/items/:itemId', requirePermission(PAGE, LEVEL.WRITE), controller.removeItem);
router.post('/:id/items/:itemId/issue', requirePermission(PAGE, LEVEL.WRITE), controller.issueItem);

module.exports = router;
