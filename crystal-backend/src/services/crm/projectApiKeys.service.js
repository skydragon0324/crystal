const crypto = require('crypto');
const db = require('../../config/db');
const { HttpError } = require('../../utils/response');

/**
 * KEYS FOR DEPARTMENT SYSTEMS.
 *
 * A department (the e-shop, the appstore, ...) calls /api/integration/crm with
 * a key issued to its project. The key decides the project: a department can
 * never submit or read identities as another project by changing a field.
 *
 * Format: crmk_<prefix>_<secret>. The prefix finds the row; only the SHA-256
 * of the secret is stored, and the secret is shown once when it is issued.
 */
const PATTERN = /^crmk_([0-9a-f]{12})_([0-9a-f]{48})$/;

function digest(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

async function issue(projectCode, label) {
  const project = await db('crm_project').where('project_code', projectCode).first('project_id', 'project_code');
  if (!project) throw new Error('No project with code ' + projectCode);
  const prefix = crypto.randomBytes(6).toString('hex');
  const secret = crypto.randomBytes(24).toString('hex');
  const [row] = await db('crm_project_api_key')
    .insert({ project_id: project.project_id, key_prefix: prefix, key_hash: digest(secret), label: String(label || project.project_code).slice(0, 100) })
    .returning(['api_key_id', 'project_id']);
  return { api_key_id: row.api_key_id, project_id: row.project_id, project_code: project.project_code, key: 'crmk_' + prefix + '_' + secret };
}

async function revoke(apiKeyId) {
  return db('crm_project_api_key').where('api_key_id', apiKeyId).whereNull('revoked_at').update({ revoked_at: db.fn.now() });
}

async function list() {
  return db('crm_project_api_key as api_key').join('crm_project as project', 'project.project_id', 'api_key.project_id')
    .select('api_key.api_key_id', 'project.project_code', 'api_key.key_prefix', 'api_key.label', 'api_key.last_used_at', 'api_key.revoked_at', 'api_key.created_at')
    .orderBy('api_key.api_key_id');
}

function presentedKey(req) {
  const header = String(req.headers.authorization || '');
  if (/^Bearer\s+/i.test(header)) return header.replace(/^Bearer\s+/i, '').trim();
  return String(req.headers['x-api-key'] || '').trim();
}

/** Middleware: sets req.integration = { project_id, project_code, api_key_id }. */
async function authenticate(req, res, next) {
  const match = PATTERN.exec(presentedKey(req));
  if (!match) return next(new HttpError(401, 'A valid department API key is required'));
  const row = await db('crm_project_api_key as api_key').join('crm_project as project', 'project.project_id', 'api_key.project_id')
    .where('api_key.key_prefix', match[1]).whereNull('api_key.revoked_at')
    .first('api_key.api_key_id', 'api_key.key_hash', 'project.project_id', 'project.project_code', 'project.status');
  const expected = row ? Buffer.from(row.key_hash, 'hex') : null;
  const actual = Buffer.from(digest(match[2]), 'hex');
  if (!expected || !crypto.timingSafeEqual(expected, actual)) return next(new HttpError(401, 'A valid department API key is required'));
  if (row.status !== 'ACTIVE') return next(new HttpError(403, 'This project is inactive'));
  req.integration = { project_id: row.project_id, project_code: row.project_code, api_key_id: row.api_key_id };
  db('crm_project_api_key').where('api_key_id', row.api_key_id).update({ last_used_at: db.fn.now() })
    .catch(function (err) { console.error('crm api key last_used_at: ' + err.message); });
  return next();
}

module.exports = { issue, revoke, list, authenticate };
