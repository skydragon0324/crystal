const moment = require('moment');
const { validationResult } = require('express-validator');
const MessageModel = require('../../models/messageModel');
const ManagerModel = require('../../models/managerModel');
const DeviceModel = require('../../models/deviceModel');
const UserModel = require('../../models/userModel');
const { createResponse } = require('../../utils/response');
const { extractValidParams, formatTimeForClient, extractPhoneNumberFromMessage, validatePhoneNumber, getFeedbackIndicesByDepartment } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { FLAG_EXIST, NOTIFICATION_STATUS, DEFAULT_PAGE_SIZE, ACTION_TYPE, THREAD_STATUS, FLAG_READ, FLAG_DELETED, FLAG_NONE, FLAG_TO_ALL, PHONE_TYPE, ROOT_MANAGER_PK, FEEDBACK_THREAD_LAST_TYPE, MANAGER_ROLE_PAGE_SUFFIX, MANAGER_ROLES, FEEDBACK_LEVEL, FEEDBACK_THREAD_SOURCES, FEEDBACK_THREAD_MAX_COUNT_PER_DAY, FEEDBACK_MESSAGE_MAX_COUNT_PER_DAY, FAQ_CATEGORY } = require('../../constants/constants');

async function fetchNotifications(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || 0;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const min_at = req.query.min_at || "";
  const max_at = req.query.max_at || "";

  let filter = { offset, limit, sort, keyword, min_at, max_at, is_client: 1 };
  if (min_at === "" && max_at == "") {
    filter = { ...filter, is_deleted: FLAG_EXIST, status: NOTIFICATION_STATUS.SHOW, is_now: 1 };
  }

  try {
    const total = await MessageModel.findNotifications(filter, true);
    const rows = await MessageModel.findNotifications(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchFaqs(req, res) {
  const sort = { key: "position", dir: "asc" };
  const max_at = req.query.max_at || "";

  let filter = { offset: 0, limit: 0, sort, max_at, is_client: 1 };
  if (max_at === "") {
    filter = { ...filter, is_deleted: FLAG_EXIST };
  }

  try {
    const total = await MessageModel.findAllFaqs(filter, true);
    const rows = await MessageModel.findAllFaqs(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchFaqsForWeb(filter) {
  try {
    const newFilter = { ...filter, is_deleted: FLAG_EXIST, is_client: 1 };
    const total = await MessageModel.findAllFaqs(newFilter, true);
    const rows = await MessageModel.findAllFaqs(newFilter, false);
    const data = { total, rows };
    return createResponse(RESP_CODES.SUCCESS, data);
  } catch (err) {
    console.error(err);
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function fetchFaqsForPhoneWeb(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, sort, keyword, category: FAQ_CATEGORY.PHONE };
    const resp = await fetchFaqsForWeb(filter);
    return res.status(resp.code).json(resp);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchBroadcasts(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || 0;
  const sort = { key: req.query.sortKey || "created_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const min_at = req.query.min_at || "";
  const max_at = req.query.max_at || "";

  let filter = { offset, limit, sort, user_pk: user.user_pk, keyword, min_at, max_at, is_client: 1 };
  if (min_at === "" && max_at === "") {
    filter = { ...filter, is_deleted: FLAG_EXIST };
  }

  try {
    const total = await MessageModel.findBroadcastsByUserPk(filter, true);
    const rows = await MessageModel.findBroadcastsByUserPk(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function editBroadcast(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["broadcast_pk", "is_read"];
  let params = extractValidParams(req.body, validKeys);
  try {
    params = { ...params, broadcast_pk: +params.broadcast_pk, is_read: +params.is_read, user_pk: user.user_pk };
    const row = await MessageModel.findBroadcastByPk(params.broadcast_pk);
    if (!row) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    if (row.to_all !== FLAG_TO_ALL) {
      const count = await MessageModel.editBroadUser(params);
      if (count === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchFeedbacks(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || 0;
  const sort = { dir: "desc" };
  const keyword = req.query.keyword || "";
  const feedback_min_at = req.query.feedback_min_at || "";
  const feedback_max_at = req.query.feedback_max_at || "";
  const comment_min_at = req.query.comment_min_at || "";
  const comment_max_at = req.query.comment_max_at || "";

  try {
    const filter = { offset, limit, sort, user_pk: user.user_pk, keyword, feedback_min_at, feedback_max_at, comment_min_at, comment_max_at, is_client: 1 };
    const total = await MessageModel.findFeedbackAndComments(filter, true);
    const rows = await MessageModel.findFeedbackAndComments(filter, false);
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

  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || 0;
  const sort = { key: "updated_at", dir: "desc" };
  const keyword = req.query.keyword || "";
  const min_at = req.query.min_at || "";
  const max_at = req.query.max_at || "";

  try {
    const filter = { offset, limit, sort, user_pk: user.user_pk, keyword, min_at, max_at, is_client: 1 };
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
  const sort = { key: "action_at", dir: "desc" };
  const keyword = req.query.keyword || "";
  const thread_pk = req.query.thread_pk;

  const filter = { offset, limit, sort, thread_pk, keyword, is_client: 1 };

  try {
    if (thread_pk) {
      const threadRow = await MessageModel.findFeedbackThreadByPk(thread_pk);
      if (!threadRow) {
        return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
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
        return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("FEEDBACK_ERR_MAX_MSG_COUNT", [FEEDBACK_THREAD_MAX_COUNT_PER_DAY]) });
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

    /** process phone number */
    let isAdd = false;
    if (false) {//+params.category === FEEDBACK_CATEGORY.CONTACT) {
      const lines = params.message.split(/\n/);
      for (const line of lines) {
        let phoneNum = extractPhoneNumberFromMessage(line);
        if (phoneNum.length === 10) {
          phoneNum = phoneNum.slice(0, 3) + "-" + phoneNum.slice(3, 6) + "-" + phoneNum.slice(6);
        }
        if (validatePhoneNumber(phoneNum)) {
          const phoneParams = {
            user_pk: user.user_pk,
            phone_type: PHONE_TYPE.MANAGER,
            phone_number: phoneNum,
          };
          const phoneRows = await UserModel.findUserPhonesByFilter(phoneParams);
          if (phoneRows.length === 0) {
            await UserModel.addPhoneNumber(phoneParams);
          }
          isAdd = true;
        }
      }

      if (isAdd) {
        const str_thanks = getLangText("TEXT_THANK_YOU");
        const replyParams = {
          thread_pk,
          message: str_thanks,
          action_type: ACTION_TYPE.MANAGER,
          action_by: ROOT_MANAGER_PK,
          action_at: moment().add(1, 'seconds').toDate(),
        };
        const replyRow = await MessageModel.addFeedbackMessageWithActionAt(replyParams);
        if (replyRow) {
          last_message = str_thanks;
          is_read = FLAG_NONE;
        }
      }
    }

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

async function fetchFeedbackAdminThreads(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const admin = await ManagerModel.findUserAdminByUserPk(user.user_pk);
    if (!admin) {
      return res.status(RESP_CODES.FORBIDDEN.code).json({ code: RESP_CODES.FORBIDDEN.code, message: getLangText("NOT_ADMIN") });
    }

    const offset = +req.query.offset || 0;
    const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
    const sort = { key: req.query.sortKey || "updated_at", dir: req.query.sortDir || "desc" };
    const keyword = req.query.keyword || "";
    const category = req.query.category === undefined ? -1 : +req.query.category;
    const status = req.query.status === undefined ? -1 : +req.query.status;
    const include_deleted = +req.query.include_deleted || 0;
    const last_type = req.query.last_type == undefined ? -1 : +req.query.last_type;
    const qc_level = req.query.qc_level ? +req.query.qc_level : FEEDBACK_LEVEL.NORMAL;

    const categories = getFeedbackIndicesByDepartment(admin.department);
    if (category !== -1 && !categories.includes(+category)) {
      return res.status(RESP_CODES.FORBIDDEN.code).json(RESP_CODES.FORBIDDEN);
    }

    const filter = { offset, limit, sort, keyword, category, categories, status, include_deleted, last_type, qc_level };
    const total = await MessageModel.findFeedbackThreads(filter, true);
    const rows = await MessageModel.findFeedbackThreads(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function resetFeedbackAdminThreadSession(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["thread_pk"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const admin = await ManagerModel.findUserAdminByUserPk(user.user_pk);
    if (!admin) {
      return res.status(RESP_CODES.FORBIDDEN.code).json({ code: RESP_CODES.FORBIDDEN.code, message: getLangText("NOT_ADMIN") });
    }

    const permRow = await ManagerModel.findRoleByPageSuffix(admin.role_pk, MANAGER_ROLE_PAGE_SUFFIX.FEEDBACK_THREAD);
    if (!permRow || [MANAGER_ROLES.NONE, MANAGER_ROLES.READ].includes(permRow.permission)) {
      return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
    }

    await MessageModel.resetFeedbackThreadSession(admin.manager_pk, params.thread_pk);
    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchFeedbackAdminMessages(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: "action_at", dir: "desc" };
  const keyword = req.query.keyword || "";
  const thread_pk = req.query.thread_pk;

  const filter = { offset, limit, sort, thread_pk, keyword };

  try {
    const user_info = await MessageModel.findFeedbackUserInfoByPk(thread_pk);
    if (!user_info) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    const admin = await ManagerModel.findUserAdminByUserPk(user.user_pk);
    if (!admin) {
      return res.status(RESP_CODES.FORBIDDEN.code).json({ code: RESP_CODES.FORBIDDEN.code, message: getLangText("NOT_ADMIN") });
    }

    const permRow = await ManagerModel.findRoleByPageSuffix(admin.role_pk, MANAGER_ROLE_PAGE_SUFFIX.FEEDBACK_THREAD);
    if (!permRow || MANAGER_ROLES.NONE === permRow.permission) {
      return res.status(RESP_CODES.FORBIDDEN.code).json(RESP_CODES.FORBIDDEN);
    }
    const permission = permRow.permission;

    const threadRow = await MessageModel.findFeedbackSessionByPk(thread_pk);
    if (!threadRow) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("FEEDBACK_NOT_FOUND_THREAD") });
    }
    const user_phones = await UserModel.findPhonesInUserPks([user_info.user_pk]);
    const last_device = await DeviceModel.findLastDeviceByUserPk(user_info.user_pk);
    const total = await MessageModel.findFeedbackMessages(filter, true);
    const rows = await MessageModel.findFeedbackMessages(filter, false);
    const category_logs = await MessageModel.findFeedbackCategoryLogs(thread_pk, 5);
    const status_logs = await MessageModel.findFeedbackStatusLogs(thread_pk, 1);
    const phones = user_phones.slice(0, 2).map(row => row.phone_number).join(", ");

    let session_admin_pk = 0;
    let session_admin_name = "";
    if (threadRow.session_admin_pk) {
      session_admin_pk = threadRow.session_admin_pk;
      session_admin_name = threadRow.session_admin_name;
    } else if ([MANAGER_ROLES.WRITE, MANAGER_ROLES.SUPER].includes(permission)) {
      await MessageModel.resetFeedbackThreadSession(admin.manager_pk);

      const threadParams = {
        thread_pk,
        session_by: admin.manager_pk,
        updated_at: threadRow.updated_at,
      };
      const count = await MessageModel.editFeedbackThread(threadParams);
      if (count === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }
      session_admin_pk = admin.manager_pk;
      session_admin_name = admin.manager_name;
    }

    const data = {
      user_info: {
        user_id: user_info.user_id,
        user_name: user_info.user_name,
        gender: user_info.gender,
        age: user_info.age,
        fixed_id: user_info.fixed_id,
        eshop_id: user_info.eshop_id,
        appstore_id: user_info.appstore_id,
        mass_id: user_info.mass_id,
        phone_numbers: phones,
      },
      thread_info: threadRow,
      phone_name: last_device.phone_name,
      user_phones,
      total,
      rows,
      category_logs,
      status_logs,
      session_admin_pk,
      session_admin_name,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addFeedbackAdminMessage(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["thread_pk", "user_pk", "category", "title", "message"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const admin = await ManagerModel.findUserAdminByUserPk(user.user_pk);
    if (!admin) {
      return res.status(RESP_CODES.FORBIDDEN.code).json({ code: RESP_CODES.FORBIDDEN.code, message: getLangText("NOT_ADMIN") });
    }

    let thread_pk = params.thread_pk;
    if (!thread_pk) {
      const threadParams = {
        user_pk: params.user_pk,
        title: params.title,
        category: params.category,
        last_message: params.message,
        last_type: FEEDBACK_THREAD_LAST_TYPE.PENDING,
        status: THREAD_STATUS.DISCUSSING,
        is_read: FLAG_NONE,
      };
      const threadRow = await MessageModel.addFeedbackThread(threadParams);
      if (!threadRow) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("FEEDBACK_FAIL_ADD_THREAD") });
      }
      thread_pk = threadRow.thread_pk;
    }

    const messageParams = {
      thread_pk,
      message: params.message,
      action_type: ACTION_TYPE.MANAGER,
      action_by: admin.manager_pk,
    };
    let msgRow = await MessageModel.addFeedbackMessage(messageParams);
    if (!msgRow) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("FEEDBACK_FAIL_ADD_MESSAGE") });
    }
    msgRow = { ...msgRow, action_at: formatTimeForClient(msgRow.action_at) };

    if (params.thread_pk) {
      const threadParams = {
        thread_pk,
        last_message: params.message,
        last_type: FEEDBACK_THREAD_LAST_TYPE.REPLIED,
        is_read: FLAG_NONE,
      }
      const count = await MessageModel.editFeedbackThread(threadParams);
      if (count === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("FEEDBACK_FAIL_EDIT_LAST_MSG") });
      }
    }

    const data = { row: msgRow };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function levelFeedbackAdminMessage(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["message_pk", "forward_pk", "qc_level"];
  let params = extractValidParams(req.body, validKeys);

  try {
    const admin = await ManagerModel.findUserAdminByUserPk(user.user_pk);
    if (!admin) {
      return res.status(RESP_CODES.FORBIDDEN.code).json({ code: RESP_CODES.FORBIDDEN.code, message: getLangText("NOT_ADMIN") });
    }

    let forward_pk = params.forward_pk;
    if (forward_pk) {
      const row = await MessageModel.findFeedbackForwardLogByPk(forward_pk);
      if (!row) {
        forward_pk = undefined;
      }
    }
    if (forward_pk) {
      if (+params.qc_level === FEEDBACK_LEVEL.NORMAL) {
        await MessageModel.deleteFeedbackForwardLog(forward_pk);
      } else {
        const editParams = {
          table_pk: forward_pk,
          qc_level: params.qc_level,
        };
        const count = await MessageModel.editFeedbackForwardLog(editParams, admin.manager_pk);
        if (count === 0) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("FEEDBACK_FAIL_EDIT_QC_LEVEL") });
        }
      }
    } else {
      const msgRow = await MessageModel.findFeedbackMessageByPk(params.message_pk);
      if (!msgRow) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("FEEDBACK_NOT_FOUND_MESSAGE") });
      }
      const addParams = {
        message_pk: params.message_pk,
        thread_pk: msgRow.thread_pk,
        qc_level: params.qc_level,
      };
      const row = await MessageModel.addFeedbackForwardLog(addParams, admin.manager_pk);
      if (!row) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("FEEDBACK_FAIL_ADD_QC_LEVEL") });
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function editFeedbackAdminThread(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["thread_pk", "category", "status", "is_deleted", "note"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const admin = await ManagerModel.findUserAdminByUserPk(user.user_pk);
    if (!admin) {
      return res.status(RESP_CODES.FORBIDDEN.code).json({ code: RESP_CODES.FORBIDDEN.code, message: getLangText("NOT_ADMIN") });
    }

    const threadRow = await MessageModel.findFeedbackThreadByPk(params.thread_pk);
    if (!threadRow) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    if (threadRow.category === params.category
      && threadRow.status === params.status
      && params.is_deleted === undefined
    ) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("NO_CHANGES_TO_UPDATE") });
    }

    const editParams = {
      thread_pk: params.thread_pk,
      category: params.category,
      status: params.status,
      is_deleted: params.is_deleted,
    }
    const count = await MessageModel.editFeedbackThread(editParams);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    if (threadRow.category !== +params.category) {
      const logParams = {
        thread_pk: params.thread_pk,
        category: params.category,
        action_by: admin.manager_pk,
      };
      await MessageModel.addFeedbackCategoryLog(logParams);
    }
    if (threadRow.status !== +params.status) {
      const logParams = {
        thread_pk: params.thread_pk,
        status: params.status,
        note: params.note || "",
        action_type: ACTION_TYPE.MANAGER,
        action_by: admin.manager_pk,
      };
      await MessageModel.addFeedbackStatusLog(logParams);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchFeedbackReplies(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || 10;
  const sort = { key: req.query.sortKey || "action_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const category = req.query.category || "";


  try {
    const filter = { offset, limit, sort, keyword, category };
    const rows = await MessageModel.findFeedbackReplies(filter, false);

    const data = {
      rows,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchNotifications,
  fetchFaqs,
  fetchFaqsForPhoneWeb,
  fetchBroadcasts,
  editBroadcast,
  fetchFeedbacks,
  fetchFeedbackThreads,
  editFeedbackThread,
  fetchFeedbackMessages,
  addFeedbackMessage,
  fetchFeedbackAdminThreads,
  resetFeedbackAdminThreadSession,
  fetchFeedbackAdminMessages,
  addFeedbackAdminMessage,
  levelFeedbackAdminMessage,
  editFeedbackAdminThread,
  fetchFeedbackReplies,
};
