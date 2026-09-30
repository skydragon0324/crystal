'use strict';

/**
 * Writes a placeholder for every /uploads/... path the database references,
 * so the seeded site renders with artwork instead of broken images.
 *
 * THREE KINDS, DECIDED BY THE EXTENSION THE SEED ASKED FOR:
 *
 *   .svg   a still - a gradient, two discs and the family's name
 *   .gif   an ANIMATED still, drawn frame by frame and LZW-compressed here
 *          (lib/gif.js), because the advert screens take moving artwork now
 *   .mp4   a FILM, which cannot be generated: encoding H.264 needs an
 *          encoder, and the project has none. The three clips in
 *          scripts/mock/ were made once with a WebAssembly x264 outside this
 *          repository - see scripts/mock/README.md - and are COPIED here.
 *   .png   a SCENE LAYER - a cloud, a phone body, a line of copy - drawn
 *          with real alpha (lib/png.js, lib/mockScenes.js). Transparency is
 *          why these are not SVG: a scene is layers stacked over each other,
 *          and a layer that is opaque where it should be clear hides the one
 *          beneath it.
 *
 * A picture and a GIF are signed as they are written, like an upload. A FILM
 * IS NOT: the server does not sign video (src/middleware/upload.js says why),
 * so a signature here would be an envelope nothing ever checks.
 *
 * The colour is derived from the path, which means a product's cover, hero
 * and gallery shots all come out in the same hue and the pages look
 * deliberate rather than random. Existing files are never overwritten unless
 * --force is passed, so a real uploaded image is safe.
 */

const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const gif = require('./lib/gif');
const mockArt = require('./lib/mockArt');
const mockScenes = require('./lib/mockScenes');
const db = require('../src/config/db');
const contentOf = require('../src/security/contentOf');
const imageFile = require('../src/security/imageFile');
const { service: signing } = require('../src/security/signingService');

const force = process.argv.indexOf('--force') !== -1;

/** Stable hash -> hue, so the same path always yields the same colour. */
function hueFor(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) % 360;
  }
  return hash;
}

/**
 * The product a path belongs to, so every asset of one product shares a hue.
 * `c9-pro-hero-desktop.svg` and `c9-pro-front.svg` both reduce to `c9-pro`.
 *
 * A product's own assets sit in a folder named after its slug, so THAT is the
 * family when there is one: the file part of `products/c9-pro/main.svg` is
 * just `main`, which every product has, and hashing it would paint nineteen
 * different handsets - and now nineteen sets of finishes and box contents -
 * in one identical hue.
 */
function familyFor(filePath) {
  const owned = /\/uploads\/products\/([^/]+)\//.exec(filePath);
  if (owned) return owned[1];

  const base = path.basename(filePath).replace(/\.[a-z0-9]+$/i, '');
  return base.replace(
    /-(hero|main|thumb|banner|front|back|angle|detail|lifestyle|colours|mobile|desktop)(-.*)?$/g,
    ''
  );
}

function svgFor(filePath, width, height) {
  const family = familyFor(filePath);
  const hue = hueFor(family);
  const label = family.replace(/-/g, ' ');
  const w = width || 1200;
  const h = height || 900;

  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" ' +
    'viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + label + '">\n' +
    '  <defs>\n' +
    '    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">\n' +
    '      <stop offset="0%" stop-color="hsl(' + hue + ', 62%, 58%)"/>\n' +
    '      <stop offset="100%" stop-color="hsl(' + ((hue + 42) % 360) + ', 58%, 34%)"/>\n' +
    '    </linearGradient>\n' +
    '  </defs>\n' +
    '  <rect width="' + w + '" height="' + h + '" fill="url(#g)"/>\n' +
    '  <circle cx="' + Math.round(w * 0.78) + '" cy="' + Math.round(h * 0.24) + '" ' +
    'r="' + Math.round(Math.min(w, h) * 0.28) + '" fill="rgba(255,255,255,0.12)"/>\n' +
    '  <circle cx="' + Math.round(w * 0.22) + '" cy="' + Math.round(h * 0.82) + '" ' +
    'r="' + Math.round(Math.min(w, h) * 0.20) + '" fill="rgba(0,0,0,0.10)"/>\n' +
    '  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" ' +
    'font-family="DM Sans, Segoe UI, Helvetica, Arial, sans-serif" ' +
    'font-size="' + Math.round(Math.min(w, h) * 0.075) + '" font-weight="600" ' +
    'fill="rgba(255,255,255,0.94)">' + label + '</text>\n' +
    '  <text x="50%" y="' + (h / 2 + Math.round(Math.min(w, h) * 0.075)) + '" ' +
    'text-anchor="middle" font-family="DM Sans, Segoe UI, Helvetica, Arial, sans-serif" ' +
    'font-size="' + Math.round(Math.min(w, h) * 0.038) + '" fill="rgba(255,255,255,0.62)">' +
    w + ' x ' + h + '</text>\n' +
    '</svg>\n';
}

/**
 * A GIF is drawn rather than described, so it is kept SMALL: twelve frames of
 * a 1920px banner is eight megabytes of mock data in a repository checkout.
 * Half size is plenty to see that it moves.
 */
function gifFor(filePath, width, height) {
  const family = familyFor(filePath);

  /*
   * Capped on BOTH sides, not just the width. A phone crop is 1080x1350, and
   * scaling only its width still left twelve frames of 960x1200 - six hundred
   * kilobytes of mock data for one slide. Which is a fair demonstration of
   * why an advert that moves should be a film, but not one worth making on
   * every developer's machine.
   */
  const scale = Math.min(1, 960 / (width || 960), 720 / (height || 380));
  const w = Math.max(2, Math.round((width || 960) * scale));
  const h = Math.max(2, Math.round((height || 380) * scale));

  const built = mockArt.build({
    width: w,
    height: h,
    hue: hueFor(family),
    title: family.replace(/-/g, ' '),
    subtitle: 'animated gif',
    frames: 12,
    delay: 8
  });

  return gif.encode({ width: w, height: h, palette: built.palette, frames: built.frames });
}

/*
 * Every scene layer this project knows how to draw, by file name.
 *
 * The scenes themselves are seeded as JSON on the advert rows; this is the
 * other half - the pictures those layers point at. A path that is not in here
 * is not a mock scene layer and is drawn as an ordinary placeholder.
 */
const SCENE_LAYERS = Object.assign(
  {},
  mockScenes.landingScene().files,
  mockScenes.phoneScene().files,
  mockScenes.productScene().files
);

/** The fixture a film path is copied from, or null if there is none for it. */
function filmFor(filePath) {
  const name = path.basename(filePath);
  const fixture = path.join(__dirname, 'mock', name);
  return fs.existsSync(fixture) ? fixture : null;
}

/** Collects every upload path the database mentions, with its intended size. */
async function collectPaths() {
  const wanted = {};

  function add(filePath, width, height) {
    if (!filePath || String(filePath).indexOf('/uploads/') !== 0) return;
    if (!wanted[filePath]) wanted[filePath] = { width: width, height: height };
  }

  /*
   * Read straight through knex rather than through the repositories.
   *
   * This is a maintenance script that wants every row of eight tables including
   * the soft-deleted ones - it is generating placeholder FILES, and an image
   * a deleted product still references is one a restore would need back.  The
   * repositories all scope that out, correctly, for the application.
   */
  const products = await db('products').select('main_image', 'main_image_mobile');
  products.forEach(function (row) {
    add(row.main_image, 1200, 1200);
    add(row.main_image_mobile, 900, 1200);
  });

  const series = await db('product_series').select('banner_image', 'banner_image_mobile');
  series.forEach(function (row) {
    add(row.banner_image, 1920, 640);
    add(row.banner_image_mobile, 1080, 1080);
  });

  /*
   * The box contents. Square and small: an accessory sits in a row of five,
   * so it does not want a 1200px file.
   *
   * The FINISHES are not here - a swatch is painted from its hex, so there
   * is no file to generate.
   */
  const accessories = await db('product_accessories').select('image');
  accessories.forEach(function (row) { add(row.image, 400, 400); });

  const categories = await db('product_categories').select('icon');
  categories.forEach(function (row) { add(row.icon, 240, 240); });

  const media = await db('media_assets').select('file_path', 'width', 'height');
  media.forEach(function (row) { add(row.file_path, row.width, row.height); });

  /* The two advertising runs. Each crop is the shape of the box it fills. */
  const adverts = await db('site_adverts').select('file_path', 'device_type');
  adverts.forEach(function (row) {
    add(row.file_path, row.device_type === 'mobile' ? 1080 : 1920, row.device_type === 'mobile' ? 1350 : 760);
  });

  /*
   * And the popups, which have no device crop: one picture is shown over the
   * whole page on every screen, so it is drawn tall enough to survive a phone.
   */
  const popups = await db('site_popups').select('file_path');
  popups.forEach(function (row) { add(row.file_path, 1080, 1350); });

  /*
   * A SCENE'S LAYERS ARE NOT A COLUMN. They are `src` values inside the
   * JSON, so they are collected by walking it - a scene whose layers were
   * missed here would be an advert with a background and nothing on it.
   */
  function addScene(scene) {
    if (!scene || typeof scene !== 'object') return;
    if (scene.background && scene.background.src) add(scene.background.src, scene.width, scene.height);
    (Array.isArray(scene.layers) ? scene.layers : []).forEach(function (layer) {
      if (layer && layer.src) add(layer.src, layer.width || scene.width, layer.height || scene.height);
    });
  }

  const scenes = await db('site_adverts').select('scene').whereNotNull('scene');
  scenes.forEach(function (row) { addScene(row.scene); });

  const productScenes = await db('product_images').select('scene').whereNotNull('scene');
  productScenes.forEach(function (row) { addScene(row.scene); });

  // A product's own two runs live in their own table now, not in media_assets.
  const shots = await db('product_images').select('file_path', 'width', 'height');
  shots.forEach(function (row) { add(row.file_path, row.width, row.height); });

  const articles = await db('articles').select('cover_image', 'cover_image_mobile');
  articles.forEach(function (row) {
    add(row.cover_image, 1600, 900);
    add(row.cover_image_mobile, 1080, 1080);
  });

  const os = await db('os_versions').select('cover_image');
  os.forEach(function (row) { add(row.cover_image, 1600, 900); });

  return wanted;
}

async function main() {
  const wanted = await collectPaths();
  const paths = Object.keys(wanted);

  let written = 0;
  let skipped = 0;
  let signed = 0;
  let films = 0;
  const missing = [];

  for (let i = 0; i < paths.length; i += 1) {
    const publicPath = paths[i];
    const relative = publicPath.replace(/^\/uploads\//, '');
    const target = path.join(config.storage.uploadDir, relative);

    if (fs.existsSync(target) && !force) {
      skipped++;
      continue;
    }

    const dir = path.dirname(target);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const extension = path.extname(publicPath).toLowerCase();

    if (extension === '.mp4' || extension === '.webm') {
      const fixture = filmFor(publicPath);
      if (!fixture) {
        missing.push(publicPath);
        continue;
      }
      fs.copyFileSync(fixture, target);
      written++;
      films++;
      /* Deliberately not signed - see the note at the top of this file. */
      continue;
    }

    const sceneLayer = SCENE_LAYERS[path.basename(publicPath)];
    if (sceneLayer) {
      /* Drawn at the size the scene places it at, with its alpha intact. */
      fs.writeFileSync(target, sceneLayer());
    } else if (extension === '.gif') {
      fs.writeFileSync(target, gifFor(publicPath, wanted[publicPath].width, wanted[publicPath].height));
    } else {
      fs.writeFileSync(target, svgFor(publicPath, wanted[publicPath].width, wanted[publicPath].height));
    }
    written++;

    /*
     * SIGNED AS IT IS WRITTEN, like an upload. This script made the bytes a
     * moment ago, so signing them - even over an older signature, with
     * --force - vouches for nothing it did not just do. A placeholder left
     * unsigned would be a hero the storefront refuses to draw.
     */
    if (!imageFile.storageKeyProblem(publicPath)) {
      // eslint-disable-next-line no-await-in-loop
      const described = await imageFile.describe(publicPath, config.storage.uploadDir);
      // eslint-disable-next-line no-await-in-loop
      await signing().sign('image', publicPath, contentOf.image(described));
      signed++;
    }
  }

  console.log(
    'mock images: ' + written + ' written (' + signed + ' signed, ' + films + ' films copied), '
    + skipped + ' already present (' + paths.length + ' referenced by the database)'
  );

  if (missing.length) {
    console.log(
      'no fixture for ' + missing.length + ' film(s): ' + missing.join(', ')
      + '\n  see scripts/mock/README.md - a film cannot be generated here'
    );
  }
  await db.destroy();
}

main().catch(function (err) {
  console.error('could not generate mock images: ' + err.message);
  process.exit(1);
});
