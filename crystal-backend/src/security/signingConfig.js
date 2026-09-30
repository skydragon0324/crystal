'use strict';

const path = require('path');
const util = require('util');
const algorithms = require('./algorithms');

/**
 * WHICH KEY SIGNS, WITH WHAT, AND WHICH OTHERS ARE STILL BELIEVED.
 *
 *   CONTENT_SIGNING_ALGORITHM=ECDSA              ECDSA | RSA, and nothing else
 *   CONTENT_SIGNING_KEY_ID=content-key-v1         the ACTIVE key; new signatures use it
 *
 * and the active key comes from ONE of two places:
 *
 *   CONTENT_SIGNING_P12=/secure/content-signing.p12   a PKCS#12 file holding the private
 *   CONTENT_SIGNING_P12_PASSWORD=...                  key and its certificate, and the
 *   CONTENT_SIGNING_CA_CHAIN=/secure/caChain.crt      CA chain the certificate must verify against
 *
 *   CONTENT_SIGNING_KEY_DIR=/secure/content-keys  <keyId>.key.pem and <keyId>.crt.pem
 *
 * with, either way,
 *
 *   CONTENT_SIGNING_VERIFY_KEY_IDS=content-key-v0 previous keys, certificates only, from KEY_DIR
 *   CONTENT_SIGNING_REVOKED_KEY_IDS=              never accepted, even if listed above
 *
 * config/index.js reads the strings (it is the one place process.env is
 * read); this file decides what they mean, and refuses what they cannot mean.
 * It takes them as arguments rather than reaching for the config itself so the
 * tests can hand it every bad combination without touching the environment.
 *
 * THERE IS NO FALLBACK ALGORITHM. `ECDSA`, `RSA`, and a startup error naming
 * the value for anything else - `ecdsa`, `RSA-PSS`, an empty string beside a
 * key id. A signing system that quietly picked something when it was told
 * nonsense is one whose configuration nobody can reason about, and the first
 * sign would be a storefront showing every item as invalid.
 *
 * NOR IS THERE A FALLBACK SOURCE. With CONTENT_SIGNING_P12 set, the active key
 * comes from that file or the server does not start; a private key that
 * happens to be lying in the key directory is not tried instead. The
 * algorithm and the key id stay REQUIRED beside a .p12: the key id is the name
 * the storefront pins the key under, and a name read out of a certificate -
 * which the CA chose, and which a renewal keeps - is not one anybody chose.
 * The configured algorithm must match the key found in the file (keyProvider
 * checks), so a .p12 swapped for one of the other type stops the server
 * rather than changing the algorithm behind the configuration's back.
 *
 * THE DEVELOPMENT DEFAULT IS A LOCATION, NOT AN ALGORITHM. With NODE_ENV not
 * production and NONE of the variables set, the key is content-key-dev, ECDSA,
 * in crystal-backend/.content-keys/ - the directory `npm run content-keys`
 * writes. Setting any one of them opts out of that entirely and the required
 * ones must all be given, because half a configuration mixed with half a
 * default is a key from one place and an algorithm from another. In production
 * an empty configuration is an error: a server that signs with a key nobody
 * chose is not a server anybody should trust.
 *
 * THE CA CHAIN, AND WHEN IT IS REQUIRED.
 *
 *   .p12, production     REQUIRED. A .p12 is how a certificate arrives from a
 *                        CA, and "it chains to our CA" is the one thing about
 *                        it an operator can check before it signs anything.
 *                        A production server that skipped the check because a
 *                        variable was forgotten is the failure this prevents.
 *   .p12, development    optional. Checked when given; when not, startup says
 *                        the chain was not checked.
 *   key directory        optional, IN PRODUCTION TOO. The key directory holds
 *                        the self-signed certificates `npm run content-keys`
 *                        makes, and a self-signed certificate chains to
 *                        nothing - requiring a CA there would make operators
 *                        invent one to satisfy a check that proves nothing
 *                        about it. Its trust is, and always was, the key the
 *                        storefront pins. An operator who DOES keep a
 *                        CA-issued certificate and key as PEM files there sets
 *                        the chain and gets exactly the checks a .p12 gets.
 *                        The honest cost: nothing forces a production
 *                        key-directory deployment through a CA, so one that
 *                        should have been is not caught here.
 *
 * WHAT THE CHAIN IS NOT. The storefront never sees it: it pins one public key
 * at build time, exactly as before. The chain is checked here at startup, by
 * the audit, and by `npm run content-keys -- --from-p12` before it prints a
 * pin - so a certificate that fails it is never pinned and never signs.
 */

const DEV_KEY_ID = 'content-key-dev';
const DEV_ALGORITHM = 'ECDSA';
const DEV_DIR_NAME = '.content-keys';

/*
 * A key id is also a FILE NAME, so it is held to characters that cannot
 * climb out of the key directory or mean something to a shell: no slash, no
 * dot at the start, nothing but letters, digits, dot, dash and underscore.
 * 64 is the width of content_signatures.key_id.
 */
const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

class SigningConfigError extends Error {
  constructor(message) {
    super('content signing is misconfigured: ' + message);
    this.name = 'SigningConfigError';
  }
}

function isKeyId(value) {
  return typeof value === 'string' && KEY_ID.test(value);
}

function idList(name, value) {
  const ids = String(value || '')
    .split(',')
    .map(function (item) { return item.trim(); })
    .filter(Boolean);

  ids.forEach(function (id) {
    if (!isKeyId(id)) throw new SigningConfigError(name + ' contains "' + id + '", which is not a valid key id');
  });

  return ids.filter(function (id, index) { return ids.indexOf(id) === index; });
}

/**
 * The .p12 setting: { file }, with the password beside it but NOT ENUMERABLE.
 *
 * A settings object is exactly the kind of thing somebody logs while chasing a
 * startup problem - `console.log(settings)`, a JSON dump in an error report -
 * and the password must not ride along. It is readable as `.password` by the
 * one module that opens the file, and invisible to JSON.stringify,
 * Object.keys, Object.assign and util.inspect. That is a guard against
 * accidents, not against code that goes looking: anything that can read this
 * object can read process.env.
 */
function p12Setting(file, password) {
  const setting = { file: file };
  Object.defineProperty(setting, 'password', { value: password, enumerable: false });
  Object.defineProperty(setting, util.inspect.custom, {
    value: function () { return { file: file, password: '[not shown]' }; },
    enumerable: false
  });
  return setting;
}

/**
 * The raw strings, resolved into settings or refused.
 *
 *   raw       { algorithm, keyId, keyDir, verifyKeyIds, revokedKeyIds,
 *               p12, p12Password, caChain } - '' (or absent) when unset
 *   context   { isProduction, rootDir }
 *
 * Answers { algorithm (the implementation), algorithmConfig, keyId,
 * source ('p12' | 'key-dir'), p12 ({ file, password } or null), caChain (a
 * path or null), keyDir (a path, or null beside a .p12 that needs none),
 * verifyKeyIds, revokedKeyIds, developmentDefault }.
 */
function resolve(raw, context) {
  const input = raw || {};
  const ctx = context || {};
  const rootDir = ctx.rootDir || process.cwd();
  const given = function (value) { return typeof value === 'string' && value.trim() !== ''; };
  const pathOf = function (value) {
    const trimmed = value.trim();
    return path.isAbsolute(trimmed) ? trimmed : path.resolve(rootDir, trimmed);
  };

  const anySet = [input.algorithm, input.keyId, input.keyDir, input.verifyKeyIds, input.revokedKeyIds,
    input.p12, input.p12Password, input.caChain].some(given);

  if (!anySet) {
    if (ctx.isProduction) {
      throw new SigningConfigError(
        'CONTENT_SIGNING_ALGORITHM and CONTENT_SIGNING_KEY_ID must be set in production, with the key from ' +
        'CONTENT_SIGNING_P12 (plus CONTENT_SIGNING_P12_PASSWORD and CONTENT_SIGNING_CA_CHAIN) or from ' +
        'CONTENT_SIGNING_KEY_DIR. The development key location is never used there. See docs/content-signing.md.'
      );
    }

    return {
      algorithm: algorithms.byConfig(DEV_ALGORITHM),
      algorithmConfig: DEV_ALGORITHM,
      keyId: DEV_KEY_ID,
      source: 'key-dir',
      p12: null,
      caChain: null,
      keyDir: path.join(rootDir, DEV_DIR_NAME),
      verifyKeyIds: [],
      revokedKeyIds: [],
      developmentDefault: true
    };
  }

  const usesP12 = given(input.p12);

  if (!usesP12 && given(input.p12Password)) {
    throw new SigningConfigError('CONTENT_SIGNING_P12_PASSWORD is set but CONTENT_SIGNING_P12 is not. A password ' +
      'with no file to open is half of a configuration - set the .p12, or remove the password.');
  }

  const required = usesP12
    ? [
      ['CONTENT_SIGNING_ALGORITHM', input.algorithm],
      ['CONTENT_SIGNING_KEY_ID', input.keyId],
      ['CONTENT_SIGNING_P12_PASSWORD', input.p12Password]
    ]
    : [
      ['CONTENT_SIGNING_ALGORITHM', input.algorithm],
      ['CONTENT_SIGNING_KEY_ID', input.keyId],
      ['CONTENT_SIGNING_KEY_DIR', input.keyDir]
    ];

  const missing = required
    .filter(function (entry) { return !given(entry[1]); })
    .map(function (entry) { return entry[0]; });

  if (missing.length) {
    throw new SigningConfigError(
      missing.join(', ') + (missing.length === 1 ? ' is' : ' are') + ' not set. ' + (usesP12
        ? 'With CONTENT_SIGNING_P12 the algorithm, the key id and the .p12 password must all be given - the key ' +
          'id is chosen, never read out of the certificate, and a .p12 without a password is not accepted.'
        : 'Once any CONTENT_SIGNING_* variable is given, the algorithm, the key id and the key directory (or a ' +
          '.p12) must all be.')
    );
  }

  const algorithmConfig = input.algorithm.trim();
  const algorithm = algorithms.byConfig(algorithmConfig);
  if (!algorithm) {
    throw new SigningConfigError(
      'CONTENT_SIGNING_ALGORITHM is "' + algorithmConfig + '"; it must be exactly one of ' +
      algorithms.CONFIG_VALUES.join(' or ') + '. There is no fallback algorithm.'
    );
  }

  const keyId = input.keyId.trim();
  if (!isKeyId(keyId)) {
    throw new SigningConfigError('CONTENT_SIGNING_KEY_ID "' + keyId + '" is not a valid key id ' +
      '(letters, digits, ".", "-" and "_", at most 64, not starting with punctuation)');
  }

  const verifyKeyIds = idList('CONTENT_SIGNING_VERIFY_KEY_IDS', input.verifyKeyIds);
  const revokedKeyIds = idList('CONTENT_SIGNING_REVOKED_KEY_IDS', input.revokedKeyIds);

  if (revokedKeyIds.indexOf(keyId) !== -1) {
    throw new SigningConfigError('the active key "' + keyId + '" is listed in CONTENT_SIGNING_REVOKED_KEY_IDS. ' +
      'A revoked key must not sign anything - rotate to a new key id first.');
  }

  /* The active key verifies too; listing it again changes nothing. A revoked id wins over a listing. */
  const believed = verifyKeyIds.filter(function (id) {
    return id !== keyId && revokedKeyIds.indexOf(id) === -1;
  });

  if (usesP12 && believed.length && !given(input.keyDir)) {
    throw new SigningConfigError('CONTENT_SIGNING_VERIFY_KEY_IDS names ' + believed.join(', ') + ', whose ' +
      'certificates are read from CONTENT_SIGNING_KEY_DIR, and that is not set. A .p12 holds the active key only.');
  }

  if (usesP12 && ctx.isProduction && !given(input.caChain)) {
    throw new SigningConfigError('CONTENT_SIGNING_CA_CHAIN is not set. In production a signing key from a .p12 ' +
      'is checked against the CA chain that issued it before it signs anything, and there is no skipping that.');
  }

  return {
    algorithm: algorithm,
    algorithmConfig: algorithmConfig,
    keyId: keyId,
    source: usesP12 ? 'p12' : 'key-dir',
    p12: usesP12 ? p12Setting(pathOf(input.p12), input.p12Password) : null,
    caChain: given(input.caChain) ? pathOf(input.caChain) : null,
    keyDir: given(input.keyDir) ? pathOf(input.keyDir) : null,
    verifyKeyIds: believed,
    revokedKeyIds: revokedKeyIds,
    developmentDefault: false
  };
}

/** The settings for this process, from config/index.js. */
function fromConfig() {
  const config = require('../config');
  return resolve(config.contentSigning, { isProduction: config.isProduction, rootDir: config.rootDir });
}

module.exports = {
  DEV_KEY_ID: DEV_KEY_ID,
  DEV_ALGORITHM: DEV_ALGORITHM,
  DEV_DIR_NAME: DEV_DIR_NAME,
  KEY_ID: KEY_ID,
  SigningConfigError: SigningConfigError,
  isKeyId: isKeyId,
  p12Setting: p12Setting,
  resolve: resolve,
  fromConfig: fromConfig
};
