const db = require('../db/knex');

class CustomerModel {
  static T_CUSTOMERS = "ora_old_db.customers";
  static T_PRIZE_LOG = "ora_old_db.customer_prize_log";

  static async findCustomerById(user_userid) {
    try {
      let query = db(this.T_CUSTOMERS)
        .where("user_userid", user_userid);

      query = query.select("user_pk", "user_name")
        .select(db.raw("TO_CHAR(user_birthday, 'YYYY-MM-DD HH24:MI:SS') user_birthday"))
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message); 
    }
  }

  static async findCustomerInfoById(user_userid) {
    try {
      let query = db(this.T_CUSTOMERS)
        .where("user_userid", user_userid)
        .select("user_pk", "user_name", "user_userid as user_id", "user_password as password")
        .select(db.raw("(CASE WHEN user_sex=1 THEN 'M' ELSE 'F' END) gender"))
        .select(db.raw("TO_CHAR(user_birthday, 'YYYY-MM-DD') birthday"));
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message); 
    }
  }

  static async findCustomerLikePrhnById(user_userid) {
    try {
      let query = db(this.T_CUSTOMERS)
        .where("user_userid", user_userid)
        .select("user_name")
        .select(db.raw("(CASE WHEN user_sex=1 THEN 'M' WHEN user_sex=2 THEN 'F' ELSE '' END) gender"))
        .select(db.raw("TO_CHAR(user_birthday, 'YYYY-MM-DD') birthday"));
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message); 
    }
  }

  static async findValidCustomersByIds(user_ids) {
    try {
      const query = db(this.T_CUSTOMERS)
        .whereIn("user_userid", user_ids)
        .select("user_pk", "user_userid");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findCustomerPrizeLog(filter, isCount = false) {
    try {
      const { offset, limit, keyword, from, to, customer_id } = filter;

      let query = db(`${this.T_PRIZE_LOG} as log`);

      query = query.where("log.customer_id", customer_id);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function () {
          this.where(db.raw("LOWER(log.note)"), "like", `%${lowerKeyword}%`)
        });
      }

      if (from) {
        query = query.where(db.raw("TO_CHAR(log.fill_date, 'YYYY-MM-DD')"), ">=", from);
      }
      if (to) {
        query = query.where(db.raw("TO_CHAR(log.fill_date, 'YYYY-MM-DD')"), "<=", to);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query = query.orderBy("log.fill_date", "desc");

      query = query.select("prize_val as points", "note as reason")
        .select(db.raw("TO_CHAR(log.fill_date, 'YYYY-MM-DD HH24:MI:SS') action_at"))
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

module.exports = CustomerModel;
