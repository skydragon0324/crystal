'use strict';

const Router = require('express-promise-router');
const controller = require('../controllers/footer.controller');
const { requirePermission, LEVEL } = require('../middleware/permission');
const { PAGE } = require('../services/footer.service');

const router = Router();

router.get('/', requirePermission(PAGE, LEVEL.READ), controller.detail);
router.put('/', requirePermission(PAGE, LEVEL.WRITE), controller.save);

module.exports = router;
