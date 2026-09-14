'use strict';

/**
 * Writes an SVG placeholder for every /uploads/... path the database
 * references, so the seeded site renders with artwork instead of broken
 * images.
 *
 * The colour is derived from the path, which means a product's cover, hero
 * and gallery shots all come out in the same hue and the pages look
 * deliberate rather than random. Existing files are never overwritten unless
 * --force is passed, so a real uploaded image is safe.
 */

const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const db = require('../src/config/db');

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

  /*
   * THE ABOUT PAGE, which is the most image-heavy thing on the site.
   *
   * The desktop and mobile crops are given DIFFERENT proportions on purpose:
   * a placeholder that is 1600x900 in both would hide exactly the layout bug
   * these two columns exist to prevent - a marketing band that was never
   * re-composed for a phone.
   */
  /*
   * THE ABOUT PAGE'S PICTURES, from the one table that still holds them.
   *
   * It used to read three - sections, items, certificates - each with its own
   * desktop/mobile pair. The page's copy is in crystal-web now and only the
   * photographs are data, so there is one query and one shape.
   *
   * A CERTIFICATE IS PORTRAIT and everything else is a landscape band, which
   * is the one distinction worth keeping: a placeholder in the wrong aspect
   * hides exactly the layout bug these are drawn to catch.
   */
  const aboutImages = await db('about_images').select('slot', 'file_path', 'file_path_dark');
  aboutImages.forEach(function (row) {
    const portrait = row.slot === 'certificate';
    add(row.file_path, portrait ? 900 : 1600, portrait ? 1200 : 1000);
    add(row.file_path_dark, portrait ? 900 : 1600, portrait ? 1200 : 1000);
  });

  return wanted;
}

async function main() {
  const wanted = await collectPaths();
  const paths = Object.keys(wanted);

  let written = 0;
  let skipped = 0;

  paths.forEach(function (publicPath) {
    const relative = publicPath.replace(/^\/uploads\//, '');
    const target = path.join(config.storage.uploadDir, relative);

    if (fs.existsSync(target) && !force) {
      skipped++;
      return;
    }

    const dir = path.dirname(target);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(target, svgFor(publicPath, wanted[publicPath].width, wanted[publicPath].height));
    written++;
  });

  console.log(
    'mock images: ' + written + ' written, ' + skipped + ' already present ' +
    '(' + paths.length + ' referenced by the database)'
  );
  await db.destroy();
}

main().catch(function (err) {
  console.error('could not generate mock images: ' + err.message);
  process.exit(1);
});
