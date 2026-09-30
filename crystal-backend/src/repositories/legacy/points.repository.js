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
 * So this reads all five and answers in one shape. The storefront reads that
 * shape on two pages - the four software ledgers on one, the activity log on
 * its own, because a category and a cap have nothing in common with a pay
 * figure and a status - and filters each by period, search and (on activity)
 * category, all applied in the queries below. Crystal's own
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
/**
 * WHAT `soft_point_log.point_type` MEANS - vendor_backend constants
 * SOFT_POINT_TYPES: APPSTORE 0, KARAOKE 1, BMEDIA 2, MANAGER 3.
 *
 * The first three name the systems that have ledgers of their own now
 * (appstore_point_log, karaoke_point_log, bmedia_point_log); soft_point_log is
 * where they were written before those tables existed, and where a MANAGER
 * still writes the adjustments - overwhelmingly deductions - that the member
 * menu calls "Minus". The vendor reads the table with point_type 3 and nothing
 * else in every place a member sees it: the Minus page
 * (AccountSoftMinusPointLogPage sends SOFT_POINT_TYPES.MANAGER), the account
 * overview's minus_point (findTotalSoftPointByFilter), and the recalculation
 * that keeps soft_point_stats (sumSoftPointStatsByUserPk).
 */
const SOFT_POINT_TYPES = { APPSTORE: 0, KARAOKE: 1, BMEDIA: 2, MANAGER: 3 };

/**
 * `is_agency` on the four soft-family tables - vendor FLAG_USER 0, FLAG_AGENCY
 * 1. A movement made BY AN AGENCY on a member's behalf is recorded against the
 * member but is not theirs to count: the vendor's stats recalculations and its
 * minus_point sum only rows with 0. The ledgers here still LIST agency rows,
 * tagged as such (decodeSoft's `by_agency`); only the totals leave them out.
 */
const FLAG_USER = 0;

/*
 * `pointType`, where a system is only PART of its table. SOFTWARE is the one:
 * without it the Minus ledger listed every soft_point_log row a member had,
 * whatever it was - the vendor's pre-split Appstore, Karaoke and Media rows
 * included, all under the heading "Minus". Every read of the system goes
 * through softQuery or softSum below, and both apply it, so the list and the
 * total cannot disagree about which rows are the ledger.
 */
const SYSTEMS = [
  { key: 'ACTIVITY', label: 'Activity', log: 'activity_point_log', stats: 'activity_point_stats' },
  {
    key: 'SOFTWARE',
    label: 'Software',
    log: 'soft_point_log',
    stats: 'soft_point_stats',
    pointType: SOFT_POINT_TYPES.MANAGER
  },
  { key: 'APPSTORE', label: 'Appstore', log: 'appstore_point_log', stats: 'appstore_point_stats' },
  { key: 'KARAOKE', label: 'Karaoke', log: 'karaoke_point_log', stats: 'karaoke_point_stats' },
  { key: 'MEDIA', label: 'Media', log: 'bmedia_point_log', stats: 'bmedia_point_stats' }
];

/** The four that share a shape. ACTIVITY is deliberately not in this list. */
const SOFT_FAMILY = ['SOFTWARE', 'APPSTORE', 'KARAOKE', 'MEDIA'];

/**
 * WHAT A SOFT-FAMILY MOVEMENT WAS, in the vendor's three words.
 *
 * `status` is on every one of the four tables and the vendor's member pages
 * draw it as a tag on every row - Charge, Minus, Refund - because it is the
 * only thing on the row that says which way the points went without reading
 * the sign (vendor_backend constants SOFT_POINT_STATUS: PLUS 0, MINUS 1,
 * REFUND 2; the client calls the first one CHARGE). It was selected here and
 * then dropped on the floor by decodeSoft, so the web had nothing to draw.
 *
 * A number outside the table is null rather than a guess, the same rule the
 * Appstore mapper keeps for its states.
 */
const SOFT_STATUS = { 0: 'CHARGE', 1: 'MINUS', 2: 'REFUND' };

/**
 * THE ACTIVITY CATEGORIES, as ranges of `type_pk`.
 *
 * A type is six digits - two for the main type, two for the sub type, two for
 * the day (vendor sql 10_table_points.sql) - and the vendor's member page
 * filters on the first two: Fixed 10, Mobile 20, Blog 30, and "Etc", which is
 * the duty, period and manager types 40, 50 and 90 together
 * (POINT_TYPE_PREFIXES.OTHER in pointModel.findActivityPointLog).
 *
 * RANGES, NOT `LIKE '10%'`. The vendor matches the prefix as text, which
 * Oracle does by converting the integer silently and PostgreSQL refuses to do
 * at all - `integer LIKE text` is an error there. A six-digit type whose first
 * two digits are 10 is exactly the integers from 100000 to 109999, so the
 * comparison is written as that and reads the same on both drivers.
 */
const ACTIVITY_CATEGORIES = {
  FIXED: [10],
  MOBILE: [20],
  BLOG: [30],
  OTHER: [40, 50, 90]
};

/** The category a type falls in, or null for a type outside all of them. */
function categoryOf(typePk) {
  const prefix = Math.floor(Number(typePk) / 10000);

  return Object.keys(ACTIVITY_CATEGORIES).filter(function (name) {
    return ACTIVITY_CATEGORIES[name].indexOf(prefix) !== -1;
  })[0] || null;
}

/**
 * THE ACTIVITY TYPES THAT ARE ABOUT AN ARTICLE, and whose row therefore names
 * one - vendor_backend constants POINT_TYPE_VALUES.
 *
 * The vendor shows these reasons as "article title | reason", because "Posted
 * a topic" on its own does not say which topic, and a member checking why they
 * were given thirty points is looking for the article. `related_pk` holds the
 * article id for a post, a reply, a correction and a copied article, and for a
 * recommendation made on the WEB (which is the one carrying an IP address).
 *
 * A recommendation made on the MOBILE app points at the recommendation row
 * instead, and the vendor walks one more table to reach the article. That
 * table is not in Crystal's legacy schema (sql/legacy/ora_blog.sql), so a
 * query naming it would fail on a machine installed from Crystal alone - those
 * rows keep their reason without a title rather than taking the page down.
 */
const ARTICLE_TYPES = [300001, 300002, 300003, 300004, 300005, 300006, 300007, 300008, 300009,
  900001, 900002, 900004];
const RECOMMEND_TYPES = [300101, 300102, 300103];

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

    /*
     * MINUS IS SUMMED FROM ITS LEDGER, not read from soft_point_stats - the
     * way the vendor's own account overview gets its minus_point, and so over
     * exactly the rows the Minus ledger lists (point_type 3; see SYSTEMS). The
     * stats row is a cache of that sum, and a cache that has drifted would put
     * a balance over the ledger that its rows do not add up to.
     */
    const balance = system.pointType !== undefined
      ? await softSum(system.key, userId)
      : (row ? Number(row.total_points) || 0 : 0);

    return {
      key: system.key,
      label: system.label,
      source: 'VENDOR',
      balance: balance,

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
    status: SOFT_STATUS[String(Number(row.status))] || null,
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
    /*
     * The article the movement was about, kept SEPARATE from the reason
     * rather than glued onto it as the vendor's page does. The title is the
     * blog's data and the reason may be a type label; the page decides how
     * the two are set side by side, and a search for the title still finds
     * the row.
     */
    article_title: row.article_title || null,
    category: categoryOf(row.type_pk),
    reference: null,
    by_agency: false
  };
}

/**
 * THE PERIOD AND THE SEARCH, which every one of these ledgers takes.
 *
 * The vendor's member pages all carry the same header - two date pickers and a
 * search box - and its model filters with exactly these expressions: the DATE
 * PART as text against YYYY-MM-DD, both ends inclusive, and a lower-cased LIKE
 * (pointModel.findSoftPointLog, findActivityPointLog). TO_CHAR on both sides
 * is what repositories/legacy/oldlogs.repository.js does for the same reason:
 * it is the one spelling Oracle and PostgreSQL agree on, and it needs no
 * timezone to be decided for a day somebody picked from a calendar.
 *
 * Applied in SQL, BEFORE the cap - a filter applied to the newest CAP rows
 * afterwards would quietly answer "nothing in March" for a member whose March
 * is simply older than their last five hundred movements.
 */
function windowed(qb, column, filters) {
  if (filters.from) qb.where(conn().raw('TO_CHAR(' + column + ", 'YYYY-MM-DD')"), '>=', String(filters.from).slice(0, 10));
  if (filters.to) qb.where(conn().raw('TO_CHAR(' + column + ", 'YYYY-MM-DD')"), '<=', String(filters.to).slice(0, 10));
  return qb;
}

/** A lower-cased substring over whichever columns a ledger is searched by. */
function searched(qb, columns, keyword) {
  const needle = String(keyword || '').trim().toLowerCase();
  if (!needle) return qb;

  return qb.where(function () {
    const group = this;
    columns.forEach(function (column, index) {
      group[index === 0 ? 'whereRaw' : 'orWhereRaw']('LOWER(' + column + ') LIKE ?', ['%' + needle + '%']);
    });
  });
}

/** One member's rows of one soft-family ledger - its `pointType` applied, see SYSTEMS. */
function softRows(system, userId) {
  const qb = conn()(legacy.pid(system.log)).where('user_pk', userId);
  if (system.pointType !== undefined) qb.where('point_type', system.pointType);
  return qb;
}

/**
 * WHAT ONE SOFT-FAMILY LEDGER ADDS UP TO for a member: SUM(soft_points) over
 * the member's own rows (is_agency = FLAG_USER), which is the figure the
 * vendor's recalculations cache in *_point_stats.total_points and the one its
 * account overview computes on the spot for Minus. Summed in SQL, so the
 * numeric column's three decimals arrive exact; a member with no rows is 0.
 */
async function softSum(key, userId) {
  const system = systemOf(key);
  if (!system || SOFT_FAMILY.indexOf(key) === -1) throw new Error('not a soft-family ledger: ' + key);

  const row = await softRows(system, userId)
    .where('is_agency', FLAG_USER)
    .sum({ total: 'soft_points' })
    .first();

  return row && row.total !== null && row.total !== undefined ? Number(row.total) || 0 : 0;
}

function softQuery(system, userId, filters) {
  const qb = softRows(system, userId)
    .select('table_pk', 'user_pk', 'status', 'reason', 'equ_num',
      'pay_points', 'soft_points', 'related_pk', 'is_agency', 'action_at');

  /* The vendor searches the reason and the equipment number, and nothing else. */
  searched(qb, ['reason', 'equ_num'], filters.keyword);
  return windowed(qb, 'action_at', filters);
}

function activityQuery(userId, filters) {
  const qb = conn()(legacy.pid('activity_point_log') + ' as l')
    .leftJoin(legacy.pid('activity_point_types') + ' as t', 't.type_pk', 'l.type_pk')
    .leftJoin(legacy.blog('blog_article') + ' as a', function () {
      /* See ARTICLE_TYPES: which rows name an article in `related_pk`. */
      this.on(function () {
        this.onIn('l.type_pk', ARTICLE_TYPES).andOn('l.related_pk', 'a.id');
      }).orOn(function () {
        this.onIn('l.type_pk', RECOMMEND_TYPES).andOnNotNull('l.ip_address').andOn('l.related_pk', 'a.id');
      });
    })
    .where('l.user_pk', userId)
    .select('l.table_pk', 'l.type_pk', 'l.points', 'l.reason', 'l.action_at',
      't.main_type', 't.sub_type', 'a.title as article_title');

  const category = ACTIVITY_CATEGORIES[filters.category];
  if (category) {
    qb.where(function () {
      const group = this;
      category.forEach(function (prefix, index) {
        const low = prefix * 10000;
        group[index === 0 ? 'where' : 'orWhere'](function () {
          this.where('l.type_pk', '>=', low).andWhere('l.type_pk', '<', low + 10000);
        });
      });
    });
  }

  /*
   * The vendor also searches `ip_address`, which is a thing a member never
   * sees on this page and cannot know to type. The article title is searched
   * instead, because it is on the row.
   */
  searched(qb, ['l.reason', 't.main_type', 't.sub_type', 'a.title'], filters.keyword);
  return windowed(qb, 'l.action_at', filters);
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
  const given = filters || {};
  const wanted = given.source ? [given.source].filter(systemOf) : SYSTEMS.map(function (s) { return s.key; });

  const reads = wanted.map(async function (key) {
    if (key === 'ACTIVITY') {
      const rows = await activityQuery(userId, given).orderBy('l.action_at', 'desc').limit(CAP);
      return rows.map(decodeActivity);
    }

    /*
     * A CATEGORY IS AN ACTIVITY WORD. Asked for alongside every system, the
     * four soft ledgers have nothing it could match, so they contribute no
     * rows rather than ignoring it - a filter that is silently dropped is how
     * a list comes to show more than it says it does.
     */
    if (given.category) return [];

    const system = systemOf(key);
    if (!system || SOFT_FAMILY.indexOf(key) === -1) return [];

    const rows = await softQuery(system, userId, given).orderBy('action_at', 'desc').limit(CAP);
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
  SOFT_FAMILY: SOFT_FAMILY,
  SOFT_POINT_TYPES: SOFT_POINT_TYPES,
  FLAG_USER: FLAG_USER,
  ACTIVITY_CATEGORIES: Object.keys(ACTIVITY_CATEGORIES),
  CAP: CAP,
  balances: balances,
  softSum: softSum,
  ledger: ledger
};
