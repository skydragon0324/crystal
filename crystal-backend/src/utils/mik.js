'use strict';

const crypto = require('crypto');

const config = require('../config');
const x509 = require('./x509');

/**
 * THE SIM'S CERTIFICATE, and what has to be true of it.
 *
 * A MIK certificate is an X.509 certificate, so almost nothing here is new:
 * utils/x509.js already verifies a chain, reads the subject and the policies,
 * and checks an ECDSA signature with SHA-384 - which is exactly the pair the
 * customised browser signs with. This file is only the part that is specific
 * to a CARD rather than to a person:
 *
 *   - it chains to the MIK authority, which is not the authority the desktop
 *     agent's personal certificates come from
 *   - the cid must be NAMED by the certificate, or a card could sign for a
 *     number that is not its own
 *   - the public key is read OUT of the certificate and stored; a client
 *     never sends one, because a client that could send its own public key
 *     could sign its own challenges
 *
 * EVERYTHING GOES THROUGH OPENSSL, as the rest of this project's certificate
 * handling does - not through `crypto.X509Certificate`, which would be the
 * obvious way and arrived in Node 15. This runs on Node 12, where that class
 * is undefined, and the failure would have been silent in the worst way: the
 * public key would come back null and every valid card would be refused for
 * the stated reason "bad key".
 *
 * WHAT IT DOES NOT DO is decide who is signing in. The certificate proves the
 * card; the user ID and password prove the member. See the note on the cid in
 * services/memberAuth.service.js for why those two are deliberately not tied
 * to one another.
 */

/** Configured enough to accept a card at all. */
function ready() {
  return !!(config.mik.enabled && config.mik.caChain);
}

/**
 * The certificate's public key, in PEM, read by OpenSSL.
 *
 * `-pubkey -noout` prints the key and nothing else. The certificate is given
 * on stdin, so a card that was only ever in memory needs no file on disk.
 */
function publicKeyOf(pem) {
  const result = x509.opensslSync(config.x509.openssl, ['x509', '-pubkey', '-noout'], { input: pem });
  if (result.missing || result.code !== 0) return null;

  const text = result.stdout.toString('utf8');
  const key = /-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----/.exec(text);
  return key ? key[0] : null;
}

/** What the certificate says about itself, for the audit trail. */
function describe(pem) {
  const described = x509.describeCertificateSync({ pem: pem }, config.x509.openssl);
  if (!described.ok) return { subject: null, serialNumber: null, notAfter: null };

  const serial = x509.opensslSync(config.x509.openssl, ['x509', '-serial', '-noout'], { input: pem });
  const serialText = serial.missing || serial.code !== 0
    ? ''
    : String(serial.stdout.toString('utf8')).replace(/^serial=/i, '').trim();

  return {
    subject: described.certificate.subject
      ? String(described.certificate.subject).slice(0, 255)
      : null,
    serialNumber: serialText ? serialText.slice(0, 64) : null,
    notAfter: described.certificate.notAfter || null
  };
}

/**
 * Whether the certificate names this cid.
 *
 * Deliberately a SUBSTRING of the whole subject rather than one attribute:
 * MIK profiles differ in which one carries the number - CN for some,
 * serialNumber or a UID for others - and a rule that demanded one of them
 * would refuse valid cards from every issuer that chose another. What it will
 * not allow is a certificate that does not mention the number at all.
 */
function namesCid(subjectText, cid) {
  if (!config.mik.requireCidInSubject) return true;

  const subject = String(subjectText || '');
  const value = String(cid || '').trim();
  return !!value && subject.indexOf(value) !== -1;
}

/**
 * The whole check, in the order a refusal is cheapest.
 *
 * Answers { ok: true, publicKey, subject, serialNumber, notAfter } or
 * { ok: false, reason } where reason is one of 'unavailable', 'ca', 'policy',
 * 'cid', 'key'. The reason goes to the log; the caller tells the browser one
 * thing, because which check failed is useful to somebody holding a stack of
 * cards and to nobody else.
 */
async function checkCard(pem, cid) {
  if (!ready()) return { ok: false, reason: 'unavailable' };

  /* The chain first: an untrusted certificate is not worth parsing. */
  const chained = x509.verifyChainSync({
    leafPem: pem,
    caFile: config.mik.caChain,
    openssl: config.x509.openssl
  });

  if (chained.missing) return { ok: false, reason: 'unavailable' };
  if (!chained.ok) return { ok: false, reason: 'ca' };

  const described = x509.describeCertificateSync({ pem: pem }, config.x509.openssl);
  if (!described.ok) return { ok: false, reason: described.missing ? 'unavailable' : 'ca' };

  /*
   * The policy check is skipped when no OIDs are configured, rather than run
   * against an empty allowlist - which nothing could ever satisfy, so every
   * card would be refused the moment the setting was left blank.
   */
  const allowed = config.mik.policyIds || [];
  if (allowed.length) {
    const text = x509.opensslSync(config.x509.openssl, ['x509', '-noout', '-text'], { input: pem });
    const policies = text.code === 0 ? x509.policiesOf(text.stdout.toString('utf8')) : [];
    if (!policies.some(function (oid) { return allowed.indexOf(oid) !== -1; })) {
      return { ok: false, reason: 'policy' };
    }
  }

  const details = describe(pem);
  if (!namesCid(details.subject || described.certificate.subject, cid)) {
    return { ok: false, reason: 'cid' };
  }

  const publicKey = publicKeyOf(pem);
  if (!publicKey) return { ok: false, reason: 'key' };

  return {
    ok: true,
    publicKey: publicKey,
    subject: details.subject,
    serialNumber: details.serialNumber,
    notAfter: details.notAfter
  };
}

/**
 * The text a card is asked to sign.
 *
 * The challenge AND the cid, joined, so a signature made for one card cannot
 * be presented as another's even if the same challenge were somehow reached.
 * The browser builds the same string; both sides have it written out once.
 */
function signedText(challenge, cid) {
  return String(challenge) + ':' + String(cid);
}

/**
 * The signature, verified against the key stored when the card registered -
 * never against a key that arrived with the request.
 *
 * ECDSA with SHA-384, which is what the browser's signing call produces and
 * what utils/x509.js already does for the desktop's ECC certificates.
 */
function verify(challenge, cid, signature, publicKeyPem) {
  return x509.verifySignature(signedText(challenge, cid), signature, publicKeyPem, 'ECDSA');
}

/** A challenge: 32 characters no card has been asked for before. */
function newChallenge() {
  return crypto.randomBytes(24).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
}

module.exports = {
  ready: ready,
  checkCard: checkCard,
  publicKeyOf: publicKeyOf,
  describe: describe,
  namesCid: namesCid,
  signedText: signedText,
  verify: verify,
  newChallenge: newChallenge
};
