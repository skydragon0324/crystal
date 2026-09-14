const axios = require('axios');
const { API_TIMEOUT } = require('../constants/constants');

const mmsAPI = axios.create({
  baseURL: process.env.MMS_VERIFY_URL,
  timeout: API_TIMEOUT,
});

async function sendMmsVerification(user_pk, cid, verify_code) {
  // FIXME sendId and transId should be different for every api
  const response = await mmsAPI.get(`/Web_Proxy/?serviceId=34&serviceType=1&commission=1&settleId=1&sendId=${user_pk}&transId=${user_pk}&cid=${cid}&sendText=${verify_code}`);
  return response.data.data;
}

module.exports = {
  sendMmsVerification,
};
