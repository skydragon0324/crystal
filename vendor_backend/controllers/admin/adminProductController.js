const { validationResult } = require('express-validator');
const fs = require('fs');
const FormData = require('form-data');
const ProductModel = require('../../models/productModel');
const UserModel = require('../../models/userModel');
const PointModel = require('../../models/pointModel');
const SyncApi = require('../../api/syncApi');
const WebApi = require('../../api/webApi');
const { unlink } = require('../../middleware/upload');
const { createResponse } = require('../../utils/response');
const { extractValidParams, getAppPointPagesByDepartment } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { DEFAULT_PAGE_SIZE, SYNC_STATUS, FLAG_EXIST, FLAG_DELETED, REG_POINT_TYPES, REG_POINT_STATUS, APP_POINT_PAGE } = require('../../constants/constants');

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
    const total = await ProductModel.findCategories(filter, true);
    const rows = await ProductModel.findCategories(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addProductCategory(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["category_name", "parent_pk", "position", "is_leaf"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const row = await ProductModel.addCategory(params);
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

async function editProductCategory(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["category_pk", "category_name", "parent_pk", "position", "is_leaf"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await ProductModel.findCategoryByPk(params.category_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await ProductModel.editCategory(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteProductCategory(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { category_pk, is_deleted } = req.body;
  try {
    const exist = await ProductModel.findCategoryByPk(category_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { category_pk, is_deleted };
    const count = await ProductModel.editCategory(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchProducts(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const root_pk = req.query.root_pk;

  try {
    const filter = { offset, limit, sort, keyword, root_pk };
    const total = await ProductModel.findAllProducts(filter, true);
    const rows = await ProductModel.findAllProducts(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchProductPhones(req, res) {
  try {
    const rows = await ProductModel.findProductSimplePhones();
    const data = { rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addProduct(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["product_name", "simple_name", "category_pk", "root_pk", "image_url", "price", "position", "is_new"];
  let params = extractValidParams(req.body, validKeys);
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
    const syncResp = await SyncApi.syncFile(formData);
    if (syncResp.code === RESP_CODES.SUCCESS.code) {
      params = { ...params, status: SYNC_STATUS.APPROVED };
    } else {
      params = { ...params, status: SYNC_STATUS.PENDING };
    }

    const row = await ProductModel.addProduct(params);
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

async function editProduct(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["product_pk", "product_name", "simple_name", "category_pk", "root_pk", "image_url", "price", "position", "is_new"];
  let params = extractValidParams(req.body, validKeys);

  try {
    const exist = await ProductModel.findProductByPk(params.product_pk);
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
    const syncResp = await SyncApi.syncFile(formData);
    if (syncResp.code === RESP_CODES.SUCCESS.code) {
      params = { ...params, status: SYNC_STATUS.APPROVED };
    } else {
      params = { ...params, status: SYNC_STATUS.PENDING };
    }

    const count = await ProductModel.editProduct(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteProduct(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { product_pk, is_deleted } = req.body;
  try {
    const exist = await ProductModel.findProductByPk(product_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { product_pk, is_deleted };
    const count = await ProductModel.editProduct(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function syncProduct(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["product_pk"];
  let params = extractValidParams(req.body, validKeys);
  try {
    const exist = await ProductModel.findProductByPk(params.product_pk);
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
    const count = await ProductModel.editProduct(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchProductImages(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const product_pk = req.query.product_pk;
  const image_type = req.query.image_type;

  try {
    const filter = { offset, limit, sort, keyword, product_pk, image_type };
    const total = await ProductModel.findProductImages(filter, true);
    const rows = await ProductModel.findProductImages(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addProductImage(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["product_pk", "image_type", "image_url", "image_ratio", "position", "status"];
  let params = extractValidParams(req.body, validKeys);
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
    const syncResp = await SyncApi.syncFile(formData);
    if (syncResp.code === RESP_CODES.SUCCESS.code) {
      params = { ...params, status: SYNC_STATUS.APPROVED };
    } else {
      params = { ...params, status: SYNC_STATUS.PENDING };
    }

    const row = await ProductModel.addProductImage(params);
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

async function editProductImage(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["table_pk", "product_pk", "image_type", "image_url", "image_ratio", "position", "status"];
  let params = extractValidParams(req.body, validKeys);

  try {
    const exist = await ProductModel.findProductImageByPk(params.table_pk);
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
    const syncResp = await SyncApi.syncFile(formData);
    if (syncResp.code === RESP_CODES.SUCCESS.code) {
      params = { ...params, status: SYNC_STATUS.APPROVED };
    } else {
      params = { ...params, status: SYNC_STATUS.PENDING };
    }

    const count = await ProductModel.editProductImage(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteProductImage(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { table_pk, is_deleted } = req.body;
  try {
    const exist = await ProductModel.findProductImageByPk(table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { table_pk, is_deleted };
    const count = await ProductModel.editProductImage(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function syncProductImage(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["table_pk"];
  let params = extractValidParams(req.body, validKeys);
  try {
    const exist = await ProductModel.findProductImageByPk(params.table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    let formData = new FormData();
    const content = fs.readFileSync(exist.image_url);
    const fileName = exist.image_url.split("/").pop();
    formData.append("image_file", content, fileName);
    formData.append("new_image_url", exist.image_url);
    const syncResp = await SyncApi.syncFile(formData);
    if (syncResp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    params = { ...params, status: SYNC_STATUS.APPROVED };
    const count = await ProductModel.editProductImage(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchProductSpecKeys(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "", dir: req.query.sortDir || "" };
  const keyword = req.query.keyword || "";
  const is_deleted = req.query.is_deleted;

  try {
    const filter = { offset, limit, sort, keyword, is_deleted };
    const total = await ProductModel.findSpecKeys(filter, true);
    const rows = await ProductModel.findSpecKeys(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addProductSpecKey(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["spec_name", "spec_type"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const dup = await ProductModel.findSpecKeyByName(params.spec_name);
    if (dup) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const row = await ProductModel.addSpecKey(params);
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

async function editProductSpecKey(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["spec_pk", "spec_name", "spec_type"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await ProductModel.findSpecKeyByPk(params.spec_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const dup = await ProductModel.findSpecKeyByName(params.spec_name);
    if (dup && dup.spec_pk !== params.spec_pk) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const count = await ProductModel.editSpecKey(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteProductSpecKey(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { spec_pk, is_deleted } = req.body;
  try {
    const exist = await ProductModel.findSpecKeyByPk(spec_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { spec_pk, is_deleted };
    const count = await ProductModel.editSpecKey(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchProductSpecOrders(req, res) {
  const offset = +req.query.offset || 0;
  const limit = req.query.limit === undefined ? DEFAULT_PAGE_SIZE : +req.query.limit;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const root_pk = req.query.root_pk;

  try {
    const filter = { offset, limit, sort, root_pk };
    const total = await ProductModel.findSpecOrders(filter, true);
    const rows = await ProductModel.findSpecOrders(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addProductSpecOrder(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["root_pk", "spec_pk", "position"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const orderFilter = {
      root_pk: params.root_pk,
      spec_pk: params.spec_pk,
    };
    const dup = await ProductModel.findSpecOrderByFilter(orderFilter);
    if (dup) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const row = await ProductModel.addSpecOrder(params);
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

async function editProductSpecOrder(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["table_pk", "root_pk", "spec_pk", "position"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await ProductModel.findSpecOrderByPk(params.table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    if (params.root_pk && params.spec_pk) {
      const orderFilter = {
        root_pk: params.root_pk,
        spec_pk: params.spec_pk,
      };
      const dup = await ProductModel.findSpecOrderByFilter(orderFilter);
      if (dup && dup.table_pk !== params.table_pk) {
        return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
      }
    }

    const count = await ProductModel.editSpecOrder(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteProductSpecOrder(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { table_pk, is_deleted } = req.body;
  try {
    const exist = await ProductModel.findSpecOrderByPk(table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { table_pk, is_deleted };
    const count = await ProductModel.editSpecOrder(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchProductSpecKeyAndValues(req, res) {
  const offset = +req.query.offset || 0;
  const limit = req.query.limit === undefined ? DEFAULT_PAGE_SIZE : +req.query.limit;
  const root_pk = +req.query.root_pk || 0;
  const product_pk = +req.query.product_pk || 0;

  try {
    const filter = { offset, limit, sort: {}, root_pk, product_pk };
    const rows = await ProductModel.findSpecKeyAndValues(filter, false);
    const data = { rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function submitProductSpecValues(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["rows"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const { rows } = params;
    if (!rows || rows.length === 0) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("NO_CHANGES_TO_UPDATE") });
    }

    let successCount = 0;
    for (const row of rows) {
      const filter = {
        product_pk: row.product_pk,
        spec_pk: row.spec_pk,
      };
      const exist = await ProductModel.findSpecValueByFilter(filter);
      if (exist) {
        const rowParams = {
          table_pk: exist.table_pk,
          spec_value: row.spec_value,
        };
        const count = await ProductModel.editSpecValue(rowParams);
        if (count !== 0) {
          successCount++;
        }
      } else {
        const newRow = await ProductModel.addSpecValue(row);
        if (newRow) {
          successCount++;
        }
      }
    }

    const data = {
      success_count: successCount,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchProductModels(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, sort, keyword };
    const total = await ProductModel.findProductModels(filter, true);
    const rows = await ProductModel.findProductModels(filter, false);

    const product_pks = rows.map(row => row.product_pk);
    const prefixes = await ProductModel.findPhoneImeiPrefixInProductPks(product_pks);

    const new_rows = rows.map(row => ({
      ...row,
      prefixes: prefixes.filter(prefix => prefix.product_pk === row.product_pk),
    }));

    const data = {
      total,
      rows: new_rows,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchProductReservableModels(req, res) {
  try {
    const rows = await ProductModel.findProductModelsReservable();
    const data = {
      rows,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addProductModel(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["product_pk", "model_name", "reservable"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const dup = await ProductModel.findProductModelByProductPk(params.product_pk);
    if (dup) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const row = await ProductModel.addProductModel(params, admin.manager_pk);
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

async function editProductModel(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["model_pk", "product_pk", "model_name", "reservable"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const dup = await ProductModel.findProductModelByProductPk(params.product_pk);
    if (dup && dup.model_pk !== params.model_pk) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const exist = await ProductModel.findProductModelByPk(params.model_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await ProductModel.editProductModel(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteProductModel(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { model_pk, is_deleted } = req.body;
  try {
    const exist = await ProductModel.findProductModelByPk(model_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { model_pk, is_deleted };
    const count = await ProductModel.editProductModel(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchRegisterPhoneLog(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: req.query.sortKey || "created_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const user_pk = req.query.user_pk;
  const phone_imei = req.query.phone_imei || "";

  try {
    const filter = { offset, limit, sort, keyword, user_pk, phone_imei };
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

  const validKeys = ["product_pk", "user_id", "phone_imei", "cid"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const user = await UserModel.findUserById(params.user_id);
    if (!user) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    const pointType = await PointModel.findRegisterPointTypeByProductPk(params.product_pk);
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
      product_pk: params.product_pk,
      phone_imei: params.phone_imei,
      cid: params.cid,
      points: count === 0 ? pointType.points : 0,
    };
    const row = await ProductModel.addRegisterPhoneLog(logParams);
    if (!row) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    if (count === 0) {
      const productRow = await ProductModel.findProductByPk(params.product_pk);
      if (!productRow) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("PHONE_NO_INFO_BY_PK") });
      }

      const pointParams = {
        user_pk: user.user_pk,
        point_type: REG_POINT_TYPES.PHONE,
        status: REG_POINT_STATUS.PLUS,
        product_pk: params.product_pk,
        product_name: productRow.product_name,
        equ_num: params.phone_imei,
        points: pointType.points,
      };
      const pointRow = await PointModel.addRegisterPointLog(pointParams);
      if (!pointRow) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }
    }

    const data = { row };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchRegisterProductLog(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sortBy = "created_at";
  const sortOrder = "desc";
  const keyword = req.query.keyword || "";
  const status = req.query.status;

  try {
    const params = {
      offset,
      limit,
      sortBy,
      sortOrder,
      keyword,
      status,
    }
    const resp = await WebApi.fetchAllEprodRegisterLog(params);
    const data = {
      total: +resp.data.total,
      rows: resp.data.data,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchEprodRegistAddLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const appPages = getAppPointPagesByDepartment(admin.department);
  if (!appPages.includes(APP_POINT_PAGE.REGISTER)) {
    return res.status(RESP_CODES.FORBIDDEN.code).json(RESP_CODES.FORBIDDEN);
  }

  const user_pk = req.query.user_pk;
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;

  try {
    /** fetch userinfo by user_pk to fix error fetching by original mobile user_id after merge fixed_id */
    const userInfo = await UserModel.findUserByPk(user_pk);
    if (!userInfo) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("USER_INFO_NOT_FOUND") });
    }

    const resp = await WebApi.fetchEprodRegistAddLog(userInfo.user_id, offset, limit);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    const data = {
      total: +resp.data.total,
      rows: resp.data.data.map(row => ({
        contact_num: row.contact_num || "",
        address: row.address || "",
        sn_num: row.sn_num || "",
        product_name: row.product_name || "",
        created_at: row.created_at || "",
        status: +row.status,
        bonus_score: +row.bonus_score,
      })),
      sum_total: +resp.data.sum_total,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchEprodRegistMinusLog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const appPages = getAppPointPagesByDepartment(admin.department);
  if (!appPages.includes(APP_POINT_PAGE.REGISTER)) {
    return res.status(RESP_CODES.FORBIDDEN.code).json(RESP_CODES.FORBIDDEN);
  }

  const user_pk = req.query.user_pk;
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: "action_at", dir: "desc" };

  try {
    const filter = { offset, limit, sort, user_pk, point_type: REG_POINT_TYPES.MANAGER, status: REG_POINT_STATUS.MINUS, is_client: 1 };
    const total = await PointModel.findRegisterPointLog(filter, true);
    const rows = await PointModel.findRegisterPointLog(filter, false);

    const data = {
      total,
      rows,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addPhoneImeiPrefix(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["product_pk", "prefix_str"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const row = await ProductModel.addPhoneImeiPrefix(params);
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

async function deletePhoneImeiPrefix(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { prefix_pk } = req.body;
  try {
    const exist = await ProductModel.findPhoneImeiPrefixByPk(prefix_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await ProductModel.deletePhoneImeiPrefix(prefix_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
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

  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const product_pk = req.query.product_pk;

  try {
    const filter = { offset, limit, sort, keyword, product_pk };
    const total = await ProductModel.findPhoneAccessories(filter, true);
    const rows = await ProductModel.findPhoneAccessories(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addPhoneAccessory(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["product_pk", "product_name", "accessory_name", "resource_price", "service_price", "allow_num"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const filter = {
      product_pk: params.product_pk,
      accessory_name: params.accessory_name,
    };
    const dup = await ProductModel.findPhoneAccessoryByFilter(filter);
    if (dup) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const row = await ProductModel.addPhoneAccessory(params);
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

async function editPhoneAccessory(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["accessory_pk", "product_pk", "product_name", "accessory_name", "resource_price", "service_price", "allow_num"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await ProductModel.findPhoneAccessoryByPk(params.accessory_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const filter = {
      product_pk: params.product_pk,
      accessory_name: params.accessory_name,
    };
    const dup = await ProductModel.findPhoneAccessoryByFilter(filter);
    if (dup && dup.accessory_pk !== params.accessory_pk) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const count = await ProductModel.editPhoneAccessory(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deletePhoneAccessory(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { accessory_pk, is_deleted } = req.body;
  try {
    const exist = await ProductModel.findPhoneAccessoryByPk(accessory_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { accessory_pk, is_deleted };
    const count = await ProductModel.editPhoneAccessory(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
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

  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const product_pk = req.query.product_pk;

  try {
    const filter = { offset, limit, sort, keyword, product_pk };
    const total = await ProductModel.findPhoneChangelogs(filter, true);
    const rows = await ProductModel.findPhoneChangelogs(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addPhoneChangelog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["product_pk", "product_name", "title", "content", "publish_num", "position"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const row = await ProductModel.addPhoneChangelog(params);
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

async function editPhoneChangelog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["table_pk", "product_pk", "product_name", "title", "content", "publish_num", "position"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await ProductModel.findPhoneChangelogByPk(params.table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await ProductModel.editPhoneChangelog(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deletePhoneChangelog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { table_pk, is_deleted } = req.body;
  try {
    const exist = await ProductModel.findPhoneChangelogByPk(table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { table_pk, is_deleted };
    const count = await ProductModel.editPhoneChangelog(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchProductCategories,
  addProductCategory,
  editProductCategory,
  deleteProductCategory,
  fetchProducts,
  fetchProductPhones,
  addProduct,
  editProduct,
  deleteProduct,
  syncProduct,
  fetchProductImages,
  addProductImage,
  editProductImage,
  deleteProductImage,
  syncProductImage,
  fetchProductSpecKeys,
  addProductSpecKey,
  editProductSpecKey,
  deleteProductSpecKey,
  fetchProductSpecOrders,
  addProductSpecOrder,
  editProductSpecOrder,
  deleteProductSpecOrder,
  fetchProductSpecKeyAndValues,
  submitProductSpecValues,
  fetchProductModels,
  fetchProductReservableModels,
  addProductModel,
  editProductModel,
  deleteProductModel,
  fetchRegisterPhoneLog,
  addRegisterPhoneLog,
  fetchRegisterProductLog,
  fetchEprodRegistAddLog,
  fetchEprodRegistMinusLog,
  addPhoneImeiPrefix,
  deletePhoneImeiPrefix,
  fetchPhoneAccessories,
  addPhoneAccessory,
  editPhoneAccessory,
  deletePhoneAccessory,
  fetchPhoneChangelogs,
  addPhoneChangelog,
  editPhoneChangelog,
  deletePhoneChangelog,
};
