const { validationResult } = require('express-validator');
const WeatherModel = require('../../models/weatherModel');
const { createResponse } = require('../../utils/response');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { WEATHER_STATION_DEFAULT } = require('../../constants/constants');

async function getWeatherInfo(current_station, short_stations) {
  try {
    if (!current_station) {
      const defRow = await WeatherModel.findWeatherStationByName(WEATHER_STATION_DEFAULT);
      if (!defRow) {
        return { code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")} (current_status)` };
      }
      current_station = defRow.area_code;
    }
    if (short_stations) {
      short_stations = current_station + "," + short_stations;
    } else {
      short_stations = "" + current_station;
    }

    const currentRow = await WeatherModel.findWeatherStationByCode(current_station);
    if (!currentRow) {
      return { code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")} (current_status)` };
    }
    
    const short_codes = short_stations.split(",").map(item => item.trim()).filter(item => !!item);
    const valid_rows = await WeatherModel.findWeatherStationsInCodes(short_codes);
    if (!valid_rows || valid_rows.length === 0) {
      return { code: RESP_CODES.BAD_REQUEST.code, message: `${getLangText("PARAMETER_REQUIRED")} (short_stations)` };
    }
    const valid_codes = valid_rows.map(item => item.area_code);

    let current_weather = await WeatherModel.findCurrentWeatherByCode(current_station);
    if (current_weather.humidity) {
      current_weather = {
        ...current_weather,
        humidity: Math.floor(current_weather.humidity),
      };
    }
    const short_weathers = await WeatherModel.findShortWeathersInCodes(valid_codes);
    const sort_weathers = short_codes.map((code) => {
      const weather = short_weathers.find(row => row.area_code === +code);
      return weather;
    }).filter(row => !!row);
    const data = {
      current_weather,
      short_weathers: sort_weathers,
    };
    return createResponse(RESP_CODES.SUCCESS, data);
  } catch (err) {
    console.error(err);
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function fetchWeatherInfo(req, res) {
  let current_station = +req.query.current_station;
  let short_stations = req.query.short_stations;

  try {
    const resp = await getWeatherInfo(current_station, short_stations);
    return res.status(resp.code).json(resp);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  getWeatherInfo,
  fetchWeatherInfo,
};
