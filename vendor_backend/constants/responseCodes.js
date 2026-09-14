const { RESP_MSG } = require("../lang/en");

// Define common response codes and messages
const RESP_CODES = {
  SUCCESS: {
    code: 200,
    message: RESP_MSG.SUCCESS,
  },
  BAD_REQUEST: {
    code: 400,
    message: RESP_MSG.BAD_REQUEST,
  },
  UNAUTHORIZED: {
    code: 401,
    message: RESP_MSG.UNAUTHORIZED,
  },
  FORBIDDEN: {
    code: 403,
    message: RESP_MSG.FORBIDDEN,
  },
  NOT_FOUND: {
    code: 404,
    message: RESP_MSG.NOT_FOUND,
  },
  CONFLICT: {
    code: 409,
    message: RESP_MSG.CONFLICT,
  },
  INTERNAL_SERVER_ERROR: {
    code: 500,
    message: RESP_MSG.INTERNAL_SERVER_ERROR,
  },
};

module.exports = RESP_CODES;
