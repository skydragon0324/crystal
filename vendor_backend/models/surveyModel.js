const db = require('../db/knex');
const moment = require('moment');
const { getLangText } = require('../lang/lang');
const { FLAG_EXIST, DEFAULT_MAX_LIMIT } = require('../constants/constants');

class SurveyModel {
  static T_SURVEYS = "ora_pid.surveys";
  static T_QUESTIONS = "ora_pid.survey_questions";
  static T_CHOICES = "ora_pid.survey_choices";
  static T_RESPONSES = "ora_pid.survey_responses";
  static T_USERS = "ora_pid.users";
  static T_MANAGERS = "ora_pid.managers";
  static T_LOCATIONS = "ora_pid.locations";
  static T_WOMEN_STATS = "ora_pid.premium_women_survey_stats";
  
  static async findAllSurveys(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, category, categories } = filter;

      let filtered_survey_pks = [];
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        const questions = await SurveyModel.findQuestionsByKeyword(lowerKeyword);
        filtered_survey_pks = questions.map(row => row.survey_pk);
      }

      let query = db(`${this.T_SURVEYS} as surveys`);

      if (category !== undefined && category !== -1) {
        query = query.where("surveys.survey_category", category);
      } else if (categories !== undefined && categories.length > 0) {
        query = query.whereIn("surveys.survey_category", categories);
      }

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(surveys.survey_name)"), "like", `%${lowerKeyword}%`);
          if (filtered_survey_pks.length > 0) {
            this.orWhereIn("surveys.survey_pk", filtered_survey_pks);
          }
        });
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(`surveys.${sort.key}`, sort.dir);
      }
      query = query.orderBy("surveys.survey_pk", "asc");

      query = query
        .select("surveys.survey_pk", "surveys.survey_name", "survey_category", "surveys.position", "surveys.is_deleted")
        .select(db.raw("TO_CHAR(surveys.start_date, 'YYYY-MM-DD') start_date"), db.raw("TO_CHAR(surveys.end_date, 'YYYY-MM-DD') end_date"), db.raw("TO_CHAR(surveys.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      const rows = await query;

      const survey_pks = rows.map(row => row.survey_pk);
      const questions = await SurveyModel.findQuestionsInSurveyPks(survey_pks, keyword);

      const result = rows.map(item => ({
        ...item,
        questions: questions.filter(question => question.survey_pk === item.survey_pk),
      }));

      return result;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findSurveyByPk(survey_pk) {
    try {
      const query = db(this.T_SURVEYS).where({ survey_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addSurvey(params, admin_pk) {
    try {
      const now = new Date();
      const query = db(this.T_SURVEYS)
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

  static async editSurvey(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_SURVEYS)
        .where({ survey_pk: params.survey_pk })
        .update({
          ...params,
          updated_at: now,
          updated_by: admin_pk,
        });
      
      await db(this.T_QUESTIONS)
        .where({ survey_pk: params.survey_pk })
        .update({
          updated_at: now,
          updated_by: admin_pk,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async findQuestionsBySurveyPk(filter, isCount = false) {
    const { offset, limit, sort, survey_pk, keyword } = filter;
    if (!survey_pk || survey_pk === 0) {
      return isCount ? 0 : [];
    }

    try {
      let query = db(`${this.T_QUESTIONS} as questions`)
        .where("questions.survey_pk", survey_pk);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(questions.question_text)"), "like", `%${lowerKeyword}%`);
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
        .select("questions.question_pk", "questions.question_text", "questions.question_type", "questions.position", "questions.publish_num", "questions.is_deleted as question_deleted")
        .select(db.raw("TO_CHAR(questions.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"))
        // .select("choices.choice_pk", "choices.choice_text", "choices.is_deleted as choice_deleted")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      const rows = await query;

      const question_pks = rows.map(row => row.question_pk);
      const choices = await this.findChoicesInQuestionPks(question_pks);

      const result = rows.map(row => ({
        ...row,
        choices: choices.filter(choice => choice.question_pk === row.question_pk),
      }));

      return result;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findQuestionsWithResponses(filter, isCount = false) {
    const { offset, limit, keyword, user_pk, is_deleted, is_now } = filter;

    if (!user_pk) {
      return isCount ? 0 : [];
    }

    try {
      let query = db(`${this.T_QUESTIONS} as questions`)
        .leftJoin(`${this.T_RESPONSES} as responses`, function() {
          this.on("questions.question_pk", "responses.question_pk")
            .andOn("responses.user_pk", user_pk);
        })
        .leftJoin(`${this.T_CHOICES} as choices`, "responses.choice_pk", "choices.choice_pk")
        .leftJoin(`${this.T_SURVEYS} as surveys`, "questions.survey_pk", "surveys.survey_pk");

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(responses.response_text)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(questions.question_text)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(choices.choice_text)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("questions.is_deleted", is_deleted)
          .where("surveys.is_deleted", is_deleted);
      }
      if (is_now === 1) {
        const now = moment().format("YYYY-MM-DD");
        query = query.where(db.raw("TO_CHAR(surveys.start_date, 'YYYY-MM-DD')"), "<=", now)
          .where(db.raw("TO_CHAR(surveys.end_date, 'YYYY-MM-DD')"), ">=", now);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query = query.orderBy("surveys.position", "asc")
        .orderBy("questions.position", "asc");

      query = query
        .select("questions.question_pk", "questions.survey_pk", "questions.question_text", "questions.question_type")
        .select("responses.response_pk", "responses.choice_pk", "responses.response_text", "responses.action_at")
        .select("choices.choice_text")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findQuestionsWithSurveys(filter, isCount = false) {
    const { offset, limit, is_deleted, is_now, max_at, is_client } = filter;

    try {
      let query = db(`${this.T_QUESTIONS} as questions`)
        .leftJoin(`${this.T_SURVEYS} as surveys`, "questions.survey_pk", "surveys.survey_pk");
      
      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("questions.is_deleted", is_deleted)
          .where("surveys.is_deleted", is_deleted);
      }

      const today = moment().format("YYYY-MM-DD");
      if (is_now === 1) {
        query = query.where(db.raw("TO_CHAR(surveys.end_date, 'YYYY-MM-DD')"), ">=", today);
      }

      if (max_at !== undefined && max_at != "") {
        query = query.where(db.raw("TO_CHAR(questions.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query = query.orderBy("surveys.position", "asc")
        .orderBy("questions.position", "asc")
        .orderBy("questions.question_pk", "asc");

      if (is_client === 1) {
        query = query.select(db.raw("TO_CHAR(surveys.start_date, 'YYYY-MM-DD') start_date"), db.raw("TO_CHAR(surveys.end_date, 'YYYY-MM-DD') end_date"))
          .select(db.raw("TO_CHAR(questions.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      } else {
        query = query.select("surveys.start_date", "surveys.end_date");
      }
      query = query.select("questions.question_pk", "questions.question_text", "questions.question_type", db.raw("questions.position question_position"), db.raw("questions.is_deleted question_deleted"), "questions.publish_num")
        .select(db.raw("surveys.position survey_position"), db.raw("surveys.is_deleted survey_deleted"))
        .offset(offset);
      
      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findQuestionsInPeriod(filter) {
    const { start_date, end_date, is_deleted } = filter;
    try {
      let query = db(`${this.T_QUESTIONS} as questions`)
        .leftJoin(`${this.T_SURVEYS} as surveys`, "questions.survey_pk", "surveys.survey_pk");
      
      query = query.where(db.raw("TO_CHAR(surveys.start_date, 'YYYY-MM-DD')"), ">=", start_date)
        .where(db.raw("TO_CHAR(surveys.end_date, 'YYYY-MM-DD')"), "<=", end_date);
      
      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("questions.is_deleted", is_deleted);
      }
      
      query = query.select("questions.question_pk", "questions.question_text", "questions.question_type", db.raw("questions.position question_position"), db.raw("questions.is_deleted question_deleted"), "questions.publish_num")
        .select(db.raw("TO_CHAR(questions.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .select(db.raw("surveys.position survey_position"), db.raw("surveys.is_deleted survey_deleted"))
        .select(db.raw("TO_CHAR(surveys.start_date, 'YYYY-MM-DD') start_date"), db.raw("TO_CHAR(surveys.end_date, 'YYYY-MM-DD') end_date"));

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findQuestionByPk(question_pk) {
    try {
      const query = db(this.T_QUESTIONS).where({ question_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findActiveQuestions(user_pk) {
    try {
      let query = db(`${this.T_QUESTIONS} as questions`)
        .leftJoin(`${this.T_SURVEYS} as surveys`, "questions.survey_pk", "surveys.survey_pk");

      if (user_pk) {
        query = query.leftJoin(`${this.T_RESPONSES} as responses`, "questions.question_pk", "responses.question_pk");
      }

      const now = moment().format("YYYY-MM-DD");
      query = query.where("questions.is_deleted", FLAG_EXIST)
        .where("surveys.is_deleted", FLAG_EXIST)
        .where(db.raw("TO_CHAR(surveys.start_date, 'YYYY-MM-DD')"), "<=", now)
        .where(db.raw("TO_CHAR(surveys.end_date, 'YYYY-MM-DD')"), ">=", now);

      if (user_pk) {
        query = query.where("responses.user_pk", user_pk);
      }

      query = query.select(db.raw("DISTINCT(questions.question_pk)"));

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findQuestionsInSurveyPks(survey_pks, keyword) {
    try {
      let query = db(this.T_QUESTIONS)
        .whereIn("survey_pk", survey_pks)
        .where("is_deleted", FLAG_EXIST);
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(db.raw("LOWER(question_text)"), "like", `%${lowerKeyword}%`);
      }
      query = query.orderBy("position", "asc")
        .select("question_pk", "survey_pk", "question_text", "question_type");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findQuestionsByKeyword(keyword) {
    try {
      let query = db(`${this.T_QUESTIONS} as questions`)
        .where("questions.question_text", "like", `%${keyword}%`);
      query = query.select(db.raw("DISTINCT(questions.survey_pk)"))
        .limit(DEFAULT_MAX_LIMIT);
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addQuestion(params, admin_pk) {
    try {
      const now = new Date();
      const query = db(this.T_QUESTIONS)
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

  static async editQuestion(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_QUESTIONS)
        .where({ question_pk: params.question_pk })
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
  
  static async findChoicesByQuestionPk(filter, isCount = false) {
    try {
      const { offset, limit, sort, question_pk, keyword } = filter;
      if (!question_pk || question_pk === 0) {
        return isCount ? 0 : [];
      }

      let query = db(`${this.T_CHOICES} as choices`)
        .where("choices.question_pk", question_pk);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(choices.choice_text)"), "like", `%${lowerKeyword}%`);
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
        .select("choices.choice_pk", "choices.choice_text", "choices.position", "choices.is_deleted")
        .select(db.raw("TO_CHAR(choices.created_at, 'YYYY-MM-DD HH24:MI:SS') created_at"), db.raw("TO_CHAR(choices.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findChoicesInQuestionPks(question_pks) {
    try {
      const query = db(this.T_CHOICES)
        .whereIn("question_pk", question_pks)
        .where("is_deleted", FLAG_EXIST)
        .orderBy("position", "asc")
        .select("choice_pk", "question_pk", "choice_text", "position")
        .select(db.raw("TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findChoicesInPeriod(filter) {
    const { start_date, end_date } = filter;
    try {
      let query = db(`${this.T_CHOICES} as choices`)
        .leftJoin(`${this.T_QUESTIONS} as questions`, "choices.question_pk", "questions.question_pk")
        .leftJoin(`${this.T_SURVEYS} as surveys`, "questions.survey_pk", "surveys.survey_pk")
        .where(db.raw("TO_CHAR(surveys.start_date, 'YYYY-MM-DD')"), ">=", start_date)
        .where(db.raw("TO_CHAR(surveys.end_date, 'YYYY-MM-DD')"), "<=", end_date)
        .where("choices.is_deleted", FLAG_EXIST)
        .orderBy("choices.position", "asc")
        .select("choices.choice_pk", "choices.question_pk", "choices.choice_text", "choices.position")
        .select(db.raw("TO_CHAR(choices.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findChoiceByPk(choice_pk) {
    try {
      const query = db(this.T_CHOICES).where({ choice_pk }).first();
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findChoicesForNow() {
    try {
      let query = db(`${this.T_CHOICES} as choices`)
        .leftJoin(`${this.T_QUESTIONS} as questions`, "choices.question_pk", "questions.question_pk")
        .leftJoin(`${this.T_SURVEYS} as surveys`, "questions.survey_pk", "surveys.survey_pk");

      query = query.where("questions.is_deleted", FLAG_EXIST)
        .where("choices.is_deleted", FLAG_EXIST);

      const today = moment().format("YYYY-MM-DD");
      query = query.where(db.raw("TO_CHAR(surveys.start_date, 'YYYY-MM-DD')"), "<=", today)
          .where(db.raw("TO_CHAR(surveys.end_date, 'YYYY-MM-DD')"), ">=", today);

      query = query.select("choices.choice_pk", "choices.question_pk", "choices.choice_text", "choices.position")
        .select(db.raw("TO_CHAR(choices.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"));

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findValidChoicesByPks(question_pk, choice_pks) {
    try {
      const query = db(this.T_CHOICES)
        .where("question_pk", question_pk)
        .whereIn("choice_pk", choice_pks)
        .select("choice_pk");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addChoice(params, admin_pk) {
    try {
      const now = new Date();
      const query = db(this.T_CHOICES)
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

  static async editChoice(params, admin_pk) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_CHOICES)
        .where({ choice_pk: params.choice_pk })
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

  static async findAllResponses(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, survey_pk, user_pk } = filter;

      let query = db(`${this.T_RESPONSES} as responses`)
        .leftJoin(`${this.T_USERS} as users`, "responses.user_pk", "users.user_pk")
        .leftJoin(`${this.T_QUESTIONS} as questions`, "responses.question_pk", "questions.question_pk")
        .leftJoin(`${this.T_CHOICES} as choices`, "responses.choice_pk", "choices.choice_pk")
        .leftJoin(`${this.T_SURVEYS} as surveys`, "questions.survey_pk", "surveys.survey_pk");

      if (survey_pk) {
        query = query.where("questions.survey_pk", survey_pk);
      }
      if (user_pk) {
        query = query.where("responses.user_pk", user_pk);
      }

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(responses.response_text)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_id)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(users.user_name)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(questions.question_text)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(choices.choice_text)"), "like", `%${lowerKeyword}%`);
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
        .select("responses.response_pk", "responses.user_pk", "responses.question_pk", "responses.choice_pk", "responses.response_text")
        .select(db.raw("TO_CHAR(responses.action_at, 'YYYY-MM-DD HH24:MI:SS') action_at"))
        .select("users.user_id", "users.user_name")
        .select("questions.question_text", "questions.question_type")
        .select("choices.choice_text")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findResponsesForNow(user_pk, isCount = false) {
    try {
      let query = db(`${this.T_RESPONSES} as responses`)
        .leftJoin(`${this.T_QUESTIONS} as questions`, "responses.question_pk", "questions.question_pk")
        .leftJoin(`${this.T_SURVEYS} as surveys`, "questions.survey_pk", "surveys.survey_pk");

      if (user_pk) {
        query = query.where("responses.user_pk", user_pk);
      }

      const now = moment().format("YYYY-MM-DD");
      query = query.where(db.raw("TO_CHAR(surveys.start_date, 'YYYY-MM-DD')"), "<=", now)
          .where(db.raw("TO_CHAR(surveys.end_date, 'YYYY-MM-DD')"), ">=", now);

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query = query.select("responses.response_pk", "responses.user_pk", "responses.question_pk", "responses.choice_pk", "responses.response_text")
        .select(db.raw("TO_CHAR(responses.action_at, 'YYYY-MM-DD HH24:MI:SS') action_at"));

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findResponseByFilter(filter) {
    const { user_pk, question_pk } = filter;
    try {
      let query = db(`${this.T_RESPONSES} as responses`);

      if (user_pk) {
        query = query.where("responses.user_pk", user_pk);
      }

      if (question_pk) {
        query = query.where("responses.question_pk", question_pk);
      }

      query = query.select("responses.response_pk");
      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findResponsesInQuestionPks(user_pk, question_pks) {
    try {
      const query = db(this.T_RESPONSES)
        .where("user_pk", user_pk)
        .whereIn("question_pk", question_pks)
        .orderBy("action_at", "asc")
        .select("response_pk", "user_pk", "question_pk", "choice_pk", "response_text")
        .select(db.raw("TO_CHAR(action_at, 'YYYY-MM-DD HH24:MI:SS') action_at"));
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async findResponsesInPeriod(user_pk, filter) {
    const { start_date, end_date } = filter;
    try {
      let query = db(`${this.T_RESPONSES} as responses`)
        .leftJoin(`${this.T_QUESTIONS} as questions`, "responses.question_pk", "questions.question_pk")
        .leftJoin(`${this.T_SURVEYS} as surveys`, "questions.survey_pk", "surveys.survey_pk")
        .where("responses.user_pk", user_pk)
        .where(db.raw("TO_CHAR(surveys.start_date, 'YYYY-MM-DD')"), ">=", start_date)
        .where(db.raw("TO_CHAR(surveys.end_date, 'YYYY-MM-DD')"), "<=", end_date)
        .orderBy("responses.action_at", "asc")
        .select("responses.response_pk", "responses.user_pk", "responses.question_pk", "responses.choice_pk", "responses.response_text")
        .select(db.raw("TO_CHAR(responses.action_at, 'YYYY-MM-DD HH24:MI:SS') action_at"));

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findResponseStatisticsByUser(filter) {
    const { question_pk, category, parent_location_code } = filter;
    if (!["gender", "age", "job", "location"].includes(category)) {
      return [];
    }

    try {
      let query = db(`${this.T_RESPONSES} as responses`)
        .leftJoin(`${this.T_CHOICES} as choices`, "responses.choice_pk", "choices.choice_pk")
        .leftJoin(`${this.T_USERS} as users`, "responses.user_pk", "users.user_pk");
      if (category === "location") {
        query = query.leftJoin(`${this.T_LOCATIONS} as loc`, "users.location_pk", "loc.location_pk");
        if (parent_location_code) {
          query = query.leftJoin(`${this.T_LOCATIONS} as parent_loc`, "parent_loc.location_code", db.raw("TO_NUMBER(SUBSTR(loc.location_code, LENGTH(loc.location_code)-3, 4))"));
        } else {
          query = query.leftJoin(`${this.T_LOCATIONS} as parent_loc`, "parent_loc.location_code", db.raw("TO_NUMBER(SUBSTR(loc.location_code, LENGTH(loc.location_code)-1, 2))"));
        }
      }

      if (question_pk) {
        query = query.where("responses.question_pk", question_pk);
      }

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
        if (parent_location_code) {
          query = query.where("loc.location_code", "like", `%${parent_location_code}`);
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

  static async findResponseStatisticsByAnswer(filter) {
    const { question_pk, gender, age, parent_location_code, job, is_client } = filter;

    try {
      let query = db(`${this.T_RESPONSES} as responses`)
        .leftJoin(`${this.T_CHOICES} as choices`, "responses.choice_pk", "choices.choice_pk")
        .leftJoin(`${this.T_USERS} as users`, "responses.user_pk", "users.user_pk");
      if (parent_location_code) {
        query = query.leftJoin(`${this.T_LOCATIONS} as loc`, "users.location_pk", "loc.location_pk");
      }

      if (question_pk) {
        query = query.where("responses.question_pk", question_pk);
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

      if (is_client) {
        query = query.where("choices.is_deleted", FLAG_EXIST);
      }

      query = query.groupBy("choices.choice_text")
        .orderBy(db.raw("MAX(position)"), "asc")
        .select(db.raw("choices.choice_text as field"))
        .select(db.raw("COUNT(1) count"));

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findResponsorCountByAnswer(filter) {
    const { question_pk, gender, age, parent_location_code, job } = filter;

    try {
      let query = db(`${this.T_RESPONSES} as responses`)
        .leftJoin(`${this.T_USERS} as users`, "responses.user_pk", "users.user_pk");
      if (parent_location_code) {
        query = query.leftJoin(`${this.T_LOCATIONS} as loc`, "users.location_pk", "loc.location_pk");
      }

      if (question_pk) {
        query = query.where("responses.question_pk", question_pk);
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

      query = query.select(db.raw("COUNT(DISTINCT(responses.user_pk)) as total"));
      const totalCount = await query.first();
      return totalCount.total;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findResponsorCountInQuestionPks(question_pks) {
    try {
      let query = db(`${this.T_RESPONSES} as responses`)
        .whereIn("question_pk", question_pks)
        .groupBy("choice_pk")
        .groupBy("question_pk")
        .orderBy("question_pk", "asc")
        .orderBy("count", "asc")
        .select("choice_pk", "question_pk")
        .select(db.raw("COUNT(1) count"));

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async addResponses(user_pk, question_pk, choice_pks) {
    try {
      const now = new Date();
      let rows = [];
      choice_pks.map(choice_pk => rows = [...rows, {
        user_pk,
        question_pk,
        choice_pk,
        action_at: now,
      }]);

      const query = db(this.T_RESPONSES)
        .insert(rows)
        .returning("*");

      const result = await query;
      
      if (!result || result.length === 0) {
        throw new Error("Fail to add a new row");
      }
  
      return result;
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async findWomenSurveyRespRank(offset, limit, filter, isCount = false) {
    try {
      const { keyword } = filter;

      let query1 = db(`${this.T_RESPONSES} as responses`)
        .leftJoin(`${this.T_WOMEN_STATS} as women_stats`, function() {
          this.on("responses.choice_pk", "women_stats.choice_pk")
            .andOn("responses.question_pk", "women_stats.question_pk");
        })
        .whereNotNull("women_stats.question_pk")
        .groupBy("responses.user_pk")
        .select("responses.user_pk")
        .select(db.raw("SUM(women_stats.points) points"))
        .select(db.raw("MAX(responses.action_at) last_at"))
        .select(db.raw("ROW_NUMBER() OVER (ORDER BY NVL(SUM(women_stats.points), 0) DESC, MAX(responses.action_at) ASC) as rank"));
      query1 = query1.as("T_STATS");
      
      let query = db(`${this.T_USERS} as users`)
        .leftJoin(query1, "users.user_pk", "T_STATS.user_pk");
      
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

      query = query.orderBy(db.raw("NVL(T_STATS.points, 0)"), "desc")
        .orderBy("T_STATS.last_at", "asc");
      
      query = query.select("users.user_pk", "users.user_id", "users.user_name")
        .select("T_STATS.rank")
        .select(db.raw("NVL(T_STATS.points, 0) points"))
        .select(db.raw("TO_CHAR(T_STATS.last_at, 'YYYY-MM-DD HH24:MI:SS') last_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findWomenSurveyRespDetail(offset, limit, filter, isCount = false) {
    try {
      const { user_pk, keyword } = filter;

      let query = db(`${this.T_RESPONSES} as responses`)
        .leftJoin(`${this.T_WOMEN_STATS} as women_stats`, function() {
          this.on("responses.choice_pk", "women_stats.choice_pk")
            .andOn("responses.question_pk", "women_stats.question_pk");
        })
        .leftJoin(`${this.T_CHOICES} as choices`, "responses.choice_pk", "choices.choice_pk")
        .leftJoin(`${this.T_QUESTIONS} as questions`, "responses.question_pk", "questions.question_pk")
        .leftJoin(`${this.T_SURVEYS} as surveys`, "questions.survey_pk", "surveys.survey_pk");
      
      query = query.whereNotNull("women_stats.choice_pk")
        .where("responses.user_pk", user_pk);
      
      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(questions.question_text)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(choices.choice_text)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      query = query.orderBy("surveys.position", "asc")
        .orderBy("questions.position", "asc");
      
      query = query.select("responses.response_pk")
        .select("questions.question_text")
        .select("choices.choice_text")
        .select("women_stats.points")
        .select(db.raw("TO_CHAR(responses.action_at, 'YYYY-MM-DD HH24:MI:SS') action_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async addWomenSurveyStats(rows) {
    try {
      const query = db(this.T_WOMEN_STATS)
        .insert(rows)
        .returning("*");

      const result = await query;
      
      if (!result || result.length === 0) {
        throw new Error("Fail to add a new row");
      }
  
      return result;
    } catch (err) {
      throw new Error("Error adding row: " + err.message);
    }
  }

  static async deleteWomenSurveyStats(filter) {
    try {
      let query = db(this.T_WOMEN_STATS);
      if (filter) {
        query = query.where(filter);
      }
      query = query.del();

      return await query;
    } catch (err) {
      throw new Error("Error deleting rows: " + err.message);
    }
  }
}

module.exports = SurveyModel;
