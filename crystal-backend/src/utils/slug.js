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
 * A slug somebody TYPED, made URL-safe without being rewritten.
 *
 * `slugify` is for deriving a slug from a name, and lower-cases because a
 * derived slug has no case anybody chose. A slug typed into the console is a
 * decision - "C9-Pro" is how the product is written on the box - and turning
 * it into "c9-pro" on save undid it without a word. So this keeps the letters
 * exactly as typed and only replaces what cannot sit in a URL path: runs of
 * anything other than A-Z, a-z and 0-9 become one hyphen, accents are
 * stripped to their base letter, and the ends are trimmed.
 *
 * Case never makes two slugs different, though: the repositories match slugs
 * case-insensitively, so "C9-Pro" and "c9-pro" are the same product and the
 * second is refused as taken rather than becoming a URL that differs from
 * another only by a capital.
 *
 * Returns '' when nothing usable is left (all punctuation, or a script with
 * no Latin letters), so the caller can fall back to deriving one from the name.
 */
function cleanSlug(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
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

module.exports = { slugify: slugify, cleanSlug: cleanSlug, unique: unique };
