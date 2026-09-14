const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateDeleteDevice = [
  check("device_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (device_pk)`),
  check("is_deleted").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_deleted)`),
];

const validateReportDevice = [
  check("device_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (device_pk)`),
];

const validateEditReport = [
  check("report_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (report_pk)`),
  check("status").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (status)`),
];

const validateAddSmartPhone = [
  check("phone_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_name)`),
  check("phone_brand").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_brand)`),
  check("phone_model").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_model)`),
  check("company").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (company)`),
];

const validateEditSmartPhone = [
  check("phone_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_pk)`),
];

const validateDeleteSmartPhone = [
  check("phone_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_pk)`),
];

module.exports = {
  validateDeleteDevice,
  validateReportDevice,
  validateEditReport,
  validateAddSmartPhone,
  validateEditSmartPhone,
  validateDeleteSmartPhone,
};
