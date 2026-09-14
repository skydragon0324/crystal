const md5 = require('md5');
const xlsx = require("xlsx");
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const { validationResult } = require('express-validator');
const UserModel = require('../../models/userModel');
const CustomerModel = require('../../models/customerModel');
const PointModel = require('../../models/pointModel');
const MessageModel = require('../../models/messageModel');
const DeviceModel = require('../../models/deviceModel');
const MassApi = require('../../api/massApi');
const AppstoreApi = require('../../api/appstoreApi');
const EshopApi = require('../../api/eshopApi');
const CronApi = require('../../api/cronApi');
const WebApi = require('../../api/webApi');
const { processAppstorePointLogByUserPk, processKaraokePointLogByUserPk, processBMediaPointLogByUserPk } = require('../common/commonPrhnController');
const { addCustomerByPid, editCustomerByPid, editCustomerPhoneNumberbyPid } = require('./adminCrmController');
const { createResponse } = require('../../utils/response');
const { extractValidParams, formatDateForClient, convertDateFromString, getFullLocationCode } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { DOWNLOAD_PATH, MERGE_ID_TYPE, MERGE_TYPE, USER_PROPERTY_TYPE, ACTION_TYPE, JOBS, USER_PWD_APP_TYPE, USER_PWD_STATUS, SOFT_POINT_STATUS, SOFT_POINT_PREDEFINED_RELATED_PKS, USER_FIXED_FUNC_TYPES, SOFT_POINT_TYPES, REG_POINT_TYPES, REG_POINT_STATUS, USER_FIXED_STATUS, FIXED_STATUS, USER_REG_APP_TYPE, USER_REG_STATUS, THREAD_STATUS, CID_LENGTH, CUSTOMER_SOURCE, CUSTOMER_STATUS, PHONE_NUMBER_MAX_COUNT } = require('../../constants/constants');


async function fetchTesters(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const keyword = req.query.keyword;
  const sort = { key: req.query.sortKey || "created_at", dir: req.query.sortDir || "desc" };

  try {
    const filter = { offset, limit, sort, keyword };
    const total = await UserModel.findTesters(filter, true);
    const rows = await UserModel.findTesters(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addTester(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["tester_name", "phone_imei"];
  let params = extractValidParams(req.body, validKeys);
  try {
    const exist = await UserModel.findTesterByImei(params.phone_imei);
    if (exist) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const row = await UserModel.addTester(params);
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

async function editTester(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["tester_pk", "tester_name", "phone_imei"];
  let params = extractValidParams(req.body, validKeys);
  try {
    const exist = await UserModel.findTesterByImei(params.phone_imei);
    if (exist && exist.tester_pk !== params.tester_pk) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }
    const count = await UserModel.editTester(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }
    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteTesterByPk(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { tester_pk, is_deleted } = req.body;
  try {
    const exist = await UserModel.findTesterByPk(tester_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }
    const params = {
      tester_pk,
      is_deleted,
    };
    const count = await UserModel.editTester(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }
    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchUsers(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "created_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const search_phone = +req.query.isSearchPhone || 0;
  const gender = req.query.gender || "";
  const parent_location_code = getFullLocationCode(req.query.parent_location_code);
  const job = req.query.job || "";

  try {
    const filter = { offset, limit, sort, keyword, search_phone, gender, parent_location_code, job };
    const total = await UserModel.findAllUsers(filter, true);
    const rows = await UserModel.findAllUsers(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addUser(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["user_id", "password", "user_name", "user_alias", "user_avatar", "gender", "birthday", "job", "location_pk", "id_card", "cid", "locked"];
  let params = extractValidParams(req.body, validKeys);
  params = { ...params, birthday: convertDateFromString(params.birthday), password: params.password || md5("12345678") };

  try {
    const exist = await UserModel.findUserByLowerId(params.user_id);
    if (exist) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const row = await UserModel.addUser(params);
    if (!row) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    // crm
    addCustomerByPid(params, row.user_pk);

    const data = { row };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function editUser(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["user_pk", "user_id", "password", "user_name", "user_alias", "user_avatar", "gender", "birthday", "job", "location_pk", "cid", "locked"];
  let params = extractValidParams(req.body, validKeys);
  if (params.birthday) {
    params = { ...params, birthday: convertDateFromString(params.birthday) };
  }

  try {
    const exist = await UserModel.findUserById(params.user_id);
    if (exist && exist.user_pk !== params.user_pk) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const orgUser = await UserModel.findUserByPk(params.user_pk);
    if (!orgUser) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    if (params.cid) {
      const cidExist = await UserModel.findUserByCid(params.cid, true);
      if (cidExist && cidExist.user_pk !== params.user_pk) {
        return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("USER_CONFLICT_BY_CID") });
      }
    }

    const count = await UserModel.editUser(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    if (params.user_name && params.user_name !== orgUser.user_name) {
      const logParams = {
        user_pk: params.user_pk,
        property_type: USER_PROPERTY_TYPE.USER_NAME,
        old_value: orgUser.user_name,
        new_value: params.user_name,
        action_type: ACTION_TYPE.MANAGER,
        action_by: admin.manager_pk,
      };
      await UserModel.addUserEditLog(logParams);
    }
    if (params.birthday) {
      const orgBirthday = moment(orgUser.birthday).format("YYYY-MM-DD");
      const newBirthday = moment(params.birthday).format("YYYY-MM-DD");
      if (orgBirthday !== newBirthday) {
        const logParams = {
          user_pk: params.user_pk,
          property_type: USER_PROPERTY_TYPE.BIRTHDAY,
          old_value: orgBirthday,
          new_value: newBirthday,
          action_type: ACTION_TYPE.MANAGER,
          action_by: admin.manager_pk,
        };
        await UserModel.addUserEditLog(logParams);
      }
    }
    if (params.id_card && params.id_card !== orgUser.id_card) {
      const logParams = {
        user_pk: params.user_pk,
        property_type: USER_PROPERTY_TYPE.ID_CARD,
        old_value: orgUser.id_card,
        new_value: params.id_card,
        action_type: ACTION_TYPE.MANAGER,
        action_by: admin.manager_pk,
      };
      await UserModel.addUserEditLog(logParams);
    }
    if (params.cid && params.cid !== orgUser.cid) {
      const logParams = {
        user_pk: params.user_pk,
        property_type: USER_PROPERTY_TYPE.CID,
        old_value: orgUser.cid,
        new_value: params.cid,
        action_type: ACTION_TYPE.MANAGER,
        action_by: admin.manager_pk,
      };
      await UserModel.addUserEditLog(logParams);
    }
    if (params.job && params.job !== orgUser.job) {
      const old_job = JOBS.find(item => item.id === orgUser.job);
      const new_job = JOBS.find(item => item.id === +params.job);
      const logParams = {
        user_pk: params.user_pk,
        property_type: USER_PROPERTY_TYPE.JOB,
        old_value: old_job ? old_job.name : "",
        new_value: new_job ? new_job.name : "",
        action_type: ACTION_TYPE.MANAGER,
        action_by: admin.manager_pk,
      };
      await UserModel.addUserEditLog(logParams);
    }
    if (params.location_pk && params.location_pk !== orgUser.location_pk) {
      const old_address = await UserModel.findLocationFullNameByPk(orgUser.location_pk);
      const new_address = await UserModel.findLocationFullNameByPk(params.location_pk);
      const logParams = {
        user_pk: params.user_pk,
        property_type: USER_PROPERTY_TYPE.LOCATION,
        old_value: old_address ? old_address.full_name : "",
        new_value: new_address ? new_address.full_name : "",
        action_type: ACTION_TYPE.MANAGER,
        action_by: admin.manager_pk,
      };
      await UserModel.addUserEditLog(logParams);
    }
    if (params.gender && params.gender !== orgUser.gender) {
      const logParams = {
        user_pk: params.user_pk,
        property_type: USER_PROPERTY_TYPE.GENDER,
        old_value: orgUser.gender === 'M' ? getLangText("MALE") : (orgUser.gender === 'F' ? getLangText("FEMALE") : ""),
        new_value: params.gender === 'M' ? getLangText("MALE") : (params.gender === 'F' ? getLangText("FEMALE") : ""),
        action_type: ACTION_TYPE.MANAGER,
        action_by: admin.manager_pk,
      };
      await UserModel.addUserEditLog(logParams);
    }

    // crm
    editCustomerByPid(params, orgUser);

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteUserByPk(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["user_pk", "reason", "status"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await UserModel.findUserByPk(params.user_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const editParams = {
      user_pk: params.user_pk,
      status: params.status,
    };
    const count = await UserModel.editUser(editParams);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const blockParams = {
      user_pk: params.user_pk,
      status: params.status,
      reason: params.reason,
    };
    const row = await UserModel.addUserBlockLog(blockParams, admin.manager_pk);
    if (!row) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_FAIL_ADD_BLOCK_LOG") });
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function resetPassword(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["user_pk"];
  let params = extractValidParams(req.body, validKeys);
  params = { ...params, password: md5("12345678") };
  try {
    const mergeInfo = await UserModel.findMergeIdByFilter({ pvendor_pk: params.user_pk });
    if (mergeInfo) {
      if (mergeInfo.eshop_pk && mergeInfo.eshop_id) {
        await UserModel.ignoreUserPasswordLogs(params.user_pk, USER_PWD_APP_TYPE.ESHOP);
        const logParams = {
          user_pk: params.user_pk,
          user_id: mergeInfo.pvendor_id,
          password: params.password,
          app_type: USER_PWD_APP_TYPE.ESHOP,
          status: USER_PWD_STATUS.PENDING,
          action_type: ACTION_TYPE.MANAGER,
          action_by: admin.manager_pk,
        };
        const logRow = await UserModel.addUserPasswordLog(logParams);
        if (!logRow) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_ERR_PASSWORD_LOG_ESHOP") });
        }
      }
      if (mergeInfo.appstore_pk && mergeInfo.appstore_id) {
        await UserModel.ignoreUserPasswordLogs(params.user_pk, USER_PWD_APP_TYPE.APPSTORE);
        const logParams = {
          user_pk: params.user_pk,
          user_id: mergeInfo.pvendor_id,
          password: params.password,
          app_type: USER_PWD_APP_TYPE.APPSTORE,
          status: USER_PWD_STATUS.PENDING,
          action_type: ACTION_TYPE.MANAGER,
          action_by: admin.manager_pk,
        };
        const logRow = await UserModel.addUserPasswordLog(logParams);
        if (!logRow) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_ERR_PASSWORD_LOG_APPSTORE") });
        }
      }
      if (mergeInfo.mass_pk && mergeInfo.mass_id) {
        await UserModel.ignoreUserPasswordLogs(params.user_pk, USER_PWD_APP_TYPE.MASS);
        const logParams = {
          user_pk: params.user_pk,
          user_id: mergeInfo.pvendor_id,
          password: params.password,
          app_type: USER_PWD_APP_TYPE.MASS,
          status: USER_PWD_STATUS.PENDING,
          action_type: ACTION_TYPE.MANAGER,
          action_by: admin.manager_pk,
        };
        const logRow = await UserModel.addUserPasswordLog(logParams);
        if (!logRow) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_ERR_PASSWORD_LOG_MASS") });
        }
      }

      // request to change password, but not wait for it, cause eshop/appstore/mass server can be non-responsible
      CronApi.forwardUserPasswordLog(params.user_pk);
    }

    const count = await UserModel.editUser(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function exportUsers(req, res) {
  const offset = 0;
  const limit = 0;
  const sort = { key: req.query.sortKey || "created_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const gender = req.query.gender || "";
  const parent_location_pk = req.query.parent_location_pk || "";
  const location_pk = req.query.location_pk || "";
  const job = req.query.job || "";

  try {
    const filter = { offset, limit, sort, keyword, gender, parent_location_pk, location_pk, job };
    const total = await UserModel.findAllUsers(filter, true);
    if (total === 0) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const rows = await UserModel.findAllUsers(filter, false);

    const worksheet = xlsx.utils.json_to_sheet(rows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Users");

    if (true) {  // write data to file
      // Write file to server
      const timestamp = moment().format("YYMMDDHHmmss");
      const fileName = `users_${timestamp}.xlsx`;
      const filePath = path.join(DOWNLOAD_PATH, fileName);
      const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
      fs.writeFileSync(filePath, buffer);

      const data = { path: filePath, name: fileName };
      return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
    } else {
      // Set response headers for file download
      res.setHeader("Content-Disposition", "attachment; filename=users.xlsx");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

      // Send the file in response
      const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
      return res.status(RESP_CODES.SUCCESS.code).send(buffer);
    }
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addPhone(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["user_pk", "phone_number", "phone_type"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const row = await UserModel.addPhoneNumber(params);
    if (!row) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    // crm
    const phones = await UserModel.findUserAndMgrPhonesByUserPk(params.user_pk);
    if (phones.length > 0) {
      const numbers = phones.map(item => item.phone_number).filter(item => !!item).slice(0, PHONE_NUMBER_MAX_COUNT);
      const nonDup = [...new Set(numbers)];
      editCustomerPhoneNumberbyPid(params.user_pk, nonDup.join(","));
    }

    const data = { row };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deletePhoneByPk(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { phone_pk } = req.body;
  try {
    const exist = await UserModel.findPhoneByPk(phone_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await UserModel.deletePhoneByPk(phone_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    // crm
    const phones = await UserModel.findUserAndMgrPhonesByUserPk(exist.user_pk);
    if (phones.length > 0) {
      const numbers = phones.map(item => item.phone_number).filter(item => !!item).slice(0, PHONE_NUMBER_MAX_COUNT);
      const nonDup = [...new Set(numbers)];
      editCustomerPhoneNumberbyPid(exist.user_pk, nonDup.join(","));
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchUserEditLogs(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "action_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const property_type = req.query.property_type ? +req.query.property_type : -1;

  try {
    const filter = { offset, limit, sort, property_type, keyword };
    const total = await UserModel.findUserEditLogs(filter, true);
    const rows = await UserModel.findUserEditLogs(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchUserPasswordLogs(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "created_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const app_type = req.query.app_type ? +req.query.app_type : -1;

  try {
    const filter = { offset, limit, sort, app_type, keyword };
    const total = await UserModel.findUserPasswordLogs(filter, true);
    const rows = await UserModel.findUserPasswordLogs(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function forwardUserPasswordLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["table_pk"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await UserModel.findUserPasswordByPk(params.table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    if (exist.app_type === USER_PWD_APP_TYPE.ESHOP) {
      const resp = await EshopApi.changePassword(exist.user_id, exist.password);
      if (resp.code !== RESP_CODES.SUCCESS.code) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_ERR_PASSWORD_CHANGE_ESHOP") });
      }
    } else if (exist.app_type === USER_PWD_APP_TYPE.APPSTORE) {
      const resp = await AppstoreApi.changePassword(exist.user_id, exist.password);
      if (resp.code !== RESP_CODES.SUCCESS.code) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_ERR_PASSWORD_CHANGE_APPSTORE") });
      }
    } else if (exist.app_type === USER_PWD_APP_TYPE.MASS) {
      const resp = await MassApi.changePassword(exist.user_id, exist.password);
      if (resp.code !== RESP_CODES.SUCCESS.code) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_ERR_PASSWORD_CHANGE_MASS") });
      }
    } else {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")} (app_type)` });
    }

    const count = await UserModel.editUserPasswordLog({ table_pk: params.table_pk, status: USER_PWD_STATUS.SUCCESS });
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function mergeUserId(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["user_pk", "user_id", "type", "merge_id", "merge_pwd"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await UserModel.findMergeIdByFilter({ pvendor_pk: params.user_pk });
    if (exist) {
      if ((+params.type === MERGE_ID_TYPE.FIXED && exist.fixed_id)
        || (+params.type === MERGE_ID_TYPE.APPSTORE && exist.appstore_id)
        || (+params.type === MERGE_ID_TYPE.ESHOP && exist.eshop_id)) {
        if (+params.type === MERGE_ID_TYPE.FIXED && exist.fixed_status === FIXED_STATUS.PENDING) {
          return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("USER_MERGE_FIXED_PENDING") });
        } else if (+params.type === MERGE_ID_TYPE.FIXED && [FIXED_STATUS.REJECTED, FIXED_STATUS.CANCELED].includes(exist.fixed_status)) {
          // return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("USER_MERGE_FIXED_REJECTED") });
          // allow merge fixed_id for rejected one
        } else {
          return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("USER_MERGE_FIXED_FINISHED") });
        }
      }
    }
    if (+params.type === MERGE_ID_TYPE.FIXED) {
      const fixedExist = await UserModel.findUserById(params.merge_id);
      if (fixedExist && fixedExist.user_pk !== params.user_pk) {
        return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("USER_ERR_EXIST_SAME_FIXED") });
      }
    }

    let dbParams = {};
    if (+params.type === MERGE_ID_TYPE.FIXED) {
      dbParams = { fixed_id: params.merge_id };
    } else if (+params.type === MERGE_ID_TYPE.APPSTORE) {
      dbParams = { appstore_id: params.merge_id };
    } else if (+params.type === MERGE_ID_TYPE.ESHOP) {
      dbParams = { eshop_id: params.merge_id };
    } else if (+params.type === MERGE_ID_TYPE.MASS) {
      dbParams = { mass_id: params.merge_id };
    }
    const dup = await UserModel.findMergeIdByFilter(dbParams);
    if (dup && dup.pvendor_pk !== params.user_pk) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("USER_MERGE_FIXED_CONFLICT") });
    }

    const userInfo = await UserModel.findUserByPk(params.user_pk);
    if (!userInfo) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    if (+params.type === MERGE_ID_TYPE.FIXED) {
      const customer = await CustomerModel.findCustomerById(params.merge_id);
      if (!customer) {
        return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_MERGE_FIXED_NOT_EXIST") });
      } else if (userInfo.user_name !== customer.user_name) {
        return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_MERGE_FIXED_MISMATCH_NAME") });
      } else if (formatDateForClient(userInfo.birthday) === formatDateForClient(customer.user_birthday)) {
        dbParams = { ...dbParams, fixed_pk: customer.user_pk, fixed_status: FIXED_STATUS.PENDING };
      } else {
        return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_MERGE_FIXED_MISMATCH_BIRTHDAY") });
      }
    } else if (+params.type === MERGE_ID_TYPE.APPSTORE) {
      const resp = await AppstoreApi.mergeUserId(userInfo.user_id, userInfo.password, userInfo.user_name, formatDateForClient(userInfo.birthday), params.merge_id, params.merge_pwd, "");
      if (resp.code === RESP_CODES.SUCCESS.code) {
        dbParams = { ...dbParams, appstore_id: resp.data.appstore_id, appstore_pk: resp.data.appstore_pk, mass_id: params.merge_id, mass_pk: resp.data.appstore_pk };

        // add soft point from appstore
        const appstoreLogParams = {
          status: SOFT_POINT_STATUS.PLUS,
          reason: getLangText("POINT_REASON_MERGE_APPSTORE_ID"),
          soft_points: +resp.data.appstore_point,
          related_pk: SOFT_POINT_PREDEFINED_RELATED_PKS.MOBILE_APPSTORE,
          action_at: "",
        };
        await processAppstorePointLogByUserPk(params.user_pk, appstoreLogParams);
      } else {
        return res.status(resp.code).json(resp);
      }
    } else if (+params.type === MERGE_ID_TYPE.ESHOP) {
      const resp = await EshopApi.mergeUserId(userInfo.user_id, userInfo.password, userInfo.user_name, formatDateForClient(userInfo.birthday), params.merge_id, params.merge_pwd, "");
      if (resp.code === RESP_CODES.SUCCESS.code) {
        dbParams = { ...dbParams, eshop_id: resp.data.eshop_id, eshop_pk: resp.data.eshop_pk };
      } else {
        return res.status(resp.code).json(resp);
      }
    } else if (+params.type === MERGE_ID_TYPE.MASS) {
      const resp = await MassApi.mergeUserId(userInfo.user_id, userInfo.password, userInfo.user_name, formatDateForClient(userInfo.birthday), params.merge_id, params.merge_pwd, "");
      if (resp.code === RESP_CODES.SUCCESS.code) {
        dbParams = { ...dbParams, mass_id: resp.data.mass_id, mass_pk: resp.data.mass_pk };
      } else {
        return res.status(resp.code).json(resp);
      }
    }

    if (exist) {
      const count = await UserModel.editMergeId({ pvendor_pk: params.user_pk, ...dbParams });
      if (count === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }
    } else {
      const row = await UserModel.addMergeId({ pvendor_pk: params.user_pk, pvendor_id: params.user_id, ...dbParams });
      if (!row) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }
    }

    const logParams = {
      pvendor_pk: params.user_pk,
      pvendor_id: params.user_id,
      id_type: params.type,
      merge_id: params.merge_id,
      merge_type: MERGE_TYPE.MERGE,
      action_type: ACTION_TYPE.MANAGER,
      action_by: admin.manager_pk,
    };
    await UserModel.addMergeLog(logParams);

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function splitUserId(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["user_pk", "type"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await UserModel.findMergeIdByFilter({ pvendor_pk: params.user_pk });
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }
    if (!(+params.type === MERGE_ID_TYPE.FIXED && exist.fixed_id)
      && !(+params.type === MERGE_ID_TYPE.APPSTORE && exist.appstore_id)
      && !(+params.type === MERGE_ID_TYPE.ESHOP && exist.eshop_id)
      && !(+params.type === MERGE_ID_TYPE.MASS && exist.mass_id)
    ) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    let dbParams = {};
    if (+params.type === MERGE_ID_TYPE.FIXED) {
      dbParams = { fixed_id: "", fixed_pk: "" };
    } else if (+params.type === MERGE_ID_TYPE.APPSTORE) {
      const resp = await AppstoreApi.splitUserId(exist.appstore_pk);
      if (resp.code !== RESP_CODES.SUCCESS.code) {
        return res.status(resp.code).json(resp);
      }

      const appstoreStats = await PointModel.findAppstorePointStatsByUserPk(params.user_pk);
      if (appstoreStats) {
        const statsParams = {
          table_pk: appstoreStats.table_pk,
          total_points: 0,
          limit_points: 0,
        };
        const count = await PointModel.editAppstorePointStats(statsParams);
        if (count === 0) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_RESET_APPSTORE_POINT") });
        }
      }
      const delParams = {
        user_pk: params.user_pk,
      };
      await PointModel.deleteAppstorePointLog(delParams);

      dbParams = { appstore_id: "", appstore_pk: "", mass_pk: "", mass_id: "" };
    } else if (+params.type === MERGE_ID_TYPE.ESHOP) {
      const resp = await EshopApi.splitUserId(exist.eshop_pk);
      if (resp.code !== RESP_CODES.SUCCESS.code) {
        return res.status(resp.code).json(resp);
      }

      dbParams = { eshop_id: "", eshop_pk: "" };
    }

    const count = await UserModel.editMergeId({ pvendor_pk: params.user_pk, ...dbParams });
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const logParams = {
      pvendor_pk: params.user_pk,
      pvendor_id: exist.pvendor_id,
      id_type: params.type,
      merge_id: "",
      merge_type: MERGE_TYPE.SPLIT,
      action_type: ACTION_TYPE.MANAGER,
      action_by: admin.manager_pk,
    };
    await UserModel.addMergeLog(logParams);

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchMergeLogs(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "action_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const id_type = req.query.id_type ? +req.query.id_type : -1;

  try {
    const filter = { offset, limit, sort, id_type, keyword };
    const total = await UserModel.findMergeLogs(filter, true);
    const rows = await UserModel.findMergeLogs(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchLocations(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || 0;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const parent_code = req.query.parent_code;

  try {
    const filter = { offset, limit, sort, parent_code, keyword };
    const rows = await UserModel.findAllLocations(filter, false);
    const data = { rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addLocation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["location_name", "parent_code", "position"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await UserModel.findLocationByName(params.location_name, params.parent_code);
    if (exist) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const row = await UserModel.addLocation(params, admin.manager_pk);
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

async function editLocation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["location_pk", "location_name", "parent_code", "position"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await UserModel.findLocationByName(params.location_name, params.parent_code);
    if (exist && exist.location_pk !== params.location_pk) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const count = await UserModel.editLocation(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteLocationByPk(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { location_pk } = req.body;
  try {
    const exist = await UserModel.findLocationByPk(location_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await UserModel.deleteLocationByPk(location_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchUserFixedLogs(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "created_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const func_type = req.query.func_type;
  const status = req.query.status;

  try {
    const filter = { offset, limit, sort, keyword, func_type, status };
    const total = await UserModel.findUserFixedLogs(filter, true);
    const rows = await UserModel.findUserFixedLogs(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function forwardUserFixedLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["table_pk"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await UserModel.findUserFixedLogByPk(params.table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    const userInfo = await UserModel.findUserByPk(exist.user_pk);
    if (!userInfo) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    if (exist.func_type === USER_FIXED_FUNC_TYPES.APPSTORE) {
      const resp = await AppstoreApi.mergeUserId(exist.user_id, userInfo.password, userInfo.user_name, formatDateForClient(userInfo.birthday), "", "", exist.fixed_id);
      if (resp.code !== RESP_CODES.SUCCESS.code) {
        return res.status(resp.code).json(resp);
      }
      const softLogParams = {
        status: SOFT_POINT_STATUS.PLUS,
        reason: getLangText("POINT_REASON_MERGE_FIXED_ID"),
        soft_points: +resp.data.appstore_point,
        related_pk: SOFT_POINT_PREDEFINED_RELATED_PKS.FIXED_APPSTORE,
        action_at: "",
      };
      const resp1 = await processAppstorePointLogByUserPk(exist.user_pk, softLogParams);
      if (resp1.code !== RESP_CODES.SUCCESS.code) {
        return res.status(resp1.code).json(resp);
      }
    } else if (exist.func_type === USER_FIXED_FUNC_TYPES.EPROD_SOFT) {
      const resp = await WebApi.fetchEprodSoftPointBalance(exist.fixed_id);
      if (resp.code !== RESP_CODES.SUCCESS.code) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_FETCH_MEDIA_KARA_POINTS") });
      }
      if (resp.data && (+resp.data.k_price > 0 || +resp.data.k_score > 0)) {
        const karaokeLogparams = {
          status: SOFT_POINT_STATUS.PLUS,
          reason: getLangText("POINT_REASON_MERGE_FIXED_ID"),
          pay_points: +resp.data.k_price,
          soft_points: +resp.data.k_score,
          related_pk: SOFT_POINT_PREDEFINED_RELATED_PKS.KARAOKE,
          action_at: "",
        };
        await processKaraokePointLogByUserPk(exist.user_pk, karaokeLogparams);
      }
      if (resp.data && (+resp.data.m_price > 0 || +resp.data.m_score > 0)) {
        const bmediaLogparams = {
          status: SOFT_POINT_STATUS.PLUS,
          reason: getLangText("POINT_REASON_MERGE_FIXED_ID"),
          pay_points: +resp.data.m_price,
          soft_points: +resp.data.m_score,
          related_pk: SOFT_POINT_PREDEFINED_RELATED_PKS.BMEDIA,
          action_at: "",
        };
        await processBMediaPointLogByUserPk(exist.user_pk, bmediaLogparams);
      }
    } else if (exist.func_type === USER_FIXED_FUNC_TYPES.EPROD_REGISTER) {
      const resp = await WebApi.notifyMergeUserId(exist.user_id, exist.fixed_id);
      if (resp.code !== RESP_CODES.SUCCESS.code) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_FETCH_REGISTER_POINT") });
      }
      const minusRows = await PointModel.findOldRegScoreMinusLogByCustomerId(exist.fixed_id);
      if (minusRows.length > 0) {
        const minusParams = {
          user_pk: exist.user_pk,
          point_type: REG_POINT_TYPES.MANAGER,
          status: REG_POINT_STATUS.MINUS,
        };
        const row = await PointModel.addRegisterMinusLogs(minusParams, minusRows);
        if (!row) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_APPLY_REG_MINUS_POINT") });
        }
      }
    } else {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: `${getLangText("PARAMETER_REQUIRED")} (func_type)` });
    }

    const count = await UserModel.editUserFixedLog({ table_pk: params.table_pk, status: USER_FIXED_STATUS.SUCCESS });
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchUserRegisterLogs(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "created_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const app_type = req.query.app_type;
  const status = req.query.status;

  try {
    const filter = { offset, limit, sort, keyword, app_type, status };
    const total = await UserModel.findUserRegisterLogs(filter, true);
    const rows = await UserModel.findUserRegisterLogs(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function forwardUserRegisterLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["table_pk"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await UserModel.findUserRegisterLogByPk(params.table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    const userInfo = await UserModel.findUserByPkForApp(exist.user_pk);
    if (!userInfo) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    const gender = userInfo.gender === "F" ? 2 : 1;
    let resp;
    if (exist.app_type === USER_REG_APP_TYPE.ESHOP) {
      resp = await EshopApi.registerUserId({
        user_id: userInfo.user_id,
        password: userInfo.password,
        user_name: userInfo.user_name ? userInfo.user_name : "",
        birthday: userInfo.birthday ? userInfo.birthday : "",
        gender,
      });
    } else if (exist.app_type === USER_REG_APP_TYPE.APPSTORE) {
      resp = await AppstoreApi.registerUserId({
        user_id: userInfo.user_id,
        password: userInfo.password,
        user_name: userInfo.user_name ? userInfo.user_name : "",
        birthday: userInfo.birthday ? userInfo.birthday : "",
        gender,
      });
    } else if (exist.app_type === USER_REG_APP_TYPE.MASS) {
      if (exist.iccid) {
        resp = await MassApi.registerUserId({
          user_id: userInfo.user_id,
          password: userInfo.password,
          user_name: userInfo.user_name ? userInfo.user_name : "",
          birthday: userInfo.birthday ? userInfo.birthday : "",
          gender,
          cid: userInfo.cid ? userInfo.cid : "",
          iccid: exist.iccid,
        });
      } else {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_ERR_REGISTER_MASS_SIM") });
      }
    } else {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: `${getLangText("PARAMETER_REQUIRED")} (app_type)` });
    }

    if (resp.code === RESP_CODES.SUCCESS.code) {
      const updateParams = {
        table_pk: params.table_pk,
        status: USER_REG_STATUS.SUCCESS,
      };
      await UserModel.editUserRegisterLog(updateParams);
    } else if (resp.code === RESP_CODES.CONFLICT.code) {
      const updateParams = {
        table_pk: params.table_pk,
        status: USER_REG_STATUS.IGNORE,
      };
      await UserModel.editUserRegisterLog(updateParams);
      return res.status(resp.code).json(resp);
    } else {
      return res.status(resp.code).json(resp);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchUserLoginLogs(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "action_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, sort, keyword };
    const total = await UserModel.findUserLoginLogs(filter, true);
    const rows = await UserModel.findUserLoginLogs(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchUserBlockLogs(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "action_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, sort, keyword };
    const total = await UserModel.findUserBlockLogs(filter, true);
    const rows = await UserModel.findUserBlockLogs(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchUserStatsByUser(req, res) {
  const category = req.query.category || "";
  let parent_location_code = req.query.parent_location_code || "";
  if (parent_location_code.length === 1) {
    parent_location_code = "0" + parent_location_code;
  }

  const filter = { category, parent_location_code };
  try {
    const rows = await UserModel.findUserStatisticsByUser(filter);
    const data = { rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchUserStatsByRegister(req, res) {
  const gender = req.query.gender || "";
  const age = req.query.age ? +req.query.age : -1;
  const job = req.query.job && +req.query.job !== 0 ? +req.query.job : -1;
  let parent_location_code = req.query.parent_location_code || "";
  if (parent_location_code.length === 1) {
    parent_location_code = "0" + parent_location_code;
  }
  const date_format = req.query.date_format || "YYYY-MM";
  const from = req.query.from || "";
  const to = req.query.to || "";

  const filter = { gender, age, parent_location_code, job, date_format, from, to };
  try {
    const rows = await UserModel.findUserStatisticsByRegister(filter);
    const data = { rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchUserStatsByLogin(req, res) {
  const gender = req.query.gender || "";
  const age = req.query.age ? +req.query.age : -1;
  const job = req.query.job && +req.query.job !== 0 ? +req.query.job : -1;
  let parent_location_code = req.query.parent_location_code || "";
  if (parent_location_code.length === 1) {
    parent_location_code = "0" + parent_location_code;
  }
  const date_format = req.query.date_format || "YYYY-MM";
  const from = req.query.from || "";
  const to = req.query.to || "";

  const filter = { gender, age, parent_location_code, job, date_format, from, to };
  try {
    const rows = await UserModel.findUserStatisticsByLogin(filter);
    const data = { rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchUserStatsByPhone(req, res) {
  const company = req.query.company || "";
  const gender = req.query.gender || "";
  const phone_name = req.query.phone_name || "";
  const age = req.query.age ? +req.query.age : -1;
  const job = req.query.job && +req.query.job !== 0 ? +req.query.job : -1;
  const stat_type = req.query.stat_type || "";
  let parent_location_code = req.query.parent_location_code || "";
  if (parent_location_code.length === 1) {
    parent_location_code = "0" + parent_location_code;
  }
  const filter = { company, phone_name, gender, age, parent_location_code, job, stat_type };
  try {
    const rows = await UserModel.findUserStatisticsByPhone(filter);
    const data = { rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchUserStatsOnDashboard(req, res) {
  try {
    const today = moment().format("YYYY-MM-DD");
    const yesterday = moment().subtract(1, 'days').format("YYYY-MM-DD");
    const registers = await UserModel.findUserRegisterCountByTime(today, yesterday);
    const logins = await UserModel.findUserLoginCountByTime(today, yesterday);

    const today_signup = registers.find(item => item.field === today);
    const today_register = today_signup ? today_signup.count : 0;
    const yesterday_signup = registers.find(item => item.field === yesterday);
    const yesterday_register = yesterday_signup ? yesterday_signup.count : 0;
    const today_signin = logins.find(item => item.field === today);
    const today_login_user = today_signin ? today_signin.count : 0;
    const yesterday_signin = logins.find(item => item.field === yesterday);
    const yesterday_login_user = yesterday_signin ? yesterday_signin.count : 0;

    const feedback_new = await MessageModel.findFeedbackThreadCountByTime(today);
    const feedback_resolved = await MessageModel.findFeedbackThreadCountByStatus(THREAD_STATUS.RESOLVED, today);
    const feedback_finished = await MessageModel.findFeedbackThreadCountByStatus(THREAD_STATUS.FINISHED, today);

    const data = {
      register_today: today_register,
      register_diff: today_register - yesterday_register,
      login_today: today_login_user,
      login_diff: today_login_user - yesterday_login_user,
      feedback_new,
      feedback_resolved,
      feedback_finished,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchWhiteUsers(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const keyword = req.query.keyword;
  const sort = { key: req.query.sortKey || "updated_at", dir: req.query.sortDir || "desc" };

  try {
    const filter = { offset, limit, sort, keyword };
    const total = await UserModel.findWhiteUsers(filter, true);
    const rows = await UserModel.findWhiteUsers(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addWhiteUser(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["user_name", "cid"];
  let params = extractValidParams(req.body, validKeys);
  try {
    const exist = await UserModel.findWhiteUserByCid(params.cid);
    if (exist) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const row = await UserModel.addWhiteUser(params);
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

async function editWhiteUser(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["table_pk", "user_name", "cid"];
  let params = extractValidParams(req.body, validKeys);
  try {
    const exist = await UserModel.findWhiteUserByCid(params.cid);
    if (exist && exist.table_pk !== params.table_pk) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const count = await UserModel.editWhiteUser(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteWhiteUser(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["table_pk"];
  let params = extractValidParams(req.body, validKeys);
  try {
    const exist = await UserModel.findWhiteUserByPk(params.table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await UserModel.deleteWhiteUser(params.table_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchUserCidLockList(req, res) {
  const user_pk = req.query.user_pk || 0;
  try {
    const rows = await UserModel.findUserCidLockList(user_pk);
    const data = { rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addUserCidLock(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["user_pk", "cid"];
  const params = extractValidParams(req.body, validKeys);
  try {
    if (!params.cid || params.cid.length !== CID_LENGTH) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("USER_ERR_CID_FORMAT") });
    }

    const exist = await UserModel.findUserCidLockByFilter(params);
    if (exist) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const row = await UserModel.addUserCidLock(params);
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

async function deleteUserCidLock(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { table_pk } = req.body;
  try {
    const params = {
      table_pk,
    };
    const exist = await UserModel.findUserCidLockByFilter(params);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await UserModel.deleteUserCidLock(table_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchUserInfoByDevice(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const validKeys = ["phone_imei"];
    const params = extractValidParams(req.body, validKeys);

    const row = await DeviceModel.findLastDeviceByImei(params.phone_imei);
    const data = { row };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchTesters,
  addTester,
  editTester,
  deleteTesterByPk,
  fetchUsers,
  addUser,
  editUser,
  deleteUserByPk,
  resetPassword,
  exportUsers,
  addPhone,
  deletePhoneByPk,
  fetchUserEditLogs,
  fetchUserPasswordLogs,
  forwardUserPasswordLog,
  mergeUserId,
  splitUserId,
  fetchMergeLogs,
  fetchLocations,
  addLocation,
  editLocation,
  deleteLocationByPk,
  fetchUserFixedLogs,
  forwardUserFixedLog,
  fetchUserRegisterLogs,
  forwardUserRegisterLog,
  fetchUserLoginLogs,
  fetchUserBlockLogs,
  fetchUserStatsByUser,
  fetchUserStatsByRegister,
  fetchUserStatsByLogin,
  fetchUserStatsByPhone,
  fetchUserStatsOnDashboard,
  fetchWhiteUsers,
  addWhiteUser,
  editWhiteUser,
  deleteWhiteUser,
  fetchUserCidLockList,
  addUserCidLock,
  deleteUserCidLock,
  fetchUserInfoByDevice,
};
