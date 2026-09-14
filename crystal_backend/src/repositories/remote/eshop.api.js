const remote = require('../../config/remote');
const config = require('../../config');

/**
 * THE ESHOP, over HTTP.
 *
 * A transcription of vendor_backend/api/eshopApi.js: the same four paths, the
 * same parameter names, the same success tests and the same field mapping. It
 * is copied rather than reinterpreted because that file IS the specification
 * for what these endpoints return - there is no schema to read, and a guess
 * that is close enough works until the one field that differs.
 *
 * Two habits of this service that the mapping exists to absorb:
 *
 *   ROWS ARRIVE AS A JSON STRING. `data` on the transaction log and
 *   `data.lists` on the order list are strings containing JSON, not arrays.
 *   They are parsed here so nothing above this file has to know that.
 *
 *   SUCCESS IS SPELLED TWO WAYS. `rsp_code === 0` on the wallet endpoints and
 *   `status === 'success'` on the order ones, in the same service.
 */

const SERVICE = 'eshop';

/** The vendor's ESHOP_LOG_TYPE, and the wallet codes it maps onto. */
const LOG_TYPE = { TRANSACTION: 0, EXP: 1, COMMERCE_VALUE: 2 };
const WALLET_LOG_TYPE = { TRANSACTION: 0, EXP: 1, COMMERCE_VALUE: 10 };
const SHOP_ID = 1;

/**
 * The order status codes, named.
 *
 * Sixteen codes collapse to seven names - the service distinguishes stages a
 * customer does not, so 1, 2 and 0 are all "pending" and 7 and 8 are both
 * "finished". Taken verbatim from the vendor's ESHOP_ORDER_STATUS_LIST.
 */
const ORDER_STATUS = {
  '-5': 'REFUNDED',
  '-4': 'REFUND_ACCEPTED',
  '-3': 'REFUND_PENDING',
  '-2': 'CANCELLED',
  '-1': 'CANCEL_PENDING',
  0: 'PENDING',
  1: 'PENDING',
  2: 'PENDING',
  3: 'ACCEPTED',
  4: 'ACCEPTED',
  5: 'DELIVERING',
  6: 'DELIVERING',
  7: 'FINISHED',
  8: 'FINISHED',
  9: 'DELIVERED'
};

function statusName(code) {
  const found = ORDER_STATUS[String(Number(code))];
  return found || 'PENDING';
}

/**
 * A field that is a JSON string on the wire.
 *
 * Answers an empty list rather than throwing when the service sends something
 * unparseable: a member's order page should say "no orders" if the upstream
 * hiccups, not 500 - and the failure is logged by the caller either way.
 */
function parseRows(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

/**
 * The tender an item is sold in, named.
 *
 * Foreign currency, native currency and points are three different units, and
 * the service says which with a number. Naming it here is what stops a page
 * printing a currency symbol in front of a points figure.
 */
const TENDER = { 1: 'FOREIGN', 2: 'NATIVE', 3: 'POINT' };

/**
 * What moved a balance, as opposed to which balance moved.
 *
 * A closed set, and unknown values answer null rather than passing through:
 * an unrecognised code reaching a page means a label like `fill.NEWTHING`
 * printed at a member, where null means the column is simply left blank.
 */
const FILL_TYPES = ['PAY', 'CHARGE', 'REFUND', 'TRANSFER', 'AWARD', 'USE', 'EXPIRE'];

function fillName(value) {
  const code = String(value || '').toUpperCase();
  return FILL_TYPES.indexOf(code) > -1 ? code : null;
}

/**
 * A link to something that lives on the eshop, or nothing at all.
 *
 * Its pictures and its product pages are on its own host, so they can only be
 * addressed when that host is configured. In development it is not - the
 * service is mocked and there is no server to fetch a JPEG from - so this
 * answers null and the pages draw a placeholder. A half-built URL would be a
 * broken image on every order instead.
 */
function eshopUrl(path, present) {
  const base = String(config.remote.eshopServerUrl || '').replace(/\/$/, '');
  if (!base || !present || !path) return null;

  return base + (String(path).charAt(0) === '/' ? path : '/' + path);
}

/* ------------------------------------------------------------------ */

/** The member's card: type, level, and the four values on it. */
async function cardInfo(userPk) {
  const data = await remote.post(SERVICE, '/www/backend/others/pid_apis/fetch_card_info', {
    userPk: userPk
  });

  if (data.rsp_code !== 0) return null;

  const json = data.cardInfo || {};

  /*
   * EVERY FIGURE IS A STRING ON THE WIRE and is coerced here, exactly as the
   * vendor does with a unary plus. Left alone, `realValue` sorts as text and
   * "9.50" comes out greater than "48.00".
   */
  return {
    card_type: Number(json.cardType) || 0,
    card_level: Number(json.cardLvl) || 0,
    vip_no: json.vipNo || null,
    customer_no: json.customerNo || null,
    real_value: Number(json.realValue) || 0,
    prize_value: Number(json.prizeValue) || 0,
    commerce_value: Number(json.commerceValue) || 0,
    accum_value: Number(json.accumValue) || 0
  };
}

/**
 * The wallet log, in one of its three flavours.
 *
 * One endpoint serves transactions, experience and commerce value - the `type`
 * parameter is the whole difference, which is why the vendor's console had
 * three menu entries pointing at one call. Crystal keeps the one call and
 * makes the type a filter.
 *
 * `fill` is the second axis and a separate question from `kind`: kind is which
 * balance moved, fill is what moved it. The vendor's console gave them a
 * column each, and it was right to - "-40.00 on the wallet" and "-40.00 paid
 * for an order" are not the same statement, and only one of them can be
 * sorted or filtered on. The remark is prose and can be neither.
 */
async function transactions(userPk, offset, limit, filter) {
  const type = (filter && filter.type) || LOG_TYPE.TRANSACTION;

  const walletType = type === LOG_TYPE.EXP
    ? WALLET_LOG_TYPE.EXP
    : type === LOG_TYPE.COMMERCE_VALUE
      ? WALLET_LOG_TYPE.COMMERCE_VALUE
      : WALLET_LOG_TYPE.TRANSACTION;

  const data = await remote.post(SERVICE, '/www/backend/others/pid_apis/get_transactions', {
    userPk: userPk,
    start: offset,
    length: limit,
    order: 'fill_dt',
    orderBy: 'desc',
    shopId: SHOP_ID,
    type: walletType
  });

  if (data.rsp_code !== 0) return { rows: [], total: 0 };

  return {
    total: Number(data.count) || 0,
    rows: parseRows(data.data).map(function (row) {
      return {
        id: row.id,
        /* A float upstream; two places is what money is shown in. */
        amount: Number(Number(row.money_value).toFixed(2)),
        kind: Number(row.money_type),
        fill: fillName(row.fill_type),
        remark: row.remark || null,
        at: row.fill_dt
      };
    })
  };
}

/**
 * THE THREE TENDERS AN ORDER CAN BE PAID IN, and only the ones it used.
 *
 * The eshop sells in foreign currency, native currency and points, and a
 * single order can span all three. They do not add up - it is three different
 * units - so there is no total anywhere in this file, and a page that showed
 * one would be doing arithmetic on inches, litres and Tuesdays.
 *
 * Zero-quantity tenders are dropped rather than sent as zeroes, so a page can
 * render the list it is given without first deciding which entries are real.
 */
function tendersOf(row) {
  const kinds = [
    { kind: 'FOREIGN', qty: row.foreign_qty, price: row.foreign_price },
    { kind: 'NATIVE', qty: row.native_qty, price: row.native_price },
    { kind: 'POINT', qty: row.point_qty, price: row.point_price }
  ];

  return kinds
    .map(function (t) {
      return { kind: t.kind, qty: Number(t.qty) || 0, price: Number(t.price) || 0 };
    })
    .filter(function (t) { return t.qty > 0 || t.price > 0; });
}

/**
 * WHO CANCELLED IT, from which of the two fields carries the reason.
 *
 * The service records the member's reason in `user_reason` and the shop's in
 * `reason`, and says who cancelled only by which one it filled in. That is a
 * fact about the wire format, so it is decoded here rather than left for
 * every page that displays an order to rediscover.
 */
function cancellation(row) {
  const mine = String(row.user_reason || '').trim();
  const theirs = String(row.reason || '').trim();

  if (mine) return { cancelled_by: 'MEMBER', cancel_reason: mine };
  if (theirs) return { cancelled_by: 'SHOP', cancel_reason: theirs };
  return { cancelled_by: null, cancel_reason: null };
}

/** The member's orders, newest first as the service returns them. */
async function orders(userPk, offset, limit) {
  const data = await remote.post(SERVICE, '/www/backend/others/pid_apis/getUserOrderLists', {
    userPk: userPk,
    start: offset,
    length: limit
  });

  if (data.status !== 'success') return { rows: [], total: 0 };

  const lists = parseRows(data.data && data.data.lists);

  return {
    total: Number(data.data && data.data.tCount) || 0,
    rows: lists.map(function (row) {
      return Object.assign({
        order_id: row.order_id,
        order_no: row.order_no,
        status: statusName(row.status),
        status_code: Number(row.status),
        goods_name: row.goods_name,
        goods_count: Number(row.goods_count) || 0,
        tenders: tendersOf(row),
        pay_type: row.pay_type || null,
        /*
         * Three fields that are one thing on the page. Kept together because
         * a delivery address with the flat number missing is not an address.
         */
        address: {
          line: row.address || null,
          building: row.building || null,
          contact: row.contact || null,
          receiver: row.receiver || null
        },
        at: row.order_dt
      }, cancellation(row));
    })
  };
}

/**
 * One order's lines. Keyed by the order id, not by the member.
 *
 * `price` is what the item lists at and `real_price` is what was paid, so a
 * discounted line can show both. They are equal on most lines and the page
 * needs to know which - hence `discounted`, computed here rather than left as
 * a float comparison in JSX.
 */
async function orderDetail(orderId) {
  const data = await remote.post(SERVICE, '/www/backend/others/pid_apis/getOrderDetail', {
    orderId: orderId
  });

  if (data.status !== 'success') return { rows: [] };

  const lists = (data.data && data.data.lists) || [];

  return {
    rows: lists.map(function (row) {
      const price = Number(row.price) || 0;
      const paid = Number(row.real_price) || 0;
      const qty = Number(row.qty || row.goods_count) || 0;

      return {
        order_id: row.order_id,
        goods_id: row.goods_id || null,
        goods_name: row.goods_name,
        goods_url: eshopUrl('/goods/detail/' + row.goods_id, row.goods_id),
        image_url: eshopUrl(row.goods_img, row.goods_img),
        standard: row.standard || null,
        tender: TENDER[String(row.money_type)] || null,
        status: statusName(row.status),
        price: price,
        real_price: paid,
        discounted: paid > 0 && price > paid,
        qty: qty,
        /* What this line actually cost, which is not price x qty when it was
           discounted - so it is taken from the service rather than recomputed. */
        total_price: Number(row.real_total_price) || Number((paid * qty).toFixed(2)),
        delivery_no: row.delivery_no || null
      };
    })
  };
}

module.exports = {
  LOG_TYPE: LOG_TYPE,
  ORDER_STATUS: ORDER_STATUS,
  TENDER: TENDER,
  FILL_TYPES: FILL_TYPES,
  cardInfo: cardInfo,
  transactions: transactions,
  orders: orders,
  orderDetail: orderDetail
};
