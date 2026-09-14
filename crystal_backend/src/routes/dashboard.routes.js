const Router = require('express-promise-router');
const controller = require('../controllers/dashboard.controller');
const { requirePermission, LEVEL } = require('../middleware/permission');
const { PAGE } = require('../services/dashboard.service');

const router = Router();

router.get('/', requirePermission(PAGE, LEVEL.READ), controller.overview);

module.exports = router;
