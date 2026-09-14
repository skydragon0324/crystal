const service = require('../services/dashboard.service');
const { ok } = require('../utils/response');

async function overview(req, res) {
  return ok(res, await service.overview());
}

module.exports = { overview: overview };
