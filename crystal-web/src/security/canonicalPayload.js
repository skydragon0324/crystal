import { SCHEMAS, SCHEMA_VERSION, valueFits } from './schemas';
import { utf8Encode } from './bytes';

/**
 * THE EXACT BYTES A SIGNATURE COVERS (CONTRACT §4).
 *
 *     { "v": 1, "type": <type>, "alg": <algorithm>, "kid": <key id>, "content": {...} }
 *
 * serialised with JSON.stringify and encoded as UTF-8. The backend builds the
 * same object in the same order from the same schema table, and the shared
 * test vectors are what hold the two to it.
 *
 * `alg` AND `kid` ARE INSIDE THE BYTES. Without them a signature is a
 * statement about the content alone, and could be re-presented under a
 * different key id or a different algorithm name; with them, it is a
 * statement about the content AS SIGNED BY THAT KEY WITH THAT ALGORITHM, and
 * moving it anywhere else breaks it.
 *
 * WHY JSON.stringify AND NOT A CUSTOM ENCODER. Every value is a string, a
 * safe integer or null (schemas.js refuses anything else), and for those
 * three JSON.stringify writes identical text in Node and in every browser
 * since Chrome 72 - including the escaping of a lone surrogate, which is the
 * one place the two used to differ. A hand-written encoder would be a second
 * implementation to keep in step with the first.
 */

/**
 * The content, rebuilt in schema order - or a reason it cannot be.
 *
 * Rejects an unknown type, a field the schema does not have, a field it does
 * have that is missing, and any value of the wrong kind. Nothing is trimmed,
 * normalised or coerced: a signature is over what the backend had, and a
 * "helpful" repair here is content nobody signed.
 */
export function buildContent(type, content) {
  const schema = Object.prototype.hasOwnProperty.call(SCHEMAS, type) ? SCHEMAS[type] : null;
  if (!schema) return { ok: false, reason: 'unknown content type "' + type + '"' };

  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return { ok: false, reason: 'content is not an object' };
  }

  const known = schema.map((entry) => entry[0]);
  const extra = Object.keys(content).filter((name) => known.indexOf(name) === -1);
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

/** The canonical JSON text, or throws with the reason the content was refused. */
export function canonicalJson(type, algorithm, keyId, content) {
  const built = buildContent(type, content);
  if (!built.ok) throw new Error(built.reason);

  return JSON.stringify({
    v: SCHEMA_VERSION,
    type: type,
    alg: algorithm,
    kid: keyId,
    content: built.content
  });
}

/** The canonical bytes: canonicalJson as UTF-8. */
export function canonicalBytes(type, algorithm, keyId, content) {
  return utf8Encode(canonicalJson(type, algorithm, keyId, content));
}
