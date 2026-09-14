const db = require('../db/knex');
const { FLAG_EXIST, FLAG_SET, SYNC_STATUS } = require('../constants/constants');
const { PRODUCT_CATEGORY_PHONE } = require('../lang/en');

class ProductModel {
  static T_CATEGORIES = "ora_pid.product_categories";
  static T_PRODUCTS = "ora_pid.products";
  static T_IMAGES = "ora_pid.product_images";
  static T_SPEC_KEYS = "ora_pid.product_spec_keys";
  static T_SPEC_VALUES = "ora_pid.product_spec_values";
  static T_SPEC_ORDERS = "ora_pid.product_spec_orders";
  static T_PROD_MODELS = "ora_pid.product_models";
  static T_USERS = "ora_pid.users";
  static T_REG_POINT_TYPES = "ora_pid.register_point_types";
  static T_REG_PHONE_LOG = "ora_pid.register_phone_log";
  static T_IMEI_PREFIX = "ora_pid.phone_imei_prefix";
  static T_ACCESSORIES = "ora_pid.phone_accessories";
  static T_CHANGELOG = "ora_pid.phone_changelog";

  static async findCategories(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, parent_pk, is_leaf, is_deleted, min_at, max_at, is_client } = filter;

      let query = db(`${this.T_CATEGORIES} as categories`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(categories.category_name)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (min_at !== undefined && min_at !== "") {
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(categories.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function() {
                this.where("categories.is_deleted", FLAG_EXIST)
                .where(db.raw("TO_CHAR(categories.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
              });
          });
        } else {
          query = query.where("categories.is_deleted", FLAG_EXIST)
            .where(db.raw("TO_CHAR(categories.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (is_deleted !== undefined && is_deleted !== "") {
          query = query.where("categories.is_deleted", is_deleted);
        }
        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(categories.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
        }
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

      if (is_client === 1) {
        query = query.select(db.raw("TO_CHAR(categories.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      } else {
        query = query.select("categories.created_at", "categories.updated_at");
      }

      query = query
        .select("categories.category_pk", "categories.category_name", "categories.node_value", "categories.parent_pk", "categories.position", "categories.is_deleted", "categories.is_leaf")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findCategoryByPk(category_pk) {
    try {
      const query = db(this.T_CATEGORIES).where({ category_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addCategory(params) {
    try {
      const now = new Date();
      const query = db(this.T_CATEGORIES)
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

  static async editCategory(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_CATEGORIES)
        .where("category_pk", params.category_pk)
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findAllProducts(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, root_pk, is_deleted, min_at, max_at, is_client } = filter;

      let query = db(`${this.T_PRODUCTS} as products`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(products.product_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(products.simple_name)"), "like", `%${lowerKeyword}%`)
        });
      }

      if (min_at !== undefined && min_at !== "") {
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(products.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function() {
                this.where("products.is_deleted", FLAG_EXIST)
                .where(db.raw("TO_CHAR(products.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
              });
          });
        } else {
          query = query.where("products.is_deleted", FLAG_EXIST)
            .where(db.raw("TO_CHAR(products.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (is_deleted !== undefined && is_deleted !== "") {
          query = query.where("products.is_deleted", is_deleted);
        }
        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(products.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
        }
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

      if (is_client === 1) {
        query = query.select(db.raw("TO_CHAR(products.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      } else {
        query = query.select(db.raw("TO_CHAR(products.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"), db.raw("TO_CHAR(products.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      }

      query = query
        .select("products.product_pk", "products.product_name", "products.simple_name", "products.category_pk", "products.root_pk", "products.image_url", "products.price", "products.position", "products.is_new", "products.is_deleted", "products.status")
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
      const query = db(this.T_PRODUCTS).where({ product_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findProductSimplePhones() {
    try {
      let query = db(`${this.T_PRODUCTS} as products`)
        .leftJoin(`${this.T_CATEGORIES} as categories`, "products.root_pk", "categories.category_pk");

      query = query.where("categories.parent_pk", 0)
        .where("categories.category_name", PRODUCT_CATEGORY_PHONE);
      query = query.orderBy("products.position", "asc");

      query = query.select("products.product_pk", "products.product_name", "products.simple_name");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findProductPhonesForWeb() {
    try {
      let query = db(`${this.T_PRODUCTS} as products`)
        .leftJoin(`${this.T_CATEGORIES} as categories`, "products.root_pk", "categories.category_pk");

      query = query.where("categories.parent_pk", 0)
        .where("categories.category_name", PRODUCT_CATEGORY_PHONE)
        .where("categories.is_deleted", FLAG_EXIST)
        .where("products.is_deleted", FLAG_EXIST)
        .where("products.status", SYNC_STATUS.APPROVED);
      query = query.orderBy("products.position", "asc");

      query = query.select("products.product_pk", "products.product_name", "products.category_pk", "products.image_url", "products.price", "products.position", "products.is_new")
        .select("categories.category_name");
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

  static async findProductImages(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, product_pk, image_type, is_deleted, min_at, max_at, is_client } = filter;

      let query = db(`${this.T_IMAGES} as images`)
        .leftJoin(`${this.T_PRODUCTS} as products`, "images.product_pk", "products.product_pk");

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(products.product_name)"), "like", `%${lowerKeyword}%`);
        });
      }
      if (min_at !== undefined && min_at !== "") {
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(images.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function() {
                this.where("images.is_deleted", FLAG_EXIST)
                .where(db.raw("TO_CHAR(images.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
              });
          });
        } else {
          query = query.where("images.is_deleted", FLAG_EXIST)
            .where(db.raw("TO_CHAR(images.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (is_deleted !== undefined && is_deleted !== "") {
          query = query.where("images.is_deleted", is_deleted);
        }
        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(images.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
        }
      }
      if (product_pk !== undefined && product_pk !== "") {
        query = query.where("images.product_pk", product_pk);
      }
      if (image_type !== undefined && image_type !== "") {
        query = query.where("images.image_type", image_type);
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
        query = query.select(db.raw("TO_CHAR(images.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      } else {
        query = query.select("images.created_at", "images.updated_at");
      }

      query = query
        .select("images.table_pk", "images.product_pk", "images.image_url", "images.image_ratio", "images.position", "images.is_deleted", "images.image_type", "images.status")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findProductImageByPk(table_pk) {
    try {
      const query = db(this.T_IMAGES).where({ table_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findProductImagesByFilter(filter) {
    try {
      const query = db(this.T_IMAGES)
        .where(filter)
        .orderBy("position", "asc")
        .select("table_pk", "image_url", "image_ratio", "position")
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addProductImage(params) {
    try {
      const now = new Date();
      const query = db(this.T_IMAGES)
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

  static async editProductImage(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_IMAGES)
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

  static async findSpecKeys(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, is_deleted, min_at, max_at, is_client } = filter;

      let query = db(`${this.T_SPEC_KEYS} as spec_keys`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(spec_keys.spec_name)"), "like", `%${lowerKeyword}%`);
        });
      }
      if (min_at !== undefined && min_at !== "") {
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(spec_keys.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function() {
                this.where("spec_keys.is_deleted", FLAG_EXIST)
                .where(db.raw("TO_CHAR(spec_keys.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
              });
          });
        } else {
          query = query.where("spec_keys.is_deleted", FLAG_EXIST)
            .where(db.raw("TO_CHAR(spec_keys.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (is_deleted !== undefined && is_deleted !== "") {
          query = query.where("spec_keys.is_deleted", is_deleted);
        }
        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(spec_keys.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
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
        query = query.select(db.raw("TO_CHAR(spec_keys.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      } else {
        query = query.select(db.raw("TO_CHAR(spec_keys.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
      }

      query = query
        .select("spec_keys.spec_pk", "spec_keys.spec_name", "spec_keys.spec_type", "spec_keys.is_deleted")
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
      const query = db(this.T_SPEC_KEYS).where({ spec_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findSpecKeyByName(spec_name) {
    try {
      const query = db(this.T_SPEC_KEYS).where({ spec_name }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addSpecKey(params) {
    try {
      const now = new Date();
      const query = db(this.T_SPEC_KEYS)
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
      const rowCount = await db(this.T_SPEC_KEYS)
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
      const { offset, limit, sort, root_pk, is_deleted, min_at, max_at, is_client } = filter;

      let query = db(`${this.T_SPEC_ORDERS} as spec_orders`);
      if (is_client !== 1) {
        query = query.leftJoin(`${this.T_SPEC_KEYS} as spec_keys`, "spec_keys.spec_pk", "spec_orders.spec_pk");
      }

      if (min_at !== undefined && min_at !== "") {
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(spec_orders.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function() {
                this.where("spec_orders.is_deleted", FLAG_EXIST)
                .where(db.raw("TO_CHAR(spec_orders.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
              });
          });
        } else {
          query = query.where("spec_orders.is_deleted", FLAG_EXIST)
            .where(db.raw("TO_CHAR(spec_orders.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (is_deleted !== undefined && is_deleted !== "") {
          query = query.where("spec_orders.is_deleted", is_deleted);
        }
        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(spec_orders.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
        }
      }
      if (root_pk !== undefined && root_pk !== "") {
        query = query.where("spec_orders.root_pk", root_pk);
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
        query = query.select(db.raw("TO_CHAR(spec_orders.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      } else {
        query = query.select(db.raw("TO_CHAR(spec_orders.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
          .select("spec_keys.spec_name");
      }

      query = query
        .select("spec_orders.table_pk", "spec_orders.root_pk", "spec_orders.spec_pk", "spec_orders.position", "spec_orders.is_deleted")
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
      const query = db(this.T_SPEC_ORDERS).where({ table_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findSpecOrderByFilter(filter) {
    try {
      const query = db(this.T_SPEC_ORDERS).where(filter).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addSpecOrder(params) {
    try {
      const now = new Date();
      const query = db(this.T_SPEC_ORDERS)
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
      const rowCount = await db(this.T_SPEC_ORDERS)
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
      const { offset, limit, sort, product_pk, min_at, max_at, is_client } = filter;

      let query = db(`${this.T_SPEC_VALUES} as spec_values`);

      if (min_at !== undefined && min_at !== "") {
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(spec_values.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(db.raw("TO_CHAR(spec_values.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
          });
        } else {
          query = query.where(db.raw("TO_CHAR(spec_values.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else if (max_at !== undefined && max_at != "") {
        query = query.where(db.raw("TO_CHAR(spec_values.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);  
      }
      if (product_pk !== undefined && product_pk !== "") {
        query = query.where("spec_values.product_pk", product_pk);
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
        query = query.select(db.raw("TO_CHAR(spec_values.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      } else {
        query = query.select("spec_values.created_at", "spec_values.updated_at");
      }

      query = query
        .select("spec_values.table_pk", "spec_values.product_pk", "spec_values.spec_pk", "spec_values.spec_value", "spec_values.position")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findSpecKeyAndValues(filter, isCount = false) {
    try {
      const { offset, limit, sort, root_pk, product_pk } = filter;

      let query = db(`${this.T_SPEC_ORDERS} as spec_orders`)
        .leftJoin(`${this.T_SPEC_KEYS} as spec_keys`, "spec_keys.spec_pk", "spec_orders.spec_pk")
        .leftJoin(`${this.T_SPEC_VALUES} as spec_values`, function() {
          this.on("spec_values.spec_pk", "spec_orders.spec_pk")
            .andOn("spec_values.product_pk", product_pk);
        });

      query = query.where("spec_keys.is_deleted", FLAG_EXIST)
        .where("spec_orders.is_deleted", FLAG_EXIST);

      if (root_pk !== 0) {
        query = query.where("spec_orders.root_pk", root_pk);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query = query.orderBy("spec_orders.position", "asc");

      query = query
        .select("spec_keys.spec_pk", "spec_keys.spec_name", "spec_keys.spec_type")
        .select("spec_orders.position")
        .select("spec_values.table_pk", "spec_values.spec_value")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findSpecValueByFilter(filter) {
    try {
      const query = db(this.T_SPEC_VALUES).where(filter).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addSpecValue(params) {
    try {
      const now = new Date();
      const query = db(this.T_SPEC_VALUES)
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
      const rowCount = await db(this.T_SPEC_VALUES)
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

  static async findProductModels(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, is_deleted, min_at, max_at, is_client } = filter;

      let query = db(`${this.T_PROD_MODELS} as prod_models`)
        .leftJoin(`${this.T_PRODUCTS} as products`, "prod_models.product_pk", "products.product_pk");

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(prod_models.model_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(products.product_name)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (min_at !== undefined && min_at !== "") {
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(prod_models.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function() {
                this.where("prod_models.is_deleted", FLAG_EXIST)
                .where(db.raw("TO_CHAR(prod_models.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
              });
          });
        } else {
          query = query.where("prod_models.is_deleted", FLAG_EXIST)
            .where(db.raw("TO_CHAR(prod_models.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (is_deleted !== undefined && is_deleted !== "") {
          query = query.where("prod_models.is_deleted", is_deleted);
        }
        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(prod_models.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
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
        query = query.select(db.raw("TO_CHAR(prod_models.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      } else {
        query = query.select(db.raw("TO_CHAR(prod_models.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"), db.raw("TO_CHAR(prod_models.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
          .select("products.product_name");
      }

      query = query
        .select("prod_models.model_pk", "prod_models.product_pk", "prod_models.model_name", "prod_models.reservable", "prod_models.is_deleted")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findProductModelByPk(model_pk) {
    try {
      const query = db(this.T_PROD_MODELS).where({ model_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findProductModelByProductPk(product_pk) {
    try {
      const query = db(this.T_PROD_MODELS).where({ product_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findProductModelsReservable() {
    try {
      const query = db(`${this.T_PROD_MODELS} as prod_models`)
        .leftJoin(`${this.T_PRODUCTS} as products`, "prod_models.product_pk", "products.product_pk")
        .where("prod_models.reservable", FLAG_SET)
        .select("prod_models.model_pk", "prod_models.product_pk", "prod_models.reservable")
        .select("products.product_name", "products.simple_name");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addProductModel(params, admin_pk) {
    try {
      const now = new Date();
      const query = db(this.T_PROD_MODELS)
        .insert({
          ...params,
          created_at: now,
          updated_at: now,
          created_by: admin_pk,
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

  static async editProductModel(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_PROD_MODELS)
        .where("model_pk", params.model_pk)
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

  static async findRegisterPhoneLog(filter, isCount = false) {
    try {
      const { offset, limit, sort, user_pk, phone_imei, from, to, is_deleted, min_at, max_at, keyword, is_client } = filter;

      let query = db(`${this.T_REG_PHONE_LOG} as phone_log`)
        .leftJoin(`${this.T_PRODUCTS} as products`, "phone_log.product_pk", "products.product_pk");

      if (is_client !== 1) {
        query = query.leftJoin(`${this.T_USERS} as users`, "phone_log.user_pk", "users.user_pk");
      }

      if (user_pk) {
        query = query.where("phone_log.user_pk", user_pk);
      }
      if (phone_imei) {
        query = query.where("phone_log.phone_imei", phone_imei);
      }
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function () {
          this.where(db.raw("LOWER(phone_log.cid)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(phone_log.phone_imei)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(products.product_name)"), "like", `%${lowerKeyword}%`);
          if (is_client !== 1) {
            this.orWhere(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
              .orWhere("users.user_pk", "like", `${lowerKeyword}`);
          }
        });
      }
      if (from && to) {
        query = query.where(db.raw("TO_CHAR(phone_log.created_at, 'YYYY-MM-DD')"), ">=", from)
          .where(db.raw("TO_CHAR(phone_log.created_at, 'YYYY-MM-DD')"), "<=", to);
      }
      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("phone_log.is_deleted", is_deleted);
      }
      if (min_at !== undefined && min_at !== "") {
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(phone_log.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(db.raw("TO_CHAR(phone_log.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
          });
        } else {
          query = query.where(db.raw("TO_CHAR(phone_log.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else if (max_at !== undefined && max_at != "") {
        query = query.where(db.raw("TO_CHAR(phone_log.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        const sortKey = ["created_at", "updated_at"].includes(sort.key) ? `phone_log.${sort.key}` : sort.key;
        query = query.orderBy(sortKey, sort.dir);
      }

      if (is_client === 1) {
        query = query.select(db.raw("TO_CHAR(phone_log.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      } else {
        query = query.select(db.raw("TO_CHAR(phone_log.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
          .select("users.user_id", "users.user_name");
      }

      query = query.select("phone_log.table_pk", "phone_log.user_pk", "phone_log.product_pk", "phone_log.phone_imei", "phone_log.cid", "phone_log.points", "phone_log.is_deleted")
        .select("products.product_name")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching manager: " + err.message);
    }
  }

  static async findRegisterPhoneLogByFilter(filter) {
    try {
      const query = db(`${this.T_REG_PHONE_LOG} as phone_log`)
        .where(filter)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findRegisterPhoneLogByImei(phone_imei) {
    try {
      const query = db(`${this.T_REG_PHONE_LOG} as phone_log`)
        .leftJoin(`${this.T_USERS} as users`, "phone_log.user_pk", "users.user_pk")
        .where("phone_log.phone_imei", phone_imei)
        .where("phone_log.is_deleted", FLAG_EXIST)
        .select("phone_log.user_pk")
        .select(db.raw("TO_CHAR(phone_log.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
        .select("users.user_id")
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findRegisterPhoneLogsInUserPksAndImeis(user_pks, imeis, max_at) {
    try {
      const query1 = db(`${this.T_REG_PHONE_LOG}`)
        .whereIn("user_pk", user_pks)
        .whereIn("phone_imei", imeis)
        .where(db.raw("TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS')"), "<=", max_at)
        .groupBy("phone_imei")
        .select(db.raw("MAX(table_pk) as table_pk"))
        .as("T1");

      const query2 = db(`${this.T_REG_PHONE_LOG} as phone_log`)
        .leftJoin(query1, "phone_log.table_pk", "T1.table_pk")
        .whereNotNull("T1.table_pk")
        .select("phone_log.user_pk", "phone_log.phone_imei", "phone_log.product_pk");
      return await query2;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findRegisterPhoneLogsInUserPksAndName(user_pks, simple_name) {
    try {
      let query = db(`${this.T_REG_PHONE_LOG} as phone_log`)
        .leftJoin(`${this.T_PRODUCTS} as products`, "phone_log.product_pk", "products.product_pk")
        .whereIn("phone_log.user_pk", user_pks)
        .where("phone_log.is_deleted", FLAG_EXIST);
        if (simple_name) {
        query = query.where("products.simple_name", simple_name);
      }
      query = query.select("phone_log.user_pk", "phone_log.phone_imei")
        .select(db.raw("TO_CHAR(phone_log.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
        .select("products.simple_name");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async calcRegisterPhoneLogByUserPk(user_pk) {
    try {
      const query = db(`${this.T_REG_PHONE_LOG} as phone_log`)
        .where("user_pk", user_pk)
        .sum({ sum_points: "points"});
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addRegisterPhoneLog(params) {
    try {
      const now = new Date();
      const query = db(this.T_REG_PHONE_LOG)
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

  static async editRegisterPhoneLog(params, filter) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_REG_PHONE_LOG)
        .where(filter)
        .update({
          ...params,
          updated_at: now,
        });

      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findPhoneImeiPrefixByPk(prefix_pk) {
    try {
      const query = db(this.T_IMEI_PREFIX)
        .where("prefix_pk", prefix_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPhoneImeiPrefixesByProductPk(product_pk) {
    try {
      const query = db(this.T_IMEI_PREFIX)
        .where("product_pk", product_pk);
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPhoneImeiPrefixInProductPks(product_pks) {
    try {
      const query = db(this.T_IMEI_PREFIX)
        .whereIn("product_pk", product_pks)
        .select("prefix_pk", "product_pk", "prefix_str");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addPhoneImeiPrefix(params) {
    try {
      const now = new Date();
      const query = db(this.T_IMEI_PREFIX)
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

  static async deletePhoneImeiPrefix(prefix_pk) {
    try {
      const rowCount = await db(this.T_IMEI_PREFIX)
        .where("prefix_pk", prefix_pk)
        .del();

      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findPhoneAccessories(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, product_pk, is_deleted, min_at, max_at, is_client } = filter;

      let query = db(`${this.T_ACCESSORIES} as accessories`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(accessories.accessory_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(accessories.allow_num)"), "like", `%${lowerKeyword}%`)
        });
      }

      if (min_at !== undefined && min_at !== "") {
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(accessories.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function() {
                this.where("accessories.is_deleted", FLAG_EXIST)
                .where(db.raw("TO_CHAR(accessories.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
              });
          });
        } else {
          query = query.where("accessories.is_deleted", FLAG_EXIST)
            .where(db.raw("TO_CHAR(accessories.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (is_deleted !== undefined && is_deleted !== "") {
          query = query.where("accessories.is_deleted", is_deleted);
        }
        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(accessories.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
        }
      }
      if (product_pk !== undefined && product_pk !== "") {
        query = query.where("accessories.product_pk", product_pk);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }
      query = query.orderBy("accessories.accessory_pk", "asc");

      if (is_client !== 1) {
        query = query.select("accessories.product_name");
      }

      query = query
        .select("accessories.accessory_pk", "accessories.product_pk", "accessories.accessory_name", "accessories.resource_price", "accessories.service_price", "accessories.allow_num", "accessories.is_deleted")
        .select(db.raw("TO_CHAR(accessories.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findPhoneAccessoryByPk(accessory_pk) {
    try {
      const query = db(this.T_ACCESSORIES)
        .where("accessory_pk", accessory_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findPhoneAccessoryByFilter(filter) {
    try {
      const query = db(this.T_ACCESSORIES)
        .where(filter)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addPhoneAccessory(params) {
    try {
      const now = new Date();
      const query = db(this.T_ACCESSORIES)
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

  static async editPhoneAccessory(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_ACCESSORIES)
        .where("accessory_pk", params.accessory_pk)
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findPhoneChangelogs(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, product_pk, is_deleted, min_at, max_at, is_client } = filter;

      let query = db(`${this.T_CHANGELOG} as changelog`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(changelog.title)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(changelog.content)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(changelog.publish_num)"), "like", `%${lowerKeyword}%`)
        });
      }

      if (min_at !== undefined && min_at !== "") {
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(changelog.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function() {
                this.where("changelog.is_deleted", FLAG_EXIST)
                .where(db.raw("TO_CHAR(changelog.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
              });
          });
        } else {
          query = query.where("changelog.is_deleted", FLAG_EXIST)
            .where(db.raw("TO_CHAR(changelog.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (is_deleted !== undefined && is_deleted !== "") {
          query = query.where("changelog.is_deleted", is_deleted);
        }
        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(changelog.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
        }
      }
      if (product_pk !== undefined && product_pk !== "") {
        query = query.where("changelog.product_pk", product_pk);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }
      query = query.orderBy("changelog.table_pk", "desc");

      if (is_client !== 1) {
        query = query.select("changelog.product_name");
      }

      query = query
        .select("changelog.table_pk", "changelog.product_pk", "changelog.title", "changelog.content", "changelog.publish_num", "changelog.position", "changelog.is_deleted")
        .select(db.raw("TO_CHAR(changelog.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findPhoneChangelogByPk(table_pk) {
    try {
      const query = db(this.T_CHANGELOG)
        .where("table_pk", table_pk)
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addPhoneChangelog(params) {
    try {
      const now = new Date();
      const query = db(this.T_CHANGELOG)
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

  static async editPhoneChangelog(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_CHANGELOG)
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
}

module.exports = ProductModel;
