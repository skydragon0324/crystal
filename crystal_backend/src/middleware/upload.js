'use strict';

/**
 * Multer wired to the local filesystem (spec 2: local storage only).
 *
 * The destination folder comes from the route, never from the request body -
 * a caller that could name its own folder could write outside the upload root
 * with `../`. `storage.isAllowedFolder` is the guard.
 */

const multer = require('multer');
const path = require('path');
const config = require('../config');
const storage = require('../config/storage');
const { HttpError } = require('../utils/response');

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

module.exports = {
  image: image,
  document: document,
  images: images,
  spreadsheet: spreadsheet,
  toPublicPath: toPublicPath
};
