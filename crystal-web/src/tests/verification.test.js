/*
 * CONTENT SIGNATURES, VERIFIED THE WAY THE STOREFRONT VERIFIES THEM (SPEC §19).
 *
 * Every test here runs REAL signature verification. Jest on Node 12 has no
 * WebCrypto, so the verifier is handed __testing__/nodeSubtle - Node's own
 * ECDSA, RSA-PSS and SHA-256 behind the WebCrypto interface - and the
 * envelopes are signed with keys generated for this run. Nothing is mocked to
 * `true`: a test that expects "verified" gets it only if the bytes, the key
 * and the parameters all genuinely agree.
 *
 * Both algorithms go through every text case. RSA key generation is the slow
 * part, so each key is made once for the file.
 */
import { canonicalJson, buildContent } from '../security/canonicalPayload';
import { utf8Encode, base64ToBytes } from '../security/bytes';
import { parseTrustedKeys } from '../security/trustedKeys';
import { verifySignature, validateEnvelope, STATES } from '../security/verifySignature';
import { createImageCache, sniffMimeType, verifyImage } from '../security/verifyImage';
import { createVerifier } from '../security/verifyContent';

const { createNodeSubtle } = require('../security/__testing__/nodeSubtle');
const signer = require('../security/__testing__/signer');

jest.setTimeout(60000);

let ec;
let ecOther;
let rsa;
let rsaSmall;

beforeAll(() => {
  ec = signer.generateEcdsaKey('content-key-test-ec');
  ecOther = signer.generateEcdsaKey('content-key-test-ec-2');
  rsa = signer.generateRsaKey('content-key-test-rsa', 3072);
  rsaSmall = signer.generateRsaKey('content-key-test-rsa-2048', 2048);
});

function trustOf(keys) {
  return parseTrustedKeys(JSON.stringify(keys.map((key) => key.entry())));
}

const NOTICE = Object.freeze({
  id: 12,
  title: 'Service window on Saturday',
  content: '<p>Repairs close at <strong>noon</strong>. 周六中午停止维修 ✓</p>',
  originId: 3,
  status: 'PUBLISHED',
  startsAt: '2026-09-16T00:00:00.000Z',
  endsAt: null,
  sortOrder: 10,
  createdAt: '2026-09-15T08:30:00.000Z',
  updatedAt: '2026-09-15T09:45:12.345Z'
});

const FAQ = Object.freeze({
  id: 7,
  category: 'SMARTPHONE',
  question: 'How long is the warranty?',
  answer: 'Twelve months from the day of purchase.',
  sortOrder: 1,
  status: 'PUBLISHED',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z'
});

/* ------------------------------------------------------------ the payload */

describe('the canonical payload', () => {
  test('is exactly the bytes CONTRACT §4 describes', () => {
    /*
     * Written out by hand, so a change to key order, to the envelope fields
     * or to the representation of null shows up here as a diff rather than
     * as every signature on the site quietly failing.
     */
    expect(canonicalJson('faq', 'ECDSA-P256-SHA256', 'content-key-dev', {
      updatedAt: '2026-09-16T10:00:00.000Z',
      createdAt: '2026-09-15T10:00:00.000Z',
      status: 'PUBLISHED',
      sortOrder: 0,
      answer: 'Hi "there"\n',
      question: 'Q?',
      category: 'ESHOP',
      id: 1
    })).toBe(
      '{"v":1,"type":"faq","alg":"ECDSA-P256-SHA256","kid":"content-key-dev",'
      + '"content":{"id":1,"category":"ESHOP","question":"Q?","answer":"Hi \\"there\\"\\n",'
      + '"sortOrder":0,"status":"PUBLISHED","createdAt":"2026-09-15T10:00:00.000Z","updatedAt":"2026-09-16T10:00:00.000Z"}}'
    );
  });

  test('refuses unknown fields, missing fields and wrong kinds', () => {
    expect(buildContent('faq', Object.assign({ view_count: 3 }, FAQ)).ok).toBe(false);

    const missing = Object.assign({}, FAQ);
    delete missing.answer;
    expect(buildContent('faq', missing).ok).toBe(false);

    expect(buildContent('faq', Object.assign({}, FAQ, { id: '7' })).ok).toBe(false);
    expect(buildContent('faq', Object.assign({}, FAQ, { id: 7.5 })).ok).toBe(false);
    /* The catalogue section left the FAQ in the backend's delta 033: a payload
       still carrying it, or still filed under EPRODUCT, is not one this
       storefront verifies. */
    expect(buildContent('faq', Object.assign({}, FAQ, { productCategoryId: null })).ok).toBe(false);
    expect(buildContent('faq', Object.assign({}, FAQ, { category: 'EPRODUCT' })).ok).toBe(false);
    expect(buildContent('faq', Object.assign({}, FAQ, { category: 'CAMERA' })).ok).toBe(true);
    expect(buildContent('faq', Object.assign({}, FAQ, { status: 'LIVE' })).ok).toBe(false);
    expect(buildContent('faq', Object.assign({}, FAQ, { createdAt: '2026-01-01T00:00:00Z' })).ok).toBe(false);
    expect(buildContent('faq', Object.assign({}, FAQ, { createdAt: '2026-02-30T00:00:00.000Z' })).ok).toBe(false);
    expect(buildContent('image', { storageKey: '/a.png', mimeType: 'image/png', size: 1, sha256: 'A'.repeat(64) }).ok).toBe(false);
    expect(buildContent('nope', {}).ok).toBe(false);
    expect(buildContent('faq', FAQ).ok).toBe(true);
  });

  test('the fallback UTF-8 encoder writes what TextEncoder writes', () => {
    const { TextEncoder: NodeEncoder } = require('util');
    const samples = [
      'plain', 'Ünïcødé', '周六中午停止维修', 'emoji 🙂 and 𝄞',
      JSON.stringify('lone \ud800 surrogate'), JSON.stringify(NOTICE)
    ];

    samples.forEach((text) => {
      expect(Array.from(utf8Encode(text, { native: false }))).toEqual(Array.from(new NodeEncoder().encode(text)));
    });
  });

  test('base64 must be canonical standard base64', () => {
    expect(Array.from(base64ToBytes('AAEC'))).toEqual([0, 1, 2]);
    expect(base64ToBytes('AAE=')).not.toBeNull();
    expect(base64ToBytes('AAE')).toBeNull();          // padding missing
    expect(base64ToBytes('AA-_')).toBeNull();         // url-safe alphabet
    expect(base64ToBytes('AAF=')).toBeNull();         // non-canonical trailing bits
    expect(base64ToBytes('AA EC')).toBeNull();
    expect(base64ToBytes('')).toBeNull();
  });
});

/* ------------------------------------------------------------ trust list */

describe('the trusted key list', () => {
  test('parses a list of keys', () => {
    const trust = trustOf([ec, rsa]);
    expect(trust.error).toBeNull();
    expect(Object.keys(trust.keys).sort()).toEqual(['content-key-test-ec', 'content-key-test-rsa']);
  });

  test('empty or missing trusts nothing, without calling it malformed', () => {
    [undefined, '', '[]', '  '].forEach((raw) => {
      const trust = parseTrustedKeys(raw);
      expect(trust.keys).toEqual({});
      expect(trust.error).toBeNull();
      expect(trust.empty).toBe(true);
    });
  });

  test('one bad entry rejects the whole list', () => {
    const good = ec.entry();
    const cases = [
      '{not json',
      JSON.stringify(good),
      JSON.stringify([good, Object.assign({}, good, { keyId: 'second', algorithm: 'HS256' })]),
      JSON.stringify([good, Object.assign({}, good, { keyId: 'second', spki: 'not base64!' })]),
      JSON.stringify([good, Object.assign({}, good)]),
      JSON.stringify([good, { algorithm: good.algorithm, spki: good.spki }])
    ];

    cases.forEach((raw) => {
      const trust = parseTrustedKeys(raw);
      expect(trust.error).toBeTruthy();
      expect(trust.keys).toEqual({});
    });
  });
});

/* ------------------------------------------------------ text, both algorithms */

function check(integrity, type, trust, subtle) {
  return verifySignature({ integrity: integrity, type: type || 'notification', trust: trust, subtle: subtle || createNodeSubtle() });
}

[['ECDSA P-256', () => ec], ['RSA-PSS 3072', () => rsa]].forEach(([label, keyOf]) => {
  describe('a notification signed with ' + label, () => {
    let key;
    let trust;

    beforeAll(() => {
      key = keyOf();
      trust = trustOf([ec, ecOther, rsa]);
    });

    test('verifies, and hands back the signed content', async () => {
      const result = await check(signer.envelope(key, 'notification', NOTICE), 'notification', trust);
      expect(result.state).toBe(STATES.VERIFIED);
      expect(result.content).toEqual(NOTICE);
    });

    test('fails when the text is modified', async () => {
      const integrity = signer.envelope(key, 'notification', NOTICE);
      integrity.content.content = NOTICE.content.replace('noon', 'one');
      expect((await check(integrity, 'notification', trust)).state).toBe(STATES.INVALID);

      const title = signer.envelope(key, 'notification', NOTICE);
      title.content.title += ' ';
      expect((await check(title, 'notification', trust)).state).toBe(STATES.INVALID);
    });

    test('fails when the id is modified', async () => {
      const integrity = signer.envelope(key, 'notification', NOTICE);
      integrity.content.id = 13;
      expect((await check(integrity, 'notification', trust)).state).toBe(STATES.INVALID);
    });

    test('fails when a timestamp is modified', async () => {
      const integrity = signer.envelope(key, 'notification', NOTICE);
      integrity.content.updatedAt = '2026-09-15T09:45:12.346Z';
      expect((await check(integrity, 'notification', trust)).state).toBe(STATES.INVALID);

      const window = signer.envelope(key, 'notification', NOTICE);
      window.content.endsAt = '2027-01-01T00:00:00.000Z';
      expect((await check(window, 'notification', trust)).state).toBe(STATES.INVALID);
    });

    test('fails when the signature is missing', async () => {
      expect((await check(null, 'notification', trust)).state).toBe(STATES.INVALID);
      expect((await check(undefined, 'notification', trust)).state).toBe(STATES.INVALID);
      expect((await check({ content: NOTICE }, 'notification', trust)).state).toBe(STATES.INVALID);
      expect((await check({ content: NOTICE, signature: null }, 'notification', trust)).state).toBe(STATES.INVALID);
    });

    test('fails for an unknown key id, and for a key the build does not trust', async () => {
      const unknown = signer.envelope(key, 'notification', NOTICE, { signature: { keyId: 'content-key-v9' } });
      expect((await check(unknown, 'notification', trust)).state).toBe(STATES.INVALID);

      /* A perfectly good signature from a key that is simply not pinned. */
      const untrusted = await check(signer.envelope(key, 'notification', NOTICE), 'notification', parseTrustedKeys('[]'));
      expect(untrusted.state).toBe(STATES.INVALID);
    });

    test('fails for an unsupported algorithm', async () => {
      const subtle = createNodeSubtle();
      for (const name of ['HMAC-SHA256', 'ECDSA-P384-SHA384', 'RSA-PKCS1-SHA256', 'none', '']) {
        const integrity = signer.envelope(key, 'notification', NOTICE, { signature: { algorithm: name } });
        // eslint-disable-next-line no-await-in-loop
        expect((await check(integrity, 'notification', trust, subtle)).state).toBe(STATES.INVALID);
      }
      /* Refused before any cryptography was asked to run. */
      expect(subtle.calls.importKey + subtle.calls.verify).toBe(0);
    });

    test('fails when the envelope names an algorithm other than the trusted key\'s', async () => {
      const other = key === ec ? 'RSA-PSS-SHA256' : 'ECDSA-P256-SHA256';
      const integrity = signer.envelope(key, 'notification', NOTICE, {
        signature: { algorithm: other, encoding: other === 'RSA-PSS-SHA256' ? 'rsa-pss' : 'ieee-p1363' }
      });
      const result = await check(integrity, 'notification', trust);
      expect(result.state).toBe(STATES.INVALID);
      expect(result.reason).toMatch(/says .* but key/);
    });

    test('verifies again once the edit is re-signed', async () => {
      const edited = Object.assign({}, NOTICE, { title: 'Service window moved to Sunday', updatedAt: '2026-09-16T11:00:00.000Z' });

      /* The old signature over the new content fails ... */
      const stale = signer.envelope(key, 'notification', NOTICE);
      stale.content = Object.assign({}, edited);
      expect((await check(stale, 'notification', trust)).state).toBe(STATES.INVALID);

      /* ... and a fresh one verifies. */
      const resigned = await check(signer.envelope(key, 'notification', edited), 'notification', trust);
      expect(resigned.state).toBe(STATES.VERIFIED);
      expect(resigned.content.title).toBe('Service window moved to Sunday');
    });

    test('fails for a tampered signature, a wrong encoding, a wrong length, a wrong version or type', async () => {
      const good = signer.envelope(key, 'notification', NOTICE);
      const bytes = base64ToBytes(good.signature.value);
      bytes[5] ^= 0x01;
      const flipped = Object.assign({}, good, {
        signature: Object.assign({}, good.signature, { value: Buffer.from(bytes).toString('base64') })
      });
      expect((await check(flipped, 'notification', trust)).state).toBe(STATES.INVALID);

      const encoding = signer.envelope(key, 'notification', NOTICE, { signature: { encoding: 'der' } });
      expect((await check(encoding, 'notification', trust)).state).toBe(STATES.INVALID);

      const short = signer.envelope(key, 'notification', NOTICE);
      short.signature.value = Buffer.from(base64ToBytes(short.signature.value).slice(1)).toString('base64');
      expect((await check(short, 'notification', trust)).state).toBe(STATES.INVALID);

      const version = signer.envelope(key, 'notification', NOTICE, { signature: { v: 2 } });
      expect((await check(version, 'notification', trust)).state).toBe(STATES.INVALID);

      /* A genuine FAQ signature presented where a notification is expected. */
      const faq = signer.envelope(key, 'faq', FAQ);
      expect((await check(faq, 'faq', trust)).state).toBe(STATES.VERIFIED);
      expect((await check(faq, 'notification', trust)).state).toBe(STATES.INVALID);
    });
  });
});

describe('algorithm and key confusion', () => {
  test('a signature cannot be moved to another trusted key of the same type', async () => {
    /* kid is inside the signed bytes, so relabelling breaks it even though both keys are trusted. */
    const trust = trustOf([ec, ecOther]);
    const moved = signer.envelope(ec, 'notification', NOTICE, { signature: { keyId: ecOther.keyId } });
    expect((await check(moved, 'notification', trust)).state).toBe(STATES.INVALID);
  });

  test('RSA-PSS with a different salt length does not verify', async () => {
    const nodeCrypto = require('crypto');
    const bytes = Buffer.from(signer.canonical('notification', rsa.algorithm, rsa.keyId, NOTICE), 'utf8');
    const integrity = signer.envelope(rsa, 'notification', NOTICE);
    integrity.signature.value = nodeCrypto.sign('sha256', bytes, {
      key: rsa.privateKey, padding: nodeCrypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 20
    }).toString('base64');

    expect((await check(integrity, 'notification', trustOf([rsa]))).state).toBe(STATES.INVALID);
  });

  test('ECDSA in DER instead of IEEE P1363 does not verify', async () => {
    const nodeCrypto = require('crypto');
    const bytes = Buffer.from(signer.canonical('notification', ec.algorithm, ec.keyId, NOTICE), 'utf8');
    const integrity = signer.envelope(ec, 'notification', NOTICE);
    integrity.signature.value = nodeCrypto.sign('sha256', bytes, ec.privateKey).toString('base64');

    expect((await check(integrity, 'notification', trustOf([ec]))).state).toBe(STATES.INVALID);
  });

  test('an RSA key under 3072 bits is refused even when pinned', async () => {
    const result = await check(signer.envelope(rsaSmall, 'notification', NOTICE), 'notification', trustOf([rsaSmall]));
    expect(result.state).toBe(STATES.ERROR);
    expect(result.reason).toMatch(/3072/);
  });

  test('an EC key pinned as RSA-PSS never verifies', async () => {
    const mislabelled = parseTrustedKeys(JSON.stringify([{ keyId: ec.keyId, algorithm: 'RSA-PSS-SHA256', spki: ec.spki }]));
    const integrity = signer.envelope(ec, 'notification', NOTICE, { signature: { algorithm: 'RSA-PSS-SHA256', encoding: 'rsa-pss' } });
    expect((await check(integrity, 'notification', mislabelled)).state).not.toBe(STATES.VERIFIED);
  });

  test('no WebCrypto is an error, and nothing is shown', async () => {
    const result = await verifySignature({
      integrity: signer.envelope(ec, 'notification', NOTICE), type: 'notification', trust: trustOf([ec]), subtle: null
    });
    expect(result.state).toBe(STATES.ERROR);
    expect(result.content).toBeNull();
  });

  test('a malformed trust list is an error for every envelope', () => {
    const checked = validateEnvelope(signer.envelope(ec, 'notification', NOTICE), 'notification', parseTrustedKeys('{'));
    expect(checked.ok).toBe(false);
    expect(checked.state).toBe(STATES.ERROR);
  });
});

describe('the other signed text types', () => {
  test('an FAQ verifies, and a changed answer does not', async () => {
    const trust = trustOf([ec]);
    expect((await check(signer.envelope(ec, 'faq', FAQ), 'faq', trust)).state).toBe(STATES.VERIFIED);

    const changed = signer.envelope(ec, 'faq', FAQ);
    changed.content.answer = 'Six months.';
    expect((await check(changed, 'faq', trust)).state).toBe(STATES.INVALID);

    /* view_count is not part of the signature, and adding it is an unknown field. */
    const counted = signer.envelope(ec, 'faq', FAQ);
    counted.content.view_count = 4;
    expect((await check(counted, 'faq', trust)).state).toBe(STATES.INVALID);
  });
});

/* ---------------------------------------------------------------- images */

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 1, 2, 3, 4, 5, 6, 7, 8]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);

/** A fetch that serves `files` by URL, counting requests, and 404s for anything else. */
function fakeServer(files) {
  const served = { count: 0, urls: [] };

  const fetch = (url) => {
    served.count += 1;
    served.urls.push(url);

    if (!Object.prototype.hasOwnProperty.call(files, url)) {
      return Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.reject(new Error('404')) });
    }

    const bytes = files[url];
    return Promise.resolve({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer)
    });
  };

  return { fetch: fetch, served: served };
}

function checkImage(integrity, files, extra) {
  const server = fakeServer(files);
  return verifyImage(Object.assign({
    integrity: integrity,
    trust: trustOf([ec, rsa]),
    subtle: createNodeSubtle(),
    fetch: server.fetch,
    resolveUrl: (path) => 'http://files.test' + path,
    cache: createImageCache()
  }, extra)).then((result) => Object.assign(result, { served: server.served }));
}

[['ECDSA P-256', () => ec], ['RSA-PSS 3072', () => rsa]].forEach(([label, keyOf]) => {
  describe('an image signed with ' + label, () => {
    const PATH = '/uploads/adverts/home-crystal.png';
    const URL_OF = 'http://files.test' + PATH;
    let key;
    let integrity;

    beforeAll(() => {
      key = keyOf();
      integrity = signer.envelope(key, 'image', signer.imageContent(PATH, 'image/png', PNG));
    });

    test('the original verifies, and hands back a Blob of the signed type', async () => {
      const result = await checkImage(integrity, { [URL_OF]: PNG });
      expect(result.state).toBe(STATES.VERIFIED);
      expect(result.blob.type).toBe('image/png');
      expect(result.blob.size).toBe(PNG.length);
      expect(result.served.urls).toEqual([URL_OF]);
    });

    test('a one-byte modification fails', async () => {
      const tampered = PNG.slice();
      tampered[PNG.length - 1] ^= 0x01;
      const result = await checkImage(integrity, { [URL_OF]: tampered });
      expect(result.state).toBe(STATES.INVALID);
      expect(result.blob).toBeNull();
    });

    test('a replacement file of the same size fails', async () => {
      const replacement = Uint8Array.from(PNG, (byte, i) => (i < 8 ? byte : 0x42));
      expect((await checkImage(integrity, { [URL_OF]: replacement })).state).toBe(STATES.INVALID);
    });

    test('a recomputed hash that nobody re-signed fails the signature', async () => {
      const replacement = Uint8Array.from(PNG, (byte, i) => (i < 8 ? byte : 0x43));
      const forged = JSON.parse(JSON.stringify(integrity));
      forged.content.sha256 = signer.imageContent(PATH, 'image/png', replacement).sha256;

      const result = await checkImage(forged, { [URL_OF]: replacement });
      expect(result.state).toBe(STATES.INVALID);
      /* Rejected on the signature, before the file was even requested. */
      expect(result.served.count).toBe(0);
    });

    test('modified metadata fails - the size, the path, the type', async () => {
      const size = JSON.parse(JSON.stringify(integrity));
      size.content.size += 1;
      expect((await checkImage(size, { [URL_OF]: PNG })).state).toBe(STATES.INVALID);

      const moved = JSON.parse(JSON.stringify(integrity));
      moved.content.storageKey = '/uploads/adverts/other.png';
      expect((await checkImage(moved, { 'http://files.test/uploads/adverts/other.png': PNG })).state).toBe(STATES.INVALID);

      const retyped = JSON.parse(JSON.stringify(integrity));
      retyped.content.mimeType = 'image/jpeg';
      expect((await checkImage(retyped, { [URL_OF]: PNG })).state).toBe(STATES.INVALID);
    });

    test('a size that disagrees with the file fails even when signed', async () => {
      const content = signer.imageContent(PATH, 'image/png', PNG);
      content.size = PNG.length + 10;
      const signedWrong = signer.envelope(key, 'image', content);
      const result = await checkImage(signedWrong, { [URL_OF]: PNG });
      expect(result.state).toBe(STATES.INVALID);
      expect(result.reason).toMatch(/size/);
    });

    test('the wrong MIME type fails, even with a valid signature', async () => {
      /* Signed as a PNG, but the bytes are a JPEG. */
      const jpegPath = '/uploads/adverts/actually-a-jpeg.png';
      const lying = signer.envelope(key, 'image', signer.imageContent(jpegPath, 'image/png', JPEG));
      const result = await checkImage(lying, { ['http://files.test' + jpegPath]: JPEG });
      expect(result.state).toBe(STATES.INVALID);
      expect(result.reason).toMatch(/type/);

      /* And a type outside the policy cannot be signed into acceptance. */
      const bmp = signer.envelope(key, 'image', Object.assign(signer.imageContent(PATH, 'image/png', PNG), { mimeType: 'image/bmp' }));
      expect((await checkImage(bmp, { [URL_OF]: PNG })).state).toBe(STATES.INVALID);
    });

    test('a missing file fails', async () => {
      const result = await checkImage(integrity, {});
      expect(result.state).toBe(STATES.INVALID);
      expect(result.reason).toMatch(/missing file/);
    });

    test('a missing signature fails, and downloads nothing', async () => {
      const result = await checkImage(null, { [URL_OF]: PNG });
      expect(result.state).toBe(STATES.INVALID);
      expect(result.served.count).toBe(0);

      const unsigned = await checkImage({ content: integrity.content }, { [URL_OF]: PNG });
      expect(unsigned.state).toBe(STATES.INVALID);
      expect(unsigned.served.count).toBe(0);
    });

    test('an envelope for one path attached to a row naming another fails', async () => {
      const result = await checkImage(integrity, { [URL_OF]: PNG }, { expectedPath: '/uploads/adverts/other.png' });
      expect(result.state).toBe(STATES.INVALID);
    });

    test('a network failure is an error, not a verdict', async () => {
      const result = await checkImage(integrity, {}, { fetch: () => Promise.reject(new Error('offline')) });
      expect(result.state).toBe(STATES.ERROR);
    });
  });
});

describe('the verified-image cache', () => {
  const PATH = '/uploads/products/front.png';

  test('concurrent and repeated requests fetch a file once, and failures are not remembered', async () => {
    const integrity = signer.envelope(ec, 'image', signer.imageContent(PATH, 'image/png', PNG));
    let files = { [PATH]: PNG.slice() };
    let requests = 0;

    const verifier = createVerifier({
      trust: trustOf([ec]),
      subtle: createNodeSubtle(),
      fetch: (url) => {
        requests += 1;
        const bytes = files[url];
        return Promise.resolve(bytes
          ? { ok: true, status: 200, arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer) }
          : { ok: false, status: 404 });
      }
    });

    /* A tampered file first: refused, and not cached. */
    files[PATH][12] ^= 0xff;
    expect((await verifier.verifyImage(integrity)).state).toBe(STATES.INVALID);
    expect(requests).toBe(1);

    /* Restored: checked again, and this time kept. Three at once share one request. */
    files = { [PATH]: PNG.slice() };
    const answers = await Promise.all([verifier.verifyImage(integrity), verifier.verifyImage(integrity), verifier.verifyImage(integrity)]);
    answers.forEach((answer) => expect(answer.state).toBe(STATES.VERIFIED));
    expect(requests).toBe(2);

    await verifier.verifyImage(integrity);
    expect(requests).toBe(2);

    /* The cache holds bytes, not trust: a forged envelope for the cached file still fails. */
    const forged = JSON.parse(JSON.stringify(integrity));
    forged.signature.value = signer.envelope(ec, 'image', Object.assign({}, integrity.content, { size: 1 })).signature.value;
    expect((await verifier.verifyImage(forged)).state).toBe(STATES.INVALID);
  });

  test('sniffing recognises the five allowed types and nothing else', () => {
    expect(sniffMimeType(PNG)).toBe('image/png');
    expect(sniffMimeType(JPEG)).toBe('image/jpeg');
    expect(sniffMimeType(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 2]))).toBe('image/gif');
    expect(sniffMimeType(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]))).toBe('image/webp');
    expect(sniffMimeType(utf8Encode('<?xml version="1.0"?>\n<!-- x -->\n<svg xmlns="http://www.w3.org/2000/svg"></svg>', { native: false }))).toBe('image/svg+xml');
    expect(sniffMimeType(utf8Encode('<html><body>hello</body></html>', { native: false }))).toBeNull();
    expect(sniffMimeType(Uint8Array.from([0x42, 0x4d, 0, 0]))).toBeNull();
  });
});

describe('the verifier', () => {
  test('text answers are cached by envelope, and an edit is a fresh check', async () => {
    const subtle = createNodeSubtle();
    const verifier = createVerifier({ trust: trustOf([ec]), subtle: subtle });
    const integrity = signer.envelope(ec, 'notification', NOTICE);

    expect((await verifier.verifyText('notification', integrity)).state).toBe(STATES.VERIFIED);
    expect((await verifier.verifyText('notification', JSON.parse(JSON.stringify(integrity)))).state).toBe(STATES.VERIFIED);
    expect(subtle.calls.verify).toBe(1);
    expect(verifier.peekText('notification', integrity).state).toBe(STATES.VERIFIED);

    const edited = JSON.parse(JSON.stringify(integrity));
    edited.content.title = 'changed';
    expect((await verifier.verifyText('notification', edited)).state).toBe(STATES.INVALID);
    expect(subtle.calls.verify).toBe(2);
  });

  test('an unsigned item never goes looking for WebCrypto', async () => {
    const lookups = jest.fn(() => null);
    const verifier = createVerifier({ trust: trustOf([ec]) });
    // The default backend lookup is replaced by passing a function-valued subtle below.
    const result = await verifySignature({ integrity: null, type: 'faq', trust: trustOf([ec]), subtle: lookups });
    expect(result.state).toBe(STATES.INVALID);
    expect(lookups).not.toHaveBeenCalled();
    expect(verifier.peekText('faq', null)).toBeNull();
  });
});
