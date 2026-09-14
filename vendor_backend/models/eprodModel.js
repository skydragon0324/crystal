const db = require('../db/knex');
const { EPROD_MEDIA_OLD_POINT_REASON } = require('../lang/en');

class EprodModel {
  static T_KARA_LOG = "ora_license.tbl_licgen";
  static T_KARA_ERR = "ora_license.tbl_error_list";
  static T_BMEDIALOG = "ora_media.tbl_licenses";
  static T_MEDIA_PROVIDER = "ora_media.tbl_media_providers";
  static T_MEDIA_SCORE = "ora_media.tbl_old_license_score";

  static async findKaraOldLog(filter, isCount = false) {
    try {
      const { offset, limit, user_id, limit_time } = filter;

      let query = db(`${this.T_KARA_LOG} as log`)
        .leftJoin(`${this.T_KARA_ERR} as err`, "log.id", "err.lic_id");

      query = query.where("log.userid", user_id)
        .where("log.is_agent", 0)
        .where("log.resultlog", 0)
        .where(function() {
          this.where(db.raw("err.error_status != 2"))
            .orWhereNull("err.error_status");
        })
        .where(db.raw("TO_CHAR(log.created_at, 'YYYY-MM-DD HH24:MI:SS')"), ">=", "2025-08-20 00:00:00");
      if (limit_time) {
        query = query.where(db.raw("TO_CHAR(log.created_at, 'YYYY-MM-DD HH24:MI:SS')"), "<=", limit_time);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query = query.orderBy("log.created_at", "desc");

      query = query.select("log.machinekey as equ_num", "log.real_price as pay_points", "log.bonus_score as soft_points")
        .select(db.raw("TO_CHAR(log.created_at, 'YYYY-MM-DD HH24:MI:SS') action_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findBMediaOldLog(filter, isCount = false) {
    try {
      const { offset, limit, user_id, limit_time } = filter;

      let query = db(`${this.T_BMEDIALOG} as log`)
        .leftJoin(`${this.T_MEDIA_PROVIDER} as provider`, "log.provider", "provider.id");

      query = query.where("log.userid", user_id)
        .where("log.result", 1)
        .where(db.raw("TO_CHAR(log.date_time, 'YYYY-MM-DD HH24:MI:SS')"), ">=", "2025-08-20 00:00:00");
      if (limit_time) {
        query = query.where(db.raw("TO_CHAR(log.date_time, 'YYYY-MM-DD HH24:MI:SS')"), "<=", limit_time);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query = query.orderBy("log.date_time", "desc");

      query = query.select("log.dev_id as equ_num", "provider.short_name as reason", "log.cal_price as pay_points", "log.bonus_score as soft_points")
        .select(db.raw("TO_CHAR(log.date_time, 'YYYY-MM-DD HH24:MI:SS') action_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findBMediaOldOne(user_id) {
    try {
      let query = db(`${this.T_MEDIA_SCORE}`)
        .where("status", 1)
        .where("userid", user_id)
        .select("cal_price as pay_points")
        .select(db.raw(`'${EPROD_MEDIA_OLD_POINT_REASON}' as reason`))
        .select(db.raw("score/15 soft_points"))
        .select(db.raw("TO_CHAR(date_time, 'YYYY-MM-DD HH24:MI:SS') action_at"))

      return await query.first();
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }
}

module.exports = EprodModel;
