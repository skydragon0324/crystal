'use strict';

const canonical = require('./canonicalPayload');
const { SCHEMA_VERSION } = require('./schemas');
const { validateEnvelope, REASON } = require('./signatureValidation');

/**
 * THE ONE PLACE CONTENT IS SIGNED AND VERIFIED.
 *
 *   signContent({ type, content, keyId })                 -> { content, signature, payloadSha256 }
 *   verifyContent({ type, content, signature, trustedKey }) -> { valid, reason, detail }
 *
 * and, on top of those two, the handful of things the rest of the backend
 * actually needs: sign an item and store the signature (inside the caller's
 * transaction), check an item against its stored signature, and build the
 * `integrity` envelope a storefront reply carries.
 *
 * NOTHING IN HERE KNOWS WHAT A NOTICE IS. Callers hand over a content type, a
 * reference and content already shaped by contentOf.js; this file turns that
 * into bytes, signatures and rows. A controller that wants something signed
 * calls this - there is no second copy of "build the payload and call
 * crypto.sign" anywhere else, which is what lets the algorithm change with a
 * configuration value and nothing more.
 *
 * DEPENDENCIES ARE INJECTED - the key provider, the signature store, the clock
 * - so the tests run it against throwaway keys and an in-memory store, and so
 * the storefront's read path, which only needs the store, never loads a
 * private key at all. `keys` may be a provider or a function returning one;
 * the function form is what defers loading until something actually signs or
 * verifies.
 */

const STATUS = {
  VALID: 'valid',
  UNSIGNED: 'unsigned',
  INVALID: 'invalid',                 // the content or the stored signature has changed
  REVOKED: 'revoked-key',
  UNTRUSTED: 'untrusted-key'          // signed by a key id this server does not believe
};

function createSigningService(deps) {
  const options = deps || {};
  const clock = options.clock || function () { return new Date(); };
  const store = options.store || null;
  const verificationCacheLimit = options.verificationCacheLimit === undefined
    ? 5000
    : Math.max(0, Number(options.verificationCacheLimit) || 0);
  const verificationCache = new Map();

  let provider = null;
  function keys() {
    if (!provider) provider = typeof options.keys === 'function' ? options.keys() : options.keys;
    if (!provider) throw new Error('the signing service has no key provider');
    return provider;
  }

  function needStore() {
    if (!store) throw new Error('the signing service has no signature store');
    return store;
  }

  /* ------------------------------------------------------------------ */
  /*  the two primitives                                                 */
  /* ------------------------------------------------------------------ */

  /**
   * Signs content with the ACTIVE key.
   *
   * `keyId`, when given, must be the active key's id - there is exactly one
   * private key loaded, and a caller asking for another is a caller that
   * believes something about the configuration that is not true.
   *
   * The signature is checked against the public key before it is returned.
   * It costs one verification and catches the failure that would otherwise
   * surface in a browser weeks later: a key pair that signs but does not
   * verify.
   */
  function signContent(request) {
    const req = request || {};
    const active = keys().active();

    if (req.keyId !== undefined && req.keyId !== active.keyId) {
      throw new Error('only the active key "' + active.keyId + '" signs; "' + req.keyId + '" was asked for');
    }

    const content = canonical.orderedContent(req.type, req.content);
    const bytes = canonical.canonicalBytes(req.type, active.algorithm.name, active.keyId, content);
    const value = active.algorithm.sign(active.privateKey, bytes);

    if (!active.algorithm.verify(active.publicKey, bytes, value)) {
      throw new Error('a signature made with "' + active.keyId + '" did not verify against its own public key');
    }

    return {
      content: content,
      signature: {
        v: SCHEMA_VERSION,
        type: req.type,
        algorithm: active.algorithm.name,
        keyId: active.keyId,
        encoding: active.algorithm.encoding,
        value: value.toString('base64'),
        signedAt: clock().toISOString()
      },
      payloadSha256: canonical.payloadSha256(bytes)
    };
  }

  /**
   * Verifies content against a signature envelope.
   *
   * `trustedKey`, when given, is the ONLY key believed - { keyId, algorithm,
   * publicKey } - and anything naming another id is unknown. Without it the
   * key provider resolves the id, which is what the audit does.
   *
   * Answers { valid, reason, detail }; reason is one of signatureValidation's
   * REASON values when it is not valid. Never throws for anything the
   * envelope contains.
   */
  function verifyContent(request) {
    const req = request || {};

    const resolveKey = req.trustedKey
      ? function (keyId) {
        return keyId === req.trustedKey.keyId
          ? Object.assign({ revoked: false }, req.trustedKey)
          : null;
      }
      : function (keyId) { return keys().resolve(keyId); };

    const checked = validateEnvelope({ content: req.content, signature: req.signature }, {
      expectedType: req.type,
      resolveKey: resolveKey
    });

    if (!checked.ok) return { valid: false, reason: checked.reason, detail: checked.detail };

    const bytes = canonical.canonicalBytes(checked.type, checked.key.algorithm.name, checked.key.keyId, checked.content);
    const valid = checked.key.algorithm.verify(checked.key.publicKey, bytes, checked.signatureBytes);

    return valid
      ? { valid: true, reason: null, detail: null, keyId: checked.key.keyId, active: !!checked.key.active }
      : { valid: false, reason: REASON.SIGNATURE, detail: null };
  }

  /* ------------------------------------------------------------------ */
  /*  stored signatures                                                  */
  /* ------------------------------------------------------------------ */

  /** A content_signatures row as the envelope's `signature` object. */
  function signatureFromRow(row) {
    return {
      v: row.schema_version,
      type: row.content_type,
      algorithm: row.algorithm,
      keyId: row.key_id,
      encoding: row.encoding,
      value: row.signature,
      signedAt: row.signed_at instanceof Date ? row.signed_at.toISOString() : String(row.signed_at)
    };
  }

  /**
   * Signs an item and stores the signature, replacing any earlier one.
   *
   * `trx` is the CALLER'S transaction whenever it has one: the edit and its
   * signature commit together or not at all, so there is no moment at which
   * the row says one thing and its signature another.
   */
  async function sign(type, ref, content, trx) {
    const signed = signContent({ type: type, content: content });

    const rows = await needStore().upsert({
      content_type: type,
      content_ref: String(ref),
      schema_version: signed.signature.v,
      algorithm: signed.signature.algorithm,
      key_id: signed.signature.keyId,
      encoding: signed.signature.encoding,
      signature: signed.signature.value,
      payload_sha256: signed.payloadSha256,
      signed_at: new Date(signed.signature.signedAt)
    }, trx);

    return { row: rows[0], content: signed.content, signature: signed.signature };
  }

  function stored(type, ref, trx) {
    return needStore().find(type, String(ref), trx);
  }

  function forget(type, ref, trx) {
    return needStore().remove(type, String(ref), trx);
  }

  /**
   * How an item stands against its stored signature:
   *
   *   { status: 'valid' | 'unsigned' | 'invalid' | 'revoked-key' | 'untrusted-key',
   *     reason, row, active }
   *
   * `content` is the item as it is NOW, built from the current row or file.
   * A content object that does not even fit its schema - a status nobody can
   * sign - is INVALID, not an exception: it is exactly the kind of change an
   * edit behind the application's back produces.
   */
  async function check(type, ref, content, trx, preloaded) {
    const row = preloaded !== undefined ? preloaded : await stored(type, ref, trx);
    return checkRow(type, content, row);
  }

  function checkRow(type, content, row) {
    if (!row) return { status: STATUS.UNSIGNED, reason: null, row: null, active: false };

    const result = verifyContent({ type: type, content: content, signature: signatureFromRow(row) });

    if (result.valid) return { status: STATUS.VALID, reason: null, row: row, active: result.active };
    if (result.reason === REASON.KEY_REVOKED) return { status: STATUS.REVOKED, reason: result.reason, row: row, active: false };
    if (result.reason === REASON.KEY_UNKNOWN) return { status: STATUS.UNTRUSTED, reason: result.reason, row: row, active: false };

    return { status: STATUS.INVALID, reason: result.reason + (result.detail ? ' (' + result.detail + ')' : ''), row: row, active: false };
  }

  /**
   * The `integrity` envelopes for a list of items, in one query.
   *
   *   items   [{ ref, content }] - content null when it could not be built
   *
   * Answers an array in the same order, each `{ content, signature }` or
   * null. NOT VERIFIED HERE, deliberately: the envelope is the CURRENT content
   * beside the STORED signature, so an edit that skipped re-signing reaches
   * the storefront as a signature that no longer matches - which is the whole
   * point of sending it. Verifying on every read would cost a verification per
   * item per request to decide something the browser decides anyway.
   *
   * No private key is touched, so a read path works on a server whose key
   * provider is only half configured.
   */
  async function envelopes(type, items, trx) {
    const refs = items
      .filter(function (item) { return item && item.content; })
      .map(function (item) { return String(item.ref); });

    const rows = refs.length ? await needStore().findMany(type, refs, trx) : [];
    const byRef = {};
    rows.forEach(function (row) { byRef[row.content_ref] = row; });

    return items.map(function (item) {
      if (!item || !item.content) return null;
      const row = byRef[String(item.ref)];
      if (!row) return null;

      const built = canonical.buildContent(type, item.content);
      if (!built.ok) return null;

      return { content: built.content, signature: signatureFromRow(row) };
    });
  }

  /**
   * Envelopes that this server has verified against its trusted keys.
   *
   * This uses the same one-query envelope build as `envelopes`, then checks
   * each current payload against the stored signature. A null result means
   * unsigned, malformed, changed, revoked or untrusted; public read paths do
   * not need to reveal which of those states caused the refusal.
   */
  async function verifiedEnvelopes(type, items, trx) {
    const built = await envelopes(type, items, trx);
    return built.map(function (envelope) {
      if (!envelope) return null;

      /*
       * The key contains every byte that affects the verdict. A changed row,
       * signature, key id or algorithm is a cache miss, so only an identical
       * verification is reused. Cache failures too: one tampered public row
       * must not turn every storefront request into an RSA/ECDSA operation.
       */
      const cacheKey = type + '\n' + JSON.stringify(envelope);
      if (verificationCache.has(cacheKey)) {
        return verificationCache.get(cacheKey) ? envelope : null;
      }

      const checked = verifyContent({
        type: type,
        content: envelope.content,
        signature: envelope.signature
      });

      if (verificationCacheLimit > 0) {
        if (verificationCache.size >= verificationCacheLimit) {
          verificationCache.delete(verificationCache.keys().next().value);
        }
        verificationCache.set(cacheKey, checked.valid);
      }
      return checked.valid ? envelope : null;
    });
  }

  return {
    STATUS: STATUS,
    keys: keys,
    signContent: signContent,
    verifyContent: verifyContent,
    signatureFromRow: signatureFromRow,
    sign: sign,
    stored: stored,
    forget: forget,
    check: check,
    checkRow: checkRow,
    envelopes: envelopes,
    verifiedEnvelopes: verifiedEnvelopes
  };
}

/* ------------------------------------------------------------------ */
/*  this process's service                                             */
/* ------------------------------------------------------------------ */

let shared = null;

/**
 * The service the application runs with: keys from configuration, loaded on
 * first use, and the content_signatures repository.
 *
 * app.js calls `assertReady()` before it listens, so a misconfigured server
 * never starts. Scripts - the audit, the backfill, the seeds - reach the same
 * service and fail with the same sentence.
 */
function service() {
  if (!shared) {
    shared = createSigningService({
      keys: function () { return require('./keyProvider').fromConfig(); },
      store: require('../repositories/contentSignatures.repository'),
      verificationCacheLimit: require('../config').contentSigning.verificationCacheEntries
    });
  }
  return shared;
}

/** Loads and checks the keys now. Throws SigningConfigError naming the problem. */
function assertReady() {
  return service().keys();
}

module.exports = {
  STATUS: STATUS,
  createSigningService: createSigningService,
  service: service,
  assertReady: assertReady
};
