'use strict';

const db = require('../config/db');

const TABLE = 'site_notices';
const ORIGINS = 'notice_origins';

/**
 * THE NOTICES A VISITOR IS GREETED WITH.
 *
 * "Live" is not a column, and that is the whole point of putting it here: it
 * is PUBLISHED and inside its window, and the window is checked against the
 * database's clock rather than the browser's. A visitor with a wrong system
 * date should not see next month's announcement, and an editor should not have
 * to remember to switch off a notice about a sale that has ended.
 *
 *   status      PUBLISHED - somebody decided it is ready
 *   starts_at   NULL means "already started"
 *   ends_at     NULL means "no end"
 *
 * IT USED TO BE ONE NOTICE. Two live ones meant the higher `sort_order` won
 * and the runner-up waited for the first to expire, which is a rule about the
 * DIALOG - a stack of modals on arrival is an obstacle rather than a greeting
 * - that had been written into the query. So a second thing worth saying on
 * the same day did not get said at all.
 *
 * The rule belongs where the dialog is. This answers everything that is live,
 * highest first; the dialog pages through them one at a time and the
 * notification page lists them.
 */
function liveScope() {
  return db(TABLE + ' as n')
    .where('n.is_deleted', false)
    .where('n.status', 'PUBLISHED')
    .where(function () {
      this.whereNull('n.starts_at').orWhere('n.starts_at', '<=', db.fn.now());
    })
    .where(function () {
      this.whereNull('n.ends_at').orWhere('n.ends_at', '>=', db.fn.now());
    });
}

/*
 * The origin travels WITH the notice rather than as an id the storefront has
 * to resolve: a list of ten announcements is unreadable without knowing who
 * each one is from, and a second request to find that out would draw the list
 * twice - once unlabelled, once labelled.
 */
const COLUMNS = [
  'n.id', 'n.title', 'n.content',
  'n.starts_at', 'n.ends_at', 'n.sort_order', 'n.updated_at',
  'n.origin_id',
  'o.code as origin_code',
  'o.name as origin_name',
  'o.colour as origin_colour'
];

function withOrigin(qb) {
  return qb.leftJoin(ORIGINS + ' as o', 'o.id', 'n.origin_id');
}

/**
 * Everything live right now, in reading order.
 *
 * `sort_order` decides which is read first; `id` breaks the tie so two
 * notices written on the same day at the same rank do not swap places between
 * one request and the next.
 */
function live(limit) {
  return withOrigin(liveScope())
    .orderBy([{ column: 'n.sort_order', order: 'desc' }, { column: 'n.id', order: 'desc' }])
    .limit(limit || 20)
    .select(COLUMNS);
}

/**
 * The top one, for a caller that genuinely wants a single notice.
 *
 * Kept because "is there anything to say at all" is a different question from
 * "what is there to say", and answering the first with an array the caller has
 * to measure is a worse answer.
 */
function current() {
  return live(1).then(function (rows) { return rows[0] || null; });
}

module.exports = {
  TABLE: TABLE,
  ORIGINS: ORIGINS,
  liveScope: liveScope,
  live: live,
  current: current
};
