const express = require('express');
const router = express.Router();
const clientProductController = require('../controllers/client/clientProductController');
const { validateCrmProdInfoByEprod, validateApproveEprodRegister, validateDeleteEprodRegister, validateAddEprodCrm } = require('../middleware/clientProductValidators');

router.get('/crm_prod_info', validateCrmProdInfoByEprod, clientProductController.fetchCrmProdSpecsByEprodId);
router.post('/register_eprod_approve', validateApproveEprodRegister, clientProductController.approveEprodRegister);
router.post('/register_eprod_delete', validateDeleteEprodRegister, clientProductController.deleteEprodRegister);
router.get('/crm_eprod_sales', clientProductController.fetchCrmEprodSales);
router.post('/crm_eprod_sale_add', validateAddEprodCrm, clientProductController.addEprodCrmSale);

module.exports = router;
