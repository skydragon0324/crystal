'use strict';

const legacy = require('../../config/legacy');
const codes = require('./codes');

/**
 * THE THREE THUMBS, written the way the vendor writes them.
 *
 * A signed-in reader can give an article - or a reply - a GOLD, SILVER or
 * BRONZE thumb. The vendor's implementation is submitBlogRating, twice over:
 *
 *   POST /blog_rating_submit  (routes/vendorRoutes.js, the WEBSITE)
 *     parseWebToken, validateSubmitBlogRating,
 *     controllers/web/webBlogController.js
 *   POST /v2/blog_rating_submit  (routes/v2/blogRoutes.js, the APP)
 *     verifyUserToken, validateSubmitBlogRating,
 *     controllers/client/clientBlogController.js
 *
 * and the model methods both call - findOldArticleUserInfoByPk,
 * findOldRatingCountByFilter, increaseOldBlogInfo, addOldBlogRating in
 * models/blogModel.js. Crystal is a website, so the WEBSITE route is the one
 * followed; where the app's differs it is said below.
 *
 * ======================================================================
 * THE VENDOR'S RULES, and where each lives in Crystal
 * ======================================================================
 *
 * 1. SIGNED IN. No reader, 401 - `if (!user)`. Crystal: the member router's
 *    requireUser guard, so no signed-out request reaches this file.
 *
 * 2. BOTH FIELDS PRESENT. validateSubmitBlogRating requires blog_pk and
 *    rating_type. Crystal: the id is in the path; the kind is checked by the
 *    service before anything is read.
 *
 * 3. A KIND IT KNOWS. rating_type 1 -> gold_recom_num, 2 -> silber_recom_num,
 *    3 -> recommended_num; anything else is refused. (The website controller
 *    means 400 and throws a 500 - its message template calls a string as a
 *    function; the app's is the intended 400. Crystal answers 400, and checks
 *    it FIRST rather than after the database has been asked who wrote the
 *    row: a request that is not a thumb is refused before it costs a query.)
 *    See codes.THUMB for why bronze is `recommended_num`.
 *
 * 4. THE ROW EXISTS. The author is looked up by id; no row, 404. Crystal: the
 *    row has to exist AND BE ONE A READER CAN SEE - a published article, or a
 *    published reply in a published thread. The vendor does not check state
 *    at all; its reader screens only ever show published rows, so in practice
 *    only those are rated, and Crystal makes that the rule rather than letting
 *    an id that is guessed rate a draft (and confirm, by the answer, that it
 *    exists). This is the one rule Crystal tightens.
 *
 * 5. NOT YOUR OWN. The reader's login equals the row's user_userid, 400
 *    BLOG_ERR_RECOMM_SELF. Exact string comparison, as the vendor makes it.
 *    Per row: a reply is its own author's, not the article's.
 *
 * 6. ONCE PER READER PER ROW, OF ANY KIND - AND FOR GOOD. A rating row with
 *    this article_id and this recommend_user_userid already exists, 409
 *    BLOG_ERR_RECOMM_CONFLICT. The kind is not part of the check: a reader
 *    who gave silver cannot also give gold. There is NO way to change or
 *    withdraw a thumb - the vendor has no endpoint that updates or deletes a
 *    rating row - and Crystal adds none.
 *
 * 7. THE COUNT, THEN THE LEDGER. increaseOldBlogInfo adds one to the kind's
 *    column on blog_article_info; addOldBlogRating inserts
 *    { id: blog_article_recommend_S.nextval, article_id, recommend_type,
 *    recommend_user_userid, ip, reg_date: now }. `ip` is the body's `imei`,
 *    which the vendor's website sends as the empty string - so that is what
 *    Crystal writes (Oracle stores it as NULL; the app writes the IMEI).
 *
 * WHAT CRYSTAL DOES DIFFERENTLY, ON PURPOSE:
 *
 *   ONE TRANSACTION, WITH THE COUNTERS ROW LOCKED. The vendor runs the check,
 *   the increment and the insert as three separate statements, so two taps
 *   arriving together both pass the check and the reader is counted twice -
 *   and a failed insert leaves a count with no ledger row behind it. Here the
 *   info row is locked FOR UPDATE first, which queues a second thumb on the
 *   same row behind the first; it then finds the first one's ledger row and
 *   is refused. Nothing is added to the vendor's tables to get this - no
 *   unique index, no trigger.
 *
 *   A MISSING COUNTERS ROW IS CREATED, not a 500. increaseOldBlogInfo moving
 *   no row is the vendor's "internal server error"; an article the vendor's
 *   console made without its info row is still an article a reader can see,
 *   so the row is written the way countView already writes one for a visit.
 *
 * WHAT IS NOT CARRIED, AND WHY:
 *
 *   THE DEVICE LIMIT. The app refuses a sixth rating from one IMEI on one
 *   article (OLD_BLOG_RATING_LIMIT 5, counted on `ip`). The website route has
 *   no device and does not check - and neither does Crystal, which is the
 *   website. An address is not a device: a household or an office behind one
 *   address would be refused after five people.
 *
 *   THE WOMEN'S DAY RULES. The app's route also capped thumbs inside one
 *   campaign thread between 2026-02-28 and 2026-03-15. That window has
 *   closed and the website never had it.
 *
 *   ACTIVITY POINTS for a thumb received are behind `if (false)` in the
 *   vendor's code. Not awarded there, not awarded here.
 */

const ARTICLES = 'blog_article';
const INFOS = 'blog_article_info';
const RECOMMENDS = 'blog_article_recommend';

const PUBLIC = codes.ARTICLE_STATE.PUB_APPROVED;

/** What the website sends as the device. See rule 7. */
const WEBSITE_DEVICE = '';

function conn(trx) {
  return trx || legacy.connection();
}

function countsOf(row) {
  return {
    gold: Number((row && row.gold_recom_num) || 0),
    silver: Number((row && row.silber_recom_num) || 0),
    bronze: Number((row && row.recommended_num) || 0)
  };
}

/**
 * A row a reader can see, with who wrote it - or null.
 *
 * An article: published and top level. A reply: published, and its thread
 * published and top level. Anything else is not somewhere a thumb can be
 * given from, whatever its id.
 */
async function findTarget(id) {
  const row = await conn()(legacy.blog(ARTICLES) + ' as a')
    .leftJoin(legacy.blog(ARTICLES) + ' as p', 'p.id', 'a.parent')
    .where('a.id', id)
    .where('a.state', PUBLIC)
    .where(function () {
      this.where('a.parent', 0)
        .orWhere(function () {
          this.where('p.state', PUBLIC).where('p.parent', 0);
        });
    })
    .first('a.id', 'a.parent', 'a.user_userid');

  if (!row) return null;

  return {
    id: Number(row.id),
    parent_id: Number(row.parent || 0) || null,
    author: row.user_userid === null || row.user_userid === undefined ? null : String(row.user_userid)
  };
}

/** The three counts on one row. */
async function counts(id, trx) {
  const row = await conn(trx)(legacy.blog(INFOS))
    .where('id', id)
    .first('gold_recom_num', 'silber_recom_num', 'recommended_num');

  return countsOf(row);
}

/**
 * The reader's own thumbs on a set of rows: [{ id, kind, at }], one per row
 * they have rated.
 *
 * The vendor has no such read - its page cannot tell a reader which thumb
 * they gave. This only reads the ledger the vendor writes. A row the vendor's
 * app wrote before recommend_type existed has no kind, and still counts as
 * rated; it comes back with `kind: null`.
 */
async function mine(login, ids) {
  if (!login || !ids.length) return [];

  const rows = await conn()(legacy.blog(RECOMMENDS))
    .where('recommend_user_userid', login)
    .whereIn('article_id', ids)
    .orderBy('id', 'asc')
    .select('article_id', 'recommend_type', 'reg_date');

  const seen = {};
  return rows.filter(function (row) {
    const key = String(Number(row.article_id));
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  }).map(function (row) {
    return {
      id: Number(row.article_id),
      kind: codes.thumbFromCode(row.recommend_type),
      at: row.reg_date || null
    };
  });
}

/**
 * GIVE ONE THUMB - rules 6 and 7, in one transaction.
 *
 * Answers `{ given: true, kind, recommendations }` when it was counted, and
 * `{ given: false, kind: <the one already given>, recommendations }` when the
 * reader had already rated the row. The service turns the second into the
 * vendor's 409. The counts are read inside the same transaction, so what the
 * reader is shown is what this thumb produced.
 */
async function give(id, login, kind) {
  const thumb = codes.THUMB[kind];

  return legacy.connection().transaction(async function (trx) {
    /*
     * The lock that serialises two thumbs on one row. See the header.
     *
     * A plain select, not first(): on Oracle first() wraps the query in a
     * ROWNUM view, and FOR UPDATE is not allowed inside one. The key is the
     * primary key, so there is one row or none either way.
     */
    const locked = await trx(legacy.blog(INFOS)).where('id', id).select('id').forUpdate();
    if (!locked.length) {
      /* Inserting it holds the new row's lock for the rest of the transaction. */
      await trx(legacy.blog(INFOS)).insert({ id: id, visited_num: 0 });
    }

    const existing = await trx(legacy.blog(RECOMMENDS))
      .where('article_id', id)
      .where('recommend_user_userid', login)
      .orderBy('id', 'asc')
      .first('recommend_type');

    if (existing) {
      return {
        given: false,
        kind: codes.thumbFromCode(existing.recommend_type),
        recommendations: await counts(id, trx)
      };
    }

    /* The count first, then the ledger - the vendor's order (rule 7). */
    await trx(legacy.blog(INFOS)).where('id', id).increment(thumb.column, 1);

    const ratingId = await legacy.nextValue(legacy.blog(RECOMMENDS + '_s'), trx);
    await trx(legacy.blog(RECOMMENDS)).insert({
      id: ratingId,
      article_id: id,
      recommend_type: thumb.code,
      recommend_user_userid: login,
      ip: WEBSITE_DEVICE,
      reg_date: new Date()
    });

    return { given: true, kind: kind, recommendations: await counts(id, trx) };
  });
}

/** How many thumbs a row carries in the ledger - for the console's purge report. */
async function countFor(id) {
  const row = await conn()(legacy.blog(RECOMMENDS)).where('article_id', id).count({ c: '*' }).first();
  return Number(row.c);
}

/** The ledger rows of a row about to be purged. Children first; see articles.repository purge. */
function purgeFor(id, trx) {
  return conn(trx)(legacy.blog(RECOMMENDS)).where('article_id', id).del();
}

module.exports = {
  KINDS: Object.keys(codes.THUMB),

  findTarget: findTarget,
  counts: counts,
  mine: mine,
  give: give,
  countFor: countFor,
  purgeFor: purgeFor
};
