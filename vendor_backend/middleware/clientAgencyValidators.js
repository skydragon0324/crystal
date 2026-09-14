const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateEditPhoneAgency = [
  check("agency_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (agency_pk)`),
  check("key").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (key)`),
];

const validateEditEprodAgency = [
  check("agency_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (agency_pk)`),
  check("key").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (key)`),
];

module.exports = {
  validateEditPhoneAgency,
  validateEditEprodAgency,
};
