'use strict';

const service = require('../services/footer.service');
const { ok } = require('../utils/response');

async function detail(req, res) {
  return ok(res, await service.get());
}

async function save(req, res) {
  return ok(res, await service.save(req.body, req.actor), 'common.updated');
}

module.exports = { detail: detail, save: save };
