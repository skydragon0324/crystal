const { validationResult } = require('express-validator');
const UserModel = require('../../models/userModel');
const CustomerModel = require('../../models/customerModel');
const EshopApi = require('../../api/eshopApi');
const { createResponse } = require('../../utils/response');
const { extractValidParams } = require('../../utils/utils');
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
    let eshop_pk;
    const merged = await UserModel.findMergeIdByFilter({ pvendor_pk: user.user_pk });
    if (merged && merged.eshop_pk) {
      eshop_pk = merged.eshop_pk;
    } else {
      const customer = await CustomerModel.findCustomerById(user.user_id);
      if (customer) {
        eshop_pk = customer.user_pk;
      }
    }
    if (!eshop_pk) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("ESHOP_USER_NOT_FOUND") });
    }

    const eshopResp = await EshopApi.fetchCardInfo(eshop_pk);
    if (eshopResp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(eshopResp.code).json(eshopResp);
    }

    const data = {
      ...eshopResp.data,
    }
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchEshopOrderList(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    let eshop_pk;
    const merged = await UserModel.findMergeIdByFilter({ pvendor_pk: user.user_pk });
    if (merged && merged.eshop_pk) {
      eshop_pk = merged.eshop_pk;
    } else {
      const customer = await CustomerModel.findCustomerById(user.user_id);
      if (customer) {
        eshop_pk = customer.user_pk;
      }
    }
    if (!eshop_pk) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("ESHOP_USER_NOT_FOUND") });
    }

    const offset = +req.query.offset || 0;
    const limit = +req.query.limit || DEFAULT_PAGE_SIZE;

    const resp = await EshopApi.fetchEshopOrderList(eshop_pk, offset, limit);
    return res.status(resp.code).json(resp);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchEshopOrderDetail(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const validKeys = ["order_id"];
    const params = extractValidParams(req.query, validKeys);

    const resp = await EshopApi.fetchEshopOrderDetail(params.order_id);
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

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    let eshop_pk;
    const merged = await UserModel.findMergeIdByFilter({ pvendor_pk: user.user_pk });
    if (merged && merged.eshop_pk) {
      eshop_pk = merged.eshop_pk;
    } else {
      const customer = await CustomerModel.findCustomerById(user.user_id);
      if (customer) {
        eshop_pk = customer.user_pk;
      }
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

    const resp = await EshopApi.fetchTransactionLog(eshop_pk, offset, limit, filter);
    return res.status(resp.code).json(resp);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchEshopWalletBalance,
  fetchEshopOrderList,
  fetchEshopOrderDetail,
  fetchEshopeWalletTransactions,
};
