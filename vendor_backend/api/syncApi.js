const axios = require('axios');
const RESP_CODES = require('../constants/responseCodes');
const { API_TIMEOUT } = require('../constants/constants');

const syncAPI = axios.create({
  baseURL: process.env.MOBILE_SERVER_URL,
  timeout: API_TIMEOUT,
});

async function syncFile(params) {
  const url = "/common/upload_file";
  try {    
    const resp = await syncAPI.post(url, params, {
      headers: params.getHeaders(),
    });

    if (resp.data.code !== RESP_CODES.SUCCESS.code) {
      return { code: resp.data.code, message: resp.data.message };
    }

    return RESP_CODES.SUCCESS;
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: syncAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

module.exports = {
  syncFile,
};
