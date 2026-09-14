const moment = require('moment');
const db = require('../db/knex');
const { getLangText } = require('../lang/lang');
const { FLAG_SET, CRM_PROD_SPEC_KEY_TYPE, FLAG_EXIST, ESHOP_COMBINE_TYPE_ID } = require('../constants/constants');

class CrmModel {
  static T_CUSTOMERS = "ora_pid.customers";
  static T_PRODUCTS = "ora_pid.crm_products";
  static T_PROD_CATEGORIES = "ora_pid.crm_prod_categories";
  static T_PROD_SPEC_KEYS = "ora_pid.crm_prod_spec_keys";
  static T_PROD_SPEC_ORDERS = "ora_pid.crm_prod_spec_orders";
  static T_PROD_SPEC_VALUES = "ora_pid.crm_prod_spec_values";
  static T_PROD_SURVEY_OPTIONS = "ora_pid.crm_prod_survey_options";
  static T_PROD_SURVEY_RESP = "ora_pid.crm_prod_survey_responses";
  static T_EPROD_SALES = "ora_pid.crm_eprod_sales";
  static T_EPROD_TRANS_LOG = "ora_pid.crm_eprod_trans_log";
  static T_EPROD_CHOSEN_SPECS = "ora_pid.crm_eprod_chosen_specs";
  static T_EPROD_AS = "ora_pid.crm_eprod_as";
  static T_MARS_CARDS = "ora_pid.crm_mars_cards";
  static T_ESHOP_INFO = "ora_pid.crm_eshop_info";
  static T_COMBINE_LOG = "ora_pid.eshop_combine_log";
  static T_MERGE_IDS = "ora_pid.user_merge_ids";

  static async findCustomers(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, gender, source, status } = filter;

      let query = db(`${this.T_CUSTOMERS} as customers`)

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(customers.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere("customers.ecid", "like", `${lowerKeyword}`)
            .orWhere(db.raw("LOWER(customers.birth_year)"), `${lowerKeyword}`)
            .orWhere(db.raw("LOWER(customers.job)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(customers.address)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(customers.phone_number)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(customers.pvendor_id)"), "like", `%${lowerKeyword}%`)
            .orWhere("customers.pvendor_pk", "like", `${lowerKeyword}`)
            .orWhere("customers.target_id", "like", `${lowerKeyword}`)
            .orWhere(db.raw("LOWER(customers.note)"), "like", `%${lowerKeyword}%`)
          });
      }
      if (gender) {
        query = query.where("customers.gender", gender);
      }
      if (source !== undefined && source !== "") {
        query = query.where("customers.source", source);
      }
      if (status !== undefined && status !== "") {
        query = query.where("customers.status", status);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }
      query = query.orderBy("customers.ecid", "desc");

      query = query
        .select("customers.ecid", "customers.user_name", "customers.gender", "customers.birth_year", "customers.job", "customers.address", "customers.phone_number", "customers.source", "customers.status", "customers.pvendor_pk", "customers.pvendor_id", "customers.target_id", "customers.note")
        .select(db.raw("TO_CHAR(customers.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findCustomerByPk(ecid) {
    try {
      const query = db(this.T_CUSTOMERS)
        .where("ecid", ecid)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findCustomerByPvendorPk(pvendor_pk) {
    try {
      const query = db(this.T_CUSTOMERS)
        .where("pvendor_pk", pvendor_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findCustomersInPvendorPk(prhn_pks) {
    try {
      const query = db(this.T_CUSTOMERS)
        .whereIn("pvendor_pk", prhn_pks)
        .select("ecid", "pvendor_pk");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findCustomerByCrm(params) {
    try {
      const { user_name, gender, birth_year, job, address, phone_number } = params;

      let query = db(this.T_CUSTOMERS);
      if (user_name) {
        query = query.where("user_name", user_name);
      }
      if (gender) {
        query = query.where("gender", gender);
      }
      if (birth_year && !birth_year.endsWith(getLangText("TEXT_UNIT_TEN_AGE"))) {
        query = query.where("birth_year", "like", `${birth_year}%`);
      }
      if (job) {
        query = query.where("job", job);
      }
      if (address) {
        query = query.where("address", "like", `%${address}%`);
      }
      if (phone_number) {
        query = query.where("phone_number", "like", `%${phone_number}%`);
      }

      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addCustomer(params) {
    try {
      const now = new Date();
      const query = db(this.T_CUSTOMERS)
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

  static async addCustomers(params) {
    try {
      const now = new Date();
      const rows = params.map(row => ({
        ...row,
        created_at: row.created_at || now,
        updated_at: now,
      }));
      const query = db(this.T_CUSTOMERS)
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

  static async editCustomer(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_CUSTOMERS)
        .where("ecid", params.ecid)
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async editCustomerByPvendorPk(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_CUSTOMERS)
        .where("pvendor_pk", params.pvendor_pk)
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findProdCategories(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, parent_pk, is_leaf, is_deleted } = filter;

      let query = db(`${this.T_PROD_CATEGORIES} as categories`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(categories.category_name)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("categories.is_deleted", is_deleted);
      }
      if (parent_pk !== undefined && parent_pk !== "") {
        if (parent_pk === 0) {
          query = query.where(function() {
            this.where("categories.parent_pk", parent_pk)
              .orWhereNull("categories.parent_pk");
          });
        } else {
          query = query.where("categories.parent_pk", parent_pk);
        }
      }
      if (is_leaf !== undefined && is_leaf !== "") {
        query = query.where("categories.is_leaf", is_leaf);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }
      query = query.orderBy("categories.category_pk", "asc");

      query = query
        .select("categories.category_pk", "categories.category_name", "categories.parent_pk", "categories.position", "categories.is_deleted", "categories.is_leaf")
        .select(db.raw("TO_CHAR(categories.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findProdRootCategories(filter, isCount = false) {
    try {
      const { offset, limit, keyword, is_deleted } = filter;

      let query = db(`${this.T_PROD_CATEGORIES} as categories`)
        .where("categories.parent_pk", 0);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(categories.category_name)"), "like", `%${lowerKeyword}%`)
        });
      }

      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("categories.is_deleted", is_deleted);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query = query.orderBy("categories.position", "asc");

      query = query
        .select("categories.category_pk", "categories.category_name", "categories.parent_pk", "categories.position", "categories.is_deleted", "categories.template_xls")
        .select(db.raw("TO_CHAR(categories.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findProdLeafCategories(filter, isCount = false) {
    try {
      const { offset, limit, is_deleted } = filter;

      let query = db(`${this.T_PROD_CATEGORIES} as categories`)
        .leftJoin(`${this.T_PROD_CATEGORIES} as parent`, "categories.parent_pk", "parent.category_pk")
        .where("categories.is_leaf", FLAG_SET);

      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("categories.is_deleted", is_deleted);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query = query.orderBy("parent.position", "asc")
        .orderBy("categories.position", "asc");

      query = query
        .select("categories.category_pk", "categories.category_name", "categories.parent_pk", "categories.position", "categories.is_deleted", "categories.is_leaf")
        .select("parent.category_name as parent_name")
        .select(db.raw("TO_CHAR(categories.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findProdCategoryByPk(category_pk) {
    try {
      const query = db(this.T_PROD_CATEGORIES)
        .where("category_pk", category_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findProdCategoryByFilter(filter) {
    try {
      const query = db(this.T_PROD_CATEGORIES)
        .where(filter)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findProducts(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, root_pk, is_deleted, is_client } = filter;

      let query = db(`${this.T_PRODUCTS} as products`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(products.product_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(products.simple_name)"), "like", `%${lowerKeyword}%`)
        });
      }

      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("products.is_deleted", is_deleted);
      }
      if (root_pk !== undefined && root_pk !== "") {
        query = query.where("products.root_pk", root_pk);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }
      query = query.orderBy("products.product_pk", "desc");

      query = query
        .select("products.product_pk", "products.product_name", "products.simple_name", "products.category_pk", "products.root_pk", "products.position", "products.is_deleted")
        .select(db.raw("TO_CHAR(products.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findProductByPk(product_pk) {
    try {
      const query = db(this.T_PRODUCTS)
        .where("product_pk", product_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addProduct(params) {
    try {
      const now = new Date();
      const query = db(this.T_PRODUCTS)
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

  static async editProduct(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_PRODUCTS)
        .where("product_pk", params.product_pk)
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findSpecKeys(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, is_deleted, max_at } = filter;

      let query = db(`${this.T_PROD_SPEC_KEYS} as spec_keys`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(spec_keys.spec_name)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("spec_keys.is_deleted", is_deleted);
      }

      if (max_at !== undefined && max_at != "") {
        query = query.where(db.raw("TO_CHAR(spec_keys.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }
      query = query.orderBy("spec_keys.spec_pk", "desc")

      query = query
        .select("spec_keys.spec_pk", "spec_keys.spec_key", "spec_keys.spec_name", "spec_keys.spec_type", "spec_keys.is_deleted")
        .select(db.raw("TO_CHAR(spec_keys.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findSpecKeyChoices(filter, isCount = false) {
    try {
      const { offset, limit } = filter;

      let query = db(`${this.T_PROD_SPEC_KEYS} as spec_keys`)
        .whereIn("spec_keys.spec_type", [CRM_PROD_SPEC_KEY_TYPE.SINGLE_CHOICE, CRM_PROD_SPEC_KEY_TYPE.MULTI_CHOICE, CRM_PROD_SPEC_KEY_TYPE.ORDER_CHOICE]);

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query = query.orderBy("spec_keys.created_at", "asc")

      query = query
        .select("spec_keys.spec_pk", "spec_keys.spec_key", "spec_keys.spec_name", "spec_keys.spec_type", "spec_keys.is_deleted")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findSpecKeyByPk(spec_pk) {
    try {
      const query = db(this.T_PROD_SPEC_KEYS)
        .where("spec_pk", spec_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findSpecKeyByKey(spec_key) {
    try {
      const query = db(this.T_PROD_SPEC_KEYS)
        .where("spec_key", spec_key)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findSpecKeyByName(spec_name) {
    try {
      const query = db(this.T_PROD_SPEC_KEYS)
        .where("spec_name", spec_name)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addSpecKey(params) {
    try {
      const now = new Date();
      const query = db(this.T_PROD_SPEC_KEYS)
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

  static async editSpecKey(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_PROD_SPEC_KEYS)
        .where("spec_pk", params.spec_pk)
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findSpecOrders(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, root_pk, is_deleted, max_at, is_client } = filter;

      let query = db(`${this.T_PROD_SPEC_ORDERS} as spec_orders`);
      if (is_client !== 1) {
        query = query.leftJoin(`${this.T_PROD_SPEC_KEYS} as spec_keys`, "spec_keys.spec_pk", "spec_orders.spec_pk");
      }

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(spec_orders.spec_label)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(spec_keys.spec_name)"), "like", `%${lowerKeyword}%`)
        });
      }

      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("spec_orders.is_deleted", is_deleted);
      }
      if (root_pk !== undefined && root_pk !== "") {
        query = query.where("spec_orders.root_pk", root_pk);
      }
      if (max_at !== undefined && max_at != "") {
        query = query.where(db.raw("TO_CHAR(spec_orders.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }
      query = query.orderBy("spec_orders.table_pk", "desc");

      if (is_client !== 1) {
        query = query.select("spec_keys.spec_name");
      }

      query = query
        .select("spec_orders.table_pk", "spec_orders.root_pk", "spec_orders.spec_pk", "spec_orders.position", "spec_orders.is_deleted", "spec_orders.is_required", "spec_orders.spec_label")
        .select(db.raw("TO_CHAR(spec_orders.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findSpecOrderByPk(table_pk) {
    try {
      const query = db(this.T_PROD_SPEC_ORDERS)
        .where("table_pk", table_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findSpecOrderByFilter(filter) {
    try {
      const query = db(this.T_PROD_SPEC_ORDERS)
        .where(filter)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findSpecOrdersForEprodInRootPks(root_pks) {
    try {
      let query = db(`${this.T_PROD_SPEC_ORDERS} as spec_orders`)
        .leftJoin(`${this.T_PROD_SPEC_KEYS} as spec_keys`, "spec_keys.spec_pk", "spec_orders.spec_pk")
        .whereIn("spec_orders.root_pk", root_pks)
        .where("spec_orders.is_deleted", FLAG_EXIST)
        .where("spec_keys.is_deleted", FLAG_EXIST);
      
      query = query.orderBy("spec_orders.position", "asc");

      query = query.select("spec_orders.root_pk", "spec_orders.spec_pk", "spec_orders.position", "spec_orders.is_required", "spec_orders.spec_label")
        .select("spec_keys.spec_key", "spec_keys.spec_name", "spec_keys.spec_type");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findSpecOrdersForEprodByRootPk(root_pk) {
    return this.findSpecOrdersForEprodInRootPks([root_pk]);
  }

  static async addSpecOrder(params) {
    try {
      const now = new Date();
      const query = db(this.T_PROD_SPEC_ORDERS)
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

  static async editSpecOrder(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_PROD_SPEC_ORDERS)
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

  static async findSpecValues(filter, isCount = false) {
    try {
      const { offset, limit, sort, root_pk, spec_pk, max_at } = filter;

      let query = db(`${this.T_PROD_SPEC_VALUES} as spec_values`);

      if (root_pk !== undefined && root_pk !== "") {
        query = query.where("spec_values.root_pk", root_pk);
      }

      if (spec_pk !== undefined && spec_pk !== "") {
        query = query.where("spec_values.spec_pk", spec_pk);
      }

      if (max_at !== undefined && max_at != "") {
        query = query.where(db.raw("TO_CHAR(spec_values.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }
      query = query.orderBy("spec_values.value_pk", "asc");

      query = query
        .select("spec_values.value_pk", "spec_values.root_pk", "spec_values.spec_pk", "spec_values.spec_value", "spec_values.position", "spec_values.is_deleted")
        .select(db.raw("TO_CHAR(spec_values.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findSpecValueByPk(value_pk) {
    try {
      const query = db(this.T_PROD_SPEC_VALUES)
        .where("value_pk", value_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findSpecValueByFilter(filter) {
    try {
      const query = db(this.T_PROD_SPEC_VALUES)
        .where(filter)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findSpecValuesByFilter(filter) {
    try {
      const query = db(this.T_PROD_SPEC_VALUES)
        .where(filter)
        .orderBy("position", "asc")
        .select("value_pk", "spec_pk", "spec_value");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findSpecValuesByRootPk(root_pk) {
    try {
      const query = db(`${this.T_PROD_SPEC_VALUES} as spec_values`)
        .leftJoin(`${this.T_PROD_SPEC_KEYS} as spec_keys`, "spec_values.spec_pk", "spec_keys.spec_pk")
        .where("spec_values.root_pk", root_pk)
        .orderBy("spec_values.position", "asc")
        .select("spec_values.value_pk", "spec_values.spec_pk", "spec_values.spec_value")
        .select("spec_keys.spec_key", "spec_keys.spec_name");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addSpecValue(params) {
    try {
      const now = new Date();
      const query = db(this.T_PROD_SPEC_VALUES)
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

  static async editSpecValue(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_PROD_SPEC_VALUES)
        .where("value_pk", params.value_pk)
        .update({
          ...params,
          updated_at: now,
        });

      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findProdSurveyOptions(filter, isCount = false) {
    try {
      const { offset, limit, sort, root_pk } = filter;

      let query = db(`${this.T_PROD_SURVEY_OPTIONS} as survey_options`);

      if (root_pk !== undefined && root_pk !== "") {
        query = query.where("survey_options.root_pk", root_pk);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }
      query = query.orderBy("survey_options.option_pk", "asc");

      query = query
        .select("survey_options.option_pk", "survey_options.root_pk", "survey_options.option_name", "survey_options.position", "survey_options.is_deleted")
        .select(db.raw("TO_CHAR(survey_options.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findProdSurveyOptionByPk(option_pk) {
    try {
      const query = db(this.T_PROD_SURVEY_OPTIONS)
        .where("option_pk", option_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findProdSurveyOptionByFilter(filter) {
    try {
      const query = db(this.T_PROD_SURVEY_OPTIONS)
        .where(filter)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findProdSurveyOptionsByRootPk(root_pk) {
    try {
      const query = db(this.T_PROD_SURVEY_OPTIONS)
        .where("root_pk", root_pk)
        .select("option_pk", "option_name", "position");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addProdSurveyOption(params) {
    try {
      const now = new Date();
      const query = db(this.T_PROD_SURVEY_OPTIONS)
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

  static async editProdSurveyOption(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_PROD_SURVEY_OPTIONS)
        .where("option_pk", params.option_pk)
        .update({
          ...params,
          updated_at: now,
        });

      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async addProdSurveyResponses(params) {
    try {
      const now = new Date();
      const rows = params.map(row => ({
        ...row,
        action_at: now,
      }))
      const query = db(this.T_PROD_SURVEY_RESP)
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

  static async deleteProdSurveyResponses(filter) {
    try {
      const rowCount = await db(this.T_PROD_SURVEY_RESP)
        .where(filter)
        .del();
      
      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }

  static async findCrmEprodSales(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, root_pk, max_at, is_eprod } = filter;

      let query = db(`${this.T_EPROD_SALES} as eprod_sales`);
      if (is_eprod === 1) {
        query = query.leftJoin(`${this.T_PROD_CATEGORIES} as categories`, "eprod_sales.root_pk", "categories.category_pk");
      }

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where("eprod_sales.ecid", "like", `${lowerKeyword}`)
            .orWhere(db.raw("LOWER(eprod_sales.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(eprod_sales.job)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(eprod_sales.address)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(eprod_sales.phone_number)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(eprod_sales.serial_no)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(eprod_sales.product_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(eprod_sales.purchase_place)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(eprod_sales.old_prod_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(eprod_sales.feedback_msg)"), "like", `%${lowerKeyword}%`)
        });
      }

      if (root_pk !== undefined && root_pk !== "") {
        query = query.where("eprod_sales.root_pk", root_pk);
      }

      if (max_at) {
        query = query.where(db.raw("TO_CHAR(eprod_sales.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">=", max_at);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(`eprod_sales.${sort.key}`, sort.dir);
      }
      query = query.orderBy("eprod_sales.table_pk", "desc");

      if (is_eprod === 1) {
        query = query.select("categories.category_name as root_name");
      }

      query = query
        .select("eprod_sales.table_pk", "eprod_sales.ecid", "eprod_sales.user_name", "eprod_sales.gender", "eprod_sales.birth_year", "eprod_sales.job", "eprod_sales.address", "eprod_sales.phone_number", "eprod_sales.serial_no", "eprod_sales.equip_no", "eprod_sales.root_pk", "eprod_sales.category_name", "eprod_sales.product_pk", "eprod_sales.product_name", "eprod_sales.simple_name", "eprod_sales.purchase_place", "eprod_sales.purchase_date", "eprod_sales.reg_date", "eprod_sales.serious_views", "eprod_sales.purchase_motives", "eprod_sales.old_prod_name", "eprod_sales.survey_up", "eprod_sales.survey_down", "eprod_sales.feedback_msg", "eprod_sales.outlook", "eprod_sales.led_type", "eprod_sales.has_tv_mount", "eprod_sales.is_kara_user", "eprod_sales.use_bmedia", "eprod_sales.hour_usage", "eprod_sales.computer_usage", "eprod_sales.install_loc")
        .select("eprod_sales.pvendor_pk", "eprod_sales.pvendor_id")
        .select(db.raw("TO_CHAR(eprod_sales.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findCrmEprodSaleBySN(serial_no) {
    try {
      const query = db(this.T_EPROD_SALES)
        .where("serial_no", serial_no)
        .select("table_pk", "ecid", "pvendor_pk", "user_name", "gender", "birth_year", "job", "address", "phone_number", "serial_no", "equip_no", "root_pk", "category_name", "product_name", "purchase_place", "purchase_date", "reg_date", "serious_views", "purchase_motives", "old_prod_name", "survey_up", "survey_down", "feedback_msg", "outlook", "led_type", "has_tv_mount", "is_kara_user", "use_bmedia", "hour_usage", "computer_usage", "install_loc")
        .select(db.raw("TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"));
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findCrmEprodSalesInSNs(sns) {
    try {
      const query = db(this.T_EPROD_SALES)
        .whereIn("serial_no", sns);
        // NOTE: should select * because its fields should be variant for root_pk
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addCrmEprodSale(params) {
    try {
      const now = new Date();
      const query = db(this.T_EPROD_SALES)
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

  static async editCrmEprodSale(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_EPROD_SALES)
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

  static async deleteCrmEprodSale(filter) {
    try {
      const rowCount = await db(this.T_EPROD_SALES)
        .where(filter)
        .del();
      
      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }

  static async findCrmEprodTransLog(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, root_pk, max_at, is_eprod } = filter;

      let query = db(`${this.T_EPROD_TRANS_LOG} as trans_log`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where("trans_log.ecid", "like", `${lowerKeyword}`)
            .orWhere(db.raw("LOWER(trans_log.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(trans_log.job)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(trans_log.address)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(trans_log.phone_number)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(trans_log.serial_no)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(trans_log.product_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(trans_log.purchase_place)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(trans_log.old_prod_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(trans_log.feedback_msg)"), "like", `%${lowerKeyword}%`)
        });
      }

      if (root_pk !== undefined && root_pk !== "") {
        query = query.where("trans_log.root_pk", root_pk);
      }

      if (max_at) {
        query = query.where(db.raw("TO_CHAR(trans_log.transfered_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
      }

      if (is_eprod === 1) {
        query = query.whereNull("trans_log.target_id");
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(`trans_log.${sort.key}`, sort.dir);
      }
      query = query.orderBy("trans_log.log_pk", "desc");

      if (is_eprod === 1) {
        query = query.select("trans_log.table_pk");
      } else {
        query = query.select("trans_log.table_pk", "trans_log.ecid", "trans_log.user_name", "trans_log.gender", "trans_log.birth_year", "trans_log.job", "trans_log.address", "trans_log.phone_number", "trans_log.serial_no", "trans_log.category_name", "trans_log.product_pk", "trans_log.product_name", "trans_log.simple_name", "trans_log.purchase_place", "trans_log.purchase_date", "trans_log.reg_date", "trans_log.serious_views", "trans_log.purchase_motives", "trans_log.old_prod_name", "trans_log.survey_up", "trans_log.survey_down", "trans_log.feedback_msg", "trans_log.outlook", "trans_log.led_type", "trans_log.has_tv_mount", "trans_log.is_kara_user", "trans_log.use_bmedia", "trans_log.hour_usage", "trans_log.computer_usage", "trans_log.install_loc")
        .select(db.raw("TO_CHAR(trans_log.transfered_at, 'YYYY-MM-DD HH24:MI:SS') transfered_at"))
      }

      query = query.offset(offset);
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addCrmEprodTransLog(params) {
    try {
      const now = new Date();
      const query = db(this.T_EPROD_TRANS_LOG)
        .insert({
          ...params,
          transfered_at: now,
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

  static async addCrmEprodChosenSpecs(params) {
    try {
      const now = new Date();
      const rows = params.map(row => ({
        ...row,
        action_at: now,
      }))
      const query = db(this.T_EPROD_CHOSEN_SPECS)
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

  static async deleteCrmEprodChosenSpecs(filter) {
    try {
      const rowCount = await db(this.T_EPROD_CHOSEN_SPECS)
        .where(filter)
        .del();
      
      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }

  static async findCrmEprodAs(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, root_pk } = filter;

      let query = db(`${this.T_EPROD_AS} as eprod_as`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where("eprod_as.ecid", "like", `${lowerKeyword}`)
            .orWhere(db.raw("LOWER(eprod_as.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(eprod_as.job)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(eprod_as.address)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(eprod_as.phone_number)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(eprod_as.serial_no)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(eprod_as.category_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(eprod_as.product_name)"), "like", `%${lowerKeyword}%`)
        });
      }

      if (root_pk !== undefined && root_pk !== "") {
        query = query.where("eprod_as.root_pk", root_pk);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(`eprod_as.${sort.key}`, sort.dir);
      }
      query = query.orderBy("eprod_as.table_pk", "desc");

      query = query
        .select("eprod_as.table_pk", "eprod_as.ecid", "eprod_as.user_name", "eprod_as.gender", "eprod_as.birth_year", "eprod_as.job", "eprod_as.address", "eprod_as.phone_number", "eprod_as.serial_no", "eprod_as.root_pk", "eprod_as.category_name", "eprod_as.product_pk", "eprod_as.product_name", "eprod_as.simple_name", "eprod_as.damages")
        .select("eprod_as.pvendor_pk", "eprod_as.pvendor_id")
        .select(db.raw("TO_CHAR(eprod_as.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findCrmEprodAsByFilter(ecid, serial_no, created_at) {
    try {
      const query = db(this.T_EPROD_AS)
        .where("ecid", ecid)
        .where("serial_no", serial_no)
        .where(db.raw("TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS')"), created_at)
        .select("table_pk", "ecid", "pvendor_pk", "user_name", "gender", "birth_year", "job", "address", "phone_number", "serial_no", "root_pk", "category_name", "product_name")
        .select(db.raw("TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"));
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findCrmEprodAsLastAt() {
    try {
      const query = db(this.T_EPROD_AS)
        .select(db.raw("MAX(TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS')) last_at"));
      const row = await query.first();
      if (row && row.last_at) {
        return row.last_at;
      }
      return "";
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addCrmEprodAs(params) {
    try {
      const now = new Date();
      const query = db(this.T_EPROD_AS)
        .insert({
          ...params,
          created_at: params.created_at ? moment(params.created_at).toDate() : now,
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

  static async findCrmMarsCards(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, crm_level, crm_class } = filter;

      let query = db(`${this.T_MARS_CARDS} as cards`)
        .leftJoin(`${this.T_CUSTOMERS} as customers`, "cards.ecid", "customers.ecid")

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where("cards.ecid", "like", `${lowerKeyword}`)
            .orWhere("cards.pvendor_pk", "like", `${lowerKeyword}`)
            .orWhere("cards.card_pk", "like", `${lowerKeyword}`)
            .orWhere("cards.eshop_pk", "like", `${lowerKeyword}`)
            .orWhere(db.raw("LOWER(cards.pvendor_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(cards.prhn_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(cards.eshop_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(cards.accum_card)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(cards.wallet_card)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(cards.card_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(cards.phone_number)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(cards.birthday)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(customers.user_name)"), "like", `%${lowerKeyword}%`)
        });
      }

      if (crm_level !== undefined && crm_level !== "") {
        query = query.where("cards.crm_level", crm_level);
      }
      if (crm_class !== undefined && crm_class !== "") {
        query = query.where("cards.crm_class", crm_class);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(`cards.${sort.key}`, sort.dir);
      }
      query = query.orderBy("cards.card_pk", "desc");

      query = query
        .select("cards.card_pk", "cards.ecid", "cards.pvendor_pk", "cards.pvendor_id", "cards.prhn_name", "cards.eshop_pk", "cards.eshop_id", "cards.accum_card", "cards.wallet_card", "cards.card_name", "cards.phone_number", "cards.birthday", "cards.crm_level", "cards.vip_level1", "cards.vip_level2", "cards.vip_level3", "cards.crm_class", "cards.max_cnt_product", "cards.all_months", "cards.buy_months")
        .select(db.raw("TO_CHAR(cards.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .select("customers.user_name")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findCrmMarsCardsInPks(card_pks) {
    try {
      let query = db(`${this.T_MARS_CARDS} as cards`)
        .whereIn("card_pk", card_pks)
        .select("card_pk");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findCrmMarsJoinsInEshopPks(eshop_pks) {
    try {
      let query = db(`${this.T_MARS_CARDS} as cards`)
        .leftJoin(`${this.T_COMBINE_LOG} as combine_log1`, function() {
          this.on("combine_log1.org_user_pk", "cards.eshop_pk")
            .andOn("combine_log1.combine_type", ESHOP_COMBINE_TYPE_ID);
        })
        .leftJoin(`${this.T_COMBINE_LOG} as combine_log2`, function() {
          this.on("combine_log2.target_user_pk", "cards.eshop_pk")
            .andOn("combine_log2.combine_type", ESHOP_COMBINE_TYPE_ID);
        })
        .leftJoin(`${this.T_MERGE_IDS} as merge_ids1`, "merge_ids1.eshop_pk", "cards.eshop_pk")
        .leftJoin(`${this.T_MERGE_IDS} as merge_ids2`, "merge_ids2.eshop_pk", "combine_log1.target_user_pk")
        .leftJoin(`${this.T_MERGE_IDS} as merge_ids3`, "merge_ids3.eshop_pk", "combine_log2.org_user_pk")
        .leftJoin(`${this.T_CUSTOMERS} as customers`, "customers.pvendor_pk", db.raw("NVL(NVL(merge_ids1.pvendor_pk, merge_ids2.pvendor_pk), merge_ids3.pvendor_pk)"))
        .whereIn("cards.eshop_pk", eshop_pks)
        .select("cards.card_pk", "cards.eshop_pk", "cards.eshop_id", "cards.wallet_card", "cards.card_name", "cards.phone_number", "cards.birthday")
        .select("customers.ecid", "customers.pvendor_pk", "customers.pvendor_id", "customers.user_name as prhn_name");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addCrmMarsCards(params) {
    try {
      const now = new Date();
      const rows = params.map(row => ({
        ...row,
        created_at: row.created_at || now,
        updated_at: now,
      }));
      const query = db(this.T_MARS_CARDS)
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

  static async editCrmMarsCard(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_MARS_CARDS)
        .where("card_pk", params.card_pk)
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findCrmEshopInfo(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, crm_level, crm_grade } = filter;

      let query = db(`${this.T_ESHOP_INFO} as eshop_info`)
        .leftJoin(`${this.T_CUSTOMERS} as customers`, "eshop_info.ecid", "customers.ecid")

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where("eshop_info.ecid", "like", `${lowerKeyword}`)
            .orWhere("eshop_info.eshop_pk", "like", `${lowerKeyword}`)
            .orWhere("eshop_info.pvendor_pk", "like", `${lowerKeyword}`)
            .orWhere(db.raw("LOWER(eshop_info.pvendor_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(eshop_info.prhn_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(eshop_info.eshop_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(eshop_info.eshop_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(eshop_info.phone_number)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(eshop_info.eshop_job)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(eshop_info.eshop_cid)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(customers.user_name)"), "like", `%${lowerKeyword}%`)
        });
      }

      if (crm_level !== undefined && crm_level !== "") {
        query = query.where("eshop_info.crm_level", crm_level);
      }
      if (crm_grade !== undefined && crm_grade !== "") {
        query = query.where("eshop_info.crm_grade", crm_grade);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(`eshop_info.${sort.key}`, sort.dir);
      }
      query = query.orderBy("eshop_info.eshop_pk", "desc");

      query = query
        .select("eshop_info.eshop_pk", "eshop_info.eshop_id", "eshop_info.eshop_name", "eshop_info.ecid", "eshop_info.pvendor_pk", "eshop_info.pvendor_id", "eshop_info.prhn_name", "eshop_info.phone_number", "eshop_info.eshop_gender", "eshop_info.eshop_job", "eshop_info.eshop_cid", "eshop_info.crm_level", "eshop_info.crm_grade", "eshop_info.crm_level_desc", "eshop_info.crm_grade_desc")
        .select(db.raw("TO_CHAR(eshop_info.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .select("customers.user_name")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findCrmEshopInfoInPks(eshop_pks) {
    try {
      let query = db(`${this.T_ESHOP_INFO} as eshop_info`)
        .whereIn("eshop_pk", eshop_pks)
        .select("eshop_pk");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findCrmEshopJoinsInEshopPks(eshop_pks) {
    try {
      let query = db(`${this.T_ESHOP_INFO} as eshop_info`)
        .leftJoin(`${this.T_COMBINE_LOG} as combine_log1`, function() {
          this.on("combine_log1.org_user_pk", "eshop_info.eshop_pk")
            .andOn("combine_log1.combine_type", ESHOP_COMBINE_TYPE_ID);
        })
        .leftJoin(`${this.T_COMBINE_LOG} as combine_log2`, function() {
          this.on("combine_log2.target_user_pk", "eshop_info.eshop_pk")
            .andOn("combine_log2.combine_type", ESHOP_COMBINE_TYPE_ID);
        })
        .leftJoin(`${this.T_MERGE_IDS} as merge_ids1`, "merge_ids1.eshop_pk", "eshop_info.eshop_pk")
        .leftJoin(`${this.T_MERGE_IDS} as merge_ids2`, "merge_ids2.eshop_pk", "combine_log1.target_user_pk")
        .leftJoin(`${this.T_MERGE_IDS} as merge_ids3`, "merge_ids3.eshop_pk", "combine_log2.org_user_pk")
        .leftJoin(`${this.T_CUSTOMERS} as customers`, "customers.pvendor_pk", db.raw("NVL(NVL(merge_ids1.pvendor_pk, merge_ids2.pvendor_pk), merge_ids3.pvendor_pk)"))
        .whereIn("eshop_info.eshop_pk", eshop_pks)
        .select("eshop_info.eshop_pk", "eshop_info.eshop_id", "eshop_info.eshop_name", "eshop_info.phone_number", "eshop_info.eshop_gender")
        .select("customers.ecid", "customers.pvendor_pk", "customers.pvendor_id", "customers.user_name as prhn_name");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addCrmEshopInfo(params) {
    try {
      const now = new Date();
      const rows = params.map(row => ({
        ...row,
        created_at: row.created_at || now,
        updated_at: now,
      }));
      const query = db(this.T_ESHOP_INFO)
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

  static async editCrmEshopInfo(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_ESHOP_INFO)
        .where("eshop_pk", params.eshop_pk)
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

module.exports = CrmModel;
