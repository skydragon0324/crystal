const { validationResult } = require('express-validator');
const moment = require('moment');
const fs = require('fs');
const FormData = require('form-data');
const AdModel = require('../../models/advertiseModel');
const SyncApi = require('../../api/syncApi');
const { unlink } = require('../../middleware/upload');
const { createResponse } = require('../../utils/response');
const { extractValidParams } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { SYNC_STATUS } = require('../../constants/constants');

async function fetchAdvertisements(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "created_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, sort, keyword };
    const total = await AdModel.findAdvertisements(filter, true);
    const rows = await AdModel.findAdvertisements(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addAdvertisement(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["title", "content", "image_url", "image_ratio", "content_url", "phone_number", "ad_action", "duty_action", "note"];
  let params = extractValidParams(req.body, validKeys);
  params = { ...params, image_ratio: +params.image_ratio };

  try {
    let funcs = [];
    let apis = [];
    let formImage = new FormData();
    let formContent = new FormData();
    if (req.files) {
      if (req.files.image_file) {
        const path = req.files.image_file[0].path
        params.image_url = path;
        const content = fs.readFileSync(path);
        formImage.append("image_file", content, req.files.image_file[0].originalname);
        formImage.append("new_image_url", path);
        funcs = [...funcs, SyncApi.syncFile(formImage)];
        apis = [...apis, "image"];
      }
      if (req.files.content_file) {
        const path = req.files.content_file[0].path;
        params.content_url = path;
        const content = fs.readFileSync(path);
        formContent.append("image_file", content, req.files.content_file[0].originalname);
        formContent.append("new_image_url", path);
        funcs = [...funcs, SyncApi.syncFile(formContent)];
        apis = [...apis, "content"];
      }
    }
    if (funcs.length > 0) {
      const resp = await Promise.all(funcs);
      for (let i = 0; i < resp.length; i++) {
        if (apis[i] === "image") {
          params = { ...params, image_sync: resp[i].code === RESP_CODES.SUCCESS.code ? SYNC_STATUS.APPROVED : SYNC_STATUS.PENDING };
        } else if (apis[i] === "content") {
          params = { ...params, content_sync: resp[i].code === RESP_CODES.SUCCESS.code ? SYNC_STATUS.APPROVED : SYNC_STATUS.PENDING };
        }
      }
    }

    const row = await AdModel.addAdvertisement(params, admin.manager_pk);
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

async function editAdvertisement(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["ad_pk", "title", "content", "image_url", "image_ratio", "content_url", "phone_number", "ad_action", "duty_action", "note"];
  let params = extractValidParams(req.body, validKeys);

  try {
    const exist = await AdModel.findAdvertiseByPk(params.ad_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    if (!params.image_ratio || +params.image_ratio === 0) {
      params = { ...params, image_ratio: exist.image_ratio };
    }

    let funcs = [];
    let apis = [];
    let formImage = new FormData();
    let formContent = new FormData();
    if (req.files) {
      if (req.files.image_file) {
        const path = req.files.image_file[0].path
        params.image_url = path;
        const content = fs.readFileSync(path);
        formImage.append("image_file", content, req.files.image_file[0].originalname);
        formImage.append("org_image_url", exist.image_url || "");
        formImage.append("new_image_url", path);
        funcs = [...funcs, SyncApi.syncFile(formImage)];
        apis = [...apis, "image"];
      }
      if (req.files.content_file) {
        const path = req.files.content_file[0].path;
        params.content_url = path;
        const content = fs.readFileSync(path);
        formContent.append("image_file", content, req.files.content_file[0].originalname);
        formContent.append("org_image_url", exist.content_url || "");
        formContent.append("new_image_url", path);
        funcs = [...funcs, SyncApi.syncFile(formContent)];
        apis = [...apis, "content"];
      }
    } else {
      if (!params.image_url && exist.image_url) { // remove file
        unlink(exist.image_url);
        let formData = new FormData();
        formData.append("org_image_url", exist.image_url);
        await SyncApi.syncFile(formData);
      }
      if (!params.content_url && exist.content_url) {
        unlink(exist.content_url);
        let formData = new FormData();
        formData.append("org_image_url", exist.content_url);
        await SyncApi.syncFile(formData);
      }
    }
    if (funcs.length > 0) {
      const resp = await Promise.all(funcs);
      for (let i = 0; i < resp.length; i++) {
        if (apis[i] === "image") {
          params = { ...params, image_sync: resp[i].code === RESP_CODES.SUCCESS.code ? SYNC_STATUS.APPROVED : SYNC_STATUS.PENDING };
        } else if (apis[i] === "content") {
          params = { ...params, content_sync: resp[i].code === RESP_CODES.SUCCESS.code ? SYNC_STATUS.APPROVED : SYNC_STATUS.PENDING };
        }
      }
    }

    const count = await AdModel.editAdvertisement(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteByAdPk(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { ad_pk } = req.body;
  try {
    const exist = await AdModel.findAdvertiseByPk(ad_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    if (exist.image_url) {
      unlink(exist.image_url);
      let formData = new FormData();
      formData.append("org_image_url", exist.image_url);
      await SyncApi.syncFile(formData);
    }
    if (exist.content_url) {
      unlink(exist.content_url);
      let formData = new FormData();
      formData.append("org_image_url", exist.content_url);
      await SyncApi.syncFile(formData);
    }

    const count = await AdModel.deleteAdvertiseByPk(ad_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function syncAdvertisement(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["ad_pk"];
  let params = extractValidParams(req.body, validKeys);
  try {
    const exist = await AdModel.findAdvertiseByPk(params.ad_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    let funcs = [];
    let apis = [];
    let formImage = new FormData();
    let formContent = new FormData();
    if (!!exist.image_url && exist.image_sync === SYNC_STATUS.PENDING) {
      const content = fs.readFileSync(exist.image_url);
      const fileName = exist.image_url.split("/").pop();
      formImage.append("image_file", content, fileName);
      formImage.append("new_image_url", exist.image_url);
      funcs = [...funcs, SyncApi.syncFile(formImage)];
      apis = [...apis, "image"];
    }
    if (!!exist.content_url && exist.content_sync === SYNC_STATUS.PENDING) {
      const content = fs.readFileSync(exist.conent_url);
      const fileName = exist.content_url.split("/").pop();
      formContent.append("image_file", content, fileName);
      formContent.append("new_image_url", exist.content_url);
      funcs = [...funcs, SyncApi.syncFile(formContent)];
      apis = [...apis, "content"];
    }
    if (funcs.length === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("SYNC_FILE_ALREADY") });
    }

    const resp = await Promise.all(funcs);
    for (let i = 0; i < resp.length; i++) {
      if (resp[i].code === RESP_CODES.SUCCESS.code) {
        if (apis[i] === "image") {
          params = { ...params, image_sync: SYNC_STATUS.APPROVED };
        } else if (apis[i] === "content") {
          params = { ...params, content_sync: SYNC_STATUS.APPROVED };
        }
      }
    }

    const count = await AdModel.editAdvertisement(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchLayouts(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "created_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, sort, keyword };
    const total = await AdModel.findAllLayouts(filter, true);
    const rows = await AdModel.findAllLayouts(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addLayout(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["predef_id", "layout_name", "autoplay", "show_name", "show_more"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const row = await AdModel.addLayout(params, admin.manager_pk);
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

async function editLayout(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["layout_pk", "predef_id", "layout_name", "autoplay", "show_name", "show_more"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await AdModel.findLayoutByPk(params.layout_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await AdModel.editLayout(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteLayoutByPk(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { layout_pk } = req.body;
  try {
    const exist = await AdModel.findLayoutByPk(layout_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await AdModel.deleteLayoutByPk(layout_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchLayoutAds(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const layout_pk = +req.query.layout_pk || 0;

  try {
    const filter = { offset, limit, sort, layout_pk };
    const total = await AdModel.findAllLayoutAds(filter, true);
    const rows = await AdModel.findAllLayoutAds(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchAllAndLayoutAds(req, res) {
  const sort1 = { key: "pre_index", dir: "asc" };
  const sort2 = { key: "created_at", dir: "desc" };
  const layout_pk = +req.query.layout_pk || 0;

  try {
    const filter = { offset: 0, limit: 0, sort: sort1, layout_pk };
    const layoutAds = await AdModel.findAllLayoutAds(filter, false);
    const allAds = await AdModel.findAdsNotUsedByLayoutPk(layout_pk, sort2);
    const data = { layoutAds, allAds };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchAdsNotUsedByLayoutPk(req, res) {
  const sort = { key: "created_at", dir: "desc" };
  const layout_pk = +req.query.layout_pk || 0;

  try {
    const rows = await AdModel.findAdsNotUsedByLayoutPk(layout_pk, sort);
    const data = { rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addLayoutAd(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["layout_pk", "pre_index", "ad_pk", "position"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const row = await AdModel.addLayoutAd(params, admin.manager_pk);
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

async function editLayoutAd(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["table_pk", "layout_pk", "pre_index", "ad_pk", "position"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await AdModel.findLayoutAdByPk(params.table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await AdModel.editLayoutAd(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteLayoutAdByPk(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }


  const { table_pk } = req.body;
  try {
    const exist = await AdModel.findLayoutAdByPk(table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await AdModel.deleteLayoutAdByPk(table_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchHomeConfigs(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const is_deleted = req.query.is_deleted || "";
  const is_test = req.query.is_test || "";

  try {
    const filter = { offset, limit, sort, keyword, is_deleted, is_test };
    const total = await AdModel.findHomeConfigs(filter, true);
    const configs = await AdModel.findHomeConfigs(filter, false);
    const layout_pks = configs.map(row => row.layout_pk);
    const allAds = await AdModel.findLayoutAdsByLayoutPks(layout_pks, 0);

    const rows = configs.map(row => {
      const ads = allAds.filter(ad => ad.layout_pk === row.layout_pk);
      return { ...row, ads };
    });
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addHomeConfig(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["config_name", "layout_pk", "position", "section_name", "is_deleted", "is_test"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const row = await AdModel.addHomeConfig(params, admin.manager_pk);
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

async function editHomeConfig(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["table_pk", "config_name", "layout_pk", "position", "section_name", "is_deleted", "is_test"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const exist = await AdModel.findHomeConfigByPk(params.table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const count = await AdModel.editHomeConfig(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteHomeConfigByPk(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const { table_pk, is_deleted } = req.body;
  try {
    const exist = await AdModel.findHomeConfigByPk(table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { table_pk, is_deleted };
    const count = await AdModel.editHomeConfig(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }
    // const count = await AdModel.deleteHomeConfigByPk(table_pk);
    // if (count === 0) {
    //   return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    // }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchMenus(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, sort, keyword, include_test: 1 };
    const total = await AdModel.findHomeMenus(filter, true);
    const rows = await AdModel.findHomeMenus(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addMenu(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["icon_name", "icon_url", "menu_name", "menu_action", "message", "position", "note", "is_test"];
  let params = extractValidParams(req.body, validKeys);
  try {
    // If file uploaded, we can now include the file path in params
    if (req.file) {
      params.icon_url = req.file.path;
    }

    const row = await AdModel.addMenu(params, admin.manager_pk);
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

async function editMenu(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["menu_pk", "icon_name", "icon_url", "menu_name", "menu_action", "message", "position", "note", "is_test"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await AdModel.findMenuByPk(params.menu_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    // If file uploaded, we can now include the file path in params
    if (req.file) {
      params.icon_url = req.file.path;
    }

    const count = await AdModel.editMenu(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteMenuByPk(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const { menu_pk, is_deleted } = req.body;
  try {
    const exist = await AdModel.findMenuByPk(menu_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { menu_pk, is_deleted };
    const count = await AdModel.editMenu(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchHomePopups(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const is_deleted = req.query.is_deleted || "";

  try {
    const filter = { offset, limit, sort, is_deleted };
    const total = await AdModel.findHomePopups(filter, true);
    const rows = await AdModel.findHomePopups(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addHomePopup(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["image_url", "position", "start_date", "end_date"];
  let params = extractValidParams(req.body, validKeys);
  params = { ...params, start_date: moment(params.start_date).toDate(), end_date: moment(params.end_date).toDate() };

  try {
    let formData = new FormData();
    if (req.file) {
      params.image_url = req.file.path; // Save the file path (e.g., "uploads/ads/<filename>")
      const content = fs.readFileSync(req.file.path);
      formData.append("image_file", content, req.file.originalname);
    }

    if (params.image_url) {
      formData.append("new_image_url", params.image_url || "");
    }
    const syncResp = await SyncApi.syncFile(formData);
    if (syncResp.code === RESP_CODES.SUCCESS.code) {
      params = { ...params, image_sync: SYNC_STATUS.APPROVED };
    } else {
      params = { ...params, image_sync: SYNC_STATUS.PENDING };
    }

    const row = await AdModel.addHomePopup(params, admin.manager_pk);
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

async function editHomePopup(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["table_pk", "image_url", "position", "start_date", "end_date", "is_deleted"];
  let params = extractValidParams(req.body, validKeys);
  params = { ...params, start_date: moment(params.start_date).toDate(), end_date: moment(params.end_date).toDate() };

  try {
    const exist = await AdModel.findHomePopupByPk(params.table_pk);
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
      params = { ...params, image_sync: SYNC_STATUS.APPROVED };
    } else {
      params = { ...params, image_sync: SYNC_STATUS.PENDING };
    }

    const count = await AdModel.editHomePopup(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteHomePopup(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const admin = req.admin;
  if (!admin) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const { table_pk, is_deleted } = req.body;
  try {
    const exist = await AdModel.findHomePopupByPk(table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { table_pk, is_deleted };
    const count = await AdModel.editHomePopup(params, admin.manager_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function syncHomePopup(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["table_pk"];
  let params = extractValidParams(req.body, validKeys);
  try {
    const exist = await AdModel.findHomePopupByPk(params.table_pk);
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

    params = { ...params, image_sync: SYNC_STATUS.APPROVED };
    const count = await AdModel.editHomePopup(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPageBanners(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const page_type = req.query.page_type || "";
  const is_deleted = req.query.is_deleted || "";

  try {
    const filter = { offset, limit, sort, page_type, is_deleted };
    const total = await AdModel.findPageBanners(filter, true);
    const rows = await AdModel.findPageBanners(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addPageBanner(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["image_url", "image_ratio", "page_type", "position", "action"];
  let params = extractValidParams(req.body, validKeys);

  try {
    let formData = new FormData();
    // If file uploaded, we can now include the file path in params
    if (req.file) {
      params.image_url = req.file.path; // Save the file path (e.g., "uploads/banners/<filename>")
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

    const row = await AdModel.addPageBanner(params);
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

async function editPageBanner(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["table_pk", "image_url", "image_ratio", "page_type", "position", "action"];
  let params = extractValidParams(req.body, validKeys);

  try {
    const exist = await AdModel.findPageBannerByPk(params.table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    let formData = new FormData();
    if (req.file) {
      params.image_url = req.file.path; // Save the file path (e.g., "uploads/banners/<filename>")
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

    const count = await AdModel.editPageBanner(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deletePageBanner(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { table_pk, is_deleted } = req.body;
  try {
    const exist = await AdModel.findPageBannerByPk(table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { table_pk, is_deleted };
    const count = await AdModel.editPageBanner(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function syncPageBanner(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["table_pk"];
  let params = extractValidParams(req.body, validKeys);
  try {
    const exist = await AdModel.findPageBannerByPk(params.table_pk);
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
    const count = await AdModel.editPageBanner(params);
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
  fetchAdvertisements,
  addAdvertisement,
  editAdvertisement,
  deleteByAdPk,
  syncAdvertisement,
  fetchLayouts,
  addLayout,
  editLayout,
  deleteLayoutByPk,
  fetchLayoutAds,
  fetchAllAndLayoutAds,
  fetchAdsNotUsedByLayoutPk,
  addLayoutAd,
  editLayoutAd,
  deleteLayoutAdByPk,
  fetchHomeConfigs,
  addHomeConfig,
  editHomeConfig,
  deleteHomeConfigByPk,
  fetchMenus,
  addMenu,
  editMenu,
  deleteMenuByPk,
  fetchHomePopups,
  addHomePopup,
  editHomePopup,
  deleteHomePopup,
  syncHomePopup,
  fetchPageBanners,
  addPageBanner,
  editPageBanner,
  deletePageBanner,
  syncPageBanner,
};
