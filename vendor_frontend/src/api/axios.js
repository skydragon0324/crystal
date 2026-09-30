import axios from 'axios';

/**
 * Shared axios instance and the 401 -> refresh -> retry interceptor.
 *
 * The previous version looked like a single-flight refresh but was not one:
 *
 *   - `isRefreshing` was read in three places and never set to `true`, so
 *     the queue below it was unreachable. Ten calls returning 401 together
 *     fired ten concurrent refreshes, and each rotation invalidated the
 *     one before it.
 *   - Retries went through the bare `axios(originalRequest)` rather than
 *     this instance, dropping both `baseURL` and `withCredentials`. The
 *     retry therefore went to a relative path with no cookies attached and
 *     could not have succeeded.
 *   - A failed refresh returned `false` and the caller fell through to a
 *     rejection, leaving the app rendering an authenticated shell around
 *     data it would never receive.
 *
 * The contract with callers is unchanged: `apiRequest` resolves with either
 * the response envelope or an error object carrying `{ code, message }`,
 * and pages branch on `resp.code`.
 */
const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL,
  withCredentials: true, // access and refresh tokens are HttpOnly cookies
});

/* ------------------------------------------------------------------ *
 * Session-lost notification
 *
 * axios cannot import the redux store: store -> rootSaga -> api -> axios
 * would close the cycle and leave `store` undefined at module-eval time.
 * The app registers a handler instead (see store/store.js).
 * ------------------------------------------------------------------ */

let onSessionExpired = null;

export const setSessionExpiredHandler = (handler) => {
  onSessionExpired = handler;
};

/* ------------------------------------------------------------------ *
 * Single-flight refresh
 *
 * The first 401 starts a refresh and every later one waits on the same
 * promise, so a page firing eight parallel requests refreshes once.
 * ------------------------------------------------------------------ */

let refreshPromise = null;

const requestRefresh = () => {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = API.get('/auth/refresh_token')
    .then(() => true)
    .catch(() => false)
    // Clear the slot only after every waiter has settled, otherwise a
    // request arriving mid-flight would start a second refresh.
    .then((succeeded) => {
      refreshPromise = null;
      return succeeded;
    });

  return refreshPromise;
};

/** Paths that must never trigger a refresh, to avoid recursing on 401. */
const AUTH_PATHS = ['/auth/refresh_token', '/auth/web_auth', '/auth/web_login', '/auth/web_logout'];

const isAuthPath = (url) => !!url && AUTH_PATHS.some((path) => url.includes(path));

/** One shape for every rejection, so callers only handle one. */
const toError = (error) => {
  const response = error.response;
  if (!response) {
    return { code: 0, message: 'Network error' };
  }
  const body = response.data || {};
  return {
    code: body.code || response.status,
    message: body.message || response.statusText,
    data: body.data,
  };
};

API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // No response at all: the server is down or the request was blocked.
    // There is nothing to refresh, so report it as-is.
    if (!error.response || !originalRequest) {
      return Promise.reject(toError(error));
    }

    // A 401 from the auth endpoints themselves is the answer, not a
    // problem to recover from - refreshing here would loop.
    if (isAuthPath(originalRequest.url)) {
      return Promise.reject(toError(error));
    }

    if (error.response.status !== 401 || originalRequest._retry) {
      return Promise.reject(toError(error));
    }

    // Mark before awaiting: a retry that 401s again must not queue a
    // second refresh behind the first.
    originalRequest._retry = true;

    const refreshed = await requestRefresh();

    if (!refreshed) {
      // The refresh token is gone or expired. Tell the app so it can clear
      // the user and show the signed-out header instead of an empty page.
      if (onSessionExpired) {
        onSessionExpired();
      }
      return Promise.reject(toError(error));
    }

    // Retry through `API`, not `axios`, so baseURL and withCredentials -
    // and therefore the freshly issued cookie - are actually applied.
    try {
      return await API(originalRequest);
    } catch (retryError) {
      return Promise.reject(toError(retryError));
    }
  }
);

export const apiRequest = async (method, url, data = null, params = null, isFormData = false) => {
  try {
    const config = { params };

    if (isFormData) {
      const formData = new FormData();
      for (let key in data) {
        formData.append(key, data[key]);
      }
      data = formData;
      config.headers = { 'Content-Type': 'multipart/form-data' };
    }

    const response = method === 'get'
      ? await API.get(url, config)
      : await API.post(url, data, config);

    return response.data;
  } catch (error) {
    // Interceptor rejections are already `{ code, message, data }`. Anything
    // else (a throw from within this function) is normalised to match, so a
    // caller reading `resp.code` never sees `undefined`.
    if (error && typeof error.code !== 'undefined') {
      return error;
    }
    return { code: 0, message: (error && error.message) || 'Request failed' };
  }
};

export default API;
