'use strict';

/**
 * WHAT KIND OF PUBLIC KEY THIS IS, read out of its SubjectPublicKeyInfo.
 *
 * Node 12 will load a key and use it, but it will not say which curve an EC
 * key is on or how many bits an RSA modulus has - `asymmetricKeyDetails`
 * arrived in Node 15, and JWK export in 15.9. Both answers matter here: a
 * P-384 key would produce 96-byte signatures the storefront refuses, and a
 * 2048-bit RSA key is below the floor the specification sets.
 *
 * So the DER is read directly, and only as far as those two facts. This is
 * not cryptography - no signature or hash is computed here - it is reading
 * two lengths and an object identifier out of a structure whose layout RFC
 * 5480 and RFC 3279 fix exactly.
 *
 * THE EC CHECK IS A PREFIX COMPARISON, not a parse, because a P-256 SPKI has
 * exactly one encoding: 26 fixed header bytes naming id-ecPublicKey and
 * prime256v1, then a 65-byte uncompressed point. Anything else - another
 * curve, a compressed point, explicit curve parameters - is not the key the
 * storefront's WebCrypto import expects, and is refused.
 */

const P256_SPKI_PREFIX = Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex');
const P256_SPKI_LENGTH = 91;

/* 1.2.840.113549.1.1.1 rsaEncryption, as its DER TLV. */
const RSA_ENCRYPTION_OID = Buffer.from('06092a864886f70d010101', 'hex');

function der(key) {
  return key.export({ type: 'spki', format: 'der' });
}

/** Is this public KeyObject an EC key on P-256 with an uncompressed point? */
function isP256(publicKey) {
  if (!publicKey || publicKey.asymmetricKeyType !== 'ec') return false;
  const bytes = der(publicKey);
  return bytes.length === P256_SPKI_LENGTH
    && bytes.slice(0, P256_SPKI_PREFIX.length).equals(P256_SPKI_PREFIX)
    && bytes[P256_SPKI_PREFIX.length] === 0x04;
}

/** One DER element at `offset`: { tag, start (of the value), end }. Throws on a malformed length. */
function element(bytes, offset) {
  if (offset + 2 > bytes.length) throw new Error('truncated DER');
  const tag = bytes[offset];
  let length = bytes[offset + 1];
  let start = offset + 2;

  if (length & 0x80) {
    const count = length & 0x7f;
    if (count === 0 || count > 4 || start + count > bytes.length) throw new Error('bad DER length');
    length = 0;
    for (let i = 0; i < count; i += 1) length = (length * 256) + bytes[start + i];
    start += count;
  }

  if (start + length > bytes.length) throw new Error('truncated DER');
  return { tag: tag, start: start, end: start + length };
}

/**
 * The modulus length in bits of an RSA public KeyObject, or null when it is
 * not a plain rsaEncryption key.
 *
 *   SEQUENCE {
 *     SEQUENCE { OID rsaEncryption, NULL }
 *     BIT STRING { 0x00, SEQUENCE { INTEGER modulus, INTEGER exponent } }
 *   }
 *
 * An `rsa-pss` key (OID id-RSASSA-PSS) answers null on purpose: Chrome's
 * WebCrypto imports an RSA-PSS verification key from an rsaEncryption SPKI,
 * and a certificate carrying the other OID is a key the storefront could not
 * load.
 */
function rsaModulusBits(publicKey) {
  if (!publicKey || publicKey.asymmetricKeyType !== 'rsa') return null;

  try {
    const bytes = der(publicKey);
    const outer = element(bytes, 0);
    const algorithm = element(bytes, outer.start);
    if (algorithm.tag !== 0x30) return null;

    const oid = bytes.slice(algorithm.start, algorithm.start + RSA_ENCRYPTION_OID.length);
    if (!oid.equals(RSA_ENCRYPTION_OID)) return null;

    const bitString = element(bytes, algorithm.end);
    if (bitString.tag !== 0x03 || bytes[bitString.start] !== 0x00) return null;

    const sequence = element(bytes, bitString.start + 1);
    const modulus = element(bytes, sequence.start);
    if (sequence.tag !== 0x30 || modulus.tag !== 0x02) return null;

    /* An INTEGER carries a leading zero when its top bit is set; it is not part of the modulus. */
    let first = modulus.start;
    while (first < modulus.end && bytes[first] === 0x00) first += 1;
    if (first === modulus.end) return null;

    const topBits = bytes[first].toString(2).length;
    return ((modulus.end - first - 1) * 8) + topBits;
  } catch (err) {
    return null;
  }
}

/** base64 of the DER SubjectPublicKeyInfo - what the storefront pins. */
function spkiBase64(publicKey) {
  return der(publicKey).toString('base64');
}

module.exports = {
  isP256: isP256,
  rsaModulusBits: rsaModulusBits,
  spkiBase64: spkiBase64
};
