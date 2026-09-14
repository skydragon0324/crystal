const { validationResult } = require('express-validator');
const moment = require('moment');
const striptags = require('striptags');
const MessageModel = require('../../models/messageModel');
const UserModel = require('../../models/userModel');
const DeviceModel = require('../../models/deviceModel');
const ManagerModel = require('../../models/managerModel');
const ReserveModel = require('../../models/reserveModel');
const QcApi = require('../../api/qcApi');
const { unlink } = require('../../middleware/upload');
const { createResponse } = require('../../utils/response');
const { extractValidParams, getFeedbackIndicesByDepartment } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { FLAG_EXIST, NOTIFICATION_STATUS, DEFAULT_PAGE_SIZE, THREAD_STATUS, ACTION_TYPE, FLAG_DELETED, FLAG_NONE, FLAG_TO_ALL, PHONE_TYPE, FEEDBACK_THREAD_LAST_TYPE, MANAGER_ROLE_PAGE_SUFFIX, MANAGER_ROLES, FEEDBACK_LEVEL, FEEDBACK_THREAD_SOURCES, ORACLE_VALUE_MAXLEN } = require('../../constants/constants');

async function fetchFeedbackThreads(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: req.query.sortKey || "updated_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const user_pk = req.query.user_pk || "";
  const category = req.query.category ? +req.query.category : -1;
  const status = req.query.status ? +req.query.status : -1;
  const include_deleted = +req.query.include_deleted || 0;
  const last_type = req.query.last_type ? +req.query.last_type : -1;
  const qc_level = req.query.qc_level ? +req.query.qc_level : FEEDBACK_LEVEL.NORMAL;
  const from = req.query.from || "";
  const to = req.query.to || "";

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }
  const categories = getFeedbackIndicesByDepartment(admin.department);
  if (category !== undefined && category !== -1) {
    if (!categories.includes(category)) {
      return res.status(RESP_CODES.FORBIDDEN.code).json(RESP_CODES.FORBIDDEN);
    }
  }

  try {
    const filter = { offset, limit, sort, keyword, user_pk, category, categories, status, include_deleted, last_type, qc_level, from, to };
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

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["thread_pk", "category", "status", "is_deleted", "note", "session_by"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const threadRow = await MessageModel.findFeedbackThreadByPk(params.thread_pk);
    if (!threadRow) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    if (params.category !== undefined && threadRow.category === params.category
      && params.status !== undefined && threadRow.status === params.status
      && params.is_deleted === undefined
    ) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("NO_CHANGES_TO_UPDATE") });
    }

    let editParams = {
      thread_pk: params.thread_pk,
    };

    if (params.category !== undefined && params.status !== undefined) {
      editParams = { ...editParams, category: params.category, status: params.status };
    }
    if (params.is_deleted !== undefined) {
      editParams = { ...editParams, is_deleted: params.is_deleted };
    }
    if (params.session_by !== undefined) {
      editParams = { ...editParams, session_by: params.session_by, updated_at: threadRow.updated_at };
    }

    const count = await MessageModel.editFeedbackThread(editParams);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    if (params.category !== undefined && threadRow.category !== +params.category) {
      const logParams = {
        thread_pk: params.thread_pk,
        category: params.category,
        action_by: admin.manager_pk,
      };
      await MessageModel.addFeedbackCategoryLog(logParams);
    }
    if (params.status !== undefined && threadRow.status !== +params.status) {
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

async function resetFeedbackThreadSession(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["thread_pk"];
  const params = extractValidParams(req.body, validKeys);
  try {
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

async function fetchFeedbackMessages(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "action_at", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const thread_pk = req.query.thread_pk || "";

  const filter = { offset, limit, sort, keyword, thread_pk };

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const user_info = await MessageModel.findFeedbackUserInfoByPk(thread_pk);
    if (!user_info) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }
    const threadRow = await MessageModel.findFeedbackSessionByPk(thread_pk);
    if (!threadRow) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("FEEDBACK_NOT_FOUND_THREAD") });
    }
    const permRow = await ManagerModel.findRoleByPageSuffix(admin.role_pk, MANAGER_ROLE_PAGE_SUFFIX.FEEDBACK_THREAD);
    if (!permRow || MANAGER_ROLES.NONE === permRow.permission) {
      return res.status(RESP_CODES.FORBIDDEN.code).json(RESP_CODES.FORBIDDEN);
    }
    const permission = permRow.permission;
    const user_phones = await UserModel.findPhonesInUserPks([user_info.user_pk]);
    const last_device = await DeviceModel.findLastDeviceByUserPk(user_info.user_pk);
    const total = await MessageModel.findFeedbackMessages(filter, true);
    const rows = await MessageModel.findFeedbackMessages(filter, false);
    const category_logs = await MessageModel.findFeedbackCategoryLogs(thread_pk, 5);
    const status_logs = await MessageModel.findFeedbackStatusLogs(thread_pk, 1);

    let session_admin_pk = "";
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
        ...user_info,
        phones: user_phones,
        last_device,
      },
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

async function addFeedbackMessage(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["thread_pk", "user_pk", "title", "category", "message"];
  const params = extractValidParams(req.body, validKeys);

  try {
    let thread_pk = params.thread_pk;
    if (!thread_pk) {
      const threadParams = {
        user_pk: params.user_pk,
        title: params.title,
        category: params.category,
        last_message: params.message,
        last_type: FEEDBACK_THREAD_LAST_TYPE.REPLIED,
        status: THREAD_STATUS.DISCUSSING,
        thread_source: FEEDBACK_THREAD_SOURCES.PID,
        is_read: FLAG_NONE,
      };
      const threadRow = await MessageModel.addFeedbackThread(threadParams);
      if (!threadRow) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("FEEDBACK_FAIL_ADD_THREAD") });
      }
      thread_pk = threadRow.thread_pk;
    }

    const threadRow = await MessageModel.findFeedbackSessionByPk(thread_pk);
    if (threadRow.session_admin_pk && threadRow.session_admin_pk !== admin.manager_pk) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: `${getLangText("FEEDBACK_ALREADY_ANSWERING", [threadRow.session_admin_name])}` });
    }

    const messageParams = {
      thread_pk,
      message: params.message,
      action_type: ACTION_TYPE.MANAGER,
      action_by: admin.manager_pk,
    };
    const msgRow = await MessageModel.addFeedbackMessage(messageParams);
    if (!msgRow) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("FEEDBACK_FAIL_ADD_MESSAGE") });
    }

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

async function deleteFeedbackMessage(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["message_pk"];
  let params = extractValidParams(req.body, validKeys);

  try {
    const exist = await MessageModel.findFeedbackMessageByPk(params.message_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    const msgCount = await MessageModel.deleteFeedbackMessage(params.message_pk);
    if (msgCount === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("FEEDBACK_FAIL_DELETE_MESSAGE") });
    }

    const lastMsg = await MessageModel.findLastFeedbackMessageByThreadPk(exist.thread_pk);
    if (lastMsg) {
      const threadParams = {
        thread_pk: exist.thread_pk,
        last_message: lastMsg.message,
        last_type: lastMsg.action_type === ACTION_TYPE.USER ? FEEDBACK_THREAD_LAST_TYPE.PENDING : FEEDBACK_THREAD_LAST_TYPE.REPLIED,
      };
      const threadCount = await MessageModel.editFeedbackThread(threadParams);
      if (threadCount === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("FEEDBACK_FAIL_EDIT_LAST_MSG") });
      }
    } else {
      const threadParams = {
        thread_pk: exist.thread_pk,
        last_message: "",
        last_type: FEEDBACK_THREAD_LAST_TYPE.REPLIED,
        status: THREAD_STATUS.FINISHED,
        is_deleted: FLAG_DELETED,
      };
      const threadCount = await MessageModel.editFeedbackThread(threadParams);
      if (threadCount === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("FEEDBACK_FAIL_DELETE_THREAD") });
      }
    }

    const data = {
      exist: lastMsg ? 1 : 0,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function forwardFeedbackMessage(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["message_pk"];
  let params = extractValidParams(req.body, validKeys);

  try {
    const msg = await MessageModel.findFeedbackMsgInfoByPk(params.message_pk);
    if (!msg) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    const resp = await QcApi.forwardFeedbackMessage(msg.user_id, msg.message_pk, msg.message, msg.action_at);
    return res.status(resp.code).json(resp);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function levelFeedbackMessage(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["message_pk", "forward_pk", "qc_level"];
  let params = extractValidParams(req.body, validKeys);

  try {
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

async function processPhoneNumberMessage(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["user_pk", "thread_pk", "phone_number"];
  const params = extractValidParams(req.body, validKeys);

  const phoneParams = {
    user_pk: params.user_pk,
    phone_type: PHONE_TYPE.MANAGER,
    phone_number: params.phone_number,
  };
  const phoneRows = await UserModel.findUserPhonesByFilter(phoneParams);
  if (phoneRows.length === 0) {
    const row = await UserModel.addPhoneNumber(phoneParams);
    if (!row) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_ERR_ADD_PHONE_NUMBER") });
    }
  }

  const message = getLangText("TEXT_THANK_YOU");
  const messageParams = {
    thread_pk: params.thread_pk,
    message,
    action_type: ACTION_TYPE.MANAGER,
    action_by: admin.manager_pk,
  };
  const msgRow = await MessageModel.addFeedbackMessage(messageParams);
  if (!msgRow) {
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("FEEDBACK_FAIL_ADD_MESSAGE") });
  }

  const threadParams = {
    thread_pk: params.thread_pk,
    last_message: message,
    last_type: FEEDBACK_THREAD_LAST_TYPE.REPLIED,
    status: THREAD_STATUS.RESOLVED,
    is_read: FLAG_NONE,
  }
  const count = await MessageModel.editFeedbackThread(threadParams);
  if (count === 0) {
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("FEEDBACK_FAIL_EDIT_LAST_MSG") });
  }

  const data = { row: msgRow };
  return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
}

async function fetchBroadcasts(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "created_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, sort, keyword };
    const total = await MessageModel.findBroadcasts(filter, true);
    const rows = await MessageModel.findBroadcasts(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchBroadcastsByUserPk(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "created_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const user_pk = req.query.user_pk || "";

  try {
    const filter = { offset, limit, sort, keyword, user_pk, is_deleted: FLAG_EXIST };
    const total = await MessageModel.findBroadcastsByUserPk(filter, true);
    const rows = await MessageModel.findBroadcastsByUserPk(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addBroadUsers(broadcast_pk, user_pks, admin_pk) {
  const broadUsers = user_pks.map(user_pk => ({
    broadcast_pk,
    user_pk,
    created_by: admin_pk,
  }));
  return await MessageModel.addBroadUsers(broadUsers);
}

async function addBroadcast(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["title", "content"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const users = req.body.users;
    let valid_users;
    if (users === "*") {
      valid_users = [];
    } else {
      const user_ids = users.split(",").map(item => item.trim()).filter(item => !!item);
      valid_users = await UserModel.findValidUsersByIds(user_ids);
      if (!valid_users || valid_users.length === 0) {
        return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_NOT_FOUND_ALL") });
      }

      const valid_ids = valid_users.map(item => item.user_id);
      const diff_ids = user_ids.filter(item => !valid_ids.includes(item));
      if (diff_ids.length > 0) {
        return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: `${getLangText("USER_NOT_FOUND_SOME")} (${diff_ids.join(", ")})` });
      }
    }

    const broadParams = {
      ...params,
      to_all: users === "*" ? FLAG_TO_ALL : FLAG_NONE,
    };
    const row = await MessageModel.addBroadcast(broadParams, admin.manager_pk);
    if (!row) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("BROADCAST_ERR_ADD_CONTENT") });
    }

    const valid_pks = valid_users.map(item => item.user_pk);
    if (valid_pks.length > 0) {
      const result = await addBroadUsers(row.broadcast_pk, valid_pks, admin.manager_pk);
      if (result.length === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("BROADCAST_ERR_ADD_USERS") });
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
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

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["broadcast_pk", "title", "content", "is_deleted"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const users = req.body.users;
    let valid_users;
    if (users === "*") {
      valid_users = [];
    } else {
      const user_ids = users.split(",").map(item => item.trim()).filter(item => !!item);
      valid_users = await UserModel.findValidUsersByIds(user_ids);
      if (!valid_users || valid_users.length === 0) {
        return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_NOT_FOUND_ALL") });
      }

      const valid_ids = valid_users.map(item => item.user_id);
      const diff_ids = user_ids.filter(item => !valid_ids.includes(item));
      if (diff_ids.length > 0) {
        return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: `${getLangText("USER_NOT_FOUND_SOME")} (${diff_ids.join(", ")})` });
      }
    }

    const already_users = await MessageModel.findBroadUsersByBroadcastPk(params.broadcast_pk);
    if (!already_users) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const broadParams = {
      ...params,
      to_all: users === "*" ? FLAG_TO_ALL : FLAG_NONE,
    };
    const count = await MessageModel.editBroadcast(broadParams, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("BROADCAST_ERR_EDIT_CONTENT") });
    }

    const already_pks = already_users.map(item => item.user_pk);
    const new_pks = valid_users.map(item => item.user_pk).filter(item => !already_pks.includes(item));
    if (new_pks.length > 0) {
      const result = await addBroadUsers(params.broadcast_pk, new_pks, admin.manager_pk);
      if (result.length === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("BROADCAST_ERR_ADD_USERS") });
      }
    }

    const valid_pks = valid_users.map(item => item.user_pk);
    const del_pks = already_pks.filter(item => !valid_pks.includes(item));
    if (del_pks.length > 0) {
      const result = await MessageModel.editBroadUsersByBroadcastPkAndUserPks(params.broadcast_pk, del_pks, FLAG_DELETED);
      if (result === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("BROADCAST_ERR_DELETE_USERS") });
      }
    }

    const restore_pks = already_pks.filter(item => valid_pks.includes(item));
    if (restore_pks.length > 0) {
      const result = await MessageModel.editBroadUsersByBroadcastPkAndUserPks(params.broadcast_pk, restore_pks, FLAG_NONE);
      if (result === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("BROADCAST_ERR_ADD_USERS") });
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteBroadcast(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["broadcast_pk", "is_deleted"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const count = await MessageModel.editBroadcast(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function phoneSaleBroadcast(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["prefix_pks", "agency_id", "title", "content"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const prefix_pks = params.prefix_pks.split(",").map(item => item.trim()).filter(item => !!item);
    if (prefix_pks.length === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("BOOK_PREFIX_NOT_FOUND") });
    }
    const users = await ReserveModel.findReserveLogsForPhoneSale(prefix_pks, params.agency_id);
    const user_pks = users.map(item => item.user_pk).filter(item => !!item);
    if (user_pks.length === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("BOOK_NO_RESERVED_USERS") });
    }

    const broadParams = {
      title: params.title,
      content: params.content,
      to_all: FLAG_NONE,
    };
    const contentRow = await MessageModel.addBroadcast(broadParams, admin.manager_pk);
    if (!contentRow) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const userRows = await addBroadUsers(contentRow.broadcast_pk, user_pks, admin.manager_pk);
    if (userRows.length === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchBroadUsers(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "created_at", dir: req.query.sortDir || "desc" };
  const broadcast_pk = req.query.broadcast_pk || "";
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, sort, keyword, broadcast_pk };
    const total = await MessageModel.findBroadUsers(filter, true);
    const rows = await MessageModel.findBroadUsers(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchNotifications(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const is_now = req.query.is_now || "";

  let filter = { offset, limit, sort, keyword };
  if (+is_now === 1) {
    filter = { ...filter, is_now: 1, is_deleted: FLAG_EXIST, status: NOTIFICATION_STATUS.SHOW };
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

async function addNotification(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["title", "content", "image_url", "status", "category", "goto", "is_popular", "start_date", "end_date", "position"];
  let params = extractValidParams(req.body, validKeys);
  try {
    // If file uploaded, we can now include the file path in params
    if (req.file) {
      params.image_url = req.file.path; // Save the file path (e.g., "uploads/news/<filename>")
    }

    params = { ...params, cleaned_content: striptags(params.content).replace(/&nbsp;/g, ' ').slice(0, ORACLE_VALUE_MAXLEN), image_url: params.image_url || "", start_date: moment(params.start_date).toDate(), end_date: moment(params.end_date).toDate() };
    const row = await MessageModel.addNotification(params, admin.manager_pk);
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

async function editNotification(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["notification_pk", "title", "content", "image_url", "status", "category", "goto", "is_popular", "start_date", "end_date", "position"];
  let params = extractValidParams(req.body, validKeys);

  try {
    const exist = await MessageModel.findNotificationByPk(params.notification_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    if (req.file) {
      params.image_url = req.file.path; // Save the file path (e.g., "uploads/ads/<filename>")
    } else if (!params.image_url && exist.image_url) { // remove file
      unlink(exist.image_url);
    }

    if (params.content) {
      params.cleaned_content = striptags(params.content).replace(/&nbsp;/g, ' ').slice(0, ORACLE_VALUE_MAXLEN);
    }

    params = { ...params, start_date: moment(params.start_date).toDate(), end_date: moment(params.end_date).toDate() };

    const count = await MessageModel.editNotification(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteNotificationByPk(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const { notification_pk, is_deleted } = req.body;
  try {
    const exist = await MessageModel.findNotificationByPk(notification_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { notification_pk, is_deleted };
    const count = await MessageModel.editNotification(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchFaqs(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const category = req.query.category || 0;

  try {
    const filter = { offset, limit, sort, keyword, category };
    const total = await MessageModel.findAllFaqs(filter, true);
    const rows = await MessageModel.findAllFaqs(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addFaq(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["question", "answer", "category", "position"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const row = await MessageModel.addFaq(params, admin.manager_pk);
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

async function editFaq(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["faq_pk", "question", "answer", "category", "position"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await MessageModel.findFaqByPk(params.faq_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await MessageModel.editFaq(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteFaqByPk(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const { faq_pk, is_deleted } = req.body;
  try {
    const exist = await MessageModel.findFaqByPk(faq_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { faq_pk, is_deleted };
    const count = await MessageModel.editFaq(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchFeedbackThreads,
  editFeedbackThread,
  resetFeedbackThreadSession,
  fetchFeedbackMessages,
  addFeedbackMessage,
  deleteFeedbackMessage,
  forwardFeedbackMessage,
  levelFeedbackMessage,
  fetchFeedbackReplies,
  processPhoneNumberMessage,
  fetchBroadcasts,
  fetchBroadcastsByUserPk,
  addBroadcast,
  editBroadcast,
  deleteBroadcast,
  phoneSaleBroadcast,
  fetchBroadUsers,
  fetchNotifications,
  addNotification,
  editNotification,
  deleteNotificationByPk,
  fetchFaqs,
  addFaq,
  editFaq,
  deleteFaqByPk,
};
