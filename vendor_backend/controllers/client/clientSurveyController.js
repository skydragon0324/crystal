const moment = require('moment');
const SurveyModel = require('../../models/surveyModel');
const ManagerModel = require('../../models/managerModel');
const PremiumModel = require('../../models/premiumModel');
const { createResponse } = require('../../utils/response');
const { getSurveyIndicesByDepartmment } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { PREMIUM_SERVICE_WOMENSDAY_DISP_DATE, PREMIUM_SERVICE_WOMENSDAY_RESULT_TIME, PREMIUM_SERVICE_WOMENSDAY_SERVICE_PK, FLAG_EXIST } = require('../../constants/constants');

let premium_women_stats = [];

async function getPremiumWomenSurveyStats() {
  try {
    const today = moment().format("YYYY-MM-DD");
    const now = moment().format("YYYY-MM-DD HH:mm:ss");
    if (today > PREMIUM_SERVICE_WOMENSDAY_DISP_DATE
      || now < PREMIUM_SERVICE_WOMENSDAY_RESULT_TIME
    ) {
      return;
    }

    const service_row = await PremiumModel.findPremiumServiceByPk(PREMIUM_SERVICE_WOMENSDAY_SERVICE_PK);
    if (!service_row) {
      return;
    }

    const start_date = moment(service_row.lottery_start_date).format("YYYY-MM-DD");
    const end_date = moment(service_row.lottery_end_date).format("YYYY-MM-DD");
    const questions = await SurveyModel.findQuestionsInPeriod({ start_date, end_date });
    const question_pks = questions.map(item => item.question_pk);
    for (const question_pk of question_pks) {
      const filter = { question_pk, age: -1, job: -1, is_client: 1 };
      const rows = await SurveyModel.findResponseStatisticsByAnswer(filter);
      const sum = rows.length > 0 ? rows.map(row => row.count).reduce((a, b) => a + b) : 0;
      premium_women_stats = [...premium_women_stats,
      ...rows.map(row => ({
        ...row,
        service_pk: PREMIUM_SERVICE_WOMENSDAY_SERVICE_PK,
        question_pk,
        percent: sum === 0 ? 0 : +((row.count / sum * 100).toFixed(2)),
      })),
      ];
    }
  } catch (err) {
    console.log(err);
  }
}

async function fetchSurveyQuestionsInPeriod(req, res) {
  const start_date = req.query.start_date;
  const end_date = req.query.end_date;
  const condition = req.query.condition || "";

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const filter = { start_date, end_date, is_deleted: FLAG_EXIST };
    if (end_date < start_date) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("SURVEY_INVALID_PERIOD") });
    }
    let questions = [];
    if (condition.length > 0 && condition.slice(0, 1) === "1") {
      questions = await SurveyModel.findQuestionsInPeriod(filter);
    }
    let choices = [];
    if (condition.length > 1 && condition.slice(1, 2) === "1") {
      if (questions.length > 0) {
        const question_pks = questions.map(item => item.question_pk);
        choices = await SurveyModel.findChoicesInQuestionPks(question_pks);
      } else {
        choices = await SurveyModel.findChoicesInPeriod(filter);
      }
    }
    let responses = [];
    if (condition.length > 2 && (condition.slice(0, 1) === "1" || condition.slice(1, 2) === "1" || condition.slice(2, 3) === "1")) {
      if (questions.length > 0) {
        const question_pks = questions.map(item => item.question_pk);
        responses = await SurveyModel.findResponsesInQuestionPks(user.user_pk, question_pks);
      } else {
        responses = await SurveyModel.findResponsesInPeriod(user.user_pk, filter);
      }
    }
    const data = { questions, choices, responses };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchAdminSurveys(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const category = req.query.category === undefined ? -1 : +req.query.category;

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const admin = await ManagerModel.findUserAdminByUserPk(user.user_pk);
    if (!admin) {
      return res.status(RESP_CODES.FORBIDDEN.code).json({ code: RESP_CODES.FORBIDDEN.code, message: getLangText("NOT_ADMIN") });
    }

    const categories = getSurveyIndicesByDepartmment(admin.department);
    if (category !== -1 && !categories.includes(+category)) {
      return res.status(RESP_CODES.FORBIDDEN.code).json(RESP_CODES.FORBIDDEN);
    }

    const filter = { offset, limit, sort, keyword, category, categories };

    const total = await SurveyModel.findAllSurveys(filter, true);
    const rows = await SurveyModel.findAllSurveys(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchSurveyStatsByAnswer(req, res) {
  const question_pk = +req.query.question_pk || 0;

  const filter = { question_pk, age: -1, job: -1 };
  try {
    const total = await SurveyModel.findResponsorCountByAnswer(filter);
    const rows = await SurveyModel.findResponseStatisticsByAnswer(filter);
    const sum = rows.length > 0 ? rows.map(row => row.count).reduce((a, b) => a + b) : 0;
    const data = {
      total,
      rows: rows.map(row => ({
        ...row,
        percent: sum === 0 ? 0 : +((row.count / sum * 100).toFixed(2)),
      })),
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPremiumSurveyStats(req, res) {
  const service_pk = +req.query.service_pk || 0;
  try {
    if (service_pk !== PREMIUM_SERVICE_WOMENSDAY_SERVICE_PK) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")} (service_pk)` });
    }

    if (premium_women_stats.length === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("PREMIUM_WAIT_RESULT") });
    }

    const data = {
      rows: premium_women_stats,
    }
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  getPremiumWomenSurveyStats,
  fetchSurveyQuestionsInPeriod,
  fetchAdminSurveys,
  fetchSurveyStatsByAnswer,
  fetchPremiumSurveyStats,
};
