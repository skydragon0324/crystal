const axios = require('axios');
const qs = require('qs');
const { createResponse } = require('../utils/response');
const { getLangText } = require('../lang/lang');
const RESP_CODES = require('../constants/responseCodes');
const { API_TIMEOUT } = require('../constants/constants');

const webAPI = axios.create({
  baseURL: process.env.WEB_SERVER_URL,
  timeout: API_TIMEOUT,
});

async function fetchEprodRegistBalance(userid) {
  const url = "/eproduct/api/client/eprod_regist_balance";
  const params = {
    userid,
  };
  try {
    const resp = await webAPI.get(`${url}?${qs.stringify(params)}`);
    return createResponse(RESP_CODES.SUCCESS, resp.data);
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: webAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function fetchEprodRegistAddLog(user_id, offset, limit) {
  const url = "/eproduct/api/client/eprod_buyer_product_mobile";
  const params = {
    userid: user_id,
    offset,
    limit,
  };
  try {
    const resp = await webAPI.get(`${url}?${qs.stringify(params)}`);
    const { data } = resp;
    if (data.code !== RESP_CODES.SUCCESS.code) {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }

    return createResponse(RESP_CODES.SUCCESS, data.data);
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: webAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function fetchAllEprodRegisterLog(params) {
  const url = "/eproduct/api/admin/eprod_buyer_product";
  try {
    const resp = await webAPI.get(`${url}?${qs.stringify(params)}`);
    return createResponse(RESP_CODES.SUCCESS, resp.data);
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: webAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function fetchEprodRegistMinusLog(customer_pk, offset, limit) {
  const url = "/eproduct/api/client/eprod_regist_minus_log";
  const params = {
    customer_pk,
    offset,
    limit,
  };
  try {
    const resp = await webAPI.get(`${url}?${qs.stringify(params)}`);
    return createResponse(RESP_CODES.SUCCESS, resp.data);
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: webAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function fetchEprodProductNameBySN(sn) {
  const url = "/eproduct/api/client/product_name_by_sn";
  const params = {
    sn,
  };
  try {
    const resp = await webAPI.get(`${url}?${qs.stringify(params)}`);
    const { data } = resp;
    if (+data.code !== RESP_CODES.SUCCESS.code) {
      if (+data.code === 1032) {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("EPROD_ERR_OLD_PRODUCT_NAME") };
      } else {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("EPROD_ERR_GET_PRODUCT_NAME") };
      }
    }

    return createResponse(RESP_CODES.SUCCESS, resp.data.data);
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: webAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function checkEprodDuplicationBySN(sn) {
  try {
    const resp = await webAPI.get(`/eproduct/api/client/check_regist_product?sn_num=${sn}`);
    const { data } = resp;
    if (+data.code !== RESP_CODES.SUCCESS.code) {
      if (+data.code === 6005) {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("EPROD_ERR_ALREADY_REGISTERED") };
      } else {
        return RESP_CODES.INTERNAL_SERVER_ERROR;
      }
    }

    return {
      code: RESP_CODES.SUCCESS.code,
      message: getLangText("EPROD_SUCC_UNREGISTERED"),
    };
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: webAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function addRegisterProduct(params) {
  const url = "/eproduct/api/client/regist_product";
  try {
    const resp = await webAPI.post(url, qs.stringify(params));
    const { data } = resp;
    if (data.status === "fail") {
      if (+data.code === 6005) {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: data.message };
      } else {
        return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("EPROD_FAIL_REGISTER_PRODUCT") };
      }
    } else {
      return RESP_CODES.SUCCESS;
    }
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: webAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function notifyMergeUserId(user_id, fixed_id) {
  const url = "/eproduct/api/integration/id_integration";
  const params = {
    before_userid: user_id,
    after_userid: fixed_id,
  };
  try {
    const resp = await webAPI.post(url, qs.stringify(params));
    const { data } = resp;
    if (data.code === RESP_CODES.SUCCESS.code) {
      return RESP_CODES.SUCCESS;
    } else {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: webAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function fetchEprodSoftPointBalance(user_id) {
  const url = "/eproduct/api/integration/get_remain_info_by_userId";
  const params = {
    user_id,
  };
  try {
    const resp = await webAPI.get(`${url}?${qs.stringify(params)}`);
    const { data } = resp;
    if (data.code === RESP_CODES.SUCCESS.code && data.data.length > 0) {
      return createResponse(RESP_CODES.SUCCESS, data.data[0]);
    }
    return { code: data.code, message: data.message };
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: webAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function getProductInfoBySN(params) {
  const url = "/eproduct/index.php/api/integration/product_info_by_sn";
  try {
    const resp = await webAPI.get(`${url}?${qs.stringify(params)}`);
    const { data } = resp;
    if (data.code || !data.data) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: `${data.message} (${getLangText("ERR_CODE")}: ${data.code})` };
    }
    return { code: RESP_CODES.SUCCESS.code, message: data.message, data };
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: webAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function sendLicenseErrorReport(params) {
  const url = "/eproduct/api/client/send_lic_error_request_new";
  try {
    const resp = await webAPI.post(url, qs.stringify(params));
    const { data } = resp;
    if (data.code === RESP_CODES.SUCCESS.code) {
      return RESP_CODES.SUCCESS;
    } else {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: webAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function fetchKaraokeKeygenLog(params) {
  const url = "/eproduct/api/client/keygen_karaoke_log_new";
  try {
    const resp = await webAPI.get(`${url}?${qs.stringify(params)}`);
    const { data } = resp;
    if (data.code || !data.data) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: `${data.message} (${getLangText("ERR_CODE")}: ${data.code})` };
    }

    const ret = {
      total: +data.total,
      rows: data.data,
    };
    return createResponse(RESP_CODES.SUCCESS, ret);
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: webAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function fetchManbangKeygenLog(params) {
  const url = "/eproduct/api/client/keygen_manbang_log_new";
  try {
    const resp = await webAPI.get(`${url}?${qs.stringify(params)}`);
    const { data } = resp;
    if (data.code || !data.data) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: `${data.message} (${getLangText("ERR_CODE")}: ${data.code})` };
    }

    const ret = {
      total: +data.total,
      rows: data.data,
    };
    return createResponse(RESP_CODES.SUCCESS, ret);
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: webAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function fetchBMediaProviders(params) {
  const url = "/eproduct/api/client/media_providers";
  try {
    const resp = await webAPI.get(`${url}?${qs.stringify(params)}`);
    const { data } = resp;
    if (data.code || !data.data) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: `${data.message} (${getLangText("ERR_CODE")}: ${data.code})` };
    }

    const ret = {
      total: +data.total,
      rows: data.data,
    };
    return createResponse(RESP_CODES.SUCCESS, ret);
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: webAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function fetchBMediaKeygenLog(params) {
  const url = "/eproduct/api/client/media_license_log_new";
  try {
    const resp = await webAPI.get(`${url}?${qs.stringify(params)}`);
    const { data } = resp;
    if (data.code || !data.data) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: `${data.message} (${getLangText("ERR_CODE")}: ${data.code})` };
    }

    const ret = {
      total: +data.total,
      rows: data.data,
    };
    return createResponse(RESP_CODES.SUCCESS, ret);
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: webAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function fetchBMediaKeygenById(params) {
  const url = "/eproduct/api/client/media_license_by_id";
  try {
    const resp = await webAPI.get(`${url}?${qs.stringify(params)}`);
    const { data } = resp;
    if (!data.movies) {
      return RESP_CODES.INTERNAL_SERVER_ERROR;
    }

    const ret = {
      rows: data.movies,
    };
    return createResponse(RESP_CODES.SUCCESS, ret);
  } catch (err) {
    console.log({ status: err.response ? err.response.status : "service error", baseURL: webAPI.defaults.baseURL, url, ...params });
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

const realApi = {
  fetchEprodRegistBalance,
  fetchEprodRegistAddLog,
  fetchAllEprodRegisterLog,
  fetchEprodRegistMinusLog,
  fetchEprodProductNameBySN,
  checkEprodDuplicationBySN,
  addRegisterProduct,
  notifyMergeUserId,
  fetchEprodSoftPointBalance,
  getProductInfoBySN,
  sendLicenseErrorReport,
  fetchKaraokeKeygenLog,
  fetchManbangKeygenLog,
  fetchBMediaProviders,
  fetchBMediaKeygenLog,
  fetchBMediaKeygenById,
};

/*
 * With USE_MOCK_API=true the account pages that proxy this service are
 * served from mock/mockExternalApi.js instead. Only the functions the mock
 * defines are replaced, so anything not mocked still calls out for real
 * and fails the same way it would otherwise. See mock/README.md.
 */
module.exports =
  process.env.USE_MOCK_API === 'true'
    ? Object.assign({}, realApi, require('../mock/mockExternalApi').webApi)
    : realApi;
