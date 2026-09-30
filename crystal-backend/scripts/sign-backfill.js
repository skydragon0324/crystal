'use strict';

/**
 * SIGNS WHAT HAS NO SIGNATURE.
 *
 *   npm run sign:backfill                          every unsigned item
 *   npm run sign:backfill -- --type faq            one content type (repeatable)
 *   npm run sign:backfill -- --dry-run             say what would be signed
 *   npm run sign:backfill -- --rotate              also re-sign items signed by a
 *                                                  previous key whose signature
 *                                                  still verifies
 *   npm run sign:backfill -- --force-resign --type notification --ref 12
 *                                                  re-sign ONE reviewed item as it is now
 *   npm run sign:backfill -- --force-resign        re-sign EVERYTHING as it is now
 *
 * An item whose signature FAILS is never re-signed by the plain backfill or by
 * --rotate. That is what the audit is for, and a backfill that repaired it
 * would put a valid signature on exactly the change somebody needs to look at.
 *
 * --force-resign trusts the database and the upload directory AS THEY STAND.
 * It is the tool for after a key compromise (when the old signatures prove
 * nothing) and for one item a person has reviewed; it is never routine. The
 * script says so before it writes anything.
 *
 * RUN IT ONCE when signing is introduced, and after `npm run seed` /
 * `npm run mock:images` on a development machine. On a live site, read the
 * audit's "unsigned" list before running it: an unsigned file nobody uploaded
 * through the console is a file this would sign.
 */

const db = require('../src/config/db');
const maintenance = require('../src/security/maintenance');
const { assertReady } = require('../src/security/signingService');

function parseArgs(argv) {
  const out = { types: [], refs: [], rotate: false, forceResign: false, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--type') out.types = out.types.concat(String(argv[++i] || '').split(',').filter(Boolean));
    else if (arg === '--ref') out.refs.push(String(argv[++i] || ''));
    else if (arg === '--rotate') out.rotate = true;
    else if (arg === '--force-resign') out.forceResign = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else throw new Error('unknown argument: ' + arg);
  }
  if (out.rotate && out.forceResign) throw new Error('--rotate and --force-resign are different acts; choose one');
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const keys = assertReady();

  console.log('signing with ' + keys.activeKeyId + ' (' + keys.algorithm.name + ')' + (args.dryRun ? ' - DRY RUN, nothing is written' : ''));

  if (args.forceResign) {
    console.log('');
    console.log('!!! --force-resign: every selected item is re-signed AS IT IS NOW, whether or not its');
    console.log('!!! current signature verifies. Anything changed behind the application\'s back will');
    console.log('!!! come out of this with a VALID signature. Only do this after reviewing the audit.');
    console.log('');
  }

  const result = await maintenance.backfill(args);

  const byType = {};
  result.signed.forEach(function (f) { byType[f.type] = (byType[f.type] || 0) + 1; });

  console.log((args.dryRun ? 'would sign ' : 'signed ') + result.signed.length + ' item(s)' +
    (result.signed.length ? ': ' + Object.keys(byType).map(function (t) { return byType[t] + ' ' + t; }).join(', ') : ''));

  result.signed.slice(0, 20).forEach(function (f) {
    console.log('  ' + f.type + ' ' + f.ref + '  (was ' + f.status + ')');
  });
  if (result.signed.length > 20) console.log('  ... and ' + (result.signed.length - 20) + ' more');

  if (result.skipped.length) {
    console.log('\nNOT signed - these need a person, not a backfill:');
    result.skipped.forEach(function (f) {
      console.log('  ' + f.type + ' ' + f.ref + '  ' + f.status + (f.reason ? ' - ' + f.reason : ''));
    });
    console.log('Review them (npm run sign:audit), then --force-resign --type <type> --ref <ref> for each one you accept.');
  }
}

main()
  .then(async function () {
    await db.destroy();
  })
  .catch(async function (err) {
    console.error('the backfill could not run: ' + err.message);
    try { await db.destroy(); } catch (e) { /* shutting down */ }
    process.exit(1);
  });
