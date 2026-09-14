const db = require('../db/knex');

class SecurityModel {
  static T_LOG = "ora_pid.security_log";

  static async findSecuLogByFilter(filter) {
    try {
      const query = db(this.T_LOG)
        // .where("user_id", filter.user_id)
        .where(filter)
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addSecuLog(params) {
    try {
      const now = new Date();
      const result = await db(this.T_LOG)
        .insert({
          ...params,
          info: params.info ? params.info.slice(0, 4000) : "",
          login_time: now,
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
}

module.exports = SecurityModel;
