const axios = require('axios');
const cryptoJs = require('crypto-js');
const qs = require('qs');
const { getLangText } = require('../lang/lang');
const RESP_CODES = require('../constants/responseCodes');
const { API_TIMEOUT } = require('../constants/constants');

const eprodAPI = axios.create({
  baseURL: process.env.EPROD_SERVER_URL,
  timeout: API_TIMEOUT,
});

async function getEprodCrmAfterServiceInfo(params) {
  const apiName = "get_crm_repair_info";
  const date = new Date();
  const time = Math.floor(date.getTime() / 1000);
  const message = `${apiName}|${time}`;
  const HASH_KEY = process.env.EPROD_HASH_KEY;
  const hash = "" + cryptoJs.HmacSHA256(message, HASH_KEY);
  const eprodParams = {
    time,
    hash,
    ...params,
  };

  const url = "/agency/repair/info_for_crm";
  try {
    const resp = await eprodAPI.get(`${url}?${qs.stringify(eprodParams)}`);
    const { data } = resp;
    if (data.code !== RESP_CODES.SUCCESS.code) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: `${data.message} (${getLangText("ERR_CODE")}}: ${data.code})` };
    }
    return { code: RESP_CODES.SUCCESS.code, message: data.message, data };
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: eprodAPI.defaults.baseURL, url, ...eprodParams });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

module.exports = {
  getEprodCrmAfterServiceInfo,
};
