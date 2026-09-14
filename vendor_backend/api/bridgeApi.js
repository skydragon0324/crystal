const axios = require('axios');
const qs = require('qs');
const { createResponse } = require('../utils/response');
const RESP_CODES = require('../constants/responseCodes');
const { API_TIMEOUT } = require('../constants/constants');

const webBridge = axios.create({
  baseURL: process.env.WEB_PROXY_URL,
  timeout: API_TIMEOUT,
});

async function get(url) {
  try {
    const curlOption = {
      "47": 0, // CURLOPT_POST
      "42": 0, // CURLOPT_HEADER
      "10002": url, // CURLOPT_URL
      "19913": 1, // CURLOPT_RETURNTRANSFER
      "75": 1, // CURLOPT_FORBID_REUSE
      "13": 30, // CURLOPT_TIMEOUT
    };

    const data = {
      curlOption: JSON.stringify(curlOption),
      returnType: 'json',
    };
    const response = await webBridge.post("", qs.stringify(data));
    return createResponse(RESP_CODES.SUCCESS, response.data);
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: webBridge.defaults.baseURL, url });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function post(url, params) {
  try {
    const curlOption = {
      "47": 1, // CURLOPT_POST
      "42": 0, // CURLOPT_HEADER
      "10002": url, // CURLOPT_URL
      "19913": 1, // CURLOPT_RETURNTRANSFER
      "75": 1, // CURLOPT_FORBID_REUSE
      "13": 30, // CURLOPT_TIMEOUT
      "10015": qs.stringify(params), // CURLOPT_POSTFIELDS
    };
  
    const data = {
      curlOption: JSON.stringify(curlOption),
      returnType: 'json',
    };
    const response = await webBridge.post("", qs.stringify(data));

    return createResponse(RESP_CODES.SUCCESS, response.data);
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: webBridge.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR.code;
  }
}

async function postForm(url, params) {
  try {
    const curlOption = {
      "47": 1, // CURLOPT_POST
      "42": 0, // CURLOPT_HEADER
      "10002": url, // CURLOPT_URL
      "19913": 1, // CURLOPT_RETURNTRANSFER
      "75": 1, // CURLOPT_FORBID_REUSE
      "13": 30, // CURLOPT_TIMEOUT
      "10015": qs.stringify(params), // CURLOPT_POSTFIELDS
    };
  
    const data = {
      curlOption: JSON.stringify(curlOption),
      returnType: 'json',
    };
    const response = await webBridge.post("", qs.stringify(data), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    return createResponse(RESP_CODES.SUCCESS, response.data);
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: webBridge.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR.code;
  }
}

module.exports = {
  get,
  post,
  postForm,
};
