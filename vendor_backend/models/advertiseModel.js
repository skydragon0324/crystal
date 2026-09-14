const db = require('../db/knex');
const moment = require('moment');
const { FLAG_NONE, FLAG_TESTER, SYNC_STATUS } = require('../constants/constants');

class AdvertiseModel {
  static T_ADS = "ora_pid.advertisements";
  static T_LAYOUTS = "ora_pid.layouts";
  static T_LAYOUT_ADS = "ora_pid.layout_ads";
  static T_MANAGERS = "ora_pid.managers";
  static T_HOME_CONFIGS = "ora_pid.home_configs";
  static T_MENUS = "ora_pid.home_menus";
  static T_HOME_POPUPS = "ora_pid.home_popups";
  static T_PAGE_BANNERS = "ora_pid.page_banners";

  static async findAdvertisements(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword } = filter;

      let query = db(`${this.T_ADS} as ads`)

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(db.raw("LOWER(ads.title)"), "like", `%${lowerKeyword}%`)
          .orWhere(db.raw("LOWER(ads.content)"), "like", `%${lowerKeyword}%`)
          .orWhere(db.raw("LOWER(ads.phone_number)"), "like", `%${lowerKeyword}%`)
          .orWhere(db.raw("LOWER(ads.ad_action)"), "like", `%${lowerKeyword}%`)
          .orWhere(db.raw("LOWER(ads.note)"), "like", `%${lowerKeyword}%`);
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
        .select("ads.ad_pk", "ads.title", "ads.content", "ads.image_url", "ads.image_sync", "ads.content_url", "ads.content_sync", "ads.phone_number", "ads.ad_action", "ads.duty_action", "ads.note")
        .select(db.raw("TO_CHAR(ads.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"), db.raw("TO_CHAR(ads.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findAdvertiseByPk(ad_pk) {
    try {
      const query = db(this.T_ADS).where({ ad_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findAdsNotUsedByLayoutPk(layout_pk, sort) {
    try {
      let query = db(`${this.T_ADS} as ads`)
        .whereNotIn("ad_pk", function() {
          this.select("ad_pk")
            .from("layout_ads")
            .where("layout_pk", layout_pk);
        });

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      query = query.select("ads.ad_pk", "ads.title", "ads.image_url");

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async addAdvertisement(params, admin_pk) {
    try {
      const now = new Date();
      const query = db(this.T_ADS)
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

  static async editAdvertisement(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_ADS)
        .where({ ad_pk: params.ad_pk })
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

  static async deleteAdvertiseByPk(ad_pk) {
    try {
      const rowCount = await db(this.T_ADS)
        .where({ ad_pk })
        .del();
      
      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }

  static async findAllLayouts(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword } = filter;

      let query = db(`${this.T_LAYOUTS} as layouts`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(db.raw("LOWER(layouts.layout_name)"), "like", `%${lowerKeyword}%`);
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
        .select("layouts.layout_pk", "layouts.predef_id", "layouts.layout_name", "layouts.autoplay", "layouts.show_name", "layouts.show_more")
        .select(db.raw("TO_CHAR(layouts.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"), db.raw("TO_CHAR(layouts.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findLayoutByPk(layout_pk) {
    try {
      const query = db(this.T_LAYOUTS).where({ layout_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addLayout(params, admin_pk) {
    try {
      const now = new Date();
      const query = db(this.T_LAYOUTS)
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

  static async editLayout(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_LAYOUTS)
        .where({ layout_pk: params.layout_pk })
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

  static async deleteLayoutByPk(layout_pk) {
    try {
      const rowCount = await db(this.T_LAYOUTS)
        .where({ layout_pk })
        .del();
      
      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }

  static async findAllLayoutAds(filter, isCount = false) {
    try {
      const { offset, limit, sort, layout_pk } = filter;

      let query = db(`${this.T_LAYOUT_ADS} as layout_ads`)
        .leftJoin(`${this.T_ADS} as ads`, "layout_ads.ad_pk", "ads.ad_pk");

      if (layout_pk) {
        query = query.where("layout_ads.layout_pk", layout_pk);
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
        .select("layout_ads.table_pk", "layout_ads.layout_pk", "layout_ads.pre_index", "layout_ads.ad_pk", "layout_ads.position", "layout_ads.created_at", "layout_ads.updated_at")
        .select("ads.title as ad_title", "ads.image_url")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findLayoutAdByPk(table_pk) {
    try {
      const query = db(this.T_LAYOUT_ADS).where({ table_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findLayoutAdsByLayoutPks(layout_pks, is_client) {
    try {
      let query = db(`${this.T_LAYOUT_ADS} as layout_ads`)
        .leftJoin(`${this.T_ADS} as ads`, "layout_ads.ad_pk", "ads.ad_pk");

      if (layout_pks && layout_pks.length > 0) {
        query = query.whereIn("layout_ads.layout_pk", layout_pks);
      }

      query = query.orderBy("layout_ads.pre_index", "asc")
        .orderBy("layout_ads.position", "asc");

      if (is_client === 1) {
        query = query.select(db.raw("REPLACE(ads.content, '<p></p>', '<br />') ad_content"), "ads.phone_number");
      }
      query = query
        .select("layout_ads.table_pk", "layout_ads.layout_pk", "layout_ads.pre_index", "layout_ads.ad_pk", "layout_ads.position")
        .select("ads.title as ad_title", "ads.image_url", "ads.image_ratio", "ads.content_url", "ads.ad_action", "ads.duty_action");

      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }
  
  static async addLayoutAd(params, admin_pk) {
    try {
      const now = new Date();
      const query = db(this.T_LAYOUT_ADS)
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

  static async editLayoutAd(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_LAYOUT_ADS)
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

  static async deleteLayoutAdByPk(table_pk) {
    try {
      const rowCount = await db(this.T_LAYOUT_ADS)
        .where({ table_pk })
        .del();
      
      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }

  static async findHomeConfigs(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, is_deleted, is_test, is_client } = filter;

      let query = db(`${this.T_HOME_CONFIGS} as configs`)
        .leftJoin(`${this.T_LAYOUTS} as layouts`, "configs.layout_pk", "layouts.layout_pk");

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(db.raw("LOWER(configs.config_name)"), "like", `%${lowerKeyword}%`)
          .orWhere(db.raw("LOWER(configs.section_name)"), "like", `%${lowerKeyword}%`)
          .orWhere(db.raw("LOWER(layouts.predef_id)"), "like", `%${lowerKeyword}%`)
          .orWhere(db.raw("LOWER(layouts.layout_name)"), "like", `%${lowerKeyword}%`);
      }

      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("configs.is_deleted", is_deleted);
      }

      if (is_test !== undefined && is_test !== "") {
        query = query.where("configs.is_test", is_test);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      if (is_client !== 1) {
        query = query.select("configs.config_name", "configs.is_deleted", "configs.is_test")
          .select(db.raw("TO_CHAR(configs.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"), db.raw("TO_CHAR(configs.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      }
      query = query
        .select("configs.table_pk", "configs.layout_pk", "configs.position", "configs.section_name")
        .select("layouts.predef_id", "layouts.layout_name", "layouts.autoplay", "layouts.show_name", "layouts.show_more")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findHomeConfigByPk(table_pk) {
    try {
      const query = db(this.T_HOME_CONFIGS).where({ table_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }
  
  static async addHomeConfig(params, admin_pk) {
    try {
      const now = new Date();
      const query = db(this.T_HOME_CONFIGS)
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

  static async editHomeConfig(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_HOME_CONFIGS)
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

  static async deleteHomeConfigByPk(table_pk) {
    try {
      const rowCount = await db(this.T_HOME_CONFIGS)
        .where({ table_pk })
        .del();
      
      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }

  static async findHomeMenus(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, is_deleted, include_test, max_at, is_client } = filter;

      let query = db(`${this.T_MENUS} as menus`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(menus.menu_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(menus.menu_action)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(menus.message)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("menus.is_deleted", is_deleted);
      }

      if (max_at !== undefined && max_at != "") {
        query = query.where(db.raw("TO_CHAR(menus.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
      }

      if (include_test !== FLAG_TESTER) {
        query = query.where("menus.is_test", FLAG_NONE);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }
      query = query.orderBy("menus.menu_pk", "asc");

      if (is_client !== 1) {
        query = query.select("menus.note");
      }
      query = query
        .select("menus.menu_pk", "menus.icon_name", "menus.icon_url", "menus.menu_name", "menus.menu_action", "menus.message", "menus.position", "menus.is_deleted", "menus.is_test")
        .select(db.raw("TO_CHAR(menus.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"), db.raw("TO_CHAR(menus.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findMenuByPk(menu_pk) {
    try {
      const query = db(this.T_MENUS).where({ menu_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addMenu(params, admin_pk) {
    try {
      const now = new Date();
      const query = db(this.T_MENUS)
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

  static async editMenu(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_MENUS)
        .where({ menu_pk: params.menu_pk })
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

  static async findHomePopups(filter, isCount = false) {
    try {
      const { offset, limit, sort, is_deleted, is_now, max_at, is_client } = filter;

      let query = db(`${this.T_HOME_POPUPS} as popups`);

      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("popups.is_deleted", is_deleted);
      }

      if (is_now === 1) {
        const now = moment().format("YYYY-MM-DD");
        query = query.where(db.raw("TO_CHAR(popups.start_date, 'YYYY-MM-DD')"), "<=", now)
          .where(db.raw("TO_CHAR(popups.end_date, 'YYYY-MM-DD')"), ">=", now);
      }

      if (max_at) {
        query = query.where(db.raw("TO_CHAR(popups.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
      }

      if (is_client === 1) {
        query = query.where("popups.image_sync", SYNC_STATUS.APPROVED);
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
        .select("popups.table_pk", "popups.image_url", "popups.image_sync", "popups.position", "popups.is_deleted")
        .select(db.raw("TO_CHAR(popups.start_date, 'YYYY-MM-DD') start_date"), db.raw("TO_CHAR(popups.end_date, 'YYYY-MM-DD') end_date"), db.raw("TO_CHAR(popups.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"), db.raw("TO_CHAR(popups.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findHomePopupByPk(table_pk) {
    try {
      const query = db(this.T_HOME_POPUPS).where({ table_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addHomePopup(params, admin_pk) {
    try {
      const now = new Date();
      const query = db(this.T_HOME_POPUPS)
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

  static async editHomePopup(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_HOME_POPUPS)
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

  static async findPageBanners(filter, isCount = false) {
    try {
      const { offset, limit, sort, page_type, is_deleted, max_at, status } = filter;

      let query = db(`${this.T_PAGE_BANNERS} as banners`);

      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("banners.is_deleted", is_deleted);
      }

      if (max_at !== undefined && max_at !== "") {
        query = query.where(db.raw("TO_CHAR(banners.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
      }

      if (page_type !== undefined && page_type !== "") {
        query = query.where("page_type", page_type);
      }
      if (status !== undefined && status !== "") {
        query = query.where("status", status);
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
        .select("banners.table_pk", "banners.image_url", "banners.image_ratio", "banners.page_type", "banners.position", "banners.action", "banners.status", "banners.is_deleted")
        .select(db.raw("TO_CHAR(banners.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"), db.raw("TO_CHAR(banners.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findPageBannerByPk(table_pk) {
    try {
      const query = db(this.T_PAGE_BANNERS).where({ table_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addPageBanner(params) {
    try {
      const now = new Date();
      const query = db(this.T_PAGE_BANNERS)
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

  static async editPageBanner(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_PAGE_BANNERS)
        .where({ table_pk: params.table_pk })
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

module.exports = AdvertiseModel;
