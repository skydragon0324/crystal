'use strict';

const crypto = require('crypto');
const spki = require('./spki');

/**
 * ECDSA over P-256 with SHA-256, signatures in IEEE P1363 form.
 *
 * P1363 - the raw r || s, 32 bytes each - rather than the DER SEQUENCE that
 * OpenSSL and Node produce by default, because it is the ONLY form WebCrypto
 * verifies. A DER signature handed to `crypto.subtle.verify` does not throw;
 * it returns false, for every signature, forever, which is a hard failure to
 * tell apart from tampering. `dsaEncoding: 'ieee-p1363'` (Node 12.16+) makes
 * Node speak the browser's format in both directions.
 *
 * THE DEFAULT ALGORITHM (CONTRACT section 0): short keys, 64-byte signatures,
 * and a certificate a few hundred bytes long.
 */

const NAME = 'ECDSA-P256-SHA256';
const SIGNATURE_BYTES = 64;

/** Why this public key cannot be used under this algorithm, or null. */
function keyProblem(publicKey) {
  if (!publicKey || publicKey.type !== 'public') return 'not a public key';
  if (publicKey.asymmetricKeyType !== 'ec') {
    return 'is a ' + publicKey.asymmetricKeyType + ' key, and ' + NAME + ' needs an EC P-256 key';
  }
  if (!spki.isP256(publicKey)) return 'is an EC key on a curve other than P-256 (prime256v1)';
  return null;
}

function signatureLength() {
  return SIGNATURE_BYTES;
}

function sign(privateKey, bytes) {
  return crypto.sign('sha256', bytes, { key: privateKey, dsaEncoding: 'ieee-p1363' });
}

/**
 * True only for a valid signature. A signature of the wrong length is refused
 * BEFORE it reaches OpenSSL: P1363 has exactly one length per curve, and a
 * 63-byte value that happened to verify would be a parser being generous.
 */
function verify(publicKey, bytes, signature) {
  if (!Buffer.isBuffer(signature) || signature.length !== SIGNATURE_BYTES) return false;
  try {
    return crypto.verify('sha256', bytes, { key: publicKey, dsaEncoding: 'ieee-p1363' }, signature);
  } catch (err) {
    return false;
  }
}

function generateKeyPair() {
  return crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
}

module.exports = {
  config: 'ECDSA',
  name: NAME,
  encoding: 'ieee-p1363',
  /* What `openssl req -newkey` is given to make a key of this kind. */
  opensslNewKey: ['-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1'],
  keyProblem: keyProblem,
  signatureLength: signatureLength,
  sign: sign,
  verify: verify,
  generateKeyPair: generateKeyPair
};
