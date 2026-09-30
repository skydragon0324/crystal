import { algorithmFor } from './algorithms';
import { base64ToBytes } from './bytes';
import { buildContent, canonicalBytes } from './canonicalPayload';
import { CONTENT_TYPES, SCHEMA_VERSION } from './schemas';

/**
 * ONE SIGNATURE, CHECKED: the envelope first, the arithmetic last.
 *
 * The order is the specification's (SPEC §11) and it is load-bearing. Every
 * cheap structural refusal - wrong version, wrong type, an algorithm the key
 * was not made for, a signature of the wrong length - happens before any
 * cryptography is asked to run, so a malformed envelope is rejected for the
 * reason it is malformed rather than failing somewhere inside WebCrypto with
 * a message nobody can act on.
 *
 * Results are plain objects rather than thrown errors, because every outcome
 * here is expected - an unsigned notice is a normal Tuesday, not an exception:
 *
 *   { state: 'verified', content }        the signature covers this content
 *   { state: 'invalid',  reason }         the content is not what was signed,
 *                                         or nothing trusted signed it
 *   { state: 'error',    reason }         the check could not be carried out -
 *                                         no WebCrypto, a key that would not
 *                                         import - so the answer is unknown
 *
 * Both non-verified states hide the content. The difference is only for the
 * person reading the console: `invalid` is a claim about the content, `error`
 * is a claim about this browser or this build.
 */

export const STATES = { CHECKING: 'checking', VERIFIED: 'verified', INVALID: 'invalid', ERROR: 'error' };

const invalid = (reason) => ({ state: STATES.INVALID, content: null, reason: reason });
const failure = (reason) => ({ state: STATES.ERROR, content: null, reason: reason });

/**
 * Structural validation of an `integrity` envelope against the trust list.
 * Synchronous and cryptography-free.
 *
 * @returns {{ ok: true, content, key, algorithm, signature: Uint8Array }
 *          | { ok: false, state, reason }}
 */
export function validateEnvelope(integrity, expectedType, trust) {
  const reject = (reason) => ({ ok: false, state: STATES.INVALID, reason: reason });

  /* `integrity: null` is an item with no stored signature - unsigned, so INVALID. */
  if (integrity === null || integrity === undefined) return reject('unsigned (no integrity envelope)');
  if (typeof integrity !== 'object') return reject('the integrity envelope is not an object');

  const signature = integrity.signature;
  if (!signature || typeof signature !== 'object') return reject('missing signature');

  if (signature.v !== SCHEMA_VERSION) return reject('unsupported schema version ' + JSON.stringify(signature.v));
  if (CONTENT_TYPES.indexOf(signature.type) === -1) return reject('unknown content type ' + JSON.stringify(signature.type));
  if (signature.type !== expectedType) {
    return reject('expected a "' + expectedType + '" signature, got "' + signature.type + '"');
  }

  const algorithm = algorithmFor(signature.algorithm);
  if (!algorithm) return reject('unsupported algorithm ' + JSON.stringify(signature.algorithm));

  if (trust && trust.error) {
    return { ok: false, state: STATES.ERROR, reason: 'the trusted key list is malformed: ' + trust.error };
  }

  const keys = (trust && trust.keys) || {};
  const keyId = signature.keyId;
  const key = typeof keyId === 'string' && Object.prototype.hasOwnProperty.call(keys, keyId)
    ? keys[keyId]
    : null;

  if (!key) return reject('untrusted or unknown key id ' + JSON.stringify(keyId));

  /*
   * THE ALGORITHM-CONFUSION CHECK. The trusted key's own algorithm decides;
   * the envelope only has to agree with it.
   */
  if (signature.algorithm !== key.algorithm) {
    return reject(
      'the envelope says ' + signature.algorithm + ' but key "' + keyId + '" is ' + key.algorithm
    );
  }

  if (signature.encoding !== algorithm.encoding) {
    return reject('encoding ' + JSON.stringify(signature.encoding) + ' does not match ' + key.algorithm);
  }

  const bytes = base64ToBytes(signature.value);
  if (!bytes) return reject('the signature value is not valid base64');

  const built = buildContent(expectedType, integrity.content);
  if (!built.ok) return reject('content fails its schema: ' + built.reason);

  return {
    ok: true,
    content: built.content,
    key: key,
    algorithm: algorithm,
    signature: bytes
  };
}

/**
 * CryptoKeys, imported once per backend per key id.
 *
 * A WeakMap on the backend object, so the Node shim a test passes in and the
 * browser's own crypto.subtle never share an imported key, and a test that
 * builds a fresh shim starts clean.
 */
const imported = new WeakMap();

/** A backend, or a function that finds one when it is first needed. */
export function resolveSubtle(subtle) {
  const found = typeof subtle === 'function' ? subtle() : subtle;
  return found || null;
}

function importTrustedKey(subtle, key) {
  let byKey = imported.get(subtle);
  if (!byKey) {
    byKey = new WeakMap();
    imported.set(subtle, byKey);
  }

  /*
   * Keyed by the trust list's own entry object, not by the key id. Two
   * different lists handed to the same backend - which only tests do - must
   * not find each other's keys under a shared name.
   */
  if (!byKey.has(key)) {
    const algorithm = algorithmFor(key.algorithm);

    const pending = Promise.resolve()
      .then(() => subtle.importKey('spki', key.spki, algorithm.importParams, false, ['verify']))
      .then((cryptoKey) => {
        const problem = algorithm.checkKey(cryptoKey);
        if (problem) throw new Error(problem);
        return cryptoKey;
      });

    byKey.set(key, pending);

    /* A failed import is not kept: the next attempt gets to try again. */
    pending.catch(() => { if (byKey.get(key) === pending) byKey.delete(key); });
  }

  return byKey.get(key);
}

/**
 * The whole check for one envelope.
 *
 * @param {object}   args.integrity     the `integrity` object from the response
 * @param {string}   args.type          what the caller expects it to be
 * @param {object}   args.trust         parsed trust list (trustedKeys.js)
 * @param {object|Function} args.subtle  WebCrypto SubtleCrypto, or a function that
 *                                      returns one (or null when there is none)
 * @returns {Promise<{state, content, reason}>}
 */
export function verifySignature(args) {
  const checked = validateEnvelope(args.integrity, args.type, args.trust);
  if (!checked.ok) return Promise.resolve({ state: checked.state, content: null, reason: checked.reason });

  /*
   * `subtle` may be a function, and is only called HERE - after the envelope
   * has passed every structural check. A page of unsigned items therefore
   * never goes looking for WebCrypto, and never logs an HTTPS complaint it
   * had no reason to make.
   */
  const subtle = resolveSubtle(args.subtle);
  if (!subtle) return Promise.resolve(failure('WebCrypto is unavailable (HTTPS is required)'));

  let bytes;
  try {
    bytes = canonicalBytes(args.type, checked.key.algorithm, checked.key.keyId, checked.content);
  } catch (err) {
    return Promise.resolve(invalid('canonical payload: ' + err.message));
  }

  return importTrustedKey(subtle, checked.key).then(
    (cryptoKey) => {
      const expected = checked.algorithm.signatureLength(cryptoKey);
      if (checked.signature.length !== expected) {
        return invalid(
          'the signature is ' + checked.signature.length + ' bytes; ' + checked.key.algorithm +
          ' with this key produces ' + expected
        );
      }

      return Promise.resolve(
        subtle.verify(checked.algorithm.verifyParams, cryptoKey, checked.signature, bytes)
      ).then(
        (ok) => (ok === true
          ? { state: STATES.VERIFIED, content: Object.freeze(checked.content), reason: null }
          : invalid('the signature does not match the content (tampered, or signed by a different key)')),
        (err) => failure('WebCrypto refused to verify: ' + (err && err.message ? err.message : err))
      );
    },
    (err) => failure(
      'trusted key "' + checked.key.keyId + '" could not be imported: ' + (err && err.message ? err.message : err)
    )
  );
}
