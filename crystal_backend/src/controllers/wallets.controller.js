const service = require('../services/wallet.service');
const { ok, page } = require('../utils/response');
const { readPaging } = require('../utils/query');

/**
 * MEMBER WALLETS, for the console.
 *
 * The storefront has had these pages for a while and the console had none,
 * which made a member's money and points the one part of the system an
 * operator could not see. Support answering "my top-up never arrived" had a
 * database client and nothing else.
 */

const SORTABLE = ['balance', 'point_balance', 'frozen', 'updated_at', 'login'];
const LEDGER_SORT = ['created_at'];

async function list(req, res) {
  const paging = readPaging(req.query, SORTABLE, 'balance');

  const result = await service.list({
    q: req.query.q,
    funded: req.query.funded,
    currency: req.query.currency,
    sort: paging.sort,
    dir: paging.dir
  }, paging);

  return page(res, result, paging);
}

async function detail(req, res) {
  return ok(res, await service.detail(req.params.userId));
}

/*
 * The two ledgers are separate endpoints rather than one payload: they page
 * independently, and an operator reading three years of transactions has no
 * reason to be sent three years of point entries with them.
 */
async function transactions(req, res) {
  const paging = readPaging(req.query, LEDGER_SORT, 'created_at');

  const result = await service.transactions(req.params.userId, {
    type: req.query.type,
    from: req.query.from,
    to: req.query.to
  }, paging);

  return page(res, result, paging);
}

async function points(req, res) {
  const paging = readPaging(req.query, LEDGER_SORT, 'created_at');

  const result = await service.points(req.params.userId, {
    type: req.query.type,
    from: req.query.from,
    to: req.query.to
  }, paging);

  return page(res, result, paging);
}

/** Where the points came from, for the detail screen's summary. */
async function pointSummary(req, res) {
  return ok(res, await service.pointSummary(req.params.userId));
}

async function adjust(req, res) {
  return ok(res, await service.adjust(req.params.userId, req.body, req.actor), 'common.created');
}

module.exports = {
  SORTABLE: SORTABLE,
  list: list,
  detail: detail,
  transactions: transactions,
  points: points,
  pointSummary: pointSummary,
  adjust: adjust
};
