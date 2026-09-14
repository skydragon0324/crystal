const legacy = require('../../config/legacy');
const db = require('../../config/db');
const codes = require('./codes');

/**
 * FEEDBACK, read and written in the vendor's database.
 *
 * This replaces repositories/feedback.repository.js, which read the same
 * conversation out of PostgreSQL. The PostgreSQL tables are still in
 * sql/schema.sql and are deliberately left there: they are where this data
 * will land when it is migrated, and deleting them now would mean rebuilding
 * them from a comment later.
 *
 * The interface is IDENTICAL to the one it replaces, down to the column names
 * in the rows it returns - `id`, `user_id`, `status: 'PENDING'` - so that
 * services/feedback.service.js keeps its state machine and both frontends
 * keep their contract. Everything that knows a thread_pk is a thread id, or
 * that 1 means RESOLVED, is in this file and in codes.js.
 *
 * TWO THINGS ARE HARDER HERE THAN THEY WERE IN ONE DATABASE.
 *
 * 1. THE MEMBER IS NOT JOINABLE.
 *
 *    `feedback_threads.user_pk` points at the vendor's `users`, and the name
 *    and email Crystal shows come from `crystal_v1.users` - a different
 *    database in production, so no query can join them. Every read here does
 *    it in two steps instead: threads from the legacy database, then the
 *    people from Crystal's, stitched in JS.
 *
 *    Crystal treats `users.id` and `user_pk` as the same number for the same
 *    person, and `managers.id` and `managers.manager_pk` likewise. That is the
 *    identity bridge, it is an assumption, and it is the assumption this
 *    whole integration rests on - if the two ever diverge, a mapping table
 *    goes here and nothing above this file changes.
 *
 * 2. SEARCHING BY MEMBER NAME RUNS BACKWARDS.
 *
 *    The console can search threads by the member's nickname or email, which
 *    live in the other database. So the people are found FIRST, in Crystal,
 *    and their ids go into the legacy query as a `whereIn`. The alternative -
 *    reading every thread and filtering in JS - is a table scan per keystroke.
 */

const THREADS = 'feedback_threads';
const MESSAGES = 'feedback_messages';

function threads() {
  return legacy.connection()(legacy.pid(THREADS) + ' as t');
}

function messages() {
  return legacy.connection()(legacy.pid(MESSAGES) + ' as m');
}

/* ------------------------------------------------------------------ */
/*  shape                                                              */
/* ------------------------------------------------------------------ */

/**
 * A legacy row, in Crystal's words.
 *
 * Everything above this file has been written against these names since
 * before the vendor's database was involved, and both frontends ship against
 * them. This is the only place they are produced.
 */
function decodeThread(row) {
  if (!row) return null;

  return {
    id: Number(row.thread_pk),
    user_id: Number(row.user_pk),
    title: row.title,
    thread_source: codes.sourceFromCode(row.thread_source),
    status: codes.statusFromRow(row),
    last_message: row.last_message,
    last_type: codes.sideFromCode(row.last_type),
    is_read: codes.toBool(row.is_read),
    session_by: row.session_by === null || row.session_by === undefined
      ? null
      : Number(row.session_by),
    is_deleted: codes.toBool(row.is_deleted),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function decodeMessage(row) {
  return {
    id: Number(row.message_pk),
    thread_id: Number(row.thread_pk),
    message: row.message,
    action_type: codes.sideFromCode(row.action_type),
    action_by: Number(row.action_by),
    action_at: row.action_at
  };
}

/**
 * Crystal's words back into the vendor's columns, for a write.
 *
 * `updated_at` is stamped HERE rather than by a trigger, because the Oracle
 * table has none - see the note at the end of sql/legacy/ora_pid.sql. It is
 * stamped only when somebody WRITES in the thread: marking a thread read must
 * not move it, or the console's queue reorders itself under a manager the
 * moment they click a row. That rule used to live in a PostgreSQL trigger
 * (set_updated_at_unless_read); with no trigger available it lives here, and
 * it is the same rule.
 */
function encodeThread(data) {
  const out = {};

  if (data.user_id !== undefined) out.user_pk = data.user_id;
  if (data.title !== undefined) out.title = data.title;
  if (data.thread_source !== undefined) out.thread_source = codes.sourceToCode(data.thread_source);
  if (data.last_message !== undefined) out.last_message = data.last_message;
  if (data.last_type !== undefined) out.last_type = codes.sideToCode(data.last_type);
  if (data.is_read !== undefined) out.is_read = codes.fromBool(data.is_read);
  if (data.is_deleted !== undefined) out.is_deleted = codes.fromBool(data.is_deleted);
  if (data.session_by !== undefined) out.session_by = data.session_by;

  /* status and last_type move together; see codes.statusToColumns. */
  if (data.status !== undefined) Object.assign(out, codes.statusToColumns(data.status));

  /* A read is not a write. Everything else is. */
  const onlyMarksRead = Object.keys(data).length === 1 && data.is_read !== undefined;
  if (!onlyMarksRead) out.updated_at = new Date();

  return out;
}

/* ------------------------------------------------------------------ */
/*  the identity bridge                                                */
/* ------------------------------------------------------------------ */

/**
 * The people behind a page of threads, out of Crystal's database.
 *
 * Two queries whatever the page size, and none at all when the page is empty.
 */
async function peopleFor(rows) {
  const userIds = unique(rows.map(function (row) { return row.user_id; }));
  const managerIds = unique(rows.map(function (row) { return row.session_by; }));

  const [members, managers] = await Promise.all([
    userIds.length
      ? db('users').whereIn('id', userIds).select('id', 'nickname', 'email', 'phone')
      : Promise.resolve([]),
    managerIds.length
      ? db('managers').whereIn('id', managerIds).select('id', 'name')
      : Promise.resolve([])
  ]);

  const byUser = {};
  members.forEach(function (row) { byUser[row.id] = row; });
  const byManager = {};
  managers.forEach(function (row) { byManager[row.id] = row; });

  return rows.map(function (row) {
    const member = byUser[row.user_id];
    const admin = byManager[row.session_by];

    return Object.assign({}, row, {
      /*
       * A member the legacy database knows about and Crystal does not is
       * possible - the vendor's console can open a thread for somebody who
       * has never used this site. The thread is still shown; the name is
       * simply missing, which is honest and is not an error.
       */
      member_nickname: member ? member.nickname : null,
      member_email: member ? member.email : null,
      member_phone: member ? member.phone : null,
      manager_name: admin ? admin.name : null
    });
  });
}

function unique(values) {
  const seen = {};
  const out = [];
  values.forEach(function (value) {
    if (value === null || value === undefined) return;
    if (seen[value]) return;
    seen[value] = true;
    out.push(value);
  });
  return out;
}

/**
 * Members matching a search word, as ids for the legacy query.
 *
 * Capped, because this feeds a `whereIn` and Oracle refuses a list longer
 * than 1000 terms. A keyword loose enough to match more members than that is
 * not a search anybody is reading the results of.
 */
function memberIdsMatching(word) {
  const like = '%' + String(word).toLowerCase() + '%';

  return db('users')
    .where(db.raw('LOWER(nickname)'), 'like', like)
    .orWhere(db.raw('LOWER(email)'), 'like', like)
    .limit(1000)
    .pluck('id');
}

/* ------------------------------------------------------------------ */
/*  reads                                                              */
/* ------------------------------------------------------------------ */

function applyFilters(qb, filters) {
  if (filters.status) {
    const pair = codes.statusFilter(filters.status);
    qb.where('t.status', pair.status);
    if (pair.last_type !== undefined) qb.where('t.last_type', pair.last_type);
  }

  if (filters.thread_source) {
    qb.where('t.thread_source', codes.sourceToCode(filters.thread_source));
  }

  if (filters.user_id) qb.where('t.user_pk', filters.user_id);

  /*
   * "Waiting on us" is the queue a manager works from, and it is not a
   * status: a thread is waiting when the member wrote last and nobody has
   * closed it. In this schema that is exactly one condition per column.
   */
  if (filters.waiting) {
    qb.where('t.last_type', codes.SIDE_TO_CODE.MEMBER)
      .where('t.status', codes.STATUS.DISCUSSING);
  }

  return qb;
}

/**
 * The search term, across both databases.
 *
 * The thread's own columns are matched in the legacy query; the member's are
 * matched in Crystal's and arrive as a list of ids. One `orWhereIn` joins the
 * two halves, which is as close to a cross-database OR as anything gets.
 */
async function applySearch(qb, word) {
  if (!word) return qb;

  const like = '%' + String(word).toLowerCase().trim() + '%';
  const memberIds = await memberIdsMatching(String(word).trim());

  return qb.where(function () {
    this.where(legacy.connection().raw('LOWER(t.title)'), 'like', like)
      .orWhere(legacy.connection().raw('LOWER(t.last_message)'), 'like', like);
    if (memberIds.length) this.orWhereIn('t.user_pk', memberIds);
  });
}

async function search(filters, paging) {
  const base = applyFilters(
    threads().where('t.is_deleted', codes.fromBool(!!filters.deleted)),
    filters
  );
  await applySearch(base, filters.q);

  const countRow = await base.clone().clearSelect().clearOrder().count({ c: '*' }).first();

  /*
   * The sort column is Crystal's name; the database knows the vendor's.
   *
   * `status` is not sortable and is not offered: it is two columns here, so
   * ordering by it would order by DISCUSSING/RESOLVED/FINISHED and put a
   * REPLIED thread wherever a PENDING one goes.
   */
  const SORTS = { id: 't.thread_pk', updated_at: 't.updated_at', created_at: 't.created_at', title: 't.title' };
  const sort = SORTS[paging.sort] || SORTS.updated_at;

  const rows = await base.clone()
    .select('t.*')
    .orderBy(sort, paging.dir || 'desc')
    .limit(paging.limit).offset(paging.offset);

  const decoded = rows.map(decodeThread);
  const withCounts = await withMessageCounts(decoded);

  return { rows: await peopleFor(withCounts), total: Number(countRow.c) };
}

/**
 * How many messages each thread holds.
 *
 * One grouped query over the page's ids, rather than the correlated subquery
 * the PostgreSQL version ran per row - a scalar subquery in the select list
 * is portable but pointless when the ids are already in hand.
 */
async function withMessageCounts(rows) {
  if (!rows.length) return rows;

  const ids = rows.map(function (row) { return row.id; });
  const counted = await messages()
    .whereIn('m.thread_pk', ids)
    .groupBy('m.thread_pk')
    .select('m.thread_pk')
    .count({ c: '*' });

  const byThread = {};
  counted.forEach(function (row) { byThread[Number(row.thread_pk)] = Number(row.c); });

  return rows.map(function (row) {
    return Object.assign({}, row, { message_cnt: byThread[row.id] || 0 });
  });
}

async function findById(id, deleted) {
  const row = await threads()
    .where('t.thread_pk', id)
    .where('t.is_deleted', codes.fromBool(!!deleted))
    .first('t.*');

  if (!row) return null;

  const decorated = await peopleFor(await withMessageCounts([decodeThread(row)]));
  return decorated[0];
}

/** The bare thread, with no member attached - what the write paths check. */
async function findRow(id, trx) {
  const qb = (trx || legacy.connection())(legacy.pid(THREADS)).where('thread_pk', id).first();
  return decodeThread(await qb);
}

/** The whole exchange, oldest first - a conversation reads downwards. */
async function messagesOf(threadId) {
  const rows = await messages()
    .where('m.thread_pk', threadId)
    .orderBy([{ column: 'm.action_at' }, { column: 'm.message_pk' }])
    .select('m.*');

  return rows.map(decodeMessage);
}

/**
 * The author's name for every message in a thread.
 *
 * `action_by` points at a member or an admin depending on `action_type`, and
 * both of those live in Crystal's database - so this is two lookups there,
 * exactly as it was before, and nothing about it changed when the messages
 * moved.
 */
async function authorsOf(list) {
  const memberIds = list.filter(function (m) { return m.action_type === 'MEMBER'; })
    .map(function (m) { return m.action_by; });
  const managerIds = list.filter(function (m) { return m.action_type === 'MANAGER'; })
    .map(function (m) { return m.action_by; });

  const [members, managers] = await Promise.all([
    memberIds.length
      ? db('users').whereIn('id', unique(memberIds)).select('id', 'nickname')
      : Promise.resolve([]),
    managerIds.length
      ? db('managers').whereIn('id', unique(managerIds)).select('id', 'name')
      : Promise.resolve([])
  ]);

  const byMember = {};
  members.forEach(function (row) { byMember[row.id] = row.nickname; });
  const byManager = {};
  managers.forEach(function (row) { byManager[row.id] = row.name; });

  return list.map(function (m) {
    return Object.assign({}, m, {
      author_name: m.action_type === 'MEMBER' ? byMember[m.action_by] : byManager[m.action_by]
    });
  });
}

/* ------------------------------------------------------------------ */
/*  writes                                                             */
/* ------------------------------------------------------------------ */

/**
 * A new thread.
 *
 * The pk is not supplied: Oracle allocates it in a BEFORE INSERT trigger off
 * FEEDBACK_THREADS_S, and the stand-in schema gives the column the same
 * sequence as a DEFAULT. `returning` is what carries it back, and it is the
 * one place the two drivers behave differently enough to be worth checking -
 * see the fallback below.
 */
async function insertThread(data, trx) {
  const conn = trx || legacy.connection();
  const row = encodeThread(data);
  row.created_at = row.created_at || new Date();

  const inserted = await conn(legacy.pid(THREADS)).insert(row).returning('thread_pk');
  const id = idOf(inserted);

  return [await findRow(id, trx)];
}

async function updateThread(id, data, trx) {
  const conn = trx || legacy.connection();
  await conn(legacy.pid(THREADS)).where('thread_pk', id).update(encodeThread(data));
  return [await findRow(id, trx)];
}

function softDelete(id, trx) {
  const conn = trx || legacy.connection();
  return conn(legacy.pid(THREADS)).where('thread_pk', id).update({ is_deleted: 1 });
}

async function insertMessage(data, trx) {
  const conn = trx || legacy.connection();

  const row = {
    thread_pk: data.thread_id,
    message: data.message,
    action_type: codes.sideToCode(data.action_type),
    action_by: data.action_by,
    action_at: new Date()
  };

  const inserted = await conn(legacy.pid(MESSAGES)).insert(row).returning('message_pk');
  return [Object.assign({ id: idOf(inserted) }, decodeMessage(row))];
}

/**
 * The id out of whatever `returning` handed back.
 *
 * knex answers [5] on one driver and [{ thread_pk: 5 }] on another depending
 * on version and dialect, and an integration that only ever runs one of them
 * in development is exactly the place to not guess.
 */
function idOf(returned) {
  const first = Array.isArray(returned) ? returned[0] : returned;
  if (first === null || first === undefined) return null;
  if (typeof first === 'object') {
    const key = Object.keys(first)[0];
    return Number(first[key]);
  }
  return Number(first);
}

/**
 * Threads that have gone quiet.
 *
 * The cutoff is computed HERE rather than in SQL. The PostgreSQL version said
 * `now() - (? || ' days')::interval`, which Oracle does not understand -
 * and a date arithmetic expression is the sort of thing that would work in
 * development and fail at 3am in the housekeeping job.
 */
async function staleThreads(days) {
  const cutoff = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

  const rows = await threads()
    .where('t.status', codes.STATUS.DISCUSSING)
    .where('t.is_deleted', 0)
    .where('t.updated_at', '<', cutoff)
    .select('t.*');

  return rows.map(decodeThread);
}

/**
 * The console's queue counters.
 *
 * Grouped by BOTH columns, because Crystal's four states are two of the
 * vendor's columns crossed - grouping by `status` alone would report every
 * open thread as PENDING.
 */
async function counts() {
  const rows = await threads()
    .where('t.is_deleted', 0)
    .groupBy('t.status', 't.last_type')
    .select('t.status', 't.last_type')
    .count({ c: '*' });

  const totals = {};
  rows.forEach(function (row) {
    const status = codes.statusFromRow(row);
    totals[status] = (totals[status] || 0) + Number(row.c);
  });

  return Object.keys(totals).map(function (status) {
    return { status: status, c: totals[status] };
  });
}

/** The unit of work, in the legacy database - see shared/transaction.js. */
function transaction(handler) {
  return legacy.connection().transaction(handler);
}

module.exports = {
  /* The audit log records the table a change was made to, and that is now a
     qualified name in somebody else's database. Saying so is the point. */
  THREADS: 'ora_pid.' + THREADS,
  MESSAGES: 'ora_pid.' + MESSAGES,

  search: search,
  findById: findById,
  findRow: findRow,
  messagesOf: messagesOf,
  authorsOf: authorsOf,
  insertThread: insertThread,
  updateThread: updateThread,
  softDelete: softDelete,
  insertMessage: insertMessage,
  staleThreads: staleThreads,
  counts: counts,
  transaction: transaction
};
