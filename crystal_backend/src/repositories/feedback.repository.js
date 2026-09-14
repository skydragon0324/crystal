/*
 * ============================================================
 * DORMANT. Nothing imports this file, and that is deliberate.
 * ============================================================
 *
 * Feedback moved to the vendor's database; the live implementation is
 * repositories/legacy/feedback.repository.js.
 *
 * This is the PostgreSQL one, and it is kept rather than deleted because the
 * tables it reads are kept: sql/schema.sql still declares them, they are
 * still seeded, and they are where this data lands when it is migrated back.
 * On that day this file is what gets wired up again - so it stays here,
 * unreferenced, next to the schema it belongs to.
 *
 * Do not import it. Two repositories answering for the same rows out of two
 * different databases is the one way this integration can go quietly wrong.
 */
const db = require('../config/db');
const { applySearch } = require('../utils/query');

const THREADS = 'feedback_threads';
const MESSAGES = 'feedback_messages';

/**
 * FEEDBACK, as a conversation.
 *
 * A THREAD carries the subject and the state; the MESSAGES underneath it are
 * the exchange, and both sides post into the same chain. It replaced a single
 * row with one reply column, which could hold exactly one exchange - a member
 * who needed to add a detail had to open a second enquiry.
 *
 * Two readers, and they want different things. The member centre wants their
 * own threads newest-first with a preview; the console wants every thread,
 * filtered by state and origin, with the member attached. Both read the
 * preview off the thread rather than the chain - see `last_message`.
 */

const SEARCHABLE = ['t.title', 't.last_message', 'u.nickname', 'u.email'];

function scope(deleted) {
  return db(THREADS + ' as t')
    .join('users as u', 'u.id', 't.user_id')
    .leftJoin('managers as a', 'a.id', 't.session_by')
    .where('t.is_deleted', !!deleted);
}

const COLUMNS = [
  't.*',
  'u.nickname as member_nickname',
  'u.email as member_email',
  'u.phone as member_phone',
  'a.name as manager_name'
];

function applyFilters(qb, filters) {
  if (filters.status) qb.where('t.status', filters.status);
  if (filters.thread_source) qb.where('t.thread_source', filters.thread_source);
  if (filters.user_id) qb.where('t.user_id', filters.user_id);

  /*
   * "Waiting on us" is the queue a manager actually works from, and it is not
   * a status: a thread is waiting when the member wrote last, whatever state
   * it is in.
   */
  if (filters.waiting) qb.where('t.last_type', 'MEMBER').whereIn('t.status', ['PENDING', 'REPLIED']);

  return qb;
}

async function search(filters, paging) {
  const qb = applyFilters(applySearch(scope(filters.deleted), SEARCHABLE, filters.q), filters);

  const countRow = await qb.clone().clearSelect().clearOrder().count({ c: '*' }).first();

  const rows = await qb.clone()
    .select(COLUMNS)
    .select(db.raw('(SELECT COUNT(*) FROM ' + MESSAGES + ' m WHERE m.thread_id = t.id) AS message_cnt'))
    .orderBy('t.' + (paging.sort || 'updated_at'), paging.dir || 'desc')
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows, total: Number(countRow.c) };
}

function findById(id, deleted) {
  return scope(deleted).where('t.id', id).first(COLUMNS);
}

function findRow(id, trx) {
  return (trx || db)(THREADS).where('id', id).first();
}

/** The whole exchange, oldest first - a conversation reads downwards. */
function messagesOf(threadId) {
  return db(MESSAGES + ' as m')
    .where('m.thread_id', threadId)
    .orderBy([{ column: 'm.action_at' }, { column: 'm.id' }])
    .select('m.*');
}

/**
 * The author's name for every message in a thread.
 *
 * `action_by` points at users or managers depending on `action_type`, so one
 * join cannot resolve it - two small lookups keyed by type is both simpler
 * and cheaper than a UNION that has to be re-derived per row.
 */
async function authorsOf(messages) {
  const memberIds = messages.filter((m) => m.action_type === 'MEMBER').map((m) => m.action_by);
  const managerIds = messages.filter((m) => m.action_type === 'MANAGER').map((m) => m.action_by);

  const [members, managers] = await Promise.all([
    memberIds.length
      ? db('users').whereIn('id', memberIds).select('id', 'nickname')
      : Promise.resolve([]),
    managerIds.length
      ? db('managers').whereIn('id', managerIds).select('id', 'name')
      : Promise.resolve([])
  ]);

  const byMember = {};
  members.forEach((row) => { byMember[row.id] = row.nickname; });
  const byManager = {};
  managers.forEach((row) => { byManager[row.id] = row.name; });

  return messages.map((m) => Object.assign({}, m, {
    author_name: m.action_type === 'MEMBER' ? byMember[m.action_by] : byManager[m.action_by]
  }));
}

function insertThread(data, trx) {
  return (trx || db)(THREADS).insert(data).returning('*');
}

function updateThread(id, data, trx) {
  return (trx || db)(THREADS).where('id', id).update(data).returning('*');
}

function softDelete(id, trx) {
  return (trx || db)(THREADS).where('id', id).update({ is_deleted: true });
}

function insertMessage(data, trx) {
  return (trx || db)(MESSAGES).insert(data).returning('*');
}

/**
 * Threads that have gone quiet.
 *
 * Neither side resolved them and nobody has written for `days`, so they are
 * closed off rather than sitting in the queue forever. Read by the
 * housekeeping job; see services/sweeps.service.js.
 */
function staleThreads(days) {
  return db(THREADS)
    .whereIn('status', ['PENDING', 'REPLIED'])
    .where('is_deleted', false)
    .whereRaw("updated_at < now() - (? || ' days')::interval", [days])
    .select('id', 'user_id', 'title', 'status', 'updated_at');
}

/** What the console's queue counters show, in one pass rather than four. */
function counts() {
  return db(THREADS)
    .where('is_deleted', false)
    .groupBy('status')
    .select('status')
    .count({ c: '*' });
}

module.exports = {
  THREADS: THREADS,
  MESSAGES: MESSAGES,
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
  counts: counts
};
