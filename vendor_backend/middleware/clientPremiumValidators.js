const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateGetPremiumGoods = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
];

const validateGetPremiumLotteryInfo = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
];

const validateGetPremiumUserAward = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
];

const validateGetPremiumServiceAwards = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
];

const validateGetPremiumDiscussAwards = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
];

const validateGetLotteryAwards = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
];

const validateRefreshLotteryNumber = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
];

const validateSubmitLotteryNumber = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("lottery_number").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (lottery_number)`),
];

const validateGetSelectedLotteryNumbers = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
];

const validateGetRemainLotteryNumbers = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
];

const validateAddUserDeliveryAddress = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("receptionist").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (receptionist)`),
  check("phone_numbers").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_numbers)`),
  check("location_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (location_pk)`),
];

const validateEditUserDeliveryAddress = [
  check("delivery_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (delivery_pk)`),
];

const validateAddPremiumReception = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("related_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (related_pk)`),
  check("receptionist").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (receptionist)`),
  check("phone_numbers").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_numbers)`),
  check("location_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (location_pk)`),
];

const validateEditPremiumReception = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateRandomLotterySubmit = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("class_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (class_pk)`),
];

const validateGetSelectedLotterySubmits = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
];

const validateGetRemainLotterySubmits = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("class_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (class_pk)`),
];

const validateSendLotterySubmit = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("class_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (class_pk)`),
  check("lottery_number").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (lottery_number)`),
];

const validateGetLotterySubmitAwards = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
];

const validatePuzzleResponse = [
  check("question_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (question_pk)`),
];

const validateGetPuzzleAwards = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
];

module.exports = {
  validateGetPremiumGoods,
  validateGetPremiumLotteryInfo,
  validateGetPremiumUserAward,
  validateGetPremiumServiceAwards,
  validateGetPremiumDiscussAwards,
  validateGetLotteryAwards,
  validateRefreshLotteryNumber,
  validateSubmitLotteryNumber,
  validateGetSelectedLotteryNumbers,
  validateGetRemainLotteryNumbers,
  validateAddUserDeliveryAddress,
  validateEditUserDeliveryAddress,
  validateAddPremiumReception,
  validateEditPremiumReception,
  validateRandomLotterySubmit,
  validateGetSelectedLotterySubmits,
  validateGetRemainLotterySubmits,
  validateSendLotterySubmit,
  validateGetLotterySubmitAwards,
  validatePuzzleResponse,
  validateGetPuzzleAwards,
};
