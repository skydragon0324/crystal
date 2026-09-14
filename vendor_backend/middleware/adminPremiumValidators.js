const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateAddPremiumService = [
  check("service_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_name)`),
  check("lottery_start_date").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (lottery_start_date)`),
  check("lottery_end_date").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (lottery_end_date)`),
];

const validateEditPremiumService = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
];

const validateDeletePremiumService = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("is_deleted").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_deleted)`),
];

const validateSyncPremiumService = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
];

const validateAddPremiumGood = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("goods_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (goods_name)`),
  check("goods_type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (goods_type)`),
  check("price").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (price)`),
];

const validateEditPremiumGood = [
  check("goods_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (goods_pk)`),
];

const validateDeletePremiumGood = [
  check("goods_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (goods_pk)`),
  check("is_deleted").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_deleted)`),
];

const validateAddPremiumUserClass = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("class_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (class_name)`),
  check("start_value").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (start_value)`),
  check("end_value").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (end_value)`),
  check("lottery_min_num").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (lottery_min_num)`),
  check("lottery_max_num").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (lottery_max_num)`),
];

const validateEditPremiumUserClass = [
  check("class_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (class_pk)`),
];

const validateDeletePremiumUserClass = [
  check("class_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (class_pk)`),
  check("is_deleted").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_deleted)`),
];

const validateGetPremiumSimpleClasses = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
];

const validateAddUserDeliveryAddress = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
  check("receptionist").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (receptionist)`),
  check("phone_numbers").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_numbers)`),
  check("location_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (location_pk)`),
];

const validateEditUserDeliveryAddress = [
  check("delivery_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (delivery_pk)`),
];

const validateDeleteUserDeliveryAddress = [
  check("delivery_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (delivery_pk)`),
  check("is_deleted").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_deleted)`),
];

const validateAddLotteryNumber = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
  check("lottery_number").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (lottery_number)`),
];

const validateEditLotteryNumber = [
  check("lottery_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (lottery_pk)`),
];

const validateDeleteLotteryNumber = [
  check("lottery_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (lottery_pk)`),
  check("is_deleted").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_deleted)`),
];

const validateAddLotteryCandidate = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("class_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (class_pk)`),
  check("users").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (users)`),
];

const validateEditLotteryCandidate = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("class_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (class_pk)`),
];

const validateDeleteLotteryCandidate = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
  check("is_deleted").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_deleted)`),
];

const validateRefreshLotteryNumber = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
];

const validateGetSelectedLotteryNumbers = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
];

const validateGetRemainLotteryNumbers = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
];

const validateAddIntegratedUserClass = [
  check("class_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (class_name)`),
  check("start_value").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (start_value)`),
  check("end_value").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (end_value)`),
];

const validateEditIntegratedUserClass = [
  check("class_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (class_pk)`),
];

const validateDeleteIntegratedUserClass = [
  check("class_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (class_pk)`),
  check("is_deleted").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_deleted)`),
];

const validateRefreshIntegratedUserValue = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateAddPremiumDiscussAward = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("class_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (class_pk)`),
  check("goods_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (goods_pk)`),
  check("users").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (users)`),
];

const validateEditPremiumDiscussAward = [
  check("award_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (award_pk)`),
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("class_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (class_pk)`),
  check("goods_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (goods_pk)`),
];

const validateDeletePremiumDiscussAward = [
  check("award_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (award_pk)`),
  check("is_deleted").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_deleted)`),
];

const validateAddPremiumReception = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("receptionist").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (receptionist)`),
  check("phone_numbers").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_numbers)`),
];

const validateEditPremiumReception = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
  check("receptionist").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (receptionist)`),
  check("phone_numbers").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_numbers)`),
];

const validateRandomLotterySubmit = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("class_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (class_pk)`),
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
];

const validateGetSelectedLotterySubmits = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
];

const validateGetRemainLotterySubmits = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("class_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (class_pk)`),
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
];

const validateAddLotterySubmit = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("class_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (class_pk)`),
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
  check("lottery_number").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (lottery_number)`),
];

const validateEditLotterySubmit = [
  check("lottery_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (lottery_pk)`),
];

const validateDeleteLotterySubmit = [
  check("lottery_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (lottery_pk)`),
  check("is_deleted").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_deleted)`),
];

const validateEditLotterySubmitAward = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("lottery_numbers").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (lottery_numbers)`),
];

const validateFinishLotterySubmitAward = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("lottery_numbers").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (lottery_numbers)`),
];

const validatePuzzQuestions = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
];

const validateAddPuzzQuestion = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("question_text").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (question_text)`),
  check("notice_at").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (notice_at)`),
];

const validateEditPuzzQuestion = [
  check("question_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (question_pk)`),
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("question_text").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (question_text)`),
  check("notice_at").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (notice_at)`),
];

const validateDeletePuzzQuestion = [
  check("question_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (question_pk)`),
];

const validatePuzzChoices = [
  check("question_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (question_pk)`),
];

const validateAddPuzzChoice = [
  check("question_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (question_pk)`),
  check("choice_text").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (choice_text)`),
];

const validateEditPuzzChoice = [
  check("choice_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (choice_pk)`),
  check("choice_text").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (choice_text)`),
];

const validateDeletePuzzChoice = [
  check("choice_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (choice_pk)`),
];

const validateAddPuzzleAward = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("class_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (class_pk)`),
  check("goods_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (goods_pk)`),
  check("users").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (users)`),
];

const validateEditPuzzleAward = [
  check("award_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (award_pk)`),
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("class_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (class_pk)`),
  check("goods_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (goods_pk)`),
];

const validateDeletePuzzleAward = [
  check("award_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (award_pk)`),
  check("is_deleted").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_deleted)`),
];

const validateFinishPuzzleAward = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("users").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (users)`),
];

const validateAddPuzzleBonus = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("users").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (users)`),
];

const validateEditPuzzleBonus = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("users").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (users)`),
];

const validatePuzzleAnswerDetail = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
];

const validatePuzzleAnswerStats = [
  check("question_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (question_pk)`),
];

module.exports = {
  validateAddPremiumService,
  validateEditPremiumService,
  validateDeletePremiumService,
  validateSyncPremiumService,
  validateAddPremiumGood,
  validateEditPremiumGood,
  validateDeletePremiumGood,
  validateAddPremiumUserClass,
  validateEditPremiumUserClass,
  validateDeletePremiumUserClass,
  validateGetPremiumSimpleClasses,
  validateAddUserDeliveryAddress,
  validateEditUserDeliveryAddress,
  validateDeleteUserDeliveryAddress,
  validateAddLotteryNumber,
  validateEditLotteryNumber,
  validateDeleteLotteryNumber,
  validateRefreshLotteryNumber,
  validateAddLotteryCandidate,
  validateEditLotteryCandidate,
  validateDeleteLotteryCandidate,
  validateGetSelectedLotteryNumbers,
  validateGetRemainLotteryNumbers,
  validateAddIntegratedUserClass,
  validateEditIntegratedUserClass,
  validateDeleteIntegratedUserClass,
  validateRefreshIntegratedUserValue,
  validateAddPremiumDiscussAward,
  validateEditPremiumDiscussAward,
  validateDeletePremiumDiscussAward,
  validateAddPremiumReception,
  validateEditPremiumReception,
  validateRandomLotterySubmit,
  validateGetSelectedLotterySubmits,
  validateGetRemainLotterySubmits,
  validateAddLotterySubmit,
  validateEditLotterySubmit,
  validateDeleteLotterySubmit,
  validateEditLotterySubmitAward,
  validateFinishLotterySubmitAward,
  validatePuzzQuestions,
  validateAddPuzzQuestion,
  validateEditPuzzQuestion,
  validateDeletePuzzQuestion,
  validatePuzzChoices,
  validateAddPuzzChoice,
  validateEditPuzzChoice,
  validateDeletePuzzChoice,
  validateAddPuzzleAward,
  validateEditPuzzleAward,
  validateDeletePuzzleAward,
  validateFinishPuzzleAward,
  validateAddPuzzleBonus,
  validateEditPuzzleBonus,
  validatePuzzleAnswerDetail,
  validatePuzzleAnswerStats,
};
