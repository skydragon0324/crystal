const Router = require('express-promise-router');
const db = require('../config/db');
const crmController = require('../controllers/crm.controller');
const crudFactory = require('./crud.routes');
const { requirePermission, LEVEL } = require('../middleware/permission');
const { HttpError } = require('../utils/response');
const multer = require('multer');
const config = require('../config');

/**
 * THE CRM, mounted at /api/admin/crm.
 *
 * Every screen under /admin/crm guards its own endpoints with its own page,
 * exactly as the rest of the console does - so a service centre manager
 * granted only "Site activity" can record what happened at the counter and
 * cannot open a customer's point ledger.
 *
 * A few reads are SHARED between screens: the vocabularies, and the pickers
 * that find a customer, a site, a product or a segment. A program screen
 * needs to pick a site and a site-activity screen needs to pick a customer.
 * Those are guarded by "may open at least one CRM screen" rather than by any
 * single page, and they return names and codes, never a record.
 */
const router = Router();

const PAGES = {
  OVERVIEW: '/admin/crm/overview',
  CUSTOMERS: '/admin/crm/customers',
  PRODUCTS: '/admin/crm/products',
  TRANSFERS: '/admin/crm/transfers',
  CASES: '/admin/crm/service-cases',
  POINTS: '/admin/crm/points',
  PROGRAMS: '/admin/crm/programs',
  SITES: '/admin/crm/sites',
  ACTIVITY: '/admin/crm/site-activity',
  SEGMENTS: '/admin/crm/segments',
  CAMPAIGNS: '/admin/crm/campaigns',
  SETTINGS: '/admin/crm/settings',
  TRANSACTIONS: '/admin/crm/transactions',
  MEMBERSHIPS: '/admin/crm/memberships',
  ANALYSIS: '/admin/crm/analysis'
};

const read = function (page) { return requirePermission(page, LEVEL.READ); };
const write = function (page) { return requirePermission(page, LEVEL.WRITE); };

/** At least READ on some page under /admin/crm. */
async function anyCrm(req, res, next) {
  const row = await db('manager_permissions as permission_row')
    .join('manager_pages as manager_page', 'manager_page.id', 'permission_row.page_id')
    .where('permission_row.role_id', req.admin.role_id)
    .where('permission_row.permission', '>=', LEVEL.READ)
    .where('manager_page.page_url', 'like', '/admin/crm/%')
    .first('permission_row.page_id');
  if (!row) return next(new HttpError(403, 'common.permissionDenied'));
  return next();
}

/* ---- shared ---- */
router.get('/meta', anyCrm, crmController.meta);
router.get('/parties/lookup', anyCrm, crmController.parties.lookup);
router.get('/instances/lookup', anyCrm, crmController.products.instanceLookup);
router.get('/catalog/lookup', anyCrm, crmController.products.catalogLookup);
router.get('/sites/options', anyCrm, crmController.sites.options);
router.get('/segments/options', anyCrm, crmController.segments.options);
router.get('/segments/fields', anyCrm, crmController.segments.fields);
router.get('/programs/options', anyCrm, crmController.programs.options);
router.get('/campaigns/options', anyCrm, crmController.campaigns.options);

/* ---- overview ---- */
router.get('/overview', read(PAGES.OVERVIEW), crmController.overview);
router.post('/import', write(PAGES.OVERVIEW), crmController.importCrystal);
router.post('/recalculate', write(PAGES.OVERVIEW), crmController.recalculate);
router.post('/import/vendor', write(PAGES.OVERVIEW), crmController.importVendor);

/* ---- analysis, metrics and corporate grades ---- */
router.get('/analysis/summary', read(PAGES.ANALYSIS), crmController.analysis.summary);
router.get('/analysis/snapshots', read(PAGES.ANALYSIS), crmController.analysis.snapshots);
router.get('/analysis/metrics', read(PAGES.ANALYSIS), crmController.analysis.metrics);
router.get('/analysis/model', read(PAGES.ANALYSIS), crmController.analysis.model);
router.post('/analysis/run', write(PAGES.ANALYSIS), crmController.analysis.run);

/* ---- transactions ---- */
router.get('/transactions', read(PAGES.TRANSACTIONS), crmController.transactions.list);
router.get('/transactions/:id', read(PAGES.TRANSACTIONS), crmController.transactions.detail);

/* ---- memberships and tiers ---- */
router.get('/memberships', read(PAGES.MEMBERSHIPS), crmController.memberships.list);
router.get('/memberships/distribution', read(PAGES.MEMBERSHIPS), crmController.memberships.distribution);
router.get('/memberships/:id/history', read(PAGES.MEMBERSHIPS), crmController.memberships.history);
router.post('/memberships/:id/tier', write(PAGES.MEMBERSHIPS), crmController.memberships.setTier);
router.post('/memberships/:id/status', write(PAGES.MEMBERSHIPS), crmController.memberships.setStatus);

/* ---- internal departments ---- */
router.get('/departments/staff', read(PAGES.SETTINGS), crmController.departments.staff);
router.get('/departments/roles', read(PAGES.SETTINGS), crmController.departments.roles);
router.put('/departments/staff/:managerId', write(PAGES.SETTINGS), crmController.departments.assignManager);
router.put('/departments/roles/:roleId', write(PAGES.SETTINGS), crmController.departments.setRoleDepartment);

/* ---- customers ---- */
router.get('/parties', read(PAGES.CUSTOMERS), crmController.parties.list);
router.post('/parties', write(PAGES.CUSTOMERS), crmController.parties.create);

/* People from an Excel sheet. Held in memory: the sheet is read, never stored. */
const sheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.storage.maxUploadBytes, files: 1 },
  fileFilter: function (req, file, done) {
    if (!/\.xlsx$/i.test(file.originalname || '')) return done(new HttpError(400, 'crm.thisIsNotAnExcelFile'));
    return done(null, true);
  }
});
router.get('/parties/similar', read(PAGES.CUSTOMERS), crmController.parties.similar);
router.get('/parties/import/template', read(PAGES.CUSTOMERS), crmController.parties.importTemplate);
router.post('/parties/import', write(PAGES.CUSTOMERS), sheetUpload.single('file'), crmController.parties.importPeople);
router.get('/duplicates', read(PAGES.CUSTOMERS), crmController.parties.duplicates);
router.post('/duplicates/scan', write(PAGES.CUSTOMERS), crmController.parties.scanDuplicates);
router.post('/duplicates/:id/accept', write(PAGES.CUSTOMERS), crmController.parties.acceptDuplicate);
router.post('/duplicates/:id/reject', write(PAGES.CUSTOMERS), crmController.parties.rejectDuplicate);
router.get('/parties/:id', read(PAGES.CUSTOMERS), crmController.parties.detail);
router.put('/parties/:id', write(PAGES.CUSTOMERS), crmController.parties.update);
router.post('/parties/:id/status', write(PAGES.CUSTOMERS), crmController.parties.setStatus);
router.post('/parties/:id/checked', write(PAGES.CUSTOMERS), crmController.parties.setChecked);
router.post('/parties/:id/contacts', write(PAGES.CUSTOMERS), crmController.parties.addContact);
router.put('/parties/:id/contacts/:contactId', write(PAGES.CUSTOMERS), crmController.parties.updateContact);
router.post('/parties/:id/accounts', write(PAGES.CUSTOMERS), crmController.parties.linkAccount);
router.post('/parties/:id/accounts/:accountId/unlink', write(PAGES.CUSTOMERS), crmController.parties.unlinkAccount);
router.put('/parties/:id/consents', write(PAGES.CUSTOMERS), crmController.parties.setConsent);
router.post('/parties/:id/merge', write(PAGES.CUSTOMERS), crmController.parties.merge);
router.post('/parties/:id/org-types', write(PAGES.CUSTOMERS), crmController.organizations.assignType);
router.post('/parties/:id/org-types/:assignmentId/end', write(PAGES.CUSTOMERS), crmController.organizations.endType);
router.put('/parties/:id/industries', write(PAGES.CUSTOMERS), crmController.organizations.setIndustry);
router.delete('/parties/:id/industries/:industryId', write(PAGES.CUSTOMERS), crmController.organizations.removeIndustry);
router.post('/parties/:id/people', write(PAGES.CUSTOMERS), crmController.organizations.addPerson);
router.post('/parties/:id/people/:relationshipId/end', write(PAGES.CUSTOMERS), crmController.organizations.endPerson);

/* ---- customer 360: the record's figures, relationships, tags, notes, files, interactions, team, agreements ---- */
/* A customer's file is held in memory and written to the private folder by the service, never to the public uploads. */
const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.storage.maxUploadBytes, files: 1 } });
const c360 = crmController.customer360;
router.get('/search', read(PAGES.CUSTOMERS), c360.search);
router.get('/parties/:id/360', read(PAGES.CUSTOMERS), c360.overview);
router.post('/parties/:id/relationships', write(PAGES.CUSTOMERS), c360.addRelationship);
router.post('/parties/:id/relationships/:relationshipId/end', write(PAGES.CUSTOMERS), c360.endRelationship);
router.post('/parties/:id/tags', write(PAGES.CUSTOMERS), c360.addTag);
router.delete('/parties/:id/tags/:tagId', write(PAGES.CUSTOMERS), c360.removeTag);
router.get('/parties/:id/notes', read(PAGES.CUSTOMERS), c360.notes);
router.post('/parties/:id/notes', write(PAGES.CUSTOMERS), c360.addNote);
router.put('/parties/:id/notes/:noteId', write(PAGES.CUSTOMERS), c360.updateNote);
router.delete('/parties/:id/notes/:noteId', write(PAGES.CUSTOMERS), c360.removeNote);
router.get('/parties/:id/files', read(PAGES.CUSTOMERS), c360.files);
router.post('/parties/:id/files', write(PAGES.CUSTOMERS), memoryUpload.single('file'), c360.addFile);
router.get('/parties/:id/files/:fileId/download', read(PAGES.CUSTOMERS), c360.downloadFile);
router.delete('/parties/:id/files/:fileId', write(PAGES.CUSTOMERS), c360.removeFile);
router.get('/parties/:id/interactions', read(PAGES.CUSTOMERS), c360.interactions);
router.post('/parties/:id/interactions', write(PAGES.CUSTOMERS), c360.logInteraction);
router.post('/parties/:id/messages', write(PAGES.CUSTOMERS), c360.sendMessage);
router.get('/parties/:id/team', read(PAGES.CUSTOMERS), c360.team);
router.post('/parties/:id/team', write(PAGES.CUSTOMERS), c360.assignTeam);
router.post('/parties/:id/team/:teamMemberId/end', write(PAGES.CUSTOMERS), c360.endTeam);
router.get('/parties/:id/agreements', read(PAGES.CUSTOMERS), c360.agreements);
router.post('/parties/:id/agreements', write(PAGES.CUSTOMERS), c360.createAgreement);
router.put('/parties/:id/agreements/:agreementId', write(PAGES.CUSTOMERS), c360.updateAgreement);

/* ---- products and registrations ---- */
router.get('/instances', read(PAGES.PRODUCTS), crmController.products.instances);
router.get('/instances/:id', read(PAGES.PRODUCTS), crmController.products.instance);
router.put('/instances/:id', write(PAGES.PRODUCTS), crmController.products.updateInstance);
router.get('/registrations', read(PAGES.PRODUCTS), crmController.products.registrations);
router.post('/registrations', write(PAGES.PRODUCTS), crmController.products.register);
router.post('/registrations/:id/end', write(PAGES.PRODUCTS), crmController.products.endRegistration);

router.use('/catalog', crudFactory({
  table: 'crm_product_catalog', pk: 'product_id', page: PAGES.PRODUCTS, softDelete: false,
  columns: ['project_id', 'product_code', 'product_name', 'parent_product_id', 'product_type', 'product_kind',
    'product_class_id', 'crystal_product_id', 'model_code', 'list_price', 'currency_code', 'is_reservable', 'status'],
  searchable: ['crm_product_catalog.product_code', 'crm_product_catalog.product_name', 'crm_product_catalog.model_code'],
  sortable: ['product_id', 'product_code', 'product_name', 'status'],
  filterable: ['project_id', 'product_class_id', 'product_kind', 'status'],
  defaultSort: 'product_name',
  decorate: function (qb) {
    qb.leftJoin('crm_project as project', 'project.project_id', 'crm_product_catalog.project_id')
      .leftJoin('crm_product_class as product_class', 'product_class.product_class_id', 'crm_product_catalog.product_class_id')
      .leftJoin('products as crystal_product', 'crystal_product.id', 'crm_product_catalog.crystal_product_id')
      .select('crm_product_catalog.*', 'project.project_code', 'product_class.class_code', 'product_class.class_name',
        'crystal_product.name as crystal_product_name',
        db.raw('(SELECT COUNT(*) FROM crm_product_instance instance WHERE instance.product_id = crm_product_catalog.product_id)::int AS instance_cnt'));
  }
}));

/* ---- transfers and assignments ---- */
router.get('/transfers', read(PAGES.TRANSFERS), crmController.products.transfers);
router.post('/transfers', write(PAGES.TRANSFERS), crmController.products.requestTransfer);
router.post('/transfers/:id/status', write(PAGES.TRANSFERS), crmController.products.transitionTransfer);

/* ---- service cases ---- */
router.get('/cases', read(PAGES.CASES), crmController.cases.list);
router.post('/cases', write(PAGES.CASES), crmController.cases.create);
router.get('/cases/:id', read(PAGES.CASES), crmController.cases.detail);
router.put('/cases/:id', write(PAGES.CASES), crmController.cases.update);
router.put('/cases/:id/classification', write(PAGES.CASES), crmController.cases.classify);

/* ---- points ---- */
router.get('/point-accounts', read(PAGES.POINTS), crmController.points.accounts);
router.get('/point-events', read(PAGES.POINTS), crmController.points.events);
router.get('/point-drift', read(PAGES.POINTS), crmController.points.drift);
router.post('/point-adjustments', write(PAGES.POINTS), crmController.points.adjust);

/* ---- activity programs ---- */
router.get('/programs', read(PAGES.PROGRAMS), crmController.programs.list);
router.post('/programs', write(PAGES.PROGRAMS), crmController.programs.create);
router.get('/programs/:id', read(PAGES.PROGRAMS), crmController.programs.detail);
router.put('/programs/:id', write(PAGES.PROGRAMS), crmController.programs.update);
router.post('/programs/:id/status', write(PAGES.PROGRAMS), crmController.programs.transition);
router.post('/programs/:id/tiers', write(PAGES.PROGRAMS), crmController.programs.saveTier);
router.put('/programs/:id/tiers/:tierId', write(PAGES.PROGRAMS), crmController.programs.saveTier);
router.delete('/programs/:id/tiers/:tierId', write(PAGES.PROGRAMS), crmController.programs.removeTier);
router.post('/programs/:id/locations', write(PAGES.PROGRAMS), crmController.programs.addLocation);
router.delete('/programs/:id/locations/:rowId', write(PAGES.PROGRAMS), crmController.programs.removeLocation);
router.post('/programs/:id/quotas', write(PAGES.PROGRAMS), crmController.programs.saveQuota);
router.put('/programs/:id/quotas/:quotaId', write(PAGES.PROGRAMS), crmController.programs.saveQuota);
router.delete('/programs/:id/quotas/:quotaId', write(PAGES.PROGRAMS), crmController.programs.removeQuota);
router.post('/programs/:id/rewards', write(PAGES.PROGRAMS), crmController.programs.saveReward);
router.put('/programs/:id/rewards/:rewardId', write(PAGES.PROGRAMS), crmController.programs.saveReward);
router.delete('/programs/:id/rewards/:rewardId', write(PAGES.PROGRAMS), crmController.programs.removeReward);
router.get('/programs/:id/targets', read(PAGES.PROGRAMS), crmController.programs.targets);
router.post('/programs/:id/targets', write(PAGES.PROGRAMS), crmController.programs.addTarget);
router.post('/programs/:id/targets/build', write(PAGES.PROGRAMS), crmController.programs.buildTargets);
router.post('/programs/:id/targets/:targetId/revoke', write(PAGES.PROGRAMS), crmController.programs.revokeTarget);
router.get('/programs/:id/reservations', read(PAGES.PROGRAMS), crmController.programs.reservations);
router.post('/programs/:id/reservations', write(PAGES.PROGRAMS), crmController.programs.reserve);
router.get('/reservations/:reservationId/events', read(PAGES.PROGRAMS), crmController.programs.reservationEvents);
router.post('/reservations/:reservationId/status', write(PAGES.PROGRAMS), crmController.programs.transitionReservation);
router.get('/programs/:id/awards', read(PAGES.PROGRAMS), crmController.programs.awards);
router.post('/programs/:id/awards', write(PAGES.PROGRAMS), crmController.programs.award);
router.post('/awards/:awardId/status', write(PAGES.PROGRAMS), crmController.programs.transitionAward);

/* ---- service centres ---- */
router.get('/sites', read(PAGES.SITES), crmController.sites.list);
router.post('/sites', write(PAGES.SITES), crmController.sites.create);
router.get('/sites/:id', read(PAGES.SITES), crmController.sites.detail);
router.put('/sites/:id', write(PAGES.SITES), crmController.sites.update);
router.post('/sites/:id/capabilities', write(PAGES.SITES), crmController.sites.addCapability);
router.post('/sites/:id/capabilities/:capabilityId/end', write(PAGES.SITES), crmController.sites.endCapability);

/* ---- site activity ---- */
router.get('/site-activities', read(PAGES.ACTIVITY), crmController.sites.activities);
router.post('/site-activities', write(PAGES.ACTIVITY), crmController.sites.recordActivity);
router.post('/site-activities/:id/reverse', write(PAGES.ACTIVITY), crmController.sites.reverseActivity);
router.get('/site-events', read(PAGES.ACTIVITY), crmController.sites.events);
router.post('/site-events', write(PAGES.ACTIVITY), crmController.sites.createEvent);
router.put('/site-events/:id', write(PAGES.ACTIVITY), crmController.sites.updateEvent);
router.get('/site-targets', read(PAGES.ACTIVITY), crmController.sites.targets);
router.post('/site-targets', write(PAGES.ACTIVITY), crmController.sites.createTarget);
router.put('/site-targets/:id', write(PAGES.ACTIVITY), crmController.sites.updateTarget);
router.delete('/site-targets/:id', write(PAGES.ACTIVITY), crmController.sites.removeTarget);

/* ---- segments ---- */
router.get('/segments', read(PAGES.SEGMENTS), crmController.segments.list);
router.post('/segments', write(PAGES.SEGMENTS), crmController.segments.create);
router.post('/segments/preview', read(PAGES.SEGMENTS), crmController.segments.preview);
router.get('/segments/:id', read(PAGES.SEGMENTS), crmController.segments.detail);
router.put('/segments/:id', write(PAGES.SEGMENTS), crmController.segments.update);
router.get('/segments/:id/members', read(PAGES.SEGMENTS), crmController.segments.members);
router.post('/segments/:id/versions', write(PAGES.SEGMENTS), crmController.segments.newVersion);
router.post('/segments/:id/evaluate', write(PAGES.SEGMENTS), crmController.segments.evaluate);

/* ---- campaigns ---- */
router.get('/campaigns', read(PAGES.CAMPAIGNS), crmController.campaigns.list);
router.post('/campaigns', write(PAGES.CAMPAIGNS), crmController.campaigns.create);
router.get('/campaigns/:id', read(PAGES.CAMPAIGNS), crmController.campaigns.detail);
router.put('/campaigns/:id', write(PAGES.CAMPAIGNS), crmController.campaigns.update);
router.post('/campaigns/:id/status', write(PAGES.CAMPAIGNS), crmController.campaigns.transition);
router.post('/campaigns/:id/audiences', write(PAGES.CAMPAIGNS), crmController.campaigns.addAudience);
router.post('/campaigns/:id/actions', write(PAGES.CAMPAIGNS), crmController.campaigns.createAction);
router.put('/campaigns/:id/actions/:actionId', write(PAGES.CAMPAIGNS), crmController.campaigns.updateAction);
router.post('/campaigns/:id/actions/:actionId/prepare', write(PAGES.CAMPAIGNS), crmController.campaigns.prepareAction);
router.post('/campaigns/:id/actions/:actionId/status', write(PAGES.CAMPAIGNS), crmController.campaigns.setActionStatus);
router.get('/campaigns/:id/actions/:actionId/recipients', read(PAGES.CAMPAIGNS), crmController.campaigns.recipients);
router.post('/campaigns/:id/costs', write(PAGES.CAMPAIGNS), crmController.campaigns.addCost);
router.delete('/campaigns/:id/costs/:costId', write(PAGES.CAMPAIGNS), crmController.campaigns.removeCost);

/* ---- the vocabularies ---- */

/**
 * CODES THE CODE DEPENDS ON cannot be renamed or deleted from the console.
 *
 * The CRM looks these up by code - the Crystal import needs the CRYSTAL
 * project, a transfer needs OWNER, a pickup writes RESERVATION_PICKUP - so a
 * row whose code was edited would silently turn those steps into no-ops. The
 * name, the order and the flags stay editable; the code does not.
 */
function protectCodes(table, primaryKey, codeColumn, codes) {
  const guard = Router();
  const check = async function (req, res, next) {
    const row = await db(table).where(primaryKey, req.params.id).first(codeColumn + ' as code');
    if (!row || codes.indexOf(row.code) === -1) return next();
    if (req.method === 'DELETE') return next(new HttpError(409, 'crm.thisCodeIsUsedByTheSystem', null, { code: row.code }));
    if (req.body && req.body[codeColumn] !== undefined && req.body[codeColumn] !== row.code) {
      return next(new HttpError(409, 'crm.thisCodeIsUsedByTheSystem', null, { code: row.code }));
    }
    return next();
  };
  guard.put('/:id', check);
  guard.delete('/:id', check);
  guard.delete('/:id/permanent', check);
  return guard;
}

/**
 * Each list is a plain master table, so each is the CRUD factory - the same
 * one the rest of the console uses. `softDelete: false` because none of them
 * has a recycle bin column: a value still in use cannot be deleted at all
 * (its foreign keys refuse), and one that is not in use can simply go.
 */
const VOCABULARIES = [
  { path: 'projects', table: 'crm_project', pk: 'project_id', code: 'project_code',
    columns: ['project_code', 'project_name', 'project_type_code', 'source_system_code', 'legal_entity_code', 'status'],
    system: ['PLATFORM', 'CRYSTAL', 'EPRODUCT', 'ESHOP', 'APPSTORE', 'KARAOKE', 'BMEDIA'] },
  { path: 'product-classes', table: 'crm_product_class', pk: 'product_class_id', code: 'class_code',
    columns: ['class_code', 'class_name', 'parent_product_class_id', 'product_domain', 'rank_no', 'legacy_column', 'description', 'is_active'],
    system: ['SMARTPHONE', 'EPRODUCT', 'SOFTWARE', 'STB', 'PC', 'CAMERA', 'KARAOKE_LICENCE', 'MEDIA_LICENCE'] },
  { path: 'project-tiers', table: 'crm_project_tier', pk: 'project_tier_id', code: 'tier_code', filterable: ['project_id'],
    columns: ['project_id', 'tier_code', 'tier_name', 'rank_no', 'tier_kind', 'source_code', 'min_value', 'is_active'] },
  { path: 'point-types', table: 'crm_point_type', pk: 'point_type_id', code: 'point_type_code',
    columns: ['point_type_code', 'point_type_name', 'owner_project_id', 'is_dream_managed', 'decimal_places', 'expires_after_days', 'is_active'],
    system: ['CRYSTAL'] },
  { path: 'activity-types', table: 'crm_service_center_activity_type', pk: 'activity_type_id', code: 'activity_code',
    columns: ['activity_code', 'activity_name', 'activity_group', 'required_capability_code', 'counts_quantity', 'counts_amount', 'is_active'],
    system: ['REPAIR_INTAKE', 'REPAIR_DELIVERY', 'RESERVATION_PICKUP', 'PRIZE_HANDOVER', 'REGISTRATION_ASSIST'] },
  { path: 'case-types', table: 'crm_service_case_type', pk: 'case_type_id', code: 'case_type_code',
    columns: ['case_type_code', 'display_name'], system: ['REPAIR', 'WARRANTY_REPAIR'] },
  { path: 'service-statuses', table: 'crm_service_status', pk: 'service_status_id', code: 'status_code',
    columns: ['status_code', 'display_name', 'sequence_no', 'is_terminal'], system: ['CLOSED', 'CANCELLED'] },
  { path: 'priorities', table: 'crm_service_priority', pk: 'service_priority_id', code: 'priority_code',
    columns: ['priority_code', 'priority_name', 'rank_no'], system: ['LOW', 'NORMAL', 'HIGH'] },
  { path: 'issue-categories', table: 'crm_issue_category', pk: 'issue_category_id', code: 'category_code',
    columns: ['parent_issue_category_id', 'project_id', 'category_code', 'display_name', 'is_active'] },
  { path: 'fault-categories', table: 'crm_fault_category', pk: 'fault_category_id', code: 'fault_code',
    columns: ['parent_fault_category_id', 'project_id', 'fault_code', 'display_name', 'is_active'] },
  { path: 'root-causes', table: 'crm_root_cause', pk: 'root_cause_id', code: 'root_cause_code',
    columns: ['project_id', 'root_cause_code', 'display_name', 'is_active'] },
  { path: 'resolution-categories', table: 'crm_resolution_category', pk: 'resolution_category_id', code: 'resolution_code',
    columns: ['project_id', 'resolution_code', 'display_name', 'is_active'] },
  { path: 'corporate-grades', table: 'crm_corporate_grade', pk: 'corporate_grade_id', code: 'grade_code',
    columns: ['grade_code', 'grade_name', 'rank_no', 'min_score', 'max_score', 'is_active'], sort: 'rank_no' },
  { path: 'relationship-types', table: 'crm_product_relationship_type', pk: 'relationship_type_id', code: 'relationship_code',
    columns: ['relationship_code', 'relationship_name', 'is_exclusive', 'awards_registration_points'],
    system: ['OWNER', 'USER', 'REGISTERED_USER', 'LESSEE', 'LICENSEE'] },
  { path: 'purchase-purposes', table: 'crm_purchase_purpose', pk: 'purchase_purpose_id', code: 'purpose_code',
    columns: ['purpose_code', 'purpose_name', 'is_active'] },
  { path: 'usage-types', table: 'crm_product_usage_type', pk: 'usage_type_id', code: 'usage_code',
    columns: ['usage_code', 'usage_name', 'is_active'] },
  { path: 'acquisition-types', table: 'crm_acquisition_type', pk: 'acquisition_type_id', code: 'acquisition_code',
    columns: ['acquisition_code', 'acquisition_name', 'is_active'], system: ['PURCHASED', 'TRANSFER', 'COMPANY_ASSIGNED'] },
  { path: 'channels', table: 'crm_communication_channel', pk: 'channel_id', code: 'channel_code',
    columns: ['channel_code', 'channel_name', 'required_contact_type', 'is_active'] },
  { path: 'communication-purposes', table: 'crm_communication_purpose', pk: 'purpose_id', code: 'purpose_code',
    columns: ['purpose_code', 'purpose_name', 'requires_opt_in', 'description'] },
  { path: 'communication-options', table: 'crm_project_communication_option', pk: 'project_communication_option_id',
    columns: ['project_id', 'purpose_id', 'channel_id', 'consent_required', 'is_enabled'], filterable: ['project_id'],
    decorate: function (qb) {
      qb.join('crm_project as project', 'project.project_id', 'crm_project_communication_option.project_id')
        .join('crm_communication_purpose as pp', 'pp.purpose_id', 'crm_project_communication_option.purpose_id')
        .join('crm_communication_channel as ch', 'ch.channel_id', 'crm_project_communication_option.channel_id')
        .select('crm_project_communication_option.*', 'project.project_code', 'pp.purpose_code', 'ch.channel_code');
    } },
  { path: 'organization-types', table: 'crm_organization_type', pk: 'organization_type_id', code: 'type_code',
    columns: ['type_code', 'type_name'] },
  { path: 'contact-roles', table: 'crm_org_contact_role', pk: 'contact_role_id', code: 'role_code',
    columns: ['role_code', 'role_name'] },
  { path: 'currencies', table: 'crm_currency', pk: 'currency_code', code: 'currency_code',
    columns: ['currency_code', 'currency_name', 'decimal_places', 'is_reporting', 'is_active'], system: ['USD'] },
  { path: 'job-titles', table: 'crm_job_title', pk: 'job_title_id', code: 'job_code',
    columns: ['job_code', 'job_name', 'sort_order', 'is_active'], sort: 'sort_order' },
  { path: 'departments', table: 'crm_department', pk: 'department_id', code: 'department_code',
    columns: ['department_code', 'department_name', 'is_active'] },
  { path: 'industries', table: 'crm_industry', pk: 'industry_id', code: 'industry_code',
    columns: ['industry_code', 'industry_name', 'parent_industry_id', 'is_active'] },
  /* The vendor's list; edits here are overwritten by the next import's "locations" step. */
  { path: 'locations', table: 'crm_location', pk: 'location_pk', code: 'location_code', filterable: ['parent_code'],
    columns: ['location_pk', 'location_name', 'location_code', 'parent_code', 'position'],
    sort: 'position' },
  { path: 'metric-definitions', table: 'crm_metric_definition', pk: 'metric_definition_id', code: 'metric_code',
    columns: ['metric_code', 'metric_name', 'value_type', 'unit_code', 'description', 'is_active'],
    system: ['DAYS_SINCE_LAST_PURCHASE', 'CROSS_PROJECT_COUNT', 'PRODUCT_OWNERSHIP_COUNT', 'CHURN_RISK',
      'POINTS_BALANCE', 'IS_MULTI_PROJECT', 'LAST_SERVICE_DATE'] },
  { path: 'point-event-types', table: 'crm_point_event_type', pk: 'point_event_type_id', code: 'event_code',
    columns: ['event_code', 'display_name', 'direction'],
    system: ['EARN', 'REDEEM', 'EXPIRE', 'ADJUST', 'REFUND', 'RESERVATION_COST', 'PROGRAM_AWARD', 'MERGE_CARRY_OVER'] },
  { path: 'tags', table: 'crm_tag', pk: 'tag_id', code: 'tag_code',
    columns: ['tag_code', 'tag_name', 'color_scheme', 'description', 'is_active'] },
  { path: 'relationship-types', table: 'crm_party_relationship_type', pk: 'relationship_type_code', code: 'relationship_type_code',
    columns: ['relationship_type_code', 'relationship_name', 'inverse_code', 'applies_to', 'is_hierarchy', 'sort_order', 'is_active'],
    sort: 'sort_order',
    system: ['SPOUSE', 'PARENT', 'CHILD', 'SIBLING', 'RELATIVE', 'REFERRER', 'REFERRAL', 'PARENT_COMPANY', 'SUBSIDIARY', 'AFFILIATE', 'PARTNER'] },
  { path: 'registration-questions', table: 'crm_registration_question', pk: 'question_id', code: 'question_code',
    columns: ['project_id', 'product_class_id', 'question_code', 'question_label', 'answer_type', 'is_required', 'sort_order', 'is_active'],
    sort: 'sort_order' }
];

VOCABULARIES.forEach(function (vocabulary) {
  if (vocabulary.system) router.use('/settings/' + vocabulary.path, protectCodes(vocabulary.table, vocabulary.pk, vocabulary.code, vocabulary.system));

  router.use('/settings/' + vocabulary.path, crudFactory({
    table: vocabulary.table,
    pk: vocabulary.pk,
    page: PAGES.SETTINGS,
    softDelete: false,
    columns: vocabulary.columns,
    searchable: vocabulary.code ? [vocabulary.table + '.' + vocabulary.code].concat(vocabulary.columns.filter(function (col) {
      return /_name$|display_name|question_label/.test(col);
    }).map(function (col) { return vocabulary.table + '.' + col; })) : [],
    sortable: [vocabulary.pk].concat(vocabulary.columns),
    filterable: vocabulary.filterable || [],
    defaultSort: vocabulary.sort || vocabulary.pk,
    decorate: vocabulary.decorate
  }));
});

/*
 * The point rules sit with the points they pay, on the Reward points page -
 * whoever runs the points decides what earns them.
 */
router.use('/point-rules', crudFactory({
  table: 'crm_point_rule', pk: 'point_rule_id', page: PAGES.POINTS, softDelete: false,
  columns: ['rule_code', 'rule_name', 'point_type_id', 'project_id', 'trigger_code', 'main_type', 'sub_type',
    'product_class_id', 'product_id', 'points', 'daily_cap_count', 'valid_from', 'valid_to', 'source_rule_key', 'is_active'],
  searchable: ['crm_point_rule.rule_code', 'crm_point_rule.rule_name'],
  sortable: ['point_rule_id', 'rule_code', 'rule_name', 'points', 'trigger_code'],
  filterable: ['point_type_id', 'trigger_code', 'is_active'],
  defaultSort: 'rule_code',
  decorate: function (qb) {
    qb.join('crm_point_type as point_type', 'point_type.point_type_id', 'crm_point_rule.point_type_id')
      .leftJoin('crm_project as project', 'project.project_id', 'crm_point_rule.project_id')
      .leftJoin('crm_product_class as product_class', 'product_class.product_class_id', 'crm_point_rule.product_class_id')
      .leftJoin('crm_product_catalog as catalog', 'catalog.product_id', 'crm_point_rule.product_id')
      .select('crm_point_rule.*', 'point_type.point_type_code', 'project.project_code', 'product_class.class_code', 'catalog.product_name',
        db.raw('(SELECT COUNT(*) FROM crm_point_event point_event WHERE point_event.point_rule_id = crm_point_rule.point_rule_id)::int AS event_cnt'));
  }
}));

/*
 * How each project's own status codes read as CRM statuses. A composite key,
 * so not the factory: the whole map for one project is read and replaced.
 */
router.get('/settings/status-map', read(PAGES.SETTINGS), async function (req, res) {
  const rows = await db('crm_service_status_map as status_map')
    .join('crm_project as project', 'project.project_id', 'status_map.project_id')
    .join('crm_service_status as service_status', 'service_status.service_status_id', 'status_map.service_status_id')
    .orderBy([{ column: 'project.project_id' }, { column: 'status_map.source_status_code' }])
    .select('status_map.*', 'project.project_code', 'service_status.status_code', 'service_status.display_name');
  return require('../utils/response').ok(res, rows);
});

router.put('/settings/status-map', write(PAGES.SETTINGS), async function (req, res) {
  const body = req.body || {};
  if (!body.project_id || !body.source_status_code || !body.service_status_id) {
    throw new HttpError(400, 'crm.projectCodeAndStatusAreRequired');
  }
  await db.raw(`
    INSERT INTO crm_service_status_map (project_id, source_status_code, service_status_id, source_status_label)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (project_id, source_status_code)
    DO UPDATE SET service_status_id = EXCLUDED.service_status_id, source_status_label = EXCLUDED.source_status_label`,
  [body.project_id, String(body.source_status_code).trim(), body.service_status_id, body.source_status_label || null]);
  require('../services/audit.service').updated(req.actor, 'crm_service_status_map',
    body.project_id + ':' + body.source_status_code, null, body, PAGES.SETTINGS);
  return require('../utils/response').ok(res, null, 'common.updated');
});

router.delete('/settings/status-map/:projectId/:code', write(PAGES.SETTINGS), async function (req, res) {
  const removed = await db('crm_service_status_map')
    .where({ project_id: req.params.projectId, source_status_code: req.params.code }).del();
  if (!removed) throw new HttpError(404, 'common.notFound');
  return require('../utils/response').ok(res, null, 'common.deleted');
});

/*
 * A VALUE LONGER THAN ITS COLUMN, said as such.
 *
 * The CRM's codes are short by design - a reservation prefix is ten
 * characters, a currency three - and the database is what knows the limit.
 * Unhandled, that is a 500 and a stack trace for a typing mistake. Scoped to
 * this router, so nothing the rest of the console answers changes.
 */
// eslint-disable-next-line no-unused-vars
router.use(function (err, req, res, next) {
  if (err && err.code === '22001') {
    return next(new HttpError(400, 'crm.aValueIsTooLong', null, { column: err.column || '' }));
  }
  /*
   * A code column declared plain UNIQUE gets a name PostgreSQL makes up -
   * crm_activity_program_program_code_key - which is not written anywhere in
   * schema.sql for middleware/error.js's map to name. Any such clash on a CRM
   * table is a code somebody already used.
   */
  if (err && err.code === '23505' && /^crm_\w+_code_key$/.test(String(err.constraint || ''))) {
    return next(new HttpError(409, 'crm.thatCodeIsTaken'));
  }
  return next(err);
});

module.exports = router;
