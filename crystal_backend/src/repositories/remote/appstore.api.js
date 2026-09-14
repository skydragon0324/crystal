const remote = require('../../config/remote');
const config = require('../../config');

/**
 * THE APPSTORE, over HTTP - and it is two services, not one.
 *
 * A transcription of vendor_backend/api/appstoreApi.js. The store and its
 * wallet are separate deployments with separate base urls and, more to the
 * point, separate IDENTIFIERS for the same person:
 *
 *   appstore        keyed by `customer_id`
 *   appstoreWallet  keyed by `unique_id`
 *
 * Both come off the same `user_merge_ids` row and neither is the member's
 * Crystal id. Mixing them up returns somebody else's purchases rather than an
 * error, which is why they are named separately all the way down.
 *
 * The store speaks DataTables - `iDisplayStart`, `iDisplayLength`,
 * `iTotalRecords`, `mData` - because its endpoints were written to feed a
 * jQuery grid. That vocabulary stops at this file.
 */

const STORE = 'appstore';
const WALLET = 'appstoreWallet';

/**
 * WHAT A PURCHASE WAS FOR, which is not always an app.
 *
 * The store sells five different things and each names itself in a different
 * field - `app_name`, `diamond_name`, `eventitem_title`, `nickname_name`, and
 * an avatar which has no name at all. `purchasable_type` says which field to
 * read, so reading `app_name` unconditionally shows a blank row for four
 * purchases in five.
 */
const PURCHASE_KIND = {
  appversion: 'APP',
  diamond: 'DIAMOND',
  avatar: 'AVATAR',
  eventitem: 'EVENT_ITEM',
  nickname: 'NICKNAME'
};

/**
 * `spd_state_id`, which answers two questions at once.
 *
 * The vendor's console read it twice - once through a purchase-status table
 * and once through a licence-state table - because the same number says both
 * how the purchase ended and whether there is a licence to fetch. Both
 * readings are kept, named separately, so a page does not have to know that
 * 2 means "paid" and "issued" at the same time.
 */
const PURCHASE_STATE = { 1: 'PURCHASING', 2: 'PURCHASED', 3: 'CANCELLED', 4: 'FAILED', 5: 'REFUNDED' };
const LICENCE_STATE = { 1: 'PENDING', 2: 'ISSUED', 3: 'NONE', 4: 'NONE', 5: 'REVOKED' };

/** Which purse a figure is in. `0` is the store's own non-cash balance. */
const MONEY_TYPE = { 0: 'IMMATERIAL', 1: 'COMPANY', 2: 'FOREIGN' };

/** What moved the coins. */
const TRANSACTION_KIND = {
  1: 'TOPUP', 2: 'PURCHASE', 3: 'REFUND', 4: 'TRANSFER_IN', 5: 'TRANSFER_OUT'
};

/** A licence can be fetched for these two states and no others. */
const LICENCE_AVAILABLE = ['PURCHASING', 'PURCHASED'];

function named(table, value, fallback) {
  return table[String(Number(value))] || fallback || null;
}

/** DataTables paging, named once. */
function windowOf(offset, limit) {
  return { iDisplayStart: Number(offset) || 0, iDisplayLength: Number(limit) || 10 };
}

/** The date window and search the vendor sends with every store list. */
function filterOf(filter) {
  return {
    from: (filter && filter.from) || '',
    to: (filter && filter.to) || '',
    sSearch: (filter && filter.keyword) || ''
  };
}

/**
 * A DataTables reply.
 *
 * `errors` is how this service reports a failure - there is no status field -
 * so its presence is the test, and an empty result is the honest answer.
 */
function table(data, map) {
  if (!data || data.errors) return { rows: [], total: 0 };

  return {
    total: Number(data.iTotalRecords) || 0,
    rows: (data.mData || []).map(map)
  };
}

/**
 * A link to something on the Appstore's own host, or nothing at all.
 *
 * Its icons and its app pages live there, so they can only be addressed when
 * that host is configured. In development it is not - the service is mocked
 * and there is no server to fetch a PNG from - so this answers null and the
 * pages draw a placeholder. A half-built URL is a broken image on every row.
 */
function appstoreUrl(path) {
  const base = String(config.remote.appstoreServerUrl || '').replace(/\/$/, '');
  if (!base || !path) return null;

  return base + (String(path).charAt(0) === '/' ? path : '/' + path);
}

/* ------------------------------------------------------------------ */
/*  the wallet                                                         */
/* ------------------------------------------------------------------ */

/** Coins in hand. */
async function balance(uniqueId) {
  const data = await remote.post(WALLET, '/api/v2/maininfo/remainingCoins', {
    unique_id: uniqueId
  });

  return {
    coins: Number(data.remaining_coins) || 0,
    frozen: Number(data.frozen_coins) || 0
  };
}

/**
 * The coin statement, from the wallet's v3 endpoint.
 *
 * THE VENDOR HAS TWO, and this is the one its MEMBER page reads -
 * `/api/v3/histories`, a GET, with `meta.code` for success and `data.items`
 * for the rows. The v2 endpoint is still there and is what its console uses.
 * Reading the wrong one is not an error, it is a differently-shaped reply
 * that maps to an empty list.
 *
 * IT DOES NOT REPORT A TOTAL. It reports `last_page`, and the vendor
 * multiplies that by the page size - which overstates the count by up to a
 * page whenever the last page is short. That is what the member's paging has
 * always been built on, so it is transcribed rather than improved: inventing
 * a different total here would make the last page number disagree with the
 * one the store's own site shows.
 */
async function transactions(uniqueId, offset, limit, filter) {
  const count = Number(limit) || 10;
  const page = Math.floor((Number(offset) || 0) / count);

  const data = await remote.get(WALLET, '/api/v3/histories', {
    unique_id: uniqueId,
    count: count,
    page: page,
    start_day: (filter && filter.from) || '',
    end_day: (filter && filter.to) || '',
    type: Number(filter && filter.transaction_type) || 0
  });

  if (!data || !data.meta || Number(data.meta.code) !== 0) return { rows: [], total: 0 };

  const body = data.data || {};

  return {
    total: (Number(body.last_page) || 0) * count,
    rows: (body.items || []).map(function (row) {
      return {
        id: row.unique_id,
        amount: Number(row.money_value) || 0,
        currency_id: Number(row.money_value_type_id) || 0,
        currency: named(MONEY_TYPE, row.money_value_type_id, 'COMPANY'),
        kind_id: Number(row.transaction_type_id) || 0,
        kind: named(TRANSACTION_KIND, row.transaction_type_id),
        reference: row.transaction_number,
        detail: row.transaction_detail_1 || null,
        at: row.created_at
      };
    })
  };
}

/* ------------------------------------------------------------------ */
/*  the store                                                          */
/* ------------------------------------------------------------------ */

/**
 * What a purchase was for, in one string.
 *
 * Five fields, one of which is filled in; an avatar has none, and gets its
 * kind as its name rather than an empty cell.
 */
function purchasedName(row, kind) {
  if (kind === 'APP') return row.app_name || null;
  if (kind === 'DIAMOND') return row.diamond_name || null;
  if (kind === 'EVENT_ITEM') return row.eventitem_title || null;
  if (kind === 'NICKNAME') return row.nickname_name || null;
  return null;
}

/**
 * The page on the store this purchase points at.
 *
 * Each kind lives somewhere different, and an avatar is not a page at all.
 * The vendor built these inline in JSX; they are here because a URL is a fact
 * about the service, not about a table cell.
 */
function purchasedUrl(row, kind) {
  if (kind === 'APP') return appstoreUrl('/app/' + row.purchasable_id);
  if (kind === 'DIAMOND') return appstoreUrl('/others/diamonds');
  if (kind === 'EVENT_ITEM') return appstoreUrl('/events');
  return null;
}

async function purchases(customerId, offset, limit, filter) {
  const data = await remote.post(STORE, '/api/maininfo/getPurchaseTableData', Object.assign(
    { customer_id: customerId },
    windowOf(offset, limit),
    filterOf(filter)
  ));

  return table(data, function (row) {
    const kind = PURCHASE_KIND[String(row.purchasable_type)] || 'APP';
    const state = named(PURCHASE_STATE, row.spd_state_id, 'PURCHASING');

    return {
      id: row.purchase_history_unique_id,
      kind: kind,
      name: purchasedName(row, kind),
      url: purchasedUrl(row, kind),
      app_version: row.app_version || null,
      device_no: row.device_no || null,
      /* Which purse it came out of, and how much. */
      currency: named(MONEY_TYPE, row.purchasemoney_type, 'IMMATERIAL'),
      price: Number(row.purchase_actual_value) || 0,
      status: state,
      /* Only a failure explains itself, and the service's words are used. */
      status_reason: row.spd_change_reason || null,
      licence_state: named(LICENCE_STATE, row.spd_state_id, 'NONE'),
      /*
       * WHETHER THERE IS ANYTHING TO FETCH, decided here rather than by a
       * page comparing state ids. The vendor offered the key button on two
       * states and warned on the rest, which is a rule about the service.
       */
      licence_available: LICENCE_AVAILABLE.indexOf(state) > -1,
      at: row.created_at
    };
  });
}

async function comments(customerId, offset, limit, filter) {
  const data = await remote.post(STORE, '/api/maininfo/getCommentTableData', Object.assign(
    { customer_id: customerId },
    windowOf(offset, limit),
    filterOf(filter)
  ));

  return table(data, function (row) {
    const app = row.app || {};
    const icon = app.app_icon || {};

    return {
      id: row.rn,
      app_name: app.name || null,
      icon_url: appstoreUrl(icon.icon_48_48_url),
      /* Out of five. The vendor calls it `rating` here and `score` nowhere. */
      rating: Number(row.rating) || 0,
      content: row.content,
      /*
       * APPROVED, OR WAITING. A member's own comment can sit unapproved for
       * days; a page that does not say so reads as one that lost it.
       */
      approved: Number(row.active) === 1,
      at: row.created_at
    };
  });
}

async function favorites(customerId, offset, limit, filter) {
  const data = await remote.post(STORE, '/api/maininfo/getFavouriteTableData', Object.assign(
    { customer_id: customerId },
    windowOf(offset, limit),
    filterOf(filter)
  ));

  return table(data, function (row) {
    const icon = row.app_icon || {};

    return {
      id: row.unique_id,
      app_name: row.name || null,
      /* A bigger icon than a comment carries - the vendor asks for 144. */
      icon_url: appstoreUrl(icon.icon_144_144_url),
      /* Whether the app is still published, not whether it is installed. */
      approved: Number(row.active) === 1,
      at: row.created_at
    };
  });
}

/**
 * The licence on one purchase.
 *
 * Fetched per row rather than with the list, because it is the one field the
 * member reveals deliberately - a licence key printed down a column is a
 * licence key in every screenshot of that page.
 *
 * `device_license` IS AN OBJECT: a key, the file it downloads as, and
 * sometimes a QR image as a hex blob. It was being read as a bare string,
 * which is a shape the real service never sends.
 */
async function license(purchaseId) {
  const data = await remote.post(STORE, '/api/maininfo/getSpdMsg', {
    purchase_history_unique_id: purchaseId
  });

  if (!data || !data.result) return null;

  const held = data.device_license || {};

  /* A string here would be the key itself, which is worth surviving. */
  const licence = typeof data.device_license === 'string' ? data.device_license : held.license;

  return {
    state: named(LICENCE_STATE, data.spd_state_id, 'NONE'),
    licence: licence || null,
    /*
     * HEX ON THE WIRE, base64 in an <img>. The conversion is here rather than
     * in the page because it is a property of the service's encoding, and
     * because a page doing it inline did it with a helper nobody else had.
     */
    qr: held.qr ? Buffer.from(String(held.qr), 'hex').toString('base64') : null,
    download_url: held.license_file && held.license_file_url
      ? appstoreUrl('/download/licenses/' + held.license_file_url + '/' + held.license_file)
      : null
  };
}

module.exports = {
  PURCHASE_KIND: PURCHASE_KIND,
  PURCHASE_STATE: PURCHASE_STATE,
  LICENCE_STATE: LICENCE_STATE,
  MONEY_TYPE: MONEY_TYPE,
  TRANSACTION_KIND: TRANSACTION_KIND,
  balance: balance,
  transactions: transactions,
  purchases: purchases,
  comments: comments,
  favorites: favorites,
  license: license
};
