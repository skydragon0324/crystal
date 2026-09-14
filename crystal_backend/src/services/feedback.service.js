'use strict';

const repo = require('../repositories/legacy/feedback.repository');

/*
 * THE UNIT OF WORK IS THE LEGACY DATABASE'S, not Crystal's.
 *
 * shared/transaction.js opens one on the PostgreSQL pool, and every write
 * below now lands in the vendor's database instead. Passing a PostgreSQL trx
 * to a legacy repository does not fail - knex simply ignores a transaction
 * belonging to another connection - so the thread and its first message
 * would have been written with no atomicity at all, and nothing would have
 * said so.
 */
const transaction = repo.transaction;
const { HttpError } = require('../utils/response');
const audit = require('./audit.service');

const PAGE = '/admin/members/feedback';

/**
 * FEEDBACK THREADS, and the small state machine they run on.
 *
 *   PENDING   the member has written and nobody has answered
 *   REPLIED   a manager has answered and it is back with the member
 *   RESOLVED  either side says the problem is fixed
 *   FINISHED  nobody resolved it and it aged out
 *
 * The transitions are not free-form, and that is the point of putting them
 * here rather than letting each caller set a status:
 *
 *   a member posting        -> PENDING   (it is waiting on us again)
 *   a manager posting       -> REPLIED   (it is waiting on them)
 *   either side resolving   -> RESOLVED
 *   the housekeeping sweep  -> FINISHED  (only from PENDING or REPLIED)
 *
 * RESOLVED IS AN ENDING. Neither side can post into a resolved thread; a new
 * problem gets a new thread, which is what keeps the queue's counts honest.
 * FINISHED is not an ending in the same sense - the sweep gave up and the
 * member never got an answer - so writing in one reopens it, and the history
 * that explains the problem is still attached.
 */

/** Where an enquiry came from. Different teams answer different origins. */
const SOURCES = [
  'SMARTPHONE',
  'EPRODUCT',
  'ESHOP',
  'APPSTORE',
  'SMARTPHONE_REGISTER',
  'EPRODUCT_REGISTER',
  'CRYSTAL_APP'
];

/** How long a thread nobody resolved is left in the queue. */
const FINISH_AFTER_DAYS = 7;

const MAX_MESSAGE = 4000;

function assertIn(value, allowed, fallback) {
  const upper = String(value || '').toUpperCase();
  if (allowed.indexOf(upper) !== -1) return upper;
  if (fallback) return fallback;
  throw new HttpError(400, 'common.valueFailedAValidation');
}

function assertMessage(text) {
  const body = String(text || '').trim();
  if (!body) throw new HttpError(400, 'common.valueFailedAValidation');
  return body.slice(0, MAX_MESSAGE);
}

/* ------------------------------------------------------------------ reads */

function search(filters, paging) {
  return repo.search(filters, paging);
}

/**
 * One thread with its whole exchange.
 *
 * `viewer` is who is asking - a member may only open their own, which is
 * checked here rather than trusted to the route, because both the member
 * centre and the console reach this.
 */
async function detail(id, viewer) {
  const thread = await repo.findById(id, false);
  if (!thread) throw new HttpError(404, 'common.notFound');

  if (viewer && viewer.userId && thread.user_id !== viewer.userId) {
    throw new HttpError(404, 'common.notFound');
  }

  const messages = await repo.authorsOf(await repo.messagesOf(id));
  return { thread: thread, messages: messages };
}

/**
 * The queue counters, as a plain map.
 *
 * knex answers [{ status, c }] with the count as a STRING; a console that has
 * to know that is a console that will one day add two of them together and
 * get "715". Every state is present even at zero, so a counter row does not
 * change width as the queue empties.
 */
async function counts() {
  const rows = await repo.counts();

  const out = { PENDING: 0, REPLIED: 0, RESOLVED: 0, FINISHED: 0 };
  rows.forEach(function (row) { out[row.status] = Number(row.c); });

  // What a manager actually has to act on, which is not a status.
  out.OPEN = out.PENDING + out.REPLIED;
  return out;
}

/* ----------------------------------------------------------------- writes */

/**
 * A member opens a thread, which always carries its first message.
 *
 * A thread with no messages is a subject line nobody can answer, so the two
 * are written together or not at all.
 */
async function open(userId, body) {
  const title = String(body.title || '').trim();
  if (!title) throw new HttpError(400, 'common.valueFailedAValidation');

  const message = assertMessage(body.message || body.content);
  const source = assertIn(body.thread_source, SOURCES, 'SMARTPHONE');

  return transaction(async function (trx) {
    const rows = await repo.insertThread({
      user_id: userId,
      title: title.slice(0, 512),
      thread_source: source,
      status: 'PENDING',
      last_message: message,
      last_type: 'MEMBER',
      // Nobody on our side has seen it yet.
      is_read: false
    }, trx);

    await repo.insertMessage({
      thread_id: rows[0].id,
      message: message,
      action_type: 'MEMBER',
      action_by: userId
    }, trx);

    return rows[0];
  });
}

/**
 * A post into an existing thread, from either side.
 *
 * The thread's state, preview and read flag all move with it, in the same
 * transaction as the message - a preview that can disagree with the chain is
 * the whole reason to denormalise it carefully.
 */
async function post(threadId, author, text) {
  const thread = await repo.findRow(threadId);
  if (!thread || thread.is_deleted) throw new HttpError(404, 'common.notFound');

  const isMember = author.type === 'MEMBER';
  if (isMember && thread.user_id !== author.id) throw new HttpError(404, 'common.notFound');

  /*
   * A RESOLVED THREAD IS CLOSED. It used to reopen on the next message.
   *
   * Resolved means somebody said the problem was fixed, and a conversation
   * that can be reopened forever is one that is never actually over: the
   * queue keeps threads in it that were settled months ago, and neither side
   * can tell a live enquiry from an old one somebody added a thank-you to.
   * A new problem gets a new thread, which is also what makes the queue's
   * counts mean anything.
   *
   * BOTH SIDES, not just the member. The rule exists so that "resolved" is
   * an ending both parties can rely on; if a manager's message still
   * reopened it, a member told the thread was closed would find it live
   * again and be expected to answer.
   *
   * FINISHED IS NOT THE SAME and still reopens. That one is the sweep giving
   * up after seven days - nobody resolved anything and the member never got
   * their answer, so making them retype the history would be punishing them
   * for our silence.
   */
  if (thread.status === 'RESOLVED') throw new HttpError(409, 'feedback.threadIsResolved');

  const message = assertMessage(text);

  return transaction(async function (trx) {
    await repo.insertMessage({
      thread_id: threadId,
      message: message,
      action_type: isMember ? 'MEMBER' : 'MANAGER',
      action_by: author.id
    }, trx);

    const patch = {
      last_message: message,
      last_type: isMember ? 'MEMBER' : 'MANAGER',
      /*
       * A post reopens a FINISHED thread - one the sweep gave up on. A
       * RESOLVED one never reaches here; it is refused above.
       */
      status: isMember ? 'PENDING' : 'REPLIED',
      // Unread by the OTHER side, which is the side that did not just write.
      is_read: false
    };

    // The first manager to answer owns it from then on.
    if (!isMember && !thread.session_by) patch.session_by = author.id;

    const rows = await repo.updateThread(threadId, patch, trx);
    return rows[0];
  });
}

/** Either side can say the problem is fixed. */
async function resolve(threadId, author) {
  const thread = await repo.findRow(threadId);
  if (!thread || thread.is_deleted) throw new HttpError(404, 'common.notFound');

  if (author.type === 'MEMBER' && thread.user_id !== author.id) {
    throw new HttpError(404, 'common.notFound');
  }

  const rows = await repo.updateThread(threadId, { status: 'RESOLVED' });

  if (author.type === 'MANAGER') {
    audit.updated(author.actor, repo.THREADS, threadId, thread, rows[0], PAGE);
  }
  return rows[0];
}

/** Marks the thread seen by whoever is looking at it. */
async function markRead(threadId, author) {
  const thread = await repo.findRow(threadId);
  if (!thread || thread.is_deleted) throw new HttpError(404, 'common.notFound');

  if (author.type === 'MEMBER' && thread.user_id !== author.id) {
    throw new HttpError(404, 'common.notFound');
  }

  /*
   * Only the side that did NOT write last can mark it read - otherwise a
   * manager opening their own reply clears the member's unread badge.
   */
  const writtenByMe = thread.last_type === author.type;
  if (writtenByMe || thread.is_read) return thread;

  const rows = await repo.updateThread(threadId, { is_read: true });
  return rows[0];
}

async function remove(threadId, actor) {
  const thread = await repo.findRow(threadId);
  if (!thread) throw new HttpError(404, 'common.notFound');

  await repo.softDelete(threadId);
  audit.deleted(actor, repo.THREADS, threadId, thread, PAGE);
}

/**
 * A MEMBER REMOVING THEIR OWN THREAD.
 *
 * Separate from `remove` above, which is the console's, and not because the
 * SQL differs - it is the same soft delete - but because who may do it does.
 * A member may remove a conversation of their own and nothing else, so the
 * ownership test is the whole point of this function existing.
 *
 * A thread that is not theirs answers 404 rather than 403, the same as
 * reading one does: "you may not" tells somebody the row is there.
 *
 * NOT AUDITED. The audit log records what STAFF did to a member's data; a
 * member tidying up their own inbox is not that, and writing an admin-shaped
 * row with no admin in it would put a null where every reader of that table
 * expects a person.
 */
async function removeOwn(threadId, userId) {
  const thread = await repo.findRow(threadId);
  if (!thread || thread.is_deleted || thread.user_id !== userId) {
    throw new HttpError(404, 'common.notFound');
  }

  await repo.softDelete(threadId);
}

/**
 * THE SEVEN DAY SWEEP.
 *
 * A thread nobody resolved and nobody has written in is closed off rather
 * than sitting in the queue forever. Only PENDING and REPLIED are touched:
 * RESOLVED is already an ending, and FINISHED is this one.
 *
 * Called by the housekeeping scheduler - see services/sweeps.service.js.
 */
async function finishStale(days) {
  const after = days || FINISH_AFTER_DAYS;
  const stale = await repo.staleThreads(after);

  for (let i = 0; i < stale.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await repo.updateThread(stale[i].id, { status: 'FINISHED' });
  }

  return { finished: stale.length, after_days: after };
}

module.exports = {
  PAGE: PAGE,
  SOURCES: SOURCES,
  FINISH_AFTER_DAYS: FINISH_AFTER_DAYS,

  search: search,
  detail: detail,
  counts: counts,
  open: open,
  post: post,
  resolve: resolve,
  markRead: markRead,
  remove: remove,
  removeOwn: removeOwn,
  finishStale: finishStale
};
