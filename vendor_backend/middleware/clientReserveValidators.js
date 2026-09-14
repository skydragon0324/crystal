const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateSubmitReserveInfo = [
  check("prefix_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (prefix_pk)`),
  check("reserve_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (reserve_name)`),
  check("id_card").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (id_card)`),
  check("phone_number").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_number)`),
  check("agency_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (agency_id)`),
];

const validateCheckDuplicateIdCard = [
  check("prefix_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (prefix_pk)`),
  check("id_card").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (id_card)`),
];

const validateCheckReservePhone = [
  check("phone_imei").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_imei)`),
];

module.exports = {
  validateSubmitReserveInfo,
  validateCheckDuplicateIdCard,
  validateCheckReservePhone,
};
