'use strict';

const crypto = require('crypto');
const fs = require('fs');

const keyProvider = require('../security/keyProvider');
const x509 = require('../utils/x509');

/**
 * HOW LONG UNTIL A CERTIFICATE MUST BE RENEWED, for the console's dashboard
 * card and the indicator in its header.
 *
 *   report()  { now, thresholds, certificates: [...], problems: [...] }
 *
 * one entry per certificate:
 *
 *   keyId        the content-signing key id, or null for a member CA
 *   role         'active'     the key that signs today
 *                'previous'   CONTENT_SIGNING_VERIFY_KEY_IDS - believed, never used to sign
 *                'member-ca'  a CA certificate the desktop certificate sign-in trusts
 *   algorithm    ECDSA-P256-SHA256 / RSA-PSS-SHA256 for a signing key; EC / RSA for a CA
 *   subject, subjectCN, issuer, issuerCN, selfSigned
 *   source       'key-dir' | 'p12' | 'member-ca-rsa' | 'member-ca-ecc'
 *   notBefore, notAfter   ISO 8601
 *   daysLeft     whole days until notAfter, counted at THIS request - negative once expired
 *   status       'ok' | 'warning' | 'critical' | 'expired'
 *   chainStatus  'verified'        openssl verify accepted it against CONTENT_SIGNING_CA_CHAIN
 *                'not-configured'  no chain is configured, so it was not checked
 *                'not-applicable'  a self-signed previous key beside a chain, or a member
 *                                  CA certificate, which IS the chain rather than something
 *                                  checked against it
 *                'failed'          a previous key's certificate no longer verifies (an
 *                                  active one that failed would have stopped startup)
 *   chainReason  openssl's reason when it failed, else null
 *
 * THE SIGNING CERTIFICATES ARE NOT READ AGAIN HERE. keyProvider described and
 * checked every one of them once, before the server listened, and holds the
 * answer; this only does the arithmetic on the dates against the clock of the
 * request. A page that asks on every load costs nothing, and the dates shown
 * are the dates the running server is signing under - not whatever has since
 * been copied over the file on disk, which the server will not use until it
 * restarts.
 *
 * NOTHING SECRET AND NO PATH LEAVES THIS FILE. Every field above is picked by
 * name out of what the provider holds - never spread from it, because the
 * provider's own descriptions carry the file each certificate came from, for
 * the startup log and the audit, and an object that is passed along whole is
 * one field away from carrying the private key too. A chain failure's reason
 * is openssl's sentence, and has anything shaped like a path taken out of it
 * before it goes, since openssl names the files it was given.
 *
 * THE MEMBER CA CHAINS ARE READ ONLY WHEN THE CERTIFICATE SIGN-IN IS ON
 * (X509_LOGIN), because a CA nobody signs in against has no expiry anybody
 * needs to watch. Nothing reads them at startup - the sign-in hands the file
 * to `openssl verify` on each attempt - so they are described on the first
 * request that wants them and remembered against the file's modification time
 * and size: openssl runs once per file, and again only when somebody replaces
 * the file, which the sign-in would pick up on its next attempt too. A chain
 * file that cannot be read is reported under `problems` by which chain it is,
 * not left out - an empty list would read as "nothing expires".
 */

const DAY = 24 * 3600 * 1000;

/*
 * THE THRESHOLDS, and why they are "fewer than" rather than "at most".
 *
 * WARNING IS keyProvider's 30 DAYS, THE SAME RULE, NOT A SECOND COPY OF IT.
 * Startup warns when the time left is less than 30 days, and whole days
 * counted down to the floor make that exactly `daysLeft < 30` - so the console
 * turns amber on the same day the server log starts saying so, and a reader
 * who sees one never has to wonder why the other is quiet. With "at most 30"
 * there would be a day on which the console warned and the log did not.
 *
 * CRITICAL IS THE LAST WEEK, by the same rule: fewer than 7 whole days. A
 * renewal is a storefront rebuild and deployment before the API can switch
 * (docs/content-signing.md, "Renewing a certificate"), and a week is about the
 * least that fits in.
 *
 * EXPIRED is anything past notAfter, which is the first negative daysLeft. The
 * running server keeps signing with it - the window is only checked at startup
 * - but it will refuse to start on its next restart.
 */
const WARNING_DAYS = keyProvider.EXPIRY_WARNING_DAYS;
const CRITICAL_DAYS = 7;

const ROLE = { ACTIVE: 'active', PREVIOUS: 'previous', MEMBER_CA: 'member-ca' };

/** Whole days from `now` to `notAfter`, rounded down: 0 on the last day, -1 from the first moment after. */
function daysLeft(notAfter, now) {
  return Math.floor((notAfter.getTime() - now.getTime()) / DAY);
}

function statusOf(days) {
  if (days < 0) return 'expired';
  if (days < CRITICAL_DAYS) return 'critical';
  if (days < WARNING_DAYS) return 'warning';
  return 'ok';
}

/*
 * "unable to get local issuer certificate" stays; "/secure/caChain.crt" or
 * "C:\keys\a.pem" inside it becomes [file]. A text search rather than a
 * promise - but openssl's verify reasons are fixed sentences, and the paths
 * in its output are the ones it was handed.
 */
function withoutPaths(text) {
  if (text === null || text === undefined) return null;
  return String(text).replace(/(?:[A-Za-z]:)?(?:[\\/][^\s\\/,;:'"()]+)+[\\/]?/g, '[file]');
}

/**
 * The dates and what they mean today, between the certificate's own fields
 * and its chain's - so a reply reads in the order a person asks: whose, until
 * when, and was it checked.
 */
function withDates(fields, chain, notBefore, notAfter, now) {
  const days = daysLeft(notAfter, now);
  return Object.assign({}, fields, {
    notBefore: notBefore ? notBefore.toISOString() : null,
    notAfter: notAfter.toISOString(),
    daysLeft: days,
    status: statusOf(days)
  }, chain);
}

/** One of keyProvider's certificates, as the console may see it. */
function signingEntry(certificate, now) {
  const chain = certificate.chain || {};

  return withDates({
    keyId: certificate.keyId,
    role: certificate.role === ROLE.ACTIVE ? ROLE.ACTIVE : ROLE.PREVIOUS,
    algorithm: certificate.algorithm,
    subject: certificate.subject || null,
    subjectCN: certificate.subjectCN || null,
    issuer: certificate.issuer || null,
    issuerCN: x509.commonNameOf(certificate.issuer),
    selfSigned: !!certificate.selfIssued,
    source: certificate.source === 'p12' ? 'p12' : 'key-dir'
  }, {
    chainStatus: chain.status || 'not-configured',
    chainReason: chain.status === 'failed' ? withoutPaths(chain.reason) : null
  }, certificate.notBefore, certificate.notAfter, now);
}

/* ------------------------------------------------------------------ */
/*  the member sign-in's CA chains                                     */
/* ------------------------------------------------------------------ */

/* file -> { stamp, described: [...] } or { stamp, problem } */
const chainCache = {};

function keyTypeOf(pem) {
  try {
    const type = crypto.createPublicKey(pem).asymmetricKeyType;
    return type === 'rsa' ? 'RSA' : (type === 'ec' ? 'EC' : String(type).toUpperCase());
  } catch (err) {
    return null;
  }
}

/** A chain file's certificates as openssl describes them, or { problem }. Cached by modification time and size. */
function describeChain(file, opensslBin) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch (err) {
    return { problem: 'unreadable' };
  }

  const stamp = stat.mtime.getTime() + ':' + stat.size;
  if (chainCache[file] && chainCache[file].stamp === stamp) return chainCache[file];

  let found;
  try {
    const pems = x509.certificatesIn(fs.readFileSync(file, 'utf8'));
    if (!pems.length) {
      found = { stamp: stamp, problem: 'no-certificates' };
    } else {
      const described = [];
      for (let i = 0; i < pems.length && !found; i += 1) {
        const result = x509.describeCertificateSync({ pem: pems[i] }, opensslBin);
        if (!result.ok || !result.certificate.notAfter) {
          /* openssl missing is not the file's fault, so it is not remembered against the file. */
          if (result.missing) return { problem: 'openssl-missing' };
          found = { stamp: stamp, problem: 'unreadable' };
        } else {
          described.push(Object.assign({ algorithm: keyTypeOf(pems[i]) }, result.certificate));
        }
      }
      if (!found) found = { stamp: stamp, described: described };
    }
  } catch (err) {
    found = { stamp: stamp, problem: 'unreadable' };
  }

  chainCache[file] = found;
  return found;
}

function memberCaEntries(settings, now) {
  const certificates = [];
  const problems = [];

  if (!settings || !settings.enabled) return { certificates: certificates, problems: problems };

  [['member-ca-rsa', settings.caRsaChain], ['member-ca-ecc', settings.caEccChain]].forEach(function (chain) {
    if (!chain[1]) return;

    const described = describeChain(chain[1], settings.openssl || 'openssl');
    if (described.problem) {
      problems.push({ source: chain[0], problem: described.problem });
      return;
    }

    described.described.forEach(function (certificate) {
      certificates.push(withDates({
        keyId: null,
        role: ROLE.MEMBER_CA,
        algorithm: certificate.algorithm,
        subject: certificate.subject || null,
        subjectCN: certificate.subjectCN || null,
        issuer: certificate.issuer || null,
        issuerCN: x509.commonNameOf(certificate.issuer),
        selfSigned: !!certificate.selfIssued,
        source: chain[0]
      }, {
        chainStatus: 'not-applicable',
        chainReason: null
      }, certificate.notBefore, certificate.notAfter, now));
    });
  });

  return { certificates: certificates, problems: problems };
}

/* ------------------------------------------------------------------ */

/**
 * The report. Everything is injectable for the tests:
 *
 *   options.keys  a key provider (default: the one the API started with)
 *   options.x509  config.x509's shape (default: config.x509)
 *   options.now   the clock (default: now)
 */
function report(options) {
  const opts = options || {};
  const now = opts.now || new Date();
  const keys = opts.keys || require('../security/signingService').assertReady();
  const memberSignIn = opts.x509 || require('../config').x509;

  const members = memberCaEntries(memberSignIn, now);

  return {
    now: now.toISOString(),
    thresholds: { warningDays: WARNING_DAYS, criticalDays: CRITICAL_DAYS },
    certificates: keys.certificates()
      .map(function (certificate) { return signingEntry(certificate, now); })
      .concat(members.certificates),
    problems: members.problems
  };
}

module.exports = {
  WARNING_DAYS: WARNING_DAYS,
  CRITICAL_DAYS: CRITICAL_DAYS,
  ROLE: ROLE,
  daysLeft: daysLeft,
  statusOf: statusOf,
  withoutPaths: withoutPaths,
  report: report
};
