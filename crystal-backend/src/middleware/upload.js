'use strict';

/**
 * Multer wired to the local filesystem (spec 2: local storage only).
 *
 * The destination folder comes from the route, never from the request body -
 * a caller that could name its own folder could write outside the upload root
 * with `../`. `storage.isAllowedFolder` is the guard.
 */

const fs = require('fs');
const multer = require('multer');
const path = require('path');
const config = require('../config');
const storage = require('../config/storage');
const { HttpError } = require('../utils/response');
const imageFile = require('../security/imageFile');
const contentOf = require('../security/contentOf');
const { service: signing } = require('../security/signingService');

function diskStorageFor(folder) {
  return multer.diskStorage({
    destination: function (req, file, cb) {
      if (!storage.isAllowedFolder(folder)) {
        return cb(new HttpError(400, 'upload.unknownUploadFolder', null, { folder: folder }));
      }
      return cb(null, path.join(config.storage.uploadDir, folder));
    },
    filename: function (req, file, cb) {
      cb(null, storage.buildFilename(file.originalname));
    }
  });
}

function imageFilter(req, file, cb) {
  if (config.storage.allowedImageTypes.indexOf(file.mimetype) === -1) {
    return cb(new HttpError(400, 'upload.onlyImagesAreAllowed', null, {
      types: config.storage.allowedImageTypes.join(', ')
    }));
  }
  return cb(null, true);
}

/** Single image field, e.g. upload.image('products').single('file') */
function image(folder) {
  return multer({
    storage: diskStorageFor(folder),
    limits: { fileSize: config.storage.maxUploadBytes, files: 1 },
    fileFilter: imageFilter
  });
}

/**
 * ARTWORK OR A FILM, for the places that advertise.
 *
 * A hero slide and a popup may be a picture, an animated GIF or a short
 * video, so this filter takes both lists and the larger of the two ceilings.
 * `verified` below is what actually decides: it sniffs the stored bytes and
 * refuses anything whose contents disagree with what was claimed.
 *
 * SEPARATE FROM `image` DELIBERATELY. Every existing artwork endpoint - a
 * product's hero, a series banner, an avatar - must go on refusing a video,
 * because those files are drawn in an <img> and a video in one is a broken
 * picture. Only the advert screens ask for this one.
 */
function media(folder) {
  const allowed = config.storage.allowedImageTypes.concat(config.storage.allowedVideoTypes);

  return multer({
    storage: diskStorageFor(folder),
    limits: { fileSize: config.storage.maxVideoUploadBytes, files: 1 },
    fileFilter: function (req, file, cb) {
      if (allowed.indexOf(file.mimetype) === -1) {
        return cb(new HttpError(400, 'upload.onlyImagesOrVideosAreAllowed', null, {
          types: allowed.join(', ')
        }));
      }
      return cb(null, true);
    }
  });
}

/**
 * A document rather than artwork: the same disk, a wider filter.
 *
 * Kept separate from `image` on purpose - the endpoints that serve artwork
 * must go on refusing a PDF, and one shared filter that accepted both would
 * quietly let a PDF be set as a product's hero image.
 */
function document(folder) {
  return multer({
    storage: diskStorageFor(folder),
    limits: { fileSize: config.storage.maxUploadBytes, files: 1 },
    fileFilter: function (req, file, cb) {
      if (config.storage.allowedDocumentTypes.indexOf(file.mimetype) === -1) {
        return cb(new HttpError(400, 'upload.onlyDocumentsAreAllowed', null, {
          types: config.storage.allowedDocumentTypes.join(', ')
        }));
      }
      return cb(null, true);
    }
  });
}

/** Several images at once, used by the product gallery editor. */
function images(folder, maxCount) {
  return multer({
    storage: diskStorageFor(folder),
    limits: { fileSize: config.storage.maxUploadBytes, files: maxCount || 10 },
    fileFilter: imageFilter
  });
}

/**
 * A spreadsheet on its way in, held in MEMORY rather than written to disk.
 *
 * An import is read once and thrown away - the rows go into tables, the file
 * itself is of no further interest - so putting it in the upload folder would
 * leave a permanent copy of every attempt, including the failed ones, that
 * nothing would ever clean up.
 */
function spreadsheet() {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.storage.maxUploadBytes, files: 1 },
    fileFilter: function (req, file, cb) {
      const name = String(file.originalname || '').toLowerCase();
      // Browsers disagree about the mime type of an .xlsx - some send the
      // long OpenXML one, some send octet-stream - so the extension is what
      // is actually checked, and exceljs refuses anything that is not one.
      if (name.slice(-5) !== '.xlsx') {
        return cb(new HttpError(400, 'upload.onlyXlsxSpreadsheetsCan'));
      }
      return cb(null, true);
    }
  });
}

/** Turns a multer file into the public path stored in the database. */
function toPublicPath(folder, file) {
  return file ? storage.publicPathFor(folder, file.filename) : null;
}

function discard(file) {
  if (file && file.path) {
    try { fs.unlinkSync(file.path); } catch (e) { /* already gone */ }
  }
}

function readHead(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(imageFile.SNIFF_BYTES);
    const read = fs.readSync(fd, buffer, 0, buffer.length, 0);
    return buffer.slice(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * WHAT WAS STORED IS CHECKED, RENAMED IF NEED BE, AND SIGNED - the step after
 * multer has written the file and before anything points a row at it.
 *
 *   router.post('/upload/:folder', ..., upload.image(folder).single('file'),
 *     upload.verified('image'), controller.uploadImage)
 *
 * THE BYTES DECIDE THE TYPE. multer's filter above can only read what the
 * request DECLARED, and a declaration is a string the caller wrote. So the
 * stored file's first bytes are read, and a file whose contents are not the
 * type it declared is deleted and refused - a PDF sent as image/png, an HTML
 * page sent as image/svg+xml, a PNG sent as a JPEG. Nothing is "corrected":
 * a client that mislabels a file is either broken or trying something, and
 * neither deserves a helpful guess.
 *
 * THE EXTENSION FOLLOWS THE BYTES. The stored name was generated before the
 * bytes could be seen, from the caller's extension, and /uploads is served
 * with a Content-Type taken from that extension. A PNG uploaded as
 * `photo.gif` is renamed `.png` here, so what the static route announces is
 * what the file is. The rest of the name stays server-generated.
 *
 * AN IMAGE IS SIGNED IMMEDIATELY, from a fresh read of the stored file: the
 * detected type, the size and the SHA-256 of exactly those bytes, under the
 * public path the database will hold. If signing fails the file is deleted -
 * an upload is stored signed or not at all. `req.file.integrity` carries the
 * envelope to the reply. A PDF on the document route is checked the same way
 * and is not signed: it is not a type the storefront verifies.
 *
 * A VIDEO IS CHECKED AND NOT SIGNED EITHER, and that is a decision rather than
 * an omission. A signature is verified by hashing the whole file; an advert
 * film is allowed to be sixty megabytes, and hashing sixty megabytes in a
 * visitor's browser before the first frame is drawn is not a carousel. So the
 * sniff above still applies - it must really be MP4 or WebM - and the bytes
 * are then served from their ordinary address. An animated GIF is an image
 * and is signed like any other.
 *
 * NOT ATOMIC WITH THE MEDIA ROW that may follow. The file and its signature
 * exist together; a row that then fails to insert leaves a signed file nothing
 * points at, which is where an unattached upload has always ended up.
 */
function verified(kind) {
  let allowed = config.storage.allowedImageTypes;
  if (kind === 'document') allowed = config.storage.allowedDocumentTypes;
  /* `media` is artwork OR a film - the advert screens, and only those. */
  if (kind === 'media') allowed = allowed.concat(config.storage.allowedVideoTypes);

  /** One stored file: checked, renamed if need be, and signed when it is an image. Throws HttpError on a lie. */
  async function verifyOne(file) {
    const detected = imageFile.detectMime(readHead(file.path), {
      documents: kind === 'document',
      videos: kind === 'media'
    });

    if (!detected || allowed.indexOf(detected) === -1 || detected !== file.mimetype) {
      throw new HttpError(400, 'upload.contentDoesNotMatchType', null, { declared: file.mimetype });
    }

    const extensions = imageFile.extensionsFor(detected);
    if (extensions.indexOf(path.extname(file.filename).toLowerCase()) === -1) {
      const renamed = file.filename.replace(/\.[^.]*$/, '') + extensions[0];
      const target = path.join(path.dirname(file.path), renamed);
      /* The name is random; a collision is not a thing to overwrite. */
      if (fs.existsSync(target)) throw new Error('an upload could not be renamed over an existing file: ' + target);
      fs.renameSync(file.path, target);
      file.filename = renamed;
      file.path = target;
    }

    if (imageFile.isImageMime(detected)) {
      const storageKey = imageFile.storageKeyFor(file.path, config.storage.uploadDir);
      if (!storageKey) throw new Error('an upload was stored outside the upload directory: ' + file.path);

      const described = await imageFile.describe(storageKey, config.storage.uploadDir);
      if (described.mimeType !== detected) throw new Error('the stored upload changed while it was being signed');

      const signed = await signing().sign('image', storageKey, contentOf.image(described));
      file.integrity = { content: signed.content, signature: signed.signature };
    }
  }

  return async function verifyStoredUpload(req, res, next) {
    /* A single field or several - every file multer stored goes through the same door. */
    const files = req.file ? [req.file] : (Array.isArray(req.files) ? req.files : []);
    if (!files.length) return next();

    try {
      for (let i = 0; i < files.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await verifyOne(files[i]);
      }
      return next();
    } catch (err) {
      /* All or nothing: one refused file discards the batch, signatures included. */
      for (let i = 0; i < files.length; i += 1) {
        discard(files[i]);
        if (files[i].integrity) {
          // eslint-disable-next-line no-await-in-loop
          await signing().forget('image', files[i].integrity.content.storageKey).catch(function () {});
        }
      }
      return next(err);
    }
  };
}

module.exports = {
  image: image,
  media: media,
  document: document,
  images: images,
  spreadsheet: spreadsheet,
  verified: verified,
  toPublicPath: toPublicPath
};
