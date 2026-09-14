const moment = require('moment');
const { validationResult } = require('express-validator');
const BlogModel = require('../../models/blogModel');
const PointModel = require('../../models/pointModel');
const { processActivityPointLogByUserPk } = require('../common/commonPrhnController');
const { createResponse } = require('../../utils/response');
const { extractValidParams, formatTimeForClient, convertBlogConfigByList, formatDateForClient, formatDateForMessage } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { ARTICLE_STATES, DEFAULT_PAGE_SIZE, OLD_BLOG_RATING_LIMIT, OLD_BLOG_RATING_TYPES, POINT_TYPE_VALUES, OLD_BLOG_SEARCH_TYPES, OLD_BLOG_ARTICLE_TYPES, OLD_BLOG_SUBJECT_IDS, PRIZE_FILL_TYPES, PREMIUM_SERVICE_WOMENSDAY_ARTICLE_PK, PREMIUM_SERVICE_WOMENSDAY_DISP_DATE, PREMIUM_SERVICE_WOMENSDAY_SERVICE_PK, FLAG_EXIST, PREMIUM_SERVICE_WOMENSDAY_BLOG_START_DATE, PREMIUM_SERVICE_WOMENSDAY_BLOG_END_DATE, PREMIUM_SERVICE_WOMENSDAY_ARTICLE_MAX_THUMBS, ID_PREFIX_PID, ID_PREFIX_PH } = require('../../constants/constants');

async function fetchOldArticles(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: req.query.sortKey || "publish_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const search_type = +req.query.search_type || OLD_BLOG_SEARCH_TYPES.ALL;
  const type = +req.query.type || OLD_BLOG_ARTICLE_TYPES.ALL;
  const subject_id = +req.query.subject_id || 0;
  const subject_min_at = req.query.subject_min_at || "";
  const subject_max_at = req.query.subject_max_at || "";

  try {
    const today = moment().format("YYYY-MM-DD");
    let topRow;
    if (today <= PREMIUM_SERVICE_WOMENSDAY_DISP_DATE
      && offset === 0
      && keyword === ""
      && search_type === OLD_BLOG_SEARCH_TYPES.ALL
      && type == OLD_BLOG_ARTICLE_TYPES.ALL
      && subject_id == 0
    ) {
      const topFilter = {
        blog_pk: PREMIUM_SERVICE_WOMENSDAY_ARTICLE_PK,
        state: ARTICLE_STATES.PUB_APPROVED,
        is_client: 1,
      };
      topRow = await BlogModel.findOldArticleByFilter(topFilter);
    }

    const subject_sort = { key: "order_no", dir: "asc" };
    let subject_filter = { offset: 0, limit: 0, sort: subject_sort, min_at: subject_min_at, max_at: subject_max_at, is_client: 1 };
    if (subject_min_at === "" && subject_max_at === "") {
      subject_filter = { ...subject_filter, is_deleted: FLAG_EXIST };
    }
    let subject_rows = [];
    if (false) { // offset === 0) { // FIXME: iron@ dont fetch blog subjects
      subject_rows = await BlogModel.findSubjects(subject_filter, false);
    }

    let filter = { offset, limit, sort, keyword, search_type, type, subject_id, state: ARTICLE_STATES.PUB_APPROVED, parent_pk: 0, is_client: 1 };
    if (topRow) {
      filter = { ...filter, exclude_pks: [topRow.id] };
    }
    const total = await BlogModel.findOldArticles(filter, true);
    const rows = await BlogModel.findOldArticles(filter, false);
    const data = {
      subject_rows,
      total: topRow ? total + 1 : total,
      rows: topRow ? [topRow, ...rows] : rows,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchOldReplies(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  let sort = { key: req.query.sortKey || "articles.modify_at", dir: req.query.sortDir || "desc" };
  const parent_pk = +req.query.parent_pk || 0;

  const mainFilter = { blog_pk: parent_pk, state: ARTICLE_STATES.PUB_APPROVED, is_client: 1, is_content: 1 };
  const replyFilter = { offset, limit, sort, state: ARTICLE_STATES.PUB_APPROVED, parent_pk, is_client: 1, is_content: 1 };

  const today = moment().format("YYYY-MM-DD");
  try {
    if (today <= PREMIUM_SERVICE_WOMENSDAY_DISP_DATE && parent_pk === PREMIUM_SERVICE_WOMENSDAY_ARTICLE_PK) {
      sort = { key: "thumb_count", dir: "desc" };
    }
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

async function fetchOldRepliesV2(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  let sort = { key: req.query.sortKey || "articles.modify_at", dir: req.query.sortDir || "desc" };
  const parent_pk = +req.query.parent_pk || 0;
  const is_content = +req.query.is_content || 0;

  const mainFilter = { blog_pk: parent_pk, state: ARTICLE_STATES.PUB_APPROVED, is_client: 1, is_content };
  const replyFilter = { offset, limit, sort, state: ARTICLE_STATES.PUB_APPROVED, parent_pk, is_client: 1 };

  const today = moment().format("YYYY-MM-DD");
  try {
    let total = 0;
    let rows = [];
    if (today <= PREMIUM_SERVICE_WOMENSDAY_DISP_DATE && parent_pk === PREMIUM_SERVICE_WOMENSDAY_ARTICLE_PK) {
      sort = { key: "articles.publish_at", dir: "desc" };
      total = await BlogModel.findWomensDayReplies(replyFilter, true);
      rows = await BlogModel.findWomensDayReplies(replyFilter, false);
    } else {
      total = await BlogModel.findOldReplies(replyFilter, true);
      rows = await BlogModel.findOldReplies(replyFilter, false);
    }
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

async function fetchHomeArticles(req, res) {
  const only_userinfo = +req.query.only_userinfo || 0;

  const user = req.user;

  try {
    let data = {};
    if (only_userinfo !== 1) {
      const configs = await BlogModel.findOldBlogConfigs();
      const blog_config = convertBlogConfigByList(configs);

      const popular_articles = await BlogModel.findOldPopularArticles(blog_config, 5);

      const discuss_sort = { key: "articles.modify_at", dir: "desc" };
      const discuss_filter = { offset: 0, limit: 5, sort: discuss_sort, state: ARTICLE_STATES.PUB_APPROVED, subject_id: OLD_BLOG_SUBJECT_IDS.DISCUSS, parent_pk: 0, is_client: 1 };
      const discuss_articles = await BlogModel.findOldArticles(discuss_filter, false);

      const recomm_sort = { key: "articles.create_at", dir: "desc" };
      const recomm_filter = { offset: 0, limit: 10, sort: recomm_sort, state: ARTICLE_STATES.PUB_APPROVED, parent_pk: 0, is_admin_recom: 1, is_client: 1 };
      const recomm_articles = await BlogModel.findOldArticles(recomm_filter, false);

      data = { ...data, popular_articles, discuss_articles, recomm_articles };
    }

    let user_info;
    if (user) {
      user_info = await BlogModel.findOldArticleInfoByUserId(user.user_id);
      if (!user_info) {
        user_info = {
          user_userid: user.user_id,
          main_cnt: 0,
          reply_cnt: 0,
          thumb_bronze: 0,
          thumb_gold: 0,
          thumb_silver: 0,
        };
      }
    }

    data = { ...data, user_info };

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

    const today = moment().format("YYYY-MM-DD");
    if (today >= PREMIUM_SERVICE_WOMENSDAY_BLOG_START_DATE) {
      if (today <= PREMIUM_SERVICE_WOMENSDAY_BLOG_END_DATE) {
        if (+params.blog_pk === PREMIUM_SERVICE_WOMENSDAY_ARTICLE_PK) {
          return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("BLOG_ERR_RECOMM_MAIN_ATM") });
        }
        const recomFilter = {
          main_article_pk: PREMIUM_SERVICE_WOMENSDAY_ARTICLE_PK,
          user_id: user.user_id,
          start_date: PREMIUM_SERVICE_WOMENSDAY_BLOG_START_DATE,
          end_date: PREMIUM_SERVICE_WOMENSDAY_BLOG_END_DATE,
        };
        const recomms = await BlogModel.findOldRatingsByPremiumWomens(recomFilter);
        if (recomms.length >= PREMIUM_SERVICE_WOMENSDAY_ARTICLE_MAX_THUMBS) {
          const rows = recomms.map(row => ({
            article_pk: row.article_id,
            poster_id: row.poster_id,
            summary: row.summary,
          }));
          const data = { rows };
          return res.status(RESP_CODES.SUCCESS.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("BLOG_ERR_RECOMM_MAX", [PREMIUM_SERVICE_WOMENSDAY_ARTICLE_MAX_THUMBS]), data });
        }
      } else if (today <= PREMIUM_SERVICE_WOMENSDAY_DISP_DATE) {
        return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("BLOG_ERR_RECOMM_ATM") });
      }
    }

    const imeiFilter = {
      article_id: params.blog_pk,
      ip: params.imei,
    };
    const countSameImei = await BlogModel.findOldRatingCountByFilter(imeiFilter);
    if (countSameImei >= OLD_BLOG_RATING_LIMIT) {
      return res.status(RESP_CODES.FORBIDDEN.code).json({ code: RESP_CODES.FORBIDDEN.code, message: getLangText("BLOG_ERR_RECOMM_SAME_PHONE") });
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
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")} (rating_type)` });
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

    if (false) { // NOTE: don't add activity point for recommendation
      let pointPk = 0;
      if (params.rating_type === OLD_BLOG_RATING_TYPES.GOLD) {
        pointPk = POINT_TYPE_VALUES.BLOG_RECOM_GOLD;
      } else if (params.rating_type === OLD_BLOG_RATING_TYPES.SILVER) {
        pointPk = POINT_TYPE_VALUES.BLOG_RECOM_SILVER;
      } else if (params.rating_type === OLD_BLOG_RATING_TYPES.BRONZE) {
        pointPk = POINT_TYPE_VALUES.BLOG_RECOM_BRONZE;
      }
      if (poster.pvendor_pk) { // already merged user = pid user
        const logParams = {
          related_pk: ratingRow.id,
        }
        const resp = await processActivityPointLogByUserPk(poster.pvendor_pk, pointPk, logParams);
        if (resp.code !== RESP_CODES.SUCCESS.code) {
          return res.status(resp.code).json(resp);
        }
      } else if (poster.fixed_pk) {
        const pointType = await PointModel.findActivityPointTypeByPk(pointPk);
        if (!pointType) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("POINT_NOT_FOUND_TYPE") });
        }

        const logParams = {
          customer_id: poster.fixed_pk,
          prize_val: pointType.points,
          fill_type: PRIZE_FILL_TYPES.BLOG,
          note: `${poster.title}||${pointType.sub_type}`,
          ip: params.imei,
        };
        const pointRow = await PointModel.addPrizeLog(logParams, user.user_pk);
        if (!pointRow) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
        }
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function viewBlogArticle(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;

  const validKeys = ["blog_pk", "imei"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const viewFilter = {
      article_id: params.blog_pk,
      ip: params.imei,
    };
    const countSameImei = await BlogModel.findOldVisitCountByFilter(viewFilter);
    if (countSameImei > 0) {
      return res.status(RESP_CODES.FORBIDDEN.code).json({ code: RESP_CODES.FORBIDDEN.code, message: getLangText("BLOG_ERR_VISIT_CONFILCT") });
    }

    const count = await BlogModel.increaseOldBlogInfo(params.blog_pk, "visited_num");
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    let visitParams = {
      article_id: params.blog_pk,
      ip: params.imei,
    };

    if (user) {
      visitParams = { ...visitParams, visit_user_userid: user.user_id };
    }
    const visitRow = await BlogModel.addOldVisitLog(visitParams);
    if (!visitRow) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
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

  const user = req.user;

  const validKeys = ["blog_pk", "imei", "is_content"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const viewFilter = {
      article_id: params.blog_pk,
      ip: params.imei,
    };
    const countSameImei = await BlogModel.findOldVisitCountByFilter(viewFilter);
    let increaseCount = 0;
    if (countSameImei === 0) {
      increaseCount = await BlogModel.increaseOldBlogInfo(params.blog_pk, "visited_num");
    }

    let visitParams = {
      article_id: params.blog_pk,
      ip: params.imei,
    };
    if (user) {
      visitParams = { ...visitParams, visit_user_userid: user.user_id };
    }
    await BlogModel.addOldVisitLog(visitParams);

    let lobRow;
    if (+params.is_content) {
      lobRow = await BlogModel.findOldBlogLobByPk(params.blog_pk);
    }

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

async function fetchPremiumWomenDiscussBlog(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const condition = req.query.condition || "";
  try {
    let reply_count = 0;
    if (!user.user_id.startsWith(ID_PREFIX_PID) && !user.user_id.startsWith(ID_PREFIX_PH) && condition.length > 0 && condition.slice(0, 1) === "1") {
      reply_count = await BlogModel.findOldArticleByParentPk(PREMIUM_SERVICE_WOMENSDAY_ARTICLE_PK, user.user_id);
    }

    let thumb_rows = [];
    if (condition.length > 1 && condition.slice(1, 2) === "1") {
      const recomFilter = {
        main_article_pk: PREMIUM_SERVICE_WOMENSDAY_ARTICLE_PK,
        user_id: user.user_id,
        start_date: PREMIUM_SERVICE_WOMENSDAY_BLOG_START_DATE,
        end_date: PREMIUM_SERVICE_WOMENSDAY_BLOG_END_DATE,
      };
      const recomms = await BlogModel.findOldRatingsByPremiumWomens(recomFilter);
      thumb_rows = recomms.map(row => ({
        article_pk: row.article_id,
        poster_id: row.poster_id,
        summary: row.summary,
      }));
    }

    const data = {
      rows: thumb_rows,
      reply_count,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchOldArticles,
  fetchOldReplies,
  fetchOldRepliesV2,
  fetchHomeArticles,
  submitBlogRating,
  viewBlogArticle,
  viewBlogReply,
  fetchPremiumWomenDiscussBlog,
};
