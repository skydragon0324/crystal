const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateResetManager = [
  check("manager_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (manager_pk)`),
];

const validateDeleteByManagerPk = [
  check("manager_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (manager_pk)`),
];

const validateAddManager = [
  check("manager_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (manager_id)`),
  check("manager_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (manager_name)`),
];

const validateEditManager = [
  check("manager_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (manager_pk)`),
  check("manager_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (manager_id)`),
  check("manager_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (manager_name)`),
];

const validateChangePasswordManager = [
  check("manager_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (manager_pk)`),
  check("old_password").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (old_password)`),
  check("new_password").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (new_password)`),
];

const validateDeleteByRolePk = [
  check("role_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (role_pk)`),
];

const validateAddRole = [
  check("role_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (role_name)`),
  check("default_page").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (default_page)`),
];

const validateEditRole = [
  check("role_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (role_pk)`),
  check("role_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (role_name)`),
  check("default_page").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (default_page)`),
];

const validateDeleteByPagePk = [
  check("page_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (page_pk)`),
];

const validateAddPage = [
  check("page_url").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (page_url)`),
  check("page_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (page_name)`),
];

const validateEditPage = [
  check("page_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (page_pk)`),
  check("page_url").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (page_url)`),
  check("page_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (page_name)`),
];

const validateRolePages = [
  check("role_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (role_pk)`),
];

const validateRolePerms = [
  check("role_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (role_pk)`),
  check("page_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (page_pk)`),
  check("permission").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (permission)`),
];

const validateUpdateDepart = [
  check("role_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (role_pk)`),
  check("department").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (department)`),
];

const validateEditUserAdmin = [
  check("manager_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (manager_pk)`),
];

module.exports = {
  validateResetManager,
  validateDeleteByManagerPk,
  validateAddManager,
  validateEditManager,
  validateDeleteByRolePk,
  validateChangePasswordManager,
  validateAddRole,
  validateEditRole,
  validateDeleteByPagePk,
  validateAddPage,
  validateEditPage,
  validateRolePages,
  validateRolePerms,
  validateUpdateDepart,
  validateEditUserAdmin,
};
