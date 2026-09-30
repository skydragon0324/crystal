/*
 * THE BACKEND'S OWN VECTORS, CHECKED BY THE STOREFRONT'S OWN CODE.
 *
 * __fixtures__/signing-vectors.json is a VERBATIM copy of
 * crystal-backend/test/fixtures/signing-vectors.json, which the backend writes
 * with `npm run content-keys -- --vectors` using fixture-only keys. It is the
 * one place the two implementations are made to agree on actual bytes: the
 * canonical JSON the backend signed, the signature it produced, and the
 * verdict it expects. Every other test in this folder signs with a helper
 * written on THIS side, which proves internal consistency and nothing more.
 *
 * EVERY VECTOR RUNS - both algorithms, all four types, and every tampered
 * case must come out anything but verified. If the backend regenerates the
 * file, copy it again; a mismatch here means the storefront would show the
 * invalid state for genuine content, or worse, the reverse.
 *
 * THE TRUST LIST is built from the vectors themselves: each fixture key id
 * with the algorithm its VALID vectors were signed with, and each `-other`
 * replay id trusted too, with the same key - so a signature replayed under a
 * second trusted id has to fail on its bytes rather than on an unknown id.
 */
import { canonicalJson } from '../security/canonicalPayload';
import { base64ToBytes } from '../security/bytes';
import { parseTrustedKeys } from '../security/trustedKeys';
import { verifySignature, STATES } from '../security/verifySignature';
import { createImageCache, sniffMimeType, verifyImage } from '../security/verifyImage';

const nodeCrypto = require('crypto');
const { createNodeSubtle } = require('../security/__testing__/nodeSubtle');
const VECTORS = require('../security/__fixtures__/signing-vectors.json');

const ENCODING = { 'ECDSA-P256-SHA256': 'ieee-p1363', 'RSA-PSS-SHA256': 'rsa-pss' };

function trustFromVectors() {
  const real = {};

  VECTORS.filter((vector) => vector.expect === 'valid').forEach((vector) => {
    real[vector.keyId] = { keyId: vector.keyId, algorithm: vector.algorithm, spki: vector.spki };
  });

  const entries = Object.keys(real).map((id) => real[id]);

  VECTORS.forEach((vector) => {
    const base = vector.keyId.replace(/-other$/, '');
    if (base !== vector.keyId && real[base] && !entries.some((entry) => entry.keyId === vector.keyId)) {
      entries.push({ keyId: vector.keyId, algorithm: real[base].algorithm, spki: real[base].spki });
    }
  });

  return parseTrustedKeys(JSON.stringify(entries));
}

function envelopeOf(vector) {
  return {
    content: JSON.parse(JSON.stringify(vector.content)),
    signature: {
      v: 1,
      type: vector.type,
      algorithm: vector.algorithm,
      keyId: vector.keyId,
      encoding: ENCODING[vector.algorithm],
      value: vector.signature,
      signedAt: '2026-09-16T10:00:00.000Z'
    }
  };
}

/** The file a vector describes: its own bytes, or the original's when only the metadata was tampered with. */
function bytesFor(vector) {
  if (vector.bytes) return base64ToBytes(vector.bytes);

  const original = VECTORS.filter((other) => other.type === 'image' && other.bytes
    && other.expect === 'valid' && other.content.sha256 === vector.content.sha256)[0];
  return original ? base64ToBytes(original.bytes) : null;
}

const trust = trustFromVectors();

test('the vectors are the backend\'s, and cover what they must', () => {
  expect(Array.isArray(VECTORS)).toBe(true);
  expect(trust.error).toBeNull();

  ['ECDSA-P256-SHA256', 'RSA-PSS-SHA256'].forEach((algorithm) => {
    ['notification', 'faq', 'image'].forEach((type) => {
      const mine = VECTORS.filter((vector) => vector.type === type && vector.name.indexOf(algorithm) === 0);
      expect(mine.some((vector) => vector.expect === 'valid')).toBe(true);
      expect(mine.some((vector) => vector.expect === 'invalid')).toBe(true);
    });
  });

  VECTORS.forEach((vector) => {
    expect(['valid', 'invalid']).toContain(vector.expect);
    expect(Object.keys(vector)).toEqual(expect.arrayContaining(
      ['name', 'type', 'content', 'algorithm', 'keyId', 'canonical', 'signature', 'spki', 'expect']
    ));
  });
});

describe('the storefront rebuilds the backend\'s canonical bytes exactly', () => {
  VECTORS.forEach((vector) => {
    test(vector.name, () => {
      expect(canonicalJson(vector.type, vector.algorithm, vector.keyId, vector.content)).toBe(vector.canonical);
    });
  });
});

describe('every vector verifies - or fails - as the backend says', () => {
  VECTORS.forEach((vector) => {
    test('[' + vector.expect + '] ' + vector.name, async () => {
      const subtle = createNodeSubtle();
      let result;

      if (vector.type === 'image') {
        const bytes = bytesFor(vector);
        const requested = [];

        result = await verifyImage({
          integrity: envelopeOf(vector),
          trust: trust,
          subtle: subtle,
          resolveUrl: (path) => path,
          cache: createImageCache(),
          fetch: (url) => {
            requested.push(url);
            return Promise.resolve(bytes && url === vector.content.storageKey
              ? { ok: true, status: 200, arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer) }
              : { ok: false, status: 404 });
          }
        });
      } else {
        result = await verifySignature({ integrity: envelopeOf(vector), type: vector.type, trust: trust, subtle: subtle });
      }

      if (vector.expect === 'valid') {
        expect(result.reason).toBeNull();
        expect(result.state).toBe(STATES.VERIFIED);
        expect(result.content).toEqual(vector.content);
      } else {
        expect(result.state).not.toBe(STATES.VERIFIED);
        expect(result.content).toBeNull();
      }
    });
  });
});

describe('a valid image vector\'s bytes are what its metadata says', () => {
  VECTORS.filter((vector) => vector.type === 'image' && vector.expect === 'valid').forEach((vector) => {
    test(vector.name, () => {
      const bytes = base64ToBytes(vector.bytes);
      expect(bytes.length).toBe(vector.content.size);
      expect(nodeCrypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex')).toBe(vector.content.sha256);
      /* The storefront's own sniffing agrees with the type the backend detected. */
      expect(sniffMimeType(bytes)).toBe(vector.content.mimeType);
    });
  });
});
