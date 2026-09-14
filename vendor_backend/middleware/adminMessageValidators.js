const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateEditFeedbackThread = [
  check("thread_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (thread_pk)`),
];

const validateAddFeedbackMessage = [
  check("message").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (message)`),
];

const validateDeleteFeedbackMessage = [
  check("message_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (message_pk)`),
];

const validateForwardFeedbackMessage = [
  check("message_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (message_pk)`),
];

const validateLevelFeedbackMessage = [
  check("message_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (message_pk)`),
  check("qc_level").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (qc_level)`),
];

const validateProcessPhoneNumberMessage = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
  check("thread_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (thread_pk)`),
  check("phone_number").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_number)`),
];

const validateFetchBroadcastByUserPk = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
];

const validateAddBroadcast = [
  check("title").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (title)`),
  check("content").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (content)`),
  check("users").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (users)`),
];

const validateEditBroadcast = [
  check("broadcast_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (broadcast_pk)`),
];

const validateDeleteBroadcast = [
  check("broadcast_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (broadcast_pk)`),
  check("is_deleted").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_deleted)`),
];

const validatePhoneSaleBroadcast = [
  check("prefix_pks").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (prefix_pks)`),
  check("agency_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (agency_id)`),
  check("title").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (title)`),
  check("content").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (content)`),
];

const validateAddNotification = [
  check("title").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (title)`),
  check("content").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (content)`),
  check("status").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (status)`),
  check("category").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (category)`),
  check("start_date").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (start_date)`),
  check("end_date").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (end_date)`),
  check("position").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (position)`),
];

const validateEditNotification = [
  check("notification_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (notification_pk)`),
];

const validateDeleteNotificationByPk = [
  check("notification_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (notification_pk)`),
];

const validateAddFaq = [
  check("question").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (question)`),
  check("answer").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (answer)`),
  check("category").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (category)`),
  check("position").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (position)`),
];

const validateEditFaq = [
  check("faq_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (faq_pk)`),
];

const validateDeleteFaq = [
  check("faq_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (faq_pk)`),
  check("is_deleted").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_deleted)`),
];

module.exports = {
  validateEditFeedbackThread,
  validateAddFeedbackMessage,
  validateDeleteFeedbackMessage,
  validateForwardFeedbackMessage,
  validateLevelFeedbackMessage,
  validateProcessPhoneNumberMessage,
  validateFetchBroadcastByUserPk,
  validateAddBroadcast,
  validateEditBroadcast,
  validateDeleteBroadcast,
  validatePhoneSaleBroadcast,
  validateAddNotification,
  validateEditNotification,
  validateDeleteNotificationByPk,
  validateAddFaq,
  validateEditFaq,
  validateDeleteFaq,
};
