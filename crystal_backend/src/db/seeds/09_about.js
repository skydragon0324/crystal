'use strict';

/**
 * THE ABOUT PAGE'S PICTURES.
 *
 * This seed used to be four hundred lines of corporate copy - ten chapters,
 * sixty-two bullets, fourteen certificates - because the page was a CMS. It is
 * not one any more: the words are in crystal-web/src/pages/about/content.js,
 * where they can be reviewed and translated with the rest of the site, and
 * only the photographs are data. See sql/deltas/019.
 *
 * So what is left is the SLOTS the page asks for, each with a placeholder file
 * that `npm run mock:images` draws. The paths are what matters here: a slot
 * with no row renders no picture, and the point of a seed is that a developer
 * who has never uploaded anything still sees the page as designed.
 */

/**
 * ONE SLOT PER BAND, plus the two that hold galleries.
 *
 * The names are dotted where a chapter has more than one picture -
 * `factory.floor`, `factory.line` - so a slot reads as an address on the page
 * rather than as a word that happens to be unique. The page asks by these
 * exact strings; see content.js.
 */
const SLOTS = [
  { slot: 'hero', alt: 'The Crystal headquarters at dusk' },
  { slot: 'overview', alt: 'The main entrance and reception' },
  { slot: 'businesses', alt: 'The four Crystal product families side by side' },
  { slot: 'growth', alt: 'The assembly hall in its first year and today' },
  { slot: 'institute', alt: 'Engineers at work in the IT institute' },
  { slot: 'factory', alt: 'The factory seen from the yard' },
  { slot: 'factory.floor', alt: 'The main assembly floor' },
  { slot: 'factory.line', alt: 'A surface-mount line under inspection' },
  { slot: 'manufacturing', alt: 'A board being placed by hand for final check' },
  { slot: 'shop', alt: 'The Crystal Shop from the street' },
  { slot: 'shop.interior', alt: 'The handset floor inside the Crystal Shop' },
  { slot: 'service', alt: 'A technician at an authorised service bench' },
  { slot: 'presence', alt: 'Where Crystal operates' }
];

/**
 * The certificates, which are the one slot that is genuinely a gallery.
 *
 * A caption per picture, because these are the only images on the page whose
 * words belong to the FILE rather than to the band around them - the reader is
 * looking at fourteen scans and needs to know which is which.
 */
const CERTIFICATES = [
  'ISO 9001 - Quality management',
  'ISO 14001 - Environmental management',
  'ISO 45001 - Occupational health and safety',
  'IECEE CB - Household and similar equipment',
  'CE - Radio equipment directive',
  'RoHS - Restriction of hazardous substances',
  'National Quality Award',
  'Top 10 Electronics Manufacturer',
  'Best After-Sales Network',
  'Energy Efficiency Class A',
  'Repairability Commitment',
  'Trusted Brand - Consumer Electronics',
  'Export Excellence',
  'Innovation in Manufacturing'
];

exports.seed = async function seed(knex) {
  const rows = SLOTS.map(function (entry, index) {
    return {
      slot: entry.slot,
      /* The folder `npm run mock:images` draws into, one file per slot. */
      file_path: '/uploads/about/' + entry.slot.replace(/\./g, '-') + '.svg',
      alt_text: entry.alt,
      sort_order: index
    };
  });

  CERTIFICATES.forEach(function (name, index) {
    rows.push({
      slot: 'certificate',
      file_path: '/uploads/about/certificate-' + (index + 1) + '.svg',
      alt_text: name,
      caption: name,
      sort_order: index
    });
  });

  await knex('about_images').insert(rows);
};
