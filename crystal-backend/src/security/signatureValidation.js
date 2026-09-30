'use strict';

const { SCHEMA_VERSION, schemaOf } = require('./schemas');
const { buildContent } = require('./canonicalPayload');
const algorithms = require('./algorithms');

/**
 * IS THIS ENVELOPE EVEN WORTH VERIFYING - every check that is not
 * cryptography, done before any cryptography runs.
 *
 *   "integrity": {
 *     "content":   { ...the schema's fields, in schema order... },
 *     "signature": { v, type, algorithm, keyId, encoding, value, signedAt }
 *   }
 *
 * The storefront runs the same list in the same order (CONTRACT section 5).
 * They are written out here rather than left to "verify returned false"
 * because the two failures mean different things to whoever reads the log:
 * a signature that does not verify is TAMPERING, and an envelope naming a key
 * nobody trusts is CONFIGURATION. An audit that reports both as "invalid"
 * sends somebody looking for an attacker when a certificate was not deployed.
 *
 * THE KEY IS FOUND BY ITS ID, AND THE KEY DECIDES THE ALGORITHM. The envelope's
 * `algorithm` is compared against the trusted key's recorded algorithm and is
 * never used to choose an implementation - so an envelope cannot ask for a
 * weaker check, or for RSA verification of an EC signature, by naming one.
 *
 * `signedAt` is informational. It is not inside the signed bytes, and nothing
 * here or anywhere else makes a decision on it.
 */

const REASON = {
  MISSING: 'missing',                         // no envelope, or no content / signature in it
  VERSION: 'unsupported-version',             // v !== 1
  TYPE_UNKNOWN: 'unknown-type',
  TYPE_UNEXPECTED: 'unexpected-type',         // a faq where a notification was asked for
  ALGORITHM_UNKNOWN: 'unknown-algorithm',
  KEY_UNKNOWN: 'unknown-key',                 // no trusted key with that id
  KEY_REVOKED: 'revoked-key',
  ALGORITHM_MISMATCH: 'algorithm-mismatch',   // envelope's algorithm is not the key's
  ENCODING: 'encoding-mismatch',
  SIGNATURE_ENCODING: 'signature-not-base64',
  SIGNATURE_LENGTH: 'signature-wrong-length',
  CONTENT: 'content-fails-schema',
  SIGNATURE: 'signature-invalid'              // the only one that means the bytes changed
};

/*
 * Standard base64 with its padding, and only the canonical spelling of it.
 * `AB==` and `AA==` decode to the same byte; re-encoding and comparing is the
 * plainest way to refuse the one no encoder wrote.
 */
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function decodeBase64(value) {
  if (typeof value !== 'string' || !value.length || !BASE64.test(value)) return null;
  const bytes = Buffer.from(value, 'base64');
  return bytes.toString('base64') === value ? bytes : null;
}

function refuse(reason, detail) {
  return { ok: false, reason: reason, detail: detail || null };
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Checks an envelope against a trusted key.
 *
 *   options.expectedType   the type the CALLER is rendering - required, so a
 *                          valid FAQ signature cannot be shown as a notice
 *   options.resolveKey     fn(keyId) -> { keyId, algorithm, publicKey,
 *                          revoked } or null. Only keys the configuration
 *                          trusts may come back from it.
 *
 * Answers { ok: true, type, content, signatureBytes, key } with `content` in
 * schema order, or { ok: false, reason, detail }. Never throws for anything
 * the envelope contains.
 */
function validateEnvelope(integrity, options) {
  const opts = options || {};

  if (!isObject(integrity) || !isObject(integrity.content) || !isObject(integrity.signature)) {
    return refuse(REASON.MISSING);
  }

  const signature = integrity.signature;

  if (signature.v !== SCHEMA_VERSION) return refuse(REASON.VERSION, String(signature.v));
  if (!schemaOf(signature.type)) return refuse(REASON.TYPE_UNKNOWN, String(signature.type));
  if (signature.type !== opts.expectedType) {
    return refuse(REASON.TYPE_UNEXPECTED, signature.type + ' where ' + opts.expectedType + ' was expected');
  }

  /* Known at all - never used to pick the implementation, which is the key's. */
  if (!algorithms.byEnvelope(signature.algorithm)) {
    return refuse(REASON.ALGORITHM_UNKNOWN, String(signature.algorithm));
  }

  const key = typeof signature.keyId === 'string' && typeof opts.resolveKey === 'function'
    ? opts.resolveKey(signature.keyId)
    : null;
  if (!key) return refuse(REASON.KEY_UNKNOWN, String(signature.keyId));
  if (key.revoked) return refuse(REASON.KEY_REVOKED, signature.keyId);

  if (!key.algorithm || signature.algorithm !== key.algorithm.name) {
    return refuse(REASON.ALGORITHM_MISMATCH,
      signature.algorithm + ' for a ' + (key.algorithm ? key.algorithm.name : 'unknown') + ' key');
  }
  if (signature.encoding !== key.algorithm.encoding) {
    return refuse(REASON.ENCODING, String(signature.encoding));
  }

  const bytes = decodeBase64(signature.value);
  if (!bytes) return refuse(REASON.SIGNATURE_ENCODING);
  if (bytes.length !== key.algorithm.signatureLength(key.publicKey)) {
    return refuse(REASON.SIGNATURE_LENGTH, bytes.length + ' bytes');
  }

  const built = buildContent(signature.type, integrity.content);
  if (!built.ok) return refuse(REASON.CONTENT, built.reason);

  return {
    ok: true,
    type: signature.type,
    content: built.content,
    signatureBytes: bytes,
    key: key
  };
}

module.exports = {
  REASON: REASON,
  decodeBase64: decodeBase64,
  validateEnvelope: validateEnvelope
};
