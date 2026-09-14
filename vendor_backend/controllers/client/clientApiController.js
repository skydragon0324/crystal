const { validationResult } = require('express-validator');
const UserModel = require('../../models/userModel');
const CustomerModel = require('../../models/customerModel');
const PointModel = require('../../models/pointModel');
const ProductModel = require('../../models/productModel');
const PremiumModel = require('../../models/premiumModel');
const CrmModel = require('../../models/crmModel');
const AppstoreApi = require('../../api/appstoreApi');
const EshopApi = require('../../api/eshopApi');
const WebApi = require('../../api/webApi');
const MassApi = require('../../api/massApi');
const { processAppstorePointLogByUserPk } = require('../common/commonPrhnController');
const { updateIntegratedUserValue } = require('../common/commonPremiumController');
const { createResponse } = require('../../utils/response');
const { extractValidParams, formatDateForClient } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { DEFAULT_PAGE_SIZE, MERGE_ID_TYPE, MERGE_TYPE, ACTION_TYPE, FIXED_STATUS, JOBS, SOFT_POINT_TYPES, SOFT_POINT_STATUS, PHONE_TYPE, REG_POINT_TYPES, REG_POINT_STATUS, FLAG_USER, SOFT_POINT_PREDEFINED_RELATED_PKS, EPROD_REGISTER_STATUS, CRM_SPLITTER } = require('../../constants/constants');

async function fetchAppstoreWalletBalance(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const merged = await UserModel.findMergeIdByFilter({ pvendor_pk: user.user_pk });
    if (!merged || !merged.appstore_pk) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_MERGE_APPSTORE_NOT_EXIST") });
    }

    const coins = await AppstoreApi.getPrhnBalance(merged.appstore_pk);
    const balance = coins.code === RESP_CODES.SUCCESS.code ? +coins.data.prhn_value : -1;

    const appstoreRow = await PointModel.findAppstorePointStatsByUserPk(user.user_pk);
    const appstorePoints = appstoreRow ? appstoreRow.total_points || 0 : 0;

    const karaokeRow = await PointModel.findKaraokePointStatsByUserPk(user.user_pk);
    const karaokePoints = karaokeRow ? karaokeRow.total_points || 0 : 0;

    const bmediaRow = await PointModel.findBMediaPointStatsByUserPk(user.user_pk);
    const bmediaPoints = bmediaRow ? bmediaRow.total_points || 0 : 0;

    const minusRow = await PointModel.findTotalSoftPointByFilter({ user_pk: user.user_pk, point_type: SOFT_POINT_TYPES.MANAGER, is_agency: FLAG_USER });
    const minusPoints = minusRow ? minusRow.sum_points || 0 : 0;

    const intRow = await PremiumModel.findIntegratedUserValueByUserPk(user.user_pk);
    const intData = {
      commerce_value: intRow ? intRow.commerce_value : 0,
      exp_value: intRow ? intRow.exp_value : 0,
      soft_points: appstorePoints + karaokePoints + bmediaPoints,
      phone_reg_points: intRow ? intRow.phone_reg_points : 0,
      eprod_reg_points: intRow ? intRow.eprod_reg_points : 0,
      activity_points: intRow ? intRow.activity_points : 0,
    }
    let int_class_name = "";
    let int_class_level = 1;
    let int_user_value = 0;
    const intResp = await updateIntegratedUserValue(user.user_pk, intData, !intRow);
    if (intResp.code === RESP_CODES.SUCCESS.code) {
      int_class_name = intResp.data.class_name;
      int_class_level = intResp.data.class_level;
      int_user_value = intResp.data.user_value;
    }

    const data = {
      balance,
      purchase_point: appstorePoints + karaokePoints + bmediaPoints + minusPoints,
      appstore_point: appstorePoints,
      karaoke_point: karaokePoints,
      bmedia_point: bmediaPoints,
      minus_point: minusPoints,
      accum_points: appstorePoints + karaokePoints + bmediaPoints,
      int_class_level,
      int_class_name,
      int_user_value,
    };

    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchAppstoreWalletBalanceV2(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  let user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const merged = await UserModel.findMergeIdByFilter({ pvendor_pk: user.user_pk });
    if (!merged || !merged.appstore_pk) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_MERGE_APPSTORE_NOT_EXIST") });
    }

    user = await UserModel.findUserByPk(user.user_pk);

    let prhn_point = 0;
    let foreign_point = 0;
    const coinResp = await AppstoreApi.getPrhnBalance(merged.appstore_pk);
    if (coinResp.code === RESP_CODES.SUCCESS.code) {
      prhn_point = coinResp.data.native_score;
      foreign_point = coinResp.data.foreign_score;
    }

    const appstoreRow = await PointModel.findAppstorePointStatsByUserPk(user.user_pk);
    const appstorePoints = appstoreRow ? appstoreRow.total_points || 0 : 0;

    const karaokeRow = await PointModel.findKaraokePointStatsByUserPk(user.user_pk);
    const karaokePoints = karaokeRow ? karaokeRow.total_points || 0 : 0;

    const bmediaRow = await PointModel.findBMediaPointStatsByUserPk(user.user_pk);
    const bmediaPoints = bmediaRow ? bmediaRow.total_points || 0 : 0;

    const minusRow = await PointModel.findTotalSoftPointByFilter({ user_pk: user.user_pk, point_type: SOFT_POINT_TYPES.MANAGER, is_agency: FLAG_USER });
    const minusPoints = minusRow ? minusRow.sum_points || 0 : 0;

    const data = {
      prhn_point,
      foreign_point,
      purchase_point: appstorePoints + karaokePoints + bmediaPoints + minusPoints,
      appstore_point: appstorePoints,
      karaoke_point: karaokePoints,
      bmedia_point: bmediaPoints,
      minus_point: minusPoints,
      accum_points: appstorePoints + karaokePoints + bmediaPoints,
    };

    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchAccountTotalInfo(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  let eshop;
  let software = {};
  let eprod = {};
  let activity = {};
  let int_class_name = "";
  let int_class_level = 1;
  let int_user_value = 0;

  try {
    const userInfo = await UserModel.findUserByPk(user.user_pk);
    if (!userInfo) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    const merged = await UserModel.findMergeIdByFilter({ pvendor_pk: user.user_pk });

    let funcs = [WebApi.fetchEprodRegistBalance(userInfo.user_id)];
    if (merged && merged.eshop_pk) {
      funcs = [...funcs, EshopApi.fetchCardInfo(merged.eshop_pk)];
    }
    if (merged && merged.appstore_pk) {
      funcs = [...funcs, AppstoreApi.getPrhnBalance(merged.appstore_pk)];
    }
    const resp = await Promise.all(funcs);
    if (resp[0].code === RESP_CODES.SUCCESS.code) {
      eprod = {
        sum_total: +resp[0].data.sum_total,
      };
    }
    if (merged && merged.eshop_pk && resp[1].code === RESP_CODES.SUCCESS.code) {
      eshop = resp[1].data;
    }
    if (merged && merged.appstore_pk) {
      const resp_appstore = (merged.eshop_pk) ? resp[2] : resp[1];
      if (resp_appstore.code === RESP_CODES.SUCCESS.code) {
        software = {
          ...software,
          balance: +resp_appstore.data.prhn_value,
        }
      }
    }

    /** soft points */
    const appstoreRow = await PointModel.findAppstorePointStatsByUserPk(user.user_pk);
    const appstorePoints = appstoreRow ? appstoreRow.total_points || 0 : 0;
    const karaokeRow = await PointModel.findKaraokePointStatsByUserPk(user.user_pk);
    const karaokePoints = karaokeRow ? karaokeRow.total_points || 0 : 0;
    const bmediaRow = await PointModel.findBMediaPointStatsByUserPk(user.user_pk);
    const bmediaPoints = bmediaRow ? bmediaRow.total_points || 0 : 0;
    const softMinusRow = await PointModel.findTotalSoftPointByFilter({ user_pk: user.user_pk, point_type: SOFT_POINT_TYPES.MANAGER, is_agency: FLAG_USER });
    const softMinusPoints = softMinusRow ? (softMinusRow.sum_points || 0) : 0;
    software = {
      ...software,
      purchase_point: appstorePoints + karaokePoints + bmediaPoints + softMinusPoints,
      appstore_point: appstorePoints,
      karaoke_point: karaokePoints,
      bmedia_point: bmediaPoints,
      minus_point: softMinusPoints,
      accum_points: appstorePoints + karaokePoints + bmediaPoints,
    };

    /** register points */
    const minusFilter = {
      user_pk: user.user_pk,
      point_type: REG_POINT_TYPES.MANAGER,
      status: REG_POINT_STATUS.MINUS,
    };
    const regMinusRow = await PointModel.calcRegisterPointLogByFilter(minusFilter);
    const regMinusPoints = regMinusRow ? regMinusRow.sum_points || 0 : 0;
    const phoneRow = await ProductModel.calcRegisterPhoneLogByUserPk(user.user_pk);
    const phonePoints = phoneRow ? phoneRow.sum_points || 0 : 0;
    eprod = {
      ...eprod,
      sum_minus: regMinusPoints,
      now_total: (eprod.sum_total || 0) + phonePoints + regMinusPoints,
      phone_points: phonePoints,
    };

    /** activity points */
    const activityStats = await PointModel.findActivityPointStatsByUserPk(user.user_pk);
    activity = {
      ...activity,
      total_points: activityStats ? activityStats.total_points : 0,
    }

    const intRow = await PremiumModel.findIntegratedUserValueByUserPk(user.user_pk);
    const intData = {
      commerce_value: eshop ? eshop.commerce_value : (intRow ? intRow.commerce_value : 0),
      exp_value: eshop ? eshop.accum_value : (intRow ? intRow.exp_value : 0),
      soft_points: software ? software.accum_points : (intRow ? intRow.accum_points : 0),
      phone_reg_points: phonePoints,
      eprod_reg_points: eprod.sum_total ? eprod.sum_total : (intRow ? intRow.eprod_reg_points : 0),
      activity_points: activityStats ? (+activityStats.total_points - activityStats.minus_points) : 0,
    };
    const intResp = await updateIntegratedUserValue(user.user_pk, intData, !intRow);
    if (intResp.code === RESP_CODES.SUCCESS.code) {
      int_class_name = intResp.data.class_name;
      int_class_level = intResp.data.class_level;
      int_user_value = intResp.data.user_value;
    }
    const data = {
      eshop,
      software,
      eprod,
      activity,
      int_class_name,
      int_class_level,
      int_user_value,
    };
    
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchAccountTotalInfoV2(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  let user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  let eshop;
  let software = {};
  let eprod = {};
  let activity = {};
  let int_class_name = "";
  let int_class_level = 1;
  let int_user_value = 0;

  try {
    const userInfo = await UserModel.findUserByPk(user.user_pk);
    if (!userInfo) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    const merged = await UserModel.findMergeIdByFilter({ pvendor_pk: user.user_pk });

    let funcs = [WebApi.fetchEprodRegistBalance(userInfo.user_id)];
    if (merged && merged.eshop_pk) {
      funcs = [...funcs, EshopApi.fetchCardInfo(merged.eshop_pk)];
    }
    if (merged && merged.appstore_pk) {
      funcs = [...funcs, AppstoreApi.getPrhnBalance(merged.appstore_pk)];
    }
    const resp = await Promise.all(funcs);
    if (resp[0].code === RESP_CODES.SUCCESS.code) {
      eprod = {
        sum_total: +resp[0].data.sum_total,
      };
    }
    if (merged && merged.eshop_pk && resp[1].code === RESP_CODES.SUCCESS.code) {
      eshop = resp[1].data;
    }
    if (merged && merged.appstore_pk) {
      const resp_appstore = (merged.eshop_pk) ? resp[2] : resp[1];
      if (resp_appstore.code === RESP_CODES.SUCCESS.code) {
        software = {
          ...software,
          prhn_point: +resp_appstore.data.native_score,
          foreign_point: +resp_appstore.data.foreign_score,
        }
      }
    }

    /** soft points */
    const appstoreRow = await PointModel.findAppstorePointStatsByUserPk(user.user_pk);
    const appstorePoints = appstoreRow ? appstoreRow.total_points || 0 : 0;
    const karaokeRow = await PointModel.findKaraokePointStatsByUserPk(user.user_pk);
    const karaokePoints = karaokeRow ? karaokeRow.total_points || 0 : 0;
    const bmediaRow = await PointModel.findBMediaPointStatsByUserPk(user.user_pk);
    const bmediaPoints = bmediaRow ? bmediaRow.total_points || 0 : 0;
    const softMinusRow = await PointModel.findTotalSoftPointByFilter({ user_pk: user.user_pk, point_type: SOFT_POINT_TYPES.MANAGER, is_agency: FLAG_USER });
    const softMinusPoints = softMinusRow ? (softMinusRow.sum_points || 0) : 0;
    software = {
      ...software,
      purchase_point: appstorePoints + karaokePoints + bmediaPoints + softMinusPoints,
      appstore_point: appstorePoints,
      karaoke_point: karaokePoints,
      bmedia_point: bmediaPoints,
      minus_point: softMinusPoints,
      accum_points: appstorePoints + karaokePoints + bmediaPoints,
    };

    /** register points */
    const minusFilter = {
      user_pk: user.user_pk,
      point_type: REG_POINT_TYPES.MANAGER,
      status: REG_POINT_STATUS.MINUS,
    };
    const regMinusRow = await PointModel.calcRegisterPointLogByFilter(minusFilter);
    const regMinusPoints = regMinusRow ? regMinusRow.sum_points || 0 : 0;
    const phoneRow = await ProductModel.calcRegisterPhoneLogByUserPk(user.user_pk);
    const phonePoints = phoneRow ? phoneRow.sum_points || 0 : 0;
    eprod = {
      ...eprod,
      sum_minus: regMinusPoints,
      now_total: (eprod.sum_total || 0) + phonePoints + regMinusPoints,
      phone_points: phonePoints,
    };

    /** activity points */
    const activityStats = await PointModel.findActivityPointStatsByUserPk(user.user_pk);
    activity = {
      ...activity,
      total_points: activityStats ? activityStats.total_points : 0,
    }

    // const intRow = await PremiumModel.findIntegratedUserValueByUserPk(user.user_pk);
    // const intData = {
    //   commerce_value: eshop ? eshop.commerce_value : (intRow ? intRow.commerce_value : 0),
    //   exp_value: eshop ? eshop.accum_value : (intRow ? intRow.exp_value : 0),
    //   soft_points: software ? software.accum_points : (intRow ? intRow.accum_points : 0),
    //   phone_reg_points: phonePoints,
    //   eprod_reg_points: eprod.sum_total ? eprod.sum_total : (intRow ? intRow.eprod_reg_points : 0),
    //   activity_points: activityStats ? (+activityStats.total_points - activityStats.minus_points) : 0,
    // };
    // const intResp = await updateIntegratedUserValue(user.user_pk, intData, !intRow);
    // if (intResp.code === RESP_CODES.SUCCESS.code) {
    //   int_class_name = intResp.data.class_name;
    //   int_class_level = intResp.data.class_level;
    //   int_user_value = intResp.data.user_value;
    // }
    const data = {
      eshop,
      software,
      eprod,
      activity,
      int_class_name,
      int_class_level,
      int_user_value,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchEprodRegistBalance(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    /** fetch userinfo by user_pk to fix error fetching by original mobile user_id after merge fixed_id */
    const userInfo = await UserModel.findUserByPk(user.user_pk);
    if (!userInfo) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    const resp = await WebApi.fetchEprodRegistBalance(userInfo.user_id);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    const minusFilter = {
      user_pk: user.user_pk,
      point_type: REG_POINT_TYPES.MANAGER,
      status: REG_POINT_STATUS.MINUS,
    };
    const minusRow = await PointModel.calcRegisterPointLogByFilter(minusFilter);
    const minusPoints = minusRow ? minusRow.sum_points || 0 : 0;
    const phoneRow = await ProductModel.calcRegisterPhoneLogByUserPk(user.user_pk);
    const phonePoints = phoneRow ? phoneRow.sum_points || 0 : 0;

    const intRow = await PremiumModel.findIntegratedUserValueByUserPk(user.user_pk);
    const intData = {
      commerce_value: intRow ? intRow.commerce_value : 0,
      exp_value: intRow ? intRow.exp_value : 0,
      soft_points: intRow ? intRow.soft_points : 0,
      phone_reg_points: phonePoints,
      eprod_reg_points: resp.data.sum_total ? +resp.data.sum_total : (intRow ? intRow.eprod_reg_points : 0),
      activity_points: intRow ? intRow.activity_points : 0,
    }
    let int_class_name = "";
    let int_class_level = 1;
    let int_user_value = 0;
    const intResp = await updateIntegratedUserValue(user.user_pk, intData, !intRow);
    if (intResp.code === RESP_CODES.SUCCESS.code) {
      int_class_name = intResp.data.class_name;
      int_class_level = intResp.data.class_level;
      int_user_value = intResp.data.user_value;
    }

    const data = {
      sum_total: +resp.data.sum_total,
      sum_minus: minusPoints,
      now_total: +resp.data.sum_total + phonePoints + minusPoints,
      phone_points: phonePoints,
      int_class_name,
      int_class_level,
      int_user_value,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchEprodRegistAddLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  try {
    /** fetch userinfo by user_pk to fix error fetching by original mobile user_id after merge fixed_id */
    const userInfo = await UserModel.findUserByPk(user.user_pk);
    if (!userInfo) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    const resp = await WebApi.fetchEprodRegistAddLog(userInfo.user_id, offset, limit);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    const root_pks = resp.data.data.filter(row => +row.status === EPROD_REGISTER_STATUS.APPROVED).map(row => +row.crm_prod_category_im_pk);
    const order_rows = await CrmModel.findSpecOrdersForEprodInRootPks(root_pks);

    const sns = resp.data.data.filter(row => +row.status === EPROD_REGISTER_STATUS.APPROVED).map(row => row.sn_num);
    const crm_rows = await CrmModel.findCrmEprodSalesInSNs(sns);

    const data = {
      total: +resp.data.total,
      rows: resp.data.data.map(row => {
        const crm_row = crm_rows.find(item => item.serial_no === row.sn_num);
        const spec_keys = order_rows.filter(item => item.root_pk === +row.crm_prod_category_im_pk).map(item => item.spec_key);
        const crm_spec_pks = order_rows.filter(item => item.root_pk === +row.crm_prod_category_im_pk).map(item => item.spec_pk).join(CRM_SPLITTER);
        const crm_values = crm_row ? spec_keys.map(item => crm_row[item]).join(CRM_SPLITTER) : "";
        
        return ({
          contact_num: row.contact_num || "",
          address: row.address || "",
          sn_num: row.sn_num || "",
          product_name: row.product_name || "",
          created_at: row.created_at || "",
          status: +row.status,
          bonus_score: +row.bonus_score,
          ecid: crm_row ? crm_row.ecid : "",
          phone_number: crm_row ? crm_row.phone_number : "",
          root_pk: +row.crm_prod_category_im_pk,
          category_name: row.crm_prod_category_name,
          crm_spec_pks,
          crm_values,
        });
      }),
      sum_total: +resp.data.sum_total,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function getProductNameBySN(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["sn"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const resp = await WebApi.fetchEprodProductNameBySN(params.sn);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    const data = {
      bonus_pk: +resp.data.bonus_pk,
      product_name: resp.data.product_name,
      is_duplicate: +resp.data.is_duplicate,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function getProductNameBySnV2(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["sn"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const resp = await WebApi.fetchEprodProductNameBySN(params.sn);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    const data = {
      bonus_pk: +resp.data.bonus_pk,
      product_name: resp.data.product_name,
      is_duplicate: +resp.data.is_duplicate,
      root_pk: resp.data.crm_prod_category_im_pk,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function checkProductDuplicationBySN(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["sn"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const resp = await WebApi.checkEprodDuplicationBySN(params.sn);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addRegisterProduct(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["phone_number", "sn_num", "product_name", "bonus_pk"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const locInfo = await UserModel.findLocationFullNameByUserPk(user.user_pk);
    if (!locInfo) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("EPROD_ERR_NO_ADDRESS") });
    }

    const prodParams = {
      phonenum: params.phone_number,
      address: locInfo.full_name,
      sn_num: params.sn_num,
      product_name: params.product_name,
      bonus_pk: params.bonus_pk,
      userid: user.user_id,
    };
    const resp = await WebApi.addRegisterProduct(prodParams);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    let phoneParams = {
      user_pk: user.user_pk,
      phone_number: params.phone_number,
    };
    const phoneRows = await UserModel.findUserPhonesByFilter(phoneParams);
    if (phoneRows.length === 0) {
      phoneParams = { ...phoneParams, phone_type: PHONE_TYPE.EPROD };
      const phoneRow = await UserModel.addPhoneNumber(phoneParams);
      if (!phoneRow) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_ERR_ADD_PHONE_NUMBER") });
      }
    }

    const data = {
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addRegisterProductV2(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["phone_number", "sn_num", "product_name", "bonus_pk", "crm_keys", "crm_values"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const locInfo = await UserModel.findLocationFullNameByUserPk(user.user_pk);
    if (!locInfo) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("EPROD_ERR_NO_ADDRESS") });
    }

    const crm_keys = params.crm_keys.split(CRM_SPLITTER).map(item => item.trim()).filter(item => !!item);
    const crm_values = params.crm_values.split(CRM_SPLITTER).map(item => item.trim()).filter(item => !!item);
    let crm_pairs = {};
    for (let i = 0; i < crm_keys.length; i++) {
      crm_pairs = { ...crm_pairs, [crm_keys[i]]: crm_values.length > i ? crm_values[i] : "" };
    }

    const prodParams = {
      phonenum: params.phone_number,
      address: locInfo.full_name,
      sn_num: params.sn_num,
      product_name: params.product_name,
      bonus_pk: params.bonus_pk,
      userid: user.user_id,
      crm_info: JSON.stringify(crm_pairs),
    };
    const resp = await WebApi.addRegisterProduct(prodParams);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    let phoneParams = {
      user_pk: user.user_pk,
      phone_number: params.phone_number,
    };
    const phoneRows = await UserModel.findUserPhonesByFilter(phoneParams);
    if (phoneRows.length === 0) {
      phoneParams = { ...phoneParams, phone_type: PHONE_TYPE.EPROD };
      const phoneRow = await UserModel.addPhoneNumber(phoneParams);
      if (!phoneRow) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_ERR_ADD_PHONE_NUMBER") });
      }
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

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["type", "merge_id", "merge_pwd"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await UserModel.findMergeIdByFilter({ pvendor_pk: user.user_pk });
    if (exist) {
      if ((+params.type === MERGE_ID_TYPE.FIXED && exist.fixed_id) 
        || (+params.type === MERGE_ID_TYPE.APPSTORE && exist.appstore_id)
        || (+params.type === MERGE_ID_TYPE.ESHOP && exist.eshop_id)
        || (+params.type === MERGE_ID_TYPE.MASS && exist.mass_id)
      ) {
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
      if (fixedExist && fixedExist.user_pk !== user.user_pk) {
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
    if (dup && dup.pvendor_pk !== user.user_pk) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("USER_MERGE_FIXED_CONFLICT") });
    }

    const userInfo = await UserModel.findUserByPk(user.user_pk);
    if (!userInfo) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_INFO_NOT_FOUND") });
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
        dbParams = { ...dbParams, appstore_id: resp.data.appstore_id, appstore_pk: resp.data.appstore_pk };

        // add soft point from appstore
        const appstoreLogParams = {
          status: SOFT_POINT_STATUS.PLUS,
          reason: getLangText("POINT_REASON_MERGE_APPSTORE_ID"),
          soft_points: +resp.data.appstore_point,
          related_pk: SOFT_POINT_PREDEFINED_RELATED_PKS.MOBILE_APPSTORE,
          action_at: "",
        };
        await processAppstorePointLogByUserPk(user.user_pk, appstoreLogParams);
      } else {
        return res.status(resp.code).json(resp);
      }

      /** also merge mass id */
      const resp2 = await MassApi.mergeUserId(userInfo.user_id, userInfo.password, userInfo.user_name, formatDateForClient(userInfo.birthday), params.merge_id, params.merge_pwd, "");
      if (resp2.code === RESP_CODES.SUCCESS.code) {
        dbParams = { ...dbParams, mass_id: resp2.data.mass_id, mass_pk: resp2.data.mass_pk };
      } else {
        // return res.status(resp2.code).json(resp2);
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
      const count = await UserModel.editMergeId({ pvendor_pk: user.user_pk, ...dbParams });
      if (count === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }
    } else {
      const row = await UserModel.addMergeId({ pvendor_pk: user.user_pk, pvendor_id: user.user_id, ...dbParams });
      if (!row) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }
    }

    const logParams = {
      pvendor_pk: user.user_pk,
      pvendor_id: user.user_id,
      id_type: params.type,
      merge_id: params.merge_id,
      merge_type: MERGE_TYPE.MERGE,
      action_type: ACTION_TYPE.USER,
      action_by: user.user_pk,
    };
    await UserModel.addMergeLog(logParams);

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function registerUserId(req, res) {
  return res.status(RESP_CODES.BAD_REQUEST.code).json(RESP_CODES.BAD_REQUEST);
}

async function splitUserId(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["type"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await UserModel.findMergeIdByFilter({ pvendor_pk: user.user_pk });
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
      dbParams = { fixed_id: "", fixed_pk: 0 };
    } else if (+params.type === MERGE_ID_TYPE.APPSTORE) {
      dbParams = { appstore_id: "", appstore_pk: "" };
    } else if (+params.type === MERGE_ID_TYPE.ESHOP) {
      dbParams = { eshop_id: "", eshop_pk: "" };
    } else if (+params.type === MERGE_ID_TYPE.MASS) {
      dbParams = { mass_id: "", mass_pk: "" };
    }

    const count = await UserModel.editMergeId({ pvendor_pk: user.user_pk, ...dbParams });
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const logParams = {
      pvendor_pk: user.user_pk,
      pvendor_id: exist.pvendor_id,
      id_type: params.type,
      merge_id: "",
      merge_type: MERGE_TYPE.SPLIT,
      action_type: ACTION_TYPE.USER,
      action_by: user.user_pk,
    };
    await UserModel.addMergeLog(logParams);

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchAppstoreWalletBalance,
  fetchAppstoreWalletBalanceV2,
  fetchAccountTotalInfo,
  fetchAccountTotalInfoV2,
  fetchEprodRegistBalance,
  fetchEprodRegistAddLog,
  getProductNameBySN,
  getProductNameBySnV2,
  checkProductDuplicationBySN,
  addRegisterProduct,
  addRegisterProductV2,
  mergeUserId,
  registerUserId,
  splitUserId,
};
