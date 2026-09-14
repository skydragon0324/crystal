/**
 * Mock implementations of the three outbound HTTP clients.
 *
 * Roughly half the account area never touches the database. The eshop,
 * appstore and licence-keygen pages proxy separate services through
 * api/eshopApi.js, api/appstoreApi.js and api/webApi.js, so seeding
 * Postgres does nothing for them - with ESHOP_SERVER_URL and friends
 * unset, axios is handed an undefined baseURL, the request fails, and
 * the controller turns that into a 500. The page shows an error strip
 * and no rows.
 *
 * Set USE_MOCK_API=true and each api/ module swaps the functions below
 * in for its own. Nothing else changes: the controllers, the validators
 * and verifyWebToken all still run, and the endpoints that DO read the
 * database keep reading it. That is the difference from USE_MOCK=true,
 * which replaces the whole of /vendor/api and needs no database at all.
 *
 * The contract each function has to honour is its REAL counterpart's
 * return value, not the upstream service's payload - the api/ layer
 * reshapes what it receives, and the controllers and pages are written
 * against the reshaped form. Where a real function returns
 * `createResponse(SUCCESS, { total, rows })`, so does the mock.
 *
 * Data is deterministic: the same account id always produces the same
 * rows, so a reload does not reshuffle the table under you.
 */
const { createResponse } = require('../utils/response');
const RESP_CODES = require('../constants/responseCodes');
const { ESHOP_LOG_TYPE, ESHOP_ORDER_STATUS_LIST } = require('../constants/constants');

/* ------------------------------------------------------------------ *
 * Deterministic pseudo-randomness
 *
 * Same generator as mock/fixtures.js. Seeding from the account id means
 * two different users get different histories while either one stays
 * stable across restarts.
 * ------------------------------------------------------------------ */

function hashSeed(value) {
  const str = String(value == null ? 'anon' : value);
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A generator bound to one account id plus a per-dataset salt. */
function gen(id, salt) {
  const rng = makeRng(hashSeed(salt + ':' + id));
  const int = (min, max) => min + Math.floor(rng() * (max - min + 1));
  return {
    rng,
    int,
    pick: (arr) => arr[int(0, arr.length - 1)],
    chance: (pct) => rng() * 100 < pct,
  };
}

/* ---------- timestamps ---------- */

const pad = (n) => (n < 10 ? '0' + n : '' + n);

/** 'YYYY-MM-DD HH:MM:SS', `daysAgo` days before now. */
function stamp(daysAgo, hour, minute) {
  const d = new Date(Date.now() - daysAgo * 86400000);
  if (hour !== undefined) d.setHours(hour, minute || 0, 0, 0);
  return (
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
    pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
  );
}

/**
 * Page an array the way the upstream services do.
 *
 * They are all offset/limit and they all report the FULL count, not the
 * length of the page - the pager reads `total` to decide how many page
 * buttons to draw, so returning the sliced length pins it to one page.
 */
function paged(rows, offset, limit) {
  const start = +offset || 0;
  const size = +limit || 10;
  return { total: rows.length, rows: rows.slice(start, start + size) };
}

/** Apply the keyword/date filter the real services apply server-side. */
function applyFilter(rows, filter, fields, dateField) {
  let out = rows;
  const keyword = filter && filter.keyword ? String(filter.keyword).toLowerCase().trim() : '';
  if (keyword) {
    out = out.filter((row) =>
      fields.some((f) => String(row[f] == null ? '' : row[f]).toLowerCase().includes(keyword))
    );
  }
  if (filter && filter.from) {
    out = out.filter((row) => String(row[dateField]).slice(0, 10) >= filter.from);
  }
  if (filter && filter.to) {
    out = out.filter((row) => String(row[dateField]).slice(0, 10) <= filter.to);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Shared vocabulary
 * ------------------------------------------------------------------ */

const APPS = [
  'Pocket Dictionary', 'City Transit', 'Photo Studio', 'Notes Plus',
  'Weather Now', 'Chess Master', 'Fitness Log', 'Recipe Box',
];

const GOODS = [
  'Wireless earbuds', 'Phone case', 'Fast charger', 'Screen protector',
  'Power bank', 'USB-C cable', 'Bluetooth speaker', 'Memory card',
];

const PROVINCES = [
  'Capital', 'North Province', 'South Province', 'East Province',
  'West Province', 'Coastal Region', 'Highland Region',
];

const PROVIDERS = [
  { id: 1, name: 'Central Media Distribution', short_name: 'Central Media' },
  { id: 2, name: 'Northern Studio Ltd', short_name: 'Northern Studio' },
  { id: 3, name: 'Coastal Records Group', short_name: 'Coastal Records' },
];

/* ------------------------------------------------------------------ *
 * eshop
 * ------------------------------------------------------------------ */

/**
 * Wallet / experience / commerce-value log.
 *
 * One upstream endpoint serves three pages, split on `type`, so the
 * three datasets differ in what they record even though the row shape
 * is identical. money_value is a STRING here: the real function runs
 * .toFixed(2) over it, and the page prints it as-is.
 */
function eshopLog(userPk, type) {
  const g = gen(userPk, 'eshop-log-' + type);
  const detailsByType = {
    [ESHOP_LOG_TYPE.TRANSACTION]: [
      'Order payment', 'Wallet top-up', 'Refund for cancelled order',
      'Promotion credit', 'Points converted to wallet',
    ],
    [ESHOP_LOG_TYPE.EXP]: [
      'Order completed', 'Review posted', 'Daily check-in', 'Referral bonus',
    ],
    [ESHOP_LOG_TYPE.COMMERCE_VALUE]: [
      'Monthly settlement', 'Order value credited', 'Adjustment',
    ],
  };
  const details = detailsByType[type] || detailsByType[ESHOP_LOG_TYPE.TRANSACTION];
  const count = type === ESHOP_LOG_TYPE.TRANSACTION ? 31 : type === ESHOP_LOG_TYPE.EXP ? 18 : 14;

  const rows = [];
  for (let i = 0; i < count; i += 1) {
    rows.push({
      id: hashSeed(userPk) % 100000 + i + 1,
      // 0 Experience, 3 Wallet, 4 Bonus - ESHOP_MONEY_TYPES on the client.
      money_type: g.pick([0, 3, 4]),
      fill_type: g.pick(['pay', 'bonus', 'back', 'refund', 'combine', 'transfer']),
      money_value: ((g.chance(55) ? 1 : -1) * g.int(2, 90) * 1000).toFixed(2),
      detail: g.pick(details),
      fill_dt: stamp(i * 3 + 1, 9, 5),
    });
  }
  return rows;
}

function eshopOrders(userPk) {
  const g = gen(userPk, 'eshop-orders');
  const rows = [];
  for (let i = 0; i < 23; i += 1) {
    const foreign_qty = g.chance(50) ? g.int(1, 3) : 0;
    const native_qty = g.chance(60) ? g.int(1, 5) : 0;
    const point_qty = g.chance(30) ? g.int(1, 2) : 0;
    // Raw upstream status id; fetchEshopOrderList maps it to a label.
    const statusId = g.pick([-5, -2, 0, 1, 3, 4]);
    rows.push({
      id: hashSeed(userPk) % 100000 * 100 + i + 1,
      status: statusId,
      foreign_qty,
      foreign_price: foreign_qty * g.int(20, 180) * 1000,
      native_qty,
      native_price: native_qty * g.int(5, 60) * 1000,
      point_qty,
      point_price: point_qty * g.int(100, 900),
      address: g.pick(PROVINCES) + ', ' + g.int(1, 200) + ' Market Street',
      building: 'Building ' + g.pick(['A', 'B', 'C']) + ', Apt ' + g.int(101, 920),
      contact: '191-' + g.int(200, 999) + '-' + g.int(1000, 9999),
      user_reason: statusId === -2 ? 'Ordered the wrong colour' : '',
      reason: statusId === -5 ? 'Out of stock at the fulfilment centre' : '',
      created_at: stamp(i * 5 + 1, 11, 20),
    });
  }
  return rows;
}

const eshopApi = {
  async fetchCardInfo(userPk) {
    const g = gen(userPk, 'eshop-card');
    return createResponse(RESP_CODES.SUCCESS, {
      card_type: g.int(0, 2),
      card_level: g.int(1, 5),
      vip_no: 'VIP-' + (hashSeed(userPk) % 900000 + 100000),
      customer_no: 'C-' + (hashSeed(userPk) % 9000000 + 1000000),
      real_value: g.int(5, 250) * 1000,
      prize_value: g.int(1, 60) * 1000,
      commerce_value: g.int(1000, 40000),
      accum_value: g.int(10, 400) * 1000,
    });
  },

  async fetchTransactionLog(userPk, offset, limit, filter) {
    const type = filter && filter.type ? filter.type : ESHOP_LOG_TYPE.TRANSACTION;
    const rows = applyFilter(eshopLog(userPk, type), filter, ['detail'], 'fill_dt');
    return createResponse(RESP_CODES.SUCCESS, paged(rows, offset, limit));
  },

  async fetchEshopOrderList(userPk, offset, limit) {
    // Same status -> label mapping the real client applies.
    const rows = eshopOrders(userPk).map((row) => {
      const statusItem = ESHOP_ORDER_STATUS_LIST.find((item) => item.id === +row.status);
      return { ...row, status: statusItem ? statusItem.name : '' };
    });
    return createResponse(RESP_CODES.SUCCESS, paged(rows, offset, limit));
  },

  async fetchEshopOrderDetail(orderId) {
    const g = gen(orderId, 'eshop-order-detail');
    const rows = [];
    const lines = g.int(1, 4);
    for (let i = 0; i < lines; i += 1) {
      const qty = g.int(1, 3);
      const price = g.int(8, 220) * 1000;
      const real_price = Math.round(price * 0.95);
      rows.push({
        good_id: Number(orderId) * 10 + i,
        goods_id: Number(orderId) * 10 + i,
        goods_name: g.pick(GOODS),
        goods_img: '',
        qty,
        price,
        real_price,
        real_total_price: real_price * qty,
        status: '',
      });
    }
    return createResponse(RESP_CODES.SUCCESS, { rows });
  },
};

/* ------------------------------------------------------------------ *
 * appstore
 * ------------------------------------------------------------------ */

// The client switches on these exact strings (APPSTORE_PURCHASE_TYPE),
// backslashes included - they are PHP class names from the upstream app.
const PURCHASABLE_TYPES = [
  'App\\Models\\Diamond',
  'App\\Models\\AppVersion',
  'App\\Models\\Avatar',
  'App\\Models\\EventItem',
  'App\\Models\\Nickname',
];

function appstorePurchases(customerId) {
  const g = gen(customerId, 'appstore-purchases');
  const rows = [];
  for (let i = 0; i < 27; i += 1) {
    const purchasable_type = g.pick(PURCHASABLE_TYPES);
    // 0..6, matching APPSTORE_LICENSE_STATES on the client.
    const spd_state_id = g.int(0, 6);
    const app_name = g.pick(APPS);
    rows.push({
      purchase_history_unique_id: 'PH-' + hashSeed(customerId) % 100000 + '-' + (i + 1),
      purchasable_type,
      purchasable_id: 500 + i,
      app_name: purchasable_type === 'App\\Models\\AppVersion' ? app_name : '',
      diamond_name: purchasable_type === 'App\\Models\\Diamond' ? g.int(60, 1200) + ' Diamonds' : '',
      eventitem_title: purchasable_type === 'App\\Models\\EventItem' ? 'Summer Event Pack' : '',
      nickname_name: purchasable_type === 'App\\Models\\Nickname' ? 'Nickname change' : '',
      device_no: 'DEV-' + g.int(100000, 999999),
      purchasemoney_type: g.pick([0, 1]),
      purchase_actual_value: g.int(100, 30000),
      spd_state_id,
      spd_change_reason: spd_state_id === 3 ? 'Payment declined' : '',
      created_at: stamp(i * 4 + 1, 10, 0),
    });
  }
  return rows;
}

function appstoreComments(customerId) {
  const g = gen(customerId, 'appstore-comments');
  const rows = [];
  for (let i = 0; i < 16; i += 1) {
    rows.push({
      rn: i + 1,
      // The page reads the app through row.app?.app_icon?.icon_48_48_url,
      // so this stays nested rather than being flattened.
      app: {
        name: g.pick(APPS),
        app_icon: { icon_48_48_url: '/images/app/icon_48.png' },
      },
      rating: g.int(1, 5),
      content: g.pick([
        'Works well, no complaints after a month of daily use.',
        'Solid, but the sync could be faster on mobile data.',
        'Crashed on launch until the latest update fixed it.',
        'Exactly what I needed. Simple and quick.',
      ]),
      active: g.pick([0, 1]),
      created_at: stamp(i * 7 + 2, 20, 15),
    });
  }
  return rows;
}

function appstoreFavorites(customerId) {
  const g = gen(customerId, 'appstore-favorites');
  const rows = [];
  for (let i = 0; i < 12; i += 1) {
    rows.push({
      unique_id: 'FAV-' + hashSeed(customerId) % 100000 + '-' + (i + 1),
      app_icon: '/images/app/icon_144.png',
      name: APPS[i % APPS.length],
      active: g.pick([0, 1]),
      created_at: stamp(i * 11 + 4, 18, 30),
    });
  }
  return rows;
}

function appstoreWallet(uniqueId) {
  const g = gen(uniqueId, 'appstore-wallet');
  const rows = [];
  for (let i = 0; i < 22; i += 1) {
    rows.push({
      unique_id: 'TX-' + hashSeed(uniqueId) % 100000 + '-' + (i + 1),
      money_value: (g.chance(45) ? 1 : -1) * g.int(50, 5000),
      money_value_type_id: g.pick([0, 1, 2, 3, 4]),   // APPSTORE_MONEY_TYPES
      transaction_type_id: g.int(1, 14),              // APPSTORE_TRANSACTION_TYPES
      transaction_number: 'TN' + g.int(10000000, 99999999),
      transaction_detail_1: g.pick([
        'App purchase', 'Wallet charge', 'Transfer received', 'Transfer sent',
        'Bonus reward', 'Refund',
      ]),
      created_at: stamp(i * 5 + 1, 12, 25),
    });
  }
  return rows;
}

const appstoreApi = {
  async fetchPurchaseLog(customerId, offset, limit, filter) {
    const rows = applyFilter(
      appstorePurchases(customerId), filter,
      ['app_name', 'diamond_name', 'eventitem_title', 'device_no'], 'created_at'
    );
    return createResponse(RESP_CODES.SUCCESS, paged(rows, offset, limit));
  },

  async fetchLicenseQr(purchaseHistoryUniqueId) {
    const g = gen(purchaseHistoryUniqueId, 'appstore-qr');
    return createResponse(RESP_CODES.SUCCESS, {
      spd_state_id: g.int(0, 6),
      // The modal renders this as a QR payload, so any stable string does.
      device_license: 'MOCK-LICENCE-' + hashSeed(purchaseHistoryUniqueId).toString(16).toUpperCase(),
    });
  },

  async fetchAppstoreComments(customerId, offset, limit, filter) {
    let rows = appstoreComments(customerId);
    const keyword = filter && filter.keyword ? String(filter.keyword).toLowerCase().trim() : '';
    if (keyword) {
      rows = rows.filter(
        (row) =>
          row.content.toLowerCase().includes(keyword) ||
          String(row.app.name).toLowerCase().includes(keyword)
      );
    }
    rows = applyFilter(rows, { from: filter && filter.from, to: filter && filter.to }, [], 'created_at');
    return createResponse(RESP_CODES.SUCCESS, paged(rows, offset, limit));
  },

  async fetchAppstoreFavorites(customerId, offset, limit, filter) {
    const rows = applyFilter(appstoreFavorites(customerId), filter, ['name'], 'created_at');
    return createResponse(RESP_CODES.SUCCESS, paged(rows, offset, limit));
  },

  async fetchTransactionLogV2(uniqueId, filter) {
    // filter.page is an OFFSET here, not a page index - webAppstoreController
    // fills it from req.query.offset.
    const rows = applyFilter(
      appstoreWallet(uniqueId),
      { from: filter && filter.from, to: filter && filter.to },
      [], 'created_at'
    );
    return createResponse(RESP_CODES.SUCCESS, paged(rows, filter && filter.page, filter && filter.count));
  },

  async fetchTransactionLog(uniqueId, offset, limit) {
    const rows = appstoreWallet(uniqueId);
    return createResponse(RESP_CODES.SUCCESS, paged(rows, offset, limit));
  },
};

/* ------------------------------------------------------------------ *
 * webApi  --  eproduct registration and licence keygen
 * ------------------------------------------------------------------ */

function eprodRegisterLog(userId) {
  const g = gen(userId, 'eprod-register');
  const rows = [];
  for (let i = 0; i < 15; i += 1) {
    rows.push({
      pk: hashSeed(userId) % 100000 + i + 1,
      sn_num: 'SN' + g.int(1000000000, 9999999999),
      product_name: g.pick([
        'PID-9 Pro', 'PID-9', 'PID-8 Lite', 'Home Hub 2', 'Media Box S',
      ]),
      contact_num: '191-' + g.int(200, 999) + '-' + g.int(1000, 9999),
      address: g.pick(PROVINCES) + ', ' + g.int(1, 200) + ' Market Street',
      bonus_score: g.int(100, 3000),
      status: g.int(0, 2),
      created_at: stamp(i * 12 + 3, 11, 5),
    });
  }
  return rows;
}

/** Karaoke and Manbang keygen logs share a row shape. */
function keygenLog(userId, salt, prefix) {
  const g = gen(userId, salt);
  const rows = [];
  for (let i = 0; i < 17; i += 1) {
    const resultlog = g.pick([0, 0, 0, 1]);
    rows.push({
      id: hashSeed(userId) % 100000 + i + 1,
      machinekey: prefix + '-' + g.int(100000, 999999),
      real_price: g.int(50, 2000),
      is_agent: g.pick([0, 1]),
      resultlog,
      message: resultlog === 0 ? 'Issued' : 'Rejected: machine key already registered',
      transaction_number: 'TN' + g.int(10000000, 99999999),
      // 0 none, 1 reported, 2 withdrawn.
      error_status: g.pick([0, 0, 1, 2]),
      licensefilepath: '/licences/' + prefix.toLowerCase() + '/' + g.int(100000, 999999) + '.lic',
      updated_at: stamp(i * 8 + 2, 17, 55),
    });
  }
  return rows;
}

function bmediaKeygenLog(userId) {
  const g = gen(userId, 'bmedia-keygen');
  const rows = [];
  for (let i = 0; i < 17; i += 1) {
    const provider = g.pick(PROVIDERS);
    rows.push({
      id: hashSeed(userId) % 100000 + i + 1,
      dev_id: 'DEV-' + g.int(100000, 999999),
      short_name: provider.short_name,
      is_agent: g.pick([0, 1]),
      cal_price: g.int(50, 4000),
      bonus_price: g.int(10, 600),
      date_time: stamp(i * 8 + 2, 17, 55),
      license_path: '/licences/bmedia/' + g.int(100000, 999999) + '.lic',
    });
  }
  return rows;
}

const webApi = {
  /**
   * Note the envelope: the controller reads resp.data.total,
   * resp.data.data and resp.data.sum_total, because the real function
   * hands back the upstream body verbatim rather than reshaping it.
   */
  async fetchEprodRegistAddLog(userId, offset, limit) {
    const all = eprodRegisterLog(userId);
    const { total, rows } = paged(all, offset, limit);
    return createResponse(RESP_CODES.SUCCESS, {
      total,
      data: rows,
      sum_total: all.reduce((sum, row) => sum + row.bonus_score, 0),
    });
  },

  async sendLicenseErrorReport() {
    return RESP_CODES.SUCCESS;
  },

  async fetchKaraokeKeygenLog(params) {
    const rows = applyFilter(
      keygenLog(params.userid, 'karaoke-keygen', 'KAR'),
      { keyword: params.keyword, from: params.start_date, to: params.end_date },
      ['machinekey', 'transaction_number'], 'updated_at'
    );
    return createResponse(RESP_CODES.SUCCESS, paged(rows, params.offset, params.limit));
  },

  async fetchManbangKeygenLog(params) {
    const rows = applyFilter(
      keygenLog(params.userid, 'manbang-keygen', 'MB'),
      { keyword: params.keyword, from: params.start_date, to: params.end_date },
      ['machinekey', 'transaction_number'], 'updated_at'
    );
    return createResponse(RESP_CODES.SUCCESS, paged(rows, params.offset, params.limit));
  },

  async fetchBMediaProviders() {
    return createResponse(RESP_CODES.SUCCESS, { total: PROVIDERS.length, rows: PROVIDERS });
  },

  async fetchBMediaKeygenLog(params) {
    let rows = bmediaKeygenLog(params.userid);
    if (params.provider) {
      const provider = PROVIDERS.find((p) => String(p.id) === String(params.provider));
      if (provider) rows = rows.filter((row) => row.short_name === provider.short_name);
    }
    rows = applyFilter(
      rows,
      { keyword: params.keyword, from: params.start_date, to: params.end_date },
      ['dev_id', 'short_name'], 'date_time'
    );
    return createResponse(RESP_CODES.SUCCESS, paged(rows, params.offset, params.limit));
  },

  /** The titles one licence covers, for the detail modal. */
  async fetchBMediaKeygenById(params) {
    const g = gen(params.id, 'bmedia-movies');
    const rows = [];
    const count = g.int(2, 6);
    for (let i = 0; i < count; i += 1) {
      rows.push({
        id: Number(params.id) * 10 + i,
        name: 'Track ' + (i + 1) + ' - ' + g.pick(PROVIDERS).short_name,
        media_price: g.int(50, 900),
        duration: '0' + g.int(2, 9) + ':' + g.int(10, 59),
      });
    }
    return createResponse(RESP_CODES.SUCCESS, { rows });
  },
};

module.exports = { eshopApi, appstoreApi, webApi };
