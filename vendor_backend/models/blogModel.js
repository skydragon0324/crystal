const db = require('../db/knex');
const moment = require('moment');
const { FLAG_EXIST, FLAG_NONE, OLD_BLOG_HELP_STATUS, OLD_BLOG_MANAGER_ID, ARTICLE_STATES, OLD_BLOG_SEARCH_TYPES, OLD_BLOG_ARTICLE_TYPES, FIXED_STATUS } = require('../constants/constants');

class BlogModel {
  static T_OLD_SUBJECTS = "ora_blog.blog_subject";
  static T_OLD_ARTICLES = "ora_blog.blog_article";
  static T_OLD_INFOS = "ora_blog.blog_article_info";
  static T_OLD_LOBS = "ora_blog.blog_article_lob";
  static T_OLD_RECOMMENDS = "ora_blog.blog_article_recommend";
  static T_OLD_VISIT_LOG = "ora_blog.blog_article_visit_log";
  static T_OLD_CONFIG = "ora_blog.blog_config";
  static T_CUSTOMERS = "ora_old_db.customers";
  static T_BLOGS = "ora_pid.blogs";
  static T_CATEGORIES = "ora_pid.blog_categories";
  static T_USERS = "ora_pid.users";
  static T_MERGE_IDS = "ora_pid.user_merge_ids";

  static async findSubjects(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, parent_pk, is_deleted, min_at, max_at, is_client } = filter;

      let query = db(`${this.T_OLD_SUBJECTS} as subjects`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(subjects.name)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (min_at !== undefined && min_at !== "") {
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(subjects.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function() {
                this.where("subjects.state", FLAG_EXIST)
                .where(db.raw("TO_CHAR(subjects.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
              });
          });
        } else {
          query = query.where("subjects.state", FLAG_EXIST)
            .where(db.raw("TO_CHAR(subjects.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (is_deleted !== undefined && is_deleted !== "") {
          query = query.where("subjects.state", is_deleted);
        }
        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(subjects.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
        }
      }
      if (parent_pk !== undefined && parent_pk !== "") {
        if (parent_pk === 0) {
          query = query.where(function() {
            this.where("subjects.parent", parent_pk)
              .orWhereNull("subjects.parent");
          });
        } else {
          query = query.where("subjects.parent", parent_pk);
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

      if (is_client === 1) {
        query = query.select(db.raw("TO_CHAR(subjects.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      } else {
        query = query.select("subjects.created_at", "subjects.updated_at");
      }

      query = query
        .select("subjects.id as subject_pk", "subjects.name as subject_name", "subjects.parent as parent_pk", "subjects.order_no as position", "subjects.state as is_deleted")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findOldArticles(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, search_type, type, subject_id, state, parent_pk, is_admin_recom, is_client, is_content, exclude_pks } = filter;

      let query = db(`${this.T_OLD_ARTICLES} as articles`)
        .leftJoin(`${this.T_OLD_INFOS} as article_infos`, "articles.id", "article_infos.id")
        .leftJoin(`${this.T_OLD_SUBJECTS} as subjects`, "articles.subject_id", "subjects.id")
        .leftJoin(`${this.T_CUSTOMERS} as customers`, "articles.user_userid", "customers.user_userid");
      if (is_content === 1) {
        query = query.leftJoin(`${this.T_OLD_LOBS} as article_lobs`, "articles.id", "article_lobs.id");
      }

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        if (search_type === OLD_BLOG_SEARCH_TYPES.TITLE) {
          query = query.where(db.raw("LOWER(articles.title)"), "like", `%${lowerKeyword}%`);
        } else if (search_type === OLD_BLOG_SEARCH_TYPES.AUTHOR) {
          query = query.where(function() {
            this.where(db.raw("LOWER(articles.user_userid)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(customers.user_name)"), "like", `%${lowerKeyword}%`);
          });
        } else {
          query = query.where(function() {
            this.where(db.raw("LOWER(articles.title)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(articles.user_userid)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(customers.user_name)"), "like", `%${lowerKeyword}%`);
          });
        }
      }
      if (type !== undefined && type !== OLD_BLOG_ARTICLE_TYPES.ALL) {
        query = query.where("articles.type", type);
      }
      if (subject_id !== undefined && subject_id !== 0) {
        query = query.where("articles.subject_id", subject_id);
      }
      if (state !== undefined && state !== "") {
        query = query.where("articles.state", state);
      }
      if (parent_pk !== undefined && parent_pk !== "") {
        query = query.where("articles.parent", parent_pk);
      }
      if (is_admin_recom !== undefined && is_admin_recom !== "") {
        query = query.where("articles.is_admin_recom", is_admin_recom);
      }
      if (exclude_pks && exclude_pks.length > 0) {
        query = query.whereNotIn("articles.id", exclude_pks);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        if (sort.key === "thumb_count") {
          query = query.orderBy(db.raw("article_infos.gold_recom_num - article_infos.recommended_num"), sort.dir)
            .orderBy("articles.create_at", sort.dir);
        } else if (sort.key === "publish_at") {
          query = query.orderBy(`articles.${sort.key}`, sort.dir);
        } else {
          query = query.orderBy(`article_infos.${sort.key}`, sort.dir);
        }
      }

      if (is_client === 1) {
        query = query
          .select(db.raw("TO_CHAR(articles.modify_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
          .select(db.raw("TO_CHAR(articles.publish_at, 'YYYY-MM-DD HH24:MI:SS') publish_at"));
      } else {
        query = query.select("articles.summary","articles.create_at as created_at", "articles.modify_at as updated_at");
      }
      if (is_content === 1) {
        query = query.select("article_lobs.content", "article_lobs.approval_num");
      } else {
        query = query.select(db.raw("REGEXP_REPLACE(articles.summary, '<[^>]+>', '') summary"))
          .select("articles.title");
      }
      query = query
        .select("articles.id", "articles.user_userid", "articles.parent", "articles.state")
        .select("customers.user_name")
        .select("subjects.name as subject_name")
        .select("article_infos.gold_recom_num as thumb_gold", "article_infos.silber_recom_num as thumb_silver", "article_infos.recommended_num as thumb_bronze", "article_infos.visited_num as visit_count", "article_infos.reply_num as reply_count")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findOldArticlesForWeb(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, user_id, type, subject_id, state } = filter;

      let query = db(`${this.T_OLD_ARTICLES} as articles`)
        .leftJoin(`${this.T_OLD_INFOS} as article_infos`, "articles.id", "article_infos.id")

      if (user_id) {
        query = query.where("articles.user_userid", user_id);
      }
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(db.raw("LOWER(articles.title)"), "like", `%${lowerKeyword}%`);
      }
      if (type !== undefined && type !== OLD_BLOG_ARTICLE_TYPES.ALL) {
        query = query.where("articles.type", type);
      }
      if (subject_id !== undefined && subject_id !== 0) {
        query = query.where("articles.subject_id", subject_id);
      }
      if (state !== undefined && state !== "") {
        query = query.where("articles.state", state);
      } else {
        query = query.where("articles.state", "!=", ARTICLE_STATES.PUB_TEMP);
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
        .select("articles.id", "articles.user_userid", "articles.subject_id", "articles.parent", "articles.title", "articles.state", "articles.type", "articles.reason")
        .select(db.raw("REGEXP_REPLACE(articles.summary, '<[^>]+>', '') summary"))
        .select(db.raw("TO_CHAR(articles.create_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
        .select(db.raw("TO_CHAR(articles.modify_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .select("article_infos.is_help_request", "article_infos.help_status", "article_infos.visited_num", "article_infos.reply_num")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findOldReplies(filter, isCount = false) {
    try {
      const { offset, limit, sort, state, parent_pk, is_client, is_content } = filter;

      let query = db(`${this.T_OLD_ARTICLES} as articles`)
        .leftJoin(`${this.T_OLD_INFOS} as article_infos`, "articles.id", "article_infos.id");
      if (is_content === 1) {
        query = query.leftJoin(`${this.T_OLD_LOBS} as article_lobs`, "articles.id", "article_lobs.id");
      }

      if (state !== undefined && state !== "") {
        query = query.where("articles.state", state);
      }
      if (parent_pk !== undefined && parent_pk !== "") {
        query = query.where("articles.parent", parent_pk);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        if (sort.key === "thumb_count") {
          query = query.orderBy(db.raw("article_infos.gold_recom_num - article_infos.recommended_num"), "desc")
            .orderBy("articles.create_at", "asc");
        } else {
          query = query.orderBy(sort.key, sort.dir);
        }
      }

      if (is_client === 1) {
        query = query
          .select(db.raw("TO_CHAR(articles.modify_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
          .select(db.raw("TO_CHAR(articles.publish_at, 'YYYY-MM-DD HH24:MI:SS') publish_at"));
      } else {
        query = query.select("articles.summary","articles.create_at as created_at", "articles.modify_at as updated_at");
      }
      if (is_content === 1) {
        query = query.select("article_lobs.content", "article_lobs.approval_num");
      } else {
        query = query.select(db.raw("REGEXP_REPLACE(articles.summary, '<[^>]+>', '') summary"))
          .select("articles.title");
      }
      query = query
        .select("articles.id", "articles.user_userid", "articles.parent", "articles.state")
        .select("article_infos.gold_recom_num as thumb_gold", "article_infos.silber_recom_num as thumb_silver", "article_infos.recommended_num as thumb_bronze", "article_infos.visited_num as visit_count", "article_infos.reply_num as reply_count")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findWomensDayReplies(filter, isCount = false) {
    try {
      const { offset, limit, sort, state, parent_pk, is_client } = filter;

      let query = db(`${this.T_OLD_ARTICLES} as articles`)
        .leftJoin(`${this.T_OLD_INFOS} as article_infos`, "articles.id", "article_infos.id");

      if (state !== undefined && state !== "") {
        query = query.where("articles.state", state);
      }
      if (parent_pk !== undefined && parent_pk !== "") {
        query = query.where("articles.parent", parent_pk);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query = query.orderBy("rank", "asc")
        .orderBy("articles.create_at", "asc");

      if (is_client === 1) {
        query = query
          .select(db.raw("TO_CHAR(articles.modify_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
          .select(db.raw("TO_CHAR(articles.publish_at, 'YYYY-MM-DD HH24:MI:SS') publish_at"));
      }

      query = query
        .select("articles.id", "articles.user_userid", "articles.title", "articles.parent", "articles.state")
        .select(db.raw("REGEXP_REPLACE(articles.summary, '<[^>]+>', '') summary"))
        .select("article_infos.gold_recom_num as thumb_gold", "article_infos.silber_recom_num as thumb_silver", "article_infos.recommended_num as thumb_bronze", "article_infos.visited_num as visit_count", "article_infos.reply_num as reply_count")
        .select(db.raw("ROW_NUMBER() OVER (ORDER BY (article_infos.gold_recom_num - article_infos.recommended_num) DESC, articles.create_at ASC) as rank"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findOldArticleByFilter(filter) {
    const { blog_pk, state, is_client, is_content } = filter;
    try {
      let query = db(`${this.T_OLD_ARTICLES} as articles`)
        .leftJoin(`${this.T_OLD_INFOS} as article_infos`, "articles.id", "article_infos.id")
        .leftJoin(`${this.T_OLD_SUBJECTS} as subjects`, "articles.subject_id", "subjects.id")
        .leftJoin(`${this.T_CUSTOMERS} as customers`, "articles.user_userid", "customers.user_userid");
      if (is_content === 1) {
        query = query.leftJoin(`${this.T_OLD_LOBS} as article_lobs`, "articles.id", "article_lobs.id");
      }

      if (blog_pk !== undefined && blog_pk !== "") {
        query = query.where("articles.id", blog_pk);
      }
      if (state !== undefined && state !== "") {
        query = query.where("articles.state", state);
      }

      if (is_client === 1) {
        query = query.select(db.raw("TO_CHAR(articles.publish_at, 'YYYY-MM-DD HH24:MI:SS') publish_at"));
      } else {
        query = query.select("articles.publish_at");
      }
      if (is_content === 1) {
        query = query.select("article_lobs.content", "article_lobs.approval_num");
      }

      query = query
        .select("articles.id", "articles.user_userid", "articles.parent", "articles.title", "articles.state", "articles.origin")
        .select(db.raw("REGEXP_REPLACE(articles.summary, '<[^>]+>', '') summary"))
        .select("customers.user_name", db.raw("(EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM customers.user_birthday)) user_age"))
        .select("subjects.name as subject_name")
        .select("article_infos.gold_recom_num as thumb_gold", "article_infos.silber_recom_num as thumb_silver", "article_infos.recommended_num as thumb_bronze", "article_infos.visited_num as visit_count", "article_infos.reply_num as reply_count", "article_infos.is_new");
      query = query.first();

      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findOldArticleUserInfoByPk(blog_pk) {
    try {
      const query = db(`${this.T_OLD_ARTICLES} as articles`)
        // .leftJoin(`${this.T_CUSTOMERS} as customers`, "articles.user_userid", "customers.user_userid")
        // .leftJoin(`${this.T_MERGE_IDS} as merge_ids`, function() {
        //   this.on("articles.user_userid", "merge_ids.fixed_id")
        //     .andOn("merge_ids.fixed_status", FIXED_STATUS.APPROVED)
        // })
        .where("articles.id", blog_pk)
        // .select("merge_ids.pvendor_pk", "customers.user_pk as fixed_pk", "articles.user_userid", "articles.title")
        .select("articles.user_userid")
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findOldArticleByParentPk(parent_pk, user_id) {
    try {
      const query = db(`${this.T_OLD_ARTICLES} as articles`)
        .where("articles.parent", parent_pk)
        .where("articles.user_userid", user_id)
        .where("articles.state", ARTICLE_STATES.PUB_APPROVED);
        
      const totalCount = await query.count({ total: "*" }).first();
      return totalCount.total;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findOldPopularArticles(blog_config, count) {
    try {
      let query1 = db(`${this.T_OLD_VISIT_LOG} as visit_log`)
        .where(db.raw("TO_CHAR(visit_log.visit_date, 'YYYY-MM-DD')"), ">=", blog_config.event_start_date)
        .where(db.raw("TO_CHAR(visit_log.visit_date, 'YYYY-MM-DD')"), "<=", blog_config.event_end_date)
        .groupBy("visit_log.article_id")
        .select("visit_log.article_id", db.raw("COUNT(1) as visited_num"));
      query1 = query1.as("T1");

      let query2 = db(`${this.T_OLD_RECOMMENDS} as recommends`)
        .where(db.raw("TO_CHAR(recommends.reg_date, 'YYYY-MM-DD')"), ">=", blog_config.event_start_date)
        .where(db.raw("TO_CHAR(recommends.reg_date, 'YYYY-MM-DD')"), "<=", blog_config.event_end_date)
        .groupBy("recommends.article_id")
        .select("recommends.article_id", db.raw("COUNT(1) as recommend_num"));
      query2 = query2.as("T2");

      let query3 = db(`${this.T_OLD_ARTICLES} as articles`)
        .leftJoin(`${this.T_OLD_INFOS} as article_infos`, "articles.id", "article_infos.id")
        .where("article_infos.is_help_request", FLAG_NONE)
        .where("article_infos.help_status", OLD_BLOG_HELP_STATUS.CORRECT_CHECK)
        .groupBy("articles.id")
        .select("articles.id", db.raw("COUNT(1) as correct_num"));
      query3 = query3.as("T3");

      let query = db(`${this.T_OLD_ARTICLES} as articles`)
        .leftJoin(query1, "articles.id", "T1.article_id")
        .leftJoin(query2, "articles.id", "T2.article_id")
        .leftJoin(query3, "articles.id", "T3.id")
        .leftJoin(`${this.T_OLD_SUBJECTS} as subjects`, "articles.subject_id", "subjects.id")
        .leftJoin(`${this.T_OLD_INFOS} as article_infos`, "articles.id", "article_infos.id")
        .where("articles.parent", 0)
        .where("articles.state", ARTICLE_STATES.PUB_APPROVED)
        .where(db.raw("TO_CHAR(articles.publish_at, 'YYYY-MM-DD')"), ">=", blog_config.event_start_date)
        .where(db.raw("TO_CHAR(articles.publish_at, 'YYYY-MM-DD')"), "<=", blog_config.event_end_date)
        .whereNot("articles.user_userid", OLD_BLOG_MANAGER_ID)
        .select("articles.id", "articles.user_userid", "articles.subject_id", "articles.title")
        .select(db.raw("REGEXP_REPLACE(articles.summary, '<[^>]+>', '') summary"))
        .select(db.raw("TO_CHAR(articles.publish_at, 'YYYY-MM-DD HH24:MI:SS') publish_at"))
        .select("T1.visited_num")
        .select("T2.recommend_num")
        .select("T3.correct_num")
        .select(db.raw("(T1.visited_num || 0) / 10 * ? + (T2.recommend_num || 0) / 10 * ? + (T3.correct_num || 0) / 10 * ? as rank", [blog_config.blog_views_rate, blog_config.blog_recommend_rate, blog_config.blog_correct_reply_rate]))
        .select("subjects.name as subject_name")
        .select("article_infos.gold_recom_num as thumb_gold", "article_infos.silber_recom_num as thumb_silver", "article_infos.recommended_num as thumb_bronze", "article_infos.visited_num as visit_count", "article_infos.reply_num as reply_count")
        .orderBy("rank", "desc")
        .orderBy("articles.modify_at", "desc")
        .limit(count);

      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findOldRatingCountByFilter(filter) {
    try {
      let query = db(`${this.T_OLD_RECOMMENDS} as recommends`)
        .where(filter);

      const totalCount = await query.count({ total: "*" }).first();
      return totalCount.total;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findOldRatingsByPremiumWomens(filter) {
    const { main_article_pk, user_id, start_date, end_date } = filter;
    try {
      let query = db(`${this.T_OLD_RECOMMENDS} as recommends`)
        .leftJoin(`${this.T_OLD_ARTICLES} as articles`, "recommends.article_id", "articles.id")
        .where("articles.parent", main_article_pk)
        .where("recommends.recommend_user_userid", user_id)
        .where(db.raw("TO_CHAR(recommends.reg_date, 'YYYY-MM-DD')"), ">=", start_date)
        .where(db.raw("TO_CHAR(recommends.reg_date, 'YYYY-MM-DD')"), "<=", end_date)
        .select("recommends.id", "recommends.article_id")
        .select("articles.user_userid as poster_id", "articles.summary");

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async addOldBlogRating(params) {
    try {
      const now = new Date();
      const query = db(this.T_OLD_RECOMMENDS)
        .insert({
          ...params,
          id: db.raw(`${this.T_OLD_RECOMMENDS}_S.nextval`),
          reg_date: now,
        })
        .returning("*");

      const result = await query;
      
      if (!result || result.length === 0) {
        throw new Error("Fail to add a new row");
      }
  
      return result[0];
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async increaseOldBlogInfo(blog_pk, field) {
    try {
      let query = db(this.T_OLD_INFOS)
        .where("id", blog_pk)
        .increment(field, 1)

      return await query;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findOldVisitCountByFilter(filter) {
    try {
      let query = db(`${this.T_OLD_VISIT_LOG} as visit_log`)
        .where(filter);

      const today = moment().format("YYYY-MM-DD");
      query = query.where(db.raw("TO_CHAR(visit_log.visit_date, 'YYYY-MM-DD')"), "=", today);

      const totalCount = await query.count({ total: "*" }).first();
      return totalCount.total;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async addOldVisitLog(params) {
    try {
      const now = new Date();
      const query = db(this.T_OLD_VISIT_LOG)
        .insert({
          ...params,
          id: db.raw(`${this.T_OLD_VISIT_LOG}_S.nextval`),
          visit_date: now,
        })
        .returning("*");

      const result = await query;
      
      if (!result || result.length === 0) {
        throw new Error("Fail to add a new row");
      }
  
      return result[0];
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async findOldArticleInfoByUserId(user_id) {
    try {
      let query1 = db(`${this.T_OLD_ARTICLES} as articles`)
        .where("articles.parent", 0)
        .where("articles.user_userid", user_id)
        .groupBy("articles.user_userid")
        .select("articles.user_userid", db.raw("COUNT(1) main_cnt"));
      query1 = query1.as("T1");

      let query2 = db(`${this.T_OLD_ARTICLES} as articles`)
      .whereNot("articles.parent", 0)
      .where("articles.user_userid", user_id)
      .groupBy("articles.user_userid")
      .select("articles.user_userid", db.raw("COUNT(1) reply_cnt"));
      query2 = query2.as("T2");

      let query3 = db(`${this.T_OLD_ARTICLES} as articles`)
        .leftJoin(`${this.T_OLD_INFOS} as article_infos`, "articles.id", "article_infos.id")
        .where("articles.user_userid", user_id)
        .groupBy("articles.user_userid")
        .select("articles.user_userid")
        .select(db.raw("SUM(article_infos.recommended_num || 0) / 10 thumb_bronze"))
        .select(db.raw("SUM(article_infos.gold_recom_num || 0) / 10 thumb_gold"))
        .select(db.raw("SUM(article_infos.silber_recom_num || 0) / 10 thumb_silver"));
      query3 = query3.as("T3");

      let query = db(query1)
        .leftJoin(query2, "T1.user_userid", "T2.user_userid")
        .leftJoin(query3, "T1.user_userid", "T3.user_userid")
        .select("T1.user_userid", "T1.main_cnt")
        .select("T2.reply_cnt")
        .select("T3.thumb_gold", "T3.thumb_silver", "T3.thumb_bronze");

      return await query.first();
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findOldBlogConfigs() {
    try {
      const query = db(this.T_OLD_CONFIG)
        .select("key", "val", "type", "note");
      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findOldBlogLobByPk(pk) {
    try {
      const query = db(this.T_OLD_LOBS)
        .where("id", pk)
        .select("id", "content", "approval_num")
        .select(db.raw("TO_CHAR(modify_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findAllBlogs(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword } = filter;

      let query = db(`${this.T_BLOGS} as blogs`)
        .leftJoin(`blogs as parent`, "blogs.parent_pk", "parent.blog_pk")
        .leftJoin(`${this.T_CATEGORIES} as category`, "blogs.category_id", "category.category_id")
        .leftJoin(`${this.T_USERS} as users`, "blogs.user_pk", "users.user_pk");

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(db.raw("LOWER(blogs.title)"), "like", `%${lowerKeyword}%`)
          .orWhere(db.raw("LOWER(blogs.cleaned_content)"), "like", `%${lowerKeyword}%`)
          .orWhere(db.raw("LOWER(parent.title)"), "like", `%${lowerKeyword}%`)
          .orWhere(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
          .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(`blogs.${sort.key}`, sort.dir);
      }

      query = query
        .select("blogs.blog_pk", "blogs.title", "blogs.content", "blogs.cleaned_content", "blogs.image_url", "blogs.status", "blogs.category_id", "blogs.post_type", "blogs.series_group_id", "blogs.parent_pk", "blogs.user_pk")
        .select("category.name as category_name")
        .select("parent.title as parent_title")
        .select("users.user_id", "users.user_name")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findBlogByPk(blog_pk) {
    try {
      const query = db(this.T_BLOGS).where({ blog_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addBlog(params) {
    try {
      const now = new Date();
      const query = db(this.T_BLOGS)
        .insert({
          ...params,
          created_at: now,
          updated_at: now,
        })
        .returning("*");

      const result = await query;
      
      if (!result || result.length === 0) {
        throw new Error("Fail to add a new row");
      }
  
      return result[0];
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async editBlog(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_BLOGS)
        .where({ blog_pk: params.blog_pk })
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async deleteBlogByPk(blog_pk) {
    try {
      const rowCount = await db(this.T_BLOGS)
        .where({ blog_pk })
        .del();
      
      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }

  static async findHonormans() {
    try {
      const query = db.raw("Select temp.*, ROWNUM FROM (SELECT u.USER_USERID,u.user_sex,t1.MAIN_COUNT,t2.reply_count,t3.recommend_count,((t1.MAIN_COUNT || 0) / 10 * ( SELECT VAL FROM ORA_BLOG.BLOG_CONFIG WHERE KEY = 'HONORMAN_MAIN_BLOG_RATE' ) + (t2.reply_count || 0) / 10 * ( SELECT VAL FROM ORA_BLOG.BLOG_CONFIG WHERE KEY = 'HONORMAN_REPLY_BLOG_RATE' ) + (t3.recommend_count || 0) / 10 * ( SELECT VAL FROM ORA_BLOG.BLOG_CONFIG WHERE KEY = 'HONORMAN_RECOMMEND_RATE' ) ) rank  FROM ora_old_db.CUSTOMERS u LEFT JOIN ( SELECT USER_USERID, count( 1 ) main_count FROM ORA_BLOG.BLOG_ARTICLE  WHERE STATE = 4 AND PARENT = 0 AND TO_CHAR( modify_at, 'YYYY-MM-DD' ) >= ( SELECT VAL FROM ORA_BLOG.BLOG_CONFIG WHERE KEY = 'EVENT_START_DATE' ) AND TO_CHAR( modify_at, 'YYYY-MM-DD' ) <= ( SELECT VAL FROM ORA_BLOG.BLOG_CONFIG WHERE KEY = 'EVENT_END_DATE' ) GROUP BY USER_USERID ORDER BY main_count DESC ) t1 ON t1.USER_USERID = u.USER_USERID LEFT JOIN ( SELECT USER_USERID, count( 1 ) reply_count FROM ORA_BLOG.BLOG_ARTICLE BA LEFT JOIN ORA_BLOG.BLOG_ARTICLE_INFO BI ON BA.ID = BI.ID WHERE BA.STATE = 4 AND PARENT != 0 AND TO_CHAR( BA.modify_at, 'YYYY-MM-DD' ) >= ( SELECT VAL FROM ORA_BLOG.BLOG_CONFIG WHERE KEY = 'EVENT_START_DATE' ) AND TO_CHAR( BA.modify_at, 'YYYY-MM-DD' ) <= ( SELECT VAL FROM ORA_BLOG.BLOG_CONFIG WHERE KEY = 'EVENT_END_DATE' ) AND BI.IS_HELP_REQUEST = 0 GROUP BY USER_USERID ORDER BY reply_count DESC ) t2 ON t2.USER_USERID = u.USER_USERID LEFT JOIN ( SELECT RECOMMEND_USER_USERID USER_USERID, count( 1 ) recommend_count FROM ORA_BLOG.BLOG_ARTICLE_RECOMMEND WHERE TO_CHAR( REG_DATE, 'YYYY-MM-DD' ) >= ( SELECT VAL FROM ORA_BLOG.BLOG_CONFIG WHERE KEY = 'EVENT_START_DATE' ) AND TO_CHAR( REG_DATE, 'YYYY-MM-DD' ) <= ( SELECT VAL FROM ORA_BLOG.BLOG_CONFIG WHERE KEY = 'EVENT_END_DATE' ) GROUP BY RECOMMEND_USER_USERID ORDER BY recommend_count DESC ) t3 ON t3.USER_USERID = u.USER_USERID  WHERE u.USER_USERID != 'jc225' ORDER BY rank DESC) temp WHERE ROWNUM <= 5") 
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findTodayArticleByUserId (user_id) {
    let query1 = db(this.T_OLD_ARTICLES);
    query1 = query1.where("parent", 0)
    .where("user_userid", user_id)
    .where(db.raw("TO_CHAR(create_at, 'YYYY-MM-DD')"), db.raw("TO_CHAR(CURRENT_TIMESTAMP, 'YYYY-MM-DD')"));
    query1 = query1.select(db.raw("COUNT(1) as main_cnt"), db.raw("0 as reply_cnt"));
    query1 = query1.as("T1");

    let query2 = db(this.T_OLD_ARTICLES);
    query2 = query2.where("parent", "!=" ,0)
    .where("user_userid", user_id)
    .where(db.raw("TO_CHAR(create_at, 'YYYY-MM-DD')"), db.raw("TO_CHAR(CURRENT_TIMESTAMP, 'YYYY-MM-DD')"));
    query2 = query2.select(db.raw("0 as main_cnt"), db.raw("COUNT(1) as reply_cnt"));
    query2 = query2.as("T2");

    let query3 = db(query1).union(db(query2));
    let query4 = db(query3).select(db.raw("SUM(main_cnt) as main_cnt"), db.raw("SUM(reply_cnt) as reply_cnt"));

    return await query4;
  }

  static async addOldBlog(params) {
    try {
      const now = new Date();
      const query = db(this.T_OLD_ARTICLES)
        .insert({
          ...params,
          create_at: now,
          modify_at: now,
        })
        .returning("*");

      const result = await query;
      
      if (!result || result.length === 0) {
        throw new Error("Fail to add a new row");
      }
  
      return result[0];
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async addOldBlogLob(params) {
    try {
      const now = new Date();
      const query = db(this.T_OLD_LOBS)
        .insert({
          ...params,
          create_at: now,
          modify_at: now,
        })
        .returning("*");

      const result = await query;
      
      if (!result || result.length === 0) {
        throw new Error("Fail to add a new row");
      }
  
      return result[0];
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }    
  }
  static async addOldBlogInfo(params) {
    try {
      const query = db(this.T_OLD_INFOS)
        .insert(params)
        .returning("*");

      const result = await query;
      
      if (!result || result.length === 0) {
        throw new Error("Fail to add a new row");
      }
  
      return result[0];
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }    
  }

  static async editOldBlog(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_OLD_ARTICLES)
        .where({ id: params.id })
        .update({
          ...params,
          modify_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async editOldBlogLob(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_OLD_LOBS)
        .where({ id: params.id })
        .update({
          ...params,
          modify_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async deleteBlog(blog_pk) {
    try {
      const count = await db(this.T_OLD_ARTICLES)
        .where("id", blog_pk)
        .del();
      return count;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }
}

module.exports = BlogModel;
