const childProcess = require('child_process');
const fs = require('fs');
const moment = require('moment');
const { getLangText } = require('../lang/lang');
const { POINT_TYPE_VALUES, POINT_TYPE_HASHES, RESERVE_SOURCES, DEPARTMENTS, PHONE_REG_MAX_POINTS, EPROD_REG_MAX_POINTS, RESERVE_TYPES, INTEGRATED_VALUE_RATES } = require('../constants/constants');

function shellExec(cmd, resolve, reject) {
  let output = "";
  try {
    output = childProcess.execSync(cmd).toString('ascii');
    // resolve(output);
  } catch (e) {
    output = e.stdout.toString('ascii');
  }
  return output;
}

// Function to filter valid keys from the object (req.body)
function extractValidParams(body, validKeys) {
  return Object.keys(body)
    .filter((key) => validKeys.includes(key))  // Filter out only valid keys
    .reduce((obj, key) => {
      obj[key] = body[key];  // Add the key-value pair to the new object
      return obj;
    }, {});
}

function validatePhoneNumber(value) {
  // Remove non-numeric characters for validation
  const cleanedValue = value.replace(/\D/g, '');

  if (cleanedValue.startsWith('1')) {
    return (cleanedValue.startsWith(getLangText("PHONE_PREFIX_1")) || cleanedValue.startsWith(getLangText("PHONE_PREFIX_5"))) && cleanedValue.length === 10 && value.length === 12;
  } else {
    return cleanedValue.length === 9 && value.length === 11;
  }
}

function formatPhoneNumber(value) {
  if (!value) {
    return "";
  }
  const cleanedValue = value.replace(/\D/g, '');

  if ((cleanedValue.startsWith(getLangText("PHONE_PREFIX_1")) || cleanedValue.startsWith(getLangText("PHONE_PREFIX_5"))) && cleanedValue.length === 10) {
    return `${cleanedValue.slice(0, 3)}-${cleanedValue.slice(3, 6)}-${cleanedValue.slice(6)}`;
  } else if (cleanedValue.startsWith(getLangText("LINE_PREFIX_1"))) {
    return `${cleanedValue.slice(0, 2)}-${cleanedValue.slice(2, 5)}-${cleanedValue.slice(5)}`;
  } else {
    return `${cleanedValue.slice(0, 3)}-${cleanedValue.slice(3, 5)}-${cleanedValue.slice(5)}`;
  }
}

function extractPhoneNumberFromMessage(message) {
  // Remove non-numeric characters for validation
  const cleanedValue = message.replace(/\D/g, '');
  return cleanedValue;
}

function unEntity(str) {
  return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}

function formatTimeForClient(time) {
  return moment(time).format("YYYY-MM-DD HH:mm:ss");
}

function formatDateForClient(time) {
  if (!time) {
    return "";
  }
  return moment(time).format("YYYY-MM-DD");
}

function convertDateFromString(date) {
  return moment(date, 'YYYY-MM-DD').toDate();
}

function formatDateForMessage(time) {
  return moment(time).format(getLangText("FORMAT_DATE_FOR_MSG"));
}

function formatTimeForMessage(time) {
  return moment(time).format(getLangText("FORMAT_TIME_FOR_MSG"));
}

function is923User(cid) {
  if (!cid) {
    return false;
  }
  return cid.startsWith("2") && cid.substring(0, 3) !== "237";
}

function convertCidFor923(cid) {
  if (is923User(cid)) {
    return "1" + cid.substring(1);
  }
  return cid;
}

function genUserIdFor923(charLen, numLen) {
  let result = "";
  const characters = "abcdefghijklmnopqrstuvwxyz";
  const nums = "0123456789";
  let counter = 0;
  while (counter < charLen) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
    counter += 1;
  }
  counter = 0;
  while (counter < numLen) {
    result += nums.charAt(Math.floor(Math.random() * nums.length));
    counter += 1;
  }
  return result;
}

function str2hex(value) {
  return Buffer.from(value, "utf8").toString("hex");
}

function hex2str(value) {
  return Buffer.from(value, "hex").toString("utf8");
}

function base64decode(value) {
  return Buffer.from(value, "base64").toString("utf8");
}

function generateVerifyCode() {
  return generateCode(6); // generate 6-length digits
}

function generateCode(n) {
  const add = 1,
    max = 12 - add;

  if (n > max) {
    return generateCode(max) + generateCode(n - max);
  }

  max = Math.pow(10, n + add);
  const min = max / 10; // Math.pow(10, n) basically 
  const number = Math.floor(Math.random() * (max - min + 1)) + min;

  return ("" + number).substring(add);
}

function getFileSize(url) {
  const realUrl = url.replace(/\\/g, '/');
  if (!fs.existsSync(realUrl)) {
    return -1;
  }

  return fs.statSync(realUrl).size;
}

function formatReserveNo(value) {
  if (value < 10) {
    return `000${value}`;
  } else if (value < 100) {
    return `00${value}`;
  } else if (value < 1000) {
    return `0${value}`;
  } else {
    return "" + value;
  }
}

function convertHashToPointType(hash) {
  if (hash === POINT_TYPE_HASHES.FIXED_BIRTHDAY) {
    return POINT_TYPE_VALUES.FIXED_BIRTHDAY;
  } else if (hash === POINT_TYPE_HASHES.FIXED_HOLIDAY) {
    return POINT_TYPE_VALUES.FIXED_HOLIDAY;
  } else if (hash === POINT_TYPE_HASHES.BLOG_POST_ARTICLE_DISCUSS) {
    return POINT_TYPE_VALUES.BLOG_POST_ARTICLE_DISCUSS;
  } else if (hash === POINT_TYPE_HASHES.BLOG_POST_ARTICLE_PRHN) {
    return POINT_TYPE_VALUES.BLOG_POST_ARTICLE_PRHN;
  } else if (hash === POINT_TYPE_HASHES.BLOG_POST_ARTICLE_INFO) {
    return POINT_TYPE_VALUES.BLOG_POST_ARTICLE_INFO;
  } else if (hash === POINT_TYPE_HASHES.BLOG_POST_ARTICLE_SCIENCE) {
    return POINT_TYPE_VALUES.BLOG_POST_ARTICLE_SCIENCE;
  } else if (hash === POINT_TYPE_HASHES.BLOG_POST_ARTICLE_ECOMONY) {
    return POINT_TYPE_VALUES.BLOG_POST_ARTICLE_ECONOMY;
  } else if (hash === POINT_TYPE_HASHES.BLOG_REPLY_ARTICLE) {
    return POINT_TYPE_VALUES.BLOG_REPLY_ARTICLE;
  } else if (hash === POINT_TYPE_HASHES.BLOG_CORRECT_ARTICLE) {
    return POINT_TYPE_VALUES.BLOG_CORRECT_ARTICLE;
  } else if (hash === POINT_TYPE_HASHES.BLOG_POST_BBS_HUMOR) {
    return POINT_TYPE_VALUES.BLOG_POST_BBS_HUMOR;
  } else if (hash === POINT_TYPE_HASHES.BLOG_POST_BBS_TECH) {
    return POINT_TYPE_VALUES.BLOG_POST_BBS_TECH;
  } else if (hash === POINT_TYPE_HASHES.BLOG_RECOM_GOLD) {
    return POINT_TYPE_VALUES.BLOG_RECOM_GOLD;
  } else if (hash === POINT_TYPE_HASHES.BLOG_RECOM_SILVER) {
    return POINT_TYPE_VALUES.BLOG_RECOM_SILVER;
  } else if (hash === POINT_TYPE_HASHES.BLOG_RECOM_BRONZE) {
    return POINT_TYPE_VALUES.BLOG_RECOM_BRONZE;
  } else if (hash === POINT_TYPE_HASHES.BLOG_COPY_ARTICLE_PUBLISHED) {
    return POINT_TYPE_VALUES.BLOG_COPY_ARTICLE_PUBLISHED;
  } else if (hash === POINT_TYPE_HASHES.BLOG_COPY_ARTICLE_PENDING) {
    return POINT_TYPE_VALUES.BLOG_COPY_ARTICLE_PENDING;
  } else if (hash === POINT_TYPE_HASHES.BLOG_COPY_BBS_PUBLISHED) {
    return POINT_TYPE_VALUES.BLOG_COPY_BBS_PUBLISHED;
  } else if (hash === POINT_TYPE_HASHES.BLOG_COPY_BBS_PENDING) {
    return POINT_TYPE_VALUES.BLOG_COPY_BBS_PENDING;
  }
  return "";
}

function getPointTypeByEverydayCount(everyday_cnt) {
  if (everyday_cnt > 7) {
    return POINT_TYPE_VALUES.FIXED_DAILY_LOGIN_LAST;
  }
  return POINT_TYPE_VALUES.FIXED_DAILY_LOGIN_FIRST + (everyday_cnt - 1);
}

function getDayDiff(one, two) {
  return moment(one).diff(moment(two), 'days');
}

function convertBlogConfigByList(configs) {
  let blog_config = {};
  for (const config of configs) {
    blog_config = {
      ...blog_config,
      [config.key.toLowerCase()]: config.type === "NUMBER" ? +config.val : config.val,
    };
  }
  return blog_config;
}

function getReserveSourceName(source, type, simple_name) {
  if (type === RESERVE_TYPES.REWARD) {
    return getLangText("BOOK_SOURCE_REWARD");
  }
  if (source === RESERVE_SOURCES.ESHOP) {
    return getLangText("BOOK_SOURCE_ESHOP");
  } else if (source === RESERVE_SOURCES.SOFTWARE) {
    return getLangText("BOOK_SOURCE_SOFT");
  } else if (source === RESERVE_SOURCES.EPROD_REG) {
    return getLangText("BOOK_SOURCE_EPROD_REG");
  } else if (source === RESERVE_SOURCES.ACTIVITY) {
    return getLangText("BOOK_SOURCE_ACTIVITY");
  } else if (source === RESERVE_SOURCES.CREDIT) {
    return getLangText("BOOK_SOURCE_CREDIT");
  } else if (source === RESERVE_SOURCES.LOTTERY) {
    return getLangText("BOOK_SOURCE_LOTTERY");
  } else if (source === RESERVE_SOURCES.PHONE_REG) {
    return `${simple_name || ""}${getLangText("BOOK_SOURCE_PHONE_REG")}`;
  } else if (source === RESERVE_SOURCES.AGENCY_SOFT_APPSTORE) {
    return getLangText("BOOK_SOURCE_AGENCY_APPSTORE");
  } else if (source === RESERVE_SOURCES.AGENCY_SOFT_EPROD) {
    return getLangText("BOOK_SOURCE_AGENCY_SOFT_EPROD");
  } else if (source === RESERVE_SOURCES.AGENCY_SALE_EPROD) {
    return getLangText("BOOK_SOURCE_AGENCY_SALE_EPROD");
  } else if (source === RESERVE_SOURCES.AGENCY_AS_EPROD) {
    return getLangText("BOOK_SOURCE_AGENCY_AS_EPROD");
  } else if (source === RESERVE_SOURCES.AGENCY_AS_PHONE) {
    return getLangText("BOOK_SOURCE_AGENCY_AS_PHONE");
  } else if (source === RESERVE_SOURCES.AGENCY_STANDARD) {
    return getLangText("BOOK_SOURCE_AGENCY_STANDARD");
  } else {
    return "";
  }
}

function getFeedbackIndicesByDepartment(department) {
  let departs = [];
  for (let i = 0; i < department.length; i++) {
    if (department.charAt(i) === '1') {
      departs = [...departs, ...DEPARTMENTS[i].feedback_indices];
    }
  }
  return Array.from(new Set(departs));
}

function getAppPointPagesByDepartment(department) {
  let departs = [];
  for (let i = 0; i < department.length; i++) {
    if (department.charAt(i) === '1') {
      departs = [...departs, ...DEPARTMENTS[i].app_pages];
    }
  }
  return Array.from(new Set(departs));
}

function getSurveyIndicesByDepartmment(department) {
  let departs = [];
  for (let i = 0; i < department.length; i++) {
    if (department.charAt(i) === '1') {
      departs = [...departs, ...DEPARTMENTS[i].survey_indices];
    }
  }
  return Array.from(new Set(departs));
}

function getFullLocationCode(code) {
  if (!code || code.length > 6) {
    return "";
  }

  if ([2, 4, 6].includes(code.length)) {
    return code;
  }
  return '0' + code;
}

function validateImei(imei) {
  if (imei.length !== 15) {
    return false;
  }

  // Input IMEI: 490154203237518
  // Take off the last digit, and remember it: 49015420323751 & 8. This last digit 8 is the validation digit.
  const last = +imei.slice(14);

  // Double each second digit in the IMEI: 4 18 0 2 5 8 2 0 3 4 3 14 5 2 (excluding the validation digit)
  // Separate this number into single digits: 4 1 8 0 2 5 8 2 0 3 4 3 1 4 5 2 (notice that 18 and 14 have been split).
  // Add up all the numbers: 4+1+8+0+2+5+8+2+0+3+4+3+1+4+5+2 = 52
  let curr;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    curr = +imei.slice(i, i + 1);
    if (i % 2 === 0) {
      sum += curr;
    } else {
      curr = 2 * curr;
      if (curr > 9) {
        curr = Math.floor(curr / 10) + (curr - 10);
      }
      sum += curr;
    }
  }

  // Take your resulting number, remember it, and round it up to the nearest multiple of ten: 60.
  const round = sum % 10 === 0 ? sum : (Math.floor(sum / 10 + 1) * 10);

  // Subtract your original number from the rounded-up number: 60 - 52 = 8
  return round - sum === last;
}

// NOTE: PremiumModel.recalcIntegratedUserValues applying same formula
function calcIntegratedValue(data) {
  const exp_value = data.exp_value ? data.exp_value : 0;
  const soft_points = data.soft_points ? data.soft_points : 0;
  const phone_reg_points = Math.min(data.phone_reg_points ? data.phone_reg_points : 0, PHONE_REG_MAX_POINTS);
  const eprod_reg_points = Math.min(data.eprod_reg_points ? data.eprod_reg_points : 0, EPROD_REG_MAX_POINTS);
  const activity_points = data.activity_points ? data.activity_points : 0;

  return (phone_reg_points + eprod_reg_points) * INTEGRATED_VALUE_RATES.REGISTER
    + exp_value * INTEGRATED_VALUE_RATES.ESHOP
    + soft_points * INTEGRATED_VALUE_RATES.SOFT
    + activity_points * INTEGRATED_VALUE_RATES.ACTIVITY;
}

function calcIntegratedClass(user_value, classes) {
  for (const userClass of classes) {
    if (user_value >= userClass.start_value && user_value < userClass.end_value) {
      return userClass;
    }
  }
  return {
    class_level: 1,
    class_name: getLangText("USER_CLASS_1"),
  };
}

function genRemainLotteryNumbers(min_num, max_num, submits) {
  let rows = [];
  for (let i = min_num; i <= max_num; i++) {
    if (!submits.includes(i)) {
      rows = [...rows, i];
    }
  }
  return rows;
}

module.exports = {
  shellExec,
  extractValidParams,
  validatePhoneNumber,
  formatPhoneNumber,
  extractPhoneNumberFromMessage,
  unEntity,
  formatTimeForClient,
  formatDateForClient,
  convertDateFromString,
  formatDateForMessage,
  formatTimeForMessage,
  is923User,
  convertCidFor923,
  genUserIdFor923,
  str2hex,
  hex2str,
  base64decode,
  generateVerifyCode,
  getFileSize,
  formatReserveNo,
  convertHashToPointType,
  getPointTypeByEverydayCount,
  getDayDiff,
  convertBlogConfigByList,
  getReserveSourceName,
  getFeedbackIndicesByDepartment,
  getAppPointPagesByDepartment,
  getSurveyIndicesByDepartmment,
  getFullLocationCode,
  validateImei,
  calcIntegratedValue,
  calcIntegratedClass,
  genRemainLotteryNumbers,
};
