import axios from 'axios';

import dictionaries from '@/i18n/dictionaries';

/**
 * The storefront's axios instance.
 *
 * Beyond unwrapping the API envelope it does one thing the console does not:
 * it sends `X-Crystal-Device`, so a narrow browser window gets the mobile
 * artwork even on a desktop User-Agent. The server treats that header as a
 * MEDIA preference only - it never affects which credentials are accepted,
 * which is decided from the real User-Agent.
 */

const TOKEN_KEY = 'crystal.web.token';
const LOCALE_KEY = 'crystal.web.locale';
const REFRESH_KEY = 'crystal.web.refresh';

export const baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5100/api';

const client = axios.create({
  baseURL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
});

function safeGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

function safeSet(key, value) {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch (err) {
    /* the session simply will not survive a reload */
  }
}

/**
 * THE READER LANGUAGE, kept where the request interceptor can reach it.
 *
 * The API answers in whatever X-Lang asks for, so the words this site writes
 * and the words the server writes have to change together - which means the
 * choice cannot live only in React state. It is read per request, so a
 * language change takes effect on the next fetch without a reload.
 */
/**
 * The language this site starts in, before anybody has chosen one.
 *
 * REACT_APP_DEFAULT_LOCALE at BUILD time - Create React App inlines these,
 * so it is baked into the bundle and changing it means rebuilding, not
 * restarting.
 *
 * A READER'S CHOICE ALWAYS WINS. Once the switcher has been used the value
 * is in localStorage and this is never consulted again for that browser, so
 * changing it moves first-time visitors and nobody else.
 */
const DEFAULT_LOCALE = process.env.REACT_APP_DEFAULT_LOCALE || 'en';

export const localeStore = {
  get: () => safeGet(LOCALE_KEY) || DEFAULT_LOCALE,
  set: (value) => safeSet(LOCALE_KEY, value)
};

export const getToken = () => safeGet(TOKEN_KEY);
export const getRefreshToken = () => safeGet(REFRESH_KEY);

export function setSession(token, refreshToken) {
  safeSet(TOKEN_KEY, token);
  if (refreshToken !== undefined) safeSet(REFRESH_KEY, refreshToken);
}

export function clearSession() {
  safeSet(TOKEN_KEY, null);
  safeSet(REFRESH_KEY, null);
}

/**
 * Which artwork this viewport should get. Read per request rather than once
 * at boot, so rotating a tablet or dragging a window narrow takes effect on
 * the next fetch instead of needing a reload.
 */
function deviceHint() {
  try {
    return window.innerWidth < 768 ? 'mobile' : 'desktop';
  } catch (err) {
    return 'desktop';
  }
}

client.interceptors.request.use((config) => {
  const token = getToken();
  config.headers = {
    ...config.headers,
    'X-Crystal-Device': deviceHint(),
    // So a validation message comes back in the language being read.
    'X-Lang': localeStore.get(),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
  return config;
});

const unauthorizedHandlers = [];

export function onUnauthorized(handler) {
  unauthorizedHandlers.push(handler);
  return () => {
    const index = unauthorizedHandlers.indexOf(handler);
    if (index !== -1) unauthorizedHandlers.splice(index, 1);
  };
}

client.interceptors.response.use(
  (response) => {
    const body = response.data;
    /*
     * The envelope is { success, message, data }.
     *
     * `message` is the API's own wording, already translated into whatever
     * language the request asked for - so it is carried through rather than
     * dropped, and a screen that wants to show what happened does not have to
     * invent its own sentence for it.
     */
    if (body && typeof body === 'object' && 'success' in body) {
      return { data: body.data, message: body.message || null, meta: body.meta || null };
    }
    return { data: body, message: null, meta: null };
  },
  (error) => {
    const response = error.response;

    // 401 on a PUBLIC endpoint just means the optional token was stale; only
    // the member area should be bounced to sign-in.
    const url = (error.config && error.config.url) || '';
    if (response && response.status === 401 && url.indexOf('/account') === 0) {
      unauthorizedHandlers.forEach((handler) => handler());
    }

    /*
     * A failure is { success: false, message, detail }.
     *
     * The message arrives already worded in the reader's language, so it is
     * shown as it stands; `detail` carries the structured extras - per-row
     * import problems and the like - for the screens that can present them.
     */
    const body = response && response.data;
    const wrapped = new Error(
      (body && body.message) ||
        (error.code === 'ECONNABORTED'
          ? translate('common.errors.serverTookTooLong')
          : translate('common.errors.couldNotReachCrystal'))
    );
    wrapped.status = response ? response.status : 0;
    wrapped.code = error.code || 'NETWORK_ERROR';
    wrapped.detail = (body && body.detail) || null;
    // Kept under the old name too, so any screen still reading `details`
    // carries on working rather than showing undefined.
    wrapped.details = wrapped.detail;
    return Promise.reject(wrapped);
  }
);

/**
 * Absolute URL for an upload path the API returned as `/uploads/...`.
 *
 * ONLY AN UPLOAD GETS THE API'S ADDRESS. Everything else is returned exactly
 * as it came, because it is already where the browser should go:
 *
 *   a whole URL, or data: and blob: - nothing to add;
 *
 *   a picture the BUILD emitted - the About page's artwork, imported from
 *   src/assets - which arrives as `/static/media/overview.7e427d58.svg`, or as
 *   `/crystal_web/static/media/...` when the site is built for a path prefix.
 *   Webpack has already resolved it against PUBLIC_URL, so it belongs to the
 *   site's own origin. Putting the API's host in front of it produced
 *   `http://localhost:3401/static/media/...` in development and an address on
 *   the wrong server in production, where the API and the site are not the
 *   same host.
 */
export function fileUrl(path) {
  if (!path) return null;

  const value = String(path);
  if (/^(https?:)?\/\//i.test(value) || /^(data|blob):/i.test(value)) return value;
  if (value.indexOf('/uploads/') !== 0) return value;

  return baseURL.replace(/\/api\/?$/, '') + value;
}

/**
 * A CATALOGUE STRING FOR CODE THAT RUNS OUTSIDE REACT - this client's own
 * error messages, and the Redux slices' fallbacks - in the language the
 * reader chose.
 *
 * Those messages are shown as they stand (ErrorState, toasts), so they have
 * to be translated when they are MADE; they used to be English on every
 * page. It lives here rather than in i18n/, because i18n/index.js imports
 * localeStore from this file and importing it back would be a cycle; the
 * catalogue itself imports nothing, so reading it directly is safe.
 *
 * An address only - dotted, no spaces - falling back to English and then to
 * the address itself, exactly as t() does.
 */
export function translate(address) {
  const pick = function (dictionary) {
    return String(address).split('.').reduce(function (at, part) {
      return at && typeof at === 'object' ? at[part] : undefined;
    }, dictionary);
  };

  const found = pick(dictionaries[localeStore.get()] || {});
  if (typeof found === 'string') return found;

  const english = pick(dictionaries.en);
  return typeof english === 'string' ? english : address;
}

/** URL that asks the API to verify an upload before returning its bytes. */
export function verifiedFileUrl(path, sha256) {
  if (!path || !sha256) return null;
  return baseURL.replace(/\/+$/, '') + '/site/verified-image?path=' + encodeURIComponent(path) +
    '&sha256=' + encodeURIComponent(sha256);
}

export default client;
