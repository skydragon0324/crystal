'use strict';

const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * THE CERTIFICATE CHECKS BEHIND THE DESKTOP SIGN-IN - the vendor's, made safe.
 *
 * vendor_backend/controllers/web/x509Controller.js is the specification: a
 * member's certificate arrives as base64 PEM, `openssl verify` checks it
 * against the issuing CA chain (RSA or ECC), `openssl x509 -text` gives the
 * certificate policy and the subject, the policy must be one of the personal
 * certificate policies, and the subject's CN is the member's user ID.
 *
 * TWO THINGS ARE DONE DIFFERENTLY, and neither changes the answer:
 *
 *   NO SHELL. The vendor builds `openssl verify -CAfile ${caPath} ${certPath}`
 *   as one string for execSync. Both paths are its own, so it is not
 *   injectable as written - but it is one edit away from being so. This passes
 *   an argument array to execFile, which never goes near a shell.
 *
 *   ANY LISTED POLICY, NOT THE FIRST ONE PRINTED. The vendor reads 24
 *   characters after the first "Policy: ". A certificate listing an unrelated
 *   policy first and a personal one second was refused, and a longer OID was
 *   cut off. Every policy on the certificate is read and one must match.
 */

/*
 * THE SAME CHECKS, FOR CRYSTAL'S OWN CERTIFICATES.
 *
 * The content-signing key (src/security/keyProvider.js) is described and
 * checked by openssl too: its subject, issuer and validity dates, whether it
 * is a CA, what it may be used for, and - when it comes from a CA - whether it
 * chains to that CA. Those checks run ONCE, BEFORE THE SERVER LISTENS, so they
 * are synchronous: a startup check that returns a promise is one nothing waits
 * for. The functions below are the synchronous half of this file, and the
 * only place `openssl x509 -text` is parsed - the sign-in above and the
 * signing key read the same Subject line with the same parser.
 *
 * Every one of them answers a result object rather than throwing, as
 * checkCertificate does: what a failure MEANS - a refused sign-in, a server
 * that will not start, a warning - is the caller's decision, not this file's.
 */

/**
 * Runs openssl and waits. Answers { code, stdout (a Buffer), stderr, missing }
 * and never throws on exit code.
 *
 * stdout stays a Buffer on purpose: for `openssl pkcs12 -nocerts` it holds a
 * private key, and a Buffer can be zeroed once the key has been loaded, where
 * a string would stay in the heap until the collector gets to it.
 *
 *   options.input    written to openssl's stdin
 *   options.env      the child's whole environment (default: this process's)
 *   options.timeout  milliseconds, default 10000
 */
function opensslSync(bin, args, options) {
  const opts = options || {};
  const result = childProcess.spawnSync(bin, args, {
    input: opts.input,
    env: opts.env,
    windowsHide: true,
    timeout: opts.timeout || 10000,
    maxBuffer: 16 * 1024 * 1024
  });

  if (result.error) {
    return {
      code: null,
      stdout: Buffer.alloc(0),
      stderr: result.error.message,
      missing: result.error.code === 'ENOENT'
    };
  }

  return {
    code: result.status,
    stdout: result.stdout || Buffer.alloc(0),
    stderr: String(result.stderr || ''),
    missing: false
  };
}

/**
 * The part of openssl's stderr a person can act on.
 *
 * OpenSSL 3 prints "100000000A000000:error:0680008E:asn1 encoding
 * routines:asn1_d2i_read_bio:not enough data:crypto/asn1/a_d2i_fp.c:270:",
 * which is "asn1 encoding routines: not enough data" with a thread id, a code,
 * a function and a source line around it. Anything not in that shape - "Mac
 * verify error: invalid password?" - is its own first line.
 */
function opensslReason(stderr) {
  const lines = String(stderr || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  if (!lines.length) return 'no reason given';

  const coded = lines
    .map(function (line) { return /^[0-9A-F]+:error:[0-9A-F]+:([^:]+):[^:]*:([^:]+):/.exec(line); })
    .filter(Boolean)[0];

  return coded ? coded[1] + ': ' + coded[2] : lines[0];
}

/** Every PEM certificate in a piece of openssl output, in order. */
function certificatesIn(text) {
  return String(text || '').match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
}

/** The value printed on the line after an extension's name in `x509 -text`, or null when absent. */
function extensionValue(text, name) {
  const match = new RegExp(name + ':[^\\r\\n]*\\r?\\n\\s*([^\\r\\n]+)').exec(text);
  return match ? match[1].trim() : null;
}

/**
 * What `openssl x509 -noout -text` says about a certificate:
 *
 *   subject, issuer      the lines as printed ("CN=content-key-v1, O=Crystal")
 *   subjectCN            the first CN, as the sign-in reads it
 *   notBefore, notAfter  Dates, or null when they could not be read
 *   selfIssued           subject and issuer are the same name
 *   isCA                 basicConstraints says CA:TRUE. An ABSENT
 *                        basicConstraints is not a CA (RFC 5280 4.2.1.9).
 *   keyUsage             ['Digital Signature', ...], or null when the
 *                        certificate carries no keyUsage extension
 *
 * "Not Before: Sep 16 10:00:00 2026 GMT" is a string Date parses.
 */
function parseCertificateText(text) {
  const body = String(text || '');

  const line = function (label) {
    const found = body.split(/\r?\n/).filter(function (l) { return new RegExp('^\\s*' + label + ':').test(l); })[0];
    return found ? found.replace(new RegExp('^\\s*' + label + ':\\s*'), '').trim() : null;
  };

  const date = function (label) {
    const match = new RegExp(label + '\\s*:\\s*(.+)').exec(body);
    const parsed = match ? new Date(match[1].trim()) : null;
    return parsed && !isNaN(parsed.getTime()) ? parsed : null;
  };

  const subject = line('Subject');
  const issuer = line('Issuer');
  const constraints = extensionValue(body, 'X509v3 Basic Constraints');
  const usage = extensionValue(body, 'X509v3 Key Usage');

  return {
    subject: subject,
    subjectCN: subjectCommonName(body),
    issuer: issuer,
    notBefore: date('Not Before'),
    notAfter: date('Not After'),
    selfIssued: !!subject && subject === issuer,
    isCA: !!constraints && /\bCA:TRUE\b/.test(constraints),
    keyUsage: usage ? usage.split(',').map(function (u) { return u.trim(); }).filter(Boolean) : null
  };
}

/**
 * Describes one certificate: `source` is { file } or { pem } (given on stdin,
 * so a certificate that is only in memory needs no file).
 *
 * Answers { ok: true, certificate } or { ok: false, missing, reason }.
 */
function describeCertificateSync(source, bin) {
  const args = ['x509', '-noout', '-text'];
  if (source.file) args.push('-in', source.file);

  const result = opensslSync(bin, args, { input: source.file ? undefined : source.pem });
  if (result.missing) return { ok: false, missing: true, reason: 'openssl was not found' };
  if (result.code !== 0) return { ok: false, missing: false, reason: opensslReason(result.stderr) };

  return { ok: true, certificate: parseCertificateText(result.stdout.toString('utf8')) };
}

/**
 * `openssl verify -CAfile <caFile> [-untrusted <intermediates>] <leaf>`.
 *
 *   options.leafFile or options.leafPem   the certificate being checked
 *   options.caFile                        the trusted chain, as configured
 *   options.untrustedPem                  intermediates that came WITH the
 *                                         certificate (a .p12's bundle) -
 *                                         usable to build a path, never
 *                                         trusted on their own
 *   options.at                            a Date to check validity at, for
 *                                         tests; default now
 *   options.ignoreTime                    do not check validity at all
 *                                         (a previous key's certificate)
 *   options.openssl                       the binary
 *
 * THE TEMPORARY FILES HOLD PUBLIC CERTIFICATES AND NOTHING ELSE - the leaf
 * when it is only in memory, and the bundled intermediates - and are removed
 * in `finally`, whatever openssl did.
 *
 * Answers { ok: true } or { ok: false, missing, reason }, where reason is
 * openssl's own ("certificate has expired", "unable to get local issuer
 * certificate").
 */
function verifyChainSync(options) {
  const temporary = [];

  try {
    let leaf = options.leafFile;
    if (!leaf) {
      const written = tempFile(options.leafPem);
      temporary.push(written);
      leaf = written.file;
    }

    const args = ['verify', '-CAfile', options.caFile];

    if (options.untrustedPem) {
      const bundle = tempFile(options.untrustedPem);
      temporary.push(bundle);
      args.push('-untrusted', bundle.file);
    }

    if (options.ignoreTime) args.push('-no_check_time');
    else if (options.at) args.push('-attime', String(Math.floor(options.at.getTime() / 1000)));

    args.push(leaf);

    const result = opensslSync(options.openssl, args);
    if (result.missing) return { ok: false, missing: true, reason: 'openssl was not found' };

    const output = result.stdout.toString('utf8') + '\n' + result.stderr;
    if (result.code === 0 && /: OK\s*$/m.test(output)) return { ok: true };

    const lookup = /error \d+ at \d+ depth lookup:\s*([^\r\n]+)/.exec(output);
    return { ok: false, missing: false, reason: lookup ? lookup[1].trim() : opensslReason(result.stderr) };
  } finally {
    temporary.forEach(function (t) { t.remove(); });
  }
}

/** Runs openssl; resolves { code, stdout, stderr } and never rejects on exit code. */
function openssl(bin, args) {
  return new Promise(function (resolve) {
    childProcess.execFile(bin, args, { windowsHide: true, timeout: 10000 }, function (err, stdout, stderr) {
      resolve({
        code: err ? (typeof err.code === 'number' ? err.code : 1) : 0,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        missing: !!(err && err.code === 'ENOENT')
      });
    });
  });
}

/** A temporary file holding `contents`, and the function that removes it. */
function tempFile(contents) {
  const file = path.join(os.tmpdir(), 'crystal-x509-' + crypto.randomBytes(8).toString('hex') + '.pem');
  fs.writeFileSync(file, contents);
  return {
    file: file,
    remove: function () {
      try { fs.unlinkSync(file); } catch (e) { /* already gone */ }
    }
  };
}

/** Every OID printed after "Policy:" in `openssl x509 -text`. */
function policiesOf(text) {
  const found = [];
  const re = /Policy:\s*([0-9]+(?:\.[0-9]+)+)/g;
  let match = re.exec(text);
  while (match) {
    found.push(match[1]);
    match = re.exec(text);
  }
  return found;
}

/**
 * The FIRST CN on the Subject line of `openssl x509 -text`.
 *
 * "Subject: CN = iron, CN = Members, O = ..." (OpenSSL 1.1+) or
 * "Subject: CN=iron, CN=Members" (older). First in the order the certificate
 * lists them, which is what the vendor reads - its certificates carry two CNs
 * and the user ID is the first. An escaped comma ("Li\, Ming") is part of the
 * value, not a separator.
 */
function subjectCommonName(text) {
  const line = String(text).split(/\r?\n/).filter(function (l) { return /^\s*Subject:/.test(l); })[0];
  if (!line) return null;

  return commonNameOf(line.replace(/^\s*Subject:\s*/, ''));
}

/**
 * The first CN in a distinguished name as openssl prints it - "CN = iron,
 * O = Crystal" - or null. The body of subjectCommonName, on its own so an
 * ISSUER line (which parseCertificateText keeps as text) is read by the same
 * rules rather than by a second, subtly different split on commas.
 */
function commonNameOf(name) {
  const body = String(name || '');
  const parts = [];
  let current = '';

  for (let i = 0; i < body.length; i += 1) {
    const ch = body.charAt(i);
    if (ch === '\\' && i + 1 < body.length) {
      current += body.charAt(i + 1);
      i += 1;
    } else if (ch === ',') {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);

  const cn = parts
    .map(function (part) { return part.trim(); })
    .filter(function (part) { return /^CN\s*=/.test(part); })
    .map(function (part) { return part.replace(/^CN\s*=\s*/, '').trim(); })
    .filter(Boolean)[0];

  return cn || null;
}

/**
 * Check a certificate the way the vendor does.
 *
 * Resolves { ok: true, userId } or { ok: false, reason } where reason is one
 * of: 'unavailable' (openssl missing or not configured), 'ca', 'policy', 'cn'.
 * The reason is for the log; the member is told one thing.
 */
async function checkCertificate(pem, certType, settings) {
  const chain = certType === 'ECDSA' ? settings.caEccChain : settings.caRsaChain;
  if (!chain) return { ok: false, reason: 'unavailable' };

  const tmp = tempFile(pem);
  try {
    const verified = await openssl(settings.openssl, ['verify', '-CAfile', chain, tmp.file]);
    if (verified.missing) return { ok: false, reason: 'unavailable' };
    if (verified.code !== 0 || verified.stdout.indexOf(': OK') === -1) return { ok: false, reason: 'ca' };

    const described = await openssl(settings.openssl, ['x509', '-in', tmp.file, '-noout', '-text']);
    if (described.code !== 0) return { ok: false, reason: 'ca' };

    const allowed = settings.policyIds || [];
    const policies = policiesOf(described.stdout);
    if (!policies.some(function (oid) { return allowed.indexOf(oid) !== -1; })) {
      return { ok: false, reason: 'policy' };
    }

    const userId = subjectCommonName(described.stdout);
    if (!userId) return { ok: false, reason: 'cn' };

    return { ok: true, userId: userId };
  } finally {
    tmp.remove();
  }
}

/**
 * The member's signature over what the browser says it signed.
 *
 * SHA-256 for an RSA certificate and SHA-384 for an ECC one, as the vendor
 * pairs them. Any error - a malformed PEM, a signature that is not base64 -
 * is a failed verification, not an exception.
 */
function verifySignature(plainData, signData, pem, certType) {
  try {
    const verifier = crypto.createVerify(certType === 'ECDSA' ? 'SHA384' : 'SHA256');
    verifier.update(String(plainData));
    return verifier.verify(pem, String(signData), 'base64');
  } catch (err) {
    return false;
  }
}

/** The server's signature over the challenge, which the local agent checks. */
function signChallenge(plain, keyPem) {
  const signer = crypto.createSign('SHA384');
  signer.update(plain);
  return signer.sign(keyPem, 'base64');
}

module.exports = {
  checkCertificate: checkCertificate,
  verifySignature: verifySignature,
  signChallenge: signChallenge,
  policiesOf: policiesOf,
  subjectCommonName: subjectCommonName,
  commonNameOf: commonNameOf,
  opensslSync: opensslSync,
  opensslReason: opensslReason,
  certificatesIn: certificatesIn,
  parseCertificateText: parseCertificateText,
  describeCertificateSync: describeCertificateSync,
  verifyChainSync: verifyChainSync
};
