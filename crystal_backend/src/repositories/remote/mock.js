'use strict';

/**
 * THE FIVE SERVICES, ANSWERING IN THEIR OWN WIRE FORMAT.
 *
 * Every reply below is shaped the way the real service shapes it, awkwardness
 * included: the Eshop wraps its rows in a JSON STRING inside the response, its
 * money arrives as a float that the mapper has to fix to two places, and the
 * Appstore answers in DataTables' vocabulary - `mData`, `iTotalRecords`,
 * `iDisplayStart`. None of that is tidied up here.
 *
 * That is the whole point. If this returned the clean shape the pages want,
 * the mapping in eshop.api.js and appstore.api.js would never execute until
 * production. Answering in the wire format means the parser is exercised on
 * every request in development, and switching REMOTE_MOCK off changes the
 * transport and nothing else.
 *
 * DETERMINISTIC, NOT RANDOM. Everything is derived from the member's own key,
 * so a member sees the same orders every time they load the page - a mock that
 * reshuffles on every request makes paging look broken and makes any bug
 * impossible to reproduce.
 *
 * ENGLISH ONLY, AND NOT TRANSLATED. Product names, remarks and cancellation
 * reasons are the SHOP'S data. In a deployment they arrive from the real
 * service in whatever language that service holds them in, and Crystal passes
 * them through untouched - they are content, not labels, and running them
 * through t() would be Crystal editing another company's records. So there is
 * nothing to translate here either: this file stands in for that service, and
 * inventing three translations of data that has none would make the mock
 * behave in a way the real thing never will.
 *
 * The delivery ADDRESSES are the exception, and are Chinese. They are not
 * prose in a language, they are places the shop delivers to - see the note
 * where they are written.
 *
 * The words AROUND the data - the column headers, the tender names, the fill
 * types - ARE Crystal's own and are translated in the frontend catalogues.
 * That is the whole reason `fill_type` is a code and `remark` is prose: the
 * code can be given a word in three languages, the prose cannot.
 */

/* ------------------------------------------------------------------ */
/*  a small deterministic generator                                    */
/* ------------------------------------------------------------------ */

/** FNV-1a over the key, so two members differ and one member does not. */
function seedOf(key) {
  let hash = 2166136261;
  const text = String(key || 'anonymous');

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash);
}

/** A number in [min, max] for this key and this slot. */
function pick(key, slot, min, max) {
  const value = seedOf(String(key) + ':' + slot);
  return min + (value % (max - min + 1));
}

function choose(key, slot, list) {
  return list[pick(key, slot, 0, list.length - 1)];
}

/** n days back from today, at a fixed hour, as the service's own format. */
function stamp(days, hour) {
  const at = new Date(Date.now() - (days * 86400000));
  at.setHours(hour, (hour * 7) % 60, 0, 0);

  const pad = function (n) { return String(n).padStart(2, '0'); };
  return at.getFullYear() + '-' + pad(at.getMonth() + 1) + '-' + pad(at.getDate())
    + ' ' + pad(at.getHours()) + ':' + pad(at.getMinutes()) + ':00';
}

/** The window of a paged request, applied to a generated set. */
function paged(rows, start, length) {
  const from = Number(start) || 0;
  const size = Number(length) || 10;
  return rows.slice(from, from + size);
}

/* ------------------------------------------------------------------ */
/*  the catalogues these services sell from                            */
/* ------------------------------------------------------------------ */

/**
 * THE ESHOP CATALOGUE, with the things an order line has to show.
 *
 * `standard` is the variant actually bought - the colour, the size, the fit.
 * Without it "Crystal C9 Pro 256GB" appears four times in an order history as
 * four identical lines, and a member cannot tell which one the courier lost.
 *
 * `money_type` is the tender the item is sold in: 1 foreign currency, 2
 * native, 3 points. Every item has exactly one, which is what lets an order's
 * three totals be derived from its lines rather than drawn independently and
 * hoped to agree.
 */
const ESHOP_GOODS = [
  { id: 4101, name: 'Crystal C9 Pro 256GB', standard: 'Obsidian / 256GB', money_type: 1, price: 1099 },
  { id: 4102, name: 'Crystal C9 Lite', standard: 'Mist blue / 128GB', money_type: 1, price: 429 },
  { id: 4103, name: 'Crystal Buds Air', standard: 'White', money_type: 1, price: 89.9 },
  { id: 4104, name: 'Crystal 55" QLED TV', standard: '55 inch / wall mount', money_type: 1, price: 749 },
  { id: 4105, name: 'Crystal 4K Set-top Box', standard: '4K HDR / 32GB', money_type: 2, price: 168 },
  { id: 4106, name: 'Crystal Power Bank 20000', standard: '20000mAh / 65W', money_type: 2, price: 44.5 },
  { id: 4107, name: 'Crystal Watch 2', standard: '46mm / graphite', money_type: 1, price: 239 },
  { id: 4108, name: 'Crystal Charger 65W', standard: '65W / two port', money_type: 2, price: 29.9 },
  { id: 4109, name: 'Crystal Case (C9 Pro)', standard: 'Silicone / midnight', money_type: 2, price: 14.5 },
  { id: 4110, name: 'Crystal Screen Film', standard: 'Tempered / two pack', money_type: 3, price: 6.5 },
  { id: 4111, name: 'Crystal Karaoke Mic', standard: 'Wireless / rose', money_type: 3, price: 58 },
  { id: 4112, name: 'Crystal Router AX3', standard: 'AX3000 / three antenna', money_type: 2, price: 62 }
];

const APPS = [
  'Crystal Karaoke', 'Crystal Media Player', 'Crystal Office',
  'Crystal Weather', 'Crystal Notes', 'Crystal Camera Pro',
  'Crystal Fitness', 'Crystal Translate', 'Crystal Radio',
  'Crystal Photo Editor', 'Crystal Files', 'Crystal Keyboard'
];

const COMMENT_TEXT = [
  'Works well on the C9 Pro, no crashes in two weeks.',
  'The update fixed the audio delay, thanks.',
  'Good app but it needs a dark theme.',
  'Loads slowly on older handsets.',
  'Exactly what I needed, and no adverts.',
  'Please add landscape support for the tablet.'
];

/* ------------------------------------------------------------------ */
/*  ESHOP_SERVER_URL                                                   */
/* ------------------------------------------------------------------ */

/**
 * The card.
 *
 * `cardInfo` values are STRINGS on the wire - the vendor coerces every one of
 * them with a unary plus - so they are strings here.
 */
function eshopCardInfo(params) {
  const key = params.userPk;

  return {
    rsp_code: 0,
    cardInfo: {
      cardType: String(pick(key, 'ct', 1, 2)),
      cardLvl: String(pick(key, 'cl', 1, 5)),
      vipNo: 'VIP' + String(pick(key, 'vip', 100000, 999999)),
      customerNo: String(key),
      realValue: String(pick(key, 'real', 1200, 480000) / 100),
      prizeValue: String(pick(key, 'prize', 0, 40000) / 100),
      commerceValue: String(pick(key, 'cv', 0, 90000) / 100),
      accumValue: String(pick(key, 'accum', 20000, 1500000) / 100)
    }
  };
}

/**
 * The wallet log - transactions, experience or commerce value.
 *
 * `data` is a JSON STRING, and `money_value` is a float rather than a fixed
 * decimal. Both are true of the real service, and both are what the mapper
 * exists to deal with.
 *
 * TWO FIELDS DESCRIBE A MOVEMENT, not one. `money_type` is which balance it
 * touched; `fill_type` is HOW it happened - paid, charged, refunded, awarded.
 * The vendor's console showed them as separate columns because they answer
 * separate questions, and the remark is prose that neither can be sorted on.
 */
function eshopTransactions(params) {
  const key = params.userPk;
  const type = Number(params.type) || 0;
  const count = pick(key, 'txn' + type, 14, 38);

  /*
   * What can move each balance, and what each one is called in prose.
   *
   * Money is spent, topped up, refunded and transferred; experience and
   * commerce value are awarded, used and expired, and neither can be charged.
   *
   * THE REMARK IS KEYED OFF THE SAME ENTRY rather than drawn separately.
   * Picking the two independently produced rows reading "TRANSFER" against
   * "Cashback" - a contradiction on the one screen whose entire job is to
   * explain where the money went.
   */
  const fills = type === 0
    ? [
      { code: 'PAY', says: ['Order payment', 'Paid at checkout'] },
      { code: 'CHARGE', says: ['Top up', 'Charged at a branch'] },
      { code: 'REFUND', says: ['Order refunded', 'Cashback'] },
      { code: 'TRANSFER', says: ['Sent to another member'] }
    ]
    : type === 1
      ? [
        { code: 'AWARD', says: ['Purchase experience', 'Review bonus', 'Sign-in bonus'] },
        { code: 'USE', says: ['Spent on a level reward'] },
        { code: 'EXPIRE', says: ['Expired after a year'] }
      ]
      : [
        { code: 'AWARD', says: ['Commerce value earned'] },
        { code: 'USE', says: ['Commerce value used'] },
        { code: 'EXPIRE', says: ['Expired after a year'] }
      ];

  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const slot = 'txn' + type + ':' + i;
    const fill = choose(key, slot + ':f', fills);

    /*
     * THE DIRECTION FOLLOWS THE KIND rather than being drawn separately. A
     * refund that debits the wallet is not a thing, and a mock that produces
     * one sends whoever reads it looking for a bug in the ledger.
     */
    const inbound = ['CHARGE', 'REFUND', 'AWARD'].indexOf(fill.code) > -1;

    rows.push({
      id: 900000 + (seedOf(String(key)) % 1000) * 100 + i,
      shop_id: 1,
      /*
       * Deliberately a float on the money log - the vendor's mapper calls
       * .toFixed(2) on it, and a mock that sent a tidy decimal would leave
       * that line untested. Experience and commerce value are counted, not
       * measured, so they come back whole: 383.17 experience points is not a
       * quantity that exists.
       */
      money_value: type === 0
        ? (pick(key, slot + ':amt', 120, 96000) / 100) * (inbound ? 1 : -1)
        : pick(key, slot + ':amt', 5, 900) * (inbound ? 1 : -1),
      money_type: type,
      fill_type: fill.code,
      remark: choose(key, slot + ':r', fill.says),
      fill_dt: stamp(i * 3 + 1, 9 + (i % 8))
    });
  }

  return { rsp_code: 0, count: rows.length, data: JSON.stringify(paged(rows, params.start, params.length)) };
}

/**
 * THE LINES OF ONE ORDER, derived from the order id and nothing else.
 *
 * Both the order list and the order detail call this, and that is the whole
 * point of it existing. The three tender totals a member sees on a row are
 * the same arithmetic as the lines they see when they open it - a mock where
 * the summary and the detail disagree teaches whoever is reading it to stop
 * believing either one.
 */
function eshopLines(orderId) {
  const count = pick(orderId, 'lines', 1, 4);
  const rows = [];

  for (let i = 0; i < count; i += 1) {
    const slot = 'line:' + i;
    const good = choose(orderId, slot + ':g', ESHOP_GOODS);
    const qty = pick(orderId, slot + ':q', 1, 3);

    /*
     * A discount on roughly one line in three. With none at all `price` and
     * `real_price` are forever equal, the struck-through original never
     * renders, and the one piece of markup that shows a member what they
     * saved would ship having never been drawn.
     */
    const off = pick(orderId, slot + ':off', 0, 2) === 0
      ? pick(orderId, slot + ':pct', 5, 25)
      : 0;

    const real = Number((good.price * (100 - off) / 100).toFixed(2));

    rows.push({
      order_id: orderId,
      goods_id: good.id,
      goods_name: good.name,
      /* A path on the eshop's own host, which is where its pictures live. */
      goods_img: '/upload/goods/' + good.id + '.jpg',
      standard: good.standard,
      money_type: good.money_type,
      price: good.price,
      real_price: real,
      qty: qty,
      real_total_price: Number((real * qty).toFixed(2)),
      status: choose(orderId, slot + ':st', [3, 5, 7, 9]),
      delivery_no: 'DL' + String(pick(orderId, slot + ':d', 100000, 999999))
    });
  }

  return rows;
}

/** The three tenders an order can be paid in, totalled from its own lines. */
function eshopTenders(lines) {
  const sums = { 1: { qty: 0, price: 0 }, 2: { qty: 0, price: 0 }, 3: { qty: 0, price: 0 } };

  lines.forEach(function (line) {
    const bucket = sums[line.money_type] || sums[1];
    bucket.qty += line.qty;
    bucket.price += line.real_total_price;
  });

  return {
    foreign_qty: sums[1].qty,
    foreign_price: Number(sums[1].price.toFixed(2)),
    native_qty: sums[2].qty,
    native_price: Number(sums[2].price.toFixed(2)),
    point_qty: sums[3].qty,
    point_price: Number(sums[3].price.toFixed(2))
  };
}

/**
 * The order list. `lists` is a JSON string; status is a code the mapper names.
 *
 * AN ORDER IS NOT PRICED IN ONE CURRENCY. The eshop sells in three tenders -
 * foreign currency, native currency and points - and one order can span them,
 * which is why there are three quantity/price pairs and no total. They do not
 * add up, and a column that summed them would be arithmetic on three
 * different units.
 *
 * A CANCELLED ORDER CARRIES ITS REASON, and which of the two fields it lands
 * in says who cancelled it: `user_reason` is the member's, `reason` is the
 * shop's. A live order has neither, which is how the pages tell them apart.
 */
function eshopOrders(params) {
  const key = params.userPk;
  const count = pick(key, 'orders', 6, 21);
  const codes = [-5, -2, 0, 3, 5, 7, 9];

  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const slot = 'order:' + i;
    const orderId = 'ES' + String(pick(key, slot + ':id', 10000000, 99999999));
    const status = choose(key, slot + ':st', codes);

    const lines = eshopLines(orderId);
    const cancelled = Number(status) < 0;
    const byMember = pick(key, slot + ':who', 0, 1) === 0;

    rows.push(Object.assign({
      order_id: orderId,
      order_no: 'ES-' + stamp(i * 5 + 2, 10).slice(0, 10).replace(/-/g, '') + '-' + (100 + i),
      status: status,
      /* The first line names the order; the rest are "and N more". */
      goods_name: lines[0].goods_name,
      goods_count: lines.reduce(function (sum, line) { return sum + line.qty; }, 0),
      pay_type: choose(key, slot + ':pay', ['Wallet', 'Card', 'Cash on delivery']),
      receiver: 'Crystal member',
      /*
       * THE ADDRESSES ARE CHINESE, and they are the exception to the note at
       * the top of this file for a reason rather than by oversight.
       *
       * The shop delivers in China, so its addresses are Chinese places
       * written the way China writes them - province to street to room, no
       * commas - and a phone number in the shape a Chinese mobile actually
       * takes. This is the one field where English would be the WRONG mock:
       * an address is not prose to be translated, it is a place, and a page
       * laid out against "Kwangbok Street 45" discovers on the day it goes
       * live that real addresses are twice as wide and do not wrap on spaces.
       */
      address: choose(key, slot + ':ad', [
        '北京市朝阳区建国路88号',
        '上海市浦东新区世纪大道100号',
        '深圳市南山区科技园南路55号',
        '广州市天河区天河路228号'
      ]),
      building: pick(key, slot + ':bl', 1, 24) + '号楼 ' + pick(key, slot + ':fl', 101, 1904) + '室',
      contact: '138-' + pick(key, slot + ':ph', 1000, 9999) + '-' + pick(key, slot + ':ph2', 1000, 9999),
      user_reason: cancelled && byMember
        ? choose(key, slot + ':ur', ['Ordered the wrong size', 'No longer needed', 'Found it cheaper in store'])
        : '',
      reason: cancelled && !byMember
        ? choose(key, slot + ':sr', ['Out of stock', 'Cannot deliver to this address', 'Payment not confirmed in time'])
        : '',
      order_dt: stamp(i * 5 + 2, 11 + (i % 6))
    }, eshopTenders(lines)));
  }

  return {
    status: 'success',
    data: { tCount: rows.length, lists: JSON.stringify(paged(rows, params.start, params.length)) }
  };
}

/** One order's lines. Here `lists` is a real array, not a string - as it is upstream. */
function eshopOrderDetail(params) {
  return { status: 'success', data: { lists: eshopLines(params.orderId) } };
}

/* ------------------------------------------------------------------ */
/*  APPSTORE_SERVER_URL and APPSTORE_WALLET_URL                        */
/* ------------------------------------------------------------------ */

/** Coins. The wallet answers a bare object with the HTTP status as the code. */
function appstoreBalance(params) {
  const key = params.unique_id;
  return {
    remaining_coins: pick(key, 'coins', 0, 48000) / 100,
    frozen_coins: pick(key, 'frozen', 0, 3000) / 100,
    unique_id: key
  };
}

/**
 * The coin statement, on the wallet's v3 endpoint.
 *
 * NOT THE v2 ONE, which the vendor also has and also still calls - from its
 * console. The member-facing page uses `/api/v3/histories`, so that is what
 * is transcribed here: a GET with a query string, `meta.code` for success,
 * `data.items` for the rows, and NO total. It reports `last_page` and the
 * vendor multiplies it by the page size, which overstates the count by up to
 * a page. That is faithfully what the member's paging is built on, and the
 * mapper says so where it does the multiplication.
 */
function appstoreHistories(params) {
  const key = params.unique_id;
  const size = Number(params.count) || 10;
  const page = Number(params.page) || 0;
  const wanted = Number(params.type) || 0;

  const count = pick(key, 'awtxn', 10, 30);

  const items = [];
  for (let i = 0; i < count; i += 1) {
    const slot = 'awtxn:' + i;
    const kind = pick(key, slot + ':k', 1, 5);

    /*
     * THE SIGN FOLLOWS THE KIND. A purchase that credits the wallet is not a
     * thing, and a statement that shows one sends the reader looking for a
     * bug that is not in the code.
     */
    const inbound = [1, 3, 4].indexOf(kind) > -1;

    items.push({
      unique_id: 'AW' + String(pick(key, slot + ':u', 10000000, 99999999)),
      money_value: String((pick(key, slot + ':a', 100, 24000) / 100) * (inbound ? 1 : -1)),
      /* 0 immaterial, 1 company, 2 foreign - see appstore.api.js. */
      money_value_type_id: String(pick(key, slot + ':m', 0, 2)),
      transaction_type_id: String(kind),
      transaction_number: 'TX' + String(pick(key, slot + ':t', 1000000, 9999999)),
      transaction_detail_1: choose(key, slot + ':d', [
        'Coin top up', 'App purchase', 'In-app item', 'Refund', 'Transfer received'
      ]),
      created_at: stamp(i * 2 + 1, 13 + (i % 6))
    });
  }

  /* The type filter the member's select drives; 0 means every kind. */
  const shown = wanted
    ? items.filter(function (row) { return Number(row.transaction_type_id) === wanted; })
    : items;

  return {
    meta: { code: 0 },
    data: {
      last_page: Math.max(1, Math.ceil(shown.length / size)),
      items: paged(shown, page * size, size)
    }
  };
}

/**
 * ONE PURCHASE'S STATE, from its id and nothing else.
 *
 * Both the purchase list and the licence endpoint call this, and the id is
 * the only seed they share - the licence endpoint is keyed by it and never
 * sees the customer. Drawn separately, the list says "purchased, licence
 * issued" while the licence call on the same row says "cancelled", and a
 * member clicking the key button is told their own purchase does not exist.
 */
function purchaseState(purchaseId) {
  return pick(purchaseId, 'spd', 1, 5);
}

/**
 * Purchases, in DataTables' vocabulary - mData and iTotalRecords.
 *
 * AN APPSTORE PURCHASE IS NOT ALWAYS AN APP. The store also sells diamonds,
 * avatars, event items and nicknames, and each names itself in its own field -
 * `app_name`, `diamond_name`, `eventitem_title`, `nickname_name` - with
 * `purchasable_type` saying which one to read. A mock that only ever produced
 * apps would let a page ship that reads `app_name` unconditionally and shows
 * four blank rows the first time a member buys anything else.
 */
function appstorePurchases(params) {
  const key = params.customer_id;
  const count = pick(key, 'purch', 8, 26);
  const kinds = ['appversion', 'diamond', 'avatar', 'eventitem', 'nickname'];

  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const slot = 'purch:' + i;
    const kind = choose(key, slot + ':t', kinds);
    const purchaseId = 'PH' + String(pick(key, slot + ':id', 10000000, 99999999));

    /*
     * THE STATE COMES OFF THE PURCHASE ID, not off this loop.
     *
     * The licence endpoint is keyed by the purchase id and nothing else, so
     * that is the only seed both can reach. Drawn from the customer's key
     * instead, the list would say "purchased, licence issued" while the
     * licence call on the same row said "cancelled" - and a member clicking
     * the key button would be told their purchase does not exist.
     */
    const state = purchaseState(purchaseId);

    rows.push({
      purchase_history_unique_id: purchaseId,
      purchasable_type: kind,
      purchasable_id: pick(key, slot + ':pid', 1000, 9999),
      /* Only the field its own type uses is filled in, as upstream. */
      app_name: kind === 'appversion' ? choose(key, slot + ':a', APPS) : '',
      app_version: kind === 'appversion' ? '2.' + pick(key, slot + ':v', 0, 9) + '.' + pick(key, slot + ':p', 0, 9) : '',
      diamond_name: kind === 'diamond' ? pick(key, slot + ':d', 1, 20) * 50 + ' diamonds' : '',
      eventitem_title: kind === 'eventitem'
        ? choose(key, slot + ':e', ['Spring festival pack', 'Anniversary badge', 'Weekend boost'])
        : '',
      nickname_name: kind === 'nickname'
        ? choose(key, slot + ':n', ['StarGazer', 'BlueRiver', 'QuietForest'])
        : '',
      device_no: 'CR' + String(pick(key, slot + ':dev', 100000000, 999999999)),
      /* 0 immaterial, 1 company. */
      purchasemoney_type: String(pick(key, slot + ':mt', 0, 1)),
      purchase_actual_value: pick(key, slot + ':pr', 0, 12000) / 100,
      spd_state_id: state,
      /* Only a failure explains itself. */
      spd_change_reason: state === 4
        ? choose(key, slot + ':r', ['Device not registered', 'Not enough coins', 'Licence server timeout'])
        : '',
      created_at: stamp(i * 4 + 1, 15 + (i % 5))
    });
  }

  return { iTotalRecords: rows.length, mData: paged(rows, params.iDisplayStart, params.iDisplayLength) };
}

/**
 * Comments the member left, with the app they are about NESTED under `app`.
 *
 * `active` is whether the store has approved it. A member's own comment can
 * sit unapproved for days, and a page that does not say so reads as one that
 * lost it.
 */
function appstoreComments(params) {
  const key = params.customer_id;
  const count = pick(key, 'comm', 3, 14);

  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const slot = 'comm:' + i;
    const appId = pick(key, slot + ':ai', 1000, 9999);

    rows.push({
      rn: i + 1,
      app: {
        name: choose(key, slot + ':a', APPS),
        app_icon: { icon_48_48_url: '/uploads/icons/' + appId + '_48.png' }
      },
      rating: pick(key, slot + ':s', 3, 5),
      content: choose(key, slot + ':c', COMMENT_TEXT),
      active: pick(key, slot + ':act', 0, 3) > 0 ? 1 : 0,
      created_at: stamp(i * 6 + 2, 16 + (i % 4))
    });
  }

  return { iTotalRecords: rows.length, mData: paged(rows, params.iDisplayStart, params.iDisplayLength) };
}

/** Starred apps. The icon is a bigger one here than on a comment. */
function appstoreFavorites(params) {
  const key = params.customer_id;
  const count = pick(key, 'fav', 4, 16);

  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const slot = 'fav:' + i;
    const appId = pick(key, slot + ':ai', 1000, 9999);

    rows.push({
      unique_id: 'FV' + String(pick(key, slot + ':id', 1000000, 9999999)),
      name: choose(key, slot + ':a', APPS),
      app_icon: { icon_144_144_url: '/uploads/icons/' + appId + '_144.png' },
      active: pick(key, slot + ':act', 0, 4) > 0 ? 1 : 0,
      created_at: stamp(i * 5 + 3, 12 + (i % 7))
    });
  }

  return { iTotalRecords: rows.length, mData: paged(rows, params.iDisplayStart, params.iDisplayLength) };
}

/**
 * A licence. `result` is the success flag on this endpoint, unlike the others.
 *
 * `device_license` IS AN OBJECT, not a string - a key, the file it can be
 * downloaded as, and sometimes a QR image as a hex blob. The vendor's modal
 * branches on which of those it got, so a mock that answered a bare string
 * would leave every one of those branches unvisited.
 *
 * NO QR HERE. It is a photographable image of a licence and there is nothing
 * truthful to put in it - a placeholder JPEG renders as a broken or
 * meaningless code, which is worse on this screen than admitting there is
 * none. The key and the file name are real enough to exercise everything
 * else.
 */
function appstoreLicense(params) {
  const key = params.purchase_history_unique_id;

  return {
    result: true,
    spd_state_id: purchaseState(key),
    device_license: {
      purchase_history_unique_id: key,
      license: 'CR-' + String(pick(key, 'l1', 1000, 9999))
        + '-' + String(pick(key, 'l2', 1000, 9999))
        + '-' + String(pick(key, 'l3', 1000, 9999))
        + '-' + String(pick(key, 'l4', 1000, 9999)),
      license_file: key + '.lic',
      license_file_url: String(pick(key, 'lf', 100, 999)),
      qr: null
    }
  };
}

/* ------------------------------------------------------------------ */
/*  WEB_SERVER_URL - the eproduct site                                 */
/* ------------------------------------------------------------------ */

/**
 * THE ONE THAT ANSWERS IN THREE DIFFERENT SHAPES.
 *
 * The eproduct site is one deployment with one base url and no house style at
 * all: the registration balance answers a bare object, the registration log
 * wraps itself in `{ code, data }` where `code` is 0 for success, and the
 * three keygen logs answer `{ code, total, data }` where `code` is truthy for
 * FAILURE. Reading the last one as though 0 meant success gets every request
 * backwards, and the vendor's own mapper tests it three different ways.
 *
 * All five are GETs with a query string.
 */

/** Points held for registering products, and what has been spent. */
function eprodBalance(params) {
  const key = params.userid;

  return {
    userid: key,
    balance: pick(key, 'ebal', 0, 26000),
    used: pick(key, 'eused', 0, 9000),
    registered: pick(key, 'ereg', 1, 14)
  };
}

/** The devices this member has registered. `{ code: 0, data: {...} }`. */
function eprodRegisterLog(params) {
  const key = params.userid;
  const count = pick(key, 'ereglog', 4, 17);

  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const slot = 'ereg:' + i;
    const good = choose(key, slot + ':g', ESHOP_GOODS);

    rows.push({
      table_pk: 700000 + (seedOf(String(key)) % 900) * 100 + i,
      sn_num: 'CR' + String(pick(key, slot + ':sn', 100000000, 999999999)),
      product_name: good.name,
      contact_num: '138-' + pick(key, slot + ':p1', 1000, 9999) + '-' + pick(key, slot + ':p2', 1000, 9999),
      address: choose(key, slot + ':ad', [
        '北京市朝阳区建国路88号',
        '上海市浦东新区世纪大道100号',
        '深圳市南山区科技园南路55号',
        '广州市天河区天河路228号'
      ]),
      bonus_score: pick(key, slot + ':b', 100, 2000),
      /* 0 waiting, 1 approved, 2 rejected - see web.api.js. */
      status: pick(key, slot + ':st', 0, 2),
      created_at: stamp(i * 7 + 3, 10 + (i % 8))
    });
  }

  return {
    code: 0,
    data: { total: rows.length, rows: paged(rows, params.offset, params.limit) }
  };
}

/**
 * A keygen log, for whichever system asked.
 *
 * KARAOKE AND MANBANG SHARE A SHAPE and B-media does not, which is why the
 * vendor has three endpoints and two mappers. The two that match are
 * generated here by one function taking the system as an argument - the
 * alternative is two near-identical copies that drift the first time one is
 * edited.
 *
 * `code` is truthy for FAILURE on these three, the opposite of the
 * registration log above.
 */
function keygenLog(params, system) {
  const key = params.userid;
  const count = pick(key, 'keygen:' + system, 5, 22);

  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const slot = system + ':' + i;
    /* Most attempts succeed; the ones that do not are why `message` exists. */
    const failed = pick(key, slot + ':r', 0, 5) === 0;

    rows.push({
      id: 'KG' + String(pick(key, slot + ':id', 10000000, 99999999)),
      machinekey: 'MK-' + String(pick(key, slot + ':mk', 100000, 999999))
        + '-' + String(pick(key, slot + ':mk2', 100000, 999999)),
      real_price: pick(key, slot + ':pr', 0, 24000) / 100,
      /* 0 succeeded, anything else did not - the vendor tests `=== 0`. */
      resultlog: failed ? pick(key, slot + ':e', 1, 9) : 0,
      message: failed
        ? choose(key, slot + ':m', ['Machine key not recognised', 'Not enough points', 'Already licensed'])
        : 'Issued',
      is_agent: pick(key, slot + ':a', 0, 3) === 0 ? 1 : 0,
      transaction_number: 'TR' + String(pick(key, slot + ':t', 1000000, 9999999)),
      error_status: failed ? String(pick(key, slot + ':e', 1, 9)) : '',
      licensefilepath: failed ? '' : '/licenses/' + system + '/' + pick(key, slot + ':f', 1000, 9999) + '.lic',
      updated_at: stamp(i * 4 + 2, 9 + (i % 9))
    });
  }

  /*
   * NO `code` AT ALL ON A SUCCESS, which is what the vendor tests for.
   * Its mapper reads `if (data.code || !data.data) fail` - a TRUTHINESS
   * test, written that way because this endpoint reports a code only when
   * something went wrong. Sending `code: 0` here would be harmless and
   * would also make the endpoint indistinguishable from the registration
   * log, whose 0 means success - and the whole point of keeping the two
   * apart is that reading either one the wrong way empties the list.
   */
  return { total: rows.length, data: paged(rows, params.offset, params.limit) };
}

function karaokeKeygenLog(params) {
  return keygenLog(params, 'karaoke');
}

function manbangKeygenLog(params) {
  return keygenLog(params, 'manbang');
}

/**
 * The B-media keygen log, which is a different shape from the other two.
 *
 * It licenses per PROVIDER rather than per machine key, and it splits what
 * was paid from what was awarded back - `cal_price` against `bonus_price` -
 * where the other two have one figure.
 */
function bmediaKeygenLog(params) {
  const key = params.userid;
  const count = pick(key, 'bmedia', 4, 19);

  const providers = [
    { short_name: 'MRS', name: 'Mansudae Radio Service' },
    { short_name: 'KCT', name: 'Korea Central TV' },
    { short_name: 'RGN', name: 'Ryugyong Network' },
    { short_name: 'PSC', name: 'Paeksong Channel' }
  ];

  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const slot = 'bm:' + i;
    const provider = choose(key, slot + ':p', providers);
    const paid = pick(key, slot + ':c', 100, 18000) / 100;

    rows.push({
      id: 'BM' + String(pick(key, slot + ':id', 10000000, 99999999)),
      dev_id: 'DEV-' + String(pick(key, slot + ':d', 100000000, 999999999)),
      short_name: provider.short_name,
      provider_name: provider.name,
      is_agent: pick(key, slot + ':a', 0, 3) === 0 ? 1 : 0,
      cal_price: paid,
      /* A tenth back, roughly, which is what makes two columns worth having. */
      bonus_price: Number((paid * pick(key, slot + ':b', 5, 15) / 100).toFixed(2)),
      date_time: stamp(i * 6 + 1, 11 + (i % 7))
    });
  }

  /* No `code` on a success - see the note on keygenLog above. */
  return { total: rows.length, data: paged(rows, params.offset, params.limit) };
}

/* ------------------------------------------------------------------ */
/*  the switchboard                                                    */
/* ------------------------------------------------------------------ */

const ROUTES = {
  '/www/backend/others/pid_apis/fetch_card_info': eshopCardInfo,
  '/www/backend/others/pid_apis/get_transactions': eshopTransactions,
  '/www/backend/others/pid_apis/getUserOrderLists': eshopOrders,
  '/www/backend/others/pid_apis/getOrderDetail': eshopOrderDetail,
  '/api/v2/maininfo/remainingCoins': appstoreBalance,
  '/api/v3/histories': appstoreHistories,
  '/api/maininfo/getPurchaseTableData': appstorePurchases,
  '/api/maininfo/getCommentTableData': appstoreComments,
  '/api/maininfo/getFavouriteTableData': appstoreFavorites,
  '/api/maininfo/getSpdMsg': appstoreLicense,

  '/eproduct/api/client/eprod_regist_balance': eprodBalance,
  '/eproduct/api/client/eprod_buyer_product_mobile': eprodRegisterLog,
  '/eproduct/api/client/keygen_karaoke_log_new': karaokeKeygenLog,
  '/eproduct/api/client/keygen_manbang_log_new': manbangKeygenLog,
  '/eproduct/api/client/media_license_log_new': bmediaKeygenLog
};

/**
 * Answer as the service would.
 *
 * An unknown path THROWS rather than returning an empty result, because the
 * only way to reach one is a caller inventing an endpoint the vendor does not
 * have - and a silent empty list would let that ship.
 */
function respond(service, url, params) {
  const handler = ROUTES[url];
  if (!handler) {
    throw new Error('no mock for ' + service + ' ' + url + ' - is that a real endpoint?');
  }

  return Promise.resolve(handler(params || {}));
}

module.exports = { respond: respond, ROUTES: Object.keys(ROUTES) };
