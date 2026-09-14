const moment = require('moment');
const { validationResult } = require('express-validator');
const PointModel = require('../../models/pointModel');
const CustomerModel = require('../../models/customerModel');
const UserModel = require('../../models/userModel');
const ProductModel = require('../../models/productModel');
const ReserveModel = require('../../models/reserveModel');
const ExpModel = require('../../models/experienceModel');
const PremiumModel = require('../../models/premiumModel');
const EshopModel = require('../../models/eshopModel');
const EshopApi = require('../../api/eshopApi');
const WebApi = require('../../api/webApi');
const AppstoreApi = require('../../api/appstoreApi');
const { createResponse } = require('../../utils/response');
const { extractValidParams, formatReserveNo, getAppPointPagesByDepartment } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { ACTIVITY_LIMIT_SOURCES, OLD_PRIZE_FILL_TYPES, REG_POINT_TYPES, POINT_MANAGER_MANUAL, SOFT_POINT_STATUS, FLAG_USER, SOFT_POINT_TYPES, SOFT_POINT_PREDEFINED_RELATED_PKS, APP_POINT_PAGE, DEFAULT_PAGE_SIZE, REG_POINT_STATUS, POINT_TYPE_VALUES, REGISTER_POINT_STATUS, PREMIUM_SERVICE_WOMENSDAY_SERVICE_PK } = require('../../constants/constants');

async function fetchActivityPointTypes(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "type_pk", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, sort, keyword };
    const total = await PointModel.findActivityPointTypes(filter, true);
    const rows = await PointModel.findActivityPointTypes(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addActivityPointType(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["type_pk", "main_type", "sub_type", "note", "points"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await PointModel.findActivityPointTypeByPk(params.type_pk);
    if (exist) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const row = await PointModel.addActivityPointType(params);
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

async function editActivityPointType(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["type_pk", "main_type", "sub_type", "note", "points"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await PointModel.findActivityPointTypeByPk(params.type_pk);
    if (exist && exist.type_pk !== params.type_pk) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const count = await PointModel.editActivityPointType(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const data = { count };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchActivityPointLog(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "action_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const user_pk = req.query.user_pk;
  const point_type_prefix = +req.query.point_type_prefix || 0;

  const filter = { offset, limit, sort, keyword, user_pk, point_type_prefix };
  try {
    const total = await PointModel.findActivityPointLog(filter, true);
    const rows = await PointModel.findActivityPointLog(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchActivityPointBalance(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const appPages = getAppPointPagesByDepartment(admin.department);
  if (!appPages.includes(APP_POINT_PAGE.ACTIVITY)) {
    return res.status(RESP_CODES.FORBIDDEN.code).json(RESP_CODES.FORBIDDEN);
  }

  const user_pk = req.query.user_pk;
  try {
    const pointStats = await PointModel.findActivityPointStatsByUserPk(user_pk);
    const data = {
      total_points: pointStats ? pointStats.total_points : 0,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function recalcActivityPointStats(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["user_pk"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const json = await processRecalcActivityPointStat(params.user_pk);
    return res.status(json.code).json(json);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function processRecalcActivityPointStat(user_pk) {
  const exist = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.ACTIVITY);
  const limit_time = exist ? exist.limit_time : "";

  const total_points = await PointModel.sumActivityPointStatsByUserPk("", user_pk);
  const limit_points = await PointModel.sumActivityPointStatsByUserPk(limit_time, user_pk);
  const minus_points = await PointModel.sumActivityPointBookMinusStatsByUserPk(user_pk);

  const row = await PointModel.findActivityPointStatsByUserPk(user_pk);
  if (row) {
    const editParams = {
      table_pk: row.table_pk,
      total_points,
      limit_points,
      minus_points,
    };
    const count = await PointModel.editActivityPointStats(editParams);
    if (count === 0) {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }
  } else {
    const addParams = {
      user_pk: user_pk,
      total_points,
      limit_points,
      minus_points,
    };
    const ret = await PointModel.addActivityPointStats(addParams);
    if (!ret) {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }
  }
  return RESP_CODES.SUCCESS;
}

async function minusActivityPointLog(customers, prefix_info, points, admin_pk) {
  try {
    const activityLimit = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.ACTIVITY);
    let include_limit = false;
    const today = moment().format("YYYY-MM-DD");
    if (!activityLimit || (activityLimit && today <= activityLimit.limit_time)) {
      include_limit = true;
    }

    const user_ids = customers.split(",").map(item => item.trim()).filter(item => !!item);
    const valid_users = await UserModel.findValidUsersByIds(user_ids);
    if (!valid_users || valid_users.length === 0) {
      return { code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_NOT_FOUND_ALL") };
    }

    const valid_ids = valid_users.map(item => item.user_id);
    const diff_ids = user_ids.filter(item => !valid_ids.includes(item));
    if (diff_ids.length > 0) {
      return { code: RESP_CODES.CONFLICT.code, message: `${getLangText("USER_NOT_FOUND_SOME")} (${diff_ids.join(", ")})` };
    }

    const already_users = await PointModel.findActivityPointLogsByReserveInfo(prefix_info.prefix_pk);
    if (!already_users) {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }
    const already_ids = already_users.map(item => item.user_id);
    const remain_ids = valid_ids.filter(item => !already_ids.includes(item));
    if (remain_ids.length === 0) {
      return { code: RESP_CODES.BAD_REQUEST.code, message: getLangText("POINT_ALREADY_MINUS_APPLIED") };
    }

    const reserve_rows = await ReserveModel.findReserveLogInUserIds(remain_ids, prefix_info.prefix_pk);
    if (reserve_rows.length === 0) {
      return { code: RESP_CODES.NOT_FOUND.code, message: getLangText("BOOK_NO_RESERVED_USERS") };
    }

    for (const row of reserve_rows) {
      const logParams = {
        user_pk: row.user_pk,
        type_pk: POINT_TYPE_VALUES.MANAGER_BOOK_MINUS,
        points: points,
        reason: `${prefix_info.product_name}(${prefix_info.prefix_str}-${formatReserveNo(row.reserve_no)}${prefix_info.suffix_str || ""})`,
        related_pk: prefix_info.prefix_pk,
        ip_address: admin_pk,
      }
      await PointModel.addActivityPointLog(logParams);

      const statsRow = await PointModel.findActivityPointStatsByUserPk(row.user_pk);
      if (statsRow) {
        await PointModel.increaseActivityPointStats(row.user_pk, points, include_limit, true);
      } else {
        const addParams = {
          user_pk: row.user_pk,
          total_points: points,
          limit_points: include_limit ? points : 0,
          minus_points: points,
        };
        await PointModel.addActivityPointStats(addParams);
      }
    }

    return RESP_CODES.SUCCESS;
  } catch (err) {
    console.error(err);
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function fetchActivityPointStats(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "total_points", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const is_limit_rank = +req.query.is_limit_rank || 0;

  try {
    const filter = { offset, limit, sort, keyword, is_limit_rank };
    const total = await PointModel.findActivityPointStats(filter, true);
    const rows = await PointModel.findActivityPointStats(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchActivityLimits(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "activity_source", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, sort, keyword };
    const total = await PointModel.findActivityLimits(filter, true);
    const rows = await PointModel.findActivityLimits(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchActivityLimitBySource(req, res) {
  const activity_source = +req.query.activity_source || 0;
  try {
    const row = await PointModel.findActivityLimitBySource(activity_source);
    const data = { row };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addActivityLimit(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["activity_source", "limit_time", "description", "status", "target_rank", "top_count", "surroundings"];
  let params = extractValidParams(req.body, validKeys);
  params = { ...params, limit_time: moment(params.limit_time).toDate() };
  try {
    const exist = await PointModel.findActivityLimitBySource(params.activity_source);
    if (exist) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("CONFLICT_EXIST_ITEM") });
    }

    const row = await PointModel.addActivityLimit(params);
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

async function editActivityLimit(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["table_pk", "activity_source", "limit_time", "description", "status", "target_rank", "top_count", "surroundings"];
  let params = extractValidParams(req.body, validKeys);
  params = { ...params, limit_time: moment(params.limit_time).toDate() };
  try {
    const exist = await PointModel.findActivityLimitByPk(params.table_pk);
    if (exist && exist.activity_source !== params.activity_source) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const count = await PointModel.editActivityLimit(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const data = { count };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function recalcActivityLimit(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["activity_source", "is_limit_time", "is_minus_point", "offset", "limit"];
  const params = extractValidParams(req.body, validKeys);
  const offset = params.offset ? +params.offset : 0;
  const limit = params.limit ? +params.limit : 0;
  try {
    const exist = await PointModel.findActivityLimitBySource(params.activity_source);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const limit_time = params.is_limit_time ? exist.limit_time : "";
    let count = 0;
    if (params.activity_source === ACTIVITY_LIMIT_SOURCES.ACTIVITY) {
      if (params.is_minus_point === 1) {
        count = await PointModel.recalcActivityMinusStats(offset, limit);
      } else {
        count = await PointModel.recalcActivityPointStats(limit_time, offset, limit);
      }
    } else if (params.activity_source === ACTIVITY_LIMIT_SOURCES.SOFTWARE) {
      await PointModel.recalcAppstorePointStats(limit_time, offset, limit);
      await PointModel.recalcKaraokePointStats(limit_time, offset, limit);
      await PointModel.recalcBMediaPointStats(limit_time, offset, limit);
      await PointModel.recalcSoftPointStats(limit_time, offset, limit);
      count = limit;
    } else {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_RECALC_POINT_BY_SOURCE") })
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchAppstoreWalletBalance(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const appPages = getAppPointPagesByDepartment(admin.department);
  if (!appPages.includes(APP_POINT_PAGE.SOFT)) {
    return res.status(RESP_CODES.FORBIDDEN.code).json(RESP_CODES.FORBIDDEN);
  }

  const user_pk = req.query.user_pk;
  try {
    let prhn_point = 0;
    let foreign_point = 0;
    const merged = await UserModel.findMergeIdByFilter({ pvendor_pk: user_pk });
    if (merged && merged.appstore_pk) {
      const coinResp = await AppstoreApi.getPrhnBalance(merged.appstore_pk);
      if (coinResp.code === RESP_CODES.SUCCESS.code) {
        prhn_point = +coinResp.data.native_score;
        foreign_point = +coinResp.data.foreign_score;
      }
    }

    const appstoreRow = await PointModel.findAppstorePointStatsByUserPk(user_pk);
    const appstorePoints = appstoreRow ? appstoreRow.total_points : 0;

    const karaokeRow = await PointModel.findKaraokePointStatsByUserPk(user_pk);
    const karaokePoints = karaokeRow ? karaokeRow.total_points : 0;

    const bmediaRow = await PointModel.findBMediaPointStatsByUserPk(user_pk);
    const bmediaPoints = bmediaRow ? bmediaRow.total_points : 0;

    const minusRow = await PointModel.findTotalSoftPointByFilter({ user_pk, point_type: SOFT_POINT_TYPES.MANAGER, is_agency: FLAG_USER });
    const minusPoints = minusRow ? minusRow.sum_points : 0;

    const data = {
      prhn_point,
      foreign_point,
      purchase_point: appstorePoints + karaokePoints + bmediaPoints + minusPoints,
      appstore_point: appstorePoints,
      karaoke_point: karaokePoints,
      bmedia_point: bmediaPoints,
      minus_point: minusPoints,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchAppstorePointLog(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "action_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const status = req.query.status ? +req.query.status : -1;
  const is_agency = req.query.is_agency ? +req.query.is_agency : -1;
  const user_pk = req.query.user_pk;

  const filter = { offset, limit, sort, keyword, status, is_agency, user_pk, is_client: user_pk ? 1 : 0 };
  try {
    const total = await PointModel.findAppstorePointLog(filter, true);
    const rows = await PointModel.findAppstorePointLog(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchAppstorePointStats(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "total_points", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const is_limit_rank = +req.query.is_limit_rank || 0;

  try {
    const filter = { offset, limit, sort, keyword, is_limit_rank };
    const total = await PointModel.findAppstorePointStats(filter, true);
    const rows = await PointModel.findAppstorePointStats(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function recalcAppstorePointStats(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["user_pk"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.SOFTWARE);
    const limit_time = exist ? exist.limit_time : "";

    const total_points = await PointModel.sumAppstorePointStatsByUserPk("", params.user_pk);
    const limit_points = await PointModel.sumAppstorePointStatsByUserPk(limit_time, params.user_pk);

    const row = await PointModel.findAppstorePointStatsByUserPk(params.user_pk);
    if (row) {
      const editParams = {
        table_pk: row.table_pk,
        total_points,
        limit_points,
      };
      const count = await PointModel.editAppstorePointStats(editParams);
      if (count === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }
    } else {
      const addParams = {
        user_pk: params.user_pk,
        total_points,
        limit_points,
      };
      const ret = await PointModel.addAppstorePointStats(addParams);
      if (!ret) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchKaraokePointLog(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "action_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const status = req.query.status ? +req.query.status : -1;
  const is_agency = req.query.is_agency ? +req.query.is_agency : -1;
  const user_pk = req.query.user_pk;

  const filter = { offset, limit, sort, keyword, status, is_agency, user_pk, is_client: user_pk ? 1 : 0 };
  try {
    const total = await PointModel.findKaraokePointLog(filter, true);
    const rows = await PointModel.findKaraokePointLog(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchKaraokePointStats(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "total_points", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const is_limit_rank = +req.query.is_limit_rank || 0;

  try {
    const filter = { offset, limit, sort, keyword, is_limit_rank };
    const total = await PointModel.findKaraokePointStats(filter, true);
    const rows = await PointModel.findKaraokePointStats(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function recalcKaraokePointStats(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["user_pk"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.SOFTWARE);
    const limit_time = exist ? exist.limit_time : "";

    const total_points = await PointModel.sumKaraokePointStatsByUserPk("", params.user_pk);
    const limit_points = await PointModel.sumKaraokePointStatsByUserPk(limit_time, params.user_pk);

    const row = await PointModel.findKaraokePointStatsByUserPk(params.user_pk);
    if (row) {
      const editParams = {
        table_pk: row.table_pk,
        total_points,
        limit_points,
      };
      const count = await PointModel.editKaraokePointStats(editParams);
      if (count === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }
    } else {
      const addParams = {
        user_pk: params.user_pk,
        total_points,
        limit_points,
      };
      const ret = await PointModel.addKaraokePointStats(addParams);
      if (!ret) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchBMediaPointLog(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "action_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const status = req.query.status ? +req.query.status : -1;
  const is_agency = req.query.is_agency ? +req.query.is_agency : -1;
  const user_pk = req.query.user_pk;

  try {
    const filter = { offset, limit, sort, keyword, status, is_agency, user_pk, is_client: user_pk ? 1 : 0 };
    const total = await PointModel.findBMediaPointLog(filter, true);
    const rows = await PointModel.findBMediaPointLog(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchBMediaPointStats(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "total_points", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const is_limit_rank = +req.query.is_limit_rank || 0;

  try {
    const filter = { offset, limit, sort, keyword, is_limit_rank };
    const total = await PointModel.findBMediaPointStats(filter, true);
    const rows = await PointModel.findBMediaPointStats(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function recalcBMediaPointStats(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["user_pk"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.SOFTWARE);
    const limit_time = exist ? exist.limit_time : "";

    const total_points = await PointModel.sumBMediaPointStatsByUserPk("", params.user_pk);
    const limit_points = await PointModel.sumBMediaPointStatsByUserPk(limit_time, params.user_pk);

    const row = await PointModel.findBMediaPointStatsByUserPk(params.user_pk);
    if (row) {
      const editParams = {
        table_pk: row.table_pk,
        total_points,
        limit_points,
      };
      const count = await PointModel.editBMediaPointStats(editParams);
      if (count === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }
    } else {
      const addParams = {
        user_pk: params.user_pk,
        total_points,
        limit_points,
      };
      const ret = await PointModel.addBMediaPointStats(addParams);
      if (!ret) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchSoftPointLog(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "action_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const point_type = SOFT_POINT_TYPES.MANAGER;
  const user_pk = req.query.user_pk;

  try {
    const filter = { offset, limit, sort, keyword, point_type, user_pk, is_client: user_pk ? 1 : 0 };
    const total = await PointModel.findSoftPointLog(filter, true);
    const rows = await PointModel.findSoftPointLog(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function recalcSoftMinusPointStats(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["user_pk"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.SOFTWARE);
    const limit_time = exist ? exist.limit_time : "";

    const total_points = await PointModel.sumSoftPointStatsByUserPk("", params.user_pk);
    const limit_points = await PointModel.sumSoftPointStatsByUserPk(limit_time, params.user_pk);

    const row = await PointModel.findSoftPointStatsByUserPk(params.user_pk);
    if (row) {
      const editParams = {
        table_pk: row.table_pk,
        total_points,
        limit_points,
      };
      const count = await PointModel.editSoftPointStats(editParams);
      if (count === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }
    } else {
      const addParams = {
        user_pk: params.user_pk,
        total_points,
        limit_points,
      };
      const ret = await PointModel.addSoftPointStats(addParams);
      if (!ret) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function minusSoftPointLog(customers, prefix_info, points) {
  try {
    const activityLimit = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.SOFTWARE);
    let include_limit = false;
    const today = moment().format("YYYY-MM-DD");
    if (!activityLimit || (activityLimit && today <= activityLimit.limit_time)) {
      include_limit = true;
    }

    const user_ids = customers.split(",").map(item => item.trim()).filter(item => !!item);
    const valid_users = await UserModel.findValidUsersByIds(user_ids);
    if (!valid_users || valid_users.length === 0) {
      return { code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_NOT_FOUND_ALL") };
    }

    const valid_ids = valid_users.map(item => item.user_id);
    const diff_ids = user_ids.filter(item => !valid_ids.includes(item));
    if (diff_ids.length > 0) {
      return { code: RESP_CODES.CONFLICT.code, message: `${getLangText("USER_NOT_FOUND_SOME")} (${diff_ids.join(", ")})` };
    }

    const already_users = await PointModel.findSoftPointLogsByReserveInfo(prefix_info.prefix_pk);
    if (!already_users) {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }
    const already_ids = already_users.map(item => item.user_id);
    const remain_ids = valid_ids.filter(item => !already_ids.includes(item));
    if (remain_ids.length === 0) {
      return { code: RESP_CODES.BAD_REQUEST.code, message: getLangText("POINT_ALREADY_MINUS_APPLIED") };
    }

    const reserve_rows = await ReserveModel.findReserveLogInUserIds(remain_ids, prefix_info.prefix_pk);
    if (reserve_rows.length === 0) {
      return { code: RESP_CODES.NOT_FOUND.code, message: getLangText("BOOK_NO_RESERVED_USERS") };
    }

    for (const row of reserve_rows) {
      const logParams = {
        user_pk: row.user_pk,
        point_type: SOFT_POINT_TYPES.MANAGER,
        status: SOFT_POINT_STATUS.MINUS,
        reason: `${prefix_info.product_name}(${prefix_info.prefix_str}-${formatReserveNo(row.reserve_no)}${prefix_info.suffix_str || ""})`,
        soft_points: points,
        related_pk: prefix_info.prefix_pk,
      }
      await PointModel.addSoftPointLog(logParams);

      const statsRow = await PointModel.findSoftPointStatsByUserPk(row.user_pk);
      if (statsRow) {
        await PointModel.increaseSoftPointStats(row.user_pk, points, include_limit);
      } else {
        const addParams = {
          user_pk: row.user_pk,
          total_points: points,
          limit_points: include_limit ? points : 0,
        };
        await PointModel.addSoftPointStats(addParams);
      }
    }

    return RESP_CODES.SUCCESS;
  } catch (err) {
    console.error(err);
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function fetchSoftPointRank(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "total_points", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const is_limit_rank = +req.query.is_limit_rank || 0;

  try {
    const filter = { offset, limit, sort, keyword, is_limit_rank };
    const total = await PointModel.findSoftPointRank(filter, true);
    const rows = await PointModel.findSoftPointRank(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchRegisterPointTypes(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: req.query.sortKey || "updated_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, sort, keyword };
    const total = await PointModel.findRegisterPointTypes(filter, true);
    const rows = await PointModel.findRegisterPointTypes(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addRegisterPointType(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["product_pk", "points"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const dup = await PointModel.findRegisterPointTypeByProductPk(params.product_pk);
    if (dup) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const row = await PointModel.addRegisterPointType(params, admin.manager_pk);
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

async function editRegisterPointType(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["type_pk", "product_pk", "points"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const dup = await PointModel.findRegisterPointTypeByProductPk(params.product_pk);
    if (dup && dup.type_pk !== params.type_pk) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const exist = await PointModel.findRegisterPointTypeByPk(params.type_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(createResponse(RESP_CODES.NOT_FOUND));
    }

    const count = await PointModel.editRegisterPointType(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const data = { count };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchRegisterPointBalance(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const appPages = getAppPointPagesByDepartment(admin.department);
  if (!appPages.includes(APP_POINT_PAGE.REGISTER)) {
    return res.status(RESP_CODES.FORBIDDEN.code).json(RESP_CODES.FORBIDDEN);
  }

  try {
    const user_pk = req.query.user_pk;
    /** fetch userinfo by user_pk to fix error fetching by original mobile user_id after merge fixed_id */
    const userInfo = await UserModel.findUserByPk(user_pk);
    if (!userInfo) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    const resp = await WebApi.fetchEprodRegistBalance(userInfo.user_id);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    const minusFilter = {
      user_pk,
      point_type: REG_POINT_TYPES.MANAGER,
      status: REG_POINT_STATUS.MINUS,
    };
    const minusRow = await PointModel.calcRegisterPointLogByFilter(minusFilter);
    const minusPoints = minusRow ? minusRow.sum_points : 0;
    const phoneRow = await ProductModel.calcRegisterPhoneLogByUserPk(user_pk);
    const phonePoints = phoneRow ? phoneRow.sum_points : 0;

    const data = {
      sum_total: +resp.data.sum_total,
      sum_minus: minusPoints,
      now_total: +resp.data.sum_total + phonePoints + minusPoints,
      phone_points: phonePoints,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchRegisterPointLog(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "action_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const point_type = req.query.point_type;
  const status = req.query.status;

  try {
    const filter = { offset, limit, sort, keyword, point_type, status };
    const total = await PointModel.findRegisterPointLog(filter, true);
    const rows = await PointModel.findRegisterPointLog(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addRegisterPointLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["status", "reason", "points"];
  let params = extractValidParams(req.body, validKeys);
  try {
    const users = req.body.users;
    const user_ids = users.split(",").map(item => item.trim()).filter(item => !!item);
    const valid_users = await UserModel.findValidUsersByIds(user_ids);
    if (!valid_users || valid_users.length === 0) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_NOT_FOUND_ALL") });
    }

    const valid_ids = valid_users.map(item => item.user_id);
    const diff_ids = user_ids.filter(item => !valid_ids.includes(item));
    if (user_ids.length !== valid_ids.length || diff_ids.length > 0) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: `${getLangText("USER_NOT_FOUND_SOME")} (${diff_ids.join(", ")})` });
    }

    params = { ...params, point_type: REG_POINT_TYPES.MANAGER };
    const valid_pks = valid_users.map(item => item.user_pk);
    const row = await PointModel.addRegisterPointLogs(params, valid_pks);
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

async function minusRegisterPointLog(customers, prefix_info, points) {
  try {
    const user_ids = customers.split(",").map(item => item.trim()).filter(item => !!item);
    const valid_users = await UserModel.findValidUsersByIds(user_ids);
    if (!valid_users || valid_users.length === 0) {
      return { code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_NOT_FOUND_ALL") };
    }

    const valid_ids = valid_users.map(item => item.user_id);
    const diff_ids = user_ids.filter(item => !valid_ids.includes(item));
    if (diff_ids.length > 0) {
      return { code: RESP_CODES.CONFLICT.code, message: `${getLangText("USER_NOT_FOUND_SOME")} (${diff_ids.join(", ")})` };
    }

    const already_users = await PointModel.findRegisterPointLogsByReserveInfo(prefix_info.prefix_pk);
    if (!already_users) {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }
    const already_ids = already_users.map(item => item.user_id);
    const remain_ids = valid_ids.filter(item => !already_ids.includes(item));
    if (remain_ids.length === 0) {
      return { code: RESP_CODES.BAD_REQUEST.code, message: getLangText("POINT_ALREADY_MINUS_APPLIED") };
    }

    const reserve_rows = await ReserveModel.findReserveLogInUserIds(remain_ids, prefix_info.prefix_pk);
    if (reserve_rows.length === 0) {
      return { code: RESP_CODES.NOT_FOUND.code, message: getLangText("BOOK_NO_RESERVED_USERS") };
    }

    for (const row of reserve_rows) {
      const logParams = {
        user_pk: row.user_pk,
        point_type: REG_POINT_TYPES.MANAGER,
        status: REG_POINT_STATUS.MINUS,
        points: points,
        reason: `${prefix_info.product_name}(${prefix_info.prefix_str}-${formatReserveNo(row.reserve_no)}${prefix_info.suffix_str || ""})`,
        related_pk: prefix_info.prefix_pk,
      }
      await PointModel.addRegisterPointLog(logParams);
    }

    return RESP_CODES.SUCCESS;
  } catch (err) {
    console.error(err);
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function editUserPoint(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["user_pk", "category", "point_type", "points", "reason", "action_at"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const user = await UserModel.findUserByPk(params.user_pk);
    if (!user) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_NOT_FOUND_ALL") });
    }

    if (params.category === POINT_MANAGER_MANUAL.ACTIVITY) {
      const pointParams = {
        user_pk: params.user_pk,
        type_pk: params.point_type,
        points: params.points,
        reason: params.reason || "",
        ip_address: admin.manager_pk,
        action_at: params.action_at ? moment(params.action_at).toDate() : "",
      };
      const row = await PointModel.addActivityPointLog(pointParams);
      if (!row) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_ADD_ACTIVITY_POINT") });
      }

      const activityLimit = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.ACTIVITY);
      let include_limit = false;
      const today = moment().format("YYYY-MM-DD");
      if (!activityLimit || (activityLimit && today <= activityLimit.limit_time)) {
        include_limit = true;
      }
      const statsExist = await PointModel.findActivityPointStatsByUserPk(params.user_pk);
      if (statsExist) {
        const statsCount = await PointModel.increaseActivityPointStats(params.user_pk, params.points, include_limit, false);
        if (statsCount === 0) {
          return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_UPDATE_ACTIVITY_POINT") };
        }
      } else {
        const statsParams = {
          user_pk: params.user_pk,
          total_points: params.points,
          limit_points: include_limit ? params.action_points : 0,
          minus_points: 0,
        };
        const pointStats = await PointModel.addActivityPointStats(statsParams);
        if (!pointStats) {
          return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_ADD_ACTIVITY_POINT") };
        }
      }
    } else if (params.category === POINT_MANAGER_MANUAL.SOFT) {
      const activityLimit = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.SOFTWARE);
      let include_limit = false;
      const today = moment().format("YYYY-MM-DD");
      if (!activityLimit || (activityLimit && today <= activityLimit.limit_time)) {
        include_limit = true;
      }

      if (params.point_type === SOFT_POINT_TYPES.APPSTORE) {
        const pointParams = {
          user_pk: params.user_pk,
          status: SOFT_POINT_STATUS.PLUS,
          reason: params.reason || "",
          soft_points: params.points,
          is_agency: FLAG_USER,
          action_at: params.action_at ? moment(params.action_at).toDate() : "",
        };
        const row = await PointModel.addAppstorePointLog(pointParams);
        if (!row) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_ADD_SOFTWARE_POINT") });
        }

        const statsExist = await PointModel.findAppstorePointStatsByUserPk(params.user_pk);
        if (statsExist) {
          const statsCount = await PointModel.increaseAppstorePointStats(params.user_pk, params.points, include_limit);
          if (statsCount === 0) {
            return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_EDIT_SOFTWARE_STATS") };
          }
        } else {
          const statsParams = {
            user_pk: params.user_pk,
            total_points: params.points,
            limit_points: include_limit ? params.points : 0,
          };
          const pointStats = await PointModel.addAppstorePointStats(statsParams);
          if (!pointStats) {
            return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_EDIT_SOFTWARE_STATS") };
          }
        }
      } else if (params.point_type === SOFT_POINT_TYPES.KARAOKE) {
        const pointParams = {
          user_pk: params.user_pk,
          status: SOFT_POINT_STATUS.PLUS,
          reason: params.reason || "",
          soft_points: params.points,
          is_agency: FLAG_USER,
          action_at: params.action_at ? moment(params.action_at).toDate() : "",
        };
        const row = await PointModel.addKaraokePointLog(pointParams);
        if (!row) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_ADD_SOFTWARE_POINT") });
        }

        const statsExist = await PointModel.findKaraokePointStatsByUserPk(params.user_pk);
        if (statsExist) {
          const statsCount = await PointModel.increaseKaraokePointStats(params.user_pk, params.points, include_limit);
          if (statsCount === 0) {
            return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_EDIT_SOFTWARE_STATS") };
          }
        } else {
          const statsParams = {
            user_pk: params.user_pk,
            total_points: params.points,
            limit_points: include_limit ? params.points : 0,
          };
          const pointStats = await PointModel.addKaraokePointStats(statsParams);
          if (!pointStats) {
            return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_EDIT_SOFTWARE_STATS") };
          }
        }
      } else if (params.point_type === SOFT_POINT_TYPES.BMEDIA) {
        const pointParams = {
          user_pk: params.user_pk,
          status: SOFT_POINT_STATUS.PLUS,
          reason: params.reason || "",
          soft_points: params.points,
          is_agency: FLAG_USER,
          action_at: params.action_at ? moment(params.action_at).toDate() : "",
        };
        const row = await PointModel.addBMediaPointLog(pointParams);
        if (!row) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_ADD_SOFTWARE_POINT") });
        }

        const statsExist = await PointModel.findBMediaPointStatsByUserPk(params.user_pk);
        if (statsExist) {
          const statsCount = await PointModel.increaseBMediaPointStats(params.user_pk, params.points, include_limit);
          if (statsCount === 0) {
            return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_EDIT_SOFTWARE_STATS") };
          }
        } else {
          const statsParams = {
            user_pk: params.user_pk,
            total_points: params.points,
            limit_points: include_limit ? params.points : 0,
          };
          const pointStats = await PointModel.addBMediaPointStats(statsParams);
          if (!pointStats) {
            return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_EDIT_SOFTWARE_STATS") };
          }
        }
      } else if (params.point_type === SOFT_POINT_TYPES.MANAGER) {
        const pointParams = {
          user_pk: params.user_pk,
          point_type: params.point_type,
          status: SOFT_POINT_STATUS.PLUS,
          reason: params.reason || "",
          soft_points: params.points,
          is_agency: FLAG_USER,
          action_at: params.action_at ? moment(params.action_at).toDate() : "",
        };
        const row = await PointModel.addSoftPointLog(pointParams);
        if (!row) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_ADD_SOFTWARE_POINT") });
        }

        const statsExist = await PointModel.findSoftPointStatsByUserPk(params.user_pk);
        if (statsExist) {
          const statsCount = await PointModel.increaseSoftPointStats(params.user_pk, params.points, include_limit);
          if (statsCount === 0) {
            return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_EDIT_SOFTWARE_STATS") };
          }
        } else {
          const statsParams = {
            user_pk: params.user_pk,
            total_points: params.points,
            limit_points: include_limit ? params.points : 0,
          };
          const pointStats = await PointModel.addSoftPointStats(statsParams);
          if (!pointStats) {
            return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_EDIT_SOFTWARE_STATS") };
          }
        }
      } else {
        return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("POINT_ERR_MANAGER_POINT_BY_SOURCE") });
      }
    } else if (params.category === POINT_MANAGER_MANUAL.REGISTER) {
      const pointParams = {
        user_pk: params.user_pk,
        point_type: params.point_type,
        status: REGISTER_POINT_STATUS.MINUS,
        points: params.points,
        reason: params.reason || "",
        action_at: params.action_at ? moment(params.action_at).toDate() : "",
      };
      const row = await PointModel.addRegisterPointLog(pointParams);
      if (!row) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_APPLY_REGISTER_POINT") });
      }
    } else {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("POINT_ERR_POINT_CATEGORY") });
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function minusPrizeLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["reserve_prefix", "reserve_suffix", "prize_val"];
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

    const already_users = await PointModel.findPrizeLogsByMinusPrefix(params.reserve_prefix, params.reserve_suffix);
    if (!already_users) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }
    const already_ids = already_users.map(item => item.user_userid);
    const remain_ids = valid_ids.filter(item => !already_ids.includes(item));
    if (remain_ids.length === 0) {
      return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
    }

    const reserve_rows = await PointModel.findOldReserveLogInCustomerIds(remain_ids, params.reserve_prefix, params.reserve_suffix);
    if (reserve_rows.length === 0) {
      return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
    }

    for (const row of reserve_rows) {
      const logParams = {
        customer_id: "" + row.user_pk,
        prize_val: params.prize_val,
        fill_type: OLD_PRIZE_FILL_TYPES.MINUS_PRIZE,
        note: `${params.reserve_prefix}-${formatReserveNo(row.reserve_no)}${params.reserve_suffix || ""}`,
      };
      await PointModel.addPrizeLog(logParams, admin.manager_pk);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function tempManualAppstorePoint(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const exist = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.SOFTWARE);
    const limit_time = exist ? exist.limit_time : "";

    const rows = await PointModel.findMergeIdsInStocks(0, 0);
    for (const row of rows) {
      await PointModel.deleteAppstorePointPrevLog(row.pvendor_pk, row.last_time);

      const isMobile = row.appstore_id.slice(0, 3) === "ph_";
      const logParams = {
        user_pk: row.pvendor_pk,
        status: SOFT_POINT_STATUS.PLUS,
        related_pk: isMobile ? SOFT_POINT_PREDEFINED_RELATED_PKS.MOBILE_APPSTORE : SOFT_POINT_PREDEFINED_RELATED_PKS.FIXED_APPSTORE,
        is_agency: FLAG_USER,
        reason: isMobile ? getLangText("POINT_REASON_MERGE_APPSTORE_ID") : getLangText("POINT_REASON_MERGE_FIXED_ID"),
        soft_points: row.point,
        action_at: moment(row.last_time).toDate(),
      };
      const logRow = await PointModel.addAppstorePointLog(logParams);
      if (!logRow) {
        console.log(`error user = ${row.pvendor_id}`);
      }

      // update appstore point stats
      const total_points = await PointModel.sumAppstorePointStatsByUserPk("", row.pvendor_pk);
      const limit_points = await PointModel.sumAppstorePointStatsByUserPk(limit_time, row.pvendor_pk);
      const statsRow = await PointModel.findAppstorePointStatsByUserPk(row.pvendor_pk);
      if (statsRow) {
        const editParams = {
          table_pk: statsRow.table_pk,
          total_points,
          limit_points,
        };
        const count = await PointModel.editAppstorePointStats(editParams);
        if (count === 0) {
          console.log(`fail to edit stat for user = ${row.pvendor_id}`);
        }
      } else {
        const addParams = {
          user_pk: row.pvendor_pk,
          total_points,
          limit_points,
        };
        const ret = await PointModel.addAppstorePointStats(addParams);
        if (!ret) {
          console.log(`fail to add stat for user = ${row.pvendor_id}`);
        }
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function tempManualKaraokePoint(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const filter = {
      offset: 0,
      limit: 0,
      sort: {},
      point_type: SOFT_POINT_TYPES.KARAOKE,
    }
    const rows = await PointModel.findSoftPointLog(filter);
    for (const row of rows) {
      const logParams = {
        user_pk: row.user_pk,
        status: row.status,
        reason: row.reason,
        equ_num: row.equ_num,
        pay_points: row.pay_points,
        soft_points: row.soft_points,
        related_pk: row.related_pk,
        is_agency: row.is_agency,
        action_at: moment(row.action_at).toDate(),
      };
      const logRow = await PointModel.addKaraokePointLog(logParams);
      if (!logRow) {
        console.log(`error user = ${row.user_pk}`);
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function tempManualBMediaPoint(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const filter = {
      offset: 0,
      limit: 0,
      sort: {},
      point_type: SOFT_POINT_TYPES.BMEDIA,
    }
    const rows = await PointModel.findSoftPointLog(filter);
    for (const row of rows) {
      const logParams = {
        user_pk: row.user_pk,
        status: row.status,
        reason: row.reason,
        equ_num: row.equ_num,
        pay_points: row.pay_points,
        soft_points: row.soft_points,
        related_pk: row.related_pk,
        is_agency: row.is_agency,
        action_at: moment(row.action_at).toDate(),
      };
      const logRow = await PointModel.addBMediaPointLog(logParams);
      if (!logRow) {
        console.log(`error user = ${row.user_pk}`);
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function tempRecalcBMediaPoint(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const rows = await PointModel.findTempBMediaPoints(0, 0);
    for (const row of rows) {
      const logParams = {
        table_pk: row.table_pk,
        soft_points: row.total_points,
      };
      const count = await PointModel.editBMediaPointLog(logParams);
      if (count === 0) {
        console.log(`error user = ${row.user_id}`);
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function tempRepairActivityPoint(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const action_date = '2025-10-28';
    const missing_at = '2025-10-29 10:00:00';
    const user_pks = [10062020, 10023890, 10008890, 10114350, 10596770, 10214220];
    for (const user_pk of user_pks) {
      const json = await processRepairActivityPoint(user_pk, action_date, missing_at);
      if (json.code !== RESP_CODES.SUCCESS.code) {
        console.log(user_pk, json);
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function processRepairActivityPoint(user_pk, action_date, missing_at) {
  const rows = await PointModel.findMobileDailyPointLogsLargeThanActionAt(user_pk, action_date);
  if (!rows || rows.length <= 1) {
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }

  let typePk = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (typePk === 0) {
      typePk = row.type_pk;
    } else {
      typePk = typePk === POINT_TYPE_VALUES.MOBILE_DAILY_LOGIN_LAST ? typePk : typePk + 1;
    }
    const pointType = await PointModel.findActivityPointTypeByPk(typePk);
    if (!pointType) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_NOT_FOUND_TYPE") };
    }
    let logParams = {
      type_pk: pointType.type_pk,
      points: pointType.points,
    };
    if (i === 0) {
      logParams = {
        ...logParams,
        user_pk,
        action_at: moment(missing_at).toDate(),
      };
      const logRow = await PointModel.addActivityPointLog(logParams);
      if (!logRow) {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_ADD_ACTIVITY_POINT") };
      }
    } else {
      logParams = {
        ...logParams,
        table_pk: row.table_pk,
      };

      const count = await PointModel.editActivityPointLog(logParams);
      if (count === 0) {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_UPDATE_ACTIVITY_POINT") };
      }
    }

    if (i === rows.length - 1) {
      const achieveRow = await ExpModel.findLastMobileDailyAchievement(user_pk);
      const achieveParams = {
        table_pk: achieveRow.table_pk,
        point_type: pointType.type_pk,
        points: pointType.points,
        action_at: moment(achieveRow.action_at).toDate(),
      };
      const count = await ExpModel.editAchievement(achieveParams);
      if (count === 0) {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_UPDATE_ACHIEVEMENT") };
      }
    }
  }

  const ret = await processRecalcActivityPointStat(user_pk);
  return ret;
}

async function fetchEshopWalletBalance(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const appPages = getAppPointPagesByDepartment(admin.department);
  if (!appPages.includes(APP_POINT_PAGE.ESHOP)) {
    return res.status(RESP_CODES.FORBIDDEN.code).json(RESP_CODES.FORBIDDEN);
  }

  const user_pk = req.query.user_pk;
  try {
    const merged = await UserModel.findMergeIdByFilter({ pvendor_pk: user_pk });
    if (!merged || !merged.eshop_pk) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_NOT_MERGED_ESHOP") });
    }

    const resp = await EshopApi.fetchCardInfo(merged.eshop_pk);
    return res.status(resp.code).json(resp);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchEshopeWalletTransactions(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const appPages = getAppPointPagesByDepartment(admin.department);
  if (!appPages.includes(APP_POINT_PAGE.ESHOP)) {
    return res.status(RESP_CODES.FORBIDDEN.code).json(RESP_CODES.FORBIDDEN);
  }

  const user_pk = req.query.user_pk;
  try {
    const merged = await UserModel.findMergeIdByFilter({ pvendor_pk: user_pk });
    if (!merged || !merged.eshop_pk) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_NOT_MERGED_ESHOP") });
    }

    const offset = +req.query.offset || 0;
    const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
    const from = req.query.from || "";
    const to = req.query.to || "";
    const type = +req.query.type || 0;
    const filter = {
      from,
      to,
      keyword: "",
      type,
    };

    const resp = await EshopApi.fetchTransactionLog(merged.eshop_pk, offset, limit, filter);
    return res.status(resp.code).json(resp);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchEshopCards(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "accum_value", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const wallet_type = req.query.wallet_type || "";
  const accum_level = req.query.accum_level || "";
  const id_filter = +req.query.id_filter || 0;

  try {
    const filter = { offset, limit, sort, keyword, wallet_type, accum_level, id_filter };
    const total = await EshopModel.findEshopCards(filter, true);
    const rows = await EshopModel.findEshopCards(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function syncEshopCards(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["offset", "limit"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const offset = +params.offset || 0;
    const limit = +params.limit || DEFAULT_PAGE_SIZE;

    const resp = await EshopApi.fetchAllCards(offset, limit);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    const { rows } = resp.data;
    const card_pks = rows.map(row => row.card_pk);
    const exists = await EshopModel.findEshopCardInPks(card_pks);
    const exist_pks = exists.map(row => row.card_pk);

    const create_rows = rows.filter(row => exist_pks.indexOf(row.card_pk) === -1).map(row => ({
      card_pk: row.card_pk,
      accum_card: +row.card_no,
      accum_level: row.card_lvl,
      wallet_card: +row.card_no_vip,
      wallet_type: row.card_type,
      username: row.username,
      phone_number: row.phone_no,
      eshop_pk: row.user_pk,
      eshop_id: row.user_user_id,
      wallet_balance: row.real_d_point,
      prize_balance: row.prize_f_point,
      accum_value: row.real_f_point,
      commerce_value: row.commerce_point,
    }));
    if (create_rows.length > 0) {
      await EshopModel.addEshopCards(create_rows);
    }

    const update_rows = rows.filter(row => exist_pks.indexOf(row.card_pk) !== -1).map(row => ({
      card_pk: row.card_pk,
      accum_card: +row.card_no,
      accum_level: row.card_lvl,
      wallet_card: +row.card_no_vip,
      wallet_type: row.card_type,
      username: row.username,
      phone_number: row.phone_no,
      eshop_pk: row.user_pk,
      eshop_id: row.user_user_id,
      wallet_balance: row.real_d_point,
      prize_balance: row.prize_f_point,
      accum_value: row.real_f_point,
      commerce_value: row.commerce_point,
    }));
    for (const row of update_rows) {
      await EshopModel.editEshopCard(row);
    }

    const data = {
      count: rows.length,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function syncEshopCombineLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["limit", "last_at"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const limit = +params.limit || DEFAULT_PAGE_SIZE;
    let last_at = "";

    const last_row = await EshopModel.findEshopCombineLastLog();
    if (last_row) {
      last_at = last_row.updated_at;
    }

    const resp = await EshopApi.fetchCombineLog(limit, last_at);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    const rows = resp.data.rows.filter(row => !!row.target_user_pk);
    const log_ids = rows.map(row => +row.id);
    const exists = await EshopModel.findEshopCombineLogInIds(log_ids);
    const exist_ids = exists.map(row => +row.id);

    const create_rows = rows.filter(row => exist_ids.indexOf(+row.id) === -1).map(row => {
      let item = {
        id: +row.id,
        target_user_pk: row.target_user_pk,
        org_userid: row.org_userid,
        target_userid: row.target_userid,
        combine_type: +row.combine_type,
        action_type: +row.action_type,
        created_at: moment(row.created_at).toDate(),
        updated_at: moment(row.updated_at).toDate(),
      };
      if (row.org_user_pk) {
        item = { ...item, org_user_pk: row.org_user_pk };
      }
      return item;
    });
    if (create_rows.length > 0) {
      await EshopModel.addEshopCardCombineLogs(create_rows);
    }

    const update_rows = rows.filter(row => exist_ids.indexOf(+row.id) !== -1).map(row => {
      let item = {
        id: +row.id,
        target_user_pk: row.target_user_pk,
        org_userid: row.org_userid,
        target_userid: row.target_userid,
        combine_type: +row.combine_type,
        action_type: +row.action_type,
        created_at: moment(row.created_at).toDate(),
        updated_at: moment(row.updated_at).toDate(),
      };
      if (row.org_user_pk) {
        item = { ...item, org_user_pk: row.org_user_pk };
      }
      return item;
    });
    for (const row of update_rows) {
      await EshopModel.editEshopCombineLog(row);
    }

    const data = {
      count: rows.length,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchEshopPointStats(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, keyword };
    const total = await EshopModel.findEshopPointStats(filter, true);
    const rows = await EshopModel.findEshopPointStats(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function tempPremiumActivityPoint(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const service_pk = +req.query.service_pk || 0;
    if (!service_pk) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")} (service_pk)` });
    }

    const activityLimit = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.ACTIVITY);
    let include_limit = false;
    const today = moment().format("YYYY-MM-DD");
    if (!activityLimit || (activityLimit && today <= activityLimit.limit_time)) {
      include_limit = true;
    }

    const rows = await PremiumModel.findPremiumActivityPointByLottery(service_pk, 2700, 200);
    const now = new Date();
    let fails = [];
    for (const row of rows) {
      const logParams = {
        user_pk: row.user_pk,
        type_pk: POINT_TYPE_VALUES.MANAGER_MANUAL_PLUS,
        points: row.points,
        reason: `${getLangText("PREMIUM_2025_12")}-${row.lottery_number}`,
        related_pk: row.lottery_pk,
        ip_address: row.lottery_number,
      }
      await PointModel.addActivityPointLog(logParams);

      const statsRow = await PointModel.findActivityPointStatsByUserPk(row.user_pk);
      if (statsRow) {
        await PointModel.increaseActivityPointStats(row.user_pk, row.points, include_limit, false);
      } else {
        const addParams = {
          user_pk: row.user_pk,
          total_points: row.points,
          limit_points: include_limit ? points : 0,
          minus_points: 0,
        };
        await PointModel.addActivityPointStats(addParams);
      }

      const lotteryParams = {
        lottery_pk: row.lottery_pk,
        award_at: now,
      };
      const count = await PremiumModel.editLotteryNumber(lotteryParams);
      if (count === 0) {
        fails = [...fails, row.lottery_number];
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function tempWomensDayActivityPoint(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const activityLimit = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.ACTIVITY);
    let include_limit = false;
    const today = moment().format("YYYY-MM-DD");
    if (!activityLimit || (activityLimit && today <= activityLimit.limit_time)) {
      include_limit = true;
    }

    const service_pk = PREMIUM_SERVICE_WOMENSDAY_SERVICE_PK;
    const rows = await PremiumModel.findPremiumDiscussActivityPoints(service_pk, 0, 200);
    if (rows.length === 0) {
      return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
    }
    const now = new Date();
    let fails = [];
    for (const row of rows) {
      const logParams = {
        user_pk: row.user_pk,
        type_pk: POINT_TYPE_VALUES.MANAGER_MANUAL_PLUS,
        points: row.points,
        reason: getLangText("PREMIUM_2026_03"),
        related_pk: row.award_at,
      }
      await PointModel.addActivityPointLog(logParams);

      const statsRow = await PointModel.findActivityPointStatsByUserPk(row.user_pk);
      if (statsRow) {
        await PointModel.increaseActivityPointStats(row.user_pk, row.points, include_limit, false);
      } else {
        const addParams = {
          user_pk: row.user_pk,
          total_points: row.points,
          limit_points: include_limit ? points : 0,
          minus_points: 0,
        };
        await PointModel.addActivityPointStats(addParams);
      }

      const discussParams = {
        award_pk: row.award_pk,
        award_at: now,
      };
      const count = await PremiumModel.editPremiumDiscussAward(discussParams);
      if (count === 0) {
        fails = [...fails, row.user_pk];
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function tempPuzzleAwardActivityPoint(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const activityLimit = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.ACTIVITY);
    let include_limit = false;
    const today = moment().format("YYYY-MM-DD");
    if (!activityLimit || (activityLimit && today <= activityLimit.limit_time)) {
      include_limit = true;
    }

    const service_pk = +req.query.service_pk || 0;
    if (!service_pk) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")} (service_pk)` });
    }

    const rows = await PremiumModel.findPuzzleAwardActivityPoints(service_pk, 0, 100);
    if (rows.length === 0) {
      return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
    }
    const now = new Date();
    let fails = [];
    for (const row of rows) {
      const logParams = {
        user_pk: row.user_pk,
        type_pk: POINT_TYPE_VALUES.MANAGER_MANUAL_PLUS,
        points: row.points,
        reason: getLangText("PREMIUM_2026_04"),
        related_pk: row.award_at,
      }
      await PointModel.addActivityPointLog(logParams);

      const statsRow = await PointModel.findActivityPointStatsByUserPk(row.user_pk);
      if (statsRow) {
        await PointModel.increaseActivityPointStats(row.user_pk, row.points, include_limit, false);
      } else {
        const addParams = {
          user_pk: row.user_pk,
          total_points: row.points,
          limit_points: include_limit ? points : 0,
          minus_points: 0,
        };
        await PointModel.addActivityPointStats(addParams);
      }

      const awardParams = {
        award_pk: row.award_pk,
        award_at: now,
      };
      const count = await PremiumModel.editPuzzleAward(awardParams, 6);
      if (count === 0) {
        fails = [...fails, row.user_pk];
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function tempPeriodDutyForSurvey(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const activityLimit = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.ACTIVITY);
    let include_limit = false;
    const today = moment().format("YYYY-MM-DD");
    if (!activityLimit || (activityLimit && today <= activityLimit.limit_time)) {
      include_limit = true;
    }
    const pks = [];

    for (const user_pk of pks) {
      const achieveParams = {
        user_pk,
        duty_pk: 59,
        point_type: 500002,
        points: 1,
      };
      const achieveRow = await ExpModel.addAchievement(achieveParams);

      const logParams = {
        user_pk,
        type_pk: 500002,
        points: 1,
        related_pk: achieveRow.table_pk,
      };
      const row = await PointModel.addActivityPointLog(logParams);

      const statsRow = await PointModel.findActivityPointStatsByUserPk(row.user_pk);
      if (statsRow) {
        await PointModel.increaseActivityPointStats(row.user_pk, row.points, include_limit, false);
      } else {
        const addParams = {
          user_pk: row.user_pk,
          total_points: row.points,
          limit_points: include_limit ? points : 0,
          minus_points: 0,
        };
        await PointModel.addActivityPointStats(addParams);
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchActivityPointTypes,
  addActivityPointType,
  editActivityPointType,
  fetchActivityPointLog,
  fetchActivityPointBalance,
  recalcActivityPointStats,
  minusActivityPointLog,
  fetchActivityPointStats,
  fetchActivityLimits,
  fetchActivityLimitBySource,
  addActivityLimit,
  editActivityLimit,
  recalcActivityLimit,
  fetchAppstoreWalletBalance,
  fetchAppstorePointLog,
  fetchAppstorePointStats,
  recalcAppstorePointStats,
  fetchKaraokePointLog,
  fetchKaraokePointStats,
  recalcKaraokePointStats,
  fetchBMediaPointLog,
  fetchBMediaPointStats,
  recalcBMediaPointStats,
  fetchSoftPointLog,
  recalcSoftMinusPointStats,
  fetchSoftPointRank,
  minusSoftPointLog,
  fetchRegisterPointTypes,
  addRegisterPointType,
  editRegisterPointType,
  fetchRegisterPointBalance,
  fetchRegisterPointLog,
  addRegisterPointLog,
  minusRegisterPointLog,
  editUserPoint,
  minusPrizeLog,
  tempManualAppstorePoint,
  tempManualKaraokePoint,
  tempManualBMediaPoint,
  tempRecalcBMediaPoint,
  tempRepairActivityPoint,
  fetchEshopWalletBalance,
  fetchEshopeWalletTransactions,
  fetchEshopCards,
  syncEshopCards,
  syncEshopCombineLog,
  fetchEshopPointStats,
  tempPremiumActivityPoint,
  tempWomensDayActivityPoint,
  tempPuzzleAwardActivityPoint,
  tempPeriodDutyForSurvey,
};
