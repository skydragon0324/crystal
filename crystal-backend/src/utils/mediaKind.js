'use strict';

const path = require('path');

/**
 * WHETHER A STORED FILE IS A PICTURE OR A FILM, and why anything asks.
 *
 * Two callers need to know, for two different reasons:
 *
 *   the storefront, so a slide is drawn in an <img> or in a <video>. It
 *   cannot work this out itself from the path - it could, but then the rule
 *   would live in two languages and drift.
 *
 *   the signing step, because a video is NOT signed (middleware/upload.js
 *   says why) and must therefore never be handed to integrity.images. That
 *   call reads and hashes the whole file; doing it to a sixty-megabyte advert
 *   on every homepage view would be a far worse bug than a missing envelope.
 *
 * THE EXTENSION DECIDES, and that is sound here rather than lazy: an upload's
 * extension is not the caller's to choose. `upload.verified` sniffs the
 * stored bytes and renames the file to the canonical extension for what they
 * actually are, so by the time a path reaches this function the two agree.
 */

/* The extensions imageFile.EXTENSIONS gives the two video types. */
const VIDEO_EXTENSIONS = ['.mp4', '.m4v', '.webm'];

function kindOf(filePath) {
  const extension = path.extname(String(filePath || '')).toLowerCase();
  return VIDEO_EXTENSIONS.indexOf(extension) === -1 ? 'image' : 'video';
}

function isVideo(filePath) {
  return kindOf(filePath) === 'video';
}

module.exports = {
  VIDEO_EXTENSIONS: VIDEO_EXTENSIONS,
  kindOf: kindOf,
  isVideo: isVideo
};
