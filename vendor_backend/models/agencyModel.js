const db = require('../db/knex');
const { FLAG_EXIST, FLAG_ACTIVE } = require('../constants/constants');

class AgencyModel {
  static T_P_AGENCIES = "ora_pid.phone_agencies";
  static T_E_AGENCIES = "ora_pid.eprod_agencies";
  static T_S_AGENCIES = "ora_pid.phone_sale_agencies";
  static T_LOC = "ora_pid.locations";

  static async findPhoneAgencies(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, is_deleted, min_at, max_at, is_client, parent_location_code, business_index } = filter;

      let query = db(`${this.T_P_AGENCIES} as agencies`)
          .leftJoin(`${this.T_LOC} as loc`, "agencies.location_pk", "loc.location_pk")
          .leftJoin(`${this.T_LOC} as parent_loc`, "loc.parent_code", "parent_loc.location_code")
          .leftJoin(`${this.T_LOC} as grand_loc`, "parent_loc.parent_code", "grand_loc.location_code");
      
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(agencies.agency_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(agencies.phone_numbers)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(agencies.location_environs)"), "like", `%${lowerKeyword}%`);
          if (is_client !== 1) {
            this.orWhere(db.raw("TRIM((grand_loc.location_name || ' ' || parent_loc.location_name || ' ' || loc.location_name || ' ' || agencies.location_more))"), "like", `%${lowerKeyword}%`);
          }
        });
      }

      if (parent_location_code) {
        query = query.where("loc.location_code", "like", `%${parent_location_code}`);
      }
      if (business_index !== undefined && business_index !== -1) {
        query = query.where(db.raw(`SUBSTR(agencies.business, ${business_index + 1}, 1)`), '1');
      }

      if (min_at !== undefined && min_at !== "") {
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(agencies.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function() {
                this.where("agencies.is_deleted", FLAG_EXIST)
                .where(db.raw("TO_CHAR(agencies.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at)
              });
          });
        } else {
          query = query.where("agencies.is_deleted", FLAG_EXIST)
            .where(db.raw("TO_CHAR(agencies.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (is_deleted !== undefined && is_deleted !== "") {
          query = query.where("agencies.is_deleted", is_deleted);
        }

        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(agencies.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
        }
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query = query.orderBy("agencies.agency_rating", "desc")
        .orderBy("grand_loc.position", "asc")
        .orderBy("parent_loc.position", "asc")
        .orderBy("loc.position", "asc");

      if (is_client === 1) {
        query = query.select(db.raw("TO_CHAR(agencies.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
          .select("loc.location_code")
          .select(db.raw("TRIM((grand_loc.location_name || ' ' || parent_loc.location_name || ' ' || loc.location_name || ' ' || agencies.location_more)) as location_name"))
          // ::text because position is SMALLINT and the fallback is ''. Oracle
          // read the empty string as NULL; Postgres rejects it as a smallint.
          .select(db.raw("CONCAT(CONCAT(NVL(grand_loc.position::text, ''), parent_loc.position), loc.position) position"));
      } else {
        query = query.select(db.raw("TO_CHAR(agencies.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
          .select("loc.location_code", "loc.parent_code", db.raw("TRIM((grand_loc.location_name || ' ' || parent_loc.location_name || ' ' || loc.location_name)) as location_name"));
      }

      query = query.select("agencies.agency_pk", "agencies.agency_name", "agencies.phone_numbers", "agencies.business", "agencies.location_pk", "agencies.location_more", "agencies.location_environs", "agencies.shmap_pos", "agencies.agency_rating", "agencies.is_deleted")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message); 
    }
  }

  static async findPhoneAgencyByPk(agency_pk) {
    try {
      const query = db(this.T_P_AGENCIES)
        .where("agency_pk", agency_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addPhoneAgency(params) {
    try {
      const now = new Date();
      const query = db(this.T_P_AGENCIES)
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

  static async editPhoneAgency(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_P_AGENCIES)
        .where("agency_pk", params.agency_pk)
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findEprodAgencies(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, is_deleted, min_at, max_at, is_client, parent_location_code, business_index } = filter;

      let query = db(`${this.T_E_AGENCIES} as agencies`)
          .leftJoin(`${this.T_LOC} as loc`, "agencies.location_pk", "loc.location_pk")
          .leftJoin(`${this.T_LOC} as parent_loc`, "loc.parent_code", "parent_loc.location_code")
          .leftJoin(`${this.T_LOC} as grand_loc`, "parent_loc.parent_code", "grand_loc.location_code");
      
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(agencies.agency_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(agencies.phone_numbers)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(agencies.location_environs)"), "like", `%${lowerKeyword}%`);
          if (is_client !== 1) {
            this.orWhere(db.raw("TRIM((grand_loc.location_name || ' ' || parent_loc.location_name || ' ' || loc.location_name || ' ' || agencies.location_more))"), "like", `%${lowerKeyword}%`);
          }
        });
      }

      if (parent_location_code) {
        query = query.where("loc.location_code", "like", `%${parent_location_code}`);
      }
      if (business_index !== undefined && business_index !== -1) {
        query = query.where(db.raw(`SUBSTR(agencies.business, ${business_index + 1}, 1)`), '1');
      }

      if (min_at !== undefined && min_at !== "") {
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(agencies.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function() {
                this.where("agencies.is_deleted", FLAG_EXIST)
                .where(db.raw("TO_CHAR(agencies.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at)
              });
          });
        } else {
          query = query.where("agencies.is_deleted", FLAG_EXIST)
            .where(db.raw("TO_CHAR(agencies.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (is_deleted !== undefined && is_deleted !== "") {
          query = query.where("agencies.is_deleted", is_deleted);
        }

        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(agencies.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
        }
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query = query.orderBy("agencies.agency_rating", "desc")
        .orderBy("grand_loc.position", "asc")
        .orderBy("parent_loc.position", "asc")
        .orderBy("loc.position", "asc");

      if (is_client === 1) {
        query = query.select(db.raw("TO_CHAR(agencies.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
          .select("loc.location_code")
          .select(db.raw("TRIM((grand_loc.location_name || ' ' || parent_loc.location_name || ' ' || loc.location_name || ' ' || agencies.location_more)) as location_name"))
          // ::text because position is SMALLINT and the fallback is ''. Oracle
          // read the empty string as NULL; Postgres rejects it as a smallint.
          .select(db.raw("CONCAT(CONCAT(NVL(grand_loc.position::text, ''), parent_loc.position), loc.position) position"));
      } else {
        query = query.select(db.raw("TO_CHAR(agencies.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
          .select("loc.location_code", "loc.parent_code", db.raw("TRIM((grand_loc.location_name || ' ' || parent_loc.location_name || ' ' || loc.location_name)) as location_name"));
      }

      query = query.select("agencies.agency_pk", "agencies.agency_name", "agencies.phone_numbers", "agencies.business", "agencies.location_pk", "agencies.location_more", "agencies.location_environs", "agencies.shmap_pos", "agencies.agency_rating", "agencies.is_deleted")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message); 
    }
  }

  static async findEprodAgencyByPk(agency_pk) {
    try {
      const query = db(this.T_E_AGENCIES)
        .where("agency_pk", agency_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addEprodAgency(params) {
    try {
      const now = new Date();
      const query = db(this.T_E_AGENCIES)
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

  static async editEprodAgency(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_E_AGENCIES)
        .where("agency_pk", params.agency_pk)
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findPhoneSaleAgencies(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, status, min_at, max_at, is_client } = filter;

      let query = db(`${this.T_S_AGENCIES} as agencies`);
      
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(agencies.agency_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(agencies.location_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(agencies.location_detail)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (min_at !== undefined && min_at !== "") {
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(agencies.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function() {
                this.where("agencies.status", FLAG_ACTIVE)
                  .where(db.raw("TO_CHAR(agencies.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at)
              });
          });
        } else {
          query = query.where("agencies.status", FLAG_ACTIVE)
            .where(db.raw("TO_CHAR(agencies.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (status !== undefined && status !== "") {
          query = query.where("agencies.status", status);
        }

        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(agencies.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
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
        query = query.select(db.raw("TO_CHAR(agencies.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      } else {
        query = query.select(db.raw("TO_CHAR(agencies.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
          .select("agencies.agency_superior", "agencies.location_detail", "agencies.status");
      }

      query = query.select("agencies.agency_id", "agencies.agency_name", "agencies.location_name", "agencies.position", "agencies.is_deleted")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findPhoneSaleSimpleAgencies(filter) {
    try {
      const { offset, limit, sort } = filter;
      let query = db(`${this.T_S_AGENCIES} as agencies`)
        .where("agencies.status", FLAG_ACTIVE);

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      query = query.select("agencies.agency_id", "agencies.agency_name")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }

  static async findPhoneSaleAgencyById(agency_id) {
    try {
      const query = db(this.T_S_AGENCIES)
        .where("agency_id", agency_id)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addPhoneSaleAgency(params) {
    try {
      const now = new Date();
      const query = db(this.T_S_AGENCIES)
        .insert({
          ...params,
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

  static async addPhoneSaleAgencies(params) {
    try {
      const query = db(this.T_S_AGENCIES)
        .insert(params);

      const result = await query;     
      if (result === 0) {
        throw new Error("Fail to add new rows");
      }
  
      return result;
    } catch (err) {
      throw new Error("Error adding rows: " + err.message);
    }
  }

  static async editPhoneSaleAgency(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_S_AGENCIES)
        .where("agency_id", params.agency_id)
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async editPhoneSaleAgencies(agency_ids, params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_S_AGENCIES)
        .whereIn("agency_id", agency_ids)
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async deletePhoneSaleAgencies() {
    try {
      const rowCount = await db(this.T_S_AGENCIES)
        .del();
      
      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }
}

module.exports = AgencyModel;
