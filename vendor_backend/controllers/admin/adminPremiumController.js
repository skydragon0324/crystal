const moment = require('moment');
const { validationResult } = require('express-validator');
const fs = require('fs');
const FormData = require('form-data');
const PremiumModel = require('../../models/premiumModel');
const UserModel = require('../../models/userModel');
const PointModel = require('../../models/pointModel');
const ProductModel = require('../../models/productModel');
const SyncApi = require('../../api/syncApi');
const EshopApi = require('../../api/eshopApi');
const WebApi = require('../../api/webApi');
const { createResponse } = require('../../utils/response');
const { extractValidParams, genRemainLotteryNumbers } = require('../../utils/utils');
const { generateRandomNonDupLotteryNumber, updateIntegratedUserValue } = require('../common/commonPremiumController');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { DEFAULT_PAGE_SIZE, SYNC_STATUS, FLAG_TESTER, FLAG_EXIST } = require('../../constants/constants');

async function fetchPremiumServices(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "lottery_start_date", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, sort, keyword, include_test: FLAG_TESTER };
    const total = await PremiumModel.findPremiumServices(filter, true);
    const rows = await PremiumModel.findPremiumServices(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPremiumSimpleServices(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const types = req.query.types || "";

  try {
    const service_types = types ? types.split(",").filter(item => !!item).map(item => item.trim()) : [];
    const filter = { service_types };
    const rows = await PremiumModel.findPremiumSimpleServices(offset, limit, filter);
    const data = { rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addPremiumService(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["service_name", "service_description", "publish_num", "lottery_start_date", "lottery_end_date", "follow_start_date", "follow_end_date", "service_disp_date", "service_type", "image_url", "image_ratio", "service_note", "goods_description", "is_test"];
  let params = extractValidParams(req.body, validKeys);
  params = { ...params, lottery_start_date: moment(params.lottery_start_date).toDate(), lottery_end_date: moment(params.lottery_end_date).toDate(), follow_start_date: moment(params.follow_start_date).toDate(), follow_end_date: moment(params.follow_end_date).toDate(), service_disp_date: moment(params.service_disp_date).toDate() };

  try {
    let formData = new FormData();
    if (req.file) {
      params.image_url = req.file.path;
      const content = fs.readFileSync(req.file.path);
      formData.append("image_file", content, req.file.originalname);
    }

    if (params.image_url) {
      formData.append("new_image_url", params.image_url || "");
    }

    if (req.file) {
      const syncResp = await SyncApi.syncFile(formData);
      if (syncResp.code === RESP_CODES.SUCCESS.code) {
        params = { ...params, image_status: SYNC_STATUS.APPROVED };
      } else {
        params = { ...params, image_status: SYNC_STATUS.PENDING };
      }
    }

    const row = await PremiumModel.addPremiumService(params);
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

async function editPremiumService(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["service_pk", "service_name", "service_description", "publish_num", "lottery_start_date", "lottery_end_date", "follow_start_date", "follow_end_date", "service_disp_date", "service_type", "image_url", "image_ratio", "service_note", "goods_description", "is_test"];
  let params = extractValidParams(req.body, validKeys);
  params = { ...params, lottery_start_date: moment(params.lottery_start_date).toDate(), lottery_end_date: moment(params.lottery_end_date).toDate(), follow_start_date: moment(params.follow_start_date).toDate(), follow_end_date: moment(params.follow_end_date).toDate(), service_disp_date: moment(params.service_disp_date).toDate() };
  try {
    const exist = await PremiumModel.findPremiumServiceByPk(params.service_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    let formData = new FormData();
    if (req.file) {
      params.image_url = req.file.path;
      const content = fs.readFileSync(req.file.path);
      formData.append("image_file", content, req.file.originalname);
    } else if (!params.image_url && exist.image_url) { // remove file
      unlink(exist.image_url);
    }

    formData.append("org_image_url", exist.image_url || "");
    if (params.image_url) {
      formData.append("new_image_url", params.image_url || "");
    }
    // const syncResp = await SyncApi.syncFile(formData);
    // if (syncResp.code === RESP_CODES.SUCCESS.code) {
    //   params = { ...params, image_status: SYNC_STATUS.APPROVED };
    // } else {
    //   params = { ...params, image_status: SYNC_STATUS.PENDING };
    // }

    const count = await PremiumModel.editPremiumService(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deletePremiumService(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { service_pk, is_deleted } = req.body;
  try {
    const exist = await PremiumModel.findPremiumServiceByPk(service_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { service_pk, is_deleted };
    const count = await PremiumModel.editPremiumService(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function syncPremiumService(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["service_pk"];
  let params = extractValidParams(req.body, validKeys);
  try {
    const exist = await PremiumModel.findPremiumServiceByPk(params.service_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    let formData = new FormData();
    const content = fs.readFileSync(exist.image_url);
    const fileName = exist.image_url.split("/").pop();
    formData.append("image_file", content, fileName);
    formData.append("new_image_url", exist.image_url);
    const syncResp = await SyncApi.syncFile(formData);
    if (syncResp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("SYNC_FILE_ERROR") });
    }

    params = { ...params, status: SYNC_STATUS.APPROVED };
    const count = await PremiumModel.editPremiumService(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPremiumGoods(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "price", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const service_pk = req.query.service_pk || "";
  const class_pk = req.query.class_pk || "";

  try {
    const filter = { offset, limit, sort, keyword, service_pk, class_pk };
    const total = await PremiumModel.findPremiumGoods(filter, true);
    let rows = await PremiumModel.findPremiumGoods(filter, false);
    rows = rows.map(row => ({
      ...row,
      price: +row.price.toFixed(2),
      points: +row.points.toFixed(2),
    }));
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPremiumSimpleGoods(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const service_pk = req.query.service_pk || "";
  const class_pk = req.query.class_pk || "";
  const goods_type = req.query.goods_type || "";

  const filter = { service_pk, class_pk, goods_type };
  try {
    const rows = await PremiumModel.findPremiumSimpleGoods(offset, limit, filter);
    const data = { rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addPremiumGood(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["service_pk", "goods_name", "goods_type", "price", "points", "related_pk", "class_pk", "real_count", "fake_count", "goods_note"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const svcExist = await PremiumModel.findPremiumServiceByPk(params.service_pk);
    if (!svcExist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    const row = await PremiumModel.addPremiumGood(params);
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

async function editPremiumGood(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["goods_pk", "service_pk", "goods_name", "goods_type", "price", "points", "related_pk", "class_pk", "real_count", "fake_count", "goods_note"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const goodExist = await PremiumModel.findPremiumGoodByPk(params.goods_pk);
    if (!goodExist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    const svcExist = await PremiumModel.findPremiumServiceByPk(params.service_pk);
    if (!svcExist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    const count = await PremiumModel.editPremiumGood(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deletePremiumGood(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { goods_pk, is_deleted } = req.body;
  try {
    const exist = await PremiumModel.findPremiumGoodByPk(goods_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { goods_pk, is_deleted };
    const count = await PremiumModel.editPremiumGood(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPremiumUserClasses(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "updated_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const service_pk = req.query.service_pk || "";

  try {
    const filter = { offset, limit, sort, keyword, service_pk };
    const total = await PremiumModel.findPremiumUserClasses(filter, true);
    const rows = await PremiumModel.findPremiumUserClasses(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPremiumSimpleClasses(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const service_pk = req.query.service_pk || "";

  try {
    const rows = await PremiumModel.findPremiumSimpleClasses(service_pk);
    const data = { rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addPremiumUserClass(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["service_pk", "class_name", "start_value", "end_value", "lottery_min_num", "lottery_max_num"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const svcExist = await PremiumModel.findPremiumServiceByPk(params.service_pk);
    if (!svcExist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    const clsFilter = {
      service_pk: params.service_pk,
      class_name: params.class_name,
    };
    const clsExist = await PremiumModel.findPremiumUserClassByFilter(clsFilter);
    if (clsExist) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    const row = await PremiumModel.addPremiumUserClass(params);
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

async function editPremiumUserClass(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["class_pk", "service_pk", "class_name", "start_value", "end_value", "lottery_min_num", "lottery_max_num"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const clsExist = await PremiumModel.findPremiumUserClassByPk(params.class_pk);
    if (!clsExist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    const svcExist = await PremiumModel.findPremiumServiceByPk(params.service_pk);
    if (!svcExist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    const count = await PremiumModel.editPremiumUserClass(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deletePremiumUserClass(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { class_pk, is_deleted } = req.body;
  try {
    const exist = await PremiumModel.findPremiumUserClassByPk(class_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { class_pk, is_deleted };
    const count = await PremiumModel.editPremiumUserClass(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPremiumUserValues(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "user_value", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const service_pk = req.query.service_pk || "";
  const class_name = req.query.class_name || "";

  try {
    const filter = { offset, limit, sort, keyword, service_pk, class_name };
    const total = await PremiumModel.findPremiumUserValues(filter, true);
    const rows = await PremiumModel.findPremiumUserValues(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchUserDeliveryAddresses(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "updated_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const service_pk = req.query.service_pk || "";
  let parent_location_code = req.query.parent_location_code || "";
  if (parent_location_code.length === 1) {
    parent_location_code = "0" + parent_location_code;
  }

  try {
    const filter = { offset, limit, sort, keyword, service_pk, parent_location_code };
    const total = await PremiumModel.findUserDeliveryAddresses(filter, true);
    const rows = await PremiumModel.findUserDeliveryAddresses(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addUserDeliveryAddress(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["service_pk", "user_id", "receptionist", "phone_numbers", "location_pk", "location_more", "location_environs", "id_card"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const user = await UserModel.findUserById(params.user_id);
    if (!user) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    const addrFilter = {
      user_pk: user.user_pk,
      service_pk: params.service_pk,
    };
    const exist = await PremiumModel.findUserDeliveryAddressByFilter(addrFilter);
    if (exist) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("PREMIUM_DELIVERY_ADDRESS_EXIST") });
    }

    const addrParams = {
      user_pk: user.user_pk,
      service_pk: params.service_pk,
      receptionist: params.receptionist,
      phone_numbers: params.phone_numbers,
      location_pk: params.location_pk,
      location_more: params.location_more,
      location_environs: params.location_environs,
      id_card: params.id_card,
    };
    const row = await PremiumModel.addUserDeliveryAddress(addrParams);
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

async function editUserDeliveryAddress(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["delivery_pk", "receptionist", "phone_numbers", "location_pk", "location_more", "location_environs", "id_card"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await PremiumModel.findUserDeliveryAddressByPk(params.delivery_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    const count = await PremiumModel.editUserDeliveryAddress(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteUserDeliveryAddress(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { delivery_pk, is_deleted } = req.body;
  try {
    const exist = await PremiumModel.findUserDeliveryAddressByPk(delivery_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { delivery_pk, is_deleted };
    const count = await PremiumModel.editUserDeliveryAddress(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchLotteryNumbers(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "updated_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const service_pk = req.query.service_pk || "";
  const class_name = req.query.class_name || "";
  const goods_type = req.query.goods_type || "";

  try {
    const filter = { offset, limit, sort, keyword, service_pk, class_name, goods_type };
    const total = await PremiumModel.findLotteryNumbers(filter, true);
    const rows = await PremiumModel.findLotteryNumbers(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addLotteryNumber(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["service_pk", "user_id", "lottery_number"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const svcExist = await PremiumModel.findPremiumServiceByPk(params.service_pk);
    if (!svcExist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    const user = await UserModel.findUserById(params.user_id);
    if (!user) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    const filter1 = {
      service_pk: params.service_pk,
      user_pk: user.user_pk,
    };
    const numExist1 = await PremiumModel.findLotteryNumberByFilter(filter1);
    if (numExist1) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("PREMIUM_LOTTERY_EXIST_USER") });
    }

    const filter2 = {
      service_pk: params.service_pk,
      lottery_number: params.lottery_number,
    };
    const numExist2 = await PremiumModel.findLotteryNumberByFilter(filter2);
    if (numExist2) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("PREMIUM_LOTTERY_EXIST_NUMBER") });
    }

    const addParams = {
      user_pk: user.user_pk,
      service_pk: params.service_pk,
      lottery_number: params.lottery_number,
    };

    const row = await PremiumModel.addLotteryNumber(addParams);
    if (!row) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    await PremiumModel.deleteRemainLotteryNumber(params.service_pk, params.lottery_number);

    const data = { row };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function editLotteryNumber(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["lottery_pk", "lottery_number"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const lotteryExist = await PremiumModel.findLotteryNumberByPk(params.lottery_pk);
    if (!lotteryExist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    const filter = {
      service_pk: lotteryExist.service_pk,
      lottery_number: params.lottery_number,
    };
    const numExist = await PremiumModel.findLotteryNumberByFilter(filter);
    if (numExist && numExist.user_pk !== lotteryExist.user_pk) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("PREMIUM_LOTTERY_EXIST_NUMBER") });
    }

    let editParams = {
      lottery_pk: params.lottery_pk,
      lottery_number: params.lottery_number,
    };

    const count = await PremiumModel.editLotteryNumber(editParams);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    // sync remain numbers
    await PremiumModel.deleteRemainLotteryNumber(lotteryExist.service_pk, params.lottery_number);
    await PremiumModel.addRemainLotteryNumber({
      service_pk: lotteryExist.service_pk,
      lottery_number: lotteryExist.lottery_number,
    });

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteLotteryNumber(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { lottery_pk, is_deleted } = req.body;
  try {
    const exist = await PremiumModel.findLotteryNumberByPk(lottery_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { lottery_pk, is_deleted };
    const count = await PremiumModel.editLotteryNumber(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function refreshLotteryNumber(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["service_pk", "user_id"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const user = await UserModel.findUserById(params.user_id);
    if (!user) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    let numInfo = await PremiumModel.findPremiumLotteryPeriodByFilter(params.service_pk, user.user_pk);
    if (!numInfo) {
      numInfo = await PremiumModel.findPremiumLastUserClassByServicePk(params.service_pk);
    }

    const ret = await generateRandomNonDupLotteryNumber(+params.service_pk, numInfo.lottery_min_num, numInfo.lottery_max_num);
    if (ret.code !== RESP_CODES.SUCCESS.code) {
      return res.status(ret.code).json(ret);
    }

    const data = {
      lottery_number: ret.data.lottery_number,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchLotterySelectedNumbers(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const service_pk = +req.query.service_pk || 0;
  let min_num = +req.query.min_num || 0;
  let max_num = +req.query.max_num || 0;
  if (min_num > max_num || max_num - min_num > 200) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("PREMIUM_LOTTERY_INVALID_MIN_MAX") });
  }

  try {
    const filter = { service_pk, min_num, max_num };
    const total = await PremiumModel.findSelectedLotteryNumbers(filter, true);
    const rows = await PremiumModel.findSelectedLotteryNumbers(filter, false);
    const data = { total, rows: rows.map(row => row.lottery_number) };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchLotteryRemainNumbers(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const service_pk = +req.query.service_pk || 0;
  const user_id = req.query.user_id || "";

  try {
    const user = await UserModel.findUserById(user_id);
    if (!user) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    let numInfo = await PremiumModel.findPremiumLotteryPeriodByFilter(service_pk, user.user_pk);
    if (!numInfo) {
      numInfo = await PremiumModel.findPremiumLastUserClassByServicePk(service_pk);
    }

    const min_num = numInfo.lottery_min_num;
    const max_num = numInfo.lottery_max_num;
    const filter = { service_pk, min_num, max_num };
    const total = await PremiumModel.findRemainLotteryNumbers(offset, limit, filter, true);
    const rows = await PremiumModel.findRemainLotteryNumbers(offset, limit, filter, false);
    const data = {
      total,
      rows: rows.map(row => row.lottery_number),
      min_num,
      max_num,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchLotteryCandidates(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "updated_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const service_pk = req.query.service_pk || "";
  const class_pk = req.query.class_pk || "";

  try {
    const filter = { offset, limit, sort, keyword, service_pk, class_pk };
    const total = await PremiumModel.findLotteryCandidates(filter, true);
    const rows = await PremiumModel.findLotteryCandidates(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addLotteryCandidate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["service_pk", "class_pk", "lottery_count"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const users = req.body.users;
    const user_ids = users.split(",").map(item => item.trim()).filter(item => !!item);
    const valid_users = await UserModel.findValidUsersByIds(user_ids);
    if (!valid_users || valid_users.length === 0) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_NOT_FOUND_ALL") });
    }

    const valid_ids = valid_users.map(item => item.user_id);
    const diff_ids = user_ids.filter(item => !valid_ids.includes(item));
    if (user_ids.length !== valid_ids.length || diff_ids.length > 0) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: `${getLangText("USER_NOT_FOUND_SOME")} (${diff_ids.join(", ")})` });
    }

    const valid_pks = valid_users.map(item => item.user_pk);

    const filter = {
      service_pk: params.service_pk,
      class_pk: params.class_pk,
    };
    const dup_users = await PremiumModel.findLotteryCandidatesInUserPks(filter, valid_pks);
    if (dup_users.length > 0) {
      const dup_ids = dup_users.map(item => item.user_id);
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: `${getLangText("PREMIUM_LOTTERY_CANDIDATE_EXIST_SOME")} (${dup_ids.join(", ")})` });
    }

    const row = await PremiumModel.addLotteryCandidates(params, valid_pks);
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

async function editLotteryCandidate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["table_pk", "service_pk", "class_pk", "lottery_count"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await PremiumModel.findLotteryCandidateByPk(params.table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await PremiumModel.editLotteryCandidate(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteLotteryCandidate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { table_pk, is_deleted } = req.body;
  try {
    const exist = await PremiumModel.findLotteryCandidateByPk(table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { table_pk, is_deleted };
    const count = await PremiumModel.editLotteryCandidate(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchLotterySubmits(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "updated_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const service_pk = req.query.service_pk || "";
  const class_pk = req.query.class_pk || "";
  const goods_type = req.query.goods_type || "";

  try {
    const filter = { offset, limit, sort, keyword, service_pk, class_pk, goods_type };
    const total = await PremiumModel.findLotterySubmits(filter, true);
    const rows = await PremiumModel.findLotterySubmits(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchLotterySelectedSubmits(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const service_pk = +req.query.service_pk || 0;
  let min_num = +req.query.min_num || 0;
  let max_num = +req.query.max_num || 0;
  if (min_num > max_num || max_num - min_num > 200) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("PREMIUM_LOTTERY_INVALID_MIN_MAX") });
  }

  try {
    const filter = { service_pk, min_num, max_num };
    const total = await PremiumModel.findSelectedLotterySubmits(filter, true);
    const rows = await PremiumModel.findSelectedLotterySubmits(filter, false);
    const data = { total, rows: rows.map(row => row.lottery_number) };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchLotteryRemainSubmits(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const service_pk = +req.query.service_pk || 0;
  const class_pk = +req.query.class_pk || 0;
  const user_id = req.query.user_id || "";

  try {
    const user = await UserModel.findUserById(user_id);
    if (!user) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    const class_row = await PremiumModel.findPremiumUserClassByPk(class_pk);
    if (!class_row) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("PREMIUM_LOTTERY_INVALID_CLASS") });
    }

    const min_num = class_row.lottery_min_num;
    const max_num = class_row.lottery_max_num;
    const submits = await PremiumModel.findLotterySubmitNumbers(service_pk, min_num, max_num);
    const total = max_num - min_num + 1 - submits.length;
    const remains = genRemainLotteryNumbers(min_num, max_num, submits);
    const rows = remains.slice(offset, offset + limit);

    const data = {
      total,
      rows,
      min_num,
      max_num,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function randomLotterySubmit(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["service_pk", "class_pk", "user_id"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const user = await UserModel.findUserById(params.user_id);
    if (!user) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    const class_row = await PremiumModel.findPremiumUserClassByPk(params.class_pk);
    if (!class_row) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("PREMIUM_LOTTERY_INVALID_CLASS") });
    }

    const min_num = class_row.lottery_min_num;
    const max_num = class_row.lottery_max_num;
    const submits = await PremiumModel.findLotterySubmitNumbers(params.service_pk, min_num, max_num);
    const remains = genRemainLotteryNumbers(min_num, max_num, submits);
    const rnd = Math.floor(Math.random() * max_num);
    const lottery_number = remains[rnd % remains.length];

    const data = {
      lottery_number,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addLotterySubmit(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["service_pk", "class_pk", "user_id", "lottery_number"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const user = await UserModel.findUserById(params.user_id);
    if (!user) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    const candFilter = {
      service_pk: params.service_pk,
      class_pk: params.class_pk,
      user_pk: user.user_pk,
    }
    const candidate = await PremiumModel.findLotteryCandidateByFilter(candFilter);
    if (!candidate || candidate.is_deleted !== FLAG_EXIST || candidate.lottery_count <= 0) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("PREMIUM_LOTTERY_NO_PERM_SUBMIT") });
    }

    const filter1 = {
      service_pk: params.service_pk,
      class_pk: params.class_pk,
      user_pk: user.user_pk,
    };
    const numExist1 = await PremiumModel.findLotterySubmitsByFilter(filter1);
    if (numExist1.length >= candidate.lottery_count) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("PREMIUM_LOTTERY_EXCEED_COUNT") });
    }

    const filter2 = {
      service_pk: params.service_pk,
      lottery_number: params.lottery_number,
    };
    const numExist2 = await PremiumModel.findLotterySubmitByFilter(filter2);
    if (numExist2) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("PREMIUM_LOTTERY_EXIST_NUMBER") });
    }

    const addParams = {
      user_pk: user.user_pk,
      service_pk: params.service_pk,
      class_pk: params.class_pk,
      lottery_number: params.lottery_number,
    };

    const row = await PremiumModel.addLotterySubmit(addParams);
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

async function editLotterySubmit(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["lottery_pk", "lottery_number"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const lotteryExist = await PremiumModel.findLotterySubmitByPk(params.lottery_pk);
    if (!lotteryExist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    const filter = {
      service_pk: lotteryExist.service_pk,
      lottery_number: params.lottery_number,
    };
    const numExist = await PremiumModel.findLotterySubmitByFilter(filter);
    if (numExist && numExist.user_pk !== lotteryExist.user_pk) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("PREMIUM_LOTTERY_EXIST_NUMBER") });
    }

    let editParams = {
      lottery_pk: params.lottery_pk,
      lottery_number: params.lottery_number,
    };

    const count = await PremiumModel.editLotterySubmit(editParams);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteLotterySubmit(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { lottery_pk, is_deleted } = req.body;
  try {
    const exist = await PremiumModel.findLotterySubmitByPk(lottery_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { lottery_pk, is_deleted };
    const count = await PremiumModel.editLotterySubmit(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function editLotterySubmitAward(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["service_pk", "goods_pk"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const lottery_numbers = req.body.lottery_numbers.split(",").map(item => +(item.trim())).filter(item => !!item);
    const valid_submits = await PremiumModel.findLotterySubmitsInNumbers(params.service_pk, lottery_numbers);
    if (!valid_submits || valid_submits.length === 0) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("PREMIUM_LOTTERY_NOT_FOUND_ALL") });
    }

    const valid_numbers = valid_submits.map(item => item.lottery_number);
    const diff_numbers = lottery_numbers.filter(item => !valid_numbers.includes(item));
    if (lottery_numbers.length !== valid_numbers.length || diff_numbers.length > 0) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: `${getLangText("PREMIUM_LOTTERY_NOT_FOUND_SOME")} (${diff_numbers.join(", ")})` });
    }

    const count = await PremiumModel.editLotterySubmitGoods(params, valid_numbers);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function finishLotterySubmitAward(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["service_pk", "award_at"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const lottery_numbers = req.body.lottery_numbers.split(",").map(item => +(item.trim())).filter(item => !!item);
    const valid_submits = await PremiumModel.findLotterySubmitsInNumbers(params.service_pk, lottery_numbers);
    if (!valid_submits || valid_submits.length === 0) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("PREMIUM_LOTTERY_NOT_FOUND_ALL") });
    }

    const valid_numbers = valid_submits.map(item => item.lottery_number);
    const diff_numbers = lottery_numbers.filter(item => !valid_numbers.includes(item));
    if (lottery_numbers.length !== valid_numbers.length || diff_numbers.length > 0) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: `${getLangText("PREMIUM_LOTTERY_NOT_FOUND_SOME")} (${diff_numbers.join(", ")})` });
    }

    const awardParams = {
      service_pk: params.service_pk,
      award_at: params.award_at ? moment(params.award_at).toDate() : "",
    }
    const count = await PremiumModel.editLotterySubmitFinish(awardParams, valid_numbers);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchIntegratedUserClasses(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "updated_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, sort, keyword };
    const total = await PremiumModel.findIntegratedUserClasses(filter, true);
    const rows = await PremiumModel.findIntegratedUserClasses(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchIntegratedSimpleClasses(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const rows = await PremiumModel.findIntegratedSimpleClasses();
    const data = { rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addIntegratedUserClass(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["class_name", "class_level", "start_value", "end_value"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const clsFilter = {
      class_name: params.class_name,
    };
    const clsExist = await PremiumModel.findIntegratedUserClassByFilter(clsFilter);
    if (clsExist) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const row = await PremiumModel.addIntegratedUserClass(params);
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

async function editIntegratedUserClass(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["class_pk", "class_name", "class_level", "start_value", "end_value"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const clsExist = await PremiumModel.findIntegratedUserClassByPk(params.class_pk);
    if (!clsExist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    const count = await PremiumModel.editIntegratedUserClass(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteIntegratedUserClass(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { class_pk, is_deleted } = req.body;
  try {
    const exist = await PremiumModel.findIntegratedUserClassByPk(class_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { class_pk, is_deleted };
    const count = await PremiumModel.editIntegratedUserClass(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchIntegratedUserValues(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "user_value", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const class_name = req.query.class_name || "";

  try {
    const filter = { offset, limit, sort, keyword, class_name };
    const total = await PremiumModel.findIntegratedUserValues(filter, true);
    const rows = await PremiumModel.findIntegratedUserValues(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function refreshIntegratedUserValue(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { table_pk } = req.body;
  try {
    const exist = await PremiumModel.findIntegratedUserValueByPk(table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const userInfo = await UserModel.findUserByPk(exist.user_pk);
    if (!userInfo) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    const merged = await UserModel.findMergeIdByFilter({ pvendor_pk: exist.user_pk });

    let eshop;
    let eprod = {};

    let funcs = [WebApi.fetchEprodRegistBalance(userInfo.user_id)];
    if (merged && merged.eshop_pk) {
      funcs = [...funcs, EshopApi.fetchCardInfo(merged.eshop_pk)];
    }
    const resp = await Promise.all(funcs);
    if (resp[0].code === RESP_CODES.SUCCESS.code) {
      eprod = {
        sum_total: +resp[0].data.sum_total,
      };
    }
    if (merged && merged.eshop_pk && resp[1].code === RESP_CODES.SUCCESS.code) {
      eshop = resp[1].data;
    }

    /** soft points */
    const appstoreRow = await PointModel.findAppstorePointStatsByUserPk(exist.user_pk);
    const appstorePoints = appstoreRow ? appstoreRow.total_points : 0;
    const karaokeRow = await PointModel.findKaraokePointStatsByUserPk(exist.user_pk);
    const karaokePoints = karaokeRow ? karaokeRow.total_points : 0;
    const bmediaRow = await PointModel.findBMediaPointStatsByUserPk(exist.user_pk);
    const bmediaPoints = bmediaRow ? bmediaRow.total_points : 0;

    /** register points */
    const phoneRow = await ProductModel.calcRegisterPhoneLogByUserPk(exist.user_pk);
    const phonePoints = phoneRow ? phoneRow.sum_points || 0 : 0;

    /** activity points */
    const activityStats = await PointModel.findActivityPointStatsByUserPk(exist.user_pk);

    const intRow = await PremiumModel.findIntegratedUserValueByUserPk(exist.user_pk);
    const data = {
      commerce_value: eshop ? eshop.commerce_value : (intRow ? intRow.commerce_value : 0),
      exp_value: eshop ? eshop.accum_value : (intRow ? intRow.exp_value : 0),
      soft_points: appstorePoints + karaokePoints + bmediaPoints,
      phone_reg_points: phonePoints,
      eprod_reg_points: eprod.sum_total ? eprod.sum_total : (intRow ? intRow.eprod_reg_points : 0),
      activity_points: activityStats ? (+activityStats.total_points - activityStats.minus_points) : 0,
    };

    await updateIntegratedUserValue(exist.user_pk, data, !intRow);

    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function recalcIntegratedUserValues(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const count = await PremiumModel.recalcIntegratedUserValues();
    const data = { count };

    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function recalcIntegratedUserClasses(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const count = await PremiumModel.recalcIntegratedUserClasses();
    const data = { count };

    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPremiumDiscussAwards(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "updated_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const service_pk = req.query.service_pk || "";
  const class_pk = req.query.class_pk || "";
  const goods_type = req.query.goods_type || "";

  try {
    const filter = { offset, limit, sort, keyword, service_pk, class_pk, goods_type };
    const total = await PremiumModel.findPremiumDiscussAwards(filter, true);
    const rows = await PremiumModel.findPremiumDiscussAwards(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addPremiumDiscussAward(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["service_pk", "class_pk", "goods_pk"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const users = req.body.users;
    const user_ids = users.split(",").map(item => item.trim()).filter(item => !!item);
    const valid_users = await UserModel.findValidUsersByIds(user_ids);
    if (!valid_users || valid_users.length === 0) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_NOT_FOUND_ALL") });
    }

    const valid_ids = valid_users.map(item => item.user_id);
    const diff_ids = user_ids.filter(item => !valid_ids.includes(item));
    if (user_ids.length !== valid_ids.length || diff_ids.length > 0) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: `${getLangText("USER_NOT_FOUND_SOME")} (${diff_ids.join(", ")})` });
    }

    const valid_pks = valid_users.map(item => item.user_pk);

    const filter = {
      service_pk: params.service_pk,
      class_pk: params.class_pk,
    };
    const dup_users = await PremiumModel.findPremiumDiscussAwardsInUserPks(filter, valid_pks);
    if (dup_users.length > 0) {
      const dup_ids = dup_users.map(item => item.user_id);
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: `${getLangText("PREMIUM_LOTTERY_CANDIDATE_EXIST_SOME")} (${dup_ids.join(", ")})` });
    }

    const row = await PremiumModel.addPremiumDiscussAwards(params, valid_pks, admin.manager_pk);
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

async function editPremiumDiscussAward(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["award_pk", "service_pk", "class_pk", "goods_pk"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await PremiumModel.findPremiumDiscussAwardByPk(params.award_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_ITEM") });
    }

    const count = await PremiumModel.editPremiumDiscussAward(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deletePremiumDiscussAward(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const { award_pk, is_deleted } = req.body;
  try {
    const exist = await PremiumModel.findPremiumDiscussAwardByPk(award_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { award_pk, is_deleted };
    const count = await PremiumModel.editPremiumDiscussAward(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addPremiumReception(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["service_pk", "user_pk", "related_pk", "receptionist", "phone_numbers", "location_pk", "location_more", "location_environs", "id_card"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const addrFilter = {
      service_pk: params.service_pk,
      user_pk: params.user_pk,
      related_pk: params.related_pk,
    };
    const exist = await PremiumModel.findPremiumReceptionByFilter(addrFilter);
    if (exist) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const addrParams = {
      service_pk: params.service_pk,
      user_pk: params.user_pk,
      related_pk: params.related_pk,
      receptionist: params.receptionist,
      phone_numbers: params.phone_numbers,
      location_pk: params.location_pk,
      location_more: params.location_more,
      location_environs: params.location_environs,
      id_card: params.id_card,
    };
    const row = await PremiumModel.addPremiumReception(addrParams);
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

async function editPremiumReception(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["table_pk", "receptionist", "phone_numbers", "location_pk", "location_more", "location_environs", "id_card"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await PremiumModel.findPremiumReceptionByPk(params.table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND.code);
    }

    const count = await PremiumModel.editPremiumReception(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPuzzleQuestions(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const service_pk = req.query.service_pk || 0;

  try {
    const filter = { offset, limit, sort, service_pk, keyword };
    const total = await PremiumModel.findQuestionsByServicePk(filter, true);
    const rows = await PremiumModel.findQuestionsByServicePk(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addPuzzleQuestion(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["service_pk", "question_text", "position", "publish_num", "notice_at"];
  let params = extractValidParams(req.body, validKeys);
  params = { ...params, notice_at: moment(params.notice_at).toDate() };
  try {
    const row = await PremiumModel.addQuestion(params);
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

async function editPuzzleQuestion(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["question_pk", "service_pk", "question_text", "position", "publish_num", "notice_at"];
  let params = extractValidParams(req.body, validKeys);
  params = { ...params, notice_at: moment(params.notice_at).toDate() };
  try {
    const exist = await PremiumModel.findQuestionByPk(params.question_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await PremiumModel.editQuestion(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deletePuzzleQuestion(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { question_pk, is_deleted } = req.body;
  try {
    const exist = await PremiumModel.findQuestionByPk(question_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { question_pk, is_deleted };
    const count = await PremiumModel.editQuestion(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPuzzleChoices(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const question_pk = req.query.question_pk || 0;

  try {
    const filter = { offset, limit, sort, question_pk, keyword };
    const total = await PremiumModel.findChoicesByQuestionPk(filter, true);
    const rows = await PremiumModel.findChoicesByQuestionPk(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addPuzzleChoice(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["question_pk", "choice_text", "position", "is_correct"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const row = await PremiumModel.addChoice(params);
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

async function editPuzzleChoice(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["choice_pk", "question_pk", "choice_text", "position", "is_correct"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await PremiumModel.findChoiceByPk(params.choice_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await PremiumModel.editChoice(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deletePuzzleChoice(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { choice_pk, is_deleted } = req.body;
  try {
    const exist = await PremiumModel.findChoiceByPk(choice_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { choice_pk, is_deleted };
    const count = await PremiumModel.editChoice(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPuzzleAwards(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "updated_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const service_pk = req.query.service_pk || "";
  const class_pk = req.query.class_pk || "";
  const goods_type = req.query.goods_type || "";

  try {
    const filter = { offset, limit, sort, keyword, service_pk, class_pk, goods_type };
    const total = await PremiumModel.findPuzzleAwards(filter, true);
    const rows = await PremiumModel.findPuzzleAwards(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addPuzzleAward(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["service_pk", "class_pk", "goods_pk"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const users = req.body.users;
    const user_ids = users.split(",").map(item => item.trim()).filter(item => !!item);
    const valid_users = await UserModel.findValidUsersByIds(user_ids);
    if (!valid_users || valid_users.length === 0) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_NOT_FOUND_ALL") });
    }

    const valid_ids = valid_users.map(item => item.user_id);
    const diff_ids = user_ids.filter(item => !valid_ids.includes(item));
    if (user_ids.length !== valid_ids.length || diff_ids.length > 0) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: `${getLangText("USER_NOT_FOUND_SOME")} (${diff_ids.join(", ")})` });
    }

    const valid_pks = valid_users.map(item => item.user_pk);
    const filter = {
      service_pk: params.service_pk,
      class_pk: params.class_pk,
    };
    const dup_users = await PremiumModel.findPuzzleAwardsInUserPks(filter, valid_pks);
    if (dup_users.length > 0) {
      const dup_ids = dup_users.map(item => item.user_id);
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: `${getLangText("PREMIUM_LOTTERY_CANDIDATE_EXIST_SOME")} (${dup_ids.join(", ")})` });
    }

    const row = await PremiumModel.addPuzzleAwards(params, valid_pks, admin.manager_pk);
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

async function editPuzzleAward(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["award_pk", "service_pk", "class_pk", "goods_pk"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await PremiumModel.findPuzzleAwardByPk(params.award_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await PremiumModel.editPuzzleAward(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deletePuzzleAward(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const { award_pk, is_deleted } = req.body;
  try {
    const exist = await PremiumModel.findPuzzleAwardByPk(award_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { award_pk, is_deleted };
    const count = await PremiumModel.editPuzzleAward(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function finishPuzzleAward(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["service_pk", "award_at"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const users = req.body.users;
    const user_ids = users.split(",").map(item => item.trim()).filter(item => !!item);
    const valid_users = await UserModel.findValidUsersByIds(user_ids);
    if (!valid_users || valid_users.length === 0) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_NOT_FOUND_ALL") });
    }

    const valid_ids = valid_users.map(item => item.user_id);
    const diff_ids = user_ids.filter(item => !valid_ids.includes(item));
    if (user_ids.length !== valid_ids.length || diff_ids.length > 0) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: `${getLangText("USER_NOT_FOUND_SOME")} (${diff_ids.join(", ")})` });
    }

    const valid_pks = valid_users.map(item => item.user_pk);
    const filter = {
      service_pk: params.service_pk,
    };
    const dup_users = await PremiumModel.findPuzzleAwardsInUserPks(filter, valid_pks);
    if (dup_users.length === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("PREMIUM_PUZZLE_USER_ALL_NO_AWARDS") });
    }
    const dup_pks = dup_users.map(item => item.user_pk);
    const non_users = valid_users.filter(item => !dup_pks.includes(item.user_pk));
    if (non_users.length > 0) {
      const non_ids = non_users.map(item => item.user_id);
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: `${getLangText("PREMIUM_PUZZLE_USER_SOME_NO_AWARDS")} (${non_ids.join(", ")})` });
    }

    const awardParams = {
      service_pk: params.service_pk,
      award_at: params.award_at ? moment(params.award_at).toDate() : "",
    }
    const count = await PremiumModel.editPuzzleFinish(awardParams, dup_pks);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPuzzleRank(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const keyword = req.query.keyword || "";
  const service_pk = +req.query.service_pk || 0;

  try {
    const filter = { offset, limit, keyword, service_pk };
    const total = await PremiumModel.findPuzzleRank(filter, true);
    const rows = await PremiumModel.findPuzzleRank(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addPuzzleBonus(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["service_pk", "points"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const users = req.body.users;
    const user_ids = users.split(",").map(item => item.trim()).filter(item => !!item);
    const valid_users = await UserModel.findValidUsersByIds(user_ids);
    if (!valid_users || valid_users.length === 0) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_NOT_FOUND_ALL") });
    }

    const valid_ids = valid_users.map(item => item.user_id);
    const diff_ids = user_ids.filter(item => !valid_ids.includes(item));
    if (user_ids.length !== valid_ids.length || diff_ids.length > 0) {
      const data = { user_ids: diff_ids.join(", ") };
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: `${getLangText("USER_NOT_FOUND_SOME")} (${diff_ids.join(", ")})`, data });
    }

    const valid_pks = valid_users.map(item => item.user_pk);
    const filter = {
      service_pk: params.service_pk,
    };
    const dup_users = await PremiumModel.findPuzzleBonusInUserPks(filter, valid_pks);
    if (dup_users.length > 0) {
      const dup_ids = dup_users.map(item => item.user_id);
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: `${getLangText("PREMIUM_LOTTERY_CANDIDATE_EXIST_SOME")} (${dup_ids.join(", ")})` });
    }

    const row = await PremiumModel.addPuzzleBonus(params, valid_pks, admin.manager_pk);
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

async function editPuzzleBonus(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["service_pk", "user_pk", "points"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const bonusFilter = {
      service_pk: +params.service_pk,
      user_pk: +params.user_pk,
    };
    const exist = await PremiumModel.findPuzzleBonusByFilter(bonusFilter);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await PremiumModel.editPuzzleBonus(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPuzzleAnswerDetail(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const service_pk = req.query.service_pk;
  const user_pk = req.query.user_pk;
  const keyword = req.query.keyword || "";

  const filter = { service_pk, user_pk, keyword };
  try {
    const total = await PremiumModel.findPuzzleAnswerDetail(offset, limit, filter, true);
    const rows = await PremiumModel.findPuzzleAnswerDetail(offset, limit, filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPuzzleAnswerStats(req, res) {
  const question_pk = +req.query.question_pk || 0;

  const filter = { question_pk };
  try {
    const total = await PremiumModel.findPuzzleResponsorCount(filter);
    const rows = await PremiumModel.findPuzzleAnswerStats(filter);
    const sum = rows.length > 0 ? rows.map(row => row.count).reduce((a, b) => a + b) : 0;
    const data = {
      total,
      rows: rows.map(row => ({
        ...row,
        percent: sum === 0 ? 0 : +((row.count / sum * 100).toFixed(2)),
      })),
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchPremiumServices,
  fetchPremiumSimpleServices,
  addPremiumService,
  editPremiumService,
  deletePremiumService,
  syncPremiumService,
  fetchPremiumGoods,
  fetchPremiumSimpleGoods,
  addPremiumGood,
  editPremiumGood,
  deletePremiumGood,
  fetchPremiumUserClasses,
  fetchPremiumSimpleClasses,
  addPremiumUserClass,
  editPremiumUserClass,
  deletePremiumUserClass,
  fetchPremiumUserValues,
  fetchUserDeliveryAddresses,
  addUserDeliveryAddress,
  editUserDeliveryAddress,
  deleteUserDeliveryAddress,
  fetchLotteryNumbers,
  addLotteryNumber,
  editLotteryNumber,
  deleteLotteryNumber,
  refreshLotteryNumber,
  fetchLotterySelectedNumbers,
  fetchLotteryRemainNumbers,
  fetchLotteryCandidates,
  addLotteryCandidate,
  editLotteryCandidate,
  deleteLotteryCandidate,
  fetchLotterySubmits,
  fetchLotterySelectedSubmits,
  fetchLotteryRemainSubmits,
  randomLotterySubmit,
  addLotterySubmit,
  editLotterySubmit,
  deleteLotterySubmit,
  editLotterySubmitAward,
  finishLotterySubmitAward,
  fetchIntegratedUserClasses,
  fetchIntegratedSimpleClasses,
  addIntegratedUserClass,
  editIntegratedUserClass,
  deleteIntegratedUserClass,
  fetchIntegratedUserValues,
  refreshIntegratedUserValue,
  recalcIntegratedUserValues,
  recalcIntegratedUserClasses,
  fetchPremiumDiscussAwards,
  addPremiumDiscussAward,
  editPremiumDiscussAward,
  deletePremiumDiscussAward,
  addPremiumReception,
  editPremiumReception,
  fetchPuzzleQuestions,
  addPuzzleQuestion,
  editPuzzleQuestion,
  deletePuzzleQuestion,
  fetchPuzzleChoices,
  addPuzzleChoice,
  editPuzzleChoice,
  deletePuzzleChoice,
  fetchPuzzleAwards,
  addPuzzleAward,
  editPuzzleAward,
  deletePuzzleAward,
  finishPuzzleAward,
  fetchPuzzleRank,
  addPuzzleBonus,
  editPuzzleBonus,
  fetchPuzzleAnswerDetail,
  fetchPuzzleAnswerStats,
};
