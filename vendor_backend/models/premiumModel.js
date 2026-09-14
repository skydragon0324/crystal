const moment = require('moment');
const db = require('../db/knex');
const { FLAG_EXIST, GOODS_TYPE_ACTIVITY_POINT, PHONE_REG_MAX_POINTS, EPROD_REG_MAX_POINTS, INTEGRATED_VALUE_RATES, PREMIUM_SERVICE_TYPES, FLAG_TESTER, FLAG_NONE } = require('../constants/constants');

class PremiumModel {
  static T_SERVICES = "ora_pid.premium_services";
  static T_GOODS = "ora_pid.premium_goods";
  static T_LOTTERIES = "ora_pid.lottery_numbers";
  static T_REMAINS = "ora_pid.lottery_remains";
  static T_CANDIDATES = "ora_pid.lottery_candidates";
  static T_SUBMITS = "ora_pid.lottery_submits";
  static T_PIONT_AWARDS = "ora_pid.premium_point_awards";
  static T_USER_VALUES = "ora_pid.premium_user_values";
  static T_USER_CLASS = "ora_pid.premium_user_class";
  static T_DELIVERY_ADDRESS = "ora_pid.user_delivery_address";
  static T_MAT_DELIVERIES = "ora_pid.premium_material_deliveries";
  static T_MAT_AGENCIES = "ora_pid.premium_material_agencies";
  static T_INT_VALUES = "ora_pid.integrated_user_values";
  static T_INT_CLASS = "ora_pid.integrated_user_class";
  static T_DISCUSS_AWARDS = "ora_pid.premium_discuss_awards";
  static T_RECEPTIONS = "ora_pid.premium_receptions";
  static T_QUESTIONS = "ora_pid.puzzle_questions";
  static T_CHOICES = "ora_pid.puzzle_choices";
  static T_RESPONSES = "ora_pid.puzzle_responses";
  static T_PUZZ_AWARDS = "ora_pid.puzzle_awards";
  static T_PUZZ_BONUS = "ora_pid.puzzle_bonus";
  static T_USERS = "ora_pid.users";
  static T_LOC = "ora_pid.locations";

  static async findPremiumServices(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, max_at, is_deleted, include_test, is_client, is_now } = filter;

      let query = db(`${this.T_SERVICES} as services`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(services.service_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(services.service_description)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(services.publish_num)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(services.service_note)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("services.is_deleted", is_deleted);
      }

      if (max_at !== undefined && max_at != "") {
        query = query.where(db.raw("TO_CHAR(services.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
      }

      if (include_test !== FLAG_TESTER) {
        query = query.where("services.is_test", FLAG_NONE);
      }

      if (is_now === 1) {
        const today = moment().format("YYYY-MM-DD");
        query = query.where(db.raw("TO_CHAR(services.lottery_start_date, 'YYYY-MM-DD')"), "<=", today)
          .where(db.raw("TO_CHAR(services.service_disp_date, 'YYYY-MM-DD')"), ">=", today);
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
        query = query.select(db.raw("TO_CHAR(services.follow_start_date, 'YYYY-MM-DD') follow_start_date"));
      } else {
        query = query.select(db.raw("TO_CHAR(services.follow_start_date, 'YYYY-MM-DD HH24:MI:SS') follow_start_date"))
          .select("services.service_note");
      }
      query = query.select("services.service_pk", "services.service_name", "services.service_description", "services.publish_num", "services.service_type", "services.image_url", "image_status", "services.is_deleted", "services.goods_description", "services.is_test")
        .select(db.raw("TO_CHAR(services.lottery_start_date, 'YYYY-MM-DD') lottery_start_date"), db.raw("TO_CHAR(services.lottery_end_date, 'YYYY-MM-DD') lottery_end_date"), db.raw("TO_CHAR(services.follow_end_date, 'YYYY-MM-DD') follow_end_date"), db.raw("TO_CHAR(services.service_disp_date, 'YYYY-MM-DD') service_disp_date"), db.raw("TO_CHAR(services.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findPremiumSimpleServices(offset, limit, filter) {
    try {
      const { service_types } = filter;
      let query = db(`${this.T_SERVICES} as services`);

      if (service_types && service_types.length > 0) {
        query = query.whereIn("service_type", service_types);
      }
      
      query = query.orderBy("lottery_end_date", "desc");

      query = query.select("services.service_pk", "services.service_name")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findPremiumServiceByPk(service_pk) {
    try {
      const query = db(this.T_SERVICES)
        .where("service_pk", service_pk);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPremiumServiceFollowTimeByPk(service_pk) {
    try {
      const query = db(this.T_SERVICES)
        .where("service_pk", service_pk)
        .select(db.raw("TO_CHAR(follow_start_date, 'YYYY-MM-DD HH24:MI:SS') follow_start_time"));
      const row = await query.first();
      if (row) {
        return row.follow_start_time;
      }
      return "";
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPremiumAvailableServiceByPk(service_pk) {
    try {
      const today = moment().format("YYYY-MM-DD");
      const query = db(this.T_SERVICES)
        .where("service_pk", service_pk)
        .where(db.raw("TO_CHAR(lottery_start_date, 'YYYY-MM-DD')"), "<=", today)
        .where(db.raw("TO_CHAR(lottery_end_date, 'YYYY-MM-DD')"), ">=", today)
        .where("is_deleted", FLAG_EXIST);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPremiumServiceAwardableForNow() {
    try {
      const today = moment().format("YYYY-MM-DD");
      const query = db(this.T_SERVICES)
        .where(db.raw("TO_CHAR(lottery_end_date, 'YYYY-MM-DD')"), "<", today)
        .where(db.raw("TO_CHAR(service_disp_date, 'YYYY-MM-DD')"), ">=", today)
        .where("is_deleted", FLAG_EXIST);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPremiumServiceNowByType(service_type) {
    try {
      const today = moment().format("YYYY-MM-DD");
      const query = db(this.T_SERVICES)
        .where("service_type", service_type)
        .where(db.raw("TO_CHAR(lottery_end_date, 'YYYY-MM-DD')"), "<", today)
        .where(db.raw("TO_CHAR(service_disp_date, 'YYYY-MM-DD')"), ">=", today);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addPremiumService(params) {
    try {
      const now = new Date();
      const query = db(this.T_SERVICES)
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

  static async editPremiumService(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_SERVICES)
        .where("service_pk", params.service_pk)
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findPremiumGoods(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, min_at, max_at, is_deleted, is_client, service_pk, class_pk } = filter;

      let query = db(`${this.T_GOODS} as goods`);
      if (is_client !== 1) {
        query = query.leftJoin(`${this.T_SERVICES} as services`, "goods.service_pk", "services.service_pk")
          .leftJoin(`${this.T_USER_CLASS} as classes`, "goods.class_pk", "classes.class_pk");
      }

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(goods.goods_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(goods.goods_note)"), "like", `%${lowerKeyword}%`);
          if (is_client !== 1) {
            this.orWhere(db.raw("LOWER(services.service_name)"), "like", `%${lowerKeyword}%`);
          }
        });
      }

      if (min_at !== undefined && min_at !== "") {
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(goods.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function() {
                this.where("goods.is_deleted", FLAG_EXIST)
                  .where(db.raw("TO_CHAR(goods.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
              });
          });
        } else {
          query = query.where("goods.is_deleted", FLAG_EXIST)
            .where(db.raw("TO_CHAR(goods.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (is_deleted !== undefined && is_deleted !== "") {
          query = query.where("goods.is_deleted", is_deleted);
        }

        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(goods.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
        }
      }

      if (service_pk) {
        query = query.where("goods.service_pk", service_pk);
      }

      if (class_pk) {
        query = query.where("goods.class_pk", class_pk);
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
        query = query.select("goods.related_pk", "goods.goods_note", "goods.real_count")
          .select("services.service_name")
          .select("classes.class_name");
      }
      query = query.select("goods.goods_pk", "goods.service_pk", "goods.goods_name", "goods.goods_type", "goods.price", "goods.points", "goods.class_pk", "goods.fake_count", "goods.is_deleted")
        .select(db.raw("TO_CHAR(goods.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findPremiumSimpleGoods(offset, limit, filter) {
    try {
      const { service_pk, class_pk, goods_type } = filter;
      let query = db(`${this.T_GOODS} as goods`);

      if (service_pk) {
        query = query.where("goods.service_pk", service_pk);
      }

      if (class_pk) {
        query = query.where("goods.class_pk", class_pk);
      }

      if (goods_type) {
        query = query.where("goods.goods_type", goods_type);
      }

      query = query.orderBy("goods.price", "desc");

      query = query.select("goods.goods_pk", "goods.goods_name")
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findPremiumGoodByPk(goods_pk) {
    try {
      const query = db(this.T_GOODS)
        .where("goods_pk", goods_pk);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPremiumHonorCount(service_pk) {
    try {
      const query = db(this.T_GOODS)
        .where("service_pk", service_pk)
        .select(db.raw("SUM(real_count) count"));
      const row = await query.first();
      if (row) {
        return row.count;
      }
      return 0;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addPremiumGood(params) {
    try {
      const now = new Date();
      const query = db(this.T_GOODS)
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

  static async editPremiumGood(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_GOODS)
        .where("goods_pk", params.goods_pk)
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findPremiumUserClasses(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, min_at, max_at, is_deleted, service_pk, is_client } = filter;

      let query = db(`${this.T_USER_CLASS} as classes`);
      if (is_client !== 1) {
        query = query.leftJoin(`${this.T_SERVICES} as services`, "classes.service_pk", "services.service_pk");
      }

      if (keyword && is_client !== 1) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(classes.class_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(services.service_name)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (min_at !== undefined && min_at !== "") {
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(classes.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function() {
                this.where("classes.is_deleted", FLAG_EXIST)
                .where(db.raw("TO_CHAR(classes.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
              });
          });
        } else {
          query = query.where("classes.is_deleted", FLAG_EXIST)
            .where(db.raw("TO_CHAR(classes.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (is_deleted !== undefined && is_deleted !== "") {
          query = query.where("classes.is_deleted", is_deleted);
        }

        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(classes.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
        }
      }

      if (service_pk) {
        query = query.where("classes.service_pk", service_pk);
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
        query = query.select("classes.start_value", "classes.end_value")
          .select("services.service_name");
      }
      query = query.select("classes.class_pk", "classes.service_pk", "classes.class_name", "classes.lottery_min_num", "classes.lottery_max_num", "classes.is_deleted")
        .select(db.raw("TO_CHAR(classes.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findPremiumSimpleClasses(service_pk) {
    try {
      let query = db(this.T_USER_CLASS)
        .where("service_pk", service_pk)
        .orderBy("start_value", "desc");

      query = query.select("class_pk", "class_name");

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findPremiumUserClassByPk(class_pk) {
    try {
      const query = db(this.T_USER_CLASS)
        .where("class_pk", class_pk);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPremiumUserClassByFilter(filter) {
    try {
      const query = db(this.T_USER_CLASS)
        .where(filter);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPremiumLastUserClassByServicePk(service_pk) {
    try {
      const query = db(this.T_USER_CLASS)
        .where("service_pk", service_pk)
        .orderBy("start_value", "asc")
        .select("lottery_min_num", "lottery_max_num");
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPremiumUserClassLotteryNumberPeriod(service_pk) {
    try {
      const query = db(this.T_USER_CLASS)
        .where("service_pk", service_pk)
        .min({ lottery_min_num: "lottery_min_num"})
        .max({ lottery_max_num: "lottery_max_num"});
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addPremiumUserClass(params) {
    try {
      const now = new Date();
      const query = db(this.T_USER_CLASS)
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

  static async editPremiumUserClass(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_USER_CLASS)
        .where("class_pk", params.class_pk)
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findPremiumUserValues(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, service_pk, class_name, user_pk } = filter;

      let query = db(`${this.T_USER_VALUES} as user_values`)
        .leftJoin(`${this.T_SERVICES} as services`, "user_values.service_pk", "services.service_pk")
        .leftJoin(`${this.T_USERS} as users`, "user_values.user_pk", "users.user_pk")
        // .leftJoin(`${this.T_USER_CLASS} as classes`, function() { // dont join user_class table for speed up
        //   this.on("user_values.user_value", ">=", "classes.start_value")
        //     .andOn("user_values.user_value", "<", "classes.end_value");
        // });

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere("users.user_pk", "like", `${lowerKeyword}`);
        });
      }

      if (service_pk) {
        query = query.where("user_values.service_pk", service_pk);
      }
      if (class_name) {
        query = query.where("user_values.class_name", class_name);
      }
      if (user_pk) {
        query = query.where("user_values.user_pk", user_pk);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      query = query.select("user_values.table_pk", "user_values.service_pk", "user_values.user_pk", "user_values.user_value", "user_values.commerce_value", "user_values.exp_value", "user_values.soft_points", "user_values.phone_reg_points", "user_values.eprod_reg_points", "user_values.activity_points", "user_values.class_name")
        .select(db.raw("TO_CHAR(user_values.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .select("services.service_name")
        .select("users.user_id", "users.user_name")
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findPremiumUserValueByFilter(filter, is_client) {
    try {
      let query = db(this.T_USER_VALUES)
        .where(filter);
      if (is_client === 1) {
        query = query.select("user_pk", "user_value", "class_name");
      }
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPremiumLotteryPeriodByFilter(service_pk, user_pk) {
    try {
      let query = db(`${this.T_USER_VALUES} as user_values`)
        .leftJoin(`${this.T_USER_CLASS} as classes`, function() {
          this.on("user_values.service_pk", "classes.service_pk")
            .andOn("user_values.user_value", ">=", "classes.start_value")
            .andOn("user_values.user_value", "<", "classes.end_value");
        })
        .where("user_values.service_pk", service_pk)
        .where("user_values.user_pk", user_pk)
        .select("classes.lottery_min_num", "classes.lottery_max_num");
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findUserDeliveryAddresses(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, is_deleted, parent_location_code, user_pk, service_pk } = filter;

      let query = db(`${this.T_DELIVERY_ADDRESS} as addresses`)
        .leftJoin(`${this.T_USERS} as users`, "addresses.user_pk", "users.user_pk")
        .leftJoin(`${this.T_LOC} as loc`, "addresses.location_pk", "loc.location_pk")
        .leftJoin(`${this.T_LOC} as parent_loc`, "loc.parent_code", "parent_loc.location_code")
        .leftJoin(`${this.T_LOC} as grand_loc`, "parent_loc.parent_code", "grand_loc.location_code")
        .leftJoin(`${this.T_SERVICES} as services`, "addresses.service_pk", "services.service_pk");

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(addresses.receptionist)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(addresses.phone_numbers)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(addresses.location_environs)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("TRIM((grand_loc.location_name || ' ' || parent_loc.location_name || ' ' || loc.location_name || ' ' || addresses.location_more))"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(addresses.id_card)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere("users.user_pk", "like", `${lowerKeyword}`);
        });
      }

      if (parent_location_code) {
        query = query.where("loc.location_code", "like", `%${parent_location_code}`);
      }

      if (user_pk) {
        query = query.where("addresses.user_pk", user_pk);
      }

      if (service_pk) {
        query = query.where("addresses.service_pk", service_pk);
      }

      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("addresses.is_deleted", is_deleted);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      query = query.select("addresses.delivery_pk", "addresses.service_pk", "addresses.user_pk", "addresses.receptionist", "addresses.location_pk", "addresses.location_more", "addresses.location_environs", "addresses.phone_numbers", "addresses.id_card", "addresses.is_deleted")
        .select(db.raw("TO_CHAR(addresses.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .select("loc.location_code", "loc.parent_code", db.raw("TRIM((grand_loc.location_name || ' ' || parent_loc.location_name || ' ' || loc.location_name)) as location_name"))
        .select("users.user_id", "users.user_name")
        .select("services.service_name")
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findUserDeliveryAddressByPk(delivery_pk) {
    try {
      const query = db(this.T_DELIVERY_ADDRESS)
        .where("delivery_pk", delivery_pk);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findUserDeliveryAddressByFilter(filter) {
    try {
      const query = db(this.T_DELIVERY_ADDRESS)
        .where(filter);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addUserDeliveryAddress(params) {
    try {
      const now = new Date();
      const query = db(this.T_DELIVERY_ADDRESS)
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

  static async editUserDeliveryAddress(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_DELIVERY_ADDRESS)
        .where("delivery_pk", params.delivery_pk)
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findLotteryNumbers(filter, isCount = false) {
    try {
      const { offset, limit, sort, user_pk, service_pk, goods_type, class_name, keyword, is_deleted, is_client } = filter;

      let query = db(`${this.T_LOTTERIES} as lotteries`)
        .leftJoin(`${this.T_USERS} as users`, "lotteries.user_pk", "users.user_pk")
        .leftJoin(`${this.T_GOODS} as goods`, "lotteries.goods_pk", "goods.goods_pk");

      if (is_client !== 1) {
        query = query.leftJoin(`${this.T_SERVICES} as services`, "lotteries.service_pk", "services.service_pk")
          .leftJoin(`${this.T_USER_VALUES} as user_values`, function() {
            this.on("lotteries.service_pk", "user_values.service_pk")
              .andOn("lotteries.user_pk", "user_values.user_pk");
          }
        );
      }

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(lotteries.lottery_number)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(goods.goods_name)"), "like", `%${lowerKeyword}%`);
          if (is_client !== 1) {
            this.orWhere(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
              .orWhere("users.user_pk", "like", `${lowerKeyword}`);
          }
        });
      }

      if (user_pk) {
        query = query.where("lotteries.user_pk", user_pk);
      }
      if (service_pk) {
        query = query.where("lotteries.service_pk", service_pk);
      }
      if (goods_type) {
        query = query.where("goods.goods_type", goods_type);
      }
      if (is_client !== 1 && class_name) {
        query = query.where("user_values.class_name", class_name);
      }
      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("lotteries.is_deleted", is_deleted);
      }
      if (is_client === 1) {
        query = query.whereNotNull("lotteries.lottery_number")
          .whereNotNull("lotteries.goods_pk");
      } else {
        query = query.where("services.service_type", PREMIUM_SERVICE_TYPES.YEAREND_2025);
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
        query = query.select("lotteries.goods_pk")
          .select(db.raw("TO_CHAR(lotteries.award_at, 'YYYY-MM-DD HH24:MI:SS') award_at"), db.raw("TO_CHAR(lotteries.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
          .select("services.service_name")
          .select("users.user_name")
          .select("user_values.class_name")
          .select("goods.goods_type", "goods.price", "goods.points");
      }

      query = query.select("lotteries.lottery_pk", "lotteries.service_pk", "lotteries.user_pk", "lotteries.lottery_number", "lotteries.is_deleted")
        .select(db.raw("TO_CHAR(lotteries.lottery_at, 'YYYY-MM-DD HH24:MI:SS') lottery_at"))
        .select("users.user_id")
        .select("goods.goods_name")
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findLotteryNumberByPk(lottery_pk) {
    try {
      const query = db(this.T_LOTTERIES)
        .where("lottery_pk", lottery_pk);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findLotteryNumberByFilter(filter) {
    try {
      const query = db(this.T_LOTTERIES)
        .where(filter);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findLotteryAwardByFilter(service_pk, user_pk) {
    try {
      let query = db(`${this.T_LOTTERIES} as lotteries`)
        .leftJoin(`${this.T_GOODS} as goods`, "lotteries.goods_pk", "goods.goods_pk")
        .where("lotteries.user_pk", user_pk)
        .where("lotteries.service_pk", service_pk)
        .select("lotteries.lottery_number", "lotteries.goods_pk")
        .select(db.raw("TO_CHAR(lotteries.award_at, 'YYYY-MM-DD HH24:MI:SS') award_at"))
        .select("goods.goods_name", "goods.goods_type", "goods.is_deleted");
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findLotteryNumberCount(service_pk, min_num, max_num) {
    try {
      const query = db(this.T_LOTTERIES)
        .where("service_pk", service_pk)
        .where("lottery_number", "<", max_num)
        .where("lottery_number", ">=", min_num)
        .count({ total: "*" });

      const row = await query.first();
      if (row) {
        return row.total;
      }
      return 0;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findSelectedLotteryNumbers(filter, isCount = false) {
    try {
      const { min_num, max_num, service_pk } = filter;

      let query = db(`${this.T_LOTTERIES} as lotteries`);

      if (service_pk) {
        query = query.where("lotteries.service_pk", service_pk);
      }
      query = query.whereNotNull("lotteries.lottery_number");

      if (min_num) {
        query = query.where("lotteries.lottery_number", ">=", min_num);
      }
      if (max_num) {
        query = query.where("lotteries.lottery_number", "<=", max_num);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query = query.orderBy("lotteries.lottery_number", "asc");

      query = query.select("lotteries.lottery_number");

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async addLotteryNumber(params) {
    try {
      const now = new Date();
      const query = db(this.T_LOTTERIES)
        .insert({
          ...params,
          lottery_at: now,
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

  static async editLotteryNumber(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_LOTTERIES)
        .where("lottery_pk", params.lottery_pk)
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findRemainLotteryNumbers(offset, limit, filter, isCount = false) {
    try {
      const { service_pk, min_num, max_num } = filter;

      let query = db(`${this.T_REMAINS} as remains`);

      if (service_pk) {
        query = query.where("remains.service_pk", service_pk);
      }
      if (min_num) {
        query = query.where("remains.lottery_number", ">=", min_num);
      }
      if (max_num) {
        query = query.where("remains.lottery_number", "<=", max_num);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query = query.orderBy("remains.lottery_number", "asc");
      query = query.select("remains.lottery_number")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findRandomNonDupLotteryNumber(service_pk, min_num, max_num, offset) {
    try {
      let query = db(`${this.T_REMAINS} as remains`);

      if (service_pk) {
        query = query.where("remains.service_pk", service_pk);
      }
      if (min_num) {
        query = query.where("remains.lottery_number", ">=", min_num);
      }
      if (max_num) {
        query = query.where("remains.lottery_number", "<=", max_num);
      }

      query = query.select("remains.lottery_number")
        .offset(offset);

      const row = await query.first();
      if (row) {
        return row.lottery_number;
      }
      return 0;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addRemainLotteryNumber(params) {
    try {
      const now = new Date();
      const query = db(this.T_REMAINS)
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

  static async deleteRemainLotteryNumber(service_pk, lottery_number) {
    try {
      const rowCount = await db(this.T_REMAINS)
        .where("service_pk", service_pk)
        .where("lottery_number", lottery_number)
        .del();

      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }

  static async findLotteryCandidates(filter, isCount = false) {
    try {
      const { offset, limit, sort, user_pk, min_at, max_at, service_pk, class_pk, keyword, is_deleted, is_client } = filter;

      let query = db(`${this.T_CANDIDATES} as candidates`);

      if (is_client !== 1) {
        query = query.leftJoin(`${this.T_USERS} as users`, "candidates.user_pk", "users.user_pk")
          .leftJoin(`${this.T_SERVICES} as services`, "candidates.service_pk", "services.service_pk")
          .leftJoin(`${this.T_USER_CLASS} as classes`, "candidates.class_pk", "classes.class_pk");
      }

      if (keyword && is_client !== 1) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where("users.user_pk", `${lowerKeyword}`)
            .orWhere(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (min_at !== undefined && min_at !== "") {
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(candidates.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function() {
                this.where("candidates.is_deleted", FLAG_EXIST)
                .where(db.raw("TO_CHAR(candidates.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
              });
          });
        } else {
          query = query.where("candidates.is_deleted", FLAG_EXIST)
            .where(db.raw("TO_CHAR(candidates.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(candidates.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
        }
      }

      if (user_pk) {
        query = query.where("candidates.user_pk", user_pk);
      }
      if (service_pk) {
        query = query.where("candidates.service_pk", service_pk);
      }
      if (class_pk) {
        query = query.where("candidates.class_pk", class_pk);
      }
      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("candidates.is_deleted", is_deleted);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key === "updated_at" ? "candidates.updated_at" : sort.key, sort.dir);
      }

      if (is_client !== 1) {
        query = query.select("services.service_name")
          .select("classes.class_name")
          .select("users.user_id", "users.user_name");
      }

      query = query.select("candidates.table_pk", "candidates.service_pk", "candidates.user_pk", "candidates.class_pk", "candidates.lottery_count", "candidates.is_deleted")
        .select(db.raw("TO_CHAR(candidates.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findLotteryCandidateByPk(table_pk) {
    try {
      const query = db(this.T_CANDIDATES)
        .where("table_pk", table_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findLotteryCandidateByFilter(filter) {
    try {
      const query = db(this.T_CANDIDATES)
        .where(filter)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findLotteryCandidatesInUserPks(filter, user_pks) {
    try {
      const query = db(`${this.T_CANDIDATES} as candidates`)
        .leftJoin(`${this.T_USERS} as users`, "candidates.user_pk", "users.user_pk")
        .where(filter)
        .whereIn("candidates.user_pk", user_pks)
        .select("candidates.user_pk", "users.user_id");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findLotteryCandidateCountForUser(service_pk, user_pk) {
    try {
      const query = db(this.T_CANDIDATES)
        .where("service_pk", service_pk)
        .where("user_pk", user_pk)
        .where("is_deleted", FLAG_EXIST)
        .sum({ lottery_count: "lottery_count"});
      const row = await query.first();
      if (row) {
        return row.lottery_count;
      }
      return 0;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addLotteryCandidates(params, user_pks) {
    try {
      const now = new Date();
      let rows = user_pks.map(user_pk => ({
        ...params,
        user_pk,
        created_at: now,
        updated_at: now,
      }));

      const query = db(this.T_CANDIDATES)
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

  static async editLotteryCandidate(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_CANDIDATES)
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

  static async findLotterySubmits(filter, isCount = false) {
    try {
      const { offset, limit, sort, user_pk, service_pk, goods_type, class_pk, keyword, is_deleted, is_client } = filter;

      let query = db(`${this.T_SUBMITS} as submits`)
        .leftJoin(`${this.T_USERS} as users`, "submits.user_pk", "users.user_pk")
        .leftJoin(`${this.T_GOODS} as goods`, "submits.goods_pk", "goods.goods_pk");

      if (is_client !== 1) {
        query = query.leftJoin(`${this.T_SERVICES} as services`, "submits.service_pk", "services.service_pk")
          .leftJoin(`${this.T_USER_CLASS} as user_class`, "submits.class_pk", "user_class.class_pk");
      }

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(submits.lottery_number)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(goods.goods_name)"), "like", `%${lowerKeyword}%`);
          if (is_client !== 1) {
            this.orWhere(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
              .orWhere("users.user_pk", "like", `${lowerKeyword}`);
          }
        });
      }

      if (user_pk) {
        query = query.where("submits.user_pk", user_pk);
      }
      if (service_pk) {
        query = query.where("submits.service_pk", service_pk);
      }
      if (class_pk) {
        query = query.where("submits.class_pk", class_pk);
      }
      if (goods_type) {
        query = query.where("goods.goods_type", goods_type);
      }
      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("submits.is_deleted", is_deleted);
      }
      if (is_client === 1) {
        query = query.whereNotNull("submits.lottery_number")
          .whereNotNull("submits.goods_pk");
      } else {
        query = query.where("services.service_type", PREMIUM_SERVICE_TYPES.LOTTERY_PERIOD);
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
        query = query
          .select("services.service_name")
          .select("user_class.class_name")
          .select("users.user_name")
          .select("goods.price", "goods.points");
      }

      query = query.select("submits.lottery_pk", "submits.service_pk", "submits.user_pk", "submits.class_pk", "submits.lottery_number", "submits.goods_pk", "submits.is_deleted")
        .select(db.raw("TO_CHAR(submits.lottery_at, 'YYYY-MM-DD HH24:MI:SS') lottery_at"))
        .select(db.raw("TO_CHAR(submits.award_at, 'YYYY-MM-DD HH24:MI:SS') award_at"), db.raw("TO_CHAR(submits.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .select("users.user_id")
        .select("goods.goods_name", "goods.goods_type")
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findLotterySubmitByPk(lottery_pk) {
    try {
      let query = db(`${this.T_SUBMITS}`)
        .where("lottery_pk", lottery_pk);

      return await query.first();
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findLotterySubmitsInNumbers(service_pk, numbers) {
    try {
      let query = db(`${this.T_SUBMITS}`)
        .where("service_pk", service_pk)
        .whereIn("lottery_number", numbers);

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findLotterySubmitsByFilter(filter) {
    try {
      let query = db(`${this.T_SUBMITS}`)
        .where(filter);

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findLotterySubmitByFilter(filter) {
    try {
      let query = db(`${this.T_SUBMITS}`)
        .where(filter);

      return await query.first();
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findLotterySubmitsForClient(filter) {
    try {
      const { service_pk, user_pk, max_at } = filter;

      let query = db(`${this.T_SUBMITS}`)
        .where("service_pk", service_pk)
        .where("user_pk", user_pk);

      if (max_at !== undefined && max_at !== "") {
        query = query.where(db.raw("TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
      }

      query = query.select("lottery_pk", "service_pk", "user_pk", "class_pk", "lottery_number", "is_deleted")
        .select(db.raw("TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findLotterySubmitNumbers(service_pk, min_num, max_num) {
    try {
      let query = db(`${this.T_SUBMITS} as submits`)
        .where("submits.service_pk", service_pk)
        .where("submits.lottery_number", ">=", min_num)
        .where("submits.lottery_number", "<=", max_num)
        .select("submits.lottery_number");

      const rows = await query;
      return rows.map(row => row.lottery_number);
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findSelectedLotterySubmits(filter, isCount = false) {
    try {
      const { min_num, max_num, service_pk } = filter;

      let query = db(`${this.T_SUBMITS} as submits`);

      if (service_pk) {
        query = query.where("submits.service_pk", service_pk);
      }
      query = query.whereNotNull("submits.lottery_number");

      if (min_num) {
        query = query.where("submits.lottery_number", ">=", min_num);
      }
      if (max_num) {
        query = query.where("submits.lottery_number", "<=", max_num);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query = query.orderBy("submits.lottery_number", "asc");

      query = query.select("submits.lottery_number");

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findLotterySubmitAwardsForUser(service_pk, user_pk) {
    try {
      let query = db(`${this.T_SUBMITS} as submits`)
        .leftJoin(`${this.T_GOODS} as goods`, "submits.goods_pk", "goods.goods_pk")
        .where("submits.service_pk", service_pk)
        .where("submits.user_pk", user_pk)
        .select("submits.lottery_pk", "submits.service_pk", "submits.user_pk", "submits.class_pk", "submits.goods_pk", "submits.lottery_number", "submits.is_deleted")
        .select(db.raw("TO_CHAR(submits.lottery_at, 'YYYY-MM-DD HH24:MI:SS') lottery_at"), db.raw("TO_CHAR(submits.award_at, 'YYYY-MM-DD HH24:MI:SS') award_at"), db.raw("TO_CHAR(submits.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .select("goods.goods_name", "goods.goods_type");
      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async addLotterySubmit(params) {
    try {
      const now = new Date();
      const query = db(this.T_SUBMITS)
        .insert({
          ...params,
          lottery_at: now,
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

  static async editLotterySubmit(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_SUBMITS)
        .where("lottery_pk", params.lottery_pk)
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async editLotterySubmitGoods(params, lottery_numbers) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_SUBMITS)
        .where("service_pk", params.service_pk)
        .whereIn("lottery_number", lottery_numbers)
        .update("goods_pk", params.goods_pk)
        .update("updated_at", now);
  
      return rowCount;
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async editLotterySubmitFinish(params, lottery_numbers) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_SUBMITS)
        .where("service_pk", params.service_pk)
        .whereIn("lottery_number", lottery_numbers)
        .update("award_at", params.award_at || now)
        .update("updated_at", now);
  
      return rowCount;
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async findPremiumActivityPointByLottery(service_pk, offset, limit) {
    try {
      let query = db(`${this.T_LOTTERIES} as lotteries`)
        .leftJoin(`${this.T_GOODS} as goods`, "lotteries.goods_pk", "goods.goods_pk");
      
      query = query.where("lotteries.service_pk", service_pk)
        .where("goods.goods_type", GOODS_TYPE_ACTIVITY_POINT);

      query = query.orderBy("goods.price", "desc")
        .orderBy("goods.goods_pk", "asc")
        .orderBy("lotteries.lottery_number", "asc");

      query = query.select("lotteries.lottery_pk", "lotteries.user_pk", "lotteries.lottery_number")
        .select("goods.points")
        .offset(offset)
        .limit(limit);
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findIntegratedUserClasses(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, max_at, is_deleted, service_pk } = filter;

      let query = db(`${this.T_INT_CLASS} as classes`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(classes.class_name)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("classes.is_deleted", is_deleted);
      }

      if (max_at !== undefined && max_at != "") {
        query = query.where(db.raw("TO_CHAR(classes.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
      }

      if (service_pk) {
        query = query.where("classes.service_pk", service_pk);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      query = query.select("classes.class_pk", "classes.class_name", "classes.class_level", "classes.start_value", "classes.end_value", "classes.is_deleted")
        .select(db.raw("TO_CHAR(classes.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findIntegratedSimpleClasses() {
    try {
      let query = db(this.T_INT_CLASS)
        .orderBy("class_level", "asc");

      query = query.select("class_pk", "class_name", "class_level");

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findIntegratedUserClassByPk(class_pk) {
    try {
      const query = db(this.T_INT_CLASS)
        .where("class_pk", class_pk);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findIntegratedUserClassByFilter(filter) {
    try {
      const query = db(this.T_INT_CLASS)
        .where(filter);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addIntegratedUserClass(params) {
    try {
      const now = new Date();
      const query = db(this.T_INT_CLASS)
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

  static async editIntegratedUserClass(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_INT_CLASS)
        .where("class_pk", params.class_pk)
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findIntegratedUserValues(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, class_name, user_pk } = filter;

      let query = db(`${this.T_INT_VALUES} as int_values`)
        .leftJoin(`${this.T_USERS} as users`, "int_values.user_pk", "users.user_pk");

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere("users.user_pk", "like", `${lowerKeyword}`);
        });
      }

      if (class_name) {
        query = query.where("int_values.class_name", class_name);
      }
      if (user_pk) {
        query = query.where("int_values.user_pk", user_pk);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      query = query.select("int_values.table_pk", "int_values.user_pk", "int_values.user_value", "int_values.commerce_value", "int_values.exp_value", "int_values.soft_points", "int_values.phone_reg_points", "int_values.eprod_reg_points", "int_values.activity_points", "int_values.class_name")
        .select(db.raw("TO_CHAR(int_values.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .select("users.user_id", "users.user_name")
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findIntegratedUserValueByPk(table_pk) {
    try {
      let query = db(this.T_INT_VALUES)
        .where("table_pk", table_pk);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findIntegratedUserValueByUserPk(user_pk) {
    try {
      let query = db(this.T_INT_VALUES)
        .where("user_pk", user_pk);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addIntegratedUserValue(params) {
    try {
      const now = new Date();
      const query = db(this.T_INT_VALUES)
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

  static async editIntegratedUserValue(params) {
    try {
      const now = new Date();
      let query = db(this.T_INT_VALUES);
      if (params.table_pk) {
        query = query.where("table_pk", params.table_pk);
      } else if (params.user_pk) {
        query = query.where("user_pk", params.user_pk);
      } else {
        return 0;
      }

      query = query.update({
          ...params,
          updated_at: now,
        });
  
      return await query;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async recalcIntegratedUserValues() {
    try {
      const now = new Date();
      let query = db(this.T_INT_VALUES)
        .update("user_value", db.raw(`((CASE WHEN phone_reg_points > ${PHONE_REG_MAX_POINTS} THEN ${PHONE_REG_MAX_POINTS} ELSE phone_reg_points END) + (CASE WHEN eprod_reg_points > ${EPROD_REG_MAX_POINTS} THEN ${EPROD_REG_MAX_POINTS} ELSE eprod_reg_points END)) * ${INTEGRATED_VALUE_RATES.REGISTER} + exp_value * ${INTEGRATED_VALUE_RATES.ESHOP} + soft_points * ${INTEGRATED_VALUE_RATES.SOFT} + activity_points * ${INTEGRATED_VALUE_RATES.ACTIVITY}`))
        .update("updated_at", now);
  
      return await query;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async recalcIntegratedUserClasses() {
    try {
      const now = new Date();
      let query = db(`${this.T_INT_VALUES} as int_values`)
        .update("int_values.class_name", db.raw(`(SELECT class_name FROM ${this.T_INT_CLASS} int_class WHERE int_values.user_value >= int_class.start_value AND int_values.user_value < int_class.end_value AND int_class.is_deleted = ${FLAG_EXIST})`))
        .update("updated_at", now);
  
      return await query;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findPremiumDiscussAwards(filter, isCount = false) {
    try {
      const { offset, limit, sort, user_pk, service_pk, class_pk, goods_type, keyword, is_deleted, is_client } = filter;

      let query = db(`${this.T_DISCUSS_AWARDS} as discuss_awards`)
        .leftJoin(`${this.T_USERS} as users`, "discuss_awards.user_pk", "users.user_pk")
        .leftJoin(`${this.T_GOODS} as goods`, "discuss_awards.goods_pk", "goods.goods_pk");

      if (is_client !== 1) {
        query = query.leftJoin(`${this.T_USER_CLASS} as classes`, "discuss_awards.class_pk", "classes.class_pk")
          .leftJoin(`${this.T_SERVICES} as services`, "discuss_awards.service_pk", "services.service_pk")
          .leftJoin(`${this.T_RECEPTIONS} as receptions`, function() {
            this.on("services.service_type", PREMIUM_SERVICE_TYPES.WOMENSDAY_2026)
              .andOn("discuss_awards.award_pk", "receptions.related_pk");
          })
          .leftJoin(`${this.T_LOC} as loc`, "receptions.location_pk", "loc.location_pk")
          .leftJoin(`${this.T_LOC} as parent_loc`, "loc.parent_code", "parent_loc.location_code")
          .leftJoin(`${this.T_LOC} as grand_loc`, "parent_loc.parent_code", "grand_loc.location_code");
      }

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(goods.goods_name)"), "like", `%${lowerKeyword}%`);
          if (is_client !== 1) {
            this.orWhere(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
              .orWhere("users.user_pk", "like", `${lowerKeyword}`);
          }
        });
      }

      if (user_pk) {
        query = query.where("discuss_awards.user_pk", user_pk);
      }
      if (service_pk) {
        query = query.where("discuss_awards.service_pk", service_pk);
      }
      if (class_pk) {
        query = query.where("discuss_awards.class_pk", class_pk);
      }
      if (goods_type) {
        query = query.where("goods.goods_type", goods_type);
      }
      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("discuss_awards.is_deleted", is_deleted);
      }
      if (is_client === 1) {
        query = query.whereNotNull("discuss_awards.goods_pk");
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key === "updated_at" ? "discuss_awards.updated_at" : sort.key, sort.dir);
      }

      if (is_client !== 1) {
        query = query.select("services.service_name")
          .select("classes.class_name")
          .select("users.user_name")
          .select("goods.price", "goods.points")
          .select("receptions.table_pk", "receptions.receptionist", "receptions.location_pk", "receptions.location_more", "receptions.location_environs", "receptions.phone_numbers", "receptions.id_card")
          .select("loc.location_code", "loc.parent_code", db.raw("TRIM((grand_loc.location_name || ' ' || parent_loc.location_name || ' ' || loc.location_name)) as location_name"));
      }

      query = query.select("discuss_awards.award_pk", "discuss_awards.service_pk", "discuss_awards.user_pk", "discuss_awards.class_pk", "discuss_awards.goods_pk", "discuss_awards.is_deleted")
        .select(db.raw("TO_CHAR(discuss_awards.award_at, 'YYYY-MM-DD HH24:MI:SS') award_at"))
        .select(db.raw("TO_CHAR(discuss_awards.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .select("users.user_id")
        .select("goods.goods_name", "goods.goods_type")
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findPremiumDiscussAwardsInUserPks(filter, user_pks) {
    try {
      const query = db(`${this.T_DISCUSS_AWARDS} as discuss_awards`)
        .leftJoin(`${this.T_USERS} as users`, "discuss_awards.user_pk", "users.user_pk")
        .where(filter)
        .whereIn("discuss_awards.user_pk", user_pks)
        .select("discuss_awards.user_pk", "users.user_id");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPremiumDiscussAwardsForUser(service_pk, user_pk) {
    try {
      let query = db(`${this.T_DISCUSS_AWARDS} as discuss_awards`)
        .leftJoin(`${this.T_GOODS} as goods`, "discuss_awards.goods_pk", "goods.goods_pk")
        .where("discuss_awards.service_pk", service_pk)
        .where("discuss_awards.user_pk", user_pk)
        .select("discuss_awards.award_pk", "discuss_awards.service_pk", "discuss_awards.user_pk", "discuss_awards.class_pk", "discuss_awards.goods_pk", "discuss_awards.is_deleted")
        .select(db.raw("TO_CHAR(discuss_awards.award_at, 'YYYY-MM-DD HH24:MI:SS') award_at"))
        .select(db.raw("TO_CHAR(discuss_awards.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .select("goods.goods_name", "goods.goods_type");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPremiumDiscussActivityPoints(service_pk, offset, limit) {
    try {
      let query = db(`${this.T_DISCUSS_AWARDS} as discuss_awards`)
        .leftJoin(`${this.T_GOODS} as goods`, "discuss_awards.goods_pk", "goods.goods_pk")
        .where("discuss_awards.service_pk", service_pk)
        .whereNull("discuss_awards.award_at")
        .where("goods.goods_type", GOODS_TYPE_ACTIVITY_POINT);

      query = query.orderBy("goods.price", "desc")
        .orderBy("goods.goods_pk", "asc")
        .orderBy("discuss_awards.user_pk", "asc");
      
      query = query.select("discuss_awards.award_pk", "discuss_awards.user_pk")
        .select("goods.points")
        .offset(offset)
        .limit(limit);
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPremiumDiscussAwardByPk(award_pk) {
    try {
      const query = db(this.T_DISCUSS_AWARDS)
        .where("award_pk", award_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addPremiumDiscussAwards(params, user_pks, admin_pk) {
    try {
      const now = new Date();
      let rows = user_pks.map(user_pk => ({
        ...params,
        user_pk,
        created_at: now,
        updated_at: now,
        updated_by: admin_pk,
      }));

      const query = db(this.T_DISCUSS_AWARDS)
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

  static async editPremiumDiscussAward(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_DISCUSS_AWARDS)
        .where("award_pk", params.award_pk)
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

  static async findPremiumReceptionByPk(table_pk) {
    try {
      const query = db(this.T_RECEPTIONS)
        .where("table_pk", table_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPremiumReceptionByFilter(filter) {
    try {
      const query = db(this.T_RECEPTIONS)
        .where(filter);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPremiumReceptionsByService(service_pk, user_pk) {
    try {
      const query = db(this.T_RECEPTIONS)
        .where("service_pk", service_pk)
        .where("user_pk", user_pk)
        .select("table_pk", "service_pk", "user_pk", "related_pk", "receptionist", "location_pk", "location_more", "location_environs", "phone_numbers", "id_card")
        .select(db.raw("TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addPremiumReception(params) {
    try {
      const now = new Date();
      const query = db(this.T_RECEPTIONS)
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

  static async editPremiumReception(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_RECEPTIONS)
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

  static async findQuestionByPk(question_pk) {
    try {
      const query = db(this.T_QUESTIONS)
        .where("question_pk", question_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findQuestionsByServicePk(filter, isCount = false) {
    const { offset, limit, sort, service_pk, is_deleted, max_at, keyword, is_client } = filter;
    if (!service_pk || service_pk === 0) {
      return isCount ? 0 : [];
    }

    try {
      let query = db(`${this.T_QUESTIONS} as questions`)
        .where("questions.service_pk", service_pk);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(questions.question_text)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("questions.is_deleted", is_deleted);
      }

      if (max_at !== undefined && max_at != "") {
        query = query.where(db.raw("TO_CHAR(questions.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
      }
      
      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }
      query = query.orderBy("questions.question_pk", "asc");

      query = query
        .select("questions.question_pk", "questions.service_pk", "questions.question_text", "questions.question_type", "questions.position", "questions.publish_num", "questions.is_deleted")
        .select(db.raw("TO_CHAR(questions.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"), db.raw("TO_CHAR(questions.notice_at, 'YYYY-MM-DD HH24:MI:SS') notice_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      const rows = await query;
      if (is_client === 1) {
        return rows;
      }

      const question_pks = rows.map(row => row.question_pk);
      const choices = await this.findChoicesInQuestionPks(question_pks);

      const result = rows.map(row => ({
        ...row,
        choices: choices.filter(choice => choice.question_pk === row.question_pk),
      }));

      return result;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async addQuestion(params) {
    try {
      const now = new Date();
      const query = db(this.T_QUESTIONS)
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

  static async editQuestion(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_QUESTIONS)
        .where("question_pk", params.question_pk )
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findChoicesInQuestionPks(question_pks) {
    try {
      const query = db(this.T_CHOICES)
        .whereIn("question_pk", question_pks)
        .orderBy("position", "asc")
        .select("choice_pk", "question_pk", "choice_text", "position", "is_correct", "is_deleted")
        .select(db.raw("TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findChoicesByQuestionPk(filter, isCount = false) {
    try {
      const { offset, limit, sort, question_pk, keyword } = filter;
      if (!question_pk || question_pk === 0) {
        return isCount ? 0 : [];
      }

      let query = db(`${this.T_CHOICES} as choices`)
        .where("choices.question_pk", question_pk);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(choices.choice_text)"), "like", `%${lowerKeyword}%`);
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

      query = query
        .select("choices.choice_pk", "choices.choice_text", "choices.position", "choices.is_correct", "choices.is_deleted")
        .select(db.raw("TO_CHAR(choices.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findChoicesByServicePk(filter, isCount = false) {
    try {
      const { offset, limit, sort, service_pk, is_deleted, max_at } = filter;
      if (!service_pk || service_pk === 0) {
        return isCount ? 0 : [];
      }

      let query = db(`${this.T_CHOICES} as choices`)
        .leftJoin(`${this.T_QUESTIONS} as questions`, "choices.question_pk", "questions.question_pk")
        .where("questions.service_pk", service_pk);

      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("choices.is_deleted", is_deleted);
      }

      if (max_at !== undefined && max_at != "") {
        query = query.where(db.raw("TO_CHAR(choices.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }
      query = query.orderBy("choices.choice_pk", "asc");

      query = query
        .select("choices.choice_pk", "choices.question_pk", "choices.choice_text", "choices.position", "choices.is_correct", "choices.is_deleted")
        .select("questions.service_pk")
        .select(db.raw("TO_CHAR(choices.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findChoiceByPk(choice_pk) {
    try {
      const query = db(this.T_CHOICES).where({ choice_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findValidChoicesByPks(question_pk, choice_pks) {
    try {
      const query = db(this.T_CHOICES)
        .where("question_pk", question_pk)
        .whereIn("choice_pk", choice_pks)
        .select("choice_pk");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addChoice(params) {
    try {
      const now = new Date();
      const query = db(this.T_CHOICES)
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

  static async editChoice(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_CHOICES)
        .where({ choice_pk: params.choice_pk })
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findResponsesByServicePk(filter, isCount = false) {
    try {
      const { offset, limit, sort, service_pk, user_pk, max_at } = filter;
      if (!service_pk || service_pk === 0) {
        return isCount ? 0 : [];
      }

      let query = db(`${this.T_RESPONSES} as responses`)
        .leftJoin(`${this.T_QUESTIONS} as questions`, "responses.question_pk", "questions.question_pk")
        .where("responses.user_pk", user_pk)
        .where("questions.service_pk", service_pk);

      if (max_at !== undefined && max_at != "") {
        query = query.where(db.raw("TO_CHAR(responses.action_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }
      query = query.orderBy("responses.response_pk", "asc");

      query = query
        .select("responses.response_pk", "responses.user_pk", "responses.question_pk", "responses.choice_pk")
        .select(db.raw("TO_CHAR(responses.action_at, 'YYYY-MM-DD HH24:MI:SS') action_at"))
        .select("questions.service_pk")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findResponseByFilter(filter) {
    try {
      let query = db(`${this.T_RESPONSES} as responses`)
        .where(filter);

      query = query.select("responses.response_pk");
      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async addResponses(user_pk, question_pk, choice_pks) {
    try {
      const now = new Date();
      let rows = [];
      choice_pks.map(choice_pk => rows = [...rows, {
        user_pk,
        question_pk,
        choice_pk,
        action_at: now,
      }]);

      const query = db(this.T_RESPONSES)
        .insert(rows)
        .returning("*");

      const result = await query;
      
      if (!result || result.length === 0) {
        throw new Error("Fail to add a new row");
      }
  
      return result;
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async findPuzzleAwards(filter, isCount = false) {
    try {
      const { offset, limit, sort, user_pk, service_pk, class_pk, goods_type, keyword, is_deleted, is_client } = filter;

      let query = db(`${this.T_PUZZ_AWARDS} as awards`)
        .leftJoin(`${this.T_USERS} as users`, "awards.user_pk", "users.user_pk")
        .leftJoin(`${this.T_GOODS} as goods`, "awards.goods_pk", "goods.goods_pk");

      if (is_client !== 1) {
        query = query.leftJoin(`${this.T_USER_CLASS} as classes`, "awards.class_pk", "classes.class_pk")
          .leftJoin(`${this.T_SERVICES} as services`, "awards.service_pk", "services.service_pk")
          .leftJoin(`${this.T_RECEPTIONS} as receptions`, function() {
            this.on("awards.service_pk", "receptions.service_pk")
              .andOn("awards.user_pk", "receptions.user_pk");
          })
          .leftJoin(`${this.T_LOC} as loc`, "receptions.location_pk", "loc.location_pk")
          .leftJoin(`${this.T_LOC} as parent_loc`, "loc.parent_code", "parent_loc.location_code")
          .leftJoin(`${this.T_LOC} as grand_loc`, "parent_loc.parent_code", "grand_loc.location_code");
      }

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(goods.goods_name)"), "like", `%${lowerKeyword}%`);
          if (is_client !== 1) {
            this.orWhere(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
              .orWhere("users.user_pk", "like", `${lowerKeyword}`);
          }
        });
      }

      if (user_pk) {
        query = query.where("awards.user_pk", user_pk);
      }
      if (service_pk) {
        query = query.where("awards.service_pk", service_pk);
      }
      if (class_pk) {
        query = query.where("awards.class_pk", class_pk);
      }
      if (goods_type) {
        query = query.where("goods.goods_type", goods_type);
      }
      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("awards.is_deleted", is_deleted);
      }
      if (is_client === 1) {
        query = query.whereNotNull("awards.goods_pk");
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key === "updated_at" ? "awards.updated_at" : sort.key, sort.dir);
      }
      query = query.orderBy("awards.award_pk", "asc");

      if (is_client !== 1) {
        query = query.select("services.service_name")
          .select("classes.class_name")
          .select("users.user_name")
          .select("goods.price", "goods.points")
          .select("receptions.table_pk", "receptions.receptionist", "receptions.location_pk", "receptions.location_more", "receptions.location_environs", "receptions.phone_numbers", "receptions.id_card")
          .select("loc.location_code", "loc.parent_code", db.raw("TRIM((grand_loc.location_name || ' ' || parent_loc.location_name || ' ' || loc.location_name)) as location_name"));
      }

      query = query.select("awards.award_pk", "awards.service_pk", "awards.user_pk", "awards.class_pk", "awards.goods_pk", "awards.is_deleted")
        .select(db.raw("TO_CHAR(awards.award_at, 'YYYY-MM-DD HH24:MI:SS') award_at"))
        .select(db.raw("TO_CHAR(awards.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .select("users.user_id")
        .select("goods.goods_name", "goods.goods_type")
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findPuzzleAwardsInUserPks(filter, user_pks) {
    try {
      const query = db(`${this.T_PUZZ_AWARDS} as awards`)
        .leftJoin(`${this.T_USERS} as users`, "awards.user_pk", "users.user_pk")
        .where(filter)
        .whereIn("awards.user_pk", user_pks)
        .select("awards.user_pk", "users.user_id");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPuzzleAwardByPk(award_pk) {
    try {
      const query = db(this.T_PUZZ_AWARDS)
        .where("award_pk", award_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPuzzleAwardsForUser(service_pk, user_pk) {
    try {
      let query = db(`${this.T_PUZZ_AWARDS} as awards`)
        .leftJoin(`${this.T_GOODS} as goods`, "awards.goods_pk", "goods.goods_pk")
        .where("awards.service_pk", service_pk)
        .where("awards.user_pk", user_pk)
        .select("awards.award_pk", "awards.service_pk", "awards.user_pk", "awards.class_pk", "awards.goods_pk", "awards.is_deleted")
        .select(db.raw("TO_CHAR(awards.award_at, 'YYYY-MM-DD HH24:MI:SS') award_at"), db.raw("TO_CHAR(awards.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .select("goods.goods_name", "goods.goods_type");
      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findPuzzleAwardActivityPoints(service_pk, offset, limit) {
    try {
      let query = db(`${this.T_PUZZ_AWARDS} as awards`)
        .leftJoin(`${this.T_GOODS} as goods`, "awards.goods_pk", "goods.goods_pk")
        .where("awards.service_pk", service_pk)
        .whereNull("awards.award_at")
        .where("goods.goods_type", GOODS_TYPE_ACTIVITY_POINT);

      query = query.orderBy("goods.price", "desc")
        .orderBy("goods.goods_pk", "asc")
        .orderBy("awards.user_pk", "asc");
      
      query = query.select("awards.award_pk", "awards.user_pk")
        .select("goods.points")
        .offset(offset)
        .limit(limit);
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addPuzzleAwards(params, user_pks, admin_pk) {
    try {
      const now = new Date();
      let rows = user_pks.map(user_pk => ({
        ...params,
        user_pk,
        created_at: now,
        updated_at: now,
        updated_by: admin_pk,
      }));

      const query = db(this.T_PUZZ_AWARDS)
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

  static async editPuzzleAward(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_PUZZ_AWARDS)
        .where("award_pk", params.award_pk)
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

  static async editPuzzleFinish(params, user_pks) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_PUZZ_AWARDS)
        .where("service_pk", params.service_pk)
        .whereIn("user_pk", user_pks)
        .update("award_at", params.award_at || now)
        .update("updated_at", now);
  
      return rowCount;
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async findPuzzleRank(filter, isCount = false) {
    try {
      const { offset, limit, keyword, service_pk } = filter;

      let query1 = db(`${this.T_RESPONSES} as responses`)
        .leftJoin(`${this.T_QUESTIONS} as questions`, "responses.question_pk", "questions.question_pk")
        .leftJoin(`${this.T_CHOICES} as choices`, "responses.choice_pk", "choices.choice_pk")
      if (service_pk) {
        query1 = query1.where("questions.service_pk", service_pk);
      }
      query1 = query1.groupBy("responses.user_pk", "questions.service_pk")
        .select("responses.user_pk", "questions.service_pk")
        .select(db.raw("SUM(choices.is_correct) points"))
        .select(db.raw("AVG(responses.action_at - questions.notice_at) elapse_time"))
      query1 = query1.as("T_RESP");

      let query2 = db(query1)
        .leftJoin(`${this.T_PUZZ_BONUS} as bonus`, function() {
          this.on("T_RESP.user_pk", "bonus.user_pk");
          if (service_pk) {
            this.andOn("bonus.service_pk", service_pk);
          }
        })
        .select("T_RESP.user_pk", "T_RESP.points", "T_RESP.elapse_time", "T_RESP.service_pk")
        .select(db.raw("NVL(bonus.points, 0) bonus_points"))
        .select(db.raw("T_RESP.points + NVL(bonus.points, 0) total_points"))
        .select(db.raw("ROW_NUMBER() OVER (ORDER BY (T_RESP.points + NVL(bonus.points, 0)) DESC, T_RESP.elapse_time ASC) AS rank"))
        .as("T_RANK");
      
      let query3 = db(query2)
        .leftJoin(`${this.T_USERS} as users`, "T_RANK.user_pk", "users.user_pk");

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query3 = query3.where(function() {
          this.where(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere("users.user_pk", `${lowerKeyword}`);
        });
      }

      if (isCount) {
        const countQuery = query3.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query3 = query3.orderBy("T_RANK.rank", "ASC")

      query3 = query3.select("T_RANK.user_pk", "T_RANK.points", "T_RANK.bonus_points", "T_RANK.total_points", "T_RANK.elapse_time", "T_RANK.rank", "T_RANK.service_pk")
        .select("users.user_id", "users.user_name")
        .offset(offset);

      if (limit) {
        query3 = query3.limit(limit);
      }

      return await query3;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findPuzzleBonusInUserPks(filter, user_pks) {
    try {
      const query = db(`${this.T_PUZZ_BONUS} as bonus`)
        .leftJoin(`${this.T_USERS} as users`, "bonus.user_pk", "users.user_pk")
        .where(filter)
        .whereIn("bonus.user_pk", user_pks)
        .select("bonus.user_pk", "users.user_id");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPuzzleBonusByFilter(filter) {
    try {
      const query = db(this.T_PUZZ_BONUS)
        .where(filter)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addPuzzleBonus(params, user_pks, admin_pk) {
    try {
      const now = new Date();
      let rows = user_pks.map(user_pk => ({
        ...params,
        user_pk,
        created_at: now,
        updated_at: now,
        updated_by: admin_pk,
      }));

      const query = db(this.T_PUZZ_BONUS)
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

  static async editPuzzleBonus(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_PUZZ_BONUS)
        .where("service_pk", params.service_pk)
        .where("user_pk", params.user_pk)
        .update({
          points: params.points,
          updated_at: now,
          updated_by: admin_pk,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findPuzzleAnswerDetail(offset, limit, filter, isCount = false) {
    try {
      const { service_pk, user_pk, keyword } = filter;

      let query = db(`${this.T_RESPONSES} as responses`)
        .leftJoin(`${this.T_CHOICES} as choices`, "responses.choice_pk", "choices.choice_pk")
        .leftJoin(`${this.T_QUESTIONS} as questions`, "responses.question_pk", "questions.question_pk");
      
      query = query.where("questions.service_pk", service_pk)
        .where("responses.user_pk", user_pk);
      
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(questions.question_text)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(choices.choice_text)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query = query.orderBy("questions.position", "asc");
      
      query = query.select("responses.response_pk")
        .select("questions.question_text")
        .select(db.raw("TO_CHAR(questions.notice_at, 'YYYY-MM-DD HH24:MI:SS') notice_at"))
        .select("choices.choice_pk", "choices.choice_text", "choices.is_correct")
        .select(db.raw("TO_CHAR(responses.action_at, 'YYYY-MM-DD HH24:MI:SS') action_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findPuzzleResponsorCount(filter) {
    const { question_pk } = filter;

    try {
      let query = db(`${this.T_RESPONSES} as responses`);

      if (question_pk) {
        query = query.where("responses.question_pk", question_pk);
      }

      query = query.select(db.raw("COUNT(DISTINCT(responses.user_pk)) as total"));
      const totalCount = await query.first();
      return totalCount.total;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findPuzzleAnswerStats(filter) {
    const { question_pk } = filter;

    try {
      let query = db(`${this.T_RESPONSES} as responses`)
        .leftJoin(`${this.T_CHOICES} as choices`, "responses.choice_pk", "choices.choice_pk");

      if (question_pk) {
        query = query.where("responses.question_pk", question_pk);
      }

      query = query.groupBy("choices.choice_text")
        .orderBy(db.raw("MAX(position)"), "asc")
        .select(db.raw("choices.choice_text as field"))
        .select(db.raw("COUNT(1) count"));

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }
}

module.exports = PremiumModel;
