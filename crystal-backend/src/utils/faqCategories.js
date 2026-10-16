'use strict';

/**
 * WHAT A PUBLISHED ANSWER CAN BE FILED UNDER, in reading order.
 *
 * One list, in one file, because four places need the same eight words and
 * they must be the same eight: the `faq_category` type, the spreadsheet column
 * that validates an import, the order the storefront draws the filter chips
 * in, and the signed-content schema (security/schemas.js, whose test holds it
 * to this list).
 *
 * THE PRODUCT KINDS FIRST - the catalogue's own product_kind, value for value
 * - because most questions are about something a visitor is holding: a
 * television that will not turn on is a TV question before it is a warranty
 * question. Then the three Crystal services that are not products.
 *
 * It used to be five SYSTEMS - SMARTPHONE, EPRODUCT, ESHOP, APPSTORE,
 * CRYSTAL_APP - with a catalogue section beside it to say which eproduct. See
 * sql/deltas/033. The feedback desk still routes by system (enquiry_source),
 * because it is routed by which counter answers; an answer is filed by what
 * it is about.
 */
const FAQ_CATEGORIES = ['SMARTPHONE', 'TV', 'STB', 'COMPUTER', 'CAMERA', 'CRYSTAL_APP', 'ESHOP', 'APPSTORE'];

/**
 * THE TWO FAMILIES THE EIGHT FALL INTO - a thing in the visitor's hands, or a
 * Crystal service.
 *
 * It is the split the list above is already ordered by, and the storefront
 * draws it as a second row of chips under the first: pick Products, then pick
 * which product. The forum's shelves work the same way, and it is what makes
 * eight chips - of which five are product kinds - readable at a glance.
 *
 * MEMBERSHIP IS DECIDED HERE, not in the website. The reading order already
 * lives in this file for the four places that need it; a second copy of which
 * category is a product would be a fifth, and the one that drifts.
 */
const FAQ_GROUPS = [
  { key: 'PRODUCTS', categories: ['SMARTPHONE', 'TV', 'STB', 'COMPUTER', 'CAMERA'] },
  { key: 'SERVICES', categories: ['CRYSTAL_APP', 'ESHOP', 'APPSTORE'] }
];

/** Where a category sits in the reading order; -1 for anything not in the list. */
function rankOf(code) {
  return FAQ_CATEGORIES.indexOf(String(code || '').toUpperCase());
}

/** Which family a category belongs to, or null for one outside the vocabulary. */
function groupOf(code) {
  const wanted = String(code || '').toUpperCase();
  const found = FAQ_GROUPS.filter(function (group) {
    return group.categories.indexOf(wanted) !== -1;
  })[0];

  return found ? found.key : null;
}

/**
 * The categories a group covers, or an empty list for an unknown group.
 *
 * Empty is deliberately NOT "all of them": a request for `group=PRODCUTS`
 * should answer nothing and be noticed, rather than quietly answering the
 * whole FAQ as though the filter had been applied.
 */
function categoriesInGroup(key) {
  const wanted = String(key || '').toUpperCase();
  const found = FAQ_GROUPS.filter(function (group) { return group.key === wanted; })[0];

  return found ? found.categories.slice() : [];
}

module.exports = {
  FAQ_CATEGORIES: FAQ_CATEGORIES,
  FAQ_GROUPS: FAQ_GROUPS,
  rankOf: rankOf,
  groupOf: groupOf,
  categoriesInGroup: categoriesInGroup
};
