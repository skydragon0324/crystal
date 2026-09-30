const service = require('../services/repairTickets.service');
const technicians = require('../repositories/technicians.repository');
const { ok, page } = require('../utils/response');
const { readPaging, pick, flag } = require('../utils/query');
const codes = require('../utils/codes');

const wantsDeleted = function (req) { return flag(req.query.deleted); };

/**
 * A branch account is pinned to its own centre.
 *
 * Applied here rather than in the service, because it is a fact about who is
 * asking and not about tickets - the nightly sweeps and the claim builder
 * call the same service with no administrator behind them at all.
 */
function scopeOf(req) {
  /*
   * WHICHEVER CENTRE WAS ASKED FOR, and nothing narrower.
   *
   * This used to prefer the signed-in account's own centre over the query,
   * which is what pinned a branch manager to their own branch. That column
   * is gone: an account is a login and a role now, and what it may open is
   * the permission grid's answer alone.
   */
  return req.query.agency_id;
}

async function list(req, res) {
  const paging = readPaging(req.query, service.SORTABLE, service.DEFAULT_SORT);
  paging.dir = service.resolveDirection(paging, req.query.dir);

  const result = await service.search({
    q: req.query.q,
    agency_id: scopeOf(req),
    technician_id: req.query.technician_id,
    product_id: req.query.product_id,
    symptom_id: req.query.symptom_id,
    user_id: req.query.user_id,
    serial_number: req.query.serial_number,
    status: req.query.status,
    pay_state: req.query.pay_state,
    priority: req.query.priority,
    is_warranty: req.query.is_warranty,
    open: flag(req.query.open),
    overdue: flag(req.query.overdue),
    unrated: flag(req.query.unrated),
    claimable: flag(req.query.claimable),
    from: req.query.from,
    to: req.query.to,
    deleted: wantsDeleted(req)
  }, paging);

  return page(res, result, paging);
}

async function detail(req, res) {
  return ok(res, await service.detail(req.params.id, wantsDeleted(req)));
}

async function create(req, res) {
  return ok(res, await service.create(pick(req.body, service.COLUMNS), req.actor), 'common.created');
}

async function update(req, res) {
  return ok(res, await service.update(req.params.id, pick(req.body, service.COLUMNS), req.actor), 'common.updated');
}

async function transition(req, res) {
  const row = await service.transition(req.params.id, req.body.status, req.body, req.actor);
  return ok(res, row, 'common.updated');
}

async function assign(req, res) {
  return ok(res, await service.assign(req.params.id, req.body.technician_id, req.actor), 'common.updated');
}

/** Who should be given this job - see technicians.repository.suggestFor. */
async function suggestTechnician(req, res) {
  const found = await service.detail(req.params.id, false);
  return ok(res, await technicians.suggestFor(found.ticket.agency_id, found.ticket.component));
}

async function pay(req, res) {
  return ok(res, await service.pay(req.params.id, req.body, req.actor), 'common.updated');
}

async function rate(req, res) {
  return ok(res, await service.rate(req.params.id, req.body, req.actor), 'common.updated');
}

async function remove(req, res) {
  await service.remove(req.params.id, req.actor);
  return ok(res, null, 'common.deleted');
}

async function restore(req, res) {
  await service.restore(req.params.id, req.actor);
  return ok(res, null, 'common.restored');
}

/* ---- the bill ---- */

async function addItem(req, res) {
  return ok(res, await service.addItem(req.params.id, req.body, req.actor), 'common.created');
}

async function updateItem(req, res) {
  return ok(res, await service.updateItem(req.params.id, req.params.itemId, req.body, req.actor), 'common.updated');
}

async function removeItem(req, res) {
  await service.removeItem(req.params.id, req.params.itemId, req.actor);
  return ok(res, null, 'common.deleted');
}

async function issueItem(req, res) {
  return ok(res, await service.issueItem(req.params.id, req.params.itemId, req.actor), 'common.updated');
}

/**
 * The code lists, so the console draws the same words the server prints.
 *
 * Sent as data rather than duplicated in the frontend: a status the two sides
 * disagree about is a bug nobody notices until a customer is told their
 * device is "4".
 */
async function meta(req, res) {
  return ok(res, {
    status: codes.TICKET_STATUS,
    flow: codes.TICKET_FLOW,
    intake_channel: codes.INTAKE_CHANNEL,
    priority: codes.PRIORITY,
    pay_state: codes.PAY_STATE,
    pay_method: codes.PAY_METHOD,
    components: codes.COMPONENTS,
    severity: codes.SEVERITY
  });
}

module.exports = {
  list: list,
  detail: detail,
  create: create,
  update: update,
  transition: transition,
  assign: assign,
  suggestTechnician: suggestTechnician,
  pay: pay,
  rate: rate,
  remove: remove,
  restore: restore,
  addItem: addItem,
  updateItem: updateItem,
  removeItem: removeItem,
  issueItem: issueItem,
  meta: meta
};
