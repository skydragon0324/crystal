const service = require('../services/dashboard.service');
const certificatesService = require('../services/certificates.service');
const { ok } = require('../utils/response');

async function overview(req, res) {
  return ok(res, await service.overview());
}

/** The signing certificates' expiry - see services/certificates.service.js. */
async function certificates(req, res) {
  return ok(res, certificatesService.report());
}

module.exports = { overview: overview, certificates: certificates };
