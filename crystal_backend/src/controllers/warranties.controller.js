const service = require('../services/warranties.service');
const { ok, page } = require('../utils/response');
const { readPaging, pick, flag } = require('../utils/query');

async function list(req, res) {
  const paging = readPaging(req.query, service.SORTABLE, service.DEFAULT_SORT);

  const result = await service.search({
    q: req.query.q,
    user_id: req.query.user_id,
    product_id: req.query.product_id,
    serial_number: req.query.serial_number,
    kind: req.query.kind,
    status: req.query.status,
    source: req.query.source,
    expiring_days: req.query.expiring_days,
    in_force: flag(req.query.in_force),
    deleted: flag(req.query.deleted)
  }, paging);

  return page(res, result, paging);
}

async function detail(req, res) {
  return ok(res, await service.detail(req.params.id, flag(req.query.deleted)));
}

/** Every cover a device has ever had, for the ticket screen's warranty panel. */
async function ofDevice(req, res) {
  return ok(res, await service.historyOfDevice(String(req.params.serial).toUpperCase()));
}

async function create(req, res) {
  return ok(res, await service.create(pick(req.body, service.COLUMNS), req.actor), 'common.created');
}

async function update(req, res) {
  return ok(res, await service.update(req.params.id, pick(req.body, service.COLUMNS), req.actor), 'common.updated');
}

/**
 * Voiding is not deleting, and has its own endpoint for that reason: a
 * voided warranty stays on the device's history with its reason attached,
 * because "I was told I was covered" is asked months later.
 */
async function voidCover(req, res) {
  return ok(res, await service.voidCover(req.params.id, req.body.void_reason, req.actor), 'common.updated');
}

async function remove(req, res) {
  await service.remove(req.params.id, req.actor);
  return ok(res, null, 'common.deleted');
}

async function restore(req, res) {
  await service.restore(req.params.id, req.actor);
  return ok(res, null, 'common.restored');
}

module.exports = {
  list: list,
  detail: detail,
  ofDevice: ofDevice,
  create: create,
  update: update,
  voidCover: voidCover,
  remove: remove,
  restore: restore
};
