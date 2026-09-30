/**
 * THE TWO ALGORITHMS THE STOREFRONT WILL VERIFY, and exactly how (CONTRACT §2).
 *
 * An explicit registry, keyed by the envelope's algorithm NAME, holding the
 * WebCrypto parameters for each. It is the only place in the storefront a
 * parameter like the curve or the salt length is written down.
 *
 * NOTHING IN A RESPONSE CHOOSES FROM THIS TABLE. The verifier looks up the
 * trusted key by key id, and it is that key's own recorded algorithm - pinned
 * into the bundle at build time - that picks the entry. The envelope's
 * `algorithm` is only compared against it, and a mismatch is a rejection.
 * That is the whole of the algorithm-confusion defence, so it is worth being
 * plain about: a response cannot ask for RSA against an EC key, or for a
 * weaker salt, because a response never gets to ask.
 *
 *   ECDSA-P256-SHA256  P-256, SHA-256, the signature as raw r||s (IEEE P1363)
 *                      - 64 bytes. That is what WebCrypto takes natively, so
 *                      there is no DER conversion anywhere on this side.
 *
 *   RSA-PSS-SHA256     SHA-256 with MGF1-SHA-256 and a 32 byte salt, keys of
 *                      at least 3072 bits. The signature is exactly as long
 *                      as the modulus, so its expected length comes from the
 *                      imported key rather than from a constant.
 */

export const ALGORITHMS = {
  'ECDSA-P256-SHA256': {
    encoding: 'ieee-p1363',
    importParams: { name: 'ECDSA', namedCurve: 'P-256' },
    verifyParams: { name: 'ECDSA', hash: { name: 'SHA-256' } },
    signatureLength: function () { return 64; },
    /* The curve is enforced by importKey itself: an SPKI for any other curve fails to import. */
    checkKey: function () { return null; }
  },

  'RSA-PSS-SHA256': {
    encoding: 'rsa-pss',
    importParams: { name: 'RSA-PSS', hash: { name: 'SHA-256' } },
    verifyParams: { name: 'RSA-PSS', saltLength: 32 },
    signatureLength: function (cryptoKey) {
      const bits = cryptoKey && cryptoKey.algorithm ? cryptoKey.algorithm.modulusLength : NaN;
      return Math.ceil(bits / 8);
    },
    checkKey: function (cryptoKey) {
      const bits = cryptoKey && cryptoKey.algorithm ? cryptoKey.algorithm.modulusLength : NaN;
      if (typeof bits !== 'number' || isNaN(bits)) return 'the RSA key reports no modulus length';
      if (bits < 3072) return 'the RSA key is ' + bits + ' bits; at least 3072 are required';
      return null;
    }
  }
};

export function algorithmFor(name) {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(ALGORITHMS, name)
    ? ALGORITHMS[name]
    : null;
}
