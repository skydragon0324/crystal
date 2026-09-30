const axios = require('axios');
const qs = require('qs');
const config = require('./index');

/**
 * THE FIVE REMOTE SERVICES the account area depends on.
 *
 *   eshop          ESHOP_SERVER_URL       orders, the card, the transaction log
 *   eshopWallet    ESHOP_WALLET_URL       the wallet behind the card
 *   appstore       APPSTORE_SERVER_URL    purchases, comments, favourites, licences
 *   appstoreWallet APPSTORE_WALLET_URL    coins, transactions, charge, transfer
 *   web            WEB_SERVER_URL         eproduct registrations, keygen logs
 *
 * These are NOT tables. The vendor reaches all of them over HTTP, and Crystal
 * does the same thing through this file - same paths, same parameters, same
 * response shapes, because the vendor's mapping code is the specification for
 * what those services return and it is copied rather than reinterpreted.
 *
 * THE MOCK IS A TRANSPORT, NOT A FIXTURE.
 *
 * No service is reachable from a development machine, so with REMOTE_MOCK on -
 * the default - the request never leaves the process and is answered by
 * repositories/remote/mock.js instead. What comes back is the SERVICE'S OWN
 * WIRE FORMAT: `rsp_code`, a `lists` field that is a JSON string, `mData` and
 * `iTotalRecords`, money as a float that has to be fixed to two places.
 *
 * That matters more than it sounds. If the mock returned the tidy shape the
 * pages want, every line of mapping in repositories/remote/ would be dead code
 * in development and would run for the first time in production - which is
 * exactly where you do not want a `JSON.parse` to run for the first time. This
 * way the mock exercises the real parser, and turning the mock off changes the
 * transport and nothing else.
 *
 * Switching to the real services is REMOTE_MOCK=false plus the four URLs.
 */

const SERVICES = {
  eshop: { url: function () { return config.remote.eshopServerUrl; }, form: true },
  eshopWallet: {
    url: function () { return config.remote.eshopWalletUrl; },
    form: true,
    /* Sent on every wallet call, as the vendor does - see config.remote. */
    headers: function () {
      return config.remote.eshopWalletReferer ? { Referer: config.remote.eshopWalletReferer } : {};
    }
  },
  appstore: { url: function () { return config.remote.appstoreServerUrl; }, form: false },
  appstoreWallet: { url: function () { return config.remote.appstoreWalletUrl; }, form: false },
  /*
   * FORM-ENCODED, like the Eshop and for the same reason: the eproduct site
   * is PHP and reads `$_POST`. It was false while every call to it was a GET,
   * where the flag does nothing - and a JSON body on its one POST (the
   * licence error report) would arrive with every field missing, which that
   * service answers as a refusal rather than as an error.
   */
  web: { url: function () { return config.remote.webServerUrl; }, form: true }
};

const clients = {};

/**
 * FORM-ENCODED OR JSON, and it is per service rather than per call.
 *
 * The Eshop's PHP endpoints read `$_POST`, so the vendor sends
 * `qs.stringify(params)` with an x-www-form-urlencoded header. The Appstore's
 * take a JSON body. Getting this wrong does not error - the service answers
 * with every parameter missing, which reads as "this member has nothing".
 */
function client(name) {
  if (clients[name]) return clients[name];

  const service = SERVICES[name];
  clients[name] = axios.create({
    baseURL: service.url(),
    timeout: config.remote.timeout
  });

  return clients[name];
}

/**
 * One call to one service.
 *
 * Returns the raw body. Interpreting it is the caller's job, because each of
 * these four services signals success differently - `rsp_code === 0`,
 * `status === 'success'`, a truthy `result`, or simply the absence of an
 * `errors` key - and flattening that here would throw away the distinction the
 * mapping code needs.
 */
async function post(name, url, params) {
  const mocked = intercept(name, url, params);
  if (mocked) return mocked;

  const service = SERVICES[name];
  const extra = service.headers ? service.headers() : {};

  const response = service.form
    ? await client(name).post(url, qs.stringify(params), {
      headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded' }, extra)
    })
    : await client(name).post(url, params, { headers: extra });

  return response.data;
}

/**
 * The same call, as a GET with a query string.
 *
 * ONE ENDPOINT NEEDS IT: the wallet's `/api/v3/histories`, which is what the
 * vendor's member-facing statement reads. Sending it as a POST is not a
 * near-miss - the service answers with every parameter missing, which reads
 * as "this member has no transactions" rather than as an error.
 *
 * The mock does not distinguish, because the mock is a switchboard on the
 * path. That is exactly why the method has to be right HERE, where it is the
 * only place the difference will ever show.
 */
async function get(name, url, params) {
  const mocked = intercept(name, url, params);
  if (mocked) return mocked;

  const service = SERVICES[name];
  const query = qs.stringify(params || {});
  const response = await client(name).get(query ? url + '?' + query : url, {
    headers: service.headers ? service.headers() : {}
  });

  return response.data;
}

/**
 * Answered in-process, or checked that it could be answered at all.
 *
 * Returns the mock's promise when mocking and nothing when not - so a caller
 * reads it as "did the mock take this", and the unconfigured check has run
 * either way.
 */
function intercept(name, url, params) {
  if (config.remote.mock) {
    return require('../repositories/remote/mock').respond(name, url, params);
  }

  if (!SERVICES[name].url()) {
    /*
     * Configured off rather than broken. A missing URL with the mock disabled
     * is a deployment that has not finished, and saying so is better than an
     * axios error about a relative path.
     */
    const err = new Error(name + ' is not configured (REMOTE_MOCK is off and its URL is unset)');
    err.unreachable = true;
    throw err;
  }

  return null;
}

/**
 * What /health says about them.
 *
 * 'mock' is not 'up'. A deployment reading 'mock' here is serving invented
 * orders to real customers, and that has to be visible on the status endpoint
 * rather than discoverable by reading the environment.
 */
function state() {
  if (config.remote.mock) return 'mock';

  const missing = Object.keys(SERVICES).filter(function (name) { return !SERVICES[name].url(); });
  return missing.length ? 'unconfigured: ' + missing.join(', ') : 'live';
}

module.exports = {
  SERVICES: Object.keys(SERVICES),
  post: post,
  get: get,
  state: state
};
