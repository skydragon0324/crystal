const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateGetQuestionsInPeriod = [
  check("start_date").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (start_date)`),
  check("end_date").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (end_date)`),
  check("condition").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (condition)`),
];

const validateStatsSurvey = [
  check("question_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (question_pk)`),
];

const validateGetStatsSurvey = [
  check("service_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (service_pk)`),
];

module.exports = {
  validateGetQuestionsInPeriod,
  validateStatsSurvey,
  validateGetStatsSurvey,
};
