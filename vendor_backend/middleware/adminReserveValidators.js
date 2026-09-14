const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateAddReservePrefix = [
  check("prefix_str").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (prefix_str)`),
  check("product_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (product_name)`),
  check("start_date").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (start_date)`),
  check("end_date").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (end_date)`),
];

const validateEditReservePrefix = [
  check("prefix_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (prefix_pk)`),
];

const validateDeleteReservePrefix = [
  check("prefix_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (prefix_pk)`),
  check("is_deleted").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_deleted)`),
];

const validateMinusReservePrefix = [
  check("prefix_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (prefix_pk)`),
  check("points").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (points)`),
  check("customers").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (customers)`),
];

const validateSmsReservePrefix = [
  check("prefix_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (prefix_pk)`),
  check("imeis").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (imeis)`),
];

const validateAddReserveUsers = [
  check("prefix_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (prefix_pk)`),
  check("users").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (users)`),
];

const validateEditReserveUser = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
  check("prefix_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (prefix_pk)`),
  check("users").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (users)`),
];

const validateDeleteReserveUser = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
  check("is_deleted").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_deleted)`),
];

const validateAddReserveLog = [
  check("prefix_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (prefix_pk)`),
  check("user_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_id)`),
  check("reserve_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (reserve_name)`),
  check("id_card").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (id_card)`),
  check("phone_number").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_number)`),
  check("agency_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (agency_id)`),
];

const validateEditReserveLog = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
  check("reserve_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (reserve_name)`),
  check("id_card").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (id_card)`),
  check("phone_number").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_number)`),
  check("agency_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (agency_id)`),
];

const validateDeleteReserveLog = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateSyncPhoneBook = [
  check("table_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (table_pk)`),
];

const validateSyncPhoneBooks = [
  check("prefix_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (prefix_pk)`),
];

const validateAddOldReservePrefix = [
  check("prefix").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (prefix)`),
  check("mobile_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (mobile_pk)`),
  check("start_at").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (start_at)`),
  check("end_at").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (end_at)`),
];

const validateEditOldReservePrefix = [
  check("pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (pk)`),
  check("prefix").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (prefix)`),
  check("mobile_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (mobile_pk)`),
  check("start_at").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (start_at)`),
  check("end_at").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (end_at)`),
];

const validateAddOldReservations = [
  check("prefix").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (prefix)`),
  check("customers").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (customers)`),
];

const validateAddOldReserveLog = [
  check("prefix_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (prefix_pk)`),
  check("user_userid").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_userid)`),
  check("name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (name)`),
  check("citizen_no").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (citizen_no)`),
  check("mobile_phone").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (mobile_phone)`),
];

const validateEditOldReserveLog = [
  check("pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (pk)`),
  check("name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (name)`),
  check("mobile_phone").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (mobile_phone)`),
];

const validateDeleteOldReserveLog = [
  check("pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (pk)`),
];

module.exports = {
  validateAddReservePrefix,
  validateEditReservePrefix,
  validateDeleteReservePrefix,
  validateMinusReservePrefix,
  validateSmsReservePrefix,
  validateAddReserveUsers,
  validateEditReserveUser,
  validateDeleteReserveUser,
  validateAddReserveLog,
  validateEditReserveLog,
  validateDeleteReserveLog,
  validateSyncPhoneBook,
  validateSyncPhoneBooks,
  validateAddOldReservePrefix,
  validateEditOldReservePrefix,
  validateAddOldReservations,
  validateAddOldReserveLog,
  validateEditOldReserveLog,
  validateDeleteOldReserveLog,
};
