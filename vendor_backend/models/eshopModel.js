const db = require('../db/knex');
const { ESHOP_COMBINE_TYPE_ID, ESHOP_ID_FILTERS, FLAG_ACTIVE } = require('../constants/constants');

class EshopModel {
  static T_CARDS = "ora_pid.eshop_cards";
  static T_COMBINE_LOG = "ora_pid.eshop_combine_log";
  static T_ESHOP_STATS = "ora_pid.eshop_point_stats";
  static T_USERS = "ora_pid.users";
  static T_MERGE_IDS = "ora_pid.user_merge_ids";

  static async findEshopCards(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, wallet_type, accum_level, id_filter } = filter;

      let query = db(`${this.T_CARDS} as cards`)
        .leftJoin(`${this.T_COMBINE_LOG} as combine_log1`, function() {
          this.on("combine_log1.target_user_pk", "cards.eshop_pk")
            .andOn("combine_log1.combine_type", ESHOP_COMBINE_TYPE_ID);
        })
        .leftJoin(`${this.T_COMBINE_LOG} as combine_log2`, function() {
          this.on("combine_log2.org_user_pk", "cards.eshop_pk")
            .andOn("combine_log2.combine_type", ESHOP_COMBINE_TYPE_ID);
        })
        .leftJoin(`${this.T_MERGE_IDS} as merge_ids1`, "merge_ids1.eshop_pk", "cards.eshop_pk")
        .leftJoin(`${this.T_MERGE_IDS} as merge_ids2`, "merge_ids2.eshop_pk", "combine_log1.org_user_pk")
        .leftJoin(`${this.T_MERGE_IDS} as merge_ids3`, "merge_ids3.eshop_pk", "combine_log2.target_user_pk")
        .leftJoin(`${this.T_USERS} as users`, "users.user_pk", db.raw("NVL(NVL(merge_ids1.pvendor_pk, merge_ids3.pvendor_pk), merge_ids2.pvendor_pk)"));

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function () {
          this.where(db.raw("LOWER(cards.accum_card)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(cards.wallet_card)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(cards.username)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(cards.phone_number)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(cards.eshop_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_pk)"), "like", `${lowerKeyword}`)
            .orWhere(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(merge_ids1.eshop_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(merge_ids2.eshop_id)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (wallet_type) {
        query = query.where("cards.wallet_type", wallet_type);
      }

      if (accum_level) {
        query = query.where("cards.accum_level", accum_level);
      }

      if (id_filter === ESHOP_ID_FILTERS.PID) {
        query = query.whereNotNull("users.user_pk");
      } else if (id_filter === ESHOP_ID_FILTERS.ESHOP) {
        query = query.whereNotNull("cards.eshop_pk");
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir)
          .orderBy("cards.card_pk", "asc");
      }

      query = query.select("cards.card_pk", "cards.accum_card", "cards.accum_level", "cards.wallet_card", "cards.wallet_type", "cards.username", "cards.phone_number", "cards.eshop_pk", "cards.eshop_id", "cards.wallet_balance", "cards.prize_balance", "cards.accum_value", "cards.commerce_value")
        .select(db.raw("TO_CHAR(cards.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .select("users.user_pk", "users.user_id", "users.user_name")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching rows: " + err.message);
    }
  }
  
  static async findEshopCardInPks(card_pks) {
    try {
      const query = db(this.T_CARDS)
        .whereIn("card_pk", card_pks)
        .select("card_pk");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addEshopCards(rows) {
    try {
      const now = new Date();
      const query = db(this.T_CARDS)
        .insert(rows.map(row => ({
          ...row,
          created_at: now,
          updated_at: now,
        })))
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

  static async editEshopCard(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_CARDS)
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

  static async findEshopCombineLastLog() {
    try {
      const query = db(this.T_COMBINE_LOG)
        .orderBy("updated_at", "desc")
        .orderBy("id", "desc")
        .select(db.raw("TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findEshopCombineLogInIds(ids) {
    try {
      const query = db(this.T_COMBINE_LOG)
        .whereIn("id", ids)
        .select("id");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addEshopCardCombineLogs(rows) {
    try {
      const query = db(this.T_COMBINE_LOG)
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

  static async editEshopCombineLog(params) {
    try {
      const rowCount = await db(this.T_COMBINE_LOG)
        .where("id", params.id)
        .update(params);
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findEshopPointStats(filter, isCount = false) {
    try {
      const { offset, limit, keyword, target_rank, top_count, surroundings, user_rank, is_client } = filter;

      let query1 = db(`${this.T_ESHOP_STATS} as point_stats`)
        .select("point_stats.accum_card", "point_stats.eshop_pk", "point_stats.eshop_id", "point_stats.commerce_value")
        .select(db.raw("ROW_NUMBER() OVER (ORDER BY NVL(point_stats.commerce_value, 0) DESC) AS rank"));
      if (is_client !== 1) {
        query1 = query1.select("point_stats.accum_level", "point_stats.wallet_card", "point_stats.wallet_type", "point_stats.username", "point_stats.phone_number");
      }
      query1 = query1.as("T1");

      let query2 = db(query1)
        .leftJoin(`${this.T_COMBINE_LOG} as combine_log`, function() {
          this.on("combine_log.target_user_pk", "T1.eshop_pk")
            .andOn("combine_log.combine_type", ESHOP_COMBINE_TYPE_ID);
        })
        .leftJoin(`${this.T_MERGE_IDS} as merge_ids1`, "merge_ids1.eshop_pk", "T1.eshop_pk")
        .leftJoin(`${this.T_MERGE_IDS} as merge_ids2`, "merge_ids2.eshop_pk", "combine_log.org_user_pk")
        .leftJoin(`${this.T_USERS} as users`, "users.user_pk", db.raw("NVL(merge_ids1.pvendor_pk, merge_ids2.pvendor_pk)"));

      if (is_client === 1) {
        query2 = query2.where(function() {
          this.where("T1.rank", "<=", top_count);
          if (target_rank) {
            const target_min = target_rank - surroundings;
            const target_max = target_rank + surroundings;
            this.orWhere(function() {
              this.where("T1.rank", ">=", target_min)
                .where("T1.rank", "<=", target_max);
            });
          }
          if (user_rank !== -1) {
            const user_min = user_rank - surroundings;
            const user_max = user_rank + surroundings;
            this.orWhere(function () {
              this.where("T1.rank", ">=", user_min)
                .where("T1.rank", "<=", user_max);
            });
          }
        });
      } else if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query2 = query2.where(function () {
          this.where(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere("users.user_pk", "like", `${lowerKeyword}`)
            .orWhere(db.raw("LOWER(T1.accum_card)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(T1.wallet_card)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(T1.username)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(T1.eshop_id)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (isCount) {
        const countQuery = query2.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query2 = query2.orderBy("T1.rank", "asc")
        .orderBy("T1.accum_card", "asc");

      if (is_client === 1) {
        query2 = query2.select(db.raw("NVL(NVL(users.user_id, T1.eshop_id), T1.accum_card) user_id"))
      } else {
        query2 = query2.select("T1.accum_level", "T1.wallet_card", "T1.wallet_type", "T1.username", "T1.phone_number", "T1.eshop_pk")
          .select("users.user_pk", "users.user_id", "users.user_name");
      }

      query2 = query2.select("T1.accum_card", "T1.eshop_id", "T1.commerce_value as points", "T1.rank")
        .offset(offset);

      if (limit) {
        query2 = query2.limit(limit);
      }

      return await query2;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findEshopPointRankByUserPk(user_pk) {
    try {
      let query1 = db(`${this.T_ESHOP_STATS} as point_stats`)
        .select("point_stats.accum_card", "point_stats.eshop_pk", "point_stats.commerce_value")
        .select(db.raw("ROW_NUMBER() OVER (ORDER BY NVL(commerce_value, 0) DESC) AS rank"))
      query1 = query1.as("T1");

      let query2 = db(query1)
        .leftJoin(`${this.T_COMBINE_LOG} as combine_log`, function() {
          this.on("combine_log.org_user_pk", "T1.eshop_pk")
            .andOn("combine_log.combine_type", ESHOP_COMBINE_TYPE_ID);
        })
        .leftJoin(`${this.T_MERGE_IDS} as merge_ids`, db.raw("NVL(combine_log.target_user_pk, T1.eshop_pk)"), "merge_ids.eshop_pk")
        .leftJoin(`${this.T_USERS} as users`, "merge_ids.pvendor_pk", "users.user_pk")
        .where("users.user_pk", user_pk);
      return await query2.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }
}

module.exports = EshopModel;
