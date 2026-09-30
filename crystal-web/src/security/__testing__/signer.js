/**
 * THE BACKEND'S HALF, AS MUCH OF IT AS THE STOREFRONT'S TESTS NEED.
 *
 * TEST CODE ONLY. It makes throwaway keys and signs content the way
 * crystal-backend does, so a test can produce a genuine envelope, then change
 * one thing about it and watch the storefront refuse it. The keys are
 * generated per run and never written anywhere; there is no real key in this
 * repository and nothing here could sign for production.
 *
 * THE PAYLOAD IS BUILT HERE INDEPENDENTLY of canonicalPayload.js - a
 * hand-ordered JSON.stringify over the schema's field list - so a test that
 * signs with this and verifies with the storefront is at least two pieces of
 * code agreeing. The authoritative agreement is still the backend's own
 * vectors (__fixtures__/signing-vectors.json); this is what the tests fall
 * back on for everything the vectors do not enumerate.
 */

const nodeCrypto = require('crypto');
const { SCHEMAS } = require('../schemas');

function generateEcdsaKey(keyId) {
  const pair = nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return describeKey(keyId || 'test-ec-key', 'ECDSA-P256-SHA256', pair);
}

function generateRsaKey(keyId, bits) {
  const pair = nodeCrypto.generateKeyPairSync('rsa', { modulusLength: bits || 3072 });
  return describeKey(keyId || 'test-rsa-key', 'RSA-PSS-SHA256', pair);
}

function describeKey(keyId, algorithm, pair) {
  return {
    keyId: keyId,
    algorithm: algorithm,
    privateKey: pair.privateKey,
    spki: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    /* The trust-list entry REACT_APP_CONTENT_SIGNING_KEYS would carry. */
    entry: function () {
      return { keyId: keyId, algorithm: algorithm, spki: this.spki };
    }
  };
}

/** Canonical JSON, written out independently of the code under test. */
function canonical(type, algorithm, keyId, content) {
  const ordered = {};
  SCHEMAS[type].forEach((field) => { ordered[field[0]] = content[field[0]]; });
  return JSON.stringify({ v: 1, type: type, alg: algorithm, kid: keyId, content: ordered });
}

function signBytes(key, bytes) {
  if (key.algorithm === 'ECDSA-P256-SHA256') {
    return nodeCrypto.sign('sha256', bytes, { key: key.privateKey, dsaEncoding: 'ieee-p1363' });
  }
  return nodeCrypto.sign('sha256', bytes, {
    key: key.privateKey,
    padding: nodeCrypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: 32
  });
}

/**
 * A complete `integrity` envelope for `content`, as the API would serve it.
 * `overrides.signature` patches the signature object AFTER signing, which is
 * how the tests forge the fields an attacker could change.
 */
function envelope(key, type, content, overrides) {
  const bytes = Buffer.from(canonical(type, key.algorithm, key.keyId, content), 'utf8');
  const value = signBytes(key, bytes).toString('base64');

  const signature = Object.assign({
    v: 1,
    type: type,
    algorithm: key.algorithm,
    keyId: key.keyId,
    encoding: key.algorithm === 'ECDSA-P256-SHA256' ? 'ieee-p1363' : 'rsa-pss',
    value: value,
    signedAt: '2026-09-16T10:00:00.000Z'
  }, overrides && overrides.signature);

  return { content: Object.assign({}, content), signature: signature };
}

/** The four fields an image signature covers, for a byte array stored at `storageKey`. */
function imageContent(storageKey, mimeType, bytes) {
  return {
    storageKey: storageKey,
    mimeType: mimeType,
    size: bytes.length,
    sha256: nodeCrypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex')
  };
}

module.exports = {
  generateEcdsaKey: generateEcdsaKey,
  generateRsaKey: generateRsaKey,
  canonical: canonical,
  envelope: envelope,
  imageContent: imageContent
};
