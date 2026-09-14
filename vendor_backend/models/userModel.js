const db = require('../db/knex');
const { PHONE_TYPE, ACTION_TYPE, FIXED_STATUS, USER_PWD_STATUS, USER_REG_STATUS, DELIVERABLE_DISTRICTS, ID_PREFIX_PID, ID_PREFIX_PH, MERGE_ID_TYPE } = require('../constants/constants');
const { getLangText } = require('../lang/lang');

class UserModel {
  static T_USERS = "ora_pid.users";
  static T_TESTERS = "ora_pid.testers";
  static T_LOC = "ora_pid.locations";
  static T_PHONE = "ora_pid.user_phone_numbers";
  static T_CODES = "ora_pid.user_verify_codes";
  static T_EDIT_LOG = "ora_pid.user_edit_log";
  static T_PWD_LOG = "ora_pid.user_password_log";
  static T_REG_LOG = "ora_pid.user_register_log";
  static T_LOGIN_LOG = "ora_pid.user_login_log";
  static T_MERGE_IDS = "ora_pid.user_merge_ids";
  static T_MERGE_LOG = "ora_pid.user_merge_log";
  static T_FIXED_LOG = "ora_pid.user_fixed_log";
  static T_BLOCK_LOG = "ora_pid.user_block_log";
  static T_SPECIAL = "ora_pid.special_923";
  static T_MANAGERS = "ora_pid.managers";
  static T_PHONES = "ora_pid.smart_phones";
  static T_DEVICES = "ora_pid.devices";
  static T_WHITE_LIST = "ora_pid.user_white_list";
  static T_CID_LOCK = "ora_pid.user_cid_lock";
  static T_CUSTOMERS = "ora_old_db.customers";

  static async findTesters(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword } = filter;

      let query = db(`${this.T_TESTERS} as testers`);
      if (keyword) {
          const lowerKeyword = keyword.toLowerCase().trim();
          query = query.where(function() {
            this.where(db.raw("LOWER(testers.tester_name)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(testers.phone_imei)"), "like", `%${lowerKeyword}%`)
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
        .select("testers.tester_pk", "testers.phone_imei", "testers.tester_name", "testers.is_deleted", "testers.created_at",)
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }
  
  static async findTesterByImei(phone_imei) {
    try {
      let query = db(`${this.T_TESTERS} as testers`);
      query = query.where("testers.phone_imei", phone_imei);
      query = query.select("testers.tester_pk");
      query = query.first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addTester(params) {
    try {
      const now = new Date();
      const query = db(this.T_TESTERS)
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

  static async editTester(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_TESTERS)
        .where({ tester_pk: params.tester_pk })
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findTesterByPk(tester_pk) {
    try {
      const query = db(this.T_TESTERS).where({ tester_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findAllUsers(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, search_phone, gender, parent_location_code, job } = filter;

      let filtered_user_pks = [];
      if (search_phone === 1 && keyword) {
        const phones = await this.findPhonesSearch(keyword);
        filtered_user_pks = Array.from(new Set(phones.map(phone => phone.user_pk)));
      }

      let query = db(`${this.T_USERS} as users`)
        .leftJoin(`${this.T_LOC} as loc`, "users.location_pk", "loc.location_pk")
        .leftJoin(`${this.T_LOC} as parent_loc`, "loc.parent_code", "parent_loc.location_code")
        .leftJoin(`${this.T_LOC} as grand_loc`, "parent_loc.parent_code", "grand_loc.location_code")
        .leftJoin(`${this.T_MERGE_IDS} as ids`, "users.user_pk", "ids.pvendor_pk");

      if (keyword) {
        if (search_phone === 0) {
          const lowerKeyword = keyword.toLowerCase().trim();
          query = query.where(function() {
            this.where(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(users.user_pk)"), `${lowerKeyword}`)
              .orWhere(db.raw("LOWER(users.user_alias)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("TO_CHAR(users.birthday, 'YYYY.MM.DD')"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(users.cid)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("TRIM((grand_loc.location_name || ' ' || parent_loc.location_name || ' ' || loc.location_name))"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(ids.fixed_id)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(ids.eshop_id)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(ids.appstore_id)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(ids.mass_id)"), "like", `%${lowerKeyword}%`);
          });
        } else {
          query = query.whereIn("user_pk", filtered_user_pks);
        }
      }
      if (gender) {
        query = query.where("users.gender", gender);
      }
      if (parent_location_code) {
        query = query.where("loc.location_code", "like", `%${parent_location_code}`);
      }
      if (job) {
        query = query.where("users.job", job);
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
        .select("users.user_pk", "users.user_id", "users.user_name", "users.user_alias", "users.user_avatar", "users.gender", "users.job", "users.cid", "users.status", "users.locked")
        .select(db.raw("TO_CHAR(users.birthday, 'YYYY-MM-DD') birthday"))
        .select(db.raw("TO_CHAR(users.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
        .select("loc.location_pk", "loc.location_code", "loc.parent_code", db.raw(`TRIM((grand_loc.location_name || ' ' || parent_loc.location_name || ' ' || loc.location_name)) AS location_full_name`))
        .select("ids.fixed_id", "ids.fixed_status", "ids.appstore_id", "ids.eshop_id", "ids.mass_id")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      const rows = await query;

      const user_pks = rows.map(row => row.user_pk);
      const phones = await this.findPhonesInUserPks(user_pks);

      const result = rows.map(item => ({
        ...item,
        phones: phones.filter(phone => phone.user_pk === item.user_pk)
      }));

      return result;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findUserByPk(user_pk) {
    try {
      const query = db(this.T_USERS).where({ user_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findUserById(user_id) {
    try {
      let query = db(`${this.T_USERS} as users`);
      query = query.where("users.user_id", user_id);
      query = query.select("users.user_pk", "users.user_name", "users.gender", "users.job")
        .select(db.raw("TO_CHAR(users.birthday, 'YYYY-MM-DD') birthday"));
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findUserByLowerId(user_id) {
    try {
      const lower_id = user_id.toLowerCase();
      let query = db(`${this.T_USERS} as users`);
      query = query.where(db.raw("LOWER(users.user_id)"), lower_id);
      query = query.select("users.user_pk", "users.user_name");
      query = query.first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findUserByPhId(user_id) {
    try {
      const lower_id = user_id.toLowerCase();
      let query = db(`${this.T_USERS} as users`);
      query = query.where(db.raw(`LOWER(REPLACE(users.user_id, '${ID_PREFIX_PID}', '${ID_PREFIX_PH}'))`), lower_id);
      query = query.select("users.user_pk");
      query = query.first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findUserByCid(cid, isSimple = true) {
    try {
      let query = db(`${this.T_USERS} as users`);
      query = query.where("users.cid", cid);
      if (isSimple) {
        query = query.select("users.user_pk", "users.user_id");
      }
      query = query.first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findUserEshopInfoByCid(cid) {
    try {
      let query = db(`${this.T_USERS} as users`)
        .leftJoin(`${this.T_MERGE_IDS} as merge_ids`, "users.user_pk", "merge_ids.pvendor_pk")
        .where("users.cid", cid)
        .select("users.user_pk", "users.user_id", "users.user_name", "users.gender", "users.password", "users.cid", "users.status")
        .select(db.raw("TO_CHAR(users.birthday, 'YYYY-MM-DD') birthday"))
        .select("merge_ids.eshop_pk", "merge_ids.eshop_id");

      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findUserByPkForApp(user_pk) {
    try {
      const query = db(this.T_USERS)
        .where({ user_pk })
        .select("user_pk", "user_id", "password", "user_name", "gender", "job", "cid", "status")
        .select(db.raw("TO_CHAR(birthday, 'YYYY-MM-DD') birthday"))
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findUsersForCrm(filter) {
    try {
      const { offset, limit } = filter;

      let query = db(`${this.T_USERS} as users`)
        .leftJoin(`${this.T_LOC} as loc`, "users.location_pk", "loc.location_pk")
        .leftJoin(`${this.T_LOC} as parent_loc`, "loc.parent_code", "parent_loc.location_code")
        .leftJoin(`${this.T_LOC} as grand_loc`, "parent_loc.parent_code", "grand_loc.location_code")
        .orderBy("users.user_pk", "asc")
        .select("users.user_pk", "users.user_id", "users.user_name", "users.gender", "users.job")
        .select(db.raw("TO_CHAR(users.birthday, 'YYYY-MM-DD') birthday"))
        .select(db.raw("TO_CHAR(users.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"), db.raw("TO_CHAR(users.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .select(db.raw(`TRIM((grand_loc.location_name || ' ' || parent_loc.location_name || ' ' || loc.location_name)) AS address`))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findUserProfileByPk(user_pk) {
    try {
      let query = db(`${this.T_USERS} as users`)
        .leftJoin(`${this.T_PHONE} as phones`, function() {
          this.on("users.user_pk", "phones.user_pk")
            .andOn("phones.phone_type", PHONE_TYPE.USER);
        })
        .leftJoin(`${this.T_LOC} as loc`, "users.location_pk", "loc.location_pk")
        .leftJoin(`${this.T_LOC} as parent_loc`, "loc.parent_code", "parent_loc.location_code")
        .leftJoin(`${this.T_LOC} as grand_loc`, "parent_loc.parent_code", "grand_loc.location_code")
      if (user_pk) {
        query = query.where("users.user_pk", user_pk);
      }

      query = query.select("users.user_pk", "users.user_id", "users.password", "users.user_name", "users.gender", "users.job", "users.location_pk", "users.cid", "users.status")
        .select(db.raw("TO_CHAR(users.birthday, 'YYYY-MM-DD') birthday"))
        .select("phones.phone_number")
        .select(db.raw(`TRIM((grand_loc.location_name || ' ' || parent_loc.location_name || ' ' || loc.location_name)) AS location_full_name`))
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findUserAllInfoByPk(user_pk) {
    try {
      let query = db(`${this.T_USERS} as users`)
        .leftJoin(`${this.T_MERGE_IDS} as ids`, "users.user_pk", "ids.pvendor_pk");
      if (user_pk) {
        query = query.where("users.user_pk", user_pk);
      }

      query = query.select("users.user_pk", "users.user_id", "users.user_name", "users.user_alias", "users.user_avatar", "users.gender", "users.job", "users.location_pk", "users.cid", "users.status", "users.locked")
        .select(db.raw("TO_CHAR(users.birthday, 'YYYY-MM-DD') birthday"))
        .select("ids.fixed_id", "ids.fixed_status", "ids.appstore_id", "ids.eshop_id", "ids.mass_id")
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findUserAllInfoById(user_id) {
    try {
      let query = db(`${this.T_USERS} as users`)
        .leftJoin(`${this.T_PHONE} as phones`, function() {
          this.on("users.user_pk", "phones.user_pk")
            .andOn("phones.phone_type", PHONE_TYPE.USER);
        })
      if (user_id) {
        query = query.where("users.user_id", user_id);
      }

      query = query.select("users.user_pk", "users.user_id", "users.password", "users.user_name", "users.user_alias", "users.user_avatar", "users.gender", "users.job", "users.location_pk", "users.cid", "users.status", "users.locked")
        .select(db.raw("TO_CHAR(users.birthday, 'YYYY-MM-DD') birthday"))
        .select("phones.phone_number")
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findUserAppInfoById(user_id) {
    try {
      let query = db(`${this.T_USERS} as users`)
        .leftJoin(`${this.T_LOC} as loc`, "users.location_pk", "loc.location_pk")
        .leftJoin(`${this.T_LOC} as parent_loc`, "loc.parent_code", "parent_loc.location_code")
        .leftJoin(`${this.T_LOC} as grand_loc`, "parent_loc.parent_code", "grand_loc.location_code")
        .leftJoin(`${this.T_PHONE} as phones`, function() {
          this.on("users.user_pk", "phones.user_pk")
            .andOn("phones.phone_type", PHONE_TYPE.USER);
        });
      if (user_id) {
        query = query.where("users.user_id", user_id);
      }

      query = query.select("users.user_pk", "users.user_id", "users.password", "users.user_name", "users.gender", "users.job", "users.location_pk", "users.cid", "users.status")
        .select(db.raw("TO_CHAR(users.birthday, 'YYYY-MM-DD') birthday"))
        .select(db.raw(`TRIM((grand_loc.location_name || ' ' || parent_loc.location_name || ' ' || loc.location_name)) AS location_full_name`))
        .select("phones.phone_number")
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findValidUsersByIds(user_ids) {
    try {
      const query = db(this.T_USERS)
        .whereIn("user_id", user_ids)
        .select("user_pk", "user_id");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findUserBirthdayByPk(user_pk) {
    try {
      const query = db(this.T_USERS)
        .where("user_pk", user_pk)
        .select(db.raw("TO_CHAR(birthday, 'MM-DD') birth_date"))
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findUserForAS(filter) {
    const { user_id, is_match, limit_date } = filter;
    try {
      let query = db(this.T_USERS);
      if (+is_match === 1) {
        query = query.where("user_id", user_id);
      } else {
        query = query.where(db.raw("LOWER(user_id)"), "like", `%${user_id}%`);
      }
      if (limit_date) {
        query = query.where(db.raw("TO_CHAR(created_at, 'YYYY-MM-DD')"), "<=", limit_date);
      }
      query = query.select("user_pk", "user_id", "user_name")
        .select(db.raw("TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"));
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addUser(params) {
    try {
      const now = new Date();
      const query = db(this.T_USERS)
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

  static async editUser(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_USERS)
        .where({ user_pk: params.user_pk })
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async deleteUserByPk(user_pk) {
    try {
      const rowCount = await db(this.T_USERS)
        .where({ user_pk })
        .del();
      
      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }

  static async findSpecialUserByPk(table_pk) {
    try {
      const query = db(this.T_SPECIAL)
        .where("table_pk", table_pk);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPhoneByPk(phone_pk) {
    try {
      const query = db(this.T_PHONE).where({ phone_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPhonesByUserPk(user_pk) {
    try {
      const query = db(this.T_PHONE).where({ user_pk })
        .select("phone_pk", "phone_number", "phone_type");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPhonesInUserPks(user_pks) {
    try {
      const query = db(this.T_PHONE)
        .whereIn("user_pk", user_pks)
        .select("phone_pk", "user_pk", "phone_number", "phone_type");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPhonesSearch(keyword) {
    try {
      const lowerKeyword = keyword.toLowerCase().trim();
      const query = db(this.T_PHONE)
        .where("phone_number", "like", `%${lowerKeyword}%`)
        .select("phone_pk", "user_pk", "phone_number", "phone_type");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findUserPhoneByUserPk(user_pk) {
    try {
      const query = db(this.T_PHONE)
        .where("user_pk", user_pk)
        .where("phone_type", PHONE_TYPE.USER)
        .select("phone_pk", "phone_number");
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findUserAndMgrPhonesByUserPk(user_pk) {
    try {
      const query = db(this.T_PHONE)
        .where("user_pk", user_pk)
        .whereIn("phone_type", [PHONE_TYPE.USER, PHONE_TYPE.MANAGER])
        .select("phone_pk", "phone_number");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findUserPhonesByFilter(filter) {
    try {
      const query = db(this.T_PHONE)
        .where(filter)
        .select("phone_pk", "phone_number");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addPhoneNumber(params) {
    try {
      const now = new Date();
      const query = db(this.T_PHONE)
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

  static async addPhoneNumbers(params) {
    try {
      const now = new Date();
      const rows = params.map(row => ({
        ...row,
        created_at: now,
          updated_at: now,
      }));
      const query = db(this.T_PHONE)
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

  static async editPhoneNumber(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_PHONE)
        .where({ phone_pk: params.phone_pk })
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async deletePhoneByPk(phone_pk) {
    try {
      const rowCount = await db(this.T_PHONE)
        .where({ phone_pk })
        .del();
      
      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }

  static async deletePhoneByFilter(filter) {
    try {
      const rowCount = await db(this.T_PHONE)
        .where(filter)
        .del();

      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }

  static async findUserVerifyCode(user_pk, cid) {
    try {
      const query = db(this.T_CODES)
        .where("user_pk", user_pk)
        .where("cid", cid)
        .select("table_pk", "status", "verify_code", "expire_at");
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addUserVerifyCode(params) {
    try {
      const now = new Date();
      const query = db(this.T_CODES)
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

  static async editUserVerifyCode(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_CODES)
        .where("table_pk", params.table_pk)
        .update({
          ...params,
          updated_at: now,
        });

      return rowCount;
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async findUserEditLogs(filter, isCount = false) {
    try {
      const { offset, limit, sort, property_type, keyword } = filter;

      let query = db(`${this.T_EDIT_LOG} as edit_log`)
        .leftJoin(`${this.T_USERS} as users`, "edit_log.user_pk", "users.user_pk")
        .leftJoin(`${this.T_MANAGERS} as managers`, function() {
          this.on("managers.manager_pk", "edit_log.action_by")
            .andOn("edit_log.action_type", ACTION_TYPE.MANAGER);
        });

      if (property_type !== -1) {
        query = query.where("edit_log.property_type", property_type);
      }

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(edit_log.old_value)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(edit_log.new_value)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
            .orWhere("users.user_pk", "like", `${lowerKeyword}`);
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

      query = query.select("edit_log.table_pk", "edit_log.user_pk", "edit_log.property_type", "edit_log.old_value", "edit_log.new_value", "edit_log.action_type")
        .select(db.raw("TO_CHAR(edit_log.action_at, 'YYYY-MM-DD HH24:MI:SS') action_at"))
        .select("users.user_id")
        .select("managers.manager_id", "managers.manager_name")
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching manager: " + err.message);
    }
  }

  static async findUserEditLogCount(filter) {
    try {
      const query = db(this.T_EDIT_LOG)
        .where(filter);
      const totalCount = await query.count({ total: "*" }).first();
      return totalCount.total;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addUserEditLog(params) {
    try {
      const now = new Date();
      const query = db(this.T_EDIT_LOG)
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

  static async findMergeIdByFilter(filter) {
    try {
      const query = db(this.T_MERGE_IDS)
        .where(filter);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findMergeIdByFixedIds(fixed_ids) {
    try {
      const query = db(this.T_MERGE_IDS)
        .whereIn("fixed_id", fixed_ids)
        .where("fixed_status", FIXED_STATUS.APPROVED)
        .select("pvendor_pk", "pvendor_id");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findMergeFixedIdWithoutEshopId(limit) {
    try {
      let query = db(`${this.T_MERGE_IDS} as merge_ids`)
        .leftJoin(`${this.T_USERS} as users`, "merge_ids.pvendor_pk", "users.user_pk")
        .leftJoin(`${this.T_CUSTOMERS} as customers`, "merge_ids.fixed_pk", "customers.user_pk")
        .whereNotNull("merge_ids.fixed_id")
        .where("merge_ids.fixed_status", FIXED_STATUS.APPROVED)
        .whereNull("merge_ids.eshop_id");
      
      if (limit) {
        query = query.limit(limit);
      }

      query = query.select("merge_ids.pvendor_pk")
        .select("users.user_id", "users.user_name", "users.password", "users.birthday")
        .select("customers.user_pk", "customers.user_userid", "customers.user_password", "customers.user_role", "customers.user_status", "customers.user_sex", "customers.user_birthday", "customers.user_address", "customers.user_phone", "customers.user_type", "customers.created_at", "customers.modified_at", "customers.mobile_cid_number");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addMergeId(params) {
    try {
      const now = new Date();
      const query = db(this.T_MERGE_IDS)
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

  static async editMergeId(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_MERGE_IDS)
        .where({ pvendor_pk: params.pvendor_pk })
        .update({
          ...params,
          updated_at: now,
        });

      return rowCount;
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async findMergeLogs(filter, isCount = false) {
    try {
      const { offset, limit, sort, id_type, keyword } = filter;

      let query = db(`${this.T_MERGE_LOG} as merge_log`)
        .leftJoin(`${this.T_MANAGERS} as managers`, function() {
          this.on("managers.manager_pk", "merge_log.action_by")
            .andOn("merge_log.action_type", ACTION_TYPE.MANAGER);
        });

      if (id_type !== -1) {
        query = query.where("merge_log.id_type", id_type);
      }

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(merge_log.pvendor_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("merge_log.pvendor_pk"), "like", `${lowerKeyword}`)
            .orWhere(db.raw("LOWER(merge_log.merge_id)"), "like", `%${lowerKeyword}%`);
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

      query = query.select("merge_log.table_pk", "merge_log.pvendor_pk", "merge_log.pvendor_id", "merge_log.id_type", "merge_log.merge_id", "merge_log.merge_type", "merge_log.action_type")
        .select(db.raw("TO_CHAR(merge_log.action_at, 'YYYY-MM-DD HH24:MI:SS') action_at"))
        .select("managers.manager_id", "managers.manager_name")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching manager: " + err.message);
    }
  }

  static async findMergeLogByFixedId(fixed_id) {
    try {
      let query = db(`${this.T_MERGE_LOG} as merge_log`)
        .where("merge_log.id_type", MERGE_ID_TYPE.FIXED)
        .where("merge_log.merge_id", fixed_id)
        .orderBy("merge_log.action_at", "desc")
        .select("merge_type")
        .select(db.raw("TO_CHAR(action_at, 'YYYY-MM-DD HH24:MI:SS') action_at"));

      return await query.first();
    } catch (err) {
      throw new Error("Error fetching manager: " + err.message);
    }
  }

  static async addMergeLog(params) {
    try {
      const now = new Date();
      const query = db(this.T_MERGE_LOG)
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

  static async findAllLocations(filter, isCount = false) {
    try {
      const { offset, limit, sort, parent_code, keyword, last_at } = filter;

      let query = db(`${this.T_LOC} as locations`);

      if (parent_code !== undefined && parent_code !== "") {
        query = query.where("locations.parent_code", parent_code);
      }

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(db.raw("LOWER(locations.location_name)"), "like", `%${lowerKeyword}%`);
      }

      if (last_at !== undefined && last_at !== "") {
        query = query.where(db.raw("TO_CHAR(locations.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", last_at);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      query = query.select("locations.location_pk", "locations.location_name", "locations.location_code", "locations.parent_code", "locations.position")
        .select(db.raw("TO_CHAR(locations.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findLocationByPk(location_pk) {
    try {
      const query = db(this.T_LOC).where({ location_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findLocationFullNameByPk(location_pk) {
    try {
      const query = db(`${this.T_LOC} as loc`)
        .leftJoin(`${this.T_LOC} as parent_loc`, "loc.parent_code", "parent_loc.location_code")
        .leftJoin(`${this.T_LOC} as grand_loc`, "parent_loc.parent_code", "grand_loc.location_code")
        .where("loc.location_pk", location_pk)
        .select(db.raw(`TRIM((grand_loc.location_name || ' ' || parent_loc.location_name || ' ' || loc.location_name)) AS full_name`))
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findLocationFullNameByUserPk(user_pk) {
    try {
      const query = db(`${this.T_LOC} as loc`)
        .leftJoin(`${this.T_LOC} as parent_loc`, "loc.parent_code", "parent_loc.location_code")
        .leftJoin(`${this.T_LOC} as grand_loc`, "parent_loc.parent_code", "grand_loc.location_code")
        .leftJoin(`${this.T_USERS} as users`, "users.location_pk", "loc.location_pk")
        .where("users.user_pk", user_pk)
        .select(db.raw(`TRIM((grand_loc.location_name || ' ' || parent_loc.location_name || ' ' || loc.location_name)) AS full_name`))
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findLocationByName(location_name, parent_code) {
    try {
      return await db(this.T_LOC)
        .where("location_name", location_name)
        .where("parent_code", parent_code)
        .first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findProvinces() {
    try {
      const query = db(`${this.T_LOC} as loc`)
        .where("loc.parent_code", "0")
        .orderBy("position", "asc")
        .select("location_pk", "location_code", "location_name");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findLastLocationByTime() {
    try {
      const query = db(`${this.T_LOC} as loc`)
        .orderBy("loc.updated_at", "desc")
        .select(db.raw("TO_CHAR(loc.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addLocation(params, admin_pk) {
    try {
      const now = new Date();
      const query = db(this.T_LOC)
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

  static async editLocation(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_LOC)
        .where({ location_pk: params.location_pk })
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

  static async deleteLocationByPk(location_pk) {
    try {
      const rowCount = await db(this.T_LOC)
        .where({ location_pk })
        .del();
      
      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }

  static async findUserPasswordLogs(filter, isCount = false) {
    try {
      const { offset, limit, sort, app_type, keyword } = filter;

      let query = db(`${this.T_PWD_LOG} as pwd_log`)
        .leftJoin(`${this.T_USERS} as users`, "pwd_log.user_pk", "users.user_pk")
        .leftJoin(`${this.T_MANAGERS} as managers`, function() {
          this.on("managers.manager_pk", "pwd_log.action_by")
            .andOn("pwd_log.action_type", ACTION_TYPE.MANAGER);
        });

      if (app_type !== -1) {
        query = query.where("pwd_log.app_type", app_type);
      }

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere("users.user_pk", "like", `${lowerKeyword}`);
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

      query = query.select("pwd_log.table_pk", "pwd_log.user_pk", "pwd_log.user_id", "pwd_log.password", "pwd_log.app_type", "pwd_log.status", "pwd_log.action_type")
        .select(db.raw("TO_CHAR(pwd_log.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
        .select("users.user_name")
        .select("managers.manager_id", "managers.manager_name")
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching manager: " + err.message);
    }
  }

  static async findUserPasswordByPk(table_pk) {
    try {
      const query = db(this.T_PWD_LOG)
        .where("table_pk", table_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addUserPasswordLog(params) {
    try {
      const now = new Date();
      const query = db(this.T_PWD_LOG)
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

  static async ignoreUserPasswordLogs(user_pk, app_type) {
    try {
      const now = new Date();
      let query = db(this.T_PWD_LOG)
        .where("user_pk", user_pk)
        .where("app_type", app_type)
        .where("status", USER_PWD_STATUS.PENDING);

      query = query.update({
        status: USER_PWD_STATUS.IGNORE,
        updated_at: now,
      });
      return await query;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async editUserPasswordLog(params) {
    try {
      const now = new Date();
      let query = db(this.T_PWD_LOG);
      if (params.table_pk) {
        query = query.where("table_pk", params.table_pk);
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

  static async findUserRegisterLogs(filter, isCount = false) {
    try {
      const { offset, limit, sort, app_type, status, keyword } = filter;

      let query = db(`${this.T_REG_LOG} as reg_log`)
        .leftJoin(`${this.T_USERS} as users`, "reg_log.user_pk", "users.user_pk")
        .leftJoin(`${this.T_MANAGERS} as managers`, function() {
          this.on("managers.manager_pk", "reg_log.action_by")
            .andOn("reg_log.action_type", ACTION_TYPE.MANAGER);
        });

      if (app_type !== undefined && app_type !== "") {
        query = query.where("reg_log.app_type", app_type);
      }
      if (status !== undefined && status !== "") {
        query = query.where("reg_log.status", status);
      }

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere("users.user_pk", "like", `${lowerKeyword}`)
            .orWhere(db.raw("LOWER(reg_log.cid)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(reg_log.iccid)"), "like", `%${lowerKeyword}%`);
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

      query = query.select("reg_log.table_pk", "reg_log.user_pk", "reg_log.cid", "reg_log.iccid", "reg_log.app_type", "reg_log.status", "reg_log.action_type", "reg_log.created_at")
        .select("users.user_id", "users.user_name")
        .select("managers.manager_id")
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching manager: " + err.message);
    }
  }

  static async findUserRegisterLogByPk(table_pk) {
    try {
      const query = db(this.T_REG_LOG)
        .where("table_pk", table_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addUserRegisterLog(params) {
    try {
      const now = new Date();
      const query = db(this.T_REG_LOG)
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

  static async ignoreUserRegisterLogs(user_pk, app_type) {
    try {
      const now = new Date();
      let query = db(this.T_REG_LOG)
        .where("user_pk", user_pk)
        .where("status", USER_REG_STATUS.PENDING);

      if (app_type !== undefined) {
        query = query.where("app_type", app_type)
      }

      query = query.update({
        status: USER_REG_STATUS.IGNORE,
        updated_at: now,
      });
      return await query;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async editUserRegisterLog(params) {
    try {
      const now = new Date();
      let query = db(this.T_REG_LOG);
      if (params.table_pk) {
        query = query.where("table_pk", params.table_pk);
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

  static async findUserFixedLogs(filter, isCount = false) {
    try {
      const { offset, limit, sort, func_type, status, keyword } = filter;

      let query = db(`${this.T_FIXED_LOG} as fixed_log`)
        .leftJoin(`${this.T_USERS} as users`, "fixed_log.user_pk", "users.user_pk");

      if (func_type !== undefined && func_type !== "" && func_type !== -1) {
        query = query.where("fixed_log.func_type", func_type);
      }
      if (status !== undefined && status !== "") {
        query = query.where("fixed_log.status", status);
      }

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(fixed_log.user_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(fixed_log.fixed_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere("users.user_pk", "like", `${lowerKeyword}`);
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

      query = query.select("fixed_log.table_pk", "fixed_log.user_pk", "fixed_log.user_id", "fixed_log.fixed_id", "fixed_log.func_type", "fixed_log.status", "fixed_log.created_at")
        .select("users.user_name")
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching manager: " + err.message);
    }
  }

  static async findUserFixedLogByPk(table_pk) {
    try {
      const query = db(this.T_FIXED_LOG)
        .where("table_pk", table_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addUserFixedLog(params) {
    try {
      const now = new Date();
      const query = db(this.T_FIXED_LOG)
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

  static async editUserFixedLog(params) {
    try {
      const now = new Date();
      let query = db(this.T_FIXED_LOG);
      if (params.table_pk) {
        query = query.where("table_pk", params.table_pk);
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

  static async findUserLoginLogs(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword } = filter;

      let query = db(`${this.T_LOGIN_LOG} as login_log`)
        .leftJoin(`${this.T_PHONES} as phones`, function() {
          this.on("login_log.phone_brand", "phones.phone_brand")
            .andOn("login_log.phone_model", "phones.phone_model");
        })
        .leftJoin(`${this.T_USERS} as users`, "login_log.user_pk", "users.user_pk");

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(phones.phone_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(login_log.cid)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(login_log.phone_brand)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(login_log.phone_model)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(login_log.phone_imei)"), "like", `%${lowerKeyword}%`);
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

      query = query.select("login_log.table_pk", "login_log.user_pk", "login_log.cid", "login_log.phone_brand", "login_log.phone_model", "login_log.phone_imei", "login_log.action_at")
        .select("phones.phone_name")
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

  static async addUserLoginLog(params) {
    try {
      const now = new Date();
      const query = db(this.T_LOGIN_LOG)
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

  static async findUserBlockLogs(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword } = filter;

      let query = db(`${this.T_BLOCK_LOG} as block_log`)
        .leftJoin(`${this.T_USERS} as users`, "block_log.user_pk", "users.user_pk")
        .leftJoin(`${this.T_MANAGERS} as managers`, "block_log.action_by", "managers.manager_pk");

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(block_log.reason)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere("users.user_pk", "like", `${lowerKeyword}`)
            .orWhere(db.raw("LOWER(managers.manager_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(managers.manager_name)"), "like", `%${lowerKeyword}%`)
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

      query = query.select("block_log.table_pk", "block_log.user_pk", "block_log.reason", "block_log.status")
        .select(db.raw("TO_CHAR(block_log.action_at, 'YYYY-MM-DD HH24:MI:SS') action_at"))
        .select("users.user_id", "users.user_name")
        .select("managers.manager_name")
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async addUserBlockLog(params, admin_pk) {
    try {
      const now = new Date();
      const query = db(this.T_BLOCK_LOG)
        .insert({
          ...params,
          action_at: now,
          action_by: admin_pk,
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

  static async findUserStatisticsByUser(filter) {
    const { category, parent_location_code } = filter;
    if (!["gender", "age", "job", "location"].includes(category)) {
      return [];
    }

    try {
      let query = db(`${this.T_USERS} as users`);

      if (category === "gender") {
        query = query.groupBy("users.gender")
          .select(db.raw(`CASE WHEN users.gender = 'M' THEN '${getLangText("MALE")}' ELSE '${getLangText("FEMALE")}' END as field`))
          .select(db.raw("COUNT(1) count"));
      } else if (category === "age") {
        query = query.groupBy(db.raw("FLOOR((EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM users.birthday))/10)"))
          .orderBy("field", "asc")
          .select(db.raw(db.raw(`CONCAT((FLOOR((EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM users.birthday))/10)*10), '${getLangText("TEXT_UNIT_TEN_AGE")}') as field`)))
          .select(db.raw("COUNT(1) count"));
      } else if (category === "location") {
        query = query.leftJoin(`${this.T_LOC} as loc`, "users.location_pk", "loc.location_pk");
        if (parent_location_code) {
          query = query.leftJoin(`${this.T_LOC} as parent_loc`, "parent_loc.location_code", db.raw("TO_NUMBER(SUBSTR(loc.location_code, LENGTH(loc.location_code)-3, 4))"))
            .where("loc.location_code", "like", `%${parent_location_code}`);
        } else {
          query = query.leftJoin(`${this.T_LOC} as parent_loc`, "parent_loc.location_code", db.raw("TO_NUMBER(SUBSTR(loc.location_code, LENGTH(loc.location_code)-1, 2))"));
        }
        query = query.groupBy("parent_loc.location_name")
          .orderBy(db.raw("MAX(parent_loc.position)"), "asc")
          .select(db.raw(`NVL(parent_loc.location_name, '${getLangText("TEXT_ETC")}') as field`))
          .select(db.raw("COUNT(1) count"));
      } else if (category === "job") {
        query = query.groupBy("users.job")
          .orderBy("users.job", "asc")
          .select(db.raw("NVL(users.job, 0) as field"))
          .select(db.raw("COUNT(1) count"));
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findUserStatisticsByRegister(filter) {
    const { gender, age, parent_location_code, job, date_format, from, to } = filter;

    try {
      let query = db(`${this.T_USERS} as users`);

      if (parent_location_code) {
        query = query.leftJoin(`${this.T_LOC} as loc`, "users.location_pk", "loc.location_pk");
      }

      if (gender) {
        query = query.where("users.gender", gender);
      }

      if (age !== -1) {
        query = query.where(db.raw("FLOOR((EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM users.birthday))/10)*10"), age);
      }

      if (job !== -1) {
        query = query.where("users.job", job);
      }

      if (parent_location_code) {
        query = query.where("loc.location_code", "like", `%${parent_location_code}`);
      }

      if (from && to) {
        query = query.where(db.raw("TO_CHAR(users.created_at, 'YYYY-MM-DD')"), ">=", from)
          .where(db.raw("TO_CHAR(users.created_at, 'YYYY-MM-DD')"), "<=", to);
      }

      query = query.groupBy(db.raw(`TO_CHAR(users.created_at, '${date_format}')`))
        .orderBy("field", "asc");

      query = query.select(db.raw(`TO_CHAR(users.created_at, '${date_format}') as field`))
        .select(db.raw("COUNT(1) count"));

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findUserStatisticsByLogin(filter) {
    const { gender, age, parent_location_code, job, date_format, from, to } = filter;

    try {
      let query = db(`${this.T_LOGIN_LOG} as login_log`)
        .leftJoin(`${this.T_USERS} as users`, "login_log.user_pk", "users.user_pk");

      if (parent_location_code) {
        query = query.leftJoin(`${this.T_LOC} as loc`, "users.location_pk", "loc.location_pk");
      }

      if (gender) {
        query = query.where("users.gender", gender);
      }

      if (age !== -1) {
        query = query.where(db.raw("FLOOR((EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM users.birthday))/10)*10"), age);
      }

      if (job !== -1) {
        query = query.where("users.job", job);
      }

      if (parent_location_code) {
        query = query.where("loc.location_code", "like", `%${parent_location_code}`);
      }
      
      if (from && to) {
        query = query.where(db.raw("TO_CHAR(login_log.action_at, 'YYYY-MM-DD')"), ">=", from)
          .where(db.raw("TO_CHAR(login_log.action_at, 'YYYY-MM-DD')"), "<=", to);
      }

      query = query.groupBy(db.raw(`TO_CHAR(login_log.action_at, '${date_format}')`))
        .groupBy("login_log.user_pk")
        .select(db.raw(`TO_CHAR(login_log.action_at, '${date_format}') as field`))
        .select("login_log.user_pk");

      query = query.as("T1");

      let query2 = db(query)
        .groupBy("T1.field")
        .orderBy("T1.field", "asc");

      query = query2.select("T1.field")
        .select(db.raw("COUNT(1) count"));

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findUserStatisticsByPhone(filter) {
    const { company, phone_name, gender, age, parent_location_code, job, stat_type } = filter;

    try {
      let query1= db(`${this.T_DEVICES} as devices`)
        .groupBy("devices.phone_imei")
        .select(db.raw("MAX(devices.phone_brand) as phone_brand"), db.raw("MAX(devices.phone_model) as phone_model"),db.raw("MAX(devices.user_pk) as user_pk"));
      query1 = query1.as("T1");

      let provinceQuery = db(`${this.T_LOC} as loc`)
      .where("loc.parent_code",0)
      .select(db.raw("TO_NUMBER(loc.location_code) as location_code"))
      .select("loc.location_name")

      provinceQuery = provinceQuery.as("T_PROVINCES")

      let query2 = db(query1)
        .leftJoin(`${this.T_PHONES} as phones`, function() {
          this.on("T1.phone_brand", "phones.phone_brand")
            .andOn("T1.phone_model", "phones.phone_model");
        })
        .leftJoin(`${this.T_USERS} as users`, "T1.user_pk", "users.user_pk")
        .leftJoin(`${this.T_LOC} as loc`, "users.location_pk", "loc.location_pk");
      
      if (company) {
        query2 = query2.where("phones.company",company);
      }

      if (gender) {
        query2 = query2.where("users.gender", gender);
      }

      if (phone_name) {
        query2 = query2.where("phones.phone_name", phone_name);
      }

      if (age !== -1) {
        query2 = query2.where(db.raw("FLOOR((EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM users.birthday))/10)*10"), age);
      }

      if (job !== -1) {
        query2 = query2.where("users.job", job);
      }

      if (parent_location_code) {
        query2 = query2.where("loc.location_code", "like", `%${parent_location_code}`);
      }

      if(stat_type === "company"){
        query2 = query2.groupBy("phones.company")
          .orderBy("phones.company", "asc")
          .select(db.raw(`NVL(phones.company, '${getLangText("TEXT_UNKNOWN")}') as field`))
      }else if(stat_type === "phone_name"){
        query2 = query2.groupBy("phones.phone_name")
          .orderBy("phones.phone_name", "asc")
          .select(db.raw(`NVL(phones.phone_name, '${getLangText("TEXT_UNKNOWN")}') as field`))
      }else if(stat_type === "location_name"){
        query2 = query2.leftJoin(provinceQuery,db.raw(`TO_NUMBER(${db.raw("SUBSTR(loc.location_code,-2,2)")})`), "T_PROVINCES.location_code")
        .groupBy("T_PROVINCES.location_name")
        .select(db.raw(`NVL(T_PROVINCES.location_name, '${getLangText("TEXT_UNKNOWN")}') as field`))
      }else if(stat_type === "age"){
        query2 = query2.groupBy(db.raw("FLOOR((EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM users.birthday))/10)"))
          .orderBy(db.raw("FLOOR((EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM users.birthday))/10)"), "asc")
          .select(db.raw(db.raw(`CONCAT((FLOOR((EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM users.birthday))/10)*10), '${getLangText("TEXT_UNIT_TEN_AGE")}') as field`)))
      }else if(stat_type === "gender"){
        query2 = query2.groupBy("users.gender")
        .orderBy("users.gender")
        .select(db.raw(`NVL(users.gender, '${getLangText("TEXT_UNKNOWN")}') as field`))
      }else if(stat_type === "job"){
        query2 = query2.groupBy("users.job")
        .orderBy("users.job")
        .select(db.raw("NVL(users.job, 0) as field"))
      }

        
      query2 = query2.select(db.raw("COUNT(1) count"));

      return await query2;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findUserRegisterCountByTime(today, yesterday) {
    try {
      const query = db(this.T_USERS)
        .where(db.raw("TO_CHAR(created_at, 'YYYY-MM-DD')"), today)
        .orWhere(db.raw("TO_CHAR(created_at, 'YYYY-MM-DD')"), yesterday)
        .groupBy(db.raw("TO_CHAR(created_at, 'YYYY-MM-DD')"))
        .select(db.raw("TO_CHAR(created_at, 'YYYY-MM-DD') as field"))
        .select(db.raw("COUNT(1) count"));
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findUserLoginCountByTime(today, yesterday) {
    try {
      let query = db(this.T_LOGIN_LOG)
        .where(db.raw("TO_CHAR(action_at, 'YYYY-MM-DD')"), today)
        .orWhere(db.raw("TO_CHAR(action_at, 'YYYY-MM-DD')"), yesterday)
        .groupBy(db.raw("TO_CHAR(action_at, 'YYYY-MM-DD')"))
        .groupBy("user_pk")
        .select(db.raw("TO_CHAR(action_at, 'YYYY-MM-DD') as field"))
        .select("user_pk");
      query = query.as("T1");

      let query2 = db(query)
        .groupBy("T1.field")
        .select("T1.field")
        .select(db.raw("COUNT(1) count"));
      return await query2;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findWhiteUsers(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword } = filter;

      let query = db(`${this.T_WHITE_LIST} as whitelist`);
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(whitelist.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(whitelist.cid)"), "like", `%${lowerKeyword}%`)
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
        .select("whitelist.table_pk", "whitelist.user_name", "whitelist.cid")
        .select(db.raw("TO_CHAR(whitelist.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
        .select(db.raw("TO_CHAR(whitelist.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }
  
  static async findWhiteUserByPk(table_pk) {
    try {
      let query = db(`${this.T_WHITE_LIST} as whitelist`)
        .where("table_pk", table_pk)
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findWhiteUserByCid(cid) {
    try {
      let query = db(`${this.T_WHITE_LIST} as whitelist`)
        .where("cid", cid)
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addWhiteUser(params) {
    try {
      const now = new Date();
      const query = db(this.T_WHITE_LIST)
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

  static async editWhiteUser(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_WHITE_LIST)
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

  static async deleteWhiteUser(table_pk) {
    try {
      const rowCount = await db(this.T_WHITE_LIST)
        .where("table_pk", table_pk)
        .del();
      
      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }

  static async findUserCidLockList(user_pk) {
    try {
      let query = db(this.T_CID_LOCK)
        .where("user_pk", user_pk)
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findUserCidLockByFilter(filter) {
    try {
      let query = db(this.T_CID_LOCK)
        .where(filter)
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addUserCidLock(params) {
    try {
      const now = new Date();
      const query = db(this.T_CID_LOCK)
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

  static async deleteUserCidLock(table_pk) {
    try {
      const rowCount = await db(this.T_CID_LOCK)
        .where("table_pk", table_pk)
        .del();
      
      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }
}

module.exports = UserModel;
