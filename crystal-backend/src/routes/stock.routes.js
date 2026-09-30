const Router = require('express-promise-router');
const controller = require('../controllers/stock.controller');
const { requirePermission, LEVEL } = require('../middleware/permission');
const { PAGE } = require('../services/stock.service');

const router = Router();

router.get('/', requirePermission(PAGE, LEVEL.READ), controller.list);
router.get('/movements', requirePermission(PAGE, LEVEL.READ), controller.movements);
router.get('/shortages', requirePermission(PAGE, LEVEL.READ), controller.shortages);

router.post('/movements', requirePermission(PAGE, LEVEL.WRITE), controller.move);
router.post('/stocktake', requirePermission(PAGE, LEVEL.WRITE), controller.stocktake);
router.post('/level', requirePermission(PAGE, LEVEL.WRITE), controller.setLevel);

module.exports = router;
