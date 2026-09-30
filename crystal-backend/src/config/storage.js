'use strict';

/**
 * Local filesystem storage (spec 2: "Storage: Local filesystem only").
 *
 * Files live under UPLOAD_DIR in folders named after what owns them, and the
 * database only ever stores the public path (`/uploads/products/xxx.webp`),
 * never an absolute one - so moving the upload directory does not require a
 * data migration.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./index');

/*
 * 'categories' is here because the seed and the mock-image generator both
 * write section icons and banners into it - a folder the database references
 * but the upload guard refused was a folder the console could not replace a
 * picture in.
 *
 * 'about' IS HERE FOR THE SAME REASON, found the same way. The About images
 * screen uploads into it, the guard refused it with a 400, and every picture
 * on the company introduction became impossible to set - reported as "the
 * upload failed", because a refused folder and a failed upload look identical
 * from the console. crystal-admin/src/uploadFolders.test.js now reads this
 * list and fails if the console asks for a folder that is not on it.
 */
const FOLDERS = [
  'products', 'series', 'categories', 'articles', 'avatars', 'os', 'agencies',
  'service', 'misc', 'about', 'showcase'
];

function ensureDirs() {
  if (!fs.existsSync(config.storage.uploadDir)) {
    fs.mkdirSync(config.storage.uploadDir, { recursive: true });
  }
  FOLDERS.forEach(function (folder) {
    const dir = path.join(config.storage.uploadDir, folder);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

function isAllowedFolder(folder) {
  return FOLDERS.indexOf(folder) !== -1;
}

/** Collision-proof, extension-preserving, and safe to put in a URL. */
function buildFilename(originalName) {
  const ext = (path.extname(originalName || '') || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
  const stamp = Date.now().toString(36);
  const rand = crypto.randomBytes(6).toString('hex');
  return stamp + '-' + rand + (ext || '.bin');
}

/** Absolute path on disk for a stored public path. */
function absolutePath(publicPath) {
  if (!publicPath) return null;
  const relative = String(publicPath).replace(/^\/?uploads\/?/, '');
  const root = path.resolve(config.storage.uploadDir);
  const resolved = path.resolve(root, relative);
  /*
   * Never let a crafted path escape the upload root - and "starts with the
   * root" is not the test. It was, and `/uploads/../uploads-old/x` resolves to
   * a SIBLING directory whose name merely begins with the root's, which the
   * prefix comparison waved through. Inside means the root plus a separator.
   */
  if (resolved.indexOf(root + path.sep) !== 0) {
    return null;
  }
  return resolved;
}

/** Public path (what goes in the database) for a folder + filename. */
function publicPathFor(folder, filename) {
  return config.storage.publicPath + '/' + folder + '/' + filename;
}

/** Absolute URL for a client that cannot resolve a relative path. */
function absoluteUrl(publicPath) {
  if (!publicPath) return null;
  if (/^https?:\/\//i.test(publicPath)) return publicPath;
  return config.publicUrl + (publicPath.charAt(0) === '/' ? '' : '/') + publicPath;
}

function remove(publicPath) {
  const abs = absolutePath(publicPath);
  if (abs && fs.existsSync(abs)) {
    try { fs.unlinkSync(abs); return true; } catch (e) { return false; }
  }
  return false;
}

module.exports = {
  FOLDERS: FOLDERS,
  ensureDirs: ensureDirs,
  isAllowedFolder: isAllowedFolder,
  buildFilename: buildFilename,
  absolutePath: absolutePath,
  publicPathFor: publicPathFor,
  absoluteUrl: absoluteUrl,
  remove: remove
};
