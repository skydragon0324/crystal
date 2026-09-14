const { validationResult } = require('express-validator');
const DeviceModel = require('../../models/deviceModel');
const { createResponse } = require('../../utils/response');
const { extractValidParams } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { FLAG_EXIST, FLAG_DELETED, REPORT_STATUS, ACTION_TYPE, FLAG_ACTIVE, ROOT_MANAGER_PK, REPORT_MAX_COUNT_FOR_SAME } = require('../../constants/constants');

async function fetchDevices(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "last_logged_in", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const min_at = req.query.min_at || "";
  const max_at = req.query.max_at || "";

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  let filter = { offset, limit, sort, user_pk: user.user_pk, keyword, min_at, max_at };
  if (min_at === "" && max_at == "") {
    filter = { ...filter, is_deleted: FLAG_EXIST };
  }

  try {
    const total = await DeviceModel.findCidDevices(filter, true);
    const rows = await DeviceModel.findCidDevices(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteDevice(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["device_pk"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await DeviceModel.findDeviceByPk(params.device_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const editParams = {
      device_pk: params.device_pk,
      is_deleted: FLAG_DELETED,
    }
    const count = await DeviceModel.editDevice(editParams);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function reportDevice(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["device_pk"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await DeviceModel.findLastReportByDevicePk(params.device_pk);
    if (exist && exist.status === REPORT_STATUS.PENDING) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("DEVICE_REPORT_STATUS_ALREADY_PENDING") });
    }

    const memberRow = await DeviceModel.findDeviceMemberByPk(params.device_pk);
    let member_pk = 0;
    if (memberRow) {
      if (memberRow.member_pk && memberRow.member_status !== FLAG_ACTIVE) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("DEVICE_REPORT_ALREADY_BLOCKED") });
      }
      member_pk = memberRow.member_pk;
    }

    if (user.user_pk === member_pk) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("DEVICE_REPORT_ERR_REPORT_SELF") });
    }

    const reportCount = await DeviceModel.findReportCountByDevicePk(params.device_pk);
    if (reportCount > REPORT_MAX_COUNT_FOR_SAME) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("DEVICE_REPORT_ERR_MAX_COUNT", [REPORT_MAX_COUNT_FOR_SAME]) });
    }

    let reportParams = {
      device_pk: params.device_pk,
      report_type: ACTION_TYPE.USER,
      report_by: user.user_pk,
      status: REPORT_STATUS.PENDING,
    };
    if (member_pk !== 0) {
      reportParams = { ...reportParams, target_pk: member_pk };
    }

    const reportRow = await DeviceModel.addReport(reportParams);
    if (!reportRow) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("DEVICE_REPORT_FAIL_ADD_REPORT") });
    }

    const deviceParams = {
      device_pk: params.device_pk,
      report_status: REPORT_STATUS.PENDING,
    };
    const count = await DeviceModel.editDevice(deviceParams);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("DEVICE_REPORT_FAIL_CHANGE_STATUS") });
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function cancelDevice(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["device_pk"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await DeviceModel.findLastReportByDevicePk(params.device_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    if (exist.status !== REPORT_STATUS.PENDING) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("DEVICE_REPORT_ERR_NOT_PENDING") });
    }

    const reportParams = {
      report_pk: exist.report_pk,
      status: REPORT_STATUS.CANCELED,
      resolve_by: ROOT_MANAGER_PK,
    };
    const reportCount = await DeviceModel.editReport(reportParams);
    if (reportCount === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("DEVICE_FAIL_CHANGE_REPORT_STATUS") });
    }

    const deviceParams = {
      device_pk: params.device_pk,
      report_status: REPORT_STATUS.CANCELED,
    };
    const deviceCount = await DeviceModel.editDevice(deviceParams);
    if (deviceCount === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("DEVICE_REPORT_FAIL_CHANGE_STATUS") });
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchDevices,
  deleteDevice,
  reportDevice,
  cancelDevice,
};
