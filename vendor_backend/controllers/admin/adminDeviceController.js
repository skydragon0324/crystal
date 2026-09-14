const moment = require('moment');
const { validationResult, param } = require('express-validator');
const DeviceModel = require('../../models/deviceModel');
const UserModel = require('../../models/userModel');
const MessageModel = require('../../models/messageModel');
const PointModel = require('../../models/pointModel');
const { createResponse } = require('../../utils/response');
const { extractValidParams, formatTimeForMessage } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { ACTION_TYPE, FLAG_ACTIVE, REPORT_STATUS, FEEDBACK_CATEGORY, FEEDBACK_THREAD_LAST_TYPE, THREAD_STATUS, FLAG_NONE, ROOT_MANAGER_PK, POINT_TYPE_VALUES, ACTIVITY_LIMIT_SOURCES, REPORT_COUNT_FOR_BLOCK, FLAG_INACTIVE } = require('../../constants/constants');

async function fetchDevices(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "last_logged_in", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const field = req.query.field || "";

  try {
    const filter = { offset, limit, sort, keyword, field };
    const total = await DeviceModel.findCidDevices(filter, true);
    const rows = await DeviceModel.findCidDevices(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addDevice(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["user_pk", "cid", "phone_model", "phone_imei", "last_logged_in"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await DeviceModel.findDevice({ user_pk: params.user_pk, cid: params.cid, phone_imei: params.phone_imei });
    if (exist) {  // update last login time
      const count = await DeviceModel.editDevice({ device_pk: exist.device_pk, last_loggged_in: new Date() });
      if (count === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }

      const data = { count };
      return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
    }

    const row = await DeviceModel.addDevice(params);
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

async function deleteDevice(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["device_pk", "is_deleted"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await DeviceModel.findDeviceByPk(params.device_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    const count = await DeviceModel.editDevice(params);
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

  const admin = req.admin;
  if (!admin) {
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
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("DEVICE_REPORT_USER_ALREADY_INACTIVE") });
      }
      member_pk = memberRow.member_pk;
    }

    if (memberRow.user_pk === member_pk) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("DEVICE_REPORT_DISALLOW_MYSELF") });
    }

    let reportParams = {
      device_pk: params.device_pk,
      report_type: ACTION_TYPE.MANAGER,
      report_by: admin.manager_pk,
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

async function fetchReports(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "updated_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const status = req.query.status !== undefined && req.query.status !== "" ? +req.query.status : -1;
  const field = req.query.field || "";

  try {
    const filter = { offset, limit, sort, keyword, status, field };
    const total = await DeviceModel.findReports(filter, true);
    const rows = await DeviceModel.findReports(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function editReport(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["report_pk", "status", "member_id"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await DeviceModel.findReportByPk(params.report_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    if ([REPORT_STATUS.DENIED, REPORT_STATUS.CANCELED].includes(+params.status)) {
      let reportParams = {
        report_pk: params.report_pk,
        status: params.status,
        resolve_by: admin.manager_pk,
      };
      const reportCount = await DeviceModel.editReport(reportParams);
      if (reportCount === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("DEVICE_FAIL_CHANGE_REPORT_STATUS") });
      }

      const deviceParams = {
        device_pk: exist.device_pk,
        report_status: params.status,
      };
      const deviceCount = await DeviceModel.editDevice(deviceParams);
      if (deviceCount === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("DEVICE_REPORT_FAIL_CHANGE_STATUS") });
      }
      return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
    } else if (+params.status !== REPORT_STATUS.ACCEPTED) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("DEVICE_ERR_REPORT_STATUS") });
    }

    const device = await DeviceModel.findDeviceUserByPk(exist.device_pk);
    if (!device) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    let member;
    if (exist.target_pk) {
      member = await UserModel.findUserByPk(exist.target_pk);
    } else if (params.member_id) {
      member = await UserModel.findUserById(params.member_id);
    }

    if (device.user_pk === member.user_pk) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("DEVICE_REPORT_REPORTER_USER_SAME") });
    }

    if (!member) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("DEVICE_REPORT_NOT_FOUND_MEMBER") });
    }

    const msgRet = await processReportMessage(member.user_pk, device.user_id, device.cid, device.last_logged_in, admin.manager_pk);
    if (msgRet.code !== RESP_CODES.SUCCESS.code) {
      return res.status(msgRet.code).json(msgRet);
    }

    const pointRet = await processReportPoint(member.user_pk, device.user_id, admin.manager_pk);
    if (pointRet.code !== RESP_CODES.SUCCESS.code) {
      return res.status(pointRet.code).json(pointRet);
    }

    let reportParams = {
      report_pk: params.report_pk,
      status: params.status,
      resolve_by: admin.manager_pk,
      target_pk: member.user_pk,
    };
    const reportCount = await DeviceModel.editReport(reportParams);
    if (reportCount === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("DEVICE_FAIL_CHANGE_REPORT_STATUS") });
    }

    const deviceParams = {
      device_pk: exist.device_pk,
      report_status: params.status,
    };
    const deviceCount = await DeviceModel.editDevice(deviceParams);
    if (deviceCount === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("DEVICE_REPORT_FAIL_CHANGE_STATUS") });
    }

    const acceptCount = await DeviceModel.findReportTargetCount(member.user_pk);
    if (acceptCount >= REPORT_COUNT_FOR_BLOCK) {
      const userParams = {
        user_pk: member.user_pk,
        status: FLAG_INACTIVE,
      };
      const userCount = await UserModel.editUser(userParams);
      if (userCount === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: `${member.user_id}${getLangText("DEVICE_REPORT_FAIL_BLOCK_USER")}` });
      }

      const blockParams = {
        user_pk: member.user_pk,
        status: FLAG_INACTIVE,
        reason: `${device.user_id} ${getLangText("DEVICE_REPORT_MSG_BLOCK_USER")}`,
      };
      const blockRow = await UserModel.addUserBlockLog(blockParams, admin.manager_pk);
      if (!blockRow) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_FAIL_ADD_BLOCK_LOG") });
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function processReportMessage(user_pk, reporter_id, cid, used_time, admin_pk) {
  try {
    const message = getLangText("DEVICE_REPORT_FEEDBACK_BLOCK_MSG", [reporter_id, formatTimeForMessage(used_time), cid]);
    const threadParams = {
      user_pk,
      title: getLangText("DEVICE_REPORT_FEEDBACK_BLOCK_TITLE", [reporter_id]),
      category: FEEDBACK_CATEGORY.PID,
      last_message: message,
      last_type: FEEDBACK_THREAD_LAST_TYPE.REPLIED,
      status: THREAD_STATUS.DISCUSSING,
      is_read: FLAG_NONE,
    };

    const threadRow = await MessageModel.addFeedbackThread(threadParams);
    if (!threadRow) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("FEEDBACK_FAIL_ADD_THREAD") };
    }

    const messageParams = {
      thread_pk: threadRow.thread_pk,
      message,
      action_type: ACTION_TYPE.MANAGER,
      action_by: admin_pk,
    };
    const msgRow = await MessageModel.addFeedbackMessage(messageParams);
    if (!msgRow) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("FEEDBACK_FAIL_ADD_MESSAGE") };
    }

    return RESP_CODES.SUCCESS;
  } catch (err) {
    console.error(err);
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function processReportPoint(user_pk, reporter_id, admin_pk) {
  try {
    const pointType = await PointModel.findActivityPointTypeByPk(POINT_TYPE_VALUES.MANAGER_MANUAL_REPORT);
    if (!pointType || !pointType.points) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_NOT_FOUND_TYPE") });
    }

    const pointLogParams = {
      user_pk,
      type_pk: POINT_TYPE_VALUES.MANAGER_MANUAL_REPORT,
      points: pointType.points,
      reason: `${reporter_id} ${getLangText("DEVICE_REPORT_MSG_BLOCK_USER")}`,
      ip_address: admin_pk,
    };
    const pointLogRow = await PointModel.addActivityPointLog(pointLogParams);
    if (!pointLogRow) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_ADD_ACTIVITY_POINT") });
    }

    const activityLimit = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.ACTIVITY);
    let include_limit = false;
    const today = moment().format("YYYY-MM-DD");
    if (!activityLimit || (activityLimit && today <= activityLimit.limit_time)) {
      include_limit = true;
    }
    const statsExist = await PointModel.findActivityPointStatsByUserPk(user_pk);
    if (statsExist) {
      const statsCount = await PointModel.increaseActivityPointStats(user_pk, pointType.points, include_limit, false);
      if (statsCount === 0) {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_UPDATE_ACTIVITY_POINT") };
      }
    } else {
      const statsParams = {
        user_pk,
        total_points: pointType.points,
        limit_points: include_limit ? pointType.points : 0,
        minus_points: 0,
      };
      const pointStats = await PointModel.addActivityPointStats(statsParams);
      if (!pointStats) {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_ADD_ACTIVITY_POINT") };
      }
    }

    return RESP_CODES.SUCCESS;
  } catch (err) {
    console.error(err);
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function fetchSmartPhones(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "created_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, sort, keyword };
    const total = await DeviceModel.findSmartPhones(filter, true);
    const rows = await DeviceModel.findSmartPhones(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addSmartPhone(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["phone_brand", "phone_model", "phone_name", "company"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const phoneFilter = {
      phone_brand: params.phone_brand,
      phone_model: params.phone_model,
    };
    const exist = await DeviceModel.findSmartPhoneByFilter(phoneFilter);
    if (exist) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const row = await DeviceModel.addSmartPhone(params);
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

async function editSmartPhone(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["phone_pk", "phone_brand", "phone_model", "phone_name", "company"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await DeviceModel.findSmartPhoneByPk(params.phone_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    const phoneFilter = {
      phone_brand: params.phone_brand,
      phone_model: params.phone_model,
    };
    const info = await DeviceModel.findSmartPhoneByFilter(phoneFilter);
    if (info && info.phone_pk !== exist.phone_pk) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("CONFLICT_EXIST_ITEM") });
    }

    const count = await DeviceModel.editSmartPhone(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteSmartPhone(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["phone_pk"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await DeviceModel.findSmartPhoneByPk(params.phone_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    const count = await DeviceModel.deleteSmartPhone(params.phone_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPhoneCompanies(req, res) {
  try {
    const rows = await DeviceModel.findPhoneCompanies();
    const data = {
      rows: rows.map(row => row.company),
    }
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPhoneModels(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["company"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const rows = await DeviceModel.findPhoneModelByCompany(params.company);
    const data = {
      rows: rows.map(row => row.phone_name),
    }
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchDevices,
  addDevice,
  deleteDevice,
  reportDevice,
  fetchReports,
  editReport,
  fetchSmartPhones,
  addSmartPhone,
  editSmartPhone,
  deleteSmartPhone,
  fetchPhoneCompanies,
  fetchPhoneModels
};
