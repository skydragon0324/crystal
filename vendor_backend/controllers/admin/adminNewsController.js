const { validationResult } = require('express-validator');
const md5 = require('md5');
const moment = require('moment');
const striptags = require('striptags');
const NewsModel = require('../../models/newsModel');
const { createResponse } = require('../../utils/response');
const { extractValidParams, unEntity, formatTimeForClient } = require('../../utils/utils');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { ORACLE_VALUE_MAXLEN, NEWS_SUMMARY_MAX_LEN, NEWS_SOURCES } = require('../../constants/constants');

async function fetchNewsCategories(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "position", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";

  try {
    const filter = { offset, limit, sort, keyword };
    const total = await NewsModel.findCategories(filter, true);
    const rows = await NewsModel.findCategories(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addNewsCategory(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["category_name", "position"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await NewsModel.findCategoryByName(params.category_name);
    if (exist) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const row = await NewsModel.addCategory(params);
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

async function editNewsCategory(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["category_pk", "category_name", "position"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await NewsModel.findCategoryByName(params.category_name);
    if (exist && exist.category_pk !== params.category_pk) {
      return res.status(RESP_CODES.CONFLICT.code).json(RESP_CODES.CONFLICT);
    }

    const count = await NewsModel.editCategory(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function deleteNewsCategory(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { category_pk, is_deleted } = req.body;
  try {
    const exist = await NewsModel.findCategoryByPk(category_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { category_pk, is_deleted };
    const count = await NewsModel.editCategory(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchNewsArticles(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "notice_at", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const article_source = req.query.article_source || "";
  const category_pk = req.query.category_pk;
  const status = req.query.status;

  try {
    const filter = { offset, limit, sort, keyword, article_source, category_pk, status };
    const total = await NewsModel.findArticles(filter, true);
    const rows = await NewsModel.findArticles(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addNewsArticle(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["article_title", "article_content", "category_pk", "article_source", "status", "publish_org", "publish_num", "notice_at", "created_at", "excel_data"];
  const params = extractValidParams(req.body, validKeys);
  try {
    if (params.excel_data) {
      let rows = params.excel_data;
      let cleaned_rows = rows.map((row) => {
        let cleaned_content = unEntity(striptags(row.article_content));
        let articleRow = {
          article_title: row.article_title,
          article_summary: cleaned_content.slice(0, NEWS_SUMMARY_MAX_LEN),
          cleaned_content: cleaned_content.slice(0, ORACLE_VALUE_MAXLEN),
          category_pk: row.category_pk,
          article_source: row.article_source,
          status: row.status,
          publish_org: row.publish_org,
          publish_num: row.publish_num,
          status: row.status,
          hash_summary: md5(cleaned_content.slice(0, NEWS_SUMMARY_MAX_LEN)), // FIXME: iron@ temp
        };
        if (row.created_at) {
          articleRow = {
            ...articleRow,
            created_at: moment(row.created_at).toDate(),
          };
        }

        if (row.notice_at) {
          articleRow = {
            ...articleRow,
            notice_at: moment(row.notice_at).toDate(),
          };
        }
        return articleRow;
      })
      const added_rows = await NewsModel.addArticles(cleaned_rows);
      if (!added_rows) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }

      const contentParams = added_rows.map((row, index) => {
        return ({
          article_pk: row.article_pk,
          article_content: rows[index].article_content,
          hash_content: md5(rows[index].article_content), // FIXME: iron@ temp
        })
      });
      const content_row = await NewsModel.addContentMornings(contentParams);
      if (!content_row) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }
      const data = { added_rows };
      return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
    } else {
      const categoryExist = await NewsModel.findCategoryByPk(params.category_pk);
      if (!categoryExist) {
        return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
      }

      const cleaned_content = unEntity(striptags(params.article_content));
      let articleParams = {
        article_title: params.article_title,
        article_summary: cleaned_content.slice(0, NEWS_SUMMARY_MAX_LEN),
        cleaned_content: cleaned_content.slice(0, ORACLE_VALUE_MAXLEN),
        category_pk: params.category_pk,
        article_source: params.article_source,
        status: params.status,
        publish_org: params.publish_org,
        publish_num: params.publish_num,
        status: params.status,
        hash_summary: md5(cleaned_content.slice(0, NEWS_SUMMARY_MAX_LEN)), // FIXME: iron@ temp
      };
      if (params.created_at) {
        articleParams = {
          ...articleParams,
          created_at: moment(params.created_at).toDate(),
        };
      }
      if (params.notice_at) {
        articleParams = {
          ...articleParams,
          notice_at: moment(params.notice_at).toDate(),
        };
      }
      const row = await NewsModel.addArticle(articleParams);
      if (!row) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }

      if (params.article_source === NEWS_SOURCES.MORNING) {
        const contentParams = {
          article_pk: row.article_pk,
          article_content: params.article_content,
          hash_content: md5(params.article_content), // FIXME: iron@ temp
        };
        const content_row = await NewsModel.addContentMorning(contentParams);
        if (!content_row) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
        }
      } else if (params.article_source === NEWS_SOURCES.POLESTAR) {
        const contentParams = {
          article_pk: row.article_pk,
          article_content: cleaned_content,
          hash_content: md5(cleaned_content),
        };
        const content_row = await NewsModel.addContentPolestar(contentParams);
        if (!content_row) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
        }
      }

      const data = { row };
      return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
    }
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function editNewsArticle(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["article_pk", "article_title", "article_content", "category_pk", "article_source", "status", "publish_org", "publish_num", "notice_at", "created_at"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const articleExist = await NewsModel.findArticleByPk(params.article_pk);
    if (!articleExist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NEWS_NOT_FOUND_ARTICLE") });
    }

    const categoryExist = await NewsModel.findCategoryByPk(params.category_pk);
    if (!categoryExist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NEWS_NOT_FOUND_CATEGORY") });
    }

    const cleaned_content = unEntity(striptags(params.article_content));
    let articleParams = {
      article_pk: params.article_pk,
      article_title: params.article_title,
      article_summary: cleaned_content.slice(0, NEWS_SUMMARY_MAX_LEN),
      cleaned_content: cleaned_content.slice(0, ORACLE_VALUE_MAXLEN),
      category_pk: params.category_pk,
      article_source: params.article_source,
      status: params.status,
      publish_org: params.publish_org,
      publish_num: params.publish_num,
      hash_summary: md5(cleaned_content.slice(0, NEWS_SUMMARY_MAX_LEN)), // FIXME: iron@ temp
    };
    if (params.created_at) {
      articleParams = {
        ...articleParams,
        created_at: moment(params.created_at).toDate(),
      };
    }
    if (params.notice_at) {
      articleParams = {
        ...articleParams,
        notice_at: moment(params.notice_at).toDate(),
      };
    }
    const count = await NewsModel.editArticle(articleParams);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    if (params.article_source === NEWS_SOURCES.MORNING) {
      const contentRow = await NewsModel.findContentMorningByPk(params.article_pk);
      if (contentRow && contentRow.article_content !== cleaned_content) {
        const contentParams = {
          article_pk: params.article_pk,
          article_content: params.article_content,
          hash_content: md5(params.article_content), // FIXME: iron@ temp
        };
        const contentCount = await NewsModel.editContentMorning(contentParams);
        if (contentCount === 0) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
        }
      } else if (!contentRow) {
        const contentParams = {
          article_pk: params.article_pk,
          article_content: params.article_content,
          hash_content: md5(params.article_content), // FIXME: iron@ temp
        };
        const content_row = await NewsModel.addContentMorning(contentParams);
        if (!content_row) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
        }
      }
    } else if (params.article_source === NEWS_SOURCES.POLESTAR) {
      const contentRow = await NewsModel.findContentPolestarByPk(params.article_pk);
      if (contentRow && contentRow.article_content !== cleaned_content) {
        const contentParams = {
          article_pk: params.article_pk,
          article_content: cleaned_content,
          hash_content: md5(cleaned_content),
        };
        const contentCount = await NewsModel.editContentPolestar(contentParams);
        if (contentCount === 0) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
        }
      } else if (!contentRow) {
        const contentParams = {
          article_pk: params.article_pk,
          article_content: cleaned_content,
          hash_content: md5(cleaned_content),
        };
        const content_row = await NewsModel.addContentPolestar(contentParams);
        if (!content_row) {
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

async function deleteNewsArticle(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const { article_pk, is_deleted } = req.body;
  try {
    const exist = await NewsModel.findArticleByPk(article_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const params = { article_pk, is_deleted };
    const count = await NewsModel.editArticle(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchNewsContent(req, res) {
  const article_pk = +req.query.article_pk || 0;
  const article_source = +req.query.article_source || 0;

  try {
    let row;
    if (article_source === NEWS_SOURCES.MORNING) {
      row = await NewsModel.findContentMorningByPk(article_pk);
    } else if (article_source === NEWS_SOURCES.POLESTAR) {
      row = await NewsModel.findContentPolestarByPk(article_pk);
    }
    const data = { row };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchNewsCategories,
  addNewsCategory,
  editNewsCategory,
  deleteNewsCategory,
  fetchNewsArticles,
  addNewsArticle,
  editNewsArticle,
  deleteNewsArticle,
  fetchNewsContent,
};
