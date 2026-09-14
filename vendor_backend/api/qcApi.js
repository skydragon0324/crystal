const axios = require('axios');
const qs = require('qs');
const { getLangText } = require('../lang/lang');
const RESP_CODES = require('../constants/responseCodes');
const { API_TIMEOUT } = require('../constants/constants');

const qcAPI = axios.create({
  baseURL: process.env.QC_SERVER_URL,
  timeout: API_TIMEOUT,
});

async function forwardFeedbackMessage(user_id, message_pk, message, action_at) {
  const url = "/servant/add_feedback_from_pid";
  const params = {
    msg_type: 1, // predefined message type for PID
    user_id,
    msg_content: message,
    action_at,
    related_id: message_pk,
  };
  try {
    const resp = await qcAPI.post(url, qs.stringify(params));
    const { data } = resp;
    if (data.code === RESP_CODES.SUCCESS.code) {
      return RESP_CODES.SUCCESS;
    } else if (data.code === 6005) {
      return { code: RESP_CODES.CONFLICT.code, message: getLangText("QC_ERR_ALREADY_SENT") };
    } else {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: qcAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

module.exports = {
  forwardFeedbackMessage,
};
