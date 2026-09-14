const moment = require('moment');
const { validationResult } = require('express-validator');
const AgencyModel = require('../../models/agencyModel');
const PhoneAPI = require('../../api/phoneApi');
const { createResponse } = require('../../utils/response');
const { extractValidParams } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { FLAG_NONE, PHONE_AGENCY_TYPE } = require('../../constants/constants');

async function fetchPhoneAgencies(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "agency_pk", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  let parent_location_code = req.query.parent_location_code || "";
  if (parent_location_code.length === 1) {
    parent_location_code = "0" + parent_location_code;
  }
  const business_index = req.query.business_index === undefined ? -1 : +req.query.business_index;

  try {
    const filter = { offset, limit, sort, keyword, parent_location_code, business_index };
    const total = await AgencyModel.findPhoneAgencies(filter, true);
    const rows = await AgencyModel.findPhoneAgencies(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addPhoneAgency(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["agency_name", "phone_numbers", "business", "location_pk", "location_more", "location_environs", "agency_rating"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const row = await AgencyModel.addPhoneAgency(params);
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

async function editPhoneAgency(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["agency_pk", "agency_name", "phone_numbers", "business", "location_pk", "location_more", "location_environs", "shmap_pos", "agency_rating"];
  let params = extractValidParams(req.body, validKeys);
  try {
    const exist = await AgencyModel.findPhoneAgencyByPk(params.agency_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_AGENCY") });
    }

    const count = await AgencyModel.editPhoneAgency(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }
    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deletePhoneAgency(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { agency_pk, is_deleted } = req.body;
  try {
    const exist = await AgencyModel.findPhoneAgencyByPk(agency_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_AGENCY") });
    }

    const params = {
      agency_pk,
      is_deleted,
    };
    const count = await AgencyModel.editPhoneAgency(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchEprodAgencies(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "agency_pk", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  let parent_location_code = req.query.parent_location_code || "";
  if (parent_location_code.length === 1) {
    parent_location_code = "0" + parent_location_code;
  }
  const business_index = req.query.business_index === undefined ? -1 : +req.query.business_index;

  try {
    const filter = { offset, limit, sort, keyword, parent_location_code, business_index };
    const total = await AgencyModel.findEprodAgencies(filter, true);
    const rows = await AgencyModel.findEprodAgencies(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addEprodAgency(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["agency_name", "phone_numbers", "business", "location_pk", "location_more", "location_environs", "shmap_pos", "agency_rating"];
  let params = extractValidParams(req.body, validKeys);
  try {
    const row = await AgencyModel.addEprodAgency(params);
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

async function editEprodAgency(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["agency_pk", "agency_name", "phone_numbers", "business", "location_pk", "location_more", "location_environs", "agency_rating"];
  let params = extractValidParams(req.body, validKeys);
  try {
    const exist = await AgencyModel.findEprodAgencyByPk(params.agency_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_AGENCY") });
    }

    const count = await AgencyModel.editEprodAgency(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }
    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteEprodAgency(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { agency_pk, is_deleted } = req.body;
  try {
    const exist = await AgencyModel.findEprodAgencyByPk(agency_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_AGENCY") });
    }

    const params = {
      agency_pk,
      is_deleted,
    };
    const count = await AgencyModel.editEprodAgency(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPhoneSaleAgencies(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, sort, keyword };
    const total = await AgencyModel.findPhoneSaleAgencies(filter, true);
    const rows = await AgencyModel.findPhoneSaleAgencies(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPhoneSaleSimpleAgencies(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };

  try {
    const filter = { offset, limit, sort };
    const rows = await AgencyModel.findPhoneSaleSimpleAgencies(filter);
    const data = { rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function syncPhoneSaleAgencies(req, res) {
  const page = +req.query.page || 0;
  const limit = +req.query.limit || 100;
  const sortBy = req.query.sortKey || "id";
  const sortDir = req.query.sortDir || "desc";
  const keyword = req.query.keyword || "";

  try {
    const params = {
      per_page: limit,
      current_page: page + 1,
      last_page: 0,
      total: 0,
      from: 0,
      to: 0,
      keyword,
      location_id: "",
      active: 1, // currently active agencies
      sortBy,
      sortDir,
      type: PHONE_AGENCY_TYPE.SALE,
    }
    const resp = await PhoneAPI.searchSaleAgencies(params);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    const receive_ids = resp.data.items.map(row => row.id);
    const agencyFilter = { offset: 0, limit: 0, sort: {} };
    const exist_rows = await AgencyModel.findPhoneSaleAgencies(agencyFilter, false);
    if (exist_rows && exist_rows.length > 0) {
      const exist_ids = exist_rows.map(row => row.agency_id);
      const inactive_ids = exist_ids.filter(item => !receive_ids.includes(item));
      if (inactive_ids.length > 0) {
        const inactiveParams = {
          status: FLAG_NONE,
        };
        const count = await AgencyModel.editPhoneSaleAgencies(inactive_ids, inactiveParams);
        if (count === 0) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("FAIL_UPDATE_INACTIVE_PHONE_AGENCIES") });
        }
      }
    }

    if (resp.data.items.length === 0) {
      return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
    }

    let err_ids = [];
    for (const row of resp.data.items) {
      const exist = exist_rows.find(item => item.agency_id === row.id);
      if (exist) {
        if (row.name !== exist.agency_name
          || row.superior !== exist.agency_superior
          || row.location_name !== exist.location_name
          || row.location_detail !== exist.location_detail
          || row.status !== exist.status
        ) {
          const editParams = {
            agency_id: row.id,
            agency_name: row.name,
            agency_superior: row.superior,
            location_name: row.location_name,
            location_detail: row.location_detail || "",
            status: row.active,
          };
          const count = await AgencyModel.editPhoneSaleAgency(editParams);
          if (count === 0) {
            err_ids = [...err_ids, row.id];
          }
        }
      } else {
        const addParams = {
          agency_id: row.id,
          agency_name: row.name,
          agency_superior: row.superior,
          location_name: row.location_name,
          location_detail: row.location_detail || "",
          status: row.active,
          created_at: moment(row.created_at).toDate(),
        };
        const newRow = await AgencyModel.addPhoneSaleAgency(addParams);
        if (!newRow) {
          err_ids = [...err_ids, row.id];
        }
      }
    }

    if (err_ids.length !== 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: `${getLangText("FAIL_SYNC_SOME_PHONE_SALE_AGENCIES")} (${err_ids.join(", ")})` });
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function editPhoneSaleAgency(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["agency_id", "position"];
  let params = extractValidParams(req.body, validKeys);
  try {
    const exist = await AgencyModel.findPhoneSaleAgencyById(params.agency_id);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_AGENCY") });
    }

    const count = await AgencyModel.editPhoneSaleAgency(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }
    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deletePhoneSaleAgency(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { agency_id, is_deleted } = req.body;
  try {
    const exist = await AgencyModel.findPhoneSaleAgencyById(agency_id);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_AGENCY") });
    }

    const params = {
      agency_id,
      is_deleted,
    };
    const count = await AgencyModel.editPhoneSaleAgency(params);
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
  fetchPhoneAgencies,
  addPhoneAgency,
  editPhoneAgency,
  deletePhoneAgency,
  fetchEprodAgencies,
  addEprodAgency,
  editEprodAgency,
  deleteEprodAgency,
  fetchPhoneSaleAgencies,
  fetchPhoneSaleSimpleAgencies,
  syncPhoneSaleAgencies,
  editPhoneSaleAgency,
  deletePhoneSaleAgency,
};
