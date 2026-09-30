'use strict';

/**
 * CONTENT SIGNING, TESTED WITHOUT A SERVER.
 *
 *   npm run test:signing
 *
 * Plain `assert` and a twenty-line runner, because the project has no test
 * framework and this is not the change to add one in. Every key used here is
 * generated inside this file and thrown away when it ends - never the
 * development key in .content-keys, never anything a deployment trusts.
 *
 * What is covered is the backend half of the specification's section 19:
 * both algorithms, their parameters, configuration that must refuse to start,
 * key ids unknown and revoked, rotation, every way a notice or an image can be
 * tampered with that the server can see, and the shared test vectors the
 * storefront verifies the same way. What needs a database - the console's
 * save paths, the upload route, the envelopes on real replies - is in
 * scripts/check.js, against the running API.
 *
 * The one exception is the last section, "signature views": the views and
 * the audit verdicts they show ARE the database, so those tests use the
 * development database the API is configured with (migrated), on rows they
 * create and delete themselves. See the note above them.
 *
 * openssl is used to make certificates (Node 12 cannot) and, deliberately, to
 * verify signatures independently of the code under test. The PKCS#12 tests
 * build their own CAs, leaf certificates and .p12 files with it, inside the
 * temporary directory - the one exception is described at legacyP12().
 */

const assert = require('assert');
const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');

const algorithms = require('../src/security/algorithms');
const canonical = require('../src/security/canonicalPayload');
const schemas = require('../src/security/schemas');
const signingConfig = require('../src/security/signingConfig');
const keyProvider = require('../src/security/keyProvider');
const imageFile = require('../src/security/imageFile');
const contentOf = require('../src/security/contentOf');
const maintenance = require('../src/security/maintenance');
const { validateEnvelope, REASON } = require('../src/security/signatureValidation');
const { createSigningService, STATUS } = require('../src/security/signingService');

const OPENSSL = process.env.OPENSSL_BIN || 'openssl';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'crystal-signing-test-'));

/* ------------------------------------------------------------------ */
/*  the runner                                                         */
/* ------------------------------------------------------------------ */

const tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }

async function run() {
  let failed = 0;
  let group = null;

  for (let i = 0; i < tests.length; i += 1) {
    const t = tests[i];
    const heading = t.name.split(': ')[0];
    if (heading !== group) {
      group = heading;
      console.log('\n' + heading);
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      await t.fn();
      console.log('  ok   ' + t.name.slice(heading.length + 2));
    } catch (err) {
      failed += 1;
      console.log('  FAIL ' + t.name.slice(heading.length + 2) + '\n       ' + (err && err.message));
    }
  }

  console.log('\n' + (tests.length - failed) + ' passed, ' + failed + ' failed');
  return failed;
}

/* ------------------------------------------------------------------ */
/*  fixtures - throwaway keys, certificates and a fake provider        */
/* ------------------------------------------------------------------ */

const EC = algorithms.ecdsa.generateKeyPair();
const EC2 = algorithms.ecdsa.generateKeyPair();
const RSA = algorithms.rsa.generateKeyPair();

/**
 * A key provider over KeyObjects, shaped like keyProvider.createKeyProvider's
 * answer - for the tests that are about signing, not about loading files.
 */
function providerOf(active, others, revoked) {
  const trusted = {};
  [active].concat(others || []).forEach(function (k) { trusted[k.keyId] = k; });
  const revokedIds = revoked || [];

  return {
    activeKeyId: active.keyId,
    algorithm: active.algorithm,
    active: function () { return active; },
    resolve: function (keyId) {
      if (revokedIds.indexOf(keyId) !== -1) return { keyId: keyId, revoked: true };
      const k = trusted[keyId];
      return k ? { keyId: k.keyId, algorithm: k.algorithm, publicKey: k.publicKey, revoked: false, active: k === active } : null;
    }
  };
}

function identity(keyId, algorithm, pair) {
  return { keyId: keyId, algorithm: algorithm, privateKey: pair.privateKey, publicKey: pair.publicKey };
}

const EC_V1 = identity('test-ec-v1', algorithms.ecdsa, EC);
const EC_V2 = identity('test-ec-v2', algorithms.ecdsa, EC2);
const RSA_V1 = identity('test-rsa-v1', algorithms.rsa, RSA);

/** An in-memory content_signatures table. */
function memoryStore() {
  const rows = {};
  return {
    rows: rows,
    upsert: function (row) { rows[row.content_type + ':' + row.content_ref] = Object.assign({}, row); return Promise.resolve([row]); },
    find: function (type, ref) { return Promise.resolve(rows[type + ':' + ref]); },
    findMany: function (type, refs) { return Promise.resolve(refs.map(function (r) { return rows[type + ':' + r]; }).filter(Boolean)); },
    remove: function (type, ref) { delete rows[type + ':' + ref]; return Promise.resolve(1); }
  };
}

function serviceFor(active, others, revoked, store) {
  return createSigningService({ keys: providerOf(active, others, revoked), store: store || memoryStore() });
}

function notice(overrides) {
  return Object.assign({
    id: 12,
    title: 'Service centre hours — 服务时间',
    content: '<p>Open <b>9–18</b> on weekdays.</p>',
    originId: 2,
    status: 'PUBLISHED',
    startsAt: '2026-09-01T00:00:00.000Z',
    endsAt: null,
    sortOrder: 5,
    createdAt: '2026-08-30T10:00:00.000Z',
    updatedAt: '2026-09-01T12:34:56.789Z'
  }, overrides || {});
}

function faq(overrides) {
  return Object.assign({
    id: 3, category: 'TV', question: 'Q?', answer: 'A.',
    sortOrder: 0, status: 'PUBLISHED', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z'
  }, overrides || {});
}

function sslConfig(cn) {
  return '[req]\ndistinguished_name = dn\nx509_extensions = ext\nprompt = no\n[dn]\nCN = ' + cn +
    '\n[ext]\nbasicConstraints = critical,CA:FALSE\nkeyUsage = critical,digitalSignature\n';
}

/** A key and certificate written the way `npm run content-keys` writes them. */
function makeCertificate(dir, keyId, newKeyArgs, options) {
  const opts = options || {};
  fs.mkdirSync(dir, { recursive: true });
  const cnf = path.join(dir, keyId + '.cnf');
  fs.writeFileSync(cnf, sslConfig(opts.cn || keyId));
  childProcess.execFileSync(OPENSSL, ['req', '-x509'].concat(newKeyArgs).concat([
    '-nodes', '-sha256', '-days', String(opts.days || 30), '-config', cnf,
    '-keyout', path.join(dir, keyId + '.key.pem'), '-out', path.join(dir, keyId + '.crt.pem')
  ]), { stdio: ['ignore', 'ignore', 'pipe'] });
  fs.unlinkSync(cnf);
}

function settings(dir, algorithm, keyId, extra) {
  return Object.assign({
    algorithm: algorithms.byConfig(algorithm), algorithmConfig: algorithm, keyId: keyId, keyDir: dir,
    verifyKeyIds: [], revokedKeyIds: [], developmentDefault: false
  }, extra || {});
}

function throwsConfig(fn, pattern) {
  assert.throws(fn, function (err) {
    assert.ok(err instanceof signingConfig.SigningConfigError, 'expected SigningConfigError, got ' + (err && err.name) + ': ' + (err && err.message));
    if (pattern) assert.ok(pattern.test(err.message), 'message "' + err.message + '" does not match ' + pattern);
    return true;
  });
}

/* A 1x1 PNG. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

/* ------------------------------------------------------------------ */
/*  algorithms                                                         */
/* ------------------------------------------------------------------ */

test('algorithms: ECDSA P-256 signs and verifies', function () {
  const service = serviceFor(EC_V1);
  const signed = service.signContent({ type: 'notification', content: notice() });

  assert.strictEqual(signed.signature.algorithm, 'ECDSA-P256-SHA256');
  assert.strictEqual(signed.signature.encoding, 'ieee-p1363');
  assert.strictEqual(signed.signature.keyId, 'test-ec-v1');
  assert.strictEqual(service.verifyContent({ type: 'notification', content: signed.content, signature: signed.signature }).valid, true);
});

test('algorithms: RSA-PSS 3072 signs and verifies', function () {
  const service = serviceFor(RSA_V1);
  const signed = service.signContent({ type: 'faq', content: faq() });

  assert.strictEqual(signed.signature.algorithm, 'RSA-PSS-SHA256');
  assert.strictEqual(signed.signature.encoding, 'rsa-pss');
  assert.strictEqual(Buffer.from(signed.signature.value, 'base64').length, 384);
  assert.strictEqual(service.verifyContent({ type: 'faq', content: signed.content, signature: signed.signature }).valid, true);
});

test('algorithms: RSA-PSS uses SHA-256, MGF1-SHA-256 and a 32-byte salt (checked by openssl)', function () {
  const bytes = canonical.canonicalBytes('faq', 'RSA-PSS-SHA256', 'test-rsa-v1', faq());
  const signature = algorithms.rsa.sign(RSA.privateKey, bytes);

  /* Node itself, with the parameters stated explicitly. */
  const pss = function (saltLength) {
    return crypto.verify('sha256', bytes, { key: RSA.publicKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: saltLength }, signature);
  };
  assert.strictEqual(pss(32), true, 'salt 32 must verify');
  assert.strictEqual(pss(20), false, 'salt 20 must not');
  assert.strictEqual(pss(64), false, 'salt 64 must not');

  /* openssl, which has no stake in this code, with every parameter named. */
  const dir = fs.mkdtempSync(path.join(TMP, 'pss-'));
  fs.writeFileSync(path.join(dir, 'data'), bytes);
  fs.writeFileSync(path.join(dir, 'sig'), signature);
  fs.writeFileSync(path.join(dir, 'pub.pem'), RSA.publicKey.export({ type: 'spki', format: 'pem' }));
  const verify = function (salt, mgf) {
    try {
      childProcess.execFileSync(OPENSSL, ['dgst', '-sha256', '-sigopt', 'rsa_padding_mode:pss', '-sigopt', 'rsa_pss_saltlen:' + salt,
        '-sigopt', 'rsa_mgf1_md:' + mgf, '-verify', 'pub.pem', '-signature', 'sig', 'data'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
      return true;
    } catch (err) {
      return false;
    }
  };
  assert.strictEqual(verify(32, 'sha256'), true, 'openssl: salt 32 with MGF1-SHA256 must verify');
  assert.strictEqual(verify(32, 'sha1'), false, 'openssl: MGF1-SHA1 must not');
  assert.strictEqual(verify(64, 'sha256'), false, 'openssl: salt 64 must not');

  /* And a PSS signature made with Node's default (maximum) salt is refused by ours. */
  const maxSalt = crypto.sign('sha256', bytes, { key: RSA.privateKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING });
  assert.strictEqual(algorithms.rsa.verify(RSA.publicKey, bytes, maxSalt), false);
});

test('algorithms: ECDSA signatures are 64-byte IEEE P1363 and interoperate with DER', function () {
  const bytes = canonical.canonicalBytes('notification', 'ECDSA-P256-SHA256', 'test-ec-v1', notice());

  for (let i = 0; i < 20; i += 1) {
    assert.strictEqual(algorithms.ecdsa.sign(EC.privateKey, bytes).length, 64);
  }

  /* r||s re-encoded as the DER SEQUENCE OpenSSL speaks verifies there too. */
  const p1363 = algorithms.ecdsa.sign(EC.privateKey, bytes);
  const integer = function (buf) {
    let b = buf;
    while (b.length > 1 && b[0] === 0 && !(b[1] & 0x80)) b = b.slice(1);
    if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]);
    return Buffer.concat([Buffer.from([0x02, b.length]), b]);
  };
  const body = Buffer.concat([integer(p1363.slice(0, 32)), integer(p1363.slice(32))]);
  const der = Buffer.concat([Buffer.from([0x30, body.length]), body]);
  assert.strictEqual(crypto.verify('sha256', bytes, EC.publicKey, der), true, 'the DER form verifies with Node defaults');

  const dir = fs.mkdtempSync(path.join(TMP, 'ec-'));
  fs.writeFileSync(path.join(dir, 'data'), bytes);
  fs.writeFileSync(path.join(dir, 'sig'), der);
  fs.writeFileSync(path.join(dir, 'pub.pem'), EC.publicKey.export({ type: 'spki', format: 'pem' }));
  childProcess.execFileSync(OPENSSL, ['dgst', '-sha256', '-verify', 'pub.pem', '-signature', 'sig', 'data'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });

  /* A DER signature is the wrong format for the storefront, and ours refuses it rather than guessing. */
  const nodeDefault = crypto.sign('sha256', bytes, EC.privateKey);
  assert.strictEqual(algorithms.ecdsa.verify(EC.publicKey, bytes, nodeDefault), false);
});

test('algorithms: the registry resolves only its own names', function () {
  assert.strictEqual(algorithms.byConfig('ECDSA'), algorithms.ecdsa);
  assert.strictEqual(algorithms.byConfig('RSA'), algorithms.rsa);
  ['ecdsa', 'RSA-PSS', 'constructor', '__proto__', 'toString', '', null, undefined].forEach(function (name) {
    assert.strictEqual(algorithms.byConfig(name), null, String(name));
    assert.strictEqual(algorithms.byEnvelope(name), null, String(name));
  });
});

test('algorithms: key type checks refuse the wrong curve, a small RSA key and the other type', function () {
  assert.strictEqual(algorithms.ecdsa.keyProblem(EC.publicKey), null);
  assert.strictEqual(algorithms.rsa.keyProblem(RSA.publicKey), null);
  assert.ok(algorithms.ecdsa.keyProblem(RSA.publicKey));
  assert.ok(algorithms.rsa.keyProblem(EC.publicKey));
  assert.ok(algorithms.ecdsa.keyProblem(crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' }).publicKey));
  assert.ok(/2048-bit/.test(algorithms.rsa.keyProblem(crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey)));
});

test('algorithms: switching the active algorithm changes new signatures and nothing else', function () {
  const store = memoryStore();
  const before = serviceFor(EC_V1, [RSA_V1], [], store);
  const after = serviceFor(RSA_V1, [EC_V1], [], store);

  const old = before.signContent({ type: 'notification', content: notice() });
  const fresh = after.signContent({ type: 'notification', content: notice({ id: 13 }) });

  assert.strictEqual(old.signature.algorithm, 'ECDSA-P256-SHA256');
  assert.strictEqual(fresh.signature.algorithm, 'RSA-PSS-SHA256');
  /* The old signature keeps the algorithm and key it was made with, and still verifies. */
  assert.strictEqual(after.verifyContent({ type: 'notification', content: old.content, signature: old.signature }).valid, true);
});

/* ------------------------------------------------------------------ */
/*  configuration                                                      */
/* ------------------------------------------------------------------ */

const EMPTY = { algorithm: '', keyId: '', keyDir: '', verifyKeyIds: '', revokedKeyIds: '', p12: '', p12Password: '', caChain: '' };
const ROOT = { isProduction: false, rootDir: TMP };

test('configuration: an invalid algorithm is a startup error, with no fallback', function () {
  ['ecdsa', 'RSA-PSS', 'ED25519', 'constructor', ' '].forEach(function (value) {
    throwsConfig(function () {
      signingConfig.resolve(Object.assign({}, EMPTY, { algorithm: value, keyId: 'k1', keyDir: TMP }), ROOT);
    }, value.trim() ? /ECDSA or RSA|no fallback/ : /CONTENT_SIGNING_ALGORITHM/);
  });
});

test('configuration: production with nothing configured refuses to start', function () {
  throwsConfig(function () { signingConfig.resolve(EMPTY, { isProduction: true, rootDir: TMP }); }, /production/);
});

test('configuration: development with nothing configured uses the development key location only', function () {
  const resolved = signingConfig.resolve(EMPTY, ROOT);
  assert.strictEqual(resolved.algorithm, algorithms.ecdsa);
  assert.strictEqual(resolved.keyId, 'content-key-dev');
  assert.strictEqual(resolved.keyDir, path.join(TMP, '.content-keys'));
  assert.strictEqual(resolved.developmentDefault, true);
});

test('configuration: half a configuration is refused, naming what is missing', function () {
  throwsConfig(function () { signingConfig.resolve(Object.assign({}, EMPTY, { algorithm: 'RSA' }), ROOT); }, /CONTENT_SIGNING_KEY_ID, CONTENT_SIGNING_KEY_DIR/);
  throwsConfig(function () { signingConfig.resolve(Object.assign({}, EMPTY, { revokedKeyIds: 'old' }), ROOT); }, /CONTENT_SIGNING_ALGORITHM/);
});

test('configuration: key ids cannot be paths, and the active key cannot be revoked', function () {
  ['../etc/passwd', 'a/b', '.hidden', 'x'.repeat(65)].forEach(function (keyId) {
    throwsConfig(function () { signingConfig.resolve(Object.assign({}, EMPTY, { algorithm: 'ECDSA', keyId: keyId, keyDir: TMP }), ROOT); });
  });
  throwsConfig(function () {
    signingConfig.resolve({ algorithm: 'ECDSA', keyId: 'v2', keyDir: TMP, verifyKeyIds: 'v1', revokedKeyIds: 'v2' }, ROOT);
  }, /revoked/i);

  const resolved = signingConfig.resolve({ algorithm: 'RSA', keyId: 'v3', keyDir: 'keys', verifyKeyIds: 'v1, v2, v3', revokedKeyIds: 'v1' }, ROOT);
  assert.deepStrictEqual(resolved.verifyKeyIds, ['v2'], 'the active key and revoked ids are not verification keys');
  assert.strictEqual(resolved.keyDir, path.join(TMP, 'keys'));
});

test('configuration: a .p12 needs the algorithm, the key id and its password - the key id is never derived', function () {
  throwsConfig(function () { signingConfig.resolve(Object.assign({}, EMPTY, { p12: 'k.p12', p12Password: 'pw' }), ROOT); },
    /CONTENT_SIGNING_ALGORITHM, CONTENT_SIGNING_KEY_ID are not set/);
  throwsConfig(function () { signingConfig.resolve(Object.assign({}, EMPTY, { algorithm: 'ECDSA', keyId: 'v1', p12: 'k.p12' }), ROOT); },
    /CONTENT_SIGNING_P12_PASSWORD is not set/);
  throwsConfig(function () { signingConfig.resolve(Object.assign({}, EMPTY, { algorithm: 'ECDSA', p12: 'k.p12', p12Password: 'pw' }), ROOT); },
    /CONTENT_SIGNING_KEY_ID is not set.*never read out of the certificate/);

  /* No key directory needed beside a .p12 - it is only where previous keys live. */
  const resolved = signingConfig.resolve(Object.assign({}, EMPTY, { algorithm: 'RSA', keyId: 'v1', p12: 'k.p12', p12Password: 'pw', caChain: 'ca.crt' }), ROOT);
  assert.strictEqual(resolved.source, 'p12');
  assert.strictEqual(resolved.p12.file, path.join(TMP, 'k.p12'));
  assert.strictEqual(resolved.caChain, path.join(TMP, 'ca.crt'));
  assert.strictEqual(resolved.keyDir, null);
});

test('configuration: invalid .p12 combinations are refused, never fallen back from', function () {
  throwsConfig(function () {
    signingConfig.resolve({ algorithm: 'ECDSA', keyId: 'v1', keyDir: TMP, p12Password: 'pw' }, ROOT);
  }, /CONTENT_SIGNING_P12_PASSWORD is set but CONTENT_SIGNING_P12 is not/);
  throwsConfig(function () {
    signingConfig.resolve({ algorithm: 'ECDSA', keyId: 'v2', p12: 'k.p12', p12Password: 'pw', verifyKeyIds: 'v1' }, ROOT);
  }, /CONTENT_SIGNING_VERIFY_KEY_IDS names v1.*CONTENT_SIGNING_KEY_DIR/);
  throwsConfig(function () { signingConfig.resolve({ caChain: 'ca.crt' }, ROOT); }, /CONTENT_SIGNING_ALGORITHM/);
});

test('configuration: the CA chain is required in production with a .p12, and only there', function () {
  const p12 = { algorithm: 'ECDSA', keyId: 'v1', p12: 'k.p12', p12Password: 'pw' };
  throwsConfig(function () { signingConfig.resolve(p12, { isProduction: true, rootDir: TMP }); }, /CONTENT_SIGNING_CA_CHAIN is not set/);
  assert.strictEqual(signingConfig.resolve(p12, ROOT).caChain, null, 'development may go without');
  assert.strictEqual(signingConfig.resolve(Object.assign({ caChain: '/ca.crt' }, p12), { isProduction: true, rootDir: TMP }).source, 'p12');
  assert.strictEqual(signingConfig.resolve({ algorithm: 'ECDSA', keyId: 'v1', keyDir: TMP }, { isProduction: true, rootDir: TMP }).caChain, null,
    'a production key directory of self-signed certificates needs no chain');
});

test('configuration: the .p12 password does not appear when the settings are printed', function () {
  const secret = 'printed-nowhere-' + crypto.randomBytes(6).toString('hex');
  const resolved = signingConfig.resolve({ algorithm: 'ECDSA', keyId: 'v1', p12: 'k.p12', p12Password: secret }, ROOT);
  assert.strictEqual(resolved.p12.password, secret, 'readable where it is needed');
  [util.inspect(resolved, { depth: 5 }), JSON.stringify(resolved), JSON.stringify(Object.assign({}, resolved.p12)), String(Object.keys(resolved.p12))]
    .forEach(function (text) { assert.strictEqual(text.indexOf(secret), -1, text); });
});

/* ------------------------------------------------------------------ */
/*  keys and certificates                                              */
/* ------------------------------------------------------------------ */

const KEYS = path.join(TMP, 'keys');
makeCertificate(KEYS, 'ec-v1', algorithms.ecdsa.opensslNewKey);
makeCertificate(KEYS, 'ec-v2', algorithms.ecdsa.opensslNewKey);
makeCertificate(KEYS, 'rsa-v1', algorithms.rsa.opensslNewKey);
makeCertificate(KEYS, 'rsa-small', ['-newkey', 'rsa:2048']);
makeCertificate(KEYS, 'wrong-cn', algorithms.ecdsa.opensslNewKey, { cn: 'somebody-else' });

test('keys: an ECDSA key and certificate load and sign', function () {
  const provider = keyProvider.createKeyProvider(settings(KEYS, 'ECDSA', 'ec-v1'), { openssl: OPENSSL });
  assert.strictEqual(provider.activeKeyId, 'ec-v1');
  assert.strictEqual(provider.algorithm, algorithms.ecdsa);
  const service = createSigningService({ keys: provider });
  const signed = service.signContent({ type: 'faq', content: faq() });
  assert.strictEqual(service.verifyContent({ type: 'faq', content: signed.content, signature: signed.signature }).valid, true);
  assert.strictEqual(provider.trustedKeys()[0].spki, provider.active().publicKey.export({ type: 'spki', format: 'der' }).toString('base64'));
});

test('keys: an RSA key and certificate load under RSA', function () {
  const provider = keyProvider.createKeyProvider(settings(KEYS, 'RSA', 'rsa-v1'), { openssl: OPENSSL });
  assert.strictEqual(provider.algorithm, algorithms.rsa);
});

test('keys: a key of the wrong type for the configured algorithm fails startup', function () {
  throwsConfig(function () { keyProvider.createKeyProvider(settings(KEYS, 'ECDSA', 'rsa-v1'), { openssl: OPENSSL }); }, /EC P-256/);
  throwsConfig(function () { keyProvider.createKeyProvider(settings(KEYS, 'RSA', 'ec-v1'), { openssl: OPENSSL }); }, /RSA/);
  throwsConfig(function () { keyProvider.createKeyProvider(settings(KEYS, 'RSA', 'rsa-small'), { openssl: OPENSSL }); }, /2048-bit/);
});

test('keys: a certificate for a different key pair fails startup', function () {
  const dir = path.join(TMP, 'mismatch');
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(KEYS, 'ec-v1.key.pem'), path.join(dir, 'ec-v1.key.pem'));
  fs.copyFileSync(path.join(KEYS, 'ec-v2.crt.pem'), path.join(dir, 'ec-v1.crt.pem'));
  throwsConfig(function () { keyProvider.createKeyProvider(settings(dir, 'ECDSA', 'ec-v1'), { openssl: OPENSSL }); }, /different key pairs/);
});

test('keys: a certificate issued to another name fails startup', function () {
  throwsConfig(function () { keyProvider.createKeyProvider(settings(KEYS, 'ECDSA', 'wrong-cn'), { openssl: OPENSSL }); }, /CN="somebody-else"/);
});

test('keys: a certificate outside its validity window fails startup', function () {
  const future = new Date(Date.now() + 400 * 24 * 3600 * 1000);
  const past = new Date(Date.now() - 400 * 24 * 3600 * 1000);
  throwsConfig(function () { keyProvider.createKeyProvider(settings(KEYS, 'ECDSA', 'ec-v1'), { openssl: OPENSSL, now: future }); }, /expired/);
  throwsConfig(function () { keyProvider.createKeyProvider(settings(KEYS, 'ECDSA', 'ec-v1'), { openssl: OPENSSL, now: past }); }, /not valid until/);
});

test('keys: a missing key names the fix, and a missing openssl says so', function () {
  throwsConfig(function () {
    keyProvider.createKeyProvider(settings(path.join(TMP, 'nowhere'), 'ECDSA', 'content-key-dev', { developmentDefault: true }), { openssl: OPENSSL });
  }, /npm run content-keys/);
  throwsConfig(function () {
    keyProvider.createKeyProvider(settings(KEYS, 'ECDSA', 'ec-v1'), { openssl: 'openssl-that-is-not-installed' });
  }, /openssl was not found/);
});

test('keys: verification keys need only a certificate, and take their algorithm from it', function () {
  const dir = path.join(TMP, 'verify-only');
  fs.mkdirSync(dir, { recursive: true });
  ['ec-v2.key.pem', 'ec-v2.crt.pem', 'rsa-v1.crt.pem'].forEach(function (name) {
    fs.copyFileSync(path.join(KEYS, name), path.join(dir, name));
  });

  const provider = keyProvider.createKeyProvider(settings(dir, 'ECDSA', 'ec-v2', { verifyKeyIds: ['rsa-v1'] }), { openssl: OPENSSL });
  assert.strictEqual(provider.resolve('rsa-v1').algorithm, algorithms.rsa);
  assert.strictEqual(provider.resolve('rsa-v1').active, false);
  assert.strictEqual(provider.resolve('nobody'), null);
});

/* ------------------------------------------------------------------ */
/*  PKCS#12 and the CA chain                                           */
/* ------------------------------------------------------------------ */

/*
 * A small PKI of its own, in the temporary directory: two unrelated CAs, and
 * leaf certificates issued by the first - good ones for both algorithms, an
 * expired one, one about to expire, one not for signatures - each packaged as
 * a .p12 with a password generated here. Nothing outside TMP is read.
 */

const PKI = path.join(TMP, 'pki');
fs.mkdirSync(PKI, { recursive: true });

const P12_PASSWORD = 'p12-test-' + crypto.randomBytes(12).toString('hex');

function ssl(args, env) {
  return childProcess.execFileSync(OPENSSL, args, { cwd: PKI, stdio: ['ignore', 'pipe', 'pipe'], env: env, windowsHide: true });
}

function pkiConfig(cn, extensions) {
  return ['[req]', 'distinguished_name = dn', 'x509_extensions = ext', 'prompt = no', '[dn]', 'CN = ' + cn, '[ext]']
    .concat(extensions).concat(['subjectKeyIdentifier = hash', '']).join('\n');
}

const CA_EXTENSIONS = ['basicConstraints = critical,CA:TRUE', 'keyUsage = critical,keyCertSign,cRLSign'];
const LEAF_EXTENSIONS = ['basicConstraints = critical,CA:FALSE', 'keyUsage = critical,digitalSignature'];

function makeCa(name) {
  fs.writeFileSync(path.join(PKI, name + '.cnf'), pkiConfig('Test CA ' + name, CA_EXTENSIONS));
  ssl(['req', '-x509'].concat(algorithms.ecdsa.opensslNewKey).concat(['-nodes', '-sha256', '-days', '3650',
    '-config', name + '.cnf', '-keyout', name + '.key.pem', '-out', name + '.crt']));
  return { name: name, key: path.join(PKI, name + '.key.pem'), crt: path.join(PKI, name + '.crt') };
}

/**
 * A certificate issued by `ca`. `validity` is ['-days', n], or
 * ['-not_before', ..., '-not_after', ...] for dates in the past - those two
 * options arrived in `openssl x509` with 3.4, which is what makes an expired
 * certificate a one-liner here rather than an `openssl ca` database.
 */
function issue(name, ca, options) {
  const opts = options || {};
  fs.writeFileSync(path.join(PKI, name + '.cnf'), pkiConfig(name, opts.extensions || LEAF_EXTENSIONS));
  ssl(['req', '-new'].concat(opts.newKey || algorithms.ecdsa.opensslNewKey).concat(['-nodes', '-config', name + '.cnf',
    '-keyout', name + '.key.pem', '-out', name + '.csr']));
  ssl(['x509', '-req', '-in', name + '.csr', '-CA', ca.crt, '-CAkey', ca.key,
    '-set_serial', '0x1' + crypto.randomBytes(8).toString('hex'), '-sha256']
    .concat(opts.validity || ['-days', '365'])
    .concat(['-extfile', name + '.cnf', '-extensions', 'ext', '-out', name + '.crt']));
  return { name: name, key: path.join(PKI, name + '.key.pem'), crt: path.join(PKI, name + '.crt') };
}

/** A .p12 of a key and certificate, the chain bundled, the password passed the way the code under test passes it. */
function p12Of(identity, options) {
  const opts = options || {};
  const env = Object.assign({}, process.env, { TEST_P12_PASSOUT: opts.password || P12_PASSWORD });
  const file = path.join(PKI, (opts.name || identity.name) + '.p12');
  ssl(['pkcs12', '-export', '-inkey', identity.key, '-in', identity.crt, '-name', identity.name]
    .concat(opts.chain ? ['-certfile', opts.chain] : [])
    .concat(opts.legacy ? ['-legacy'] : [])
    .concat(['-out', file, '-passout', 'env:TEST_P12_PASSOUT']), env);
  fs.chmodSync(file, 0o600);
  return file;
}

function p12Settings(algorithm, keyId, file, extra) {
  return signingConfig.resolve(Object.assign({ algorithm: algorithm, keyId: keyId, p12: file, p12Password: P12_PASSWORD }, extra || {}),
    { isProduction: false, rootDir: TMP });
}

const CA = makeCa('ca-crystal');
const OTHER_CA = makeCa('ca-other');
const EC_LEAF = issue('p12-ec-v1', CA);
const RSA_LEAF = issue('p12-rsa-v1', CA, { newKey: algorithms.rsa.opensslNewKey });
const OTHER_LEAF = issue('p12-other-ca', OTHER_CA);
const EXPIRED_LEAF = issue('p12-expired', CA, { validity: ['-not_before', '20200101000000Z', '-not_after', '20210101000000Z'] });
const SOON_LEAF = issue('p12-soon', CA, { validity: ['-days', '10'] });
const NOT_FOR_SIGNING = issue('p12-key-agreement', CA, { extensions: ['basicConstraints = critical,CA:FALSE', 'keyUsage = critical,keyAgreement'] });

const EC_P12 = p12Of(EC_LEAF, { chain: CA.crt });
const RSA_P12 = p12Of(RSA_LEAF, { chain: CA.crt });

test('pkcs12: an ECDSA .p12 with the right password loads, its chain verifies, and it signs', function () {
  const warnings = [];
  const provider = keyProvider.createKeyProvider(p12Settings('ECDSA', 'content-key-p12-ec', EC_P12, { caChain: CA.crt }),
    { openssl: OPENSSL, warn: function (m) { warnings.push(m); } });

  assert.strictEqual(provider.source, 'p12');
  assert.strictEqual(provider.algorithm, algorithms.ecdsa);
  assert.deepStrictEqual(warnings, []);

  const certificate = provider.activeCertificate();
  assert.strictEqual(certificate.chain.status, 'verified');
  assert.strictEqual(certificate.subjectCN, 'p12-ec-v1', 'a CA-issued certificate keeps its own name; the key id is configured');
  assert.ok(/Test CA ca-crystal/.test(certificate.issuer), certificate.issuer);
  assert.ok(keyProvider.describeCertificate(certificate).join('\n').indexOf('verified against ' + CA.crt) !== -1);

  /* The pin is the certificate's public key - checked against the certificate file openssl wrote. */
  const expected = crypto.createPublicKey(fs.readFileSync(EC_LEAF.crt)).export({ type: 'spki', format: 'der' }).toString('base64');
  assert.strictEqual(provider.trustedKeys()[0].spki, expected);

  const service = createSigningService({ keys: provider });
  const signed = service.signContent({ type: 'notification', content: notice() });
  assert.strictEqual(signed.signature.keyId, 'content-key-p12-ec');
  assert.strictEqual(service.verifyContent({ type: 'notification', content: signed.content, signature: signed.signature }).valid, true);
  assert.strictEqual(algorithms.ecdsa.verify(crypto.createPublicKey(fs.readFileSync(EC_LEAF.crt)),
    canonical.canonicalBytes('notification', signed.signature.algorithm, signed.signature.keyId, signed.content),
    Buffer.from(signed.signature.value, 'base64')), true, 'verifies under the certificate, independently of the provider');
});

test('pkcs12: an RSA-3072 .p12 loads, its chain verifies, and it signs', function () {
  const provider = keyProvider.createKeyProvider(p12Settings('RSA', 'content-key-p12-rsa', RSA_P12, { caChain: CA.crt }), { openssl: OPENSSL });
  assert.strictEqual(provider.algorithm, algorithms.rsa);
  assert.strictEqual(provider.activeCertificate().chain.status, 'verified');

  const service = createSigningService({ keys: provider });
  const signed = service.signContent({ type: 'faq', content: faq() });
  assert.strictEqual(signed.signature.algorithm, 'RSA-PSS-SHA256');
  assert.strictEqual(Buffer.from(signed.signature.value, 'base64').length, 384);
  assert.strictEqual(service.verifyContent({ type: 'faq', content: signed.content, signature: signed.signature }).valid, true);
});

test('pkcs12: a wrong password is a startup error, and nothing it says contains the password', function () {
  const wrong = 'wrong-' + crypto.randomBytes(12).toString('hex');
  const said = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  ['log', 'warn', 'error'].forEach(function (name) {
    console[name] = function () { said.push([].slice.call(arguments).join(' ')); };
  });

  let caught = null;
  try {
    keyProvider.createKeyProvider(p12Settings('ECDSA', 'content-key-p12-ec', EC_P12, { p12Password: wrong, caChain: CA.crt }),
      { openssl: OPENSSL, warn: function (m) { said.push(m); } });
  } catch (err) {
    caught = err;
  } finally {
    Object.keys(original).forEach(function (name) { console[name] = original[name]; });
  }

  assert.ok(caught instanceof signingConfig.SigningConfigError, 'a SigningConfigError, got ' + caught);
  assert.ok(/could not open the \.p12 at .* - wrong password or damaged file/.test(caught.message), caught.message);

  const everything = [caught.message, caught.stack, util.inspect(caught), JSON.stringify(caught)].concat(said).join('\n');
  assert.strictEqual(everything.indexOf(wrong), -1, 'the wrong password appears in: ' + everything);
  assert.strictEqual(everything.indexOf(P12_PASSWORD), -1, 'the right password appears in: ' + everything);

  /* A damaged file says the same thing, with openssl's reason. */
  const damaged = path.join(PKI, 'damaged.p12');
  fs.writeFileSync(damaged, fs.readFileSync(EC_P12).slice(0, 200));
  throwsConfig(function () {
    keyProvider.createKeyProvider(p12Settings('ECDSA', 'content-key-p12-ec', damaged), { openssl: OPENSSL });
  }, /wrong password or damaged file \(openssl: /);
});

test('pkcs12: the password travels only in openssl\'s environment, and no private key or password is written to disk', function () {
  const spawned = [];
  const written = [];
  const realSpawn = childProcess.spawnSync;
  const realWrite = fs.writeFileSync;

  childProcess.spawnSync = function (bin, args, options) {
    spawned.push({ args: args.slice(), env: options && options.env });
    return realSpawn.apply(childProcess, arguments);
  };
  fs.writeFileSync = function (file, data) {
    written.push({ file: String(file), data: Buffer.isBuffer(data) ? data.toString('latin1') : String(data) });
    return realWrite.apply(fs, arguments);
  };

  try {
    keyProvider.createKeyProvider(p12Settings('ECDSA', 'content-key-p12-ec', EC_P12, { caChain: CA.crt }), { openssl: OPENSSL });
  } finally {
    childProcess.spawnSync = realSpawn;
    fs.writeFileSync = realWrite;
  }

  const pkcs12 = spawned.filter(function (s) { return s.args[0] === 'pkcs12'; });
  assert.strictEqual(pkcs12.length, 3, 'the key, the certificate and the bundled CA certificates');
  pkcs12.forEach(function (s) {
    assert.strictEqual(s.args.join(' ').indexOf(P12_PASSWORD), -1, 'the password is on a command line: ' + s.args.join(' '));
    assert.ok(s.args.indexOf('env:' + keyProvider.PASSIN_VARIABLE) !== -1, 'read with -passin env:');
    assert.strictEqual(s.env[keyProvider.PASSIN_VARIABLE], P12_PASSWORD, 'handed over in the child\'s environment');
  });
  spawned.forEach(function (s) {
    if (s.args[0] !== 'pkcs12') assert.ok(!s.env, s.args[0] + ' is not given the password\'s environment');
  });

  assert.ok(written.length >= 1, 'the chain check wrote its certificates to temporary files');
  written.forEach(function (w) {
    assert.strictEqual(w.data.indexOf('PRIVATE KEY'), -1, 'a private key was written to ' + w.file);
    assert.strictEqual(w.data.indexOf(P12_PASSWORD), -1, 'the password was written to ' + w.file);
    assert.ok(/^(\s*-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----\s*)+$/.test(w.data), 'only certificates in ' + w.file);
    assert.strictEqual(fs.existsSync(w.file), false, 'the temporary file ' + w.file + ' was not removed');
  });
});

test('pkcs12: a leaf issued by a different CA fails the chain check', function () {
  const file = p12Of(OTHER_LEAF, { chain: OTHER_CA.crt });
  throwsConfig(function () {
    keyProvider.createKeyProvider(p12Settings('ECDSA', 'content-key-p12-ec', file, { caChain: CA.crt }), { openssl: OPENSSL });
  }, /does not verify against the CA chain .*ca-crystal\.crt: /);

  /* And without the other CA bundled, openssl's own reason is the missing issuer. */
  const bare = p12Of(OTHER_LEAF, { name: 'p12-other-ca-bare' });
  throwsConfig(function () {
    keyProvider.createKeyProvider(p12Settings('ECDSA', 'content-key-p12-ec', bare, { caChain: CA.crt }), { openssl: OPENSSL });
  }, /unable to get local issuer certificate/);
});

test('pkcs12: an expired leaf fails - by its dates, and by openssl verify on its own', function () {
  const file = p12Of(EXPIRED_LEAF, { chain: CA.crt });
  throwsConfig(function () {
    keyProvider.createKeyProvider(p12Settings('ECDSA', 'content-key-p12-ec', file, { caChain: CA.crt }), { openssl: OPENSSL });
  }, /the certificate for the active key "content-key-p12-ec" expired on 2021-01-01T00:00:00.000Z/);

  const verified = require('../src/utils/x509').verifyChainSync({ leafFile: EXPIRED_LEAF.crt, caFile: CA.crt, openssl: OPENSSL });
  assert.strictEqual(verified.ok, false);
  assert.ok(/expired/.test(verified.reason), verified.reason);
});

test('pkcs12: a CA certificate used as the signing certificate fails', function () {
  const file = p12Of(CA, { name: 'p12-the-ca-itself' });
  throwsConfig(function () {
    keyProvider.createKeyProvider(p12Settings('ECDSA', 'content-key-p12-ec', file, { caChain: CA.crt }), { openssl: OPENSSL });
  }, /is a CA certificate \(basicConstraints CA:TRUE\)/);
});

test('pkcs12: a certificate whose keyUsage excludes signatures fails', function () {
  const file = p12Of(NOT_FOR_SIGNING, { chain: CA.crt });
  throwsConfig(function () {
    keyProvider.createKeyProvider(p12Settings('ECDSA', 'content-key-p12-ec', file, { caChain: CA.crt }), { openssl: OPENSSL });
  }, /is not for signatures: its keyUsage is "Key Agreement"/);
});

test('pkcs12: an algorithm that does not match the key in the .p12 fails', function () {
  throwsConfig(function () {
    keyProvider.createKeyProvider(p12Settings('RSA', 'content-key-p12-ec', EC_P12, { caChain: CA.crt }), { openssl: OPENSSL });
  }, /the key in the \.p12 at .* needs a plain RSA key \(CONTENT_SIGNING_ALGORITHM=RSA\)/);
  throwsConfig(function () {
    keyProvider.createKeyProvider(p12Settings('ECDSA', 'content-key-p12-rsa', RSA_P12, { caChain: CA.crt }), { openssl: OPENSSL });
  }, /needs an EC P-256 key \(CONTENT_SIGNING_ALGORITHM=ECDSA\)/);
});

test('pkcs12: a certificate expiring within 30 days starts, with a warning', function () {
  const warnings = [];
  const provider = keyProvider.createKeyProvider(p12Settings('ECDSA', 'content-key-p12-soon', p12Of(SOON_LEAF, { chain: CA.crt }), { caChain: CA.crt }),
    { openssl: OPENSSL, warn: function (m) { warnings.push(m); } });
  assert.strictEqual(provider.activeKeyId, 'content-key-p12-soon');
  assert.strictEqual(warnings.length, 1, warnings.join('\n'));
  assert.ok(/"content-key-p12-soon" expires on .* \(in 9 days\).*NEW key id/.test(warnings[0]), warnings[0]);
});

test('pkcs12: without a chain in development it loads and says the chain was not checked', function () {
  const provider = keyProvider.createKeyProvider(p12Settings('ECDSA', 'content-key-p12-ec', EC_P12), { openssl: OPENSSL });
  assert.strictEqual(provider.activeCertificate().chain.status, 'not-configured');
  assert.ok(/chain    not checked/.test(keyProvider.describeCertificate(provider.activeCertificate()).join('\n')));
});

test('pkcs12: renewal - previous keys, self-signed or from the CA and expired, are still believed', function () {
  const dir = path.join(TMP, 'renewal');
  fs.mkdirSync(dir, { recursive: true });
  /* content-keys' self-signed key from before the CA, and the expired CA certificate a renewal replaced. */
  fs.copyFileSync(path.join(KEYS, 'ec-v1.crt.pem'), path.join(dir, 'ec-v1.crt.pem'));
  fs.copyFileSync(EXPIRED_LEAF.crt, path.join(dir, 'content-key-p12-v0.crt.pem'));

  const warnings = [];
  const provider = keyProvider.createKeyProvider(
    p12Settings('ECDSA', 'content-key-p12-v1', EC_P12, { caChain: CA.crt, keyDir: dir, verifyKeyIds: 'ec-v1,content-key-p12-v0' }),
    { openssl: OPENSSL, warn: function (m) { warnings.push(m); } });

  assert.strictEqual(provider.resolve('ec-v1').algorithm, algorithms.ecdsa);
  assert.strictEqual(provider.resolve('content-key-p12-v0').algorithm, algorithms.ecdsa);
  const chains = {};
  provider.trustedKeys().forEach(function (k) { chains[k.keyId] = k.chain; });
  assert.deepStrictEqual(chains, { 'content-key-p12-v1': 'verified', 'ec-v1': 'not-applicable', 'content-key-p12-v0': 'verified' });
  assert.strictEqual(warnings.length, 1, warnings.join('\n'));
  assert.ok(/"content-key-p12-v0" expired on/.test(warnings[0]), 'the expired previous key is a warning');
});

test('pkcs12: one key id is one key - a different certificate or a private key under the active id in the key directory is refused', function () {
  const dir = path.join(TMP, 'second-copy');
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(RSA_LEAF.crt, path.join(dir, 'content-key-p12-v1.crt.pem'));
  throwsConfig(function () {
    keyProvider.createKeyProvider(p12Settings('ECDSA', 'content-key-p12-v1', EC_P12, { caChain: CA.crt, keyDir: dir }), { openssl: OPENSSL });
  }, /for a different key than the \.p12\. A key id is never given a new key/);

  fs.copyFileSync(EC_LEAF.crt, path.join(dir, 'content-key-p12-v1.crt.pem'));
  keyProvider.createKeyProvider(p12Settings('ECDSA', 'content-key-p12-v1', EC_P12, { caChain: CA.crt, keyDir: dir }), { openssl: OPENSSL });

  fs.copyFileSync(EC_LEAF.key, path.join(dir, 'content-key-p12-v1.key.pem'));
  throwsConfig(function () {
    keyProvider.createKeyProvider(p12Settings('ECDSA', 'content-key-p12-v1', EC_P12, { caChain: CA.crt, keyDir: dir }), { openssl: OPENSSL });
  }, /holds a private key under the same id/);
});

test('pkcs12: a key directory certificate gets the same checks once a chain is configured', function () {
  const dir = path.join(TMP, 'ca-key-dir');
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(EC_LEAF.key, path.join(dir, 'kd-v1.key.pem'));
  fs.copyFileSync(EC_LEAF.crt, path.join(dir, 'kd-v1.crt.pem'));

  const provider = keyProvider.createKeyProvider(settings(dir, 'ECDSA', 'kd-v1', { caChain: CA.crt }), { openssl: OPENSSL });
  assert.strictEqual(provider.activeCertificate().chain.status, 'verified');
  throwsConfig(function () {
    keyProvider.createKeyProvider(settings(dir, 'ECDSA', 'kd-v1', { caChain: OTHER_CA.crt }), { openssl: OPENSSL });
  }, /does not verify against the CA chain/);
  throwsConfig(function () {
    keyProvider.createKeyProvider(settings(KEYS, 'ECDSA', 'ec-v1', { caChain: CA.crt }), { openssl: OPENSSL });
  }, /does not verify against the CA chain/, 'a self-signed key directory certificate cannot pass a chain it was never issued under');
});

/* ------------------------------------------------------------------ */
/*  the console's view of the certificates' expiry                     */
/* ------------------------------------------------------------------ */

const certificatesService = require('../src/services/certificates.service');
const DAY_MS = 24 * 3600 * 1000;

/* Every string in a reply, unescaped - a Windows path is doubled up inside JSON.stringify and would slip past a search of it. */
function valuesOf(value) {
  if (value === null || typeof value !== 'object') return String(value);
  return Object.keys(value).map(function (k) { return k + '\n' + valuesOf(value[k]); }).join('\n');
}

/* The renewal from above: a .p12 from the CA signs, beside a self-signed key from before it and an expired CA-issued one. */
function renewedProvider() {
  const dir = path.join(TMP, 'certificates-report');
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(KEYS, 'ec-v1.crt.pem'), path.join(dir, 'ec-v1.crt.pem'));
  fs.copyFileSync(EXPIRED_LEAF.crt, path.join(dir, 'content-key-p12-v0.crt.pem'));

  return keyProvider.createKeyProvider(
    p12Settings('ECDSA', 'content-key-p12-v1', EC_P12, { caChain: CA.crt, keyDir: dir, verifyKeyIds: 'ec-v1,content-key-p12-v0' }),
    { openssl: OPENSSL });
}

test('certificates: the active and every previous certificate are reported from what startup loaded, with no path or secret', function () {
  const provider = renewedProvider();
  const report = certificatesService.report({ keys: provider, x509: { enabled: false } });

  assert.deepStrictEqual(report.certificates.map(function (c) { return [c.keyId, c.role, c.source, c.selfSigned, c.chainStatus]; }), [
    ['content-key-p12-v1', 'active', 'p12', false, 'verified'],
    ['ec-v1', 'previous', 'key-dir', true, 'not-applicable'],
    ['content-key-p12-v0', 'previous', 'key-dir', false, 'verified']
  ]);
  assert.deepStrictEqual(report.thresholds, { warningDays: 30, criticalDays: 7 });

  const active = report.certificates[0];
  assert.strictEqual(active.algorithm, 'ECDSA-P256-SHA256');
  assert.strictEqual(active.subjectCN, 'p12-ec-v1');
  assert.strictEqual(active.issuerCN, 'Test CA ca-crystal');
  assert.strictEqual(active.daysLeft, Math.floor((Date.parse(active.notAfter) - Date.parse(report.now)) / DAY_MS));
  assert.strictEqual(active.status, 'ok');
  assert.strictEqual(report.certificates[2].status, 'expired');
  assert.ok(report.certificates[2].daysLeft < 0);

  /* Picked field by field: nothing the provider holds beyond these reaches a browser. */
  const text = valuesOf(report);
  [TMP, PKI, P12_PASSWORD, 'PRIVATE KEY', '.p12', '.pem'].forEach(function (secret) {
    assert.strictEqual(text.indexOf(secret), -1, 'the report contains ' + secret);
  });
  report.certificates.forEach(function (c) {
    assert.deepStrictEqual(Object.keys(c).sort(), ['algorithm', 'chainReason', 'chainStatus', 'daysLeft', 'issuer', 'issuerCN',
      'keyId', 'notAfter', 'notBefore', 'role', 'selfSigned', 'source', 'status', 'subject', 'subjectCN']);
  });
});

test('certificates: a self-signed key directory certificate is reported as one, with its chain not checked', function () {
  const report = certificatesService.report({
    keys: keyProvider.createKeyProvider(settings(KEYS, 'ECDSA', 'ec-v1'), { openssl: OPENSSL }),
    x509: { enabled: false }
  });

  assert.deepStrictEqual(report.certificates.map(function (c) {
    return [c.keyId, c.role, c.source, c.selfSigned, c.subjectCN, c.issuerCN, c.chainStatus, c.chainReason, c.status];
    /* makeCertificate issues for 30 days, so a few seconds later fewer than 30 whole days are left: a warning. */
  }), [['ec-v1', 'active', 'key-dir', true, 'ec-v1', 'ec-v1', 'not-configured', null, 'warning']]);
  assert.deepStrictEqual(report.problems, []);
  assert.strictEqual(valuesOf(report).indexOf(TMP), -1);
});

test('certificates: warning, critical and expired start on the day the startup warning would', function () {
  const provider = renewedProvider();
  const notAfter = Date.parse(certificatesService.report({ keys: provider, x509: { enabled: false } }).certificates[0].notAfter);

  const at = function (ms) {
    const active = certificatesService.report({ keys: provider, x509: { enabled: false }, now: new Date(ms) }).certificates[0];
    return active.daysLeft + ' ' + active.status;
  };

  assert.strictEqual(at(notAfter - 30 * DAY_MS), '30 ok');
  assert.strictEqual(at(notAfter - 30 * DAY_MS + 1), '29 warning');
  assert.strictEqual(at(notAfter - 7 * DAY_MS), '7 warning');
  assert.strictEqual(at(notAfter - 7 * DAY_MS + 1), '6 critical');
  assert.strictEqual(at(notAfter), '0 critical');
  assert.strictEqual(at(notAfter + 1), '-1 expired');

  /* The same boundary keyProvider warns on at startup. */
  const warned = [];
  keyProvider.checkCertificate({
    role: 'active', keyId: 'boundary', source: { file: EC_LEAF.crt }, label: 'boundary', openssl: OPENSSL,
    now: new Date(notAfter - 30 * DAY_MS + 1), warn: function (m) { warned.push(m); }
  });
  keyProvider.checkCertificate({
    role: 'active', keyId: 'boundary', source: { file: EC_LEAF.crt }, label: 'boundary', openssl: OPENSSL,
    now: new Date(notAfter - 30 * DAY_MS), warn: function (m) { warned.push(m); }
  });
  assert.strictEqual(warned.length, 1, 'startup warns from 29 days left, not from 30: ' + warned.join('\n'));
});

test('certificates: the member sign-in\'s CA chains are reported only while that sign-in is on, and an unreadable one is named, not dropped', function () {
  const provider = renewedProvider();
  const missing = path.join(TMP, 'no-such-chain.pem');

  const off = certificatesService.report({ keys: provider, x509: { enabled: false, caEccChain: CA.crt, openssl: OPENSSL } });
  assert.strictEqual(off.certificates.filter(function (c) { return c.role === 'member-ca'; }).length, 0);

  const on = certificatesService.report({ keys: provider, x509: { enabled: true, caEccChain: CA.crt, caRsaChain: missing, openssl: OPENSSL } });
  const cas = on.certificates.filter(function (c) { return c.role === 'member-ca'; });
  assert.strictEqual(cas.length, 1);
  assert.strictEqual(cas[0].keyId, null);
  assert.strictEqual(cas[0].source, 'member-ca-ecc');
  assert.strictEqual(cas[0].subjectCN, 'Test CA ca-crystal');
  assert.strictEqual(cas[0].selfSigned, true);
  assert.strictEqual(cas[0].algorithm, 'EC');
  assert.strictEqual(cas[0].chainStatus, 'not-applicable');
  assert.strictEqual(cas[0].status, 'ok');
  assert.deepStrictEqual(on.problems, [{ source: 'member-ca-rsa', problem: 'unreadable' }]);
  assert.strictEqual(valuesOf(on).indexOf(TMP), -1);
});

test('certificates: a chain failure\'s reason reaches the console without the files openssl named', function () {
  assert.strictEqual(certificatesService.withoutPaths('unable to get local issuer certificate'), 'unable to get local issuer certificate');
  assert.strictEqual(certificatesService.withoutPaths('error /tmp/crystal-x509-1a.pem: verification failed'), 'error [file]: verification failed');
  assert.strictEqual(certificatesService.withoutPaths('cannot open C:\\secure\\caChain.crt'), 'cannot open [file]');
});

/*
 * A LEGACY .p12, and what this openssl makes of it.
 *
 * `openssl pkcs12 -export -legacy` writes what OpenSSL 1.x wrote by default:
 * certificates under RC2-40, the key under 3DES, a SHA-1 MAC. Opening one
 * needs OpenSSL 3's legacy provider - and so does WRITING one, so an openssl
 * built without the provider (Git for Windows' usr/bin/openssl.exe is one)
 * can neither make the file nor open it.
 *
 * So the file is made with `openssl pkcs12 -export -legacy` when this openssl
 * can, and otherwise by legacyP12() below, which writes the same structure
 * with Node 12's own OpenSSL 1.1.1 - it still has RC2-40 - and a throwaway
 * key and certificate from this directory. Then the test asserts whichever
 * behaviour this openssl owes: it LOADS through the -legacy retry when the
 * legacy provider is there, and it REFUSES with the legacy-provider message
 * when it is not. Both are real outcomes; neither is a skip, and the test
 * says which one it checked.
 */
function hasLegacyProvider() {
  const result = childProcess.spawnSync(OPENSSL, ['list', '-providers', '-provider', 'legacy'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  return result.status === 0 && /legacy/i.test(String(result.stdout));
}

/** DER, by hand - just enough of it for a PFX. */
function der(tag, content) {
  let length;
  if (content.length < 128) {
    length = Buffer.from([content.length]);
  } else {
    const bytes = [];
    for (let n = content.length; n > 0; n = Math.floor(n / 256)) bytes.unshift(n & 0xff);
    length = Buffer.from([0x80 | bytes.length].concat(bytes));
  }
  return Buffer.concat([Buffer.from([tag]), length, content]);
}
function derSeq() { return der(0x30, Buffer.concat([].slice.call(arguments))); }
function derSet() { return der(0x31, Buffer.concat([].slice.call(arguments))); }
function derOctets(bytes) { return der(0x04, bytes); }
function derExplicit0(bytes) { return der(0xa0, bytes); }
function derInt(n) {
  const bytes = [];
  let rest = n;
  do { bytes.unshift(rest & 0xff); rest = Math.floor(rest / 256); } while (rest > 0);
  if (bytes[0] & 0x80) bytes.unshift(0);
  return der(0x02, Buffer.from(bytes));
}
function derOid(dotted) {
  const parts = dotted.split('.').map(Number);
  const bytes = [40 * parts[0] + parts[1]];
  parts.slice(2).forEach(function (value) {
    const chunk = [value & 0x7f];
    for (let v = Math.floor(value / 128); v > 0; v = Math.floor(v / 128)) chunk.unshift(0x80 | (v & 0x7f));
    bytes.push.apply(bytes, chunk);
  });
  return der(0x06, Buffer.from(bytes));
}

/** RFC 7292 appendix B.2: the PKCS#12 key derivation, SHA-1, over the password as a BMPString. */
function pkcs12Kdf(password, salt, id, iterations, length) {
  const v = 64;
  const sha1 = function (bytes) { return crypto.createHash('sha1').update(bytes).digest(); };
  const repeat = function (bytes) {
    const out = Buffer.alloc(v * Math.ceil(bytes.length / v));
    for (let i = 0; i < out.length; i += 1) out[i] = bytes[i % bytes.length];
    return out;
  };

  const bmp = Buffer.alloc((password.length + 1) * 2);
  for (let i = 0; i < password.length; i += 1) bmp.writeUInt16BE(password.charCodeAt(i), i * 2);

  const I = Buffer.concat([repeat(salt), repeat(bmp)]);
  const D = Buffer.alloc(v, id);
  const parts = [];

  for (let produced = 0; produced < length; produced += 20) {
    let A = sha1(Buffer.concat([D, I]));
    for (let r = 1; r < iterations; r += 1) A = sha1(A);
    parts.push(A);

    const B = repeat(A);
    for (let j = 0; j < I.length; j += v) {
      let carry = 1;
      for (let k = v - 1; k >= 0; k -= 1) {
        const sum = I[j + k] + B[k] + carry;
        I[j + k] = sum & 0xff;
        carry = sum >> 8;
      }
    }
  }

  return Buffer.concat(parts).slice(0, length);
}

/**
 * The file `openssl pkcs12 -export -legacy` writes, byte-for-byte in
 * structure: the certificate bag encrypted with pbeWithSHAAnd40BitRC2-CBC, the
 * shrouded key bag with pbeWithSHAAnd3-KeyTripleDES-CBC, both carrying the
 * certificate's SHA-1 as localKeyID, and an HMAC-SHA1 MAC - 2048 iterations
 * throughout, OpenSSL 1.x's defaults.
 */
function legacyP12(identity, password) {
  const iterations = 2048;
  const encrypt = function (cipher, keyLength, salt, data) {
    const c = crypto.createCipheriv(cipher, pkcs12Kdf(password, salt, 1, iterations, keyLength), pkcs12Kdf(password, salt, 2, iterations, 8));
    return Buffer.concat([c.update(data), c.final()]);
  };
  const pbe = function (oid, salt) { return derSeq(derOid(oid), derSeq(derOctets(salt), derInt(iterations))); };

  const pkcs8 = crypto.createPrivateKey(fs.readFileSync(identity.key)).export({ type: 'pkcs8', format: 'der' });
  const certificate = Buffer.from(fs.readFileSync(identity.crt, 'utf8').replace(/-----[^-]+-----|\s/g, ''), 'base64');
  const attributes = derSet(derSeq(derOid('1.2.840.113549.1.9.21'), derSet(derOctets(crypto.createHash('sha1').update(certificate).digest()))));

  const keySalt = crypto.randomBytes(8);
  const keyBags = derSeq(derSeq(derOid('1.2.840.113549.1.12.10.1.2'),
    derExplicit0(derSeq(pbe('1.2.840.113549.1.12.1.3', keySalt), derOctets(encrypt('des-ede3-cbc', 24, keySalt, pkcs8)))),
    attributes));

  const certSalt = crypto.randomBytes(8);
  const certBags = derSeq(derSeq(derOid('1.2.840.113549.1.12.10.1.3'),
    derExplicit0(derSeq(derOid('1.2.840.113549.1.9.22.1'), derExplicit0(derOctets(certificate)))),
    attributes));

  const authenticatedSafe = derSeq(
    derSeq(derOid('1.2.840.113549.1.7.6'), derExplicit0(derSeq(derInt(0), derSeq(derOid('1.2.840.113549.1.7.1'),
      pbe('1.2.840.113549.1.12.1.6', certSalt), der(0x80, encrypt('rc2-40-cbc', 5, certSalt, certBags)))))),
    derSeq(derOid('1.2.840.113549.1.7.1'), derExplicit0(derOctets(keyBags))));

  const macSalt = crypto.randomBytes(8);
  const mac = crypto.createHmac('sha1', pkcs12Kdf(password, macSalt, 3, iterations, 20)).update(authenticatedSafe).digest();

  return derSeq(derInt(3), derSeq(derOid('1.2.840.113549.1.7.1'), derExplicit0(derOctets(authenticatedSafe))),
    derSeq(derSeq(derSeq(derOid('1.3.14.3.2.26'), Buffer.from([0x05, 0x00])), derOctets(mac)), derOctets(macSalt), derInt(iterations)));
}

const LEGACY_PROVIDER = hasLegacyProvider();

test('pkcs12: a legacy-encrypted .p12 ' + (LEGACY_PROVIDER
  ? 'loads through the -legacy retry'
  : 'is refused with the legacy-provider message (this openssl has no legacy provider)'), function () {
  const leaf = issue('p12-legacy', CA);
  let file = path.join(PKI, 'p12-legacy.p12');
  let madeBy = 'openssl pkcs12 -export -legacy';

  try {
    file = p12Of(leaf, { legacy: true, chain: CA.crt });
  } catch (err) {
    assert.ok(!LEGACY_PROVIDER, 'openssl has the legacy provider and still could not write a legacy .p12: ' + err.message);
    fs.writeFileSync(file, legacyP12(leaf, P12_PASSWORD));
    madeBy = 'Node\'s OpenSSL 1.1.1 (legacyP12)';
  }

  const warnings = [];
  const load = function () {
    return keyProvider.createKeyProvider(p12Settings('ECDSA', 'content-key-p12-legacy', file, { caChain: CA.crt }),
      { openssl: OPENSSL, warn: function (m) { warnings.push(m); } });
  };

  /*
   * It really is the legacy kind: openssl WITHOUT -legacy cannot read it for
   * want of RC2 - unless this build's configuration loads the legacy provider
   * by default, in which case there is nothing to retry and it simply loads.
   */
  const plain = childProcess.spawnSync(OPENSSL, ['pkcs12', '-in', file, '-nokeys', '-passin', 'env:TEST_P12_PASSIN'],
    { env: Object.assign({}, process.env, { TEST_P12_PASSIN: P12_PASSWORD }), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

  if (plain.status === 0) {
    assert.strictEqual(load().activeCertificate().chain.status, 'verified');
    console.log('       (file made by ' + madeBy + '; ' + OPENSSL + ' loads the legacy provider by default - loaded with no retry needed)');
    return;
  }
  assert.ok(/unsupported/i.test(String(plain.stderr)) && /RC2/i.test(String(plain.stderr)), String(plain.stderr));

  if (LEGACY_PROVIDER) {
    const provider = load();
    assert.strictEqual(provider.activeCertificate().legacy, true);
    assert.strictEqual(provider.activeCertificate().chain.status, 'verified');
    assert.ok(warnings.some(function (m) { return /legacy encryption.*Re-export it/.test(m); }), warnings.join('\n'));
    console.log('       (file made by ' + madeBy + '; ' + OPENSSL + ' has the legacy provider - loaded through the -legacy retry)');
  } else {
    throwsConfig(load, /protected with legacy algorithms .* this openssl \(.*\) could not load the legacy provider\. The file needs the legacy provider .* re-export with modern encryption/);
    console.log('       (file made by ' + madeBy + '; ' + OPENSSL + ' has NO legacy provider - asserted the refusal ' +
      'naming the legacy provider and re-export, not a load)');
  }
});

/* ------------------------------------------------------------------ */
/*  the setup tool: check the chain, then pin                         */
/* ------------------------------------------------------------------ */

function contentKeys(args, extraEnv) {
  const env = Object.assign({}, process.env, { OPENSSL_BIN: OPENSSL }, extraEnv || {});
  delete env.CONTENT_SIGNING_CA_CHAIN;
  const result = childProcess.spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'content-keys.js')].concat(args),
    { env: env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 60000 });
  return { status: result.status, stdout: String(result.stdout), stderr: String(result.stderr) };
}

test('setup: --from-p12 refuses to pin a certificate that fails the chain', function () {
  const webEnv = path.join(TMP, 'web-refused.env');
  const run = contentKeys(['--from-p12', p12Of(OTHER_LEAF, { chain: OTHER_CA.crt, name: 'p12-other-for-setup' }), '--ca-chain', CA.crt,
    '--key-id', 'content-key-p12-v2', '--web-env', webEnv, '--write-web-env'], { CONTENT_SIGNING_P12_PASSWORD: P12_PASSWORD });

  assert.strictEqual(run.status, 1, run.stdout + run.stderr);
  assert.ok(/refusing to pin .*does not verify against the CA chain/.test(run.stderr), run.stderr);
  assert.strictEqual((run.stdout + run.stderr).indexOf('REACT_APP_CONTENT_SIGNING_KEYS'), -1, 'no pin is printed');
  assert.strictEqual(fs.existsSync(webEnv), false, 'nothing is written');
  assert.strictEqual((run.stdout + run.stderr).indexOf(P12_PASSWORD), -1);

  const expired = contentKeys(['--from-p12', p12Of(EXPIRED_LEAF, { chain: CA.crt, name: 'p12-expired-for-setup' }), '--ca-chain', CA.crt,
    '--key-id', 'content-key-p12-v2'], { CONTENT_SIGNING_P12_PASSWORD: P12_PASSWORD });
  assert.strictEqual(expired.status, 1);
  assert.ok(/refusing to pin .*expired/.test(expired.stderr), expired.stderr);

  const noChain = contentKeys(['--from-p12', EC_P12, '--key-id', 'content-key-p12-v2'], { CONTENT_SIGNING_P12_PASSWORD: P12_PASSWORD });
  assert.strictEqual(noChain.status, 1);
  assert.ok(/refusing to pin .*no CA chain/.test(noChain.stderr), noChain.stderr);

  const noKeyId = contentKeys(['--from-p12', EC_P12, '--ca-chain', CA.crt], { CONTENT_SIGNING_P12_PASSWORD: P12_PASSWORD });
  assert.strictEqual(noKeyId.status, 1);
  assert.ok(/--key-id is required/.test(noKeyId.stderr), noKeyId.stderr);

  const argument = contentKeys(['--from-p12', EC_P12, '--ca-chain', CA.crt, '--key-id', 'k', '--password', P12_PASSWORD]);
  assert.strictEqual(argument.status, 1);
  assert.ok(/there is no --password/.test(argument.stderr), argument.stderr);
});

test('setup: --from-p12 pins a verified certificate beside the keys already trusted', function () {
  const webEnv = path.join(TMP, 'web-pinned.env');
  const already = { keyId: 'content-key-dev', algorithm: 'ECDSA-P256-SHA256', spki: 'MFkw-already-trusted' };
  fs.writeFileSync(webEnv, 'OTHER_SETTING=1\nREACT_APP_CONTENT_SIGNING_KEYS=' + JSON.stringify([already]) + '\n');

  const run = contentKeys(['--from-p12', EC_P12, '--ca-chain', CA.crt, '--key-id', 'content-key-p12-v2', '--web-env', webEnv, '--write-web-env'],
    { CONTENT_SIGNING_P12_PASSWORD: P12_PASSWORD });
  assert.strictEqual(run.status, 0, run.stdout + run.stderr);

  const spkiOf = crypto.createPublicKey(fs.readFileSync(EC_LEAF.crt)).export({ type: 'spki', format: 'der' }).toString('base64');
  const entry = { keyId: 'content-key-p12-v2', algorithm: 'ECDSA-P256-SHA256', spki: spkiOf };
  assert.ok(run.stdout.indexOf('REACT_APP_CONTENT_SIGNING_KEYS=' + JSON.stringify([entry])) !== -1, run.stdout);
  assert.ok(/chain    verified against/.test(run.stdout), run.stdout);
  assert.strictEqual((run.stdout + run.stderr).indexOf(P12_PASSWORD), -1, 'the password is never printed');

  const lines = fs.readFileSync(webEnv, 'utf8').split('\n');
  assert.strictEqual(lines[0], 'OTHER_SETTING=1');
  assert.deepStrictEqual(JSON.parse(lines[1].slice('REACT_APP_CONTENT_SIGNING_KEYS='.length)), [already, entry]);

  /* The same id for a different key is refused, and the file left as it was. */
  const before = fs.readFileSync(webEnv, 'utf8');
  const clash = contentKeys(['--from-p12', RSA_P12, '--ca-chain', CA.crt, '--key-id', 'content-key-p12-v2', '--web-env', webEnv, '--write-web-env'],
    { CONTENT_SIGNING_P12_PASSWORD: P12_PASSWORD });
  assert.strictEqual(clash.status, 1);
  assert.ok(/already pins a DIFFERENT key under "content-key-p12-v2"/.test(clash.stderr), clash.stderr);
  assert.strictEqual(fs.readFileSync(webEnv, 'utf8'), before);
});

test('setup: --dev-p12 makes a development CA and a .p12 that load with the chain, and never replaces one', function () {
  const dir = path.join(TMP, 'dev-p12');
  const first = contentKeys(['--dev-p12', '--dir', dir]);
  assert.strictEqual(first.status, 0, first.stdout + first.stderr);

  const password = /CONTENT_SIGNING_P12_PASSWORD=([0-9a-f]+)/.exec(first.stdout)[1];
  const provider = keyProvider.createKeyProvider(signingConfig.resolve({
    algorithm: 'ECDSA', keyId: 'content-key-dev-p12', p12: path.join(dir, 'content-key-dev-p12.p12'),
    p12Password: password, caChain: path.join(dir, 'caChain.crt')
  }, { isProduction: true, rootDir: TMP }), { openssl: OPENSSL });
  assert.strictEqual(provider.activeCertificate().chain.status, 'verified');
  assert.deepStrictEqual(fs.readdirSync(dir).sort(), ['caChain.crt', 'content-key-dev-p12.p12', 'dev-ca.key.pem'], 'no temporary files left');

  const rsa = contentKeys(['--dev-p12', '--algorithm', 'RSA', '--dir', dir]);
  assert.strictEqual(rsa.status, 0, rsa.stdout + rsa.stderr);
  assert.ok(/created content-key-dev-p12-rsa \(RSA-PSS-SHA256\), issued by the existing development CA/.test(rsa.stdout), rsa.stdout);

  const p12Bytes = fs.readFileSync(path.join(dir, 'content-key-dev-p12.p12'));
  const again = contentKeys(['--dev-p12', '--dir', dir]);
  assert.strictEqual(again.status, 0);
  assert.ok(/already exists .* left untouched/.test(again.stdout), again.stdout);
  assert.ok(fs.readFileSync(path.join(dir, 'content-key-dev-p12.p12')).equals(p12Bytes), 'the .p12 is unchanged');
});

/* ------------------------------------------------------------------ */
/*  rotation and revocation                                            */
/* ------------------------------------------------------------------ */

test('rotation: content signed by v1 still verifies while v2 is active, and new content uses v2', function () {
  const v1 = serviceFor(EC_V1);
  const old = v1.signContent({ type: 'notification', content: notice() });

  const v2 = serviceFor(EC_V2, [EC_V1]);
  const checked = v2.verifyContent({ type: 'notification', content: old.content, signature: old.signature });
  assert.strictEqual(checked.valid, true);
  assert.strictEqual(checked.active, false, 'reported as signed by a non-active key');

  const fresh = v2.signContent({ type: 'notification', content: notice({ id: 99 }) });
  assert.strictEqual(fresh.signature.keyId, 'test-ec-v2');

  /* v2 alone, with v1 dropped, no longer believes v1. */
  assert.strictEqual(serviceFor(EC_V2).verifyContent({ type: 'notification', content: old.content, signature: old.signature }).reason, REASON.KEY_UNKNOWN);
});

test('rotation: the backfill policy re-signs only what still verifies, and never laundering by default', function () {
  const item = { item: { content: {} } };
  const f = function (status) { return Object.assign({ status: status }, item); };

  assert.strictEqual(maintenance.shouldSign(f('unsigned'), {}), true);
  assert.strictEqual(maintenance.shouldSign(f('valid'), {}), false);
  assert.strictEqual(maintenance.shouldSign(f('valid-old-key'), {}), false);
  assert.strictEqual(maintenance.shouldSign(f('valid-old-key'), { rotate: true }), true);
  assert.strictEqual(maintenance.shouldSign(f('invalid'), {}), false);
  assert.strictEqual(maintenance.shouldSign(f('invalid'), { rotate: true }), false, '--rotate must never re-sign a tampered item');
  assert.strictEqual(maintenance.shouldSign(f('revoked-key'), { rotate: true }), false);
  assert.strictEqual(maintenance.shouldSign(f('invalid'), { forceResign: true }), true);
  assert.strictEqual(maintenance.shouldSign(f('orphaned'), { forceResign: true }), false);
  assert.strictEqual(maintenance.shouldSign({ status: 'unsigned', item: { content: null } }, {}), false, 'a missing file cannot be signed');
});

test('revocation: a revoked key id fails verification even if it is also trusted', function () {
  const old = serviceFor(EC_V1).signContent({ type: 'notification', content: notice() });
  const revoked = serviceFor(EC_V2, [EC_V1], ['test-ec-v1']);
  assert.strictEqual(revoked.verifyContent({ type: 'notification', content: old.content, signature: old.signature }).reason, REASON.KEY_REVOKED);
});

test('revocation: an unknown key id fails verification', function () {
  const service = serviceFor(EC_V1);
  const signed = service.signContent({ type: 'notification', content: notice() });
  const renamed = Object.assign({}, signed.signature, { keyId: 'content-key-unheard-of' });
  assert.strictEqual(service.verifyContent({ type: 'notification', content: signed.content, signature: renamed }).reason, REASON.KEY_UNKNOWN);
});

/* ------------------------------------------------------------------ */
/*  the envelope                                                       */
/* ------------------------------------------------------------------ */

function signedNotice(service) {
  return (service || serviceFor(EC_V1)).signContent({ type: 'notification', content: notice() });
}

function reasonFor(mutate, service) {
  const s = service || serviceFor(EC_V1);
  const signed = signedNotice(s);
  const envelope = JSON.parse(JSON.stringify({ content: signed.content, signature: signed.signature }));
  mutate(envelope);
  return s.verifyContent({ type: 'notification', content: envelope.content, signature: envelope.signature }).reason;
}

test('envelope: a tampered signature fails', function () {
  assert.strictEqual(reasonFor(function (e) {
    const bytes = Buffer.from(e.signature.value, 'base64');
    bytes[10] ^= 0x40;
    e.signature.value = bytes.toString('base64');
  }), REASON.SIGNATURE);
});

test('envelope: a tampered canonical payload fails', function () {
  assert.strictEqual(reasonFor(function (e) { e.content.sortOrder = 6; }), REASON.SIGNATURE);
});

test('envelope: every structural refusal is reported before any cryptography', function () {
  const cases = [
    [function (e) { delete e.signature; }, REASON.MISSING],
    [function (e) { e.signature.v = 2; }, REASON.VERSION],
    [function (e) { e.signature.type = 'poster'; }, REASON.TYPE_UNKNOWN],
    [function (e) { e.signature.type = 'faq'; }, REASON.TYPE_UNEXPECTED],
    [function (e) { e.signature.algorithm = 'HS256'; }, REASON.ALGORITHM_UNKNOWN],
    [function (e) { e.signature.algorithm = 'RSA-PSS-SHA256'; }, REASON.ALGORITHM_MISMATCH],
    [function (e) { e.signature.encoding = 'der'; }, REASON.ENCODING],
    [function (e) { e.signature.value = e.signature.value.replace(/=+$/, ''); }, REASON.SIGNATURE_ENCODING],
    [function (e) { e.signature.value = e.signature.value.slice(0, -4) + '!!!!'; }, REASON.SIGNATURE_ENCODING],
    [function (e) { e.signature.value = Buffer.alloc(63).toString('base64'); }, REASON.SIGNATURE_LENGTH],
    [function (e) { e.content.extra = 1; }, REASON.CONTENT],
    [function (e) { delete e.content.endsAt; }, REASON.CONTENT],
    [function (e) { e.content.id = 12.5; }, REASON.CONTENT],
    [function (e) { e.content.id = '12'; }, REASON.CONTENT],
    [function (e) { e.content.status = 'LIVE'; }, REASON.CONTENT],
    [function (e) { e.content.updatedAt = '2026-09-01T12:34:56Z'; }, REASON.CONTENT]
  ];
  cases.forEach(function (c, i) {
    assert.strictEqual(reasonFor(c[0]), c[1], 'case ' + i);
  });
  assert.strictEqual(validateEnvelope(null, { expectedType: 'notification' }).reason, REASON.MISSING);
});

test('envelope: a supplied algorithm name never chooses the implementation', function () {
  /* An RSA key trusted under an id, and an envelope naming ECDSA for it. */
  const rsa = serviceFor(RSA_V1);
  const signed = rsa.signContent({ type: 'faq', content: faq() });
  const lying = Object.assign({}, signed.signature, { algorithm: 'ECDSA-P256-SHA256', encoding: 'ieee-p1363' });
  assert.strictEqual(rsa.verifyContent({ type: 'faq', content: signed.content, signature: lying }).reason, REASON.ALGORITHM_MISMATCH);
});

test('envelope: canonical kinds are exact', function () {
  assert.strictEqual(canonical.valueFits('int', Number.MAX_SAFE_INTEGER + 1), false);
  assert.strictEqual(canonical.valueFits('int', NaN), false);
  assert.strictEqual(canonical.valueFits('int?', null), true);
  assert.strictEqual(canonical.valueFits('string?', undefined), false);
  assert.strictEqual(canonical.valueFits('hex64', 'A'.repeat(64)), false);
  assert.strictEqual(canonical.valueFits('hex64', 'a'.repeat(63)), false);
  assert.strictEqual(canonical.valueFits('time', '2026-09-16T10:00:00.000Z'), true);
  assert.strictEqual(canonical.valueFits('time', '2026-09-16T10:00:00.000+00:00'), false);
  assert.strictEqual(canonical.valueFits('enum:A|B', 'C'), false);

  /* Key order comes from the schema, not from the object. */
  const reversed = {};
  Object.keys(faq()).reverse().forEach(function (k) { reversed[k] = faq()[k]; });
  assert.strictEqual(canonical.canonicalJson('faq', 'X', 'k', reversed), canonical.canonicalJson('faq', 'X', 'k', faq()));
});

test('envelope: the schemas agree with the vocabularies they copy', function () {
  assert.deepStrictEqual(schemas.FAQ_CATEGORY, require('../src/utils/faqCategories').FAQ_CATEGORIES);
  /*
   * And both agree with the TYPE, value for value and in declaration order - a
   * word the database accepts and a signature refuses would be an answer that
   * saves in the console and never verifies on the storefront.
   */
  assert.ok(fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8')
    .indexOf("CREATE TYPE faq_category AS ENUM (\n    '" + schemas.FAQ_CATEGORY.join("', '") + "');") !== -1,
  'faq_category in schema.sql differs from the signing schema');
  assert.deepStrictEqual(schemas.IMAGE_MIME_TYPES.slice().sort(), require('../src/config').storage.allowedImageTypes.slice().sort());
  const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
  assert.ok(schemaSql.indexOf("CREATE TYPE publish_status AS ENUM ('" + schemas.PUBLISH_STATUS.join("', '") + "')") !== -1,
    'publish_status in schema.sql differs from the signing schema');

  /*
   * The table's CHECK and the audit's list name exactly the signed types. A
   * type removed from this table and left in the CHECK is a row nothing will
   * ever audit; one added here and not there is a signature the database
   * refuses to store.
   */
  const allowed = "CHECK (content_type IN ('" + schemas.TYPES.join("', '") + "'))";
  const delta = fs.readFileSync(path.join(__dirname, '..', 'sql', 'deltas', '029_content_signatures.sql'), 'utf8');
  assert.ok(schemaSql.indexOf(allowed) !== -1, 'content_signatures in schema.sql allows different types from the signing schema');
  assert.ok(delta.indexOf(allowed) !== -1, 'delta 029 allows different types from the signing schema');
  assert.deepStrictEqual(maintenance.TYPES, schemas.TYPES);
});

/* ------------------------------------------------------------------ */
/*  notifications                                                      */
/* ------------------------------------------------------------------ */

function noticeCheck(change) {
  const service = serviceFor(EC_V1);
  const signed = signedNotice(service);
  const content = Object.assign({}, signed.content, change);
  return service.verifyContent({ type: 'notification', content: content, signature: signed.signature });
}

test('notifications: the original verifies', function () {
  assert.strictEqual(noticeCheck({}).valid, true);
});

test('notifications: modified text fails', function () {
  assert.strictEqual(noticeCheck({ content: '<p>Open <b>9–19</b> on weekdays.</p>' }).valid, false);
  assert.strictEqual(noticeCheck({ title: 'Service centre hours — 服务时间 ' }).valid, false, 'a trailing space');
  assert.strictEqual(noticeCheck({ title: 'Service centre hours - 服务时间' }).valid, false, 'an en dash for a hyphen');
});

test('notifications: a modified id fails', function () {
  assert.strictEqual(noticeCheck({ id: 13 }).valid, false);
});

test('notifications: modified timestamps and status fail', function () {
  assert.strictEqual(noticeCheck({ updatedAt: '2026-09-01T12:34:56.790Z' }).valid, false);
  assert.strictEqual(noticeCheck({ endsAt: '2027-01-01T00:00:00.000Z' }).valid, false);
  assert.strictEqual(noticeCheck({ status: 'DRAFT' }).valid, false);
});

test('notifications: a missing signature fails', function () {
  const service = serviceFor(EC_V1);
  assert.strictEqual(service.verifyContent({ type: 'notification', content: notice(), signature: null }).reason, REASON.MISSING);
});

test('notifications: an unsupported algorithm fails', function () {
  assert.strictEqual(reasonFor(function (e) { e.signature.algorithm = 'ECDSA-P384-SHA384'; }), REASON.ALGORITHM_UNKNOWN);
});

test('notifications: a re-signed update verifies, and the old signature does not cover it', async function () {
  const store = memoryStore();
  const service = serviceFor(EC_V1, [], [], store);

  await service.sign('notification', 12, notice());
  const edited = notice({ content: '<p>Closed on Friday.</p>', updatedAt: '2026-09-02T08:00:00.000Z' });

  const before = await service.check('notification', 12, edited);
  assert.strictEqual(before.status, STATUS.INVALID, 'the edit is invalid until it is re-signed');

  await service.sign('notification', 12, edited);
  assert.strictEqual((await service.check('notification', 12, edited)).status, STATUS.VALID);
  assert.strictEqual((await service.check('notification', 12, notice())).status, STATUS.INVALID, 'the old content no longer verifies');
});

test('notifications: the envelope a reply carries is the current row beside the stored signature', async function () {
  const store = memoryStore();
  const service = serviceFor(EC_V1, [], [], store);
  await service.sign('notification', 12, notice());

  const envelopes = await service.envelopes('notification', [
    { ref: 12, content: notice({ title: 'changed in the database' }) },
    { ref: 13, content: notice({ id: 13 }) },
    { ref: 14, content: null }
  ]);

  assert.strictEqual(envelopes[0].content.title, 'changed in the database');
  assert.strictEqual(service.verifyContent({ type: 'notification', content: envelopes[0].content, signature: envelopes[0].signature }).valid, false);
  assert.strictEqual(envelopes[1], null, 'no stored signature is null');
  assert.strictEqual(envelopes[2], null);
});

test('notifications: server-verified envelopes suppress content changed outside admin', async function () {
  const store = memoryStore();
  const service = serviceFor(EC_V1, [], [], store);
  await service.sign('notification', 12, notice());

  const envelopes = await service.verifiedEnvelopes('notification', [
    { ref: 12, content: notice() },
    { ref: 12, content: notice({ title: 'changed directly in the database' }) },
    { ref: 13, content: notice({ id: 13 }) }
  ]);

  assert.strictEqual(envelopes[0].content.title, notice().title);
  assert.strictEqual(envelopes[1], null, 'changed content is not released by the server gate');
  assert.strictEqual(envelopes[2], null, 'unsigned content is not released by the server gate');
});

test('notifications: identical server verification reuses the cryptographic verdict', async function () {
  let verifications = 0;
  const countedAlgorithm = Object.assign({}, algorithms.ecdsa, {
    verify: function (publicKey, bytes, signature) {
      verifications += 1;
      return algorithms.ecdsa.verify(publicKey, bytes, signature);
    }
  });
  const countedIdentity = identity('test-cache-v1', countedAlgorithm, EC);
  const store = memoryStore();
  const service = createSigningService({
    keys: providerOf(countedIdentity),
    store: store,
    verificationCacheLimit: 10
  });

  await service.sign('notification', 12, notice());
  verifications = 0; // sign() verifies its own new signature once.

  const item = [{ ref: 12, content: notice() }];
  assert.ok((await service.verifiedEnvelopes('notification', item))[0]);
  assert.ok((await service.verifiedEnvelopes('notification', item))[0]);
  assert.strictEqual(verifications, 1, 'the second identical envelope uses the cached verdict');

  assert.strictEqual((await service.verifiedEnvelopes('notification', [
    { ref: 12, content: notice({ title: 'changed directly' }) }
  ]))[0], null);
  assert.strictEqual(verifications, 2, 'changed content is a cache miss and is verified');
});

test('notifications: rows map to content exactly, and FAQ view counts are not signed', function () {
  const row = {
    id: 5, title: 't', content: 'c', origin_id: null, status: 'PUBLISHED', starts_at: null,
    ends_at: new Date('2026-10-01T00:00:00Z'), sort_order: 0, is_deleted: false,
    created_at: new Date('2026-09-01T00:00:00.123Z'), updated_at: new Date('2026-09-02T00:00:00Z')
  };
  const content = canonical.orderedContent('notification', contentOf.notification(row));
  assert.strictEqual(content.endsAt, '2026-10-01T00:00:00.000Z');
  assert.strictEqual(content.createdAt, '2026-09-01T00:00:00.123Z');

  const faqRow = {
    id: 1, category: 'ESHOP', question: 'q', answer: 'a', sort_order: 1,
    view_count: 999, status: 'PUBLISHED', created_at: new Date(), updated_at: new Date()
  };
  const a = canonical.canonicalJson('faq', 'X', 'k', contentOf.faq(faqRow));
  const b = canonical.canonicalJson('faq', 'X', 'k', contentOf.faq(Object.assign({}, faqRow, { view_count: 1000 })));
  assert.strictEqual(a, b);
});

/* ------------------------------------------------------------------ */
/*  images                                                             */
/* ------------------------------------------------------------------ */

const UPLOADS = path.join(TMP, 'uploads');
fs.mkdirSync(path.join(UPLOADS, 'adverts'), { recursive: true });

async function signedImage(name, bytes) {
  const key = '/uploads/adverts/' + name;
  fs.writeFileSync(path.join(UPLOADS, 'adverts', name), bytes);
  const store = memoryStore();
  const service = serviceFor(EC_V1, [], [], store);
  const described = await imageFile.describe(key, UPLOADS);
  const signed = await service.sign('image', key, contentOf.image(described));
  return { key: key, file: path.join(UPLOADS, 'adverts', name), service: service, signed: signed };
}

async function imageStatus(fixture) {
  const described = await imageFile.describe(fixture.key, UPLOADS);
  return (await fixture.service.check('image', fixture.key, contentOf.image(described))).status;
}

test('images: the original verifies', async function () {
  const fixture = await signedImage('original.png', PNG);
  assert.strictEqual(fixture.signed.content.mimeType, 'image/png');
  assert.strictEqual(fixture.signed.content.size, PNG.length);
  assert.strictEqual(fixture.signed.content.sha256, crypto.createHash('sha256').update(PNG).digest('hex'));
  assert.strictEqual(await imageStatus(fixture), STATUS.VALID);
});

test('images: a one-byte modification fails', async function () {
  const fixture = await signedImage('one-byte.png', PNG);
  const bytes = Buffer.from(PNG);
  bytes[bytes.length - 13] ^= 0x01;
  fs.writeFileSync(fixture.file, bytes);
  assert.strictEqual(await imageStatus(fixture), STATUS.INVALID);
});

test('images: a replacement file fails', async function () {
  const fixture = await signedImage('replaced.png', PNG);
  fs.writeFileSync(fixture.file, GIF);
  assert.strictEqual(await imageStatus(fixture), STATUS.INVALID);
});

test('images: a recomputed hash without a new signature fails', async function () {
  const fixture = await signedImage('rehash.png', PNG);
  const bytes = Buffer.concat([PNG, Buffer.from([0])]);
  const forged = Object.assign({}, fixture.signed.content, {
    size: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')
  });
  assert.strictEqual(fixture.service.verifyContent({ type: 'image', content: forged, signature: fixture.signed.signature }).reason, REASON.SIGNATURE);
});

test('images: modified size, MIME type or storage key fail', async function () {
  const fixture = await signedImage('metadata.png', PNG);
  const check = function (change) {
    return fixture.service.verifyContent({ type: 'image', content: Object.assign({}, fixture.signed.content, change), signature: fixture.signed.signature }).valid;
  };
  assert.strictEqual(check({}), true);
  assert.strictEqual(check({ size: PNG.length + 1 }), false, 'size');
  assert.strictEqual(check({ mimeType: 'image/jpeg' }), false, 'MIME type');
  assert.strictEqual(check({ mimeType: 'text/html' }), false, 'a MIME type outside the policy');
  assert.strictEqual(check({ storageKey: '/uploads/adverts/other.png' }), false, 'another path');
});

test('images: the wrong MIME type is refused at upload, and the file removed', async function () {
  const upload = require('../src/middleware/upload');
  const folder = path.join(UPLOADS, 'misc');
  fs.mkdirSync(folder, { recursive: true });

  const attempt = function (name, bytes, declared, kind) {
    const file = path.join(folder, name);
    fs.writeFileSync(file, bytes);
    return new Promise(function (resolve) {
      upload.verified(kind || 'image')({ file: { path: file, filename: name, mimetype: declared } }, {}, function (err) {
        resolve({ err: err, exists: fs.existsSync(file) });
      });
    });
  };

  const pdfAsPng = await attempt('a.png', Buffer.from('%PDF-1.4\n...'), 'image/png');
  assert.ok(pdfAsPng.err && pdfAsPng.err.status === 400, 'a PDF declared as a PNG is refused');
  assert.strictEqual(pdfAsPng.exists, false, 'and deleted');

  const gifAsPng = await attempt('b.png', GIF, 'image/png');
  assert.ok(gifAsPng.err && gifAsPng.err.status === 400, 'a GIF declared as a PNG is refused');

  const htmlAsSvg = await attempt('c.svg', Buffer.from('<html><body><svg></svg><script>x()</script></body></html>'), 'image/svg+xml');
  assert.ok(htmlAsSvg.err && htmlAsSvg.err.status === 400, 'HTML declared as SVG is refused');

  const pngAsPdf = await attempt('d.pdf', PNG, 'application/pdf', 'document');
  assert.ok(pngAsPdf.err && pngAsPdf.err.status === 400, 'a PNG declared as a PDF is refused on the document route');
});

test('images: the type comes from the bytes', function () {
  assert.strictEqual(imageFile.detectMime(PNG), 'image/png');
  assert.strictEqual(imageFile.detectMime(GIF), 'image/gif');
  assert.strictEqual(imageFile.detectMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])), 'image/jpeg');
  assert.strictEqual(imageFile.detectMime(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])), 'image/webp');
  assert.strictEqual(imageFile.detectMime(Buffer.from('﻿<?xml version="1.0"?>\n<!-- a -->\n<!DOCTYPE svg>\n<svg xmlns="x"/>')), 'image/svg+xml');
  assert.strictEqual(imageFile.detectMime(Buffer.from('<html><svg/></html>')), null);
  assert.strictEqual(imageFile.detectMime(Buffer.from('%PDF-1.7')), null, 'a PDF is not an image');
  assert.strictEqual(imageFile.detectMime(Buffer.from('%PDF-1.7'), { documents: true }), 'application/pdf');
});

test('images: a missing file fails', async function () {
  const fixture = await signedImage('missing.png', PNG);
  fs.unlinkSync(fixture.file);
  await assert.rejects(imageFile.describe(fixture.key, UPLOADS), function (err) { return err.code === 'missing'; });
});

test('images: a missing signature fails', async function () {
  const key = '/uploads/adverts/never-signed.png';
  fs.writeFileSync(path.join(UPLOADS, 'adverts', 'never-signed.png'), PNG);
  const service = serviceFor(EC_V1);
  const described = await imageFile.describe(key, UPLOADS);
  assert.strictEqual((await service.check('image', key, contentOf.image(described))).status, STATUS.UNSIGNED);
  assert.deepStrictEqual(await service.envelopes('image', [{ ref: key, content: contentOf.image(described) }]), [null]);
});

test('images: a storage key cannot leave the upload directory', async function () {
  ['/uploads/../secret.png', '/uploads/adverts/../../x.png', '/uploads//x.png', 'uploads/x.png',
    '/uploads/x.png?v=1', '/uploads/a\\b.png', 'https://evil.example/x.png', '/uploads/.hidden'].forEach(function (key) {
    assert.ok(imageFile.storageKeyProblem(key), key + ' should be refused');
    assert.strictEqual(imageFile.absolutePath(key, UPLOADS), null, key);
  });
  await assert.rejects(imageFile.describe('/uploads/../secret.png', UPLOADS), function (err) { return err.code === 'bad-key'; });

  /* The general storage helper had the sibling-prefix hole; it must not any more. */
  const storage = require('../src/config/storage');
  assert.strictEqual(storage.absolutePath('/uploads/../uploads-old/x.png'), null);
});

test('images: the request-time cache follows a changed file', async function () {
  const key = '/uploads/adverts/cached.png';
  const file = path.join(UPLOADS, 'adverts', 'cached.png');
  fs.writeFileSync(file, PNG);
  const first = await imageFile.describeCached(key, UPLOADS);
  const later = new Date(Date.now() + 5000);
  fs.writeFileSync(file, Buffer.concat([PNG, Buffer.from([1])]));
  fs.utimesSync(file, later, later);
  const second = await imageFile.describeCached(key, UPLOADS);
  assert.notStrictEqual(first.sha256, second.sha256);
});

/* ------------------------------------------------------------------ */
/*  the shared vectors                                                 */
/* ------------------------------------------------------------------ */

test('vectors: every vector rebuilds its canonical bytes and verifies as it says', function () {
  const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'signing-vectors.json'), 'utf8'));
  assert.ok(Array.isArray(vectors) && vectors.length > 20);

  const seen = {};
  vectors.forEach(function (vector) {
    const expectedAlgorithm = /ECDSA/.test(vector.name) ? algorithms.ecdsa : algorithms.rsa;
    const publicKey = crypto.createPublicKey({ key: Buffer.from(vector.spki, 'base64'), format: 'der', type: 'spki' });

    assert.strictEqual(canonical.canonicalJson(vector.type, vector.algorithm, vector.keyId, vector.content), vector.canonical, vector.name);

    const service = createSigningService({ keys: { resolve: function () { return null; } } });
    const result = service.verifyContent({
      type: vector.type,
      content: vector.content,
      signature: { v: 1, type: vector.type, algorithm: vector.algorithm, keyId: vector.keyId, encoding: expectedAlgorithm.encoding, value: vector.signature },
      trustedKey: { keyId: /-other$/.test(vector.keyId) ? vector.keyId.replace(/-other$/, '') : vector.keyId, algorithm: expectedAlgorithm, publicKey: publicKey }
    });
    assert.strictEqual(result.valid ? 'valid' : 'invalid', vector.expect, vector.name + ' (' + result.reason + ')');

    const onBytes = expectedAlgorithm.verify(publicKey, Buffer.from(vector.canonical, 'utf8'), Buffer.from(vector.signature, 'base64'));
    assert.strictEqual(onBytes ? 'valid' : 'invalid', vector.expect, vector.name + ' on its bytes');

    if (vector.bytes && vector.expect === 'valid') {
      assert.strictEqual(crypto.createHash('sha256').update(Buffer.from(vector.bytes, 'base64')).digest('hex'), vector.content.sha256);
    }

    seen[expectedAlgorithm.name + ' ' + vector.type + ' ' + vector.expect] = true;
  });

  ['ECDSA-P256-SHA256', 'RSA-PSS-SHA256'].forEach(function (alg) {
    schemas.TYPES.forEach(function (type) {
      assert.ok(seen[alg + ' ' + type + ' valid'], alg + ' ' + type + ' has a valid vector');
      assert.ok(seen[alg + ' ' + type + ' invalid'], alg + ' ' + type + ' has a tampered vector');
    });
  });
});

/* ------------------------------------------------------------------ */
/*  signature views - the verdicts the audit records                   */
/* ------------------------------------------------------------------ */

test('signature views: the audit records its verdicts in short words, and only where there is a signature row', async function () {
  let offered = null;
  const store = { recordAudits: function (verdicts) { offered = verdicts; return Promise.resolve(verdicts.length); } };
  const when = new Date('2026-09-17T04:10:00.000Z');
  const signedAt = new Date('2026-09-16T12:00:00.000Z');
  function finding(ref, status, reason, withRow) {
    return { type: 'image', ref: ref, status: status, reason: reason, checkedAt: when,
      row: withRow === false ? null : { id: ref.length, signature: 'sig-' + ref, signed_at: signedAt } };
  }

  const findings = [
    finding('a', 'valid', null),
    finding('bb', 'valid-old-key', null),
    finding('ccc', 'invalid', 'signature-invalid'),
    finding('dddd', 'missing', 'signed, but the file is gone'),
    finding('eeeee', 'revoked-key', 'revoked-key'),
    finding('ffffff', 'untrusted-key', 'unknown-key'),
    finding('ggggggg', 'orphaned', 'no such image any more'),
    finding('hhhhhhhh', 'unsigned', null, false),
    finding('iiiiiiiii', 'missing', 'referenced, but the file is gone', false)
  ];

  assert.strictEqual(await maintenance.record(findings, { store: store, db: {} }), 7);
  assert.deepStrictEqual(offered.map(function (v) { return v.status; }),
    ['valid', 'valid (old key)', 'INVALID', 'MISSING', 'revoked key', 'unknown key', 'orphaned']);
  assert.deepStrictEqual(offered[2], { id: 3, signature: 'sig-ccc', signedAt: signedAt, status: 'INVALID', reason: 'signature-invalid', at: when });
  assert.strictEqual(offered[0].reason, null);

  await maintenance.record(findings, { store: store, db: {}, refs: ['ccc'] });
  assert.deepStrictEqual(offered.map(function (v) { return v.status; }), ['INVALID'], 'refs narrow what is recorded');

  await assert.rejects(maintenance.auditAndRecord({ db: {}, service: {}, refs: ['1'] }), /exactly one type/);
});

/*
 * THE ONE PART OF THIS FILE THAT NEEDS A DATABASE, because what it tests is
 * the database: the v_*_signatures views, and the verdicts the audit writes
 * for them (sql/deltas/030). It uses the development database the API is
 * configured with - the connection `npm run sign:audit` uses - migrated.
 *
 * NOTHING REAL IS WRITTEN. Each test makes its own row - soft-deleted, so no
 * console list or storefront shows it for the second it exists - signs it with
 * the throwaway key, and deletes the row and its signature whatever happens.
 * The audit reads the whole table, as it always does, but records only the
 * test's own ref: with a key the real rows were never signed with, it would
 * otherwise write 'unknown key' over every one of them.
 *
 * THE CLOCKS COME FROM THE DATABASE. The views compare signed_at and
 * audited_at, which the signing service and the audit stamp with the clock
 * they are given, against updated_at, which the trigger stamps with the
 * database's now() - and a development database in a VM or a container is
 * easily a second away from the machine running the tests. So every clock here
 * is set from clock_timestamp(), an hour or more from the next, and each
 * comparison can only come out the way the test means it to.
 */

const HOUR = 3600 * 1000;

function database() {
  return require('../src/config/db');
}

async function databaseNow() {
  const result = await database().raw('SELECT clock_timestamp() AS now');
  return result.rows[0].now;
}

/** A clock stopped at `offset` milliseconds from `base`. */
function stoppedAt(base, offset) {
  const time = new Date(base.getTime() + offset);
  return function () { return time; };
}

function viewService(clock) {
  return createSigningService({
    keys: providerOf(EC_V1),
    store: require('../src/repositories/contentSignatures.repository'),
    clock: clock
  });
}

function stateOf(view, id) {
  return database()(view).where('id', id).first();
}

function auditOne(service, type, ref, clock, extra) {
  return maintenance.auditAndRecord(Object.assign({
    db: database(), service: service, types: [type], refs: [String(ref)], clock: clock
  }, extra || {}));
}

function findingFor(report, ref) {
  return report.findings.filter(function (f) { return f.ref === String(ref); })[0];
}

/** A notice nobody will see, last updated four hours before `base`. */
async function throwawayNotice(base) {
  const hoursAgo = new Date(base.getTime() - 4 * HOUR);
  const rows = await database()('site_notices').insert({
    title: 'signature view test ' + crypto.randomBytes(4).toString('hex'),
    content: '<p>Made by test/signing.test.js, and deleted by it.</p>',
    status: 'DRAFT',
    is_deleted: true,
    created_at: hoursAgo,
    updated_at: hoursAgo
  }).returning('*');
  return rows[0];
}

async function dropNotice(row) {
  if (!row) return;
  await database()('content_signatures').where({ content_type: 'notification', content_ref: String(row.id) }).del();
  await database()('site_notices').where('id', row.id).del();
}

test('signature views: a notice reads unsigned, signed, valid, changed after signing - and INVALID once audited again', async function () {
  const db = database();
  const base = await databaseNow();
  const row = await throwawayNotice(base);

  try {
    let seen = await stateOf('v_notice_signatures', row.id);
    assert.strictEqual(seen.signature_state, 'unsigned');
    assert.strictEqual(seen.key_id, null);
    assert.strictEqual(seen.signature_short, null);

    const service = viewService(stoppedAt(base, -3 * HOUR));
    const signed = await service.sign('notification', row.id, contentOf.notification(row));

    seen = await stateOf('v_notice_signatures', row.id);
    assert.strictEqual(seen.signature_state, 'signed - not yet audited');
    assert.strictEqual(seen.title, row.title);
    assert.strictEqual(seen.key_id, 'test-ec-v1');
    assert.strictEqual(seen.algorithm, 'ECDSA-P256-SHA256');
    assert.strictEqual(seen.payload_sha256, signed.row.payload_sha256);
    assert.strictEqual(seen.signature_short, signed.signature.value.slice(0, 24) + '...');
    assert.strictEqual(seen.audit_status, null);

    const first = await auditOne(service, 'notification', row.id, stoppedAt(base, -2 * HOUR));
    assert.strictEqual(findingFor(first, row.id).status, 'valid');
    assert.strictEqual(first.recorded, 1, 'the real notices are audited, and not written to');

    seen = await stateOf('v_notice_signatures', row.id);
    assert.strictEqual(seen.signature_state, 'valid');
    assert.strictEqual(seen.audit_status, 'valid');
    assert.strictEqual(seen.audit_reason, null);
    assert.strictEqual(seen.audited_at.getTime(), base.getTime() - 2 * HOUR);

    /* Behind the application's back. The trigger moves updated_at, which is signed. */
    await db.raw("UPDATE site_notices SET content = content || '<p>Edited in the database.</p>' WHERE id = ?", [row.id]);

    seen = await stateOf('v_notice_signatures', row.id);
    assert.strictEqual(seen.signature_state, 'changed after signing', 'the timestamps alone show it, before any audit');
    assert.strictEqual(seen.audit_status, 'valid', 'the verdict itself is older than the edit, and says so');

    const second = await auditOne(service, 'notification', row.id, stoppedAt(await databaseNow(), 0));
    assert.strictEqual(findingFor(second, row.id).status, 'invalid');

    seen = await stateOf('v_notice_signatures', row.id);
    assert.strictEqual(seen.signature_state, 'INVALID');
    assert.strictEqual(seen.audit_reason, REASON.SIGNATURE);
  } finally {
    await dropNotice(row);
  }
});

test('signature views: an edit that keeps updated_at still reads valid - until the audit runs again', async function () {
  const db = database();
  const base = await databaseNow();
  const row = await throwawayNotice(base);

  try {
    const service = viewService(stoppedAt(base, -3 * HOUR));
    await service.sign('notification', row.id, contentOf.notification(row));
    await auditOne(service, 'notification', row.id, stoppedAt(base, -2 * HOUR));
    assert.strictEqual((await stateOf('v_notice_signatures', row.id)).signature_state, 'valid');

    /* The careful version: the trigger held off, so updated_at stays what was signed. */
    await db.transaction(async function (trx) {
      await trx.raw('ALTER TABLE site_notices DISABLE TRIGGER trg_site_notices_updated');
      await trx.raw("UPDATE site_notices SET title = title || ' (edited)' WHERE id = ?", [row.id]);
      await trx.raw('ALTER TABLE site_notices ENABLE TRIGGER trg_site_notices_updated');
    });

    let seen = await stateOf('v_notice_signatures', row.id);
    assert.strictEqual(seen.updated_at.getTime(), row.updated_at.getTime());
    assert.ok(/\(edited\)$/.test(seen.title));
    assert.strictEqual(seen.signature_state, 'valid', 'nothing in the database can tell - which is why the audit records what it finds');

    await auditOne(service, 'notification', row.id, stoppedAt(await databaseNow(), 0));

    seen = await stateOf('v_notice_signatures', row.id);
    assert.strictEqual(seen.signature_state, 'INVALID');
    assert.strictEqual(seen.audit_reason, REASON.SIGNATURE);
  } finally {
    await dropNotice(row);
  }
});

test('signature views: an advert follows its image - an edit to the row is not a change to the file, a changed byte is once audited', async function () {
  const db = database();
  const base = await databaseNow();
  const uploads = path.join(TMP, 'view-uploads');
  const name = 'signature-view-test-' + crypto.randomBytes(4).toString('hex') + '.png';
  const key = '/uploads/showcase/' + name;
  const file = path.join(uploads, 'showcase', name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG);

  const advert = (await db('site_adverts').insert({
    placement: 'HOME', device_type: 'all', file_path: key, status: 'INACTIVE', is_deleted: true
  }).returning('*'))[0];

  try {
    assert.strictEqual((await stateOf('v_advert_signatures', advert.id)).signature_state, 'unsigned');

    const service = viewService(stoppedAt(base, -2 * HOUR));
    await service.sign('image', key, contentOf.image(await imageFile.describe(key, uploads)));
    assert.strictEqual((await stateOf('v_advert_signatures', advert.id)).signature_state, 'signed - not yet audited');

    const first = await auditOne(service, 'image', key, stoppedAt(base, -1 * HOUR), { uploadDir: uploads });
    assert.strictEqual(findingFor(first, key).status, 'valid');
    assert.strictEqual(first.recorded, 1);
    assert.strictEqual((await stateOf('v_advert_signatures', advert.id)).signature_state, 'valid');

    /* Reordering an advert moves its updated_at past both - and says nothing about the image. */
    await db.raw('UPDATE site_adverts SET sort_order = sort_order + 1 WHERE id = ?', [advert.id]);
    let seen = await stateOf('v_advert_signatures', advert.id);
    assert.ok(seen.updated_at > seen.audited_at);
    assert.strictEqual(seen.signature_state, 'valid');

    const bytes = Buffer.from(PNG);
    bytes[bytes.length - 13] ^= 0x01;
    fs.writeFileSync(file, bytes);
    assert.strictEqual((await stateOf('v_advert_signatures', advert.id)).signature_state, 'valid',
      'a file changed on disk leaves no trace in the database');

    await auditOne(service, 'image', key, stoppedAt(await databaseNow(), 0), { uploadDir: uploads });
    seen = await stateOf('v_advert_signatures', advert.id);
    assert.strictEqual(seen.signature_state, 'INVALID');
    assert.strictEqual(seen.file_path, key);
  } finally {
    await db('content_signatures').where({ content_type: 'image', content_ref: key }).del();
    await db('site_adverts').where('id', advert.id).del();
  }
});

test('signature views: every view has one row per content row, a state for each, and says why it cannot verify', async function () {
  const db = database();
  const views = [
    ['v_notice_signatures', 'site_notices'],
    ['v_faq_signatures', 'faqs'],
    ['v_advert_signatures', 'site_adverts'],
    ['v_product_image_signatures', 'product_images'],
    ['v_image_signatures', 'media_assets']
  ];

  for (let i = 0; i < views.length; i += 1) {
    const view = views[i][0];
    // eslint-disable-next-line no-await-in-loop
    const counts = (await db.raw(
      'SELECT (SELECT count(*) FROM ??) AS in_view, (SELECT count(*) FROM ??) AS in_table,' +
      ' (SELECT count(*) FROM ?? WHERE signature_state IS NULL) AS stateless,' +
      " obj_description(?::regclass, 'pg_class') AS comment",
      [view, views[i][1], view, view]
    )).rows[0];

    assert.strictEqual(counts.in_view, counts.in_table, view + ' has a row per ' + views[i][1] + ' row');
    assert.strictEqual(counts.stateless, '0', view + ' leaves no row without a state');
    assert.ok(/cannot verify|neither\s+hash\s+a\s+file\s+nor\s+verify/.test(counts.comment || ''), view + ' carries its comment');
  }
});

/* ------------------------------------------------------------------ */

run()
  .then(function (failed) {
    fs.rmdirSync(TMP, { recursive: true });
    process.exit(failed ? 1 : 0);
  })
  .catch(function (err) {
    console.error(err);
    process.exit(2);
  });
