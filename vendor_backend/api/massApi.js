const axios = require('axios');
const { createResponse } = require('../utils/response');
const RESP_CODES = require('../constants/responseCodes');
const { API_TIMEOUT } = require('../constants/constants');

const massAPI = axios.create({
  baseURL: process.env.MASS_SERVER_URL,
  timeout: API_TIMEOUT,
});

async function mergeUserId(pvendor_id, prhn_pwd, user_name, birthday, mass_id, mass_pwd, fix_id) {
  const url = "/collective_ids/merge-id";
  let params = {
    pvendor_id,
    prhn_pwd,
    user_name,
    birthday,
  };
  if (fix_id) {
    params = { ...params, fix_id };
  } else if (mass_pwd) {
    params = { ...params, mass_id, mass_pwd };
  }
  try {
    const response = await massAPI.post(url, params);
    const { data } = response;
    // 1008: password mismatch,
    // 1032: mass_id not exist
    // 1033: user_name mismatch
    // 1034: birthday mismatch
    // 9999: unknown
    if (data.status === "success") {
      return createResponse(RESP_CODES.SUCCESS, data.data);
    } else if (data.status === "error") {
      if ([1032].includes(+data.error.code)) {
        return { code: RESP_CODES.NOT_FOUND.code, message: data.error.description };
      } else if ([1008, 1033, 1034, 9999].includes(+data.error.code)) {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: data.error.description };
      }
    }
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: massAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function registerUserId(params) {
  const url = "/collective_ids/register-id";
  try {
    const response = await massAPI.post(url, params);
    const { data } = response;
    // 1010: bad request,
    // 1035: user already registered
    // 9999: unknown
    if (data.status === "success") {
      return createResponse(RESP_CODES.SUCCESS, data.data);
    } else if (data.status === "error") {
      if ([1010].includes(+data.error.code)) {
        return { code: RESP_CODES.BAD_REQUEST.code, message: data.error.description };
      } else if ([1035].includes(+data.error.code)) {
        return { code: RESP_CODES.CONFLICT.code, message: data.error.description };
      } else if ([9999].includes(+data.error.code)) {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: data.error.description };
      }
    }
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: massAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function changePassword(pvendor_id, prhn_pwd) {
  const url = "/collective_ids/change-password";
  const params = {
    pvendor_id,
    prhn_pwd,
  };
  try {
    const response = await massAPI.post(url, params);
    const { data } = response;
    // 1010: bad request,
    // 9999: unknown
    if (data.status === "success") {
      return createResponse(RESP_CODES.SUCCESS, data.data);
    } else if (data.status === "error") {
      if ([1010].includes(+data.error.code)) {
        return { code: RESP_CODES.BAD_REQUEST.code, message: data.error.description };
      } else if ([9999].includes(+data.error.code)) {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: data.error.description };
      }
    }
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: massAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

module.exports = {
  mergeUserId,
  registerUserId,
  changePassword,
};
