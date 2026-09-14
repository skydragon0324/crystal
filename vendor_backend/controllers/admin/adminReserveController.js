const moment = require('moment');
const { validationResult } = require('express-validator');
const ReserveModel = require('../../models/reserveModel');
const UserModel = require('../../models/userModel');
const CustomerModel = require('../../models/customerModel');
const AgencyModel = require('../../models/agencyModel');
const ProductModel = require('../../models/productModel');
const PhoneAPI = require('../../api/phoneApi');
const EshopAPI = require('../../api/eshopApi');
const { minusActivityPointLog, minusRegisterPointLog, minusSoftPointLog } = require('./adminPointController');
const { createResponse } = require('../../utils/response');
const { extractValidParams, formatReserveNo, getReserveSourceName } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { FLAG_DELETED, RESERVE_TYPES, RESERVE_STATUS, DEFAULT_PAGE_SIZE, RESERVE_SOURCES, FLAG_LOTTERY, RESERVE_SMS_STATUS, PHONE_BOOK_STATUS, PHONE_SALE_AGENCY_MARS } = require('../../constants/constants');

async function fetchReservePrefixes(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "created_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const reserve_source = req.query.reserve_source ? +req.query.reserve_source : -1;

  try {
    const filter = { offset, limit, sort, keyword, reserve_source };
    const total = await ReserveModel.findReservePrefixes(filter, true);
    const rows = await ReserveModel.findReservePrefixes(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchReserveSimplePrefixes(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const reserve_source = req.query.reserve_source || "";
  const is_minus = req.query.is_minus || "";

  try {
    const filter = { reserve_source, is_minus };
    const rows = await ReserveModel.findReserveSimplePrefixes(offset, limit, filter);
    const data = { rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addReservePrefix(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["prefix_str", "suffix_str", "start_no", "end_no", "reserve_source", "product_name", "description", "publish_num", "normal_cnt", "reward_cnt", "start_date", "end_date", "disp_date", "note", "summary", "is_minus", "is_private", "phone_pk", "mars_str"];
  let params = extractValidParams(req.body, validKeys);
  params = { ...params, start_date: moment(params.start_date).toDate(), end_date: moment(params.end_date).toDate(), disp_date: moment(params.disp_date).toDate() };

  try {
    const row = await ReserveModel.addReservePrefix(params, admin.manager_pk);
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

async function editReservePrefix(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["prefix_pk", "prefix_str", "suffix_str", "start_no", "end_no", "reserve_source", "product_name", "description", "publish_num", "normal_cnt", "reward_cnt", "start_date", "end_date", "disp_date", "note", "summary", "is_minus", "is_private", "agency_ids", "phone_pk", "mars_str"];
  let params = extractValidParams(req.body, validKeys);
  if (params.start_date) {
    params = { ...params, start_date: moment(params.start_date).toDate() };
  }
  if (params.end_date) {
    params = { ...params, end_date: moment(params.end_date).toDate() };
  }
  if (params.disp_date) {
    params = { ...params, disp_date: moment(params.disp_date).toDate() };
  }
  try {
    const exist = await ReserveModel.findReservePrefixByPk(params.prefix_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await ReserveModel.editReservePrefix(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteReservePrefix(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const { prefix_pk, is_deleted } = req.body;
  try {
    const exist = await ReserveModel.findReservePrefixByPk(prefix_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { prefix_pk, is_deleted };
    const count = await ReserveModel.editReservePrefix(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function minusReservePrefix(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["customers", "prefix_pk", "points"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const prefixRow = await ReserveModel.findReservePrefixByPk(params.prefix_pk);
    if (!prefixRow) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }
    if (prefixRow.is_minus === FLAG_LOTTERY) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("BOOK_NO_MINUS_FOR_LOTTERY") });
    }

    let resp;
    if (prefixRow.reserve_source === RESERVE_SOURCES.ACTIVITY) {
      resp = await minusActivityPointLog(params.customers, prefixRow, params.points, admin.manager_pk);
    } else if (prefixRow.reserve_source === RESERVE_SOURCES.EPROD_REG) {
      resp = await minusRegisterPointLog(params.customers, prefixRow, params.points);
    } else if (prefixRow.reserve_source === RESERVE_SOURCES.SOFTWARE) {
      resp = await minusSoftPointLog(params.customers, prefixRow, params.points);
    } else {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("BOOK_INVALID_RESERVE_SOURCE") });
    }

    return res.status(resp.code).json(resp);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function smsReservePrefix(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["prefix_pk", "imeis"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const prefixRow = await ReserveModel.findReservePrefixByPk(params.prefix_pk);
    if (!prefixRow) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }
    if (prefixRow.reserve_source !== RESERVE_SOURCES.PHONE_REG) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("BOOK_INVALID_RESERVE_SOURCE") });
    }

    const imeis = params.imeis.split(",").map(item => item.trim()).filter(item => !!item);
    const smsRows = await ReserveModel.findReserveSmsLogInImeis(imeis);
    const finishRows = smsRows.filter(item => [RESERVE_SMS_STATUS.RESERVED, RESERVE_SMS_STATUS.SALE_FINISH].includes(item.status));
    if (finishRows.length > 0) {
      const finishImeis = finishRows.map(row => row.phone_imei);
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: `${getLangText("BOOK_IMEI_ALREADY_EXIST")} (${finishImeis.join(", ")})` });
    }

    const reserve_logs = await ReserveModel.findReserveLogsByPrefixPk(params.prefix_pk);
    if (!reserve_logs || reserve_logs.length === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("BOOK_NO_RESERVED_USERS") });
    }

    const user_pks = reserve_logs.map(item => item.user_pk);
    const max_at = reserve_logs.map(item => item.created_at).reduce((a, b) => a > b ? a : b);
    let phone_logs = await ProductModel.findRegisterPhoneLogsInUserPksAndImeis(user_pks, imeis, max_at);

    for (const reserve_row of reserve_logs) {
      const phone_row = phone_logs.find(item => item.user_pk === reserve_row.user_pk);
      if (!phone_row) {
        continue;
      }
      const sms_row = smsRows.find(item => item.phone_imei === phone_row.phone_imei);
      if (!sms_row) {
        const addParams = {
          product_pk: phone_row.product_pk,
          phone_imei: phone_row.phone_imei,
          reserve_name: reserve_row.reserve_name,
          id_card: reserve_row.id_card,
          phone_number: reserve_row.phone_number,
          agency_id: reserve_row.agency_id,
          product_name: reserve_row.product_name,
          status: RESERVE_SMS_STATUS.RESERVED,
          reserve_code: `${reserve_row.prefix_str}-${formatReserveNo(reserve_row.reserve_no)}${reserve_row.suffix_str || ""}`,
          user_pk: reserve_row.user_pk,
        };
        const row = await ReserveModel.addReserveSmsLog(addParams);
        if (row) {
          phone_logs = phone_logs.filter(item => item.phone_imei !== phone_row.phone_imei);
        }
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchReserveUsers(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "created_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const prefix_pk = req.query.prefix_pk || "";

  const filter = { offset, limit, sort, keyword, prefix_pk };
  try {
    const total = await ReserveModel.findReserveUsers(filter, true);
    const rows = await ReserveModel.findReserveUsers(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addReserveUsers(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["prefix_pk", "reserve_cnt", "reserve_type"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const users = req.body.users;
    const user_ids = users.split(",").map(item => item.trim()).filter(item => !!item);
    const valid_users = await UserModel.findValidUsersByIds(user_ids);
    if (!valid_users || valid_users.length === 0) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_NOT_FOUND_ALL") });
    }

    const valid_ids = valid_users.map(item => item.user_id);
    const diff_ids = user_ids.filter(item => !valid_ids.includes(item));
    if (diff_ids.length > 0) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: `${getLangText("USER_NOT_FOUND_SOME")} (${diff_ids.join(", ")})` });
    }

    const valid_pks = valid_users.map(item => item.user_pk);
    const dup_users = await ReserveModel.findReserveUsersInUserPks(params.prefix_pk, valid_pks);
    if (dup_users.length > 0) {
      const dup_ids = dup_users.map(item => item.user_id);
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: `${getLangText("BOOK_CANDIDATE_ALREADY_EXIST")} (${dup_ids.join(", ")})` });
    }

    const row = await ReserveModel.addReserveUsers(params, valid_pks, admin.manager_pk);
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

async function editReserveUser(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["table_pk", "prefix_pk", "reserve_cnt", "reserve_type"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await ReserveModel.findReserveUserByPk(params.table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await ReserveModel.editReserveUser(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteReserveUser(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const { table_pk, is_deleted } = req.body;
  try {
    const exist = await ReserveModel.findReserveUserByPk(table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { table_pk, is_deleted };
    const count = await ReserveModel.editReserveUser(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchReserveLogs(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "created_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const prefix_pk = req.query.prefix_pk || "";
  const reserve_type = +req.query.reserve_type;
  const agency_id = req.query.agency_id || 0;
  const status = req.query.status;

  try {
    const filter = { offset, limit, sort, keyword, prefix_pk, reserve_type, agency_id, status };
    const total = await ReserveModel.findReserveLogs(filter, true);
    const rows = await ReserveModel.findReserveLogs(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addReserveLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["prefix_pk", "user_id", "reserve_name", "id_card", "phone_number", "agency_id"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const user = await UserModel.findUserById(params.user_id);
    if (!user) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: `${getLangText("NOT_FOUND_ITEM")} (${params.user_id})` });
    }

    const userFilter = {
      prefix_pk: params.prefix_pk,
      user_pk: user.user_pk,
    };
    const reserveUser = await ReserveModel.findReserveUserByFilter(userFilter);
    if (!reserveUser || reserveUser.is_deleted === FLAG_DELETED || reserveUser.reserve_cnt < 1) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("BOOK_NO_CANDIDATE") });
    }

    const prefix = await ReserveModel.findReservePrefixByPk(params.prefix_pk);
    if (!prefix) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("BOOK_NO_PREFIX") });
    }

    const prefixLogCount = await ReserveModel.findReserveLogCountByPrefix(params.prefix_pk, reserveUser.reserve_type);
    const limit_cnt = reserveUser.reserve_type === RESERVE_TYPES.REWARD ? prefix.reward_cnt : prefix.normal_cnt;
    if (prefixLogCount >= limit_cnt) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("BOOK_ALREADY_RESERVED") });
    }

    const reserveFilter = {
      prefix_pk: params.prefix_pk,
      user_pk: user.user_pk,
    };
    const userLogCount = await ReserveModel.findReserveLogCountByFilter(reserveFilter);
    if (userLogCount >= reserveUser.reserve_cnt) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("BOOK_ERR_LIMIT_COUNT") });
    }

    const logFilter = {
      prefix_pk: params.prefix_pk,
      user_pk: user.user_pk,
      id_card: params.id_card,
    };
    const dbDup = await ReserveModel.findReserveLogByFilter(logFilter);
    if (dbDup) {
      if (dbDup.status === RESERVE_STATUS.PENDING) {
        return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("BOOK_ERR_PHONE_SERVER") });
      } else {
        return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("BOOK_ALREADY_RESERVED") });
      }
    }

    const dup = await PhoneAPI.checkIdCardDuplication(prefix.product_name, params.id_card);
    if (dup.code === RESP_CODES.CONFLICT.code) {
      return res.status(dup.code).json({ ...dup, message: getLangText("BOOK_ERR_CONFLICT_ID_CARD", [params.id_card, prefix.product_name]) });
    } else if (dup.code === RESP_CODES.BAD_REQUEST.code) {
      return res.status(dup.code).json(dup);
    }

    const maxNo = await ReserveModel.getMaxReserveNoBetween(params.prefix_pk, prefix.start_no, prefix.end_no);
    const logParams = {
      prefix_pk: params.prefix_pk,
      user_pk: user.user_pk,
      reserve_name: params.reserve_name,
      id_card: params.id_card,
      phone_number: params.phone_number,
      agency_id: params.agency_id,
      reserve_no: maxNo,
      reserve_type: reserveUser.reserve_type,
      status: RESERVE_STATUS.PENDING,
    };
    const logRow = await ReserveModel.addReserveLog(logParams);
    if (!logRow) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    let product = null;
    if (prefix.reserve_source === RESERVE_SOURCES.PHONE_REG) {
      product = await ProductModel.findProductByPk(prefix.phone_pk);
    }

    if (prefix.reserve_source === RESERVE_SOURCES.ESHOP) {
      const mergeIdRow = await UserModel.findMergeIdByFilter({ pvendor_pk: user.user_pk });
      if (!mergeIdRow) {
        await ReserveModel.deleteReserveLog(logRow.table_pk);
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_NOT_MERGED_ESHOP") });
      }

      const agency = await AgencyModel.findPhoneSaleAgencyById(params.agency_id);
      if (!agency) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("BOOK_NO_AGENCY") });
      }

      const marsParams = {
        user_pk: mergeIdRow.eshop_pk,
        prefix: prefix.prefix_str,
        suffix: prefix.suffix_str,
        acc_type: prefix.mars_str,
        acc_no: formatReserveNo(maxNo),
        cert_name: params.reserve_name,
        cert_no: params.id_card,
        phone_number: params.phone_number,
        is_shop_acc: agency.agency_name === PHONE_SALE_AGENCY_MARS ? 1 : 2,
        acc_place: agency.agency_name,
        is_present: prefix.is_minus === FLAG_LOTTERY ? 1 : 0,
      };
      const respMars = await EshopAPI.addPhoneBook(marsParams);
      if (respMars.code !== RESP_CODES.SUCCESS.code) {
        await ReserveModel.deleteReserveLog(logRow.table_pk);
        return res.status(respMars.code).json(respMars);
      }
    } else {
      const phoneParams = {
        id: `${prefix.prefix_str}-${formatReserveNo(maxNo)}${prefix.suffix_str || ""}`,
        model: prefix.product_name,
        name: params.reserve_name,
        id_card: params.id_card,
        phone_number: params.phone_number,
        agent_id: params.agency_id,
        other: params.user_id,
        source: getReserveSourceName(prefix.reserve_source, reserveUser.reserve_type, product ? product.simple_name : ""),
      };
      const phoneResp = await PhoneAPI.createPhoneBook(phoneParams);
      if (phoneResp.code !== RESP_CODES.SUCCESS.code) {
        return res.status(phoneResp.code).json(phoneResp);
      }
    }

    const editParams = {
      table_pk: logRow.table_pk,
      status: RESERVE_STATUS.RESERVED,
    };
    const count = await ReserveModel.editReserveLog(editParams);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const data = { logRow };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function editReserveLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["table_pk", "reserve_name", "id_card", "phone_number", "agency_id"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await ReserveModel.findReserveLogWithUserNameByPk(params.table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    const prefix = await ReserveModel.findReservePrefixByPk(exist.prefix_pk);
    if (!prefix) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    const reserve_code = `${prefix.prefix_str}-${formatReserveNo(exist.reserve_no)}${prefix.suffix_str || ""}`;
    if (prefix.reserve_source === RESERVE_SOURCES.ESHOP) {
      const marsParams = {
        prefix: prefix.prefix_str,
        suffix: prefix.suffix_str,
        acc_no: formatReserveNo(exist.reserve_no),
        cert_name: params.reserve_name,
        cert_no: params.id_card,
        phone_number: params.phone_number,
      };
      await EshopAPI.editPhoneBook(marsParams);
    } else {
      const phoneParams = {
        id: reserve_code,
        model: prefix.product_name,
        name: params.reserve_name,
        id_card: params.id_card,
        phone_number: params.phone_number,
        agent_id: params.agency_id,
        other: exist.user_id,
      }
      let phoneResp;
      if (exist.status === RESERVE_STATUS.RESERVED) {
        phoneResp = await PhoneAPI.editPhoneBook(phoneParams);
      } else {
        phoneResp = await PhoneAPI.createPhoneBook(phoneParams);
      }
      if (phoneResp.code !== RESP_CODES.SUCCESS.code) {
        return res.status(phoneResp.code).json(phoneResp);
      }
    }

    const editParams = {
      table_pk: params.table_pk,
      reserve_name: params.reserve_name,
      id_card: params.id_card,
      phone_number: params.phone_number,
      agency_id: params.agency_id,
      status: RESERVE_STATUS.RESERVED,
    };
    const count = await ReserveModel.editReserveLog(editParams);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    if (prefix.reserve_source === RESERVE_SOURCES.PHONE_REG) {
      const smsFilter = {
        reserve_code,
      };
      const sms_row = await ReserveModel.findReserveSmsLogByFilter(smsFilter);
      if (sms_row) {
        const smsParams = {
          table_pk: sms_row.table_pk,
          reserve_name: params.reserve_name,
          id_card: params.id_card,
          phone_number: params.phone_number,
          agency_id: params.agency_id,
        };
        await ReserveModel.editReserveSmsLog(smsParams);
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteReserveLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { table_pk } = req.body;
  try {
    const exist = await ReserveModel.findReserveLogByPk(table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    } else if ([RESERVE_STATUS.PAID, RESERVE_STATUS.SALED].includes(exist.status)) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.FORBIDDEN.code, message: getLangText("BOOK_ALREADY_PURCHASED") });
    }

    const prefix = await ReserveModel.findReservePrefixByPk(exist.prefix_pk);
    if (!prefix) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    const reserve_code = `${prefix.prefix_str}-${formatReserveNo(exist.reserve_no)}${prefix.suffix_str || ""}`;
    if (prefix.reserve_source === RESERVE_SOURCES.ESHOP && prefix.prefix_pk === 98) { // FIXME: iron@ temp code till 2026/08/15
      if ([RESERVE_STATUS.RESERVED].includes(exist.status)) {
        const phoneParams = {
          id: reserve_code,
        };
        const phoneResp = await PhoneAPI.deletePhoneBook(phoneParams);
        if (phoneResp.code !== RESP_CODES.SUCCESS.code) {
          return res.status(phoneResp.code).json(phoneResp);
        }
        const marsParams = {
          prefix: prefix.prefix_str,
          suffix: prefix.suffix_str,
          acc_no: formatReserveNo(exist.reserve_no),
        };
        const respMars = await EshopAPI.deletePhoneBook(marsParams);
        if (respMars.code !== RESP_CODES.SUCCESS.code) {
          return res.status(respMars.code).json(respMars);
        }
      }
    } else if (prefix.reserve_source === RESERVE_SOURCES.ESHOP) {
      const marsParams = {
        prefix: prefix.prefix_str,
        suffix: prefix.suffix_str,
        acc_no: formatReserveNo(exist.reserve_no),
      };
      const respMars = await EshopAPI.deletePhoneBook(marsParams);
      if (respMars.code !== RESP_CODES.SUCCESS.code) {
        return res.status(respMars.code).json(respMars);
      }
    } else {
      if ([RESERVE_STATUS.RESERVED].includes(exist.status)) {
        const phoneParams = {
          id: reserve_code,
        };
        const phoneResp = await PhoneAPI.deletePhoneBook(phoneParams);
        if (phoneResp.code !== RESP_CODES.SUCCESS.code) {
          return res.status(phoneResp.code).json(phoneResp);
        }
      }
    }

    if (prefix.reserve_source === RESERVE_SOURCES.PHONE_REG) {
      const smsFilter = {
        reserve_code,
      };
      const sms_row = await ReserveModel.findReserveSmsLogByFilter(smsFilter);
      if (sms_row) {
        await ReserveModel.deleteReserveSmsLog(sms_row.table_pk);
      }
    }

    const count = await ReserveModel.deleteReserveLog(table_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchReserveSmsLogs(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "created_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const product_pk = req.query.product_pk || "";
  const product_name = req.query.product_name || "";
  const agency_id = req.query.agency_id || 0;
  const status = req.query.status || "";

  const filter = { offset, limit, sort, keyword, product_pk, product_name, agency_id, status };
  try {
    const total = await ReserveModel.findReserveSmsLogs(filter, true);
    const rows = await ReserveModel.findReserveSmsLogs(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchReserveSmsFilters(req, res) {
  try {
    const usage_products = await ReserveModel.findReserveSmsUsageProducts();
    const reserve_products = await ReserveModel.findReserveSmsReserveProducts();
    const data = {
      usage_products,
      reserve_products,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchOldMobileProducts(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "created_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, sort, keyword };
    const total = await ReserveModel.findOldMobileProducts(filter, true);
    const rows = await ReserveModel.findOldMobileProducts(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchOldReservePrefixes(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: req.query.sortKey || "created_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, sort, keyword };
    const total = await ReserveModel.findOldReservePrefixes(filter, true);
    const rows = await ReserveModel.findOldReservePrefixes(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchOldReserveSimplePrefixes(req, res) {
  try {
    const rows = await ReserveModel.findOldReserveSimplePrefixes();
    const data = { rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addOldReservePrefix(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["prefix", "suffix", "mobile_pk", "description", "normal_cnt", "reward_cnt", "start_at", "end_at"];
  let params = extractValidParams(req.body, validKeys);
  params = { ...params, start_at: moment(params.start_at).toDate(), end_at: moment(params.end_at).toDate() };

  try {
    const dup = await ReserveModel.findOldReservePrefixByFilter({ prefix: params.prefix, suffix: params.suffix });
    if (dup) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const row = await ReserveModel.addOldReservePrefix(params);
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

async function editOldReservePrefix(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["pk", "prefix", "suffix", "mobile_pk", "description", "normal_cnt", "reward_cnt", "start_at", "end_at"];
  let params = extractValidParams(req.body, validKeys);
  params = { ...params, start_at: moment(params.start_at).toDate(), end_at: moment(params.end_at).toDate() };

  try {
    const exist = await ReserveModel.findOldReservePrefixByPk(params.pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const dup = await ReserveModel.findOldReservePrefixByFilter({ prefix: params.prefix, suffix: params.suffix });
    if (dup && dup.pk !== params.pk) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const count = await ReserveModel.editOldReservePrefix(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchOldReserveUsers(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: req.query.sortKey || "", dir: req.query.sortDir || "" };
  const keyword = req.query.keyword || "";
  const prefix = req.query.prefix || "";
  const suffix = req.query.suffix || "";

  try {
    const filter = { offset, limit, sort, keyword, prefix, suffix };
    const total = await ReserveModel.findOldReservations(filter, true);
    const rows = await ReserveModel.findOldReservations(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addOldReservations(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["prefix", "suffix", "reserve_cnt"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const customers = req.body.customers;
    const user_ids = customers.split(",").map(item => item.trim()).filter(item => !!item);
    const valid_users = await CustomerModel.findValidCustomersByIds(user_ids);
    if (!valid_users || valid_users.length === 0) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_NOT_FOUND_ALL") });
    }

    const valid_ids = valid_users.map(item => item.user_userid);
    const diff_ids = user_ids.filter(item => !valid_ids.includes(item));
    if (user_ids.length !== valid_ids.length || diff_ids.length > 0) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: `${getLangText("USER_NOT_FOUND_SOME")} (${diff_ids.join(", ")})` });
    }

    const dup_users = await ReserveModel.findOldReservationsInUserIds(params.prefix, params.suffix, valid_ids);
    if (dup_users.length > 0) {
      const dup_ids = dup_users.map(item => item.user_userid);
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: `${getLangText("BOOK_CANDIDATE_ALREADY_EXIST")} (${dup_ids.join(", ")})` });
    }

    const row = await ReserveModel.addOldReservations(params, valid_ids);
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

async function fetchOldReserveLogs(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: req.query.sortKey || "", dir: req.query.sortDir || "" };
  const keyword = req.query.keyword || "";
  const prefix = req.query.prefix || "";
  const suffix = req.query.suffix || "";

  try {
    const filter = { offset, limit, sort, keyword, prefix, suffix };
    const total = await ReserveModel.findOldReserveLogs(filter, true);
    const rows = await ReserveModel.findOldReserveLogs(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addOldReserveLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["prefix_pk", "user_userid", "name", "citizen_no", "mobile_phone"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const user = await CustomerModel.findCustomerById(params.user_userid);
    if (!user) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: `${getLangText("NOT_FOUND_ITEM")} (${params.user_userid})` });
    }

    const prefixInfo = await ReserveModel.findOldReservePrefixWithProductByPk(params.prefix_pk);
    if (!prefixInfo) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("BOOK_NO_PREFIX") });
    }

    const dup = await PhoneAPI.checkIdCardDuplication(prefixInfo.mobile_name, params.citizen_no);
    if (dup.code === RESP_CODES.CONFLICT.code) {
      return res.status(dup.code).json({ ...dup, message: getLangText("BOOK_ERR_CONFLICT_ID_CARD", [params.citizen_no, prefixInfo.mobile_name]) });
    } else if (dup.code === RESP_CODES.BAD_REQUEST.code) {
      return res.status(dup.code).json(dup);
    }

    const totalFilter = { offset: 0, limit: 0, sort: {}, prefix: prefixInfo.prefix, suffix: prefixInfo.suffix, reserve_type: RESERVE_TYPES.NORMAL };
    const totalCount = await ReserveModel.findOldReserveLogs(totalFilter, true);

    const mineFilter = { offset: 0, limit: 0, sort: {}, prefix: prefixInfo.prefix, suffix: prefixInfo.suffix, reserve_type: RESERVE_TYPES.NORMAL, user_userid: params.user_userid };
    const mineCount = await ReserveModel.findOldReserveLogs(mineFilter, true);

    const reservationFilter = { offset: 0, limit: 0, sort: {}, prefix: prefixInfo.prefix, suffix: prefixInfo.suffix, user_userid: params.user_userid };
    const reservations = await ReserveModel.findOldReservations(reservationFilter, false);
    if (!reservations || reservations.length === 0) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const reservation = reservations[0];
    if (totalCount >= reservation.normal_cnt) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("BOOK_ALREADY_FINISHED") });
    } else if (mineCount >= reservation.reserve_cnt) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("BOOK_ERR_LIMIT_COUNT") });
    }

    const max_no = await ReserveModel.getMaxOldReserveNoByPrefix(prefixInfo.prefix, prefixInfo.suffix);
    const reserve_no = max_no + 1;
    const phoneParams = {
      id: `${prefixInfo.prefix}-${formatReserveNo(reserve_no)}${prefixInfo.suffix || ""}`,
      model: prefixInfo.mobile_name,
      name: params.name,
      id_card: params.citizen_no,
      phone_number: params.mobile_phone,
      other: params.user_userid,
      source: ['4'].includes(prefixInfo.prefix.slice(-1)) ? getLangText("BOOK_SOURCE_FIXED") : getLangText("BOOK_SOURCE_EPROD"),
    };

    const resp = await PhoneAPI.createPhoneBook(phoneParams);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    const logParams = {
      user_userid: params.user_userid,
      prefix: prefixInfo.prefix,
      suffix: prefixInfo.suffix,
      name: params.name,
      citizen_no: params.citizen_no,
      mobile_phone: params.mobile_phone,
      reserve_no,
      reserve_type: RESERVE_TYPES.NORMAL,
    }

    const logRow = await ReserveModel.addOldReserveLog(logParams);
    if (!logRow) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const data = {
      row: logRow,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function editOldReserveLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["pk", "name", "citizen_no", "mobile_phone"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await ReserveModel.findOldReserveLogByPk(params.pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const prefixInfo = await ReserveModel.findOldReservePrefixWithProductByPrefixAndSuffix(exist.prefix, exist.sufix);
    if (!prefixInfo) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("BOOK_PREFIX_NOT_FOUND") });
    }

    if (params.citizen_no && params.citizen_no !== exist.citizen_no) {
      const dup = await PhoneAPI.checkIdCardDuplication(prefixInfo.mobile_name, params.citizen_no);
      if (dup.code === RESP_CODES.CONFLICT.code) {
        return res.status(dup.code).json({ ...dup, message: getLangText("BOOK_ERR_CONFLICT_ID_CARD", [params.citizen_no, prefixInfo.mobile_name]) });
      } else if (dup.code === RESP_CODES.BAD_REQUEST.code) {
        return res.status(dup.code).json(dup);
      }
    }

    const phoneParams = {
      id: `${prefixInfo.prefix}-${formatReserveNo(exist.reserve_no)}${prefixInfo.suffix || ""}`,
      model: prefixInfo.mobile_name,
      name: params.name,
      id_card: params.citizen_no,
      phone_number: params.mobile_phone,
      other: params.user_userid,
      source: ['4'].includes(prefixInfo.prefix.slice(-1)) ? getLangText("BOOK_SOURCE_FIXED") : getLangText("BOOK_SOURCE_EPROD"),
    };
    const resp = await PhoneAPI.editPhoneBook(phoneParams);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    const logParams = {
      pk: params.pk,
      name: params.name,
      citizen_no: params.citizen_no,
      mobile_phone: params.mobile_phone,
    }
    const count = await ReserveModel.editOldReserveLog(logParams);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteOldReserveLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["pk"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await ReserveModel.findOldReserveLogByPk(params.pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const prefixInfo = await ReserveModel.findOldReservePrefixWithProductByPrefixAndSuffix(exist.prefix, exist.suffix);
    if (!prefixInfo) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("BOOK_PREFIX_NOT_FOUND") });
    }

    const phoneParams = {
      id: `${prefixInfo.prefix}-${formatReserveNo(exist.reserve_no)}${prefixInfo.suffix || ""}`,
    };
    const resp = await PhoneAPI.deletePhoneBook(phoneParams);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    const count = await ReserveModel.deleteOldReserveLog(params.pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPhoneBooks(req, res) {
  const page = +req.query.page || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sortBy = req.query.sortKey || "id";
  const sortDir = req.query.sortDir || "desc";
  const keyword = req.query.keyword || "";
  const prefix = req.query.prefix || "";
  const status = req.query.status === undefined ? -1 : +req.query.status;

  try {
    const params = {
      per_page: limit,
      current_page: page + 1,
      last_page: 0,
      total: 0,
      from: 0,
      to: 0,
      status: status === -1 ? null : status,
      prefix,
      keyword,
      sortBy,
      sortDir,
    }
    const resp = await PhoneAPI.searchPhoneBook(params);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    const agency_filter = { offset: 0, limit: 0, sort: {} };
    const agencies = await AgencyModel.findPhoneSaleSimpleAgencies(agency_filter);

    const total = resp.data.pager.total;
    const rows = resp.data.items.map(row => {
      const agency = agencies.find(item => item.agency_id === +row.agent_id);
      return {
        ...row,
        agency_name: agency ? agency.agency_name : "",
      };
    });
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function syncPhoneBook(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { table_pk } = req.body;
  try {
    const exist = await ReserveModel.findReserveLogByPk(table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    } else if (exist.status === RESERVE_STATUS.SALED) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("BOOK_ALREADY_PURCHASED") });
    }

    const prefix = await ReserveModel.findReservePrefixByPk(exist.prefix_pk);
    if (!prefix) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("BOOK_PREFIX_NOT_FOUND") });
    }

    const reserve_no = `${prefix.prefix_str}-${formatReserveNo(exist.reserve_no)}${prefix.suffix_str || ""}`;
    const phoneParams = {
      per_page: DEFAULT_PAGE_SIZE,
      current_page: 1,
      last_page: 0,
      total: 0,
      from: 0,
      to: 0,
      status: null,
      prefix: prefix.prefix_str,
      keyword: reserve_no,
      sortBy: "id",
      sortDir: "desc",
    }
    const resp = await PhoneAPI.searchPhoneBook(phoneParams);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    const book_row = resp.data.items.find(item => item.id === reserve_no);
    if (!book_row) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("BOOK_NO_RESERVE_NO") });
    } else if (![PHONE_BOOK_STATUS.PENDING, PHONE_BOOK_STATUS.ACCEPT, PHONE_BOOK_STATUS.SALED].includes(+book_row.status)) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("BOOK_ERR_CHECK_PHONE_SERVER") });
    }

    const editParams = {
      table_pk,
      status: +book_row.status === PHONE_BOOK_STATUS.PENDING ? RESERVE_STATUS.RESERVED : +book_row.status === PHONE_BOOK_STATUS.ACCEPT ? RESERVE_STATUS.PAID : +book_row.status === PHONE_BOOK_STATUS.SALED ? RESERVE_STATUS.SALED : RESERVE_STATUS.UNKNOWN,
    };
    const count = await ReserveModel.editReserveLog(editParams);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function syncPhoneBooks(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { prefix_pk } = req.body;
  try {
    const prefix = await ReserveModel.findReservePrefixByPk(prefix_pk);
    if (!prefix) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("BOOK_NO_PREFIX") });
    }

    const phoneParams = {
      per_page: 10000,//prefix.normal_cnt + prefix.reward_cnt,
      current_page: 1,
      last_page: 0,
      total: 0,
      from: 0,
      to: 0,
      status: null,
      prefix: prefix.prefix_str,
      keyword: "",
      sortBy: "id",
      sortDir: "desc",
    }
    const resp = await PhoneAPI.searchPhoneBook(phoneParams);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    const reserve_logs = await ReserveModel.findReserveLogsByPrefixPk(prefix_pk);
    if (!reserve_logs || reserve_logs.length === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("BOOK_NO_RESERVE_LOG") });
    }

    let saled_pks = [];
    let paid_pks = [];
    let reserved_pks = [];
    for (const row of reserve_logs) {
      const reserve_no = `${row.prefix_str}-${formatReserveNo(row.reserve_no)}${row.suffix_str || ""}`;
      const item = resp.data.items.find(item => item.id === reserve_no);
      if (item) {
        if (+item.status === PHONE_BOOK_STATUS.PENDING) {
          reserved_pks = [...reserved_pks, row.table_pk];
        } else if (+item.status === PHONE_BOOK_STATUS.ACCEPT) {
          paid_pks = [...paid_pks, row.table_pk];
        } else if (+item.status === PHONE_BOOK_STATUS.SALED) {
          saled_pks = [...saled_pks, row.table_pk];
        }
      }
    }

    if (reserved_pks.length > 0) {
      const cnt = Math.ceil(reserved_pks.length / 1000);
      for (let i = 0; i < cnt; i++) {
        const editParams = {
          status: RESERVE_STATUS.RESERVED,
        };
        await ReserveModel.editReserveLogs(editParams, reserved_pks.slice(i * 1000, (i + 1) * 1000));
      }
    }
    if (paid_pks.length > 0) {
      const cnt = Math.ceil(paid_pks.length / 1000);
      for (let i = 0; i < cnt; i++) {
        const editParams = {
          status: RESERVE_STATUS.PAID,
        };
        await ReserveModel.editReserveLogs(editParams, paid_pks.slice(i * 1000, (i + 1) * 1000));
      }
    }
    if (saled_pks.length > 0) {
      const cnt = Math.ceil(saled_pks.length / 1000);
      for (let i = 0; i < cnt; i++) {
        const editParams = {
          status: RESERVE_STATUS.SALED,
        };
        await ReserveModel.editReserveLogs(editParams, saled_pks.slice(i * 1000, (i + 1) * 1000));
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchReservePrefixes,
  fetchReserveSimplePrefixes,
  addReservePrefix,
  editReservePrefix,
  deleteReservePrefix,
  minusReservePrefix,
  smsReservePrefix,
  fetchReserveUsers,
  addReserveUsers,
  editReserveUser,
  deleteReserveUser,
  fetchReserveLogs,
  addReserveLog,
  editReserveLog,
  deleteReserveLog,
  fetchReserveSmsLogs,
  fetchReserveSmsFilters,
  fetchOldMobileProducts,
  fetchOldReservePrefixes,
  fetchOldReserveSimplePrefixes,
  addOldReservePrefix,
  editOldReservePrefix,
  fetchOldReserveUsers,
  addOldReservations,
  fetchOldReserveLogs,
  addOldReserveLog,
  editOldReserveLog,
  deleteOldReserveLog,
  fetchPhoneBooks,
  syncPhoneBook,
  syncPhoneBooks,
};
