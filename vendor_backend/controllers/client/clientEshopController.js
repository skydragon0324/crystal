const { validationResult } = require('express-validator');
const UserModel = require('../../models/userModel');
const PremiumModel = require('../../models/premiumModel');
const EshopApi = require('../../api/eshopApi');
const { updateIntegratedUserValue } = require('../common/commonPremiumController');
const { createResponse } = require('../../utils/response');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { DEFAULT_PAGE_SIZE } = require('../../constants/constants');

async function fetchEshopWalletBalance(req, res) {
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
    if (!merged || !merged.eshop_pk) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_MERGE_ESHOP_NOT_EXIST") });
    }

    const eshopResp = await EshopApi.fetchCardInfo(merged.eshop_pk);
    const eshop = eshopResp.code === RESP_CODES.SUCCESS.code ? eshopResp.data : undefined;

    const intRow = await PremiumModel.findIntegratedUserValueByUserPk(user.user_pk);
    const intData = {
      commerce_value: eshop ? eshop.commerce_value : (intRow ? intRow.commerce_value : 0),
      exp_value: eshop ? eshop.accum_value : (intRow ? intRow.exp_value : 0),
      soft_points: intRow ? intRow.soft_points : 0,
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

    if (eshopResp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(eshopResp.code).json(eshopResp);  
    }
    const data = {
      ...eshop,
      int_class_level,
      int_class_name,
      int_user_value,
    }
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
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

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const merged = await UserModel.findMergeIdByFilter({ pvendor_pk: user.user_pk });
    if (!merged || !merged.eshop_pk) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_MERGE_ESHOP_NOT_EXIST") });
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

module.exports = {
  fetchEshopWalletBalance,
  fetchEshopeWalletTransactions,
};
