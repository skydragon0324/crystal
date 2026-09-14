const service = require('../services/storefronts.service');
const { ok, page } = require('../utils/response');
const { readPaging } = require('../utils/query');

/**
 * The Eshop and Appstore sections of the member centre.
 *
 * Every handler passes `req.user.id` down and never takes an id from the
 * request, the same rule the rest of the member centre follows. The two
 * endpoints that DO take an id - an order and a purchase - check it against
 * the member's own list in the service before fetching anything, because both
 * upstream endpoints are keyed by that id alone.
 *
 * Sorting is not offered. These lists are ordered by the remote service and
 * neither of them accepts an order parameter Crystal could forward, so
 * pretending to sort would be a control that does nothing.
 */
function paging(req) {
  return readPaging(req.query, ['id'], 'id');
}

/* ---- eshop ---- */

async function eshopCard(req, res) {
  return ok(res, await service.eshopCard(req.user.id));
}

async function eshopOrders(req, res) {
  const p = paging(req);
  return page(res, await service.eshopOrders(req.user.id, p), p);
}

async function eshopOrderDetail(req, res) {
  return ok(res, await service.eshopOrderDetail(req.user.id, req.params.orderId));
}

/**
 * One endpoint for three lists.
 *
 * Transactions, experience and commerce value are the same call upstream with
 * a different type, so they are the same route with a different `view` - which
 * is what turns three of the vendor's menu entries into one page with a
 * segmented control.
 */
async function eshopLog(req, res) {
  const p = paging(req);
  const view = req.query.view || 'TRANSACTIONS';
  return page(res, await service.eshopLog(req.user.id, view, p), p);
}

/* ---- appstore ---- */

async function appstoreBalance(req, res) {
  return ok(res, await service.appstoreBalance(req.user.id));
}

async function appstoreTransactions(req, res) {
  const p = paging(req);
  return page(res, await service.appstoreTransactions(req.user.id, {
    transaction_type: req.query.type,
    from: req.query.from,
    to: req.query.to
  }, p), p);
}

async function appstorePurchases(req, res) {
  const p = paging(req);
  return page(res, await service.appstorePurchases(req.user.id, { keyword: req.query.q, from: req.query.from, to: req.query.to }, p), p);
}

async function appstoreComments(req, res) {
  const p = paging(req);
  return page(res, await service.appstoreComments(req.user.id, { keyword: req.query.q, from: req.query.from, to: req.query.to }, p), p);
}

async function appstoreFavorites(req, res) {
  const p = paging(req);
  return page(res, await service.appstoreFavorites(req.user.id, { keyword: req.query.q, from: req.query.from, to: req.query.to }, p), p);
}

/** Fetched on demand, never with the list - see the service. */
async function appstoreLicense(req, res) {
  return ok(res, await service.appstoreLicense(req.user.id, req.params.purchaseId));
}

/* ---- the eproduct site ---- */

async function eprodBalance(req, res) {
  return ok(res, await service.eprodBalance(req.user.id));
}

/** The four lists take the same window and the same search. */
function eprodList(name) {
  return async function (req, res) {
    const p = paging(req);
    const filters = { keyword: req.query.q, from: req.query.from, to: req.query.to };
    return page(res, await service[name](req.user.id, filters, p), p);
  };
}

const eprodRegisterLog = eprodList('eprodRegisterLog');
const karaokeKeygenLog = eprodList('karaokeKeygenLog');
const manbangKeygenLog = eprodList('manbangKeygenLog');
const bmediaKeygenLog = eprodList('bmediaKeygenLog');

/* ---- the three systems that ran before this one ---- */

const karaokeOldLog = eprodList('karaokeOldLog');
const mediaOldLog = eprodList('mediaOldLog');
const activityOldLog = eprodList('activityOldLog');

module.exports = {
  eshopCard: eshopCard,
  eshopOrders: eshopOrders,
  eshopOrderDetail: eshopOrderDetail,
  eshopLog: eshopLog,
  appstoreBalance: appstoreBalance,
  appstoreTransactions: appstoreTransactions,
  appstorePurchases: appstorePurchases,
  appstoreComments: appstoreComments,
  appstoreFavorites: appstoreFavorites,
  appstoreLicense: appstoreLicense,
  eprodBalance: eprodBalance,
  eprodRegisterLog: eprodRegisterLog,
  karaokeKeygenLog: karaokeKeygenLog,
  manbangKeygenLog: manbangKeygenLog,
  bmediaKeygenLog: bmediaKeygenLog,
  karaokeOldLog: karaokeOldLog,
  mediaOldLog: mediaOldLog,
  activityOldLog: activityOldLog
};
