const remote = require('../../config/remote');
const config = require('../../config');

/**
 * THE EPRODUCT SITE, over HTTP.
 *
 * A transcription of vendor_backend/api/webApi.js. One deployment, one base
 * url, and five endpoints that do not agree with each other about anything:
 *
 *   eprod_regist_balance        a bare object, no envelope
 *   eprod_buyer_product_mobile  { code, data } - code 200 means SUCCESS
 *   keygen_karaoke_log_new      { code, total, data } - code truthy means FAILURE
 *   keygen_manbang_log_new      the same
 *   media_license_log_new       the same, with a different row shape
 *
 * That inversion is the trap. `if (data.code !== 200) fail` is right for the
 * registration log and backwards for the other three, and the vendor's own
 * mapper tests them separately for exactly that reason. Getting it wrong does
 * not error - it turns every successful response into an empty list.
 *
 * AND 200, NOT 0. The registration log answers the vendor's own
 * RESP_CODES.SUCCESS, which is the HTTP number 200 carried in the body
 * (constants/responseCodes.js). Crystal tested it against 0 - the convention
 * the ESHOP uses for `rsp_code` and the APPSTORE for `meta.code`, both of
 * which are right where they are - and so read every successful registration
 * list as a failure and answered an empty page to members who had registered
 * devices. The three services genuinely disagree; each test is written
 * against the service it belongs to.
 *
 * Two more are read here that are not in that list, because they are not
 * lists: `media_license_by_id` answers a bare `{ movies: [...] }` with no
 * envelope at all, and `send_lic_error_request_new` is the one POST.
 *
 * EVERY LIST IS A GET with a query string, not a post. The vendor builds them
 * as `webAPI.get(url + '?' + qs.stringify(params))`.
 */

const SERVICE = 'web';

/**
 * What this service calls success, on the one endpoint that says so at all.
 *
 * The vendor's RESP_CODES.SUCCESS.code - the HTTP number, repeated inside the
 * body. Named rather than written as a literal because `200` in the middle of
 * a mapper reads like an HTTP status and is not one: the request that carried
 * it was already 200 by the time anything here looked at the body.
 */
const SUCCESS_CODE = 200;

/** Where a registration got to. Taken from the vendor's EPROD_REGISTER_STATUS. */
const REGISTER_STATUS = { 0: 'PENDING', 1: 'APPROVED', 2: 'REJECTED' };

/**
 * Where a REPORTED fault got to - the vendor's EPROD_FEEDBACK_STATUS.
 *
 * NONE is not "no answer yet", it is "nobody has reported anything", and that
 * is the difference the page needs: a row at NONE offers the report button, a
 * row at PENDING refuses a second report, and ACCEPT or REJECT is an answer
 * the member can read. All four were being thrown away, so the button could
 * only ever say the same thing and could be pressed again and again.
 */
const FEEDBACK_STATUS = { 0: 'NONE', 1: 'PENDING', 2: 'ACCEPT', 3: 'REJECT' };

/**
 * WHERE A LICENCE FILE IS DOWNLOADED FROM, which is not where it is stored.
 *
 * The row carries a path on the eproduct server's own filesystem -
 * `/var/www/html/bs_licenses/1244.lic` - and that is not fetchable by
 * anybody. The vendor's page takes the basename off it and hands it to a PHP
 * script that reads the file and sends it back:
 *
 *   <web server>/bs_licenses/keygen.php?download_re=1&data_re=0&file_path=1244.lic
 *
 * B-media keeps its licences in a different directory and has its own copy of
 * the same script, which is the only thing that differs between the systems.
 *
 * A BROWSER CANNOT ASSEMBLE THIS. It does not know the eproduct server's
 * address - Crystal never tells a page where its upstreams are, and should
 * not - so the URL is built here and the page is handed a link.
 */
const LICENSE_DIRS = {
  karaoke: '/../bs_licenses',
  manbang: '/../bs_licenses',
  bmedia: '/../bp_licenses'
};

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
 * A keygen reply, unwrapped - AND ITS REFUSAL, if it refused.
 *
 * `code` is truthy for FAILURE here - the opposite of the registration log in
 * the same service - and an absent `data` is also a failure. Both tests are
 * the vendor's, kept together so no caller has to remember which way round
 * this particular endpoint runs.
 *
 * THE SERVICE'S OWN WORDS COME BACK WITH THE EMPTY LIST, and that is the
 * change worth explaining. This used to answer `{ rows: [], total: 0 }` and
 * throw the message away, so a service that had refused the request looked
 * exactly like a member who had never licensed anything - and the page drew
 * "no licences yet" over the top of a fault. The vendor keeps the message
 * (`${data.message} (code: ${data.code})`) and so does this.
 *
 * It is not thrown. A remote refusal is a degraded section, not a 500 that
 * takes the account area down with it - see `attempt` in
 * services/storefronts.service.js. The caller decides what to do with the
 * sentence; this only stops losing it.
 */
function keygenRows(data, map) {
  if (!data || data.code || !data.data) {
    return { rows: [], total: 0, error: refusal(data) };
  }

  return {
    total: Number(data.total) || 0,
    rows: (data.data || []).map(map),
    error: null
  };
}

/**
 * What the service said, in one line, or a stand-in when it said nothing.
 *
 * The code travels with the message because the two are read by different
 * people: a member reads the sentence, and whoever they telephone about it
 * needs the number. The vendor formats it the same way.
 */
function refusal(data) {
  if (!data) return 'the eproduct service did not answer';

  const said = String(data.message || '').trim();
  const code = data.code === undefined || data.code === null ? null : String(data.code);

  if (!said) return code ? 'the eproduct service refused (code: ' + code + ')' : 'the eproduct service refused';
  return code ? said + ' (code: ' + code + ')' : said;
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
    registered: Number(data && data.registered) || 0,

    /*
     * `sum_total` IS THE ONE FIELD THE VENDOR READS from this reply - the
     * points every registration on the eproduct site has earned the member
     * (clientApiController.fetchAccountTotalInfo: `+resp.data.sum_total`). Its
     * account overview adds it to the phone registration points to make the
     * member's register points, and so does Crystal's dashboard.
     */
    points: Number(data && data.sum_total) || 0
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

  /* Here `code` 200 IS success. See the note at the top of this file. */
  if (!data || Number(data.code) !== SUCCESS_CODE || !data.data) return { rows: [], total: 0 };

  const body = data.data;

  return {
    total: Number(body.total) || 0,
    rows: (body.data || []).map(function (row) {
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
        /*
         * WHERE A REPORTED FAULT GOT TO, and it is not the same thing as
         * whether the keying worked. A licence can issue and still be wrong
         * on the machine it was issued for, which is what the report is for.
         */
        error_status: named(FEEDBACK_STATUS, row.error_status, 'NONE'),
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
      /*
       * SPELLED `license_path` HERE and `licensefilepath` on the other two,
       * for the same thing. It was simply dropped, so the b-media page had no
       * download while karaoke and manbang did - the column exists upstream
       * and the vendor's page reads it. Mapped onto the same field name the
       * other two answer with, so one download endpoint serves all three.
       */
      license_file: row.license_path || null,
      at: row.date_time
    };
  });
}

/**
 * The media lines one b-media licence covered.
 *
 * `{ movies: [...] }` and no envelope at all - not `{ code, data }` like the
 * log endpoints beside it, so the vendor tests for the ARRAY rather than for
 * a code (`if (!data.movies) fail`). Doing it any other way here reads every
 * good answer as a failure.
 *
 * Not paged upstream and not paged here: one licence covers a handful of
 * titles, and the vendor's own modal slices the array in the browser.
 */
async function bmediaKeygenDetail(id) {
  const data = await remote.get(SERVICE, '/eproduct/api/client/media_license_by_id', { id: id });

  if (!data || !data.movies) return { rows: [], total: 0 };

  const rows = data.movies.map(function (row) {
    return {
      id: row.id,
      title: row.title || null,
      /* Seconds, formatted on the page - the service counts, it does not say. */
      duration: Number(row.duration) || 0,
      media_price: Number(row.media_price) || 0,
      provider: row.short_name || null
    };
  });

  return { rows: rows, total: rows.length };
}

/**
 * A link to one licence file, or nothing at all.
 *
 * Nothing when the eproduct server is not configured - which is every
 * development machine, where the service is mocked and there is no host to
 * fetch a file from. A half-built URL would be a download button that opens a
 * broken tab, which is worse than no button; the service above answers 404
 * on a null and the page draws nothing.
 *
 * THE BASENAME, not the path. What the row carries is a location on the
 * eproduct server's disk and the script wants a filename, so everything up to
 * the last separator is dropped - both separators, because the path is
 * written by a service that has run on both kinds of machine.
 */
function licenseUrl(system, licensePath) {
  return licenseHref(config.remote.webServerUrl, system, licensePath);
}

/**
 * The same thing with the host passed in, which is the half worth testing.
 *
 * Splitting it is not ceremony: on a development machine the eproduct service
 * is mocked and WEB_SERVER_URL is empty, so `licenseUrl` can only ever answer
 * null there - and the interesting part, which directory each system's
 * licences live in and how a path becomes a filename, would be code no check
 * could reach until production. This half takes the host as an argument and
 * scripts/check.js exercises it directly.
 */
function licenseHref(server, system, licensePath) {
  const dir = LICENSE_DIRS[String(system || '').toLowerCase()];
  const base = String(server || '').replace(/\/$/, '');
  if (!dir || !base || !licensePath) return null;

  const filename = String(licensePath).split(/[\\/]/).pop();
  if (!filename) return null;

  return {
    url: base + dir + '/keygen.php?download_re=1&data_re=0&file_path=' + encodeURIComponent(filename),
    filename: filename
  };
}

/**
 * Reporting that an issued licence does not work.
 *
 * A POST, and the only one in this file. The service reads `$_POST`, so it
 * has to be form-encoded - see the `form` flag on `web` in config/remote.js,
 * which was false while every call here was a GET and nothing noticed.
 *
 * `error_reason` is the field name upstream and `report` is what the member
 * typed; the vendor renames it in its controller and so does this. Success is
 * 200 in the body, the same as the registration log and unlike the keygen
 * logs in the same service.
 */
async function reportLicenseError(licenseId, phone, report) {
  const data = await remote.post(SERVICE, '/eproduct/api/client/send_lic_error_request_new', {
    lic_id: licenseId,
    phone_number: phone,
    error_reason: report
  });

  if (!data || Number(data.code) !== SUCCESS_CODE) {
    return { accepted: false, error: refusal(data) };
  }

  return { accepted: true, error: null };
}

module.exports = {
  REGISTER_STATUS: REGISTER_STATUS,
  FEEDBACK_STATUS: FEEDBACK_STATUS,
  registerBalance: registerBalance,
  registerLog: registerLog,
  karaokeKeygenLog: karaokeKeygenLog,
  manbangKeygenLog: manbangKeygenLog,
  bmediaKeygenLog: bmediaKeygenLog,
  bmediaKeygenDetail: bmediaKeygenDetail,
  licenseUrl: licenseUrl,
  licenseHref: licenseHref,
  reportLicenseError: reportLicenseError
};
