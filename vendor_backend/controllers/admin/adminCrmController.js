const xlsx = require("xlsx");
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const { validationResult } = require('express-validator');
const UserModel = require('../../models/userModel');
const CrmModel = require('../../models/crmModel');
const EprodApi = require('../../api/eprodApi');
const WebApi = require('../../api/webApi');
const EshopApi = require('../../api/eshopApi');
const { createResponse } = require('../../utils/response');
const { formatDateForClient, extractValidParams, formatPhoneNumber } = require('../../utils/utils');
const { getLangText } = require("../../lang/lang");
const RESP_CODES = require('../../constants/responseCodes');
const { JOBS, CUSTOMER_SOURCE, CUSTOMER_STATUS, DEFAULT_PAGE_SIZE, PHONE_TYPE, PHONE_NUMBER_MAX_COUNT, FLAG_EXIST, DOWNLOAD_PATH, CRM_SPLITTER } = require('../../constants/constants');

async function fetchCrmCustomers(req, res) {
  const offset = +req.query.offset || 0;
  const limit = req.query.limit === undefined ? DEFAULT_PAGE_SIZE : +req.query.limit;
  const sort = { key: req.query.sortKey || "created_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const gender = req.query.gender;
  const source = req.query.source;
  const status = req.query.status;

  try {
    const filter = { offset, limit, sort, keyword, gender, source, status };
    const total = await CrmModel.findCustomers(filter, true);
    const rows = await CrmModel.findCustomers(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addCustomerByPid(params, user_pk) {
  const jobItem = params.job ? JOBS.find(item => item.id === +params.job) : undefined;
  const addrItem = params.location_pk ? await UserModel.findLocationFullNameByPk(params.location_pk) : undefined;
  const cuParams = {
    user_name: params.user_name || "",
    gender: params.gender,
    birth_year: formatDateForClient(params.birthday),
    job: jobItem ? jobItem.name : "",
    address: addrItem ? addrItem.full_name : "",
    source: CUSTOMER_SOURCE.PID,
    status: CUSTOMER_STATUS.ACTIVE,
    pvendor_pk: user_pk,
    pvendor_id: params.user_id,
  };
  const row = await CrmModel.addCustomer(cuParams);
  if (!row) {
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }

  const data = { row };
  return createResponse(RESP_CODES.SUCCESS, data);
}

async function editCustomerByPid(params, orgUser) {
  const job = params.job ? params.job : orgUser.job;
  const jobItem = job ? JOBS.find(item => item.id === +job) : undefined;
  const location_pk = params.location_pk ? params.location_pk : orgUser.location_pk;
  const addrItem = location_pk ? await UserModel.findLocationFullNameByPk(location_pk) : undefined;
  const cuParams = {
    user_name: params.user_name ? params.user_name : (orgUser.user_name || ""),
    gender: params.gender ? params.gender : orgUser.gender,
    birth_year: params.birthday ? formatDateForClient(params.birthday) : formatDateForClient(orgUser.birthday),
    job: jobItem ? jobItem.name : "",
    address: addrItem ? addrItem.full_name : "",
    pvendor_pk: orgUser.user_pk,
  };
  const count = await CrmModel.editCustomerByPvendorPk(cuParams);
  if (count === 0) {
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }

  return RESP_CODES.SUCCESS;
}

async function editCustomerPhoneNumberbyPid(user_pk, phone_number) {
  const customer = await CrmModel.findCustomerByPvendorPk(user_pk);
  if (!customer) {
    return RESP_CODES.NOT_FOUND;
  }

  const cuParams = {
    ecid: customer.ecid,
    phone_number,
  };
  const count = await CrmModel.editCustomer(cuParams);
  if (count === 0) {
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }

  return RESP_CODES.SUCCESS;
}

async function migrateUserToCustomer(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;

  try {
    const filter = { offset, limit };
    const users = await UserModel.findUsersForCrm(filter);
    if (users.length === 0) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const prhn_pks = users.map(row => row.user_pk);
    const exists = await CrmModel.findCustomersInPvendorPk(prhn_pks);
    const exist_pks = exists ? exists.map(row => row.pvendor_pk) : [];
    const exist_users = users.filter(row => exist_pks.includes(row.user_pk));
    const new_users = users.filter(row => !exist_pks.includes(row.user_pk));
    const all_phones = await UserModel.findPhonesInUserPks(prhn_pks);

    if (new_users.length > 0) {
      const CNT = 10;
      const len = Math.ceil(new_users.length / CNT);
      for (let i = 0; i < len; i++) {
        const new_rows = new_users.slice(CNT * i, CNT * (i + 1)).map(row => {
          const jobItem = row.job ? JOBS.find(item => item.id === +row.job) : undefined;
          const user_phones = all_phones.filter(item => (item.user_pk === row.user_pk && [PHONE_TYPE.USER, PHONE_TYPE.MANAGER].includes(item.phone_type))).slice(0, PHONE_NUMBER_MAX_COUNT);
          const nonDup = [...new Set(user_phones.map(item => item.phone_number))];
          return {
            user_name: row.user_name || "",
            gender: row.gender,
            birth_year: formatDateForClient(row.birthday),
            job: jobItem ? jobItem.name : "",
            address: row.address,
            phone_number: nonDup.length > 0 ? nonDup.join(",") : "",
            source: CUSTOMER_SOURCE.PID,
            status: CUSTOMER_STATUS.ACTIVE,
            pvendor_pk: row.user_pk,
            pvendor_id: row.user_id,
            created_at: moment(row.created_at).toDate(),
          };
        });
        await CrmModel.addCustomers(new_rows);
      }
    } else {
      for (const row of exist_users) {
        const jobItem = row.job ? JOBS.find(item => item.id === +row.job) : undefined;
        const user_phones = all_phones.filter(item => (item.user_pk === row.user_pk && [PHONE_TYPE.USER, PHONE_TYPE.MANAGER].includes(item.phone_type))).slice(0, PHONE_NUMBER_MAX_COUNT);
        const nonDup = [...new Set(user_phones.map(item => item.phone_number))];
        const cuParams = {
          user_name: row.user_name || "",
          gender: row.gender,
          birth_year: formatDateForClient(row.birthday),
          job: jobItem ? jobItem.name : "",
          address: row.address,
          phone_number: nonDup.length > 0 ? nonDup.join(",") : "",
          pvendor_pk: row.user_pk,
          pvendor_id: row.user_id,
        };
        await CrmModel.editCustomerByPvendorPk(cuParams);
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchProductCategories(req, res) {
  const offset = +req.query.offset || 0;
  const limit = req.query.limit === undefined ? DEFAULT_PAGE_SIZE : +req.query.limit;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const parent_pk = req.query.parent_pk;
  const is_leaf = req.query.is_leaf;
  const is_deleted = req.query.is_deleted;

  try {
    const filter = { offset, limit, sort, keyword, parent_pk, is_leaf, is_deleted };
    const total = await CrmModel.findProdCategories(filter, true);
    const rows = await CrmModel.findProdCategories(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchProductRootCategories(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || 0;
  const keyword = req.query.keyword || "";
  const is_deleted = FLAG_EXIST;

  try {
    const filter = { offset, limit, keyword, is_deleted };
    const total = await CrmModel.findProdRootCategories(filter, true);
    const rows = await CrmModel.findProdRootCategories(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchProductLeafCategories(req, res) {
  const is_deleted = FLAG_EXIST;

  try {
    const filter = { offset: 0, limit: 0, is_deleted };
    const rows = await CrmModel.findProdLeafCategories(filter, false);
    const data = { rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchCrmProducts(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const root_pk = req.query.root_pk;

  try {
    const filter = { offset, limit, sort, keyword, root_pk };
    const total = await CrmModel.findProducts(filter, true);
    const rows = await CrmModel.findProducts(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addCrmProduct(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["product_name", "simple_name", "category_pk", "root_pk", "position"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const row = await CrmModel.addProduct(params);
    if (!row) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const data = { row };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function editCrmProduct(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["product_pk", "product_name", "simple_name", "category_pk", "root_pk", "position"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await CrmModel.findProductByPk(params.product_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await CrmModel.editProduct(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteCrmProduct(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { product_pk, is_deleted } = req.body;
  try {
    const exist = await CrmModel.findProductByPk(product_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { product_pk, is_deleted };
    const count = await CrmModel.editProduct(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const data = { count };
    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchCrmProdSpecKeys(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "", dir: req.query.sortDir || "" };
  const keyword = req.query.keyword || "";
  const is_deleted = req.query.is_deleted;

  try {
    const filter = { offset, limit, sort, keyword, is_deleted };
    const total = await CrmModel.findSpecKeys(filter, true);
    const rows = await CrmModel.findSpecKeys(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchCrmProdSpecKeyChoices(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;

  try {
    const filter = { offset, limit };
    const rows = await CrmModel.findSpecKeyChoices(filter, false);
    const data = { rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addCrmProdSpecKey(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["spec_key", "spec_name", "spec_type"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const dup = await CrmModel.findSpecKeyByKey(params.spec_key);
    if (dup) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const row = await CrmModel.addSpecKey(params);
    if (!row) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const data = { row };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function editCrmProdSpecKey(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["spec_pk", "spec_key", "spec_name", "spec_type"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await CrmModel.findSpecKeyByPk(params.spec_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const dup = await CrmModel.findSpecKeyByKey(params.spec_key);
    if (dup && dup.spec_pk !== params.spec_pk) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const count = await CrmModel.editSpecKey(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteCrmProdSpecKey(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { spec_pk, is_deleted } = req.body;
  try {
    const exist = await CrmModel.findSpecKeyByPk(spec_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { spec_pk, is_deleted };
    const count = await CrmModel.editSpecKey(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchCrmProdSpecValues(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "", dir: req.query.sortDir || "" };
  const keyword = req.query.keyword || "";
  const is_deleted = req.query.is_deleted;
  const root_pk = req.query.root_pk;
  const spec_pk = req.query.spec_pk;

  try {
    const filter = { offset, limit, sort, keyword, is_deleted, root_pk, spec_pk };
    const total = await CrmModel.findSpecValues(filter, true);
    const rows = await CrmModel.findSpecValues(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addCrmProdSpecValue(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["root_pk", "spec_pk", "spec_value", "position"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const filter = {
      root_pk: params.root_pk,
      spec_pk: params.spec_pk,
      spec_value: params.spec_value,
    };
    const dup = await CrmModel.findSpecValueByFilter(filter);
    if (dup) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const row = await CrmModel.addSpecValue(params);
    if (!row) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const data = { row };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function editCrmProdSpecValue(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["value_pk", "root_pk", "spec_pk", "spec_value", "position"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await CrmModel.findSpecValueByPk(params.value_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const filter = {
      root_pk: params.root_pk,
      spec_pk: params.spec_pk,
      spec_value: params.spec_value,
    };
    const dup = await CrmModel.findSpecValueByFilter(filter);
    if (dup && dup.value_pk !== params.value_pk) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const count = await CrmModel.editSpecValue(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteCrmProdSpecValue(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { value_pk, is_deleted } = req.body;
  try {
    const exist = await CrmModel.findSpecValueByPk(value_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { value_pk, is_deleted };
    const count = await CrmModel.editSpecValue(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchCrmProdSpecOrders(req, res) {
  const offset = +req.query.offset || 0;
  const limit = req.query.limit === undefined ? DEFAULT_PAGE_SIZE : +req.query.limit;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const root_pk = req.query.root_pk;

  try {
    const filter = { offset, limit, sort, keyword, root_pk };
    const total = await CrmModel.findSpecOrders(filter, true);
    const rows = await CrmModel.findSpecOrders(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addCrmProdSpecOrder(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["root_pk", "spec_pk", "position", "is_required", "spec_label"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const orderFilter = {
      root_pk: params.root_pk,
      spec_pk: params.spec_pk,
    };
    const dup = await CrmModel.findSpecOrderByFilter(orderFilter);
    if (dup) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const row = await CrmModel.addSpecOrder(params);
    if (!row) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const data = { row };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function editCrmProdSpecOrder(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["table_pk", "root_pk", "spec_pk", "position", "is_required", "spec_label"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await CrmModel.findSpecOrderByPk(params.table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    if (params.root_pk && params.spec_pk) {
      const orderFilter = {
        root_pk: params.root_pk,
        spec_pk: params.spec_pk,
      };
      const dup = await CrmModel.findSpecOrderByFilter(orderFilter);
      if (dup && dup.table_pk !== params.table_pk) {
        return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
      }
    }

    const count = await CrmModel.editSpecOrder(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteCrmProdSpecOrder(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { table_pk, is_deleted } = req.body;
  try {
    const exist = await CrmModel.findSpecOrderByPk(table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { table_pk, is_deleted };
    const count = await CrmModel.editSpecOrder(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchCrmProdSurveyOptions(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "", dir: req.query.sortDir || "" };
  const keyword = req.query.keyword || "";
  const is_deleted = req.query.is_deleted;
  const root_pk = req.query.root_pk;

  try {
    const filter = { offset, limit, sort, keyword, is_deleted, root_pk };
    const total = await CrmModel.findProdSurveyOptions(filter, true);
    const rows = await CrmModel.findProdSurveyOptions(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addCrmProdSurveyOption(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["root_pk", "option_name", "position"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const filter = {
      root_pk: params.root_pk,
      option_name: params.option_name,
    };
    const dup = await CrmModel.findProdSurveyOptionByFilter(filter);
    if (dup) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const row = await CrmModel.addProdSurveyOption(params);
    if (!row) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const data = { row };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function editCrmProdSurveyOption(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["option_pk", "root_pk", "option_name", "position"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await CrmModel.findProdSurveyOptionByPk(params.option_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const filter = {
      root_pk: params.root_pk,
      option_name: params.option_name,
    };
    const dup = await CrmModel.findProdSurveyOptionByFilter(filter);
    if (dup && dup.option_pk !== params.option_pk) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const count = await CrmModel.editProdSurveyOption(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteCrmProdSurveyOption(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { option_pk, is_deleted } = req.body;
  try {
    const exist = await CrmModel.findProdSurveyOptionByPk(option_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { option_pk, is_deleted };
    const count = await CrmModel.editProdSurveyOption(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchCrmEprodSales(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "", dir: req.query.sortDir || "" };
  const keyword = req.query.keyword || "";
  const root_pk = req.query.root_pk;

  try {
    const filter = { offset, limit, sort, keyword, root_pk };
    const total = await CrmModel.findCrmEprodSales(filter, true);
    const rows = await CrmModel.findCrmEprodSales(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function importCrmEprodSales(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["root_pk", "excel_data"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const sn_nums = params.excel_data.map(row => row.serial_no).filter(item => !!item).map(item => "" + item);
    const eprodParams = {
      sns: sn_nums.join(","),
    };
    const resp = await WebApi.getProductInfoBySN(eprodParams);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("EPROD_API_FAIL") });
    }

    const eprod_data = resp.data.data.filter(item => !!item.crm_category_name);
    const replied_nums = eprod_data.map(item => item.sn);
    const confirmed_data = params.excel_data.filter(row => replied_nums.includes("" + row.serial_no));
    const missing_data = params.excel_data.filter(row => !replied_nums.includes("" + row.serial_no));

    const spec_values = await CrmModel.findSpecValuesByRootPk(params.root_pk);
    const survey_options = await CrmModel.findProdSurveyOptionsByRootPk(params.root_pk);

    for (const row of confirmed_data) {
      let customer = await CrmModel.findCustomerByCrm(row);
      if (!customer) {
        const userParams = {
          user_name: row.user_name,
          gender: row.gender,
          birth_year: row.birth_year,
          job: row.job,
          address: row.address,
          phone_number: row.phone_number,
          source: CUSTOMER_SOURCE.EPROD,
          status: CUSTOMER_STATUS.ACTIVE,
        };
        customer = await CrmModel.addCustomer(userParams);
      }

      const delete_filter = {
        ecid: customer.ecid,
        serial_no: "" + row.serial_no,
      };
      await CrmModel.deleteCrmEprodChosenSpecs(delete_filter);

      const base_data = {
        ecid: customer.ecid,
        serial_no: "" + row.serial_no,
      };
      const serious_views = row.serious_views ? row.serious_views.split(",").map(item => item.trim()).filter(item => !!item) : [];
      await addEprodChosenSpecsByKey(spec_values, "serious_views", serious_views, base_data);
      const purchase_motives = row.purchase_motives ? row.purchase_motives.split(",").map(item => item.trim()).filter(item => !!item) : [];
      await addEprodChosenSpecsByKey(spec_values, "purchase_motives", purchase_motives, base_data);
      await addEprodChosenSpecsByKey(spec_values, "outlook", [row.outlook], base_data);
      await addEprodChosenSpecsByKey(spec_values, "led_type", [row.led_type], base_data);
      await addEprodChosenSpecsByKey(spec_values, "has_tv_mount", [row.has_tv_mount], base_data);

      await CrmModel.deleteProdSurveyResponses(delete_filter);
      const survey_ups = row.survey_up ? row.survey_up.split(",").map(item => item.trim()).filter(item => !!item) : [];
      await addProdSurveyRespByOption(survey_options, survey_ups, { ...base_data, rating: 1 });
      const survey_downs = row.survey_down ? row.survey_down.split(",").map(item => item.trim()).filter(item => !!item) : [];
      await addProdSurveyRespByOption(survey_options, survey_downs, { ...base_data, rating: -1 });

      const eprod_row = eprod_data.find(item => item.sn === "" + row.serial_no);
      const exist = await CrmModel.findCrmEprodSaleBySN(row.serial_no);
      if (exist) {
        if (exist.ecid !== customer.ecid) {
          const transferParams = {
            ecid: exist.ecid,
            user_name: exist.user_name,
            gender: exist.gender,
            birth_year: exist.birth_year,
            job: exist.job,
            address: exist.address,
            phone_number: exist.phone_number,
            serial_no: exist.serial_no,
            created_at: moment(exist.created_at).toDate(),
          };
          await CrmModel.addCrmEprodTransLog(transferParams);
        }
        await CrmModel.editCrmEprodSale({
          ...row,
          table_pk: exist.table_pk,
          ecid: customer.ecid,
        });
      } else {
        await CrmModel.addCrmEprodSale({
          ...row,
          ecid: customer.ecid,
          root_pk: params.root_pk,
          category_name: eprod_row ? eprod_row.crm_category_name : "",
          product_name: eprod_row ? eprod_row.product_name : "",
        });
      }
    }

    // export missing rows
    if (missing_data.length > 0) {
      const worksheet = xlsx.utils.json_to_sheet(missing_data);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, "error_list");

      const timestamp = moment().format("YYMMDDHHmmss");
      const fileName = `error_${timestamp}.xlsx`;
      const filePath = path.join(`${DOWNLOAD_PATH}/error`, fileName);
      const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
      fs.writeFileSync(filePath, buffer);

      const data = { path: filePath, name: fileName };
      return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addEprodChosenSpecsByKey(spec_values, spec_key, chosen_values, base_data) {
  if (spec_values.length === 0 || chosen_values.length === 0) {
    return;
  }

  const spec_keys = spec_values.filter(item => item.spec_key === spec_key && chosen_values.includes(item.spec_value));
  if (spec_keys.length === 0) {
    return;
  }

  const insert_rows = spec_keys.map((item, idx) => ({
    ecid: base_data.ecid,
    serial_no: base_data.serial_no,
    value_pk: item.value_pk,
    spec_value: item.spec_value,
    position: idx,
  }));
  await CrmModel.addCrmEprodChosenSpecs(insert_rows);
}

async function addProdSurveyRespByOption(survey_options, chosen_options, base_data) {
  if (survey_options.length === 0 || chosen_options.length === 0) {
    return;
  }

  const chosen_rows = survey_options.filter(item => chosen_options.includes(item.option_name));
  if (chosen_rows.length > 0) {
    const insert_rows = chosen_rows.map(item => ({
      ecid: base_data.ecid,
      serial_no: base_data.serial_no,
      option_pk: item.option_pk,
      option_name: item.option_name,
      rating: base_data.rating,
    }));
    await CrmModel.addProdSurveyResponses(insert_rows);
  }
}

async function syncCrmEprodAfterService(req, res) {
  try {
    const offset = +req.query.offset || 0;
    const limit = req.query.limit ? +req.query.limit : 50;
    let last_at = req.query.last_at || "";
    if (!last_at) {
      last_at = await CrmModel.findCrmEprodAsLastAt();
    }

    const filter = { start: offset, limit, orderby: "updated_at", order: "asc", updated_at: last_at };
    const crmResp = await EprodApi.getEprodCrmAfterServiceInfo(filter);
    if (crmResp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(crmResp.code).json(crmResp);
    }

    const sn_nums = crmResp.data.data.map(row => row.sn.replace(/\D/g, '')).filter(item => !!item);
    let sn_details = [];
    if (sn_nums) {
      const eprodParams = {
        sns: sn_nums.join(","),
      };
      const snResp = await WebApi.getProductInfoBySN(eprodParams);
      if (snResp.code === RESP_CODES.SUCCESS.code) {
        sn_details = snResp.data.data;
      } else {
        return res.status(snResp.code).json(snResp);
      }
    }

    if (sn_details.length === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR, message: `${getLangText("EPROD_ERR_GET_PROD_INFO_BY_SN")} (${sn_nums.join(", ")})` });
    }

    for (const row of crmResp.data.data) {
      const prod_info = sn_details.find(item => item.sn === row.sn);
      const crm_info = {
        ...row,
        root_pk: prod_info ? prod_info.crm_prod_category_im_pk : "",
        category_name: prod_info ? prod_info.crm_category_name : row.product,
        product_name: prod_info ? prod_info.product_name : row.product,
        phone_number: formatPhoneNumber(row.phone),
      }
      await addEprodCrmDataByAS(crm_info);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addEprodCrmDataByAS(row) {
  const crmFilter = {
    user_name: row.name,
    phone_number: row.phone_number,
  };
  let customer = await CrmModel.findCustomerByCrm(crmFilter);
  if (!customer) {
    const customerParams = {
      user_name: row.name,
      address: row.address,
      phone_number: row.phone_number,
      source: CUSTOMER_SOURCE.EPROD,
      status: CUSTOMER_STATUS.ACTIVE,
    };
    customer = await CrmModel.addCustomer(customerParams);
  }

  const exist = await CrmModel.findCrmEprodAsByFilter(customer.ecid, row.sn, row.updated_at);
  if (!exist) {
    const damages = (row.damages && row.damages.length > 0) ? row.damages.map(item => item.name).join(CRM_SPLITTER) : "";
    const asParams = {
      ecid: customer.ecid,
      pvendor_pk: customer.pvendor_pk,
      pvendor_id: customer.pvendor_id,
      user_name: customer.user_name,
      gender: customer.gender,
      birth_year: customer.birth_year,
      job: customer.job,
      address: customer.address,
      phone_number: customer.phone_number,
      serial_no: row.sn,
      category_name: row.category_name,
      product_name: row.product_name,
      damages,
      created_at: row.updated_at,
    };
    await CrmModel.addCrmEprodAs(asParams);
  }
}

async function fetchCrmEprodAs(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "", dir: req.query.sortDir || "" };
  const keyword = req.query.keyword || "";
  const root_pk = req.query.root_pk;

  try {
    const filter = { offset, limit, sort, keyword, root_pk };
    const total = await CrmModel.findCrmEprodAs(filter, true);
    const rows = await CrmModel.findCrmEprodAs(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchCrmMarsCards(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "", dir: req.query.sortDir || "" };
  const keyword = req.query.keyword || "";
  const crm_level = req.query.crm_level || "";
  const crm_class = req.query.crm_class || "";

  try {
    const filter = { offset, limit, sort, keyword, crm_level, crm_class };
    const total = await CrmModel.findCrmMarsCards(filter, true);
    const rows = await CrmModel.findCrmMarsCards(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function syncCrmMarsCards(req, res) {
  try {
    const offset = +req.query.offset || 0;
    const limit = req.query.limit ? +req.query.limit : DEFAULT_PAGE_SIZE;
    const resp = await EshopApi.fetchCrmCards(offset, limit);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    if (!resp.data.rows || resp.data.rows.length === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("NO_MORE_ROWS") });
    }

    // sync and store mars card crm
    const rows = resp.data.rows.map(item => ({
      card_pk: item.card_pk,
      eshop_pk: item.user_pk,
      eshop_id: item.user_user_id,
      accum_card: item.card_no,
      wallet_card: item.card_no_vip,
      card_name: item.username,
      phone_number: item.phone_no,
      birthday: item.birthday,
      crm_level: item.level,
      vip_level1: item.level1,
      vip_level2: item.level2,
      vip_level3: item.level3,
      crm_class: item.class,
      all_months: item.all_months,
      buy_months: item.buy_months,
      max_cnt_product: item.max_cnt_product,
    }));
    const card_pks = rows.map(item => item.card_pk);
    const exists = await CrmModel.findCrmMarsCardsInPks(card_pks);
    const exist_pks = exists.map(item => item.card_pk);
    const new_rows = rows.filter(item => !exist_pks.includes(item.card_pk));
    if (new_rows.length > 0) {
      await CrmModel.addCrmMarsCards(new_rows);
    }
    const exist_rows = rows.filter(item => exist_pks.includes(item.card_pk));
    if (exist_rows.length > 0) {
      for (const row of exist_rows) {
        await CrmModel.editCrmMarsCard(row);
      }
    }

    // link to ecid
    const eshop_pks = rows.map(item => item.eshop_pk).filter(item => !!item);
    const mars_users = await CrmModel.findCrmMarsJoinsInEshopPks(eshop_pks);
    const ecid_users = mars_users.filter(item => !!item.ecid);
    if (ecid_users.length > 0) {
      for (const row of ecid_users) {
        const editRow = {
          card_pk: row.card_pk,
          ecid: row.ecid,
          pvendor_pk: row.pvendor_pk,
          pvendor_id: row.pvendor_id,
          prhn_name: row.prhn_name,
        }
        await CrmModel.editCrmMarsCard(editRow);
      }
    }
    const ecid_pks = ecid_users.map(item => item.card_pk);
    const new_users = rows.filter(item => !ecid_pks.includes(item.card_pk));
    if (new_users.length > 0) {
      for (const row of new_users) {
        const crmFilter = {
          user_name: row.card_name,
          birth_year: row.birthday,
          phone_number: row.phone_number,
        };
        let customer = await CrmModel.findCustomerByCrm(crmFilter);
        if (!customer) {
          const userParams = {
            user_name: row.card_name,
            birth_year: row.birthday,
            phone_number: row.phone_number,
            source: CUSTOMER_SOURCE.MARS,
            status: CUSTOMER_STATUS.ACTIVE,
          };
          customer = await CrmModel.addCustomer(userParams);
        }

        const editRow = {
          card_pk: row.card_pk,
          ecid: customer.ecid,
        }
        await CrmModel.editCrmMarsCard(editRow);
      }
    }

    const data = {
      total: resp.data.total,
      count: resp.data.rows.length,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchCrmEshopInfo(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "", dir: req.query.sortDir || "" };
  const keyword = req.query.keyword || "";
  const crm_level = req.query.crm_level || "";
  const crm_grade = req.query.crm_grade || "";

  try {
    const filter = { offset, limit, sort, keyword, crm_level, crm_grade };
    const total = await CrmModel.findCrmEshopInfo(filter, true);
    const rows = await CrmModel.findCrmEshopInfo(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function syncCrmEshopInfo(req, res) {
  try {
    const offset = +req.query.offset || 0;
    const limit = req.query.limit ? +req.query.limit : DEFAULT_PAGE_SIZE;
    const resp = await EshopApi.fetchCrmEshop(offset, limit);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    if (!resp.data.rows || resp.data.rows.length === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("NO_MORE_ROWS") });
    }

    // sync and store eshop info crm
    const rows = resp.data.rows.map(item => ({
      eshop_pk: item.user_pk,
      eshop_id: item.user_userid,
      eshop_name: item.user_name,
      eshop_gender: item.user_sex === getLangText("FEMALE") ? 'F' : 'M',
      phone_number: item.user_phone,
      eshop_job: item.user_job,
      eshop_cid: item.mobile_cid_number,
      crm_level: +item.crm_user_level,
      crm_grade: +item.crm_user_grade,
      crm_level_desc: item.crm_user_level_description,
      crm_grade_desc: item.crm_user_grade_description,
    }));
    const eshop_pks = rows.map(item => item.eshop_pk);
    const exists = await CrmModel.findCrmEshopInfoInPks(eshop_pks);
    const exist_pks = exists.map(item => item.eshop_pk);
    const new_rows = rows.filter(item => !exist_pks.includes(item.eshop_pk));
    if (new_rows.length > 0) {
      await CrmModel.addCrmEshopInfo(new_rows);
    }
    const exist_rows = rows.filter(item => exist_pks.includes(item.eshop_pk));
    if (exist_rows.length > 0) {
      for (const row of exist_rows) {
        await CrmModel.editCrmEshopInfo(row);
      }
    }

    // link to ecid
    const eshop_users = await CrmModel.findCrmEshopJoinsInEshopPks(eshop_pks);
    const ecid_users = eshop_users.filter(item => !!item.ecid);
    if (ecid_users.length > 0) {
      for (const row of ecid_users) {
        const editRow = {
          eshop_pk: row.eshop_pk,
          ecid: row.ecid,
          pvendor_pk: row.pvendor_pk,
          pvendor_id: row.pvendor_id,
          prhn_name: row.prhn_name,
        }
        await CrmModel.editCrmEshopInfo(editRow);
      }
    }
    const ecid_pks = ecid_users.map(item => item.eshop_pk);
    const new_users = rows.filter(item => !ecid_pks.includes(item.eshop_pk));
    if (new_users.length > 0) {
      for (const row of new_users) {
        const crmFilter = {
          user_name: row.eshop_name,
          phone_number: row.phone_number,
        };
        let customer = await CrmModel.findCustomerByCrm(crmFilter);
        if (!customer) {
          const userParams = {
            user_name: row.eshop_name,
            phone_number: row.phone_number,
            source: CUSTOMER_SOURCE.ESHOP,
            status: CUSTOMER_STATUS.ACTIVE,
          };
          customer = await CrmModel.addCustomer(userParams);
        }

        const editRow = {
          eshop_pk: row.eshop_pk,
          ecid: customer.ecid,
        }
        await CrmModel.editCrmEshopInfo(editRow);
      }
    }

    const data = {
      total: resp.data.total,
      count: resp.data.rows.length,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchCrmCustomers,
  addCustomerByPid,
  editCustomerByPid,
  editCustomerPhoneNumberbyPid,
  migrateUserToCustomer,
  fetchProductCategories,
  fetchProductRootCategories,
  fetchProductLeafCategories,
  fetchCrmProducts,
  addCrmProduct,
  editCrmProduct,
  deleteCrmProduct,
  fetchCrmProdSpecKeys,
  fetchCrmProdSpecKeyChoices,
  addCrmProdSpecKey,
  editCrmProdSpecKey,
  deleteCrmProdSpecKey,
  fetchCrmProdSpecValues,
  addCrmProdSpecValue,
  editCrmProdSpecValue,
  deleteCrmProdSpecValue,
  fetchCrmProdSpecOrders,
  addCrmProdSpecOrder,
  editCrmProdSpecOrder,
  deleteCrmProdSpecOrder,
  fetchCrmProdSurveyOptions,
  addCrmProdSurveyOption,
  editCrmProdSurveyOption,
  deleteCrmProdSurveyOption,
  fetchCrmEprodSales,
  importCrmEprodSales,
  syncCrmEprodAfterService,
  fetchCrmEprodAs,
  fetchCrmMarsCards,
  syncCrmMarsCards,
  fetchCrmEshopInfo,
  syncCrmEshopInfo,
};
