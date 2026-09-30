/**
 * THE TWO SERVICE COUNTERS, in one place.
 *
 * The same building repairs a handset and a set-top box, and to the people who
 * run them they are two businesses: a different manager, a different service
 * vocabulary, and - in the console - a different page. `agency_services.section`
 * is what carries that; there is still one `agencies` row behind both lists, so
 * a centre that moves has one address to change.
 *
 * This file exists because three screens were each carrying their own copy of
 * the vocabulary - the locator, the band on a section landing page, and now the
 * section menu - and two of them had already drifted apart on the labels. The
 * server holds the same two lists and rejects anything outside them; see
 * services/agencies.service.js.
 */

export const SECTIONS = [
  { key: 'SMARTPHONE', slug: 'smartphones', label: 'Smartphones', sectionPath: '/smartphones' },
  { key: 'EPRODUCT', slug: 'eproducts', label: 'Eproducts', sectionPath: '/eproducts' }
];

/**
 * The locator lives under one slug per section, never under both at once.
 *
 * Nothing links to the bare path any more - each network is reached from its
 * own product menu - but the route still resolves and redirects, because it is
 * what every link written before the split points at.
 */
const CENTRES_PATH = '/support/centres';

export function centresPathOf(section) {
  const found = sectionOf(section);
  return CENTRES_PATH + '/' + (found ? found.slug : SECTIONS[0].slug);
}

/**
 * A section from either half of its identity - the slug in a URL, or the code
 * the API speaks - so a caller never has to know which one it is holding.
 */
export function sectionOf(value) {
  const needle = String(value || '').toLowerCase();
  return SECTIONS.filter(
    (entry) => entry.slug === needle || entry.key.toLowerCase() === needle
  )[0] || null;
}

/**
 * WHAT EACH COUNTER OFFERS, and it is a different list per section.
 *
 * The two overlap only at REPAIR, which is the same word for two different
 * desks - which is exactly why the API sends its services back as `SECTION:TYPE`
 * pairs rather than as bare types.
 */
export const SECTION_SERVICES = {
  SMARTPHONE: [
    { value: 'REPAIR', label: 'Repair' },
    { value: 'OS', label: 'Crystal OS' },
    { value: 'INSURANCE', label: 'Insurance' },
    { value: 'REPLACEMENT', label: 'Replacement' }
  ],
  EPRODUCT: [
    { value: 'REPAIR', label: 'Repair' },
    { value: 'MEDIA_SERVICE', label: 'Media service' },
    { value: 'STREAMING_DEVICES', label: 'Streaming devices' },
    { value: 'COMPUTER', label: 'Computer' },
    { value: 'CORDLESS_PHONE', label: 'Cordless phone' },
    { value: 'CAMERA_DEVICE', label: 'Camera device' }
  ]
};

/**
 * The services a centre offers IN ONE SECTION, as words.
 *
 * The API answers `SECTION:TYPE` pairs from a single aggregate, and anything
 * belonging to the other counter is dropped here rather than shown greyed out:
 * a visitor on the smartphone page has no use for the fact that this branch
 * also services cameras, and listing it is how somebody carries a television
 * to a counter that will not take it.
 */
export function servicesOf(agency, section) {
  const labels = {};
  (SECTION_SERVICES[section] || []).forEach((entry) => { labels[entry.value] = entry.label; });

  return String(agency.services || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((entry) => (entry.indexOf(':') === -1 ? ['', entry] : entry.split(':')))
    .filter((pair) => !pair[0] || pair[0] === section)
    .map((pair) => ({
      key: pair.join(':'),
      // A code with no label is still shown, tidied - a service type added to
      // the vocabulary server-side should appear here before this file knows
      // about it, rather than vanishing from every card silently.
      label: labels[pair[1]] || pair[1].replace(/_/g, ' ').toLowerCase()
    }));
}
