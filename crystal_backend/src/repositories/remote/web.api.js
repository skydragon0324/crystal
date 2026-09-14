const remote = require('../../config/remote');

/**
 * THE EPRODUCT SITE, over HTTP.
 *
 * A transcription of vendor_backend/api/webApi.js. One deployment, one base
 * url, and five endpoints that do not agree with each other about anything:
 *
 *   eprod_regist_balance        a bare object, no envelope
 *   eprod_buyer_product_mobile  { code, data } - code 0 means SUCCESS
 *   keygen_karaoke_log_new      { code, total, data } - code truthy means FAILURE
 *   keygen_manbang_log_new      the same
 *   media_license_log_new       the same, with a different row shape
 *
 * That inversion is the trap. `if (data.code !== 0) fail` is right for the
 * registration log and backwards for the other three, and the vendor's own
 * mapper tests them separately for exactly that reason. Getting it wrong does
 * not error - it turns every successful response into an empty list.
 *
 * ALL FIVE ARE GETs with a query string, not posts. The vendor builds them as
 * `webAPI.get(url + '?' + qs.stringify(params))`.
 */

const SERVICE = 'web';

/** Where a registration got to. Taken from the vendor's EPROD_REGISTER_STATUS. */
const REGISTER_STATUS = { 0: 'PENDING', 1: 'APPROVED', 2: 'REJECTED' };

/**
 * Who did the keying - the member, or an agency acting for them.
 *
 * It is one flag upstream and a column of its own on all three pages, because
 * "you licensed this" and "a shop licensed this for you" are different
 * answers to the question the member has when they open the log.
 */
function actorOf(row) {
  return Number(row.is_agent) === 1 ? 'AGENCY' : 'MEMBER';
}

function named(table, value, fallback) {
  return table[String(Number(value))] || fallback || null;
}

/** The paging and search every one of these takes. */
function query(login, offset, limit, filter) {
  return {
    userid: login,
    offset: Number(offset) || 0,
    limit: Number(limit) || 10,
    keyword: (filter && filter.keyword) || '',
    start_date: (filter && filter.from) || '',
    end_date: (filter && filter.to) || ''
  };
}

/**
 * A keygen reply, unwrapped.
 *
 * `code` is truthy for FAILURE here - the opposite of the registration log in
 * the same service - and an absent `data` is also a failure. Both tests are
 * the vendor's, kept together so no caller has to remember which way round
 * this particular endpoint runs.
 */
function keygenRows(data, map) {
  if (!data || data.code || !data.data) return { rows: [], total: 0 };

  return {
    total: Number(data.total) || 0,
    rows: (data.data || []).map(map)
  };
}

/* ------------------------------------------------------------------ */

/** Points held for registering products, and what has been spent. */
async function registerBalance(login) {
  const data = await remote.get(SERVICE, '/eproduct/api/client/eprod_regist_balance', {
    userid: login
  });

  return {
    balance: Number(data && data.balance) || 0,
    used: Number(data && data.used) || 0,
    registered: Number(data && data.registered) || 0
  };
}

/**
 * The devices this member has registered on the eproduct site.
 *
 * NOT the same list as Crystal's own `/account/products`. That one is what
 * Crystal knows about; this is what the eproduct site knows about, and a
 * member can have rows in one and not the other - which is precisely why
 * both exist and why neither is derived from the other.
 */
async function registerLog(login, offset, limit, filter) {
  const data = await remote.get(
    SERVICE,
    '/eproduct/api/client/eprod_buyer_product_mobile',
    query(login, offset, limit, filter)
  );

  /* Here `code` 0 IS success. See the note at the top of this file. */
  if (!data || Number(data.code) !== 0 || !data.data) return { rows: [], total: 0 };

  const body = data.data;

  return {
    total: Number(body.total) || 0,
    rows: (body.rows || []).map(function (row) {
      return {
        id: row.table_pk,
        serial_number: row.sn_num,
        product_name: row.product_name,
        contact: row.contact_num || null,
        address: row.address || null,
        points: Number(row.bonus_score) || 0,
        status: named(REGISTER_STATUS, row.status, 'PENDING'),
        at: row.created_at
      };
    })
  };
}

/**
 * A Karaoke or Manbang keygen log.
 *
 * ONE FUNCTION FOR TWO SYSTEMS, because upstream they are two paths with an
 * identical row shape. The vendor wrote the mapping out twice and the two
 * copies had already begun to differ; the system is a parameter here.
 */
function keygenLog(path) {
  return async function (login, offset, limit, filter) {
    const data = await remote.get(SERVICE, path, query(login, offset, limit, filter));

    return keygenRows(data, function (row) {
      const failed = Number(row.resultlog) !== 0;

      return {
        id: row.id,
        machine_key: row.machinekey,
        price: Number(row.real_price) || 0,
        /*
         * SUCCEEDED OR NOT, decided here rather than by a page comparing
         * `resultlog` to zero. The message is the service's own words either
         * way, and on a success it is not an error - the vendor rendered it
         * in a red badge regardless, which made every issued licence look
         * like a fault.
         */
        succeeded: !failed,
        message: row.message || null,
        actor: actorOf(row),
        reference: row.transaction_number || null,
        /* Only ever present on a success; blank on a failure upstream. */
        license_file: row.licensefilepath || null,
        at: row.updated_at
      };
    });
  };
}

const karaokeKeygenLog = keygenLog('/eproduct/api/client/keygen_karaoke_log_new');
const manbangKeygenLog = keygenLog('/eproduct/api/client/keygen_manbang_log_new');

/**
 * The B-media keygen log, which is its own shape.
 *
 * It licenses per PROVIDER rather than per machine key, and it splits what
 * was paid from what came back - so it gets its own mapper rather than being
 * bent into the shape of the other two.
 */
async function bmediaKeygenLog(login, offset, limit, filter) {
  const data = await remote.get(
    SERVICE,
    '/eproduct/api/client/media_license_log_new',
    query(login, offset, limit, filter)
  );

  return keygenRows(data, function (row) {
    return {
      id: row.id,
      device_id: row.dev_id,
      provider: row.short_name || null,
      provider_name: row.provider_name || null,
      actor: actorOf(row),
      price: Number(row.cal_price) || 0,
      bonus: Number(row.bonus_price) || 0,
      at: row.date_time
    };
  });
}

module.exports = {
  REGISTER_STATUS: REGISTER_STATUS,
  registerBalance: registerBalance,
  registerLog: registerLog,
  karaokeKeygenLog: karaokeKeygenLog,
  manbangKeygenLog: manbangKeygenLog,
  bmediaKeygenLog: bmediaKeygenLog
};
