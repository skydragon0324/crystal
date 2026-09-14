const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateAddNewsCategory = [
  check("category_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (category_name)`),
  check("position").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (position)`),
];

const validateEditNewsCategory = [
  check("category_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (category_pk)`),
];

const validateDeleteNewsCategory = [
  check("category_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (category_pk)`),
  check("is_deleted").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_deleted)`),
];

const validateAddNewsArticle = [
  check("article_title").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (article_title)`),
  check("article_content").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (article_content)`),
  check("category_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (category_pk)`),
];

const validateEditNewsArticle = [
  check("article_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (article_pk)`),
];

const validateDeleteNewsArticle = [
  check("article_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (article_pk)`),
  check("is_deleted").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_deleted)`),
];

const validateGetNewsContent = [
  check("article_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (article_pk)`),
  check("article_source").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (article_source)`),
];

module.exports = {
  validateAddNewsCategory,
  validateEditNewsCategory,
  validateDeleteNewsCategory,
  validateAddNewsArticle,
  validateEditNewsArticle,
  validateDeleteNewsArticle,
  validateGetNewsContent,
};
