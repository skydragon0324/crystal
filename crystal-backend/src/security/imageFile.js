'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { IMAGE_MIME_TYPES } = require('./schemas');

/**
 * WHAT A STORED FILE ACTUALLY IS: its type from its bytes, its size, and the
 * SHA-256 of exactly what is on disk.
 *
 * TYPE FROM THE BYTES, NEVER FROM THE REQUEST. The Content-Type an upload
 * declares is whatever the browser - or a script - chose to write, and the
 * extension is part of a name the caller picked. The first few bytes of a PNG,
 * a JPEG, a GIF or a WebP are fixed by their formats; an SVG is XML whose root
 * element is <svg>. That is what is signed as `mimeType`, and what the upload
 * refuses to accept when the declaration disagrees.
 *
 * NOT A VALIDATOR. A file that starts with a PNG signature and is garbage
 * afterwards is still "image/png" here. Decoding every upload would need an
 * image library, and the signature's job is not to prove a picture is well
 * formed - it is to prove the bytes the browser receives are the bytes that
 * were uploaded through the console.
 *
 * SVG IS SNIFFED AS TEXT: an optional byte-order mark, whitespace, an XML
 * declaration, comments and a DOCTYPE, and then the root element must be
 * <svg. Anything else - HTML with an <svg> inside it, a script - is not an
 * SVG image. (An SVG can carry script of its own; /uploads is served with
 * `Content-Security-Policy: default-src 'none'` and the storefront draws a
 * verified image through <img>, where script does not run. See app.js.)
 */

const PDF = 'application/pdf';

/* How far into a file the SVG sniff reads - enough for a long licence comment. */
const SNIFF_BYTES = 64 * 1024;

function startsWith(buffer, bytes, offset) {
  const at = offset || 0;
  if (buffer.length < at + bytes.length) return false;
  for (let i = 0; i < bytes.length; i += 1) {
    if (buffer[at + i] !== bytes[i]) return false;
  }
  return true;
}

function ascii(text) {
  return Array.prototype.map.call(text, function (ch) { return ch.charCodeAt(0); });
}

function looksLikeSvg(buffer) {
  let text = buffer.slice(0, SNIFF_BYTES).toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  /* Peel the prolog off, one construct at a time, and look at what is left. */
  let rest = text;
  let previous = null;
  while (rest !== previous) {
    previous = rest;
    rest = rest.replace(/^\s+/, '')
      .replace(/^<\?xml[\s\S]*?\?>/, '')
      .replace(/^<!--[\s\S]*?-->/, '')
      .replace(/^<!DOCTYPE\s+svg[^>]*>/i, '');
  }

  return /^<svg[\s>/]/.test(rest);
}

/**
 * An ISO base-media file - MP4 and its relatives.
 *
 * The first box in the file is `ftyp`, and the four bytes before it are that
 * box's length, so the brand sits at offset 4 rather than at the start. The
 * brand itself (isom, mp42, avc1...) is deliberately not checked: what
 * matters here is that the container is one the browser will open, and a
 * brand allowlist is a list that goes out of date.
 */
function looksLikeMp4(buffer) {
  return startsWith(buffer, ascii('ftyp'), 4);
}

/**
 * A WebM file - EBML, then a DocType of `webm`.
 *
 * Matroska has the same four magic bytes and is NOT accepted: a .mkv served
 * as video/webm plays in some browsers and not others, which is a bug report
 * from one visitor in five rather than an upload that was refused.
 */
function looksLikeWebm(buffer) {
  if (!startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return false;
  return buffer.slice(0, 64).indexOf('webm', 0, 'ascii') !== -1;
}

/**
 * The MIME type the bytes say, or null.
 *
 * `options.documents` also recognises a PDF, for the document upload - which
 * accepts a PDF but must still refuse a PDF that says it is a PNG.
 *
 * `options.videos` recognises the two the hero carousel plays. It is off by
 * default, so every endpoint that took artwork before this existed still
 * refuses a film, and only the one that asked for it gets one.
 *
 * A FILM IS SNIFFED BUT NOT SIGNED. Sniffing is what stops a page of script
 * being stored as `advert.mp4` and served back as video/mp4; signing is a
 * different promise, and it is not made for video - a signature is checked by
 * hashing the whole file, and the whole file is the thing a video deliberately
 * does not download before it starts playing. See the note in
 * middleware/upload.js.
 */
function detectMime(buffer, options) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return null;

  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buffer, ascii('GIF87a')) || startsWith(buffer, ascii('GIF89a'))) return 'image/gif';
  if (startsWith(buffer, ascii('RIFF')) && startsWith(buffer, ascii('WEBP'), 8)) return 'image/webp';
  if (options && options.documents && startsWith(buffer, ascii('%PDF-'))) return PDF;
  if (options && options.videos && looksLikeMp4(buffer)) return 'video/mp4';
  if (options && options.videos && looksLikeWebm(buffer)) return 'video/webm';
  if (looksLikeSvg(buffer)) return 'image/svg+xml';

  return null;
}

function isImageMime(mime) {
  return IMAGE_MIME_TYPES.indexOf(mime) !== -1;
}

/* The extensions a stored file of each type is given - the first is the one used. */
const EXTENSIONS = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'image/svg+xml': ['.svg'],
  'application/pdf': ['.pdf'],
  /* `.m4v` is an MP4 by another name, and some cameras still write it. */
  'video/mp4': ['.mp4', '.m4v'],
  'video/webm': ['.webm']
};

function extensionsFor(mime) {
  return EXTENSIONS[mime] || [];
}

/**
 * A storage key the signing code will touch, or the reason it will not.
 *
 * The key is the public path the database holds - `/uploads/showcase/x.svg` -
 * and it is signed as it stands, so it has to be ONE spelling of one file:
 * no `..` segment, no backslash, no doubled slash, no query string, nothing
 * outside the upload root once resolved. A path that fails is simply not
 * signable, and the item it belongs to is served with `integrity: null`.
 */
const STORAGE_KEY = /^\/uploads\/[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

function storageKeyProblem(key) {
  if (typeof key !== 'string' || !key) return 'not a path';
  if (key.length > 255) return 'longer than a storage key column';
  if (!STORAGE_KEY.test(key)) return 'not a plain /uploads/... path';
  if (key.split('/').some(function (segment) { return segment === '.' || segment === '..'; })) {
    return 'contains a relative segment';
  }
  return null;
}

/** Absolute path for a storage key inside `uploadDir`, or null. */
function absolutePath(key, uploadDir) {
  if (storageKeyProblem(key)) return null;
  const root = path.resolve(uploadDir);
  const resolved = path.resolve(root, key.replace(/^\/uploads\//, ''));
  return resolved.indexOf(root + path.sep) === 0 ? resolved : null;
}

/** The storage key for an absolute file inside `uploadDir`, or null. */
function storageKeyFor(file, uploadDir) {
  const root = path.resolve(uploadDir);
  const resolved = path.resolve(file);
  if (resolved.indexOf(root + path.sep) !== 0) return null;
  const key = '/uploads/' + resolved.slice(root.length + 1).split(path.sep).join('/');
  return storageKeyProblem(key) ? null : key;
}

class ImageFileError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * The signable description of a stored file:
 *
 *   { storageKey, mimeType, size, sha256 }
 *
 * Streamed, so a twenty megabyte upload is hashed without being held in
 * memory; the first bytes are kept for the type sniff. Rejects with an
 * ImageFileError whose code is 'bad-key', 'missing' or 'not-an-image'.
 */
function describe(storageKey, uploadDir) {
  return new Promise(function (resolve, reject) {
    const problem = storageKeyProblem(storageKey);
    const file = problem ? null : absolutePath(storageKey, uploadDir);
    if (!file) {
      reject(new ImageFileError('bad-key', 'the storage key ' + JSON.stringify(storageKey) + ' is ' + (problem || 'outside the upload directory')));
      return;
    }

    const hash = crypto.createHash('sha256');
    const head = [];
    let headLength = 0;
    let size = 0;

    const stream = fs.createReadStream(file);
    stream.on('error', function (err) {
      reject(err.code === 'ENOENT' || err.code === 'EISDIR'
        ? new ImageFileError('missing', 'no file at ' + storageKey)
        : err);
    });
    stream.on('data', function (chunk) {
      hash.update(chunk);
      size += chunk.length;
      if (headLength < SNIFF_BYTES) {
        head.push(chunk);
        headLength += chunk.length;
      }
    });
    stream.on('end', function () {
      const mime = detectMime(Buffer.concat(head));
      if (!isImageMime(mime)) {
        reject(new ImageFileError('not-an-image', storageKey + ' is not one of the signable image types'));
        return;
      }
      resolve({ storageKey: storageKey, mimeType: mime, size: size, sha256: hash.digest('hex') });
    });
  });
}

/*
 * A SMALL CACHE for the storefront's replies, keyed by the file's identity on
 * disk: path, size, modification time and inode. A request that draws twelve
 * product shots should not hash twelve files every time.
 *
 * It cannot make a tampered file look genuine. If a write somehow kept the
 * size and the timestamp, the reply carries the OLD hash beside a valid
 * signature - and the storefront hashes the bytes it actually downloads and
 * refuses the mismatch. The cache can only ever make the envelope stale, never
 * the verification.
 */
const CACHE_LIMIT = 2000;
const cache = new Map();

function describeCached(storageKey, uploadDir) {
  const file = absolutePath(storageKey, uploadDir);
  if (!file) return Promise.reject(new ImageFileError('bad-key', 'not a storage key: ' + storageKey));

  return new Promise(function (resolve, reject) {
    fs.stat(file, function (err, stat) {
      if (err) {
        cache.delete(file);
        reject(err.code === 'ENOENT' ? new ImageFileError('missing', 'no file at ' + storageKey) : err);
        return;
      }

      const identity = [stat.size, stat.mtimeMs, stat.ino].join(':');
      const hit = cache.get(file);
      if (hit && hit.identity === identity) {
        resolve(hit.described);
        return;
      }

      describe(storageKey, uploadDir).then(function (described) {
        if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
        cache.set(file, { identity: identity, described: described });
        resolve(described);
      }, reject);
    });
  });
}

module.exports = {
  PDF: PDF,
  SNIFF_BYTES: SNIFF_BYTES,
  detectMime: detectMime,
  isImageMime: isImageMime,
  extensionsFor: extensionsFor,
  storageKeyProblem: storageKeyProblem,
  absolutePath: absolutePath,
  storageKeyFor: storageKeyFor,
  describe: describe,
  describeCached: describeCached,
  ImageFileError: ImageFileError
};
