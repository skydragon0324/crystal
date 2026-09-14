const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateAddPointType = [
  check("type_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (type_pk)`),
  check("points").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (points)`),
];

const validateEditPointType = [
  check("type_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (type_pk)`),
  check("points").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (points)`),
];

const validateGetActivityLimitBySource = [
  check("activity_source").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (activity_source)`),
];

const validateAddActivityLimit = [
  check("activity_source").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (activity_source)`),
  check("limit_time").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (limit_time)`),
  check("status").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (status)`),
  check("target_rank").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (target_rank)`),
  check("top_count").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (top_count)`),
  check("surroundings").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (surroundings)`),
];

const validateEditActivityLimit = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
  check("activity_source").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (activity_source)`),
  check("limit_time").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (limit_time)`),
  check("status").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (status)`),
  check("target_rank").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (target_rank)`),
  check("top_count").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (top_count)`),
  check("surroundings").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (surroundings)`),
];

const validateRecalcActivityLimit = [
  check("activity_source").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (activity_source)`),
];

const validateAddRegisterPointType = [
  check("product_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_pk)`),
  check("points").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (points)`),
];

const validateEditRegisterPointType = [
  check("type_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (type_pk)`),
  check("product_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_pk)`),
  check("points").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (points)`),
];

const validateAddRegisterPointLog = [
  check("status").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (status)`),
  check("reason").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (reason)`),
  check("points").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (points)`),
  check("users").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (users)`),
];

const validateEditUserPoint = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
  check("point_type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (point_type)`),
];

const validateMinusPrizeLog = [
  check("reserve_prefix").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (reserve_prefix)`),
  check("prize_val").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (prize_val)`),
  check("customers").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (customers)`),
];

const validateActivityPointBalance = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
];

const validateRecalcActivityPoint = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
];

const validateEshopWalletBalance = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
];

const validateEshopWalletTransactions = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
];

const validateRegisterPointBalance = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
];

const validateAppstoreWalletBalance = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
];

const validateRecalcAppstorePoint = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
];

const validateRecalcKaraokePoint = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
];

const validateRecalcBMediaPoint = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
];

const validateRecalcSoftMinusPoint = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
];

module.exports = {
  validateAddPointType,
  validateEditPointType,
  validateGetActivityLimitBySource,
  validateAddActivityLimit,
  validateEditActivityLimit,
  validateRecalcActivityLimit,
  validateAddRegisterPointType,
  validateEditRegisterPointType,
  validateAddRegisterPointLog,
  validateEditUserPoint,
  validateMinusPrizeLog,
  validateActivityPointBalance,
  validateRecalcActivityPoint,
  validateEshopWalletBalance,
  validateEshopWalletTransactions,
  validateRegisterPointBalance,
  validateAppstoreWalletBalance,
  validateRecalcAppstorePoint,
  validateRecalcKaraokePoint,
  validateRecalcBMediaPoint,
  validateRecalcSoftMinusPoint,
};
