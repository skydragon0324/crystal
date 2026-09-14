const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateGetProductNameBySN = [
  check("sn").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (sn)`),
];

const validateCheckProductDuplicationBySN = [
  check("sn").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (sn)`),
];

const validateGetPhoneSpecs = [
  check("product_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_pk)`),
];

const validateGetPhoneImages = [
  check("product_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_pk)`),
];

const validateGetPhoneAccessories = [
  check("product_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_pk)`),
];

const validateGetPhoneChangelog = [
  check("product_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_pk)`),
];

const validateAddRegisterProdLog = [
  check("phone_number").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_number)`),
  check("sn_num").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (sn_num)`),
  check("product_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_name)`),
  check("bonus_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (bonus_pk)`),
];

const validateAddRegisterPhoneLog = [
  check("model_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (model_name)`),
  check("phone_imei").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_imei)`),
  check("cid").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (cid)`),
];

const validateCheckRegisterPhone = [
  check("phone_imei").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_imei)`),
];

const validateAddCidLock = [
  check("cid").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (cid)`),
];

const validateDeleteCidLock = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateCrmProdInfoByEprod = [
  check("root_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (root_pk)`),
];

const validateApproveEprodRegister = [
  check("net_type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (net_type)`),
  check("sn_num").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (sn_num)`),
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
  check("phone_number").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_number)`),
  check("address").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (address)`),
  check("crm_info").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (crm_info)`),
  check("crm_prod_category_im_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (crm_prod_category_im_pk)`),
  check("crm_category_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (crm_category_name)`),
  check("product_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_name)`),
  check("reg_date").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (reg_date)`),
];

const validateDeleteEprodRegister = [
  check("net_type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (net_type)`),
  check("sn_num").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (sn_num)`),
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
];

const validateSaveEprodCrm = [
  check("sn_num").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (sn_num)`),
  check("product_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_name)`),
  check("phone_number").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_number)`),
  check("root_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (root_pk)`),
  check("category_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (category_name)`),
  check("crm_keys").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (crm_keys)`),
  check("crm_values").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (crm_values)`),
  check("reg_date").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (reg_date)`),
];

const validateAddEprodCrm = [
  check("sn_num").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (sn_num)`),
  check("user_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_name)`),
  check("phone_number").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_number)`),
  check("crm_info").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (crm_info)`),
  check("crm_prod_category_im_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (crm_prod_category_im_pk)`),
  check("crm_category_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (crm_category_name)`),
  check("product_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_name)`),
];

module.exports = {
  validateGetProductNameBySN,
  validateCheckProductDuplicationBySN,
  validateGetPhoneSpecs,
  validateGetPhoneImages,
  validateGetPhoneAccessories,
  validateGetPhoneChangelog,
  validateAddRegisterProdLog,
  validateAddRegisterPhoneLog,
  validateCheckRegisterPhone,
  validateAddCidLock,
  validateDeleteCidLock,
  validateCrmProdInfoByEprod,
  validateApproveEprodRegister,
  validateDeleteEprodRegister,
  validateSaveEprodCrm,
  validateAddEprodCrm,
};
