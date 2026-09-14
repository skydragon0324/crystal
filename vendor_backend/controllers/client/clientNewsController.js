const moment = require('moment');
const { validationResult } = require('express-validator');
const NewsModel = require('../../models/newsModel');
const { createResponse } = require('../../utils/response');
const { extractValidParams } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { DEFAULT_PAGE_SIZE, NEWS_SOURCES, FLAG_NONE, FLAG_EXIST, FLAG_FAVORITE } = require('../../constants/constants');

async function fetchNewsArticles(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: req.query.sortKey || "notice_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const category_pk = +req.query.category_pk || 0;
  const category_min_at = req.query.category_min_at || "";
  const category_max_at = req.query.category_max_at || "";

  try {
    const user = req.user;
    if (!user) {
      return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
    }

    let categoryFilter = { offset: 0, limit: 0, sort: {}, min_at: category_min_at, max_at: category_max_at, is_client: 1 };
    if (category_min_at === "" && category_max_at === "") {
      categoryFilter = { ...categoryFilter, is_deleted: FLAG_EXIST };
    }
    let category_rows = [];
    if (offset === 0) {
      category_rows = await NewsModel.findCategories(categoryFilter);
    }

    const newsFilter = { offset, limit, sort, keyword, category_pk, is_client: 1, is_now: 1, is_deleted: FLAG_NONE };
    const total = await NewsModel.findArticles(newsFilter, true);
    const rows = await NewsModel.findArticles(newsFilter, false);

    const article_pks = rows.map(row => row.article_pk);
    const favorite_rows = await NewsModel.findNewsFavoritesInArticlePks(user.user_pk, article_pks);

    const data = {
      category_rows,
      total,
      rows,
      favorite_rows,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchNewsArticleLob(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const article_pk = req.query.article_pk;
  const last_at = req.query.last_at || "";
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const keyword = req.query.keyword || "";
  const page_type = +req.query.page_type || FLAG_NONE;
  const category_pk = +req.query.category_pk || 0;
  try {
    const user = req.user;
    if (!user) {
      return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
    }

    const article_row = await NewsModel.findArticleByPk(article_pk);
    if (!article_row) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    let lob_row;
    if (article_row.article_source === NEWS_SOURCES.MORNING) {
      lob_row = await NewsModel.findMorningUpdatedInfo(article_pk, last_at);
    } else if (article_row.article_source === NEWS_SOURCES.POLESTAR) {
      lob_row = await NewsModel.findPolestarUpdatedInfo(article_pk, last_at);
    } else {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")} (article_source)` });
    }

    let article_pks = [];
    let favorite_rows = [];
    if (limit) {
      const newsSort = { key: "notice_at", dir: "desc" };
      const newsFilter = { offset, limit, sort: newsSort, keyword, category_pk, is_client: 1, is_now: 1, is_deleted: FLAG_NONE, only_pk: 1 };
      let article_rows = [];
      if (page_type === FLAG_FAVORITE) {
        article_rows = await NewsModel.findArticleFavorites(newsFilter, false);
      } else {
        article_rows = await NewsModel.findArticles(newsFilter, false);
      }
      article_pks = article_rows.map(row => row.article_pk);
      favorite_rows = await NewsModel.findNewsFavoritesInArticlePks(user.user_pk, article_pks);
    }

    if (lob_row) {
      lob_row = {
        ...lob_row,
        article_title: article_row.article_title,
        category_pk: article_row.category_pk,
        article_source: article_row.article_source,
        publish_org: article_row.publish_org,
        publish_num: article_row.publish_num,
        notice_at: article_row.notice_at,
      }
    }
    const data = {
      lob_row,
      article_pks: article_pks.join(","),
      favorite_rows,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchNewsFavorites(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: "notice_at", dir: "desc" };
  const keyword = req.query.keyword || "";
  const category_pk = +req.query.category_pk || 0;

  try {
    const user = req.user;
    if (!user) {
      return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
    }

    const filter = { offset, limit, sort, keyword, user_pk: user.user_pk, category_pk, is_client: 1, is_now: 1, is_deleted: FLAG_NONE };
    const total = await NewsModel.findArticleFavorites(filter, true);
    const rows = await NewsModel.findArticleFavorites(filter, false);
    
    const favorite_rows = rows.map(row => ({
      user_pk: user.user_pk,
      article_pk: row.article_pk,
    }));

    const data = {
      total,
      rows,
      favorite_rows,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function toggleNewsFavorite(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const user = req.user;
    if (!user) {
      return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
    }

    const validKeys = ["article_pk"];
    const params = extractValidParams(req.body, validKeys);

    let data;
    const newParams = {
      user_pk: user.user_pk,
      article_pk: params.article_pk,
    };
    const exist = await NewsModel.findNewsFavoriteByFilter(newParams);
    if (exist) {
      const count = await NewsModel.deleteNewsFavorite(exist.table_pk);
      if (count === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }
    } else {
      const row = await NewsModel.addNewsFavorite(newParams);
      if (!row) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }
      data = { row };
    }

    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}


module.exports = {
  fetchNewsArticles,
  fetchNewsArticleLob,
  fetchNewsFavorites,
  toggleNewsFavorite,
};
