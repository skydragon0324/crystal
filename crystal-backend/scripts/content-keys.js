'use strict';

/**
 * SIGNING KEYS AND THE TEST VECTORS.
 *
 *   npm run content-keys                                  the development key: ECDSA,
 *                                                         content-key-dev, in .content-keys/
 *   npm run content-keys -- --algorithm RSA --key-id content-key-v2 [--dir /secure/content-keys]
 *   npm run content-keys -- --vectors                     rewrite test/fixtures/signing-vectors.json
 *
 *   CONTENT_SIGNING_P12_PASSWORD=... npm run content-keys -- --from-p12 /secure/content-signing.p12 \
 *       --ca-chain /secure/caChain.crt --key-id content-key-v2 [--write-web-env]
 *                                                         check a CA-issued .p12 and print its pin
 *   npm run content-keys -- --dev-p12 [--algorithm RSA] [--key-id <id>]
 *                                                         a development CA and a .p12 issued by it
 *
 * A .p12 IS CHECKED, THEN PINNED. `--from-p12` opens the file exactly as the
 * API does at startup - the password from CONTENT_SIGNING_P12_PASSWORD in the
 * environment, never an argument, which `ps` and shell history would keep -
 * runs every certificate check against the CA chain (which it requires), and
 * only then prints REACT_APP_CONTENT_SIGNING_KEYS for the verified public key
 * under the key id it was TOLD (--key-id; never taken from the certificate).
 * A certificate that fails - wrong chain, expired, a CA certificate, not for
 * signatures - gets a refusal and no pin. The storefront goes on pinning one
 * key, as it always has; the chain is what was checked before that key was
 * written down. With --write-web-env the entry is ADDED to the storefront's
 * development env file beside the keys already there, and a different key
 * already pinned under the same id is refused.
 *
 * `--dev-p12` makes something to try that with: a throwaway development CA
 * (caChain.crt, and its key dev-ca.key.pem, reused by later runs) and a
 * signing certificate issued by it, packaged with its key as a
 * password-protected <keyId>.p12 - all in .content-keys/, which git and svn
 * ignore. The password is random, printed once with the .env lines, and
 * stored nowhere. The leaf's private key exists on disk only for the moment
 * openssl needs it to build the .p12 (a 600 file in that same directory,
 * removed in `finally`) - a development CA's key sits beside it permanently,
 * so this is not the place to be precious, and nothing here is for production.
 *
 * A KEY is a private key and a self-signed X.509 certificate for it, written
 * as <keyId>.key.pem (mode 600) and <keyId>.crt.pem. Then the storefront's
 * trusted list - REACT_APP_CONTENT_SIGNING_KEYS in
 * crystal-web/.env.development.local - is rewritten from every certificate in
 * the directory, so a development build trusts what this machine signs with.
 *
 * A KEY ID IS NEVER REUSED. If <keyId> already exists the key is left exactly
 * as it is and only the storefront's list is rewritten. Replacing a key while
 * keeping its id would make every signature it ever made unverifiable under
 * the same name the storefront still trusts - a new key gets a new id. See
 * docs/content-signing.md for rotation.
 *
 * openssl is run from node rather than from a shell script, as
 * scripts/x509-dev-pki.js does and for the same reason: Git Bash rewrites an
 * argument that looks like a path, and "/CN=..." arrives at openssl as
 * "C:/Program Files/Git/CN=...". The subject is in a generated config file
 * here, which also keeps the command identical on OpenSSL 1.1 and 3.x.
 *
 * THE VECTORS are signed with keys generated in memory for the purpose and
 * thrown away: only their public halves and the signatures are written. They
 * are FIXTURES - they prove the backend and the storefront build the same
 * bytes and speak the same signature formats, and they carry no trust.
 * crystal-web copies the file verbatim to
 * src/security/__fixtures__/signing-vectors.json.
 */

const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const algorithms = require('../src/security/algorithms');
const canonical = require('../src/security/canonicalPayload');
const signingConfig = require('../src/security/signingConfig');
const keyProvider = require('../src/security/keyProvider');
const { createSigningService } = require('../src/security/signingService');

const ROOT = path.join(__dirname, '..');
const OPENSSL = process.env.OPENSSL_BIN || 'openssl';
const VECTORS_FILE = path.join(ROOT, 'test', 'fixtures', 'signing-vectors.json');
const WEB_ENV_FILE = path.join(ROOT, '..', 'crystal-web', '.env.development.local');
const WEB_ENV_NAME = 'REACT_APP_CONTENT_SIGNING_KEYS';

/* ------------------------------------------------------------------ */
/*  arguments                                                          */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const out = {
    algorithm: signingConfig.DEV_ALGORITHM,
    keyId: signingConfig.DEV_KEY_ID,
    dir: path.join(ROOT, signingConfig.DEV_DIR_NAME),
    days: 825,
    webEnv: WEB_ENV_FILE,
    vectors: false,
    fromP12: null,
    caChain: null,
    devP12: false,
    writeWebEnv: false,
    help: false,
    /* Which options were typed, as opposed to defaulted - a .p12's key id must be. */
    given: {}
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = function () {
      i += 1;
      if (i >= argv.length) throw new Error(arg + ' needs a value');
      return argv[i];
    };

    if (arg === '--algorithm') out.algorithm = next();
    else if (arg === '--key-id') out.keyId = next();
    else if (arg === '--dir') out.dir = path.resolve(next());
    else if (arg === '--days') out.days = parseInt(next(), 10);
    else if (arg === '--web-env') out.webEnv = path.resolve(next());
    else if (arg === '--no-web-env') out.webEnv = null;
    else if (arg === '--vectors') out.vectors = true;
    else if (arg === '--from-p12') out.fromP12 = path.resolve(next());
    else if (arg === '--ca-chain') out.caChain = path.resolve(next());
    else if (arg === '--dev-p12') out.devP12 = true;
    else if (arg === '--write-web-env') out.writeWebEnv = true;
    else if (arg === '--password' || arg.indexOf('--password=') === 0) {
      throw new Error('there is no --password: a password on the command line is visible in process lists and ' +
        'shell history. Set CONTENT_SIGNING_P12_PASSWORD in the environment instead.');
    } else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error('unknown argument: ' + arg);

    if (/^--(algorithm|key-id|dir|days)$/.test(arg)) out.given[arg.slice(2)] = true;
  }

  return out;
}

const USAGE = [
  'usage: npm run content-keys -- [options]',
  '',
  '  --algorithm ECDSA|RSA   key type (default ECDSA)',
  '  --key-id <id>           default content-key-dev (content-key-dev-p12 with --dev-p12)',
  '  --dir <directory>       default crystal-backend/.content-keys',
  '  --days <n>              certificate validity (default 825)',
  '  --web-env <file>        storefront env file to write (default crystal-web/.env.development.local)',
  '  --no-web-env            do not touch the storefront env file',
  '  --vectors               only rewrite test/fixtures/signing-vectors.json',
  '',
  '  --from-p12 <file>       check a .p12 against --ca-chain and print its storefront pin;',
  '                          --key-id is required, the password comes from CONTENT_SIGNING_P12_PASSWORD',
  '  --ca-chain <file>       the CA chain (default CONTENT_SIGNING_CA_CHAIN)',
  '  --dev-p12               create a development CA and a .p12 issued by it in --dir',
  '  --write-web-env         with --from-p12 or --dev-p12: add the pin to --web-env'
].join('\n');

/* ------------------------------------------------------------------ */
/*  a key and its certificate                                          */
/* ------------------------------------------------------------------ */

function opensslConfig(keyId) {
  return [
    '[req]',
    'distinguished_name = dn',
    'x509_extensions = ext',
    'prompt = no',
    '',
    '[dn]',
    'CN = ' + keyId,
    '',
    '[ext]',
    'basicConstraints = critical,CA:FALSE',
    'keyUsage = critical,digitalSignature',
    'subjectKeyIdentifier = hash',
    ''
  ].join('\n');
}

function generateKey(options) {
  const algorithm = algorithms.byConfig(options.algorithm);
  if (!algorithm) throw new Error('--algorithm must be ' + algorithms.CONFIG_VALUES.join(' or '));
  if (!signingConfig.isKeyId(options.keyId)) throw new Error('"' + options.keyId + '" is not a valid key id');
  if (!(options.days > 0)) throw new Error('--days must be a positive number');

  fs.mkdirSync(options.dir, { recursive: true, mode: 0o700 });

  const keyFile = keyProvider.fileFor(options.dir, options.keyId, 'key');
  const certFile = keyProvider.fileFor(options.dir, options.keyId, 'crt');

  if (fs.existsSync(keyFile) || fs.existsSync(certFile)) {
    console.log('"' + options.keyId + '" already exists in ' + options.dir + ' - left untouched.');
    console.log('A key id is never given a new key; use another --key-id for a new one.');
    return false;
  }

  const configFile = path.join(os.tmpdir(), 'crystal-content-key-' + crypto.randomBytes(6).toString('hex') + '.cnf');
  fs.writeFileSync(configFile, opensslConfig(options.keyId));

  try {
    childProcess.execFileSync(OPENSSL, ['req', '-x509']
      .concat(algorithm.opensslNewKey)
      .concat(['-nodes', '-sha256', '-days', String(options.days),
        '-config', configFile, '-keyout', keyFile, '-out', certFile]),
    { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  } catch (err) {
    [keyFile, certFile].forEach(function (file) { try { fs.unlinkSync(file); } catch (e) { /* not written */ } });
    throw new Error(err.code === 'ENOENT'
      ? 'openssl was not found (set OPENSSL_BIN)'
      : 'openssl failed: ' + String(err.stderr || err.message).trim());
  } finally {
    try { fs.unlinkSync(configFile); } catch (e) { /* gone */ }
  }

  /* Owner only. Windows ignores most of this; its ACLs are the deployment's to set. */
  fs.chmodSync(keyFile, 0o600);

  /* Load it back through the exact checks the server runs at startup. */
  const identity = keyProvider.loadIdentity(options.dir, options.keyId, {
    requirePrivate: true, algorithm: algorithm, openssl: OPENSSL
  });

  console.log('created ' + options.keyId + ' (' + identity.algorithm.name + ')');
  console.log('  private key  ' + keyFile);
  console.log('  certificate  ' + certFile + '  valid until ' + identity.notAfter.toISOString());
  return true;
}

/* ------------------------------------------------------------------ */
/*  the storefront's trusted list                                      */
/* ------------------------------------------------------------------ */

function revokedIds() {
  return String(process.env.CONTENT_SIGNING_REVOKED_KEY_IDS || '')
    .split(',').map(function (id) { return id.trim(); }).filter(Boolean);
}

function trustedEntries(dir) {
  const revoked = revokedIds();

  return fs.readdirSync(dir)
    .filter(function (name) { return /\.crt\.pem$/.test(name); })
    .map(function (name) { return name.replace(/\.crt\.pem$/, ''); })
    .filter(function (keyId) { return signingConfig.isKeyId(keyId) && revoked.indexOf(keyId) === -1; })
    .sort()
    .map(function (keyId) {
      const identity = keyProvider.loadIdentity(dir, keyId, { requirePrivate: false, openssl: OPENSSL });
      return { keyId: keyId, algorithm: identity.algorithm.name, spki: identity.spki };
    });
}

/**
 * Sets one line of an env file and leaves every other line alone - the file
 * is the developer's, and may hold settings this script knows nothing about.
 */
function writeWebEnv(file, entries) {
  const line = WEB_ENV_NAME + '=' + JSON.stringify(entries);
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/) : [];

  let replaced = false;
  const lines = existing.map(function (current) {
    if (current.indexOf(WEB_ENV_NAME + '=') === 0) {
      replaced = true;
      return line;
    }
    return current;
  });

  if (!replaced) {
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    if (!lines.length) {
      lines.push('# The public keys this development build trusts for signed content.');
      lines.push('# Written by `npm run content-keys` in crystal-backend - see its docs/content-signing.md.');
    }
    lines.push(line);
  }

  fs.writeFileSync(file, lines.join('\n').replace(/\n*$/, '\n'));
}

/** The storefront's current list in an env file - [] when there is none, an error when it cannot be read. */
function webEnvEntries(file) {
  if (!fs.existsSync(file)) return [];

  const line = fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .filter(function (current) { return current.indexOf(WEB_ENV_NAME + '=') === 0; })[0];
  if (!line) return [];

  try {
    const parsed = JSON.parse(line.slice(WEB_ENV_NAME.length + 1) || '[]');
    if (!Array.isArray(parsed)) throw new Error('not a list');
    return parsed;
  } catch (err) {
    throw new Error(file + ' has a ' + WEB_ENV_NAME + ' line that is not a JSON list. Fix it by hand - it is ' +
      'not overwritten with a guess.');
  }
}

/**
 * ADDS one pin to the storefront's env file, keeping every key already there
 * - a .p12 key arrives beside the keys that signed what is already published,
 * which is the whole of the rotation procedure. The same key under the same id
 * again is nothing to do; a DIFFERENT key under an id already pinned is
 * refused, because a key id is never given a new key.
 */
function addToWebEnv(file, entry) {
  const entries = webEnvEntries(file);
  const existing = entries.filter(function (e) { return e && e.keyId === entry.keyId; })[0];

  if (existing) {
    if (existing.spki === entry.spki && existing.algorithm === entry.algorithm) return false;
    throw new Error(file + ' already pins a DIFFERENT key under "' + entry.keyId + '". A key id is never given a ' +
      'new key - use a new --key-id (docs/content-signing.md, "Renewing a certificate").');
  }

  writeWebEnv(file, entries.concat([entry]));
  return true;
}

/* ------------------------------------------------------------------ */
/*  a .p12: checked, then pinned                                       */
/* ------------------------------------------------------------------ */

function printCertificate(identity) {
  keyProvider.describeCertificate(identity.certificate).forEach(function (line) {
    console.log('  ' + line);
  });
  console.log('  key      ' + identity.keyId + ' (' + identity.algorithm.name + ')');
}

function pinFor(identity) {
  return { keyId: identity.keyId, algorithm: identity.algorithm.name, spki: identity.spki };
}

/** keyProvider's refusal, as this script's - without the server's "misconfigured" framing. */
function refusal(err, file) {
  if (!(err instanceof signingConfig.SigningConfigError)) return err;
  return new Error('refusing to pin ' + file + ': ' + err.message.replace(/^content signing is misconfigured: /, ''));
}

function fromP12(options) {
  if (!options.given['key-id']) {
    throw new Error('--key-id is required with --from-p12. The key id is the name the storefront pins the key ' +
      'under; it is chosen, never read out of the certificate.');
  }
  if (!signingConfig.isKeyId(options.keyId)) throw new Error('"' + options.keyId + '" is not a valid key id');

  const password = process.env.CONTENT_SIGNING_P12_PASSWORD;
  if (!password) {
    throw new Error('CONTENT_SIGNING_P12_PASSWORD is not set. The .p12 password is read from the environment and ' +
      'never taken as an argument - see docs/content-signing.md for a way to set it without shell history.');
  }

  const caChain = options.caChain || (process.env.CONTENT_SIGNING_CA_CHAIN ? path.resolve(process.env.CONTENT_SIGNING_CA_CHAIN) : null);
  if (!caChain) {
    throw new Error('refusing to pin ' + options.fromP12 + ': there is no CA chain to check it against. Give ' +
      '--ca-chain <file> (or set CONTENT_SIGNING_CA_CHAIN) - the chain is checked before a key is pinned.');
  }

  let algorithm = null;
  if (options.given.algorithm) {
    algorithm = algorithms.byConfig(options.algorithm);
    if (!algorithm) throw new Error('--algorithm must be ' + algorithms.CONFIG_VALUES.join(' or '));
  }

  let identity;
  try {
    identity = keyProvider.loadP12Identity(signingConfig.p12Setting(options.fromP12, password), options.keyId, {
      algorithm: algorithm,
      caChain: caChain,
      openssl: OPENSSL,
      warn: function (message) { console.warn('warning: ' + message); }
    });
  } catch (err) {
    throw refusal(err, options.fromP12);
  }

  const entry = pinFor(identity);

  console.log('checked ' + options.fromP12);
  printCertificate(identity);
  console.log('');
  console.log('# The storefront pin for this key - set in crystal-web\'s build environment. During a');
  console.log('# rotation or a renewal, add the entry BESIDE the keys already listed there:');
  console.log(WEB_ENV_NAME + '=' + JSON.stringify([entry]));

  if (options.writeWebEnv && options.webEnv) {
    const added = addToWebEnv(options.webEnv, entry);
    console.log('# ' + (added ? 'added to ' : 'already pinned in ') + options.webEnv);
  }

  console.log('');
  console.log('# crystal-backend .env - once a storefront trusting this key is deployed:');
  console.log('CONTENT_SIGNING_ALGORITHM=' + identity.algorithm.config);
  console.log('CONTENT_SIGNING_KEY_ID=' + identity.keyId);
  console.log('CONTENT_SIGNING_P12=' + options.fromP12);
  console.log('CONTENT_SIGNING_P12_PASSWORD=<the .p12 password - not printed>');
  console.log('CONTENT_SIGNING_CA_CHAIN=' + caChain);
}

/* ------------------------------------------------------------------ */
/*  a development CA and .p12                                          */
/* ------------------------------------------------------------------ */

const DEV_P12_KEY_ID = 'content-key-dev-p12';
const DEV_CA_KEY = 'dev-ca.key.pem';
const DEV_CA_CHAIN = 'caChain.crt';

function devCaConfig() {
  return [
    '[req]',
    'distinguished_name = dn',
    'x509_extensions = ext',
    'prompt = no',
    '',
    '[dn]',
    'CN = Crystal Development Content Signing CA',
    'O = Crystal Development',
    '',
    '[ext]',
    'basicConstraints = critical,CA:TRUE,pathlen:0',
    'keyUsage = critical,keyCertSign,cRLSign',
    'subjectKeyIdentifier = hash',
    ''
  ].join('\n');
}

function devLeafConfig(keyId) {
  return [
    '[req]',
    'distinguished_name = dn',
    'prompt = no',
    '',
    '[dn]',
    'CN = ' + keyId,
    'O = Crystal Development',
    '',
    '[ext]',
    'basicConstraints = critical,CA:FALSE',
    'keyUsage = critical,digitalSignature',
    'subjectKeyIdentifier = hash',
    'authorityKeyIdentifier = keyid',
    ''
  ].join('\n');
}

function openssl(args, env) {
  try {
    childProcess.execFileSync(OPENSSL, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true, env: env });
  } catch (err) {
    throw new Error(err.code === 'ENOENT'
      ? 'openssl was not found (set OPENSSL_BIN)'
      : 'openssl ' + args[0] + ' failed: ' + String(err.stderr || err.message).trim());
  }
}

function devP12(options) {
  const algorithm = algorithms.byConfig(options.algorithm);
  if (!algorithm) throw new Error('--algorithm must be ' + algorithms.CONFIG_VALUES.join(' or '));

  const keyId = options.given['key-id'] ? options.keyId : DEV_P12_KEY_ID + (algorithm === algorithms.rsa ? '-rsa' : '');
  if (!signingConfig.isKeyId(keyId)) throw new Error('"' + keyId + '" is not a valid key id');
  if (!(options.days > 0)) throw new Error('--days must be a positive number');

  const dir = options.dir;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  const p12File = path.join(dir, keyId + '.p12');
  const taken = [p12File, keyProvider.fileFor(dir, keyId, 'key'), keyProvider.fileFor(dir, keyId, 'crt')]
    .filter(function (file) { return fs.existsSync(file); });

  if (taken.length) {
    console.log('"' + keyId + '" already exists in ' + dir + ' (' + taken.map(function (f) { return path.basename(f); }).join(', ') +
      ') - left untouched.');
    console.log('A key id is never given a new key; use another --key-id for a new one.');
    return;
  }

  const caKey = path.join(dir, DEV_CA_KEY);
  const caChain = path.join(dir, DEV_CA_CHAIN);
  const tag = crypto.randomBytes(6).toString('hex');
  const temporary = {
    caConfig: path.join(dir, '.tmp-' + tag + '-ca.cnf'),
    leafConfig: path.join(dir, '.tmp-' + tag + '-leaf.cnf'),
    leafKey: path.join(dir, '.tmp-' + tag + '-leaf.key.pem'),
    leafRequest: path.join(dir, '.tmp-' + tag + '-leaf.csr'),
    leafCertificate: path.join(dir, '.tmp-' + tag + '-leaf.crt')
  };

  const password = crypto.randomBytes(18).toString('hex');
  let createdCa = false;

  try {
    if (fs.existsSync(caKey) !== fs.existsSync(caChain)) {
      throw new Error('found only one of ' + DEV_CA_KEY + ' and ' + DEV_CA_CHAIN + ' in ' + dir + '. Restore the ' +
        'other or remove both - a development CA is not half re-made.');
    }

    if (!fs.existsSync(caKey)) {
      fs.writeFileSync(temporary.caConfig, devCaConfig());
      openssl(['req', '-x509'].concat(algorithms.ecdsa.opensslNewKey)
        .concat(['-nodes', '-sha256', '-days', '3650', '-config', temporary.caConfig, '-keyout', caKey, '-out', caChain]));
      fs.chmodSync(caKey, 0o600);
      createdCa = true;
    }

    fs.writeFileSync(temporary.leafConfig, devLeafConfig(keyId));
    openssl(['req', '-new'].concat(algorithm.opensslNewKey)
      .concat(['-nodes', '-config', temporary.leafConfig, '-keyout', temporary.leafKey, '-out', temporary.leafRequest]));
    fs.chmodSync(temporary.leafKey, 0o600);

    /* A random positive 128-bit serial, rather than a .srl file beside the CA to keep in step. */
    const serial = crypto.randomBytes(16);
    serial[0] &= 0x7f;

    openssl(['x509', '-req', '-in', temporary.leafRequest, '-CA', caChain, '-CAkey', caKey,
      '-set_serial', '0x' + serial.toString('hex'), '-sha256', '-days', String(options.days),
      '-extfile', temporary.leafConfig, '-extensions', 'ext', '-out', temporary.leafCertificate]);

    /* Modern encryption spelled out, so an OpenSSL 1.1 build does not write the legacy kind. */
    const env = Object.assign({}, process.env);
    env[keyProvider.PASSIN_VARIABLE] = password;
    openssl(['pkcs12', '-export', '-inkey', temporary.leafKey, '-in', temporary.leafCertificate,
      '-certfile', caChain, '-name', keyId, '-keypbe', 'AES-256-CBC', '-certpbe', 'AES-256-CBC', '-macalg', 'sha256',
      '-out', p12File, '-passout', 'env:' + keyProvider.PASSIN_VARIABLE], env);
    fs.chmodSync(p12File, 0o600);
  } catch (err) {
    try { fs.unlinkSync(p12File); } catch (e) { /* not written */ }
    if (createdCa) {
      [caKey, caChain].forEach(function (file) { try { fs.unlinkSync(file); } catch (e) { /* not written */ } });
    }
    throw err;
  } finally {
    Object.keys(temporary).forEach(function (name) {
      try { fs.unlinkSync(temporary[name]); } catch (e) { /* never written */ }
    });
  }

  /* Opened back through exactly what the API runs at startup, chain included. */
  const identity = keyProvider.loadP12Identity(signingConfig.p12Setting(p12File, password), keyId, {
    algorithm: algorithm,
    caChain: caChain,
    openssl: OPENSSL,
    warn: function (message) { console.warn('warning: ' + message); }
  });

  const entry = pinFor(identity);

  console.log('created ' + keyId + ' (' + identity.algorithm.name + '), issued by ' +
    (createdCa ? 'a new' : 'the existing') + ' development CA');
  console.log('  .p12         ' + p12File + '  (password-protected)');
  console.log('  CA chain     ' + caChain);
  console.log('  CA key       ' + caKey + '  (development only - issues further dev .p12 files)');
  printCertificate(identity);

  if (options.writeWebEnv && options.webEnv) {
    const added = addToWebEnv(options.webEnv, entry);
    console.log('');
    console.log('the storefront pin was ' + (added ? 'added to ' : 'already in ') + options.webEnv +
      ' - restart or rebuild crystal-web to pick it up');
  }

  const devKeyCertificate = keyProvider.fileFor(dir, signingConfig.DEV_KEY_ID, 'crt');

  console.log('');
  console.log('To sign with it, set in crystal-backend/.env - the password is shown this once and stored nowhere:');
  console.log('  CONTENT_SIGNING_ALGORITHM=' + algorithm.config);
  console.log('  CONTENT_SIGNING_KEY_ID=' + keyId);
  console.log('  CONTENT_SIGNING_P12=' + p12File);
  console.log('  CONTENT_SIGNING_P12_PASSWORD=' + password);
  console.log('  CONTENT_SIGNING_CA_CHAIN=' + caChain);
  if (fs.existsSync(devKeyCertificate) && keyId !== signingConfig.DEV_KEY_ID) {
    console.log('and, so content already signed by ' + signingConfig.DEV_KEY_ID + ' keeps verifying:');
    console.log('  CONTENT_SIGNING_KEY_DIR=' + dir);
    console.log('  CONTENT_SIGNING_VERIFY_KEY_IDS=' + signingConfig.DEV_KEY_ID);
  }
  if (!options.writeWebEnv) {
    console.log('');
    console.log('The storefront must trust it FIRST, or everything newly signed shows as invalid. Add this entry');
    console.log('beside the keys in ' + WEB_ENV_NAME + ' (or run again with --write-web-env):');
    console.log('  ' + JSON.stringify(entry));
  }
}

/* ------------------------------------------------------------------ */
/*  the vectors                                                        */
/* ------------------------------------------------------------------ */

/* A 1x1 PNG and a one-line SVG, so an image vector's bytes can be re-hashed by the reader. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>\n', 'utf8');

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function samples() {
  const tamperedPng = Buffer.from(PNG);
  tamperedPng[tamperedPng.length - 13] ^= 0x01;

  return [
    {
      name: 'notification with Unicode, HTML and every optional set',
      type: 'notification',
      content: {
        id: 101,
        title: '系统维护 — Техническое обслуживание 🔧',
        content: '<p>Crystal "C9" update: 5&nbsp;% off <a href="/smartphones/c9">today</a></p>\n' +
          '<p>tab\there, backslash \\ here, e\u0301 is not \u00e9, and a line\u2028separator</p>',
        originId: 3,
        status: 'PUBLISHED',
        startsAt: '2026-09-16T00:00:00.000Z',
        endsAt: '2026-10-01T23:59:59.999Z',
        sortOrder: 10,
        createdAt: '2026-09-15T09:30:12.345Z',
        updatedAt: '2026-09-16T10:00:00.000Z'
      },
      tamper: [
        ['the text changed', function (c) { c.content = c.content.replace('5&nbsp;%', '50&nbsp;%'); }],
        ['the id changed', function (c) { c.id = 102; }],
        ['the updated timestamp changed', function (c) { c.updatedAt = '2026-09-16T10:00:00.001Z'; }],
        ['the status changed', function (c) { c.status = 'DRAFT'; }]
      ]
    },
    {
      name: 'notification with null optionals, a negative order and an escaped lone surrogate',
      type: 'notification',
      content: {
        id: 7,
        title: 'Maintenance tonight \ud800 (lone surrogate, escaped by JSON.stringify)',
        content: '',
        originId: null,
        status: 'REVIEW',
        startsAt: null,
        endsAt: null,
        sortOrder: -5,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      },
      tamper: [
        ['a null optional filled in', function (c) { c.endsAt = '2026-01-02T00:00:00.000Z'; }]
      ]
    },
    {
      name: 'faq with a Unicode answer',
      type: 'faq',
      content: {
        id: 12,
        category: 'SMARTPHONE',
        question: 'Why does my C9 say "Сим-карта не найдена"?',
        answer: '重启手机，然后重新插入 SIM 卡。\nIf it still fails, visit a service centre — bring your receipt.',
        sortOrder: 3,
        status: 'PUBLISHED',
        createdAt: '2026-08-01T12:00:00.000Z',
        updatedAt: '2026-09-01T08:15:30.500Z'
      },
      tamper: [
        ['the answer changed', function (c) { c.answer = c.answer + ' '; }],
        ['the category changed', function (c) { c.category = 'TV'; }]
      ]
    },
    {
      name: 'faq about a service rather than a product',
      type: 'faq',
      content: {
        id: 99,
        category: 'CRYSTAL_APP',
        question: 'How do I sign in?',
        answer: 'Use your Crystal ID.',
        sortOrder: 0,
        status: 'ARCHIVED',
        createdAt: '2026-02-28T23:59:59.999Z',
        updatedAt: '2026-03-01T00:00:00.000Z'
      },
      tamper: [
        ['the question changed', function (c) { c.question = 'How do I sign out?'; }]
      ]
    },
    {
      name: 'png image',
      type: 'image',
      bytes: PNG,
      content: {
        storageKey: '/uploads/products/c9/main.png',
        mimeType: 'image/png',
        size: PNG.length,
        sha256: sha256(PNG)
      },
      tamper: [
        ['one byte of the file changed and its hash recomputed', function (c) { c.sha256 = sha256(tamperedPng); }, tamperedPng],
        ['the size changed', function (c) { c.size = c.size + 1; }],
        ['the MIME type changed', function (c) { c.mimeType = 'image/jpeg'; }],
        ['the signature presented for another path', function (c) { c.storageKey = '/uploads/products/c9/other.png'; }]
      ]
    },
    {
      name: 'svg image',
      type: 'image',
      bytes: SVG,
      content: {
        storageKey: '/uploads/adverts/home-crystal.svg',
        mimeType: 'image/svg+xml',
        size: SVG.length,
        sha256: sha256(SVG)
      },
      tamper: [
        ['the file replaced by another whose hash was recomputed', function (c) {
          const other = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>\n', 'utf8');
          c.sha256 = sha256(other);
          c.size = other.length;
        }, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>\n', 'utf8')]
      ]
    }
  ];
}

function vectorsFor(algorithm, keyId, keyPair) {
  const provider = {
    active: function () {
      return { keyId: keyId, algorithm: algorithm, privateKey: keyPair.privateKey, publicKey: keyPair.publicKey };
    },
    resolve: function (id) {
      return id === keyId ? { keyId: keyId, algorithm: algorithm, publicKey: keyPair.publicKey, revoked: false } : null;
    }
  };

  const service = createSigningService({ keys: provider });
  const spki = keyPair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const out = [];

  const push = function (name, sample, content, signature, expect, bytes, overrides) {
    const vector = Object.assign({
      name: name,
      type: sample.type,
      content: content,
      algorithm: algorithm.name,
      keyId: keyId,
      canonical: null,
      signature: signature,
      spki: spki,
      expect: expect
    }, overrides || {});

    vector.canonical = canonical.canonicalJson(vector.type, vector.algorithm, vector.keyId, vector.content);
    if (bytes) vector.bytes = bytes.toString('base64');
    out.push(vector);
  };

  samples().forEach(function (sample) {
    const signed = service.signContent({ type: sample.type, content: sample.content });
    const prefix = algorithm.name + ' ' + sample.type + ': ';

    push(prefix + sample.name, sample, signed.content, signed.signature.value, 'valid', sample.bytes);

    sample.tamper.forEach(function (entry) {
      const changed = JSON.parse(JSON.stringify(signed.content));
      entry[1](changed);
      push(prefix + 'TAMPERED - ' + entry[0], sample, canonical.orderedContent(sample.type, changed),
        signed.signature.value, 'invalid', entry[2] || null);
    });

    /* The signature itself altered: one bit of the last byte. */
    const flipped = Buffer.from(signed.signature.value, 'base64');
    flipped[flipped.length - 1] ^= 0x01;
    push(prefix + 'TAMPERED - one bit of the signature flipped', sample, signed.content,
      flipped.toString('base64'), 'invalid', sample.bytes);
  });

  /*
   * REPLAYS, once per algorithm on the first sample: the same content and
   * signature presented under another key id, and under the other algorithm's
   * name. `kid` and `alg` are inside the signed bytes, so both fail on the
   * bytes alone - and a verifier that also refuses them before any
   * cryptography (an unknown key, an algorithm that is not the key's) is
   * right to.
   */
  const first = samples()[0];
  const signedFirst = service.signContent({ type: first.type, content: first.content });
  push(algorithm.name + ' ' + first.type + ': TAMPERED - replayed under another key id', first,
    signedFirst.content, signedFirst.signature.value, 'invalid', null, { keyId: keyId + '-other' });
  push(algorithm.name + ' ' + first.type + ': TAMPERED - replayed under the other algorithm name', first,
    signedFirst.content, signedFirst.signature.value, 'invalid', null,
    { algorithm: algorithm === algorithms.ecdsa ? algorithms.rsa.name : algorithms.ecdsa.name });

  /*
   * Every vector is checked before it is written, twice: through the service,
   * envelope checks and all, and on the canonical bytes alone - so a replay
   * vector is known to fail on its bytes, not only on a key lookup a reader
   * might implement differently.
   */
  out.forEach(function (vector) {
    const onBytes = algorithm.verify(keyPair.publicKey, Buffer.from(vector.canonical, 'utf8'),
      Buffer.from(vector.signature, 'base64'));
    if (onBytes !== (vector.expect === 'valid')) {
      throw new Error('vector "' + vector.name + '" verifies ' + onBytes + ' on its canonical bytes');
    }

    const result = service.verifyContent({
      type: vector.type,
      content: vector.content,
      signature: {
        v: 1, type: vector.type, algorithm: vector.algorithm, keyId: vector.keyId,
        encoding: algorithm.encoding, value: vector.signature, signedAt: '2026-09-16T00:00:00.000Z'
      },
      trustedKey: { keyId: keyId, algorithm: algorithm, publicKey: keyPair.publicKey }
    });

    const got = result.valid ? 'valid' : 'invalid';
    if (got !== vector.expect) {
      throw new Error('vector "' + vector.name + '" is ' + got + ' but was written as ' + vector.expect);
    }
    if (vector.bytes && vector.expect === 'valid' && sha256(Buffer.from(vector.bytes, 'base64')) !== vector.content.sha256) {
      throw new Error('vector "' + vector.name + '" carries bytes that do not hash to its sha256');
    }
  });

  return out;
}

function writeVectors() {
  const vectors = []
    .concat(vectorsFor(algorithms.ecdsa, 'fixture-ecdsa-v1', algorithms.ecdsa.generateKeyPair()))
    .concat(vectorsFor(algorithms.rsa, 'fixture-rsa-v1', algorithms.rsa.generateKeyPair()));

  fs.mkdirSync(path.dirname(VECTORS_FILE), { recursive: true });
  fs.writeFileSync(VECTORS_FILE, JSON.stringify(vectors, null, 2) + '\n');

  const valid = vectors.filter(function (v) { return v.expect === 'valid'; }).length;
  console.log('wrote ' + vectors.length + ' vectors (' + valid + ' valid, ' + (vectors.length - valid) +
    ' tampered) to ' + VECTORS_FILE);
  console.log('the fixture private keys were not written anywhere and are gone.');
}

/* ------------------------------------------------------------------ */

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(USAGE);
    return;
  }

  if (options.vectors) {
    writeVectors();
    return;
  }

  if (options.fromP12 && options.devP12) throw new Error('--from-p12 and --dev-p12 are two different jobs; choose one');

  if (options.fromP12) {
    fromP12(options);
    return;
  }

  if (options.devP12) {
    devP12(options);
    return;
  }

  if (options.writeWebEnv || options.caChain) {
    throw new Error('--write-web-env and --ca-chain go with --from-p12 or --dev-p12');
  }

  generateKey(options);

  if (options.webEnv) {
    const entries = trustedEntries(options.dir);
    writeWebEnv(options.webEnv, entries);
    console.log('');
    console.log('the storefront now trusts ' + entries.map(function (e) { return e.keyId + ' (' + e.algorithm + ')'; }).join(', '));
    console.log('  written to ' + options.webEnv + ' - restart or rebuild crystal-web to pick it up');
  }

  const isDefault = options.keyId === signingConfig.DEV_KEY_ID
    && options.algorithm === signingConfig.DEV_ALGORITHM
    && path.resolve(options.dir) === path.join(ROOT, signingConfig.DEV_DIR_NAME);

  console.log('');
  if (isDefault) {
    console.log('This is the development default: with no CONTENT_SIGNING_* variables set and');
    console.log('NODE_ENV not production, the API signs with it. Nothing to add to .env.');
  } else {
    console.log('To sign with this key, set in crystal-backend/.env:');
    console.log('  CONTENT_SIGNING_ALGORITHM=' + options.algorithm);
    console.log('  CONTENT_SIGNING_KEY_ID=' + options.keyId);
    console.log('  CONTENT_SIGNING_KEY_DIR=' + options.dir);
    console.log('and list the key it replaces in CONTENT_SIGNING_VERIFY_KEY_IDS - see docs/content-signing.md.');
  }
}

try {
  main();
} catch (err) {
  console.error('content-keys: ' + err.message);
  process.exit(1);
}
