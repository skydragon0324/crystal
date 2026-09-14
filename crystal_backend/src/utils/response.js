const { translate } = require('../i18n');

/**
 * One envelope for the whole API:
 *
 *   success  { success: true, message, data }
 *   failure  { success: false, message, detail }
 *
 * Every reply carries a human readable message, and the language it is
 * written in belongs to the reader, not to the call site.  So handlers keep
 * saying what happened in plain English and the wording is resolved here,
 * once, against the locale the request arrived with.
 *
 * `params` fills the {name} placeholders in messages that carry data, so a
 * sentence can be translated whole instead of being concatenated together in
 * an order that only works in English.
 */
function ok(res, data, message, params) {
  const locale = res.req && res.req.locale;

  return res.json({
    success: true,
    message: translate(locale, message || 'common.ok', params),
    data: data === undefined ? null : data
  });
}

/**
 * A list reply.  Kept separate from ok() only because every list in the
 * console needs the same four keys around the rows, and spelling them out at
 * forty call sites is how three of them end up spelling `total` differently.
 */
function page(res, result, paging, message) {
  return ok(res, {
    rows: result.rows,
    total: result.total,
    page: paging.page,
    limit: paging.limit,
    summary: result.summary === undefined ? null : result.summary
  }, message);
}

/**
 * `message` is the English text, translated by the error handler once the
 * request's locale is known - not here, because an error can be thrown long
 * before anything knows who is going to read it.
 */
class HttpError extends Error {
  constructor(status, message, detail, params) {
    super(message);
    this.status = status;
    this.detail = detail || null;
    this.params = params || null;
  }
}

module.exports = { ok: ok, page: page, HttpError: HttpError };
