const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateAddProductCategory = [
  check("category_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (category_name)`),
];

const validateEditProductCategory = [
  check("category_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (category_pk)`),
  check("category_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (category_name)`),
];

const validateDeleteProductCategory = [
  check("category_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (category_pk)`),
];

const validateAddProduct = [
  check("product_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_name)`),
  check("category_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (category_pk)`),
  check("root_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (root_pk)`),
];

const validateEditProduct = [
  check("product_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_pk)`),
  check("product_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_name)`),
  check("category_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (category_pk)`),
  check("root_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (root_pk)`),
];

const validateDeleteProduct = [
  check("product_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_pk)`),
];

const validateSyncProduct = [
  check("product_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_pk)`),
];

const validateAddProductImage = [
  check("product_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_pk)`),
  check("image_type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (image_type)`),
];

const validateEditProductImage = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
  check("product_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_pk)`),
  check("image_type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (image_type)`),
];

const validateDeleteProductImage = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateSyncProductImage = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateAddProductSpecKey = [
  check("spec_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (spec_name)`),
  check("spec_type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (spec_type)`),
];

const validateEditProductSpecKey = [
  check("spec_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (spec_pk)`),
  check("spec_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (spec_name)`),
  check("spec_type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (spec_type)`),
];

const validateDeleteProductSpecKey = [
  check("spec_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (spec_pk)`),
];

const validateAddProductSpecOrder = [
  check("root_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (root_pk)`),
  check("spec_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (spec_pk)`),
];

const validateEditProductSpecOrder = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateDeleteProductSpecOrder = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateGetProductSpecValues = [
  check("root_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (root_pk)`),
  check("product_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_pk)`),
];

const validateSubmitProductSpecValues = [
  check("rows").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (rows)`),
];

const validateAddProductModel = [
  check("product_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_pk)`),
  check("model_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (model_name)`),
];

const validateEditProductModel = [
  check("model_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (model_pk)`),
  check("product_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_pk)`),
  check("model_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (model_name)`),
];

const validateDeleteProductModel = [
  check("model_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (model_pk)`),
];

const validateAddRegisterPhoneLog = [
  check("product_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_pk)`),
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
  check("phone_imei").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_imei)`),
  check("cid").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (cid)`),
];

const validateGetEprodRegistAddLog = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
];

const validateGetEprodRegistMinusLog = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
];

const validateAddPhoneImeiPrefix = [
  check("product_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_pk)`),
  check("prefix_str").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (prefix_str)`),
];

const validateDeletePhoneImeiPrefix = [
  check("prefix_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (prefix_pk)`),
];

const validateGetPhoneAccessories = [
  check("product_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_pk)`),
];

const validateAddPhoneAccessory = [
  check("product_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_pk)`),
  check("accessory_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (accessory_name)`),
  check("allow_num").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (allow_num)`),
];

const validateEditPhoneAccessory = [
  check("accessory_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (accessory_pk)`),
  check("product_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_pk)`),
  check("accessory_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (accessory_name)`),
  check("allow_num").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (allow_num)`),
];

const validateDeletePhoneAccessory = [
  check("accessory_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (accessory_pk)`),
];

const validateAddPhoneChangelog = [
  check("product_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_pk)`),
  check("title").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (title)`),
  check("content").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (content)`),
];

const validateEditPhoneChangelog = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
  check("product_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_pk)`),
  check("title").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (title)`),
  check("content").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (content)`),
];

const validateDeletePhoneChangelog = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

module.exports = {
  validateAddProductCategory,
  validateEditProductCategory,
  validateDeleteProductCategory,
  validateAddProduct,
  validateEditProduct,
  validateDeleteProduct,
  validateSyncProduct,
  validateAddProductImage,
  validateEditProductImage,
  validateDeleteProductImage,
  validateSyncProductImage,
  validateAddProductSpecKey,
  validateEditProductSpecKey,
  validateDeleteProductSpecKey,
  validateAddProductSpecOrder,
  validateEditProductSpecOrder,
  validateDeleteProductSpecOrder,
  validateGetProductSpecValues,
  validateSubmitProductSpecValues,
  validateAddProductModel,
  validateEditProductModel,
  validateDeleteProductModel,
  validateAddRegisterPhoneLog,
  validateGetEprodRegistAddLog,
  validateGetEprodRegistMinusLog,
  validateAddPhoneImeiPrefix,
  validateDeletePhoneImeiPrefix,
  validateGetPhoneAccessories,
  validateAddPhoneAccessory,
  validateEditPhoneAccessory,
  validateDeletePhoneAccessory,
  validateAddPhoneChangelog,
  validateEditPhoneChangelog,
  validateDeletePhoneChangelog,
};
