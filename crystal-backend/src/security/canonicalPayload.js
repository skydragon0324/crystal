'use strict';

const crypto = require('crypto');
const { SCHEMA_VERSION, schemaOf } = require('./schemas');

/**
 * THE EXACT BYTES A SIGNATURE COVERS.
 *
 *     { "v": 1, "type": <type>, "alg": <algorithm>, "kid": <key id>, "content": {...} }
 *
 * built in exactly that key order, serialised with JSON.stringify, encoded as
 * UTF-8. crystal-web builds the same object from the same schema table, and
 * the test vectors are what prove the two agree byte for byte.
 *
 * `alg` AND `kid` ARE INSIDE THE BYTES. Without them a signature is a
 * statement about the content alone and could be re-presented under another
 * key id, or another algorithm name, by anybody who can edit a JSON reply.
 * With them it is a statement about the content as signed BY THAT KEY WITH
 * THAT ALGORITHM, and moving it anywhere else breaks it.
 *
 * WHY JSON.stringify AND NOT A HAND-WRITTEN ENCODER. Every value that can
 * reach it is a string, a safe integer or null - the kinds below refuse
 * everything else, floats included, so number formatting never enters the
 * bytes. For those three JSON.stringify writes the same text in Node 12 and in
 * every browser the storefront supports, including the escaping of a lone
 * surrogate (well-formed JSON.stringify, which both have). A second encoder
 * would be a second implementation to keep in step with the first, and the
 * first place the two sides quietly disagreed.
 *
 * NOTHING IS REPAIRED. No trimming, no Unicode normalisation, no coercing
 * '12' into 12. A signature is over what the database held; a "helpful" fix
 * applied here would be content nobody signed.
 */

const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const HEX64 = /^[0-9a-f]{64}$/;

/** Does `value` have the representation `kind` demands? */
function valueFits(kind, value) {
  if (typeof kind !== 'string') return false;

  const optional = kind.charAt(kind.length - 1) === '?';
  const base = optional ? kind.slice(0, -1) : kind;

  /* `undefined` is never a value - a missing field is refused by the caller. */
  if (value === undefined) return false;
  if (value === null) return optional;

  if (base === 'string') return typeof value === 'string';
  if (base === 'int') return typeof value === 'number' && Number.isSafeInteger(value);
  if (base === 'time') return typeof value === 'string' && TIME.test(value);
  if (base === 'hex64') return typeof value === 'string' && HEX64.test(value);

  if (base.indexOf('enum:') === 0) {
    return typeof value === 'string' && base.slice(5).split('|').indexOf(value) !== -1;
  }

  /* A kind this file does not know is a schema mistake, and nothing fits it. */
  return false;
}

/**
 * The content, rebuilt in schema order - or the reason it cannot be.
 *
 * Refuses an unknown type, a field the schema does not have, a field it has
 * that is missing, and any value of the wrong kind. Answers rather than
 * throws, because the verifier has to report a malformed envelope as INVALID
 * and carry on, not as a crash.
 */
function buildContent(type, content) {
  const schema = schemaOf(type);
  if (!schema) return { ok: false, reason: 'unknown content type "' + type + '"' };

  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return { ok: false, reason: 'content is not an object' };
  }

  const known = schema.map(function (entry) { return entry[0]; });
  const extra = Object.keys(content).filter(function (name) { return known.indexOf(name) === -1; });
  if (extra.length) return { ok: false, reason: 'unexpected field(s): ' + extra.join(', ') };

  const built = {};

  for (let i = 0; i < schema.length; i += 1) {
    const name = schema[i][0];
    const kind = schema[i][1];

    if (!Object.prototype.hasOwnProperty.call(content, name)) {
      return { ok: false, reason: 'missing field "' + name + '"' };
    }
    if (!valueFits(kind, content[name])) {
      return { ok: false, reason: 'field "' + name + '" is not a valid ' + kind };
    }

    built[name] = content[name];
  }

  return { ok: true, content: built };
}

/** A refusal the signing side cannot carry on past. */
class CanonicalError extends Error {
  constructor(reason) {
    super('content cannot be canonicalised: ' + reason);
    this.reason = reason;
  }
}

/** The content in schema order, or throws CanonicalError. */
function orderedContent(type, content) {
  const built = buildContent(type, content);
  if (!built.ok) throw new CanonicalError(built.reason);
  return built.content;
}

/** The canonical JSON text. Throws CanonicalError for content that does not fit. */
function canonicalJson(type, algorithm, keyId, content) {
  if (typeof algorithm !== 'string' || !algorithm) throw new CanonicalError('no algorithm');
  if (typeof keyId !== 'string' || !keyId) throw new CanonicalError('no key id');

  return JSON.stringify({
    v: SCHEMA_VERSION,
    type: type,
    alg: algorithm,
    kid: keyId,
    content: orderedContent(type, content)
  });
}

/** The canonical bytes: the JSON text as UTF-8. */
function canonicalBytes(type, algorithm, keyId, content) {
  return Buffer.from(canonicalJson(type, algorithm, keyId, content), 'utf8');
}

/** SHA-256 of the canonical bytes, lowercase hex - what the audit column holds. */
function payloadSha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

module.exports = {
  TIME: TIME,
  valueFits: valueFits,
  buildContent: buildContent,
  orderedContent: orderedContent,
  canonicalJson: canonicalJson,
  canonicalBytes: canonicalBytes,
  payloadSha256: payloadSha256,
  CanonicalError: CanonicalError
};
