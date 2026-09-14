const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateBlogReplies = [
  check("parent_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (parent_pk)`),
];

const validateSubmitBlogRating = [
  check("blog_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (blog_pk)`),
  check("rating_type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (rating_type)`),
];

const validateViewBlogArticle = [
  check("blog_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (blog_pk)`),
  check("imei").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (imei)`),
];

const validateViewBlogReply = [
  check("blog_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (blog_pk)`),
  check("imei").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (imei)`),
];

const validateViewBlogReplyWeb = [
  check("blog_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (blog_pk)`),
];

const validateGetBlogContent = [
  check("blog_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (blog_pk)`),
];

const validateGetPremiumDiscussBlog = [
  check("condition").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (condition)`),
];

const validateAddBlog = [
  check("title").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (title)`),
  check("content").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (content)`),
  check("parent_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (parent_pk)`),
  check("type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (type)`),
  check("subject_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (subject_id)`),
]

const validateEditBlog = [
  check("blog_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (blog_pk)`),
]

const validateDeleteBlog = [
  check("blog_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (blog_pk)`),
]

module.exports = {
  validateBlogReplies,
  validateSubmitBlogRating,
  validateViewBlogArticle,
  validateViewBlogReply,
  validateViewBlogReplyWeb,
  validateGetBlogContent,
  validateGetPremiumDiscussBlog,
  validateAddBlog,
  validateEditBlog,
  validateDeleteBlog,
};
