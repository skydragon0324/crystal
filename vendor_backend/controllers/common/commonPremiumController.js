const PremiumModel = require("../../models/premiumModel");
const RESP_CODES = require('../../constants/responseCodes');
const { createResponse } = require('../../utils/response');
const { calcIntegratedClass, calcIntegratedValue } = require("../../utils/utils");
const { getLangText } = require("../../lang/lang");
const { LOTTERY_NUMBER_LEN, FLAG_EXIST } = require("../../constants/constants");

let int_classes = [];

async function generateRandomNonDupLotteryNumber(service_pk, min_num, max_num) {
  try {
    const alreadyCount = await PremiumModel.findLotteryNumberCount(service_pk, min_num, max_num);
    const remainCount = max_num - min_num + 1 - alreadyCount;
    const rnd = Math.floor(Math.random() * Math.pow(10, LOTTERY_NUMBER_LEN));
    const offset = rnd % remainCount;

    const lottery_number = await PremiumModel.findRandomNonDupLotteryNumber(service_pk, min_num, max_num, offset);
    if (lottery_number === 0) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("PREMIUM_LOTTERY_ERR_GEN_RANDOM") };
    }

    const data = {
      lottery_number,
    };
    return createResponse(RESP_CODES.SUCCESS, data);
  } catch (err) {
    console.error(err);
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function getIntegratedUserClasses() {
  try {
    const sort = { key: "start_value", dir: "desc" };
    const filter = { offset: 0, limit: 0, sort, is_deleted: FLAG_EXIST };
    const rows = await PremiumModel.findIntegratedUserClasses(filter, false);
    int_classes = rows;
  } catch (err) {
    console.log(err);
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

async function updateIntegratedUserValue(user_pk, params, isNew) {
  try {
    if (!params) {
      return { code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("PARAMETER_REQUIRED") };
    }

    const user_value = calcIntegratedValue(params);
    const int_class = calcIntegratedClass(user_value, int_classes);
    const { class_name, class_level } = int_class;
    if (isNew) {
      const addParams = {
        ...params,
        user_pk,
        user_value,
        class_name,
      };
      await PremiumModel.addIntegratedUserValue(addParams);
    } else {
      const editParams = {
        ...params,
        user_pk,
        user_value,
        class_name,
      };
      await PremiumModel.editIntegratedUserValue(editParams);
    }
    const data = {
      user_value,
      class_name,
      class_level,
    };
    return createResponse(RESP_CODES.SUCCESS, data);
  } catch (err) {
    console.error(err);
    return RESP_CODES.INTERNAL_SERVER_ERROR;
  }
}

module.exports = {
  generateRandomNonDupLotteryNumber,
  getIntegratedUserClasses,
  updateIntegratedUserValue,
};
