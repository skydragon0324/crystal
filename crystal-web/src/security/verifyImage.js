import { bytesToHex, sameHex } from './bytes';
import { STATES, resolveSubtle, verifySignature } from './verifySignature';

/**
 * AN IMAGE, CHECKED BYTE FOR BYTE BEFORE ANYBODY SEES IT (CONTRACT §7).
 *
 * The signature does not cover a picture; it covers a statement ABOUT one:
 * "the file at this storage key is this many bytes of this type and hashes to
 * this". So verifying an image is two checks in a fixed order:
 *
 *   1. THE STATEMENT. The envelope is validated and its signature verified
 *      exactly like any text item. Nothing is downloaded for an envelope that
 *      fails - an unsigned advert costs no bandwidth to refuse.
 *
 *   2. THE FILE. The bytes are fetched from the same URL an <img> would use,
 *      and must be exactly `size` long, hash to `sha256`, and actually BE the
 *      signed `mimeType` by their own magic numbers. Only then does a Blob
 *      exist, typed with the SIGNED type - never the response's Content-Type,
 *      which is the one part of the reply nobody signed.
 *
 * NO OBJECT URL IS CREATED HERE. This hands back a Blob; the component that
 * displays it makes the object URL and revokes it when it unmounts or its
 * source changes (see components/security/hooks.js). A URL made here would
 * have no owner to revoke it, and would outlive the page that asked.
 *
 * THE CACHE is keyed by storage key + sha256, holds only VERIFIED bytes, and
 * shares one request between everybody asking at once - so a carousel, the
 * same picture in a grid and a phone layout of it, and a page visited twice
 * all fetch a file once. A failure is never cached: a tampered file that is
 * later restored should verify on the next look, and a dropped connection
 * should be retried rather than remembered.
 */

const invalid = (reason) => ({ state: STATES.INVALID, content: null, blob: null, reason: reason });
const failure = (reason) => ({ state: STATES.ERROR, content: null, blob: null, reason: reason });

function startsWith(bytes, signature, offset) {
  const at = offset || 0;
  if (bytes.length < at + signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[at + i] !== signature[i]) return false;
  }
  return true;
}

/** How far into a file an SVG's root element is looked for. */
const SVG_SNIFF_BYTES = 65536;

/**
 * What the bytes say they are, by their own first bytes - or null.
 *
 * The same five types the schema allows, detected the way the backend detects
 * them at upload. It is a second opinion on a claim the signature already
 * vouches for, and it is here for the day the two disagree: a signed PNG that
 * is not a PNG is a signing bug or a signing-time compromise, and either way
 * it is not shown.
 */
export function sniffMimeType(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61])
    || startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) return 'image/gif';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }

  /*
   * SVG is text, so it has no magic number: it is text with no NUL in it
   * whose root element is <svg>, after whatever XML declaration, comments and
   * doctype an editor put in front of it.
   */
  const head = bytes.subarray(0, Math.min(bytes.length, SVG_SNIFF_BYTES));
  let text = '';
  for (let i = 0; i < head.length; i += 1) {
    if (head[i] === 0) return null;
    text += String.fromCharCode(head[i]);
  }
  if (/<svg[\s>/]/i.test(text)) return 'image/svg+xml';

  return null;
}

/**
 * The verified-bytes cache. Bounded by total size, least recently used first,
 * because a visitor who walks through forty product pages should not be
 * carrying forty galleries in memory. Evicting an entry does not break a
 * picture already on screen - its object URL holds the Blob itself.
 */
export function createImageCache(options) {
  const maxBytes = (options && options.maxBytes) || 64 * 1024 * 1024;
  const done = new Map();
  const pending = new Map();
  let total = 0;

  return {
    get(key) {
      if (!done.has(key)) return null;
      const entry = done.get(key);
      /* Re-inserted, so the Map's order is the order of last use. */
      done.delete(key);
      done.set(key, entry);
      return entry;
    },

    set(key, entry) {
      if (done.has(key)) {
        total -= done.get(key).size;
        done.delete(key);
      }
      done.set(key, entry);
      total += entry.size;

      const iterator = done.keys();
      while (total > maxBytes && done.size > 1) {
        const oldest = iterator.next().value;
        total -= done.get(oldest).size;
        done.delete(oldest);
      }
    },

    pending: pending,

    clear() {
      done.clear();
      pending.clear();
      total = 0;
    }
  };
}

/**
 * Fetches and measures one file. Shared between concurrent callers, so it
 * reports FACTS - length, digest, detected type - and leaves comparing them
 * with a signed claim to each caller.
 */
function measure(args, subtle, url) {
  return Promise.resolve()
    .then(() => args.fetch(url, { credentials: 'same-origin' }))
    .then(
      (response) => {
        if (!response || !response.ok) {
          const status = response ? response.status : 0;
          /*
           * A signed file that is not there is an integrity finding (the
           * audit reports it as "missing file"), not a hiccup - so it is
           * INVALID. Anything else the server says is a failure to check.
           */
          if (status === 404 || status === 410) return { fault: invalid('missing file (HTTP ' + status + ')') };
          return { fault: failure('the image could not be fetched (HTTP ' + status + ')') };
        }

        return Promise.resolve(response.arrayBuffer()).then((buffer) =>
          Promise.resolve(subtle.digest('SHA-256', buffer)).then((digest) => ({
            buffer: buffer,
            size: buffer.byteLength,
            sha256: bytesToHex(digest),
            sniffed: sniffMimeType(buffer)
          })));
      },
      (err) => ({ fault: failure('the image could not be fetched: ' + (err && err.message ? err.message : err)) })
    )
    .catch((err) => ({ fault: failure('the image could not be read: ' + (err && err.message ? err.message : err)) }));
}

/** A cached or freshly measured file, judged against one signed claim. */
function judge(content, facts) {
  if (facts.size !== content.size) {
    return invalid('size mismatch: signed ' + content.size + ' bytes, received ' + facts.size);
  }
  if (!sameHex(facts.sha256, content.sha256)) {
    return invalid('sha256 mismatch: the file is not the one that was signed');
  }
  if (facts.sniffed !== content.mimeType) {
    return invalid('type mismatch: signed as ' + content.mimeType + ', the bytes are ' + (facts.sniffed || 'unrecognised'));
  }
  return null;
}

/**
 * The whole check for one image envelope.
 *
 * @param {object}   args.integrity     the `integrity` object for the image
 * @param {string}   [args.expectedPath] the path the row itself names, when
 *                   it names one. A signature is FOR a storage key; an
 *                   envelope for one file attached to a row that points at
 *                   another is refused rather than quietly drawn from the
 *                   signed path.
 * @param {object}   args.trust, args.subtle   as for verifySignature
 * @param {Function} args.fetch         window.fetch, or a test's stand-in
 * @param {Function} args.resolveUrl    storage key -> the URL an <img> would use
 * @param {object}   args.cache         createImageCache()
 * @returns {Promise<{state, content, blob, reason}>}
 */
export function verifyImage(args) {
  return verifySignature({
    integrity: args.integrity,
    type: 'image',
    trust: args.trust,
    subtle: args.subtle
  }).then((signed) => {
    if (signed.state !== STATES.VERIFIED) return Object.assign({ blob: null }, signed);

    const content = signed.content;

    if (args.expectedPath !== undefined && args.expectedPath !== content.storageKey) {
      return invalid(
        'the row names ' + JSON.stringify(args.expectedPath) +
        ' but the signature is for ' + JSON.stringify(content.storageKey)
      );
    }

    if (typeof args.fetch !== 'function') return failure('no fetch implementation is available');

    /* Present - verifySignature could not have answered VERIFIED without it. */
    const subtle = resolveSubtle(args.subtle);

    const cache = args.cache;
    const key = content.storageKey + '\n' + content.sha256;

    const settle = (facts) => {
      if (facts.fault) return facts.fault;

      const problem = judge(content, facts);
      if (problem) return problem;

      /*
       * THE BLOB CARRIES THE SIGNED TYPE. A cached Blob made for another
       * envelope over the same bytes is re-labelled with slice(), which
       * shares the bytes rather than copying them.
       */
      const blob = facts.blob.type === content.mimeType
        ? facts.blob
        : facts.blob.slice(0, facts.blob.size, content.mimeType);

      return { state: STATES.VERIFIED, content: content, blob: blob, reason: null };
    };

    const cached = cache ? cache.get(key) : null;
    if (cached) return settle(cached);

    let job = cache ? cache.pending.get(key) : null;

    if (!job) {
      let url;
      try {
        url = args.resolveUrl(content.storageKey);
      } catch (err) {
        return failure('no URL for ' + content.storageKey);
      }

      job = measure(args, subtle, url).then((facts) => {
        if (cache) cache.pending.delete(key);
        if (facts.fault) return facts;

        /*
         * Bytes that are not the hash in the key never become a Blob, and
         * never reach the cache - so nothing unverified can be served from
         * it. Every caller sharing this job holds the same sha256 (it is in
         * the key), so a mismatch fails all of them in judge().
         */
        if (!sameHex(facts.sha256, content.sha256)) {
          return { size: facts.size, sha256: facts.sha256, sniffed: facts.sniffed, blob: null };
        }

        const entry = {
          blob: new Blob([facts.buffer], { type: content.mimeType }),
          size: facts.size,
          sha256: facts.sha256,
          sniffed: facts.sniffed
        };

        if (cache) cache.set(key, entry);
        return entry;
      });

      if (cache) cache.pending.set(key, job);
    }

    return job.then(settle);
  });
}
