const service = require('../services/member.service');
const feedbackService = require('../services/feedback.service');
const blogService = require('../services/blog.service');
const { ok, page, HttpError } = require('../utils/response');
const { readPaging } = require('../utils/query');

/**
 * The member centre.
 *
 * Every handler passes `req.user.id` down rather than reading an id from the
 * request - there is no endpoint here that takes a member id, because there
 * is no reason for one and every reason not to.
 */
function paging(req, sortable, fallback) {
  return readPaging(req.query, sortable || ['id'], fallback || 'id');
}

async function profile(req, res) {
  return ok(res, await service.profile(req.user.id));
}

async function updateProfile(req, res) {
  return ok(res, await service.updateProfile(req.user.id, req.body), 'common.updated');
}

async function dashboard(req, res) {
  return ok(res, await service.dashboard(req.user.id));
}

/* ---- devices ---- */

async function checkSerial(req, res) {
  return ok(res, await service.checkSerial(req.query.sn || req.query.serial_number));
}

async function registerProduct(req, res) {
  return ok(res, await service.registerProduct(req.user.id, req.body), 'common.created');
}

async function registrations(req, res) {
  const p = paging(req);
  return page(res, await service.listRegistrations(req.user.id, p), p);
}

async function removeRegistration(req, res) {
  await service.removeRegistration(req.user.id, req.params.id);
  return ok(res, null, 'common.deleted');
}

/* ---- licences ---- */

async function licenses(req, res) {
  const p = paging(req);
  return page(res, await service.listLicenses(req.user.id, p), p);
}

async function licensableDevices(req, res) {
  return ok(res, await service.licensableDevices(req.user.id));
}

async function issueLicense(req, res) {
  return ok(res, await service.issueLicense(req.user.id, req.body), 'common.created');
}

/* ---- wallet and points ---- */

async function wallet(req, res) {
  return ok(res, await service.walletOverview(req.user.id));
}

async function walletTransactions(req, res) {
  const p = paging(req);
  return page(res, await service.walletTransactions(req.user.id, {
    type: req.query.type, from: req.query.from, to: req.query.to
  }, p), p);
}

async function charge(req, res) {
  return ok(res, await service.charge(req.user.id, req.body.amount, req.body.reference), 'common.created');
}

async function transfer(req, res) {
  return ok(res, await service.transfer(req.user.id, req.body), 'common.created');
}

async function setPayPassword(req, res) {
  await service.setPayPassword(
    req.user.id,
    req.body.currentPassword || req.body.current_password,
    req.body.newPassword || req.body.new_password
  );
  return ok(res, null, 'common.updated');
}

/**
 * A day from a date picker, or nothing.
 *
 * Checked for SHAPE before it reaches a query: Crystal's ledger compares it
 * against a timestamptz and the vendor's as text, and "yesterday" or a stray
 * value in either would be an SQL error answered as a 500 rather than a filter
 * the member mistyped.
 */
function dayOf(value) {
  const text = String(value || '').trim();
  if (!text) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new HttpError(400, 'common.valueFailedAValidation');
  return text;
}

async function points(req, res) {
  const p = paging(req);

  /*
   * `source` is the system, `type` is Crystal's own movement kind - and the
   * second only means anything within the first. Passing both is allowed and
   * the service applies type only to Crystal's ledger, because the vendor's
   * five have no equivalent column and silently ignoring a filter the caller
   * asked for is how a page comes to show more than it claims to.
   */
  return page(res, await service.listPoints(req.user.id, {
    type: req.query.type ? String(req.query.type).toUpperCase() : undefined,
    source: req.query.source ? String(req.query.source).toUpperCase() : undefined,
    /*
     * THE REST OF THE VENDOR'S HEADER: a period, a search, and - on the
     * activity ledger only - its category. The names are the API's (`from`,
     * `to`, `q`), the same three every storefront list takes, so the web
     * speaks one vocabulary to all of them.
     */
    category: req.query.category ? String(req.query.category).toUpperCase() : undefined,
    from: dayOf(req.query.from),
    to: dayOf(req.query.to),
    keyword: req.query.q ? String(req.query.q) : undefined
  }, p), p);
}

/** Every system the member holds points in, with its balance and its cap. */
async function pointSystems(req, res) {
  return ok(res, await service.pointSystems(req.user.id));
}

async function pointSummary(req, res) {
  return ok(res, await service.pointSummary(req.user.id));
}

/* ---- the member's own articles ---- */

/**
 * The author is taken from the SESSION, never from the query.
 *
 * The legacy blog records an author by login, and an `author` parameter here
 * would be an endpoint for reading anybody's unpublished drafts.
 */
async function articles(req, res) {
  const p = paging(req);
  /* `kind` is ARTICLE or REPLY; absent, both - a reply is the member's writing too. */
  return page(res, await blogService.mine(req.user.login, {
    status: req.query.status,
    kind: req.query.kind
  }, p), p);
}

/* ---- the member's own writing ---- */

/**
 * WHAT IS LEFT OF TODAY'S ALLOWANCE, asked before the member types.
 *
 * The vendor's blog only ever mentions its one-a-day limit by refusing a
 * finished post. Every screen that offers a box asks this first, so the page
 * can say what is left and when it comes back instead of taking somebody's
 * afternoon and then declining it.
 */
async function articleAllowance(req, res) {
  return ok(res, await blogService.allowance(req.user.login));
}

/** One of the member's own posts, with its body - the compose page opening on it. */
async function ownArticle(req, res) {
  return ok(res, await blogService.ownPost(req.user, req.params.id));
}

/**
 * A NEW POST. `parent_id` decides which of the two things it is: absent or 0
 * and it is an article, an article's id and it is a reply in that thread.
 * `status` is DRAFT or REVIEW, and REVIEW is what spends the day.
 */
async function writeArticle(req, res) {
  return ok(res, await blogService.write(req.user, req.body || {}), 'common.created');
}

async function editArticle(req, res) {
  return ok(res, await blogService.edit(req.user, req.params.id, req.body || {}), 'common.updated');
}

async function removeArticle(req, res) {
  return ok(res, await blogService.removeOwn(req.user, req.params.id), 'common.deleted');
}

/* ---- thumbs on the blog ---- */

/** The member's own thumbs on a page's rows - `?ids=` the article and its replies on screen. */
async function blogThumbs(req, res) {
  return ok(res, await blogService.myThumbs(req.user, req.query.ids));
}

/**
 * One thumb. The answer is the counts AFTER it, so the page draws the
 * server's numbers rather than guessing one higher.
 */
async function giveBlogThumb(req, res) {
  const kind = req.body ? req.body.kind : undefined;
  return ok(res, await blogService.giveThumb(req.user, req.params.id, kind));
}

/* ---- cover ---- */

async function warranties(req, res) {
  const p = readPaging(req.query, ['id', 'end_date', 'start_date'], 'end_date');
  return page(res, await service.listWarranties(req.user.id, p), p);
}

async function extensionOptions(req, res) {
  return ok(res, await service.extensionOptions(req.user.id, req.params.registrationId));
}

async function extendWarranty(req, res) {
  return ok(res, await service.extendWarranty(req.user.id, req.body), 'common.created');
}

/* ---- repairs and feedback ---- */

async function repairs(req, res) {
  const p = readPaging(req.query, ['id', 'received_at', 'status'], 'received_at');
  p.dir = req.query.dir ? p.dir : 'desc';
  return page(res, await service.listRepairs(req.user.id, p), p);
}

async function repairDetail(req, res) {
  return ok(res, await service.repairDetail(req.user.id, req.params.id));
}

async function rateRepair(req, res) {
  return ok(res, await service.rateRepair(req.user.id, req.params.id, req.body), 'common.updated');
}

/**
 * THE MEMBER'S OWN THREADS.
 *
 * Feedback is a conversation: a thread carries the subject and the state,
 * and both sides post into one chain underneath it. A member sees only
 * their own, which the service enforces rather than the route.
 */
async function feedback(req, res) {
  const p = readPaging(req.query, ['id', 'created_at', 'updated_at', 'status'], 'updated_at');
  p.dir = req.query.dir ? p.dir : 'desc';

  const result = await feedbackService.search({
    user_id: req.user.id,
    status: req.query.status,
    thread_source: req.query.thread_source
  }, p);

  return page(res, result, p);
}

/** One thread with its exchange, and marked seen by the member. */
async function feedbackDetail(req, res) {
  const found = await feedbackService.detail(req.params.id, { userId: req.user.id });
  await feedbackService.markRead(req.params.id, { type: 'MEMBER', id: req.user.id });
  return ok(res, found);
}

async function submitFeedback(req, res) {
  return ok(res, await feedbackService.open(req.user.id, req.body), 'common.created');
}

/** A follow-up in a thread the member already opened. */
async function postFeedback(req, res) {
  const thread = await feedbackService.post(req.params.id, {
    type: 'MEMBER', id: req.user.id
  }, req.body.message);
  return ok(res, thread, 'common.created');
}

async function removeFeedback(req, res) {
  await feedbackService.removeOwn(req.params.id, req.user.id);
  return ok(res, null, 'common.deleted');
}

async function closeFeedback(req, res) {
  const thread = await feedbackService.resolve(req.params.id, {
    type: 'MEMBER', id: req.user.id
  });
  return ok(res, thread, 'common.updated');
}

module.exports = {
  profile: profile,
  updateProfile: updateProfile,
  dashboard: dashboard,
  checkSerial: checkSerial,
  registerProduct: registerProduct,
  registrations: registrations,
  removeRegistration: removeRegistration,
  licenses: licenses,
  licensableDevices: licensableDevices,
  issueLicense: issueLicense,
  wallet: wallet,
  walletTransactions: walletTransactions,
  charge: charge,
  transfer: transfer,
  setPayPassword: setPayPassword,
  points: points,
  articles: articles,
  articleAllowance: articleAllowance,
  ownArticle: ownArticle,
  writeArticle: writeArticle,
  editArticle: editArticle,
  removeArticle: removeArticle,
  blogThumbs: blogThumbs,
  giveBlogThumb: giveBlogThumb,
  pointSystems: pointSystems,
  pointSummary: pointSummary,
  warranties: warranties,
  extensionOptions: extensionOptions,
  extendWarranty: extendWarranty,
  repairs: repairs,
  repairDetail: repairDetail,
  rateRepair: rateRepair,
  feedback: feedback,
  feedbackDetail: feedbackDetail,
  submitFeedback: submitFeedback,
  postFeedback: postFeedback,
  closeFeedback: closeFeedback,
  removeFeedback: removeFeedback
};
