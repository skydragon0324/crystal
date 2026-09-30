/**
 * THE THREE BYTE CONVERSIONS VERIFICATION NEEDS, and nothing cryptographic.
 *
 * Every primitive - SHA-256, ECDSA, RSA-PSS - is the browser's own WebCrypto
 * (see cryptoBackend.js). What is here is only the plumbing around it: text
 * to UTF-8, base64 to bytes, bytes to hex. Each is small enough to read in
 * one go, which matters, because a quiet mistake in any of them is a
 * signature that never verifies.
 */

/**
 * A string as UTF-8.
 *
 * TextEncoder where the browser has one - Chrome has had it since 38 - and a
 * direct encoding otherwise. The fallback is not for old browsers: it is for
 * the test runner, whose jsdom has no TextEncoder, and a test that swapped in
 * a different encoder would be testing something other than what ships. So
 * the two are checked against each other in the tests.
 *
 * The input here is always JSON.stringify output, and since Chrome 72 (and
 * Node 12) that escapes a lone surrogate as \udXXX text rather than emitting
 * it - so there is no unpaired surrogate for the two encoders to disagree
 * about. One would still be encoded as U+FFFD, which is what TextEncoder
 * does.
 */
export function utf8Encode(text, options) {
  const useNative = !(options && options.native === false);

  if (useNative && typeof TextEncoder === 'function') {
    return new TextEncoder().encode(text);
  }

  const out = [];

  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);

    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }

    /* A surrogate still standing here has no partner. */
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;

    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }

  return new Uint8Array(out);
}

/*
 * STANDARD BASE64 WITH ITS PADDING, as CONTRACT §2 writes it - no url-safe
 * alphabet, no whitespace, no missing `=`. A second spelling of the same bytes
 * is not a threat to a signature, but a lenient decoder is how a truncated
 * value ends up "decoding" to something, and a strict one fails where the
 * problem is.
 */
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** base64 -> bytes, or null for anything that is not canonical base64. */
export function base64ToBytes(value) {
  if (typeof value !== 'string' || !value.length || !BASE64.test(value)) return null;
  if (typeof atob !== 'function') return null;

  let binary;
  try {
    binary = atob(value);
  } catch (err) {
    return null;
  }

  /*
   * The canonical spelling only. `AB==` and `AA==` decode to the same byte,
   * because the bits past the last one are thrown away; re-encoding and
   * comparing is the plainest way to refuse the one that was not written by
   * an encoder.
   */
  if (typeof btoa === 'function' && btoa(binary) !== value) return null;

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** An ArrayBuffer or a typed array as lowercase hex. */
export function bytesToHex(buffer) {
  const bytes = buffer instanceof Uint8Array
    ? buffer
    : new Uint8Array(buffer.buffer || buffer, buffer.byteOffset || 0, buffer.byteLength);

  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
  }
  return hex;
}

/**
 * Two hex digests compared without stopping at the first difference.
 *
 * Nothing secret is being compared - both hashes are public - so this is not
 * defending against a timing attack. It is here so that "equal" is one
 * obviously-correct function rather than a `===` somebody later "optimises"
 * into a prefix check.
 */
export function sameHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
