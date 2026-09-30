const service = require('../services/settings.service');
const { ok } = require('../utils/response');

async function list(req, res) {
  return ok(res, await service.all());
}

async function save(req, res) {
  return ok(res, await service.setMany(req.body, req.actor), 'common.updated');
}

module.exports = { list: list, save: save };
