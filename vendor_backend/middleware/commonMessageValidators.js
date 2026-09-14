const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateAddFeedbackMessage = [
  check("message").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (message)`),
];

module.exports = {
  validateAddFeedbackMessage,
};
