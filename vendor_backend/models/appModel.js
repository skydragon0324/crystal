const db = require('../db/knex');
const { FLAG_ACTIVE, APP_UPDATE_TYPE, FLAG_EXIST } = require('../constants/constants');

class AppModel {
  static T_UPDATES = "ora_pid.app_updates";
  static T_TESTERS = "ora_pid.testers";

  static async findActiveUpdates(version_code, last_time) {
    try {
      let query = db(`${this.T_UPDATES} as updates`)
        .where(function() {
          this.where(function() {
            this.where("updates.version_code", version_code)
              .where("updates.type", APP_UPDATE_TYPE.PATCH);
            if (last_time) {
              this.where(db.raw("TO_CHAR(updates.last_time, 'YYYY-MM-DD HH24:MI:SS')"), ">", last_time);
            }
          })
          .orWhere(function() {
            this.where("updates.version_code", ">", version_code)
              .where("updates.type", APP_UPDATE_TYPE.APK);
          });
        })
        .where("updates.status", FLAG_ACTIVE)
        .whereNotNull("updates.file_url");
      query = query.select(db.raw("TO_CHAR(updates.last_time, 'YYYY-MM-DD HH24:MI:SS') last_time"))
        .select("updates.type", "updates.version_code", "updates.file_url", "updates.note");
      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findTestUpdates(version_code, last_time) {
    try {
      let query = db(`${this.T_UPDATES} as updates`)
        .where("updates.version_code", version_code)
        .where("updates.type", APP_UPDATE_TYPE.TEST)
        .where("updates.status", FLAG_ACTIVE)
        .whereNotNull("updates.file_url");
      if (last_time) {
        query = query.where(db.raw("TO_CHAR(updates.last_time, 'YYYY-MM-DD HH24:MI:SS')"), ">", last_time);
      }
      query = query.select(db.raw("TO_CHAR(updates.last_time, 'YYYY-MM-DD HH24:MI:SS') last_time"))
        .select("updates.type", "updates.version_code", "updates.file_url", "updates.note");
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findDbFileTime(type, version_code) {
    try {
      let query = db(`${this.T_UPDATES} as updates`)
        .where("updates.type", type)
        .where("updates.version_code", version_code)
        .where("updates.status", FLAG_ACTIVE);

      query = query.select(db.raw("TO_CHAR(updates.db_file_time, 'YYYY-MM-DD HH24:MI:SS') db_file_time"));
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findActiveTester(imei) {
    try {
      let query = db(`${this.T_TESTERS} as testers`)
        .where("phone_imei", imei)
        .where("is_deleted", FLAG_EXIST);

      return await query.first();
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }
}

module.exports = AppModel;
