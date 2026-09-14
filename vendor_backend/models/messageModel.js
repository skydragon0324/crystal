const db = require('../db/knex');
const moment = require('moment');
const { FLAG_EXIST, NOTIFICATION_STATUS, ACTION_TYPE, FLAG_TO_ALL, DEFAULT_MAX_LIMIT, THREAD_STATUS, FEEDBACK_THREAD_LAST_TYPE, FEEDBACK_LEVEL, FLAG_NONE } = require('../constants/constants');

class MessageModel {
  static T_THREADS = "ora_pid.feedback_threads";
  static T_MESSAGES = "ora_pid.feedback_messages";
  static T_COMMENTS = "ora_pid.comments";
  static T_BROADCASTS = "ora_pid.broadcast_contents";
  static T_BROADUSERS = "ora_pid.broadcast_users";
  static T_NOTIFICATIONS = "ora_pid.notifications";
  static T_FAQS = "ora_pid.faqs";
  static T_USERS = "ora_pid.users";
  static T_PHONES = "ora_pid.user_phone_numbers";
  static T_MANAGERS = "ora_pid.managers";
  static T_MERGE_IDS = "ora_pid.user_merge_ids";
  static T_LOC = "ora_pid.locations";
  static T_FB_CAT_LOG = "ora_pid.feedback_category_log";
  static T_FB_STATUS_LOG = "ora_pid.feedback_status_log";
  static T_FB_FORWARD_LOG = "ora_pid.feedback_forward_log";

  static async findFeedbackThreads(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, user_pk, category, categories, status, include_deleted, last_type, qc_level, min_at, max_at, is_client, is_deleted, from, to } = filter;

      let filtered_thread_pks = [];
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        const messages = await this.findThreadsByMessage(user_pk, lowerKeyword);
        filtered_thread_pks = messages.map(row => row.thread_pk);
      }

      let query1;
      let query2;
      if (is_client !== 1) {
        query1 = db(`${this.T_FB_STATUS_LOG} as fb_status_log`)
          .where("fb_status_log.status", THREAD_STATUS.RESOLVED)
          .groupBy("fb_status_log.thread_pk")
          .orderBy("fb_status_log.action_at", "desc")
          .select("fb_status_log.thread_pk")
          .select(db.raw("MAX(fb_status_log.action_at) as action_at"));
        query1 = query1.as("T1");

        if (qc_level !== undefined && qc_level !== FEEDBACK_LEVEL.NORMAL) {
          query2 = db(`${this.T_FB_FORWARD_LOG} as forward_log`)
            .where("qc_level", qc_level)
            .select(db.raw("DISTINCT(thread_pk)"));
          query2 = query2.as("T2");
        }
      }

      let query = db(`${this.T_THREADS} as threads`);

      if (is_client !== 1) {
        query = query.leftJoin(`${this.T_USERS} as users`, "threads.user_pk", "users.user_pk")
          .leftJoin(query1, "threads.thread_pk", "T1.thread_pk")
          .leftJoin(`${this.T_FB_STATUS_LOG} as fb_status_log`, function() {
            this.on("T1.thread_pk", "fb_status_log.thread_pk")
              .andOn("T1.action_at", "fb_status_log.action_at")
          })
          .leftJoin(`${this.T_MANAGERS} as managers`, function() {
            this.on("fb_status_log.action_type", ACTION_TYPE.MANAGER)
              .andOn("fb_status_log.action_by", "managers.manager_pk");
          })
          .leftJoin(`${this.T_MANAGERS} as session_admins`, "threads.session_by", "session_admins.manager_pk");
        if (qc_level !== undefined && qc_level !== FEEDBACK_LEVEL.NORMAL) {
          query = query.leftJoin(query2, "threads.thread_pk", "T2.thread_pk")
            .whereNotNull("T2.thread_pk");
        }
        if (include_deleted !== 1) {
          query = query.where("threads.is_deleted", FLAG_EXIST);
        }
        if (last_type !== undefined && last_type !== -1) {
          query = query.where("threads.last_type", last_type);
        }
      }

      if (user_pk) {
        query = query.where("threads.user_pk", user_pk);
      }
      if (category !== undefined && category !== -1 && category !== "") {
        query = query.where("threads.category", category);
      } else if (categories !== undefined && categories.length > 0) {
        query = query.whereIn("threads.category", categories);
      }
      if (status !== undefined && status !== -1 && status !== "") {
        query = query.where("threads.status", status);
      }
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(threads.title)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(threads.last_message)"), "like", `%${lowerKeyword}%`);
          if (is_client !== 1) {
            this.orWhere(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
              .orWhere("users.user_pk", "like", `${lowerKeyword}`);
          }
          if (filtered_thread_pks.length > 0) {
            this.orWhereIn("threads.thread_pk", filtered_thread_pks);
          }
        });
      }
      if (min_at !== undefined && min_at !== "") {
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(threads.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function() {
                this.where("threads.is_deleted", FLAG_EXIST)
                .where(db.raw("TO_CHAR(threads.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
              });
          });
        } else {
          query = query.where("threads.is_deleted", FLAG_EXIST)
            .where(db.raw("TO_CHAR(threads.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (is_deleted !== undefined && is_deleted !== "") {
          query = query.where("threads.is_deleted", is_deleted);
        }

        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(threads.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
        }
      }

      if (from) {
        query = query.where(db.raw("TO_CHAR(threads.created_at, 'YYYY-MM-DD')"), ">=", from);
      }
      if(to) {
        query = query.where(db.raw("TO_CHAR(threads.created_at, 'YYYY-MM-DD')"), "<=", to);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      if (is_client != 1) {
        query = query.select(db.raw("TO_CHAR(threads.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
          .select("threads.thread_source")
          .select("users.user_id", "users.user_name")
          .select("fb_status_log.table_pk as status_log_pk", "fb_status_log.note", "fb_status_log.action_type")
          .select("session_admins.manager_pk AS session_admin_pk", "session_admins.manager_name AS session_admin_name")
          .select("managers.manager_name");
      }
      query = query.select("threads.thread_pk", "threads.user_pk", "threads.title", "threads.category", "threads.last_message", "threads.status", "threads.is_read", "threads.is_deleted")
        .select(db.raw("TO_CHAR(threads.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findThreadsByMessage(user_pk, keyword) {
    try {
      const lowerKeyword = keyword.toLowerCase().trim();
      let query = db(`${this.T_MESSAGES} as messages`)
        .leftJoin(`${this.T_THREADS} as threads`, "messages.thread_pk", "threads.thread_pk")
        .where("messages.message", "like", `%${lowerKeyword}%`);
      if (user_pk) {
        query = query.where("threads.user_pk", user_pk);
      }
      query = query.select(db.raw("DISTINCT(messages.thread_pk)"))
        .limit(DEFAULT_MAX_LIMIT); // max limit
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findFeedbackThreadByPk(thread_pk) {
    try {
      const query = db(this.T_THREADS).where({ thread_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findFeedbackThreadCountByTime(today) {
    try {
      const query = db(this.T_THREADS)
        .where(db.raw("TO_CHAR(created_at, 'YYYY-MM-DD')"), today)
        .select(db.raw("COUNT(1) count"));
      const row = await query.first();
      if (row) {
        return row.count;
      }
      return 0;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findFeedbackThreadCountByStatus(status, today) {
    try {
      const query = db(this.T_THREADS)
        .where(db.raw("TO_CHAR(updated_at, 'YYYY-MM-DD')"), today)
        .where("status", status)
        .select(db.raw("COUNT(1) count"));
      const row = await query.first();
      if (row) {
        return row.count;
      }
      return 0;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findFeedbackThreadCountByUser(user_pk, today) {
    try {
      const query = db(this.T_THREADS)
        .where(db.raw("TO_CHAR(created_at, 'YYYY-MM-DD')"), today)
        .where("user_pk", user_pk)
        .select(db.raw("COUNT(1) count"));
      const row = await query.first();
      if (row) {
        return row.count;
      }
      return 0;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findFeedbackUserInfoByPk(thread_pk) {
    try {
      let query = db(`${this.T_THREADS} as threads`)
        .leftJoin(`${this.T_USERS} as users`, "threads.user_pk", "users.user_pk")
        .leftJoin(`${this.T_LOC} as loc`, "users.location_pk", "loc.location_pk")
        .leftJoin(`${this.T_LOC} as parent_loc`, "loc.parent_code", "parent_loc.location_code")
        .leftJoin(`${this.T_LOC} as grand_loc`, "parent_loc.parent_code", "grand_loc.location_code")
        .leftJoin(`${this.T_MERGE_IDS} as ids`, "users.user_pk", "ids.pvendor_pk");
      
      query = query.where("threads.thread_pk", thread_pk);
      query = query.select("threads.user_pk")
        .select("users.user_id", "users.user_name", "users.gender", "users.job", "users.cid")
        .select(db.raw(db.raw("(EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM users.birthday)) as age")))
        .select(db.raw(`TRIM((grand_loc.location_name || ' ' || parent_loc.location_name || ' ' || loc.location_name)) AS location_full_name`))
        .select("ids.fixed_id", "ids.fixed_status", "ids.appstore_id", "ids.eshop_id", "ids.mass_id");
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findFeedbackSessionByPk(thread_pk) {
    try {
      const query = db(`${this.T_THREADS} as threads`)
        .leftJoin(`${this.T_MANAGERS} as managers`, "threads.session_by", "managers.manager_pk")
        .where("threads.thread_pk", thread_pk)
        .select("threads.user_pk", "threads.title", "threads.category", "threads.status", "threads.session_by as session_admin_pk", "threads.is_deleted", "threads.updated_at")
        .select("managers.manager_name as session_admin_name");
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addFeedbackThread(params) {
    try {
      const now = new Date();
      const query = db(this.T_THREADS)
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

  static async editFeedbackThread(params) {
    try {
      const now = new Date();
      let newParams = params;
      if (!params.updated_at) {
        newParams = { ...params, updated_at: now };
      }
      const rowCount = await db(this.T_THREADS)
        .where("thread_pk", params.thread_pk)
        .update(newParams);

      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async resetFeedbackThreadSession(session_by, thread_pk) {
    try {
      let query = db(this.T_THREADS);
      if (thread_pk) {
        query = query.where("thread_pk", thread_pk);
      } else {
        query = query.where("session_by", session_by);
      }
      query = query.update("session_by", "");

      return await query;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async deleteFeedbackThread(thread_pk) {
    try {
      const count = await db(this.T_THREADS)
        .where("thread_pk", thread_pk)
        .del();
      return count;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }

  static async findFeedbackMessages(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, thread_pk, is_client } = filter;

      let query = db(`${this.T_MESSAGES} as messages`)
        .leftJoin(`${this.T_THREADS} as threads`, "messages.thread_pk", "threads.thread_pk");

      if (is_client !== 1) {
        query = query.leftJoin(`${this.T_MANAGERS} as managers`, function() {
          this.on("messages.action_type", ACTION_TYPE.MANAGER)
            .andOn("messages.action_by", "managers.manager_pk");
        })
        .leftJoin(`${this.T_FB_FORWARD_LOG} as forward_log`, function() {
          this.on("messages.message_pk", "forward_log.message_pk")
            .andOn("messages.action_type", ACTION_TYPE.USER);
        })
        .leftJoin(`${this.T_MANAGERS} as forwarders`, "forward_log.action_by", "forwarders.manager_pk");
      }

      if (thread_pk) {
        query = query.where("messages.thread_pk", thread_pk);
      }
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(messages.message)"), "like", `%${lowerKeyword}%`);
          if (is_client !== 1) {
            this.orWhere(db.raw("LOWER(managers.manager_id)"), "like", `%${lowerKeyword}%`)
              .orWhere(db.raw("LOWER(managers.manager_name)"), "like", `%${lowerKeyword}%`);
          }
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

      if (is_client != 1) {
        query = query.select("messages.action_by")
          .select("managers.manager_id", "managers.manager_name")
          .select("forward_log.table_pk as forward_pk", db.raw("NVL(forward_log.qc_level, 0) qc_level"))
          .select("forwarders.manager_name as forward_admin_name");
      }
      query = query.select("messages.message_pk", "messages.thread_pk", "messages.message", "messages.action_type")
        .select(db.raw("TO_CHAR(messages.action_at, 'YYYY-MM-DD HH24:MI:SS') action_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findFeedbackReplies(filter, isCount = false) {
    try {
      const { offset, limit, sort, category, keyword } = filter;

      let query = db(`${this.T_MESSAGES} as messages`)
        .leftJoin(`${this.T_THREADS} as threads`, "messages.thread_pk", "threads.thread_pk");
      
      query = query.where("messages.action_type", ACTION_TYPE.MANAGER);
      if (category) {
        query = query.where("threads.category", category);
      }
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(messages.message)"), "like", `%${lowerKeyword}%`);
        });
      }

      query = query.groupBy("messages.message");

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      query = query.select(db.raw("MAX(messages.message_pk) message_pk"), "messages.message")
        .select(db.raw("MAX(TO_CHAR(messages.action_at, 'YYYY-MM-DD HH24:MI:SS')) action_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findFeedbackMessageByPk(message_pk) {
    try {
      const query = db(this.T_MESSAGES).where({ message_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findFeedbackMessageCountByThread(thread_pk, today) {
    try {
      const query = db(this.T_MESSAGES)
        .where("thread_pk", thread_pk)
        .where(db.raw("TO_CHAR(action_at, 'YYYY-MM-DD')"), today)
        .where("action_type", ACTION_TYPE.USER)
        .select(db.raw("COUNT(1) count"));
      const row = await query.first();
      if (row) {
        return row.count;
      }
      return 0;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findLastFeedbackMessageByThreadPk(thread_pk) {
    try {
      const query = db(this.T_MESSAGES)
        .where("thread_pk", thread_pk)
        .orderBy("action_at", "desc")
        .first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findFeedbackMsgInfoByPk(message_pk) {
    try {
      const query = db(`${this.T_MESSAGES} as messages`)
        .leftJoin(`${this.T_THREADS} as threads`, "messages.thread_pk", "threads.thread_pk")
        .leftJoin(`${this.T_USERS} as users`, "threads.user_pk", "users.user_pk")
        .where("messages.message_pk", message_pk)
        .select("messages.message_pk", "messages.message")
        .select(db.raw("TO_CHAR(messages.action_at, 'YYYY-MM-DD HH24:MI:SS') as action_at"))
        .select("users.user_id")
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addFeedbackMessage(params) {
    try {
      const now = new Date();
      const query = db(this.T_MESSAGES)
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

  static async addFeedbackMessageWithActionAt(params) {
    try {
      const query = db(this.T_MESSAGES)
        .insert({
          ...params,
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

  static async editFeedbackMessage(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_MESSAGES)
        .where("message_pk", params.message_pk)
        .update({
          ...params,
          action_at: now,
        });

      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async deleteFeedbackMessage(message_pk) {
    try {
      const count = await db(this.T_MESSAGES)
        .where("message_pk", message_pk)
        .del();
      return count;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }

  static async findBroadcasts(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword } = filter;

      let query = db(`${this.T_BROADCASTS} as broadcasts`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(db.raw("LOWER(broadcasts.content)"), "like", `%${lowerKeyword}%`);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      query = query.select("broadcasts.broadcast_pk", "broadcasts.title", "broadcasts.content", "broadcasts.to_all", "broadcasts.is_deleted")
        .select(db.raw("TO_CHAR(broadcasts.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"), db.raw("TO_CHAR(broadcasts.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching manager: " + err.message);
    }
  }

  static async findBroadcastByPk(broadcast_pk) {
    try {
      const query = db(this.T_BROADCASTS).where({ broadcast_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findBroadcastsByUserPk(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, user_pk, is_deleted, min_at, max_at, is_read, is_client } = filter;
      
      if (!user_pk) {
        return isCount ? 0 : [];
      }

      let query = db(`${this.T_BROADCASTS} as broadcasts`)
        .leftJoin(`${this.T_BROADUSERS} as broadusers`, function() {
          this.on("broadcasts.broadcast_pk", "broadusers.broadcast_pk")
            .andOn("broadusers.user_pk", +user_pk);
        });
      query = query.where(function() {
        this.where("broadcasts.to_all", FLAG_TO_ALL)
          .orWhereNotNull("broadusers.user_pk");
      });

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(broadcasts.title)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(broadcasts.content)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (min_at !== undefined && min_at !== "") {
        /** check currently available rows less than min_at */
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(broadcasts.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function() {
                this.where("broadcasts.is_deleted", FLAG_EXIST)
                  .where(function() {
                    this.where("broadusers.is_deleted", FLAG_EXIST)
                      .orWhereNull("broadusers.user_pk");
                  })
                  .where(db.raw("TO_CHAR(broadcasts.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
              });
          });
        } else {
          query = query.where("broadcasts.is_deleted", FLAG_EXIST)
            .where(function() {
              this.where("broadusers.is_deleted", FLAG_EXIST)
                .orWhereNull("broadusers.user_pk");
            })
            .where(db.raw("TO_CHAR(broadcasts.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (is_deleted !== undefined && is_deleted !== "") {
          query = query.where("broadcasts.is_deleted", is_deleted)
            .where(function() {
              this.where("broadusers.is_deleted", is_deleted)
                .orWhereNull("broadusers.user_pk");
            });
        }

        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(broadcasts.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
        }
      }

      if (is_read !== undefined && is_read !== "") {
        query = query.where("broadusers.is_read", is_read);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }
      query = query.orderBy("broadcasts.broadcast_pk", "asc");
      
      query = query.select("broadcasts.broadcast_pk", "broadcasts.title", "broadcasts.content", "broadcasts.to_all", "broadcasts.is_deleted")
        .select(db.raw("TO_CHAR(broadcasts.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"), db.raw("TO_CHAR(broadcasts.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .select("broadusers.is_read", db.raw("NVL(broadusers.is_deleted, 0) as user_deleted"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addBroadcast(params, admin_pk) {
    try {
      const now = new Date();
      const query = db(this.T_BROADCASTS)
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

  static async editBroadcast(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_BROADCASTS)
        .where({ broadcast_pk: params.broadcast_pk })
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

  static async findBroadUsers(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, broadcast_pk } = filter;

      let query = db(`${this.T_BROADUSERS} as broadusers`)
        .leftJoin(`${this.T_USERS} as users`, "broadusers.user_pk", "users.user_pk");

      query = query.where("broadusers.is_deleted", FLAG_NONE);
      if (broadcast_pk) {
        query = query.where("broadusers.broadcast_pk", broadcast_pk);
      }

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`);
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

      query = query.select("broadusers.table_pk", "broadusers.broadcast_pk", "broadusers.user_pk", "broadusers.is_read", "broadusers.created_at")
        .select("users.user_id")
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching manager: " + err.message);
    }
  }

  static async findBroadUsersByBroadcastPk(broadcast_pk) {
    try {
      const query = db(this.T_BROADUSERS)
        .where({ broadcast_pk })
        .select("user_pk", "is_deleted");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addBroadUsers(params) {
    try {
      const query = db(this.T_BROADUSERS)
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

  static async editBroadUser(params) {
    try {
      const rowCount = await db(this.T_BROADUSERS)
        .where({ broadcast_pk: params.broadcast_pk, user_pk: params.user_pk })
        .update({
          ...params,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async editBroadUsersByBroadcastPkAndUserPks(broadcast_pk, user_pks, is_deleted) {
    try {
      const rowCount = await db(this.T_BROADUSERS)
        .where("broadcast_pk", broadcast_pk)
        .whereIn("user_pk", user_pks)
        .update("is_deleted", is_deleted);
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async deleteBroadUsersByBroadcastPkAndUserPks(broadcast_pk, user_pks) {
    try {
      const rowCount = await db(this.T_BROADUSERS)
        .where({ broadcast_pk })
        .whereIn("user_pk", user_pks)
        .del();

      return rowCount;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }

  static async findNotifications(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, status, is_deleted, is_now, min_at, max_at, is_client } = filter;

      let query = db(`${this.T_NOTIFICATIONS} as notifications`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(notifications.title)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(notifications.cleaned_content)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (min_at !== undefined && min_at !== "") {
        /** check currently available rows less than min_at */
        const now = moment().format("YYYY-MM-DD");
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(notifications.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function() {
                this.where("notifications.status", NOTIFICATION_STATUS.SHOW)
                  .where("notifications.is_deleted", FLAG_EXIST)
                  .where(db.raw("TO_CHAR(notifications.start_date, 'YYYY-MM-DD')"), "<=", now)
                  .where(db.raw("TO_CHAR(notifications.end_date, 'YYYY-MM-DD')"), ">=", now)
                  .where(db.raw("TO_CHAR(notifications.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
              });
          });
        } else {
          query = query.where("notifications.status", NOTIFICATION_STATUS.SHOW)
            .where("notifications.is_deleted", FLAG_EXIST)
            .where(db.raw("TO_CHAR(notifications.start_date, 'YYYY-MM-DD')"), "<=", now)
            .where(db.raw("TO_CHAR(notifications.end_date, 'YYYY-MM-DD')"), ">=", now)
            .where(db.raw("TO_CHAR(notifications.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (status !== undefined && status !== "") {
          query = query.where("notifications.status", status);
        }

        if (is_deleted !== undefined && is_deleted !== "") {
          query = query.where("notifications.is_deleted", is_deleted);
        }

        if (is_now === 1) {
          const now = moment().format("YYYY-MM-DD");
          query = query.where(db.raw("TO_CHAR(notifications.start_date, 'YYYY-MM-DD')"), "<=", now)
            .where(db.raw("TO_CHAR(notifications.end_date, 'YYYY-MM-DD')"), ">=", now);
        }

        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(notifications.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
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
      query = query.orderBy("notifications.notification_pk", "desc");

      if (is_client === 1) {
        query = query.select(db.raw("REPLACE(notifications.content, '<p></p>', '<br />') content"));
      } else {
        query = query.select("notifications.content");
      }
      query = query
        .select("notifications.notification_pk", "notifications.title", "notifications.image_url", "notifications.status", "notifications.category", "notifications.goto", "notifications.is_popular", "notifications.position", "notifications.is_deleted")
        .select(db.raw("TO_CHAR(notifications.start_date, 'YYYY-MM-DD') start_date"), db.raw("TO_CHAR(notifications.end_date, 'YYYY-MM-DD') end_date"), db.raw("TO_CHAR(notifications.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"), db.raw("TO_CHAR(notifications.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findNotificationByPk(notification_pk) {
    try {
      const query = db(this.T_NOTIFICATIONS).where({ notification_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addNotification(params, admin_pk) {
    try {
      const now = new Date();
      const query = db(this.T_NOTIFICATIONS)
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

  static async editNotification(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_NOTIFICATIONS)
        .where({ notification_pk: params.notification_pk })
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

  static async findAllFaqs(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, category, is_deleted, min_at, max_at, is_client } = filter;

      let query = db(`${this.T_FAQS} as faqs`);

      if (category) {
        query = query.where("faqs.category", category);
      }
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(faqs.question)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(faqs.answer)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (min_at !== undefined && min_at !== "") {
        /** check currently available rows less than min_at */
        if (max_at !== undefined && max_at !== "") {
          query = query.where(function() {
            this.where(db.raw("TO_CHAR(faqs.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
              .orWhere(function() {
                this.where("faqs.is_deleted", FLAG_EXIST)
                .where(db.raw("TO_CHAR(faqs.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
              });
          });
        } else {
          query = query.where("faqs.is_deleted", FLAG_EXIST)
            .where(db.raw("TO_CHAR(faqs.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), "<", min_at);
        }
      } else {
        if (is_deleted !== undefined && is_deleted !== "") {
          query = query.where("faqs.is_deleted", is_deleted);
        }

        if (max_at !== undefined && max_at != "") {
          query = query.where(db.raw("TO_CHAR(faqs.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
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
        query = query.select(db.raw("REPLACE(faqs.answer, '<p></p>', '<br />') answer"));
      } else {
        query = query.select("faqs.answer");
      }

      query = query
        .select("faqs.faq_pk", "faqs.category", "faqs.question", "faqs.position", "faqs.is_deleted")
        .select(db.raw("TO_CHAR(faqs.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"), db.raw("TO_CHAR(faqs.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findFaqByPk(faq_pk) {
    try {
      const query = db(this.T_FAQS).where({ faq_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addFaq(params, admin_pk) {
    try {
      const now = new Date();
      const query = db(this.T_FAQS)
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

  static async editFaq(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_FAQS)
        .where({ faq_pk: params.faq_pk })
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

  static async findFeedbackCategoryLogs(thread_pk, limit) {
    try {
      let query = db(`${this.T_FB_CAT_LOG} as fb_cat_log`)
        .leftJoin(`${this.T_MANAGERS} as managers`, "fb_cat_log.action_by", "managers.manager_pk")
        .where("fb_cat_log.thread_pk", thread_pk)
        .orderBy("fb_cat_log.action_at", "desc");

      if (limit) {
        query = query.limit(limit);
      }

      query = query.select("fb_cat_log.category")
        .select(db.raw("TO_CHAR(fb_cat_log.action_at, 'YYYY-MM-DD HH24:MI:SS') action_at"))
        .select("managers.manager_name");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addFeedbackCategoryLog(params) {
    try {
      const now = new Date();
      const query = db(this.T_FB_CAT_LOG)
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

  static async findFeedbackStatusLogs(thread_pk, limit) {
    try {
      let query = db(`${this.T_FB_STATUS_LOG} as fb_status_log`)
        .leftJoin(`${this.T_MANAGERS} as managers`, function() {
          this.on("fb_status_log.action_type", ACTION_TYPE.MANAGER)
            .andOn("fb_status_log.action_by", "managers.manager_pk");
        })
        .where("fb_status_log.thread_pk", thread_pk)
        .orderBy("fb_status_log.action_at", "desc");

      if (limit) {
        query = query.limit(limit);
      }

      query = query.select("fb_status_log.status", "fb_status_log.action_type", "fb_status_log.note")
        .select(db.raw("TO_CHAR(fb_status_log.action_at, 'YYYY-MM-DD HH24:MI:SS') action_at"))
        .select("managers.manager_name");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addFeedbackStatusLog(params) {
    try {
      const now = new Date();
      const query = db(this.T_FB_STATUS_LOG)
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

  static async findFeedbackForwardLogByPk(table_pk) {
    try {
      const query = db(this.T_FB_FORWARD_LOG)
        .where("table_pk", table_pk);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findFeedbackForwardLogByMessagePk(message_pk) {
    try {
      const query = db(this.T_FB_FORWARD_LOG)
        .where("message_pk", message_pk);
      return await query.first();
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addFeedbackForwardLog(params, admin_pk) {
    try {
      const now = new Date();
      const query = db(this.T_FB_FORWARD_LOG)
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

  static async editFeedbackForwardLog(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_FB_FORWARD_LOG)
        .where("table_pk", params.table_pk)
        .update({
          ...params,
          action_at: now,
          action_by: admin_pk,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async deleteFeedbackForwardLog(table_pk) {
    try {
      const count = await db(this.T_FB_FORWARD_LOG)
        .where("table_pk", table_pk)
        .del();
      return count;
    } catch (err) {
      throw new Error("Error deleting row: " + err.message);
    }
  }
}

module.exports = MessageModel;
