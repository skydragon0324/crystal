const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateGetEshopDetail = [
  check("order_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (order_id)`),
];

const validateGetEshopWalletTransactions = [
  check("type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (type)`),
];

const validateGetAppstoreLicenseQr = [
  check("purchase_history_unique_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (purchase_history_unique_id)`),
];

module.exports = {
  validateGetEshopDetail,
  validateGetEshopWalletTransactions,
  validateGetAppstoreLicenseQr,
};
