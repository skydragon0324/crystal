const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateCancelPolestarNews = [
  check("id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (id)`),
];

const validateCheckUserForAS = [
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
];

module.exports = {
  validateCancelPolestarNews,
  validateCheckUserForAS,
};
