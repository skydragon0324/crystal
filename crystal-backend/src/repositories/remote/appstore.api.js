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
 * The vendor's page reads it twice - once through APPSTORE_PURCHASE_STATES
 * and once through APPSTORE_LICENSE_STATES - because the same number says
 * both how the purchase ended and where its licence got to. Both readings are
 * kept, named separately, so no page has to know that 0 means "paid" and
 * "issued" at the same time.
 *
 * THE NUMBERS ARE THE VENDOR'S AND THEY START AT ZERO. Crystal had them
 * starting at one, with a five-value purchase table and a four-value licence
 * table, and both were invented - vendor_client/src/constants/constants.js
 * has PURCHASED: 0, PURCHASING: 1 and a SEVEN-value licence table from 0 to
 * 6. Every state was therefore wrong by at least one against the real store,
 * and `licence_available` below - which is what puts the key button on a row
 * - was computed from the same misreading, so it would have appeared on the
 * wrong purchases. Nothing caught it because the mock generated ids in the
 * range this file expected rather than the range the store sends.
 *
 * ONLY TWO PURCHASE STATES EXIST. The vendor has no name for anything above
 * 1, and its page falls back to the store's own `spd_change_reason` and then
 * to "purchase failed" - so a state with no name is not an error here either,
 * and `status` is null rather than a guess. Inventing CANCELLED, FAILED and
 * REFUNDED for 3, 4 and 5 put words in the store's mouth.
 */
const PURCHASE_STATE = { 0: 'PURCHASED', 1: 'PURCHASING' };

const LICENCE_STATE = {
  0: 'SUCCESS',
  1: 'UNUSED',
  2: 'USED',
  3: 'FAIL',
  4: 'REFUND',
  5: 'PENDING',
  6: 'ACCEPT_PENDING'
};

/** Which purse a figure is in. `0` is the store's own non-cash balance. */
const MONEY_TYPE = { 0: 'IMMATERIAL', 1: 'COMPANY', 2: 'FOREIGN' };

/** What moved the coins. */
const TRANSACTION_KIND = {
  1: 'TOPUP', 2: 'PURCHASE', 3: 'REFUND', 4: 'TRANSFER_IN', 5: 'TRANSFER_OUT'
};

/**
 * A licence can be fetched for these two states and no others.
 *
 * The vendor's rule, and it is a rule about the STORE rather than about a
 * table cell: `[PURCHASED, PURCHASING].includes(+row.spd_state_id)` is what
 * draws its key button, and every other state is warned about instead. Since
 * those are now the only two purchase states there are, this is the same as
 * "the store recognised the state" - which is why it is written as the list
 * rather than collapsed into a truthiness test that would stop being true if
 * the store ever grew a third.
 */
const LICENCE_AVAILABLE = ['PURCHASING', 'PURCHASED'];

/*
 * THE STORE SENDS A LARAVEL CLASS NAME, not a word: 'App\Models\Diamond',
 * 'App\Models\AppVersion' (vendor_client constants.js APPSTORE_PURCHASE_TYPE).
 * The table above was keyed on 'diamond' and 'appversion', so every real
 * purchase fell through to the APP default and a diamond, an avatar or a
 * nickname showed a blank name. The last segment of the class, lower-cased,
 * is the key - which also still reads the short form, if one is ever sent.
 */
function purchaseKind(value) {
  const tail = String(value || '').split(/[\\/]/).pop().toLowerCase();
  return PURCHASE_KIND[tail] || 'APP';
}

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

  /*
   * THE FIELDS THE VENDOR READS: `prhn_value` for the coin balance
   * (clientApiController) and `native_score` / `foreign_score` for the two
   * point balances (adminPointController, clientApiController).
   *
   * This read `remaining_coins` and `frozen_coins`, which appear nowhere in
   * the vendor - they were the mock's invention, the mock answered with them,
   * and against the real wallet every balance was 0.
   */
  return {
    coins: Number(data.prhn_value) || 0,
    native_score: Number(data.native_score) || 0,
    foreign_score: Number(data.foreign_score) || 0
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
  /*
   * ONE-BASED. The reply carries `last_page`, which is Laravel's paginator,
   * and Laravel counts pages from 1 - page 0 and page 1 are both the first.
   *
   * Neither earlier version could reach page two. This sent 0, 1, 2 (so the
   * second page repeated the first), and the vendor sends the OFFSET as the
   * page (its client passes offset = page x size, its controller forwards it
   * as `page`), which asks for page 10 on the second screen. Verify against
   * the real wallet: if page two still repeats page one, the service is not
   * Laravel-paginated and this should drop the + 1.
   */
  const page = Math.floor((Number(offset) || 0) / count) + 1;

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

/**
 * AN APP ICON IS SIX FILES, AND NOT ALWAYS ALL SIX.
 *
 * `app_icon` carries up to six named sizes and fills in whichever were
 * generated for that app. Both mappers below used to read exactly ONE of them
 * - the 48 on a comment, the 144 on a favourite - so an app that happens not
 * to have that size drew a blank tile with five perfectly good icons sitting
 * beside it, and where the 48 did exist it was stretched into a tile three
 * times its width.
 *
 * LARGEST FIRST, because scaling a picture down looks like a picture and
 * scaling one up looks like a fault. This order is the one that was asked for
 * and it is also simply descending size.
 *
 * ALL OF THEM ARE SENT, not just the chosen one. The pages draw the same icon
 * at three different sizes and the right file differs per size; picking one
 * here would make the other two wrong. `icon_url` stays as the first present,
 * so a caller that wants one answer still gets the best one.
 */
const ICON_SIZES = [
  'icon_256_256_url',
  'icon_192_192_url',
  'icon_144_144_url',
  'icon_96_96_url',
  'icon_72_72_url',
  'icon_48_48_url'
];

/*
 * WHERE AN ICON LIVES ON THE STORE. The record holds a bare filename and the
 * store serves it from one directory, so the path is built rather than
 * stored - and it is built HERE because a browser cannot: only the API knows
 * whether the store's host is configured, and appstoreUrl answers null when
 * it is not rather than handing back a half-built address.
 */
const ICON_DIR = '/public/images/';

/**
 * The sizes this record actually has, LARGEST FIRST - the ordering rule, on
 * its own and with no host in it.
 *
 * Separated from the two functions below because those can only answer null
 * on a development machine, where the store is mocked and
 * APPSTORE_SERVER_URL is empty: the choice between six sizes would be
 * untestable until production, and choosing wrongly is exactly the bug being
 * fixed. This half is pure, and scripts/check.js exercises it directly.
 */
function iconOrder(icon) {
  return ICON_SIZES.filter(function (size) { return !!(icon && icon[size]); });
}

/** Every size the store actually has for this app, as absolute urls. */
function iconSet(icon) {
  const out = {};

  iconOrder(icon).forEach(function (size) {
    const url = appstoreUrl(ICON_DIR + icon[size]);
    if (url) out[size] = url;
  });

  return out;
}

/** The largest one it has, or null when it has none - see ICON_SIZES. */
function bestIcon(icon) {
  const first = iconOrder(icon)[0];
  return first ? appstoreUrl(ICON_DIR + icon[first]) : null;
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
    const kind = purchaseKind(row.purchasable_type);

    /*
     * NULL, not a guess, for a state the store has no name for. It used to
     * default to PURCHASING, which told the member their purchase was still
     * going through whatever had actually happened to it - and put the key
     * button on the row as well. The page has the vendor's fallback: the
     * store's own `spd_change_reason` when there is one, and "purchase
     * failed" when there is not.
     */
    const state = named(PURCHASE_STATE, row.spd_state_id, null);

    return {
      id: row.purchase_history_unique_id,
      kind: kind,
      name: purchasedName(row, kind),
      url: purchasedUrl(row, kind),
      app_version: row.app_version || null,
      device_no: row.device_no || null,
      /* Which purse it came out of, and how much. */
      currency: named(MONEY_TYPE, row.purchasemoney_type, 'COMPANY'),
      price: Number(row.purchase_actual_value) || 0,
      status: state,
      /* Only a failure explains itself, and the service's words are used. */
      status_reason: row.spd_change_reason || null,
      /*
       * Null for an id outside the table, not 'NONE' - the vendor draws no
       * tag at all there, and 'NONE' is a word it does not have. A state the
       * store invented tomorrow should read as an empty cell rather than as
       * "this purchase has no licence", which is a claim.
       */
      licence_state: named(LICENCE_STATE, row.spd_state_id, null),
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
      icon_url: bestIcon(icon),
      icon_urls: iconSet(icon),
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
      icon_url: bestIcon(icon),
      icon_urls: iconSet(icon),
      /* Whether the app is still published, not whether it is installed. */
      approved: Number(row.active) === 1,
      at: row.created_at
    };
  });
}

/**
 * THE QR AS BYTES, or null - never a picture of nothing.
 *
 * The store sends hex, and `Buffer.from(x, 'hex')` does not refuse bad input:
 * it stops at the first pair that is not hex and returns whatever came
 * before, which for a stray prefix is an empty buffer. Drawn, that is a
 * broken-image icon where the member's licence should be - so an empty or
 * odd-length result is treated as no QR at all, and the page falls back to
 * the key, which is what the vendor shows when there is no QR either.
 */
function qrBytes(hex) {
  if (!hex || typeof hex !== 'string') return null;

  const clean = hex.replace(/\s+/g, '');
  if (!clean || clean.length % 2 || /[^0-9a-f]/i.test(clean)) return null;

  return Buffer.from(clean, 'hex');
}

/*
 * The four image formats a QR could plausibly arrive in, by their first
 * bytes. Anything else is still drawn - a browser sniffs an <img> whatever
 * it is labelled - and is called a JPEG, because that is what the store
 * sends and what the vendor has always labelled it.
 */
function imageType(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (bytes[0] === 0x42 && bytes[1] === 0x4D) return 'image/bmp';
  return 'image/jpeg';
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
  const qr = qrBytes(held.qr);

  return {
    /* Null for a state outside the table, exactly as on the list row. */
    state: named(LICENCE_STATE, data.spd_state_id, null),
    /*
     * AND THE PURCHASE HALF OF THE SAME NUMBER. The vendor's modal refuses to
     * open on anything but PURCHASED - `+resp.data.spd_state_id ===
     * APPSTORE_PURCHASE_STATE.PURCHASED` - so the page needs both readings
     * here, not only the licence one.
     */
    purchase_state: named(PURCHASE_STATE, data.spd_state_id, null),
    licence: licence || null,
    /*
     * HEX ON THE WIRE, base64 in an <img>. The conversion is here rather than
     * in the page because it is a property of the service's encoding, and
     * because a page doing it inline did it with a helper nobody else had.
     */
    qr: qr ? qr.toString('base64') : null,
    /*
     * WHAT KIND OF PICTURE IT IS, read off its first bytes rather than
     * assumed. The vendor labels every QR `data:image/jpg` - which is not
     * even a registered type - and gets away with it because browsers sniff
     * images. A download is not an <img>: the file the member saves takes its
     * extension from this, and a PNG saved as .jpg is a file some viewers
     * refuse to open. Null means there is no QR, not that it is unreadable.
     */
    qr_type: qr ? imageType(qr) : null,
    download_url: held.license_file && held.license_file_url
      ? appstoreUrl('/download/licenses/' + held.license_file_url + '/' + held.license_file)
      : null
  };
}

/* ------------------------------------------------------------------ */
/*  moving coins - the three screens the vendor drew and never wired   */
/* ------------------------------------------------------------------ */

/**
 * CHARGE, TRANSFER AND THE WALLET PASSWORD - and how much of each is the
 * vendor's.
 *
 * The vendor's member console has a "Points" menu whose two entries are
 * AccountAppstoreWalletChargePage and AccountAppstoreWalletTransferPage
 * (vendor_client constants/accountMenus.js, under /vendor/account/wallet).
 * Both act on THIS wallet - their only money type is APPSTORE_MONEY_TYPE, the
 * transfer form asks for a "Wallet Password" - and neither makes a call: the
 * transfer page's handleTransfer sets `loading` twice and returns, and the
 * charge page draws four channel cards with nothing behind them. So what the
 * vendor supplies is the FORM AND ITS RULES, and for two of the four calls
 * below, not the wire.
 *
 *   verifyWalletPassword   TRANSCRIBED - appstoreApi.loginWallet, the
 *                          wallet's `api/v1/users/login_external`.
 *   setWalletPassword      TRANSCRIBED - appstoreApi.changePassword, the
 *                          store's `/api/maininfo/change_password`, which
 *                          writes `prhn_pwd`: the wallet's password.
 *   transfer, charge       NOT TRANSCRIBED. The vendor has no call to copy.
 *                          The paths and fields are Crystal's, written in the
 *                          wallet's own v3 shape (`meta.code`, as
 *                          /api/v3/histories answers), and they have to be
 *                          confirmed with the wallet's owners before
 *                          REMOTE_MOCK is turned off.
 *
 * That last line is stated rather than hidden because of what happens if
 * nobody reads it: against a wallet with no such endpoint the request fails,
 * the member is told the wallet did not accept it, and NOTHING HAS MOVED.
 * For a call that moves money, failing closed is the one acceptable way to
 * be wrong - which is also why the mock refuses anything it would refuse.
 */

/**
 * The purses a member can charge or send, by the vendor's ids.
 *
 * THESE ARE THE CLIENT'S NUMBERS (vendor_client APPSTORE_MONEY_TYPE: COMPANY
 * 1, FOREIGN 3), and they disagree with MONEY_TYPE above, which reads 2 as
 * foreign. The vendor's own APPSTORE_MONEY_TYPES table agrees with the client
 * - 2 is NATIONAL there - so it is MONEY_TYPE that looks wrong; it decodes
 * the statement and the purchase list, it is not this change's to correct, and
 * it is written down here so the two are not mistaken for one table.
 */
const MOVABLE_MONEY = { COMPANY: 1, FOREIGN: 3 };

/**
 * WHICH CHANNEL CAN CHARGE WHICH PURSE - the vendor's charge page, verbatim.
 * WALLET_NATIVE_INFOS lists four for company points and WALLET_FOREIGN_INFOS
 * one for foreign; the letters are the channels' own short names ("Wallet
 * SH") and are not translated anywhere in the vendor either.
 */
const CHARGE_CHANNELS = {
  COMPANY: ['SH', 'MM', 'UR', 'SY'],
  FOREIGN: ['SH']
};

/** The vendor's transfer field: `NumberInput min={0} max={99999999}`. */
const MOVE_LIMIT = 99999999;

/**
 * Is this the wallet's password for this member?
 *
 * The vendor's reading of the reply, kept: `errors` is a failure of the call,
 * `code === 0` with a token is a yes, and any other code is a no with the
 * wallet's own `msg`. `user_userid` is the PLATFORM login - the same id
 * change_password is addressed by (`pvendor_id`), because that endpoint is
 * how the vendor writes this password in the first place.
 */
async function verifyWalletPassword(login, password) {
  const data = await remote.post(WALLET, '/api/v1/users/login_external', {
    user_userid: login,
    password: password
  });

  if (!data || data.errors) {
    throw new Error('the wallet did not answer the password check');
  }

  return {
    accepted: Number(data.code) === 0 && !!data.token,
    message: data.msg || null
  };
}

/**
 * Set the wallet's password.
 *
 * `status === 'success'` or it did not happen; 1010 is the store refusing the
 * request and 9999 the store failing, and both carry a description that is
 * passed back rather than translated - it is the store's sentence.
 */
async function setWalletPassword(login, password) {
  const data = await remote.post(STORE, '/api/maininfo/change_password', {
    pvendor_id: login,
    prhn_pwd: password
  });

  if (data && data.status === 'success') return { accepted: true, message: null };

  return {
    accepted: false,
    message: (data && data.error && data.error.description) || null
  };
}

/** A v3 reply: `meta.code === 0` and a transaction number, or a refusal. */
function moved(data) {
  const meta = (data && data.meta) || {};

  /* `Number(null)` is 0 - an absent code is not a success. */
  if (meta.code === undefined || meta.code === null || Number(meta.code) !== 0) {
    return { accepted: false, reference: null, message: meta.message || null };
  }

  return {
    accepted: true,
    reference: (data.data && data.data.transaction_number) || null,
    message: null
  };
}

/** NOT TRANSCRIBED - see the note above this section. */
async function transfer(uniqueId, targetUniqueId, money, amount) {
  return moved(await remote.post(WALLET, '/api/v3/transfers', {
    unique_id: uniqueId,
    target_unique_id: targetUniqueId,
    money_value_type_id: MOVABLE_MONEY[money],
    money_value: amount
  }));
}

/** NOT TRANSCRIBED - see the note above this section. */
async function charge(uniqueId, money, channel, amount) {
  return moved(await remote.post(WALLET, '/api/v3/charges', {
    unique_id: uniqueId,
    money_value_type_id: MOVABLE_MONEY[money],
    channel: channel,
    money_value: amount
  }));
}

module.exports = {
  PURCHASE_KIND: PURCHASE_KIND,
  PURCHASE_STATE: PURCHASE_STATE,
  LICENCE_STATE: LICENCE_STATE,
  MONEY_TYPE: MONEY_TYPE,
  TRANSACTION_KIND: TRANSACTION_KIND,
  MOVABLE_MONEY: MOVABLE_MONEY,
  CHARGE_CHANNELS: CHARGE_CHANNELS,
  MOVE_LIMIT: MOVE_LIMIT,
  ICON_SIZES: ICON_SIZES,
  iconOrder: iconOrder,
  balance: balance,
  transactions: transactions,
  purchases: purchases,
  comments: comments,
  favorites: favorites,
  license: license,
  verifyWalletPassword: verifyWalletPassword,
  setWalletPassword: setWalletPassword,
  transfer: transfer,
  charge: charge
};
