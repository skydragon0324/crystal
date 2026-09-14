const Router = require('express-promise-router');
const controller = require('../controllers/audit.controller');
const { requirePermission, LEVEL } = require('../middleware/permission');
const { PAGE } = require('../services/audit.service');

const router = Router();

router.get('/filters', requirePermission(PAGE, LEVEL.READ), controller.filters);
router.get('/history/:entity/:entityPk', requirePermission(PAGE, LEVEL.READ), controller.history);
router.get('/', requirePermission(PAGE, LEVEL.READ), controller.list);

module.exports = router;
