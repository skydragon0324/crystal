'use strict';

/**
 * THE FIVE CRYSTAL SYSTEMS a customer can be standing in front of.
 *
 * One list, in one file, because three places need the same five words and
 * they must be the same five: the FAQ's check constraint, the spreadsheet
 * column that validates an import, and the order the storefront draws the
 * filter chips in.
 *
 * Not the same list as feedback.service.js's SOURCES, which is these five
 * plus the two REGISTER origins. An enquiry can come from the middle of
 * registering a device; a published answer cannot be filed under a step in a
 * flow, so the FAQ stops at the systems themselves.
 *
 * The ORDER is the reading order, and it is deliberate: the two catalogue
 * sections first because most questions are about a product somebody is
 * holding, then the two external stores, then the app.
 */
const SYSTEMS = ['SMARTPHONE', 'EPRODUCT', 'ESHOP', 'APPSTORE', 'CRYSTAL_APP'];

/** Where a system sits in the reading order; -1 for anything not in the list. */
function rankOf(code) {
  return SYSTEMS.indexOf(String(code || '').toUpperCase());
}

module.exports = {
  SYSTEMS: SYSTEMS,
  rankOf: rankOf
};
