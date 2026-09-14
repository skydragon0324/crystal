'use strict';

const eshopApi = require('../repositories/remote/eshop.api');
const appstoreApi = require('../repositories/remote/appstore.api');
const webApi = require('../repositories/remote/web.api');
const oldLogs = require('../repositories/legacy/oldlogs.repository');
const identity = require('../repositories/legacy/identity.repository');
const users = require('../repositories/users.repository');
const { HttpError } = require('../utils/response');

/**
 * THE THREE OUTSIDE SYSTEMS a member has an account in, but Crystal does not run.
 *
 * The Eshop and the Appstore are separate businesses on separate deployments.
 * Crystal shows a member their orders, purchases, comments, favourites and
 * balances from both - and owns none of it. Everything here is a read.
 *
 * ONE IDENTITY LOOKUP PER REQUEST, not per call. A page like the Appstore
 * dashboard needs the balance, the purchases and the comments; resolving the
 * member's keys once and passing them down is the difference between one query
 * against user_merge_ids and three.
 *
 * A MEMBER WITH NO ACCOUNT IS NOT AN ERROR. Plenty of Crystal members have
 * never shopped in either store, and there is nothing wrong with that - so a
 * missing key answers an empty result with `linked: false` rather than a 404.
 * The page then says "you have no Eshop account", which is true, instead of
 * "something went wrong", which is not.
 */

/** Resolved once per request; see repositories/legacy/identity.repository.js. */
async function keysFor(userId) {
  const member = await users.findById(userId);
  if (!member) throw new HttpError(404, 'common.notFound');

  /*
   * The login the legacy customer database is keyed by. Crystal has no
   * `user_userid` column - its members sign in with an email - so the local
   * part is what the fallback matches on, which is what the vendor's own seed
   * data uses.
   */
  const login = String(member.email || '').split('@')[0];
  return identity.keysOf(userId, login);
}

/**
 * A remote failure is a DEGRADED page, not a 500.
 *
 * These four services are outside Crystal's control and will be down
 * sometimes. The member's own account page should still render - with its
 * other sections intact and this one saying it could not be reached - because
 * a whole account area that goes dark when a third party's store hiccups is
 * worse than a section that admits it.
 *
 * The error is logged, not swallowed silently: nobody can fix what nothing
 * reports.
 */
async function attempt(what, run, fallback) {
  try {
    return await run();
  } catch (err) {
    console.warn('[remote] ' + what + ' failed - ' + err.message);
    return Object.assign({ unavailable: true }, fallback);
  }
}

/**
 * A paged result, WITH the storefront's own state attached.
 *
 * utils/response.page() forwards rows, total and `summary` - so summary is
 * where this belongs. Without it the reply is indistinguishable from an empty
 * list, and the page cannot tell "you have no Appstore account" from "you have
 * bought nothing" or from "the store is down". Those are three different
 * sentences and the member deserves the right one.
 */
function state(result, linked, extra) {
  return {
    rows: result.rows || [],
    total: result.total || 0,
    summary: Object.assign({
      linked: linked,
      unavailable: !!result.unavailable
    }, extra || {})
  };
}

/* ------------------------------------------------------------------ */
/*  eshop                                                              */
/* ------------------------------------------------------------------ */

/** The card and its four values, or `linked: false`. */
async function eshopCard(userId) {
  const keys = await keysFor(userId);
  if (!keys.eshop_pk) return { linked: false, card: null };

  const card = await attempt('eshop card', function () {
    return eshopApi.cardInfo(keys.eshop_pk);
  }, { card: null });

  if (card && card.unavailable) return { linked: true, card: null, unavailable: true };
  return { linked: true, card: card };
}

/**
 * The wallet log in one of its three flavours.
 *
 * `view` is the member's word - transactions, experience, commerce - and it
 * maps onto the service's `type`. Three of the vendor's menu entries were this
 * one call with a different number.
 */
const ESHOP_VIEWS = {
  TRANSACTIONS: eshopApi.LOG_TYPE.TRANSACTION,
  EXPERIENCE: eshopApi.LOG_TYPE.EXP,
  COMMERCE: eshopApi.LOG_TYPE.COMMERCE_VALUE
};

async function eshopLog(userId, view, paging) {
  const keys = await keysFor(userId);
  if (!keys.eshop_pk) return state({ rows: [], total: 0 }, false);

  const type = ESHOP_VIEWS[String(view || '').toUpperCase()];
  if (type === undefined) throw new HttpError(400, 'common.valueFailedAValidation');

  const result = await attempt('eshop log', function () {
    return eshopApi.transactions(keys.eshop_pk, paging.offset, paging.limit, { type: type });
  }, { rows: [], total: 0 });

  return state(result, true, { view: String(view).toUpperCase() });
}

async function eshopOrders(userId, paging) {
  const keys = await keysFor(userId);
  if (!keys.eshop_pk) return state({ rows: [], total: 0 }, false);

  const result = await attempt('eshop orders', function () {
    return eshopApi.orders(keys.eshop_pk, paging.offset, paging.limit);
  }, { rows: [], total: 0 });

  return state(result, true);
}

/**
 * One order's lines.
 *
 * THE ORDER IS CHECKED AGAINST THE MEMBER'S OWN LIST FIRST, and that check is
 * the reason this is not a one-line proxy. The detail endpoint is keyed by
 * order id alone - it does not take a member - so forwarding an id straight
 * through would let anyone read any order by guessing a number. The list is
 * read first and the id has to be in it.
 */
async function eshopOrderDetail(userId, orderId) {
  const keys = await keysFor(userId);
  if (!keys.eshop_pk) throw new HttpError(404, 'common.notFound');

  const mine = await eshopApi.orders(keys.eshop_pk, 0, 200);
  const owns = mine.rows.filter(function (row) { return String(row.order_id) === String(orderId); });
  if (!owns.length) throw new HttpError(404, 'common.notFound');

  const detail = await eshopApi.orderDetail(orderId);
  return { order: owns[0], lines: detail.rows };
}

/* ------------------------------------------------------------------ */
/*  appstore                                                           */
/* ------------------------------------------------------------------ */

async function appstoreBalance(userId) {
  const keys = await keysFor(userId);
  if (!keys.appstore_unique_id) return { linked: false, coins: 0, frozen: 0 };

  const result = await attempt('appstore balance', function () {
    return appstoreApi.balance(keys.appstore_unique_id);
  }, { coins: 0, frozen: 0 });

  return Object.assign({ linked: true }, result);
}

async function appstoreTransactions(userId, filters, paging) {
  const keys = await keysFor(userId);
  if (!keys.appstore_unique_id) return state({ rows: [], total: 0 }, false);

  const result = await attempt('appstore transactions', function () {
    return appstoreApi.transactions(keys.appstore_unique_id, paging.offset, paging.limit, filters);
  }, { rows: [], total: 0 });

  return state(result, true);
}

/** The three store lists differ only in which call they make. */
function storeList(name, call) {
  return async function (userId, filters, paging) {
    const keys = await keysFor(userId);
    if (!keys.appstore_customer_id) return state({ rows: [], total: 0 }, false);

    const result = await attempt('appstore ' + name, function () {
      return call(keys.appstore_customer_id, paging.offset, paging.limit, filters);
    }, { rows: [], total: 0 });

    return state(result, true);
  };
}

const appstorePurchases = storeList('purchases', appstoreApi.purchases);
const appstoreComments = storeList('comments', appstoreApi.comments);
const appstoreFavorites = storeList('favourites', appstoreApi.favorites);

/**
 * The licence key on one purchase.
 *
 * Same ownership rule as the order detail, and for the same reason: the
 * endpoint takes a purchase id and no member, so the purchase has to be found
 * in this member's own list before the key is fetched. A licence key is the
 * most sensitive thing this whole area returns.
 */
async function appstoreLicense(userId, purchaseId) {
  const keys = await keysFor(userId);
  if (!keys.appstore_customer_id) throw new HttpError(404, 'common.notFound');

  const mine = await appstoreApi.purchases(keys.appstore_customer_id, 0, 200, {});
  const owns = mine.rows.filter(function (row) { return String(row.id) === String(purchaseId); });
  if (!owns.length) throw new HttpError(404, 'common.notFound');

  const licence = await appstoreApi.license(purchaseId);
  if (!licence) throw new HttpError(404, 'common.notFound');

  return Object.assign({ purchase: owns[0] }, licence);
}

/* ------------------------------------------------------------------ */
/*  the eproduct site                                                  */
/* ------------------------------------------------------------------ */

/**
 * FIVE READS, ONE IDENTITY, AND IT IS THE LOGIN.
 *
 * The eproduct site keys everything by `userid` - the member's login name -
 * not by either of the pks the Eshop and Appstore use. Passing the wrong one
 * returns an empty list rather than an error, which reads as "you have never
 * registered anything" to somebody who has.
 */
async function eprodBalance(userId) {
  const keys = await keysFor(userId);
  if (!keys.login) return { linked: false, balance: 0, used: 0, registered: 0 };

  const result = await attempt('eproduct balance', function () {
    return webApi.registerBalance(keys.login);
  }, { balance: 0, used: 0, registered: 0 });

  return Object.assign({ linked: true }, result);
}

async function eprodRegisterLog(userId, filters, paging) {
  const keys = await keysFor(userId);
  if (!keys.login) return state({ rows: [], total: 0 }, false);

  const result = await attempt('eproduct register log', function () {
    return webApi.registerLog(keys.login, paging.offset, paging.limit, filters);
  }, { rows: [], total: 0 });

  return state(result, true);
}

/**
 * The three keygen logs, which differ only in which call they make.
 *
 * Karaoke and Manbang share a row shape and B-media does not, but that
 * difference lives in web.api.js - by the time it reaches here all three are
 * a paged list, so all three are one wrapper.
 */
function keygenList(name, call) {
  return async function (userId, filters, paging) {
    const keys = await keysFor(userId);
    if (!keys.login) return state({ rows: [], total: 0 }, false);

    const result = await attempt('eproduct ' + name + ' keygen', function () {
      return call(keys.login, paging.offset, paging.limit, filters);
    }, { rows: [], total: 0 });

    return state(result, true);
  };
}

const karaokeKeygenLog = keygenList('karaoke', webApi.karaokeKeygenLog);
const manbangKeygenLog = keygenList('manbang', webApi.manbangKeygenLog);
const bmediaKeygenLog = keygenList('b-media', webApi.bmediaKeygenLog);

/* ------------------------------------------------------------------ */
/*  the three systems that ran before this one                         */
/* ------------------------------------------------------------------ */

/**
 * THE "OLD LOG" PAGES, and they are DATABASE reads, not HTTP.
 *
 * Everything above this point in the file is a call to somebody's web
 * service. These three are queries against the satellite databases the
 * karaoke, media and prize systems left behind - see
 * repositories/legacy/oldlogs.repository.js for the filtering, which is the
 * interesting part.
 *
 * They still go through `attempt` and `state`, because the failure a member
 * sees is the same one: a history page that could not be read is a section
 * saying so, not a 500 that takes the whole account area down with it.
 */
async function karaokeOldLog(userId, filters, paging) {
  const keys = await keysFor(userId);
  if (!keys.login) return state({ rows: [], total: 0 }, false);

  const result = await attempt('karaoke old log', function () {
    return oldLogs.karaoke(userId, keys.login, paging);
  }, { rows: [], total: 0 });

  return state(result, true);
}

async function mediaOldLog(userId, filters, paging) {
  const keys = await keysFor(userId);
  if (!keys.login) return state({ rows: [], total: 0 }, false);

  const result = await attempt('media old log', function () {
    return oldLogs.media(userId, keys.login, paging);
  }, { rows: [], total: 0 });

  return state(result, true);
}

/**
 * The activity prize log, which is keyed differently from the other two.
 *
 * The prize table predates the platform and knows a member only by their OLD
 * CUSTOMER ID - not the login the licence services use, and not Crystal's own
 * id. `eshop_pk` is that number: the identity repository resolves it from the
 * merge row, or from the old customer database by login when there is none.
 * A member with neither has no old history, which is not an error.
 */
async function activityOldLog(userId, filters, paging) {
  const keys = await keysFor(userId);
  if (!keys.eshop_pk) return state({ rows: [], total: 0 }, false);

  const result = await attempt('activity old log', function () {
    return oldLogs.activity(keys.eshop_pk, paging, filters);
  }, { rows: [], total: 0 });

  return state(result, true);
}

module.exports = {
  ESHOP_VIEWS: Object.keys(ESHOP_VIEWS),

  keysFor: keysFor,

  eshopCard: eshopCard,
  eshopLog: eshopLog,
  eshopOrders: eshopOrders,
  eshopOrderDetail: eshopOrderDetail,

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
