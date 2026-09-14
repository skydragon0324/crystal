const db = require('../db/knex');
const moment = require('moment');
const { FLAG_EXIST, DUTY_TYPE, POINT_TYPE_VALUES } = require('../constants/constants');

class ExperienceModel {
  static T_DUTIES = "ora_pid.duties";
  static T_ACHIEVES = "ora_pid.achievements";
  static T_USERS = "ora_pid.users";
  static T_POINT_TYPE = "ora_pid.activity_point_types";

  static async findDuties(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, is_deleted, max_at, is_now, is_client } = filter;

      let query = db(`${this.T_DUTIES} as duties`)
        .leftJoin(`${this.T_POINT_TYPE} as point_type`, "duties.point_type", "point_type.type_pk");

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(duties.duty_title)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(duties.content)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("duties.is_deleted", is_deleted);
      }

      if (is_now === 1) {
        const now = moment().format("YYYY-MM-DD");
        query = query.where(function() {
          this.where("duties.duty_type", DUTY_TYPE.DAILY)
            .orWhere(function() {
              this.where("duties.duty_type", DUTY_TYPE.PERIOD)
                .where(db.raw("TO_CHAR(duties.start_date, 'YYYY-MM-DD')"), "<=", now)
                .where(db.raw("TO_CHAR(duties.end_date, 'YYYY-MM-DD')"), ">=", now);
            });
        });
      }

      if (max_at !== undefined && max_at != "") {
        query = query.where(db.raw("TO_CHAR(duties.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(`duties.${sort.key}`, sort.dir);
      } else {
        query = query.orderBy("duties.duty_type", "asc")
          .orderBy("duties.position", "asc");
      }
      query = query.orderBy("duties.duty_pk", "asc");

      if (is_client === 1) {
        query = query.select(db.raw("REPLACE(duties.content, '<p></p>', '<br />') content"));
      } else {
        query = query.select("duties.content");
      }

      query = query
        .select("duties.duty_pk", "duties.duty_title", "duties.icon_name", "duties.icon_url", "duties.point_type", "duties.position", "duties.action", "duties.image_url", "duties.duty_type", "duties.is_deleted")
        .select(db.raw("TO_CHAR(duties.start_date, 'YYYY-MM-DD') start_date"), db.raw("TO_CHAR(duties.end_date, 'YYYY-MM-DD') end_date"), db.raw("TO_CHAR(duties.disp_date, 'YYYY-MM-DD') disp_date"), db.raw("TO_CHAR(duties.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"), db.raw("TO_CHAR(duties.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .select("point_type.points")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findDutyByPk(duty_pk) {
    try {
      const query = db(this.T_DUTIES)
        .where("duty_pk", duty_pk)
        .select("duty_pk", "duty_type", "point_type")
        .select(db.raw("TO_CHAR(start_date, 'YYYY-MM-DD') start_date"), db.raw("TO_CHAR(end_date, 'YYYY-MM-DD') end_date"), db.raw("TO_CHAR(disp_date, 'YYYY-MM-DD') disp_date"))
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findActiveDutyByAction(action, user_pk) {
    try {
      const now = moment().format("YYYY-MM-DD");
      let query = db(`${this.T_DUTIES} as duties`);
      if (user_pk !== undefined && user_pk !== 0) {
        query = query.leftJoin(`${this.T_ACHIEVES} as achieves`, function() {
          this.on("achieves.duty_pk", "duties.duty_pk")
            .andOn("achieves.user_pk", user_pk);
        });
      }

      query = query.where("duties.action", action)
        .where("duties.is_deleted", FLAG_EXIST)
        .where(function() {
          this.where("duties.duty_type", DUTY_TYPE.DAILY)
            .orWhere(function() {
              this.where("duties.duty_type", DUTY_TYPE.PERIOD)
                .where(db.raw("TO_CHAR(duties.start_date, 'YYYY-MM-DD')"), "<=", now)
                .where(db.raw("TO_CHAR(duties.end_date, 'YYYY-MM-DD')"), ">=", now);
            });
        });

      if (user_pk !== undefined && user_pk !== 0) {
        query = query.where(function() {
          this.where(function() {
            this.where("achieves.user_pk", user_pk)
              .where(function() {
                this.where(function () {
                  this.where("duties.duty_type", DUTY_TYPE.DAILY)
                    .where(db.raw("TO_CHAR(achieves.action_at, 'YYYY-MM-DD')"), "=", now);
                })
                .orWhere("duties.duty_type", DUTY_TYPE.PERIOD);
              });
          })
            .orWhereNull("achieves.user_pk");
        });
        query = query.select("achieves.table_pk");
      }

      query = query.select("duties.duty_pk", "duties.point_type", "duties.duty_type")
        .select(db.raw("TO_CHAR(duties.disp_date, 'YYYY-MM-DD') disp_date"))
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addDuty(params, admin_pk) {
    try {
      const now = new Date();
      const query = db(this.T_DUTIES)
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

  static async editDuty(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_DUTIES)
        .where({ duty_pk: params.duty_pk })
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

  static async findAchievements(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, duty_pk, user_pk, is_now, is_client } = filter;

      let query = db(`${this.T_ACHIEVES} as achieves`)
        .leftJoin(`${this.T_DUTIES} as duties`, "achieves.duty_pk", "duties.duty_pk");

      if (is_client !== 1) {
        query = query
          .leftJoin(`${this.T_USERS} as users`, "achieves.user_pk", "users.user_pk");

        if (keyword) {
          const lowerKeyword = keyword.toLowerCase().trim();
          query = query.where(function() {
            this.where(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(duties.duty_title)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(duties.content)"), "like", `%${lowerKeyword}%`);
          });
        }
      }

      if (duty_pk !== undefined && duty_pk !== "" && duty_pk !== 0) {
        query = query.where("achieves.duty_pk", duty_pk);
      }

      if (user_pk) {
        query = query.where("achieves.user_pk", user_pk);
      }

      if (is_now === 1) {
        const now = moment().format("YYYY-MM-DD");
        query = query.where(function() {
          this.where(function() {
            this.where("duties.duty_type", DUTY_TYPE.DAILY)
              .where(db.raw("TO_CHAR(achieves.action_at, 'YYYY-MM-DD')"), now);
          })
          .orWhere(function() {
            this.where("duties.duty_type", DUTY_TYPE.PERIOD)
              .where(db.raw("TO_CHAR(duties.disp_date, 'YYYY-MM-DD')"), ">=", now);
          });
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

      if (is_client === 1) {
        query = query.select("duties.duty_type");
      } else {
        query = query.select("duties.duty_title")
          .select("users.user_id", "users.user_name");
      }

      query = query
        .select("achieves.table_pk", "achieves.user_pk", "achieves.duty_pk", "achieves.points")
        .select(db.raw("TO_CHAR(achieves.action_at, 'YYYY-MM-DD HH24:MI:SS') action_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findDailyAchievementByFilter(filter) {
    const { user_pk, duty_pk } = filter;
    try {
      let query = db(`${this.T_ACHIEVES} as achieves`)
        .where("achieves.user_pk", user_pk)
        .where("achieves.duty_pk", duty_pk);

      const today = moment().format("YYYY-MM-DD");
      query = query.where(db.raw("TO_CHAR(achieves.action_at, 'YYYY-MM-DD')"), today);

      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPeriodAchievementByFilter(filter) {
    const { user_pk, duty_pk, start_date, end_date } = filter;
    try {
      let query = db(`${this.T_ACHIEVES} as achieves`);

      query = query.where("achieves.user_pk", user_pk)
        .where("achieves.duty_pk", duty_pk);

      query = query.where(function() {
        this.where(db.raw("TO_CHAR(achieves.action_at, 'YYYY-MM-DD')"), "<=", end_date)
          .where(db.raw("TO_CHAR(achieves.action_at, 'YYYY-MM-DD')"), ">=", start_date);
      });

      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findLastAchievement(filter) {
    try {
      let query = db(`${this.T_ACHIEVES} as achieves`)
        .where(filter);
      
      query = query.orderBy("action_at", "desc");
      query = query.select("achieves.point_type", db.raw("TO_CHAR(achieves.action_at, 'YYYY-MM-DD') action_at"));

      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findLastMobileDailyAchievement(user_pk) {
    try {
      let query = db(`${this.T_ACHIEVES} as achieves`)
        .where("user_pk", user_pk)
        .where("point_type", "like", `${POINT_TYPE_VALUES.MOBILE_DAILY_LOGIN_PREFIX}%`);
      
      query = query.orderBy("action_at", "desc");
      query = query.select("achieves.table_pk", "achieves.point_type", db.raw("TO_CHAR(achieves.action_at, 'YYYY-MM-DD') action_at"));

      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addAchievement(params) {
    try {
      const now = new Date();
      const query = db(this.T_ACHIEVES)
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

  static async editAchievement(params) {
    try {
      const now = new Date();
      let newParams = params;
      if (!params.action_at) {
        newParams = { ...params, action_at: now };
      }

      const rowCount = await db(this.T_ACHIEVES)
        .where("table_pk", params.table_pk)
        .update({
          ...newParams,
        })
        .returning("*");

      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }
}

module.exports = ExperienceModel;
