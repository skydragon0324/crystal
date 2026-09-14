const { validationResult } = require('express-validator');
const UserModel = require('../../models/userModel');
const CustomerModel = require('../../models/customerModel');
const AppstoreApi = require('../../api/appstoreApi');
const { extractValidParams } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { DEFAULT_PAGE_SIZE } = require('../../constants/constants');

async function fetchAppstorePurchaseLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    let appstore_pk;
    const merged = await UserModel.findMergeIdByFilter({ pvendor_pk: user.user_pk });
    if (merged && merged.appstore_pk) {
      appstore_pk = merged.appstore_pk;
    } else {
      const customer = await CustomerModel.findCustomerById(user.user_id);
      if (customer) {
        appstore_pk = customer.unique_id;
      }
    }
    if (!appstore_pk) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("APPSTORE_USER_NOT_FOUND") });
    }

    const offset = +req.query.offset || 0;
    const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
    const keyword = req.query.keyword || "";
    const from = req.query.start_date || "";
    const to = req.query.end_date || "";

    const resp = await AppstoreApi.fetchPurchaseLog(appstore_pk, offset, limit, { keyword, from, to });
    return res.status(resp.code).json(resp);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchAppstoreLicenseQr(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const validKeys = ["purchase_history_unique_id"];
    const params = extractValidParams(req.query, validKeys);

    const resp = await AppstoreApi.fetchLicenseQr(params.purchase_history_unique_id);
    return res.status(resp.code).json(resp);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchAppstoreComments(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    let appstore_pk;
    const merged = await UserModel.findMergeIdByFilter({ pvendor_pk: user.user_pk });
    if (merged && merged.appstore_pk) {
      appstore_pk = merged.appstore_pk;
    } else {
      const customer = await CustomerModel.findCustomerById(user.user_id);
      if (customer) {
        appstore_pk = customer.unique_id;
      }
    }
    if (!appstore_pk) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("APPSTORE_USER_NOT_FOUND") });
    }

    const offset = +req.query.offset || 0;
    const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
    const keyword = req.query.keyword || "";
    const from = req.query.start_date || "";
    const to = req.query.end_date || "";

    const resp = await AppstoreApi.fetchAppstoreComments(appstore_pk, offset, limit, { keyword, from, to });
    return res.status(resp.code).json(resp);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchAppstoreFavorites(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    let appstore_pk;
    const merged = await UserModel.findMergeIdByFilter({ pvendor_pk: user.user_pk });
    if (merged && merged.appstore_pk) {
      appstore_pk = merged.appstore_pk;
    } else {
      const customer = await CustomerModel.findCustomerById(user.user_id);
      if (customer) {
        appstore_pk = customer.unique_id;
      }
    }
    if (!appstore_pk) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("APPSTORE_USER_NOT_FOUND") });
    }

    const offset = +req.query.offset || 0;
    const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
    const keyword = req.query.keyword || "";
    const from = req.query.start_date || "";
    const to = req.query.end_date || "";

    const resp = await AppstoreApi.fetchAppstoreFavorites(appstore_pk, offset, limit, { keyword, from, to });
    return res.status(resp.code).json(resp);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchWalletTransactions(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    let appstore_pk;
    const merged = await UserModel.findMergeIdByFilter({ pvendor_pk: user.user_pk });
    if (merged && merged.appstore_pk) {
      appstore_pk = merged.appstore_pk;
    } else {
      const customer = await CustomerModel.findCustomerById(user.user_id);
      if (customer) {
        appstore_pk = customer.unique_id;
      }
    }
    if (!appstore_pk) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("APPSTORE_USER_NOT_FOUND") });
    }

    const page = +req.query.offset || 0;
    const count = +req.query.limit || DEFAULT_PAGE_SIZE;
    const from = req.query.start_date || "";
    const to = req.query.end_date || "";
    const type = +req.query.type || 0;

    const filter = { page, count, from, to, type };

    const resp = await AppstoreApi.fetchTransactionLogV2(appstore_pk, filter);
    return res.status(resp.code).json(resp);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchAppstorePurchaseLog,
  fetchAppstoreLicenseQr,
  fetchAppstoreComments,
  fetchAppstoreFavorites,
  fetchWalletTransactions,
};
