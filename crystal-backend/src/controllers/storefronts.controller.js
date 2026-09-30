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

/**
 * THE SEARCH TERM AS THE STORE SHOULD SEE IT - trimmed, and absent when blank.
 *
 * It reaches the Appstore as the DataTables `sSearch` the vendor sends, and
 * that service matches it as written: a term with a stray space either side
 * (pasted, or typed on a phone that adds one after every word) matches
 * nothing, and a term of only spaces matches only rows containing a space. The
 * page trims before it sends, but this is the API, and a trim here is what
 * makes that true of every caller rather than of one page.
 */
function searchTerm(value) {
  const term = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return term || undefined;
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
  return page(res, await service.appstorePurchases(req.user.id, { keyword: searchTerm(req.query.q), from: req.query.from, to: req.query.to }, p), p);
}

async function appstoreComments(req, res) {
  const p = paging(req);
  return page(res, await service.appstoreComments(req.user.id, { keyword: searchTerm(req.query.q), from: req.query.from, to: req.query.to }, p), p);
}

async function appstoreFavorites(req, res) {
  const p = paging(req);
  return page(res, await service.appstoreFavorites(req.user.id, { keyword: searchTerm(req.query.q), from: req.query.from, to: req.query.to }, p), p);
}

/** Fetched on demand, never with the list - see the service. */
async function appstoreLicense(req, res) {
  return ok(res, await service.appstoreLicense(req.user.id, req.params.purchaseId));
}

/*
 * ---- the appstore wallet: who a transfer is for, and the three writes ----
 *
 * Bodies are read field by field rather than passed through whole, so nothing
 * a page sends beyond these names reaches a call that moves money.
 */

async function appstoreWalletReceiver(req, res) {
  return ok(res, await service.walletReceiver(req.user.id, req.query.user_id));
}

async function appstoreWalletChargeOptions(req, res) {
  return ok(res, service.walletChargeOptions());
}

async function appstoreWalletTransfer(req, res) {
  const body = req.body || {};
  return ok(res, await service.walletTransfer(req.user.id, {
    receiver: body.receiver, amount: body.amount, password: body.password
  }), 'common.sent');
}

async function appstoreWalletCharge(req, res) {
  const body = req.body || {};
  return ok(res, await service.walletCharge(req.user.id, {
    money: body.money, channel: body.channel, amount: body.amount
  }), 'common.updated');
}

async function appstoreWalletPassword(req, res) {
  const body = req.body || {};
  return ok(res, await service.walletPassword(req.user.id, {
    current: body.current, next: body.next
  }), 'common.updated');
}

/* ---- the eproduct site ---- */

async function eprodBalance(req, res) {
  return ok(res, await service.eprodBalance(req.user.id));
}

/**
 * The four lists take the same window and the same search.
 *
 * `locale` travels with them because ONE cell in the whole section is written
 * by Crystal rather than read out of somebody else's database - the media
 * carry-forward row's reason - and it is the only thing here that can be said
 * in the reader's language. The remote query builders read keyword, from and
 * to and ignore the rest, so carrying it costs nothing on the other five.
 */
function eprodList(name) {
  return async function (req, res) {
    const p = paging(req);
    const filters = {
      keyword: req.query.q,
      from: req.query.from,
      to: req.query.to,
      locale: req.locale
    };
    return page(res, await service[name](req.user.id, filters, p), p);
  };
}

const eprodRegisterLog = eprodList('eprodRegisterLog');
const karaokeKeygenLog = eprodList('karaokeKeygenLog');
const manbangKeygenLog = eprodList('manbangKeygenLog');
const bmediaKeygenLog = eprodList('bmediaKeygenLog');

/* ---- the three actions a keygen row offers ----
 *
 * `:system` names which log the row is in - karaoke, manbang or bmedia - and
 * the service checks it against the list it knows. Taken from the URL rather
 * than from the row because the three are three different upstream endpoints
 * and a row id alone does not say which one it came out of.
 */

async function keygenLicense(req, res) {
  return ok(res, await service.keygenLicense(req.user.id, req.params.system, req.params.id));
}

/**
 * The licence file as an ATTACHMENT, for the page to save without a new tab.
 *
 * Both filename forms: the quoted one for anything old, and RFC 5987's
 * `filename*` for anything that reads it - a licence named with a character
 * outside ASCII would otherwise arrive as "download". no-store, because it is
 * a key: no cache between here and the member should keep a copy.
 */
async function keygenLicenseFile(req, res) {
  const file = await service.keygenLicenseFile(req.user.id, req.params.system, req.params.id);
  const plain = String(file.filename).replace(/[^\x20-\x7E]|["\\]/g, '_');

  res.set('Content-Type', file.type || 'application/octet-stream');
  res.set('Content-Disposition', 'attachment; filename="' + plain + '"; filename*=UTF-8\'\'' + encodeURIComponent(file.filename));
  res.set('Cache-Control', 'no-store');
  return res.send(file.bytes);
}

async function retryKeygen(req, res) {
  return ok(res, await service.retryKeygen(req.user.id, req.params.system, req.params.id));
}

async function reportKeygenError(req, res) {
  return ok(res, await service.reportKeygenError(req.user.id, req.params.system, req.params.id, {
    phone: req.body.phone,
    report: req.body.report
  }), 'common.sent');
}

/** The media lines one b-media licence covered - a list, so it pages like one. */
async function bmediaKeygenDetail(req, res) {
  const p = paging(req);
  return page(res, await service.bmediaKeygenDetail(req.user.id, req.params.id), p);
}

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
  appstoreWalletReceiver: appstoreWalletReceiver,
  appstoreWalletChargeOptions: appstoreWalletChargeOptions,
  appstoreWalletTransfer: appstoreWalletTransfer,
  appstoreWalletCharge: appstoreWalletCharge,
  appstoreWalletPassword: appstoreWalletPassword,
  eprodBalance: eprodBalance,
  eprodRegisterLog: eprodRegisterLog,
  karaokeKeygenLog: karaokeKeygenLog,
  manbangKeygenLog: manbangKeygenLog,
  bmediaKeygenLog: bmediaKeygenLog,
  keygenLicense: keygenLicense,
  keygenLicenseFile: keygenLicenseFile,
  retryKeygen: retryKeygen,
  reportKeygenError: reportKeygenError,
  bmediaKeygenDetail: bmediaKeygenDetail,
  karaokeOldLog: karaokeOldLog,
  mediaOldLog: mediaOldLog,
  activityOldLog: activityOldLog
};
