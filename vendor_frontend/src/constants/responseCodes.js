import { getRespText } from "lang/lang";

/**
 * Common response codes and their status text.
 *
 * `message` is a getter for the same reason the label lists in
 * constants.js are: this module is evaluated once, before the app has
 * settled on a language, so a captured string would pin the status text
 * to whatever locale happened to be loaded first. `code` is the part
 * every call site actually compares, and it is unchanged.
 */
const respCode = (code, key) =>
  Object.defineProperty({ code }, "message", {
    get: () => getRespText(key),
    enumerable: true,
  });

export const RESP_CODES = {
  SUCCESS: respCode(200, "SUCCESS"),
  BAD_REQUEST: respCode(400, "BAD_REQUEST"),
  UNAUTHORIZED: respCode(401, "UNAUTHORIZED"),
  FORBIDDEN: respCode(403, "FORBIDDEN"),
  NOT_FOUND: respCode(404, "NOT_FOUND"),
  CONFLICT: respCode(409, "CONFLICT"),
  INTERNAL_SERVER_ERROR: respCode(500, "INTERNAL_SERVER_ERROR"),
};
