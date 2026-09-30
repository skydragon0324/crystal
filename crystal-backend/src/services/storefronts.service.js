'use strict';

const eshopApi = require('../repositories/remote/eshop.api');
const appstoreApi = require('../repositories/remote/appstore.api');
const webApi = require('../repositories/remote/web.api');
const webFiles = require('../repositories/remote/web.files');
const oldLogs = require('../repositories/legacy/oldlogs.repository');
const identity = require('../repositories/legacy/identity.repository');
const members = require('../repositories/legacy/members.repository');
const users = require('../repositories/users.repository');
const { HttpError } = require('../utils/response');
const { translate } = require('../i18n');

/**
 * THE THREE OUTSIDE SYSTEMS a member has an account in, but Crystal does not run.
 *
 * The Eshop and the Appstore are separate businesses on separate deployments.
 * Crystal shows a member their orders, purchases, comments, favourites and
 * balances from both - and owns none of it. Everything here is a read, except
 * the three Appstore wallet writes near the end, which say why they are there.
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
   * THE PLATFORM LOGIN - `users.login`, the member's user ID, refreshed from
   * ora_pid.users on every sign-in. It is what the vendor looks the legacy
   * customer up by (`CustomerModel.findCustomerById(user.user_id)`).
   *
   * This used to be the LOCAL PART OF THE EMAIL, from when members signed in
   * with one. They sign in with a user ID now, and a member who registered
   * with a real address - ming.li@example.com, user ID "mingli" - was being
   * looked up as "ming.li": no customer, so no Eshop account, with nothing
   * wrong anywhere that would say so. The email is kept only as the last
   * resort for a row that predates the login column.
   */
  const login = member.login || String(member.email || '').split('@')[0];
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
  if (!keys.appstore_unique_id) return { linked: false, coins: 0, native_score: 0, foreign_score: 0 };

  const result = await attempt('appstore balance', function () {
    return appstoreApi.balance(keys.appstore_unique_id);
  }, { coins: 0, native_score: 0, foreign_score: 0 });

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
/*  appstore wallet: charge, transfer, password                        */
/* ------------------------------------------------------------------ */

/**
 * THE THREE WRITES IN THIS FILE, and every one of them moves money or guards
 * it.
 *
 * Everything above is a read. These are the vendor's "Points" screens - charge
 * and transfer - and the password its transfer form asks for, and they act on
 * the APPSTORE WALLET: the one /account/wallet shows, the one the vendor's
 * pages are named after. See appstore.api.js for which of the calls under
 * them are the vendor's and which are not.
 *
 * A REFUSAL NAMES ITS FIELD. Each HttpError carries `{ field, reason }` in its
 * detail, so the page can put "no wallet under that user ID" under the user
 * ID box rather than in a toast that has gone by the time the member looks
 * for the mistake. The message is still a sentence, for any caller that does
 * not read detail.
 *
 * NOTHING HERE IS OPTIMISTIC. Every write re-reads the balance from the wallet
 * after the wallet says yes, and answers with that - the page shows the
 * figure the wallet holds, not the one Crystal worked out it ought to.
 */
function refuse(status, message, field, reason, extra) {
  return new HttpError(status, message, Object.assign({ field: field || null, reason: reason }, extra || {}));
}

/**
 * An amount a member may move: more than nothing, no more than the vendor's
 * field allows, and to no finer than a thousandth - the scale every balance on
 * this platform is kept to. It is checked, not rounded: 0.0004 is refused,
 * not quietly sent as 0.
 */
function movableAmount(value) {
  const amount = Number(value);

  if (value === '' || value === null || value === undefined || !isFinite(amount) || amount <= 0) {
    throw refuse(400, 'common.valueFailedAValidation', 'amount', 'AMOUNT_REQUIRED');
  }
  if (amount > appstoreApi.MOVE_LIMIT) {
    throw refuse(400, 'common.valueFailedAValidation', 'amount', 'AMOUNT_TOO_LARGE', { limit: appstoreApi.MOVE_LIMIT });
  }
  if (Math.abs(Math.round(amount * 1000) - amount * 1000) > 1e-6) {
    throw refuse(400, 'common.valueFailedAValidation', 'amount', 'AMOUNT_TOO_FINE');
  }

  return amount;
}

/** This member's wallet key, or a refusal that says there is no wallet. */
async function ownWallet(userId) {
  const keys = await keysFor(userId);
  if (!keys.appstore_unique_id) {
    throw refuse(409, 'common.notFound', null, 'NO_WALLET');
  }
  return keys;
}

/**
 * A remote call that moves or guards money. The store being down is a 502
 * with a reason, never the generic degraded page `attempt` gives a read - a
 * read can show nothing, a write has to say it did not happen.
 */
async function remoteWrite(what, run) {
  try {
    return await run();
  } catch (err) {
    console.warn('[remote] appstore ' + what + ' failed - ' + err.message);
    throw refuse(502, 'common.internalServerError', null, 'UNAVAILABLE');
  }
}

/**
 * WHO A TRANSFER WOULD GO TO, looked up before anything is sent.
 *
 * By PLATFORM LOGIN - the "Receiver ID" on the vendor's form is a user ID -
 * against the platform's own user table, and then through the same identity
 * resolution every Appstore read uses, because a person who exists but has no
 * Appstore wallet cannot be paid and has to be refused here, not by a remote
 * error after the member has confirmed.
 *
 * The NICKNAME comes back so the confirmation can say who the member is
 * paying. A user ID is easy to mistype into somebody else's; a name is how
 * that mistake gets noticed while it can still be cancelled. Nothing else
 * about the person is returned.
 */
async function receiverOf(userId, receiver) {
  const login = String(receiver || '').trim();
  if (!login) throw refuse(400, 'common.aRequiredValueIs', 'receiver', 'RECEIVER_REQUIRED');

  const member = members.decode(await members.findByLogin(login));
  if (!member || !member.active || member.locked) {
    throw refuse(404, 'common.notFound', 'receiver', 'NO_RECEIVER');
  }

  if (Number(member.id) === Number(userId)) {
    throw refuse(400, 'common.valueFailedAValidation', 'receiver', 'RECEIVER_IS_SELF');
  }

  const keys = await identity.keysOf(member.id, member.login);
  if (!keys.appstore_unique_id) throw refuse(404, 'common.notFound', 'receiver', 'NO_RECEIVER');

  return { user_id: member.login, nickname: member.nickname || member.login, unique_id: keys.appstore_unique_id };
}

/** The same lookup for the page: the name, and not the wallet key, which stays here. */
async function walletReceiver(userId, receiver) {
  const found = await receiverOf(userId, receiver);
  return { user_id: found.user_id, nickname: found.nickname };
}

/** What the charge form offers, from the one list the server also enforces. */
function walletChargeOptions() {
  return {
    money: Object.keys(appstoreApi.CHARGE_CHANNELS).map(function (key) {
      return { key: key, channels: appstoreApi.CHARGE_CHANNELS[key] };
    }),
    limit: appstoreApi.MOVE_LIMIT
  };
}

/** Checks the wallet password, refusing on the named field when it is wrong. */
async function assertWalletPassword(login, password, field) {
  if (!String(password || '')) throw refuse(400, 'common.aRequiredValueIs', field, 'PASSWORD_REQUIRED');

  const verdict = await remoteWrite('password check', function () {
    return appstoreApi.verifyWalletPassword(login, String(password));
  });

  if (!verdict.accepted) throw refuse(400, 'common.theOldPasswordIs', field, 'WRONG_PASSWORD');
}

/** The balance as the wallet holds it now, for the reply to a write. */
async function freshBalance(uniqueId) {
  return remoteWrite('balance', function () { return appstoreApi.balance(uniqueId); });
}

/**
 * A TRANSFER, IN THE ORDER THE CHECKS COST.
 *
 * What the member typed first (it costs nothing), then who it is for (one
 * query), then the password and the balance (two remote calls), then the move.
 * Each refusal stops the rest, so a transfer with a mistyped receiver never
 * spends a password attempt, and nothing reaches the wallet's transfer call
 * that Crystal already knows it would refuse.
 *
 * Only company points move - the vendor's form offers no other purse.
 */
async function walletTransfer(userId, payload) {
  const body = payload || {};
  const amount = movableAmount(body.amount);
  const password = String(body.password || '');
  if (!password) throw refuse(400, 'common.aRequiredValueIs', 'password', 'PASSWORD_REQUIRED');

  const keys = await ownWallet(userId);
  const target = await receiverOf(userId, body.receiver);

  await assertWalletPassword(keys.login, password, 'password');

  const before = await freshBalance(keys.appstore_unique_id);
  if (amount > before.native_score) {
    throw refuse(409, 'wallet.notEnoughBalance', 'amount', 'OVER_BALANCE', { balance: before.native_score });
  }

  const result = await remoteWrite('transfer', function () {
    return appstoreApi.transfer(keys.appstore_unique_id, target.unique_id, 'COMPANY', amount);
  });

  if (!result.accepted) {
    throw refuse(502, 'common.internalServerError', null, 'REFUSED', { said: result.message });
  }

  return {
    reference: result.reference,
    amount: amount,
    receiver: { user_id: target.user_id, nickname: target.nickname },
    balance: await freshBalance(keys.appstore_unique_id)
  };
}

/**
 * A charge through one of the vendor's channels into one purse.
 *
 * No password: the vendor's charge page asks for none, and a charge adds to
 * the member's own wallet rather than taking anything out of it.
 */
async function walletCharge(userId, payload) {
  const body = payload || {};
  const money = String(body.money || '').toUpperCase();
  const channels = appstoreApi.CHARGE_CHANNELS[money];

  if (!channels) throw refuse(400, 'common.valueFailedAValidation', 'money', 'MONEY_REQUIRED');
  if (channels.indexOf(String(body.channel || '').toUpperCase()) === -1) {
    throw refuse(400, 'common.valueFailedAValidation', 'channel', 'CHANNEL_REQUIRED');
  }

  const amount = movableAmount(body.amount);
  const keys = await ownWallet(userId);

  const result = await remoteWrite('charge', function () {
    return appstoreApi.charge(keys.appstore_unique_id, money, String(body.channel).toUpperCase(), amount);
  });

  if (!result.accepted) {
    throw refuse(502, 'common.internalServerError', null, 'REFUSED', { said: result.message });
  }

  return {
    reference: result.reference,
    amount: amount,
    balance: await freshBalance(keys.appstore_unique_id)
  };
}

/**
 * CHANGING THE WALLET PASSWORD - the current one first, always.
 *
 * The vendor's store call takes a new password and no old one, so without
 * this check anybody holding a signed-in session could take over the password
 * that guards the member's transfers. Six characters at least, the rule
 * Crystal's own pay password had, since the vendor's validator only asks that
 * the field is not empty.
 *
 * WHAT IT CHANGES, stated so nobody is surprised: this is `prhn_pwd`, which
 * the vendor also writes whenever a member's PLATFORM password is changed. A
 * later platform password change will set the wallet's to match again.
 */
async function walletPassword(userId, payload) {
  const body = payload || {};
  const current = String(body.current || '');
  const next = String(body.next || '');

  if (!current) throw refuse(400, 'common.aRequiredValueIs', 'current', 'PASSWORD_REQUIRED');
  if (next.length < 6) {
    throw new HttpError(400, 'common.theNewPasswordMust', { field: 'next', reason: 'PASSWORD_TOO_SHORT', n: 6 }, { n: 6 });
  }
  if (next === current) throw refuse(400, 'common.valueFailedAValidation', 'next', 'PASSWORD_UNCHANGED');

  const keys = await ownWallet(userId);
  await assertWalletPassword(keys.login, current, 'current');

  const result = await remoteWrite('password change', function () {
    return appstoreApi.setWalletPassword(keys.login, next);
  });

  if (!result.accepted) {
    throw refuse(502, 'common.internalServerError', null, 'REFUSED', { said: result.message });
  }

  return { updated: true };
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

    /*
     * THE SERVICE'S REFUSAL, ON THE SUMMARY, and it is a third state.
     *
     * `unavailable` means the call did not complete - the host was down, the
     * request timed out. `error` means it completed and the service said no,
     * in its own words. Both answer an empty list, and a page that cannot
     * tell them apart from "you have no licences" draws an empty-state over
     * a fault; see keygenRows in repositories/remote/web.api.js.
     *
     * Absent rather than null on a success, so the page's `if (error)` is the
     * whole test.
     */
    return state(result, true, result.error ? { error: result.error } : {});
  };
}

const KEYGEN_SYSTEMS = {
  karaoke: { name: 'karaoke', list: webApi.karaokeKeygenLog },
  manbang: { name: 'manbang', list: webApi.manbangKeygenLog },
  bmedia: { name: 'b-media', list: webApi.bmediaKeygenLog }
};

const karaokeKeygenLog = keygenList('karaoke', webApi.karaokeKeygenLog);
const manbangKeygenLog = keygenList('manbang', webApi.manbangKeygenLog);
const bmediaKeygenLog = keygenList('b-media', webApi.bmediaKeygenLog);

/* ---- the three actions a keygen row offers ---- */

/**
 * ONE ROW OF ONE SYSTEM'S LOG, FOUND BY ID - and it is a search, not a fetch.
 *
 * The eproduct site has no "read one keying" endpoint; it has three logs, and
 * a row is found by reading the member's own log and looking for the id. That
 * is what makes it safe as well as possible: the three actions below all take
 * an id out of the URL, and reading the member's OWN list first is what stops
 * one member acting on another's licence by guessing a number. The same rule
 * the Eshop order and the Appstore purchase follow, for the same reason.
 *
 * The window is the same CAP the vendor's own pages use. A member with more
 * keyings than that cannot act on their oldest, which is a real limit and is
 * stated rather than hidden - and it is the honest trade for not inventing an
 * endpoint upstream that does not exist.
 */
const KEYGEN_SEARCH_LIMIT = 500;

async function keygenRow(userId, system, id) {
  const service = KEYGEN_SYSTEMS[String(system || '').toLowerCase()];
  if (!service) throw new HttpError(404, 'common.notFound');

  const keys = await keysFor(userId);
  if (!keys.login) throw new HttpError(404, 'common.notFound');

  const log = await service.list(keys.login, 0, KEYGEN_SEARCH_LIMIT, {});
  if (log.error) throw new HttpError(502, log.error);

  const mine = log.rows.filter(function (row) { return String(row.id) === String(id); });
  if (!mine.length) throw new HttpError(404, 'common.notFound');

  return { system: String(system).toLowerCase(), row: mine[0] };
}

/**
 * A link to the licence file this keying produced.
 *
 * The row carries a path on the eproduct server's disk, which is not
 * fetchable; web.api.licenseUrl turns it into the download script's address.
 * A row that failed has no file and answers 404 - there is nothing to hand
 * back, and the page offers Retry in place of Download on exactly those rows.
 */
async function keygenLicense(userId, system, id) {
  const found = await keygenRow(userId, system, id);
  if (!found.row.license_file) throw new HttpError(404, 'common.notFound');

  const link = webApi.licenseUrl(found.system, found.row.license_file);

  /*
   * A ROW WITH A FILE AND NO LINK is a deployment that has not finished, not
   * a missing licence - WEB_SERVER_URL is unset, which is every development
   * machine, where the service is mocked and there is no host to fetch from.
   *
   * Saying 404 there would be a lie in the one direction that costs time:
   * whoever is looking would go hunting for the file. 503 and a sentence
   * naming the cause is the difference between a ten-minute detour and none.
   */
  if (!link) throw new HttpError(503, 'eproduct.theServiceAddressIs');

  return link;
}

/**
 * THE LICENCE FILE ITSELF, for the page to save in place.
 *
 * The same row lookup as the link above - the member's own log, searched by
 * id - so a guessed id is a 404 here exactly as it is there. What differs is
 * who fetches the file: Crystal does, server to server, and the page receives
 * bytes over its own authenticated request instead of opening a tab on the
 * eproduct site (see repositories/remote/web.files.js for why).
 *
 * 503 where there is no server to ask, as for the link; 502 where there is
 * and it did not send a file - a different problem, and the member's retry
 * is worth something only in the second case.
 */
async function keygenLicenseFile(userId, system, id) {
  const found = await keygenRow(userId, system, id);
  if (!found.row.license_file) throw new HttpError(404, 'common.notFound');

  let file;
  try {
    file = await webFiles.licenseFile(found.system, found.row.license_file, found.row);
  } catch (err) {
    console.warn('[remote] eproduct licence file for ' + found.system + ' ' + id + ' failed - ' + err.message);
    throw new HttpError(502, 'eproduct.theLicenceFileDidNot');
  }

  if (!file) throw new HttpError(503, 'eproduct.theServiceAddressIs');
  return file;
}

/**
 * ASKING THE SERVICE AGAIN FOR A KEYING THAT FAILED.
 *
 * WHAT THIS IS NOT: it does not issue a licence. The eproduct site has no
 * endpoint that does - keys are cut by the desktop application, and the site
 * only records what happened. The vendor's own Retry button is wired to
 * nothing at all, which is the same finding arrived at from the other side.
 *
 * WHAT IT IS: a re-read of this transaction's current state. A keying that
 * failed at the till and was completed afterwards - by the shop, by a second
 * attempt from the machine - shows up here as a row that now has a licence
 * file, and the page can offer the download it could not offer a minute ago.
 * That is a real answer to "I paid and got nothing", and it is the whole of
 * what Crystal can honestly promise.
 *
 * So a row that is still unissued is a 409 with a sentence saying so, rather
 * than a 200 carrying the same failed row back - which would read as "retried
 * successfully" to anybody not looking closely.
 */
async function retryKeygen(userId, system, id) {
  const found = await keygenRow(userId, system, id);
  if (!found.row.license_file) throw new HttpError(409, 'eproduct.theServiceHasNot');

  return found.row;
}

/**
 * Reporting that an issued licence does not work on the machine it is for.
 *
 * ONE REPORT AT A TIME, which is the vendor's rule and is enforced here as
 * well as in the page: a row already PENDING is a fault somebody is looking
 * at, and a second report only buries the first. ACCEPT and REJECT are
 * answers, so a member whose report was rejected may report again.
 *
 * Both fields are the member's own words and both are required - a fault
 * report with no telephone number is one nobody can follow up, and the
 * service accepts it and then cannot act on it.
 */
async function reportKeygenError(userId, system, id, payload) {
  const phone = String((payload && payload.phone) || '').trim();
  const report = String((payload && payload.report) || '').trim();

  if (!phone || !report) throw new HttpError(400, 'common.aRequiredValueIs');

  const found = await keygenRow(userId, system, id);
  if (found.row.error_status === 'PENDING') throw new HttpError(409, 'eproduct.aFaultHasAlready');

  const sent = await webApi.reportLicenseError(id, phone, report);
  if (!sent.accepted) throw new HttpError(502, sent.error);

  /*
   * Re-read rather than patched locally. The service owns the state, and a
   * row this side that said PENDING when the service had not moved would be
   * a page reporting something that did not happen.
   */
  const after = await keygenRow(userId, system, id);
  return after.row;
}

/**
 * The media lines one b-media licence covered.
 *
 * Checked against the member's own log first, like every other action here -
 * the upstream endpoint takes a licence id and no member, so forwarding an id
 * straight through would let anybody read anybody's.
 */
async function bmediaKeygenDetail(userId, id) {
  await keygenRow(userId, 'bmedia', id);

  const result = await attempt('b-media keygen detail', function () {
    return webApi.bmediaKeygenDetail(id);
  }, { rows: [], total: 0 });

  return state(result, true);
}

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

  return state(said(result, filters && filters.locale), true);
}

/**
 * The carry-forward row's reason, in the reader's language.
 *
 * ONE ROW OUT OF THE WHOLE SECTION. Every other `reason` on these pages is a
 * provider's short name out of the media database and is the same string in
 * every language; the repository hands this one back as an ADDRESS instead,
 * because it is the only line Crystal writes rather than reads. See the note
 * on CARRY_FORWARD_REASON in repositories/legacy/oldlogs.repository.js.
 *
 * It is resolved HERE and not in the repository because the locale belongs to
 * the request, and a database reader has no business knowing about one. The
 * rows are copied rather than mutated - `attempt` hands back the fallback
 * object on a failure, and nothing should be writing into that.
 */
function said(result, locale) {
  return Object.assign({}, result, {
    rows: (result.rows || []).map(function (row) {
      if (!row.carried_forward) return row;
      return Object.assign({}, row, { reason: translate(locale, row.reason) });
    })
  });
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

  walletReceiver: walletReceiver,
  walletChargeOptions: walletChargeOptions,
  walletTransfer: walletTransfer,
  walletCharge: walletCharge,
  walletPassword: walletPassword,

  eprodBalance: eprodBalance,
  eprodRegisterLog: eprodRegisterLog,
  karaokeKeygenLog: karaokeKeygenLog,
  manbangKeygenLog: manbangKeygenLog,
  bmediaKeygenLog: bmediaKeygenLog,

  KEYGEN_SYSTEMS: Object.keys(KEYGEN_SYSTEMS),
  keygenLicense: keygenLicense,
  keygenLicenseFile: keygenLicenseFile,
  retryKeygen: retryKeygen,
  reportKeygenError: reportKeygenError,
  bmediaKeygenDetail: bmediaKeygenDetail,

  karaokeOldLog: karaokeOldLog,
  mediaOldLog: mediaOldLog,
  activityOldLog: activityOldLog
};
