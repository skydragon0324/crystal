const moment = require('moment');
const { validationResult } = require('express-validator');
const ReserveModel = require('../../models/reserveModel');
const AgencyModel = require('../../models/agencyModel');
const ProductModel = require('../../models/productModel');
const UserModel = require('../../models/userModel');
const PhoneAPI = require('../../api/phoneApi');
const EshopAPI = require('../../api/eshopApi');
const { createResponse } = require('../../utils/response');
const { extractValidParams, formatTimeForClient, formatReserveNo, getReserveSourceName, formatDateForMessage } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { FLAG_EXIST, FLAG_DELETED, RESERVE_TYPES, RESERVE_STATUS, FLAG_ACTIVE, RESERVE_SOURCES, PHONE_SALE_AGENCY_MARS, FLAG_LOTTERY } = require('../../constants/constants');

async function fetchReserveInfo(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const prefix_min_at = req.query.prefix_min_at || "";
    const prefix_max_at = req.query.prefix_max_at || "";
    const prefix_sort = { key: "updated_at", dir: req.query.sortDir || "desc" };
    let prefix_filter = { offset: 0, limit: 0, sort: prefix_sort, min_at: prefix_min_at, max_at: prefix_max_at, is_client: 1 };
    if (prefix_min_at === "" && prefix_max_at === "") {
      prefix_filter = { ...prefix_filter, is_deleted: FLAG_EXIST, is_now: 1 };
    }
    const reserve_prefix_rows = await ReserveModel.findReservePrefixes(prefix_filter, false);

    const agency_sort = { key: "position", dir: "asc" };
    const agency_min_at = req.query.agency_min_at || "";
    const agency_max_at = req.query.agency_max_at || "";
    let agency_filter = { offset: 0, limit: 0, sort: agency_sort, min_at: agency_min_at, max_at: agency_max_at, is_client: 1 };
    if (agency_min_at === "" && agency_max_at === "") {
      agency_filter = { ...agency_filter, status: FLAG_ACTIVE };
    }
    const agency_rows = await AgencyModel.findPhoneSaleAgencies(agency_filter, false);

    const reserve_user_min_at = req.query.reserve_user_min_at || "";
    const reserve_user_max_at = req.query.reserve_user_max_at || "";
    const reserve_user_sort = { key: "updated_at", dir: req.query.sortDir || "desc" };
    let reserve_user_filter = { offset: 0, limit: 0, sort: reserve_user_sort, user_pk: user.user_pk, min_at: reserve_user_min_at, max_at: reserve_user_max_at, is_client: 1 };
    if (reserve_user_min_at === "" && reserve_user_max_at === "") {
      reserve_user_filter = { ...reserve_user_filter, is_deleted: FLAG_EXIST, is_now: 1 };
    }
    const reserve_user_rows = await ReserveModel.findReserveUsers(reserve_user_filter, false);

    const reserve_log_sort = { key: "reserve_no", dir: req.query.sortDir || "asc" };
    const reserve_log_filter = { offset: 0, limit: 0, sort: reserve_log_sort, user_pk: user.user_pk, is_now: 1, is_client: 1, agency_id: 0 };
    let reserve_log_rows = await ReserveModel.findReserveLogs(reserve_log_filter, false);
    reserve_log_rows = reserve_log_rows.map(row => ({
      ...row,
      reserve_no: `${row.prefix_str}-${formatReserveNo(row.reserve_no)}${row.suffix_str || ""}`,
    }));

    const today = moment().format("YYYY-MM-DD");

    const data = {
      reserve_prefix_rows,
      agency_rows,
      reserve_user_rows,
      reserve_log_rows,
      today,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchReserveLogCount(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const prefix_pk = +req.query.prefix_pk || 0;
    let prefix_pks = req.query.prefix_pks || "";

    if (prefix_pk === 0 && !prefix_pks) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")} (prefix_pks)` });
    }
    if (!prefix_pks) {
      prefix_pks = "" + prefix_pk;
    }

    const pks = prefix_pks.split(",").map(item => item.trim()).filter(item => !!item).map(item => +item);
    if (pks.length === 0) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")} (prefix_pks)` });
    }

    const prefixes = await ReserveModel.findReservePrefixInPks(pks);
    if (!prefixes || prefixes.length !== pks.length) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("BOOK_PREFIX_NOT_FOUND") });
    }

    let normal_counts = [];
    let reward_counts = [];
    for (const pk of pks) {
      const normalCnt = await ReserveModel.findReserveLogCountByPrefix(pk, RESERVE_TYPES.NORMAL);
      normal_counts = [...normal_counts, normalCnt];
      const rewardCnt = await ReserveModel.findReserveLogCountByPrefix(pk, RESERVE_TYPES.REWARD);
      reward_counts = [...reward_counts, rewardCnt];
    }

    const data = {
      normal_counts: normal_counts.join(","),
      reward_counts: reward_counts.join(","),
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function submitReserveInfo(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["prefix_pk", "reserve_name", "id_card", "phone_number", "agency_id"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const userFilter = {
      prefix_pk: params.prefix_pk,
      user_pk: user.user_pk,
    };
    const reserveUser = await ReserveModel.findReserveUserByFilter(userFilter);
    if (!reserveUser || reserveUser.is_deleted === FLAG_DELETED || reserveUser.reserve_cnt < 1) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("BOOK_NO_CANDIDATE") });
    }

    const today = moment().format("YYYY-MM-DD");
    const prefix = await ReserveModel.findReservePrefixByPk(params.prefix_pk);
    if (!prefix) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("BOOK_NO_PREFIX") });
    } else if (today < prefix.start_date || today > prefix.end_date) {
      return res.status(RESP_CODES.FORBIDDEN.code).json({ code: RESP_CODES.FORBIDDEN.code, message: getLangText("BOOK_NO_PERIOD") });
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
      reserve_no: maxNo,
      reserve_type: reserveUser.reserve_type,
      agency_id: params.agency_id,
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
        other: user.user_id,
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

    const data = {
      row: {
        ...logRow,
        reserve_no: `${prefix.prefix_str}-${formatReserveNo(logRow.reserve_no)}${prefix.suffix_str || ""}`,
        created_at: formatTimeForClient(logRow.created_at),
        updated_at: formatTimeForClient(logRow.updated_at),
      },
      log_count: prefixLogCount + 1,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function checkIdCardDuplication(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["prefix_pk", "id_card"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const prefix = await ReserveModel.findReservePrefixByPk(params.prefix_pk);
    if (!prefix) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("BOOK_NO_PREFIX") });
    }

    const dup = await PhoneAPI.checkIdCardDuplication(prefix.product_name, params.id_card);
    if (dup.code === RESP_CODES.CONFLICT.code) {
      return res.status(dup.code).json({ ...dup, message: getLangText("BOOK_ERR_CONFLICT_ID_CARD", [params.id_card, prefix.product_name]) });
    } else if (dup.code === RESP_CODES.BAD_REQUEST.code) {
      return res.status(dup.code).json(dup);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function checkReservePhoneLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["phone_imei"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const smsRow = await ReserveModel.findReserveSmsLogByImei(params.phone_imei);
    if (smsRow) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("BOOK_ERR_EXIST_IMEI", [formatDateForMessage(smsRow.created_at), smsRow.reserve_name, smsRow.phone_number]) });
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchReserveInfo,
  fetchReserveLogCount,
  submitReserveInfo,
  checkIdCardDuplication,
  checkReservePhoneLog,
};
