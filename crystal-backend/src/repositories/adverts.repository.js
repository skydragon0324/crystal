const db = require('../config/db');

const TABLE = 'site_adverts';
const POPUPS = 'site_popups';

/**
 * The advertising runs at the top of the homepage and the smartphone page.
 *
 * Only the storefront's read lives here; the console edits the table through
 * the generic CRUD routes, one per placement (routes/admin.routes.js).
 */

const PLACEMENTS = ['HOME', 'SMARTPHONE'];

function isPlacement(value) {
  return PLACEMENTS.indexOf(String(value || '').toUpperCase()) !== -1;
}

/**
 * What a visitor on this device sees: active, not in the recycle bin, the
 * device's own crops plus the ones marked for both, in the order the console
 * put them. The same narrowing media.ofOwner does, so a phone never downloads
 * the 1920px desktop banner.
 */
function live(placement, device) {
  const qb = db(TABLE)
    .where({ placement: String(placement).toUpperCase(), status: 'ACTIVE', is_deleted: false })
    .orderBy([{ column: 'sort_order' }, { column: 'id' }])
    .select('id', 'placement', 'device_type', 'file_path', 'alt_text', 'link_url', 'sort_order');

  if (device) qb.whereIn('device_type', [device, 'all']);
  return qb;
}

/**
 * The popups that are running TODAY, in the order they are clicked through.
 *
 * The period is inclusive at both ends and compared as a DAY rather than an
 * instant - `CURRENT_DATE` against two `date` columns - so a campaign booked
 * for the 1st to the 7th runs for seven whole days for every reader, wherever
 * they are. It is the vendor's rule for home_popups, kept deliberately.
 *
 * There is no device narrowing here: a popup is one picture shown over the
 * whole page, and the crop that suits both is the operator's to upload.
 */
function livePopups() {
  return db(POPUPS)
    .where({ status: 'ACTIVE', is_deleted: false })
    .where('start_date', '<=', db.raw('CURRENT_DATE'))
    .where('end_date', '>=', db.raw('CURRENT_DATE'))
    .orderBy([{ column: 'sort_order' }, { column: 'id' }])
    .select('id', 'file_path', 'alt_text', 'link_url', 'start_date', 'end_date', 'sort_order');
}

module.exports = {
  PLACEMENTS: PLACEMENTS,
  isPlacement: isPlacement,
  live: live,
  livePopups: livePopups
};
