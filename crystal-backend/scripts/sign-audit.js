'use strict';

/**
 * EVERY SIGNATURE, CHECKED AGAINST WHAT IS THERE NOW.
 *
 *   npm run sign:audit                      everything
 *   npm run sign:audit -- --type image      one content type (repeatable)
 *   npm run sign:audit -- --verbose         list the valid items too
 *   npm run sign:audit -- --dry-run         check, but record nothing
 *
 * Hashes every image from disk, rebuilds every notice's and FAQ's canonical
 * payload from the database, verifies each stored signature, and reports what
 * it found. Exits 1 when anything is INVALID or MISSING - the two findings
 * that mean a visitor would be shown something other than what was signed -
 * so it can gate a deployment or run from cron.
 *
 * It needs the same keys the API runs with (certificates for every key id it
 * should believe, and the .p12 and its password when the active key is one).
 * It begins with the active certificate - its subject, issuer, expiry and
 * chain status. See src/security/maintenance.js and docs/content-signing.md.
 *
 * IT WRITES ONE THING: each verdict, onto the signature row it is about
 * (content_signatures.audit_status, audit_reason, audited_at), which is what
 * the v_*_signatures views show. Never a signature, never content - fixing
 * what it finds is the backfill's job, and a person's. The API runs the same
 * audit every night (src/services/sweeps.service.js); --dry-run records
 * nothing, for when the database should not change.
 */

const db = require('../src/config/db');
const keyProvider = require('../src/security/keyProvider');
const maintenance = require('../src/security/maintenance');
const { assertReady } = require('../src/security/signingService');

const ORDER = ['invalid', 'missing', 'revoked-key', 'untrusted-key', 'unsigned', 'orphaned', 'valid-old-key', 'valid'];

const EXPLAIN = {
  invalid: 'INVALID - changed since it was signed (tampering, or a write that skipped signing)',
  missing: 'MISSING - a signed or referenced file is not on disk',
  'revoked-key': 'signed by a REVOKED key - shown as invalid until reviewed and re-signed',
  'untrusted-key': 'signed by a key id this server does not trust - a certificate not deployed?',
  unsigned: 'unsigned - nothing to verify against (npm run sign:backfill signs these)',
  orphaned: 'orphaned signature - the item it covered no longer exists',
  'valid-old-key': 'valid, signed by a previous key (npm run sign:backfill -- --rotate)',
  valid: 'valid'
};

function parseArgs(argv) {
  const out = { types: [], verbose: false, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--type') out.types = out.types.concat(String(argv[++i] || '').split(',').filter(Boolean));
    else if (argv[i] === '--verbose') out.verbose = true;
    else if (argv[i] === '--dry-run') out.dryRun = true;
    else throw new Error('unknown argument: ' + argv[i]);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const keys = assertReady();

  console.log('content signing audit - active key ' + keys.activeKeyId + ' (' + keys.algorithm.name + '), trusting ' +
    keys.trustedKeys().map(function (k) { return k.keyId; }).join(', ') +
    (keys.revokedKeyIds().length ? '; revoked ' + keys.revokedKeyIds().join(', ') : ''));

  /*
   * The active certificate as it was checked a moment ago, by the same code
   * the API runs at startup - so an audit from cron also notices a
   * certificate running out, or a chain that no longer verifies (which stops
   * the audit before it gets here, with the reason).
   */
  console.log('active certificate:');
  keyProvider.describeCertificate(keys.activeCertificate()).forEach(function (line) {
    console.log('  ' + line);
  });
  keys.trustedKeys().filter(function (k) { return !k.active; }).forEach(function (k) {
    console.log('  previous key ' + k.keyId + ': valid until ' + k.notAfter.toISOString() + ', chain ' + k.chain);
  });

  const report = await maintenance.auditAndRecord({ types: args.types, dryRun: args.dryRun });

  report.types.forEach(function (type) {
    const mine = report.findings.filter(function (f) { return f.type === type; });
    const counts = {};
    mine.forEach(function (f) { counts[f.status] = (counts[f.status] || 0) + 1; });

    console.log('\n' + type + ': ' + mine.length + ' item(s) - ' + ORDER
      .filter(function (status) { return counts[status]; })
      .map(function (status) { return counts[status] + ' ' + status; })
      .join(', '));

    ORDER.forEach(function (status) {
      if (!counts[status]) return;
      if ((status === 'valid' || status === 'valid-old-key') && !args.verbose) return;

      console.log('  ' + EXPLAIN[status] + ':');
      mine.filter(function (f) { return f.status === status; }).slice(0, args.verbose ? Infinity : 50)
        .forEach(function (f) {
          console.log('    ' + f.ref + (f.keyId ? '  [' + f.keyId + ']' : '') + (f.reason ? '  ' + f.reason : ''));
        });
      if (!args.verbose && counts[status] > 50) console.log('    ... and ' + (counts[status] - 50) + ' more (--verbose)');
    });
  });

  console.log('\n' + (args.dryRun
    ? 'dry run: no verdict recorded'
    : 'recorded ' + report.recorded + ' verdict(s) in content_signatures - see v_notice_signatures, v_faq_signatures, ' +
      'v_advert_signatures, v_product_image_signatures and v_image_signatures'));

  console.log((report.failed
    ? 'AUDIT FAILED: ' + (report.counts.invalid || 0) + ' invalid, ' + (report.counts.missing || 0) + ' missing'
    : 'audit clean: nothing invalid, nothing missing') +
    (report.counts.unsigned ? ' (' + report.counts.unsigned + ' unsigned)' : ''));

  return report.failed ? 1 : 0;
}

main()
  .then(async function (code) {
    await db.destroy();
    process.exit(code);
  })
  .catch(async function (err) {
    console.error('the audit could not run: ' + err.message);
    try { await db.destroy(); } catch (e) { /* shutting down */ }
    process.exit(2);
  });
