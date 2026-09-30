/**
 * Stand-in imagery.
 *
 * Why this exists
 * ---------------
 * Every picture on the storefront is built by getFileUrl(), which joins
 * REACT_APP_UPLOAD_PATH to a stored path. That variable is not set in
 * .env, so the join produced "undefined/uploads/intro/business.png" and
 * the whole intro page, the product grid and the phone galleries rendered
 * as broken-image boxes. The upload host is also simply empty on a fresh
 * environment even once the variable is set.
 *
 * So there are two different problems and they need two different
 * answers:
 *
 *   a real remote URL   for anything meant to look like production
 *                       content - the hero carousel, the intro sections,
 *                       the product grid. mockPhotoUrl() returns a
 *                       Lorem Picsum URL, which is a real photograph and
 *                       is stable for a given seed, so the same product
 *                       gets the same picture on every reload rather
 *                       than reshuffling the page each time.
 *
 *   an inline SVG       for when even that fails - offline, an air-gapped
 *                       environment, a blocked host. placeholderDataUri()
 *                       needs no network at all and still draws something
 *                       deliberate rather than a browser's broken icon.
 *
 * AppImage chains the two: real upload, then remote mock, then the inline
 * placeholder. Nothing on the page can end up blank.
 */

const PICSUM = 'https://picsum.photos/seed';

/** Non-cryptographic, stable across reloads - only needs to spread seeds. */
const hashString = (value) => {
  const text = String(value === null || value === undefined ? '' : value);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

/**
 * A real photograph, chosen deterministically from `seed`.
 *
 *   mockPhotoUrl('product-12', { width: 480, height: 480 })
 */
export const mockPhotoUrl = (seed, options) => {
  const opts = options || {};
  const width = opts.width || 800;
  const height = opts.height || Math.round(width * 0.62);
  // encodeURIComponent: a seed built from a product name can carry
  // spaces or slashes, and a raw slash would change the URL's shape.
  const key = encodeURIComponent(String(seed || 'vendor'));
  return `${PICSUM}/${key}/${width}/${height}`;
};

/**
 * Curated seeds for the storefront hero.
 *
 * Kept as a list rather than generated so the slides stay in a chosen
 * order and the copy below can be written against a specific picture.
 */
export const HERO_SLIDE_SEEDS = [
  'vendor-hero-flagship',
  'vendor-hero-camera',
  'vendor-hero-battery',
  'vendor-hero-service',
];

/** A phone-shop-ish photo for a product row that has no upload. */
export const mockProductImage = (row, size) => {
  const record = row || {};
  const seed = `phone-${record.product_pk || record.table_pk || hashString(record.product_name)}`;
  const width = size || 420;
  return mockPhotoUrl(seed, { width, height: width });
};

/** Same idea for the long marketing images on a product detail page. */
export const mockGalleryImage = (row, index) => {
  const record = row || {};
  const seed = `gallery-${record.product_pk || 'x'}-${record.table_pk || index || 0}`;
  return mockPhotoUrl(seed, { width: 1200, height: 800 });
};

/** And for the company intro page's section imagery. */
export const mockIntroImage = (path, options) =>
  mockPhotoUrl(`intro-${hashString(path)}`, options);

/*
 * Inline placeholder
 *
 * Two tuned pairs rather than one: the same grey that reads as "quietly
 * empty" on a white page turns into a bright block in dark mode, which is
 * the opposite of quiet.
 */
const TONES = {
  light: { bg: '#F4F7FE', shape: '#E0E5F2', ink: '#8F9BBA' },
  dark: { bg: '#111C44', shape: '#1B254B', ink: '#7080A6' },
};

const escapeXml = (value) =>
  String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * A self-contained SVG data URI: a soft panel, a picture glyph and an
 * optional caption. No network, no extra request, and it inherits the
 * page's rounded-corner language so it does not look like a failure.
 */
export const placeholderDataUri = (options) => {
  const opts = options || {};
  const width = opts.width || 640;
  const height = opts.height || 420;
  const tone = TONES[opts.tone === 'dark' ? 'dark' : 'light'];
  const label = escapeXml(opts.label || '');

  // Glyph geometry is derived from the box so one placeholder can serve a
  // square product tile and a wide banner without looking stretched.
  const glyph = Math.max(28, Math.min(width, height) * 0.22);
  const cx = width / 2;
  const cy = height / 2 - (label ? glyph * 0.35 : 0);

  const caption = label
    ? `<text x="${cx}" y="${cy + glyph * 1.15}" fill="${tone.ink}"
         font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(11, glyph * 0.3)}"
         text-anchor="middle">${label}</text>`
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${tone.bg}"/>
  <g transform="translate(${cx - glyph / 2} ${cy - glyph / 2})">
    <rect width="${glyph}" height="${glyph * 0.78}" rx="${glyph * 0.12}" fill="${tone.shape}"/>
    <circle cx="${glyph * 0.3}" cy="${glyph * 0.28}" r="${glyph * 0.09}" fill="${tone.ink}" opacity="0.7"/>
    <path d="M${glyph * 0.12} ${glyph * 0.66} L${glyph * 0.38} ${glyph * 0.4}
             L${glyph * 0.56} ${glyph * 0.58} L${glyph * 0.72} ${glyph * 0.46}
             L${glyph * 0.88} ${glyph * 0.66} Z" fill="${tone.ink}" opacity="0.55"/>
  </g>
  ${caption}
</svg>`;

  // encodeURIComponent rather than btoa: the caption can carry non-Latin
  // characters and btoa throws on those.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, ' '))}`;
};
