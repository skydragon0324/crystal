const Router = require('express-promise-router');
const controller = require('../controllers/permissions.controller');
const { requirePermission, LEVEL } = require('../middleware/permission');
const { PAGE } = require('../services/permissions.service');

const router = Router();

router.get('/levels', requirePermission(PAGE, LEVEL.READ), controller.levels);
router.get('/pages', requirePermission(PAGE, LEVEL.READ), controller.pages);
router.get('/:roleId', requirePermission(PAGE, LEVEL.READ), controller.matrix);

// Handing out permissions is itself a permission, and not the ordinary one.
router.put('/:roleId', requirePermission(PAGE, LEVEL.SUPER), controller.save);

module.exports = router;
