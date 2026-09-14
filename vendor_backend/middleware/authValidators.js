const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateAdminLogin = [
  check("manager_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (manager_id)`),
  check("password").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (password)`),
];

const validateUserLogin = [
  check("cid").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (cid)`),
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
  check("password").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (password)`),
];

const validateUserRegister = [
  check("cid").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (cid)`),
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
  check("password").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (password)`),
  check("user_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_name)`),
  check("gender").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (gender)`),
  check("birthday").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (birthday)`),
];

const validateEccFunc = [
  check("cmd").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (cmd)`),
  check("data").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (data)`),
];

const validateVerifyCode = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
  check("cid").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (cid)`),
  check("verify_code").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (verify_code)`),
];

const validateWebLogin = [
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
  check("password").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (password)`),
];

module.exports = {
  validateAdminLogin,
  validateUserLogin,
  validateUserRegister,
  validateEccFunc,
  validateVerifyCode,
  validateWebLogin,
};
