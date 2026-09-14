const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateActivityPointAction = [
  check("pvendor_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (pvendor_pk)`),
  check("main_type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (main_type)`),
  check("sub_type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (sub_type)`),
  check("ip").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (ip)`),
];

const validateCommonLogin = [
  check("pvendor_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (pvendor_id)`),
  check("prhn_pwd").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (prhn_pwd)`),
];

const validateMergeFixedId = [
  check("pvendor_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (pvendor_pk)`),
  check("fixed_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (fixed_pk)`),
  check("fixed_status").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (fixed_status)`),
  check("ip").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (ip)`),
];

const validateRegisterUserByAppstore = [
  check("pvendor_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (pvendor_id)`),
  check("prhn_pwd").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (prhn_pwd)`),
  check("cid").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (cid)`),
  check("appstore_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (appstore_pk)`),
];

const validateRegisterUserByEshop = [
  check("pvendor_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (pvendor_id)`),
  check("prhn_pwd").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (prhn_pwd)`),
  check("user_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_name)`),
  check("birthday").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (birthday)`),
  check("gender").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (gender)`),
  check("cid").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (cid)`),
  check("eshop_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (eshop_pk)`),
];

const validateEditUserCid = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
  check("cid").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (cid)`),
];

const validateDeleteUserCid = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
];

const validateActivityPointLog = [
];

const validateActivityPointStats = [
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
];

const validateActivityPointRank = [
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
];

const validateSoftPointLog = [
];

const validateSoftPointStats = [
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
];

const validateSoftPointRank = [
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
];

const validateAppstorePointLog = [
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
];

const validatePlusAppstorePoint = [
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
  check("reason").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (reason)`),
  check("equ_num").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (equ_num)`),
  check("pay_points").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (pay_points)`),
  check("soft_points").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (soft_points)`),
  check("related_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (related_pk)`),
  check("action_at").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (action_at)`),
];

const validateRefundAppstorePoint = [
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
  check("reason").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (reason)`),
  check("equ_num").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (equ_num)`),
  check("pay_points").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (pay_points)`),
  check("soft_points").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (soft_points)`),
  check("related_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (related_pk)`),
  check("action_at").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (action_at)`),
];

const validateKaraokePointLog = [
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
];

const validatePlusKaraokePoint = [
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
  check("reason").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (reason)`),
  check("equ_num").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (equ_num)`),
  check("pay_points").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (pay_points)`),
  check("soft_points").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (soft_points)`),
  check("related_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (related_pk)`),
  check("action_at").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (action_at)`),
];

const validateRefundKaraokePoint = [
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
  check("reason").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (reason)`),
  check("equ_num").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (equ_num)`),
  check("pay_points").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (pay_points)`),
  check("soft_points").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (soft_points)`),
  check("related_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (related_pk)`),
  check("action_at").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (action_at)`),
];

const validateBMediaPointLog = [
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
];

const validatePlusBMediaPoint = [
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
  check("reason").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (reason)`),
  check("equ_num").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (equ_num)`),
  check("pay_points").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (pay_points)`),
  check("soft_points").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (soft_points)`),
  check("related_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (related_pk)`),
  check("action_at").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (action_at)`),
];

const validateRefundBMediaPoint = [
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
  check("reason").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (reason)`),
  check("equ_num").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (equ_num)`),
  check("pay_points").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (pay_points)`),
  check("soft_points").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (soft_points)`),
  check("related_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (related_pk)`),
  check("action_at").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (action_at)`),
];

module.exports = {
  validateActivityPointAction,
  validateCommonLogin,
  validateMergeFixedId,
  validateRegisterUserByAppstore,
  validateRegisterUserByEshop,
  validateEditUserCid,
  validateDeleteUserCid,
  validateActivityPointLog,
  validateActivityPointStats,
  validateActivityPointRank,
  validateSoftPointLog,
  validateSoftPointStats,
  validateSoftPointRank,
  validateAppstorePointLog,
  validatePlusAppstorePoint,
  validateRefundAppstorePoint,
  validateKaraokePointLog,
  validatePlusKaraokePoint,
  validateRefundKaraokePoint,
  validateBMediaPointLog,
  validatePlusBMediaPoint,
  validateRefundBMediaPoint,
};
