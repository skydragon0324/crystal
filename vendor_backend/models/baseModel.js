const db = require('../db/knex');
const { FLAG_EXIST } = require('../constants/constants');

class BaseModel {
  static T_HOLIDAYS = "ora_pid.holidays";
  static T_FILES = "ora_pid.temp_files";
  static T_UPDATEFILES = "ora_pid.app_updates";
  static T_CONTACTS = "ora_pid.company_contacts";

  static async findHolidays(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword } = filter;

      let query = db(this.T_HOLIDAYS);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(db.raw("LOWER(simple_date)"), "like", `%${lowerKeyword}%`)
          .orWhere(db.raw("LOWER(name)"), "like", `%${lowerKeyword}%`);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      query = query.select("table_pk", "simple_date", "name")
        .select(db.raw("TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findHolidayByPk(table_pk) {
    try {
      const query = db(this.T_HOLIDAYS)
        .where("table_pk", table_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findHolidayByDate(simple_date) {
    try {
      const query = db(this.T_HOLIDAYS)
        .where("simple_date", simple_date)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addHoliday(params) {
    try {
      const now = new Date();
      const query = db(this.T_HOLIDAYS)
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

  static async editHoliday(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_HOLIDAYS)
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

  static async deleteHoliday(table_pk) {
    try {
      const rowCount = await db(this.T_HOLIDAYS)
        .where("table_pk", table_pk)
        .del();
      
      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }

  static async findUpdateFiles(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword } = filter;

      let query = db(this.T_UPDATEFILES);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(db.raw("LOWER(note)"), "like", `%${lowerKeyword}%`);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      query = query.select("table_pk", "type", "version_code", "last_time","status","file_url","note","created_at","is_deleted")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findUpdateFileByPk(table_pk) {
    try {
      const query = db(this.T_UPDATEFILES)
        .where("table_pk", table_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async deleteUpdateFile(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_UPDATEFILES)
        .where("table_pk", params.table_pk)
        .update({
            ...params,
            updated_at: now,
          });
      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }

  static async findUpdateByType(type) {
    try {
      let query = db(`${this.T_UPDATEFILES} as updatefile`);
      query = query.where("updatefile.type", type);
      query = query.select("updatefile.table_pk");
      query = query.first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addUpdateFile(params) {
    try {
      const now = new Date();
      const query = db(this.T_UPDATEFILES)
        .insert({
          ...params,
          created_at: now,
          last_time:now,
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

  static async editUpdateFile(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_UPDATEFILES)
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

  static async findTempFiles(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword } = filter;

      let query = db(this.T_FILES);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(db.raw("LOWER(title)"), "like", `%${lowerKeyword}%`);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      query = query.select("table_pk", "title", "file_url")
        .select(db.raw("TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findTempFileByPk(table_pk) {
    try {
      const query = db(this.T_FILES)
        .where("table_pk", table_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addTempFile(params) {
    try {
      const now = new Date();
      const query = db(this.T_FILES)
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

  static async deleteTempFile(table_pk) {
    try {
      const rowCount = await db(this.T_FILES)
        .where("table_pk", table_pk)
        .del();

      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }

  static async findCompanyContacts(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, is_deleted, min_at, max_at, is_client } = filter;

      let query = db(`${this.T_CONTACTS} as contacts`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(db.raw("LOWER(contacts.company_name)"), "like", `%${lowerKeyword}%`)
          .orWhere(db.raw("LOWER(contacts.phone_number)"), "like", `%${lowerKeyword}%`);
      }
      if (min_at !== undefined && min_at !== "") {
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(contacts.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function() {
                this.where("contacts.is_deleted", FLAG_EXIST)
                .where(db.raw("TO_CHAR(contacts.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
              });
          });
        } else {
          query = query.where("contacts.is_deleted", FLAG_EXIST)
            .where(db.raw("TO_CHAR(contacts.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (is_deleted !== undefined && is_deleted !== "") {
          query = query.where("contacts.is_deleted", is_deleted);
        }
        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(contacts.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
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

      if (is_client === 1) {
        query = query.select(db.raw("TO_CHAR(contacts.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      } else {
        query = query.select(db.raw("TO_CHAR(contacts.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"));
      }

      query = query.select("contacts.contact_pk", "contacts.contact_name", "contacts.phone_number", "contacts.position", "contacts.is_deleted")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findCompanyContactByPk(contact_pk) {
    try {
      const query = db(this.T_CONTACTS)
        .where("contact_pk", contact_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addCompanyContact(params) {
    try {
      const now = new Date();
      const query = db(this.T_CONTACTS)
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

  static async editCompanyContact(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_CONTACTS)
        .where("contact_pk", params.contact_pk)
        .update({
          ...params,
          updated_at: now,
        });

      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }
}

module.exports = BaseModel;
