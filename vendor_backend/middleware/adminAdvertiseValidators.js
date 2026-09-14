const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateDeleteByAdPk = [
  check("ad_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (ad_pk)`),
];

const validateAddAdvertise = [
  check("title").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (title)`),
];

const validateEditAdvertise = [
];

const validateSyncAdvertise = [
  check("ad_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (ad_pk)`),
];

const validateDeleteLayoutByPk = [
  check("layout_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (layout_pk)`),
];

const validateAddLayout = [
  check("predef_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (predef_id)`),
  check("layout_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (layout_name)`),
];

const validateEditLayout = [
  check("layout_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (layout_pk)`),
  check("predef_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (predef_id)`),
];

const validateFetchLayoutAds = [
  check("layout_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (layout_pk)`),
];

const validateDeleteLayoutAdByPk = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateAddLayoutAd = [
  check("layout_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (layout_pk)`),
  check("pre_index").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (pre_index)`),
  check("ad_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (ad_pk)`),
  check("position").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (position)`),
];

const validateEditLayoutAd = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateDeleteHomeConfigByPk = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateAddHomeConfig = [
  check("config_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (config_name)`),
  check("position").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (position)`),
];

const validateEditHomeConfig = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateDeleteMenu = [
  check("menu_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (menu_pk)`),
  check("is_deleted").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_deleted)`),
];

const validateAddMenu = [
  check("menu_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (menu_name)`),
  check("position").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (position)`),
];

const validateEditMenu = [
  check("menu_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (menu_pk)`),
];

const validateAddHomePopup = [
  check("position").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (position)`),
  check("start_date").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (start_date)`),
  check("end_date").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (end_date)`),
];

const validateEditHomePopup = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
  check("start_date").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (start_date)`),
  check("end_date").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (end_date)`),
];

const validateDeleteHomePopup = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
  check("is_deleted").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_deleted)`),
];

const validateSyncHomePopup = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateAddPageBanner = [
  check("page_type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (page_type)`),
];

const validateEditPageBanner = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
  check("page_type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (page_type)`),
];

const validateDeletePageBanner = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
  check("is_deleted").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_deleted)`),
];

const validateSyncPageBanner = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

module.exports = {
  validateDeleteByAdPk,
  validateAddAdvertise,
  validateEditAdvertise,
  validateSyncAdvertise,
  validateDeleteLayoutByPk,
  validateAddLayout,
  validateEditLayout,
  validateFetchLayoutAds,
  validateDeleteLayoutAdByPk,
  validateAddLayoutAd,
  validateEditLayoutAd,
  validateDeleteHomeConfigByPk,
  validateAddHomeConfig,
  validateEditHomeConfig,
  validateDeleteMenu,
  validateAddMenu,
  validateEditMenu,
  validateAddHomePopup,
  validateEditHomePopup,
  validateDeleteHomePopup,
  validateSyncHomePopup,
  validateAddPageBanner,
  validateEditPageBanner,
  validateDeletePageBanner,
  validateSyncPageBanner,
};
