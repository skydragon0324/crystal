const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateEditBroadcast = [
  check("broadcast_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (broadcast_pk)`),
  check("is_read").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_read)`),
];

const validateEditFeedbackThread = [
  check("thread_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (thread_pk)`),
];

const validateFetchFeedbackMessages = [
  check("thread_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (thread_pk)`),
];

const validateAddFeedbackMessage = [
  check("message").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (message)`),
];

const validateLevelFeedbackMessage = [
  check("message_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (message_pk)`),
  check("qc_level").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (qc_level)`),
];

module.exports = {
  validateEditBroadcast,
  validateEditFeedbackThread,
  validateFetchFeedbackMessages,
  validateAddFeedbackMessage,
  validateLevelFeedbackMessage,
};
