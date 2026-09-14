const moment = require('moment');
const { validationResult } = require('express-validator');
const MessageModel = require('../../models/messageModel');
const UserModel = require('../../models/userModel');
const DeviceModel = require('../../models/deviceModel');
const { createResponse } = require('../../utils/response');
const { extractValidParams, formatTimeForClient, extractPhoneNumberFromMessage, validatePhoneNumber } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { ACTION_TYPE, THREAD_STATUS, FLAG_READ, FLAG_NONE, FEEDBACK_CATEGORY, PHONE_TYPE, ROOT_MANAGER_PK, FEEDBACK_THREAD_LAST_TYPE, FEEDBACK_THREAD_SOURCES } = require('../../constants/constants');

async function fetchFeedbackThreads(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user_pk = req.query.user_pk || 0;
  if (!user_pk) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("FEEDBACK_ERR_USER_NOT_FOUND") });
  }

  const user = await UserModel.findUserByPk(user_pk);
  if (!user) {
    return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_INFO_NOT_FOUND") });
  }

  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || 0;
  const sort = { key: "updated_at", dir: "desc" };
  const keyword = req.query.keyword || "";
  const min_at = req.query.min_at || "";
  const max_at = req.query.max_at || "";
  const category = req.query.category;
  const status = req.query.status;

  try {
    const filter = { offset, limit, sort, user_pk, keyword, min_at, max_at, category, status, is_client: 1, include_deleted: 0 };
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
        action_by: threadRow.user_pk,
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
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "action_at", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const thread_pk = req.query.thread_pk || "";

  const filter = { offset, limit, sort, keyword, thread_pk };

  try {
    const user_info = await MessageModel.findFeedbackUserInfoByPk(thread_pk);
    if (!user_info) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }
    const user_phones = await UserModel.findPhonesInUserPks([user_info.user_pk]);
    const last_device = await DeviceModel.findLastDeviceByUserPk(user_info.user_pk);
    const total = await MessageModel.findFeedbackMessages(filter, true);
    const rows = await MessageModel.findFeedbackMessages(filter, false);
    const category_logs = await MessageModel.findFeedbackCategoryLogs(thread_pk, 5);
    const status_logs = await MessageModel.findFeedbackStatusLogs(thread_pk, 1);

    const data = {
      user_info: {
        ...user_info,
        phones: user_phones,
        last_device,
      },
      total,
      rows,
      category_logs,
      status_logs,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addFeedbackMessage(params) {
  try {
    let threadRow;
    let thread_pk = params.thread_pk;
    if (thread_pk) {
      threadRow = await MessageModel.findFeedbackThreadByPk(params.thread_pk);
      if (!threadRow) {
        return { code: RESP_CODES.NOT_FOUND.code, message: getLangText("FEEDBACK_NOT_FOUND_THREAD") };
      }
      if ([THREAD_STATUS.RESOLVED, THREAD_STATUS.FINISHED].includes(threadRow.status)) {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("FEEDBACK_ALREADY_FINISHED") };
      }
    } else {
      const user = await UserModel.findUserByPk(params.user_pk);
      if (!user) {
        return { code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_INFO_NOT_FOUND") };
      }

      const threadParams = {
        user_pk: user.user_pk,
        title: params.title,
        category: params.category,
        last_message: params.message,
        last_type: FEEDBACK_THREAD_LAST_TYPE.PENDING,
        status: THREAD_STATUS.DISCUSSING,
        is_read: FLAG_READ,
        thread_source: params.thread_source,
      };
      threadRow = await MessageModel.addFeedbackThread(threadParams);
      if (!threadRow) {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("FEEDBACK_FAIL_ADD_THREAD") };
      }
      thread_pk = threadRow.thread_pk;
    }

    const messageParams = {
      thread_pk,
      message: params.message,
      action_type: ACTION_TYPE.USER,
      action_by: threadRow.user_pk,
    };
    let msgRow = await MessageModel.addFeedbackMessage(messageParams);
    if (!msgRow) {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }
    msgRow = { ...msgRow, action_at: formatTimeForClient(msgRow.action_at) };

    let last_message = params.message;
    let is_read = FLAG_READ;

    /** process phone number */
    let isAdd = false;
    // if (false) { // +params.category === FEEDBACK_CATEGORY.CONTACT) { // contact feedback is no longer needed
    //   const lines = params.message.split(/\n/);
    //   for (const line of lines) {
    //     let phoneNum = extractPhoneNumberFromMessage(line);
    //     if (phoneNum.length === 10) {
    //       phoneNum = phoneNum.slice(0, 3) + "-" + phoneNum.slice(3, 6) + "-" + phoneNum.slice(6);
    //     }
    //     if (validatePhoneNumber(phoneNum)) {
    //       const phoneParams = {
    //         user_pk: threadRow.user_pk,
    //         phone_type: PHONE_TYPE.MANAGER,
    //         phone_number: phoneNum,
    //       };
    //       const phoneRows = await UserModel.findUserPhonesByFilter(phoneParams);
    //       if (phoneRows && phoneRows.length === 0) {
    //         await UserModel.addPhoneNumber(phoneParams);
    //       }
    //       isAdd = true;
    //     }
    //   }

    //   if (isAdd) {
    //     const str_thanks = getLangText("TEXT_THANK_YOU");
    //     const replyParams = {
    //       thread_pk,
    //       message: str_thanks,
    //       action_type: ACTION_TYPE.MANAGER,
    //       action_by: ROOT_MANAGER_PK,
    //       action_at: moment().add(1, 'seconds').toDate(),
    //     };
    //     const replyRow = await MessageModel.addFeedbackMessageWithActionAt(replyParams);
    //     if (replyRow) {
    //       last_message = str_thanks;
    //       is_read = FLAG_NONE;
    //     }
    //   }
    // }

    let data;
    if (params.thread_pk || isAdd) {
      const threadParams = {
        thread_pk,
        last_message,
        last_type: isAdd ? FEEDBACK_THREAD_LAST_TYPE.REPLIED : FEEDBACK_THREAD_LAST_TYPE.PENDING,
        is_read,
        status: isAdd ? THREAD_STATUS.RESOLVED : THREAD_STATUS.DISCUSSING,
      };
      const count = await MessageModel.editFeedbackThread(threadParams);
      if (count === 0) {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("FEEDBACK_FAIL_EDIT_LAST_MSG") };
      }
      data = { row: msgRow };
    } else {
      threadRow = { ...threadRow, updated_at: formatTimeForClient(msgRow.updated_at) };
      data = { row: threadRow };
    }

    return createResponse(RESP_CODES.SUCCESS, data);
  } catch (err) {
    console.error(err);
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function addFeedbackMessageFixed(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["user_pk", "thread_pk", "category", "title", "message"];
  let params = extractValidParams(req.body, validKeys);
  if (!params.user_pk) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("FEEDBACK_ERR_USER_NOT_FOUND") });
  }

  params = { ...params, thread_source: FEEDBACK_THREAD_SOURCES.FIXED };

  const json = await addFeedbackMessage(params);
  return res.status(json.code).json(json);
}

module.exports = {
  fetchFeedbackThreads,
  editFeedbackThread,
  fetchFeedbackMessages,
  addFeedbackMessageFixed,
};
