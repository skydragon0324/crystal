'use strict';

/**
 * Slugs are the public identity of products and articles (`/api/products/:slug`),
 * so they have to stay stable, URL-safe and unique.
 */

function slugify(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')      // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'item';
}

/**
 * Appends -2, -3 ... until the slug is free.
 *
 * @param {string} base        desired slug
 * @param {function} exists    async (slug) => boolean
 */
async function unique(base, exists) {
  const root = slugify(base);
  let candidate = root;
  let suffix = 1;
  /* eslint-disable no-await-in-loop */
  while (await exists(candidate)) {
    suffix += 1;
    candidate = root + '-' + suffix;
    if (suffix > 500) {
      throw new Error('Could not allocate a unique slug for: ' + base);
    }
  }
  /* eslint-enable no-await-in-loop */
  return candidate;
}

module.exports = { slugify: slugify, unique: unique };
