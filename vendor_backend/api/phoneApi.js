const axios = require('axios');
const qs = require('qs');
const RESP_CODES = require('../constants/responseCodes');
const { API_TIMEOUT } = require('../constants/constants');

const phoneAPI = axios.create({
  baseURL: process.env.PHONE_SERVER_URL,
  timeout: API_TIMEOUT,
});

async function checkIdCardDuplication(model, id_card) {
  const url = "/checkIdCard";
  const params = {
    model,
    id_card,
  };
  try {
    const resp = await phoneAPI.post(url, qs.stringify(params));
    const { data } = resp;
    if (data.result === 0) {
      return RESP_CODES.SUCCESS;
    } else if (data.result === 1) {
      return { ...RESP_CODES.CONFLICT, message: data.error };
    } else if (data.result === 2) {
      return { ...RESP_CODES.BAD_REQUEST, message: data.error };
    } else {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: phoneAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function createPhoneBook(params) {
  const url = "/create";
  try {
    const resp = await phoneAPI.post(url, qs.stringify(params));
    const { data } = resp;
    if (data.error) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: data.error };
    } else {
      return RESP_CODES.SUCCESS;
    }
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: phoneAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function editPhoneBook(params) {
  const url = "/edit";
  try {
    const resp = await phoneAPI.post(url, qs.stringify(params));
    const { data } = resp;
    if (data.error) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: data.error };
    } else {
      return RESP_CODES.SUCCESS;
    }
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: phoneAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function deletePhoneBook(params) {
  const url = "/delete";
  try {
    const resp = await phoneAPI.post(url, qs.stringify(params));
    const { data } = resp;
    if (data.error) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: data.error };
    } else {
      const item = data.item;
      return { code: RESP_CODES.SUCCESS.code, message: data.message, data: { item } };
    }
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: phoneAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function searchPhoneBook(params) {
  const url = "/search";
  try {
    const resp = await phoneAPI.post(url, qs.stringify({ pager: params }));
    const { data } = resp;
    return { code: RESP_CODES.SUCCESS.code, message: data.message, data };
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: phoneAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function searchSaleAgencies(params) {
  const url = "/getAgentList";
  try {
    const resp = await phoneAPI.post(url, qs.stringify({ pager: params }));
    const { data } = resp;
    return { code: RESP_CODES.SUCCESS.code, message: data.message, data };
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: phoneAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

module.exports = {
  checkIdCardDuplication,
  createPhoneBook,
  editPhoneBook,
  deletePhoneBook,
  searchPhoneBook,
  searchSaleAgencies,
};
