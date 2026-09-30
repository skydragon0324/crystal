'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const algorithms = require('./algorithms');
const spki = require('./algorithms/spki');
const signingConfig = require('./signingConfig');
const x509 = require('../utils/x509');

const { SigningConfigError } = signingConfig;

/**
 * THE SIGNING IDENTITIES: one private key that signs, and the certificates
 * that are believed.
 *
 * The ACTIVE key comes from one of two places (signingConfig decides which):
 *
 *   a .p12        CONTENT_SIGNING_P12 - a PKCS#12 file holding the private
 *                 key, its certificate and usually the CA certificates that
 *                 issued it, protected by CONTENT_SIGNING_P12_PASSWORD
 *
 *   a key dir     CONTENT_SIGNING_KEY_DIR, with two files beside each other:
 *                   <keyId>.key.pem   the private key - the ACTIVE key only
 *                   <keyId>.crt.pem   an X.509 certificate for its public key
 *
 * and PREVIOUS keys, believed for verification only, are always certificates
 * in the key directory.
 *
 * EVERYTHING IS CHECKED ONCE, AT STARTUP, and a failure stops the server with
 * a sentence naming the problem:
 *
 *   the private key and the certificate both load
 *   the certificate's public key IS the private key's public key - the check
 *     that catches a certificate copied in from the wrong key pair, which
 *     would otherwise sign happily and verify nowhere
 *   the key is the kind the configured algorithm needs - EC P-256 for ECDSA,
 *     RSA of 3072 bits or more for RSA
 *   a SELF-SIGNED certificate's subject CN is the key id, so a certificate
 *     `npm run content-keys` made cannot be filed under another id
 *   the certificate is inside its validity window, and a warning when it
 *     leaves it within 30 days
 *   for a certificate from a CA - always for a .p12, and for a key-directory
 *     certificate once CONTENT_SIGNING_CA_CHAIN is set - it is not itself a
 *     CA, its keyUsage (when it has one) allows digital signatures, and
 *     `openssl verify` accepts it against the configured chain
 *
 * WHAT THE CHAIN PROVES HERE, AND WHAT IT DOES NOT. The storefront pins the
 * public KEY at build time (REACT_APP_CONTENT_SIGNING_KEYS), and that pin is
 * the trust - it does not change with a .p12, and no browser ever sees the
 * chain. The chain is checked where a person can still act on the answer:
 * here, before the server listens; in the audit; and in `npm run content-keys
 * -- --from-p12`, which refuses to print a pin for a certificate that fails
 * it. So "this key belongs to a certificate our CA issued, for signing, and
 * still valid" is established before the key is pinned and re-established
 * every time the API starts - but a stolen key keeps verifying in browsers
 * until its pin is removed, CA or no CA. Revocation is the key id list, not a
 * CRL: nothing here fetches one.
 *
 * WHY openssl. Node 12 will take a public key OUT of a certificate
 * (`createPublicKey` accepts one) but has no X509Certificate class to read
 * its subject, dates or extensions - that arrived in 15.6 - and cannot open a
 * PKCS#12 file as a key at all (only as a TLS context, which never hands the
 * key back). utils/x509.js runs openssl safely - an argument array, never a
 * shell - and holds the one parser for what it prints. This runs it
 * synchronously, because it runs once before the server listens and a
 * startup check that returns a promise is one nothing waits for.
 *
 * VERIFICATION-ONLY KEYS - CONTENT_SIGNING_VERIFY_KEY_IDS - need only their
 * certificate. Their algorithm is read from the key in it, never from
 * configuration. An expired verification certificate, or a CA-issued one that
 * no longer verifies against the chain, is a WARNING rather than an error:
 * the content it signed was signed while it was valid, and the way to stop
 * believing a key is to revoke it, which is explicit.
 */

const EXPIRY_WARNING_DAYS = 30;
const DAY = 24 * 3600 * 1000;

/*
 * The name the .p12 password travels under, in openssl's environment and
 * nowhere else. Not CONTENT_SIGNING_P12_PASSWORD itself: the child is given
 * the password it was handed, whether or not this process's own environment
 * holds one (the tests and `content-keys --from-p12` open files the
 * configuration never named).
 */
const PASSIN_VARIABLE = 'CRYSTAL_CONTENT_SIGNING_P12_PASSIN';

function fileFor(dir, keyId, kind) {
  return path.join(dir, keyId + (kind === 'key' ? '.key.pem' : '.crt.pem'));
}

function readFile(file, what) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new SigningConfigError('the ' + what + ' at ' + file + ' could not be read: ' + err.message);
  }
}

function opensslNotFound(opensslBin) {
  return new SigningConfigError('openssl was not found (OPENSSL_BIN="' + opensslBin + '"). It is needed to read ' +
    'the signing certificate\'s subject, validity and chain, and to open a .p12 - Node 12 cannot. Install it or ' +
    'set OPENSSL_BIN.');
}

function spkiDer(key) {
  return key.export({ type: 'spki', format: 'der' });
}

/**
 * What openssl says about a certificate - see x509.parseCertificateText.
 * `source` is a file path, or { pem } for a certificate only in memory.
 */
function inspectCertificate(source, opensslBin) {
  const from = typeof source === 'string' ? { file: source } : source;
  const described = x509.describeCertificateSync(from, opensslBin);

  if (described.missing) throw opensslNotFound(opensslBin);
  if (!described.ok) {
    throw new SigningConfigError('openssl could not read the certificate' + (from.file ? ' at ' + from.file : '') +
      ': ' + described.reason);
  }
  return described.certificate;
}

function checkFileMode(file, what, strict, warn) {
  /* Windows has no group or other bits to speak of; its ACLs are the deployment's business. */
  if (process.platform === 'win32') return;

  const mode = fs.statSync(file).mode & 0o777;
  if (mode & 0o077) {
    const message = what + ' ' + file + ' is readable by others (mode ' + mode.toString(8) + '); it should be 600';
    if (strict) throw new SigningConfigError(message);
    warn(message);
  }
}

/* ------------------------------------------------------------------ */
/*  the certificate checks                                             */
/* ------------------------------------------------------------------ */

/**
 * Every check a signing certificate gets, in one place - startup, the audit
 * and `content-keys --from-p12` all come through here.
 *
 *   options.role              'active' (it signs: every failure is an error)
 *                             or 'verify' (a previous key: time and chain
 *                             failures are warnings)
 *   options.keyId
 *   options.source            { file } or { pem }
 *   options.label             how messages name it ("the certificate at ...")
 *   options.caChain           the chain file, or null
 *   options.intermediatesPem  certificates that came with it (a .p12's) -
 *                             they help build the path, and are never trusted
 *   options.pki               apply the end-entity checks (not a CA, keyUsage)
 *   options.requireCommonName a self-signed certificate's CN must be the key id
 *   options.openssl, now, warn, inspectCertificate
 *
 * Answers { subject, subjectCN, issuer, notBefore, notAfter, selfIssued,
 * isCA, keyUsage, chain: { status, caChain, reason } }, where status is
 * 'verified', 'not-configured', 'not-applicable' (a self-signed previous key)
 * or 'failed' (a previous key only - an active one throws).
 *
 * THE ORDER IS THE ORDER OF USEFUL MESSAGES. An expired certificate also fails
 * `openssl verify`, but "expired on 2026-01-01" is the sentence to act on, so
 * the dates are read first and the chain last.
 */
function checkCertificate(options) {
  const opts = options || {};
  const warn = opts.warn || function () {};
  const now = opts.now || new Date();
  const active = opts.role === 'active';
  const label = opts.label;
  const keyId = opts.keyId;
  const opensslBin = opts.openssl || 'openssl';
  const inspect = opts.inspectCertificate || inspectCertificate;

  const described = inspect(opts.source.file || { pem: opts.source.pem }, opensslBin);

  if (!described.notBefore || !described.notAfter) {
    throw new SigningConfigError('the validity dates of ' + label + ' could not be read');
  }

  /*
   * Only a SELF-SIGNED certificate is held to CN = key id. Those are the ones
   * this project makes, with the key id as the name on purpose. A CA writes
   * its own subject - and keeps it across a renewal, which here is a new key
   * id - so for a CA-issued certificate the key id is the name the operator
   * configured, and the chain is what is checked about the certificate.
   */
  if (opts.requireCommonName && described.selfIssued && described.subjectCN !== keyId) {
    throw new SigningConfigError(label + ' was issued to CN="' + described.subjectCN +
      '", not to the key id "' + keyId + '"');
  }

  const outside = now < described.notBefore
    ? 'is not valid until ' + described.notBefore.toISOString()
    : (now > described.notAfter ? 'expired on ' + described.notAfter.toISOString() : null);

  if (outside) {
    if (active) throw new SigningConfigError('the certificate for the active key "' + keyId + '" ' + outside);
    warn('the verification certificate for "' + keyId + '" ' + outside +
      ' - content it signed still verifies; revoke the key id to stop believing it');
  } else if (active && described.notAfter.getTime() - now.getTime() < EXPIRY_WARNING_DAYS * DAY) {
    const days = Math.floor((described.notAfter.getTime() - now.getTime()) / DAY);
    warn('the certificate for the active key "' + keyId + '" expires on ' + described.notAfter.toISOString() +
      ' (' + (days > 0 ? 'in ' + days + ' day' + (days === 1 ? '' : 's') : 'within a day') + '). Renew it before ' +
      'then: a renewed certificate is a NEW key id, pinned in the storefront and deployed before the API switches ' +
      'to it - docs/content-signing.md, "Renewing a certificate".');
  }

  if (active && opts.pki) {
    if (described.isCA) {
      throw new SigningConfigError(label + ' is a CA certificate (basicConstraints CA:TRUE). Content is signed ' +
        'with an end-entity certificate the CA issued, never with the CA\'s own - a CA key that signs web content ' +
        'is a CA key kept on a web server.');
    }
    if (described.keyUsage && described.keyUsage.indexOf('Digital Signature') === -1) {
      throw new SigningConfigError(label + ' is not for signatures: its keyUsage is "' +
        described.keyUsage.join(', ') + '", without Digital Signature');
    }
  }

  let chain = { status: 'not-configured', caChain: null, reason: null };

  if (opts.caChain) {
    if (!active && described.selfIssued) {
      /* A previous key from before the CA - its trust is its pin, as it always was. */
      chain = { status: 'not-applicable', caChain: opts.caChain, reason: 'self-signed' };
    } else {
      if (!fs.existsSync(opts.caChain)) {
        throw new SigningConfigError('CONTENT_SIGNING_CA_CHAIN is ' + opts.caChain + ', which does not exist');
      }

      const verified = x509.verifyChainSync({
        leafFile: opts.source.file,
        leafPem: opts.source.pem,
        caFile: opts.caChain,
        untrustedPem: opts.intermediatesPem || null,
        at: opts.now || null,
        /* A previous key's certificate may have expired; that is the time check's warning, not the chain's. */
        ignoreTime: !active,
        openssl: opensslBin
      });

      if (verified.missing) throw opensslNotFound(opensslBin);

      if (verified.ok) {
        chain = { status: 'verified', caChain: opts.caChain, reason: null };
      } else if (active) {
        throw new SigningConfigError(label + ' does not verify against the CA chain ' + opts.caChain +
          ': ' + verified.reason);
      } else {
        chain = { status: 'failed', caChain: opts.caChain, reason: verified.reason };
        warn('the verification certificate for "' + keyId + '" does not verify against the CA chain ' +
          opts.caChain + ' (' + verified.reason + ') - content it signed still verifies; revoke the key id to ' +
          'stop believing it');
      }
    }
  }

  return Object.assign({}, described, { chain: chain });
}

function identityOf(keyId, algorithm, publicKey, privateKey, certificate, where) {
  return {
    keyId: keyId,
    algorithm: algorithm,
    publicKey: publicKey,
    privateKey: privateKey,
    spki: spki.spkiBase64(publicKey),
    subject: certificate.subjectCN,
    notBefore: certificate.notBefore,
    notAfter: certificate.notAfter,
    certificate: {
      source: where.source,
      file: where.file,
      legacy: !!where.legacy,
      subject: certificate.subject,
      subjectCN: certificate.subjectCN,
      issuer: certificate.issuer,
      selfIssued: certificate.selfIssued,
      notBefore: certificate.notBefore,
      notAfter: certificate.notAfter,
      chain: certificate.chain
    }
  };
}

function algorithmFor(publicKey, configured, what) {
  if (configured) {
    const problem = configured.keyProblem(publicKey);
    if (problem) {
      throw new SigningConfigError(what + ' ' + problem + ' (CONTENT_SIGNING_ALGORITHM=' + configured.config + ')');
    }
    return configured;
  }

  const found = algorithms.forPublicKey(publicKey);
  if (!found) {
    throw new SigningConfigError(what + ' is neither EC P-256 nor RSA of ' + algorithms.rsa.MIN_BITS + ' bits or more');
  }
  return found;
}

/* ------------------------------------------------------------------ */
/*  a key directory identity                                           */
/* ------------------------------------------------------------------ */

/**
 * One key-directory identity, loaded and checked.
 *
 *   options.requirePrivate  load and match the private key (the active key)
 *   options.algorithm       the implementation the key must suit, or null to
 *                           take it from the key (verification keys)
 *   options.caChain         the chain the certificate must verify against
 *                           (active: an error; verification: a warning)
 */
function loadIdentity(dir, keyId, options) {
  const opts = options || {};
  const warn = opts.warn || function () {};

  const certFile = fileFor(dir, keyId, 'crt');
  const certPem = readFile(certFile, 'certificate');
  let privateKey = null;

  if (opts.requirePrivate) {
    const keyFile = fileFor(dir, keyId, 'key');
    const keyPem = readFile(keyFile, 'private key');

    if (keyPem === null) {
      throw new SigningConfigError('there is no private key for "' + keyId + '" at ' + keyFile + '.' +
        (opts.developmentDefault
          ? ' This is the development key location: run `npm run content-keys` in crystal-backend to create one.'
          : ''));
    }

    try {
      privateKey = crypto.createPrivateKey(keyPem);
    } catch (err) {
      throw new SigningConfigError('the private key at ' + keyFile + ' could not be loaded ' +
        '(an unencrypted PEM is expected): ' + err.message);
    }

    checkFileMode(keyFile, 'the private key', opts.strictFileMode, warn);
  }

  if (certPem === null) {
    throw new SigningConfigError('there is no certificate for "' + keyId + '" at ' + certFile + '.' +
      (opts.developmentDefault ? ' Run `npm run content-keys` in crystal-backend to create one.' : ''));
  }

  let publicKey;
  try {
    publicKey = crypto.createPublicKey(certPem);
  } catch (err) {
    throw new SigningConfigError('the certificate at ' + certFile + ' could not be loaded: ' + err.message);
  }

  if (privateKey && !spkiDer(crypto.createPublicKey(privateKey)).equals(spkiDer(publicKey))) {
    throw new SigningConfigError('the certificate for "' + keyId + '" is not for its private key - ' +
      'the two files are from different key pairs');
  }

  const algorithm = opts.algorithm
    ? algorithmFor(publicKey, opts.algorithm, 'the key "' + keyId + '"')
    : algorithmFor(publicKey, null, 'the certificate for "' + keyId + '" holds a key that');

  const certificate = checkCertificate({
    role: opts.requirePrivate ? 'active' : 'verify',
    keyId: keyId,
    source: { file: certFile },
    label: 'the certificate at ' + certFile,
    caChain: opts.caChain || null,
    /* A self-signed key-directory certificate chains to nothing; the end-entity checks come with a chain. */
    pki: !!opts.caChain,
    requireCommonName: true,
    openssl: opts.openssl,
    now: opts.now,
    warn: warn,
    inspectCertificate: opts.inspectCertificate
  });

  return identityOf(keyId, algorithm, publicKey, privateKey, certificate, { source: 'key-dir', file: certFile });
}

/* ------------------------------------------------------------------ */
/*  a .p12 identity                                                    */
/* ------------------------------------------------------------------ */

/*
 * HOW THE PASSWORD TRAVELS, AND WHERE THE KEY LIVES.
 *
 * The password reaches openssl as `-passin env:CRYSTAL_CONTENT_SIGNING_P12_PASSIN`
 * - the NAME of a variable on the command line, the value only in the child's
 * environment. A command line is readable by every user on the machine (`ps`,
 * Task Manager); a process's environment only by the same user and root, who
 * can read .env anyway. It is never written to a file, and no message built
 * here contains it - openssl's own errors never echo it, and nothing here
 * interpolates it.
 *
 * The private key comes back on openssl's STDOUT (`-nocerts -nodes`, which
 * decrypts it) and never touches the disk, not even as a temporary file. The
 * PEM is cut out of the Buffer by position and handed to createPrivateKey
 * without ever becoming a string, and the Buffer is zeroed as soon as the
 * KeyObject exists. The honest limits: the key passed through a pipe and
 * through openssl's memory, and OpenSSL and V8 keep their own copies of a
 * loaded key for as long as the process runs. Zeroing shortens how long a
 * decrypted copy lies about in memory we control; it cannot promise more.
 *
 * Only certificates - public by definition - are ever written to temporary
 * files, for `openssl verify`.
 *
 * LEGACY FILES. OpenSSL 1.x and older Windows exports protect a .p12 with
 * RC2-40 (certificates) and 3DES (key), and OpenSSL 3 moved RC2, RC4 and
 * single DES into its "legacy provider", which is not loaded by default. Such
 * a file fails with "unsupported" on the first attempt; that failure - and
 * only that one - is retried with `-legacy`. If the retry fails too, the error
 * says so and says what to do: install the provider, or re-export the file.
 * A wrong password is reported as one on either attempt, because the MAC is
 * checked before any decryption.
 */

const WRONG_PASSWORD = /mac verify (error|failure)|invalid password/i;
const UNSUPPORTED = /unsupported/i;

function wipe(buffer) {
  if (Buffer.isBuffer(buffer)) buffer.fill(0);
}

function runPkcs12(file, password, args, legacy, opensslBin) {
  const env = Object.assign({}, process.env);
  env[PASSIN_VARIABLE] = password;

  return x509.opensslSync(opensslBin, ['pkcs12', '-in', file]
    .concat(args)
    .concat(legacy ? ['-legacy'] : [])
    .concat(['-passin', 'env:' + PASSIN_VARIABLE]),
  { env: env, timeout: 30000 });
}

function cannotOpen(file, why) {
  return new SigningConfigError('could not open the .p12 at ' + file + ' - wrong password or damaged file (' + why + ')');
}

/** One `openssl pkcs12` read, with the legacy retry. Answers stdout (a Buffer) or throws. */
function readP12(file, password, args, state, opensslBin) {
  const first = runPkcs12(file, password, args, state.legacy, opensslBin);
  if (first.missing) throw opensslNotFound(opensslBin);
  if (first.code === 0) return first.stdout;
  wipe(first.stdout);

  /* No exit code at all is openssl not finishing (a timeout), which is neither a password nor a file problem. */
  if (first.code === null) {
    throw new SigningConfigError('openssl did not finish opening the .p12 at ' + file + ': ' + first.stderr);
  }

  if (WRONG_PASSWORD.test(first.stderr)) {
    throw cannotOpen(file, 'its integrity check failed, which is what a wrong password looks like');
  }

  if (!state.legacy && UNSUPPORTED.test(first.stderr)) {
    const retried = runPkcs12(file, password, args, true, opensslBin);
    if (retried.code === 0) {
      state.legacy = true;
      return retried.stdout;
    }
    wipe(retried.stdout);

    if (WRONG_PASSWORD.test(retried.stderr)) {
      throw cannotOpen(file, 'its integrity check failed, which is what a wrong password looks like');
    }

    throw new SigningConfigError('the .p12 at ' + file + ' is protected with legacy algorithms (RC2-40, RC4 or ' +
      'single DES, as OpenSSL 1.x and older Windows exports wrote), which OpenSSL 3 opens only with its legacy ' +
      'provider - and ' + (/unable to load provider/i.test(retried.stderr)
      ? 'this openssl (' + opensslBin + ') could not load the legacy provider'
      : 'the retry with -legacy failed too (' + x509.opensslReason(retried.stderr) + ')') +
      '. The file needs the legacy provider (an openssl built with it, or OPENSSL_MODULES pointing at its ' +
      'modules) or, better, a re-export with modern encryption: docs/content-signing.md, "Re-exporting a legacy .p12".');
  }

  throw cannotOpen(file, 'openssl: ' + x509.opensslReason(first.stderr));
}

/** [{ start, end }] of every "-----BEGIN ...PRIVATE KEY-----" block, found without making a string of the key. */
function privateKeyBlocks(buffer) {
  const blocks = [];
  const BEGIN = '-----BEGIN ';
  let at = buffer.indexOf(BEGIN);

  while (at !== -1) {
    const labelEnd = buffer.indexOf('-----', at + BEGIN.length);
    if (labelEnd === -1) break;

    const label = buffer.toString('latin1', at + BEGIN.length, labelEnd);
    const footer = '-----END ' + label + '-----';
    const end = buffer.indexOf(footer, labelEnd);
    if (end === -1) break;

    if (/PRIVATE KEY$/.test(label)) blocks.push({ start: at, end: end + footer.length });
    at = buffer.indexOf(BEGIN, end + footer.length);
  }

  return blocks;
}

/**
 * Opens a .p12: { privateKey (a KeyObject), certificatePem, intermediatesPem,
 * bundled (how many CA certificates came with it), legacy }.
 *
 * Three reads, as openssl separates them: the private key (-nocerts -nodes),
 * the certificate that belongs to it (-clcerts, the one carrying the key's
 * localKeyID) and the CA certificates bundled beside it (-cacerts). Exactly
 * one key and one certificate for it, or the file is refused - a .p12 with
 * two keys is a file somebody should look at, not one to pick from.
 */
function loadP12(file, password, options) {
  const opts = options || {};
  const opensslBin = opts.openssl || 'openssl';
  const state = { legacy: false };

  const keyOutput = readP12(file, password, ['-nocerts', '-nodes'], state, opensslBin);
  let privateKey;

  try {
    const blocks = privateKeyBlocks(keyOutput);
    if (blocks.length !== 1) {
      throw new SigningConfigError('the .p12 at ' + file + ' holds ' +
        (blocks.length ? blocks.length + ' private keys' : 'no private key') + '; it must hold exactly one');
    }

    try {
      privateKey = crypto.createPrivateKey(keyOutput.slice(blocks[0].start, blocks[0].end));
    } catch (err) {
      throw new SigningConfigError('the private key in the .p12 at ' + file + ' could not be loaded: ' + err.message);
    }
  } finally {
    wipe(keyOutput);
  }

  const leaf = x509.certificatesIn(readP12(file, password, ['-clcerts', '-nokeys'], state, opensslBin).toString('utf8'));
  if (leaf.length !== 1) {
    throw new SigningConfigError('the .p12 at ' + file + ' holds ' +
      (leaf.length ? leaf.length + ' certificates' : 'no certificate') + ' for its key; it must hold exactly one');
  }

  const bundled = x509.certificatesIn(readP12(file, password, ['-cacerts', '-nokeys'], state, opensslBin).toString('utf8'));

  if (state.legacy && opts.warn) {
    opts.warn('the .p12 at ' + file + ' uses legacy encryption and was opened with openssl\'s legacy provider. ' +
      'Re-export it with modern encryption: docs/content-signing.md, "Re-exporting a legacy .p12".');
  }

  return {
    privateKey: privateKey,
    certificatePem: leaf[0],
    intermediatesPem: bundled.length ? bundled.join('\n') + '\n' : '',
    bundled: bundled.length,
    legacy: state.legacy
  };
}

/**
 * The active identity from a .p12, loaded and checked.
 *
 *   p12                  { file, password } (signingConfig's setting)
 *   options.algorithm    the implementation the key must suit; null takes it
 *                        from the key (the setup tool, which prints it)
 *   options.caChain      the chain to verify against, or null (development)
 *   options.openssl, now, warn, inspectCertificate
 */
function loadP12Identity(p12, keyId, options) {
  const opts = options || {};
  const warn = opts.warn || function () {};
  const file = p12.file;

  if (!fs.existsSync(file)) throw new SigningConfigError('there is no .p12 at ' + file + ' (CONTENT_SIGNING_P12)');

  /* Encrypted, so a warning rather than the error an open private key file is - but still a file to keep private. */
  checkFileMode(file, 'the .p12', false, warn);

  const opened = loadP12(file, p12.password, { openssl: opts.openssl, warn: warn });

  let publicKey;
  try {
    publicKey = crypto.createPublicKey(opened.certificatePem);
  } catch (err) {
    throw new SigningConfigError('the certificate in the .p12 at ' + file + ' could not be loaded: ' + err.message);
  }

  if (!spkiDer(crypto.createPublicKey(opened.privateKey)).equals(spkiDer(publicKey))) {
    throw new SigningConfigError('the certificate in the .p12 at ' + file + ' is not for the private key beside ' +
      'it - the two are from different key pairs');
  }

  const algorithm = algorithmFor(publicKey, opts.algorithm || null, 'the key in the .p12 at ' + file);

  const certificate = checkCertificate({
    role: 'active',
    keyId: keyId,
    source: { pem: opened.certificatePem },
    label: 'the certificate in the .p12 at ' + file,
    caChain: opts.caChain || null,
    intermediatesPem: opened.intermediatesPem,
    pki: true,
    requireCommonName: false,
    openssl: opts.openssl,
    now: opts.now,
    warn: warn,
    inspectCertificate: opts.inspectCertificate
  });

  return identityOf(keyId, algorithm, publicKey, opened.privateKey, certificate, {
    source: 'p12',
    file: file,
    legacy: opened.legacy
  });
}

/**
 * ONE KEY ID, ONE KEY, FROM ONE PLACE. With the active key in a .p12 and a key
 * directory also configured (for previous keys), the directory must not hold
 * a second private key under the active id, nor a certificate under it for a
 * DIFFERENT key - the first is two sources for one key, and the second is a
 * key id given a new key, which leaves everything signed under the old one
 * unverifiable by a storefront that still pins that id.
 */
function refuseSecondCopy(dir, identity) {
  const keyFile = fileFor(dir, identity.keyId, 'key');
  if (fs.existsSync(keyFile)) {
    throw new SigningConfigError('the active key "' + identity.keyId + '" comes from CONTENT_SIGNING_P12, and ' +
      'CONTENT_SIGNING_KEY_DIR holds a private key under the same id (' + keyFile + '). One key id is one key from ' +
      'one place: remove that file, or give the .p12 a key id of its own.');
  }

  const certFile = fileFor(dir, identity.keyId, 'crt');
  const certPem = readFile(certFile, 'certificate');
  if (certPem === null) return;

  let other;
  try {
    other = crypto.createPublicKey(certPem);
  } catch (err) {
    throw new SigningConfigError('the certificate at ' + certFile + ' could not be loaded: ' + err.message);
  }

  if (!spkiDer(other).equals(spkiDer(identity.publicKey))) {
    throw new SigningConfigError('CONTENT_SIGNING_KEY_DIR holds a certificate for "' + identity.keyId + '" (' +
      certFile + ') for a different key than the .p12. A key id is never given a new key - a renewed or replaced ' +
      'certificate gets a new key id (docs/content-signing.md, "Renewing a certificate").');
  }
}

/* ------------------------------------------------------------------ */
/*  the provider                                                       */
/* ------------------------------------------------------------------ */

/**
 * The provider for resolved settings (see signingConfig.resolve).
 *
 *   options.openssl             the openssl binary
 *   options.strictFileMode      refuse a group/world readable private key
 *   options.warn                fn(message)
 *   options.now                 the clock the validity window is read against
 *   options.inspectCertificate  replaces the openssl description - tests only
 */
function createKeyProvider(settings, options) {
  const opts = Object.assign({ warn: function () {} }, options || {});
  const caChain = settings.caChain || null;

  let active;
  if (settings.p12) {
    active = loadP12Identity(settings.p12, settings.keyId, Object.assign({}, opts, {
      algorithm: settings.algorithm,
      caChain: caChain
    }));
    if (settings.keyDir) refuseSecondCopy(settings.keyDir, active);
  } else {
    active = loadIdentity(settings.keyDir, settings.keyId, Object.assign({}, opts, {
      requirePrivate: true,
      algorithm: settings.algorithm,
      developmentDefault: settings.developmentDefault,
      caChain: caChain
    }));
  }

  const trusted = {};
  trusted[active.keyId] = active;

  settings.verifyKeyIds.forEach(function (keyId) {
    trusted[keyId] = loadIdentity(settings.keyDir, keyId, Object.assign({}, opts, {
      requirePrivate: false,
      algorithm: null,
      caChain: caChain
    }));
  });

  const revoked = settings.revokedKeyIds.slice();

  function publicView(identity) {
    return {
      keyId: identity.keyId,
      algorithm: identity.algorithm,
      publicKey: identity.publicKey,
      revoked: false,
      active: identity.keyId === active.keyId
    };
  }

  return {
    activeKeyId: active.keyId,
    algorithm: active.algorithm,
    developmentDefault: !!settings.developmentDefault,
    source: settings.p12 ? 'p12' : 'key-dir',
    keyDir: settings.keyDir,
    caChain: caChain,

    /** What signs. The private key leaves this module only to be handed to crypto.sign. */
    active: function () {
      return {
        keyId: active.keyId,
        algorithm: active.algorithm,
        privateKey: active.privateKey,
        publicKey: active.publicKey
      };
    },

    /** The active certificate as checked at load: subject, issuer, dates, where it came from, chain status. */
    activeCertificate: function () {
      return Object.assign({ keyId: active.keyId, algorithm: active.algorithm.name }, active.certificate);
    },

    /**
     * Every believed certificate as checked at load, in activeCertificate()'s
     * shape plus a `role` - 'active' first, then each 'previous' key in the
     * order CONTENT_SIGNING_VERIFY_KEY_IDS lists them.
     *
     * The order is built rather than read off `trusted`, because a key id may
     * be all digits and an object hands integer-like keys back sorted ahead of
     * everything else - which would put a previous key above the one that signs.
     *
     * Nothing here runs openssl: these are the descriptions startup already
     * paid for, which is what lets the console ask on every page load. They
     * still carry the file each came from, as activeCertificate() does, for the
     * scripts that print it; anything that shows them to a browser picks its
     * fields rather than passing this on (services/certificates.service.js).
     */
    certificates: function () {
      return [active.keyId].concat(settings.verifyKeyIds).map(function (keyId) {
        const identity = trusted[keyId];
        return Object.assign({
          keyId: keyId,
          algorithm: identity.algorithm.name,
          role: keyId === active.keyId ? 'active' : 'previous'
        }, identity.certificate);
      });
    },

    /**
     * A trusted key by id: { keyId, algorithm, publicKey, revoked, active },
     * or null for an id nobody configured. A REVOKED id answers
     * { revoked: true } whether or not a certificate for it is loaded, so a
     * revocation cannot be undone by also listing the key for verification.
     */
    resolve: function (keyId) {
      if (typeof keyId !== 'string') return null;
      if (revoked.indexOf(keyId) !== -1) return { keyId: keyId, algorithm: null, publicKey: null, revoked: true, active: false };
      return Object.prototype.hasOwnProperty.call(trusted, keyId) ? publicView(trusted[keyId]) : null;
    },

    isRevoked: function (keyId) {
      return revoked.indexOf(keyId) !== -1;
    },

    /** Every believed key, public halves only - for the audit, the scripts and the storefront pin. */
    trustedKeys: function () {
      return Object.keys(trusted).map(function (keyId) {
        const identity = trusted[keyId];
        return {
          keyId: keyId,
          algorithm: identity.algorithm.name,
          spki: identity.spki,
          active: keyId === active.keyId,
          notBefore: identity.notBefore,
          notAfter: identity.notAfter,
          chain: identity.certificate.chain.status
        };
      });
    },

    revokedKeyIds: function () {
      return revoked.slice();
    }
  };
}

/**
 * A certificate as lines for a person - startup, the audit and the setup tool
 * print the same description. `certificate` is activeCertificate()'s answer.
 */
function describeCertificate(certificate, now) {
  const clock = now || new Date();
  const days = Math.floor((certificate.notAfter.getTime() - clock.getTime()) / DAY);
  const chain = certificate.chain;

  const chainText = {
    verified: 'verified against ' + chain.caChain,
    'not-configured': 'not checked - no CA chain configured (CONTENT_SIGNING_CA_CHAIN)',
    'not-applicable': 'not applicable - a self-signed certificate',
    failed: 'FAILED against ' + chain.caChain + ': ' + chain.reason
  }[chain.status] || chain.status;

  return [
    'subject  ' + certificate.subject,
    'issuer   ' + certificate.issuer + (certificate.selfIssued ? ' (self-signed)' : ''),
    'valid    ' + certificate.notBefore.toISOString() + ' to ' + certificate.notAfter.toISOString() +
      (days >= 0 ? ' (' + days + ' days left)' : ' (EXPIRED)'),
    'from     ' + (certificate.source === 'p12'
      ? '.p12 ' + certificate.file + (certificate.legacy ? ' (legacy encryption - re-export it)' : '')
      : 'key directory ' + certificate.file),
    'chain    ' + chainText
  ];
}

/** The provider this process runs with, from config. Throws SigningConfigError. */
function fromConfig() {
  const config = require('../config');
  const settings = signingConfig.fromConfig();

  return createKeyProvider(settings, {
    openssl: config.x509.openssl,
    strictFileMode: config.isProduction,
    warn: function (message) { console.warn('content signing: ' + message); }
  });
}

module.exports = {
  EXPIRY_WARNING_DAYS: EXPIRY_WARNING_DAYS,
  PASSIN_VARIABLE: PASSIN_VARIABLE,
  fileFor: fileFor,
  inspectCertificate: inspectCertificate,
  checkCertificate: checkCertificate,
  loadIdentity: loadIdentity,
  loadP12: loadP12,
  loadP12Identity: loadP12Identity,
  createKeyProvider: createKeyProvider,
  describeCertificate: describeCertificate,
  fromConfig: fromConfig
};
