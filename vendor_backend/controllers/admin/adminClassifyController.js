const ClassifyModel = require('../../models/classifyModel');
const { createResponse } = require('../../utils/response');
const RESP_CODES = require('../../constants/responseCodes');
const { DEFAULT_PAGE_SIZE, CLASSIFY_PHONE_LEVELS, CLASSIFY_EPROD_LEVELS } = require('../../constants/constants');

async function fetchClassesByPhone(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: req.query.sortKey, dir: req.query.sortDir };
  const keyword = req.query.keyword || "";
  const level = req.query.level ? +req.query.level : -1;

  try {
    const filter = { offset, limit, sort, keyword, level };
    const total = await ClassifyModel.findClassesByPhone(filter, true);
    let rows = await ClassifyModel.findClassesByPhone(filter, false);
    rows = rows.map(row => {
      const levelItem = CLASSIFY_PHONE_LEVELS.find(item => row.total_value >= item.min && row.total_value < item.max);
      return {
        ...row,
        class_name: levelItem ? levelItem.name : "",
      };
    })
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchClassesByEprod(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: req.query.sortKey, dir: req.query.sortDir };
  const keyword = req.query.keyword || "";
  const level = req.query.level ? +req.query.level : -1;

  try {
    const filter = { offset, limit, sort, keyword, level };
    const total = await ClassifyModel.findClassesByEprod(filter, true);
    let rows = await ClassifyModel.findClassesByEprod(filter, false);
    rows = rows.map(row => {
      const levelItem = CLASSIFY_EPROD_LEVELS.find(item => row.total_value >= item.min && row.total_value < item.max);
      return {
        ...row,
        class_name: levelItem ? levelItem.name : "",
      };
    })
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchClassesByPhone,
  fetchClassesByEprod,
};
