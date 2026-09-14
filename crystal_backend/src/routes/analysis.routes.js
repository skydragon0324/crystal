const Router = require('express-promise-router');
const controller = require('../controllers/analysis.controller');
const { requirePermission, LEVEL } = require('../middleware/permission');
const service = require('../services/analysis.service');

const router = Router();

router.get('/agency-health', requirePermission(service.HEALTH_PAGE, LEVEL.READ), controller.health);
router.get('/agency-health/:agencyId', requirePermission(service.HEALTH_PAGE, LEVEL.READ), controller.healthOf);

router.get('/defect-watch', requirePermission(service.DEFECT_PAGE, LEVEL.READ), controller.defects);
router.get('/defect-watch/:productId/:symptomId',
  requirePermission(service.DEFECT_PAGE, LEVEL.READ), controller.defectDetail);

router.get('/monthly', requirePermission(service.MONTHLY_PAGE, LEVEL.READ), controller.monthly);
router.get('/stock-value', requirePermission(service.MONTHLY_PAGE, LEVEL.READ), controller.stockValue);

module.exports = router;
