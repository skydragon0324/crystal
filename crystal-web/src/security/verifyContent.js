import { fileUrl, verifiedFileUrl } from '@/api/client';

import { buildContent } from './canonicalPayload';
import { defaultCryptoBackend } from './cryptoBackend';
import { pinnedTrustedKeys } from './trustedKeys';
import { STATES, verifySignature } from './verifySignature';
import { createImageCache, verifyImage } from './verifyImage';

/**
 * THE STOREFRONT'S VERIFIER: trust, cryptography, network and caches, wired
 * together once.
 *
 * Every dependency is a parameter, and each default is the real thing:
 *
 *   trust       the trust list pinned at build time (trustedKeys.js)
 *   subtle      the page's WebCrypto (cryptoBackend.js), looked up only when
 *               an envelope has passed its structural checks and actually
 *               needs it
 *   fetch       window.fetch
 *   resolveUrl  storage key -> URL. The storefront passes api/client's
 *               fileUrl, so the bytes checked are the bytes an <img> would
 *               have loaded from the same address
 *
 * Tests build their own with a Node-backed `subtle`, a stub `fetch` and a
 * trust list of test-only keys, and hand it to the components through
 * SecurityProvider. The components cannot tell the difference, which is the
 * point: what is tested is what ships.
 *
 * TEXT RESULTS ARE CACHED, keyed by the type and the exact envelope text. The
 * same notice is on the arrival dialog and on the notification page; one
 * check is enough. Because the key IS the envelope, a changed character
 * anywhere in it is a different key and a fresh verification - the cache can
 * make a check cheaper, never skip one. Only VERIFIED and INVALID are kept:
 * an `error` is a statement about the moment (no WebCrypto, a key that would
 * not import) and is asked again next time.
 */

const TEXT_CACHE_LIMIT = 500;

/**
 * Build-time verification policy. `required` verifies in this browser;
 * `server` trusts only content the API has checked and loads images through
 * its verified endpoint; `off` explicitly bypasses integrity enforcement.
 */
export function contentVerificationMode(value) {
  const held = value === undefined ? process.env.REACT_APP_CONTENT_VERIFICATION : value;
  const mode = String(held || '').trim().toLowerCase();
  if (['0', 'false', 'off', 'disabled'].indexOf(mode) !== -1) return 'off';
  if (['server', 'backend'].indexOf(mode) !== -1) return 'server';
  return 'required';
}

export function contentVerificationEnabled(value) {
  return contentVerificationMode(value) === 'required';
}

const bypassInvalid = (reason) => ({ state: STATES.INVALID, content: null, blob: null, reason: reason });

/**
 * A renderer for an explicitly unverified HTTP deployment. It still shapes
 * text through the content schema and checks row/path association, but does
 * no cryptographic work and downloads images through their ordinary URL.
 */
export function createUnverifiedRenderer(options) {
  const resolveUrl = (options && options.resolveUrl) || ((path) => path);

  const text = (type, integrity) => {
    const built = buildContent(type, integrity && integrity.content);
    return built.ok
      ? { state: STATES.VERIFIED, content: Object.freeze(built.content), reason: null }
      : bypassInvalid('unverified content fails its schema: ' + built.reason);
  };

  return {
    verificationDisabled: true,
    peekText(type, integrity) {
      return text(type, integrity);
    },
    verifyText(type, integrity) {
      return Promise.resolve(text(type, integrity));
    },
    verifyImage(integrity, imageOptions) {
      const extra = imageOptions || {};
      const built = buildContent('image', integrity && integrity.content);
      const content = built.ok ? built.content : null;
      const path = extra.expectedPath !== undefined
        ? extra.expectedPath
        : content && content.storageKey;

      if (!path) return Promise.resolve(bypassInvalid('unverified image has no path'));
      if (content && extra.expectedPath !== undefined && content.storageKey !== extra.expectedPath) {
        return Promise.resolve(bypassInvalid('the row and integrity envelope name different image paths'));
      }

      try {
        return Promise.resolve({
          state: STATES.VERIFIED,
          content: content || Object.freeze({ storageKey: path }),
          blob: null,
          directUrl: resolveUrl(path),
          reason: null
        });
      } catch (err) {
        return Promise.resolve(bypassInvalid('no URL for ' + path));
      }
    },
    imageCache: null
  };
}

/**
 * Plain-HTTP renderer whose trust boundary is the API. Text must carry an
 * envelope the backend retained after verification, and image bytes are
 * fetched only through the backend's verify-then-send endpoint.
 */
export function createServerVerifiedRenderer(options) {
  const resolveUrl = (options && options.resolveUrl) || ((path) => path);

  const text = (type, integrity) => {
    const built = buildContent(type, integrity && integrity.content);
    return built.ok
      ? { state: STATES.VERIFIED, content: Object.freeze(built.content), reason: null }
      : bypassInvalid('the server did not provide verified content: ' + built.reason);
  };

  return {
    verificationDisabled: false,
    serverVerification: true,
    peekText(type, integrity) {
      return text(type, integrity);
    },
    verifyText(type, integrity) {
      return Promise.resolve(text(type, integrity));
    },
    verifyImage(integrity, imageOptions) {
      const extra = imageOptions || {};
      const built = buildContent('image', integrity && integrity.content);
      if (!built.ok) return Promise.resolve(bypassInvalid('the server did not provide a verified image'));

      const content = built.content;
      const path = extra.expectedPath !== undefined ? extra.expectedPath : content.storageKey;
      if (!path || content.storageKey !== path) {
        return Promise.resolve(bypassInvalid('the row and integrity envelope name different image paths'));
      }

      try {
        return Promise.resolve({
          state: STATES.VERIFIED,
          content: Object.freeze(content),
          blob: null,
          directUrl: resolveUrl(path, content.sha256),
          reason: null
        });
      } catch (err) {
        return Promise.resolve(bypassInvalid('no verified URL for ' + path));
      }
    },
    imageCache: null
  };
}

/** A stable text identity for an envelope - the cache key, and the hooks' dependency. */
export function envelopeKey(type, integrity) {
  let text;
  try {
    text = JSON.stringify(integrity === undefined ? null : integrity);
  } catch (err) {
    text = '"unserialisable"';
  }
  return type + '\n' + text;
}

export function createVerifier(options) {
  const opts = options || {};
  const imageCache = opts.imageCache || createImageCache(opts.imageCacheOptions);
  const textResults = new Map();
  const textPending = new Map();

  let trust = opts.trust || null;
  const getTrust = () => {
    if (!trust) trust = pinnedTrustedKeys();
    return trust;
  };

  /* An explicit `subtle: null` means "this browser has none" - it is not a request for the default. */
  const getSubtle = Object.prototype.hasOwnProperty.call(opts, 'subtle')
    ? () => opts.subtle
    : defaultCryptoBackend;

  const getFetch = () => {
    if (opts.fetch) return opts.fetch;
    if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
      return window.fetch.bind(window);
    }
    return null;
  };

  const resolveUrl = opts.resolveUrl || ((path) => path);

  const crashed = (err) => ({
    state: STATES.ERROR,
    content: null,
    blob: null,
    reason: 'verification failed: ' + (err && err.message ? err.message : err)
  });

  return {
    /** A settled answer for this envelope, if one is already known - for a first render without a flash. */
    peekText(type, integrity) {
      return textResults.get(envelopeKey(type, integrity)) || null;
    },

    /** @returns {Promise<{state: 'verified'|'invalid'|'error', content, reason}>} */
    verifyText(type, integrity) {
      const key = envelopeKey(type, integrity);
      if (textResults.has(key)) return Promise.resolve(textResults.get(key));
      if (textPending.has(key)) return textPending.get(key);

      const run = Promise.resolve()
        .then(() => verifySignature({
          integrity: integrity, type: type, trust: getTrust(), subtle: getSubtle
        }))
        .then(null, crashed)
        .then((result) => {
          textPending.delete(key);
          if (result.state === STATES.VERIFIED || result.state === STATES.INVALID) {
            textResults.set(key, result);
            if (textResults.size > TEXT_CACHE_LIMIT) textResults.delete(textResults.keys().next().value);
          }
          return result;
        });

      textPending.set(key, run);
      return run;
    },

    /** @returns {Promise<{state, content, blob, reason}>} - a Blob, never an object URL */
    verifyImage(integrity, imageOptions) {
      const extra = imageOptions || {};

      return Promise.resolve()
        .then(() => verifyImage({
          integrity: integrity,
          expectedPath: extra.expectedPath,
          trust: getTrust(),
          subtle: getSubtle,
          fetch: getFetch(),
          resolveUrl: resolveUrl,
          cache: imageCache
        }))
        .then(null, crashed);
    },

    imageCache: imageCache
  };
}

let shared = null;

/** The one verifier the running storefront uses, built on first use. */
export function defaultVerifier() {
  if (!shared) {
    const mode = contentVerificationMode();
    if (mode === 'required') {
      shared = createVerifier({ resolveUrl: fileUrl });
    } else if (mode === 'server') {
      // eslint-disable-next-line no-console
      console.info('[content-integrity] browser verification delegated to the trusted API');
      shared = createServerVerifiedRenderer({ resolveUrl: verifiedFileUrl });
    } else {
      // This is intentionally conspicuous: the build renders content it has
      // not authenticated and must never be mistaken for strict mode.
      // eslint-disable-next-line no-console
      console.warn('[content-integrity] verification is DISABLED by REACT_APP_CONTENT_VERIFICATION=off');
      shared = createUnverifiedRenderer({ resolveUrl: fileUrl });
    }
  }
  return shared;
}
