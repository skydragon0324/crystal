const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateAddDuty = [
  check("duty_title").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (duty_title)`),
  check("point_type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (point_type)`),
];

const validateEditDuty = [
  check("duty_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (duty_pk)`),
];

const validateDeleteDuty = [
  check("duty_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (duty_pk)`),
  check("is_deleted").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_deleted)`),
];

module.exports = {
  validateAddDuty,
  validateEditDuty,
  validateDeleteDuty,  
};
