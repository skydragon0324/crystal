const Router = require('express-promise-router');
const controller = require('../controllers/settings.controller');
const { requirePermission, LEVEL } = require('../middleware/permission');
const { PAGE } = require('../services/settings.service');

const router = Router();

router.get('/', requirePermission(PAGE, LEVEL.READ), controller.list);
router.put('/', requirePermission(PAGE, LEVEL.WRITE), controller.save);

module.exports = router;
