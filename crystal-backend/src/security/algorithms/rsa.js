'use strict';

const crypto = require('crypto');
const spki = require('./spki');

/**
 * RSA-PSS with SHA-256, MGF1-SHA-256, a 32-byte salt, on a key of at least
 * 3072 bits.
 *
 * EVERY PARAMETER IS PINNED, because PSS verification fails on any mismatch
 * and says nothing about why:
 *
 *   hash         SHA-256, for the message digest.
 *   MGF1         SHA-256 as well. OpenSSL's PSS defaults MGF1 to the message
 *                digest, and WebCrypto's RSA-PSS always uses the key's hash
 *                for MGF1 - so the two agree without a separate setting, and
 *                the tests hold them to it with an independent openssl check.
 *   salt length  32 bytes - the digest length, which is what the storefront
 *                passes as `saltLength: 32`. Left unset, Node signs with the
 *                MAXIMUM salt the modulus allows, which WebCrypto refuses.
 *
 * 3072 BITS is the floor the specification sets - roughly the 128-bit
 * strength P-256 gives. A certificate for a smaller key is a startup error,
 * not a warning. Signatures are the modulus length: 384 bytes at 3072 bits.
 *
 * A plain rsaEncryption key, not an `rsa-pss` one - see spki.js for why.
 */

const NAME = 'RSA-PSS-SHA256';
const MIN_BITS = 3072;
const SALT_LENGTH = 32;

function keyProblem(publicKey) {
  if (!publicKey || publicKey.type !== 'public') return 'not a public key';
  if (publicKey.asymmetricKeyType !== 'rsa') {
    return 'is a ' + publicKey.asymmetricKeyType + ' key, and ' + NAME + ' needs a plain RSA key';
  }
  const bits = spki.rsaModulusBits(publicKey);
  if (!bits) return 'is an RSA key whose modulus could not be read';
  if (bits < MIN_BITS) return 'is a ' + bits + '-bit RSA key, and ' + NAME + ' needs at least ' + MIN_BITS;
  return null;
}

/** The modulus in bytes - the only length a signature under this key can have. */
function signatureLength(publicKey) {
  const bits = spki.rsaModulusBits(publicKey);
  return bits ? Math.ceil(bits / 8) : 0;
}

function options(key) {
  return {
    key: key,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: SALT_LENGTH
  };
}

function sign(privateKey, bytes) {
  return crypto.sign('sha256', bytes, options(privateKey));
}

function verify(publicKey, bytes, signature) {
  const expected = signatureLength(publicKey);
  if (!Buffer.isBuffer(signature) || !expected || signature.length !== expected) return false;
  try {
    return crypto.verify('sha256', bytes, options(publicKey), signature);
  } catch (err) {
    return false;
  }
}

function generateKeyPair(bits) {
  return crypto.generateKeyPairSync('rsa', { modulusLength: bits || MIN_BITS, publicExponent: 0x10001 });
}

module.exports = {
  config: 'RSA',
  name: NAME,
  encoding: 'rsa-pss',
  MIN_BITS: MIN_BITS,
  SALT_LENGTH: SALT_LENGTH,
  opensslNewKey: ['-newkey', 'rsa:' + MIN_BITS],
  keyProblem: keyProblem,
  signatureLength: signatureLength,
  sign: sign,
  verify: verify,
  generateKeyPair: generateKeyPair
};
