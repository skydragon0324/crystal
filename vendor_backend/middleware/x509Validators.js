const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validatePrimaryData = [
  check("client_rand").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (client_rand)`),
  check("version").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (version)`),
  check("userid").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (userid)`),
];

const validateLoginVerify = [
  check("plainData").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (plainData)`),
  check("signData").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (signData)`),
  check("certData").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (certData)`),
  check("certType").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (certType)`),
];

module.exports = {
  validatePrimaryData,
  validateLoginVerify,
};
