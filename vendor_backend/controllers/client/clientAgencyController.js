const { validationResult } = require('express-validator');
const AgencyModel = require('../../models/agencyModel');
const ManagerModel = require('../../models/managerModel');
const { createResponse } = require('../../utils/response');
const { extractValidParams } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { MANAGER_ROLES, MANAGER_ROLE_PAGE_SUFFIX, FLAG_EXIST } = require('../../constants/constants');

async function fetchPhoneAgencies(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "agency_rating", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const min_at = req.query.min_at || "";
  const max_at = req.query.max_at || "";

  try {
    const filter = { offset, limit, sort, keyword, min_at, max_at, is_client: 1 };
    const total = await AgencyModel.findPhoneAgencies(filter, true);
    const rows = await AgencyModel.findPhoneAgencies(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPhoneAgenciesForWeb(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "agency_rating", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const parent_location_code = req.query.parent_location_code;
  const business_index = req.query.business_index;

  try {
    const filter = { offset, limit, sort, keyword, parent_location_code, business_index, is_deleted: FLAG_EXIST, is_client: 1 };
    const total = await AgencyModel.findPhoneAgencies(filter, true);
    const rows = await AgencyModel.findPhoneAgencies(filter, false);
    const data = { total, rows };
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

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["agency_pk", "key", "value"];
  const pair = extractValidParams(req.body, validKeys);
  const validParams = ["agency_name", "phone_numbers", "business", "location_pk", "location_more", "location_environs", "shmap_pos", "agency_rating"];
  if (!validParams.includes(pair.key)) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json(RESP_CODES.BAD_REQUEST);
  }
  const params = {
    [pair.key]: pair.value,
  };
  try {
    let agency_permission = MANAGER_ROLES.NONE;
    const admin = await ManagerModel.findUserAdminByUserPk(user.user_pk);
    if (admin) {
      const agencyPermRow = await ManagerModel.findRoleByPageSuffix(admin.role_pk, MANAGER_ROLE_PAGE_SUFFIX.AGENCY_PHONE); 
      if (agencyPermRow) {
        agency_permission = agencyPermRow.permission;
      }
    }
    if (![MANAGER_ROLES.WRITE, MANAGER_ROLES.SUPER].includes(agency_permission)) {
      return res.status(RESP_CODES.FORBIDDEN.code).json(RESP_CODES.FORBIDDEN);
    }

    const exist = await AgencyModel.findPhoneAgencyByPk(pair.agency_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_AGENCY") });
    }

    if (exist[pair.key] !== pair.value) {
      const agencyParams = { ...params, agency_pk: pair.agency_pk };
      const count = await AgencyModel.editPhoneAgency(agencyParams);
      if (count === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }
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
  const sort = { key: req.query.sortKey || "agency_rating", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const min_at = req.query.min_at || "";
  const max_at = req.query.max_at || "";

  const filter = { offset, limit, sort, keyword, min_at, max_at, is_client: 1 };
  try {
    const total = await AgencyModel.findEprodAgencies(filter, true);
    const rows = await AgencyModel.findEprodAgencies(filter, false);
    const data = { total, rows };
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

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["agency_pk", "key", "value"];
  const pair = extractValidParams(req.body, validKeys);
  const validParams = ["agency_name", "phone_numbers", "business", "location_pk", "location_more", "location_environs", "shmap_pos", "agency_rating"];
  if (!validParams.includes(pair.key)) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json(RESP_CODES.BAD_REQUEST);
  }
  const params = {
    [pair.key]: pair.value,
  };
  try {
    let agency_permission = MANAGER_ROLES.NONE;
    const admin = await ManagerModel.findUserAdminByUserPk(user.user_pk);
    if (admin) {
      const agencyPermRow = await ManagerModel.findRoleByPageSuffix(admin.role_pk, MANAGER_ROLE_PAGE_SUFFIX.AGENCY_EPROD); 
      if (agencyPermRow) {
        agency_permission = agencyPermRow.permission;
      }
    }
    if (![MANAGER_ROLES.WRITE, MANAGER_ROLES.SUPER].includes(agency_permission)) {
      return res.status(RESP_CODES.FORBIDDEN.code).json(RESP_CODES.FORBIDDEN);
    }

    const exist = await AgencyModel.findEprodAgencyByPk(pair.agency_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NOT_FOUND_AGENCY") });
    }

    if (exist[pair.key] !== pair.value) {
      const agencyParams = { ...params, agency_pk: pair.agency_pk };
      const count = await AgencyModel.editEprodAgency(agencyParams);
      if (count === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchPhoneAgencies,
  fetchPhoneAgenciesForWeb,
  editPhoneAgency,
  fetchEprodAgencies,
  editEprodAgency,
};
