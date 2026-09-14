const { validationResult } = require('express-validator');
const moment = require('moment');
const SurveyModel = require('../../models/surveyModel');
const { createResponse } = require('../../utils/response');
const { extractValidParams, getSurveyIndicesByDepartmment } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');

async function fetchSurveys(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const category = req.query.category === undefined || req.query.category === "" ? -1 : +req.query.category;

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const categories = getSurveyIndicesByDepartmment(admin.department);
  if (category !== -1 && !categories.includes(+category)) {
    return res.status(RESP_CODES.FORBIDDEN.code).json(RESP_CODES.FORBIDDEN);
  }

  try {
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

async function addSurvey(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["survey_name", "survey_category", "start_date", "end_date", "position"];
  let params = extractValidParams(req.body, validKeys);
  try {
    params = { ...params, start_date: moment(params.start_date).toDate(), end_date: moment(params.end_date).toDate() };

    const row = await SurveyModel.addSurvey(params, admin.manager_pk);
    if (!row) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const data = { row };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function editSurvey(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["survey_pk", "survey_name", "survey_category", "start_date", "end_date", "position"];
  let params = extractValidParams(req.body, validKeys);
  try {
    const exist = await SurveyModel.findSurveyByPk(params.survey_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    params = { ...params, start_date: moment(params.start_date).toDate(), end_date: moment(params.end_date).toDate() };

    const count = await SurveyModel.editSurvey(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteSurveyByPk(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const { survey_pk, is_deleted } = req.body;
  try {
    const exist = await SurveyModel.findSurveyByPk(survey_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { survey_pk, is_deleted };
    const count = await SurveyModel.editSurvey(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchQuestionsBySurveyPk(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const survey_pk = req.query.survey_pk || 0;

  if (!survey_pk || survey_pk === 0) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json(createResponse(RESP_CODES.BAD_REQUEST));
  }

  try {
    const filter = { offset, limit, sort, survey_pk, keyword };
    const total = await SurveyModel.findQuestionsBySurveyPk(filter, true);
    const rows = await SurveyModel.findQuestionsBySurveyPk(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addQuestion(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["survey_pk", "question_text", "question_type", "position", "publish_num"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const row = await SurveyModel.addQuestion(params, admin.manager_pk);
    if (!row) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const data = { row };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function editQuestion(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["question_pk", "survey_pk", "question_text", "question_type", "position", "publish_num"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await SurveyModel.findQuestionByPk(params.question_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await SurveyModel.editQuestion(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteQuestionByPk(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const { question_pk, is_deleted } = req.body;
  try {
    const exist = await SurveyModel.findQuestionByPk(question_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { question_pk, is_deleted };
    const count = await SurveyModel.editQuestion(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchChoicesByQuestionPk(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const question_pk = req.query.question_pk || 0;

  if (!question_pk || question_pk === 0) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json(createResponse(RESP_CODES.BAD_REQUEST));
  }

  try {
    const filter = { offset, limit, sort, question_pk, keyword };
    const total = await SurveyModel.findChoicesByQuestionPk(filter, true);
    const rows = await SurveyModel.findChoicesByQuestionPk(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addChoice(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["question_pk", "choice_text", "position"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const row = await SurveyModel.addChoice(params, admin.manager_pk);
    if (!row) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const data = { row };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function editChoice(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["choice_pk", "question_pk", "choice_text", "position"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await SurveyModel.findChoiceByPk(params.choice_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await SurveyModel.editChoice(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteChoiceByPk(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const { choice_pk, is_deleted } = req.body;
  try {
    const exist = await SurveyModel.findChoiceByPk(choice_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { choice_pk, is_deleted };
    const count = await SurveyModel.editChoice(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchResponses(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "action_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const survey_pk = req.query.survey_pk || 0;
  const user_pk = req.query.user_pk || 0;

  try {
    const filter = { offset, limit, sort, keyword, survey_pk, user_pk };
    const total = await SurveyModel.findAllResponses(filter, true);
    const rows = await SurveyModel.findAllResponses(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchSurveyStatsByUser(req, res) {
  const question_pk = +req.query.question_pk || 0;
  const category = req.query.category || "";
  let parent_location_code = req.query.parent_location_code || "";
  if (parent_location_code.length === 1) {
    parent_location_code = "0" + parent_location_code;
  }

  const filter = { question_pk, category, parent_location_code };
  try {
    const rows = await SurveyModel.findResponseStatisticsByUser(filter);
    const sum = rows.length > 0 ? rows.map(row => row.count).reduce((a, b) => a + b) : 0;
    const data = {
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

async function fetchSurveyStatsByAnswer(req, res) {
  const question_pk = +req.query.question_pk || 0;
  const gender = req.query.gender || "";
  const age = req.query.age ? +req.query.age : -1;
  const job = req.query.job && +req.query.job !== 0 ? +req.query.job : -1;
  let parent_location_code = req.query.parent_location_code || "";
  if (parent_location_code.length === 1) {
    parent_location_code = "0" + parent_location_code;
  }

  const filter = { question_pk, gender, age, parent_location_code, job };
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

async function calcSurveyStatsForWomensDay(req, res) {
  try {
    const question_pks = [254, 248, 250, 257, 249, 255, 251, 253, 252, 256];
    const rows = await SurveyModel.findResponsorCountInQuestionPks(question_pks);
    if (rows.length === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("PREMIUM_PUZZLE_NO_RESPONSORS") });
    }

    const newRows = rows.map(row => {
      const questionCount = rows.filter(item => item.question_pk === row.question_pk).length;
      const questionRows = rows.filter(item => item.question_pk === row.question_pk);
      const choiceIdx = questionRows.findIndex(item => item.choice_pk === row.choice_pk);

      return {
        ...row,
        points: choiceIdx < 0 ? 0 : +((choiceIdx + 1) * 10 / questionCount).toFixed(2),
      };
    });

    await SurveyModel.deleteWomenSurveyStats();
    await SurveyModel.addWomenSurveyStats(newRows);

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchWomenSurveyRespRank(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const keyword = req.query.keyword || "";

  const filter = { keyword };
  try {
    const total = await SurveyModel.findWomenSurveyRespRank(offset, limit, filter, true);
    const rows = await SurveyModel.findWomenSurveyRespRank(offset, limit, filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchWomenSurveyRespDetail(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const user_pk = req.query.user_pk;
  const keyword = req.query.keyword || "";

  const filter = { user_pk, keyword };
  try {
    const total = await SurveyModel.findWomenSurveyRespDetail(offset, limit, filter, true);
    const rows = await SurveyModel.findWomenSurveyRespDetail(offset, limit, filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchSurveys,
  addSurvey,
  editSurvey,
  deleteSurveyByPk,
  fetchQuestionsBySurveyPk,
  addQuestion,
  editQuestion,
  deleteQuestionByPk,
  fetchChoicesByQuestionPk,
  addChoice,
  editChoice,
  deleteChoiceByPk,
  fetchResponses,
  fetchSurveyStatsByUser,
  fetchSurveyStatsByAnswer,
  calcSurveyStatsForWomensDay,
  fetchWomenSurveyRespRank,
  fetchWomenSurveyRespDetail,
};
