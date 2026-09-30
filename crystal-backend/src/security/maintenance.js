'use strict';

const config = require('../config');
const inventory = require('./inventory');
const signingService = require('./signingService');

const { STATUS } = signingService;

/**
 * THE AUDIT AND THE BACKFILL, as functions - scripts/sign-audit.js and
 * scripts/sign-backfill.js print what these answer, and the seeds call the
 * backfill directly.
 *
 * THE AUDIT RECOMPUTES EVERYTHING. Every image is hashed from the disk as it
 * is now and every text item's canonical payload is rebuilt from the database
 * as it is now, and each is verified against its stored signature. It is the
 * check that does not depend on a browser: the storefront only ever verifies
 * what a visitor happens to open, and anybody who can edit a row can also
 * choose never to open it.
 *
 * AND IT WRITES DOWN WHAT IT FOUND. `auditAndRecord` - what the script and the
 * nightly sweep both run - puts each verdict on the signature row it is about
 * (audit_status, audit_reason, audited_at), which is what lets the
 * v_*_signatures views show a person with a SQL client whether a row still
 * holds: a view cannot verify a signature itself. See sql/deltas/030.
 *
 * THE BACKFILL SIGNS WHAT HAS NO SIGNATURE, and nothing else. It never
 * re-signs an item whose signature fails - that is precisely what the audit
 * exists to surface, and a backfill that "fixed" it would erase the evidence
 * with a valid signature. Two explicit modes go further:
 *
 *   rotate        re-sign items signed by a key OTHER than the active one,
 *                 ONLY where that old signature still verifies against the
 *                 current content. Rotation moves trust forward; it never
 *                 launders a change made while the old key was in charge.
 *
 *   forceResign   re-sign what is there NOW, whether or not its signature
 *                 verifies. For after a key compromise, when old signatures
 *                 prove nothing - or for one reviewed item, narrowed with
 *                 `types` and `refs`. It trusts the database and the disk as
 *                 they stand, and the script says so loudly.
 */

const TYPES = ['notification', 'faq', 'image'];

function handles(options) {
  return {
    db: options.db || require('../config/db'),
    service: options.service || signingService.service(),
    uploadDir: options.uploadDir || config.storage.uploadDir
  };
}

async function itemsOf(type, h, signatureRows) {
  if (type === 'notification') return inventory.notifications(h.db);
  if (type === 'faq') return inventory.faqs(h.db);
  return inventory.images(h.db, h.uploadDir, signatureRows.map(function (row) { return row.content_ref; }));
}

function wantedTypes(options) {
  const types = options.types && options.types.length ? options.types : TYPES;
  types.forEach(function (type) {
    if (TYPES.indexOf(type) === -1) throw new Error('unknown content type: ' + type);
  });
  return types;
}

/**
 * Every item of the wanted types, classified.
 *
 * Answers { types, counts, findings } where each finding is
 * { type, ref, status, reason, keyId, checkedAt } and status is one of
 *
 *   valid           signed and matching, by the active key
 *   valid-old-key   signed and matching, by a trusted key that is not active
 *   unsigned        nothing to verify against
 *   invalid         the content, the file or the stored signature changed
 *   missing         a signed or referenced file is not on disk
 *   revoked-key     signed by a key id that has been revoked
 *   untrusted-key   signed by a key id this server does not believe
 *   orphaned        a signature for a row that no longer exists
 *
 * `failed` is true when anything is invalid or missing - the two that mean
 * the thing a visitor would be shown is not the thing that was signed.
 *
 * `checkedAt` is taken BEFORE a type's signatures and items are read, from
 * `options.clock` (the tests move it) or the API's clock - the same clock
 * signed_at comes from. Early rather than late on purpose: a row edited while
 * the audit ran then reads as edited after it, never as audited after the
 * edit.
 */
async function audit(options) {
  const opts = options || {};
  const h = handles(opts);
  const store = opts.store || require('../repositories/contentSignatures.repository');
  const clock = opts.clock || function () { return new Date(); };
  const findings = [];

  const types = wantedTypes(opts);

  for (let t = 0; t < types.length; t += 1) {
    const type = types[t];
    const checkedAt = clock();
    // eslint-disable-next-line no-await-in-loop
    const signatureRows = await store.ofType(type, h.db);
    const byRef = {};
    signatureRows.forEach(function (row) { byRef[row.content_ref] = row; });

    // eslint-disable-next-line no-await-in-loop
    const items = await itemsOf(type, h, signatureRows);
    const seen = {};

    items.forEach(function (item) {
      seen[item.ref] = true;
      const row = byRef[item.ref] || null;
      const base = { type: type, ref: item.ref, keyId: row ? row.key_id : null, row: row, item: item, checkedAt: checkedAt };

      if (!item.content) {
        if (item.problem === 'missing') {
          findings.push(Object.assign(base, { status: 'missing', reason: row ? 'signed, but the file is gone' : 'referenced, but the file is gone' }));
        } else if (row) {
          findings.push(Object.assign(base, { status: STATUS.INVALID, reason: item.problem }));
        } else if (item.problem !== 'bad-key') {
          findings.push(Object.assign(base, { status: STATUS.UNSIGNED, reason: item.problem }));
        }
        return;
      }

      const checked = h.service.checkRow(type, item.content, row);
      const status = checked.status === STATUS.VALID && !checked.active ? 'valid-old-key' : checked.status;
      findings.push(Object.assign(base, { status: status, reason: checked.reason }));
    });

    signatureRows.forEach(function (row) {
      if (!seen[row.content_ref]) {
        findings.push({ type: type, ref: row.content_ref, keyId: row.key_id, row: row, item: null, checkedAt: checkedAt, status: 'orphaned', reason: 'no such ' + type + ' any more' });
      }
    });
  }

  const counts = {};
  findings.forEach(function (finding) {
    counts[finding.status] = (counts[finding.status] || 0) + 1;
  });

  return {
    types: types,
    counts: counts,
    findings: findings,
    failed: !!(counts.invalid || counts.missing)
  };
}

/*
 * THE WORDS A VERDICT IS RECORDED IN - audit_status, as the v_*_signatures
 * views show it. Short, because they sit in a column beside a title; the
 * two that mean a visitor would be shown something other than what was signed
 * are in capitals, so they stand out in a page of 'valid'. `unsigned` has no
 * signature row to record it on, and the views say it themselves.
 */
const AUDIT_STATUS = {
  valid: 'valid',
  'valid-old-key': 'valid (old key)',
  invalid: 'INVALID',
  missing: 'MISSING',
  'revoked-key': 'revoked key',
  'untrusted-key': 'unknown key',
  orphaned: 'orphaned'
};

/**
 * Writes each finding's verdict onto the signature row it is about.
 *
 *   options.db      the knex handle (the pool by default)
 *   options.store   the signature store (the repository by default)
 *   options.refs    record only these refs - the tests, which audit the whole
 *                   development database with a throwaway key and must not
 *                   write "unknown key" over its real rows
 *
 * A finding without a signature row (unsigned, or a missing file nobody
 * signed) has nowhere to go and is skipped. Answers the number of rows
 * written, which is smaller than the number offered when an item was
 * re-signed while the audit ran: the store does not put a verdict on a
 * signature other than the one that was checked.
 */
function record(findings, options) {
  const opts = options || {};
  const store = opts.store || require('../repositories/contentSignatures.repository');
  const refs = opts.refs && opts.refs.length ? opts.refs.map(String) : null;

  const verdicts = findings
    .filter(function (finding) {
      return finding.row && AUDIT_STATUS[finding.status] && (!refs || refs.indexOf(finding.ref) !== -1);
    })
    .map(function (finding) {
      return {
        id: finding.row.id,
        signature: finding.row.signature,
        signedAt: finding.row.signed_at,
        status: AUDIT_STATUS[finding.status],
        reason: finding.reason || null,
        at: finding.checkedAt
      };
    });

  return store.recordAudits(verdicts, opts.db || require('../config/db'));
}

/**
 * THE AUDIT, RECORDED - the one function `npm run sign:audit` and the nightly
 * sweep both run, so what the script prints and what the views show are the
 * same findings.
 *
 * Takes audit()'s options, plus `refs` (see record(); it needs exactly one
 * type, as the backfill's does) and `dryRun`, which checks everything and
 * writes nothing.
 *
 * Answers audit()'s report with `recorded`: rows written, 0 on a dry run.
 */
async function auditAndRecord(options) {
  const opts = options || {};
  const h = handles(opts);

  if (opts.refs && opts.refs.length && (!opts.types || opts.types.length !== 1)) {
    throw new Error('refs needs exactly one type');
  }

  const report = await audit(Object.assign({}, opts, { db: h.db, service: h.service }));
  report.recorded = opts.dryRun
    ? 0
    : await record(report.findings, { db: h.db, store: opts.store, refs: opts.refs });

  return report;
}

/* What the backfill reports and leaves alone unless told to force it. */
const NEEDS_A_PERSON = [STATUS.INVALID, 'missing', STATUS.REVOKED, STATUS.UNTRUSTED];

/**
 * THE WHOLE POLICY, in one function the tests can hold to it:
 *
 *   unsigned                   signed, always
 *   valid-old-key + rotate     re-signed - its old signature still verifies
 *   anything + forceResign     re-signed as it is now, orphans excepted
 *   everything else            left alone - above all INVALID, under --rotate too
 *
 * An item with no content (a missing file, a row that does not fit its schema)
 * can never be signed: there is nothing to sign.
 */
function shouldSign(finding, opts) {
  const options = opts || {};
  const signable = !!(finding.item && finding.item.content);
  if (!signable) return false;

  if (finding.status === STATUS.UNSIGNED) return true;
  if (options.forceResign) return finding.status !== 'orphaned';
  if (options.rotate) return finding.status === 'valid-old-key';
  return false;
}

/**
 * Signs what the options allow - see the note at the top of this file.
 *
 *   options.types        restrict to these content types
 *   options.refs         restrict to these refs (with one type)
 *   options.rotate       re-sign valid items signed by a non-active key
 *   options.forceResign  re-sign regardless of the existing signature
 *   options.dryRun       report, write nothing
 *
 * Answers { signed: [...findings], skipped: [...findings], report }.
 */
async function backfill(options) {
  const opts = options || {};
  const h = handles(opts);

  if (opts.refs && opts.refs.length && (!opts.types || opts.types.length !== 1)) {
    throw new Error('--ref needs exactly one --type');
  }

  const report = await audit(Object.assign({}, opts, { db: h.db, service: h.service }));
  const refs = opts.refs && opts.refs.length ? opts.refs.map(String) : null;

  const signed = [];
  const skipped = [];

  for (let i = 0; i < report.findings.length; i += 1) {
    const finding = report.findings[i];
    if (refs && refs.indexOf(finding.ref) === -1) continue;

    if (!shouldSign(finding, opts)) {
      if (NEEDS_A_PERSON.indexOf(finding.status) !== -1) skipped.push(finding);
      continue;
    }

    if (!opts.dryRun) {
      // eslint-disable-next-line no-await-in-loop
      await h.service.sign(finding.type, finding.ref, finding.item.content, h.db);
    }
    signed.push(finding);
  }

  return { signed: signed, skipped: skipped, report: report };
}

module.exports = {
  TYPES: TYPES,
  AUDIT_STATUS: AUDIT_STATUS,
  shouldSign: shouldSign,
  audit: audit,
  record: record,
  auditAndRecord: auditAndRecord,
  backfill: backfill
};
