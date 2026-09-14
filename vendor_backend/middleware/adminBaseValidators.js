const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateAddUpdateFile = [
  check("type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (type)`),
];

const validateDeleteUpdateFile = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateEditUpdateFile = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
  check("type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (type)`),
];

const validateSyncUpdateFile = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateAddTempFile = [
  check("title").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (title)`),
];

const validateDeleteTempFile = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateAddHoliday = [
  check("simple_date").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (simple_date)`),
];

const validateEditHoliday = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
  check("simple_date").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (simple_date)`),
];

const validateDeleteHoliday = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateAddCompanyContact = [
  check("contact_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (contact_name)`),
  check("phone_number").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_number)`),
  check("position").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (position)`),
];

const validateEditCompanyContact = [
  check("contact_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (contact_pk)`),
  check("contact_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (contact_name)`),
  check("phone_number").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_number)`),
  check("position").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (position)`),
];

const validateDeleteCompanyContact = [
  check("contact_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (contact_pk)`),
];

module.exports = {
  validateAddUpdateFile,
  validateDeleteUpdateFile,
  validateEditUpdateFile,
  validateSyncUpdateFile,
  validateAddTempFile,
  validateDeleteTempFile,
  validateAddHoliday,
  validateEditHoliday,
  validateDeleteHoliday,
  validateAddCompanyContact,
  validateEditCompanyContact,
  validateDeleteCompanyContact,
};
