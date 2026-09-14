const db = require('../db/knex');
const { POINT_TYPE_PREFIXES, POINT_TYPE_VALUES, ACTIVITY_POINT_PREDEFINED_RELATED_PKS, OLD_RESERVE_TYPES, FLAG_USER, SOFT_POINT_PREDEFINED_RELATED_PKS, OLD_PRIZE_FILL_TYPES, REG_POINT_TYPES, REG_POINT_STATUS, SOFT_POINT_TYPES, SOFT_POINT_STATUS, FLAG_ACTIVE, FLAG_NONE } = require('../constants/constants');

class PointModel {
  static T_ACTIVITY_TYPES = "ora_pid.activity_point_types";
  static T_ACTIVITY_LOG = "ora_pid.activity_point_log";
  static T_ACTIVITY_STATS = "ora_pid.activity_point_stats";
  static T_SOFT_LOG = "ora_pid.soft_point_log";
  static T_SOFT_STATS = "ora_pid.soft_point_stats";
  static T_APPSTORE_LOG = "ora_pid.appstore_point_log";
  static T_APPSTORE_STATS = "ora_pid.appstore_point_stats";
  static T_KARAOKE_LOG = "ora_pid.karaoke_point_log";
  static T_KARAOKE_STATS = "ora_pid.karaoke_point_stats";
  static T_BMEDIALOG = "ora_pid.bmedia_point_log";
  static T_BMEDIASTATS = "ora_pid.bmedia_point_stats";
  static T_ACTIVITY_LIMITS = "ora_pid.activity_limits";
  static T_REG_POINT_TYPES = "ora_pid.register_point_types";
  static T_REG_POINT_LOG = "ora_pid.register_point_log";
  static T_PRODUCTS = "ora_pid.products";
  static T_PROD_MODELS = "ora_pid.product_models";
  static T_USERS = "ora_pid.users";
  static T_CUSTOMERS = "ora_old_db.customers";
  static T_PRIZE_LOG = "ora_old_db.customer_prize_log";
  static T_OLD_RESERVE_LOG = "ora_phone.reserve_log";
  static T_OLD_REG_MINUS_LOG = "ora_pid.regist_bonus_score_minus";
  static T_MEDIA_LICENSES = "ora_media.tbl_licenses";
  static T_KARA_LICENSES = "ora_license.tbl_licgen";
  static T_OLD_ARTICLES = "ora_blog.blog_article";
  static T_OLD_RECOMMENDS = "ora_blog.blog_article_recommend";
  static T_MERGE_IDS = "ora_pid.user_merge_ids";
  static T_APPSTORE_STOCKS = "ora_pid.appstore_point_stocks";
  static T_TMP_BMEDIAPOINTS = "ora_pid.bmedia_temp_points";

  static async findActivityPointTypes(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword } = filter;

      let query = db(`${this.T_ACTIVITY_TYPES} as point_type`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function () {
          this.where(db.raw("LOWER(point_type.main_type)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(point_type.sub_type)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(point_type.note)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      query = query.select("point_type.type_pk", "point_type.main_type", "point_type.sub_type", "point_type.note", "point_type.points")
        .select(db.raw("TO_CHAR(point_type.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching manager: " + err.message);
    }
  }

  static async findActivityPointTypeByPk(type_pk) {
    try {
      const query = db(this.T_ACTIVITY_TYPES)
        .where("type_pk", type_pk)
        .select("type_pk", "main_type", "sub_type", "points");
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addActivityPointType(params, admin_pk) {
    try {
      const now = new Date();
      const result = await db(this.T_ACTIVITY_TYPES)
        .insert({
          ...params,
          created_at: now,
          created_by: admin_pk,
          updated_at: now,
          updated_by: admin_pk,
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

  static async editActivityPointType(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_ACTIVITY_TYPES)
        .where("type_pk", params.type_pk)
        .update({
          ...params,
          updated_at: now,
          updated_by: admin_pk,
        });

      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findActivityPointLog(filter, isCount = false) {
    try {
      const { offset, limit, sort, user_pk, from, to, point_type_prefix, keyword, is_client } = filter;

      let query = db(`${this.T_ACTIVITY_LOG} as point_log`)
        .leftJoin(`${this.T_ACTIVITY_TYPES} as point_type`, "point_log.type_pk", "point_type.type_pk");
      if (!isCount) {
        query = query.leftJoin(`${this.T_OLD_RECOMMENDS} as recommends`, function() { // recommend on mobile
          this.onIn("point_log.type_pk", [POINT_TYPE_VALUES.BLOG_RECOM_GOLD, POINT_TYPE_VALUES.BLOG_RECOM_SILVER, POINT_TYPE_VALUES.BLOG_RECOM_BRONZE])
            .andOnNull("point_log.ip_address")
            .andOn("point_log.related_pk", "recommends.id");
        })
        .leftJoin(`${this.T_OLD_ARTICLES} as articles`, function() {
          this.on(function() { // post article, manager minus for blog
            this.onIn("point_log.type_pk", [POINT_TYPE_VALUES.BLOG_POST_ARTICLE_DISCUSS, POINT_TYPE_VALUES.BLOG_POST_ARTICLE_PRHN, POINT_TYPE_VALUES.BLOG_POST_ARTICLE_INFO, POINT_TYPE_VALUES.BLOG_POST_ARTICLE_SCIENCE, POINT_TYPE_VALUES.BLOG_POST_ARTICLE_ECONOMY, POINT_TYPE_VALUES.BLOG_REPLY_ARTICLE, POINT_TYPE_VALUES.BLOG_CORRECT_ARTICLE, POINT_TYPE_VALUES.BLOG_POST_BBS_HUMOR, POINT_TYPE_VALUES.BLOG_POST_BBS_TECH, POINT_TYPE_VALUES.BLOG_COPY_ARTICLE_PUBLISHED, POINT_TYPE_VALUES.BLOG_COPY_ARTICLE_PENDING, POINT_TYPE_VALUES.BLOG_COPY_BBS_PUBLISHED, POINT_TYPE_VALUES.BLOG_COPY_BBS_PENDING])
              .andOn("point_log.related_pk", "articles.id");
          })
          .orOn(function() { // recommend on web
            this.onIn("point_log.type_pk", [POINT_TYPE_VALUES.BLOG_RECOM_GOLD, POINT_TYPE_VALUES.BLOG_RECOM_SILVER, POINT_TYPE_VALUES.BLOG_RECOM_BRONZE])
              .andOnNotNull("point_log.ip_address")
              .andOn("point_log.related_pk", "articles.id")
          })
          .orOn(function() { // join with article for recommend on mobile
            this.onIn("point_log.type_pk", [POINT_TYPE_VALUES.BLOG_RECOM_GOLD, POINT_TYPE_VALUES.BLOG_RECOM_SILVER, POINT_TYPE_VALUES.BLOG_RECOM_BRONZE])
              .andOn("recommends.article_id", "articles.id");
          })
        });
      }

      if (is_client !== 1) {
        query = query.leftJoin(`${this.T_USERS} as users`, "point_log.user_pk", "users.user_pk");
      }

      if (user_pk) {
        query = query.where("point_log.user_pk", user_pk);
      }
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function () {
          this.where(db.raw("LOWER(point_log.reason)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(point_log.ip_address)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(point_type.main_type)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(point_type.sub_type)"), "like", `%${lowerKeyword}%`);
          if (is_client !== 1) {
            this.orWhere(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`);
          }
        });
      }
      if (point_type_prefix) {
        if (point_type_prefix === POINT_TYPE_PREFIXES.OTHER) {
          query = query.where(function() {
            this.where("point_log.type_pk", "like", `${POINT_TYPE_PREFIXES.DUTY_DAILY}%`)
              .orWhere("point_log.type_pk", "like", `${POINT_TYPE_PREFIXES.DUTY_PERIOD}%`)
              .orWhere("point_log.type_pk", "like", `${POINT_TYPE_PREFIXES.MANAGER}%`);
          });
        } else {
          query = query.where("point_log.type_pk", "like", `${point_type_prefix}%`);
        }
      }
      if (from && to) {
        query = query.where(db.raw("TO_CHAR(point_log.action_at, 'YYYY-MM-DD')"), ">=", from)
          .where(db.raw("TO_CHAR(point_log.action_at, 'YYYY-MM-DD')"), "<=", to);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      if (is_client !== 1) {
        query = query.select("point_log.user_pk", "point_log.ip_address", "point_log.related_pk")
          .select("users.user_id", "users.user_name");
      }

      query = query.select("point_log.table_pk", "point_log.type_pk", "point_log.points")
        .select(db.raw("NVL(point_log.reason, CONCAT(CONCAT(point_type.main_type, ' '), point_type.sub_type)) reason"))
        .select(db.raw("TO_CHAR(point_log.action_at, 'YYYY-MM-DD HH24:MI:SS') action_at"))
        .select("articles.title as article_title")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findActivityPointLogByFilter(filter) {
    try {
      let query = db(`${this.T_ACTIVITY_LOG}`)
        .where(filter);

      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findMobileDailyPointLogsLargeThanActionAt(user_pk, action_date) {
    try {
      let query = db(`${this.T_ACTIVITY_LOG}`)
        .where("user_pk", user_pk)
        .where("type_pk", "like", `${POINT_TYPE_VALUES.MOBILE_DAILY_LOGIN_PREFIX}%`)
        .where(db.raw("TO_CHAR(action_at, 'YYYY-MM-DD')"), '>=', action_date)
        .orderBy("action_at", "asc");
      query = query.select("table_pk", "type_pk", "points", "related_pk")
        .select(db.raw("TO_CHAR(action_at, 'YYYY-MM-DD HH24:MI:SS') action_at"));

      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findActivityPointLogsByReserveInfo(prefix_pk) {
    try {
      let query = db(`${this.T_ACTIVITY_LOG} as point_log`)
        .leftJoin(`${this.T_USERS} as users`, "point_log.user_pk", "users.user_pk")
        .where("point_log.type_pk", POINT_TYPE_VALUES.MANAGER_BOOK_MINUS)
        .where("point_log.related_pk", prefix_pk);
      query = query.select("point_log.user_pk")
        .select("users.user_id");

      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findLastFixedLoginLog(pvendor_pk) {
    try {
      let query = db(`${this.T_ACTIVITY_LOG}`)
        .where("user_pk", pvendor_pk)
        .where(function() {
          this.where("type_pk", "like", `${POINT_TYPE_VALUES.FIXED_DAILY_LOGIN_PREFIX}%`)
            .orWhere(function() {
              this.where("type_pk", POINT_TYPE_VALUES.FIXED_MERGE_ID)
                .where("related_pk", ACTIVITY_POINT_PREDEFINED_RELATED_PKS.FIXED);
            });
        })
      query = query.orderBy("action_at", "desc");
      query = query.select("type_pk", "everyday_cnt", db.raw("TO_CHAR(action_at, 'YYYY-MM-DD') action_at"));

      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addActivityPointLog(params) {
    try {
      const now = new Date();
      let newParams = params;
      if (!params.action_at) {
        newParams = { ...params, action_at: now };
      }
      const result = await db(this.T_ACTIVITY_LOG)
        .insert(newParams)
        .returning("*");

      if (!result || result.length === 0) {
        throw new Error("Fail to add a new row");
      }

      return result[0];
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async editActivityPointLog(params) {
    try {
      const rowCount = await db(this.T_ACTIVITY_LOG)
        .where("table_pk", params.table_pk)
        .update({
          ...params,
        })
        .returning("*");

      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findActivityPointStats(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, is_limit_rank, target_rank, top_count, surroundings, user_rank, is_client } = filter;

      let query1 = db(`${this.T_ACTIVITY_STATS} as point_stats`)
        .select("point_stats.table_pk", "point_stats.user_pk", "point_stats.total_points", "point_stats.limit_points")
        .select(db.raw("TO_CHAR(point_stats.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      if (is_limit_rank === 1) {
        query1 = query1.select(db.raw("ROW_NUMBER() OVER (ORDER BY NVL(point_stats.limit_points, 0) DESC) AS rank"))
      } else {
        query1 = query1.select(db.raw("ROW_NUMBER() OVER (ORDER BY NVL(point_stats.total_points, 0) DESC) AS rank"))
      }
      query1 = query1.as("T1");

      let query2 = db(query1)
        .leftJoin(`${this.T_USERS} as users`, "T1.user_pk", "users.user_pk")
        .where("users.status", FLAG_ACTIVE);

      if (is_client === 1) {
        query2 = query2.where(function() {
          this.where("T1.rank", "<=", top_count);
          if (target_rank) {
            const target_min = target_rank - surroundings;
            const target_max = target_rank + surroundings;
            this.orWhere(function() {
              this.where("T1.rank", ">=", target_min)
                .where("T1.rank", "<=", target_max);
            });
          }
          if (user_rank !== -1) {
            const user_min = user_rank - surroundings;
            const user_max = user_rank + surroundings;
            this.orWhere(function () {
              this.where("T1.rank", ">=", user_min)
                .where("T1.rank", "<=", user_max);
            });
          }
        });
      } else if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query2 = query2.where(function () {
          this.where(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere("users.user_pk", "like", `${lowerKeyword}`);
        });
      }

      if (isCount) {
        const countQuery = query2.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query2 = query2.orderBy("T1.rank", "asc")
        .orderBy("T1.updated_at", "asc");

      if (is_client === 1) {
        query2 = query2.select("users.user_id");
        if (is_limit_rank === 1) {
          query2 = query2.select("T1.limit_points as points");
        } else {
          query2 = query2.select("T1.total_points as points");
        }
      } else {
        query2 = query2.select("T1.total_points", "T1.limit_points", "T1.updated_at")
          .select("users.user_id", "users.user_name");
      }

      query2 = query2.select("T1.table_pk", "T1.user_pk", "T1.rank")
        .offset(offset);

      if (limit) {
        query2 = query2.limit(limit);
      }

      return await query2;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findActivityPointStatsByUserPk(user_pk) {
    try {
      const query = db(this.T_ACTIVITY_STATS)
        .where("user_pk", user_pk);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findActivityPointRankByUserPk(user_pk, is_limit_rank) {
    try {
      let query1 = db(`${this.T_ACTIVITY_STATS} as point_stats`)
        .select("point_stats.user_pk", "point_stats.total_points", "point_stats.limit_points");
      if (is_limit_rank === 1) {
        query1 = query1.select(db.raw("ROW_NUMBER() OVER (ORDER BY limit_points DESC) AS rank"))
      } else {
        query1 = query1.select(db.raw("ROW_NUMBER() OVER (ORDER BY total_points DESC) AS rank"))
      }
      query1 = query1.as("T1");

      let query2 = db(query1)
        .where("user_pk", user_pk);
      return await query2.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async sumActivityPointStatsByUserPk(limit_time, user_pk) {
    try {
      let query = db(`${this.T_ACTIVITY_LOG} as point_log`)
        .where("point_log.user_pk", user_pk);
      if (limit_time) {
        query = query.where(db.raw("TO_CHAR(point_log.action_at, 'YYYY-MM-DD')"), "<=", limit_time);
      }
      query = query.select(db.raw("SUM(points) as calc_points"));
      const row = await query.first();
      return row.calc_points;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async sumActivityPointBookMinusStatsByUserPk(user_pk) {
    try {
      let query = db(`${this.T_ACTIVITY_LOG} as point_log`)
        .where("point_log.user_pk", user_pk)
        .where("point_log.type_pk", POINT_TYPE_VALUES.MANAGER_BOOK_MINUS);
      query = query.select(db.raw("NVL(SUM(points), 0) as calc_points"));
      const row = await query.first();
      return row.calc_points;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async addActivityPointStats(params) {
    try {
      const now = new Date();
      const result = await db(this.T_ACTIVITY_STATS)
        .insert({
          ...params,
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

  static async editActivityPointStats(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_ACTIVITY_STATS)
        .where("table_pk", params.table_pk)
        .update({
          ...params,
          updated_at: now,
        })
        .returning("*");

      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async increaseActivityPointStats(user_pk, points, include_limit, include_minus) {
    try {
      const now = new Date();
      let query = db(`${this.T_ACTIVITY_STATS} as point_stats`)
        .where("user_pk", user_pk)
        .increment("total_points", points)
        .update("updated_at", now);
      if (include_limit) {
        query = query.increment("limit_points", points);
      }
      if (include_minus) {
        query = query.increment("minus_points", points);
      }
      return await query;
    } catch (err) {
      throw new Error("Error increase row: " + err.message); 
    }
  }

  static async recalcActivityPointStats(limit_time, offset, limit) {
    try {
      let query1 = db(`${this.T_ACTIVITY_LOG} as point_log`);
      if (limit_time) {
        query1 = query1.where(db.raw("TO_CHAR(point_log.action_at, 'YYYY-MM-DD')"), "<=", limit_time);
      }
      query1 = query1.groupBy("point_log.user_pk")
        .orderBy("point_log.user_pk");

      query1 = query1.sum({ calc_points: "points"})
        .select("point_log.user_pk");

      if (offset) {
        query1 = query1.offset(offset);
      }
      if (limit) {
        query1 = query1.limit(limit);
      }

      const rows = await query1;
      if (!rows || rows.length === 0) {
        return 0;
      }

      const point_field = limit_time ? "limit_points" : "total_points";
      for (const row of rows) {
        const query2 = db(`${this.T_ACTIVITY_STATS}`)
          .where("user_pk", row.user_pk)
          .update(point_field, row.calc_points);
        await query2;
      }

      return rows.length;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async recalcActivityMinusStats(offset, limit) {
    try {
      let query1 = db(`${this.T_ACTIVITY_LOG} as point_log`)
        .where("point_log.type_pk", POINT_TYPE_VALUES.MANAGER_BOOK_MINUS)
        .groupBy("point_log.user_pk")
        .orderBy("point_log.user_pk");

      query1 = query1.sum({ calc_points: "points"})
        .select("point_log.user_pk");

      if (offset) {
        query1 = query1.offset(offset);
      }
      if (limit) {
        query1 = query1.limit(limit);
      }

      const rows = await query1;
      if (!rows || rows.length === 0) {
        return 0;
      }

      for (const row of rows) {
        const query2 = db(`${this.T_ACTIVITY_STATS}`)
          .where("user_pk", row.user_pk)
          .update("minus_points", row.calc_points);
        await query2;
      }

      return rows.length;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findActivityLimits(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword } = filter;

      let query = db(`${this.T_ACTIVITY_LIMITS} as activity_limits`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function () {
          this.where(db.raw("LOWER(activity_limits.description)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      query = query.select("activity_limits.table_pk", "activity_limits.activity_source", "activity_limits.description", "activity_limits.status", "activity_limits.target_rank", "activity_limits.top_count", "activity_limits.surroundings")
        .select(db.raw("TO_CHAR(activity_limits.limit_time, 'YYYY-MM-DD HH24:MI:SS') limit_time"), db.raw("TO_CHAR(activity_limits.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching manager: " + err.message);
    }
  }

  static async findActivityLimitByPk(table_pk) {
    try {
      const query = db(this.T_ACTIVITY_LIMITS)
        .where("table_pk", table_pk);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findActivityLimitBySource(activity_source) {
    try {
      const query = db(this.T_ACTIVITY_LIMITS)
        .where("activity_source", activity_source)
        .select("description", "status", "target_rank", "top_count", "surroundings")
        .select(db.raw("TO_CHAR(limit_time, 'YYYY-MM-DD') limit_time"));
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addActivityLimit(params) {
    try {
      const now = new Date();
      const result = await db(this.T_ACTIVITY_LIMITS)
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

  static async editActivityLimit(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_ACTIVITY_LIMITS)
        .where("table_pk", params.table_pk)
        .update({
          ...params,
          updated_at: now,
        });

      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findAppstorePointLog(filter, isCount = false) {
    try {
      const { offset, limit, sort, user_pk, from, to, status, is_agency, keyword, is_client } = filter;

      let query = db(`${this.T_APPSTORE_LOG} as appstore_log`);

      if (is_client !== 1) {
        query = query.leftJoin(`${this.T_USERS} as users`, "appstore_log.user_pk", "users.user_pk")
          .leftJoin(`${this.T_MERGE_IDS} as merge_ids`, "appstore_log.user_pk", "merge_ids.pvendor_pk");
      }

      if (user_pk) {
        query = query.where("appstore_log.user_pk", user_pk);
      }
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function () {
          this.where(db.raw("LOWER(appstore_log.reason)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(appstore_log.equ_num)"), "like", `%${lowerKeyword}%`);
          if (is_client !== 1) {
            this.orWhere(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
              .orWhere("users.user_pk", "like", `${lowerKeyword}`)
              .orWhere(db.raw("LOWER(merge_ids.appstore_id)"), "like", `%${lowerKeyword}%`);
          }
        });
      }
      if (status !== undefined && status !== -1) {
        query = query.where("appstore_log.status", status);
      }
      if (is_agency !== undefined && is_agency !== -1) {
        query = query.where("appstore_log.is_agency", is_agency);
      }
      if (is_client === 1) {
        query = query.where("appstore_log.is_agency", FLAG_USER);
      }
      if (from && to) {
        query = query.where(db.raw("TO_CHAR(appstore_log.action_at, 'YYYY-MM-DD')"), ">=", from)
          .where(db.raw("TO_CHAR(appstore_log.action_at, 'YYYY-MM-DD')"), "<=", to);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      if (is_client !== 1) {
        query = query.select("appstore_log.user_pk")
          .select("users.user_id", "users.user_name")
          .select("merge_ids.appstore_id");
      }

      query = query.select("appstore_log.table_pk", "appstore_log.status", "appstore_log.reason", "appstore_log.equ_num", "appstore_log.pay_points", "appstore_log.soft_points", "appstore_log.related_pk", "appstore_log.is_agency")
        .select(db.raw("TO_CHAR(appstore_log.action_at, 'YYYY-MM-DD HH24:MI:SS') action_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findAppstorePointLogByFilter(filter) {
    try {
      const query = db(this.T_APPSTORE_LOG)
        .where(filter);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findTotalAppstorePointByFilter(filter) {
    try {
      const query = db(this.T_APPSTORE_LOG)
        .where(filter)
        .sum({ sum_points: "soft_points"});
      const row = await query.first();
      if (row && row.sum_points) {
        return +(row.sum_points.toFixed(2));
      }
      return 0;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addAppstorePointLog(params) {
    try {
      const now = new Date();
      let newParams = params;
      if (!params.action_at) {
        newParams = { ...params, action_at: now };
      }
      const result = await db(this.T_APPSTORE_LOG)
        .insert(newParams)
        .returning("*");

      if (!result || result.length === 0) {
        throw new Error("Fail to add a new row");
      }

      return result[0];
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async deleteAppstorePointLog(filter) {
    try {
      const count = await db(this.T_APPSTORE_LOG)
        .where(filter)
        .del();
      return count;
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async deleteAppstorePointPrevLog(user_pk, last_time) {
    try {
      let query = db(this.T_APPSTORE_LOG)
        .where("user_pk", user_pk)
        .where(function() {
          this.where(db.raw("TO_CHAR(action_at, 'YYYY-MM-DD')"), "<=", last_time)
            .orWhere(function() {
            this.where("related_pk", SOFT_POINT_PREDEFINED_RELATED_PKS.MOBILE_APPSTORE)
              .orWhere("related_pk", SOFT_POINT_PREDEFINED_RELATED_PKS.FIXED_APPSTORE);
            });
        });
      return await query.del();
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async findAppstorePointStats(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, is_limit_rank, target_rank, top_count, surroundings, user_rank, is_client } = filter;

      let query1 = db(`${this.T_APPSTORE_STATS} as appstore_stats`)
        .select("appstore_stats.table_pk", "appstore_stats.user_pk", "appstore_stats.total_points", "appstore_stats.limit_points")
        .select(db.raw("TO_CHAR(appstore_stats.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      if (is_limit_rank === 1) {
        query1 = query1.select(db.raw("ROW_NUMBER() OVER (ORDER BY NVL(appstore_stats.limit_points, 0) DESC) AS rank"))
      } else {
        query1 = query1.select(db.raw("ROW_NUMBER() OVER (ORDER BY NVL(appstore_stats.total_points, 0) DESC) AS rank"))
      }
      query1 = query1.as("T1");

      let query2 = db(query1)
        .leftJoin(`${this.T_USERS} as users`, "T1.user_pk", "users.user_pk");
      if (is_client !== 1) {
        query2 = query2.leftJoin(`${this.T_MERGE_IDS} as merge_ids`, "T1.user_pk", "merge_ids.pvendor_pk");
      }
      query2 = query2.where("users.status", FLAG_ACTIVE);

      if (is_client === 1) {
        const target_min = target_rank - surroundings;
        const target_max = target_rank + surroundings;

        query2 = query2.where(function() {
          this.where("T1.rank", "<=", top_count)
            .orWhere(function() {
              this.where("T1.rank", ">=", target_min)
                .where("T1.rank", "<=", target_max);
            });
          if (user_rank !== -1) {
            const user_min = user_rank - surroundings;
            const user_max = user_rank + surroundings;
            this.orWhere(function () {
              this.where("T1.rank", ">=", user_min)
                .where("T1.rank", "<=", user_max);
            });
          }
        });
      } else if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query2 = query2.where(function () {
          this.where(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere("users.user_pk", "like", `${lowerKeyword}`)
            .orWhere(db.raw("LOWER(merge_ids.appstore_id)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (isCount) {
        const countQuery = query2.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query2 = query2.orderBy("T1.rank", "asc")
        .orderBy("T1.updated_at", "asc");

      if (is_client === 1) {
        query2 = query2.select(db.raw("CONCAT(CONCAT(SUBSTR(users.user_id, 1, 2), '...'), SUBSTR(users.user_id, LENGTH(user_id), 1)) user_id"));
        if (is_limit_rank === 1) {
          query2 = query2.select("T1.limit_points as points");
        } else {
          query2 = query2.select("T1.total_points as points");
        }
      } else {
        query2 = query2.select("T1.total_points", "T1.limit_points", "T1.updated_at")
          .select("merge_ids.appstore_id")
          .select("users.user_id", "users.user_name");
      }

      query2 = query2.select("T1.table_pk", "T1.user_pk", "T1.rank")
        .offset(offset);

      if (limit) {
        query2 = query2.limit(limit);
      }

      return await query2;
    } catch (err) {
      throw new Error("Error fetching manager: " + err.message);
    }
  }

  static async findAppstorePointStatsByUserPk(user_pk) {
    try {
      const query = db(this.T_APPSTORE_STATS)
        .where("user_pk", user_pk);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async sumAppstorePointStatsByUserPk(limit_time, user_pk) {
    try {
      let query = db(`${this.T_APPSTORE_LOG} as point_log`)
        .where("point_log.is_agency", 0)
        .where("point_log.user_pk", user_pk);
      if (limit_time) {
        query = query.where(db.raw("TO_CHAR(point_log.action_at, 'YYYY-MM-DD')"), "<=", limit_time);
      }
      query = query.select(db.raw("NVL(SUM(soft_points), 0) as calc_points"));
      const row = await query.first();
      return row.calc_points;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async addAppstorePointStats(params) {
    try {
      const now = new Date();
      const result = await db(this.T_APPSTORE_STATS)
        .insert({
          ...params,
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

  static async editAppstorePointStats(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_APPSTORE_STATS)
        .where("table_pk", params.table_pk)
        .update({
          ...params,
          updated_at: now,
        })
        .returning("*");

      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async increaseAppstorePointStats(user_pk, points, include_limit) {
    try {
      const now = new Date();
      let query = db(this.T_APPSTORE_STATS)
        .where("user_pk", user_pk)
        .increment("total_points", points)
        .update("updated_at", now);
      if (include_limit) {
        query = query.increment("limit_points", points);
      }
      return await query;
    } catch (err) {
      throw new Error("Error increase row: " + err.message); 
    }
  }

  static async recalcAppstorePointStats(limit_time, offset, limit) {
    try {
      let query1 = db(`${this.T_APPSTORE_LOG} as point_log`)
        .where("point_log.is_agency", FLAG_NONE);
      if (limit_time) {
        query1 = query1.where(db.raw("TO_CHAR(point_log.action_at, 'YYYY-MM-DD')"), "<=", limit_time);
      }
      query1 = query1.groupBy("point_log.user_pk")
        .orderBy("point_log.user_pk");

      query1 = query1.sum({ calc_points: "soft_points"})
        .select("point_log.user_pk");

      if (offset) {
        query1 = query1.offset(offset);
      }
      if (limit) {
        query1 = query1.limit(limit);
      }

      const rows = await query1;
      if (!rows || rows.length === 0) {
        return 0;
      }

      const point_field = limit_time ? "limit_points" : "total_points";
      for (const row of rows) {
        const query2 = db(`${this.T_APPSTORE_STATS}`)
          .where("user_pk", row.user_pk)
          .update(point_field, row.calc_points);
        await query2;
      }

      return rows.length;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async resetAppstorePointStats(user_pk) {
    try {
      const now = new Date();
      const params = {
        total_points: 0,
        limit_points: 0,
        updated_at: now,
      };
      let query = db(this.T_APPSTORE_STATS)
        .where("user_pk", user_pk)
        .update(params);
      return await query;
    } catch (err) {
      throw new Error("Error increase row: " + err.message); 
    }
  }

  static async findKaraokePointLog(filter, isCount = false) {
    try {
      const { offset, limit, sort, user_pk, from, to, status, is_agency, keyword, is_client } = filter;

      let query = db(`${this.T_KARAOKE_LOG} as karaoke_log`);

      if (is_client !== 1) {
        query = query.leftJoin(`${this.T_USERS} as users`, "karaoke_log.user_pk", "users.user_pk");
      }

      if (user_pk) {
        query = query.where("karaoke_log.user_pk", user_pk);
      }
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function () {
          this.where(db.raw("LOWER(karaoke_log.reason)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(karaoke_log.equ_num)"), "like", `%${lowerKeyword}%`);
          if (is_client !== 1) {
            this.orWhere(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
              .orWhere("users.user_pk", "like", `${lowerKeyword}`);
          }
        });
      }
      if (status !== undefined && status !== -1) {
        query = query.where("karaoke_log.status", status);
      }
      if (is_agency !== undefined && is_agency !== -1) {
        query = query.where("karaoke_log.is_agency", is_agency);
      }
      if (is_client === 1) {
        query = query.where("karaoke_log.is_agency", FLAG_USER);
      }
      if (from && to) {
        query = query.where(db.raw("TO_CHAR(karaoke_log.action_at, 'YYYY-MM-DD')"), ">=", from)
          .where(db.raw("TO_CHAR(karaoke_log.action_at, 'YYYY-MM-DD')"), "<=", to);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      if (is_client !== 1) {
        query = query.select("karaoke_log.user_pk")
          .select("users.user_id", "users.user_name");
      }

      query = query.select("karaoke_log.table_pk", "karaoke_log.status", "karaoke_log.reason", "karaoke_log.equ_num", "karaoke_log.pay_points", "karaoke_log.soft_points", "karaoke_log.related_pk", "karaoke_log.is_agency")
        .select(db.raw("TO_CHAR(karaoke_log.action_at, 'YYYY-MM-DD HH24:MI:SS') action_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findKaraokePointLogByFilter(filter) {
    try {
      const query = db(this.T_KARAOKE_LOG)
        .where(filter);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findTotalKaraokePointByFilter(filter) {
    try {
      const query = db(this.T_KARAOKE_LOG)
        .where(filter)
        .sum({ sum_points: "soft_points"});
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addKaraokePointLog(params) {
    try {
      const now = new Date();
      let newParams = params;
      if (!params.action_at) {
        newParams = { ...params, action_at: now };
      }
      const result = await db(this.T_KARAOKE_LOG)
        .insert(newParams)
        .returning("*");

      if (!result || result.length === 0) {
        throw new Error("Fail to add a new row");
      }

      return result[0];
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async deleteKaraokePointLog(filter) {
    try {
      const count = await db(this.T_KARAOKE_LOG)
        .where(filter)
        .del();
      return count;
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async findKaraokePointStats(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, is_limit_rank, target_rank, top_count, surroundings, user_rank, is_client } = filter;

      let query1 = db(`${this.T_KARAOKE_STATS} as karaoke_stats`)
        .select("karaoke_stats.table_pk", "karaoke_stats.user_pk", "karaoke_stats.total_points", "karaoke_stats.limit_points")
        .select(db.raw("TO_CHAR(karaoke_stats.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      if (is_limit_rank === 1) {
        query1 = query1.select(db.raw("ROW_NUMBER() OVER (ORDER BY NVL(karaoke_stats.limit_points, 0) DESC) AS rank"))
      } else {
        query1 = query1.select(db.raw("ROW_NUMBER() OVER (ORDER BY NVL(karaoke_stats.total_points, 0) DESC) AS rank"))
      }
      query1 = query1.as("T1");

      let query2 = db(query1)
        .leftJoin(`${this.T_USERS} as users`, "T1.user_pk", "users.user_pk")
        .where("users.status", FLAG_ACTIVE);

      if (is_client === 1) {
        const target_min = target_rank - surroundings;
        const target_max = target_rank + surroundings;

        query2 = query2.where(function() {
          this.where("T1.rank", "<=", top_count)
            .orWhere(function() {
              this.where("T1.rank", ">=", target_min)
                .where("T1.rank", "<=", target_max);
            });
          if (user_rank !== -1) {
            const user_min = user_rank - surroundings;
            const user_max = user_rank + surroundings;
            this.orWhere(function () {
              this.where("T1.rank", ">=", user_min)
                .where("T1.rank", "<=", user_max);
            });
          }
        });
      } else if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query2 = query2.where(function () {
          this.where(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere("users.user_pk", "like", `${lowerKeyword}`);
        });
      }

      if (isCount) {
        const countQuery = query2.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query2 = query2.orderBy("T1.rank", "asc")
        .orderBy("T1.updated_at", "asc");

      if (is_client === 1) {
        query2 = query2.select(db.raw("CONCAT(CONCAT(SUBSTR(users.user_id, 1, 2), '...'), SUBSTR(users.user_id, LENGTH(user_id), 1)) user_id"));
        if (is_limit_rank === 1) {
          query2 = query2.select("T1.limit_points as points");
        } else {
          query2 = query2.select("T1.total_points as points");
        }
      } else {
        query2 = query2.select("T1.total_points", "T1.limit_points", "T1.updated_at")
          .select("users.user_id", "users.user_name");
      }

      query2 = query2.select("T1.table_pk", "T1.user_pk", "T1.rank")
        .offset(offset);

      if (limit) {
        query2 = query2.limit(limit);
      }

      return await query2;
    } catch (err) {
      throw new Error("Error fetching manager: " + err.message);
    }
  }

  static async findKaraokePointStatsByUserPk(user_pk) {
    try {
      const query = db(this.T_KARAOKE_STATS)
        .where("user_pk", user_pk);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async sumKaraokePointStatsByUserPk(limit_time, user_pk) {
    try {
      let query = db(`${this.T_KARAOKE_LOG} as point_log`)
        .where("is_agency", 0)
        .where("point_log.user_pk", user_pk);
      if (limit_time) {
        query = query.where(db.raw("TO_CHAR(point_log.action_at, 'YYYY-MM-DD')"), "<=", limit_time);
      }
      query = query.select(db.raw("SUM(soft_points) as calc_points"));
      const row = await query.first();
      return row.calc_points;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async addKaraokePointStats(params) {
    try {
      const now = new Date();
      const result = await db(this.T_KARAOKE_STATS)
        .insert({
          ...params,
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

  static async editKaraokePointStats(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_KARAOKE_STATS)
        .where("table_pk", params.table_pk)
        .update({
          ...params,
          updated_at: now,
        })
        .returning("*");

      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async increaseKaraokePointStats(user_pk, points, include_limit) {
    try {
      const now = new Date();
      let query = db(this.T_KARAOKE_STATS)
        .where("user_pk", user_pk)
        .increment("total_points", points)
        .update("updated_at", now);
      if (include_limit) {
        query = query.increment("limit_points", points);
      }
      return await query;
    } catch (err) {
      throw new Error("Error increase row: " + err.message); 
    }
  }

  static async recalcKaraokePointStats(limit_time, offset, limit) {
    try {
      let query1 = db(`${this.T_KARAOKE_LOG} as point_log`)
        .where("point_log.is_agency", FLAG_NONE);
      if (limit_time) {
        query1 = query1.where(db.raw("TO_CHAR(point_log.action_at, 'YYYY-MM-DD')"), "<=", limit_time);
      }
      query1 = query1.groupBy("point_log.user_pk")
        .orderBy("point_log.user_pk");

      query1 = query1.sum({ calc_points: "soft_points"})
        .select("point_log.user_pk");

      if (offset) {
        query1 = query1.offset(offset);
      }
      if (limit) {
        query1 = query1.limit(limit);
      }

      const rows = await query1;
      if (!rows || rows.length === 0) {
        return 0;
      }

      const point_field = limit_time ? "limit_points" : "total_points";
      for (const row of rows) {
        const query2 = db(`${this.T_KARAOKE_STATS}`)
          .where("user_pk", row.user_pk)
          .update(point_field, row.calc_points);
        await query2;
      }

      return rows.length;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findBMediaPointLog(filter, isCount = false) {
    try {
      const { offset, limit, sort, user_pk, from, to, status, is_agency, keyword, is_client } = filter;

      let query = db(`${this.T_BMEDIALOG} as bmedia_log`);

      if (is_client !== 1) {
        query = query.leftJoin(`${this.T_USERS} as users`, "bmedia_log.user_pk", "users.user_pk");
      }

      if (user_pk) {
        query = query.where("bmedia_log.user_pk", user_pk);
      }
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function () {
          this.where(db.raw("LOWER(bmedia_log.reason)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(bmedia_log.equ_num)"), "like", `%${lowerKeyword}%`);
          if (is_client !== 1) {
            this.orWhere(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
              .orWhere("users.user_pk", "like", `${lowerKeyword}`);
          }
        });
      }
      if (status !== undefined && status !== -1) {
        query = query.where("bmedia_log.status", status);
      }
      if (is_agency !== undefined && is_agency !== -1) {
        query = query.where("bmedia_log.is_agency", is_agency);
      }
      if (is_client === 1) {
        query = query.where("bmedia_log.is_agency", FLAG_USER);
      }
      if (from && to) {
        query = query.where(db.raw("TO_CHAR(bmedia_log.action_at, 'YYYY-MM-DD')"), ">=", from)
          .where(db.raw("TO_CHAR(bmedia_log.action_at, 'YYYY-MM-DD')"), "<=", to);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      if (is_client !== 1) {
        query = query.select("bmedia_log.user_pk")
          .select("users.user_id", "users.user_name");
      }

      query = query.select("bmedia_log.table_pk", "bmedia_log.status", "bmedia_log.reason", "bmedia_log.equ_num", "bmedia_log.pay_points", "bmedia_log.soft_points", "bmedia_log.related_pk", "bmedia_log.is_agency")
        .select(db.raw("TO_CHAR(bmedia_log.action_at, 'YYYY-MM-DD HH24:MI:SS') action_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findBMediaPointLogByFilter(filter) {
    try {
      const query = db(this.T_BMEDIALOG)
        .where(filter);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findTotalBMediaPointByFilter(filter) {
    try {
      const query = db(this.T_BMEDIALOG)
        .where(filter)
        .sum({ sum_points: "soft_points"});
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addBMediaPointLog(params) {
    try {
      const now = new Date();
      let newParams = params;
      if (!params.action_at) {
        newParams = { ...params, action_at: now };
      }
      const result = await db(this.T_BMEDIALOG)
        .insert(newParams)
        .returning("*");

      if (!result || result.length === 0) {
        throw new Error("Fail to add a new row");
      }

      return result[0];
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async editBMediaPointLog(params) {
    try {
      const rowCount = await db(this.T_BMEDIALOG)
        .where("table_pk", params.table_pk)
        .update({
          ...params,
        })
        .returning("*");

      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async deleteBMediaPointLog(filter) {
    try {
      const count = await db(this.T_BMEDIALOG)
        .where(filter)
        .del();
      return count;
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async findBMediaPointStats(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, is_limit_rank, target_rank, top_count, surroundings, user_rank, is_client } = filter;

      let query1 = db(`${this.T_BMEDIASTATS} as bmedia_stats`)
        .select("bmedia_stats.table_pk", "bmedia_stats.user_pk", "bmedia_stats.total_points", "bmedia_stats.limit_points")
        .select(db.raw("TO_CHAR(bmedia_stats.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      if (is_limit_rank === 1) {
        query1 = query1.select(db.raw("ROW_NUMBER() OVER (ORDER BY NVL(bmedia_stats.limit_points, 0) DESC) AS rank"))
      } else {
        query1 = query1.select(db.raw("ROW_NUMBER() OVER (ORDER BY NVL(bmedia_stats.total_points, 0) DESC) AS rank"))
      }
      query1 = query1.as("T1");

      let query2 = db(query1)
        .leftJoin(`${this.T_USERS} as users`, "T1.user_pk", "users.user_pk")
        .where("users.status", FLAG_ACTIVE);

      if (is_client === 1) {
        const target_min = target_rank - surroundings;
        const target_max = target_rank + surroundings;

        query2 = query2.where(function() {
          this.where("T1.rank", "<=", top_count)
            .orWhere(function() {
              this.where("T1.rank", ">=", target_min)
                .where("T1.rank", "<=", target_max);
            });
          if (user_rank !== -1) {
            const user_min = user_rank - surroundings;
            const user_max = user_rank + surroundings;
            this.orWhere(function () {
              this.where("T1.rank", ">=", user_min)
                .where("T1.rank", "<=", user_max);
            });
          }
        });
      } else if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query2 = query2.where(function () {
          this.where(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere("users.user_pk", "like", `${lowerKeyword}`);
        });
      }

      if (isCount) {
        const countQuery = query2.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query2 = query2.orderBy("T1.rank", "asc")
        .orderBy("T1.updated_at", "asc");

      if (is_client === 1) {
        query2 = query2.select(db.raw("CONCAT(CONCAT(SUBSTR(users.user_id, 1, 2), '...'), SUBSTR(users.user_id, LENGTH(user_id), 1)) user_id"));
        if (is_limit_rank === 1) {
          query2 = query2.select("T1.limit_points as points");
        } else {
          query2 = query2.select("T1.total_points as points");
        }
      } else {
        query2 = query2.select("T1.total_points", "T1.limit_points", "T1.updated_at")
          .select("users.user_id", "users.user_name");
      }

      query2 = query2.select("T1.table_pk", "T1.user_pk", "T1.rank")
        .offset(offset);

      if (limit) {
        query2 = query2.limit(limit);
      }

      return await query2;
    } catch (err) {
      throw new Error("Error fetching manager: " + err.message);
    }
  }

  static async findBMediaPointStatsByUserPk(user_pk) {
    try {
      const query = db(this.T_BMEDIASTATS)
        .where("user_pk", user_pk);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async sumBMediaPointStatsByUserPk(limit_time, user_pk) {
    try {
      let query = db(`${this.T_BMEDIALOG} as point_log`)
        .where("point_log.is_agency", 0)
        .where("point_log.user_pk", user_pk);
      if (limit_time) {
        query = query.where(db.raw("TO_CHAR(point_log.action_at, 'YYYY-MM-DD')"), "<=", limit_time);
      }
      query = query.select(db.raw("SUM(soft_points) as calc_points"));
      const row = await query.first();
      return row.calc_points;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async addBMediaPointStats(params) {
    try {
      const now = new Date();
      const result = await db(this.T_BMEDIASTATS)
        .insert({
          ...params,
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

  static async editBMediaPointStats(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_BMEDIASTATS)
        .where("table_pk", params.table_pk)
        .update({
          ...params,
          updated_at: now,
        })
        .returning("*");

      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async increaseBMediaPointStats(user_pk, points, include_limit) {
    try {
      const now = new Date();
      let query = db(this.T_BMEDIASTATS)
        .where("user_pk", user_pk)
        .increment("total_points", points)
        .update("updated_at", now);
      if (include_limit) {
        query = query.increment("limit_points", points);
      }
      return await query;
    } catch (err) {
      throw new Error("Error increase row: " + err.message); 
    }
  }

  static async recalcBMediaPointStats(limit_time, offset, limit) {
    try {
      let query1 = db(`${this.T_BMEDIALOG} as point_log`)
        .where("point_log.is_agency", FLAG_NONE);
      if (limit_time) {
        query1 = query1.where(db.raw("TO_CHAR(point_log.action_at, 'YYYY-MM-DD')"), "<=", limit_time);
      }
      query1 = query1.groupBy("point_log.user_pk")
        .orderBy("point_log.user_pk");

      query1 = query1.sum({ calc_points: "soft_points"})
        .select("point_log.user_pk");

      if (offset) {
        query1 = query1.offset(offset);
      }
      if (limit) {
        query1 = query1.limit(limit);
      }

      const rows = await query1;
      if (!rows || rows.length === 0) {
        return 0;
      }

      const point_field = limit_time ? "limit_points" : "total_points";
      for (const row of rows) {
        const query2 = db(`${this.T_BMEDIASTATS}`)
          .where("user_pk", row.user_pk)
          .update(point_field, row.calc_points);
        await query2;
      }

      return rows.length;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findSoftPointLog(filter, isCount = false) {
    try {
      const { offset, limit, sort, user_pk, from, to, point_type, status, is_agency, keyword, is_client } = filter;

      let query = db(`${this.T_SOFT_LOG} as soft_log`);

      if (is_client !== 1) {
        query = query.leftJoin(`${this.T_USERS} as users`, "soft_log.user_pk", "users.user_pk");
      }

      if (user_pk) {
        query = query.where("soft_log.user_pk", user_pk);
      }
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function () {
          this.where(db.raw("LOWER(soft_log.reason)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(soft_log.equ_num)"), "like", `%${lowerKeyword}%`);
          if (is_client !== 1) {
            this.orWhere(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
              .orWhere("users.user_pk", "like", `${lowerKeyword}`);
          }
        });
      }
      if (point_type !== undefined && point_type !== -1) {
        query = query.where("soft_log.point_type", point_type);
      }
      if (status !== undefined && status !== -1) {
        query = query.where("soft_log.status", status);
      }
      if (is_agency !== undefined && is_agency !== -1) {
        query = query.where("soft_log.is_agency", is_agency);
      }
      if (is_client === 1) {
        query = query.where("soft_log.is_agency", FLAG_USER);
      }
      if (from && to) {
        query = query.where(db.raw("TO_CHAR(soft_log.action_at, 'YYYY-MM-DD')"), ">=", from)
          .where(db.raw("TO_CHAR(soft_log.action_at, 'YYYY-MM-DD')"), "<=", to);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      if (is_client !== 1) {
        query = query.select("soft_log.user_pk")
          .select("users.user_id", "users.user_name");
      }

      query = query.select("soft_log.table_pk", "soft_log.point_type", "soft_log.status", "soft_log.reason", "soft_log.equ_num", "soft_log.pay_points", "soft_log.soft_points", "soft_log.related_pk", "soft_log.is_agency")
        .select(db.raw("TO_CHAR(soft_log.action_at, 'YYYY-MM-DD HH24:MI:SS') action_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findSoftPointLogByFilter(filter) {
    try {
      const query = db(this.T_SOFT_LOG)
        .where(filter);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findTotalSoftPointByFilter(filter) {
    try {
      const query = db(this.T_SOFT_LOG)
        .where(filter)
        .sum({ sum_points: "soft_points"});
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findSoftPointLogsByReserveInfo(prefix_pk) {
    try {
      let query = db(`${this.T_SOFT_LOG} as point_log`)
        .leftJoin(`${this.T_USERS} as users`, "point_log.user_pk", "users.user_pk")
        .where("point_log.point_type", SOFT_POINT_TYPES.MANAGER)
        .where("point_log.status", SOFT_POINT_STATUS.MINUS)
        .where("point_log.related_pk", "" + prefix_pk);

      query = query.select("point_log.user_pk")
        .select("users.user_id");

      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addSoftPointLog(params) {
    try {
      const now = new Date();
      let newParams = params;
      if (!params.action_at) {
        newParams = { ...params, action_at: now };
      }
      const result = await db(this.T_SOFT_LOG)
        .insert(newParams)
        .returning("*");

      if (!result || result.length === 0) {
        throw new Error("Fail to add a new row");
      }

      return result[0];
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async deleteSoftPointLog(filter) {
    try {
      const count = await db(this.T_SOFT_LOG)
        .where(filter)
        .del();
      return count;
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async findSoftPointRank(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, is_limit_rank, target_rank, top_count, surroundings, user_rank, is_client } = filter;

      let query0 = db(`${this.T_SOFT_STATS} as soft_stats`)
        .fullOuterJoin(`${this.T_APPSTORE_STATS} as appstore_stats`, "soft_stats.user_pk", "appstore_stats.user_pk")
        .fullOuterJoin(`${this.T_KARAOKE_STATS} as karaoke_stats`, "soft_stats.user_pk", "karaoke_stats.user_pk")
        .fullOuterJoin(`${this.T_BMEDIASTATS} as bmedia_stats`, "soft_stats.user_pk", "bmedia_stats.user_pk")
        .select(db.raw("DISTINCT(CASE WHEN soft_stats.user_pk IS NOT NULL THEN soft_stats.user_pk WHEN appstore_stats.user_pk IS NOT NULL THEN appstore_stats.user_pk WHEN karaoke_stats.user_pk IS NOT NULL THEN karaoke_stats.user_pk WHEN bmedia_stats.user_pk IS NOT NULL THEN bmedia_stats.user_pk ELSE soft_stats.user_pk END) as user_pk"));
      query0 = query0.as("T0");

      let query1 = db(query0)
        .leftJoin(`${this.T_APPSTORE_STATS} as appstore_stats`, "T0.user_pk", "appstore_stats.user_pk")
        .leftJoin(`${this.T_KARAOKE_STATS} as karaoke_stats`, "T0.user_pk", "karaoke_stats.user_pk")
        .leftJoin(`${this.T_BMEDIASTATS} as bmedia_stats`, "T0.user_pk", "bmedia_stats.user_pk")
        .leftJoin(`${this.T_SOFT_STATS} as soft_stats`, "T0.user_pk", "soft_stats.user_pk")
        .select("T0.user_pk")
        .select(db.raw("NVL(appstore_stats.total_points, 0) + NVL(karaoke_stats.total_points, 0) + NVL(bmedia_stats.total_points, 0) + NVL(soft_stats.total_points, 0) as total_points"))
        .select(db.raw("NVL(appstore_stats.limit_points, 0) + NVL(karaoke_stats.limit_points, 0) + NVL(bmedia_stats.limit_points, 0) + NVL(soft_stats.limit_points, 0) as limit_points"));
      if (is_client !== 1) {
        query1 = query1
          .select(db.raw("NVL(appstore_stats.total_points, 0) as appstore_total_points"), db.raw("NVL(appstore_stats.limit_points, 0) as appstore_limit_points"))
          .select(db.raw("NVL(karaoke_stats.total_points, 0) as karaoke_total_points"), db.raw("NVL(karaoke_stats.limit_points, 0) as karaoke_limit_points"))
          .select(db.raw("NVL(bmedia_stats.total_points, 0) as bmedia_total_points"), db.raw("NVL(bmedia_stats.limit_points, 0) as bmedia_limit_points"))
          .select(db.raw("NVL(soft_stats.total_points, 0) as minus_total_points"), db.raw("NVL(soft_stats.limit_points, 0) as minus_limit_points"));
      }

      query1 = query1.as("T1");

      let query2 = db(query1)
        .select("T1.*");
      if (is_limit_rank === 1) {
        query2 = query2.select(db.raw("ROW_NUMBER() OVER (ORDER BY limit_points DESC) AS rank"))
      } else {
        query2 = query2.select(db.raw("ROW_NUMBER() OVER (ORDER BY total_points DESC) AS rank"))
      }
      query2 = query2.as("T2");

      let query3 = db(query2)
        .leftJoin(`${this.T_USERS} as users`, "T2.user_pk", "users.user_pk");
      if (is_client !== 1) {
        query3 = query3.leftJoin(`${this.T_MERGE_IDS} as merge_ids`, "T2.user_pk", "merge_ids.pvendor_pk");
      }
      query3 = query3.where("users.status", FLAG_ACTIVE);

      if (is_client === 1) {
        query3 = query3.where(function() {
          this.where("T2.rank", "<=", top_count);
          if (target_rank) {
            const target_min = target_rank - surroundings;
            const target_max = target_rank + surroundings;
            this.orWhere(function() {
              this.where("T2.rank", ">=", target_min)
                .where("T2.rank", "<=", target_max);
            });
          }
          if (user_rank !== -1) {
            const user_min = user_rank - surroundings;
            const user_max = user_rank + surroundings;
            this.orWhere(function () {
              this.where("T2.rank", ">=", user_min)
                .where("T2.rank", "<=", user_max);
            });
          }
        });
      } else if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query3 = query3.where(function() {
          this.where(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere("users.user_pk", "like", `${lowerKeyword}`)
            .orWhere(db.raw("LOWER(merge_ids.appstore_id)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (isCount) {
        const countQuery = query3.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query3 = query3.orderBy("T2.rank", "asc");

      if (is_client === 1) {
        query3 = query3.select(db.raw("users.user_id"));
        if (is_limit_rank === 1) {
          query3 = query3.select("T2.limit_points as points");
        } else {
          query3 = query3.select("T2.total_points as points");
        }
      } else {
        query3 = query3.select("T2.total_points", "T2.limit_points", "T2.appstore_total_points", "T2.appstore_limit_points", "T2.karaoke_total_points", "T2.karaoke_limit_points", "T2.bmedia_total_points", "T2.bmedia_limit_points", "T2.minus_total_points", "T2.minus_limit_points")
          .select("merge_ids.appstore_id")
          .select("users.user_id", "users.user_name");
      }

      query3 = query3.select("T2.user_pk", "T2.rank")
        .offset(offset);

      if (limit) {
        query3 = query3.limit(limit);
      }

      return await query3;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findSoftPointStatsByUserPk(user_pk) {
    try {
      const query = db(this.T_SOFT_STATS)
        .where("user_pk", user_pk);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findSoftPointRankByUserPk(user_pk, is_limit_rank) {
    try {
      let query0 = db(`${this.T_SOFT_STATS} as soft_stats`)
        .fullOuterJoin(`${this.T_APPSTORE_STATS} as appstore_stats`, "soft_stats.user_pk", "appstore_stats.user_pk")
        .fullOuterJoin(`${this.T_KARAOKE_STATS} as karaoke_stats`, "soft_stats.user_pk", "karaoke_stats.user_pk")
        .fullOuterJoin(`${this.T_BMEDIASTATS} as bmedia_stats`, "soft_stats.user_pk", "bmedia_stats.user_pk")
        .select(db.raw("DISTINCT(CASE WHEN soft_stats.user_pk IS NOT NULL THEN soft_stats.user_pk WHEN appstore_stats.user_pk IS NOT NULL THEN appstore_stats.user_pk WHEN karaoke_stats.user_pk IS NOT NULL THEN karaoke_stats.user_pk WHEN bmedia_stats.user_pk IS NOT NULL THEN bmedia_stats.user_pk ELSE soft_stats.user_pk END) as user_pk"));
      query0 = query0.as("T0");

      let query1 = db(query0)
        .leftJoin(`${this.T_APPSTORE_STATS} as appstore_stats`, "T0.user_pk", "appstore_stats.user_pk")
        .leftJoin(`${this.T_KARAOKE_STATS} as karaoke_stats`, "T0.user_pk", "karaoke_stats.user_pk")
        .leftJoin(`${this.T_BMEDIASTATS} as bmedia_stats`, "T0.user_pk", "bmedia_stats.user_pk")
        .leftJoin(`${this.T_SOFT_STATS} as soft_stats`, "T0.user_pk", "soft_stats.user_pk")
        .select("T0.user_pk")
        .select(db.raw("NVL(appstore_stats.total_points, 0) + NVL(karaoke_stats.total_points, 0) + NVL(bmedia_stats.total_points, 0) + NVL(soft_stats.total_points, 0) as total_points"))
        .select(db.raw("NVL(appstore_stats.limit_points, 0) + NVL(karaoke_stats.limit_points, 0) + NVL(bmedia_stats.limit_points, 0) + NVL(soft_stats.limit_points, 0) as limit_points"));

      query1 = query1.as("T1");

      let query2 = db(query1)
        .select("T1.*");
      if (is_limit_rank === 1) {
        query2 = query2.select(db.raw("ROW_NUMBER() OVER (ORDER BY limit_points DESC) AS rank"))
      } else {
        query2 = query2.select(db.raw("ROW_NUMBER() OVER (ORDER BY total_points DESC) AS rank"))
      }
      query2 = query2.as("T2");

      let query3 = db(query2)
        .where("user_pk", user_pk);
      return query3.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addSoftPointStats(params) {
    try {
      const now = new Date();
      const result = await db(this.T_SOFT_STATS)
        .insert({
          ...params,
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

  static async editSoftPointStats(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_SOFT_STATS)
        .where("table_pk", params.table_pk)
        .update({
          ...params,
          updated_at: now,
        })
        .returning("*");

      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async sumSoftPointStatsByUserPk(limit_time, user_pk) {
    try {
      let query = db(`${this.T_SOFT_LOG} as point_log`)
        .where("point_log.is_agency", FLAG_NONE)
        .where("point_log.point_type", SOFT_POINT_TYPES.MANAGER)
        .where("point_log.user_pk", user_pk);
      if (limit_time) {
        query = query.where(db.raw("TO_CHAR(point_log.action_at, 'YYYY-MM-DD')"), "<=", limit_time);
      }
      query = query.select(db.raw("SUM(soft_points) as calc_points"));
      const row = await query.first();
      return row.calc_points;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async increaseSoftPointStats(user_pk, points, include_limit) {
    try {
      const now = new Date();
      let query = db(this.T_SOFT_STATS)
        .where("user_pk", user_pk)
        .increment("total_points", points)
        .update("updated_at", now);
      if (include_limit) {
        query = query.increment("limit_points", points);
      }
      return await query;
    } catch (err) {
      throw new Error("Error increase row: " + err.message); 
    }
  }

  static async recalcSoftPointStats(limit_time, offset, limit) {
    try {
      let query1 = db(`${this.T_SOFT_LOG} as point_log`)
        .where("point_log.is_agency", FLAG_NONE)
        .where("point_log.point_type", SOFT_POINT_TYPES.MANAGER);
      if (limit_time) {
        query1 = query1.where(db.raw("TO_CHAR(point_log.action_at, 'YYYY-MM-DD')"), "<=", limit_time);
      }
      query1 = query1.groupBy("point_log.user_pk")
        .orderBy("point_log.user_pk");

      query1 = query1.sum({ calc_points: "soft_points"})
        .select("point_log.user_pk");

      if (offset) {
        query1 = query1.offset(offset);
      }
      if (limit) {
        query1 = query1.limit(limit);
      }

      const rows = await query1;
      if (!rows || rows.length === 0) {
        return 0;
      }

      const point_field = limit_time ? "limit_points" : "total_points";
      for (const row of rows) {
        const query2 = db(`${this.T_SOFT_STATS}`)
          .where("user_pk", row.user_pk)
          .update(point_field, row.calc_points);
        await query2;
      }

      return rows.length;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findRegisterPointTypes(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, min_at, max_at, is_client } = filter;

      let query = db(`${this.T_REG_POINT_TYPES} as point_types`)
        .leftJoin(`${this.T_PRODUCTS} as products`, "point_types.product_pk", "products.product_pk");

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(products.product_name)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (min_at !== undefined && min_at !== "") {
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(point_types.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(db.raw("TO_CHAR(point_types.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
          });
        } else {
          query = query.where(db.raw("TO_CHAR(point_types.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else if (max_at !== undefined && max_at != "") {
        query = query.where(db.raw("TO_CHAR(point_types.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      if (is_client !== 1) {
        query = query.select("products.product_name", "products.simple_name");
      }

      query = query
        .select("point_types.type_pk", "point_types.product_pk", "point_types.points")
        .select(db.raw("TO_CHAR(point_types.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findRegisterPointTypeByPk(type_pk) {
    try {
      const query = db(this.T_REG_POINT_TYPES).where({ type_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findRegisterPointTypeByProductPk(product_pk) {
    try {
      const query = db(this.T_REG_POINT_TYPES).where({ product_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findRegisterPointTypeByModelName(model_name) {
    try {
      const query = db(`${this.T_REG_POINT_TYPES} as point_types`)
        .leftJoin(`${this.T_PROD_MODELS} as prod_models`, "point_types.product_pk", "prod_models.product_pk")
        .where("model_name", model_name)
        .select("point_types.product_pk", "point_types.points")
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addRegisterPointType(params, admin_pk) {
    try {
      const now = new Date();
      const query = db(this.T_REG_POINT_TYPES)
        .insert({
          ...params,
          created_at: now,
          updated_at: now,
          created_by: admin_pk,
          updated_by: admin_pk,
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

  static async editRegisterPointType(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_REG_POINT_TYPES)
        .where("type_pk", params.type_pk)
        .update({
          ...params,
          updated_at: now,
          updated_by: admin_pk,
        });

      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findRegisterPointLog(filter, isCount = false) {
    try {
      const { offset, limit, sort, user_pk, from, to, keyword, point_type, status, is_client } = filter;

      let query = db(`${this.T_REG_POINT_LOG} as point_log`)

      if (is_client !== 1) {
        query = query.leftJoin(`${this.T_USERS} as users`, "point_log.user_pk", "users.user_pk");
      }

      if (user_pk) {
        query = query.where("point_log.user_pk", user_pk);
      }
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function () {
          this.where(db.raw("LOWER(point_log.product_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(point_log.equ_num)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(point_log.reason)"), "like", `%${lowerKeyword}%`);
          if (is_client !== 1) {
            this.orWhere(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
            this.orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
            this.orWhere("users.user_pk", "like", `${lowerKeyword}`);
          }
        });
      }
      if (from && to) {
        query = query.where(db.raw("TO_CHAR(point_log.action_at, 'YYYY-MM-DD')"), ">=", from)
          .where(db.raw("TO_CHAR(point_log.action_at, 'YYYY-MM-DD')"), "<=", to);
      }
      if (point_type !== undefined && point_type !== "" && +point_type !== -1) {
        query = query.where("point_log.point_type", point_type);
      }
      if (status !== undefined && status !== "" && +status !== -1) {
        query = query.where("point_log.status", status);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      if (is_client !== 1) {
        query = query.select("users.user_id", "users.user_name");
      }

      query = query.select("point_log.table_pk", "point_log.user_pk", "point_log.point_type", "point_log.status", "point_log.product_pk", "point_log.product_name", "point_log.equ_num", "point_log.reason", "point_log.points")
        .select(db.raw("TO_CHAR(point_log.action_at, 'YYYY-MM-DD HH24:MI:SS') action_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findRegisterPointLogsByReserveInfo(prefix_pk) {
    try {
      let query = db(`${this.T_REG_POINT_LOG} as point_log`)
        .leftJoin(`${this.T_USERS} as users`, "point_log.user_pk", "users.user_pk")
        .where("point_log.point_type", REG_POINT_TYPES.MANAGER)
        .where("point_log.status", REG_POINT_STATUS.MINUS)
        .where("point_log.related_pk", prefix_pk);
      query = query.select("point_log.user_pk")
        .select("users.user_id");

      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async calcRegisterPointLogByFilter(filter) {
    try {
      const query = db(`${this.T_REG_POINT_LOG} as point_log`)
        .where(filter)
        .sum({ sum_points: "points"});
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }  

  static async addRegisterPointLog(params) {
    try {
      const now = new Date();
      const query = db(this.T_REG_POINT_LOG)
        .insert({
          ...params,
          action_at: now,
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

  static async addRegisterPointLogs(params, user_pks) {
    try {
      const now = new Date();
      let rows = [];
      user_pks.map(user_pk => rows = [...rows, {
        ...params,
        user_pk,
        action_at: now,
      }]);

      const query = db(this.T_REG_POINT_LOG)
        .insert(rows)
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

  static async addRegisterMinusLogs(params, oldLogs) {
    try {
      let rows = [];
      oldLogs.map(log => rows = [...rows, {
        ...params,
        points: -log.minus_score,
        reason: log.description,
        action_at: log.created_at,
      }]);

      const query = db(this.T_REG_POINT_LOG)
        .insert(rows)
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

  static async findPrizeLogsByMinusPrefix(reserve_prefix, reserve_suffix) {
    try {
      let query = db(`${this.T_PRIZE_LOG} as prize_log`)
        .leftJoin(`${this.T_CUSTOMERS} as customers`, "prize_log.customer_id", "customers.user_pk");
      query = query.where("prize_log.fill_type", OLD_PRIZE_FILL_TYPES.MINUS_PRIZE)
        .where("prize_log.note", "like", `${reserve_prefix}-%`);
      if (reserve_suffix) {
        query = query.where("prize_log.suffix", reserve_suffix);
      } else {
        query = query.where(db.raw("LENGTH(prize_log.note)"), 11); // 2507-4-0000 format
      }
      query = query.select(db.raw("DISTINCT(prize_log.customer_id)"))
        .select("customers.user_userid");
      return await query;
    } catch (err) {
      throw new Error("Error old reserve log: " + err.message);
    }
  }

  static async addPrizeLog(params, admin_id) {
    try {
      const now = new Date();
      const result = await db(this.T_PRIZE_LOG)
        .insert({
          ...params,
          id: db.raw(`${this.T_PRIZE_LOG}_S.nextval`),
          fill_date: now,
          oper_user: admin_id,
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

  static async findOldReserveLogInCustomerIds(user_ids, reserve_prefix, reserve_suffix) {
    try {
      let query = db(`${this.T_OLD_RESERVE_LOG} as reserve_log`)
        .leftJoin(`${this.T_CUSTOMERS} as customers`, "reserve_log.user_userid", "customers.user_userid");

      query = query.whereIn("reserve_log.user_userid", user_ids)
        .where("reserve_log.prefix", reserve_prefix)
        .where("reserve_log.reserve_type", OLD_RESERVE_TYPES.NORMAL);
      if (reserve_suffix) {
        query = query.where("reserve_log.suffix", reserve_suffix);
      } else {
        query = query.whereNull("reserve_log.suffix");
      }

      query = query.select("reserve_log.user_userid", "reserve_log.reserve_no")
        .select("customers.user_pk");
      return await query;
    } catch (err) {
      throw new Error("Error old reserve log: " + err.message);
    }
  }

  static async findOldReserveLogInUserIds(user_ids, reserve_prefix, reserve_suffix) {
    try {
      let query = db(`${this.T_OLD_RESERVE_LOG} as reserve_log`)
        .leftJoin(`${this.T_USERS} as users`, "reserve_log.user_userid", "users.user_id")

      query = query.whereIn("reserve_log.user_userid", user_ids)
        .where("reserve_log.prefix", reserve_prefix)
        .where("reserve_log.reserve_type", OLD_RESERVE_TYPES.NORMAL);
      if (reserve_suffix) {
        query = query.where("reserve_log.suffix", reserve_suffix);
      } else {
        query = query.whereNull("reserve_log.suffix");
      }

      query = query.select("reserve_log.user_userid", "reserve_log.reserve_no")
        .select("users.user_pk");
      return await query;
    } catch (err) {
      throw new Error("Error old reserve log: " + err.message);
    }
  }

  static async findOldRegScoreMinusLogByCustomerId(customer_id) {
    try {
      let query = db(`${this.T_OLD_REG_MINUS_LOG} as minus_log`)
        .where("minus_log.userid", customer_id);

      query = query.select("minus_log.userid", "minus_log.minus_score", "minus_log.description", "minus_log.created_at")
      return await query;
    } catch (err) {
      throw new Error("Error old reserve log: " + err.message);
    }
  }

  static async findMediaLicenseLogByPk(id) {
    try {
      const query = db(this.T_MEDIA_LICENSES).where({ id }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findKaraLicenseLogByPk(id) {
    try {
      const query = db(this.T_KARA_LICENSES).where({ id }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findMergeIdsInStocks(offset, limit, isCount = false) {
    try {
      let query = db(`${this.T_MERGE_IDS} as merge_ids`)
        .leftJoin(`${this.T_APPSTORE_STOCKS} as stocks`, "merge_ids.appstore_id", "stocks.user_name")
        .whereNotNull("merge_ids.appstore_id")
        .whereNotNull("stocks.user_name");
      
      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query = query.select("merge_ids.pvendor_pk", "merge_ids.pvendor_id", "merge_ids.appstore_id")
        .select("stocks.point", "stocks.last_time")
        .offset(offset);
      if (limit) {
        query = query.limit(limit);
      }
      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    } 
  }

  static async findTempBMediaPoints(offset, limit) {
    try {
      let query = db(`${this.T_TMP_BMEDIAPOINTS} as temp_points`)
        .leftJoin(`${this.T_USERS} as users`, "temp_points.user_id", "users.user_id")
        .leftJoin(`${this.T_BMEDIALOG} as point_log`, function() {
          this.on("point_log.user_pk", "users.user_pk")
            .andOn("point_log.related_pk", +SOFT_POINT_PREDEFINED_RELATED_PKS.BMEDIA);
        });

      query = query.orderBy("temp_points.user_id", "asc");
      query = query.select("point_log.table_pk", "temp_points.user_id", "temp_points.total_points")
        .offset(offset);
      if (limit) {
        query = query.limit(limit);
      }
      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    } 
  }
}

module.exports = PointModel;
