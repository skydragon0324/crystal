const express = require('express');
const router = express.Router();
const authController = require('../../controllers/authController');
const productController = require('../../controllers/client/clientProductController');
const { validateSaveEprodCrm } = require('../../middleware/clientProductValidators');

router.get('/product_info', productController.fetchProductInfo);
router.get('/crm_prod_info', productController.fetchCrmProductInfo);
router.post('/crm_eprod_save', authController.verifyUserToken, validateSaveEprodCrm, productController.saveEprodCrmData);

module.exports = router;
