const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateEditUser = [
  check("key").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (key)`),
  check("value").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (value)`),
];

const validateChangePassword = [
  check("org_password").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (org_password)`),
  check("new_password").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (new_password)`),
];

const validateSurveyResponse = [
  check("question_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (question_pk)`),
];

const validateLastUserId = [
  check("cid").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (cid)`),
];

const validateRegisteredUserId = [
  check("cid").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (cid)`),
];

const validateAddAchievement = [
  check("duty_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (duty_pk)`),
];

const validateMergeUserId = [
  check("type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (type)`),
  check("merge_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (merge_id)`),
];

const validateRegisterUserId = [
  check("type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (type)`),
];

const validateSplitUserId = [
  check("type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (type)`),
];

const validateAddPhone = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
  check("phone_number").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_number)`),
];

const validateDeletePhone = [
  check("phone_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_pk)`),
];

const validateGetSoftPointLog = [
  check("point_type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (point_type)`),
];

const validateAddEprodLicenseReport = [
  check("lic_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (lic_id)`),
  check("phone_number").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_number)`),
  check("report").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (report)`),
];

const validateGetBMediaKeygenById = [
  check("id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (id)`),
];

const validateEditFeedbackThread = [
  check("thread_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (thread_pk)`),
];

const validateGetFeedbackMessages = [
  check("thread_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (thread_pk)`),
];

const validateAddFeedbackMessage = [
  check("message").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (message)`),
];

module.exports = {
  validateEditUser,
  validateChangePassword,
  validateSurveyResponse,
  validateLastUserId,
  validateRegisteredUserId,
  validateAddAchievement,
  validateMergeUserId,
  validateRegisterUserId,
  validateSplitUserId,
  validateAddPhone,
  validateDeletePhone,
  validateGetSoftPointLog,
  validateAddEprodLicenseReport,
  validateGetBMediaKeygenById,
  validateEditFeedbackThread,
  validateGetFeedbackMessages,
  validateAddFeedbackMessage,
};
