const users = require('../repositories/users.repository');
const members = require('../repositories/members.repository');
const feedbackRepo = require('../repositories/legacy/feedback.repository');
const feedbackService = require('../services/feedback.service');
const wallet = require('../services/wallet.service');
const audit = require('../services/audit.service');
const { ok, page, HttpError } = require('../utils/response');
const { readPaging, flag } = require('../utils/query');

/**
 * The console's view of members.
 *
 * Read-mostly on purpose.  An administrator can lock an account and answer a
 * question; they cannot edit somebody's wallet, and there is deliberately no
 * endpoint that would let them - a balance is the sum of a ledger, and an
 * administrator who could set it directly would break that.
 */

const PAGE = '/admin/members/accounts';
const REGISTRATIONS_PAGE = '/admin/members/registrations';
const LICENSES_PAGE = '/admin/members/licenses';
const FEEDBACK_PAGE = '/admin/members/feedback';

const SORTABLE = ['id', 'nickname', 'email', 'created_at', 'last_login_at'];
const DEFAULT_SORT = 'created_at';

async function list(req, res) {
  const paging = readPaging(req.query, SORTABLE, DEFAULT_SORT);
  paging.dir = req.query.dir ? paging.dir : 'desc';

  const result = await users.search({
    q: req.query.q,
    status: req.query.status,
    from: req.query.from,
    to: req.query.to
  }, paging);

  return page(res, result, paging);
}

/**
 * One member, with everything about them on one screen.
 *
 * Assembled here rather than left to five calls from the console, because
 * this page exists to answer a support question and the person answering it
 * should not have to click four tabs to see the whole picture.
 */
async function detail(req, res) {
  const id = Number(req.params.id);
  const account = await users.findById(id);
  if (!account) throw new HttpError(404, 'common.notFound');

  const paging = { limit: 20, offset: 0 };

  const [purse, devices, licences, points, feedbackRows] = await Promise.all([
    wallet.overview(id),
    members.registrations(id, paging),
    members.licenses(id, paging),
    wallet.pointSummary(id),
    feedbackRepo.search({ user_id: id }, { sort: 'created_at', dir: 'desc', limit: 10, offset: 0 })
  ]);

  return ok(res, {
    member: account,
    wallet: purse ? Object.assign({}, purse, { pay_password_hash: undefined }) : null,
    devices: devices.rows,
    licenses: licences.rows,
    point_summary: points,
    feedback: feedbackRows.rows
  });
}

/**
 * Locking or unlocking an account.
 *
 * The only write on an account this controller has, and it is a status change
 * rather than a general edit - "make this account not work" is a decision
 * worth naming, and a PATCH that happened to include a status field would not
 * be.
 */
async function setStatus(req, res) {
  const id = Number(req.params.id);
  const status = String(req.body.status || '').toUpperCase();

  if (['ACTIVE', 'LOCKED'].indexOf(status) === -1) {
    throw new HttpError(400, 'common.valueFailedAValidation');
  }

  const previous = await users.findRow(id);
  if (!previous) throw new HttpError(404, 'common.notFound');

  const rows = await users.update(id, { status: status });
  audit.updated(req.actor, users.TABLE, id, previous, rows[0], PAGE);

  return ok(res, await users.findById(id), 'common.updated');
}

/* ---- registered devices and licences, across every member ---- */

async function registrations(req, res) {
  const paging = readPaging(req.query, ['id', 'register_time'], 'register_time');
  paging.dir = req.query.dir ? paging.dir : 'desc';

  const result = await members.registrations(req.query.user_id || null, paging);
  return page(res, result, paging);
}

async function licenses(req, res) {
  const paging = readPaging(req.query, ['id', 'created_at'], 'created_at');
  paging.dir = req.query.dir ? paging.dir : 'desc';

  const result = await members.licenses(req.query.user_id || null, paging);
  return page(res, result, paging);
}

/* ---- feedback ---- */

/**
 * THE FEEDBACK QUEUE.
 *
 * A thread rather than an enquiry: the subject and the state live on the
 * thread, and the exchange underneath it is a chain both sides post into.
 * See services/feedback.service.js for the state machine.
 */
async function feedback(req, res) {
  const paging = readPaging(req.query, ['id', 'created_at', 'updated_at', 'status'], 'updated_at');
  paging.dir = req.query.dir ? paging.dir : 'desc';

  const result = await feedbackService.search({
    q: req.query.q,
    status: req.query.status,
    thread_source: req.query.thread_source,
    user_id: req.query.user_id,
    // The queue a manager actually works from: the member wrote last.
    waiting: flag(req.query.waiting),
    deleted: flag(req.query.deleted)
  }, paging);

  return page(res, result, paging);
}

/** One thread with its whole exchange, and marked seen by the manager. */
async function feedbackDetail(req, res) {
  const found = await feedbackService.detail(req.params.id, null);
  await feedbackService.markRead(req.params.id, { type: 'MANAGER', id: req.admin.id });
  return ok(res, found);
}

/** The counters above the queue, in one query rather than four. */
async function feedbackCounts(req, res) {
  return ok(res, await feedbackService.counts());
}

/**
 * Answering a member.
 *
 * A post rather than a reply column: it joins the chain, moves the thread
 * to REPLIED, and the first manager to answer owns it from then on.
 */
async function reply(req, res) {
  const thread = await feedbackService.post(req.params.id, {
    type: 'MANAGER', id: req.admin.id, actor: req.actor
  }, req.body.message || req.body.reply);

  return ok(res, thread, 'common.updated');
}

/** Either side can say the problem is fixed. */
async function resolveFeedback(req, res) {
  const thread = await feedbackService.resolve(req.params.id, {
    type: 'MANAGER', id: req.admin.id, actor: req.actor
  });
  return ok(res, thread, 'common.updated');
}

async function removeFeedback(req, res) {
  await feedbackService.remove(req.params.id, req.actor);
  return ok(res, null, 'common.deleted');
}

module.exports = {
  PAGE: PAGE,
  REGISTRATIONS_PAGE: REGISTRATIONS_PAGE,
  LICENSES_PAGE: LICENSES_PAGE,
  FEEDBACK_PAGE: FEEDBACK_PAGE,
  list: list,
  detail: detail,
  setStatus: setStatus,
  registrations: registrations,
  licenses: licenses,
  feedback: feedback,
  feedbackDetail: feedbackDetail,
  feedbackCounts: feedbackCounts,
  resolveFeedback: resolveFeedback,
  removeFeedback: removeFeedback,
  reply: reply,
};
