import axios from 'axios';

import dictionaries from '../i18n/dictionaries';

/**
 * The single axios instance the console uses.
 *
 * Three things are carried by the interceptors below, and keeping them here
 * is what stops the envelope, the token and the language leaking into every
 * component:
 *
 *   - the request side attaches the access token and the reader's language;
 *   - the response side unwraps `{ success, message, data }` so a caller gets
 *     the payload directly;
 *   - a 401 mid-session is silently exchanged for a new token and the call is
 *     run again, so a session that has merely aged does not throw the user
 *     back to the sign-in screen mid-form.
 */

const TOKEN_KEY = 'crystal.admin.token';
const REFRESH_KEY = 'crystal.admin.refresh';
const LOCALE_KEY = 'crystal.admin.locale';

/** Fired when the session really is over, so the app can explain itself. */
export const SESSION_EXPIRED_EVENT = 'crystal:session-expired';

export const baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5100/api';

/** The console's half of the API. The customer website lives at the root. */
const adminURL = baseURL.replace(/\/$/, '') + '/admin';

/**
 * The API writes its messages in whatever language this header asks for, so
 * a validation error reads the same way as the form it came from.  The choice
 * is read from storage rather than from React context: this module is used
 * outside components too, and the provider keeps the key up to date.
 */
const LOCALE_HEADER = 'X-Lang';

function read(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (err) {
    return null; /* storage disabled: the session lasts as long as the tab */
  }
}

function write(key, value) {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch (err) {
    /* nothing to do - the in-memory session still works for this page load */
  }
}

export const tokenStore = {
  get: () => read(TOKEN_KEY),
  getRefresh: () => read(REFRESH_KEY),

  /** Takes the `{ token, refresh_token }` a sign-in or a refresh answers with. */
  save: (data) => {
    if (!data || !data.token) return;
    write(TOKEN_KEY, data.token);
    if (data.refresh_token) write(REFRESH_KEY, data.refresh_token);
  },

  clear: () => {
    write(TOKEN_KEY, null);
    write(REFRESH_KEY, null);
  }
};

/**
 * The language the console starts in, before anybody has chosen one.
 *
 * REACT_APP_DEFAULT_LOCALE at BUILD time - Create React App inlines these,
 * so it is baked into the bundle and changing it means rebuilding, not
 * restarting.
 *
 * AN OPERATOR'S CHOICE ALWAYS WINS. Once the switcher has been used the
 * value is in localStorage and this is never consulted again on that
 * machine, so changing it moves first-time sign-ins and nobody else.
 */
const DEFAULT_LOCALE = process.env.REACT_APP_DEFAULT_LOCALE || 'en';

/**
 * A CATALOGUE STRING FOR CODE THAT RUNS OUTSIDE REACT - this client's own
 * error messages and the auth slice's fallback - in the language the
 * person chose. Those messages are shown as they stand, so they have to be
 * translated when they are made; they used to be English on every screen.
 *
 * It lives here rather than in i18n/, because i18n/index.js imports
 * localeStore from this file and importing it back would be a cycle; the
 * catalogue imports nothing, so reading it directly is safe. `params` fills
 * {name} placeholders after the lookup, as t() does.
 */
export function translate(address, params) {
  const pick = function (dictionary) {
    return String(address).split('.').reduce(function (at, part) {
      return at && typeof at === 'object' ? at[part] : undefined;
    }, dictionary);
  };

  let text = pick(dictionaries[localeStore.get()] || {});
  if (typeof text !== 'string') text = pick(dictionaries.en);
  if (typeof text !== 'string') text = address;

  if (!params) return text;
  return String(text).replace(/\{(\w+)\}/g, function (whole, name) {
    return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole;
  });
}

export const localeStore = {
  get: () => read(LOCALE_KEY) || DEFAULT_LOCALE,
  set: (locale) => write(LOCALE_KEY, locale)
};

const client = axios.create({ baseURL: adminURL, timeout: 30000 });

/**
 * The refresh call has to go out on a bare instance: if it ran the
 * interceptors below, a refusal would try to refresh itself.
 */
const plain = axios.create({ baseURL: adminURL, timeout: 30000 });

function withLocale(config) {
  const locale = localeStore.get();
  if (locale) config.headers[LOCALE_HEADER] = locale;
  return config;
}

client.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = 'Bearer ' + token;
  return withLocale(config);
});

// The refresh call answers in words too - 'token expired' is a message a user
// can end up reading - so it asks for the same language.
plain.interceptors.request.use(withLocale);

/**
 * One refresh at a time.
 *
 * A page usually fires several calls at once, and if the access token has
 * just run out every one of them would otherwise ask for its own replacement
 * - and all but the last would end up holding a token already rotated away.
 */
let inFlight = null;

export function renewSession() {
  if (inFlight) return inFlight;

  const refresh = tokenStore.getRefresh();
  if (!refresh) return Promise.reject(new Error('no refresh token'));

  const done = () => { inFlight = null; };

  inFlight = plain
    .post('/auth/refresh', { refresh_token: refresh })
    .then((res) => {
      const data = res.data && res.data.data;
      if (!data || !data.token) throw new Error('refresh failed');
      tokenStore.save(data);
      return data;
    })
    .then(
      (data) => { done(); return data; },
      (err) => { done(); throw err; }
    );

  return inFlight;
}

/** Unwraps the { success, message, data } envelope so callers get `data`. */
function unwrap(res) {
  const body = res.data;
  if (body && typeof body === 'object' && 'success' in body) {
    return { data: body.data, message: body.message || null };
  }
  return { data: body, message: null };
}

/**
 * The API only ever answers JSON, so anything else means the request never
 * reached it.
 *
 * The case this exists for: the console is deployed behind a server that does
 * not proxy /api to the backend, so its SPA fallback answers every API call
 * with index.html - status 200, and therefore a SUCCESS as far as axios is
 * concerned.  Without this the markup flows on through `unwrap`, which finds
 * no `data` property and hands the HTML back as if it were the answer; the
 * sign-in screen then displays index.html's own <noscript> line as though the
 * server had said it.
 *
 * A misrouted request is worth naming precisely, because the honest message
 * points at the deployment rather than at the browser.
 */
function assertApiResponse(res) {
  const config = res.config || {};
  if (config.responseType === 'blob' || config.responseType === 'arraybuffer') return;

  const type = String((res.headers && res.headers['content-type']) || '');
  if (type.indexOf('json') >= 0) return;

  const error = new Error(translate('common.errors.notJson', {
    type: type || translate('common.errors.anUnknownType'),
    url: adminURL
  }));
  error.status = res.status;
  error.misrouted = true;
  throw error;
}

client.interceptors.response.use(
  (res) => {
    assertApiResponse(res);
    return unwrap(res);
  },
  async (err) => {
    const status = err.response ? err.response.status : 0;
    const config = err.config || {};
    const url = config.url || '';

    const isSignIn = url.indexOf('/auth/login') >= 0;
    const isRefresh = url.indexOf('/auth/refresh') >= 0;

    /*
     * The access token ran out mid-session.  That is not the user's problem
     * to see: swap it for a new one and run the call again.  Only once per
     * request, so a genuinely dead session cannot loop.
     */
    if (status === 401 && !isSignIn && !isRefresh && !config.__retried && tokenStore.getRefresh()) {
      config.__retried = true;
      try {
        await renewSession();
        return await client(config);
      } catch (e) {
        /* the refresh token is gone too - fall through and end the session */
      }
    }

    const payload = err.response ? err.response.data : null;

    const message =
      (payload && payload.message) ||
      (status === 0 ? translate('common.errors.cannotReachTheServer') : translate('common.errors.requestFailed'));

    /*
     * A 401 only means "your session ended" when there was a session to end.
     *
     *  - a rejected sign-in is a 401 too, and must leave the form up with its
     *    "incorrect username or password" message;
     *  - a 401 on any other call while nothing is held is simply "not signed
     *    in", which the sign-in form already says.
     *
     * What is left is a session that could not be renewed, and that is what
     * the timeout screen is for.
     */
    const hadSession = !!tokenStore.get() || !!tokenStore.getRefresh();

    if (status === 401 && !isSignIn) {
      tokenStore.clear();
      if (hadSession) window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }

    const error = new Error(message);
    error.status = status;
    // Structured extras - per-row import problems and the like - ride along
    // so a caller can present them properly instead of just the summary line.
    error.detail = (payload && payload.detail) || null;
    return Promise.reject(error);
  }
);

/** Absolute URL for an upload path the API returned as `/uploads/...`. */
export function fileUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return baseURL.replace(/\/api\/?$/, '') + path;
}

export default client;
