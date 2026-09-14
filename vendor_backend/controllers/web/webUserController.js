const moment = require('moment');
const { validationResult } = require('express-validator');
const PointModel = require('../../models/pointModel');
const EprodModel = require('../../models/eprodModel');
const UserModel = require('../../models/userModel');
const CustomerModel = require('../../models/customerModel');
const MessageModel = require('../../models/messageModel');
const WebApi = require('../../api/webApi');
const { createResponse } = require('../../utils/response');
const { extractValidParams, formatTimeForClient } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { SOFT_POINT_TYPES, DEFAULT_PAGE_SIZE, MERGE_TYPE, FLAG_EXIST, ACTION_TYPE, FEEDBACK_MESSAGE_MAX_COUNT_PER_DAY, THREAD_STATUS, FLAG_DELETED, FLAG_NONE, FLAG_READ, FEEDBACK_THREAD_LAST_TYPE } = require('../../constants/constants');

async function fetchSoftPointLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: "action_at", dir: "desc" };
  const from = req.query.start_date || "";
  const to = req.query.end_date || "";
  const keyword = req.query.keyword || "";
  const point_type = req.query.point_type;
  const status = req.query.status;

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const filter = { offset, limit, sort, user_pk: user.user_pk, from, to, status, keyword, is_client: 1 };
    let total = 0;
    let rows = [];
    if (+point_type === SOFT_POINT_TYPES.APPSTORE) {
      total = await PointModel.findAppstorePointLog(filter, true);
      rows = await PointModel.findAppstorePointLog(filter, false);
    } else if (+point_type === SOFT_POINT_TYPES.KARAOKE) {
      total = await PointModel.findKaraokePointLog(filter, true);
      rows = await PointModel.findKaraokePointLog(filter, false);
    } else if (+point_type === SOFT_POINT_TYPES.BMEDIA) {
      total = await PointModel.findBMediaPointLog(filter, true);
      rows = await PointModel.findBMediaPointLog(filter, false);
    } else if (+point_type === SOFT_POINT_TYPES.MANAGER) {
      total = await PointModel.findSoftPointLog({ ...filter, point_type }, true);
      rows = await PointModel.findSoftPointLog({ ...filter, point_type }, false);
    } else {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")} (point_type)` });
    }

    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchKaraOldLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const merge_row = await UserModel.findMergeLogByFixedId(user.user_id);
    let limit_time = "";
    if (merge_row && merge_row.merge_type === MERGE_TYPE.MERGE) {
      limit_time = merge_row.action_at;
    }

    const filter = { offset, limit, user_id: user.user_id, limit_time };
    const total = await EprodModel.findKaraOldLog(filter, true);
    const rows = await EprodModel.findKaraOldLog(filter, false);

    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchBMediaOldLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const merge_row = await UserModel.findMergeLogByFixedId(user.user_id);
    let limit_time = "";
    if (merge_row && merge_row.merge_type === MERGE_TYPE.MERGE) {
      limit_time = merge_row.action_at;
    }

    const filter = { offset, limit, user_id: user.user_id, limit_time };
    const total = await EprodModel.findBMediaOldLog(filter, true);

    let rows = [];
    if (total === offset) {
      const last = await EprodModel.findBMediaOldOne(user.user_id);
      rows = [last];
    } else if (total < offset + limit) { // fetch 1st and 2nd
      const last = await EprodModel.findBMediaOldOne(user.user_id);
      const extra = await EprodModel.findBMediaOldLog(filter, false);
      rows = [...extra, last];
    } else {
      rows = await EprodModel.findBMediaOldLog(filter, false);
    }

    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchActivityPointLog(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: "action_at", dir: "desc" };
  const from = req.query.start_date || "";
  const to = req.query.end_date || "";
  const keyword = req.query.keyword || "";
  const point_type_prefix = +req.query.point_type_prefix || 0;

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const filter = { offset, limit, sort, user_pk: user.user_pk, from, to, point_type_prefix, keyword, is_client: 1 };
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

async function fetchActivityOldLog(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: "fill_date", dir: "desc" };
  const from = req.query.start_date || "";
  const to = req.query.end_date || "";
  const keyword = req.query.keyword || "";

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const customer = await CustomerModel.findCustomerById(user.user_id);
  if (!customer) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("USER_INFO_NOT_FOUND") });
  }

  const filter = { offset, limit, sort, keyword, customer_id: customer.user_pk, from, to };
  try {
    const total = await CustomerModel.findCustomerPrizeLog(filter, true);
    const rows = await CustomerModel.findCustomerPrizeLog(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchFeedbackThreads(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const offset = +req.query.offset || 0;
    const limit = +req.query.limit || 0;
    const sort = { key: "updated_at", dir: "desc" };
    const keyword = req.query.keyword || "";
    const category = req.query.category ? +req.query.category : -1;
    const status = req.query.status ? +req.query.status : -1;
    const from = req.query.from || "";
    const to = req.query.to || "";

    const filter = { offset, limit, sort, keyword, user_pk: user.user_pk, category, status, from, to, is_deleted: FLAG_EXIST, is_client: 1 };
    const total = await MessageModel.findFeedbackThreads(filter, true);
    const rows = await MessageModel.findFeedbackThreads(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function editFeedbackThread(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["thread_pk", "status", "is_deleted"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const threadRow = await MessageModel.findFeedbackThreadByPk(params.thread_pk);
    if (!threadRow) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await MessageModel.editFeedbackThread(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    if (threadRow.status !== +params.status) {
      const logParams = {
        thread_pk: params.thread_pk,
        status: params.status,
        action_type: ACTION_TYPE.USER,
        action_by: user.user_pk,
      };
      await MessageModel.addFeedbackStatusLog(logParams);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchFeedbackMessages(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: "action_at", dir: "asc" };
  const keyword = req.query.keyword || "";
  const thread_pk = req.query.thread_pk;

  const filter = { offset, limit, sort, thread_pk, keyword, is_client: 1 };

  try {
    if (thread_pk) {
      const threadRow = await MessageModel.findFeedbackThreadByPk(thread_pk);
      if (!threadRow) {
        return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("FEEDBACK_NOT_FOUND_THREAD") });
      }

      if (threadRow.is_deleted === FLAG_DELETED) {
        return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("FEEDBACK_ERR_ALREADY_DELETED") });
      }

      if (threadRow.is_read === FLAG_NONE) {
        const threadParams = {
          thread_pk,
          is_read: FLAG_READ,
        };
        const threadCount = await MessageModel.editFeedbackThread(threadParams);
        if (threadCount === 0) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
        }
      }
    }

    const total = await MessageModel.findFeedbackMessages(filter, true);
    const rows = await MessageModel.findFeedbackMessages(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addFeedbackMessage(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["thread_pk", "category", "title", "message"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const today = moment().format("YYYY-MM-DD");
    let threadRow;
    let thread_pk = params.thread_pk;
    if (thread_pk) {
      threadRow = await MessageModel.findFeedbackThreadByPk(params.thread_pk);
      if (!threadRow) {
        return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
      }
      if ([THREAD_STATUS.RESOLVED, THREAD_STATUS.FINISHED].includes(threadRow.status)) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("FEEDBACK_ALREADY_FINISHED") });
      }
    } else {
      const threadCount = await MessageModel.findFeedbackThreadCountByUser(user.user_pk, today);
      if (threadCount >= FEEDBACK_THREAD_MAX_COUNT_PER_DAY) {
        return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("FEEDBACK_ERR_MAX_MSG_COUNT", [FEEDBACK_MESSAGE_MAX_COUNT_PER_DAY]) });
      }
      const threadParams = {
        user_pk: user.user_pk,
        title: params.title,
        category: params.category,
        last_message: params.message,
        last_type: FEEDBACK_THREAD_LAST_TYPE.PENDING,
        status: THREAD_STATUS.DISCUSSING,
        thread_source: FEEDBACK_THREAD_SOURCES.PID,
        is_read: FLAG_READ,
      };
      threadRow = await MessageModel.addFeedbackThread(threadParams);
      if (!threadRow) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("FEEDBACK_FAIL_ADD_THREAD") });
      }
      thread_pk = threadRow.thread_pk;
    }

    const msgCount = await MessageModel.findFeedbackMessageCountByThread(thread_pk, today);
    if (msgCount >= FEEDBACK_MESSAGE_MAX_COUNT_PER_DAY) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("FEEDBACK_ERR_MAX_MSG_COUNT", [FEEDBACK_MESSAGE_MAX_COUNT_PER_DAY]) });
    }

    const messageParams = {
      thread_pk,
      message: params.message,
      action_type: ACTION_TYPE.USER,
      action_by: user.user_pk,
    };
    let msgRow = await MessageModel.addFeedbackMessage(messageParams);
    if (!msgRow) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }
    msgRow = { ...msgRow, action_at: formatTimeForClient(msgRow.action_at) };

    let last_message = params.message;
    let is_read = FLAG_READ;

    let data;
    if (params.thread_pk) {
      const threadParams = {
        thread_pk,
        last_message,
        last_type: FEEDBACK_THREAD_LAST_TYPE.PENDING,
        is_read,
        status: THREAD_STATUS.DISCUSSING,
      };
      const count = await MessageModel.editFeedbackThread(threadParams);
      if (count === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("FEEDBACK_FAIL_EDIT_LAST_MSG") });
      }
      data = { row: msgRow };
    } else {
      threadRow = { ...threadRow, updated_at: formatTimeForClient(msgRow.updated_at) };
      data = { row: threadRow };
    }

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

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }
  try {
    const offset = +req.query.offset || 0;
    const limit = +req.query.limit || DEFAULT_PAGE_SIZE;

    const resp = await WebApi.fetchEprodRegistAddLog(user.user_id, offset, limit);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    const data = {
      total: +resp.data.total,
      rows: resp.data.data.map(row => ({
        table_pk: row.pk,
        contact_num: row.contact_num || "",
        address: row.address || "",
        sn_num: row.sn_num || "",
        product_name: row.product_name || "",
        created_at: row.created_at || "",
        status: +row.status,
        bonus_score: +row.bonus_score,
      })),
      sum_total: +resp.data.sum_total,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function sendEprodLicenseErrorReport(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["lic_id", "phone_number", "report"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const reportParams = {
      lic_id: params.lic_id,
      phone_number: params.phone_number,
      error_reason: params.report,
    };

    const resp = await WebApi.sendLicenseErrorReport(reportParams);

    return res.status(resp.code).json(resp);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchKaraokeKeygenLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }
  try {
    const offset = +req.query.offset || 0;
    const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
    const keyword = req.query.keyword || "";
    const start_date = req.query.from || "";
    const end_date = req.query.to || "";
    const params = {
      userid: user.user_id,
      offset,
      limit,
      keyword,
      start_date,
      end_date,
    };

    const resp = await WebApi.fetchKaraokeKeygenLog(params);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    const data = {
      total: resp.data.total,
      rows: resp.data.rows.map(row => ({
        id: row.id,
        machinekey: row.machinekey,
        real_price: row.real_price,
        is_agent: row.is_agent,
        resultlog: row.resultlog,
        message: row.message,
        transaction_number: row.transaction_number,
        error_status: row.error_status,
        licensefilepath: row.licensefilepath,
        updated_at: row.updated_at,
      })),
    }
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchManbangKeygenLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }
  try {
    const offset = +req.query.offset || 0;
    const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
    const keyword = req.query.keyword || "";
    const start_date = req.query.from || "";
    const end_date = req.query.to || "";
    const params = {
      userid: user.user_id,
      offset,
      limit,
      keyword,
      start_date,
      end_date,
    };

    const resp = await WebApi.fetchManbangKeygenLog(params);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    const data = {
      total: resp.data.total,
      rows: resp.data.rows.map(row => ({
        id: row.id,
        machinekey: row.machinekey,
        real_price: row.real_price,
        is_agent: row.is_agent,
        resultlog: row.resultlog,
        message: row.message,
        transaction_number: row.transaction_number,
        error_status: row.error_status,
        licensefilepath: row.licensefilepath,
        updated_at: row.updated_at,
      })),
    }
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchBMediaProviders(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const resp = await WebApi.fetchBMediaProviders();
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    const data = {
      total: resp.data.total,
      rows: resp.data.rows.map(row => ({
        id: +row.id,
        name: row.name,
        short_name: row.short_name,
      })),
    }
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchBMediaKeygenLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }
  try {
    const offset = +req.query.offset || 0;
    const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
    const keyword = req.query.keyword || "";
    const start_date = req.query.from || "";
    const end_date = req.query.to || "";
    const provider = req.query.provider || "";
    const agency_type = req.query.agency_type;
    const params = {
      userid: user.user_id,
      offset,
      limit,
      keyword,
      start_date,
      end_date,
      provider,
      agency_type,
    };

    const resp = await WebApi.fetchBMediaKeygenLog(params);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    const data = {
      total: resp.data.total,
      rows: resp.data.rows.map(row => ({
        id: row.id,
        dev_id: row.dev_id,
        short_name: row.short_name,
        is_agent: row.is_agent,
        cal_price: row.cal_price,
        bonus_price: row.bonus_price,
        date_time: row.date_time,
        license_path: row.license_path,
      })),
    }
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchBMediaKeygenById(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const id = req.query.id || "";
    const params = {
      id,
    };

    const resp = await WebApi.fetchBMediaKeygenById(params);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    const data = {
      total: resp.data.rows.length,
      rows: resp.data.rows.map(row => ({
        ...row,
      })),
    }
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchSoftPointLog,
  fetchKaraOldLog,
  fetchBMediaOldLog,
  fetchActivityPointLog,
  fetchActivityOldLog,
  fetchFeedbackThreads,
  editFeedbackThread,
  fetchFeedbackMessages,
  addFeedbackMessage,
  fetchEprodRegistAddLog,
  sendEprodLicenseErrorReport,
  fetchManbangKeygenLog,
  fetchKaraokeKeygenLog,
  fetchBMediaProviders,
  fetchBMediaKeygenLog,
  fetchBMediaKeygenById,
};
