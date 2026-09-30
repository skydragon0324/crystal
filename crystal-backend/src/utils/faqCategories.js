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

/** Where a category sits in the reading order; -1 for anything not in the list. */
function rankOf(code) {
  return FAQ_CATEGORIES.indexOf(String(code || '').toUpperCase());
}

module.exports = {
  FAQ_CATEGORIES: FAQ_CATEGORIES,
  rankOf: rankOf
};
