const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateAddCrmProduct = [
  check("product_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_name)`),
  check("category_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (category_pk)`),
  check("root_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (root_pk)`),
];

const validateEditCrmProduct = [
  check("product_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_pk)`),
  check("product_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_name)`),
  check("category_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (category_pk)`),
  check("root_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (root_pk)`),
];

const validateDeleteCrmProduct = [
  check("product_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_pk)`),
];

const validateAddCrmProdSpecKey = [
  check("spec_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (spec_name)`),
  check("spec_type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (spec_type)`),
];

const validateEditCrmProdSpecKey = [
  check("spec_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (spec_pk)`),
  check("spec_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (spec_name)`),
  check("spec_type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (spec_type)`),
];

const validateDeleteCrmProdSpecKey = [
  check("spec_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (spec_pk)`),
];

const validateAddCrmProdSpecValue = [
  check("root_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (root_pk)`),
  check("spec_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (spec_pk)`),
  check("spec_value").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (spec_value)`),
];

const validateEditCrmProdSpecValue = [
  check("value_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (value_pk)`),
  check("root_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (root_pk)`),
  check("spec_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (spec_pk)`),
  check("spec_value").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (spec_value)`),
];

const validateDeleteCrmProdSpecValue = [
  check("value_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (value_pk)`),
];

const validateAddCrmProdSpecOrder = [
  check("root_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (root_pk)`),
  check("spec_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (spec_pk)`),
];

const validateEditCrmProdSpecOrder = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateDeleteCrmProdSpecOrder = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateAddCrmProdSurveyOption = [
  check("root_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (root_pk)`),
  check("option_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (option_name)`),
];

const validateEditCrmProdSurveyOption = [
  check("option_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (option_pk)`),
  check("root_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (root_pk)`),
  check("option_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (option_name)`),
];

const validateDeleteCrmProdSurveyOption = [
  check("option_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (option_pk)`),
];

const validateImportCrmEprodSales = [
  check("root_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (root_pk)`),
  check("excel_data").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (excel_data)`),
];

module.exports = {
  validateAddCrmProduct,
  validateEditCrmProduct,
  validateDeleteCrmProduct,
  validateAddCrmProdSpecKey,
  validateEditCrmProdSpecKey,
  validateDeleteCrmProdSpecKey,
  validateAddCrmProdSpecValue,
  validateEditCrmProdSpecValue,
  validateDeleteCrmProdSpecValue,
  validateAddCrmProdSpecOrder,
  validateEditCrmProdSpecOrder,
  validateDeleteCrmProdSpecOrder,
  validateAddCrmProdSurveyOption,
  validateEditCrmProdSurveyOption,
  validateDeleteCrmProdSurveyOption,
  validateImportCrmEprodSales,
};
