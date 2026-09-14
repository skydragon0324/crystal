const BlogModel = require("../../models/blogModel");
const { createResponse } = require("../../utils/response");
const RESP_CODES = require("../../constants/responseCodes");

async function fetchBlogs(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = {
    key: req.query.sortKey || "create_at",
    dir: req.query.sortDir || "desc",
  };
  const keyword = req.query.keyword || "";
  const type = req.query.type || "";
  const subject_id = req.query.subject_id || "";
  const state = req.query.state || "";

  try {
    const filter = { offset, limit, sort, keyword, type, subject_id, state };
    const total = await BlogModel.findAllBlogs(filter, true);
    const rows = await BlogModel.findAllBlogs(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchNextPkList(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = {
    key: req.query.sortKey || "create_at",
    dir: req.query.sortDir || "desc",
  };
  const keyword = req.query.keyword || "";
  const type = req.query.type || "";
  const subject_id = req.query.subject_id || "";
  const state = req.query.state || "";
  try {
    const filter = { offset, limit, sort, keyword, type, subject_id, state };
    const ids = await BlogModel.getNextPkList(filter);
    // const rows = await BlogModel.findAllBlogs(filter, false);
    let { parent } = await BlogModel.getParentPk(ids[0].id);
    if (!parent) {
      parent = ids[0].id;
    }
    const { user_userid } = await BlogModel.getMainArticleUserId(parent);
    const article_data = await BlogModel.findArticleByPk(parent);
    const main_info_data = await BlogModel.getArticleInfoByUser(user_userid);
    const data = { ids, article_data, main_info_data };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function findArticleByPk(req, res) {
  const { blog_pk } = req.query;
  try {
    let { parent } = await BlogModel.getParentPk(blog_pk);
    if (!parent) {
      parent = blog_pk;
    }
    const { user_userid } = await BlogModel.getMainArticleUserId(parent);
    const article_data = await BlogModel.findArticleByPk(parent);
    const main_info_data = await BlogModel.getArticleInfoByUser(user_userid);
    const data = { article_data, main_info_data };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchBlogs,
  findArticleByPk,
  fetchNextPkList
};
