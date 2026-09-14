const axios = require('axios');
const qs = require('qs');
const { API_TIMEOUT } = require('../constants/constants');
const RESP_CODES = require('../constants/responseCodes');

const cronAPI = axios.create({
  baseURL: process.env.CRON_SERVER_URL,
  timeout: API_TIMEOUT,
});

async function forwardRegisterUserId(user_pk) {
  const url = "/pid/register_userid_forward";
  const params = {
    user_pk,
  };
  try {
    const response = await cronAPI.get(`${url}?${qs.stringify(params)}`);
    return response.data.data;
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: cronAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function forwardUserPasswordLog(user_pk) {
  const url = "/pid/user_password_forward";
  const params = {
    user_pk,
  };
  try {
    const response = await cronAPI.get(`${url}?${qs.stringify(params)}`);
    return response.data.data;
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: cronAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

module.exports = {
  forwardRegisterUserId,
  forwardUserPasswordLog,
};
