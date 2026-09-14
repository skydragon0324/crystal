const WeatherModel = require('../../models/weatherModel');
const BridgeAPI = require('../../api/bridgeApi');
const { createResponse } = require('../../utils/response');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { FLAG_DELETED, FLAG_EXIST, WEATHER_STATION_ORDER_NONE } = require('../../constants/constants');

async function syncGeoInfo(req, res) {
  try {
    const resp = await BridgeAPI.get(`${process.env.WEATHER_SERVER_URL}/getGeoInfo.php`);
    if (resp.code !== RESP_CODES.SUCCESS.code) {
      return res.status(resp.code).json(resp);
    }

    const { stations_all, stations_current, stations_short, stations_middle } = JSON.parse(resp.data.trim());
    const all_codes = stations_all ? stations_all.map(item => +item.area_code) : [];
    const exist_rows = await WeatherModel.findWeatherStations(0, 0, null, {}, false);
    if (exist_rows && exist_rows.length > 0) {
      const exist_codes = exist_rows.map(row => row.area_code);
      const deleted_codes = exist_codes.filter(item => !all_codes.includes(item));
      if (deleted_codes.length > 0) {
        const deleteParams = {
          is_deleted: FLAG_DELETED,
        };
        const count = await WeatherModel.editWeatherStations(deleted_codes, deleteParams);
        if (count === 0) {
          return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("WEATHER_ERR_EDIT_WEATHER_STATION") });
        }
      }
    }

    if (!stations_all || stations_all.length === 0) {
      return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
    }

    let err_codes = [];
    for (const row of stations_all) {
      const current_row = stations_current.find(item => +item.area_code === +row.area_code);
      const current_order = current_row ? +current_row.disp_order : WEATHER_STATION_ORDER_NONE;
      const short_row = stations_short.find(item => +item.area_code === +row.area_code);
      const short_order = short_row ? +short_row.disp_order : WEATHER_STATION_ORDER_NONE;
      const middle_row = stations_middle.find(item => +item.area_code === +row.area_code);
      const middle_order = middle_row ? +middle_row.disp_order : WEATHER_STATION_ORDER_NONE;
      const exist = exist_rows.find(item => item.area_code === +row.area_code);
      if (exist) {
        if (row.area_name !== exist.area_name
          || exist.is_deleted !== FLAG_EXIST
          || exist.current_order !== current_order
          || exist.short_order !== short_order
          || exist.middle_order !== middle_order
        ) {
          const editParams = {
            area_code: +row.area_code,
            area_name: row.area_name,
            current_order,
            short_order,
            middle_order,
            is_deleted: FLAG_EXIST,
          };
          const count = await WeatherModel.editWeatherStation(editParams);
          if (count === 0) {
            err_codes = [...err_codes, +row.area_code];
          }
        }
      } else {
        const addParams = {
          area_code: +row.area_code,
          area_name: row.area_name,
          current_order,
          short_order,
          middle_order,
          is_deleted: FLAG_EXIST,
        };
        const newRow = await WeatherModel.addWeatherStation(addParams);
        if (!newRow) {
          err_codes = [...err_codes, +row.area_cde];
        }
      }
    }

    if (err_codes.length !== 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: `${getLangText("WEATHER_ERR_SYNC_SOME_STATIONS")} (${err_codes.join(", ")})` });
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchWeatherStations(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "current_order", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const type = +req.query.type;

  try {
    const filter = { offset, limit, sort, keyword, type };
    const total = await WeatherModel.findWeatherStations(filter, true);
    const rows = await WeatherModel.findWeatherStations(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchWeatherCurrent(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "stations.current_order", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const type = +req.query.type;

  try {
    const filter = { offset, limit, sort, keyword, type };
    const total = await WeatherModel.findCurrentWeathers(filter, true);
    const rows = await WeatherModel.findCurrentWeathers(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchWeatherShort(req, res) {
  const offset = +req.query.offset || 0;
  const limit = +req.query.limit;
  const sort = { key: req.query.sortKey || "stations.short_order", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const type = +req.query.type;

  try {
    const filter = { offset, limit, sort, keyword, type };
    const total = await WeatherModel.findShortWeathers(filter, true);
    const rows = await WeatherModel.findShortWeathers(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  syncGeoInfo,
  fetchWeatherStations,
  fetchWeatherCurrent,
  fetchWeatherShort,
};
