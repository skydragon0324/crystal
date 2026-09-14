const moment = require('moment');
const { validationResult } = require("express-validator");
const PointModel = require("../../models/pointModel");
const UserModel = require('../../models/userModel');
const BaseModel = require('../../models/baseModel');
const ProductModel = require('../../models/productModel');
const CrmModel = require('../../models/crmModel');
const MassApi = require('../../api/massApi');
const AppstoreApi = require('../../api/appstoreApi');
const EshopApi = require('../../api/eshopApi');
const WebApi = require('../../api/webApi');
const CronApi = require('../../api/cronApi');
const { addCustomerByPid } = require('../admin/adminCrmController');
const { createResponse } = require('../../utils/response');
const { extractValidParams, convertHashToPointType, getDayDiff, formatTimeForClient, formatDateForClient, getPointTypeByEverydayCount, base64decode } = require("../../utils/utils");
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { POINT_TYPE_VALUES, POINT_TYPE_HASHES, ACTIVITY_LIMIT_SOURCES, FIXED_STATUS, SOFT_POINT_TYPES, SOFT_POINT_STATUS, DEFAULT_PAGE_SIZE, SOFT_POINT_PREDEFINED_RELATED_PKS, ACTIVITY_POINT_PREDEFINED_RELATED_PKS, FLAG_ACTIVE, JOBS, REG_POINT_TYPES, REG_POINT_STATUS, USER_FIXED_FUNC_TYPES, USER_FIXED_STATUS, FLAG_USER, MERGE_ID_TYPE, MERGE_TYPE, ACTION_TYPE, USER_REG_STATUS, USER_REG_APP_TYPE } = require("../../constants/constants");

async function fetchProvinces(req, res) {
  try {
    const rows = await UserModel.findProvinces();
    const data = { rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function processActivityPointLogByUserPk(user_pk, type_pk, params) {
  try {
    if (!user_pk) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_NO_TARGET_USER") };
    }
    if (!type_pk) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_NOT_FOUND_TYPE") };
    }

    const pointType = await PointModel.findActivityPointTypeByPk(type_pk);
    if (!pointType || !pointType.points) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_NOT_FOUND_TYPE") };
    }

    let logParams = {
      user_pk,
      type_pk,
      points: pointType.points,
    }
    if (params.related_pk) {
      logParams = { ...logParams, related_pk: +params.related_pk };
    }
    if (params.ip_address) {
      logParams = { ...logParams, ip_address: params.ip_address };
    }
    const logRow = await PointModel.addActivityPointLog(logParams);
    if (!logRow) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_ADD_ACTIVITY_POINT") };
    }

    let actionPoints = pointType.points;
    let reasons = [pointType.sub_type];
    if (params.hash === POINT_TYPE_HASHES.MOBILE_DAILY_LOGIN
      || params.hash === POINT_TYPE_HASHES.FIXED_DAILY_LOGIN
    ) { // check birthday and holiday
      const today_date = moment().format("MM-DD");
      const user = await UserModel.findUserBirthdayByPk(user_pk);
      if (!user) {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_INFO_NOT_FOUND") };
      }

      if (today_date === user.birth_date) { // birthday bonus
        const birthdayType = await PointModel.findActivityPointTypeByPk(params.hash === POINT_TYPE_HASHES.MOBILE_DAILY_LOGIN ? POINT_TYPE_VALUES.MOBILE_BIRTHDAY : POINT_TYPE_VALUES.FIXED_BIRTHDAY);
        if (!birthdayType) {
          return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_GET_BIRTHDAY_POINT") };
        }
        let birthLogParams = {
          user_pk,
          type_pk: birthdayType.type_pk,
          points: birthdayType.points,
        };
        if (params.ip_address) {
          birthLogParams = { ...birthLogParams, ip_address: params.ip_address };
        }
        const logBirthRow = await PointModel.addActivityPointLog(birthLogParams);
        if (!logBirthRow) {
          return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_ADD_BIRTHDAY_POINT") };
        }
        actionPoints += birthdayType.points;
        reasons = [`${birthdayType.sub_type}`, ...reasons];
      }

      const holiday = await BaseModel.findHolidayByDate(today_date);
      if (holiday) { // holiday bonus
        const holidayType = await PointModel.findActivityPointTypeByPk(params.hash === POINT_TYPE_HASHES.MOBILE_DAILY_LOGIN ? POINT_TYPE_VALUES.MOBILE_HOLIDAY : POINT_TYPE_VALUES.FIXED_HOLIDAY);
        if (!holidayType) {
          return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_GET_HOLIDAY_POINT") };
        }
        let holidayLogParams = {
          user_pk,
          type_pk: holidayType.type_pk,
          points: holidayType.points,
        }
        if (params.ip_address) {
          holidayLogParams = { ...holidayLogParams, ip_address: params.ip_address };
        }
        const logHolidayRow = await PointModel.addActivityPointLog(holidayLogParams);
        if (!logHolidayRow) {
          return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_ADD_HOLIDAY_POINT") };
        }
        actionPoints += holidayType.points;
        reasons = [`${holidayType.sub_type}`, ...reasons];
      }
    }

    const activityLimit = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.ACTIVITY);
    let include_limit = false;
    const today = moment().format("YYYY-MM-DD");
    if (!activityLimit || (activityLimit && today <= activityLimit.limit_time)) {
      include_limit = true;
    }
    const statsExist = await PointModel.findActivityPointStatsByUserPk(user_pk);
    if (statsExist) {
      const statsCount = await PointModel.increaseActivityPointStats(user_pk, actionPoints, include_limit, false);
      if (statsCount === 0) {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_UPDATE_ACTIVITY_POINT") };
      }
    } else {
      const statsParams = {
        user_pk,
        total_points: actionPoints,
        limit_points: include_limit ? actionPoints : 0,
        minus_points: 0,
      };
      const pointStats = await PointModel.addActivityPointStats(statsParams);
      if (!pointStats) {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_UPDATE_ACTIVITY_POINT") };
      }
    }

    const data = {
      row: { ...logRow, action_at: formatTimeForClient(logRow.action_at) },
      action_points: actionPoints,
      reason: reasons.join(", "),
    };
    return createResponse(RESP_CODES.SUCCESS, data);
  } catch (err) {
    console.error(err);
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function processPointsForRegister(user_pk) {
  try {
    const pointType = await PointModel.findActivityPointTypeByPk(POINT_TYPE_VALUES.MOBILE_REGISTER);
    if (!pointType) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR, message: getLangText("POINT_ERR_ADD_NEWLY_POINT") };
    }

    const pointParams = {
      user_pk,
      type_pk: pointType.type_pk,
      points: pointType.points,
    };
    const pointLog = await PointModel.addActivityPointLog(pointParams);
    if (!pointLog) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_ADD_NEWLY_POINT") };
    }

    const activityStatsExist = await PointModel.findActivityPointStatsByUserPk(user_pk);
    if (!activityStatsExist) {
      const activityStatsParams = {
        user_pk,
        total_points: pointType.points,
        limit_points: pointType.points,
        minus_points: 0,
      };
      const activityPointStats = await PointModel.addActivityPointStats(activityStatsParams);
      if (!activityPointStats) {
        return {
          code: RESP_CODES.INTERNAL_SERVER_ERROR.code,
          message: getLangText("POINT_ERR_ADD_NEWLY_POINT"),
        };
      }
    }

    return RESP_CODES.SUCCESS;
  } catch (err) {
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function activityPointAction(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["pvendor_pk", "main_type", "sub_type", "ip", "related_pk"];
  const params = extractValidParams(req.body, validKeys);
  const pvendor_pk = +params.pvendor_pk;
  const hash = `${params.main_type}_${params.sub_type}`;
  const today = moment().format("YYYY-MM-DD");
  try {
    let type_pk = 0;
    if (hash === POINT_TYPE_HASHES.FIXED_DAILY_LOGIN) {
      const lastLogin = await PointModel.findLastFixedLoginLog(pvendor_pk);
      type_pk = POINT_TYPE_VALUES.FIXED_DAILY_LOGIN_FIRST;
      if (lastLogin) {
        if (today === lastLogin.action_at) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_EXIST_DAILY_LOGIN") });
        } else if (getDayDiff(today, lastLogin.action_at) == 1) {
          if (lastLogin.type_pk === POINT_TYPE_VALUES.FIXED_MERGE_ID) {
            type_pk = getPointTypeByEverydayCount(lastLogin.everyday_cnt);
          } else {
            type_pk = lastLogin.type_pk === POINT_TYPE_VALUES.FIXED_DAILY_LOGIN_LAST ? POINT_TYPE_VALUES.FIXED_DAILY_LOGIN_LAST : lastLogin.type_pk + 1;
          }
        }
      }
    } else if (hash === POINT_TYPE_HASHES.BLOG_RECOM_GOLD
      || hash === POINT_TYPE_HASHES.BLOG_RECOM_SILVER
      || hash === POINT_TYPE_HASHES.BLOG_RECOM_BRONZE
    ) {
      return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
    } else {
      type_pk = convertHashToPointType(hash);
    }

    let logParams = {
      ip_address: params.ip,
      hash,
    };
    if (params.related_pk) {
      logParams = { ...logParams, related_pk: +params.related_pk };
    }
    const resp = await processActivityPointLogByUserPk(+params.pvendor_pk, type_pk, logParams);
    return res.status(resp.code).json(resp);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function commonLogin(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["pvendor_id", "prhn_pwd"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const user = await UserModel.findUserAppInfoById(params.pvendor_id);
    if (!user) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_INFO_NOT_FOUND") });
    } else if (user.status !== FLAG_ACTIVE) {
      return res.status(RESP_CODES.UNAUTHORIZED.code).json({ code: RESP_CODES.UNAUTHORIZED.code, message: getLangText("AUTH_ERR_BLOCKED_USER") });
    }

    if (params.prhn_pwd !== user.password) {
      return res.status(RESP_CODES.UNAUTHORIZED.code).json({ code: RESP_CODES.UNAUTHORIZED.code, message: getLangText("PASSWORD_MISMATCH") });
    }

    let job = "";
    if (user.job) {
      const jobItem = JOBS.find(item => item.id === +user.job);
      if (jobItem) {
        job = jobItem.name;
      }
    }
    const data = {
      user: {
        ...user,
        gender: user.gender === "F" ? 2 : 1,
        location_full_name: (user.location_full_name || "").trim(),
        job,
        password: "",
        id_card: user.id_card || "",
        phone_number: user.phone_number || "",
      },
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function mergeFixedId(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["pvendor_pk", "fixed_pk", "fixed_status", "total_prize", "ip", "everyday_cnt"];
  let params = extractValidParams(req.body, validKeys);
  params = {
    pvendor_pk: +params.pvendor_pk,
    fixed_pk: params.fixed_pk,
    fixed_status: +params.fixed_status,
    total_prize: +params.total_prize,
    everyday_cnt: +params.everyday_cnt,
  };
  const today = moment().format("YYYY-MM-DD");

  try {
    const mergeIdExist = await UserModel.findMergeIdByFilter({ pvendor_pk: params.pvendor_pk });
    if (!mergeIdExist || mergeIdExist.fixed_status !== FIXED_STATUS.PENDING) {
      const message = mergeIdExist.fixed_status === FIXED_STATUS.APPROVED ? getLangText("USER_MERGE_FIXED_FINISHED") : getLangText("USER_MERGE_FIXED_REJECTED");
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message });
    } else if (!mergeIdExist.fixed_id) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_MERGE_FIXED_NOT_EXIST") });
    }

    if (params.fixed_status === FIXED_STATUS.REJECTED) {
      const mergeIdParams = {
        pvendor_pk: params.pvendor_pk,
        fixed_status: params.fixed_status,
      };
      const count = await UserModel.editMergeId(mergeIdParams);
      if (count === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }

      return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
    } else if (params.fixed_status !== FIXED_STATUS.APPROVED) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")} (fixed_status)` });
    }

    const userInfo = await UserModel.findUserByPk(+params.pvendor_pk);
    if (!userInfo) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    let mergeIdParams = {
      pvendor_pk: params.pvendor_pk,
      pvendor_id: mergeIdExist.fixed_id,
      fixed_pk: params.fixed_pk,
      fixed_status: params.fixed_status,
    };

    const funcs = [
      EshopApi.mergeUserId(userInfo.user_id, userInfo.password, userInfo.user_name, formatDateForClient(userInfo.birthday), "", "", mergeIdExist.fixed_id),
      AppstoreApi.mergeUserId(userInfo.user_id, userInfo.password, userInfo.user_name, formatDateForClient(userInfo.birthday), "", "", mergeIdExist.fixed_id),
      WebApi.fetchEprodSoftPointBalance(mergeIdExist.fixed_id),
      MassApi.mergeUserId(userInfo.user_id, userInfo.password, userInfo.user_name, formatDateForClient(userInfo.birthday), "", "", mergeIdExist.fixed_id),
      WebApi.notifyMergeUserId(userInfo.user_id, mergeIdExist.fixed_id),
    ];
    const resp = await Promise.all(funcs);
    if (resp.length === 5) {
      if (resp[0].code === RESP_CODES.SUCCESS.code) {
        mergeIdParams = { ...mergeIdParams, eshop_id: resp[0].data.eshop_id, eshop_pk: resp[0].data.eshop_pk };
      }
      if (resp[1].code === RESP_CODES.SUCCESS.code) {
        mergeIdParams = { ...mergeIdParams, appstore_id: resp[1].data.appstore_id, appstore_pk: resp[1].data.appstore_pk };

        // delete original mobile appstore id log if already merged before fixed_id
        const oldFilter = {
          user_pk: params.pvendor_pk,
        };
        await PointModel.deleteAppstorePointLog(oldFilter);
        await PointModel.resetAppstorePointStats(params.pvendor_pk);

        const appstoreLogParams = {
          status: SOFT_POINT_STATUS.PLUS,
          reason: getLangText("POINT_REASON_MERGE_FIXED_ID"),
          soft_points: +resp[1].data.appstore_point,
          related_pk: SOFT_POINT_PREDEFINED_RELATED_PKS.FIXED_APPSTORE,
          action_at: "",
        }
        await processAppstorePointLogByUserPk(params.pvendor_pk, appstoreLogParams);
      } else {
        const errParams = {
          user_pk: params.pvendor_pk,
          user_id: userInfo.user_id,
          fixed_id: mergeIdExist.fixed_id,
          func_type: USER_FIXED_FUNC_TYPES.APPSTORE,
          status: USER_FIXED_STATUS.PENDING,
        };
        await UserModel.addUserFixedLog(errParams);
      }
      if (resp[2].code === RESP_CODES.SUCCESS.code) {
        if (resp[2].data && (+resp[2].data.k_price > 0 || +resp[2].data.k_score > 0)) {
          const karaokeLogParams = {
            status: SOFT_POINT_STATUS.PLUS,
            reason: getLangText("POINT_REASON_MERGE_FIXED_ID"),
            pay_points: +resp[2].data.k_price,
            soft_points: +resp[2].data.k_score,
            related_pk: SOFT_POINT_PREDEFINED_RELATED_PKS.KARAOKE,
            action_at: "",
          };
          await processKaraokePointLogByUserPk(params.pvendor_pk, karaokeLogParams);
        }
        if (resp[2].data && (+resp[2].data.m_price > 0 || +resp[2].data.m_score > 0)) {
          const bmediaLogParams = {
            status: SOFT_POINT_STATUS.PLUS,
            reason: getLangText("POINT_REASON_MERGE_FIXED_ID"),
            pay_points: +resp[2].data.m_price,
            soft_points: +resp[2].data.m_score,
            related_pk: SOFT_POINT_PREDEFINED_RELATED_PKS.BMEDIA,
            action_at: "",
          };
          await processBMediaPointLogByUserPk(params.pvendor_pk, bmediaLogParams);
        }
      } else {
        const errParams = {
          user_pk: params.pvendor_pk,
          user_id: userInfo.user_id,
          fixed_id: mergeIdExist.fixed_id,
          func_type: USER_FIXED_FUNC_TYPES.EPROD_SOFT,
          status: USER_FIXED_STATUS.PENDING,
        };
        await UserModel.addUserFixedLog(errParams);
      }
      if (resp[3].code === RESP_CODES.SUCCESS.code) {
        mergeIdParams = { ...mergeIdParams, mass_id: resp[3].data.mass_id, mass_pk: resp[3].data.mass_pk };
      }
      if (resp[4].code === RESP_CODES.SUCCESS.code) {
        await processRegisterMinusPointLogByUserId(params.pvendor_pk, mergeIdExist.fixed_id);
      } else {
        const errParams = {
          user_pk: params.pvendor_pk,
          user_id: userInfo.user_id,
          fixed_id: mergeIdExist.fixed_id,
          func_type: USER_FIXED_FUNC_TYPES.EPROD_REGISTER,
          status: USER_FIXED_STATUS.PENDING,
        };
        await UserModel.addUserFixedLog(errParams);
      }
    }

    // update edit log
    const count = await UserModel.editMergeId(mergeIdParams);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    // update user_id as fixed_id
    if (mergeIdExist.user_id !== mergeIdExist.fixed_id) {
      const userParams = {
        user_pk: params.pvendor_pk,
        user_id: mergeIdExist.fixed_id,
      };
      const count2 = await UserModel.editUser(userParams);
      if (count2 === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }

      const customer = await CrmModel.findCustomerByPvendorPk(params.pvendor_pk);
      if (customer) {
        const ecidParams = {
          ecid: customer.ecid,
          pvendor_id: mergeIdExist.fixed_id,
        };
        await CrmModel.editCustomer(ecidParams);
      }
    }

    // point log
    const pointType = await PointModel.findActivityPointTypeByPk(POINT_TYPE_VALUES.FIXED_MERGE_ID);
    if (!pointType) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_GET_MERGE_FIXED_POINT") });
    }

    const logFilter = {
      user_pk: params.pvendor_pk,
      type_pk: pointType.type_pk,
      related_pk: ACTIVITY_POINT_PREDEFINED_RELATED_PKS.FIXED,
    }
    const logExist = await PointModel.findActivityPointLogByFilter(logFilter);
    if (!logExist) {
      const logParams = {
        user_pk: params.pvendor_pk,
        type_pk: pointType.type_pk,
        points: params.total_prize,
        related_pk: ACTIVITY_POINT_PREDEFINED_RELATED_PKS.FIXED,
        ip_address: params.ip,
        everyday_cnt: params.everyday_cnt,
      };
      const logRow = await PointModel.addActivityPointLog(logParams);
      if (!logRow) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_ADD_MERGE_FIXED_POINT") });
      }

      // point stats
      const statsExist = await PointModel.findActivityPointStatsByUserPk(params.pvendor_pk);
      if (statsExist) {
        const activityLimit = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.ACTIVITY);
        let include_limit = false;
        if (!activityLimit || (activityLimit && today <= activityLimit.limit_time)) {
          include_limit = true;
        }
        const statsCount = await PointModel.increaseActivityPointStats(params.pvendor_pk, params.total_prize, include_limit, false);
        if (statsCount === 0) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_UPDATE_ACTIVITY_POINT") });
        }
      } else {
        const statsParams = {
          user_pk: params.pvendor_pk,
          total_points: params.total_prize,
          limit_points: params.total_prize,
          minus_points: 0,
        };
        const pointStats = await PointModel.addActivityPointStats(statsParams);
        if (!pointStats) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_UPDATE_ACTIVITY_POINT") });
        }
      }
    }

    let total_points = 0;
    const pointStats = await PointModel.findActivityPointStatsByUserPk(params.pvendor_pk);
    if (pointStats) {
      total_points = pointStats.total_points;
    }

    const data = {
      total_points,
    };

    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function doUserRegister(params, hasPoints = true) {
  try {
    const cid_exist = await UserModel.findUserByCid(params.cid);
    if (cid_exist) {
      return { code: RESP_CODES.CONFLICT.code, message: getLangText("AUTH_ERR_CID_REG_EXIST", [cid_exist.user_id]) };
    }

    const user_exist = await UserModel.findUserByPhId(params.user_id);
    if (user_exist) {
      return { code: RESP_CODES.CONFLICT.code, message: getLangText("USER_ERR_USERID_EXIST") };
    }

    const user = await UserModel.addUser(params);
    if (!user) {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }

    if (hasPoints) {
      const pointResp = await processPointsForRegister(user.user_pk);
      if (pointResp.code !== RESP_CODES.SUCCESS.code) {
        return pointResp;
      }
    }

    // crm
    addCustomerByPid(params, user.user_pk);

    const data = { user_pk: user.user_pk };
    return createResponse(RESP_CODES.SUCCESS, data);
  } catch (err) {
    console.error(err);
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function registerUserByAppstore(req, res) {
  try {
    const validKeys = ["pvendor_id", "prhn_pwd", "user_name", "birthday", "gender", "cid", "appstore_pk"];
    const params = extractValidParams(req.body, validKeys);

    let newParams = {
      user_id: params.pvendor_id.trim(),
      password: params.prhn_pwd,
      cid: params.cid,
    };
    if (params.user_name) {
      newParams = { ...newParams, user_name: params.user_name.trim() };
    }
    if (params.birthday) {
      newParams = { ...newParams, birthday: moment(params.birthday).toDate() };
    }
    if (params.gender) {
      newParams = { ...newParams, gender: +params.gender === 1 ? 'M' : 'F' };
    }

    const user_exist = await UserModel.findUserById(newParams.user_id);
    if (user_exist && !user_exist.user_name) {
      const editParams = {
        user_pk: user_exist.user_pk,
        ...newParams,
      };
      const user = await UserModel.editUser(editParams);
      if (!user) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }
      return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
    }

    const regResp = await doUserRegister(newParams);
    if (regResp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(regResp.code).json(regResp);
    }
    const pvendor_pk = regResp.data.user_pk;

    const merge_dup = await UserModel.findMergeIdByFilter({ appstore_id: params.pvendor_id });
    if (!merge_dup) {
      const mergeParams = {
        pvendor_pk,
        pvendor_id: params.pvendor_id,
        appstore_pk: params.appstore_pk,
        appstore_id: params.pvendor_id,
        mass_pk: params.appstore_pk,
        mass_id: params.pvendor_id,
      }
      const merge_row = await UserModel.addMergeId(mergeParams);
      if (merge_row) {
        const logParams = {
          pvendor_pk,
          pvendor_id: params.pvendor_id,
          id_type: MERGE_ID_TYPE.APPSTORE,
          merge_id: params.pvendor_id,
          merge_type: MERGE_TYPE.MERGE,
          action_type: ACTION_TYPE.USER,
          action_by: pvendor_pk,
        };
        await UserModel.addMergeLog(logParams);
      }
    }

    const forwardParams = {
      user_pk: pvendor_pk,
      cid: params.cid,
      status: USER_REG_STATUS.PENDING,
      action_type: ACTION_TYPE.USER,
      action_by: pvendor_pk,
      app_type: USER_REG_APP_TYPE.ESHOP,
    };
    const forwardRow = await UserModel.addUserRegisterLog(forwardParams);
    if (forwardRow) {
      CronApi.forwardRegisterUserId(pvendor_pk);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function registerUserByEshop(req, res) {
  try {
    const validKeys = ["pvendor_id", "prhn_pwd", "user_name", "birthday", "gender", "cid", "eshop_pk"];
    const params = extractValidParams(req.body, validKeys);
    const newParams = {
      user_id: params.pvendor_id,
      password: params.prhn_pwd,
      user_name: params.user_name,
      birthday: moment(params.birthday).toDate(),
      gender: +params.gender === 1 ? 'M' : 'F',
      cid: params.cid,
    };
    const regResp = await doUserRegister(newParams);
    if (regResp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(regResp.code).json(regResp);
    }
    const pvendor_pk = regResp.data.user_pk;

    const merge_dup = await UserModel.findMergeIdByFilter({ eshop_id: params.pvendor_id });
    if (!merge_dup) {
      const merge_row = await UserModel.addMergeId({ pvendor_pk, pvendor_id: params.pvendor_id, eshop_pk: params.eshop_pk, eshop_id: params.pvendor_id });
      if (merge_row) {
        const logParams = {
          pvendor_pk,
          pvendor_id: params.pvendor_id,
          id_type: MERGE_ID_TYPE.ESHOP,
          merge_id: params.pvendor_id,
          merge_type: MERGE_TYPE.MERGE,
          action_type: ACTION_TYPE.USER,
          action_by: pvendor_pk,
        };
        await UserModel.addMergeLog(logParams);
      }
    }

    const forwardParams = {
      user_pk: pvendor_pk,
      cid: params.cid,
      status: USER_REG_STATUS.PENDING,
      action_type: ACTION_TYPE.USER,
      action_by: pvendor_pk,
      app_type: USER_REG_APP_TYPE.APPSTORE,
    };
    const forwardRow = await UserModel.addUserRegisterLog(forwardParams);
    if (forwardRow) {
      CronApi.forwardRegisterUserId(pvendor_pk);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function editUserCid(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.SUCCESS.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const validKeys = ["user_pk", "cid"];
    const params = extractValidParams(req.body, validKeys);

    const exist_user = await UserModel.findUserByPk(params.user_pk);
    if (!exist_user) {
      return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.NOT_FOUND);
    } else if (exist_user.cid === params.cid) {
      return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
    }

    const exist_cid = await UserModel.findUserByCid(params.cid);
    if (exist_cid) {
      return res.status(RESP_CODES.SUCCESS.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("USER_ERR_CID_REGISTERED") });
    }

    const count = await UserModel.editUser(params);
    if (count === 0) {
      return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteUserCid(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.SUCCESS.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const validKeys = ["user_pk"];
    const params = extractValidParams(req.body, validKeys);

    const exist_user = await UserModel.findUserByPk(params.user_pk);
    if (!exist_user) {
      return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.NOT_FOUND);
    }

    const editParams = {
      user_pk: params.user_pk,
      cid: "",
    };
    const count = await UserModel.editUser(editParams);
    if (count === 0) {
      return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchAppstorePointLog(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "action_at", dir: req.query.sortDir || "desc" };
  const user_id = req.query.user_id;
  const keyword = req.query.keyword || "";
  const status = req.query.status;

  try {
    const filter = { user_id, offset, limit, sort, keyword, status, point_type: SOFT_POINT_TYPES.APPSTORE };
    const resp = await fetchSoftPointLog(filter);
    return res.status(resp.code).json(resp);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchActivityPointLog(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: req.query.sortKey || "action_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const user_id = req.query.user_id;
  const fixed_id = req.query.fixed_id;
  const from = req.query.from || "";
  const to = req.query.to || "";
  const point_type_prefix = +req.query.point_type_prefix || 0;

  try {
    if (!user_id && !fixed_id) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")} (user_id || fixed_id)` });
    }

    let user_pk = 0;
    if (user_id) {
      const user = await UserModel.findUserById(user_id);
      if (!user) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_INFO_NOT_FOUND") });
      }
      user_pk = user.user_pk;
    } else if (fixed_id) {
      const mergeIdExist = await UserModel.findMergeIdByFilter({ fixed_id, fixed_status: FIXED_STATUS.APPROVED });
      if (!mergeIdExist) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_INFO_NOT_FOUND") });
      }
      user_pk = mergeIdExist.pvendor_pk;
    }

    const filter = { offset, limit, sort, user_pk, from, to, point_type_prefix, keyword, is_client: 1 };
    const total = await PointModel.findActivityPointLog(filter, true);
    const rows = await PointModel.findActivityPointLog(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchActivityPointStats(req, res) {
  const user_id = req.query.user_id;

  try {
    if (!user_id) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")} (user_id)` });
    }

    const user = await UserModel.findUserById(user_id);
    if (!user) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    let total_points = 0;
    const pointStats = await PointModel.findActivityPointStatsByUserPk(user.user_pk);
    if (pointStats) {
      total_points = pointStats.total_points;
    }

    const data = {
      total_points,
    }

    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchActivityPointRank(req, res) {
  const user_id = req.query.user_id;

  try {
    if (!user_id) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")} (user_id)` });
    }

    const user = await UserModel.findUserById(user_id);
    if (!user) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    const activityLimit = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.ACTIVITY);
    const is_limit_rank = activityLimit ? activityLimit.status : 0;
    const target_rank = activityLimit ? activityLimit.target_rank : 100;
    const top_count = activityLimit ? activityLimit.top_count : 5;
    const surroundings = activityLimit ? activityLimit.surroundings : 2;
    const description = activityLimit && activityLimit.status === 1 ? activityLimit.description || "" : "";

    const userRank = await PointModel.findActivityPointRankByUserPk(user.user_pk, is_limit_rank);
    const user_rank = userRank ? userRank.rank : -1;

    const filter = { offset: 0, limit: 0, sort: {}, is_limit_rank, target_rank, top_count, surroundings, user_rank, is_client: 1 };
    const rows = await PointModel.findActivityPointStats(filter, false);

    const data = {
      description,
      target_rank,
      user_rank,
      top_count,
      surroundings,
      list: rows,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchSoftPointLog(filter) {
  const { user_id, offset, limit, sort, keyword, fixed_id, point_type, status } = filter;
  const from = filter.from || "";
  const to = filter.to || "";

  try {
    if (!user_id && !fixed_id) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")} (user_id || fixed_id)` });
    }

    let user_pk = 0;
    if (user_id) {
      const user = await UserModel.findUserById(user_id);
      if (!user) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_INFO_NOT_FOUND") });
      }
      user_pk = user.user_pk;
    } else if (fixed_id) {
      const mergeIdExist = await UserModel.findMergeIdByFilter({ fixed_id, fixed_status: FIXED_STATUS.APPROVED });
      if (!mergeIdExist) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_INFO_NOT_FOUND") });
      }
      user_pk = mergeIdExist.pvendor_pk;
    }

    const filter = { offset, limit, sort, user_pk, from, to, point_type, status, keyword, is_client: 1 };
    const total = await PointModel.findSoftPointLog(filter, true);
    const rows = await PointModel.findSoftPointLog(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchSoftMinusPointLog(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: req.query.sortKey || "action_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const user_id = req.query.user_id;
  const fixed_id = req.query.fixed_id;
  const from = req.query.from || "";
  const to = req.query.to || "";
  const point_type = req.query.point_type;
  const status = req.query.status;

  try {
    if (!user_id && !fixed_id) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")} (user_id || fixed_id)` });
    }

    let user_pk = 0;
    if (user_id) {
      const user = await UserModel.findUserById(user_id);
      if (!user) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_INFO_NOT_FOUND") });
      }
      user_pk = user.user_pk;
    } else if (fixed_id) {
      const mergeIdExist = await UserModel.findMergeIdByFilter({ fixed_id, fixed_status: FIXED_STATUS.APPROVED });
      if (!mergeIdExist) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_INFO_NOT_FOUND") });
      }
      user_pk = mergeIdExist.pvendor_pk;
    }

    const filter = { offset, limit, sort, user_pk, from, to, point_type, status, keyword, is_client: 1 };
    const total = await PointModel.findSoftPointLog(filter, true);
    const rows = await PointModel.findSoftPointLog(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchSoftPointStats(req, res) {
  const user_id = req.query.user_id;

  try {
    if (!user_id) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")} (user_id)` });
    }

    const user = await UserModel.findUserById(user_id);
    if (!user) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    let total_points = 0;
    const pointStats = await PointModel.findSoftPointStatsByUserPk(user.user_pk);
    if (pointStats) {
      total_points = pointStats.total_points;
    }

    const data = {
      total_points,
    }

    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchSoftPointRank(req, res) {
  const user_id = req.query.user_id;

  try {
    if (!user_id) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")} (user_id)` });
    }

    const user = await UserModel.findUserById(user_id);
    if (!user) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    const activityLimit = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.SOFTWARE);
    const is_limit_rank = activityLimit ? activityLimit.status : 0;
    const target_rank = activityLimit ? activityLimit.target_rank : 100;
    const top_count = activityLimit ? activityLimit.top_count : 5;
    const surroundings = activityLimit ? activityLimit.surroundings : 2;
    const description = (activityLimit && activityLimit.status === 1) ? activityLimit.description || "" : "";

    const userRank = await PointModel.findActivityPointRankByUserPk(user.user_pk, is_limit_rank);
    const user_rank = userRank ? userRank.rank : -1;

    const filter = { offset: 0, limit: 0, sort: {}, is_limit_rank, target_rank, top_count, surroundings, user_rank, is_client: 1 };
    const rows = await PointModel.findSoftPointRank(filter, false);

    const data = {
      description,
      target_rank,
      user_rank,
      top_count,
      surroundings,
      list: rows,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchKaraokePointLog(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "action_at", dir: req.query.sortDir || "desc" };
  const user_id = req.query.user_id;
  const keyword = req.query.keyword || "";
  const status = req.query.status;

  try {
    const filter = { user_id, offset, limit, sort, keyword, status, point_type: SOFT_POINT_TYPES.KARAOKE };
    const resp = await fetchSoftPointLog(filter);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }
    return res.status(resp.code).json({ ...resp, data: { ...resp.data, code: resp.code } });
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchBMediaPointLog(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "action_at", dir: req.query.sortDir || "desc" };
  const user_id = req.query.user_id;
  const keyword = req.query.keyword || "";
  const status = req.query.status;

  try {
    const filter = { user_id, offset, limit, sort, keyword, status, point_type: SOFT_POINT_TYPES.BMEDIA };
    const resp = await fetchSoftPointLog(filter);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }
    return res.status(resp.code).json({ ...resp, data: { ...resp.data, code: resp.code } });
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function processAppstorePointLogByUserPk(user_pk, params) {
  try {
    if (params.related_pk) {
      const logFilter = {
        user_pk,
        status: params.status,
        related_pk: params.related_pk,
        is_agency: params.is_agency ? +params.is_agency : 0,
      };
      const exist = await PointModel.findAppstorePointLogByFilter(logFilter);
      if (exist) {
        return { code: RESP_CODES.CONFLICT.code, message: getLangText("POINT_ERR_CONFLICT_SOFT_POINT") };
      }
    }

    const logParams = {
      user_pk,
      status: params.status,
      reason: params.reason,
      equ_num: params.equ_num,
      pay_points: params.pay_points,
      soft_points: params.soft_points,
      related_pk: params.related_pk,
      is_agency: params.is_agency,
      action_at: params.action_at ? moment(params.action_at).toDate() : new Date(),
    };
    const row = await PointModel.addAppstorePointLog(logParams);
    if (!row) {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }

    /** sync appstore point stats */
    if (params.final_points) {
      const sum_points = await PointModel.findTotalAppstorePointByFilter({
        user_pk,
        is_agency: FLAG_USER,
      });
      if (sum_points !== params.final_points) {
        const syncParams = {
          user_pk,
          status: SOFT_POINT_STATUS.PLUS,
          reason: getLangText("POINT_REASON_SYNC_APPSTORE"),
          pay_points: 0,
          soft_points: params.final_points - sum_points,
          related_pk: SOFT_POINT_PREDEFINED_RELATED_PKS.SYNC_APPSTORE,
          is_agency: FLAG_USER,
        };
        await PointModel.addAppstorePointLog(syncParams);
      }
    }

    const activityLimit = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.SOFTWARE);
    let include_limit = false;
    const today = moment().format("YYYY-MM-DD");
    if (!activityLimit || (activityLimit && today <= activityLimit.limit_time)) {
      include_limit = true;
    }
    const statsExist = await PointModel.findAppstorePointStatsByUserPk(user_pk);
    if (statsExist) {
      let statsCount = 0;
      if (params.final_points) {
        const statsParams = {
          table_pk: statsExist.table_pk,
          total_points: params.final_points,
          limit_points: include_limit ? params.final_points : statsExist.limit_points,
        };
        statsCount = await PointModel.editAppstorePointStats(statsParams);
      } else {
        statsCount = await PointModel.increaseAppstorePointStats(user_pk, params.soft_points, include_limit);
      }
      if (statsCount === 0) {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_EDIT_SOFTWARE_STATS") };
      }
    } else {
      const statsParams = {
        user_pk,
        total_points: params.final_points ? params.final_points : params.soft_points,
        limit_points: include_limit ? (params.final_points ? params.final_points : params.soft_points) : 0,
      };
      const pointStats = await PointModel.addAppstorePointStats(statsParams);
      if (!pointStats) {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_EDIT_SOFTWARE_STATS") };
      }
    }

    return createResponse(RESP_CODES.SUCCESS, { row });
  } catch (err) {
    console.error(err);
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function processKaraokePointLogByUserPk(user_pk, params) {
  try {
    if (params.related_pk) {
      const logFilter = {
        user_pk,
        status: params.status,
        related_pk: params.related_pk,
        is_agency: params.is_agency ? +params.is_agency : 0,
      };
      const exist = await PointModel.findKaraokePointLogByFilter(logFilter);
      if (exist) {
        return { code: RESP_CODES.CONFLICT.code, message: getLangText("POINT_ERR_CONFLICT_SOFT_POINT") };
      }
    }

    const logParams = { ...params, user_pk, action_at: params.action_at ? moment(params.action_at).toDate() : new Date() };
    const row = await PointModel.addKaraokePointLog(logParams);
    if (!row) {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }

    if (+params.is_agency === FLAG_USER) {
      const activityLimit = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.SOFTWARE);
      let include_limit = false;
      const today = moment().format("YYYY-MM-DD");
      if (!activityLimit || (activityLimit && today <= activityLimit.limit_time)) {
        include_limit = true;
      }
      const statsExist = await PointModel.findKaraokePointStatsByUserPk(user_pk);
      if (statsExist) {
        const statsCount = await PointModel.increaseKaraokePointStats(user_pk, params.soft_points, include_limit);
        if (statsCount === 0) {
          return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_EDIT_SOFTWARE_STATS") };
        }
      } else {
        const statsParams = {
          user_pk,
          total_points: params.soft_points,
          limit_points: include_limit ? params.soft_points : 0,
        };
        const pointStats = await PointModel.addKaraokePointStats(statsParams);
        if (!pointStats) {
          return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_EDIT_SOFTWARE_STATS") };
        }
      }
    }

    return createResponse(RESP_CODES.SUCCESS, { row });
  } catch (err) {
    console.error(err);
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function processBMediaPointLogByUserPk(user_pk, params) {
  try {
    if (params.related_pk) {
      const logFilter = {
        user_pk,
        status: params.status,
        related_pk: params.related_pk,
        is_agency: params.is_agency ? +params.is_agency : 0,
      };
      const exist = await PointModel.findBMediaPointLogByFilter(logFilter);
      if (exist) {
        return { code: RESP_CODES.CONFLICT.code, message: getLangText("POINT_ERR_CONFLICT_SOFT_POINT") };
      }
    }

    const logParams = { ...params, user_pk, action_at: params.action_at ? moment(params.action_at).toDate() : new Date() };
    const row = await PointModel.addBMediaPointLog(logParams);
    if (!row) {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }

    if (+params.is_agency === FLAG_USER) {
      const activityLimit = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.SOFTWARE);
      let include_limit = false;
      const today = moment().format("YYYY-MM-DD");
      if (!activityLimit || (activityLimit && today <= activityLimit.limit_time)) {
        include_limit = true;
      }
      const statsExist = await PointModel.findBMediaPointStatsByUserPk(user_pk);
      if (statsExist) {
        const statsCount = await PointModel.increaseBMediaPointStats(user_pk, params.soft_points, include_limit);
        if (statsCount === 0) {
          return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_EDIT_SOFTWARE_STATS") };
        }
      } else {
        const statsParams = {
          user_pk,
          total_points: params.soft_points,
          limit_points: include_limit ? params.soft_points : 0,
        };
        const pointStats = await PointModel.addBMediaPointStats(statsParams);
        if (!pointStats) {
          return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_EDIT_SOFTWARE_STATS") };
        }
      }
    }

    return createResponse(RESP_CODES.SUCCESS, { row });
  } catch (err) {
    console.error(err);
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function plusAppstorePointLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["user_id", "reason", "equ_num", "pay_points", "soft_points", "related_pk", "is_agency", "final_points", "action_at"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const user = await UserModel.findUserById(params.user_id);
    if (!user) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    const newParams = {
      status: SOFT_POINT_STATUS.PLUS,
      reason: params.reason,
      equ_num: params.equ_num,
      pay_points: +params.pay_points,
      soft_points: +params.soft_points,
      related_pk: "" + params.related_pk,
      is_agency: +params.is_agency,
      final_points: +params.final_points,
      action_at: params.action_at,
    };
    const resp = await processAppstorePointLogByUserPk(user.user_pk, newParams);

    return res.status(resp.code).json(resp);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function plusKaraokePointLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["user_id", "reason", "equ_num", "pay_points", "soft_points", "related_pk", "is_agent", "action_at"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const karaLog = await PointModel.findKaraLicenseLogByPk(params.related_pk);
    if (!karaLog) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const user = await UserModel.findUserById(params.user_id);
    if (!user) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    const newParams = {
      status: SOFT_POINT_STATUS.PLUS,
      reason: params.reason,
      equ_num: params.equ_num,
      pay_points: +params.pay_points,
      soft_points: +params.soft_points,
      related_pk: "" + params.related_pk,
      is_agency: +karaLog.is_agent,
      action_at: params.action_at,
    };
    const resp = await processKaraokePointLogByUserPk(user.user_pk, newParams);

    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }
    return res.status(resp.code).json({ ...resp, data: { ...resp.data, code: resp.code } });
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function plusBMediaPointLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["user_id", "reason", "equ_num", "pay_points", "soft_points", "related_pk", "is_agent", "action_at"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const mediaLog = await PointModel.findMediaLicenseLogByPk(params.related_pk);
    if (!mediaLog) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const user = await UserModel.findUserById(params.user_id);
    if (!user) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    const newParams = {
      status: SOFT_POINT_STATUS.PLUS,
      reason: params.reason,
      equ_num: params.equ_num,
      pay_points: +params.pay_points,
      soft_points: +params.soft_points,
      related_pk: "" + params.related_pk,
      is_agency: +mediaLog.is_agent,
      action_at: params.action_at,
    };
    const resp = await processBMediaPointLogByUserPk(user.user_pk, newParams);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }
    return res.status(resp.code).json({ ...resp, data: { ...resp.data, code: resp.code } });
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function refundAppstorePointLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["user_id", "reason", "equ_num", "pay_points", "soft_points", "related_pk", "is_agency", "action_at"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const user = await UserModel.findUserById(params.user_id);
    if (!user) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    const newParams = {
      status: SOFT_POINT_STATUS.REFUND,
      reason: params.reason,
      equ_num: params.equ_num,
      pay_points: +params.pay_points,
      soft_points: +params.soft_points,
      related_pk: "" + params.related_pk,
      is_agency: +params.is_agency,
      final_points: +params.final_points,
      action_at: params.action_at,
    };
    const resp = await processAppstorePointLogByUserPk(user.user_pk, newParams);
    return res.status(resp.code).json(resp);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function refundKaraokePointLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["user_id", "reason", "equ_num", "pay_points", "soft_points", "related_pk", "action_at"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const karaLog = await PointModel.findKaraLicenseLogByPk(params.related_pk);
    if (!karaLog) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const user = await UserModel.findUserById(params.user_id);
    if (!user) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    const newParams = {
      status: SOFT_POINT_STATUS.REFUND,
      reason: params.reason,
      equ_num: params.equ_num,
      pay_points: +params.pay_points,
      soft_points: +params.soft_points,
      related_pk: "" + params.related_pk,
      is_agency: +karaLog.is_agent,
      action_at: params.action_at,
    };
    const resp = await processKaraokePointLogByUserPk(user.user_pk, newParams);

    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }
    return res.status(resp.code).json({ ...resp, data: { ...resp.data, code: resp.code } });
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function refundBMediaPointLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["user_id", "reason", "equ_num", "pay_points", "soft_points", "related_pk", "is_agent", "action_at"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const mediaLog = await PointModel.findMediaLicenseLogByPk(params.related_pk);
    if (!mediaLog) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const user = await UserModel.findUserById(params.user_id);
    if (!user) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    const newParams = {
      status: SOFT_POINT_STATUS.REFUND,
      reason: params.reason,
      equ_num: params.equ_num,
      pay_points: +params.pay_points,
      soft_points: +params.soft_points,
      related_pk: "" + params.related_pk,
      is_agency: +mediaLog.is_agent,
      action_at: params.action_at,
    };
    const resp = await processBMediaPointLogByUserPk(user.user_pk, newParams);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }
    return res.status(resp.code).json({ ...resp, data: { ...resp.data, code: resp.code } });
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function processRegisterMinusPointLogByUserId(user_pk, customer_id) {
  try {
    const minusRows = await PointModel.findOldRegScoreMinusLogByCustomerId(customer_id);
    if (!minusRows || minusRows.length === 0) {
      return RESP_CODES.SUCCESS;
    }

    const params = {
      user_pk,
      point_type: REG_POINT_TYPES.MANAGER,
      status: REG_POINT_STATUS.MINUS,
    };
    const row = await PointModel.addRegisterMinusLogs(params, minusRows);
    if (!row) {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }

    return RESP_CODES.SUCCESS;
  } catch (err) {
    console.error(err);
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function checkUserForAS(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["user_id", "is_match", "limit_date", "simple_name"];
  const params = extractValidParams(req.query, validKeys);

  try {
    const user_rows = await UserModel.findUserForAS(params);
    let reg_rows = [];
    if (user_rows.length > 0) {
      const user_pks = user_rows.map(row => row.user_pk);
      reg_rows = await ProductModel.findRegisterPhoneLogsInUserPksAndName(user_pks, params.simple_name);
    }

    const rows = user_rows.map(row => ({
      ...row,
      phones: reg_rows.filter(item => item.user_pk === row.user_pk).map(item => ({
        simple_name: item.simple_name,
        phone_imei: item.phone_imei,
        created_at: item.created_at,
      })),
    }));
    const data = { rows };

    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function getBase64Decode(req, res) {
  try {
    const validKeys = ["code"];
    const params = extractValidParams(req.query, validKeys);
    if (!params.code) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json(RESP_CODES.BAD_REQUEST);
    }
    const data = base64decode(params.code);
    return res.status(RESP_CODES.SUCCESS.code).json(data);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchProvinces,
  processActivityPointLogByUserPk,
  processPointsForRegister,
  activityPointAction,
  commonLogin,
  mergeFixedId,
  registerUserByAppstore,
  registerUserByEshop,
  editUserCid,
  deleteUserCid,
  fetchActivityPointLog,
  fetchActivityPointStats,
  fetchActivityPointRank,
  fetchSoftMinusPointLog,
  fetchSoftPointStats,
  fetchSoftPointRank,
  fetchAppstorePointLog,
  fetchKaraokePointLog,
  fetchBMediaPointLog,
  processAppstorePointLogByUserPk,
  processKaraokePointLogByUserPk,
  processBMediaPointLogByUserPk,
  plusAppstorePointLog,
  plusKaraokePointLog,
  plusBMediaPointLog,
  refundAppstorePointLog,
  refundKaraokePointLog,
  refundBMediaPointLog,
  checkUserForAS,
  getBase64Decode,
};
