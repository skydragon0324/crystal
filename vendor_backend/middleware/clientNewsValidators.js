const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateGetNewsArticleLob = [
  check("article_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (article_pk)`),
];

const validateToggleNewsFavorite = [
  check("article_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (article_pk)`),
];

module.exports = {
  validateGetNewsArticleLob,
  validateToggleNewsFavorite,
};
