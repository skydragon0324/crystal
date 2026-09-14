const { validationResult } = require('express-validator');
const UserModel = require('../../models/userModel');
const AppstoreApi = require('../../api/appstoreApi');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { DEFAULT_PAGE_SIZE } = require('../../constants/constants');

async function fetchAppstoreWalletTransactions(req, res) {
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

    const offset = +req.query.offset || 0;
    const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
    const from = req.query.from || "";
    const to = req.query.to || "";
    const transaction_type = +req.query.transaction_type || 0;
    const filter = {
      from,
      to,
      transaction_type,
    };

    const resp = await AppstoreApi.fetchTransactionLog(merged.appstore_pk, offset, limit, filter);
    return res.status(resp.code).json(resp);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchAppstoreWalletTransactionsV2(req, res) {
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

    const page = +req.query.page || 0;
    const count = +req.query.count || DEFAULT_PAGE_SIZE;
    const from = req.query.from || "";
    const to = req.query.to || "";
    const type = +req.query.type || 0;

    const filter = { page, count, from, to, type };

    const resp = await AppstoreApi.fetchTransactionLogV2(merged.appstore_pk, filter);
    return res.status(resp.code).json(resp);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchAppstoreWalletTransactions,
  fetchAppstoreWalletTransactionsV2,
};
