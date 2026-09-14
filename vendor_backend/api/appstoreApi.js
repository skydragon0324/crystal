const axios = require('axios');
const qs = require('qs');
const { createResponse } = require('../utils/response');
const RESP_CODES = require('../constants/responseCodes');
const { API_TIMEOUT } = require('../constants/constants');

const walletAPI = axios.create({
  baseURL: process.env.APPSTORE_WALLET_URL,
  timeout: API_TIMEOUT,
});

const appstoreAPI = axios.create({
  baseURL: process.env.APPSTORE_SERVER_URL,
  timeout: API_TIMEOUT,
});

async function loginWallet(user_userid, password) {
  const url = "api/v1/users/login_external";
  const params = {
    user_userid,
    password,
  };

  try {
    const response = await walletAPI.post(url, params);
    if (response.data.errors) {
      return { code: response.data.errors.status_code, message: response.data.errors.title };
    }

    if (response.data.code === 0) {
      return { code: RESP_CODES.SUCCESS.code, message: response.data.msg, token: response.data.token };
    } else {
      return { code: RESP_CODES.SUCCESS.code, message: response.data.msg };
    }
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: walletAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function loginToken(token) {
  const url = "api/v1/users/loginWithToken";
  const params = {
    token,
  };
  try {
    const response = await walletAPI.post(url, params);
    if (response.data.errors) {
      return { code: response.data.errors.status_code, message: response.data.errors.title };
    }
    return { code: response.status, data: response.data };
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: walletAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function fetchTransactionLogV2(unique_id, filter) {
  const url = "/api/v3/histories";
  const params = {
    unique_id,
    count: filter.count,
    page: filter.page,
    start_day: filter ? filter.from : "",
    end_day: filter ? filter.to : "",
    type: filter.type,
  };

  try {
    const response = await walletAPI.get(`${url}?${qs.stringify(params)}`);
    if (response.data.meta.code !== 0) {
      return RESP_CODES.INTERNAL_SERVER_ERROR;  
    }

    const data = {
      total: response.data.data.last_page * filter.count,
      rows: response.data.data.items.map(row => ({
        unique_id: row.unique_id,
        money_value: +row.money_value,
        money_value_type_id: +row.money_value_type_id,
        transaction_type_id: +row.transaction_type_id,
        transaction_number: row.transaction_number,
        transaction_detail_1: row.transaction_detail_1,
        created_at: row.created_at,
      })),
    };
    // createResponse reads .code and .message off its first argument, so
    // passing SUCCESS.code (a number) produced { code: undefined } and
    // webAppstoreController's res.status(resp.code) threw on it. Every
    // other call site passes the whole RESP_CODES entry.
    return createResponse(RESP_CODES.SUCCESS, data);
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: walletAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function getPrhnBalance(unique_id) {
  const url = "/api/v2/maininfo/remainingCoins";
  const params = {
    unique_id,
  };
  try {
    const response = await walletAPI.post(url, params);
    return {
      code: response.status,
      data: response.data,
    };
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: walletAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function fetchTransactionLog(unique_id, offset, limit, filter) {
  const url = "/api/v2/maininfo/getTransactions";
  const params = {
    unique_id,
    length: limit,
    offset: offset,
    sort: "created_at",
    sort_by: "desc",
    type: filter ? filter.transaction_type : 0,
    start_day: filter ? filter.from : "",
    end_day: filter ? filter.to : "",
  };

  try {
    const { data } = await walletAPI.post(url, params);
  
    return createResponse(RESP_CODES.SUCCESS, {
      total: data.total,
      rows: data.items.map(row => ({
        unique_id: row.unique_id,
        money_value: +row.money_value,
        money_value_type_id: +row.money_value_type_id,
        transaction_type_id: +row.transaction_type_id,
        transaction_number: row.transaction_number,
        transaction_detail_1: row.transaction_detail_1,
        created_at: row.created_at,
      })),
    });
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: walletAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function fetchPurchaseLog(customer_id, offset, limit, filter) {
  url = "/api/maininfo/getPurchaseTableData";
  const params = {
    customer_id,
    iDisplayLength: limit,
    iDisplayStart: offset,
    from: filter ? filter.from : "",
    to: filter ? filter.to : "",
    sSearch: filter ? filter.keyword : "",
  };

  try {
    const { data } = await appstoreAPI.post(url, params);
  
    if (data.errors) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: `${RESP_CODES.INTERNAL_SERVER_ERROR.message} (error.status_code)` };
    }

    return createResponse(RESP_CODES.SUCCESS, { total: data.iTotalRecords, rows: data.mData })
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: appstoreAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function fetchLicenseQr(purchase_history_unique_id) {
  url = "/api/maininfo/getSpdMsg";
  const params = {
    purchase_history_unique_id,
  };

  try {
    const { data } = await appstoreAPI.post(url, params);

    if (!data.result) {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }

    const ret = {
      spd_state_id: data.spd_state_id,
      device_license: data.device_license,
    }
    return createResponse(RESP_CODES.SUCCESS, ret);
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: appstoreAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function fetchAppstoreComments(customer_id, offset, limit, filter) {
  url = "/api/maininfo/getCommentTableData";
  const params = {
    customer_id,
    iDisplayLength: limit,
    iDisplayStart: offset,
    from: filter ? filter.from : "",
    to: filter ? filter.to : "",
    sSearch: filter ? filter.keyword : "",
  };

  try {
    const { data } = await appstoreAPI.post(url, params);
  
    if (data.errors) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: `${RESP_CODES.INTERNAL_SERVER_ERROR.message} (error.status_code)` };
    }

    return createResponse(RESP_CODES.SUCCESS, { total: data.iTotalRecords, rows: data.mData })
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: appstoreAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function fetchAppstoreFavorites(customer_id, offset, limit, filter) {
  url = "/api/maininfo/getFavouriteTableData";
  const params = {
    customer_id,
    iDisplayLength: limit,
    iDisplayStart: offset,
    from: filter ? filter.from : "",
    to: filter ? filter.to : "",
    sSearch: filter ? filter.keyword : "",
  };

  try {
    const { data } = await appstoreAPI.post(url, params);
  
    if (data.errors) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: `${RESP_CODES.INTERNAL_SERVER_ERROR.message} (error.status_code)` };
    }

    const rows = data.mData.map(row => ({
      unique_id: row.unique_id,
      app_icon: row.app_icon ? row.app_icon.icon_144_144_url : "",
      name: row.name,
      active: row.active,
      created_at: row.created_at,
    }));
    return createResponse(RESP_CODES.SUCCESS, { total: data.iTotalRecords, rows })
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: appstoreAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function mergeUserId(pvendor_id, prhn_pwd, user_name, birthday, appstore_id, appstore_pwd, fix_id) {
  const url = "/api/maininfo/merge_userid";
  let params = {
    pvendor_id,
    prhn_pwd,
    user_name,
    birthday,
  };
  if (fix_id) {
    params = { ...params, fix_id };
  } else if (appstore_pwd) {
    params = { ...params, appstore_id, appstore_pwd };
  }
  try {
    const response = await appstoreAPI.post(url, params);
    const { data } = response;
    // 1008: password mismatch,
    // 1032: appstore_id not exist
    // 1033: user_name mismatch
    // 1034: birthday mismatch
    // 9999: unknown
    if (data.status === "success") {
      return createResponse(RESP_CODES.SUCCESS, data.data);
    } else if ([1032].includes(+data.error.code)) {
      return { code: RESP_CODES.NOT_FOUND.code, message: data.error.description };
    } else if ([1008, 1033, 1034, 9999].includes(+data.error.code)) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: data.error.description };
    }
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: appstoreAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function splitUserId(appstore_pk) {
  const url = "/api/maininfo/split_userid";
  let params = {
    appstore_pk,
  };
  try {
    const response = await appstoreAPI.post(url, params);
    const { data } = response;
    // 1008: password mismatch,
    // 1032: appstore_id not exist
    // 1033: user_name mismatch
    // 1034: birthday mismatch
    // 9999: unknown
    if (data.status === "success") {
      return createResponse(RESP_CODES.SUCCESS, data.data);
    } else if ([1032].includes(+data.error.code)) {
      return { code: RESP_CODES.NOT_FOUND.code, message: data.error.description };
    } else if ([1008, 1033, 1034, 9999].includes(+data.error.code)) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: data.error.description };
    }
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: appstoreAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function registerUserId(params) {
  const url = "/api/maininfo/register_userid";
  try {
    const response = await appstoreAPI.post(url, params);
    const { data } = response;
    // 1010: bad request,
    // 1035: user already registered
    // 9999: unknown
    if (data.status === "success") {
      return createResponse(RESP_CODES.SUCCESS, data.data);
    } else if ([1010].includes(+data.error.code)) {
      return { code: RESP_CODES.BAD_REQUEST.code, message: data.error.description };
    } else if ([1035].includes(+data.error.code)) {
      return { code: RESP_CODES.CONFLICT.code, message: data.error.description };
    } else if ([9999].includes(+data.error.code)) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: data.error.description };
    }
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: appstoreAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function changePassword(pvendor_id, prhn_pwd) {
  const url = "/api/maininfo/change_password";
  const params = {
    pvendor_id,
    prhn_pwd,
  };
  try {
    const response = await appstoreAPI.post(url, params);
    const { data } = response;
    // 1010: bad request,
    // 9999: unknown
    if (data.status === "success") {
      return createResponse(RESP_CODES.SUCCESS, data.data);
    } else if ([1010].includes(+data.error.code)) {
      return { code: RESP_CODES.BAD_REQUEST.code, message: data.error.description };
    } else if ([9999].includes(+data.error.code)) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: data.error.description };
    }
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: appstoreAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

const realApi = {
  loginWallet,
  loginToken,
  getPrhnBalance,
  fetchTransactionLog,
  fetchTransactionLogV2,
  fetchPurchaseLog,
  fetchLicenseQr,
  fetchAppstoreComments,
  fetchAppstoreFavorites,
  mergeUserId,
  splitUserId,
  registerUserId,
  changePassword,
};

/*
 * With USE_MOCK_API=true the account pages that proxy this service are
 * served from mock/mockExternalApi.js instead. Only the functions the mock
 * defines are replaced, so anything not mocked still calls out for real
 * and fails the same way it would otherwise. See mock/README.md.
 */
module.exports =
  process.env.USE_MOCK_API === 'true'
    ? Object.assign({}, realApi, require('../mock/mockExternalApi').appstoreApi)
    : realApi;
