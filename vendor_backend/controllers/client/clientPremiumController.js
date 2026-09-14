const moment = require('moment');
const { validationResult } = require('express-validator');
const PremiumModel = require('../../models/premiumModel');
const { createResponse } = require('../../utils/response');
const { extractValidParams, formatTimeForClient, genRemainLotteryNumbers, formatTimeForMessage, formatDateForClient, formatDateForMessage } = require('../../utils/utils');
const { generateRandomNonDupLotteryNumber } = require('../common/commonPremiumController');
const { getLangText } = require('../../lang/lang');
const RESP_CODES = require('../../constants/responseCodes');
const { FLAG_EXIST, DEFAULT_PAGE_SIZE, FLAG_DELETED, PREMIUM_SERVICE_WOMENSDAY_SERVICE_PK, PREMIUM_SERVICE_WOMENSDAY_DISP_DATE, PREMIUM_SERVICE_WOMENSDAY_RESULT_TIME, FLAG_NONE, PREMIUM_SERVICE_26_03_SERVICE_PK, LOTTERY_NUMBER_LEN, PREMIUM_SERVICE_TYPES, ID_PREFIX_PID, ID_PREFIX_PH } = require('../../constants/constants');

let premium_women_goods = [];
let premium_women_awards = [];
let lottery_submit_goods = [];
let lottery_submit_awards = [];
let lottery_number_remains = [];
let premium_puzzle_rank = [];
let premium_puzzle_honor_count = 0;

async function fetchPremiumServices(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || 0;
  const sort = { key: req.query.sortKey || "lottery_start_date", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const min_at = req.query.min_at || "";
  const max_at = req.query.max_at || "";

  let filter = { offset, limit, sort, keyword, min_at, max_at, is_client: 1, include_test: FLAG_NONE };
  if (min_at === "" && max_at == "") {
    filter = { ...filter, is_deleted: FLAG_EXIST };
  }

  try {
    const total = await PremiumModel.findPremiumServices(filter, true);
    const rows = await PremiumModel.findPremiumServices(filter, false);
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPremiumGoods(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const offset = 0;
  const limit = 0;
  const sort = { key: req.query.sortKey || "price", dir: req.query.sortDir || "desc" };
  const keyword = req.query.keyword || "";
  const service_pk = req.query.service_pk || "";
  const min_at = req.query.min_at || "";
  const max_at = req.query.max_at || "";

  let filter = { offset, limit, sort, keyword, service_pk, min_at, max_at, is_client: 1 };
  if (min_at === "" && max_at == "") {
    filter = { ...filter, is_deleted: FLAG_EXIST, is_now: 1 };
  }

  try {
    const today = moment().format("YYYY-MM-DD");
    let total = 0;
    let rows = [];
    if (service_pk === PREMIUM_SERVICE_WOMENSDAY_SERVICE_PK
      && today <= PREMIUM_SERVICE_WOMENSDAY_DISP_DATE
    ) {
      total = premium_women_goods.length;
      rows = premium_women_goods;
    } else if ([PREMIUM_SERVICE_26_03_SERVICE_PK].includes(service_pk)) {
      total = lottery_submit_goods.length;
      rows = lottery_submit_goods;
    } else {
      total = await PremiumModel.findPremiumGoods(filter, true);
      rows = await PremiumModel.findPremiumGoods(filter, false);
      rows = rows.map(row => ({
        ...row,
        price: +row.price.toFixed(2),
        points: +row.points.toFixed(2),
      }));
    }
    const data = { total, rows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPremiumLotteryInfo25(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const service_pk = +req.query.service_pk;

  try {
    const svcExist = await PremiumModel.findPremiumServiceByPk(service_pk);
    if (!svcExist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    let numInfo = await PremiumModel.findPremiumLotteryPeriodByFilter(service_pk, user.user_pk);
    if (!numInfo) {
      numInfo = await PremiumModel.findPremiumLastUserClassByServicePk(service_pk);
    }

    let lottery_number = -1;
    let random_number = 0;
    let goods_name = "";
    const row = await PremiumModel.findLotteryAwardByFilter(service_pk, user.user_pk);
    if (row) {
      lottery_number = row.lottery_number;
      if (row.is_deleted !== FLAG_DELETED) {
        goods_name = row.goods_name;
      }
    } else if (false) {
      const ret = await generateRandomNonDupLotteryNumber(+service_pk, numInfo.lottery_min_num, numInfo.lottery_max_num);
      if (ret.code === RESP_CODES.SUCCESS.code) {
        random_number = ret.data.lottery_number;
      }
    }

    const user_classes = await PremiumModel.findPremiumSimpleClasses(service_pk);
    const valueFilter = {
      service_pk,
      user_pk: user.user_pk,
    };
    const user_value = await PremiumModel.findPremiumUserValueByFilter(valueFilter, 1);

    const data = {
      lottery_number,
      random_number,
      user_classes,
      user_value,
      min_num: numInfo.lottery_min_num,
      max_num: numInfo.lottery_max_num,
      goods_name,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPremiumLotteryInfo(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["service_pk", "service_max_at", "class_max_at", "candidate_max_at", "submit_max_at", "submit_count"];
  const params = extractValidParams(req.query, validKeys);

  try {
    const service_sort = { key: "lottery_start_date", dir: "asc" };
    const service_filter = {
      offset: 0,
      limit: 0,
      sort: service_sort,
      max_at: params.service_max_at,
      is_deleted: params.service_max_at ? "" : FLAG_EXIST,
      is_client: 1,
      // is_now: 1, // FIXME: iron, dont comment on prod
      include_test: FLAG_NONE,
    };
    const service_rows = await PremiumModel.findPremiumServices(service_filter, false);

    const service_pk = service_rows.length > 0 ? service_rows[0].service_pk : +params.service_pk;

    const class_sort = { key: "start_value", dir: "asc" };
    const class_filter = {
      offset: 0,
      limit: 0,
      sort: class_sort,
      max_at: params.class_max_at,
      is_deleted: params.class_max_at ? "" : FLAG_EXIST,
      is_client: 1,
      service_pk,
    };
    const class_rows = await PremiumModel.findPremiumUserClasses(class_filter, false);

    const candidate_sort = { key: "updated_at", dir: "asc" };
    const candidate_filter = {
      offset: 0,
      limit: 0,
      sort: candidate_sort,
      max_at: params.candidate_max_at,
      user_pk: user.user_pk,
      service_pk,
      is_client: 1,
    };
    const candidate_rows = await PremiumModel.findLotteryCandidates(candidate_filter, false);
    const candidate_count = await PremiumModel.findLotteryCandidateCountForUser(service_pk, user.user_pk);

    let submit_rows = [];
    if (+params.submit_count < candidate_count) {
      const submitFilter = {
        service_pk,
        user_pk: user.user_pk,
        max_at: params.submit_max_at,
      };
      submit_rows = await PremiumModel.findLotterySubmitsForClient(submitFilter);
    }

    const data = {
      service_rows,
      class_rows,
      candidate_rows,
      submit_rows,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPremiumUserAward(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const service_pk = +req.query.service_pk;

  try {
    const award_info = await PremiumModel.findLotteryAwardByFilter(service_pk, user.user_pk);

    const valueFilter = {
      service_pk,
      user_pk: user.user_pk,
    };
    const user_value = await PremiumModel.findPremiumUserValueByFilter(valueFilter, 1);

    const addrFilter = {
      user_pk: user.user_pk,
      service_pk,
    };
    const delivery_address = await PremiumModel.findUserDeliveryAddressByFilter(addrFilter);

    const data = {
      award_info,
      user_value,
      delivery_address,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchLotteryAwards(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: req.query.sortKey || "lottery_number", dir: req.query.sortDir || "asc" };
  const keyword = req.query.keyword || "";
  const service_pk = +req.query.service_pk;

  try {
    let filter = { offset, limit, sort, keyword, service_pk, is_client: 1 };
    const total = await PremiumModel.findLotteryNumbers(filter, true);
    const rows = await PremiumModel.findLotteryNumbers(filter, false);
    const newRows = rows.map(row => {
      const user_id = row.user_id;
      let new_id = "";
      if (user.user_pk === row.user_pk) {
        new_id = user_id;
      } else {
        new_id = user_id.slice(0, 2) + "..." + user_id.slice(user_id.length - 2);
      }
      return ({
        ...row,
        user_id: new_id,
        lottery_number: "" + row.lottery_number,
      });
    });

    const data = { total, rows: newRows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function refreshLotteryNumber(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["service_pk"];
  const params = extractValidParams(req.body, validKeys);
  try {
    let numInfo = await PremiumModel.findPremiumLotteryPeriodByFilter(params.service_pk, user.user_pk);
    if (!numInfo) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("PREMIUM_ERR_NOT_CANDIDATE") });
    }

    const ret = await generateRandomNonDupLotteryNumber(+params.service_pk, numInfo.lottery_min_num, numInfo.lottery_max_num);
    if (ret.code !== RESP_CODES.SUCCESS.code) {
      return res.status(ret.code).json(ret);
    }

    const data = {
      random_number: ret.data.lottery_number,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function submitLotteryNumber(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["service_pk", "lottery_number"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const svcExist = await PremiumModel.findPremiumAvailableServiceByPk(params.service_pk);
    if (!svcExist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("PREMIUM_ERR_LOTTERY_PERIOD") });
    }

    let numInfo = await PremiumModel.findPremiumLotteryPeriodByFilter(params.service_pk, user.user_pk);
    if (!numInfo) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("PREMIUM_ERR_NOT_CANDIDATE") });
      // numInfo = await PremiumModel.findPremiumLastUserClassByServicePk(params.service_pk);
    }
    if (+params.lottery_number < numInfo.lottery_min_num || +params.lottery_number > numInfo.lottery_max_num) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("PREMIUM_ERR_LOTTERY_MIN_MAX", [numInfo.lottery_min_num, numInfo.lottery_max_num]) });
    }

    const filter1 = {
      service_pk: params.service_pk,
      user_pk: user.user_pk,
    };
    const numExist1 = await PremiumModel.findLotteryNumberByFilter(filter1);
    if (numExist1) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("PREMIUM_LOTTERY_EXIST_USER") });
    }

    const filter2 = {
      service_pk: params.service_pk,
      lottery_number: params.lottery_number,
    };
    const numExist2 = await PremiumModel.findLotteryNumberByFilter(filter2);
    if (numExist2) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("PREMIUM_LOTTERY_EXIST_NUMBER") });
    }

    const addParams = {
      user_pk: user.user_pk,
      service_pk: params.service_pk,
      lottery_number: params.lottery_number,
    };

    const row = await PremiumModel.addLotteryNumber(addParams);
    if (!row) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    await PremiumModel.deleteRemainLotteryNumber(params.service_pk, params.lottery_number);

    const data = { row };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchLotterySelectedNumbers(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const service_pk = +req.query.service_pk || 0;
  const min_num = +req.query.min_num || 0;
  const max_num = +req.query.max_num || 0;
  if (min_num > max_num || max_num - min_num > 200) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("PREMIUM_LOTTERY_INVALID_MIN_MAX") });
  }

  const filter = { service_pk, min_num, max_num };
  try {
    const total = await PremiumModel.findSelectedLotteryNumbers(filter, true);
    const rows = await PremiumModel.findSelectedLotteryNumbers(filter, false);
    const data = { total, rows: rows.map(row => row.lottery_number) };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchLotteryRemainNumbers(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const service_pk = +req.query.service_pk || 0;
  const picker_cols = +req.query.picker_cols || 1;

  try {
    let numInfo = await PremiumModel.findPremiumLotteryPeriodByFilter(service_pk, user.user_pk);
    if (!numInfo) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("PREMIUM_ERR_NOT_CANDIDATE") });
    }

    const min_num = numInfo.lottery_min_num;
    const max_num = numInfo.lottery_max_num;
    const filter = { service_pk, min_num, max_num };
    const total = await PremiumModel.findRemainLotteryNumbers(offset, limit, filter, true);
    const rows = await PremiumModel.findRemainLotteryNumbers(offset, limit, filter, false);
    const count = Math.ceil(rows.length / picker_cols);
    let newRows = [];
    for (let i = 0; i < count; i++) {
      const pieces = rows.slice(i * picker_cols, (i + 1) * picker_cols).map(item => "" + item.lottery_number);
      newRows = [...newRows, pieces.join(",")];
    }

    const data = {
      total: Math.ceil(total / picker_cols),
      rows: newRows,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addUserDeliveryAddress(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["service_pk", "receptionist", "phone_numbers", "location_pk", "location_more", "location_environs", "id_card"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const addrFilter = {
      user_pk: user.user_pk,
      service_pk: params.service_pk,
    };
    const exist = await PremiumModel.findUserDeliveryAddressByFilter(addrFilter);
    if (exist) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("PREMIUM_DELIVERY_ADDRESS_EXIST") });
    }

    const addrParams = {
      user_pk: user.user_pk,
      service_pk: params.service_pk,
      receptionist: params.receptionist,
      phone_numbers: params.phone_numbers,
      location_pk: params.location_pk,
      location_more: params.location_more,
      location_environs: params.location_environs,
      id_card: params.id_card,
    };
    const row = await PremiumModel.addUserDeliveryAddress(addrParams);
    if (!row) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function editUserDeliveryAddress(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["delivery_pk", "receptionist", "phone_numbers", "location_pk", "location_more", "location_environs", "id_card"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await PremiumModel.findUserDeliveryAddressByPk(params.delivery_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("PREMIUM_DELIVERY_ADDRESS_NOT_FOUND") });
    }

    if (true) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("PREMIUM_DELIVERY_NO_PERM_EDIT") });
    } else {
      const count = await PremiumModel.editUserDeliveryAddress(params);
      if (count === 0) {
        return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
      }

      return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
    }
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function getPremiumWomenForRAM() {
  const today = moment().format("YYYY-MM-DD");
  if (today > PREMIUM_SERVICE_WOMENSDAY_DISP_DATE) {
    return;
  }

  try {
    const goods_sort = { key: "price", dir: "desc" };
    const goods_filter = { offset: 0, limit: 0, sort: goods_sort, service_pk: PREMIUM_SERVICE_WOMENSDAY_SERVICE_PK, is_deleted: FLAG_EXIST };
    const goods_rows = await PremiumModel.findPremiumGoods(goods_filter, false);
    premium_women_goods = goods_rows.map(row => ({
      ...row,
      price: +row.price.toFixed(2),
      points: +row.points.toFixed(2),
    }));

    const award_sort = { key: "goods.price", dir: "desc" };
    const award_filter = { limit: 0, offset: 0, sort: award_sort, service_pk: PREMIUM_SERVICE_WOMENSDAY_SERVICE_PK, is_client: 1 };
    premium_women_awards = await PremiumModel.findPremiumDiscussAwards(award_filter, false);
  } catch (err) {
    console.log(err);
  }
}

async function fetchPremiumServiceAwards(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const sort = { key: req.query.sortKey || "lottery_number", dir: req.query.sortDir || "asc" };
  const service_pk = +req.query.service_pk;

  const today = moment().format("YYYY-MM-DD");
  if (today <= PREMIUM_SERVICE_WOMENSDAY_DISP_DATE
    && service_pk === PREMIUM_SERVICE_WOMENSDAY_SERVICE_PK
  ) {
    const now = moment().format("YYYY-MM-DD HH:mm:ss");
    if (now >= PREMIUM_SERVICE_WOMENSDAY_RESULT_TIME) {
      const newRows = premium_women_awards.map(row => {
        const user_id = row.user_id;
        let new_id = "";
        if (user.user_pk === row.user_pk || user_id.length <= 3) {
          new_id = user_id;
        } else if (user_id.startsWith(ID_PREFIX_PID)) {
          new_id = user_id.slice(0, 5) + "..." + user_id.slice(user_id.length - 2);
        } else if (user_id.startsWith(ID_PREFIX_PH)) {
          new_id = user_id.slice(0, 4) + "..." + user_id.slice(user_id.length - 2);
        } else {
          new_id = user_id.slice(0, 2) + "..." + user_id.slice(user_id.length - 2);
        }
        return ({
          ...row,
          user_id: new_id,
        });
      });
      const data = {
        total: premium_women_awards.length,
        awards: newRows,
      };
      return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
    } else {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("PREMIUM_WAIT_RESULT") });
    }
  }

  try {
    let filter = { offset, limit, sort, service_pk, is_client: 1 };
    const total = await PremiumModel.findPremiumDiscussAwards(filter, true);
    const rows = await PremiumModel.findPremiumDiscussAwards(filter, false);
    const newRows = rows.map(row => {
      const user_id = row.user_id;
      let new_id = "";
      if (user.user_pk === row.user_pk || user_id.length <= 3) {
        new_id = user_id;
      } else {
        new_id = user_id.slice(0, 2) + "..." + user_id.slice(user_id.length - 2);
      }
      return ({
        ...row,
        user_id: new_id,
      });
    });

    const data = { total, rows: newRows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPremiumDiscussAward(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const service_pk = +req.query.service_pk;
  const include_receptions = +req.query.include_receptions || 0;

  try {
    const awards = await PremiumModel.findPremiumDiscussAwardsForUser(service_pk, user.user_pk);
    let receptions = [];
    if (include_receptions) {
      receptions = await PremiumModel.findPremiumReceptionsByService(service_pk, user.user_pk);
    }

    const data = {
      awards: awards.map(row => ({
        ...row,
        user_id: user.user_id,
      })),
      receptions,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addPremiumReception(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["service_pk", "related_pk", "receptionist", "phone_numbers", "location_pk", "location_more", "location_environs", "id_card"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const receptFilter = {
      user_pk: user.user_pk,
      service_pk: params.service_pk,
      related_pk: params.related_pk,
    };
    const exist = await PremiumModel.findPremiumReceptionByFilter(receptFilter);
    if (exist) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("PREMIUM_DELIVERY_RECEPT_EXIST") });
    }

    let receptParams = {
      user_pk: user.user_pk,
      service_pk: params.service_pk,
      related_pk: params.related_pk,
      receptionist: params.receptionist,
      phone_numbers: params.phone_numbers,
      id_card: params.id_card,
    };
    if (+params.location_pk) {
      receptParams = {
        ...receptParams,
        location_pk: +params.location_pk,
        location_more: params.location_more || "",
        location_environs: params.location_environs || "",
      };
    }
    const row = await PremiumModel.addPremiumReception(receptParams);
    if (!row) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const data = {
      row: {
        ...row,
        updated_at: formatTimeForClient(row.updated_at),
      },
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function editPremiumReception(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["table_pk", "receptionist", "phone_numbers", "location_pk", "location_more", "location_environs", "id_card"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const exist = await PremiumModel.findPremiumReceptionByPk(params.table_pk);
    if (!exist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("PREMIUM_DELIVERY_ADDRESS_NOT_FOUND") });
    }

    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("PREMIUM_DELIVERY_NO_PERM_EDIT") });

    const count = await PremiumModel.editPremiumReception(params);
    if (count === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    return res.status(RESP_CODES.SUCCESS.code).json(RESP_CODES.SUCCESS);
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function randomLotterySubmit(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const validKeys = ["service_pk", "class_pk"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const class_row = await PremiumModel.findPremiumUserClassByPk(params.class_pk);
    if (!class_row) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("PREMIUM_LOTTERY_INVALID_CLASS") });
    }

    const min_num = class_row.lottery_min_num;
    const max_num = class_row.lottery_max_num;
    let remains = [];
    if (true) {
      remains = lottery_number_remains.filter(item => item >= min_num && item <= max_num);
    } else {
      const submits = await PremiumModel.findLotterySubmitNumbers(params.service_pk, min_num, max_num);
      remains = genRemainLotteryNumbers(min_num, max_num, submits);
    }
    const rnd = Math.floor(Math.random() * max_num);
    const random_number = remains[rnd % remains.length];

    const data = {
      random_number,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchLotterySelectedSubmits(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const service_pk = +req.query.service_pk || 0;
  let min_num = +req.query.min_num || 0;
  let max_num = +req.query.max_num || 0;
  if (min_num > max_num || max_num - min_num > 200) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("PREMIUM_LOTTERY_INVALID_MIN_MAX") });
  }

  try {
    const filter = { service_pk, min_num, max_num };
    const total = await PremiumModel.findSelectedLotterySubmits(filter, true);
    const rows = await PremiumModel.findSelectedLotterySubmits(filter, false);
    const data = { total, rows: rows.map(row => row.lottery_number) };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchLotteryRemainSubmits(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const offset = +req.query.offset || 0;
  const limit = +req.query.limit || DEFAULT_PAGE_SIZE;
  const service_pk = +req.query.service_pk || 0;
  const class_pk = +req.query.class_pk || 0;
  const picker_cols = +req.query.picker_cols || 1;

  try {
    const class_row = await PremiumModel.findPremiumUserClassByPk(class_pk);
    if (!class_row) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("PREMIUM_LOTTERY_INVALID_CLASS") });
    }

    const min_num = class_row.lottery_min_num;
    const max_num = class_row.lottery_max_num;
    let remains = [];
    if (true) {
      remains = lottery_number_remains.filter(item => item >= min_num && item <= max_num);
    } else {
      const submits = await PremiumModel.findLotterySubmitNumbers(service_pk, min_num, max_num);
      remains = genRemainLotteryNumbers(min_num, max_num, submits);
    }
    const rows = remains.slice(offset, offset + limit);
    const count = Math.ceil(rows.length / picker_cols);
    let newRows = [];
    for (let i = 0; i < count; i++) {
      const pieces = rows.slice(i * picker_cols, (i + 1) * picker_cols);
      newRows = [...newRows, pieces.join(",")];
    }

    const data = {
      total: Math.ceil(remains.length / picker_cols),
      rows: newRows,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function addLotterySubmit(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["service_pk", "class_pk", "lottery_number"];
  const params = extractValidParams(req.body, validKeys);
  try {
    const svcExist = await PremiumModel.findPremiumAvailableServiceByPk(params.service_pk);
    if (!svcExist) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("PREMIUM_OVER_LOTTERY_PERIOD") });
    }

    const class_row = await PremiumModel.findPremiumUserClassByPk(params.class_pk);
    if (!class_row) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("PREMIUM_LOTTERY_INVALID_CLASS") });
    }
    if (+params.lottery_number < class_row.lottery_min_num || +params.lottery_number > class_row.lottery_max_num) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("PREMIUM_ERR_LOTTERY_MIN_MAX", [class_row.lottery_min_num, class_row.lottery_max_num]) });
    }

    const candFilter = {
      service_pk: params.service_pk,
      class_pk: params.class_pk,
      user_pk: user.user_pk,
    }
    const candidate = await PremiumModel.findLotteryCandidateByFilter(candFilter);
    if (!candidate || candidate.is_deleted !== FLAG_EXIST || candidate.lottery_count <= 0) {
      return res.status(RESP_CODES.NOT_FOUND.code).json({ code: RESP_CODES.NOT_FOUND.code, message: getLangText("PREMIUM_LOTTERY_NO_PERM_SUBMIT") });
    }

    const filter1 = {
      service_pk: params.service_pk,
      class_pk: params.class_pk,
      user_pk: user.user_pk,
    };
    const numExist1 = await PremiumModel.findLotterySubmitsByFilter(filter1);
    if (numExist1.length >= candidate.lottery_count) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("PREMIUM_LOTTERY_EXCEED_COUNT") });
    }

    const filter2 = {
      service_pk: params.service_pk,
      lottery_number: params.lottery_number,
    };
    const numExist2 = await PremiumModel.findLotterySubmitByFilter(filter2);
    if (numExist2) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("PREMIUM_LOTTERY_EXIST_NUMBER") });
    }

    const addParams = {
      user_pk: user.user_pk,
      service_pk: params.service_pk,
      class_pk: params.class_pk,
      lottery_number: params.lottery_number,
    };

    const row = await PremiumModel.addLotterySubmit(addParams);
    if (!row) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    lottery_number_remains = lottery_number_remains.filter(item => item !== +params.lottery_number);

    const data = { row };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function initPremiumLotterySubmitForRAM() {
  try {
    // const service_row = await PremiumModel.findPremiumServiceAwardableForNow(); // FIXME iron@ dont comment on deploy
    const service_row = await PremiumModel.findPremiumServiceByPk(PREMIUM_SERVICE_26_03_SERVICE_PK);
    if (service_row) {
      const goods_sort = { key: "price", dir: "desc" };
      const goods_filter = { offset: 0, limit: 0, sort: goods_sort, service_pk: service_row.service_pk, is_deleted: FLAG_EXIST, is_client: 1 };
      const goods_rows = await PremiumModel.findPremiumGoods(goods_filter, false);
      lottery_submit_goods = goods_rows.map(row => ({
        ...row,
        price: +row.price.toFixed(2),
        points: +row.points.toFixed(2),
      }));

      const award_sort = { key: "goods.price", dir: "desc" };
      const award_filter = { offset: 0, limit: 0, sort: award_sort, service_pk: service_row.service_pk, is_deleted: FLAG_EXIST, is_client: 1 };
      lottery_submit_awards = await PremiumModel.findLotterySubmits(award_filter, false);

      const period_row = await PremiumModel.findPremiumUserClassLotteryNumberPeriod(service_row.service_pk);
      const min_num = period_row ? period_row.lottery_min_num : 0;
      const max_num = period_row ? period_row.lottery_max_num : Math.pow(10, LOTTERY_NUMBER_LEN + 1);
      const submits = await PremiumModel.findLotterySubmitNumbers(service_row.service_pk, min_num, max_num);
      lottery_number_remains = genRemainLotteryNumbers(min_num, max_num, submits);
    }
  } catch (err) {
    console.log(err);
  }
}

async function fetchLotterySubmitAwards(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const service_pk = +req.query.service_pk;

  try {
    const follow_start_time = await PremiumModel.findPremiumServiceFollowTimeByPk(service_pk);
    if (!follow_start_time) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const now = moment().format("YYYY-MM-DD HH:mm:ss");
    if (now < follow_start_time) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("PREMIUM_WAIT_RESULT") });
    }

    const newRows = lottery_submit_awards.map(row => {
      const user_id = row.user_id;
      let new_id = "";
      if (user.user_pk === row.user_pk) {
        new_id = user_id;
      } else if (user_id.startsWith(ID_PREFIX_PID)) {
        new_id = user_id.slice(0, 5) + "..." + user_id.slice(user_id.length - 2);
      } else if (user_id.startsWith(ID_PREFIX_PH)) {
        new_id = user_id.slice(0, 4) + "..." + user_id.slice(user_id.length - 2);
      } else {
        new_id = user_id.slice(0, 2) + "..." + user_id.slice(user_id.length - 2);
      }
      return ({
        ...row,
        user_id: new_id,
      });
    });
    const data = {
      total: lottery_submit_awards.length,
      awards: newRows,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchLotterySubmitAward(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const service_pk = +req.query.service_pk;
  const include_receptions = +req.query.include_receptions || 0;
  const include_class = +req.query.include_class || 0;

  try {
    const awards = await PremiumModel.findLotterySubmitAwardsForUser(service_pk, user.user_pk);
    let receptions = [];
    if (include_receptions) {
      receptions = await PremiumModel.findPremiumReceptionsByService(service_pk, user.user_pk);
    }
    let user_classes = [];
    if (include_class) {
      const classFilter = {
        offset: 0,
        limit: 0,
        sort: {},
        service_pk,
        is_deleted: FLAG_EXIST,
        is_client: 1,
      };
      user_classes = await PremiumModel.findPremiumUserClasses(classFilter, false);
    }

    const data = {
      awards: awards.map(row => ({
        ...row,
        user_id: user.user_id,
      })),
      receptions,
      user_classes,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPremiumPuzzleInfo(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["service_pk", "service_max_at", "class_max_at", "question_max_at", "choice_max_at", "response_max_at", "include_awards", "include_receptions"];
  const params = extractValidParams(req.query, validKeys);

  try {
    const service_sort = { key: "lottery_start_date", dir: "asc" };
    const service_filter = {
      offset: 0,
      limit: 0,
      sort: service_sort,
      max_at: params.service_max_at,
      is_deleted: params.service_max_at ? "" : FLAG_EXIST,
      is_client: 1,
      include_test: FLAG_NONE,
    };
    const service_rows = await PremiumModel.findPremiumServices(service_filter, false);

    const service_pk = service_rows.length > 0 ? service_rows[0].service_pk : +params.service_pk;

    const class_sort = { key: "start_value", dir: "asc" };
    const class_filter = {
      offset: 0,
      limit: 0,
      sort: class_sort,
      max_at: params.class_max_at,
      is_deleted: params.class_max_at ? "" : FLAG_EXIST,
      is_client: 1,
      service_pk,
    };
    const class_rows = await PremiumModel.findPremiumUserClasses(class_filter, false);

    const question_filter = {
      offset: 0,
      limit: 0,
      sort: { key: "position", dir: "asc" },
      max_at: params.question_max_at,
      is_deleted: params.question_max_at ? "" : FLAG_EXIST,
      service_pk,
      is_client: 1,
    };
    const question_rows = await PremiumModel.findQuestionsByServicePk(question_filter, false);

    const choice_filter = {
      offset: 0,
      limit: 0,
      sort: { key: "position", dir: "asc" },
      max_at: params.choice_max_at,
      is_deleted: params.choice_max_at ? "" : FLAG_EXIST,
      service_pk,
    };
    const choice_rows = await PremiumModel.findChoicesByServicePk(choice_filter, false);

    const response_filter = {
      offset: 0,
      limit: 0,
      sort: {},
      max_at: params.response_max_at,
      service_pk,
      user_pk: user.user_pk,
    };
    const response_rows = await PremiumModel.findResponsesByServicePk(response_filter, false);

    let award_rows = [];
    let non_award = 0;
    if (+params.include_awards === 1) {
      award_rows = await PremiumModel.findPuzzleAwardsForUser(service_pk, user.user_pk);
      if (award_rows.length === 0) {
        const now = moment().format("YYYY-MM-DD HH:mm:ss");
        const follow_start_time = await PremiumModel.findPremiumServiceFollowTimeByPk(service_pk);
        if (now >= follow_start_time) {
          non_award = 1;
        }
      }
    }
    let reception_rows = [];
    if (+params.include_receptions === 1) {
      reception_rows = await PremiumModel.findPremiumReceptionsByService(service_pk, user.user_pk);
    }

    const data = {
      service_rows,
      class_rows,
      question_rows,
      choice_rows,
      response_rows,
      award_rows,
      non_award,
      reception_rows,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function submitPuzzleResponse(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const validKeys = ["question_pk", "choice_pks"];
  const params = extractValidParams(req.body, validKeys);

  try {
    const question_row = await PremiumModel.findQuestionByPk(params.question_pk);
    if (!question_row) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const now = moment().format("YYYY-MM-DD HH:mm:ss");
    if (now < formatTimeForClient(question_row.notice_at)) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("PREMIUM_PUZZLE_START_TIME_YET", [formatTimeForMessage(question_row.notice_at)]) });
    }

    const service_row = await PremiumModel.findPremiumServiceByPk(question_row.service_pk);
    if (!service_row) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }
    const today = moment().format("YYYY-MM-DD");
    if (today > formatDateForClient(service_row.lottery_end_date)) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("PREMIUM_PUZZLE_SUBMIT_PERIOD", [formatDateForMessage(question_row.notice_at)]) });
    }

    const resp_filter = { user_pk: user.user_pk, question_pk: +params.question_pk };
    const exist = await PremiumModel.findResponseByFilter(resp_filter);
    if (exist.length > 0) {
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("PREMIUM_PUZZLE_SUBMIT_EXIST") });
    }

    let input_pks = [];
    if (params.choice_pks) {
      input_pks = params.choice_pks.split(",").filter(item => !!item).map(item => +(item.trim()));
    }

    if (input_pks.length === 0) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("PREMIUM_PUZZLE_NO_ANSWER") });
    }

    const valid_choices = await PremiumModel.findValidChoicesByPks(params.question_pk, input_pks);
    if (!valid_choices || valid_choices.length === 0) {
      return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: getLangText("PREMIUM_PUZZLE_INVALID_ANSWER") });
    }

    const valid_pks = valid_choices.map(item => item.choice_pk);
    const diff_pks = input_pks.filter(item => !valid_pks.includes(item));
    if (input_pks.length !== valid_pks.length || diff_pks.length > 0) {
      const data = { diff_pks: diff_pks.join(", ") };
      return res.status(RESP_CODES.CONFLICT.code).json({ code: RESP_CODES.CONFLICT.code, message: getLangText("PREMIUM_PUZZLE_INVALID_SOME"), data });
    }

    const rows = await PremiumModel.addResponses(user.user_pk, params.question_pk, valid_pks);
    if (!rows || rows.length === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
    }

    const data = {
      rows: rows.map(row => ({
        ...row,
        action_at: formatTimeForClient(row.action_at),
      })),
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPuzzleAwards(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const service_pk = +req.query.service_pk;

  try {
    const follow_start_time = await PremiumModel.findPremiumServiceFollowTimeByPk(service_pk);
    if (!follow_start_time) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const now = moment().format("YYYY-MM-DD HH:mm:ss");
    if (now < follow_start_time) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("PREMIUM_WAIT_RESULT") });
    }

    let filter = { offset: 0, limit: 0, sort: {}, service_pk, is_client: 1 };
    const total = await PremiumModel.findPuzzleAwards(filter, true);
    const rows = await PremiumModel.findPuzzleAwards(filter, false);
    const newRows = rows.map(row => {
      const user_id = row.user_id;
      let new_id = "";
      if (user.user_pk === row.user_pk || user_id.length <= 3) {
        new_id = user_id;
      } else {
        new_id = user_id.slice(0, 2) + "..." + user_id.slice(user_id.length - 2);
      }
      return ({
        ...row,
        user_id: new_id,
      });
    });

    const data = { total, awards: newRows };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function fetchPuzzleAward(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({ code: RESP_CODES.BAD_REQUEST.code, message: errors.array()[0].msg });
  }

  const user = req.user;  // get logged in user
  if (!user) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  }

  const service_pk = +req.query.service_pk;
  const include_receptions = +req.query.include_receptions || 0;
  const include_class = +req.query.include_class || 0;

  try {
    const follow_start_time = await PremiumModel.findPremiumServiceFollowTimeByPk(service_pk);
    if (!follow_start_time) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const now = moment().format("YYYY-MM-DD HH:mm:ss");
    if (now < follow_start_time) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("PREMIUM_WAIT_RESULT") });
    }

    const awards = await PremiumModel.findPuzzleAwardsForUser(service_pk, user.user_pk);
    let receptions = [];
    if (include_receptions) {
      receptions = await PremiumModel.findPremiumReceptionsByService(service_pk, user.user_pk);
    }
    let user_classes = [];
    if (include_class) {
      const classFilter = {
        offset: 0,
        limit: 0,
        sort: {},
        service_pk,
        is_deleted: FLAG_EXIST,
        is_client: 1,
      };
      user_classes = await PremiumModel.findPremiumUserClasses(classFilter, false);
    }

    const data = {
      awards: awards.map(row => ({
        ...row,
        user_id: user.user_id,
      })),
      receptions,
      user_classes,
    };
    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

async function initPuzzleRankForRAM() {
  try {
    const service_row = await PremiumModel.findPremiumServiceNowByType(PREMIUM_SERVICE_TYPES.PUZZLE);
    if (!service_row) {
      return;
    }

    premium_puzzle_honor_count = await PremiumModel.findPremiumHonorCount(service_row.service_pk);

    const filter = { offset: 0, limit: 0, service_pk: service_row.service_pk };
    const rows = await PremiumModel.findPuzzleRank(filter, false);
    premium_puzzle_rank = rows.map(row => ({
      service_pk: row.service_pk,
      rank: row.rank,
      user_pk: row.user_pk,
      user_id: row.user_id,
      points: row.points,
      bonus_points: row.bonus_points,
      elapse_time: row.elapse_time,
    }));
  } catch (err) {
    console.log(err);
  }
}

async function fetchPuzzleRank(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
    }

    const service_pk = +req.query.service_pk || 0;
    const is_all = req.query.is_all ? +req.query.is_all : 1;
    const follow_start_time = await PremiumModel.findPremiumServiceFollowTimeByPk(service_pk);
    if (!follow_start_time) {
      return res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);
    }

    const now = moment().format("YYYY-MM-DD HH:mm:ss");
    if (now < follow_start_time || premium_puzzle_rank.length === 0) {
      return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json({ code: RESP_CODES.INTERNAL_SERVER_ERROR.code, message: getLangText("PREMIUM_WAIT_RESULT") });
    }

    const userRank = premium_puzzle_rank.find(row => row.user_pk === user.user_pk);
    const user_rank = userRank ? userRank.rank : -1;
    const surroundings = 2;
    const target_rank = premium_puzzle_honor_count;
    const target_list = premium_puzzle_rank.slice(0, target_rank);
    const neighbours = user_rank === -1 ? [] : premium_puzzle_rank.filter(row => row.rank > target_rank && row.rank >= user_rank - surroundings && row.rank <= user_rank + surroundings && row.rank > target_rank);

    let rows = [];
    if (user_rank === -1 || user_rank <= target_rank) {
      rows = [];
    } else if (user_rank <= target_rank + surroundings + 1) {
      rows = [...neighbours];
    } else {
      const blank_row = {
        service_pk: premium_puzzle_rank[0].service_pk,
        rank: target_rank + 1,
        user_id: "...",
        points: 0,
        bonus_points: 0,
        elapse_time: 0,
      };
      rows = [blank_row, ...neighbours];
    }
    const final_rows = is_all === 1 ? [...target_list, ...rows] : rows;
    const data = { rows: final_rows, target_rank };

    return res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
  } catch (err) {
    console.error(err);
    return res.status(RESP_CODES.INTERNAL_SERVER_ERROR.code).json(RESP_CODES.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  fetchPremiumServices,
  fetchPremiumGoods,
  fetchPremiumLotteryInfo25,
  fetchPremiumLotteryInfo,
  fetchPremiumUserAward,
  fetchLotteryAwards,
  refreshLotteryNumber,
  submitLotteryNumber,
  fetchLotterySelectedNumbers,
  fetchLotteryRemainNumbers,
  addUserDeliveryAddress,
  editUserDeliveryAddress,
  getPremiumWomenForRAM,
  fetchPremiumServiceAwards,
  fetchPremiumDiscussAward,
  addPremiumReception,
  editPremiumReception,
  randomLotterySubmit,
  fetchLotterySelectedSubmits,
  fetchLotteryRemainSubmits,
  addLotterySubmit,
  initPremiumLotterySubmitForRAM,
  fetchLotterySubmitAwards,
  fetchLotterySubmitAward,
  fetchPremiumPuzzleInfo,
  submitPuzzleResponse,
  fetchPuzzleAwards,
  fetchPuzzleAward,
  initPuzzleRankForRAM,
  fetchPuzzleRank,
};
