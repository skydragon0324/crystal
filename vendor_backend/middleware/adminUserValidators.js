const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateResetUser = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
];

const validateDeleteUserByPk = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
  check("reason").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (reason)`),
  check("status").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (status)`),
];

const validateAddTester = [
  check("tester_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (tester_name)`),
  check("phone_imei").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_imei)`),
];

const validateEditTester = [
  check("tester_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (tester_pk)`),
];

const validateAddUser = [
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
  check("user_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_name)`),
  check("gender").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (gender)`),
  check("birthday").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (birthday)`),
];

const validateEditUser = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
];

const validateAddPhone = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
  check("phone_number").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_number)`),
  check("phone_type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_type)`),
];

const validateDeletePhoneByPk = [
  check("phone_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_pk)`),
];

const validateForwardUserPassword = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateForwardUserFixed = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateForwardUserRegister = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateMergeUserId = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
  check("type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (type)`),
  check("merge_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (merge_id)`),
];

const validateRegisterUserId = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
  check("type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (type)`),
];

const validateSplitUserId = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
  check("type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (type)`),
];

const validateDeleteLocationByPk = [
  check("location_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (location_pk)`),
];

const validateAddLocation = [
  check("location_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (location_name)`),
  check("position").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (position)`),
];

const validateEditLocation = [
  check("location_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (location_pk)`),
  check("location_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (location_name)`),
  check("position").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (position)`),
];

const validateAddWhiteUser = [
  check("user_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_name)`),
  check("cid").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (cid)`),
];

const validateEditWhiteUser = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateDeleteWhiteUser = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateGetCidLocks = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
];

const validateAddCidLock = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
  check("cid").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (cid)`),
];

const validateDeleteCidLock = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateGetUserInfoByDevice = [
  check("phone_imei").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_imei)`),
];

module.exports = {
  validateResetUser,
  validateDeleteUserByPk,
  validateAddTester,
  validateEditTester,
  validateAddUser,
  validateEditUser,
  validateAddPhone,
  validateDeletePhoneByPk,
  validateForwardUserPassword,
  validateForwardUserFixed,
  validateForwardUserRegister,
  validateMergeUserId,
  validateRegisterUserId,
  validateSplitUserId,
  validateDeleteLocationByPk,
  validateAddLocation,
  validateEditLocation,
  validateAddWhiteUser,
  validateEditWhiteUser,
  validateDeleteWhiteUser,
  validateGetCidLocks,
  validateAddCidLock,
  validateDeleteCidLock,
  validateGetUserInfoByDevice,
};
