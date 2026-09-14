const md5 = require('md5');
const db = require('../db/knex');

class ManagerModel {
  static T_MANAGERS = "ora_pid.managers";
  static T_ROLES = "ora_pid.manager_roles";
  static T_PAGES = "ora_pid.manager_pages";
  static T_PERMS = "ora_pid.manager_permissions";
  static T_USERS = "ora_pid.users";
  static T_U_ADMINS = "ora_pid.user_admins";

  static async findManagers(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword } = filter;

      let query = db(`${this.T_MANAGERS} as managers`)
        .leftJoin(`${this.T_ROLES} as roles`, "managers.role_pk", "roles.role_pk");

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        
        query = query.where(db.raw("LOWER(managers.manager_id)"), "like", `%${lowerKeyword}%`)
          .orWhere(db.raw("LOWER(managers.manager_name)"), "like", `%${lowerKeyword}%`);
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
        .select("managers.manager_pk", "managers.manager_id", "managers.manager_name")
        .select(db.raw("TO_CHAR(managers.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
        .select("roles.role_pk", "roles.role_name")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching manager: " + err.message);
    }
  }

  static async findManagerByPk(manager_pk) {
    try {
      const query = db(this.T_MANAGERS).where({ manager_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findManagerById(manager_id) {
    try {
      const query = db(this.T_MANAGERS).where({ manager_id }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addManager(params) {
    try {
      const now = new Date();
      const result = await db(this.T_MANAGERS)
        .insert({
          ...params,
          password: md5("12345678"),
          created_at: now,
          updated_at: now,
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
  
  static async editManager(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_MANAGERS)
        .where({ manager_pk: params.manager_pk })
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async deleteManagerByPk(manager_pk) {
    try {
      const rowCount = await db(this.T_MANAGERS)
        .where({ manager_pk })
        .del();
      
      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row : " + err.message);
    }
  }

  static async findAllRoles(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword } = filter;

      let query = db(`${this.T_ROLES} as roles`)

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(roles.role_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(roles.default_page)"), "like", `%${lowerKeyword}%`);
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
        .select("roles.role_pk", "roles.role_name", "roles.default_page", "roles.department")
        .select(db.raw("TO_CHAR(roles.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findRoleByPk(role_pk) {
    try {
      const query = db(this.T_ROLES).where({ role_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findRoleByName(role_name) {
    try {
      const query = db(this.T_ROLES).where({ role_name }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addRole(params, admin_pk) {
    try {
      const now = new Date();
      const query = db(this.T_ROLES)
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

  static async editRole(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_ROLES)
        .where({ role_pk: params.role_pk })
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

  static async deleteRoleByPk(role_pk) {
    try {
      const rowCount = await db(this.T_ROLES)
        .where({ role_pk })
        .del();
      
      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }

  static async findAllPages(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword } = filter;

      let query = db(`${this.T_PAGES} as pages`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(pages.page_url)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(pages.page_name)"), "like", `%${lowerKeyword}%`);
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
        .select("pages.page_pk", "pages.page_url", "pages.page_name")
        .select(db.raw("TO_CHAR(pages.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findPageByPk(page_pk) {
    try {
      const query = db(this.T_PAGES).where({ page_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addPage(params, admin_pk) {
    try {
      const now = new Date();
      const query = db(this.T_PAGES)
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

  static async editPage(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_PAGES)
        .where({ page_pk: params.page_pk })
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

  static async deletePageByPk(page_pk) {
    try {
      const rowCount = await db(this.T_PAGES)
        .where({ page_pk })
        .del();
      
      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }

  static async findPagesWithPerms(filter, isCount = false) {
    const { offset, limit, sort, role_pk, keyword } = filter;
    if (!role_pk || role_pk === 0) {
      return isCount ? 0 : [];
    }

    try {
      let query = db(`${this.T_PAGES} as pages`)
        .leftJoin(`${this.T_PERMS} as perms`, function() {
          this.on("pages.page_pk", "perms.page_pk")
            .andOn("perms.role_pk", role_pk);
        });

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(pages.page_url)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(pages.page_name)"), "like", `%${lowerKeyword}%`);
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
        .select("pages.page_pk", "pages.page_url", "pages.page_name")
        .select(db.raw("COALESCE(perms.permission, 0) as permission"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findOnlyPagesHavePerms(role_pk) {
    if (!role_pk || role_pk === 0) {
      return [];
    }

    try {
      let query = db(`${this.T_PERMS} as perms`)
        .leftJoin(`${this.T_PAGES} as pages`, "perms.page_pk", "pages.page_pk")
        .select("pages.page_pk", "pages.page_url", "pages.page_name")
        .select(db.raw("COALESCE(perms.permission, 0) as permission"))
        .where("perms.role_pk", role_pk);

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findPageByRolePagePk(role_pk, page_pk) {
    try {
      const query = db(this.T_PERMS).where({ role_pk, page_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findRoleByPageSuffix(role_pk, page_suffix) {
    try {
      const query = db(`${this.T_PAGES} as pages`)
        .leftJoin(`${this.T_PERMS} as perms`, function() {
          this.on("pages.page_pk", "perms.page_pk")
            .andOn("perms.role_pk", role_pk);
        })
        .where("pages.page_url", "like", `%${page_suffix}`)
        .select(db.raw("NVL(perms.permission, 0) as permission"));
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async updateDepartPerm(params) {
    try {
      const rowCount = await db(this.T_ROLES)
        .where("role_pk", params.role_pk)
        .update(params);
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }
  
  static async addPermission(params, admin_pk) {
    try {
      const now = new Date();
      const query = db(this.T_PERMS)
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

  static async editPermission(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_PERMS)
        .where({ table_pk: params.table_pk })
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

  static async findUserAdmins(filter, isCount = false) {
    try {
      const { offset, limit, sort, manager_pk, keyword } = filter;

      let query = db(`${this.T_U_ADMINS} as user_admins`)
        .leftJoin(`${this.T_USERS} as users`, "user_admins.user_pk", "users.user_pk");

      if (manager_pk) {
        query = query.where("user_admins.manager_pk", manager_pk);
      }

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(`user_admins.${sort.key}`, sort.dir);
      }

      query = query
        .select("user_admins.user_pk")
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

  static async findUserAdminsByManagerPk(manager_pk) {
    try {
      const query = db(this.T_U_ADMINS)
        .where("manager_pk", manager_pk)
        .select("user_pk");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findUserAdminByUserPk(user_pk) {
    try {
      const query = db(`${this.T_U_ADMINS} as user_admins`)
        .leftJoin(`${this.T_MANAGERS} as managers`, "user_admins.manager_pk", "managers.manager_pk")
        .leftJoin(`${this.T_ROLES} as roles`, "managers.role_pk", "roles.role_pk")
        .where("user_admins.user_pk", user_pk)
        .select("managers.manager_pk", "managers.role_pk")
        .select("roles.department");
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addUserAdmins(params) {
    try {
      const query = db(this.T_U_ADMINS)
        .insert(params, "table_pk");

      const result = await query;
      
      if (!result || result.length === 0) {
        throw new Error("Fail to add new rows");
      }
  
      return result;
    } catch (err) {
      throw new Error("Error adding rows: " + err.message);
    }
  }

  static async deleteUserAdminsByManagerPkAndUserPks(manager_pk, user_pks) {
    try {
      const rowCount = await db(this.T_U_ADMINS)
        .where("manager_pk", manager_pk)
        .whereIn("user_pk", user_pks)
        .del();

      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }
}

module.exports = ManagerModel;
