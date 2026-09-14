const { validationResult } = require('express-validator');
const moment = require('moment');
const md5 = require('md5');
const fs = require('fs');
const forge = require('node-forge');
const ManagerModel = require('../models/managerModel');
const UserModel = require('../models/userModel');
const DeviceModel = require('../models/deviceModel');
const SecurityModel = require('../models/securityModel');
const PointModel = require('../models/pointModel');
const CustomerModel = require('../models/customerModel');
const VerifyApi = require('../api/verifyApi');
const CronApi = require('../api/cronApi');
const { addCustomerByPid } = require('./admin/adminCrmController');
const { createResponse } = require('../utils/response');
const { extractValidParams, is923User, convertCidFor923, genUserIdFor923, str2hex, hex2str, base64decode, generateVerifyCode } = require('../utils/utils');
const { getLangText } = require('../lang/lang');
const RESP_CODES = require('../constants/responseCodes');
const { USER_VERIFY_STATUS, POINT_TYPE_VALUES, FLAG_ACTIVE, USER_REG_STATUS, ACTION_TYPE, USER_REG_APP_TYPE, PHONE_MODEL_SPLITTER, FLAG_LOCKED, USER_TYPE } = require('../constants/constants');

// All token issuing, verification and cookie naming now lives in
// utils/token. The comment at the top of that file lists the four
// refresh-token defects this replaces.
const {
  accessCookieName,
  refreshCookieName,
  identityClaims,
  issueTokens,
  clearTokens,
  verifyAccessToken,
  verifyRefreshToken,
  rolesWithRefreshCookie,
} = require('../utils/token');

let session = {}; // iron@ use express-session to store data

async function adminLogin(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { manager_id, password } = req.body;

  try {
    const manager = await ManagerModel.findManagerById(manager_id);

    if (!manager) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    if (password !== manager.password) {
      return res.status(RESP_CODES.UNAUTHORIZED.code).json({ code: RESP_CODES.UNAUTHORIZED.code, message: getLangText("PASSWORD_MISMATCH") });
    }

    const pages = await ManagerModel.findOnlyPagesHavePerms(manager.role_pk);
    const role = await ManagerModel.findRoleByPk(manager.role_pk);

    // Both tokens carry the same claims, so a refresh can rebuild a
    // complete access token instead of a role-only stub.
    issueTokens(res, "admin", {
      manager_pk: manager.manager_pk,
      manager_id: manager.manager_id,
      manager_name: manager.manager_name,
      role_pk: manager.role_pk,
      department: role ? role.department : "",
    });

    const data = {
      manager: {
        manager_pk: manager.manager_pk,
        manager_name: manager.manager_name,
        role_pk: manager.role_pk,
        default_page: role ? role.default_page : "",
        department: role ? role.department : "",
      },
      pages,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function adminLogout(req, res) {
  clearTokens(res, "admin");
  return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
}

async function checkAdminAuth(req, res, next) {
  const decoded = verifyAccessToken(req.cookies[accessCookieName("admin")]);

  // 401 on both a missing and an expired token: the client interceptor keys
  // its refresh attempt off 401, and a 403 here would make an expired
  // session look unrecoverable instead of merely stale.
  if (!decoded) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const pages = await ManagerModel.findOnlyPagesHavePerms(decoded.role_pk);

    const data = { manager: decoded, pages };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

/**
 * Exchange a refresh cookie for a fresh access token.
 *
 * Reachable at /pid/api/auth/refresh_token and /vendor/api/auth/refresh_token
 * so the admin console, the app client and the vendor site all share it.
 *
 * Works for every role, keeps the caller's full claim set, and rotates the
 * refresh token on each use so a leaked one has a bounded lifetime.
 */
async function refreshToken(req, res) {
  const roles = rolesWithRefreshCookie(req.cookies);

  if (roles.length === 0) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json({
      code: RESP_CODES.UNAUTHORIZED.code,
      message: "No refresh token found.",
    });
  }

  // A browser can hold cookies for more than one role at once (an admin tab
  // and a site tab). Refresh every role that presents a valid cookie rather
  // than picking one and silently expiring the other.
  const refreshed = [];
  for (const role of roles) {
    const decoded = verifyRefreshToken(req.cookies[refreshCookieName(role)]);
    if (!decoded) {
      clearTokens(res, role);
      continue;
    }
    // identityClaims drops iat/exp so the payload can be re-signed, and
    // carries user_pk / manager_pk / role_pk through untouched - without
    // this the refreshed token authenticates as nobody in particular.
    issueTokens(res, role, identityClaims(decoded));
    refreshed.push(role);
  }

  if (refreshed.length === 0) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json({
      code: RESP_CODES.UNAUTHORIZED.code,
      message: "Invalid or expired refresh token.",
    });
  }

  return res.status(RESP_CODES.SUCCESS.code).json(
    createResponse(RESP_CODES.SUCCESS, { roles: refreshed, role: refreshed[0] })
  );
}

function verifyAdminToken(req, res, next) {
  const decoded = verifyAccessToken(req.cookies[accessCookieName("admin")]);
  if (!decoded) {
    // Always 401, never 403: 403 tells the client "do not bother refreshing",
    // which stranded any user whose access token had merely aged out.
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  req.admin = decoded; // Attach decoded manager to request
  next();
}

async function processUserFor923(cid, param_user_id) {
  const converted_cid = convertCidFor923(cid);
  const user = await UserModel.findUserByCid(converted_cid, false);
  if (user) {
    return user;
  }

  let user_id = param_user_id;
  let userRow = await UserModel.findUserById(user_id);
  while (userRow) { // generate random non-duplicate user_id
    user_id = genUserIdFor923(4, 4);
    userRow = await UserModel.findUserById(user_id);
  }

  const last2Chars = cid.substring(cid.length - 2, cid.length);
  const last2Nums = last2Chars === "00" ? 100 : +last2Chars;
  const specialData = await UserModel.findSpecialUserByPk(last2Nums);
  const birthday = new Date((new Date()).setFullYear(specialData.birth_year));
  const userParams = {
    user_id: user_id,
    password: md5("1234567890"),  // random password for 923 user
    user_name: specialData.user_name,
    gender: specialData.gender,
    birthday: birthday,
    cid: converted_cid,
  };
  return await UserModel.addUser(userParams);
}

async function doUserLogin(params, res) {
  if (params.cert) {
    const cert = forge.pki.certificateFromPem(params.cert)
    const CN = cert.subject.getField("CN");
    if (params.cid !== CN.value) {
      return {
        code: RESP_CODES.UNAUTHORIZED.code,
        message: getLangText("AUTH_ERR_CLIENT_CERT"),
      };
    }
  }

  let verify_status = USER_VERIFY_STATUS.NONE;
  try {
    let user;
    if (is923User(params.cid)) {
      user = await processUserFor923(params.cid, params.user_id);
      if (!user) {
        return {
          code: RESP_CODES.UNAUTHORIZED.code,
          message: getLangText("AUTH_ERR_ADD_USER"),
        };
      }
      verify_status = USER_VERIFY_STATUS.DONE; // set 923 user as verified
    } else {
      user = await UserModel.findUserAllInfoById(params.user_id);
      if (!user) {
        return {
          code: RESP_CODES.NOT_FOUND.code,
          message: getLangText("USER_INFO_NOT_FOUND"),
        };
      } else if (user.status !== FLAG_ACTIVE) {
        return {
          code: RESP_CODES.UNAUTHORIZED.code,
           message: getLangText("AUTH_ERR_BLOCKED_USER"),
        };
      }
      const whiteUser = await UserModel.findWhiteUserByCid(params.cid);
      if (!whiteUser && user.locked === FLAG_LOCKED) {
        const lockFilter = {
          user_pk: user.user_pk,
          cid: params.cid,
        };
        const lockInfo = await UserModel.findUserCidLockByFilter(lockFilter);
        if (user.cid !== params.cid && !lockInfo) {
          return {
            code: RESP_CODES.UNAUTHORIZED.code,
            message: getLangText("AUTH_ERR_CID_LOCKED"),
          };
        }
      }

      if (!whiteUser && params.password !== user.password) {
        return {
          code: RESP_CODES.UNAUTHORIZED.code,
          message: getLangText("PASSWORD_MISMATCH"),
        };
      }

      if (true) {//process.env.SERVER_ENV !== "production") { // FIXME: iron@ force verify status as DONE
        verify_status = USER_VERIFY_STATUS.DONE;
      } else {
        const row = await UserModel.findUserVerifyCode(user.user_pk, params.cid);
        if (row) {
          verify_status = row.status;
          if (row.status === USER_VERIFY_STATUS.NONE) {
            const verify_code = generateVerifyCode();
            const codeParams = {
              table_pk: row.table_pk,
              verify_code,
            };
            const count = await UserModel.editUserVerifyCode(codeParams);
            if (count === 0) {
              return RESP_CODES.INTERNAL_SERVER_ERROR;
            }
            sendVerifyCode(user.user_pk, params.cid, verify_code);
          }
        } else {
          const verify_code = generateVerifyCode();
          verify_status = USER_VERIFY_STATUS.NONE;
          const codeParams = {
            user_pk: user.user_pk,
            cid: params.cid,
            status: verify_status,
            verify_code: +verify_code,
            expire_at: new Date(), // FIXME
          };
          const codeData = await UserModel.addUserVerifyCode(codeParams);
          if (codeData) {
            sendVerifyCode(user.user_pk, params.cid, verify_code);
          } else {
            return RESP_CODES.INTERNAL_SERVER_ERROR;
          }
        }
      }

      if (params.cid && params.model && params.imei) {
        const words = params.model.split(PHONE_MODEL_SPLITTER);
        const phone_brand = words.length > 0 ? words[0] : "";
        const phone_model = words.length > 1 ? words[1] : "";
        const whiteUser = await UserModel.findWhiteUserByCid(params.cid);
        if (!whiteUser) {
          const exist = await DeviceModel.findDevice({ user_pk: user.user_pk, cid: params.cid, phone_imei: params.imei });
          if (exist) {  // update last login time
            const count = await DeviceModel.editDevice({ device_pk: exist.device_pk, last_logged_in: new Date() });
            if (count === 0) {
              return RESP_CODES.INTERNAL_SERVER_ERROR;
            }
          } else {
            const deviceParams = {
              user_pk: user.user_pk,
              cid: params.cid,
              phone_brand,
              phone_model,
              phone_imei: params.imei,
              last_logged_in: new Date(),
            };
            const row = await DeviceModel.addDevice(deviceParams);
            if (!row) {
              return RESP_CODES.INTERNAL_SERVER_ERROR;
            }
          }
        }

        const loginLog = {
          user_pk: user.user_pk,
          cid: params.cid,
          phone_brand,
          phone_model,
          phone_imei: params.imei,
        };
        await UserModel.addUserLoginLog(loginLog);
      }

      if (params.machine) { // security log
        let resident = null;
        if (user.location_pk) {
          const location = await UserModel.findLocationFullNameByPk(user.location_pk);
          if (location && location.full_name !== " ") {
            resident = location.full_name;
          }
        }
        let secuParams = {
          user_id: user.user_id,
          user_name: user.user_name,
          cid: params.cid,
          phone_number: user.phone_number,
          birthday: user.birthday,
          resident,
        };

        const exist = await SecurityModel.findSecuLogByFilter(secuParams);
        if (!exist) {
          secuParams = { ...secuParams, machine: params.machine, info: params.info };
          await SecurityModel.addSecuLog(secuParams);
        }
      }
    }

    issueTokens(res, "user", { user_pk: user.user_pk, user_id: user.user_id });

    return {
      code: RESP_CODES.SUCCESS.code,
      message: RESP_CODES.SUCCESS.message,
      data: {
        token: accessToken,
        user: { ...user, password: "" }, // prevent sending hashed password to client
        verify_status,
      },
    };
  } catch (err) {
    console.error(err);
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function userLogin(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["user_id", "password", "cid", "model", "imei", "machine", "info", "cert"];
  const params = extractValidParams(req.body, validKeys);

  const ret = await doUserLogin(params, res);
  return res.status(ret.code).json(ret);
}

async function doUserRegister(params) {
  let verify_status = USER_VERIFY_STATUS.NONE;
  let ret_user_pk = 0;
  try {
    if (is923User(params.cid)) {
      const user = await processUserFor923(params.cid, params.user_id);
      if (!user) {
        return {
          code: RESP_CODES.UNAUTHORIZED.code,
          message: getLangText("AUTH_ERR_ADD_USER"),
        };
      }

      verify_status = USER_VERIFY_STATUS.DONE; // set 923 user as verified
      ret_user_pk = user.user_pk;
    } else {
      let exist = await UserModel.findUserByCid(params.cid);
      if (exist) {
        return {
          code: RESP_CODES.CONFLICT.code,
          message: getLangText("AUTH_ERR_CID_REG_EXIST", [exist.user_id]),
        };
      }
      exist = await UserModel.findUserByLowerId(params.user_id);
      if (exist) {
        return RESP_CODES.CONFLICT;
      }

      const userParams = {
        user_id: params.user_id.trim(),
        password: params.password || md5("12345678"),
        user_name: params.user_name.trim(),
        gender: params.gender,
        birthday: moment(params.birthday).toDate(),
        cid: params.cid,
      };
      const user = await UserModel.addUser(userParams);
      if (!user) {
        return RESP_CODES.INTERNAL_SERVER_ERROR;
      }

      if (true) {//process.env.SERVER_ENV !== "production") { // FIXME: iron@ force verify status as DONE
        verify_status = USER_VERIFY_STATUS.DONE;
      } else {
        const verify_code = generateVerifyCode();
        verify_status = USER_VERIFY_STATUS.NONE;
        const codeParams = {
          user_pk: user.user_pk,
          cid: params.cid,
          status: verify_status,
          verify_code,
          expire_at: new Date(), // FIXME
        };
        const codeData = await UserModel.addUserVerifyCode(codeParams);
        if (codeData) {
          sendVerifyCode(user.user_pk, params.cid, verify_code);
        } else {
          return RESP_CODES.INTERNAL_SERVER_ERROR;
        }
      }

      if (params.cid && params.model && params.imei) {
        const words = params.model.split(PHONE_MODEL_SPLITTER);
        const deviceParams = {
          user_pk: user.user_pk,
          cid: params.cid,
          phone_brand: words.length > 0 ? words[0] : "",
          phone_model: words.length > 1 ? words[1] : "",
          phone_imei: params.imei,
          last_logged_in: new Date(),
        };
        const row = await DeviceModel.addDevice(deviceParams);
        if (!row) {
          return RESP_CODES.INTERNAL_SERVER_ERROR;
        }
      }

      if (params.machine) { // security log
        let secuParams = {
          user_id: user.user_id,
          user_name: user.user_name,
          cid: params.cid,
          phone_number: null,
          birthday: params.birthday,
          resident: null,
        };

        const exist = await SecurityModel.findSecuLogByFilter(secuParams);
        if (!exist) {
          secuParams = { ...secuParams, machine: params.machine, info: params.info };
          await SecurityModel.addSecuLog(secuParams);
        }
      }

      const appResp = await processRegisterUserForApps(user.user_pk, params.cid, params.iccid);
      if (appResp.code !== RESP_CODES.SUCCESS.code) {
        return appResp;
      }

      addCustomerByPid(params, user.user_pk);

      ret_user_pk = user.user_pk;
    }

    const pointResp = await processPointsForRegister(ret_user_pk);
    if (pointResp.code !== RESP_CODES.SUCCESS.code) {
      return pointResp;
    }

    const data = {
      verify_status,
      user_pk: ret_user_pk,
    }

    return createResponse(RESP_CODES.SUCCESS, data);
  } catch (err) {
    console.error(err);
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function processRegisterUserForApps(user_pk, cid, iccid) {
  try {
    await UserModel.ignoreUserRegisterLogs(user_pk);

    const logParams = {
      user_pk,
      cid,
      status: USER_REG_STATUS.PENDING,
      action_type: ACTION_TYPE.USER,
      action_by: user_pk,
    };

    const eshopParams = { ...logParams, app_type: USER_REG_APP_TYPE.ESHOP };
    const eshopRow = await UserModel.addUserRegisterLog(eshopParams);
    if (!eshopRow) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("AUTH_ERR_REGISTER_LOG_ESHOP") };
    }

    const appstoreParams = { ...logParams, app_type: USER_REG_APP_TYPE.APPSTORE };
    const appstoreRow = await UserModel.addUserRegisterLog(appstoreParams);
    if (!appstoreRow) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("AUTH_ERR_REGISTER_LOG_APPSTORE") };
    }

    if (false) { // dont send to mass server because appstore and mass server is already syncing
      const massParams = { ...logParams, app_type: USER_REG_APP_TYPE.MASS, iccid };
      const massRow = await UserModel.addUserRegisterLog(massParams);
      if (!massRow) {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("AUTH_ERR_REGISTER_LOG_MASS") };
      }
    }

    // request to change password, but not wait for it, cause eshop/appstore/mass server can be non-responsible
    CronApi.forwardRegisterUserId(user_pk);

    return RESP_CODES.SUCCESS;
  } catch (err) {
    console.error(err);
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function processPointsForRegister(user_pk) {
  try {
    // add point stats
    const pointType = await PointModel.findActivityPointTypeByPk(POINT_TYPE_VALUES.MOBILE_REGISTER);
    if (!pointType) {
      return {
        code: RESP_CODES.INTERNAL_SERVER_ERROR.code,
        message: getLangText("POINT_ERR_ADD_NEWLY_POINT"),
      };
    }

    const pointParams = {
      user_pk,
      type_pk: pointType.type_pk,
      points: pointType.points,
    };
    const pointLog = await PointModel.addActivityPointLog(pointParams);
    if (!pointLog) {
      return {
        code: RESP_CODES.INTERNAL_SERVER_ERROR.code,
        message: getLangText("POINT_ERR_ADD_NEWLY_POINT"),
      };
    }

    const activityStatsExist = await PointModel.findActivityPointStatsByUserPk(user_pk);
    if (!activityStatsExist) {
      const activityStatsParams = {
        user_pk,
        total_points: pointType.points,
        limit_points: pointType.points,
        minus_points: 0,
      };
      const activityPointStats = await PointModel.addActivityPointStats(activityStatsParams);
      if (!activityPointStats) {
        return {
          code: RESP_CODES.INTERNAL_SERVER_ERROR.code,
          message: getLangText("POINT_ERR_ADD_NEWLY_POINT"),
        };
      }
    }

    return RESP_CODES.SUCCESS;
  } catch (err) {
    console.error(err);
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function userRegister(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["user_id", "password", "user_name", "gender", "birthday", "cid", "iccid", "model", "imei", "machine", "info", "cert"];
  const params = extractValidParams(req.body, validKeys);

  const ret = await doUserRegister(params);
  return res.status(ret.code).json(ret);
}

async function sendVerifyCode(user_pk, cid, verify_code) {
  if ("198-" !== cid.substring(0, 4)) {
    await VerifyApi.sendMmsVerification(user_pk, cid, verify_code);
  }
}

async function userLogout(req, res) {
  clearTokens(res, "user");
  return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
}

async function checkUserAuth(req, res, next) {
  const token = req.query.token;

  if (!token) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const decoded = verifyAccessToken(token);
  if (!decoded) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json({ code: RESP_CODES.UNAUTHORIZED.code, message: "Token error" });
  }

  try {
    const user = await UserModel.findUserByPk(decoded.user_pk);
    if (!user) {
      return res.status(RESP_CODES.UNAUTHORIZED.code).json({ code: RESP_CODES.UNAUTHORIZED.code, message: "Token error" });
    } else if (user.status !== FLAG_ACTIVE) {
      return res.status(RESP_CODES.UNAUTHORIZED.code).json({ code: RESP_CODES.UNAUTHORIZED.code, message: getLangText("AUTH_ERR_BLOCKED_USER") });
    }

    const words = req.query.model.split(PHONE_MODEL_SPLITTER);
    const phone_brand = words.length > 0 ? words[0] : "";
    const phone_model = words.length > 1 ? words[1] : "";

    // add login log for auto-login
    const loginLog = {
      user_pk: decoded.user_pk,
      cid: req.query.cid,
      phone_brand,
      phone_model,
      phone_imei: req.query.imei,
    };
    await UserModel.addUserLoginLog(loginLog);

    issueTokens(res, "user", { user_pk: user.user_pk, user_id: user.user_id });

    const data = {
      token,
      user,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    // console.error(err); // jwt expired
    return res.status(RESP_CODES.UNAUTHORIZED.code).json({ code: RESP_CODES.UNAUTHORIZED.code, message: "auto login error" });
  }
}

function verifyUserToken(req, res, next) {
  let token = req.cookies.userAccessToken;
  if (!token) {
    if (req.body.token) {
      token = req.body.token;
    } else if (req.query.token) {
      token = req.query.token;
    }
  }
  const decoded = verifyAccessToken(token);
  if (!decoded) {
    // 401 rather than 403 so an expired token routes into the refresh flow.
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  req.user = decoded; // Attach decoded user to request
  next();
}

function parseUserToken(req, res, next) {
  let token = req.cookies.userAccessToken;
  if (!token) {
    if (req.body.token) {
      token = req.body.token;
    } else if (req.query.token) {
      token = req.query.token;
    }
  }
  // Optional auth: an absent or bad token just means "anonymous visitor",
  // so the request continues either way.
  const decoded = verifyAccessToken(token);
  if (decoded) {
    req.user = decoded;
  }
  next();
}

async function eccServer(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const iaCk = fs.readFileSync(process.env.ECC_IA_CK);
  const serverCk = fs.readFileSync(process.env.ECC_SERVER_CK);
  const serverCrt = fs.readFileSync(process.env.SERVER_CRT);

  const data = {
    ia_ck: String(iaCk),
    server_ck: String(serverCk),
    server_crt: String(serverCrt),
  };

  return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
}

async function eccFunction(req, res) {
  return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
}

async function checkVerifyCode(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["user_pk", "cid", "verify_code"];
  const params = extractValidParams(req.body, validKeys);

  const info = await UserModel.findUserVerifyCode(params.user_pk, params.cid);
  if (+params.verify_code !== info.verify_code
    // FIXME check expire_at
  ) {
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("AUTH_ERR_VERIFY_CODE") });
  }

  const data = {
    table_pk: info.table_pk,
    status: USER_VERIFY_STATUS.DONE,
  };
  const count = await UserModel.editUserVerifyCode(data);
  if (count === 0) {
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }

  return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
}

async function webLogin(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["user_id", "password"];
  const params = extractValidParams(req.body, validKeys);

  let user = await UserModel.findUserAllInfoById(params.user_id);
  if (user) {
    if (user.status !== FLAG_ACTIVE) {
      return res.status(RESP_CODES.UNAUTHORIZED.code).json({ code: RESP_CODES.UNAUTHORIZED.code, message: getLangText("AUTH_ERR_BLOCKED_USER") });
    }
    user = { ...user, user_type: USER_TYPE.PID };
  } else {
    user = await CustomerModel.findCustomerInfoById(params.user_id);
    if (user) {
      user = { ...user, user_type: USER_TYPE.FIXED };
    }
  }
  if (!user) {
    return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
  }

  if (params.password !== user.password) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json({ code: RESP_CODES.UNAUTHORIZED.code, message: getLangText("PASSWORD_MISMATCH") });
  }

  setWebToken(user, res);

  const data = {
    user: { ...user, password: "" }, // prevent sending hashed password to client
  };
  return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
}

/**
 * Issue the vendor-site session. user_type is carried in the claims so
 * routes can tell a PID user from a fixed-line customer without a second
 * lookup - and so a refreshed token still knows which one it is.
 */
const setWebToken = (user, res) => {
  return issueTokens(res, "web", {
    user_pk: user.user_pk,
    user_id: user.user_id,
    user_name: user.user_name,
    user_type: user.user_type,
  });
}

async function webLogout(req, res) {
  clearTokens(res, "web");
  return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
}

async function checkWebAuth(req, res, next) {
  const decoded = verifyAccessToken(req.cookies[accessCookieName("web")]);

  if (!decoded) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const data = {
    user: decoded,
  };
  return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
}

function verifyWebToken(req, res, next) {
  const decoded = verifyAccessToken(req.cookies[accessCookieName("web")]);
  if (!decoded) {
    // The old code answered 403 for a missing cookie and 401 for an expired
    // one. The client only refreshes on 401, so every account page that
    // raced ahead of the refresh got a dead 403 and rendered empty.
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  req.user = decoded; // Attach decoded user to request
  next();
}

function parseWebToken(req, res, next) {
  let token = req.cookies[accessCookieName("web")];
  if (!token) {
    if (req.body.token) {
      token = req.body.token;
    } else if (req.query.token) {
      token = req.query.token;
    }
  }

  // Optional auth: blog reads work signed out, and only the write paths
  // check req.user, so an absent or stale token is not an error here.
  const decoded = verifyAccessToken(token);
  if (decoded) {
    req.user = decoded;
  }
  next();
}

module.exports = {
  adminLogin,
  adminLogout,
  checkAdminAuth,
  refreshToken,
  verifyAdminToken,
  userLogin,
  userRegister,
  userLogout,
  checkUserAuth,
  verifyUserToken,
  parseUserToken,
  eccServer,
  eccFunction,
  checkVerifyCode,
  setWebToken,
  webLogin,
  webLogout,
  checkWebAuth,
  verifyWebToken,
  parseWebToken,
};
