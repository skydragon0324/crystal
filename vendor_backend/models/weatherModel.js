const { WEATHER_STATION_ORDER_NONE, FLAG_EXIST } = require('../constants/constants');
const db = require('../db/knex');

class WeatherModel {
  static T_STATIONS = "ora_pid.weather_stations";
  static T_WEATHER_CURRENT = "ora_pid.weather_current";
  static T_WEATHER_SHORT = "ora_pid.weather_short";

  static async findWeatherStations(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, max_at, is_deleted, type } = filter;

      let query = db(`${this.T_STATIONS} as stations`);

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(stations.area_code)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(stations.area_name)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (is_deleted !== undefined && is_deleted !== "") {
        query = query.where("stations.is_deleted", is_deleted);
      }

      if (max_at !== undefined && max_at != "") {
        query = query.where(db.raw("TO_CHAR(stations.updated_at, 'YYYY-MM-DD HH24:MI:SS')"), ">", max_at)
      }

      if (type === 1) {
        query = query.whereNot("stations.current_order", WEATHER_STATION_ORDER_NONE);
      } else if (type === 2) {
        query = query.whereNot("stations.short_order", WEATHER_STATION_ORDER_NONE);
      } else if (type === 3) {
        query = query.whereNot("stations.middle_order", WEATHER_STATION_ORDER_NONE);
      } else if (type === 4) {
        query = query.where(function() {
          this.whereNot("stations.current_order", WEATHER_STATION_ORDER_NONE)
            .orWhereNot("stations.short_order", WEATHER_STATION_ORDER_NONE)
            .orWhereNot("stations.middle_order", WEATHER_STATION_ORDER_NONE);
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

      query = query.select("stations.area_code", "stations.area_name", "stations.current_order", "stations.short_order", "stations.middle_order", "stations.is_deleted")
        .select(db.raw("TO_CHAR(stations.updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findWeatherStationByCode(area_code) {
    try {
      const query = db(`${this.T_STATIONS} as stations`)
        .where("stations.is_deleted", FLAG_EXIST)
        .where("stations.area_code", area_code);

      return await query.first();
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findWeatherStationByName(area_name) {
    try {
      const query = db(`${this.T_STATIONS} as stations`)
        .where("stations.is_deleted", FLAG_EXIST)
        .where("stations.area_name", area_name);

      return await query.first();
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findWeatherStationsInCodes(area_codes) {
    try {
      const query = db(this.T_STATIONS)
        .whereIn("area_code", area_codes)
        .where("is_deleted", FLAG_EXIST)
        .select("area_code", "area_name");
      return await query;
    } catch (err) {
      throw new Error("Error fetching row: " + err.message);
    }
  }

  static async addWeatherStation(params) {
    try {
      const now = new Date();
      const query = db(this.T_STATIONS)
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

  static async addWeatherStations(params) {
    try {
      const query = db(this.T_STATIONS)
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

  static async editWeatherStation(params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_STATIONS)
        .where("area_code", params.area_code)
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing row: " + err.message);
    }
  }

  static async editWeatherStations(area_codes, params) {
    try {
      const now = new Date();
      const rowCount = await db(this.T_STATIONS)
        .whereIn("area_code", area_codes)
        .update({
          ...params,
          updated_at: now,
        });
  
      return rowCount;
    } catch (err) {
      throw new Error("Error editing rows: " + err.message);
    }
  }

  static async findCurrentWeathers(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, area_code } = filter;

      let query = db(`${this.T_WEATHER_CURRENT} as weather`)
        .leftJoin(`${this.T_STATIONS} as stations`, "weather.area_code", "stations.area_code");

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(weather.area_code)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(weather.wind)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(weather.cloud)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(stations.area_name)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (area_code !== undefined && area_code !== WEATHER_STATION_ORDER_NONE) {
        query = query.where("weather.area_code", area_code);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      query = query.select("weather.id", "weather.area_code", "weather.temperature", "weather.humidity", "weather.wind", "weather.cloud", "weather.symbol", "weather.pressure", "weather.sunshine", "weather.visidist")
        .select(db.raw("TO_CHAR(weather.updatetime, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .select("stations.area_name")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findCurrentWeatherByCode(area_code) {
    try {
      let query = db(`${this.T_WEATHER_CURRENT} as weather`)
        .where("weather.area_code", area_code);

      query = query.select("weather.id", "weather.area_code", "weather.temperature", "weather.humidity", "weather.wind", "weather.cloud", "weather.symbol", "weather.pressure", "weather.sunshine", "weather.visidist")
        .select(db.raw("TO_CHAR(weather.updatetime, 'YYYY-MM-DD HH24:MI:SS') updated_at"))

      return await query.first();
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findShortWeathers(filter, isCount = false) {
    try {
      const { offset, limit, sort, keyword, area_code } = filter;

      let query = db(`${this.T_WEATHER_SHORT} as weather`)
        .leftJoin(`${this.T_STATIONS} as stations`, "weather.area_code", "stations.area_code");

      if (keyword) {
        const lowerKeyword = keyword.toLowerCase().trim();
        query = query.where(function() {
          this.where(db.raw("LOWER(weather.area_code)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(weather.wind1)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(weather.cloud1)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(weather.wind2)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(weather.cloud2)"), "like", `%${lowerKeyword}%`)
            .orWhere(db.raw("LOWER(stations.area_name)"), "like", `%${lowerKeyword}%`);
        });
      }

      if (area_code !== undefined && area_code !== WEATHER_STATION_ORDER_NONE) {
        query = query.where("weather.area_code", area_code);
      }

      if (isCount) {
        const countQuery = query.clone();
        const totalCount = await countQuery.count({ total: "*" }).first();
        return totalCount.total;
      }

      if (sort && sort.key && sort.dir) {
        query = query.orderBy(sort.key, sort.dir);
      }

      query = query.select("weather.id", "weather.area_code", "weather.wind1", "weather.cloud1", "weather.symbol1_ as symbol1", "weather.symbol_night1_ as symbol_night1", "weather.templ1", "weather.temph1", "weather.wind2", "weather.cloud2", "weather.symbol2_ as symbol2", "weather.symbol_night2_ as symbol_night2", "weather.templ2", "weather.temph2", "weather.othernote", "weather.enabled")
        .select(db.raw("TO_CHAR(weather.updatetime, 'YYYY-MM-DD HH24:MI:SS') updated_at"))
        .select("stations.area_name")
        .offset(offset);

      if (limit) {
        query = query.limit(limit);
      }

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }

  static async findShortWeathersInCodes(area_codes) {
    try {
      let query = db(`${this.T_WEATHER_SHORT} as weather`)
        .whereIn("weather.area_code", area_codes);

      query = query.select("weather.id", "weather.area_code", "weather.wind1", "weather.cloud1", "weather.symbol1_ as symbol1", "weather.symbol_night1_ as symbol_night1", "weather.templ1", "weather.temph1", "weather.wind2", "weather.cloud2", "weather.symbol2_ as symbol2", "weather.symbol_night2_ as symbol_night2", "weather.templ2", "weather.temph2", "weather.othernote", "weather.enabled")
        .select(db.raw("TO_CHAR(weather.updatetime, 'YYYY-MM-DD HH24:MI:SS') updated_at"))

      return await query;
    } catch (err) {
      throw new Error("Error fetching: " + err.message);
    }
  }
}

module.exports = WeatherModel;
