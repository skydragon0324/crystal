const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateDeleteByBlogPk = [
  check("blog_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (blog_pk)`),
];

const validateAddBlog = [
  check("title").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (title)`),
  check("content").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (content)`),
  check("category_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (category_id)`),
  check("post_type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (post_type)`),
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
];

const validateEditBlog = [
  check("blog_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (blog_pk)`),
];

module.exports = {
  validateDeleteByBlogPk,
  validateAddBlog,
  validateEditBlog,
};
