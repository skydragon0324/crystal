const db = require('../db/knex');
const { FLAG_EXIST, ACTION_TYPE, REPORT_STATUS } = require('../constants/constants');

class DeviceModel {
  static T_DEVICES = "ora_pid.devices";
  static T_REPORTS = "ora_pid.device_reports";
  static T_USERS = "ora_pid.users";
  static T_PHONE_NUMS = "ora_pid.user_phone_numbers";
  static T_PHONES = "ora_pid.smart_phones";
  static T_MANAGERS = "ora_pid.managers";

  static async findCidDevices(filter, isCount = false) {
    try {
      const { offset, limit, sort, user_pk, keyword, min_at, max_at, is_deleted, field } = filter;

      let query = db(`${this.T_DEVICES} as devices`)
        .leftJoin(`${this.T_PHONES} as phones`, function() {
          this.on("devices.phone_brand", "phones.phone_brand")
            .andOn("devices.phone_model", "phones.phone_model");
        })
        .leftJoin(`${this.T_USERS} as members`, "devices.cid", "members.cid");
      if (!user_pk) {
        query = query.leftJoin(`${this.T_USERS} as users`, "devices.user_pk", "users.user_pk");
      }

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        if (field === "user" && !user_pk) {
          query = query.where(function() {
            this.where(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
              .orWhere("users.user_pk", "like", `${lowerKeyword}`);
          });
        } else if (field === "member") {
          query = query.where(function() {
            this.where(db.raw("LOWER(members.user_id)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(members.user_name)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("members.user_pk"), "like", `${lowerKeyword}`);
          });
        } else if (field === "cid") {
          query = query.where(db.raw("LOWER(devices.cid)"), "like", `%${lowerKeyword}%`);
        } else if (field === "phone") {
          query = query.where(function() {
            this.where(db.raw("LOWER(phones.phone_name)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(devices.phone_brand)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(devices.phone_model)"), "like", `%${lowerKeyword}%`)
          });
        } else if (field === "imei") {
          query = query.where(db.raw("LOWER(devices.phone_imei)"), "like", `%${lowerKeyword}%`);
        }
      }

      if (user_pk) {
        query = query.where("devices.user_pk", user_pk);
      }

      if (min_at !== undefined && min_at !== "") {
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(devices.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function() {
                this.where("devices.is_deleted", FLAG_EXIST)
                .where(db.raw("TO_CHAR(devices.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
              });
          });
        } else {
          query = query.where("devices.is_deleted", FLAG_EXIST)
            .where(db.raw("TO_CHAR(devices.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (is_deleted !== undefined && is_deleted !== "") {
          query = query.where("devices.is_deleted", is_deleted);
        }

        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(devices.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
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

      if (!user_pk) {
        query = query.select("devices.user_pk")
          .select(db.raw("TO_CHAR(devices.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
          .select("users.user_id", "users.user_name");
      }

      query = query.select("devices.device_pk", "devices.cid", "devices.phone_imei", "devices.phone_brand", "devices.phone_model", "devices.is_deleted", "devices.report_status")
        .select(db.raw("TO_CHAR(devices.last_logged_in, 'YYYY-MM-DD HH24:MI:SS') last_logged_in"))
        .select(db.raw("TO_CHAR(devices.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .select("phones.phone_name")
        .select("members.user_id as member_id", "members.user_name as member_name")
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findDeviceByPk(device_pk) {
    try {
      const query = db(this.T_DEVICES).where({ device_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findDeviceUserByPk(device_pk) {
    try {
      const query = db(`${this.T_DEVICES} as devices`)
        .leftJoin(`${this.T_USERS} as users`, "devices.user_pk", "users.user_pk")
        .where("device_pk", device_pk)
        .orderBy("devices.updated_at", "desc")
        .select("devices.device_pk", "devices.user_pk", "devices.cid")
        .select(db.raw("TO_CHAR(devices.last_logged_in, 'YYYY-MM-DD HH24:MI:SS') last_logged_in"))
        .select("users.user_id");
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findDevice(params) {
    try {
      const query = db(this.T_DEVICES).where(params).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findLastDeviceByCid(cid) {
    try {
      let query = db(`${this.T_DEVICES} as devices`)
        .leftJoin(`${this.T_USERS} as users`, "devices.user_pk", "users.user_pk")
        .where("devices.cid", cid)
        .where("devices.is_deleted", FLAG_EXIST)
        .orderBy("devices.last_logged_in", "desc")
        .select("users.user_id");
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findLastDeviceByUserPk(user_pk) {
    try {
      let query = db(`${this.T_DEVICES} as devices`)
        .leftJoin(`${this.T_PHONES} as phones`, function() {
          this.on("devices.phone_brand", "=", "phones.phone_brand")
            .andOn("devices.phone_model", "=", "phones.phone_model");
        })
        .where("devices.user_pk", user_pk)
        .where("devices.is_deleted", FLAG_EXIST)
        .orderBy("devices.last_logged_in", "desc")
        .select("devices.phone_brand", "devices.phone_model", "devices.phone_imei")
        .select("phones.phone_name");
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findLastDeviceByImei(phone_imei) {
    try {
      let query = db(`${this.T_DEVICES} as devices`)
        .leftJoin(`${this.T_USERS} as users`, "devices.user_pk", "users.user_pk")
        .leftJoin(`${this.T_PHONES} as phones`, function() {
          this.on("devices.phone_brand", "=", "phones.phone_brand")
            .andOn("devices.phone_model", "=", "phones.phone_model");
        })
        .where("devices.phone_imei", phone_imei)
        .orderBy("devices.last_logged_in", "desc")
        .select("devices.cid", "devices.phone_brand", "devices.phone_model", "devices.phone_imei")
        .select("users.user_pk", "users.user_id", "users.user_name", "users.gender")
        .select(db.raw("TO_CHAR(users.birthday, 'YYYY-MM-DD') birthday"))
        .select("phones.phone_name");
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findDeviceMemberByPk(device_pk) {
    try {
      let query = db(`${this.T_DEVICES} as devices`)
        .leftJoin(`${this.T_USERS} as members`, "devices.cid", "members.cid")
        .where("devices.device_pk", device_pk)
        .select("devices.user_pk", db.raw("NVL(members.user_pk, 0) as member_pk"), db.raw("NVL(members.status, 1) as member_status"));
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addDevice(params) {
    try {
      const now = new Date();
      const query = db(this.T_DEVICES)
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

  static async editDevice(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_DEVICES)
        .where({ device_pk: params.device_pk })
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findReports(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, status, field } = filter;

      let query = db(`${this.T_REPORTS} as reports`)
        .leftJoin(`${this.T_DEVICES} as devices`, "reports.device_pk", "devices.device_pk")
        .leftJoin(`${this.T_PHONES} as phones`, function() {
          this.on("devices.phone_brand", "phones.phone_brand")
            .andOn("devices.phone_model", "phones.phone_model");
        })
        .leftJoin(`${this.T_USERS} as users`, "devices.user_pk", "users.user_pk")
        .leftJoin(`${this.T_USERS} as members`, "reports.target_pk", "members.user_pk")
        .leftJoin(`${this.T_MANAGERS} as resolvers`, "reports.resolve_by", "resolvers.manager_pk")
        .leftJoin(`${this.T_MANAGERS} as reporters`, function() {
          this.on("reporters.manager_pk", "reports.report_by")
            .andOn("reports.report_type", ACTION_TYPE.MANAGER)
        });

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        if (field === "user") {
          query = query.where(function() {
            this.where(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
              .orWhere("users.user_pk", "like", `${lowerKeyword}`);
          });
        } else if (field === "member") {
          query = query.where(function() {
            this.where(db.raw("LOWER(members.user_id)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(members.user_name)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("members.user_pk"), "like", `${lowerKeyword}`);
          });
        } else if (field === "cid") {
          query = query.where(db.raw("LOWER(devices.cid)"), "like", `%${lowerKeyword}%`);
        } else if (field === "phone") {
          query = query.where(function() {
            this.where(db.raw("LOWER(phones.phone_name)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(devices.phone_brand)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(devices.phone_model)"), "like", `%${lowerKeyword}%`)
          });
        } else if (field === "imei") {
          query = query.where(db.raw("LOWER(devices.phone_imei)"), "like", `%${lowerKeyword}%`);
        } else if (field === "resolver") {
          query = query.where(function() {
            this.where(db.raw("LOWER(resolvers.manager_id)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(resolvers.manager_name)"), "like", `%${lowerKeyword}%`)
          });
        }
      }
      if (status !== -1) {
        query = query.where("reports.status", status);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      query = query.select("reports.report_pk", "reports.device_pk", "reports.report_type", "reports.status")
        .select(db.raw("TO_CHAR(reports.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
        .select(db.raw("TO_CHAR(reports.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .select("devices.cid", "devices.phone_imei", "devices.phone_brand", "devices.phone_model")
        .select("phones.phone_name")
        .select("users.user_pk", "users.user_id", "users.user_name")
        .select("members.user_id as member_id", "members.user_name as member_name")
        .select("reporters.manager_name as reporter_name")
        .select("resolvers.manager_name as resolver_name")
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findReportByPk(report_pk) {
    try {
      const query = db(this.T_REPORTS)
        .where("report_pk", report_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findLastReportByDevicePk(device_pk) {
    try {
      const query = db(`${this.T_REPORTS} as reports`)
        .where("device_pk", device_pk)
        .orderBy("created_at", "desc");
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findReportTargetCount(target_pk) {
    try {
      const query = db(`${this.T_REPORTS} as reports`)
        .where("target_pk", target_pk)
        .where("status", REPORT_STATUS.ACCEPTED)
        .count({ total: "*" })
        .first();

      const row =  await query;
      return row.total;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findReportCountByDevicePk(device_pk) {
    try {
      const query = db(`${this.T_REPORTS} as reports`)
        .where("device_pk", device_pk)
        .count({ total: "*" })
        .first();

      const row =  await query;
      return row.total;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addReport(params) {
    try {
      const now = new Date();
      const query = db(this.T_REPORTS)
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

  static async editReport(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_REPORTS)
        .where("report_pk", params.report_pk)
        .update({
          ...params,
          updated_at: now,
        });

      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findSmartPhones(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword } = filter;

      let query = db(`${this.T_PHONES} as phones`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(db.raw("LOWER(phones.phone_brand)"), "like", `%${lowerKeyword}%`)
          .orWhere(db.raw("LOWER(phones.phone_model)"), "like", `%${lowerKeyword}%`)
          .orWhere(db.raw("LOWER(phones.phone_name)"), "like", `%${lowerKeyword}%`)
          .orWhere(db.raw("LOWER(phones.company)"), "like", `%${lowerKeyword}%`);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      query = query.select("phones.phone_pk", "phones.phone_brand", "phones.phone_model", "phones.phone_name", "phones.company", "phones.created_at")
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findSmartPhoneByPk(phone_pk) {
    try {
      const query = db(this.T_PHONES).where({ phone_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findSmartPhoneByFilter(filter) {
    try {
      const query = db(this.T_PHONES).where(filter).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPhoneCompanies() {
    try {
      const query = db(this.T_PHONES)
        .orderBy("company", "asc")
        .select(db.raw("DISTINCT(company) company"));
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPhoneModelByCompany(company_name) {
    try{
      const query = db(this.T_PHONES)
        .orderBy("phone_name", "asc")
        .select("phone_name")
        .where("company",company_name);

      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addSmartPhone(params) {
    try {
      const now = new Date();
      const query = db(this.T_PHONES)
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

  static async editSmartPhone(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_PHONES)
        .where("phone_pk", params.phone_pk)
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async deleteSmartPhone(phone_pk) {
    try {
      const rowCount = await db(this.T_PHONES)
        .where({ phone_pk })
        .del();
      
      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }
}

module.exports = DeviceModel;
