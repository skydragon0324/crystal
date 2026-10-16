const Router = require('express-promise-router');
const db = require('../config/db');
const apiKeys = require('../services/crm/projectApiKeys.service');
const identity = require('../services/crm/identity.service');
const intake = require('../services/crm/registrationIntake.service');
const rules = require('../services/crm/personRules');
const rewardPoints = require('../services/crm/rewardPoints.service');
const { transaction } = require('../repositories/shared/transaction');
const { ok, HttpError } = require('../utils/response');

/**
 * DEPARTMENT SYSTEMS -> CRM, mounted at /api/integration/crm.
 *
 * Authenticated by a project API key (projectApiKeys.service.js), so the
 * project is always the caller's own. A registration runs the same weighted
 * duplicate check as the console and the Excel import:
 *
 *   unique match of 70+   linked to that customer, account added    MERGED
 *   nothing of 50 or more new customer created, account added       CREATED
 *   50-69, or conflicts   staged for an administrator               QUEUED
 *   account already known its customer                              EXISTING
 *
 * An account is known by its Account ID (external_account_id), the id the customer
 * signs in with; its PK in the project (external_account_pk) is optional.
 *
 * QUEUED callers learn the result from the resolution feed once an
 * administrator decides, and acknowledge it after saving party_pk.
 */
const router = Router();
router.use(apiKeys.authenticate);

const PERSON_FIELDS = ['full_name', 'gender_code', 'birth_date', 'mobile', 'email', 'address_line', 'home_location_pk', 'job_title_id'];

function accountId(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text || text.length > 250) throw new HttpError(400, 'crm.integration.externalAccountIdIsRequired', null, { max: 250 });
  return text;
}

router.post('/registrations', async function (req, res) {
  const body = req.body || {};
  const externalAccountId = accountId(body.external_account_id);
  const externalAccountPk = body.external_account_pk == null || String(body.external_account_pk).trim() === '' ? undefined : String(body.external_account_pk).trim();
  if (externalAccountPk && externalAccountPk.length > 250) throw new HttpError(400, 'crm.integration.externalAccountPkIsTooLong', null, { max: 250 });
  const party = {};
  PERSON_FIELDS.forEach(function (field) { if (body.party && body.party[field] !== undefined && body.party[field] !== '') party[field] = body.party[field]; });
  if (!party.full_name) throw new HttpError(400, 'crm.integration.fullNameIsRequired');
  rules.assert(await rules.check(Object.assign({ party_type: 'PERSON' }, party), 'create', 'PERSON'));
  if (party.birth_date) party.birth_year = Number(String(party.birth_date).slice(0, 4));

  const result = await transaction(trx => identity.resolveAccount(trx, {
    project_id: req.integration.project_id,
    external_account_id: externalAccountId,
    external_account_pk: externalAccountPk,
    external_account_type: body.external_account_type == null ? undefined : String(body.external_account_type).slice(0, 50),
    party: Object.assign({ party_type: 'PERSON' }, party),
    contacts: [
      party.mobile ? { contact_type: 'MOBILE', contact_value: party.mobile, source_project_id: req.integration.project_id } : null,
      party.email ? { contact_type: 'EMAIL', contact_value: party.email, source_project_id: req.integration.project_id } : null
    ].filter(Boolean)
  }));
  return ok(res, {
    outcome: result.outcome,
    party_pk: result.party_pk == null ? null : String(result.party_pk),
    intake_id: result.intake_id == null ? null : String(result.intake_id)
  });
});

/** Which customer an account of this project belongs to, or where its registration stands. */
router.get('/accounts/:externalAccountId', async function (req, res) {
  const externalAccountId = accountId(req.params.externalAccountId);
  const linked = await db('crm_project_account')
    .where({ project_id: req.integration.project_id, external_account_id: externalAccountId }).whereNull('unlinked_at').first('party_pk');
  if (linked) return ok(res, { status: 'LINKED', party_pk: String(linked.party_pk) });
  const staged = await db('crm_registration_intake')
    .where({ source_project_id: req.integration.project_id, source_record_id: externalAccountId }).orderBy('intake_id', 'desc').first('intake_id', 'status', 'party_pk');
  if (!staged) throw new HttpError(404, 'common.notFound');
  return ok(res, { status: staged.status, intake_id: String(staged.intake_id), party_pk: staged.party_pk == null ? null : String(staged.party_pk) });
});

router.get('/identity-resolutions', async function (req, res) {
  return ok(res, await intake.resolutions(req.integration.project_id));
});

router.post('/identity-resolutions/:id/acknowledge', async function (req, res) {
  if (!/^[1-9][0-9]*$/.test(String(req.params.id))) throw new HttpError(404, 'common.notFound');
  return ok(res, await intake.acknowledge(req.params.id, req.integration.project_id));
});

/**
 * The reward points this system's accounts hold, one figure per account:
 *   { accounts: [{ external_account_id, points, as_of? }] }   (or the bare list)
 * `as_of` is when the figure was true in the system (ISO 8601); one older than
 * the figure stored is ignored as STALE. Each item is answered in `problems`
 * unless it was stored; nothing fails the batch as a whole.
 */
router.post('/reward-points', async function (req, res) {
  const summary = await rewardPoints.reportFromProject(req.integration.project_id, req.body);
  return ok(res, rewardPoints.translated(summary, req.locale));
});

module.exports = router;
