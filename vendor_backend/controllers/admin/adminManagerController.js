const md5 = require('md5');
const { validationResult } = require('express-validator');
const ManagerModel = require('../../models/managerModel');
const UserModel = require('../../models/userModel');
const { createResponse } = require('../../utils/response');
const { extractValidParams } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');

async function fetchManagers(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "manager_id", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, sort, keyword };
    const total = await ManagerModel.findManagers(filter, true);
    const rows = await ManagerModel.findManagers(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addManager(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["manager_id", "manager_name", "role_pk"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await ManagerModel.findManagerById(params.manager_id);
    if (exist) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const row = await ManagerModel.addManager(params);
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

async function editManager(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["manager_pk", "manager_id", "manager_name", "password", "role_pk"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await ManagerModel.findManagerById(params.manager_id);
    if (exist && exist.manager_pk !== params.manager_pk) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const count = await ManagerModel.editManager(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteByManagerPk(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const { manager_pk } = req.body;

  try {
    const exist = await ManagerModel.findManagerByPk(manager_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    // root or currently logged in user cannot be deleted
    if (exist.manager_id === "root" || exist.manager_pk === admin.manager_pk) {
      return res.status(RESP_CODES.FORBIDDEN.code).json(RESP_CODES.FORBIDDEN);
    }

    const count = await ManagerModel.deleteManagerByPk(manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function resetPassword(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["manager_pk"];
  let params = extractValidParams(req.body, validKeys);
  params = { ...params, password: md5("12345678") };
  try {
    const count = await ManagerModel.editManager(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function changePassword(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["manager_pk", "old_password", "new_password"];
  let params = extractValidParams(req.body, validKeys);
  try {
    const exist = await ManagerModel.findManagerByPk(params.manager_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    if (exist.password !== params.old_password) {
      return res.status(RESP_CODES.FORBIDDEN.code).json({ code: RESP_CODES.FORBIDDEN.code, message: getLangText("PASSWORD_MISMATCH") });
    }

    const mParams = { manager_pk: params.manager_pk, password: params.new_password };
    const count = await ManagerModel.editManager(mParams);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchRoles(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "role_name", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, sort, keyword };
    const total = await ManagerModel.findAllRoles(filter, true);
    const rows = await ManagerModel.findAllRoles(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addRole(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["role_name", "default_page"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await ManagerModel.findRoleByName(params.role_name);
    if (exist) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const row = await ManagerModel.addRole(params, admin.manager_pk);
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

async function editRole(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["role_pk", "role_name", "default_page"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await ManagerModel.findRoleByName(params.role_name);
    if (exist && exist.role_pk !== params.role_pk) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const count = await ManagerModel.editRole(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteByRolePk(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { role_pk } = req.body;
  try {
    const exist = await ManagerModel.findRoleByPk(role_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await ManagerModel.deleteRoleByPk(role_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPages(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "page_url", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, sort, keyword };
    const total = await ManagerModel.findAllPages(filter, true);
    const rows = await ManagerModel.findAllPages(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addPage(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["page_url", "page_name"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const row = await ManagerModel.addPage(params, admin.manager_pk);
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

async function editPage(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["page_pk", "page_url", "page_name"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const count = await ManagerModel.editPage(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteByPagePk(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { page_pk } = req.body;
  try {
    const exist = await ManagerModel.findPageByPk(page_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await ManagerModel.deletePageByPk(page_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function getRolePerms(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "page_url", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const role_pk = +req.query.role_pk || 0;

  if (!role_pk || role_pk === 0) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json(createResponse(RESP_CODES.BAD_REQUEST));
  }

  try {
    const filter = { offset, limit, sort, role_pk, keyword };
    const total = await ManagerModel.findPagesWithPerms(filter, true);
    const rows = await ManagerModel.findPagesWithPerms(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function updateRolePerm(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["role_pk", "page_pk", "permission"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await ManagerModel.findPageByRolePagePk(params.role_pk, params.page_pk);

    if (exist) {  // update
      const editParams = { table_pk: exist.table_pk, permission: params.permission };
      const count = await ManagerModel.editPermission(editParams, admin.manager_pk);
      if (count === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }
    } else {  // add
      const row = await ManagerModel.addPermission(params, admin.manager_pk);
      if (!row) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function updateRoleDepart(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["role_pk", "department"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const count = await ManagerModel.updateDepartPerm(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }
    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchUserAdmins(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "created_at", dir: req.query.sortDir || "asc" };
  const manager_pk = req.query.manager_pk;
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, sort, manager_pk, keyword };
    const total = await ManagerModel.findUserAdmins(filter, true);
    const rows = await ManagerModel.findUserAdmins(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function editUserAdmin(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["manager_pk"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const users = req.body.users;
    let valid_users;
    if (users === "*") {
      valid_users = [];
    } else {
      const user_ids = users.split(",").map(item => item.trim()).filter(item => !!item);
      valid_users = await UserModel.findValidUsersByIds(user_ids);
      if (!valid_users || valid_users.length === 0) { // it can be empty
        return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
      }

      const valid_ids = valid_users.map(item => item.user_id);
      const diff_ids = user_ids.filter(item => !valid_ids.includes(item));
      if (diff_ids.length > 0) {
        return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: `${getLangText("USER_NOT_FOUND_SOME")} (${diff_ids.join(", ")})` });
      }
    }

    const already_users = await ManagerModel.findUserAdminsByManagerPk(params.manager_pk);
    const already_pks = already_users.map(item => item.user_pk);
    const new_pks = valid_users.map(item => item.user_pk).filter(item => !already_pks.includes(item));
    if (new_pks.length > 0) {
      const userAdminParams = new_pks.map(user_pk => ({
        manager_pk: params.manager_pk,
        user_pk,
      }));
      const result = await ManagerModel.addUserAdmins(userAdminParams);
      if (result.length === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_ADDMIN_FAIL_ADD") });
      }
    }

    const valid_pks = valid_users.map(item => item.user_pk);
    const del_pks = already_pks.filter(item => !valid_pks.includes(item));
    if (del_pks.length > 0) {
      const result = await ManagerModel.deleteUserAdminsByManagerPkAndUserPks(params.manager_pk, del_pks);
      if (result === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_ADDMIN_ERR_DEL_PKS") });
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchManagers,
  addManager,
  editManager,
  deleteByManagerPk,
  resetPassword,
  changePassword,
  fetchRoles,
  addRole,
  editRole,
  deleteByRolePk,
  fetchPages,
  addPage,
  editPage,
  deleteByPagePk,
  getRolePerms,
  updateRolePerm,
  updateRoleDepart,
  fetchUserAdmins,
  editUserAdmin,
};
