const { check } = require('express-validator');
const { getLangText } = require('../lang/lang');

const validateAddSurvey = [
  check("survey_name").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (survey_name)`),
  check("survey_category").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (survey_category)`),
  check("start_date").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (start_date)`),
  check("end_date").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (end_date)`),
];

const validateEditSurvey = [
  check("survey_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (survey_pk)`),
];

const validateDeleteSurvey = [
  check("survey_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (survey_pk)`),
];

const validateQuestions = [
  check("survey_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (survey_pk)`),
];

const validateAddQuestion = [
  check("survey_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (survey_pk)`),
  check("question_text").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (question_text)`),
  check("question_type").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (question_type)`),
  check("position").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (position)`),
];

const validateEditQuestion = [
  check("question_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (question_pk)`),
  check("survey_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (survey_pk)`),
];

const validateDeleteQuestion = [
  check("question_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (question_pk)`),
];

const validateChoices = [
  check("question_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (question_pk)`),
];

const validateAddChoice = [
  check("question_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (question_pk)`),
  check("choice_text").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (choice_text)`),
  check("position").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (position)`),
];

const validateEditChoice = [
  check("question_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (question_pk)`),
  check("choice_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (choice_pk)`),
];

const validateDeleteChoice = [
  check("choice_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (choice_pk)`),
];

const validateStatsSurvey = [
  check("question_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (question_pk)`),
];

const validateWomenStatsDetail = [
  check("user_pk").notEmpty().withMessage(`${getLangText("PARAMETER_REQUIRED")} (user_pk)`),
];

module.exports = {
  validateAddSurvey,
  validateEditSurvey,
  validateDeleteSurvey,
  validateQuestions,
  validateAddQuestion,
  validateEditQuestion,
  validateDeleteQuestion,
  validateChoices,
  validateAddChoice,
  validateEditChoice,
  validateDeleteChoice,
  validateStatsSurvey,
  validateWomenStatsDetail,
};
