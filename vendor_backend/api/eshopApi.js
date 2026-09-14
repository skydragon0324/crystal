const axios = require('axios');
const qs = require('qs');
const { createResponse } = require('../utils/response');
const { getLangText } = require('../lang/lang');
const RESP_CODES = require('../constants/responseCodes');
const { API_TIMEOUT, ESHOP_LOG_TYPE, ESHOP_WALLET_LOG_TYPE, ESHOP_WALLET_SHOP_ID, ESHOP_ORDER_STATUS_LIST } = require('../constants/constants');

const walletAPI = axios.create({
  baseURL: process.env.ESHOP_WALLET_URL,
  timeout: API_TIMEOUT,
});

const eshopAPI = axios.create({
  baseURL: process.env.ESHOP_SERVER_URL,
  timeout: API_TIMEOUT,
});

async function fetchCardInfo(userPk) {
  const url = "/www/backend/others/pid_apis/fetch_card_info";
  const params = { userPk };
  try {
    const response = await eshopAPI.post(url, qs.stringify(params), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    });
    const { data } = response;
    if (data.rsp_code === 0) {
      const json = data.cardInfo;
      return createResponse(RESP_CODES.SUCCESS, {
        card_type: +json.cardType,
        card_level: +json.cardLvl,
        vip_no: json.vipNo,
        customer_no: json.customerNo,
        real_value: json.realValue,
        prize_value: json.prizeValue,
        commerce_value: json.commerceValue,
        accum_value: json.accumValue,
      });
    } else if (data.message === getLangText("ESHOP_RESP_UNREGISTERED_USER")) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("ESHOP_ERR_NO_CARD") };
    } else {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: eshopAPI.defaults.baseURL, url, ...params });
    return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("ESHOP_ERR_EXCEPTION") };
  }
}

async function fetchTransactionLog(user_pk, offset, limit, filter) {
  const url = "/www/backend/others/pid_apis/get_transactions";
  const { type } = filter;
  let params = {
    userPk: user_pk,
    start: offset,
    length: limit,
    order: "fill_dt",
    orderBy: "desc",
    shopId: ESHOP_WALLET_SHOP_ID,
  };
  if (type === ESHOP_LOG_TYPE.EXP) {
    params = { ...params, type: ESHOP_WALLET_LOG_TYPE.EXP };
  } else if (type === ESHOP_LOG_TYPE.COMMERCE_VALUE) {
    params = { ...params, type: ESHOP_WALLET_LOG_TYPE.COMMERCE_VALUE };
  } else {
    params = { ...params, type: ESHOP_WALLET_LOG_TYPE.TRANSACTION };
  }

  try {
    const response = await eshopAPI.post(url, qs.stringify(params), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    });
    const { data } = response;
    if (data.rsp_code === 0) {
      return createResponse(RESP_CODES.SUCCESS, {
        total: data.count,
        rows: JSON.parse(data.data).map(row => ({
          ...row,
          money_value: row.money_value.toFixed(2),
        })),
      });
    } else {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: eshopAPI.defaults.baseURL, url, ...params });
    return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("ESHOP_ERR_EXCEPTION") };
  }
}

async function fetchEshopOrderList(user_pk, offset, limit) {
  const url = "/www/backend/others/pid_apis/getUserOrderLists";
  let params = {
    userPk: user_pk,
    start: offset,
    length: limit,
  };
  try {
    const response = await eshopAPI.post(url, qs.stringify(params), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    });
    const { data } = response;
    if (data.status === "success") {
      let rows = [];
      const lists = JSON.parse(data.data.lists);
      if (lists && lists.length > 0) {
        rows = lists.map(row => {
          const statusItem = ESHOP_ORDER_STATUS_LIST.find(item => item.id === +row.status);
          return {
            ...row,
            status: statusItem ? statusItem.name : "",
          };
        });
      }
      return createResponse(RESP_CODES.SUCCESS, { total: data.data.tCount, rows });
    } else {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: eshopAPI.defaults.baseURL, url, ...params });
    return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("ESHOP_ERR_EXCEPTION") };
  }
}

async function fetchEshopOrderDetail(order_id) {
  const url = "/www/backend/others/pid_apis/getOrderDetail";
  let params = {
    orderId: order_id,
  };
  try {
    const response = await eshopAPI.post(url, qs.stringify(params), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    });
    const { data } = response;
    if (data.status === "success") {
      let rows = [];
      if (data.data.lists && data.data.lists.length > 0) {
        rows = data.data.lists.map(row => {
          const statusItem = ESHOP_ORDER_STATUS_LIST.find(item => item.id === +row.status);
          return {
            ...row,
            status: statusItem ? statusItem.name : "",
          };
        });
      }
      return createResponse(RESP_CODES.SUCCESS, { rows });
    } else {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: eshopAPI.defaults.baseURL, url, ...params });
    return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("ESHOP_ERR_EXCEPTION") };
  }
}

async function mergeUserId(pvendor_id, prhn_pwd, user_name, birthday, eshop_id, eshop_pwd, fix_id) {
  const url = "/www/backend/others/pid_apis/merge_userid";
  let params = {
    pvendor_id,
    prhn_pwd,
    user_name,
    birthday,
  };
  if (fix_id) {
    params = { ...params, fix_id };
  } else if (eshop_pwd) {
    params = { ...params, eshop_id, eshop_pwd };
  }
  try {
    const response = await eshopAPI.post(url, qs.stringify(params), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    const { data } = response;
    // 1008: password mismatch,
    // 1010: bad request
    // 1030: eshop_id not exist
    // 1032: eshop_id not exist
    // 1033: user_name mismatch
    // 1034: birthday mismatch
    // 1035: user already registered
    // 9999: unknown
    if (data.status === "success") {
      return createResponse(RESP_CODES.SUCCESS, data.data);
    } else if (data.status === "error") {
      if ([1032].includes(+data.error.code)) {
        return { code: RESP_CODES.NOT_FOUND.code, message: data.error.description };
      } else if ([1008, 1010, 1030, 1033, 1034, 1035, 9999].includes(+data.error.code)) {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: data.error.description };
      }
    }
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: eshopAPI.defaults.baseURL, url, ...params });
    return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("ESHOP_ERR_EXCEPTION") };
  }
}

async function splitUserId(eshop_pk) {
  const url = "/www/backend/others/pid_apis/split_userid";
  let params = {
    eshop_pk,
  };
  try {
    const response = await eshopAPI.post(url, qs.stringify(params), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    const { data } = response;
    // 1010: bad request
    // 1032: eshop pk is not exist
    // 1035: eshop_pk is not merged
    // 1037: already joined with fixed id
    // 1038: user is not joined
    // 9999: unknown
    if (data.status === "success") {
      return createResponse(RESP_CODES.SUCCESS, data.data);
    } else if (data.status === "error") {
      if ([1032].includes(+data.error.code)) {
        return { code: RESP_CODES.NOT_FOUND.code, message: data.error.description };
      } else if ([1010, 1035, 1037, 9999].includes(+data.error.code)) {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: data.error.description };
      } else if ([1038].includes(+data.error.code)) {
        return RESP_CODES.SUCCESS;
      } else {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: data.error.description };
      }
    }
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: eshopAPI.defaults.baseURL, url, ...params });
    return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("ESHOP_ERR_EXCEPTION") };
  }
}

async function registerUserId(params) {
  const url = "/www/backend/others/pid_apis/register_userid";
  try {
    const response = await eshopAPI.post(url, qs.stringify(params), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
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
    console.log({ status: err.response ? err.response.status : "service error", baseURL: eshopAPI.defaults.baseURL, url, ...params });
    return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("ESHOP_ERR_EXCEPTION") };
  }
}

async function changePassword(pvendor_id, prhn_pwd) {
  const url = "/www/backend/others/pid_apis/change_password";
  let params = {
    pvendor_id,
    prhn_pwd,
  };
  try {
    const response = await eshopAPI.post(url, qs.stringify(params), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
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
    console.log({ status: err.response ? err.response.status : "service error", baseURL: eshopAPI.defaults.baseURL, url, ...params });
    return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("ESHOP_ERR_EXCEPTION") };
  }
}

async function fetchAllCards(offset, limit) {
  const url = "/get_all_cards";
  const params = { offset, limit, shopId: ESHOP_WALLET_SHOP_ID };
  try {
    const response = await walletAPI.post(url, qs.stringify(params), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: process.env.ESHOP_WALLET_REFERER,
      }
    });
    if (response.data.rsp_code === 0) {
      const data = {
        total: +response.data.count,
        rows: response.data.records,
      };
      return createResponse(RESP_CODES.SUCCESS, data);
    } else {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: walletAPI.defaults.baseURL, url, ...params });
    return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("ESHOP_WALLET_EXCEPTION") };
  }
}

async function fetchCombineLog(limit, last_at) {
  const url = "/www/backend/others/pid_apis/get_user_combine_histories";
  const params = { limit, last_at };
  try {
    const response = await eshopAPI.post(url, qs.stringify(params), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    });
    const { data } = response;
    return createResponse(RESP_CODES.SUCCESS, { rows: data });
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: eshopAPI.defaults.baseURL, url, ...params });
    return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("ESHOP_ERR_EXCEPTION") };
  }
}

async function addPhoneBook(params) {
  const url = "/create_acc";
  try {
    const response = await walletAPI.post(url, qs.stringify(params), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: process.env.ESHOP_WALLET_REFERER,
      }
    });
    const { data } = response;
    // 1: card not exist
    // 5: commerce value is less than threshold
    // 6: reserve info already exists
    // 13: connection error with phone book server (3 dept)
    // 14: error message (3 dept)
    if ([0, 6].includes(data.rsp_code)) {
      return RESP_CODES.SUCCESS;
    } else if ([5, 13, 14].includes(data.rsp_code)) {
      return { code: RESP_CODES.BAD_REQUEST.code, message: `${data.message} (${getLangText("ERR_CODE")}: ${data.rsp_code})` };
    } else {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: `${data.message} (${getLangText("ERR_CODE")}: ${data.rsp_code})` };
    }
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: walletAPI.defaults.baseURL, url, ...params });
    return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("ESHOP_WALLET_EXCEPTION") };
  }
}

async function editPhoneBook(params) {
  const url = "/edit_acc";
  try {
    const response = await walletAPI.post(url, qs.stringify(params), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: process.env.ESHOP_WALLET_REFERER,
      }
    });
    const { data } = response;
    if (data.rsp_code !== 0) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: `${data.message} (${getLangText("ERR_CODE")}: ${data.rsp_code})` };
    }
    return RESP_CODES.SUCCESS;
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: walletAPI.defaults.baseURL, url, ...params });
    return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("ESHOP_WALLET_EXCEPTION") };
  }
}

async function deletePhoneBook(params) {
  const url = "/del_acc";
  try {
    const response = await walletAPI.post(url, qs.stringify(params), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: process.env.ESHOP_WALLET_REFERER,
      }
    });
    const { data } = response;
    // 0: success
    // 1: no data to refund = already refunded
    if (![0, 1].includes(data.rsp_code)) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: `${data.message} (${getLangText("ERR_CODE")}: ${data.rsp_code})` };
    }
    return RESP_CODES.SUCCESS;
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: walletAPI.defaults.baseURL, url, ...params });
    return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("ESHOP_WALLET_EXCEPTION") };
  }
}

async function fetchCrmCards(offset, limit) {
  const url = "/get_crm_his";
  const params = { offset, limit, shopId: ESHOP_WALLET_SHOP_ID };
  try {
    const response = await walletAPI.post(url, qs.stringify(params), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: process.env.ESHOP_WALLET_REFERER,
      }
    });
    if (response.data.rsp_code === 0) {
      const data = {
        total: +response.data.count,
        rows: response.data.records,
      };
      return createResponse(RESP_CODES.SUCCESS, data);
    } else {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: walletAPI.defaults.baseURL, url, ...params });
    return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("ESHOP_WALLET_EXCEPTION") };
  }
}

async function fetchCrmEshop(offset, limit) {
  const url = "/www/backend/others/pid_apis/getEshopCrmInfo";
  const params = { startDate: "", endDate: "", keyword: "", start: offset, length: limit };
  try {
    const response = await eshopAPI.post(url, qs.stringify(params), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    });
    if (response.data.status === "success") {
      const data = {
        total: +response.data.data.tCount,
        rows: response.data.data.lists,
      };
      return createResponse(RESP_CODES.SUCCESS, data);
    } else {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: eshopAPI.defaults.baseURL, url, ...params });
    return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("ESHOP_ERR_EXCEPTION") };
  }
}

const realApi = {
  fetchCardInfo,
  fetchTransactionLog,
  fetchEshopOrderList,
  fetchEshopOrderDetail,
  mergeUserId,
  splitUserId,
  registerUserId,
  changePassword,
  fetchAllCards,
  fetchCombineLog,
  addPhoneBook,
  editPhoneBook,
  deletePhoneBook,
  fetchCrmCards,
  fetchCrmEshop,
};

/*
 * With USE_MOCK_API=true the account pages that proxy this service are
 * served from mock/mockExternalApi.js instead. Only the functions the mock
 * defines are replaced, so anything not mocked still calls out for real
 * and fails the same way it would otherwise. See mock/README.md.
 */
module.exports =
  process.env.USE_MOCK_API === 'true'
    ? Object.assign({}, realApi, require('../mock/mockExternalApi').eshopApi)
    : realApi;
