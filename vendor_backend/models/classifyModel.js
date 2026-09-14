const db = require('../db/knex');
const { CLASSIFY_PHONE_RULE, CLASSIFY_PHONE_LEVELS, FLAG_SET, CLASSIFY_EPROD_RULE, CLASSIFY_EPROD_LEVELS } = require('../constants/constants');

class ClassifyModel {
  static T_CLS_PHONE = "ora_pid.uclass_phone_values";
  static T_CLS_EPROD = "ora_pid.uclass_eprod_values";
  static T_USERS = "ora_pid.users";
  static T_REG_PHONE_LOG = "ora_pid.register_phone_log";
  static T_REG_EPROD_LOG = "ora_eproduct.buyer_product_list";
  static T_PHONE_NUMS = "ora_pid.user_phone_numbers";

  static async findClassesByPhone(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, level } = filter;

      let query1 = db(`${this.T_REG_PHONE_LOG}`)
        .whereNot("points", 0)
        .groupBy("user_pk")
        .select("user_pk", db.raw("COUNT(1) buy_count"))
        .as("T_BUY");

      let query2 = db(`${this.T_PHONE_NUMS}`)
        .groupBy("user_pk")
        .select("user_pk", db.raw("COUNT(1) num_count"))
        .as("T_NUM");

      let query3 = db(`${this.T_USERS} as users`)
        .leftJoin(query1, "users.user_pk", "T_BUY.user_pk")
        .leftJoin(`${this.T_CLS_PHONE} as cls_phone`, "users.user_pk", "cls_phone.user_pk")
        .leftJoin(query2, "users.user_pk", "T_NUM.user_pk")
        .where(function() {
          this.whereNotNull("T_BUY.user_pk")
            .orWhereNotNull("cls_phone.user_pk");
        });

      query3 = query3
        .select("users.user_pk", "users.user_id", "users.user_name")
        .select(db.raw("NVL(cls_phone.phone_9, 0) phone_9"), db.raw("NVL(cls_phone.phone_7, 0) phone_7"), db.raw("NVL(cls_phone.phone_5, 0) phone_5"), db.raw("NVL(cls_phone.phone_3, 0) phone_3"))
        .select(db.raw("NVL(T_BUY.buy_count, 0) buy_count"))
        .select(db.raw("CASE WHEN T_NUM.num_count > 0 AND users.location_pk IS NOT NULL and users.job IS NOT NULL THEN 1 ELSE 0 END profile"))
        .as("T_CLASS");


      let query4 = db(query3)
        .select("T_CLASS.user_pk", "T_CLASS.user_id", "T_CLASS.user_name", "T_CLASS.phone_9", "T_CLASS.phone_7", "T_CLASS.phone_5", "T_CLASS.phone_3", "T_CLASS.buy_count", "T_CLASS.profile")
        .select(db.raw(`((T_CLASS.phone_9 * ${CLASSIFY_PHONE_RULE.RATIO_9} + T_CLASS.phone_7 * ${CLASSIFY_PHONE_RULE.RATIO_7} + T_CLASS.phone_5 * ${CLASSIFY_PHONE_RULE.RATIO_5} + T_CLASS.phone_3 * ${CLASSIFY_PHONE_RULE.RATIO_3}) * ${CLASSIFY_PHONE_RULE.USAGE} + (CASE WHEN T_CLASS.buy_count >= 3 THEN 5 WHEN T_CLASS.buy_count = 2 THEN 3 WHEN T_CLASS.buy_count = 1 THEN 1 ELSE 0 END) * ${CLASSIFY_PHONE_RULE.PURCHASE} + (CASE WHEN T_CLASS.profile = 1 THEN 1 ELSE 0 END) * ${CLASSIFY_PHONE_RULE.PROFILE}) total_value`))
        .as("T_TOTAL");

      let query5 = db(query4);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query5 = query5.where(function() {
          this.where(db.raw("LOWER(T_TOTAL.user_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(T_TOTAL.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere("T_TOTAL.user_pk", "like", `${lowerKeyword}`);
        });
      }
      if (level !== undefined && level !== -1) {
        const levelItem = CLASSIFY_PHONE_LEVELS.find(item => item.id === level);
        if (levelItem) {
          query5 = query5.where("T_TOTAL.total_value", ">=", levelItem.min)
            .where("T_TOTAL.total_value", "<", levelItem.max);
        }
      }

      if (isCount) {
        const countQuery = db(query5)
          .select(db.raw("COUNT(*) total"))
          .first();
        const totalCount = await countQuery;
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query5 = query5.orderBy(sort.key, sort.dir);
      }
      query5 = query5.orderBy("T_TOTAL.user_pk", "asc");
      
      query5 = query5.offset(offset);

      if (limit) {
        query5 = query5.limit(limit);
      }

      return await query5;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findClassesByEprod(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, level } = filter;

      let query1 = db(`${this.T_REG_EPROD_LOG}`)
        .where("status", FLAG_SET)
        .groupBy("userid")
        .groupBy(db.raw("TO_CHAR(created_at, 'YYYY')"))
        .select("userid", db.raw("COUNT(1) buy_count"), db.raw("TO_CHAR(created_at, 'YYYY') year"));
      let query2 = db(query1)
        .groupBy("userid")
        .select("userid", db.raw("SUM(buy_count)/2 avg_count")) // 2 years (2025, 2026)
        .as("T_BUY");

      let query6 = db(`${this.T_PHONE_NUMS}`)
        .groupBy("user_pk")
        .select("user_pk", db.raw("COUNT(1) num_count"))
        .as("T_NUM");

      let query3 = db(`${this.T_USERS} as users`)
        .leftJoin(query2, "users.user_id", "T_BUY.userid")
        .leftJoin(`${this.T_CLS_EPROD} as cls_eprod`, "users.user_id", "cls_eprod.user_id")
        .leftJoin(query6, "users.user_pk", "T_NUM.user_pk")
        .where(function() {
          this.whereNotNull("T_BUY.userid")
            .orWhereNotNull("cls_eprod.user_id");
        })
        .whereNotNull("users.user_pk");

      query3 = query3
        .select("users.user_pk", "users.user_id", "users.user_name")
        .select(db.raw("NVL(cls_eprod.tv_3, 0) tv_3"), db.raw("NVL(cls_eprod.tv_2, 0) tv_2"), db.raw("NVL(cls_eprod.tv_1, 0) tv_1"), db.raw("NVL(cls_eprod.stb, 0) stb"), db.raw("NVL(cls_eprod.notecom, 0) notecom"), db.raw("NVL(cls_eprod.pc, 0) pc"), db.raw("NVL(cls_eprod.camera, 0) camera"), db.raw("NVL(cls_eprod.phone, 0) phone"), db.raw("NVL(cls_eprod.other, 0) other"))
        .select(db.raw("NVL(T_BUY.avg_count, 0) buy_count"))
        .select(db.raw("CASE WHEN T_NUM.num_count > 0 AND users.location_pk IS NOT NULL and users.job IS NOT NULL THEN 1 ELSE 0 END profile"))
        .as("T_CLASS");

      let query4 = db(query3)
        .select("T_CLASS.user_pk", "T_CLASS.user_id", "T_CLASS.user_name", "T_CLASS.tv_3", "T_CLASS.tv_2", "T_CLASS.tv_1", "T_CLASS.stb", "T_CLASS.notecom", "T_CLASS.pc", "T_CLASS.camera", "T_CLASS.phone", "T_CLASS.other", "T_CLASS.buy_count", "T_CLASS.profile")
        .select(db.raw(`((T_CLASS.tv_3 * ${CLASSIFY_EPROD_RULE.TV_3} + T_CLASS.tv_2 * ${CLASSIFY_EPROD_RULE.TV_2} + T_CLASS.tv_1 * ${CLASSIFY_EPROD_RULE.TV_1} + T_CLASS.stb * ${CLASSIFY_EPROD_RULE.STB} + T_CLASS.notecom * ${CLASSIFY_EPROD_RULE.NOTECOM} + T_CLASS.pc * ${CLASSIFY_EPROD_RULE.PC} + T_CLASS.camera * ${CLASSIFY_EPROD_RULE.CAMERA} + T_CLASS.phone * ${CLASSIFY_EPROD_RULE.PHONE} + T_CLASS.other * ${CLASSIFY_EPROD_RULE.OTHER}) * ${CLASSIFY_EPROD_RULE.USAGE} + (CASE WHEN T_CLASS.buy_count >= 2 THEN 6 WHEN T_CLASS.buy_count = 1 THEN 3 ELSE 0 END) * ${CLASSIFY_EPROD_RULE.PURCHASE} + (CASE WHEN T_CLASS.profile = 1 THEN 1 ELSE 0 END) * ${CLASSIFY_EPROD_RULE.PROFILE}) total_value`))
        .as("T_TOTAL");

      let query5 = db(query4);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query5 = query5.where(function() {
          this.where(db.raw("LOWER(T_TOTAL.user_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(T_TOTAL.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere("T_TOTAL.user_pk", "like", `${lowerKeyword}`);
        });
      }
      if (level !== undefined && level !== -1) {
        const levelItem = CLASSIFY_EPROD_LEVELS.find(item => item.id === level);
        if (levelItem) {
          query5 = query5.where("T_TOTAL.total_value", ">=", levelItem.min)
            .where("T_TOTAL.total_value", "<", levelItem.max);
        }
      }

      if (isCount) {
        const countQuery = db(query5)
          .select(db.raw("COUNT(*) total"))
          .first();
        const totalCount = await countQuery;
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query5 = query5.orderBy(sort.key, sort.dir);
      }
      query5 = query5.orderBy("T_TOTAL.user_pk", "asc");
      
      query5 = query5.offset(offset);

      if (limit) {
        query5 = query5.limit(limit);
      }

      return await query5;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }
}

module.exports = ClassifyModel;
