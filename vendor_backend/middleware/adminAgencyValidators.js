const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateAddPhoneAgency = [
  check("agency_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (agency_name)`),
  check("phone_numbers").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_numbers)`),
  check("business").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (business)`),
  check("location_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (location_pk)`),
];

const validateEditPhoneAgency = [
  check("agency_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (agency_pk)`),
  check("agency_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (agency_name)`),
  check("phone_numbers").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_numbers)`),
  check("business").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (business)`),
  check("location_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (location_pk)`),
];

const validateDeletePhoneAgency = [
  check("agency_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (agency_pk)`),
  check("is_deleted").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_deleted)`),
];

const validateAddEprodAgency = [
  check("agency_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (agency_name)`),
  check("phone_numbers").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_numbers)`),
  check("business").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (business)`),
  check("location_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (location_pk)`),
];

const validateEditEprodAgency = [
  check("agency_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (agency_pk)`),
  check("agency_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (agency_name)`),
  check("phone_numbers").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (phone_numbers)`),
  check("business").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (business)`),
  check("location_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (location_pk)`),
];

const validateDeleteEprodAgency = [
  check("agency_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (agency_pk)`),
  check("is_deleted").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_deleted)`),
];

const validateEditPhoneSaleAgency = [
  check("agency_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (agency_id)`),
  check("position").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (position)`),
];

const validateDeletePhoneSaleAgency = [
  check("agency_id").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (agency_id)`),
  check("is_deleted").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (is_deleted)`),
];

module.exports = {
  validateAddPhoneAgency,
  validateEditPhoneAgency,
  validateDeletePhoneAgency,
  validateAddEprodAgency,
  validateEditEprodAgency,
  validateDeleteEprodAgency,
  validateEditPhoneSaleAgency,
  validateDeletePhoneSaleAgency,
};
