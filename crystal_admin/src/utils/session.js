/**
 * The two facts the idle timer and the token keep-alive both need: when the
 * user was last seen, and how much life the token has left.
 *
 * "Last seen" lives in localStorage so working in a second tab counts as
 * presence for every tab.  The token's life is read out of the JWT itself, so
 * the client never has to be told separately how long the server made it -
 * change JWT_EXPIRES on the server and everything here follows.
 */

const ACTIVITY_KEY = 'crystal.admin.lastActivity';
const RENEW_KEY = 'crystal.admin.lastRenew';

/** Minutes of no interaction before the session is dropped. */
export const IDLE_MINUTES = Number(process.env.REACT_APP_IDLE_MINUTES) || 30;
export const IDLE_MS = IDLE_MINUTES * 60 * 1000;

function readStamp(key) {
  try {
    const raw = Number(window.localStorage.getItem(key));
    return isNaN(raw) ? 0 : raw;
  } catch (e) {
    return 0; /* storage disabled - tabs just will not share the clock */
  }
}

function writeStamp(key, at) {
  try {
    window.localStorage.setItem(key, String(at));
  } catch (e) {
    /* nothing to do: the in-tab timers still work without a shared stamp */
  }
}

export function writeActivity(at) { writeStamp(ACTIVITY_KEY, at); }
export function readActivity() { return readStamp(ACTIVITY_KEY); }

export function writeRenew(at) { writeStamp(RENEW_KEY, at); }
export function readRenew() { return readStamp(RENEW_KEY); }

/** True while the user has interacted with some tab inside the idle window. */
export function isPresent() {
  const last = readActivity();
  return last > 0 && Date.now() - last < IDLE_MS;
}

function decodeSegment(segment) {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '==='.slice((base64.length + 3) % 4);
  const binary = window.atob(padded);

  // atob hands back one character per byte, so anything non-ASCII in the
  // payload has to be put back together as UTF-8 before it will parse.
  let escaped = '';
  for (let i = 0; i < binary.length; i += 1) {
    escaped += '%' + ('00' + binary.charCodeAt(i).toString(16)).slice(-2);
  }
  return JSON.parse(decodeURIComponent(escaped));
}

/**
 * `{ issued, expires }` in milliseconds, or null if the token is missing or
 * not a readable JWT.  Nothing here is trusted for access decisions - the
 * server checks the signature - it only drives when to ask for a fresh one.
 */
export function tokenLife(token) {
  if (!token) return null;

  const parts = String(token).split('.');
  if (parts.length < 2) return null;

  let payload;
  try {
    payload = decodeSegment(parts[1]);
  } catch (e) {
    return null;
  }

  if (!payload || !payload.iat || !payload.exp) return null;
  return { issued: payload.iat * 1000, expires: payload.exp * 1000 };
}
