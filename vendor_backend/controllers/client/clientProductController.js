const moment = require('moment');
const { validationResult } = require('express-validator');
const ProductModel = require('../../models/productModel');
const PointModel = require('../../models/pointModel');
const CrmModel = require('../../models/crmModel');
const CustomerModel = require('../../models/customerModel');
const UserModel = require('../../models/userModel');
const { createResponse } = require('../../utils/response');
const { extractValidParams, formatTimeForMessage, validateImei } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { DEFAULT_PAGE_SIZE, FLAG_EXIST, FLAG_DELETED, REG_POINT_TYPES, REG_POINT_STATUS, PRODUCT_IMAGE_TYPE, SYNC_STATUS, EPROD_REGISTER_SOURCE, JOBS, CUSTOMER_SOURCE, CUSTOMER_STATUS, CRM_SPLITTER, PHONE_TYPE } = require('../../constants/constants');

async function fetchProductInfo(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const product_category_min_at = req.query.product_category_min_at || "";
    const product_category_max_at = req.query.product_category_max_at || "";
    let product_category_filter = { offset: 0, limit: 0, sort: {}, min_at: product_category_min_at, max_at: product_category_max_at, is_client: 1 };
    if (product_category_min_at === "" && product_category_max_at === "") {
      product_category_filter = { ...product_category_filter, is_deleted: FLAG_EXIST };
    }
    const product_category_rows = await ProductModel.findCategories(product_category_filter, false);

    const product_min_at = req.query.product_min_at || "";
    const product_max_at = req.query.product_max_at || "";
    let product_filter = { offset: 0, limit: 0, sort: {}, min_at: product_min_at, max_at: product_max_at, is_client: 1 };
    if (product_min_at === "" && product_max_at === "") {
      product_filter = { ...product_filter, is_deleted: FLAG_EXIST };
    }
    const product_rows = await ProductModel.findAllProducts(product_filter, false);

    const product_image_min_at = req.query.product_image_min_at || "";
    const product_image_max_at = req.query.product_image_max_at || "";
    let product_image_filter = { offset: 0, limit: 0, sort: {}, min_at: product_image_min_at, max_at: product_image_max_at, is_client: 1 };
    if (product_image_min_at === "" && product_image_max_at === "") {
      product_image_filter = { ...product_image_filter, is_deleted: FLAG_EXIST };
    }
    const product_image_rows = await ProductModel.findProductImages(product_image_filter, false);

    const spec_key_min_at = req.query.spec_key_min_at || "";
    const spec_key_max_at = req.query.spec_key_max_at || "";
    let spec_key_filter = { offset: 0, limit: 0, sort: {}, min_at: spec_key_min_at, max_at: spec_key_max_at, is_client: 1 };
    if (spec_key_min_at === "" && spec_key_max_at === "") {
      spec_key_filter = { ...spec_key_filter, is_deleted: FLAG_EXIST };
    }
    const spec_key_rows = await ProductModel.findSpecKeys(spec_key_filter, false);

    const spec_order_min_at = req.query.spec_order_min_at || "";
    const spec_order_max_at = req.query.spec_order_max_at || "";
    let spec_order_filter = { offset: 0, limit: 0, sort: {}, min_at: spec_order_min_at, max_at: spec_order_max_at, is_client: 1 };
    if (spec_order_min_at === "" && spec_order_max_at === "") {
      spec_order_filter = { ...spec_order_filter, is_deleted: FLAG_EXIST };
    }
    const spec_order_rows = await ProductModel.findSpecOrders(spec_order_filter, false);

    const spec_value_min_at = req.query.spec_value_min_at || "";
    const spec_value_max_at = req.query.spec_value_max_at || "";
    let spec_value_filter = { offset: 0, limit: 0, sort: {}, min_at: spec_value_min_at, max_at: spec_value_max_at, is_client: 1 };
    if (spec_value_min_at === "" && spec_value_max_at === "") {
      spec_value_filter = { ...spec_value_filter, is_deleted: FLAG_EXIST };
    }
    const spec_value_rows = await ProductModel.findSpecValues(spec_value_filter, false);

    const product_model_min_at = req.query.product_model_min_at || "";
    const product_model_max_at = req.query.product_model_max_at || "";
    let product_model_filter = { offset: 0, limit: 0, sort: {}, min_at: product_model_min_at, max_at: product_model_max_at, is_client: 1 };
    if (product_model_min_at === "" && product_model_max_at === "") {
      product_model_filter = { ...product_model_filter, is_deleted: FLAG_EXIST };
    }
    const product_model_rows = await ProductModel.findProductModels(product_model_filter, false);

    const phone_accessory_max_at = req.query.phone_accessory_max_at || "";
    let phone_accessory_filter = { offset: 0, limit: 0, sort: {}, max_at: phone_accessory_max_at, is_client: 1 };
    if (phone_accessory_max_at === "") {
      phone_accessory_filter = { ...phone_accessory_filter, is_deleted: FLAG_EXIST };
    }
    const phone_accessory_rows = await ProductModel.findPhoneAccessories(phone_accessory_filter, false);

    // const phone_changelog_max_at = req.query.phone_changelog_max_at || "";
    // let phone_changelog_filter = { offset: 0, limit: 0, sort: {}, max_at: phone_changelog_max_at, is_client: 1 };
    // if (phone_changelog_max_at === "") {
    //   phone_changelog_filter = { ...phone_changelog_filter, is_deleted: FLAG_EXIST };
    // }
    // const phone_changelog_rows = await ProductModel.findPhoneChangelogs(phone_changelog_filter, false);

    const data = {
      product_category_rows,
      product_rows,
      product_image_rows,
      spec_key_rows,
      spec_order_rows,
      spec_value_rows,
      product_model_rows,
      phone_accessory_rows,
      // phone_changelog_rows,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPhoneProducts(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const rows = await ProductModel.findProductPhonesForWeb();
    const data = {
      rows,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPhoneSpecs(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const product_pk = +req.query.product_pk;
  try {
    const product_row = await ProductModel.findProductByPk(product_pk);
    if (!product_row) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const imageFilter = {
      product_pk,
      image_type: PRODUCT_IMAGE_TYPE.MAIN,
      is_deleted: FLAG_EXIST,
      status: SYNC_STATUS.APPROVED,
    };
    const images = await ProductModel.findProductImagesByFilter(imageFilter);

    const specFilter = {
      offset: 0,
      limit: 0,
      product_pk,
      root_pk: product_row.root_pk,
    };
    const specs = await ProductModel.findSpecKeyAndValues(specFilter);

    const data = {
      images,
      specs,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPhoneImages(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const product_pk = +req.query.product_pk;
  try {
    const imageFilter = {
      product_pk,
      image_type: PRODUCT_IMAGE_TYPE.INTRO,
      is_deleted: FLAG_EXIST,
      status: SYNC_STATUS.APPROVED,
    };
    const rows = await ProductModel.findProductImagesByFilter(imageFilter);

    const data = {
      rows,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPhoneAccessories(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const offset = +req.query.offset || 0;
    const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
    const sort = { key: req.query.sortKey || "resource_price", dir: req.query.sortDir || "desc" };
    const keyword = req.query.keyword || "";
    const min_at = req.query.min_at || "";
    const max_at = req.query.max_at || "";
    const product_pk = req.query.product_pk;

    const filter = { offset, limit, sort, keyword, min_at, max_at, product_pk, is_client: 1 };

    const total = await ProductModel.findPhoneAccessories(filter, true);
    const rows = await ProductModel.findPhoneAccessories(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPhoneChangelogs(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const offset = +req.query.offset || 0;
    const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
    const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "desc" };
    const keyword = req.query.keyword || "";
    const min_at = req.query.min_at || "";
    const max_at = req.query.max_at || "";
    const product_pk = req.query.product_pk;

    const filter = { offset, limit, sort, keyword, min_at, max_at, product_pk, is_client: 1 };

    const total = await ProductModel.findPhoneChangelogs(filter, true);
    const rows = await ProductModel.findPhoneChangelogs(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchRegisterPhoneLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: req.query.sortKey || "updated_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const min_at = req.query.min_at || "";
  const max_at = req.query.max_at || "";

  try {
    let filter = { offset, limit, sort, user_pk: user.user_pk, keyword, min_at, max_at, is_client: 1 };
    const total = await ProductModel.findRegisterPhoneLog(filter, true);
    const rows = await ProductModel.findRegisterPhoneLog(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addRegisterPhoneLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["model_name", "phone_imei", "cid"];
  const params = extractValidParams(req.body, validKeys);
  try {
    if (!validateImei(params.phone_imei)) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("PHONE_ERR_INVALID_IMEI") });
    }

    const pointType = await PointModel.findRegisterPointTypeByModelName(params.model_name);
    if (!pointType) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("POINT_NOT_FOUND_TYPE") });
    }

    const existFilter = {
      user_pk: user.user_pk,
      phone_imei: params.phone_imei,
      is_deleted: FLAG_EXIST,
    };
    const exist = await ProductModel.findRegisterPhoneLogByFilter(existFilter);
    if (exist) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("PHONE_ERR_EXIST_LOG") });
    }

    const prefixes = await ProductModel.findPhoneImeiPrefixesByProductPk(pointType.product_pk);
    if (!prefixes) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("PHONE_ERR_UNREGISTERED_IMEI") });
    }
    const imeis = prefixes.map(item => item.prefix_str);
    let isMatch = false;
    for (const prefix_str of imeis) {
      if (params.phone_imei.startsWith(prefix_str)) {
        isMatch = true;
        break;
      }
    }
    if (!isMatch) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("PHONE_ERR_UNREGISTERED_IMEI") });
    }

    const logFilter = {
      phone_imei: params.phone_imei,
      is_deleted: FLAG_EXIST,
    }
    const deleteParams = {
      is_deleted: FLAG_DELETED,
    };
    const count = await ProductModel.editRegisterPhoneLog(deleteParams, logFilter);

    const logParams = {
      user_pk: user.user_pk,
      product_pk: pointType.product_pk,
      phone_imei: params.phone_imei,
      cid: params.cid,
      points: count === 0 ? pointType.points : 0,
    };
    const row = await ProductModel.addRegisterPhoneLog(logParams);
    if (!row) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    if (count === 0) {
      const productRow = await ProductModel.findProductByPk(pointType.product_pk);
      if (!productRow) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("PHONE_NO_INFO_BY_PK") });
      }

      const pointParams = {
        user_pk: user.user_pk,
        point_type: REG_POINT_TYPES.PHONE,
        status: REG_POINT_STATUS.PLUS,
        product_pk: pointType.product_pk,
        product_name: productRow.product_name,
        equ_num: params.phone_imei,
        points: pointType.points,
      };
      const pointRow = await PointModel.addRegisterPointLog(pointParams);
      if (!pointRow) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_ERR_APPLY_REGISTER_POINT") });
      }
    }

    const data = { row };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function checkRegisterPhoneLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["phone_imei"];
  const params = extractValidParams(req.body, validKeys);
  try {
    if (!validateImei(params.phone_imei)) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("PHONE_ERR_INVALID_IMEI") });
    }

    const exist = await ProductModel.findRegisterPhoneLogByImei(params.phone_imei);
    if (exist) {
      if (exist.user_pk === user.user_pk) {
        return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("PHONE_DUP_BY_SELF") });
      } else {
        return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("PHONE_DUP_BY_OTHER", [exist.user_id, formatTimeForMessage(exist.created_at)]) });
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchCrmProductInfo(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const spec_key_max_at = req.query.spec_key_max_at || "";
    let spec_key_filter = { offset: 0, limit: 0, sort: {}, max_at: spec_key_max_at };
    if (spec_key_max_at === "") {
      spec_key_filter = { ...spec_key_filter, is_deleted: FLAG_EXIST };
    }
    const spec_key_rows = await CrmModel.findSpecKeys(spec_key_filter, false);

    const spec_order_max_at = req.query.spec_order_max_at || "";
    let spec_order_filter = { offset: 0, limit: 0, sort: {}, max_at: spec_order_max_at, is_client: 1 };
    if (spec_order_max_at === "") {
      spec_order_filter = { ...spec_order_filter, is_deleted: FLAG_EXIST };
    }
    const spec_order_rows = await CrmModel.findSpecOrders(spec_order_filter, false);

    const spec_value_max_at = req.query.spec_value_max_at || "";
    let spec_value_filter = { offset: 0, limit: 0, sort: {}, max_at: spec_value_max_at, is_client: 1 };
    if (spec_value_max_at === "") {
      spec_value_filter = { ...spec_value_filter, is_deleted: FLAG_EXIST };
    }
    const spec_value_rows = await CrmModel.findSpecValues(spec_value_filter, false);

    const data = {
      spec_key_rows,
      spec_order_rows,
      spec_value_rows,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchCrmProdSpecsByEprodId(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const root_pk = req.query.root_pk || "";
    const order_rows = await CrmModel.findSpecOrdersForEprodByRootPk(root_pk);
    const spec_pks = order_rows.map(item => item.spec_pk);
    const valueFilter = {
      root_pk,
      is_deleted: FLAG_EXIST,
    };
    const spec_values = await CrmModel.findSpecValuesByFilter(valueFilter);
    const exist_values = spec_values.filter(item => spec_pks.includes(item.spec_pk));

    const data = {
      rows: order_rows.map(row => {
        const values = exist_values.filter(item => item.spec_pk === row.spec_pk);
        return {
          ...row,
          values,
        };
      }),
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function approveEprodRegister(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["net_type", "sn_num", "user_id", "phone_number", "address", "crm_info", "crm_prod_category_im_pk", "crm_category_name", "product_name", "reg_date", "led_type"];
  let params = extractValidParams(req.body, validKeys);
  params = { ...params, root_pk: params.crm_prod_category_im_pk, category_name: params.crm_category_name };
  const crm_info = JSON.parse(params.crm_info);
  try {
    if (![EPROD_REGISTER_SOURCE.FIXED, EPROD_REGISTER_SOURCE.MOBILE].includes(+params.net_type)) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")} (net_type)` });
    }

    let user = await UserModel.findUserById(params.user_id);
    if (!user && +params.net_type === EPROD_REGISTER_SOURCE.FIXED) {
      user = await CustomerModel.findCustomerLikePrhnById(params.user_id);
    }

    if (!user) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_NOT_FOUND_ONE", [params.user_id]) });
    }

    await addEprodCrmDataByUser(user, params, crm_info, CUSTOMER_SOURCE.EPROD);

    let phoneParams = {
      user_pk: user.user_pk,
      phone_number: params.phone_number,
    };
    const phoneRows = await UserModel.findUserPhonesByFilter(phoneParams);
    if (phoneRows.length === 0) {
      phoneParams = { ...phoneParams, phone_type: PHONE_TYPE.EPROD };
      const phoneRow = await UserModel.addPhoneNumber(phoneParams);
      if (!phoneRow) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("USER_ERR_ADD_PHONE_NUMBER") });
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addEprodCrmDataByUser(user, params, crm_info, user_source) {
  let customer;
  if (user.user_pk) { // pvendor_id user, including merged fixed user
    customer = await CrmModel.findCustomerByPvendorPk(user.user_pk);
  }
  if (!customer) { // check existence by customer info
    let crmFilter = {
      user_name: user.user_name,
      gender: user.gender,
      phone_number: params.phone_number,
    };
    if (user.birthday) {
      crmFilter = { ...crmFilter, birth_year: user.birthday.slice(0, 4) };
    }
    customer = await CrmModel.findCustomerByCrm(crmFilter);
  }
  if (customer) { // remove original spec data
    const deleteFilter = {
      ecid: customer.ecid,
      serial_no: params.sn_num,
    };
    await CrmModel.deleteCrmEprodChosenSpecs(deleteFilter);
    await CrmModel.deleteProdSurveyResponses(deleteFilter);
  } else { // add new customer
    const jobItem = user.job ? JOBS.find(item => item.id === user.job) : "";
    let customerParams = {
      user_name: user.user_name,
      gender: user.gender,
      birth_year: user.birthday || "",
      job: jobItem ? jobItem.name : (user.job || ""),
      address: params.address,
      phone_number: params.phone_number,
      source: user_source,
      status: CUSTOMER_STATUS.ACTIVE,
      pvendor_pk: user.user_pk || "",
      pvendor_id: user.user_id || "",
    };
    customer = await CrmModel.addCustomer(customerParams);
  }

  let salesParams = {
    ecid: customer.ecid,
    pvendor_pk: customer.pvendor_pk,
    pvendor_id: customer.pvendor_id,
    user_name: customer.user_name,
    gender: customer.gender,
    birth_year: customer.birth_year,
    job: customer.job,
    address: params.address,
    phone_number: params.phone_number,
    serial_no: params.sn_num,
    product_name: params.product_name,
    reg_date: params.reg_date || "",
    survey_up: params.survey_up || "",
    survey_down: params.survey_down || "",
    feedback_msg: params.feedback_msg || "",
  };

  const spec_values = await CrmModel.findSpecValuesByRootPk(params.root_pk);
  if (spec_values.length > 0) {
    const base_data = {
      ecid: customer.ecid,
      serial_no: params.sn_num,
    };
    for (const key of Object.keys(crm_info)) {
      const specItem = spec_values.find(item => item.spec_key === key);
      if (specItem) {
        const value = await addEprodChosenSpecsByKey(spec_values, key, "" + crm_info[key], base_data);
        salesParams = { ...salesParams, [key]: value };
      } else {
        salesParams = { ...salesParams, [key]: crm_info[key] };
      }
    }
  }

  const exist = await CrmModel.findCrmEprodSaleBySN(params.sn_num);
  if (exist) {
    if (exist.ecid !== customer.ecid) {
      const transferParams = {
        table_pk: exist.table_pk,
        ecid: exist.ecid,
        pvendor_pk: exist.pvendor_pk,
        user_name: exist.user_name,
        gender: exist.gender,
        birth_year: exist.birth_year,
        job: exist.job,
        address: exist.address,
        phone_number: exist.phone_number,
        serial_no: exist.serial_no,
        equip_no: exist.equip_no,
        root_pk: exist.root_pk,
        category_name: exist.category_name,
        product_name: exist.product_name,
        purchase_place: exist.purchase_place,
        purchase_date: exist.purchase_date,
        reg_date: exist.reg_date,
        serious_views: exist.serious_views,
        purchase_motives: exist.purchase_motives,
        old_prod_name: exist.old_prod_name,
        survey_up: exist.survey_up,
        survey_down: exist.survey_down,
        feedback_msg: exist.feedback_msg,
        outlook: exist.outlook,
        led_type: exist.led_type,
        has_tv_mount: exist.has_tv_mount,
        is_kara_user: exist.is_kara_user,
        use_bmedia: exist.use_bmedia,
        hour_usage: exist.hour_usage,
        computer_usage: exist.computer_usage,
        install_loc: exist.install_loc,
        target_id: customer.ecid,
        target_pk: customer.pvendor_pk,
        created_at: moment(exist.created_at).toDate(),
      };
      await CrmModel.addCrmEprodTransLog(transferParams);
    }

    salesParams = {
      ...salesParams,
      table_pk: exist.table_pk,
    }
    await CrmModel.editCrmEprodSale(salesParams);
  } else {
    salesParams = {
      ...salesParams,
      root_pk: params.root_pk,
      category_name: params.category_name,
    };
    await CrmModel.addCrmEprodSale(salesParams);
  }

  return salesParams;
}

async function addEprodChosenSpecsByKey(spec_values, spec_key, crm_values, base_data) {
  if (spec_values.length === 0) {
    return;
  }
  const specItem = spec_values.find(item => item.spec_key === spec_key);
  if (!specItem) {
    return;
  }

  const values = crm_values ? crm_values.split(",").filter(item => !!item).map(item => +item) : [];
  if (values.length === 0) {
    return;
  }

  const insert_rows = values.map((item, idx) => {
    const valueItem = spec_values.find(spec_row => spec_row.spec_pk === specItem.spec_pk && spec_row.value_pk === item);
    return ({
      ecid: base_data.ecid,
      serial_no: base_data.serial_no,
      value_pk: specItem.spec_pk,
      spec_value: valueItem ? valueItem.spec_value : "",
      position: idx,
    });
  });
  await CrmModel.addCrmEprodChosenSpecs(insert_rows);

  return values.map(item => {
    const valueItem = spec_values.find(spec_row => spec_row.spec_pk === specItem.spec_pk && spec_row.value_pk === item);
    return valueItem ? valueItem.spec_value : "";
  }).filter(item => !!item).join(", ");
}

async function deleteEprodRegister(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["net_type", "sn_num", "user_id"];
  const params = extractValidParams(req.body, validKeys);
  try {
    if (![EPROD_REGISTER_SOURCE.FIXED, EPROD_REGISTER_SOURCE.MOBILE].includes(+params.net_type)) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")} (net_type)` });
    }

    let user = await UserModel.findUserById(params.user_id);
    if (!user && +params.net_type === EPROD_REGISTER_SOURCE.FIXED) {
      user = await CustomerModel.findCustomerLikePrhnById(params.user_id);
    }

    if (!user) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_NOT_FOUND_ONE", [params.user_id]) });
    }

    let customer;
    if (user.user_pk) { // pvendor_id user, including merged fixed user
      customer = await CrmModel.findCustomerByPvendorPk(user.user_pk);
    }

    if (!customer) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("CRM_ECID_NOT_FOUND") });
    }

    const exist = await CrmModel.findCrmEprodSaleBySN(params.sn_num);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("CRM_SN_NOT_FOUND", [params.sn_num]) });
    }

    const transferParams = {
      table_pk: exist.table_pk,
      ecid: exist.ecid,
      pvendor_pk: exist.pvendor_pk,
      user_name: exist.user_name,
      gender: exist.gender,
      birth_year: exist.birth_year,
      job: exist.job,
      address: exist.address,
      phone_number: exist.phone_number,
      serial_no: exist.serial_no,
      equip_no: exist.equip_no,
      root_pk: exist.root_pk,
      category_name: exist.category_name,
      product_name: exist.product_name,
      purchase_place: exist.purchase_place,
      purchase_date: exist.purchase_date,
      reg_date: exist.reg_date,
      serious_views: exist.serious_views,
      purchase_motives: exist.purchase_motives,
      old_prod_name: exist.old_prod_name,
      survey_up: exist.survey_up,
      survey_down: exist.survey_down,
      feedback_msg: exist.feedback_msg,
      outlook: exist.outlook,
      led_type: exist.led_type,
      has_tv_mount: exist.has_tv_mount,
      is_kara_user: exist.is_kara_user,
      use_bmedia: exist.use_bmedia,
      hour_usage: exist.hour_usage,
      computer_usage: exist.computer_usage,
      install_loc: exist.install_loc,
      created_at: moment(exist.created_at).toDate(),
    };
    await CrmModel.addCrmEprodTransLog(transferParams);

    const deleteFilter = {
      ecid: customer.ecid,
      serial_no: params.sn_num,
    };
    await CrmModel.deleteCrmEprodChosenSpecs(deleteFilter);
    await CrmModel.deleteProdSurveyResponses(deleteFilter);
    await CrmModel.deleteCrmEprodSale({ table_pk: exist.table_pk });

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function saveEprodCrmData(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  let user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["sn_num", "product_name", "reg_date", "phone_number", "root_pk", "category_name", "crm_keys", "crm_values"];
  let params = extractValidParams(req.body, validKeys);
  try {
    const locInfo = await UserModel.findLocationFullNameByUserPk(user.user_pk);
    if (!locInfo) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("EPROD_ERR_NO_ADDRESS") });
    }
    params = { ...params, address: locInfo.full_name };

    const crm_keys = params.crm_keys.split(CRM_SPLITTER).map(item => item.trim()).filter(item => !!item);
    const crm_values = params.crm_values.split(CRM_SPLITTER).map(item => item.trim()).filter(item => !!item);
    let crm_pairs = {};
    for (let i = 0; i < crm_keys.length; i++) {
      crm_pairs = { ...crm_pairs, [crm_keys[i]]: crm_values.length > i ? crm_values[i] : "" };
    }

    user = await UserModel.findUserById(user.user_id);

    const result = await addEprodCrmDataByUser(user, params, crm_pairs, CUSTOMER_SOURCE.PID);

    const order_rows = await CrmModel.findSpecOrdersForEprodByRootPk(params.root_pk);
    const spec_keys = order_rows.map(item => item.spec_key);
    const crm_spec_pks = order_rows.map(item => item.spec_pk).join(CRM_SPLITTER);
    const ret_crm_values = result ? spec_keys.map(item => result[item]).join(CRM_SPLITTER) : "";

    const data = {
      ecid: result.ecid,
      phone_number: result.phone_number,
      crm_spec_pks,
      crm_values: ret_crm_values,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchCrmEprodSales(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const limit = req.query.limit ? +req.query.limit : DEFAULT_PAGE_SIZE;
  const updated_at = req.query.updated_at || "";
  try {
    const filter = { offset: 0, limit, max_at: updated_at, is_eprod: 1 };

    const total = await CrmModel.findCrmEprodSales(filter, true);
    const rows = await CrmModel.findCrmEprodSales(filter, false);

    const del_filter = { offset: 0, limit: 0, max_at: updated_at, is_eprod: 1 };
    const del_rows = await CrmModel.findCrmEprodTransLog(del_filter, false);
    const del_pks = del_rows.length > 0 ? del_rows.map(item => item.table_pk).filter(item => !!item).join(",") : "";

    const data = {
      total,
      rows,
      del_pks,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addEprodCrmSale(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["user_id", "sn_num", "user_name", "gender", "birthday", "phone_number", "job", "address", "crm_info", "crm_prod_category_im_pk", "crm_category_name", "product_name", "survey_up", "survey_down", "feedback_msg"];
  let params = extractValidParams(req.body, validKeys);
  params = { ...params, root_pk: params.crm_prod_category_im_pk, category_name: params.crm_category_name };
  const crm_info = JSON.parse(params.crm_info);
  try {
    let user_info = extractValidParams(params, ["user_name", "gender", "birthday", "phone_number", "job"]);
    const user = await UserModel.findUserById(params.user_id);
    if (user) {
      user_info = { ...user_info, ...user };
    }
    const result = await addEprodCrmDataByUser(user_info, params, crm_info, CUSTOMER_SOURCE.EPROD);

    const data = {
      ecid: result.ecid,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchProductInfo,
  fetchPhoneProducts,
  fetchPhoneSpecs,
  fetchPhoneImages,
  fetchPhoneAccessories,
  fetchPhoneChangelogs,
  fetchRegisterPhoneLog,
  addRegisterPhoneLog,
  checkRegisterPhoneLog,
  fetchCrmProductInfo,
  fetchCrmProdSpecsByEprodId,
  approveEprodRegister,
  deleteEprodRegister,
  saveEprodCrmData,
  fetchCrmEprodSales,
  addEprodCrmSale,
};
