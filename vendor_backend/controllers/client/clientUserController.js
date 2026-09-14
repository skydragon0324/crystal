const moment = require('moment');
const { validationResult } = require('express-validator');
const UserModel = require('../../models/userModel');
const SurveyModel = require('../../models/surveyModel');
const DeviceModel = require('../../models/deviceModel');
const ExpModel = require('../../models/experienceModel');
const PointModel = require('../../models/pointModel');
const SecurityModel = require('../../models/securityModel');
const PremiumModel = require('../../models/premiumModel');
const EshopModel = require('../../models/eshopModel');
const CronApi = require('../../api/cronApi');
const { processActivityPointLogByUserPk } = require('../common/commonPrhnController');
const { updateIntegratedUserValue } = require('../common/commonPremiumController');
const { editCustomerByPid, editCustomerPhoneNumberbyPid } = require('../admin/adminCrmController');
const { createResponse } = require('../../utils/response');
const { extractValidParams, validatePhoneNumber, formatTimeForClient, is923User, convertCidFor923, genUserIdFor923, getDayDiff } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { PHONE_TYPE, FLAG_DELETED, DUTY_TYPE, DUTY_ACTION, USER_PROPERTY_TYPE, ACTION_TYPE, POINT_TYPE_VALUES, ACTIVITY_LIMIT_SOURCES, USER_PWD_APP_TYPE, USER_PWD_STATUS, POINT_TYPE_HASHES, FIXED_STATUS, REG_POINT_TYPES, REG_POINT_STATUS, FLAG_NONE, SOFT_POINT_TYPES, JOBS, CID_LENGTH, ID_PREFIX_PID, ID_PREFIX_PH } = require('../../constants/constants');

async function fetchUser(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const userData = await UserModel.findUserByPk(user.user_pk);
    const data = { user: userData };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function editUser(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["key", "value", "cid", "machine", "info"];
  const pair = extractValidParams(req.body, validKeys);
  const validParams = ["user_id", "user_name", "user_alias", "gender", "birthday", "job", "location_pk", "phone_numbers", "id_card", "cid", "locked"];
  if (!validParams.includes(pair.key)) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json(RESP_CODES.BAD_REQUEST);
  }
  let value = pair.value;
  if (pair.key === "birthday") {
    value = moment(pair.value).toDate();
  } else if (pair.key === "job" || pair.key === "locked") {
    value = +pair.value;
  };
  const params = {
    [pair.key]: value,
  };

  try {
    const orgUser = await UserModel.findUserByPk(user.user_pk);
    if (!orgUser) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_USER") });
    }

    if (["user_name", "birthday"].includes(pair.key) && !is923User(pair.cid)) {
      if (orgUser[pair.key]) {
        const mergeFilter = {
          pvendor_pk: user.user_pk,
        };
        const mergeRow = await UserModel.findMergeIdByFilter(mergeFilter);
        if (mergeRow && (
          (mergeRow.fixed_pk && mergeRow.fixed_status === FIXED_STATUS.APPROVED)
          || mergeRow.eshop_pk
          || mergeRow.appstore_pk
        )) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_ERR_EDIT_ALREADY_MERGED") });
        }
      }

      let property_type = 0;
      if (pair.key === "user_name") {
        property_type = USER_PROPERTY_TYPE.USER_NAME;
      } else if (pair.key === "birthday") {
        property_type = USER_PROPERTY_TYPE.BIRTHDAY;
      }
      const logFilter = {
        user_pk: user.user_pk,
        property_type,
        action_type: ACTION_TYPE.USER,
      };
      const count = await UserModel.findUserEditLogCount(logFilter);
      if (count > 0) {
        const fieldName = pair.key === "user_name" ? getLangText("TEXT_NAME") : getLangText("TEXT_BIRTHDAY");
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_ERR_EDIT_ONLY_ONCE", [fieldName]) });
      }
    }

    let count = 0;
    if (pair.key === "phone_numbers") {
      const phones = pair.value.split(",").map(item => item.trim()).filter(item => !!item);
      const nonDupPhones = [...new Set(phones)];
      for (const phone of nonDupPhones) {
        if (!validatePhoneNumber(phone)) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("PHONE_ERR_INVALID_NUMBER") });
        }
      }
      if (nonDupPhones.length === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_ERR_AT_LEAST_ONE_PHONE") });
      }

      const exist = await UserModel.findUserPhoneByUserPk(user.user_pk);
      if (exist) {
        const deleteFilter = {
          user_pk: user.user_pk,
          phone_type: PHONE_TYPE.USER,
        };
        const delCount = await UserModel.deletePhoneByFilter(deleteFilter);
        if (delCount === 0) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_ERR_DELETE_PHONE_NUMBER") });
        }
      }

      const phoneParams = nonDupPhones.map(item => ({
        user_pk: user.user_pk,
        phone_number: item,
        phone_type: PHONE_TYPE.USER,
      }));

      const row = await UserModel.addPhoneNumbers(phoneParams);
      if (row) {
        count = 1;

        // crm
        editCustomerPhoneNumberbyPid(user.user_pk, nonDupPhones.join(","));
      }
    } else {
      if (pair.key === "cid") {
        const cidExist = await UserModel.findUserByCid(pair.value, true);
        if (cidExist && cidExist.user_pk !== user.user_pk) {
          return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("USER_ERR_CID_EXIST") });
        }
      } else if (pair.key === "user_id") {
        const userIdExist = await UserModel.findUserById(pair.value);
        if (userIdExist && userIdExist.user_pk !== user.user_pk) {
          return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("USER_ERR_USERID_EXIST") });
        }
      }
      const userParams = { ...params, user_pk: user.user_pk };
      count = await UserModel.editUser(userParams);

      // crm
      if (count !== 0) {
        editCustomerByPid(params, orgUser);
      }
    }

    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const orgBirthday = moment(orgUser.birthday).format("YYYY-MM-DD");
    if (!is923User(pair.cid)) {
      if (pair.key === "user_name" && pair.value !== orgUser.user_name) {
        const logParams = {
          user_pk: user.user_pk,
          property_type: USER_PROPERTY_TYPE.USER_NAME,
          old_value: orgUser.user_name,
          new_value: pair.value,
          action_type: ACTION_TYPE.USER,
          action_by: user.user_pk,
        };
        await UserModel.addUserEditLog(logParams);
      } else if (pair.key === "birthday" && pair.value !== orgBirthday) {
        const logParams = {
          user_pk: user.user_pk,
          property_type: USER_PROPERTY_TYPE.BIRTHDAY,
          old_value: orgBirthday,
          new_value: pair.value,
          action_type: ACTION_TYPE.USER,
          action_by: user.user_pk,
        };
        await UserModel.addUserEditLog(logParams);
      } else if (pair.key === "id_card" && pair.value !== orgUser.id_card) {
        const logParams = {
          user_pk: user.user_pk,
          property_type: USER_PROPERTY_TYPE.ID_CARD,
          old_value: orgUser.id_card,
          new_value: pair.value,
          action_type: ACTION_TYPE.USER,
          action_by: user.user_pk,
        };
        await UserModel.addUserEditLog(logParams);
      } else if (pair.key === "cid" && pair.value !== orgUser.cid) {
        const logParams = {
          user_pk: user.user_pk,
          property_type: USER_PROPERTY_TYPE.CID,
          old_value: orgUser.cid,
          new_value: pair.value,
          action_type: ACTION_TYPE.USER,
          action_by: user.user_pk,
        };
        await UserModel.addUserEditLog(logParams);
      } else if (pair.key === "job" && pair.value !== orgUser.job) {
        const old_job = JOBS.find(item => item.id === orgUser.job);
        const new_job = JOBS.find(item => item.id === +pair.value);
        const logParams = {
          user_pk: user.user_pk,
          property_type: USER_PROPERTY_TYPE.JOB,
          old_value: old_job ? old_job.name : "",
          new_value: new_job ? new_job.name : "",
          action_type: ACTION_TYPE.USER,
          action_by: user.user_pk,
        };
        await UserModel.addUserEditLog(logParams);
      } else if (pair.key === "location_pk" && pair.value !== orgUser.location_pk) {
        const old_address = await UserModel.findLocationFullNameByPk(orgUser.location_pk);
        const new_address = await UserModel.findLocationFullNameByPk(pair.value);
        const logParams = {
          user_pk: user.user_pk,
          property_type: USER_PROPERTY_TYPE.LOCATION,
          old_value: old_address ? old_address.full_name : "",
          new_value: new_address ? new_address.full_name : "",
          action_type: ACTION_TYPE.USER,
          action_by: user.user_pk,
        };
        await UserModel.addUserEditLog(logParams);
      } else if (pair.key === "gender" && pair.value !== orgUser.gender) {
        const logParams = {
          user_pk: user.user_pk,
          property_type: USER_PROPERTY_TYPE.GENDER,
          old_value: orgUser.gender === 'M' ? getLangText("MALE") : (orgUser.gender === 'F' ? getLangText("FEMALE") : ""),
          new_value: pair.value === 'M' ? getLangText("MALE") : (pair.value === 'F' ? getLangText("FEMALE") : ""),
          action_type: ACTION_TYPE.USER,
          action_by: user.user_pk,
        };
        await UserModel.addUserEditLog(logParams);
      }
    }

    // user profile duty
    let achievement;
    if (["job", "location_pk", "phone_numbers"].includes(pair.key)) {
      const dutyProfile = await ExpModel.findActiveDutyByAction(DUTY_ACTION.PERIOD_USER_PROFILE, user.user_pk);
      const newUser = await UserModel.findUserAllInfoByPk(user.user_pk);
      const user_phone = await UserModel.findUserPhoneByUserPk(user.user_pk);
      if (dutyProfile && !dutyProfile.table_pk
        && newUser.job
        && newUser.location_pk
        && user_phone
      ) {
        const jsonPoint = await processActivityPointByDuty(user.user_pk, dutyProfile);
        if (jsonPoint.code !== RESP_CODES.SUCCESS.code) {
          return res.status(jsonPoint.code).json(jsonPoint);
        }
        achievement = { ...jsonPoint.data.row, duty_type: dutyProfile.duty_type, disp_date: dutyProfile.disp_date };
      }
    }

    // security log
    if (["user_name", "birthday", "location_pk", "phone_numbers", "id_card"].includes(pair.key) && pair.machine && !is923User(pair.cid)) {
      const newUser = await UserModel.findUserAllInfoByPk(user.user_pk);
      if (newUser) {
        let resident = null;
        if (newUser.location_pk) {
          const location = await UserModel.findLocationFullNameByPk(newUser.location_pk);
          if (location && location.full_name !== " ") {
            resident = location.full_name;
          }
        }

        const phoneFilter = {
          user_pk: user.user_pk,
          phone_type: PHONE_TYPE.USER,
        };
        const user_phone_numbers = await UserModel.findUserPhonesByFilter(phoneFilter);
        const phone_number = user_phone_numbers && user_phone_numbers.length > 0 ? user_phone_numbers[0].phone_number : "";

        let secuParams = {
          user_id: newUser.user_id,
          user_name: newUser.user_name,
          cid: pair.cid,
          phone_number,
          birthday: newUser.birthday,
          resident,
        };

        const exist = await SecurityModel.findSecuLogByFilter(secuParams);
        if (!exist) {
          secuParams = { ...secuParams, machine: pair.machine, info: pair.info };
          await SecurityModel.addSecuLog(secuParams);
        }
      }
    }

    const data = {
      count,
      achievement,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
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

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["org_password", "new_password"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await UserModel.findUserByPk(user.user_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    } else if (exist.password !== params.org_password) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("PASSWORD_MISMATCH") });
    }

    const mergeInfo = await UserModel.findMergeIdByFilter({ pvendor_pk: user.user_pk });
    if (mergeInfo) {
      if (mergeInfo.eshop_pk && mergeInfo.eshop_id) {
        await UserModel.ignoreUserPasswordLogs(user.user_pk, USER_PWD_APP_TYPE.ESHOP);
        const logParams = {
          user_pk: user.user_pk,
          user_id: mergeInfo.pvendor_id,
          password: params.new_password,
          app_type: USER_PWD_APP_TYPE.ESHOP,
          status: USER_PWD_STATUS.PENDING,
          action_type: ACTION_TYPE.USER,
          action_by: user.user_pk,
        };
        const logRow = await UserModel.addUserPasswordLog(logParams);
        if (!logRow) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
        }
      }
      if (mergeInfo.appstore_pk && mergeInfo.appstore_id) {
        await UserModel.ignoreUserPasswordLogs(user.user_pk, USER_PWD_APP_TYPE.APPSTORE);
        const logParams = {
          user_pk: user.user_pk,
          user_id: mergeInfo.pvendor_id,
          password: params.new_password,
          app_type: USER_PWD_APP_TYPE.APPSTORE,
          status: USER_PWD_STATUS.PENDING,
          action_type: ACTION_TYPE.USER,
          action_by: user.user_pk,
        };
        const logRow = await UserModel.addUserPasswordLog(logParams);
        if (!logRow) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
        }
      }
      if (mergeInfo.mass_pk && mergeInfo.mass_id) {
        await UserModel.ignoreUserPasswordLogs(user.user_pk, USER_PWD_APP_TYPE.MASS);
        const logParams = {
          user_pk: user.user_pk,
          user_id: mergeInfo.pvendor_id,
          password: params.new_password,
          app_type: USER_PWD_APP_TYPE.MASS,
          status: USER_PWD_STATUS.PENDING,
          action_type: ACTION_TYPE.USER,
          action_by: user.user_pk,
        };
        const logRow = await UserModel.addUserPasswordLog(logParams);
        if (!logRow) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
        }

        // request to change password, but not wait for it, cause eshop/appstore/mass server can be non-responsible
        CronApi.forwardUserPasswordLog(user.user_pk);
      }
    }

    const userParams = {
      user_pk: user.user_pk,
      password: params.new_password,
    };
    const count = await UserModel.editUser(userParams);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function processExperienceBySurvey(user_pk) {
  let achieves = [];
  try {
    const dutyOne = await ExpModel.findActiveDutyByAction(DUTY_ACTION.PERIOD_SURVEY_ONE, user_pk);
    if (dutyOne && !dutyOne.table_pk) {
      const jsonPoint = await processActivityPointByDuty(user_pk, dutyOne);
      if (jsonPoint.code !== RESP_CODES.SUCCESS.code) {
        return jsonPoint;
      }
      const achieve = { ...jsonPoint.data.row, duty_type: dutyOne.duty_type, disp_date: dutyOne.disp_date };
      achieves = [...achieves, achieve];
    }
    const dutyAll = await ExpModel.findActiveDutyByAction(DUTY_ACTION.PERIOD_SURVEY_ALL, user_pk);
    if (dutyAll && !dutyAll.table_pk) {
      const questions = await SurveyModel.findActiveQuestions();
      if (questions.length > 0) {
        const responses = await SurveyModel.findActiveQuestions(user_pk);
        if (questions.length == responses.length) {
          const jsonPoint = await processActivityPointByDuty(user_pk, dutyAll);
          if (jsonPoint.code !== RESP_CODES.SUCCESS.code) {
            return jsonPoint;
          }
          const achieve = { ...jsonPoint.data.row, duty_type: dutyAll.duty_type, disp_date: dutyAll.disp_date };
          achieves = [...achieves, achieve];
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
  return createResponse(RESP_CODES.SUCCESS, achieves);
}

async function submitSurveyResponse(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["question_pk", "choice_pk", "choice_pks", "response_text"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await SurveyModel.findResponseByFilter({ user_pk: user.user_pk, question_pk: +params.question_pk });
    if (exist.length > 0) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("SURVEY_ERR_ALREADY_SUBMIT") });
    }

    let input_pks = [];
    if (params.choice_pk) {
      input_pks = [+params.choice_pk];
    } else if (params.choice_pks) {
      input_pks = params.choice_pks.split(",").filter(item => !!item).map(item => +(item.trim()));
    } else {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")} (choice_pks)` });
    }

    if (input_pks.length === 0) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("SURVEY_ERR_NO_ANSWER") });
    }

    const valid_choices = await SurveyModel.findValidChoicesByPks(params.question_pk, input_pks);
    if (!valid_choices || valid_choices.length === 0) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("SURVEY_ERR_INVALID_ANSWER") });
    }

    const valid_pks = valid_choices.map(item => item.choice_pk);
    const diff_pks = input_pks.filter(item => !valid_pks.includes(item));
    if (input_pks.length !== valid_pks.length || diff_pks.length > 0) {
      const data = { diff_pks: diff_pks.join(", ") };
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("SURVEY_ERR_INVALID_SOME"), data });
    }

    const rows = await SurveyModel.addResponses(user.user_pk, params.question_pk, valid_pks);
    if (!rows || rows.length === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const retExp = await processExperienceBySurvey(user.user_pk);
    if (retExp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(retExp.code).json(retExp);
    }
    const achieves = retExp.data;
    const points = achieves.length > 0 ? achieves.map(row => +row.points).reduce((a, b) => a + b) : 0;

    let data = {
      achieves,
      points,
    };
    if (params.choice_pk) {
      data = { ...data, row: rows[0] };
    } else {
      data = { ...data, rows };
    }
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchLastUserId(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const cid = req.query.cid || "";
  try {
    let user_id = "";
    if (is923User(cid)) {
      const converted_cid = convertCidFor923(cid);
      const row = await UserModel.findUserByCid(converted_cid);
      if (row) {
        user_id = row.user_id;
      } else {
        let userRow = {};
        while (userRow) {
          user_id = genUserIdFor923(4, 4);
          userRow = await UserModel.findUserById(user_id);
        }
      }
    } else {
      const row = await DeviceModel.findLastDeviceByCid(cid);
      if (row) {
        user_id = row.user_id;
      }
    }
    const data = {
      user_id,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchRegisteredUserId(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const cid = req.query.cid || "";
  try {
    let user_id = "";
    let converted_cid = cid;
    if (is923User(cid)) {
      converted_cid = convertCidFor923(cid);
    }

    const row = await UserModel.findUserByCid(converted_cid);
    if (row) {
      user_id = row.user_id;
    } else if (is923User(cid)) {
      let userRow = {};
      while (userRow) {
        user_id = genUserIdFor923(4, 4);
        userRow = await UserModel.findUserById(user_id);
      }
    }

    const data = {
      user_id,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addAchievement(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["duty_pk"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const duty = await ExpModel.findDutyByPk(params.duty_pk);
    if (!duty || duty.is_deleted === FLAG_DELETED) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    if (duty.duty_type === DUTY_TYPE.DAILY) {
      const filter = { user_pk: user.user_pk, duty_pk: params.duty_pk };
      const exist = await ExpModel.findDailyAchievementByFilter(filter);
      if (exist.length > 0) {
        return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
      }
    } else if (duty.duty_type === DUTY_TYPE.PERIOD) {
      const today = moment().format("YYYY-MM-DD");
      if (duty.start_date > today || duty.end_date < today) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("DUTY_ERR_NO_TODAY") });
      }
      const filter = { user_pk: user.user_pk, duty_pk: params.duty_pk, start_date: duty.start_date, end_date: duty.end_date };
      const exist = await ExpModel.findPeriodAchievementByFilter(filter);
      if (exist.length > 0) {
        return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
      }
    }

    const jsonRet = await processActivityPointByDuty(user.user_pk, duty);
    if (jsonRet.code !== RESP_CODES.SUCCESS.code) {
      return res.status(jsonRet.code).json(jsonRet);
    }

    let row = {
      ...jsonRet.data.row,
      duty_type: duty.duty_type,
    };
    if (duty.duty_type === DUTY_TYPE.PERIOD) {
      row = { ...row, disp_date: duty.disp_date };
    }
    const data = {
      ...jsonRet.data,
      row,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function processActivityPointByDuty(user_pk, duty) {
  try {
    let newTypePk = duty.point_type;
    let hash = "";
    if (duty.point_type < 100000) { // it can be regarded as prefix (4-digits)
      if (duty.point_type !== POINT_TYPE_VALUES.MOBILE_DAILY_LOGIN_PREFIX) {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("DUTY_ERR_INVALID_POINT") };
      }
      // mobile daily login
      const lastAchieve = await ExpModel.findLastAchievement({ user_pk, duty_pk: duty.duty_pk });
      newTypePk = POINT_TYPE_VALUES.MOBILE_DAILY_LOGIN_FIRST;
      const today = moment().format("YYYY-MM-DD");
      if (lastAchieve && getDayDiff(today, lastAchieve.action_at) === 1) {
        newTypePk = lastAchieve.point_type === POINT_TYPE_VALUES.MOBILE_DAILY_LOGIN_LAST ? POINT_TYPE_VALUES.MOBILE_DAILY_LOGIN_LAST : lastAchieve.point_type + 1;
      }
      hash = POINT_TYPE_HASHES.MOBILE_DAILY_LOGIN;
    }

    const pointType = await PointModel.findActivityPointTypeByPk(newTypePk);
    if (!pointType) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_NOT_FOUND_TYPE") };
    }

    const achieveRow = await ExpModel.addAchievement({ user_pk, duty_pk: duty.duty_pk, point_type: newTypePk, points: pointType.points });
    if (!achieveRow) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("DUTY_ERR_ADD_ACHIEVEMENT") };
    }

    const logParams = {
      related_pk: achieveRow.table_pk,
      hash,
    };
    const resp = await processActivityPointLogByUserPk(user_pk, newTypePk, logParams);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return resp;
    }

    const data = {
      ...resp.data,
      row: { ...achieveRow, action_at: formatTimeForClient(achieveRow.action_at) },
    };
    return createResponse(RESP_CODES.SUCCESS, data);
  } catch (err) {
    console.error(err);
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function fetchActivityPointBalance(req, res) {
  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const pointStats = await PointModel.findActivityPointStatsByUserPk(user.user_pk);
    const intRow = await PremiumModel.findIntegratedUserValueByUserPk(user.user_pk);
    const intData = {
      commerce_value: intRow ? intRow.commerce_value : 0,
      exp_value: intRow ? intRow.exp_value : 0,
      soft_points: intRow ? intRow.soft_points : 0,
      phone_reg_points: intRow ? intRow.phone_reg_points : 0,
      eprod_reg_points: intRow ? intRow.eprod_reg_points : 0,
      activity_points: pointStats ? (pointStats.total_points - pointStats.minus_points) : 0,
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
    const data = {
      total_points: pointStats ? pointStats.total_points : 0,
      int_class_name,
      int_class_level,
      int_user_value,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchActivityPointLog(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: "action_at", dir: "desc" };
  const from = req.query.from || "";
  const to = req.query.to || "";
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

async function fetchActivityPointRank(req, res) {
  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const activityLimit = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.ACTIVITY);

    const is_limit_rank = activityLimit ? activityLimit.status : 0;
    const target_rank = (activityLimit && activityLimit.status === 1) ? activityLimit.target_rank : 0;
    const top_count = activityLimit ? activityLimit.top_count : 5;
    const surroundings = activityLimit ? activityLimit.surroundings : 2;
    const description = (activityLimit && activityLimit.status === 1) ? activityLimit.description || "" : "";

    const userRank = await PointModel.findActivityPointRankByUserPk(user.user_pk, is_limit_rank);
    const user_rank = userRank ? userRank.rank : -1;

    const filter = { offset: 0, limit: 0, sort: {}, is_limit_rank, target_rank, top_count, surroundings, user_rank, is_client: 1 };
    const rows = await PointModel.findActivityPointStats(filter, false);

    let new_rows = [];
    if (activityLimit) {
      const top_list = rows.filter(row => row.rank <= top_count);
      const target_list = target_rank ? rows.filter(row => row.rank >= target_rank - surroundings && row.rank <= target_rank + surroundings && row.rank > top_count) : [];
      const neighbours = user_rank === -1 ? [] : rows.filter(row => row.rank >= user_rank - surroundings && row.rank <= user_rank + surroundings && row.rank > top_count && (row.rank > target_rank + surroundings || row.rank < target_rank - surroundings));
      const blank_row = { rank: 0, user_id: "...", points: 0 };

      new_rows = user_rank !== -1 && user_rank < target_rank ? [...top_list, user_rank > top_count + surroundings ? blank_row : null, ...neighbours, user_rank + surroundings < target_rank - surroundings ? blank_row : null, ...target_list, blank_row]
        : [...top_list, target_rank > top_count + surroundings ? blank_row : null, ...target_list, user_rank - surroundings > target_rank + surroundings ? blank_row : null, ...neighbours, blank_row];
    } else {
      new_rows = rows;
    }
    const final_rows = new_rows.filter(row => !!row).map(row => {
      let new_id = row.user_id;
      if (row.rank === user_rank) {
        new_id = row.user_id;
      } else if (row.user_id.startsWith(ID_PREFIX_PID)) {
        new_id = row.user_id.slice(0, 6) + "..." + row.user_id.slice(row.user_id.length - 2);
      } else if (row.user_id.startsWith(ID_PREFIX_PH)) {
        new_id = row.user_id.slice(0, 5) + "..." + row.user_id.slice(row.user_id.length - 2);
      } else {
        new_id = row.user_id.slice(0, 2) + "..." + row.user_id.slice(row.user_id.length - 2);
      }
      return {
        ...row,
        user_id: new_id,
      };
    });

    const data = {
      description,
      target_rank,
      user_rank,
      rows: final_rows,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchSoftPointLog(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: "action_at", dir: "desc" };
  const from = req.query.from || "";
  const to = req.query.to || "";
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

async function fetchSoftPointRank(req, res) {
  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const activityLimit = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.SOFTWARE);

    const is_limit_rank = activityLimit ? activityLimit.status : 0;
    const target_rank = (activityLimit && activityLimit.status === 1) ? activityLimit.target_rank : 0;
    const top_count = activityLimit ? activityLimit.top_count : 5;
    const surroundings = activityLimit ? activityLimit.surroundings : 2;
    const description = (activityLimit && activityLimit.status === 1) ? activityLimit.description || "" : "";

    const userRank = await PointModel.findSoftPointRankByUserPk(user.user_pk, is_limit_rank);
    const user_rank = userRank ? userRank.rank : -1;

    const filter = { offset: 0, limit: 0, sort: {}, is_limit_rank, target_rank, top_count, surroundings, user_rank, is_client: 1 };
    const rows = await PointModel.findSoftPointRank(filter, false);

    let new_rows = [];
    if (activityLimit) {
      const top_list = rows.filter(row => row.rank <= top_count);
      const target_list = target_rank ? rows.filter(row => row.rank >= target_rank - surroundings && row.rank <= target_rank + surroundings && row.rank > top_count) : [];
      const neighbours = user_rank === -1 ? [] : rows.filter(row => row.rank >= user_rank - surroundings && row.rank <= user_rank + surroundings && row.rank > top_count && (row.rank > target_rank + surroundings || row.rank < target_rank - surroundings));
      const blank_row = { rank: 0, user_id: "...", points: 0 };

      new_rows = user_rank !== -1 && user_rank < target_rank ? [...top_list, user_rank > top_count + surroundings ? blank_row : null, ...neighbours, user_rank + surroundings < target_rank - surroundings ? blank_row : null, ...target_list, blank_row]
        : [...top_list, target_rank > top_count + surroundings ? blank_row : null, ...target_list, user_rank - surroundings > target_rank + surroundings ? blank_row : null, ...neighbours, blank_row];
    } else {
      new_rows = rows;
    }
    const final_rows = new_rows.filter(row => !!row).map(row => {
      let new_id = row.user_id;
      if (row.rank === user_rank) {
        new_id = row.user_id;
      } else if (row.user_id.startsWith(ID_PREFIX_PID)) {
        new_id = row.user_id.slice(0, 6) + "..." + row.user_id.slice(row.user_id.length - 2);
      } else if (row.user_id.startsWith(ID_PREFIX_PH)) {
        new_id = row.user_id.slice(0, 5) + "..." + row.user_id.slice(row.user_id.length - 2);
      } else {
        new_id = row.user_id.slice(0, 2) + "..." + row.user_id.slice(row.user_id.length - 2);
      }
      return {
        ...row,
        user_id: new_id,
      };
    });

    const data = {
      description,
      target_rank,
      user_rank,
      rows: final_rows,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchEshopPointRank(req, res) {
  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const activityLimit = await PointModel.findActivityLimitBySource(ACTIVITY_LIMIT_SOURCES.ESHOP);
    if (!activityLimit || activityLimit.status === FLAG_NONE) {
      const data = {
        rows: [],
      };
      return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
    }

    const target_rank = activityLimit.target_rank;
    const top_count = activityLimit.top_count || 0;
    const surroundings = activityLimit.surroundings || 2;
    const description = activityLimit.description || "";

    const userRank = await EshopModel.findEshopPointRankByUserPk(user.user_pk);
    const user_rank = userRank ? userRank.rank : -1;

    const filter = { offset: 0, limit: 0, target_rank, top_count, surroundings, user_rank, is_client: 1 };
    const rows = await EshopModel.findEshopPointStats(filter, false);

    const top_list = rows.filter(row => row.rank <= top_count);
    const target_list = target_rank ? rows.filter(row => row.rank >= target_rank - surroundings && row.rank <= target_rank + surroundings && row.rank > top_count) : [];
    const neighbours = user_rank === -1 ? [] : rows.filter(row => row.rank >= user_rank - surroundings && row.rank <= user_rank + surroundings && row.rank > top_count && (row.rank > target_rank + surroundings || row.rank < target_rank - surroundings));
    const blank_row = { rank: 0, user_id: "...", points: 0 };

    const new_rows = user_rank !== -1 && user_rank < target_rank ? [...top_list, user_rank > top_count + surroundings ? blank_row : null, ...neighbours, user_rank + surroundings < target_rank - surroundings ? blank_row : null, ...target_list, blank_row]
      : [...top_list, target_rank > top_count + surroundings ? blank_row : null, ...target_list, user_rank - surroundings > target_rank + surroundings ? blank_row : null, ...neighbours, blank_row];
    const final_rows = new_rows.filter(row => !!row).map(row => {
      let new_id = row.user_id;
      if (row.rank === user_rank) {
        new_id = row.user_id;
      } else if (row.user_id.startsWith(ID_PREFIX_PID)) {
        new_id = row.user_id.slice(0, 6) + "..." + row.user_id.slice(row.user_id.length - 2);
      } else if (row.user_id.startsWith(ID_PREFIX_PH)) {
        new_id = row.user_id.slice(0, 5) + "..." + row.user_id.slice(row.user_id.length - 2);
      } else {
        new_id = row.user_id.slice(0, 2) + "..." + row.user_id.slice(row.user_id.length - 2);
      }
      return {
        ...row,
        user_id: new_id,
      };
    });

    const data = {
      description,
      target_rank,
      user_rank,
      rows: final_rows,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchRegisterPointLog(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: "action_at", dir: "desc" };
  const from = req.query.from || "";
  const to = req.query.to || "";
  const keyword = req.query.keyword || "";

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const filter = { offset, limit, sort, user_pk: user.user_pk, from, to, point_type: REG_POINT_TYPES.MANAGER, status: REG_POINT_STATUS.MINUS, keyword, is_client: 1 };
  try {
    const total = await PointModel.findRegisterPointLog(filter, true);
    const rows = await PointModel.findRegisterPointLog(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function getMergeStatus(req, res) {
  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const data = await UserModel.findMergeIdByFilter({ pvendor_pk: user.user_pk });
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function cancelMergeFixedId(req, res) {
  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const row = await UserModel.findMergeIdByFilter({ pvendor_pk: user.user_pk });
    if (!row) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_MERGE_ID_NEVER") });
    }

    const mergeParams = {
      pvendor_pk: user.user_pk,
      fixed_status: FIXED_STATUS.CANCELED,
    }
    const count = await UserModel.editMergeId(mergeParams);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addPhone(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["user_pk", "phone_number"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const phoneParams = {
      ...params,
      phone_type: PHONE_TYPE.MANAGER,
    };
    const row = await UserModel.addPhoneNumber(phoneParams);
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

async function deletePhone(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const { phone_pk } = req.body;
  try {
    const exist = await UserModel.findPhoneByPk(phone_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await UserModel.deletePhoneByPk(phone_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchUserCidLockList(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const rows = await UserModel.findUserCidLockList(user.user_pk);
    const data = { rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addUserCidLock(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["cid"];
  const params = extractValidParams(req.body, validKeys);
  try {
    if (!params.cid || params.cid.length !== CID_LENGTH) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("USER_ERR_CID_FORMAT") });
    }

    const cidParams = {
      user_pk: user.user_pk,
      cid: params.cid,
    };
    const exist = await UserModel.findUserCidLockByFilter(cidParams);
    if (exist) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const row = await UserModel.addUserCidLock(cidParams);
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

async function deleteUserCidLock(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const { table_pk } = req.body;
  try {
    const params = {
      table_pk,
    };
    const exist = await UserModel.findUserCidLockByFilter(params);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await UserModel.deleteUserCidLock(table_pk);
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
  fetchUser,
  editUser,
  changePassword,
  submitSurveyResponse,
  fetchLastUserId,
  fetchRegisteredUserId,
  addAchievement,
  fetchActivityPointBalance,
  fetchActivityPointLog,
  fetchActivityPointRank,
  fetchSoftPointLog,
  fetchSoftPointRank,
  fetchEshopPointRank,
  fetchRegisterPointLog,
  getMergeStatus,
  cancelMergeFixedId,
  addPhone,
  deletePhone,
  fetchUserCidLockList,
  addUserCidLock,
  deleteUserCidLock,
};
