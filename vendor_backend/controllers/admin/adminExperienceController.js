const moment = require('moment');
const { validationResult } = require('express-validator');
const ExpModel = require('../../models/experienceModel');
const { createResponse } = require('../../utils/response');
const { extractValidParams } = require('../../utils/utils');
const RESP_CODES = require('../../constants/responseCodes');

async function fetchDuties(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, sort, keyword };
    const total = await ExpModel.findDuties(filter, true);
    const rows = await ExpModel.findDuties(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addDuty(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["duty_title", "icon_title", "icon_url", "point_type", "position", "action", "content", "image_url", "category", "duty_type", "start_date", "end_date", "disp_date"];
  let params = extractValidParams(req.body, validKeys);
  try {
    // If file uploaded, we can now include the file path in params
    if (req.file) {
      params.image_url = req.file.path;
    }

    if (params.start_date) {
      params = { ...params, start_date: moment(params.start_date).toDate() };
    }
    if (params.end_date) {
      params = { ...params, end_date: moment(params.end_date).toDate() };
    }
    if (params.disp_date) {
      params = { ...params, disp_date: moment(params.disp_date).toDate() };
    }

    const row = await ExpModel.addDuty(params, admin.manager_pk);
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

async function editDuty(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["duty_pk", "duty_title", "icon_title", "icon_url", "point_type", "position", "action", "content", "image_url", "category", "duty_type", "start_date", "end_date", "disp_date"];
  let params = extractValidParams(req.body, validKeys);
  try {
    const exist = await ExpModel.findDutyByPk(params.duty_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    // If file uploaded, we can now include the file path in params
    if (req.file) {
      params.image_url = req.file.path;
    }

    if (params.start_date) {
      params = { ...params, start_date: moment(params.start_date).toDate() };
    }
    if (params.end_date) {
      params = { ...params, end_date: moment(params.end_date).toDate() };
    }
    if (params.disp_date) {
      params = { ...params, disp_date: moment(params.disp_date).toDate() };
    }

    const count = await ExpModel.editDuty(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteDutyByPk(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const { duty_pk, is_deleted } = req.body;
  try {
    const exist = await ExpModel.findDutyByPk(duty_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { duty_pk, is_deleted };
    const count = await ExpModel.editDuty(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchAchievements(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "action_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const duty_pk = req.query.duty_pk || 0;

  try {
    const filter = { offset, limit, sort, keyword, duty_pk };
    const total = await ExpModel.findAchievements(filter, true);
    const rows = await ExpModel.findAchievements(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchDuties,
  addDuty,
  editDuty,
  deleteDutyByPk,
  fetchAchievements,
};
