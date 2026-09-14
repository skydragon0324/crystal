const db = require('../db/knex');
const moment = require('moment');
const { FLAG_EXIST, NEWS_STATUS } = require('../constants/constants');

class NewsModel {
  static T_CATEGORIES = "ora_pid.news_categories";
  static T_ARTICLES = "ora_pid.news_articles";
  static T_MORNING = "ora_pid.news_morning";
  static T_POLESTAR = "ora_pid.news_polestar";
  static T_FAVORITES = "ora_pid.news_favorites";

  static async findCategories(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, is_deleted, min_at, max_at } = filter;

      let query = db(`${this.T_CATEGORIES} as categories`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function () {
          this.where(db.raw("LOWER(categories.category_name)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (min_at !== undefined && min_at !== "") {
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function () {
            this.where(db.raw("TO_CHAR(categories.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function () {
                this.where("categories.is_deleted", FLAG_EXIST)
                  .where(db.raw("TO_CHAR(categories.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
              });
          });
        } else {
          query = query.where("categories.is_deleted", FLAG_EXIST)
            .where(db.raw("TO_CHAR(categories.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (is_deleted !== undefined && is_deleted !== "") {
          query = query.where("categories.is_deleted", is_deleted);
        }
        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(categories.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
        }
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      query = query
        .select("categories.category_pk", "categories.category_name", "categories.position", "categories.is_deleted")
        .select(db.raw("TO_CHAR(categories.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findCategoryByPk(category_pk) {
    try {
      const query = db(this.T_CATEGORIES)
        .where("category_pk", category_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findCategoryByName(category_name) {
    try {
      const query = db(this.T_CATEGORIES)
        .where("category_name", category_name)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addCategory(params) {
    try {
      const now = new Date();
      const result = await db(this.T_CATEGORIES)
        .insert({
          ...params,
          created_at: now,
          updated_at: now,
        })
        .returning("*");

      if (!result || result.length === 0) {
        throw new Error("Fail to add a new row");
      }

      return result[0];
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async editCategory(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_CATEGORIES)
        .where("category_pk", params.category_pk)
        .update({
          ...params,
          updated_at: now,
        });

      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findArticles(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, article_source, category_pk, status, is_deleted, is_client, is_now, only_pk } = filter;

      let query = db(`${this.T_ARTICLES} as articles`)
        .leftJoin(`${this.T_CATEGORIES} as categories`, "articles.category_pk", "categories.category_pk");

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function () {
          this.where(db.raw("LOWER(articles.article_title)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(articles.cleaned_content)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(articles.publish_org)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(articles.publish_num)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(articles.reason)"), "like", `%${lowerKeyword}%`)
        });
      }

      if (article_source) {
        query = query.where("articles.article_source", article_source);
      }
      if (category_pk) {
        query = query.where("articles.category_pk", category_pk);
      }

      if (+is_now === 1) {
        const today = moment().format("YYYY-MM-DD");
        query = query.where(db.raw("TO_CHAR(articles.notice_at, 'YYYY-MM-DD')"), "<=", today);
      }

      if (is_client === 1) {
        query = query.where("articles.status", NEWS_STATUS.NOTICE)
          .where("categories.is_deleted", FLAG_EXIST);
      } else {
        if (status) {
          query = query.where("articles.status", status);
        }
        if (is_deleted !== undefined) {
          query = query.where("articles.is_deleted", is_deleted);
        }
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        if (sort.key === "notice_at") {
          query = query.orderBy(db.raw(`NVL(TO_CHAR(articles.notice_at, 'YYYY-MM-DD'), '2025-01-01')`), sort.dir)
            .orderBy(`articles.article_pk`, "desc");
        } else {
          query = query.orderBy(`articles.${sort.key}`, sort.dir);
        }
      }

      if (is_client !== 1) {
        query = query.select("articles.image_url", "articles.reason")
          .select(db.raw("TO_CHAR(articles.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
          .select("categories.category_name")
      }

      if (only_pk === 1) {
        query = query.select("articles.article_pk");
      } else {
        query = query
          .select("articles.article_pk", "articles.article_title", "articles.article_summary", "articles.category_pk", "articles.article_source", "articles.status", "articles.publish_num", "articles.publish_org", "articles.is_deleted", "articles.hash_summary")
          .select(db.raw("TO_CHAR(articles.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"), db.raw("TO_CHAR(articles.notice_at, 'YYYY-MM-DD') notice_at"));
      }

      query = query.offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findArticleByPk(article_pk) {
    try {
      const query = db(this.T_ARTICLES)
        .where("article_pk", article_pk)
        .select("article_pk", "article_title", "article_summary", "category_pk", "article_source", "status", "publish_org", "publish_num", "reason", "is_deleted")
        .select(db.raw("TO_CHAR(notice_at, 'YYYY-MM-DD HH24:MI:SS') notice_at"))
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findArticleByFilter(filter) {
    try {
      const query = db(this.T_ARTICLES)
        .where(filter)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addArticle(params) {
    try {
      const now = new Date();
      const result = await db(this.T_ARTICLES)
        .insert({
          ...params,
          created_at: params.created_at || now,
          updated_at: now,
        })
        .returning("*");

      if (!result || result.length === 0) {
        throw new Error("Fail to add a new row");
      }

      return result[0];
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async addArticles(rows) {
    try {
      const now = new Date();
      const query = db(this.T_ARTICLES)
        .insert(rows.map(row => ({
          ...row,
          created_at: row.created_at || now,
          updated_at: now,
        })))
        .returning('*');
      const result = await query;
      
      if (!result || result.length === 0) {
        throw new Error("Fail to add a new row");
      }
  
      return result;
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }  

  static async editArticle(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_ARTICLES)
        .where("article_pk", params.article_pk)
        .update({
          ...params,
          updated_at: now,
        });

      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findContentMorningByPk(article_pk) {
    try {
      const query = db(this.T_MORNING)
        .where("article_pk", article_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findMorningUpdatedInfo(article_pk, last_at) {
    try {
      let query = db(`${this.T_MORNING} as lob`)
        .where("lob.article_pk", article_pk);
      if (last_at) {
        query = query.where(db.raw("TO_CHAR(lob.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", last_at)
      }
      query = query.select("lob.article_pk", "lob.article_content", "lob.article_origin", "lob.hash_content")
        .select(db.raw("TO_CHAR(lob.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addContentMorning(params) {
    try {
      const now = new Date();
      const result = await db(this.T_MORNING)
        .insert({
          ...params,
          created_at: now,
          updated_at: now,
        })
        .returning("*");

      if (!result || result.length === 0) {
        throw new Error("Fail to add a new row");
      }

      return result[0];
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async addContentMornings(rows) {
    try {
      const now = new Date();
      const query = db(this.T_MORNING)
        .insert(rows.map(row => ({
          ...row,
          created_at: now,
          updated_at: now,
        })))
        .returning('*');
      const result = await query;
      
      if (!result || result.length === 0) {
        throw new Error("Fail to add a new row");
      }
  
      return result[0];
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }  

  static async editContentMorning(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_MORNING)
        .where("article_pk", params.article_pk)
        .update({
          ...params,
          updated_at: now,
        });

      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findContentPolestarByPk(article_pk) {
    try {
      const query = db(this.T_POLESTAR)
        .where("article_pk", article_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPolestarInfoByPk(article_pk) {
    try {
      const query = db(this.T_POLESTAR)
        .where("article_pk", article_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPolestarUpdatedInfo(article_pk, last_at) {
    try {
      let query = db(`${this.T_POLESTAR} as lob`)
        .where("lob.article_pk", article_pk);
      if (last_at) {
        query = query.where(db.raw("TO_CHAR(lob.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", last_at)
      }
      query = query.select("lob.article_pk", "lob.article_content", "lob.article_origin", "lob.hash_content")
        .select(db.raw("TO_CHAR(lob.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addContentPolestar(params) {
    try {
      const now = new Date();
      const result = await db(this.T_POLESTAR)
        .insert({
          ...params,
          created_at: params.created_at || now,
          updated_at: now,
        })
        .returning("*");

      if (!result || result.length === 0) {
        throw new Error("Fail to add a new row");
      }

      return result[0];
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async editContentPolestar(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_POLESTAR)
        .where("article_pk", params.article_pk)
        .update({
          ...params,
          updated_at: now,
        });

      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findArticleFavorites(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, user_pk, article_source, category_pk, status, is_deleted, is_client, is_now, only_pk } = filter;

      let query = db(`${this.T_FAVORITES} as favorites`)
        .leftJoin(`${this.T_ARTICLES} as articles`, "favorites.article_pk", "articles.article_pk")
        .leftJoin(`${this.T_CATEGORIES} as categories`, "articles.category_pk", "categories.category_pk");

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function () {
          this.where(db.raw("LOWER(articles.article_title)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(articles.cleaned_content)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(articles.publish_org)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(articles.publish_num)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(articles.reason)"), "like", `%${lowerKeyword}%`)
        });
      }

      if (user_pk) {
        query = query.where("favorites.user_pk", user_pk);
      }
      if (article_source) {
        query = query.where("articles.article_source", article_source);
      }
      if (category_pk) {
        query = query.where("articles.category_pk", category_pk);
      }

      if (+is_now === 1) {
        const today = moment().format("YYYY-MM-DD");
        query = query.where(db.raw("TO_CHAR(articles.notice_at, 'YYYY-MM-DD')"), "<=", today);
      }

      if (is_client === 1) {
        query = query.where("articles.status", NEWS_STATUS.NOTICE)
          .where("categories.is_deleted", FLAG_EXIST);
      } else {
        if (status) {
          query = query.where("articles.status", status);
        }
        if (is_deleted !== undefined) {
          query = query.where("articles.is_deleted", is_deleted);
        }
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        if (sort.key === "notice_at") {
          query = query.orderBy(db.raw(`NVL(TO_CHAR(articles.notice_at, 'YYYY-MM-DD'), '2025-01-01')`), sort.dir)
            .orderBy(`articles.article_pk`, "desc");
        } else {
          query = query.orderBy(`articles.${sort.key}`, sort.dir);
        }
      }

      if (is_client !== 1) {
        query = query.select("articles.image_url", "articles.reason")
          .select(db.raw("TO_CHAR(articles.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
          .select("categories.category_name")
      }

      if (only_pk === 1) {
        query = query.select("articles.article_pk");
      } else {
        query = query
          .select("articles.article_pk", "articles.article_title", "articles.article_summary", "articles.category_pk", "articles.article_source", "articles.status", "articles.publish_num", "articles.publish_org", "articles.is_deleted", "articles.hash_summary")
          .select(db.raw("TO_CHAR(articles.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"), db.raw("TO_CHAR(articles.notice_at, 'YYYY-MM-DD') notice_at"));
      }

      query = query.offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findNewsFavoriteByFilter(filter) {
    try {
      const query = db(this.T_FAVORITES)
        .where(filter)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findNewsFavoritesInArticlePks(user_pk, article_pks) {
    try {
      const query = db(this.T_FAVORITES)
        .where("user_pk", user_pk)
        .whereIn("article_pk", article_pks)
        .select("user_pk", "article_pk");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addNewsFavorite(params) {
    try {
      const now = new Date();
      const result = await db(this.T_FAVORITES)
        .insert({
          ...params,
          action_at: now,
        })
        .returning("*");

      if (!result || result.length === 0) {
        throw new Error("Fail to add a new row");
      }

      return result[0];
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async deleteNewsFavorite(table_pk) {
    try {
      const rowCount = await db(this.T_FAVORITES)
        .where("table_pk", table_pk)
        .del();
      
      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }
}

module.exports = NewsModel;
