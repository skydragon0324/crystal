const db = require('../db/knex');
const moment = require('moment');
const { FLAG_EXIST, RESERVE_STATUS, RESERVE_TYPES, RESERVE_SMS_STATUS } = require('../constants/constants');

class ReserveModel {
  static T_PREFIX = "ora_pid.reserve_prefix";
  static T_RESERVE_USER = "ora_pid.reserve_users";
  static T_RESERVE_LOG = "ora_pid.reserve_log";
  static T_SMS_LOG = "ora_pid.reserve_sms_log";
  static T_REWARD_LOG = "ora_pid.reward_log";
  static T_PRODUCTS = "ora_pid.products";
  static T_USERS = "ora_pid.users";
  static T_P_S_AGENCIES = "ora_pid.phone_sale_agencies";
  static T_OLD_PRODUCTS = "ora_phone.mobile_product";
  static T_OLD_PREFIXES = "ora_phone.reserve_prefix";
  static T_OLD_RESERVATIONS = "ora_phone.reservations";
  static T_OLD_RESERVE_LOG = "ora_phone.reserve_log";
  static T_CUSTOMERS = "ora_old_db.customers";

  static async findReservePrefixes(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, reserve_source, min_at, max_at, is_client, is_deleted, is_now } = filter;

      let query = db(`${this.T_PREFIX} as prefix`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(prefix.prefix_str)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(prefix.product_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(prefix.description)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(prefix.summary)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(prefix.note)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (min_at !== undefined && min_at !== "") {
        /** check currently available rows less than min_at */
        const now = moment().format("YYYY-MM-DD");
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(prefix.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function() {
                this.where("prefix.is_deleted", FLAG_EXIST)
                  .where(db.raw("TO_CHAR(prefix.disp_date, 'YYYY-MM-DD')"), ">=", now)
                  .where(db.raw("TO_CHAR(prefix.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
              });
          });
        } else {
          query = query.where("prefix.is_deleted", FLAG_EXIST)
            .where(db.raw("TO_CHAR(prefix.disp_date, 'YYYY-MM-DD')"), ">=", now)
            .where(db.raw("TO_CHAR(prefix.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (is_deleted !== undefined && is_deleted !== "") {
          query = query.where("prefix.is_deleted", is_deleted);
        }

        if (is_now === 1) {
          const now = moment().format("YYYY-MM-DD");
          query = query.where(db.raw("TO_CHAR(prefix.disp_date, 'YYYY-MM-DD')"), ">=", now);
        }

        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(prefix.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
        }
      }

      if (reserve_source !== "" && reserve_source !== undefined && reserve_source !== -1) {
        query = query.where("prefix.reserve_source", reserve_source);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }
      query = query.orderBy("prefix.start_no", "desc");

      if (is_client !== 1) {
        query = query.select("prefix.prefix_str", "prefix.suffix_str", "prefix.start_no", "prefix.end_no", "prefix.note", "prefix.summary", "prefix.mars_str");
      }
      query = query.select("prefix.prefix_pk", "prefix.reserve_source", "prefix.product_name", "prefix.description", "prefix.publish_num", "prefix.normal_cnt", "prefix.reward_cnt", "prefix.is_deleted", "prefix.is_minus", "prefix.is_private", "prefix.agency_ids", "prefix.phone_pk")
        .select(db.raw("TO_CHAR(prefix.start_date, 'YYYY-MM-DD') start_date"), db.raw("TO_CHAR(prefix.end_date, 'YYYY-MM-DD') end_date"), db.raw("TO_CHAR(prefix.disp_date, 'YYYY-MM-DD') disp_date"), db.raw("TO_CHAR(prefix.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"), db.raw("TO_CHAR(prefix.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findReserveSimplePrefixes(offset, limit, filter) {
    const { reserve_source, is_minus } = filter;
    try {
      let query = db(`${this.T_PREFIX} as prefix`);

      if (reserve_source !== undefined && reserve_source !== "") {
        query = query.where("prefix.reserve_source", reserve_source);
      }
      if (is_minus !== undefined && is_minus !== "") {
        query = query.where("prefix.is_minus", is_minus);
      }
      query = query.orderBy("start_date", "desc");
      query = query.select("prefix.prefix_pk", "prefix.start_no", "prefix.end_no", "prefix.reserve_source", "prefix.prefix_str", "prefix.suffix_str", "prefix.product_name", "prefix.summary")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findReservePrefixByPk(prefix_pk) {
    try {
      const query = db(this.T_PREFIX)
        .where({ prefix_pk })
        .select("prefix_pk", "product_name", "reserve_source", "prefix_str", "suffix_str", "start_no", "end_no", "normal_cnt", "reward_cnt", "is_minus", "phone_pk", "mars_str")
        .select(db.raw("TO_CHAR(start_date, 'YYYY-MM-DD') start_date"))
        .select(db.raw("TO_CHAR(end_date, 'YYYY-MM-DD') end_date"))
        .select(db.raw("TO_CHAR(disp_date, 'YYYY-MM-DD') disp_date"))
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findReservePrefixInPks(prefix_pks) {
    try {
      const query = db(this.T_PREFIX)
        .whereIn("prefix_pk", prefix_pks);
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findReservePrefixByPrefixAndSuffix(prefix, suffix) {
    try {
      let query = db(this.T_PREFIX)
        .where("prefix_str", prefix);
      if (suffix) {
        query = query.where("suffix_str", suffix);
      } else {
        query = query.whereNull("suffix_str");
      }
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addReservePrefix(params, admin_pk) {
    try {
      const now = new Date();
      const query = db(this.T_PREFIX)
        .insert({
          ...params,
          created_at: now,
          created_by: admin_pk,
          updated_at: now,
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

  static async editReservePrefix(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_PREFIX)
        .where({ prefix_pk: params.prefix_pk })
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

  static async findReserveUsers(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, prefix_pk, user_pk, min_at, max_at, is_client, is_deleted, is_now } = filter;

      let query = db(`${this.T_RESERVE_USER} as reserve_users`)
        .leftJoin(`${this.T_PREFIX} as prefix`, "prefix.prefix_pk", "reserve_users.prefix_pk");
      if (is_client !== 1) {
        query = query.leftJoin(`${this.T_USERS} as users`, "reserve_users.user_pk", "users.user_pk");
      }

      if (keyword && is_client !== 1) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(prefix.prefix_str)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(prefix.product_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_pk)"), "like", `${lowerKeyword}`);
        });
      }
      if (prefix_pk) {
        query = query.where("prefix.prefix_pk", prefix_pk);
      }
      if (user_pk) {
        query = query.where("reserve_users.user_pk", user_pk);
      }
      if (min_at !== undefined && min_at !== "") {
        /** check currently available rows less than min_at */
        const now = moment().format("YYYY-MM-DD");
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(reserve_users.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function() {
                this.where("reserve_users.is_deleted", FLAG_EXIST)
                  .where(db.raw("TO_CHAR(prefix.disp_date, 'YYYY-MM-DD')"), ">=", now)
                  .where(db.raw("TO_CHAR(reserve_users.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
              });
          });
        } else {
          query = query.where("reserve_users.is_deleted", FLAG_EXIST)
            .where(db.raw("TO_CHAR(prefix.disp_date, 'YYYY-MM-DD')"), ">=", now)
            .where(db.raw("TO_CHAR(reserve_users.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (is_deleted !== undefined && is_deleted !== "") {
          query = query.where("reserve_users.is_deleted", is_deleted);
        }

        if (is_now === 1) {
          const now = moment().format("YYYY-MM-DD");
          query = query.where(db.raw("TO_CHAR(prefix.disp_date, 'YYYY-MM-DD')"), ">=", now);
        }

        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(reserve_users.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
        }
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) { // FIXME its not working well
        query = query.orderBy(sort.key, sort.dir);
      }

      if (is_client !== 1) {
        query = query.select("prefix.reserve_source", "prefix.prefix_str", "prefix.suffix_str", "prefix.product_name", db.raw("TO_CHAR(prefix.start_date, 'YYYY-MM-DD') start_date"), db.raw("TO_CHAR(prefix.end_date, 'YYYY-MM-DD') end_date"), "prefix.summary")
          .select("users.user_id", "users.user_name");
      }
      query = query.select("reserve_users.table_pk", "reserve_users.prefix_pk", "reserve_users.user_pk", "reserve_users.reserve_cnt", "reserve_users.reserve_type", "reserve_users.is_deleted")
        .select(db.raw("TO_CHAR(reserve_users.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"), db.raw("TO_CHAR(reserve_users.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findReserveUserByPk(table_pk) {
    try {
      const query = db(this.T_RESERVE_USER).where({ table_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findReserveUserByFilter(filter) {
    try {
      const query = db(this.T_RESERVE_USER)
        .where(filter);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findReserveUsersInUserPks(prefix_pk, user_pks) {
    try {
      const query = db(`${this.T_RESERVE_USER} as reserve_users`)
        .leftJoin(`${this.T_USERS} as users`, "reserve_users.user_pk", "users.user_pk")
        .where("reserve_users.prefix_pk", prefix_pk)
        .whereIn("reserve_users.user_pk", user_pks)
        .select("reserve_users.user_pk", "users.user_id");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findReservableCountTodayByUserPk(user_pk) {
    try {
      const today = moment().format("YYYY-MM-DD");
      const query = db(`${this.T_RESERVE_USER} as reserve_users`)
        .leftJoin(`${this.T_PREFIX} as prefix`, "prefix.prefix_pk", "reserve_users.prefix_pk")
        .where("reserve_users.user_pk", user_pk)
        .where("reserve_users.is_deleted", FLAG_EXIST)
        .where("prefix.is_deleted", FLAG_EXIST)
        .where(db.raw("TO_CHAR(prefix.start_date, 'YYYY-MM-DD')"), "<=", today)
        .where(db.raw("TO_CHAR(prefix.end_date, 'YYYY-MM-DD')"), ">=", today);
      const totalCount = await query.count({ total: "*" }).first();
      return totalCount.total;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addReserveUsers(params, user_pks, admin_pk) {
    try {
      const now = new Date();
      let rows = [];
      user_pks.map(user_pk => rows = [...rows, {
        ...params,
        user_pk,
        created_at: now,
        created_by: admin_pk,
        updated_at: now,
        updated_by: admin_pk,
      }]);
      
      const query = db(this.T_RESERVE_USER)
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

  static async editReserveUser(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_RESERVE_USER)
        .where({ table_pk: params.table_pk })
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

  static async findReserveLogs(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, prefix_pk, reserve_type, agency_id, status, user_pk, min_at, max_at, is_client, is_now } = filter;

      let query = db(`${this.T_RESERVE_LOG} as reserve_log`)
        .leftJoin(`${this.T_PREFIX} as prefix`, "reserve_log.prefix_pk", "prefix.prefix_pk");
      if (is_client !== 1) {
        query = query.leftJoin(`${this.T_USERS} as users`, "reserve_log.user_pk", "users.user_pk")
          .leftJoin(`${this.T_P_S_AGENCIES} as agencies`, "reserve_log.agency_id", "agencies.agency_id");
      }

      if (keyword && is_client !== 1) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(prefix.prefix_str)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(prefix.product_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_pk)"), "like", `${lowerKeyword}`)
            .orWhere(db.raw("LOWER(reserve_log.reserve_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(reserve_log.id_card)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(reserve_log.phone_number)"), "like", `%${lowerKeyword}%`);
        });
      }
      if (prefix_pk) {
        query = query.where("prefix.prefix_pk", prefix_pk);
      }
      if (reserve_type !== undefined && reserve_type !== -1) {
        query = query.where("reserve_log.reserve_type", reserve_type);
      }
      if (user_pk) {
        query = query.where("reserve_log.user_pk", user_pk);
      }
      if (+agency_id !== 0 && agency_id !== undefined) {
        query = query.where("reserve_log.agency_id", agency_id);
      }
      if (status !== undefined && status !== "") {
        query = query.where("reserve_log.status", +status);
      }
      if (min_at !== undefined && min_at !== "") {
        /** check currently available rows less than min_at */
        const now = moment().format("YYYY-MM-DD");
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(reserve_log.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function() {
                this.where(db.raw("TO_CHAR(prefix.disp_date, 'YYYY-MM-DD')"), ">=", now)
                  .where(db.raw("TO_CHAR(reserve_log.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
              });
          });
        } else {
          query = query.where(db.raw("TO_CHAR(prefix.disp_date, 'YYYY-MM-DD')"), ">=", now)
            .where(db.raw("TO_CHAR(reserve_log.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (is_now === 1) {
          const now = moment().format("YYYY-MM-DD");
          query = query.where(db.raw("TO_CHAR(prefix.disp_date, 'YYYY-MM-DD')"), ">=", now);
        }

        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(reserve_log.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
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

      if (is_client !== 1) {
        query = query.select("prefix.reserve_source", "prefix.product_name", "prefix.summary")
          .select("agencies.agency_name")
          .select("users.user_id", "users.user_name");
      }
      query = query.select("reserve_log.table_pk", "reserve_log.prefix_pk", "reserve_log.user_pk", "reserve_log.reserve_name", "reserve_log.id_card", "reserve_log.phone_number", "reserve_log.reserve_no", "reserve_log.reserve_type", "reserve_log.status", "reserve_log.agency_id")
        .select(db.raw("TO_CHAR(reserve_log.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"), db.raw("TO_CHAR(reserve_log.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .select("prefix.prefix_str", "prefix.suffix_str")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findReserveLogCountByPrefix(prefix_pk, reserve_type) {
    try {
      let query = db(this.T_RESERVE_LOG);
      if (prefix_pk !== 0) {
        query = query.where("prefix_pk", prefix_pk);
      }
      if (reserve_type !== undefined) {
        query = query.where("reserve_type", reserve_type);
      }
      query = query.count({ total: "*" }).first();
      const ret = await query;
      return ret.total;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findReserveLogByPk(table_pk) {
    try {
      const query = db(this.T_RESERVE_LOG)
        .where("table_pk", table_pk)
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findReserveLogByFilter(filter) {
    try {
      const query = db(this.T_RESERVE_LOG)
        .where(filter)
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findReserveLogCountByFilter(filter) {
    try {
      let query = db(this.T_RESERVE_LOG)
        .where(filter);
      query = query.count({ total: "*" }).first();
      const ret = await query;
      return ret.total;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findReserveLogWithUserNameByPk(table_pk) {
    try {
      const query = db(`${this.T_RESERVE_LOG} as reserve_log`)
        .leftJoin(`${this.T_USERS} as users`, "reserve_log.user_pk", "users.user_pk")
        .where("table_pk", table_pk)
        .select("reserve_log.prefix_pk", "reserve_log.user_pk", "reserve_log.reserve_name", "reserve_log.id_card", "reserve_log.phone_number", "reserve_log.reserve_no", "reserve_log.reserve_type", "reserve_log.status")
        .select("users.user_id");
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async getMaxReserveNoBetween(prefix_pk, start_no, end_no) {
    try {
      const query = db(this.T_RESERVE_LOG)
        .where("prefix_pk", prefix_pk)
        .where("reserve_no", ">=", start_no)
        .where("reserve_no", "<=", end_no)
        .select(db.raw("MAX(reserve_no) max_no"));
      const row = await query.first();
      if (row && row.max_no) {
        return row.max_no + 1;
      }
      if (start_no === 0) {
        return 1;
      }
      return start_no;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findReserveLogInUserIds(user_ids, prefix_pk) {
    try {
      let query = db(`${this.T_RESERVE_LOG} as reserve_log`)
        .leftJoin(`${this.T_USERS} as users`, "reserve_log.user_pk", "users.user_pk")

      query = query.whereIn("users.user_id", user_ids)
        .where("reserve_log.prefix_pk", prefix_pk)
        .where("reserve_log.reserve_type", RESERVE_TYPES.NORMAL);

      query = query.select("reserve_log.user_pk", "reserve_log.reserve_no");
      return await query;
    } catch (err) {
      throw new Error("Error reserve log: " + err.message);
    }
  }

  static async findReserveLogsByPrefixPk(prefix_pk) {
    try {
      let query = db(`${this.T_RESERVE_LOG} as reserve_log`)
        .leftJoin(`${this.T_PREFIX} as prefix`, "reserve_log.prefix_pk", "prefix.prefix_pk")
        .where("reserve_log.prefix_pk", prefix_pk)
        .whereIn("reserve_log.status", [RESERVE_STATUS.RESERVED, RESERVE_STATUS.SALED]);

      query = query.select("reserve_log.table_pk", "reserve_log.user_pk", "reserve_log.reserve_name", "reserve_log.id_card", "reserve_log.phone_number", "reserve_log.reserve_no", "reserve_log.agency_id")
        .select(db.raw("TO_CHAR(reserve_log.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
        .select("prefix.prefix_str", "prefix.suffix_str", "prefix.product_name");
      return await query;
    } catch (err) {
      throw new Error("Error reserve log: " + err.message);
    }
  }

  static async findReserveLogsForPhoneSale(prefix_pks, agency_id) {
    try {
      const query = db(this.T_RESERVE_LOG)
        .whereIn("prefix_pk", prefix_pks)
        .where("agency_id", agency_id)
        .select(db.raw("DISTINCT(user_pk)"));
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addReserveLog(params) {
    try {
      const now = new Date();
      const query = db(this.T_RESERVE_LOG)
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

  static async editReserveLog(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_RESERVE_LOG)
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

  static async editReserveLogs(params, table_pks) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_RESERVE_LOG)
        .whereIn("table_pk", table_pks)
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async deleteReserveLog(table_pk) {
    try {
      const rowCount = await db(this.T_RESERVE_LOG)
        .where("table_pk", table_pk)
        .del();
      
      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }

  static async findReserveSmsLogs(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, product_pk, product_name, agency_id, status } = filter;

      let query = db(`${this.T_SMS_LOG} as sms_log`)
        .leftJoin(`${this.T_PRODUCTS} as products`, "sms_log.product_pk", "products.product_pk")
        .leftJoin(`${this.T_P_S_AGENCIES} as agencies`, "sms_log.agency_id", "agencies.agency_id")
        .leftJoin(`${this.T_USERS} as users`, "sms_log.user_pk", "users.user_pk");

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(sms_log.phone_imei)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(sms_log.reserve_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(sms_log.id_card)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(sms_log.phone_number)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(sms_log.product_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(sms_log.reserve_code)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(products.product_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(agencies.agency_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere("sms_log.user_pk", "like", `${lowerKeyword}`);
        });
      }
      if (product_pk) {
        query = query.where("sms_log.product_pk", product_pk);
      }
      if (product_name) {
        query = query.where("sms_log.product_name", product_name);
      }
      if (+agency_id !== 0 && agency_id !== undefined) {
        query = query.where("sms_log.agency_id", agency_id);
      }
      if (status !== undefined && status !== "") {
        query = query.where("sms_log.status", status);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }
      query = query.orderBy("sms_log.reserve_code", "desc");

      query = query.select("sms_log.table_pk", "sms_log.product_pk", "sms_log.phone_imei", "sms_log.reserve_name", "sms_log.id_card", "sms_log.phone_number", "sms_log.province_name", "sms_log.agency_id", "sms_log.product_name", "sms_log.status", "sms_log.reserve_code")
        .select(db.raw("TO_CHAR(sms_log.created_at, 'YYYY-MM-DD') created_at"))
        .select("products.simple_name as phone_name")
        .select("agencies.agency_name")
        .select("users.user_pk", "users.user_id", "users.user_name")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findReserveSmsLogByFilter(filter) {
    try {
      let query = db(`${this.T_SMS_LOG} as sms_log`)
        .where(filter)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findReserveSmsLogByImei(phone_imei) {
    try {
      let query = db(`${this.T_SMS_LOG} as sms_log`)
        .where("phone_imei", phone_imei)
        .whereIn("status", [RESERVE_SMS_STATUS.RESERVED, RESERVE_SMS_STATUS.SALE_FINISH])
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findReserveSmsLogInImeis(imeis) {
    try {
      let query = db(`${this.T_SMS_LOG} as sms_log`)
        .whereIn("phone_imei", imeis);
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addReserveSmsLog(params) {
    try {
      const now = new Date();
      const query = db(this.T_SMS_LOG)
        .insert({
          ...params,
          created_at: now,
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

  static async editReserveSmsLog(params) {
    try {
      const rowCount = await db(this.T_SMS_LOG)
        .where("table_pk", params.table_pk)
        .update(params);
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async deleteReserveSmsLog(table_pk) {
    try {
      const rowCount = await db(this.T_SMS_LOG)
        .where("table_pk", table_pk)
        .del();

      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }

  static async findReserveSmsUsageProducts() {
    try {
      let query1 = db(`${this.T_SMS_LOG} as sms_log`)
        .select(db.raw("DISTINCT(product_pk)"));
      query1 = query1.as("T1");

      let query2 = db(query1)
        .leftJoin(`${this.T_PRODUCTS} as products`, "T1.product_pk", "products.product_pk");

      query2 = query2.select("products.product_pk", "products.simple_name");
      return await query2;
    } catch (err) {
      throw new Error("Error reserve log: " + err.message);
    }
  }

  static async findReserveSmsReserveProducts() {
    try {
      let query = db(`${this.T_SMS_LOG} as sms_log`)
        .select(db.raw("DISTINCT(product_name)"));
      return await query;
    } catch (err) {
      throw new Error("Error reserve log: " + err.message);
    }
  }

  static async findOldMobileProducts(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword } = filter;

      let query = db(`${this.T_OLD_PRODUCTS} as products`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(products.mobile_name)"), "like", `%${lowerKeyword}%`);
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

      query = query.select("products.mobile_pk", "products.mobile_name")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findOldReservePrefixes(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword } = filter;

      let query = db(`${this.T_OLD_PREFIXES} as prefixes`)
        .leftJoin(`${this.T_OLD_PRODUCTS} as products`, "prefixes.mobile_pk", "products.mobile_pk");

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(prefixes.prefix)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(prefixes.description)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(products.mobile_name)"), "like", `%${lowerKeyword}%`);
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

      query = query.select("prefixes.pk", "prefixes.prefix", "prefixes.suffix", "prefixes.mobile_pk", "prefixes.description", "prefixes.normal_cnt", "prefixes.reward_cnt")
        .select(db.raw("TO_CHAR(prefixes.start_at, 'YYYY-MM-DD') start_at"), db.raw("TO_CHAR(prefixes.end_at, 'YYYY-MM-DD') end_at"), db.raw("TO_CHAR(prefixes.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
        .select("products.mobile_name")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findOldReserveSimplePrefixes() {
    try {
      const query = db(`${this.T_OLD_PREFIXES} as prefixes`)
        .leftJoin(`${this.T_OLD_PRODUCTS} as products`, "prefixes.mobile_pk", "products.mobile_pk")
        .select("prefixes.pk", "prefixes.prefix", "prefixes.suffix")
        .select("products.mobile_name");

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findOldReservePrefixByPk(pk) {
    try {
      const query = db(`${this.T_OLD_PREFIXES} as prefixes`)
        .where("pk", pk)
        .first();

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findOldReservePrefixByFilter(filter) {
    try {
      const query = db(`${this.T_OLD_PREFIXES} as prefixes`)
        .where(filter)
        .first();

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findOldReservePrefixWithProductByPrefixAndSuffix(prefix, suffix) {
    try {
      let query = db(`${this.T_OLD_PREFIXES} as prefixes`)
        .leftJoin(`${this.T_OLD_PRODUCTS} as products`, "prefixes.mobile_pk", "products.mobile_pk")
        .where("prefixes.prefix", prefix);
      if (suffix) {
        query = query.where("prefixes.suffix", suffix);
      } else {
        query = query.whereNull("prefixes.suffix");
      }
      query = query.select("prefixes.prefix", "prefixes.suffix", "prefixes.normal_cnt", "prefixes.reward_cnt")
        .select("products.mobile_name")
        .first();

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findOldReservePrefixWithProductByPk(pk) {
    try {
      const query = db(`${this.T_OLD_PREFIXES} as prefixes`)
        .leftJoin(`${this.T_OLD_PRODUCTS} as products`, "prefixes.mobile_pk", "products.mobile_pk")
        .where("pk", pk)
        .select("prefixes.prefix", "prefixes.suffix", "prefixes.normal_cnt", "prefixes.reward_cnt")
        .select("products.mobile_name")
        .first();

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async addOldReservePrefix(params) {
    try {
      const now = new Date();
      const query = db(this.T_OLD_PREFIXES)
        .insert({
          ...params,
          pk: db.raw(`${this.T_OLD_PREFIXES}_S.nextval`),
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

  static async editOldReservePrefix(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_OLD_PREFIXES)
        .where({ pk: params.pk })
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findOldReservations(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, prefix, suffix, user_userid } = filter;

      let query = db(`${this.T_OLD_RESERVATIONS} as reservations`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(reservations.user_userid)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(reservations.prefix)"), "like", `%${lowerKeyword}%`);
        });
      }
      if (prefix) {
        query = query.where("reservations.prefix", prefix);
      }
      if (suffix) {
        query = query.where("reservations.suffix", suffix);
      } else {
        query = query.whereNull("reservations.suffix");
      }
      if (user_userid) {
        query = query.where("reservations.user_userid", user_userid);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      query = query.select("reservations.pk", "reservations.user_userid", "reservations.reserve_cnt", "reservations.prefix", "reservations.suffix")
        .select(db.raw("TO_CHAR(reservations.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findOldReservationsInUserIds(prefix, suffix, user_ids) {
    try {
      let query = db(`${this.T_OLD_RESERVATIONS} as reservations`)
        .where("reservations.prefix", prefix);
      if (suffix) {
        query = query.where("reservations.suffix", suffix);
      } else {
        query = query.whereNull("reservations.suffix");
      }
      query = query.whereIn("reservations.user_userid", user_ids)
        .select("reservations.user_userid");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addOldReservations(params, user_ids) {
    try {
      const now = new Date();
      let rows = [];
      user_ids.map(user_userid => rows = [...rows, {
        ...params,
        user_userid,
        created_at: now,
        updated_at: now,
      }]);

      const query = db(this.T_OLD_RESERVATIONS)
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

  static async findOldReserveLogs(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, prefix, suffix, reserve_type, user_userid } = filter;

      let query = db(`${this.T_OLD_RESERVE_LOG} as reserve_log`);
      if (suffix) {
        query = query.leftJoin(`${this.T_OLD_PREFIXES} as prefixes`, function() {
          this.on("reserve_log.prefix", "prefixes.prefix")
            .andOn("reserve_log.suffix", "prefixes.suffix");
        });
      } else {
        query = query.leftJoin(`${this.T_OLD_PREFIXES} as prefixes`, function() {
          this.on("reserve_log.prefix", "prefixes.prefix")
            .andOnNull("prefixes.suffix");
        });
      }
      query = query.leftJoin(`${this.T_OLD_PRODUCTS} as products`, "prefixes.mobile_pk", "products.mobile_pk")
        .leftJoin(`${this.T_CUSTOMERS} as customers`, "reserve_log.user_userid", "customers.user_userid");

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(reserve_log.user_userid)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(reserve_log.name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(reserve_log.citizen_no)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(reserve_log.mobile_phone)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(reserve_log.prefix)"), "like", `%${lowerKeyword}%`)
        });
      }
      if (prefix) {
        query = query.where("reserve_log.prefix", prefix);
      }
      if (suffix) {
        query = query.where("reserve_log.suffix", suffix);
      } else {
        query = query.whereNull("reserve_log.suffix");
      }
      if (user_userid) {
        query = query.where("reserve_log.user_userid", user_userid);
      }
      if (reserve_type !== undefined && reserve_type !== "") {
        query = query.where("reserve_log.reserve_type", reserve_type);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      query = query.select("reserve_log.pk", "reserve_log.user_userid", "reserve_log.name", "reserve_log.citizen_no", "reserve_log.mobile_phone", "reserve_log.prefix", "reserve_log.suffix", "reserve_log.reserve_no", "reserve_log.reserve_type")
        .select(db.raw("TO_CHAR(reserve_log.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
        .select("products.mobile_name")
        .select("customers.user_name", "customers.user_pk")
        .select("prefixes.pk as prefix_pk")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findOldReserveLogByPk(pk) {
    try {
      let query = db(`${this.T_OLD_RESERVE_LOG} as reserve_log`)
        .where("reserve_log.pk", pk)
        .select("reserve_log.user_userid", "reserve_log.prefix", "reserve_log.suffix", "reserve_log.name", "reserve_log.citizen_no", "reserve_log.mobile_phone", "reserve_log.reserve_no", "reserve_log.reserve_type");
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async getMaxOldReserveNoByPrefix(prefix, suffix) {
    try {
      let query = db(`${this.T_OLD_RESERVE_LOG} as reserve_log`)
        .where("reserve_log.prefix", prefix);
      if (suffix) {
        query = query.where("reserve_log.suffix", suffix);
      } else {
        query = query.whereNull("reserve_log.suffix");
      }
      query = query.select(db.raw("MAX(reserve_log.reserve_no) max_no"));
      const row = await query.first();
      if (row) {
        return row.max_no;
      }
      return 0;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addOldReserveLog(params) {
    try {
      const now = new Date();
      const query = db(this.T_OLD_RESERVE_LOG)
        .insert({
          ...params,
          pk: db.raw(`${this.T_OLD_RESERVE_LOG}_S.nextval`),
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

  static async editOldReserveLog(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_OLD_RESERVE_LOG)
        .where({ pk: params.pk })
        .update({
          ...params,
          updated_at: now,
        });

      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async deleteOldReserveLog(pk) {
    try {
      const rowCount = await db(this.T_OLD_RESERVE_LOG)
        .where("pk", pk)
        .del();

      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }
}

module.exports = ReserveModel;
