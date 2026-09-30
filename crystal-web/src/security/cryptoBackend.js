/**
 * WHERE THE CRYPTOGRAPHY COMES FROM: the browser's WebCrypto, passed in.
 *
 * Everything that verifies takes a `subtle` - an object with importKey,
 * verify and digest - rather than reaching for window.crypto.subtle itself.
 * Two reasons, and both are facts about where this code runs:
 *
 *   THE TESTS HAVE NO WEBCRYPTO. Create React App's Jest runs on Node 12,
 *   which has none, so the tests hand in a shim built on Node's own crypto
 *   module. It performs real ECDSA and RSA-PSS verification - nothing in the
 *   test suite is allowed to answer "valid" without doing the arithmetic.
 *
 *   A BROWSER ONLY HAS IT IN A SECURE CONTEXT. `crypto.subtle` is undefined
 *   on plain HTTP (localhost excepted). That is not a case to work around:
 *   without it nothing can be verified, so nothing signed is shown - the
 *   storefront fails CLOSED and says once, in the console, that it needs
 *   HTTPS. A fallback to "render it anyway" is precisely the hole this whole
 *   system exists to close.
 */

let warnedInsecure = false;

/** Logs the HTTPS requirement once per page, however many components ask. */
function warnInsecureOnce(detail) {
  if (warnedInsecure) return;
  warnedInsecure = true;

  // eslint-disable-next-line no-console
  console.error(
    '[content-integrity] WebCrypto is unavailable (' + detail + '). Signed content ' +
    'cannot be verified and will not be shown. The storefront must be served over ' +
    'HTTPS (or from localhost) for crypto.subtle to exist.'
  );
}

/**
 * The page's own WebCrypto, or null when there is none to use.
 *
 * Null is an answer, not an exception: the caller turns it into the `error`
 * state for that one component, and the page around it carries on.
 */
export function defaultCryptoBackend() {
  if (typeof window === 'undefined') return null;

  if (window.isSecureContext === false) {
    warnInsecureOnce('this page is not a secure context');
    return null;
  }

  const subtle = window.crypto && window.crypto.subtle;
  if (!subtle || typeof subtle.verify !== 'function' || typeof subtle.digest !== 'function') {
    warnInsecureOnce('window.crypto.subtle is missing');
    return null;
  }

  return subtle;
}

/** For tests: lets the one-time warning be observed again. */
export function resetCryptoBackendWarning() {
  warnedInsecure = false;
}
