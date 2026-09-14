const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateDeleteDevice = [
  check("device_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (device_pk)`),
];

const validateReportDevice = [
  check("device_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (device_pk)`),
];

const validateCancelDevice = [
  check("device_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (device_pk)`),
];

module.exports = {
  validateDeleteDevice,
  validateReportDevice,
  validateCancelDevice,
};
