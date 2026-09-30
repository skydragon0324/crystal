'use strict';

/**
 * SECTION-SCOPED PAGES, which is how this console does "different managers for
 * different parts of the catalogue".
 *
 * The permission grid is per PAGE, and `levelFor` inherits down a url prefix.
 * So a list that two different people own is registered as two pages under one
 * parent:
 *
 *   /admin/catalog/products                 the parent - guards the API,
 *                                           granted to whoever owns both
 *   /admin/catalog/products/smartphone      granted to the phone manager
 *   /admin/catalog/products/eproduct        granted to the eproduct manager
 *
 * A grant on the parent covers both children; a grant on one child covers only
 * that one. No row-level permission concept is needed, and none is invented.
 *
 * This middleware is the server half. It does two things, and the second is
 * the one that matters:
 *
 *   1. it checks the permission of the page for the SECTION being asked for,
 *      rather than only the parent, so the eproduct manager cannot read the
 *      smartphone list by calling the API directly;
 *
 *   2. it pins the filter. `req.section` is set from the page that was
 *      authorised, and the controller filters on that - so a request cannot
 *      pass `?section=EPRODUCT` for the permission check and then widen the
 *      query with a second parameter.
 */

const { requirePermission } = require('./permission');

/** The sections a page can be split into, and the category types behind them. */
const SECTIONS = {
  SMARTPHONE: { slug: 'smartphone', types: ['SMARTPHONE'] },
  /*
   * "Eproduct" is everything that is not a phone - televisions, set-top boxes,
   * computers, cameras. It is a section of the storefront rather than a
   * category, which is why this is a LIST of category types and not one.
   */
  EPRODUCT: { slug: 'eproduct', types: ['TV', 'STB', 'COMPUTER', 'CAMERA'] }
};

function normalise(section) {
  const upper = String(section || '').toUpperCase();
  return SECTIONS[upper] ? upper : null;
}

/**
 * Guards a request against the page for the section it names.
 *
 * With no section it falls back to the parent page, which is what an
 * unsectioned caller - the options endpoint, the product editor - wants.
 */
function requireSection(parentPage, level) {
  const parentGuard = requirePermission(parentPage, level);

  return function (req, res, next) {
    const section = normalise(req.query.section || req.body.section);

    if (!section) return parentGuard(req, res, next);

    // Pinned from the section that was authorised, never re-read from the
    // query further down.
    req.section = section;
    req.sectionTypes = SECTIONS[section].types;

    const guard = requirePermission(parentPage + '/' + SECTIONS[section].slug, level);
    return guard(req, res, next);
  };
}

module.exports = {
  SECTIONS: SECTIONS,
  normalise: normalise,
  requireSection: requireSection
};
