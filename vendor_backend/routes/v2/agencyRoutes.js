const express = require('express');
const router = express.Router();
const authController = require('../../controllers/authController');
const agencyController = require('../../controllers/client/clientAgencyController');
const { validateEditPhoneAgency, validateEditEprodAgency } = require('../../middleware/adminAgencyValidators');

router.get('/phone_agencies', agencyController.fetchPhoneAgencies);
router.get('/eprod_agencies', agencyController.fetchEprodAgencies);
router.post('/admin_phone_agency_edit', authController.verifyUserToken, validateEditPhoneAgency, agencyController.editPhoneAgency);
router.post('/admin_eprod_agency_edit', authController.verifyUserToken, validateEditEprodAgency, agencyController.editEprodAgency);

module.exports = router;
