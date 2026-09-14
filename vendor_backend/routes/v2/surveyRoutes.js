const express = require('express');
const router = express.Router();
const authController = require('../../controllers/authController');
const surveyController = require('../../controllers/client/clientSurveyController');
const userController = require('../../controllers/client/clientUserController');
const { validateGetStatsSurvey, validateGetQuestionsInPeriod } = require('../../middleware/clientSurveyValidators');
const { validateSurveyResponse } = require('../../middleware/clientUserValidators');
const { validateStatsSurvey } = require('../../middleware/adminSurveyValidators');

router.post('/survey_response_submit', authController.verifyUserToken, validateSurveyResponse, userController.submitSurveyResponse);
router.get('/survey_questions_in_period', authController.verifyUserToken, validateGetQuestionsInPeriod, surveyController.fetchSurveyQuestionsInPeriod);
router.get('/premium_survey_stats', authController.verifyUserToken, validateGetStatsSurvey, surveyController.fetchPremiumSurveyStats);
router.get('/admin_surveys', authController.verifyUserToken, surveyController.fetchAdminSurveys);
router.get('/admin_survey_stats_by_answer', authController.verifyUserToken, validateStatsSurvey, surveyController.fetchSurveyStatsByAnswer);

module.exports = router;
