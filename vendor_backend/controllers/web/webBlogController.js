const { validationResult } = require('express-validator');
const BlogModel = require('../../models/blogModel');
const { createResponse } = require('../../utils/response');
const { extractValidParams, unEntity } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const striptags = require("striptags");
const { DEFAULT_PAGE_SIZE, OLD_BLOG_SEARCH_TYPES, OLD_BLOG_ARTICLE_TYPES, ARTICLE_STATES, OLD_BLOG_RATING_TYPES, PREMIUM_SERVICE_WOMENSDAY_BLOG_START_DATE, PREMIUM_SERVICE_WOMENSDAY_BLOG_END_DATE, PREMIUM_SERVICE_WOMENSDAY_ARTICLE_MAX_THUMBS, PREMIUM_SERVICE_WOMENSDAY_ARTICLE_PK, OLD_BLOG_RATING_LIMIT, NEWS_SUMMARY_MAX_LEN } = require('../../constants/constants');

async function fetchOldBlogArticles(req, res) {
  try {
    const offset = +req.query.offset || 0;
    const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
    const sort = { key: req.query.sortKey || "publish_at", dir: req.query.sortDir || "desc" };
    const keyword = req.query.keyword || "";
    const search_type = +req.query.search_type || OLD_BLOG_SEARCH_TYPES.ALL;
    const type = +req.query.type || OLD_BLOG_ARTICLE_TYPES.ALL;
    const subject_id = +req.query.subject_id || 0;
    let filter = { offset, limit, sort, keyword, search_type, type, subject_id, state: ARTICLE_STATES.PUB_APPROVED, parent_pk: 0, is_client: 1 };

    const total = await BlogModel.findOldArticles(filter, true);
    const rows = await BlogModel.findOldArticles(filter, false);
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

async function fetchOldBlogAdminRecoms(req, res) {
  try {
    const sort = { key: req.query.sortKey || "publish_at", dir: req.query.sortDir || "desc" };
    let filter = { sort, offset: 0, parent_pk: 0, is_client: 1, is_admin_recom: 1 };
    const total = await BlogModel.findOldArticles(filter, true);
    const rows = await BlogModel.findOldArticles(filter, false);
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

async function fetchOldBlogMyArticles(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  try {
    const offset = +req.query.offset || 0;
    const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
    const sort = { key: "created_at", dir: "desc" };
    const keyword = req.query.keyword || "";
    const type = req.query.type;
    const subject_id = req.query.subject_id;
    const state = req.query.state;

    const filter = { offset, limit, sort, user_id: user.user_id, keyword, type, subject_id, state };
    const total = await BlogModel.findOldArticlesForWeb(filter, true);
    const rows = await BlogModel.findOldArticlesForWeb(filter, false);

    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchOldBlogReplies(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  let sort = { key: req.query.sortKey || "articles.modify_at", dir: req.query.sortDir || "desc" };
  const parent_pk = +req.query.parent_pk || 0;

  if (parent_pk === 0) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")} (parent_pk)` });
  }

  const mainFilter = { blog_pk: parent_pk, state: ARTICLE_STATES.PUB_APPROVED, is_client: 1, is_content: 1 };
  const replyFilter = { offset, limit, sort, state: ARTICLE_STATES.PUB_APPROVED, parent_pk, is_client: 1 };

  try {
    let ip = req.ip
      || req.connection.remoteAddress
      || req.socket.remoteAddress
      || req.connection.socket.remoteAddress;
    if (ip === "::1") {
      ip = "127.0.0.1";
    }
    const user = req.user;

    const viewFilter = {
      article_id: parent_pk,
      ip,
    };
    const countSameIp = await BlogModel.findOldVisitCountByFilter(viewFilter);
    if (countSameIp === 0) {
      await BlogModel.increaseOldBlogInfo(parent_pk, "visited_num");
    }

    let visitParams = {
      article_id: parent_pk,
      ip,
    };
    if (user) {
      visitParams = { ...visitParams, visit_user_userid: user.user_id };
    }
    await BlogModel.addOldVisitLog(visitParams);

    const total = await BlogModel.findOldReplies(replyFilter, true);
    let rows = await BlogModel.findOldReplies(replyFilter, false);
    if (offset === 0) {
      const main_article = await BlogModel.findOldArticleByFilter(mainFilter);
      if (main_article) {
        rows = [{
          ...main_article,
          origin: main_article.origin === "null" ? "" : main_article.origin || "",
        }, ...rows];
      }
    }
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function viewBlogReply(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    let ip = req.ip
      || req.connection.remoteAddress
      || req.socket.remoteAddress
      || req.connection.socket.remoteAddress;
    if (ip === "::1") {
      ip = "127.0.0.1";
    }
    const user = req.user;

    const validKeys = ["blog_pk"];
    const params = extractValidParams(req.body, validKeys);

    let increaseCount = 0;
    const viewFilter = {
      article_id: params.blog_pk,
      ip,
    };
    const countSameIp = await BlogModel.findOldVisitCountByFilter(viewFilter);
    if (countSameIp === 0) {
      increaseCount = await BlogModel.increaseOldBlogInfo(params.blog_pk, "visited_num");
    }

    let visitParams = {
      article_id: params.blog_pk,
      ip,
    };
    if (user) {
      visitParams = { ...visitParams, visit_user_userid: user.user_id };
    }
    await BlogModel.addOldVisitLog(visitParams);

    const lobRow = await BlogModel.findOldBlogLobByPk(params.blog_pk);

    const data = {
      is_increase: increaseCount > 0 ? 1 : 0,
      lob_row: lobRow,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchOldBlogContent(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const validKeys = ["blog_pk"];
    const params = extractValidParams(req.query, validKeys);

    const row = await BlogModel.findOldBlogLobByPk(params.blog_pk);

    const data = { row };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchHonormans(req, res) {
  try {
    const rows = await BlogModel.findHonormans();
    const data = {
      rows,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function submitBlogRating(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["blog_pk", "rating_type", "imei"];
  let params = extractValidParams(req.body, validKeys);
  params = { ...params, rating_type: +params.rating_type };

  try {
    const poster = await BlogModel.findOldArticleUserInfoByPk(params.blog_pk);
    if (!poster) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("BLOG_USER_NOT_FOUND") });
    }

    if (user.user_id === poster.user_userid) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("BLOG_ERR_RECOMM_SELF") });
    }

    const userFilter = {
      article_id: params.blog_pk,
      recommend_user_userid: user.user_id,
    }
    const countSameUser = await BlogModel.findOldRatingCountByFilter(userFilter);
    if (countSameUser > 0) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("BLOG_ERR_RECOMM_CONFLICT") });
    }

    let field = "";
    if (params.rating_type === OLD_BLOG_RATING_TYPES.GOLD) {
      field = "gold_recom_num";
    } else if (params.rating_type === OLD_BLOG_RATING_TYPES.SILVER) {
      field = "silber_recom_num";
    } else if (params.rating_type === OLD_BLOG_RATING_TYPES.BRONZE) {
      field = "recommended_num";
    }
    if (field === "") {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")(rating_type)}` });
    }
    const count = await BlogModel.increaseOldBlogInfo(params.blog_pk, field);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const ratingParams = {
      article_id: params.blog_pk,
      recommend_type: params.rating_type,
      recommend_user_userid: user.user_id,
      ip: params.imei,
    };
    const ratingRow = await BlogModel.addOldBlogRating(ratingParams);
    if (!ratingRow) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addBlog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["parent_pk", "title", "origin", "content", "type", "subject_id", "state"];
  let params = extractValidParams(req.body, validKeys);
  let cleaned_content = unEntity(striptags(params.content));
  try {
    if (params.state !== -2) {
      const todayArticle = await BlogModel.findTodayArticleByUserId(user.user_id);
      if (todayArticle.main_cnt >= 1 || todayArticle.reply_cnt >= 1) {
        return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("BLOG_ERR_SUBMIT_LIMIT") });
      }
    }
    const addParams = {
      "user_userid": user.user_id,
      "subject_id": params.subject_id,
      "parent": params.parent_pk,
      "title": params.title,
      "type": params.type,
      "origin": params.origin,
      "summary": cleaned_content.slice(0, NEWS_SUMMARY_MAX_LEN),
      "reason": "",
    }

    if (+params.state === -1) {
      addParams.state = ARTICLE_STATES.PUB_REQUEST;
    } else {
      addParams.state = ARTICLE_STATES.PUB_TEMP;
    }

    const row = await BlogModel.addOldBlog(addParams);
    if (!row) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const addLobParams = {
      id: row.id,
      content: params.content
    }

    const addLobRow = await BlogModel.addOldBlogLob(addLobParams);

    if (!addLobRow) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const addInfoParams = {
      id: row.id,
      visited_num: 0,
      recommended_num: 0,
      rejected_num: 0,
      reply_num: 0,
      is_new: 1,
      is_popular: 0,
      is_help_request: 0,
      help_status: 0,
    }

    const addInfoRow = await BlogModel.addOldBlogInfo(addInfoParams);

    if (!addInfoRow) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);

  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }

}

async function editBlog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["blog_pk", "title", "origin", "content", "subject_id"];
  let params = extractValidParams(req.body, validKeys);
  let cleaned_content = unEntity(striptags(params.content));
  try {
    const editParams = {
      "id": params.blog_pk,
      "subject_id": params.subject_id,
      "title": params.title,
      "origin": params.origin,
      "summary": cleaned_content.slice(0, NEWS_SUMMARY_MAX_LEN),
      "reason": "",
    }

    const count = await BlogModel.editOldBlog(editParams);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const editLobParams = {
      id: params.blog_pk,
      content: params.content
    }

    const countLob = await BlogModel.editOldBlogLob(editLobParams);

    if (countLob === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);

  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }

}

async function deleteBlog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["blog_pk"];
  let params = extractValidParams(req.body, validKeys);

  try {
    const count = await BlogModel.deleteBlog(params.blog_pk);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);

  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function contributeBlog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["blog_pk"];
  let params = extractValidParams(req.body, validKeys);

  try {
    const editParams = { id: params.blog_pk, state: ARTICLE_STATES.PUB_REQUEST };
    const count = await BlogModel.editOldBlog(editParams);
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
  fetchOldBlogArticles,
  fetchOldBlogMyArticles,
  fetchOldBlogReplies,
  viewBlogReply,
  fetchOldBlogContent,
  fetchOldBlogAdminRecoms,
  fetchHonormans,
  submitBlogRating,
  addBlog,
  editBlog,
  deleteBlog,
  contributeBlog,
};
