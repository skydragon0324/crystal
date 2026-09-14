/**
 * THE VOCABULARY BRIDGE: numbers on one side, words on the other.
 *
 * Crystal spells a status 'RESOLVED'. The vendor's Oracle spells it 1. Both
 * are right for where they live - a native enum is the correct column in
 * PostgreSQL and a NUMBER(1) is what a schema written for Oracle in 2012 has -
 * and neither is going to change, so the translation has to live somewhere.
 *
 * It lives HERE, in one file, and nowhere else. Every number in this
 * integration is defined once below and no repository, service, controller or
 * test may write a bare code: the moment `status: 1` appears in a query
 * somebody has to remember what 1 means, and eventually somebody will not.
 *
 * The API contract above this layer is unchanged. Both frontends were built
 * against the words, so the words are what still cross the wire; this file is
 * the whole of the difference between the two databases.
 *
 * The codes are taken from vendor_backend/constants/constants.js, which is
 * the vendor's own definition of them - THREAD_STATUS, ACTION_TYPE,
 * FEEDBACK_THREAD_LAST_TYPE and ARTICLE_STATES.
 */

/* ------------------------------------------------------------------ */
/*  feedback                                                           */
/* ------------------------------------------------------------------ */

/**
 * WHICH SIDE WROTE - `last_type` on a thread, `action_type` on a message.
 * The vendor's ACTION_TYPE: USER 0, MANAGER 1.
 */
const SIDE_TO_CODE = { MEMBER: 0, MANAGER: 1 };
const CODE_TO_SIDE = { 0: 'MEMBER', 1: 'MANAGER' };

/**
 * THE STATUS, and it does not map one to one - this is the only interesting
 * translation in the file.
 *
 * Crystal has four states; Oracle has three, because it splits the
 * information differently:
 *
 *   Crystal PENDING   the member wrote and nobody has answered
 *   Crystal REPLIED   a manager answered and it is back with the member
 *   Crystal RESOLVED  somebody said it was fixed
 *   Crystal FINISHED  nobody did, and it aged out
 *
 *   Oracle  status 0  DISCUSSING - still open, either side may write
 *   Oracle  status 1  RESOLVED
 *   Oracle  status 2  FINISHED
 *   Oracle  last_type 0/1  which side wrote last
 *
 * So Crystal's PENDING and REPLIED are both Oracle's status 0, told apart by
 * `last_type` - which is exactly what the two words mean. Nothing is lost in
 * either direction and no state is invented: an open thread whose last
 * message came from a manager IS the thread Crystal calls REPLIED.
 *
 * The pair is translated together, never a column at a time, because reading
 * `status` alone cannot answer the question the console's queue asks.
 */
const STATUS = { DISCUSSING: 0, RESOLVED: 1, FINISHED: 2 };

function statusFromRow(row) {
  const status = Number(row.status);
  if (status === STATUS.RESOLVED) return 'RESOLVED';
  if (status === STATUS.FINISHED) return 'FINISHED';
  return Number(row.last_type) === SIDE_TO_CODE.MANAGER ? 'REPLIED' : 'PENDING';
}

/**
 * The reverse, as the columns to write.
 *
 * PENDING and REPLIED do not touch `last_type`: it is set by whoever posted
 * the message, and a status change must not rewrite the record of who spoke
 * last. RESOLVED and FINISHED leave it alone for the same reason.
 */
function statusToColumns(status) {
  if (status === 'RESOLVED') return { status: STATUS.RESOLVED };
  if (status === 'FINISHED') return { status: STATUS.FINISHED };
  if (status === 'REPLIED') return { status: STATUS.DISCUSSING, last_type: SIDE_TO_CODE.MANAGER };
  return { status: STATUS.DISCUSSING, last_type: SIDE_TO_CODE.MEMBER };
}

/**
 * Filtering by a status the database cannot express in one column.
 *
 * `WHERE status = 'REPLIED'` becomes `status = 0 AND last_type = 1`, and this
 * returns the pair so the repository can apply both. A caller that filtered
 * on `status` alone would silently return every open thread.
 */
function statusFilter(status) {
  return statusToColumns(status);
}

/**
 * WHERE THE ENQUIRY CAME FROM - `thread_source`, a NUMBER(1).
 *
 * Crystal's `enquiry_source` enum, by declaration order. The enum's order is
 * its sort order in PostgreSQL and the codes follow it, so a list ordered by
 * the number and a list ordered by the word come out the same.
 */
const SOURCES = ['SMARTPHONE', 'EPRODUCT', 'ESHOP', 'APPSTORE',
  'SMARTPHONE_REGISTER', 'EPRODUCT_REGISTER', 'CRYSTAL_APP'];

/* ------------------------------------------------------------------ */
/*  the blog                                                           */
/* ------------------------------------------------------------------ */

/**
 * THE ARTICLE STATE - `state`, from the vendor's ARTICLE_STATES.
 *
 * Nine codes describing a publishing workflow with an approval step Crystal
 * does not have, collapsed onto Crystal's four. The collapse is lossy in one
 * direction only: three different ways of being refused all read as ARCHIVED,
 * and writing ARCHIVED back picks PUB_CANCEL. Crystal never had those three
 * apart, so nothing it can show is lost - but an article refused by the
 * vendor's console and then re-saved by Crystal's comes back as cancelled,
 * and that is the one place this integration rewrites vendor state.
 */
const ARTICLE_STATE = {
  PUB_REQUEST: 0,
  PUB_ADMIN_AGREE: 1,
  PUB_ADMIN_DENY: 2,
  PUB_ADMIN_PENDING: 3,
  PUB_APPROVED: 4,
  PUB_DENY: 5,
  PUB_CANCEL: 6,
  PUB_PENDING: 7,
  PUB_TEMP: -2
};

const STATE_TO_STATUS = {
  '-2': 'DRAFT',
  '0': 'REVIEW',
  '1': 'REVIEW',
  '2': 'ARCHIVED',
  '3': 'REVIEW',
  '4': 'PUBLISHED',
  '5': 'ARCHIVED',
  '6': 'ARCHIVED',
  '7': 'REVIEW'
};

const STATUS_TO_STATE = {
  DRAFT: ARTICLE_STATE.PUB_TEMP,
  REVIEW: ARTICLE_STATE.PUB_REQUEST,
  PUBLISHED: ARTICLE_STATE.PUB_APPROVED,
  ARCHIVED: ARTICLE_STATE.PUB_CANCEL
};

/**
 * THE SHELF - `subject_id`, mapped onto Crystal's `article_topic`.
 *
 * One-based, because the vendor's blog_subject ids start at 1 and 0 is its
 * "no parent" value rather than a subject. An id Crystal has no topic for
 * reads as NEWS, which is the default the column already had: a legacy
 * subject Crystal never modelled should still be readable, not a 500.
 */
const TOPICS = ['NEWS', 'PRODUCTS', 'SOFTWARE', 'SERVICE', 'REPAIRABILITY', 'WARRANTY'];

/* ------------------------------------------------------------------ */
/*  shared helpers                                                     */
/* ------------------------------------------------------------------ */

/** A code to a word, by position, with a stated fallback. */
function fromOrdinal(list, code, fallback) {
  const index = Number(code);
  return list[index] === undefined ? fallback : list[index];
}

/** A word to its code, or the fallback when it is not one of them. */
function toOrdinal(list, word, fallback) {
  const index = list.indexOf(word);
  return index === -1 ? fallback : index;
}

/**
 * Oracle's 0/1 to a boolean, and back.
 *
 * A NUMBER(1) arrives as a number from oracledb and, because the stand-in
 * column is a smallint, as a number from PostgreSQL too - but a driver that
 * hands it over as a string would make `if (row.is_read)` true for '0'. So it
 * goes through Number() rather than being trusted.
 */
function toBool(value) {
  return Number(value) === 1;
}

function fromBool(value) {
  return value ? 1 : 0;
}

module.exports = {
  SIDE_TO_CODE: SIDE_TO_CODE,
  CODE_TO_SIDE: CODE_TO_SIDE,
  STATUS: STATUS,
  SOURCES: SOURCES,
  ARTICLE_STATE: ARTICLE_STATE,
  STATE_TO_STATUS: STATE_TO_STATUS,
  STATUS_TO_STATE: STATUS_TO_STATE,
  TOPICS: TOPICS,

  statusFromRow: statusFromRow,
  statusToColumns: statusToColumns,
  statusFilter: statusFilter,

  sideFromCode: function (code) { return CODE_TO_SIDE[Number(code)] || 'MEMBER'; },
  sideToCode: function (side) { return SIDE_TO_CODE[side] === undefined ? 0 : SIDE_TO_CODE[side]; },

  sourceFromCode: function (code) { return fromOrdinal(SOURCES, code, 'SMARTPHONE'); },
  sourceToCode: function (source) { return toOrdinal(SOURCES, source, 0); },

  topicFromSubject: function (id) { return fromOrdinal(TOPICS, Number(id) - 1, 'NEWS'); },
  topicToSubject: function (topic) { return toOrdinal(TOPICS, topic, 0) + 1; },

  articleStatusFromState: function (state) { return STATE_TO_STATUS[String(Number(state))] || 'DRAFT'; },
  articleStatusToState: function (status) {
    return STATUS_TO_STATE[status] === undefined ? ARTICLE_STATE.PUB_TEMP : STATUS_TO_STATE[status];
  },

  toBool: toBool,
  fromBool: fromBool
};
