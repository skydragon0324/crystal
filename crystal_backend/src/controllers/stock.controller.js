const service = require('../services/stock.service');
const { ok, page } = require('../utils/response');
const { readPaging, flag } = require('../utils/query');

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

  const result = await service.search({
    q: req.query.q,
    agency_id: scopeOf(req),
    part_id: req.query.part_id,
    component: req.query.component,
    state: req.query.state,
    short: flag(req.query.short)
  }, paging);

  return page(res, result, paging);
}

async function movements(req, res) {
  const paging = readPaging(req.query, service.MOVE_SORTABLE, service.MOVE_DEFAULT_SORT);
  paging.dir = req.query.dir ? paging.dir : 'desc';

  const result = await service.movements({
    q: req.query.q,
    agency_id: scopeOf(req),
    part_id: req.query.part_id,
    movement: req.query.movement,
    reference_type: req.query.reference_type,
    reference_id: req.query.reference_id,
    from: req.query.from,
    to: req.query.to
  }, paging);

  return page(res, result, paging);
}

async function shortages(req, res) {
  return ok(res, await service.shortagesOf(scopeOf(req) || req.params.agencyId));
}

async function move(req, res) {
  const row = await service.move({
    agency_id: scopeOf(req) || req.body.agency_id,
    part_id: req.body.part_id,
    movement: req.body.movement,
    quantity: req.body.quantity,
    unit_cost: req.body.unit_cost,
    note: req.body.note
  }, req.actor);
  return ok(res, row, 'common.created');
}

async function stocktake(req, res) {
  const row = await service.stocktake(
    scopeOf(req) || req.body.agency_id,
    req.body.part_id,
    req.body.counted,
    req.body.note,
    req.actor
  );
  return ok(res, row, 'common.updated');
}

async function setLevel(req, res) {
  const row = await service.setLevel(
    scopeOf(req) || req.body.agency_id,
    req.body.part_id,
    req.body.reorder_level,
    req.body.bin,
    req.actor
  );
  return ok(res, row, 'common.updated');
}

module.exports = {
  list: list,
  movements: movements,
  shortages: shortages,
  move: move,
  stocktake: stocktake,
  setLevel: setLevel
};
