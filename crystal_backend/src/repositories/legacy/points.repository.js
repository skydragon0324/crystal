const legacy = require('../../config/legacy');

/**
 * THE MEMBER'S POINTS, ACROSS EVERY SYSTEM THAT KEEPS THEM.
 *
 * The vendor does not have a points table. It has FIVE, one per system, each
 * with its own balance - and they are not five sources of one number. Karaoke
 * points cannot buy an app. They are five currencies, and the console that
 * showed them was eight separate menu entries deep because nothing had ever
 * put them on one screen.
 *
 * So this reads all five and answers in one shape, and the page above shows a
 * balance per system over a single ledger the reader filters. Crystal's own
 * point_logs is the sixth system and is NOT merged in here - see
 * services/member.service.js, which stitches it on. This file only knows about
 * the vendor's.
 *
 * FOUR OF THE FIVE ARE THE SAME TABLE.
 *
 *   soft_point_log      point_type, status, reason, equ_num,
 *   appstore_point_log  pay_points, soft_points, related_pk,
 *   karaoke_point_log   is_agency, action_at
 *   bmedia_point_log
 *
 * Identical columns, four names. That is what makes a UNION possible and it is
 * the whole reason this collapses to one page rather than four.
 *
 *   activity_point_log  is the odd one: type_pk into activity_point_types for
 *                       a label, and a single `points` rather than the pay/soft
 *                       pair. It is unioned with the shape adapted, not with
 *                       its meaning bent - see below.
 */

/**
 * WHAT A POINT SYSTEM IS, declared once.
 *
 * `log` and `stats` are table names in ora_pid; `label` is what the member
 * sees. A system with no stats table has no balance to show and only a
 * history - which is true of nothing today, and is why the field is read
 * rather than assumed.
 */
const SYSTEMS = [
  { key: 'ACTIVITY', label: 'Activity', log: 'activity_point_log', stats: 'activity_point_stats' },
  { key: 'SOFTWARE', label: 'Software', log: 'soft_point_log', stats: 'soft_point_stats' },
  { key: 'APPSTORE', label: 'Appstore', log: 'appstore_point_log', stats: 'appstore_point_stats' },
  { key: 'KARAOKE', label: 'Karaoke', log: 'karaoke_point_log', stats: 'karaoke_point_stats' },
  { key: 'MEDIA', label: 'Media', log: 'bmedia_point_log', stats: 'bmedia_point_stats' }
];

/** The four that share a shape. ACTIVITY is deliberately not in this list. */
const SOFT_FAMILY = ['SOFTWARE', 'APPSTORE', 'KARAOKE', 'MEDIA'];

function conn() {
  return legacy.connection();
}

function systemOf(key) {
  return SYSTEMS.filter(function (s) { return s.key === key; })[0] || null;
}

/* ------------------------------------------------------------------ */
/*  balances                                                           */
/* ------------------------------------------------------------------ */

/**
 * Every system's standing for one member, in five queries.
 *
 * Five round trips rather than a UNION, because the stats tables do NOT all
 * have the same columns - activity_point_stats carries a `minus_points` the
 * others do not - and a UNION would have to invent a null for it on four
 * tables to hide a difference that is real.
 *
 * A member with no row in a system has never earned in it. That is a zero, not
 * a missing value, and it is shown: a balance card that disappears when it hits
 * zero is a card the reader cannot trust to be there.
 */
async function balances(userId) {
  const rows = await Promise.all(SYSTEMS.map(async function (system) {
    const row = await conn()(legacy.pid(system.stats))
      .where('user_pk', userId)
      .first();

    return {
      key: system.key,
      label: system.label,
      source: 'VENDOR',
      balance: row ? Number(row.total_points) || 0 : 0,

      /*
       * `limit_points` is a CAP, not a second balance - what the system will
       * let this member accumulate. Null when the system does not cap, which
       * the page renders as no cap rather than as a cap of zero.
       */
      cap: row && row.limit_points !== null && row.limit_points !== undefined
        ? Number(row.limit_points)
        : null,

      /* Only activity tracks points taken back. */
      spent: row && row.minus_points !== undefined && row.minus_points !== null
        ? Number(row.minus_points)
        : null,

      updated_at: row ? row.updated_at : null,
      has_row: !!row
    };
  }));

  return rows;
}

/* ------------------------------------------------------------------ */
/*  the ledger                                                         */
/* ------------------------------------------------------------------ */

/**
 * ONE MOVEMENT, whichever table it came out of.
 *
 * The four soft-family tables record `pay_points` and `soft_points` - what was
 * charged and what was granted. Crystal shows ONE signed amount, because a
 * ledger the reader has to subtract two columns of in their head is not a
 * ledger. `soft_points` is the movement; `pay_points` travels alongside as
 * context rather than being folded in, since the two are not always about the
 * same currency.
 */
function decodeSoft(row, system) {
  return {
    id: Number(row.table_pk),
    source: system.key,
    source_label: system.label,
    at: row.action_at,
    amount: Number(row.soft_points) || 0,
    charged: row.pay_points === null || row.pay_points === undefined
      ? null
      : Number(row.pay_points),
    reason: row.reason || null,
    reference: row.equ_num || null,
    by_agency: Number(row.is_agency) === 1
  };
}

/**
 * Activity movements, whose label lives in another table.
 *
 * `activity_point_types` holds a main and a sub type - "Daily login" /
 * "Fixed line" - and the log row's own `reason` is usually null. So the label
 * is built from the type and only falls back to `reason`, which is the reverse
 * of every other system here and the reason this cannot share decodeSoft.
 */
function decodeActivity(row) {
  const main = row.main_type || null;
  const sub = row.sub_type || null;

  return {
    id: Number(row.table_pk),
    source: 'ACTIVITY',
    source_label: 'Activity',
    at: row.action_at,
    amount: Number(row.points) || 0,
    charged: null,
    reason: row.reason || (main && sub ? main + ' · ' + sub : main) || null,
    reference: null,
    by_agency: false
  };
}

function softQuery(system, userId) {
  return conn()(legacy.pid(system.log))
    .where('user_pk', userId)
    .select('table_pk', 'user_pk', 'status', 'reason', 'equ_num',
      'pay_points', 'soft_points', 'related_pk', 'is_agency', 'action_at');
}

function activityQuery(userId) {
  return conn()(legacy.pid('activity_point_log') + ' as l')
    .leftJoin(legacy.pid('activity_point_types') + ' as t', 't.type_pk', 'l.type_pk')
    .where('l.user_pk', userId)
    .select('l.table_pk', 'l.points', 'l.reason', 'l.action_at',
      't.main_type', 't.sub_type');
}

/**
 * The member's movements, newest first, optionally from one system.
 *
 * WHY THIS PAGES IN JAVASCRIPT and not in SQL: five tables in two different
 * shapes, in a database that has to answer the same query on Oracle. A
 * portable UNION ALL over five differently-shaped selects, ordered and then
 * windowed, is a statement nobody will be able to change safely - and the set
 * it operates on is one member's own history, which is hundreds of rows, not
 * millions. The five reads are capped and merged here instead.
 *
 * The cap is deliberate and stated: a member with more than CAP movements in a
 * single system sees their most recent CAP. It is a real limit rather than a
 * silent one, and it is the honest trade for a query that stays readable.
 */
const CAP = 500;

async function ledger(userId, filters, paging) {
  const wanted = filters.source ? [filters.source].filter(systemOf) : SYSTEMS.map(function (s) { return s.key; });

  const reads = wanted.map(async function (key) {
    if (key === 'ACTIVITY') {
      const rows = await activityQuery(userId).orderBy('l.action_at', 'desc').limit(CAP);
      return rows.map(decodeActivity);
    }

    const system = systemOf(key);
    if (!system || SOFT_FAMILY.indexOf(key) === -1) return [];

    const rows = await softQuery(system, userId).orderBy('action_at', 'desc').limit(CAP);
    return rows.map(function (row) { return decodeSoft(row, system); });
  });

  const merged = [].concat.apply([], await Promise.all(reads));

  merged.sort(function (a, b) {
    const gap = new Date(b.at) - new Date(a.at);
    /* Same instant across two tables - the seeds do exactly this - so the id
       breaks the tie and the order stops depending on which read finished. */
    return gap !== 0 ? gap : b.id - a.id;
  });

  const offset = paging.offset || 0;
  const limit = paging.limit || 20;

  return { rows: merged.slice(offset, offset + limit), total: merged.length };
}

module.exports = {
  SYSTEMS: SYSTEMS,
  CAP: CAP,
  balances: balances,
  ledger: ledger
};
