const { validationResult } = require('express-validator');
const moment = require('moment');
const md5 = require('md5');
const NewsModel = require('../../models/newsModel');
const BridgeAPI = require('../../api/bridgeApi');
const RESP_CODES = require('../../constants/responseCodes');
const { getLangText } = require('../../lang/lang');
const { NEWS_STATUS, NEWS_SOURCES, ORACLE_VALUE_MAXLEN, NEWS_SUMMARY_MAX_LEN, POLESTAR_CATEGORY, NEWS_CATEGORY } = require('../../constants/constants');

async function fetchPolestarNews(req, res) {
  const today = moment().format("YYYY-MM-DD");
  const pub_date = req.query.pub_date || today;

  try {
    const url = `${process.env.POLESTAR_SERVER_URL}/vendor_mobile/getList?pub_date=${pub_date}`;
    const resp = await BridgeAPI.get(url);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }
    if (resp.data.status !== true) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const polestar_news = JSON.parse(resp.data.data);
    for (const article of polestar_news) {
      const articleFilter = {
        article_source: NEWS_SOURCES.POLESTAR,
        provider_pk: article.id,
      };
      const exist = await NewsModel.findArticleByFilter(articleFilter);
      if (exist) {
        if (+article.category_id === POLESTAR_CATEGORY.ECONOMY_INFO && exist.category_pk !== NEWS_CATEGORY.ECONOMY_INFO) {
          const editParams = {
            article_pk: exist.article_pk,
            category_pk: NEWS_CATEGORY.ECONOMY_INFO,
          };
          await NewsModel.editArticle(editParams);
        }
        continue;
      }
      if (![POLESTAR_CATEGORY.ECONOMY_INFO, POLESTAR_CATEGORY.SCIENCE_TECH, POLESTAR_CATEGORY.HEALTH_INFO].includes(+article.category_id)) {
        continue;
      }

      const category_pk = +article.category_id === POLESTAR_CATEGORY.ECONOMY_INFO ? NEWS_CATEGORY.ECONOMY_INFO
        : +article.category_id === POLESTAR_CATEGORY.SCIENCE_TECH ? NEWS_CATEGORY.SCIENCE_TECH
          : NEWS_CATEGORY.HEALTH_INFO;
      const articleParams = {
        article_title: article.disp_title,
        article_summary: article.content.slice(0, NEWS_SUMMARY_MAX_LEN),
        cleaned_content: article.content.slice(0, ORACLE_VALUE_MAXLEN),
        category_pk,
        article_source: NEWS_SOURCES.POLESTAR,
        publish_org: article.pub_num,
        status: NEWS_STATUS.COPY,
        provider_pk: article.id,
        created_at: moment(article.pub_date).toDate(),
        notice_at: '',
        hash_summary: md5(article.content.slice(0, NEWS_SUMMARY_MAX_LEN)), // FIXME: iron@ temp
      };
      const article_row = await NewsModel.addArticle(articleParams);
      if (!article_row) {
        continue;
      }

      const contentParams = {
        article_pk: article_row.article_pk,
        article_content: article.content,
        created_at: moment(article.pub_date).toDate(),
        hash_content: md5(article.content), // FIXME: iron@ temp
      };
      const content_row = await NewsModel.addContentPolestar(contentParams);
      if (!content_row) {
        continue;
      }
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function cancelPolestarNews(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  try {
    const id = +req.query.id;

    const articleFilter = {
      article_source: NEWS_SOURCES.POLESTAR,
      provider_pk: id,
    }
    const exist = await NewsModel.findArticleByFilter(articleFilter);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("NEWS_NOT_FOUND_ARTICLE") });
    }

    const editParams = {
      article_pk: exist.article_pk,
      status: NEWS_STATUS.NEWS_CANCEL,
    };
    const count = await NewsModel.editArticle(editParams);
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
  fetchPolestarNews,
  cancelPolestarNews,
};
