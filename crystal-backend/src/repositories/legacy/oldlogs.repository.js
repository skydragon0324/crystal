const legacy = require('../../config/legacy');
const identity = require('./identity.repository');

/**
 * THE THREE "OLD LOG" PAGES, out of the systems that ran before this one.
 *
 * A member's licence and prize history did not begin when Crystal did. The
 * karaoke keygen service, the media service and the old customer database
 * each kept their own record, and each of those is one page here. Crystal
 * reads them and writes nothing.
 *
 * A transcription of vendor_backend/models/eprodModel.js and
 * customerModel.findCustomerPrizeLog. The filtering is theirs, and every one
 * of the conditions below excludes rows a member would otherwise see, so
 * dropping any of them is a visible change to somebody's history rather than
 * a tidy-up:
 *
 *   AGENCY KEYINGS ARE NOT YOURS. `is_agent = 0` on the karaoke log - a shop
 *   keying a licence on your behalf is recorded against you but is not your
 *   own activity, and the old page never showed it.
 *
 *   ONLY WHAT WORKED. `resultlog = 0` on karaoke and `result = 1` on media -
 *   note that the two services spell success with opposite numbers. A failed
 *   attempt cost nothing and belongs in the keygen log, not the history.
 *
 *   NOT WHAT WAS REVERSED. `error_status = 2` is the code for a keying that
 *   was undone; anything else in that table is a note, and no row at all is
 *   simply fine - hence the OR NULL.
 *
 *   NOTHING BEFORE THE CUTOVER. Both services began keeping a usable log on
 *   the same day, and rows before it are fragments of an earlier format.
 *
 *   NOTHING AFTER THE MERGE. See `limitFor` below - this is the one that
 *   matters most.
 */

const CUTOVER = '2025-08-20 00:00:00';

/**
 * The merge log's own vocabulary, and both numbers are worth stating.
 *
 * `merge_type` 0 is a MERGE and 1 is a SPLIT - the opposite way round from
 * how anyone reads it at a glance, and only a merge closes the old history.
 * A split re-separates an account and leaves its history where it was.
 *
 * `id_type` 0 means the row is keyed by the FIXED id, which is the one the
 * platform issues; the other three are the storefronts' own.
 */
const MERGE_TYPE_MERGE = 0;
const MERGE_ID_TYPE_FIXED = 0;

const MERGE_LOG = 'user_merge_log';

/**
 * What the media carry-forward row calls itself - AS AN ADDRESS, not a sentence.
 *
 * The vendor writes the words into the SELECT itself
 * (`'${EPROD_MEDIA_OLD_POINT_REASON}' as reason`), which is how a member
 * reading the page in Chinese ended up with one English line among a column
 * of data. Every OTHER reason on these pages comes out of the old databases
 * and cannot be translated - a provider's short name is `MRS` in any language
 * - so this is the only cell on the three pages Crystal itself writes, and
 * the only one that can be said in the reader's language.
 *
 * It is resolved in services/storefronts.service.js, where the request's
 * locale is known. This file stays a database reader and does not import i18n.
 */
const CARRY_FORWARD_REASON = 'oldLogs.balanceCarriedOver';

/** The vendor stores the media score in fifteenths of a point. */
const MEDIA_SCORE_DIVISOR = 15;

function conn() {
  return legacy.connection();
}

/**
 * WHERE THIS MEMBER'S OLD HISTORY STOPS.
 *
 * When an account was MERGED into the platform, everything the old system
 * recorded after that instant belongs to the new account and is already on
 * the ordinary pages. Showing it on the old log too would count every
 * movement twice, and the totals a member checks would not add up against
 * anything.
 *
 * An account that was never merged has no limit and its whole history shows.
 */
async function limitFor(userId, login) {
  /*
   * THE MERGE LOG IS KEYED BY THE MEMBER'S USER ID, not by their user_pk.
   *
   * `merge_id` is a varchar holding the FIXED ID - the user ID the platform
   * issues - and the vendor looks it up with the id the member is signed in
   * as: `UserModel.findMergeLogByFixedId(user.user_id)` in
   * webUserController.fetchKaraOldLog. It can do that because merging
   * REWRITES `users.user_id` to the fixed id (commonPrhnController: "update
   * user_id as fixed_id"), so after a merge the two are the same string.
   *
   * Crystal used to send the user_pk instead - it read `user_merge_ids` by
   * `pvendor_pk` and used that row's `fixed_id`. Two things were wrong with
   * it and both fail the same silent way, with no cap and a member seeing
   * history that is already on their ordinary pages: the identity bridge
   * writes the storefront keys and leaves `fixed_id` NULL, so the lookup
   * usually stopped at the first line; and it cost a second query against a
   * table this file otherwise has no business reading.
   *
   * THE FIXED-ID FALLBACK IS KEPT for the case the vendor cannot have: a row
   * whose `user_id` was not rewritten, which is what a merge log restored
   * from an older export looks like. It costs one query and only on accounts
   * the first lookup found nothing for.
   */
  const logged = await mergeLogFor(login) || await mergeLogFor(await fixedIdOf(userId, login));

  if (!logged || Number(logged.merge_type) !== MERGE_TYPE_MERGE) return null;

  return logged.action_at || null;
}

/**
 * The newest merge-log entry for one id, or null.
 *
 * THE MERGE LOG, not the merge row. They are different tables and only the
 * log records WHEN - the row it belongs to says who a member is in each
 * system and says nothing about the moment they became one account.
 *
 * Newest first: an account can be merged, split and merged again, and it is
 * the most recent action that decides where the old history stops.
 */
function mergeLogFor(mergeId) {
  if (!mergeId) return null;

  return conn()(legacy.pid(MERGE_LOG))
    .where('id_type', MERGE_ID_TYPE_FIXED)
    .where('merge_id', mergeId)
    .orderBy('action_at', 'desc')
    .select('merge_type')
    .select(asTextAliased('action_at', 'action_at'))
    .first();
}

/** The fallback key, and null when it is the one already tried. */
async function fixedIdOf(userId, login) {
  const row = await identity.mergeRow(userId);
  const fixed = row && row.fixed_id;
  return fixed && fixed !== login ? fixed : null;
}

/**
 * Timestamps are compared AS TEXT, exactly as the vendor does.
 *
 * `TO_CHAR(col, 'YYYY-MM-DD HH24:MI:SS') >= '2025-08-20 00:00:00'` rather
 * than a date comparison. It is not how anyone would write it fresh, but the
 * merge timestamp on the other side of the comparison is stored as that same
 * string - so switching to a real date comparison here would change which
 * rows a member sees, in whichever direction their timezone happens to lean.
 */
function asText(column) {
  return conn().raw("TO_CHAR(" + column + ", 'YYYY-MM-DD HH24:MI:SS')");
}

/** The same expression, aliased, for a select list. */
function asTextAliased(column, alias) {
  return conn().raw("TO_CHAR(" + column + ", 'YYYY-MM-DD HH24:MI:SS') as " + alias);
}

function windowed(query, column, limitTime) {
  query.where(asText(column), '>=', CUTOVER);
  if (limitTime) query.where(asText(column), '<=', limitTime);
  return query;
}

/* ------------------------------------------------------------------ */

/** The karaoke keygen history: what you keyed yourself, and it worked. */
async function karaoke(userId, login, paging) {
  const limitTime = await limitFor(userId, login);

  const scope = function () {
    const qb = conn()(legacy.license('tbl_licgen') + ' as log')
      .leftJoin(legacy.license('tbl_error_list') + ' as err', 'log.id', 'err.lic_id')
      .where('log.userid', login)
      .where('log.is_agent', 0)
      .where('log.resultlog', 0)
      .where(function () {
        this.where('err.error_status', '!=', 2).orWhereNull('err.error_status');
      });

    return windowed(qb, 'log.created_at', limitTime);
  };

  const counted = await scope().count({ total: '*' }).first();

  const rows = await scope()
    .orderBy('log.created_at', 'desc')
    .limit(paging.limit)
    .offset(paging.offset)
    .select(
      'log.machinekey as equipment',
      'log.real_price as paid',
      'log.bonus_score as awarded'
    )
    .select(asTextAliased('log.created_at', 'at'));

  return { rows: rows.map(shape), total: Number(counted.total) || 0 };
}

/**
 * The media licence history, plus the one row that is not a licence.
 *
 * THE CARRY-FORWARD ROW belongs at the END of the LAST page and nowhere
 * else. It is the balance the member brought with them when the service
 * started keeping a log, so it sits below the oldest real row - and because
 * it lives in a different table it is not part of `total`, which is why the
 * vendor works out whether this page is the last one before deciding to
 * append it.
 */
async function media(userId, login, paging) {
  const limitTime = await limitFor(userId, login);

  const scope = function () {
    const qb = conn()(legacy.media('tbl_licenses') + ' as log')
      .leftJoin(legacy.media('tbl_media_providers') + ' as provider', 'log.provider', 'provider.id')
      .where('log.userid', login)
      .where('log.result', 1);

    return windowed(qb, 'log.date_time', limitTime);
  };

  const counted = await scope().count({ total: '*' }).first();
  const total = Number(counted.total) || 0;

  const rows = await scope()
    .orderBy('log.date_time', 'desc')
    .limit(paging.limit)
    .offset(paging.offset)
    .select(
      'log.dev_id as equipment',
      'provider.short_name as reason',
      'log.cal_price as paid',
      'log.bonus_score as awarded'
    )
    .select(asTextAliased('log.date_time', 'at'));

  const shaped = rows.map(shape);

  /* Only on the page that reaches the end of the real rows. */
  if (paging.offset + paging.limit < total) return { rows: shaped, total: total };

  const carried = await carryForward(login);
  if (carried) shaped.push(carried);

  return { rows: shaped, total: total + (carried ? 1 : 0) };
}

/** The balance brought in from before the log existed, or nothing. */
async function carryForward(login) {
  const row = await conn()(legacy.media('tbl_old_license_score'))
    .where('userid', login)
    .where('status', 1)
    .select('cal_price as paid', 'score')
    .select(asTextAliased('date_time', 'at'))
    .first();

  if (!row) return null;

  return Object.assign(shape(row), {
    equipment: null,
    reason: CARRY_FORWARD_REASON,
    awarded: Number(row.score || 0) / MEDIA_SCORE_DIVISOR,
    carried_forward: true
  });
}

/**
 * The activity prize history.
 *
 * Keyed by the OLD CUSTOMER ID rather than by the platform id - this table
 * predates the platform and has never heard of it. The keyword searches the
 * note, which is the only thing on the row a member would recognise.
 */
async function activity(customerId, paging, filters) {
  const keyword = String((filters && filters.keyword) || '').trim().toLowerCase();
  const from = (filters && filters.from) || '';
  const to = (filters && filters.to) || '';

  const scope = function () {
    const qb = conn()(legacy.old('customer_prize_log') + ' as log')
      .where('log.customer_id', customerId);

    if (keyword) qb.whereRaw('LOWER(log.note) LIKE ?', ['%' + keyword + '%']);

    /* A DAY here, not a second - the vendor compares the date part only. */
    if (from) qb.where(conn().raw("TO_CHAR(log.fill_date, 'YYYY-MM-DD')"), '>=', from);
    if (to) qb.where(conn().raw("TO_CHAR(log.fill_date, 'YYYY-MM-DD')"), '<=', to);

    return qb;
  };

  const counted = await scope().count({ total: '*' }).first();

  const rows = await scope()
    .orderBy('log.fill_date', 'desc')
    .limit(paging.limit)
    .offset(paging.offset)
    .select('log.prize_val as points', 'log.note as reason')
    .select(asTextAliased('log.fill_date', 'at'));

  return {
    rows: rows.map(function (row) {
      return {
        points: Number(row.points) || 0,
        reason: row.reason || null,
        at: row.at
      };
    }),
    total: Number(counted.total) || 0
  };
}

/** Both licence logs answer the same four fields, so they are shaped once. */
function shape(row) {
  return {
    equipment: row.equipment || null,
    reason: row.reason || null,
    paid: Number(row.paid) || 0,
    awarded: Number(row.awarded) || 0,
    at: row.at,
    carried_forward: false
  };
}

module.exports = {
  CUTOVER: CUTOVER,
  CARRY_FORWARD_REASON: CARRY_FORWARD_REASON,
  limitFor: limitFor,
  karaoke: karaoke,
  media: media,
  activity: activity
};
