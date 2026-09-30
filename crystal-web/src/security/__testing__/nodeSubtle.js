/**
 * A WEBCRYPTO FOR THE TEST RUNNER, built on Node's own crypto module.
 *
 * TEST CODE ONLY - nothing in the application imports this, so it never
 * reaches a bundle. It exists because Create React App's Jest runs on Node
 * 12, which has no WebCrypto, and the storefront's verifier takes its crypto
 * backend as a parameter precisely so the tests can hand it this.
 *
 * IT DOES THE ARITHMETIC. Nothing here returns `true` because a test would
 * like it to: verify() is Node's ECDSA or RSA-PSS verification over the bytes
 * it is given, and digest() is a real SHA-256.
 *
 * IT IS AS FUSSY AS A BROWSER about what it is asked, so a wrong parameter in
 * the code under test fails here the way it would fail in Chrome:
 *
 *   - importKey only takes 'spki', only for ['verify'], and only for the two
 *     algorithms; an ECDSA key must be on P-256 (the curve OID is read out of
 *     the SPKI, since Node 12 cannot report it), an RSA-PSS import must name
 *     SHA-256
 *   - verify refuses an algorithm name that is not the key's own
 *     (InvalidAccessError, as WebCrypto does), and RSA-PSS uses exactly the
 *     saltLength the caller passed - so a verifier asking for the wrong salt
 *     gets `false`, not a pass
 *   - an ECDSA signature is taken as IEEE P1363 (r||s), which is WebCrypto's
 *     format; the imported RSA key reports modulusLength like a CryptoKey
 */

const nodeCrypto = require('crypto');

function domError(name, message) {
  const error = new Error(message);
  error.name = name;
  return error;
}

/** Any BufferSource, from either realm (Jest's jsdom globals are not Node's), as a Buffer. */
function toBuffer(data) {
  const tag = Object.prototype.toString.call(data);
  if (tag === '[object ArrayBuffer]') return Buffer.from(new Uint8Array(data));
  if (data && data.buffer && typeof data.byteLength === 'number') {
    return Buffer.from(new Uint8Array(data.buffer, data.byteOffset || 0, data.byteLength));
  }
  throw domError('TypeError', 'expected a BufferSource');
}

function toArrayBuffer(buffer) {
  const out = new ArrayBuffer(buffer.length);
  new Uint8Array(out).set(buffer);
  return out;
}

/* prime256v1, as DER: 06 08 2A 86 48 CE 3D 03 01 07 */
const P256_OID = Buffer.from('06082a8648ce3d030107', 'hex');

function hashName(hash) {
  return typeof hash === 'string' ? hash : hash && hash.name;
}

/** One DER TLV at `offset`: { tag, start, end } with start..end the value. */
function readTlv(buffer, offset) {
  const tag = buffer[offset];
  let length = buffer[offset + 1];
  let start = offset + 2;

  if (length & 0x80) {
    const count = length & 0x7f;
    length = 0;
    for (let i = 0; i < count; i += 1) length = (length * 256) + buffer[start + i];
    start += count;
  }

  return { tag: tag, start: start, end: start + length };
}

/** The bit length of an RSA SPKI's modulus. */
function rsaModulusBits(der) {
  const spki = readTlv(der, 0);                       // SEQUENCE
  const algorithm = readTlv(der, spki.start);         // SEQUENCE { OID, NULL }
  const bitString = readTlv(der, algorithm.end);      // BIT STRING
  const rsaKey = readTlv(der, bitString.start + 1);    // skip the unused-bits byte; SEQUENCE
  const modulus = readTlv(der, rsaKey.start);         // INTEGER n

  let first = modulus.start;
  while (first < modulus.end && der[first] === 0) first += 1;

  const top = der[first];
  let topBits = 0;
  for (let v = top; v > 0; v >>= 1) topBits += 1;

  return ((modulus.end - first - 1) * 8) + topBits;
}

function createNodeSubtle() {
  const calls = { importKey: 0, verify: 0, digest: 0 };

  return {
    calls: calls,

    importKey(format, keyData, algorithm, extractable, usages) {
      calls.importKey += 1;

      return Promise.resolve().then(() => {
        if (format !== 'spki') throw domError('NotSupportedError', 'only spki is supported here');
        if (!Array.isArray(usages) || usages.length !== 1 || usages[0] !== 'verify') {
          throw domError('SyntaxError', 'a public key can only be used to verify');
        }

        const der = toBuffer(keyData);
        let key;
        try {
          key = nodeCrypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
        } catch (err) {
          throw domError('DataError', 'invalid spki: ' + err.message);
        }

        const name = algorithm && algorithm.name;

        if (name === 'ECDSA') {
          if (algorithm.namedCurve !== 'P-256') throw domError('NotSupportedError', 'curve ' + algorithm.namedCurve);
          if (key.asymmetricKeyType !== 'ec' || der.indexOf(P256_OID) === -1) {
            throw domError('DataError', 'the key is not a P-256 EC key');
          }
          return {
            type: 'public',
            extractable: !!extractable,
            usages: ['verify'],
            algorithm: { name: 'ECDSA', namedCurve: 'P-256' },
            node: key
          };
        }

        if (name === 'RSA-PSS') {
          if (hashName(algorithm.hash) !== 'SHA-256') throw domError('NotSupportedError', 'hash ' + hashName(algorithm.hash));
          if (key.asymmetricKeyType !== 'rsa') throw domError('DataError', 'the key is not an RSA key');
          return {
            type: 'public',
            extractable: !!extractable,
            usages: ['verify'],
            algorithm: { name: 'RSA-PSS', modulusLength: rsaModulusBits(der), hash: { name: 'SHA-256' } },
            node: key
          };
        }

        throw domError('NotSupportedError', 'algorithm ' + name);
      });
    },

    verify(algorithm, cryptoKey, signature, data) {
      calls.verify += 1;

      return Promise.resolve().then(() => {
        const name = algorithm && algorithm.name;
        if (!cryptoKey || !cryptoKey.node || cryptoKey.algorithm.name !== name) {
          throw domError('InvalidAccessError', 'the key is not a ' + name + ' key');
        }

        const sig = toBuffer(signature);
        const bytes = toBuffer(data);

        if (name === 'ECDSA') {
          if (hashName(algorithm.hash) !== 'SHA-256') throw domError('NotSupportedError', 'hash ' + hashName(algorithm.hash));
          /* WebCrypto answers false for a P1363 signature of the wrong length; Node may throw. */
          if (sig.length !== 64) return false;
          try {
            return nodeCrypto.verify('sha256', bytes, { key: cryptoKey.node, dsaEncoding: 'ieee-p1363' }, sig);
          } catch (err) {
            return false;
          }
        }

        if (name === 'RSA-PSS') {
          if (typeof algorithm.saltLength !== 'number') throw domError('TypeError', 'saltLength is required');
          try {
            return nodeCrypto.verify('sha256', bytes, {
              key: cryptoKey.node,
              padding: nodeCrypto.constants.RSA_PKCS1_PSS_PADDING,
              saltLength: algorithm.saltLength
            }, sig);
          } catch (err) {
            return false;
          }
        }

        throw domError('NotSupportedError', 'algorithm ' + name);
      });
    },

    digest(algorithm, data) {
      calls.digest += 1;

      return Promise.resolve().then(() => {
        if (hashName(algorithm) !== 'SHA-256') throw domError('NotSupportedError', 'digest ' + hashName(algorithm));
        return toArrayBuffer(nodeCrypto.createHash('sha256').update(toBuffer(data)).digest());
      });
    }
  };
}

module.exports = { createNodeSubtle: createNodeSubtle, rsaModulusBits: rsaModulusBits };
