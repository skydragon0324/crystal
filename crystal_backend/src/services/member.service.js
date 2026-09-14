const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config');
const repo = require('../repositories/members.repository');
const users = require('../repositories/users.repository');
const serials = require('../repositories/serials.repository');
const products = require('../repositories/products.repository');
const walletRepo = require('../repositories/wallet.repository');
const legacyPoints = require('../repositories/legacy/points.repository');
const storefronts = require('./storefronts.service');
const tickets = require('../repositories/repairTickets.repository');
const warrantyRepo = require('../repositories/warranties.repository');
const wallet = require('./wallet.service');
const warranties = require('./warranties.service');
const settings = require('./settings.service');
const { transaction } = require('../repositories/shared/transaction');
const codes = require('../utils/codes');
const { HttpError } = require('../utils/response');
const { SYSTEM } = require('../utils/actor');

/**
 * The member centre (spec 11).
 *
 * Everything here is scoped to one signed-in member, and the scoping is done
 * by passing the userId into the repository rather than by filtering
 * afterwards - a member centre that fetches then filters is one bug away from
 * showing somebody else's devices.
 */

const LICENSABLE = ['TV', 'STB', 'KARAOKE', 'MEDIA'];

/**
 * A repair, as a member reads it.
 *
 * The status is a number in the table and stays one, but it travels with the
 * word beside it - the same pairing the public tracking endpoint uses.  A
 * member centre that renders "status 4" is one that has made its reader learn
 * the workflow's internal numbering.
 */
function memberRepair(ticket) {
  return Object.assign({}, ticket, {
    status_label: codes.labelOf(codes.TICKET_STATUS, ticket.status)
  });
}

function profile(userId) {
  return users.findById(userId);
}

async function updateProfile(userId, payload) {
  const patch = {};
  if (payload.nickname !== undefined) patch.nickname = String(payload.nickname).trim();
  if (payload.avatar !== undefined) patch.avatar = payload.avatar;

  if (!Object.keys(patch).length) throw new HttpError(400, 'common.nothingToUpdate');
  if (patch.nickname === '') throw new HttpError(400, 'common.valueFailedAValidation');

  await users.update(userId, patch);
  return users.findById(userId);
}

/**
 * The member centre's front page.
 *
 * Read in parallel, and deliberately including the repair side: a member who
 * has a device in for repair wants to see that before anything else, and it
 * is the one thing on this page that changes while they are looking at it.
 */
async function dashboard(userId) {
  const paging = { limit: 5, offset: 0 };

  const [account, purse, devices, licences, openTickets, points] = await Promise.all([
    users.findById(userId),
    // The OVERVIEW, not the raw row: the wallet carries the pay password hash
    // and the dashboard is a screen, not a vault.  `walletRepo.find` here was
    // putting that hash into a reply the browser reads.
    walletOverview(userId),
    repo.registrations(userId, paging),
    repo.licenses(userId, paging),
    tickets.search({ user_id: userId, open: true }, { sort: 'received_at', dir: 'desc', limit: 5, offset: 0 }),
    walletRepo.points(userId, {}, paging)
  ]);

  /*
   * THE SECOND HALF OF THE DASHBOARD IS EVERYWHERE ELSE THE MEMBER EXISTS.
   *
   * Points across six systems, a card in the Eshop and coins in the Appstore -
   * four systems, nine balances, and until now no screen showed two of them at
   * once. That is the thing worth putting on a dashboard, so it is gathered
   * here rather than left to nine separate pages.
   *
   * Loaded SEPARATELY from the block above and never allowed to fail the page:
   * two of these are remote services outside Crystal's control, and a member's
   * own devices and repairs should not disappear because a third party's store
   * is slow. Each degrades to nothing and the tile says so.
   */
  const standing = await gatherStanding(userId);

  return {
    profile: account,
    wallet: purse,
    counters: {
      device_cnt: devices.total,
      license_cnt: licences.total,
      open_repair_cnt: openTickets.summary ? openTickets.summary.open_cnt : 0
    },
    devices: devices.rows,
    licenses: licences.rows,
    repairs: openTickets.rows.map(memberRepair),
    points: points.rows,

    /* Every balance the member holds, in one list - see the web dashboard. */
    standing: standing.balances,
    /* Their whole platform in date order, six sources merged. */
    stream: standing.stream
  };
}

/**
 * BALANCES AND MOVEMENTS FROM EVERY SYSTEM AT ONCE.
 *
 * Nothing here is allowed to throw. `Promise.all` would mean one unreachable
 * storefront taking the dashboard with it, so each source is caught on its own
 * and contributes what it can - a missing source is simply absent from the
 * strip, which is the honest rendering of "we could not reach it".
 */
async function gatherStanding(userId) {
  const safe = function (run, fallback) {
    return run().catch(function (err) {
      console.warn('[dashboard] ' + err.message);
      return fallback;
    });
  };

  const [systems, ledger, card, coins, orders, purchases] = await Promise.all([
    safe(function () { return pointSystems(userId); }, []),
    safe(function () { return listPoints(userId, {}, { limit: 8, offset: 0 }); }, { rows: [] }),
    safe(function () { return storefronts.eshopCard(userId); }, { linked: false, card: null }),
    safe(function () { return storefronts.appstoreBalance(userId); }, { linked: false, coins: 0 }),
    safe(function () { return storefronts.eshopOrders(userId, { limit: 5, offset: 0 }); }, { rows: [] }),
    safe(function () { return storefronts.appstorePurchases(userId, {}, { limit: 5, offset: 0 }); }, { rows: [] })
  ]);

  /*
   * THE BALANCES ARE NOT SUMMED and are labelled with what they are counted
   * in. Points, coins and money are three different things; a strip that
   * showed them as one column of numbers would invite adding them up.
   */
  const balances = systems.map(function (system) {
    return {
      key: system.key,
      label: system.label,
      group: 'POINTS',
      unit: 'points',
      value: system.balance,
      cap: system.cap,
      to: '/account/points?source=' + system.key
    };
  });

  if (card && card.card) {
    balances.push({
      key: 'ESHOP_BALANCE', label: 'Eshop balance', group: 'ESHOP',
      unit: 'money', value: card.card.real_value, cap: null, to: '/account/eshop/card'
    });
    balances.push({
      key: 'ESHOP_PRIZE', label: 'Eshop prize', group: 'ESHOP',
      unit: 'money', value: card.card.prize_value, cap: null, to: '/account/eshop/card'
    });
  }

  if (coins && coins.linked) {
    balances.push({
      key: 'APPSTORE_COINS', label: 'Appstore coins', group: 'APPSTORE',
      unit: 'coins', value: coins.coins, cap: null, to: '/account/appstore/wallet'
    });
  }

  /*
   * ONE TIMELINE OUT OF THREE SOURCES.
   *
   * Point movements, orders and app purchases, merged and sorted by when they
   * happened. This is the view no screen in either project has ever offered -
   * each system could only ever show its own half of the member's week.
   */
  const stream = []
    .concat((ledger.rows || []).map(function (row) {
      return {
        kind: 'POINTS', source: row.source_label || row.source,
        title: row.reason, amount: row.amount, unit: 'points',
        at: row.at, to: '/account/points?source=' + row.source
      };
    }))
    .concat((orders.rows || []).map(function (row) {
      return {
        kind: 'ORDER', source: 'Eshop',
        title: row.goods_name, amount: -Math.abs(row.total_price), unit: 'money',
        at: row.at, to: '/account/eshop/orders'
      };
    }))
    .concat((purchases.rows || []).map(function (row) {
      return {
        kind: 'PURCHASE', source: 'Appstore',
        title: row.app_name, amount: -Math.abs(row.price), unit: 'coins',
        at: row.at, to: '/account/appstore/purchases'
      };
    }));

  stream.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });

  return { balances: balances, stream: stream.slice(0, 12) };
}

/* ------------------------------------------------------------------ */
/*  device registration                                                */
/* ------------------------------------------------------------------ */

/**
 * A serial, resolved through the warehouse and then the local mirror.
 *
 * Returns the product too when Crystal recognises the model code, because the
 * registration needs it and asking twice would mean two warehouse round trips
 * for one action.
 */
async function resolveSerial(serialNumber) {
  const serial = String(serialNumber || '').trim().toUpperCase();
  if (!serial) return null;

  const record = await serials.lookup(serial);
  if (!record) return null;

  let product = null;
  if (record.product_id) product = await products.findRow(record.product_id);
  if (!product && record.model_code) product = await products.findByModelCode(record.model_code);

  return {
    serial_number: record.serial_number || serial,
    model_code: record.model_code,
    warranty_until: record.warranty_until || null,
    source: record.source,
    product: product
  };
}

/** What the "check my serial number" box on the registration form answers. */
async function checkSerial(serialNumber) {
  const found = await resolveSerial(serialNumber);
  if (!found) return { known: false, registered: false, product: null };

  const existing = await repo.findRegistrationBySerial(found.serial_number);

  return {
    known: true,
    registered: !!existing,
    serial_number: found.serial_number,
    warranty_until: found.warranty_until,
    product: found.product
      ? { id: found.product.id, name: found.product.name, slug: found.product.slug }
      : null
  };
}

/**
 * Spec 11: input SN -> check the warehouse -> register -> award points.
 *
 * All of it in one transaction, plus one thing the spec does not mention and
 * the after-sales module needs: the registration ISSUES THE WARRANTY.  That
 * is what makes a repair bookable against cover later, and doing it here
 * rather than leaving it to a nightly job means a member who registers a
 * device and walks into a service centre an hour later is already covered.
 */
async function registerProduct(userId, payload) {
  const found = await resolveSerial(payload.serial_number || payload.serialNumber);
  if (!found) throw new HttpError(404, 'common.notFound');

  const existing = await repo.findRegistrationBySerial(found.serial_number);
  if (existing) {
    throw new HttpError(409, existing.user_id === userId
      ? 'member.youHaveAlreadyRegistered'
      : 'common.thisSerialNumberIs');
  }

  const award = await settings.number('points.product_register', config.points.productRegister);
  const purchaseDate = payload.purchase_date || payload.purchaseDate || null;

  return transaction(async function (trx) {
    const rows = await repo.insertRegistration({
      user_id: userId,
      product_id: found.product ? found.product.id : null,
      serial_number: found.serial_number,
      nickname: payload.nickname || null,
      purchase_date: purchaseDate,
      warranty_until: found.warranty_until,
      points: award
    }, trx);

    const registration = rows[0];

    if (award > 0) {
      await wallet.recordPoints({
        user_id: userId,
        type: 'PRODUCT_REGISTER',
        amount: award,
        description: 'Registered ' + (found.product ? found.product.name : found.serial_number),
        reference: found.serial_number
      }, trx);
    }

    await serials.markRegistered(found.serial_number, trx);

    const cover = await warranties.issueStandard({
      user_id: userId,
      registered_product_id: registration.id,
      product_id: found.product ? found.product.id : null,
      serial_number: found.serial_number,
      start_date: purchaseDate || undefined
    }, SYSTEM, trx);

    return {
      registration: await repo.findRegistrationDetail(registration.id),
      points_awarded: award,
      warranty: cover
    };
  });
}

function listRegistrations(userId, paging) {
  return repo.registrations(userId, paging);
}

async function removeRegistration(userId, id) {
  const registration = await repo.findRegistration(id);
  if (!registration || registration.user_id !== userId) throw new HttpError(404, 'common.notFound');

  await repo.removeRegistration(id);
  return { removed: true };
}

/* ------------------------------------------------------------------ */
/*  licences                                                           */
/* ------------------------------------------------------------------ */

/**
 * Licence keys are derived rather than random.
 *
 * The same inputs always produce the same key, so support can re-derive one
 * and verify it without a lookup, and the HMAC secret makes it unforgeable
 * outside this server.
 */
function buildLicenseKey(deviceSn, deviceNo, userId, issuedAt) {
  const material = [deviceSn, deviceNo || '', userId, issuedAt].join('|');
  return crypto
    .createHmac('sha256', config.auth.jwtSecret)
    .update(material)
    .digest('hex')
    .toUpperCase()
    .slice(0, 20)
    .replace(/(.{5})(?=.)/g, '$1-');
}

async function issueLicense(userId, payload) {
  const deviceType = String(payload.device_type || payload.deviceType || '').toUpperCase();
  if (LICENSABLE.indexOf(deviceType) === -1) throw new HttpError(400, 'common.valueFailedAValidation');

  const deviceSn = String(payload.device_sn || payload.deviceSn || '').trim().toUpperCase();
  if (deviceSn.length < 6) throw new HttpError(400, 'common.theDeviceSerialNumber');

  const active = await repo.findLicenseByDeviceSn(deviceSn);
  if (active) throw new HttpError(409, 'common.duplicatedValue');

  const cost = await settings.number('points.license_cost', config.points.licenseCost);

  return transaction(async function (trx) {
    /*
     * The spend goes first and is what enforces affordability: recordPoints
     * locks the wallet and refuses to take the balance below zero, so a
     * member who cannot pay never gets as far as having a licence row
     * written.  Checking the balance beforehand would be a check two requests
     * could both pass.
     */
    if (cost > 0) {
      await wallet.recordPoints({
        user_id: userId,
        type: 'LICENSE',
        amount: -cost,
        description: 'Licence for ' + deviceType + ' ' + deviceSn,
        reference: deviceSn
      }, trx);
    }

    const issuedAt = Date.now();
    const validUntil = new Date(issuedAt);
    validUntil.setUTCFullYear(validUntil.getUTCFullYear() + 1);

    const rows = await repo.insertLicense({
      user_id: userId,
      registered_product_id: payload.registered_product_id || payload.registeredProductId || null,
      device_type: deviceType,
      device_sn: deviceSn,
      device_no: payload.device_no || payload.deviceNo || null,
      license_key: buildLicenseKey(deviceSn, payload.device_no, userId, issuedAt),
      points_used: cost,
      valid_until: validUntil.toISOString().slice(0, 10)
    }, trx);

    return { license: rows[0], points_used: cost };
  });
}

function listLicenses(userId, paging) {
  return repo.licenses(userId, paging);
}

function licensableDevices(userId) {
  return repo.licensableDevices(userId);
}

/* ------------------------------------------------------------------ */
/*  wallet, points and cover                                           */
/* ------------------------------------------------------------------ */

async function walletOverview(userId) {
  const purse = await wallet.overview(userId);
  if (!purse) return { user_id: userId, balance: 0, frozen: 0, point_balance: 0, currency: 'USD' };
  // Whether a pay password has been set is worth knowing; the hash is not.
  return Object.assign({}, purse, {
    pay_password_hash: undefined,
    has_pay_password: !!purse.pay_password_hash
  });
}

function walletTransactions(userId, filters, paging) {
  return wallet.transactions(userId, filters, paging);
}

function charge(userId, amount, reference) {
  return wallet.recordTransaction({
    user_id: userId, type: 'CHARGE', amount: amount,
    reference: reference || null, description: 'Wallet top-up'
  });
}

async function transfer(userId, payload) {
  const target = payload.email
    ? await users.findByEmail(payload.email)
    : await users.findByPhone(payload.phone);

  if (!target) throw new HttpError(404, 'common.notFound');
  if (target.status !== 'ACTIVE') throw new HttpError(400, 'common.valueFailedAValidation');

  await assertPayPassword(userId, payload.pay_password || payload.payPassword);

  return wallet.transfer(userId, target.id, payload.amount, payload.description);
}

/**
 * The pay password, checked only when one has been set.
 *
 * A member who has never set one is not blocked by it - the security page is
 * where they opt in - but once it exists every movement out of the wallet has
 * to present it.
 */
async function assertPayPassword(userId, supplied) {
  const purse = await walletRepo.find(userId);
  if (!purse || !purse.pay_password_hash) return true;

  const matches = await bcrypt.compare(String(supplied || ''), purse.pay_password_hash);
  if (!matches) throw new HttpError(400, 'common.theOldPasswordIs');
  return true;
}

async function setPayPassword(userId, currentPassword, newPassword) {
  if (String(newPassword || '').length < 6) {
    throw new HttpError(400, 'common.theNewPasswordMust', null, { n: 6 });
  }

  const purse = await walletRepo.find(userId);
  if (purse && purse.pay_password_hash) {
    const matches = await bcrypt.compare(String(currentPassword || ''), purse.pay_password_hash);
    if (!matches) throw new HttpError(400, 'common.theOldPasswordIs');
  }

  return transaction(async function (trx) {
    await walletRepo.ensure(userId, trx);
    await walletRepo.lock(userId, trx);
    await walletRepo.setBalances(userId, {
      pay_password_hash: await bcrypt.hash(String(newPassword), config.auth.bcryptRounds)
    }, trx);
    return { updated: true };
  });
}

/**
 * THE POINT LEDGER, ACROSS EVERY SYSTEM THE MEMBER HAS ONE IN.
 *
 * Crystal keeps its own points - a registration award, a daily login, a licence
 * spend - in point_logs. The vendor keeps five more, one per system, and until
 * now no screen anywhere had put them together: the vendor's console reached
 * them through eight separate menu entries and Crystal's page did not know they
 * existed.
 *
 * They are NOT added up. Karaoke points cannot buy an app; they are six
 * currencies rather than six sources of one number, and a single total would be
 * a figure the member could not spend. So the balances come back as a list of
 * systems and the movements come back as one ledger the reader filters.
 *
 * CRYSTAL IS JUST ANOTHER SYSTEM HERE. Its ledger is not privileged and not
 * discarded - it is the sixth card, and asking for source=CRYSTAL reads
 * point_logs exactly as it always did.
 */
const CRYSTAL_SYSTEM = 'CRYSTAL';

async function listPoints(userId, filters, paging) {
  if (filters.source && filters.source !== CRYSTAL_SYSTEM) {
    return legacyPoints.ledger(userId, filters, paging);
  }

  if (filters.source === CRYSTAL_SYSTEM) {
    const own = await wallet.points(userId, filters, paging);
    return { rows: own.rows.map(asMovement), total: own.total };
  }

  /*
   * Everything, which means two paged reads that have to become one page.
   *
   * Both sides are read at their full extent and merged before the slice,
   * because a page of the union is not the union of two pages - taking rows
   * 0-19 from each and interleaving them gives forty rows of which the correct
   * twenty are some unknown subset. The vendor side is already capped
   * (repositories/legacy/points.repository.js) and Crystal's is one member's
   * own history, so the set being sorted is bounded and small.
   */
  const wide = { limit: legacyPoints.CAP, offset: 0 };

  const [vendor, own] = await Promise.all([
    legacyPoints.ledger(userId, {}, wide),
    wallet.points(userId, filters, wide)
  ]);

  const merged = vendor.rows.concat(own.rows.map(asMovement));
  merged.sort(function (a, b) {
    const gap = new Date(b.at) - new Date(a.at);
    return gap !== 0 ? gap : String(b.source).localeCompare(String(a.source));
  });

  const offset = paging.offset || 0;
  return {
    rows: merged.slice(offset, offset + (paging.limit || 20)),
    total: merged.length
  };
}

/** A Crystal point_logs row in the shape the vendor's five answer in. */
function asMovement(row) {
  return {
    id: row.id,
    source: CRYSTAL_SYSTEM,
    source_label: 'Crystal',
    at: row.created_at,
    amount: Number(row.amount) || 0,
    charged: null,
    reason: row.description || row.type,
    reference: row.reference || null,
    by_agency: false,

    /*
     * The one field only Crystal can fill. Its ledger stamps the balance after
     * every movement, which is what lets the check script prove the cached
     * total has not drifted; the vendor's five keep no such column, so the
     * field is present and null rather than absent on five sources out of six.
     */
    balance_after: row.balance_after === undefined ? null : row.balance_after
  };
}

/**
 * Every system's standing, Crystal's included.
 *
 * Crystal's balance is the sum of its own ledger rather than the cached wallet
 * total, so that this screen and the reconciliation check are reading the same
 * number from the same place.
 */
async function pointSystems(userId) {
  const [vendor, own] = await Promise.all([
    legacyPoints.balances(userId),
    wallet.points(userId, {}, { limit: legacyPoints.CAP, offset: 0 })
  ]);

  const balance = own.rows.reduce(function (sum, row) { return sum + (Number(row.amount) || 0); }, 0);

  return [{
    key: CRYSTAL_SYSTEM,
    label: 'Crystal',
    source: 'CRYSTAL',
    balance: balance,
    cap: null,
    spent: null,
    updated_at: own.rows.length ? own.rows[0].created_at : null,
    has_row: own.total > 0
  }].concat(vendor);
}

function pointSummary(userId) {
  return wallet.pointSummary(userId);
}

/** The cover on this member's devices, and what they could extend it to. */
function listWarranties(userId, paging) {
  return warrantyRepo.search({ user_id: userId }, paging);
}

/**
 * Buying an extension with points.
 *
 * The spend and the cover are one transaction for the same reason the
 * registration award is: points taken for cover that did not persist is a
 * complaint nobody can resolve from the data.
 */
async function extendWarranty(userId, payload) {
  const registration = await repo.findRegistration(payload.registered_product_id);
  if (!registration || registration.user_id !== userId) throw new HttpError(404, 'common.notFound');

  const policy = await warrantyRepo.findPolicy(payload.policy_id);
  if (!policy || policy.status !== 'ACTIVE') throw new HttpError(404, 'common.notFound');
  if (!policy.points_price) throw new HttpError(400, 'common.valueFailedAValidation');

  return transaction(async function (trx) {
    await wallet.recordPoints({
      user_id: userId,
      type: 'WARRANTY_EXTENSION',
      amount: -policy.points_price,
      description: policy.name,
      reference: registration.serial_number
    }, trx);

    const cover = await warranties.extend({
      user_id: userId,
      registered_product_id: registration.id,
      product_id: registration.product_id,
      serial_number: registration.serial_number,
      policy_id: policy.id,
      price_paid: 0,
      points_used: policy.points_price
    }, SYSTEM);

    return { warranty: cover, points_used: policy.points_price };
  });
}

/** What this member could buy for one of their devices. */
async function extensionOptions(userId, registrationId) {
  const registration = await repo.findRegistration(registrationId);
  if (!registration || registration.user_id !== userId) throw new HttpError(404, 'common.notFound');

  const product = registration.product_id ? await products.findRow(registration.product_id) : null;
  if (!product) return [];

  return warrantyRepo.purchasablePoliciesFor(product.category_id, product.series_id);
}

/* ------------------------------------------------------------------ */
/*  repairs and feedback                                               */
/* ------------------------------------------------------------------ */

/** This member's repair history, which is the same list the console reads. */
async function listRepairs(userId, paging) {
  const result = await tickets.search({ user_id: userId }, paging);
  return Object.assign({}, result, { rows: result.rows.map(memberRepair) });
}

async function repairDetail(userId, id) {
  const ticket = await tickets.findById(id, false);
  if (!ticket || ticket.user_id !== userId) throw new HttpError(404, 'common.ticketNotFound');

  const [items, events] = await Promise.all([
    tickets.itemsOf(id),
    // A member sees the updates the centre published, not its internal notes.
    tickets.eventsOf(id, true)
  ]);

  return { ticket: ticket, items: items, events: events };
}

/**
 * Rating a repair, from the member's own account.
 *
 * The same rule as the console's version: closed only, once only.  It is
 * enforced in both places rather than shared, because the console's route is
 * guarded by a permission and this one is guarded by owning the ticket -
 * different questions with the same answer.
 */
async function rateRepair(userId, id, payload) {
  const ticket = await tickets.findRow(id);
  if (!ticket || ticket.user_id !== userId) throw new HttpError(404, 'common.ticketNotFound');
  if (ticket.status !== 7) throw new HttpError(409, 'common.valueFailedAValidation');
  if (ticket.rating) throw new HttpError(409, 'common.duplicatedValue');

  const rating = Math.round(Number(payload.rating));
  if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, 'common.valueFailedAValidation');

  const rows = await tickets.update(id, {
    rating: rating,
    rating_comment: payload.rating_comment || null,
    rated_at: new Date()
  });

  return rows[0];
}

/*
 * FEEDBACK MOVED OUT of this service.
 *
 * It used to be four functions here: submit, list, find, close - one row
 * with one reply column. It is a conversation now, with a state machine and
 * two sides posting into one chain, and that belongs in a service of its
 * own rather than in the member centre's catch-all.
 *
 * See services/feedback.service.js. The member endpoints call it directly.
 */

module.exports = {
  LICENSABLE: LICENSABLE,

  profile: profile,
  updateProfile: updateProfile,
  dashboard: dashboard,

  resolveSerial: resolveSerial,
  checkSerial: checkSerial,
  registerProduct: registerProduct,
  listRegistrations: listRegistrations,
  removeRegistration: removeRegistration,

  issueLicense: issueLicense,
  listLicenses: listLicenses,
  licensableDevices: licensableDevices,

  walletOverview: walletOverview,
  walletTransactions: walletTransactions,
  charge: charge,
  transfer: transfer,
  setPayPassword: setPayPassword,
  listPoints: listPoints,
  pointSystems: pointSystems,
  pointSummary: pointSummary,

  listWarranties: listWarranties,
  extendWarranty: extendWarranty,
  extensionOptions: extensionOptions,

  listRepairs: listRepairs,
  repairDetail: repairDetail,
  rateRepair: rateRepair,

};
