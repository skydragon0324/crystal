'use strict';

const crypto = require('crypto');
const fs = require('fs');

const config = require('../config');
const contentOf = require('../security/contentOf');
const imageFile = require('../security/imageFile');
const mediaKind = require('../utils/mediaKind');
const { service: signing } = require('../security/signingService');

/*
 * Cache ONLY exact buffers that have already passed hash + signature checks.
 * A cheap stat and signature-row lookup precede every reuse. If the file or
 * signature changes, the identity changes and the bytes are read and checked
 * again. If somebody alters a file while preserving all stat fields, serving
 * the cached old verified Buffer is still safe: their new bytes never leave
 * this endpoint.
 */
const verifiedImageCache = new Map();
const verifiedImagePending = new Map();
let verifiedImageCacheBytes = 0;

function fileIdentity(stat) {
  return [stat.size, stat.mtimeMs, stat.ino].join(':');
}

function signatureIdentity(row) {
  return [
    row.schema_version, row.algorithm, row.key_id, row.encoding,
    row.signature, row.signed_at instanceof Date ? row.signed_at.toISOString() : row.signed_at
  ].join(':');
}

function removeVerifiedImage(storageKey) {
  const previous = verifiedImageCache.get(storageKey);
  if (!previous) return;
  verifiedImageCache.delete(storageKey);
  verifiedImageCacheBytes -= previous.buffer.length;
}

function cachedVerifiedImage(storageKey, identity) {
  const entry = verifiedImageCache.get(storageKey);
  if (!entry) return null;
  if (entry.identity !== identity) {
    removeVerifiedImage(storageKey);
    return null;
  }

  /* Refresh insertion order: Map's first item is the least recently used. */
  verifiedImageCache.delete(storageKey);
  verifiedImageCache.set(storageKey, entry);
  return { buffer: entry.buffer, content: entry.content };
}

function rememberVerifiedImage(storageKey, identity, result) {
  const limit = config.storage.verifiedImageCacheBytes;
  removeVerifiedImage(storageKey);
  if (!limit || result.buffer.length > limit) return;

  while (verifiedImageCache.size && verifiedImageCacheBytes + result.buffer.length > limit) {
    removeVerifiedImage(verifiedImageCache.keys().next().value);
  }
  verifiedImageCache.set(storageKey, {
    identity: identity,
    buffer: result.buffer,
    content: result.content
  });
  verifiedImageCacheBytes += result.buffer.length;
}

/**
 * THE `integrity` ENVELOPES THE STOREFRONT VERIFIES, attached to its replies.
 *
 *   "integrity": { "content": { ...the signed fields... }, "signature": { ... } }
 *
 * built from the item AS IT IS NOW - the current row, the file on disk today -
 * beside the signature that was STORED when it was last signed through the
 * application. That pairing is the design: an edit made straight in the
 * database, or a file replaced on disk, reaches the browser as content its
 * signature no longer matches, and the storefront refuses to draw it.
 *
 * NOTHING IS SIGNED HERE. Public reads verify the current content against the
 * signature stored by the admin write path. This lets an HTTP deployment
 * enforce integrity on the trusted server even though its browser cannot use
 * WebCrypto. A read that signed whatever it found would launder every
 * tampered row it served, so this module only ever verifies.
 *
 * EVERY EXISTING FIELD STAYS. The console and the chrome widget read these
 * same replies and do not verify, so `integrity` is added beside what was
 * already there rather than replacing it - and the storefront renders from
 * `integrity.content`, never from the siblings, so what it shows is what it
 * checked.
 *
 * `null` means there is nothing to verify against: no stored signature, a
 * file that is missing, a path that is not a plain /uploads/... key, or a row
 * that no longer fits its schema. The storefront treats null as INVALID.
 */

function safely(build) {
  try {
    return build();
  } catch (err) {
    return null;
  }
}

async function attach(type, rows, refOf, contentFor) {
  if (!rows || !rows.length) return rows;

  const items = rows.map(function (row) {
    return { ref: refOf(row), content: safely(function () { return contentFor(row); }) };
  });

  const envelopes = await signing().verifiedEnvelopes(type, items);

  return rows.map(function (row, i) {
    return Object.assign({}, row, { integrity: envelopes[i] });
  });
}

/** site_notices rows - they need the ten signed columns selected. */
function notices(rows) {
  return attach('notification', rows, function (row) { return row.id; }, contentOf.notification);
}

/** faqs rows - the nine signed columns, never view_count. */
function faqs(rows) {
  return attach('faq', rows, function (row) { return row.id; }, contentOf.faq);
}

async function faq(row) {
  if (!row) return row;
  return (await faqs([row]))[0];
}

/**
 * The envelope for one stored file, or null.
 *
 * A path that is not an upload - an absolute URL, an empty column - is simply
 * not signable, and says so by being null rather than by failing the reply.
 */
async function imageEnvelope(storageKey) {
  if (imageFile.storageKeyProblem(storageKey)) return null;

  let described;
  try {
    described = await imageFile.describeCached(storageKey, config.storage.uploadDir);
  } catch (err) {
    return null;
  }

  const envelopes = await signing().verifiedEnvelopes('image', [{ ref: storageKey, content: contentOf.image(described) }]);
  return envelopes[0];
}

/**
 * Read, hash and verify the exact image bytes that a public response will
 * send. Holding the verified Buffer avoids a check/use race where a file is
 * replaced after it was hashed but before Express opens it for delivery.
 */
async function verifiedImage(storageKey, expectedSha256) {
  if (imageFile.storageKeyProblem(storageKey)) return null;
  if (!/^[a-f0-9]{64}$/.test(String(expectedSha256 || ''))) return null;
  const file = imageFile.absolutePath(storageKey, config.storage.uploadDir);
  if (!file) return null;

  let stat;
  try {
    stat = await fs.promises.stat(file);
    if (!stat.isFile() || !stat.size || stat.size > config.storage.maxUploadBytes) return null;
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'EISDIR')) {
      removeVerifiedImage(storageKey);
      return null;
    }
    throw err;
  }

  /* The indexed lookup is cheap and makes a deleted/re-signed image a miss. */
  const signatureRow = await signing().stored('image', storageKey);
  if (!signatureRow) {
    removeVerifiedImage(storageKey);
    return null;
  }

  const identity = fileIdentity(stat) + ':' + signatureIdentity(signatureRow);
  const hit = cachedVerifiedImage(storageKey, identity);
  if (hit) return hit.content.sha256 === expectedSha256 ? hit : null;

  /* Concurrent requests for the same version share one read/hash/verify. */
  const pendingKey = storageKey + '\n' + identity;
  if (verifiedImagePending.has(pendingKey)) {
    const shared = await verifiedImagePending.get(pendingKey);
    return shared && shared.content.sha256 === expectedSha256 ? shared : null;
  }

  const pending = fs.promises.readFile(file).then(async function (buffer) {
    /* Check again in case the file was replaced between stat and read. */
    if (!buffer.length || buffer.length > config.storage.maxUploadBytes) return null;
    const mimeType = imageFile.detectMime(buffer);
    if (!imageFile.isImageMime(mimeType)) return null;

    const content = contentOf.image({
      storageKey: storageKey,
      mimeType: mimeType,
      size: buffer.length,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex')
    });
    const checked = await signing().check('image', storageKey, content, null, signatureRow);
    if (checked.status !== signing().STATUS.VALID) return null;

    const result = { buffer: buffer, content: content };
    rememberVerifiedImage(storageKey, identity, result);
    return result;
  }).catch(function (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'EISDIR')) return null;
    throw err;
  }).then(function (result) {
    verifiedImagePending.delete(pendingKey);
    return result;
  }, function (err) {
    verifiedImagePending.delete(pendingKey);
    throw err;
  });

  verifiedImagePending.set(pendingKey, pending);
  const result = await pending;
  return result && result.content.sha256 === expectedSha256 ? result : null;
}

/**
 * Rows that each point at a file - adverts, media assets, product images.
 * `column` names the path; the envelope lands on `integrity`.
 */
async function images(rows, column) {
  if (!rows || !rows.length) return rows;
  const key = column || 'file_path';

  const described = await Promise.all(rows.map(function (row) {
    const storageKey = row[key];
    if (imageFile.storageKeyProblem(storageKey)) return null;
    return imageFile.describeCached(storageKey, config.storage.uploadDir).catch(function () { return null; });
  }));

  const envelopes = await signing().verifiedEnvelopes('image', rows.map(function (row, i) {
    return { ref: row[key], content: described[i] ? contentOf.image(described[i]) : null };
  }));

  return rows.map(function (row, i) {
    return Object.assign({}, row, { integrity: envelopes[i] });
  });
}

/**
 * Advert rows, which may be pictures OR films.
 *
 * A picture is signed exactly as `images` signs it. A FILM IS NOT TOUCHED:
 * it carries `integrity: null` and is played from its ordinary address. That
 * is a decision - see middleware/upload.js - and this function is where it is
 * enforced on the way out, because handing a video to `images` would read and
 * hash sixty megabytes to produce an envelope nothing can check anyway.
 *
 * Every row comes back with `media_type`, so the storefront knows whether it
 * is drawing an <img> or a <video> without parsing the path itself.
 */
async function media(rows, column) {
  const key = column || 'file_path';

  return Promise.all((rows || []).map(async function (row) {
    /*
     * A SCENE IS SIGNED PICTURE BY PICTURE. Its background and every layer
     * are ordinary uploads, so each one carries its own envelope beside the
     * `src` it belongs to and the storefront checks them all before it draws
     * anything - see components/ImageAnimator. A scene still keeps its row's
     * own `file_path` envelope, because that file is the still a reader is
     * shown where motion is refused.
     */
    const base = row.scene
      ? Object.assign({}, row, { scene: await sceneEnvelopes(row.scene) })
      : row;

    if (mediaKind.isVideo(base[key])) {
      return Object.assign({}, base, { media_type: 'video', integrity: null });
    }
    return Object.assign({}, base, {
      media_type: base.scene ? 'scene' : 'image',
      integrity: await imageEnvelope(base[key])
    });
  }));
}

/** One scene, with an envelope attached to each of its pictures. */
async function sceneEnvelopes(scene) {
  if (!scene || typeof scene !== 'object') return scene;

  const signed = Object.assign({}, scene);

  if (signed.background && signed.background.src) {
    signed.background = Object.assign({}, signed.background, {
      integrity: await imageEnvelope(signed.background.src)
    });
  }

  signed.layers = await Promise.all((Array.isArray(scene.layers) ? scene.layers : [])
    .map(async function (layer) {
      if (!layer || !layer.src) return layer;
      return Object.assign({}, layer, { integrity: await imageEnvelope(layer.src) });
    }));

  return signed;
}

module.exports = {
  notices: notices,
  faqs: faqs,
  faq: faq,
  images: images,
  media: media,
  imageEnvelope: imageEnvelope,
  verifiedImage: verifiedImage
};
