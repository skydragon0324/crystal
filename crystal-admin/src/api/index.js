import client from './client';
import { createResource } from './resource';

/**
 * Every endpoint the console calls, in one place.
 *
 * Most of these are the generic seven; the ones with more are the ones with
 * rules - a repair ticket has a workflow, a claim has a settlement path, a
 * shelf has a ledger - and those extra calls are written out rather than
 * hidden behind a generic verb, because "post to /status" says nothing and
 * `tickets.transition(id, 4)` says what is happening.
 */

/* ---- the console's own session ---- */
export const auth = {
  login: (username, password) => client.post('/auth/login', { username, password }),
  refresh: (refreshToken) => client.post('/auth/refresh', { refresh_token: refreshToken }),
  profile: () => client.get('/auth/profile'),
  changePassword: (oldPassword, newPassword) =>
    client.post('/auth/password', { old_password: oldPassword, new_password: newPassword }),
  logout: () => client.post('/auth/logout')
};

export const dashboard = {
  overview: () => client.get('/dashboard'),
  /*
   * How long until each signing certificate must be renewed. Read by the
   * header's indicator once a session and by the dashboard's card - see
   * app/certificatesSlice.js.
   */
  certificates: () => client.get('/dashboard/certificates')
};

/*
 * The console's chrome, rather than any one screen.
 *
 * Neither endpoint sits behind a page permission: both read across half the
 * system and narrow what they return against the signed-in role's own grid,
 * so what comes back is exactly what that role could have opened anyway.
 */
export const search = {
  query: (q) => client.get('/search', { params: { q } })
};

export const notifications = {
  summary: () => client.get('/notifications')
};

/* ---- 8. after-sales service operations ---- */

export const tickets = {
  ...createResource('/tickets'),

  meta: () => client.get('/tickets/meta'),
  suggestTechnician: (id) => client.get('/tickets/' + id + '/technician-suggestions'),

  transition: (id, status, note) => client.post('/tickets/' + id + '/status', { status, note }),
  assign: (id, technicianId) => client.post('/tickets/' + id + '/assign', { technician_id: technicianId }),
  pay: (id, payload) => client.post('/tickets/' + id + '/pay', payload),
  rate: (id, payload) => client.post('/tickets/' + id + '/rating', payload),

  addItem: (id, payload) => client.post('/tickets/' + id + '/items', payload),
  updateItem: (id, itemId, payload) => client.put('/tickets/' + id + '/items/' + itemId, payload),
  removeItem: (id, itemId) => client.delete('/tickets/' + id + '/items/' + itemId),
  issueItem: (id, itemId) => client.post('/tickets/' + id + '/items/' + itemId + '/issue')
};

export const warranties = {
  ...createResource('/warranties'),
  ofDevice: (serial) => client.get('/warranties/device/' + encodeURIComponent(serial)),
  voidCover: (id, reason) => client.post('/warranties/' + id + '/void', { void_reason: reason })
};

export const policies = createResource('/warranty-policies');
export const symptoms = createResource('/symptoms');
export const technicians = createResource('/technicians');
export const parts = createResource('/parts');

export const stock = {
  list: (params) => client.get('/stock', { params }),
  movements: (params) => client.get('/stock/movements', { params }),
  shortages: (params) => client.get('/stock/shortages', { params }),

  move: (payload) => client.post('/stock/movements', payload),
  stocktake: (payload) => client.post('/stock/stocktake', payload),
  setLevel: (payload) => client.post('/stock/level', payload)
};

export const replenishments = {
  ...createResource('/replenishments'),
  meta: () => client.get('/replenishments/meta'),
  fromShortages: (agencyId) => client.post('/replenishments/from-shortages', { agency_id: agencyId }),
  transition: (id, status, payload) =>
    client.post('/replenishments/' + id + '/status', Object.assign({ status }, payload)),
  addItem: (id, payload) => client.post('/replenishments/' + id + '/items', payload),
  updateItem: (id, itemId, payload) => client.put('/replenishments/' + id + '/items/' + itemId, payload),
  removeItem: (id, itemId) => client.delete('/replenishments/' + id + '/items/' + itemId)
};

export const claims = {
  ...createResource('/claims'),
  meta: () => client.get('/claims/meta'),
  preview: (params) => client.get('/claims/preview', { params }),
  build: (agencyId, month) => client.post('/claims', { agency_id: agencyId, month }),
  transition: (id, status, payload) =>
    client.post('/claims/' + id + '/status', Object.assign({ status }, payload))
};

/* ---- 9. the scoreboard ---- */

export const analysis = {
  agencyHealth: (params) => client.get('/analysis/agency-health', { params }),
  agencyHealthOf: (agencyId) => client.get('/analysis/agency-health/' + agencyId),
  defects: (params) => client.get('/analysis/defect-watch', { params }),
  defectDetail: (productId, symptomId) =>
    client.get('/analysis/defect-watch/' + productId + '/' + symptomId),
  monthly: (params) => client.get('/analysis/monthly', { params }),
  stockValue: () => client.get('/analysis/stock-value')
};

/* ---- 3, 4, 10: catalogue, support, content ---- */

export const products = {
  ...createResource('/products'),
  saveSpecifications: (id, entries) => client.put('/products/' + id + '/specifications', { entries }),

  /*
   * The finishes and the box contents are edited as WHOLE LISTS: the console
   * sends the list it wants rather than a diff, and the server replaces it.
   * A save that drops a row actually drops it, which is what an editor
   * removing a discontinued colour expects.
   */
  saveColors: (id, entries) => client.put('/products/' + id + '/colors', { entries }),
  saveAccessories: (id, entries) => client.put('/products/' + id + '/accessories', { entries }),

  /*
   * A product's own update record. The same endpoint creates and edits,
   * because there is no natural key to conflict on: a product may record the
   * same version twice, on two dates, for two regions.
   */
  addOsHistory: (id, payload) => client.post('/products/' + id + '/os-history', payload),
  updateOsHistory: (id, historyId, payload) =>
    client.put('/products/' + id + '/os-history/' + historyId, payload),
  removeOsHistory: (id, historyId) => client.delete('/products/' + id + '/os-history/' + historyId)
};

/*
 * A product's own artwork - the studio set and the advertising run - and its
 * update record, both as plain resources for the screens that list them.
 * They came out of media_assets and off os_versions respectively; each is now
 * a real table with a foreign key to the product.
 */
export const productImages = createResource('/product-images');
export const productOsHistory = createResource('/product-os-history');

export const categories = createResource('/categories');
export const series = createResource('/series');
/*
 * The notices a visitor is greeted with. A plain master table; the window and
 * the status decide whether each one is live, and the storefront asks for
 * whatever is live now and gets all of it.
 *
 * The origins are their own table for the same reason every other lookup here
 * is: typed into the notice each time, the same team ends up under three
 * spellings and the badge stops grouping anything.
 */
export const notices = createResource('/notices');
export const noticeOrigins = createResource('/notice-origins');

/*
 * THE ABOUT PAGE, as three master tables.
 *
 * Ten console screens read and write these, each narrowed to its own chapter
 * by a `kind` the API filters on - which is why there are three resources here
 * rather than fifteen. See sql/schema.sql 8.9 for why the tables split by
 * shape rather than by chapter.
 */
/*
 * The advertising at the top of the homepage and the smartphone page - one
 * resource per placement, because the API pins each route to its own.
 */
/* /showcase, not /adverts: ad blockers block any request whose address contains /adverts/. */
export const homeAdverts = createResource('/showcase/home');
export const smartphoneAdverts = createResource('/showcase/smartphone');
/* The full-screen ones, which have a period rather than a device crop. */
export const popupAdverts = createResource('/showcase/popup');

export const specGroups = createResource('/specification-groups');
export const specDefinitions = createResource('/specification-definitions');
export const osVersions = createResource('/os-versions');
export const faqs = createResource('/faqs');
export const servicePrices = createResource('/service-prices');

export const agencies = {
  ...createResource('/agencies'),
  meta: () => client.get('/agencies/meta'),
  /*
   * The provinces, in the order set on the Provinces screen. `{ all: 1 }` is
   * the form's list - every province a centre may be filed under, the empty
   * ones included; without it, the ones that have live centres.
   */
  provinces: (params) => client.get('/agencies/provinces', { params })
};

/* The master the centres are filed under, and the storefront's filter order. */
export const provinces = createResource('/provinces');

export const media = {
  list: (params) => client.get('/media', { params }),
  ofOwner: (ownerType, ownerId, params) =>
    client.get('/media/' + ownerType + '/' + ownerId, { params }),
  create: (payload) => client.post('/media', payload),
  update: (id, payload) => client.put('/media/' + id, payload),
  remove: (id) => client.delete('/media/' + id),
  discard: (filePath) => client.delete('/media/upload', { data: { file_path: filePath } }),
  reorder: (entries) => client.put('/media/reorder', { entries }),

  /**
   * The upload is multipart, so the JSON content type has to be left off -
   * the browser writes the boundary itself and cannot if the header is
   * already set.
   */
  upload: (folder, file, fields) => {
    const form = new FormData();
    form.append('file', file);
    Object.keys(fields || {}).forEach((key) => {
      if (fields[key] !== undefined && fields[key] !== null) form.append(key, fields[key]);
    });
    return client.post('/media/upload/' + folder, form, {
      headers: { 'Content-Type': undefined }
    });
  },

  /**
   * The same upload for an advert slide, which may be a picture, an animated
   * GIF or a short MP4/WebM.
   *
   * A separate endpoint rather than a flag, because the artwork one above has
   * to go on refusing video: every other screen draws what it stores in an
   * <img>. A picture sent here is signed exactly as it would have been; a
   * film is checked for what it really is and stored unsigned.
   */
  uploadMedia: (folder, file) => {
    const form = new FormData();
    form.append('file', file);
    return client.post('/media/upload-media/' + folder, form, {
      headers: { 'Content-Type': undefined }
    });
  },

  /**
   * The same upload for a file that is NOT artwork - an approval certificate
   * attached to a published price, say.
   *
   * A separate endpoint rather than a flag, because the artwork one has to go
   * on refusing a PDF: widening its filter would let a PDF be saved as a
   * product's hero image.
   */
  uploadDocument: (folder, file) => {
    const form = new FormData();
    form.append('file', file);
    return client.post('/media/upload-document/' + folder, form, {
      headers: { 'Content-Type': undefined }
    });
  }
};

export const articles = {
  ...createResource('/articles'),
  transition: (id, status) => client.post('/articles/' + id + '/status', { status })
};

/* ---- 11. members ---- */

export const members = {
  list: (params) => client.get('/members', { params }),
  get: (id) => client.get('/members/' + id),
  setStatus: (id, status) => client.post('/members/' + id + '/status', { status }),

  registrations: (params) => client.get('/members/registrations', { params }),
  licenses: (params) => client.get('/members/licenses', { params }),

  /*
   * Feedback is a CONVERSATION: a thread carries the subject and the state,
   * and both sides post into one chain underneath it.
   */
  feedback: (params) => client.get('/members/feedback', { params }),
  feedbackCounts: () => client.get('/members/feedback/counts'),
  feedbackDetail: (id) => client.get('/members/feedback/' + id),
  reply: (id, message) => client.post('/members/feedback/' + id + '/reply', { message }),
  resolveFeedback: (id) => client.post('/members/feedback/' + id + '/resolve'),
  removeFeedback: (id) => client.delete('/members/feedback/' + id)
};

/**
 * WALLETS ARE THEIR OWN RESOURCE, not a corner of /members.
 *
 * The two ledgers page independently of each other and of the member list, so
 * folding them in would mean one endpoint answering with three paginations.
 *
 * `adjust` is the only write here. There is no update and no delete, because
 * a ledger row is the evidence that a balance is what it claims to be -
 * a movement made in error is corrected by one that names it.
 */
export const wallets = {
  list: (params) => client.get('/wallets', { params }),
  detail: (userId) => client.get('/wallets/' + userId),
  transactions: (userId, params) => client.get('/wallets/' + userId + '/transactions', { params }),
  points: (userId, params) => client.get('/wallets/' + userId + '/points', { params }),
  pointSummary: (userId) => client.get('/wallets/' + userId + '/point-summary'),
  adjust: (userId, body) => client.post('/wallets/' + userId + '/adjust', body)
};

/* ---- 10. the CRM ----
 *
 * One object with a group per screen, because the CRM is one module with its
 * own prefix on the API - /admin/crm - and a screen reads more naturally as
 * `crm.programs.reserve(id, body)` than as thirty exports that all start with
 * the same four letters. The vocabularies under `settings` are the generic
 * seven, as every other master table in the console is.
 */
const CRM = '/crm';

export const crm = {
  meta: () => client.get(CRM + '/meta'),
  overview: () => client.get(CRM + '/overview'),
  importCrystal: () => client.post(CRM + '/import'),
  importVendor: () => client.post(CRM + '/import/vendor'),
  recalculate: () => client.post(CRM + '/recalculate'),

  analysis: {
    summary: (date) => client.get(CRM + '/analysis/summary', { params: { reference_date: date } }),
    snapshots: (params) => client.get(CRM + '/analysis/snapshots', { params }),
    metrics: (params) => client.get(CRM + '/analysis/metrics', { params }),
    model: () => client.get(CRM + '/analysis/model'),
    run: (date) => client.post(CRM + '/analysis/run', { reference_date: date })
  },

  transactions: {
    list: (params) => client.get(CRM + '/transactions', { params }),
    get: (id) => client.get(CRM + '/transactions/' + id)
  },

  memberships: {
    list: (params) => client.get(CRM + '/memberships', { params }),
    distribution: () => client.get(CRM + '/memberships/distribution'),
    history: (id) => client.get(CRM + '/memberships/' + id + '/history'),
    setTier: (id, tierId, reason) => client.post(CRM + '/memberships/' + id + '/tier', { tier_id: tierId, reason: reason }),
    setStatus: (id, status) => client.post(CRM + '/memberships/' + id + '/status', { membership_status: status })
  },

  organizations: {
    assignType: (id, payload) => client.post(CRM + '/parties/' + id + '/org-types', payload),
    endType: (id, assignmentId) => client.post(CRM + '/parties/' + id + '/org-types/' + assignmentId + '/end'),
    setIndustry: (id, payload) => client.put(CRM + '/parties/' + id + '/industries', payload),
    removeIndustry: (id, industryId) => client.delete(CRM + '/parties/' + id + '/industries/' + industryId),
    addPerson: (id, payload) => client.post(CRM + '/parties/' + id + '/people', payload),
    endPerson: (id, relationshipId) => client.post(CRM + '/parties/' + id + '/people/' + relationshipId + '/end')
  },

  departments: {
    staff: () => client.get(CRM + '/departments/staff'),
    roles: () => client.get(CRM + '/departments/roles'),
    assignManager: (managerId, departmentId) => client.put(CRM + '/departments/staff/' + managerId, { department_id: departmentId }),
    setRoleDepartment: (roleId, departmentId) => client.put(CRM + '/departments/roles/' + roleId, { department_id: departmentId })
  },

  /** The customer record's figures and cards, and what can be done from it. */
  customer360: {
    overview: (id) => client.get(CRM + '/parties/' + id + '/360'),
    search: (query) => client.get(CRM + '/search', { params: { q: query } }),
    addRelationship: (id, payload) => client.post(CRM + '/parties/' + id + '/relationships', payload),
    endRelationship: (id, relationshipId) => client.post(CRM + '/parties/' + id + '/relationships/' + relationshipId + '/end'),
    addTag: (id, tagId) => client.post(CRM + '/parties/' + id + '/tags', { tag_id: tagId }),
    removeTag: (id, tagId) => client.delete(CRM + '/parties/' + id + '/tags/' + tagId),
    notes: (id, params) => client.get(CRM + '/parties/' + id + '/notes', { params }),
    addNote: (id, payload) => client.post(CRM + '/parties/' + id + '/notes', payload),
    updateNote: (id, noteId, payload) => client.put(CRM + '/parties/' + id + '/notes/' + noteId, payload),
    removeNote: (id, noteId) => client.delete(CRM + '/parties/' + id + '/notes/' + noteId),
    files: (id) => client.get(CRM + '/parties/' + id + '/files'),
    /* Multipart, so the JSON content type is left off for the browser to write the boundary. */
    uploadFile: (id, file, description) => {
      const form = new FormData();
      form.append('file', file);
      if (description) form.append('description', description);
      return client.post(CRM + '/parties/' + id + '/files', form, { headers: { 'Content-Type': undefined } });
    },
    /* The bytes come back as a blob: a plain link could not carry the Authorization header. */
    downloadFile: (id, fileId) => client.get(CRM + '/parties/' + id + '/files/' + fileId + '/download', { responseType: 'blob' }),
    removeFile: (id, fileId) => client.delete(CRM + '/parties/' + id + '/files/' + fileId),
    interactions: (id, params) => client.get(CRM + '/parties/' + id + '/interactions', { params }),
    logInteraction: (id, payload) => client.post(CRM + '/parties/' + id + '/interactions', payload),
    sendMessage: (id, payload) => client.post(CRM + '/parties/' + id + '/messages', payload),
    team: (id) => client.get(CRM + '/parties/' + id + '/team'),
    assignTeam: (id, payload) => client.post(CRM + '/parties/' + id + '/team', payload),
    endTeam: (id, teamMemberId) => client.post(CRM + '/parties/' + id + '/team/' + teamMemberId + '/end'),
    agreements: (id) => client.get(CRM + '/parties/' + id + '/agreements'),
    createAgreement: (id, payload) => client.post(CRM + '/parties/' + id + '/agreements', payload),
    updateAgreement: (id, agreementId, payload) => client.put(CRM + '/parties/' + id + '/agreements/' + agreementId, payload)
  },

  parties: {
    list: (params) => client.get(CRM + '/parties', { params }),
    lookup: (query, ids) => client.get(CRM + '/parties/lookup', { params: { q: query, ids: ids } }),
    get: (id) => client.get(CRM + '/parties/' + id),
    create: (payload) => client.post(CRM + '/parties', payload),
    /* Customers on file who look like a person not yet saved. */
    similar: (params) => client.get(CRM + '/parties/similar', { params }),
    /* People from an Excel sheet; dryRun only reports what would happen. Multipart, so the JSON content type is left off. */
    importPeople: (file, dryRun) => {
      const form = new FormData();
      form.append('file', file);
      return client.post(CRM + '/parties/import' + (dryRun ? '?dry_run=1' : ''), form, { headers: { 'Content-Type': undefined } });
    },
    importTemplate: () => client.get(CRM + '/parties/import/template', { responseType: 'blob' }),
    update: (id, payload) => client.put(CRM + '/parties/' + id, payload),
    setStatus: (id, status) => client.post(CRM + '/parties/' + id + '/status', { party_status: status }),
    setChecked: (id, checked) => client.post(CRM + '/parties/' + id + '/checked', { is_checked_manually: checked }),
    addContact: (id, payload) => client.post(CRM + '/parties/' + id + '/contacts', payload),
    updateContact: (id, contactId, payload) => client.put(CRM + '/parties/' + id + '/contacts/' + contactId, payload),
    linkAccount: (id, payload) => client.post(CRM + '/parties/' + id + '/accounts', payload),
    unlinkAccount: (id, accountId) => client.post(CRM + '/parties/' + id + '/accounts/' + accountId + '/unlink'),
    setConsent: (id, payload) => client.put(CRM + '/parties/' + id + '/consents', payload),
    merge: (id, mergedId, reason) => client.post(CRM + '/parties/' + id + '/merge', { merged_party_pk: mergedId, merge_reason: reason }),
    registrations: (params) => client.get(CRM + '/registrations', { params }),
    decideRegistration: (id, payload) => client.post(CRM + '/registrations/' + id + '/decide', payload),
    duplicates: (params) => client.get(CRM + '/duplicates', { params }),
    scanDuplicates: () => client.post(CRM + '/duplicates/scan'),
    acceptDuplicate: (id) => client.post(CRM + '/duplicates/' + id + '/accept'),
    rejectDuplicate: (id) => client.post(CRM + '/duplicates/' + id + '/reject')
  },

  products: {
    instances: (params) => client.get(CRM + '/instances', { params }),
    instanceLookup: (query) => client.get(CRM + '/instances/lookup', { params: { q: query } }),
    instance: (id) => client.get(CRM + '/instances/' + id),
    updateInstance: (id, payload) => client.put(CRM + '/instances/' + id, payload),
    registrations: (params) => client.get(CRM + '/registrations', { params }),
    register: (payload) => client.post(CRM + '/registrations', payload),
    endRegistration: (id, reason) => client.post(CRM + '/registrations/' + id + '/end', { end_reason_code: reason }),
    catalogLookup: (params) => client.get(CRM + '/catalog/lookup', { params })
  },
  catalog: createResource(CRM + '/catalog'),

  transfers: {
    list: (params) => client.get(CRM + '/transfers', { params }),
    request: (payload) => client.post(CRM + '/transfers', payload),
    transition: (id, status, reason) => client.post(CRM + '/transfers/' + id + '/status', { status: status, reason: reason })
  },

  cases: {
    list: (params) => client.get(CRM + '/cases', { params }),
    get: (id) => client.get(CRM + '/cases/' + id),
    create: (payload) => client.post(CRM + '/cases', payload),
    update: (id, payload) => client.put(CRM + '/cases/' + id, payload),
    classify: (id, payload) => client.put(CRM + '/cases/' + id + '/classification', payload)
  },

  points: {
    accounts: (params) => client.get(CRM + '/point-accounts', { params }),
    events: (params) => client.get(CRM + '/point-events', { params }),
    drift: () => client.get(CRM + '/point-drift'),
    adjust: (payload) => client.post(CRM + '/point-adjustments', payload)
  },
  pointRules: createResource(CRM + '/point-rules'),

  programs: {
    list: (params) => client.get(CRM + '/programs', { params }),
    options: () => client.get(CRM + '/programs/options'),
    get: (id) => client.get(CRM + '/programs/' + id),
    create: (payload) => client.post(CRM + '/programs', payload),
    update: (id, payload) => client.put(CRM + '/programs/' + id, payload),
    transition: (id, status) => client.post(CRM + '/programs/' + id + '/status', { status: status }),
    saveTier: (id, tierId, payload) => (tierId
      ? client.put(CRM + '/programs/' + id + '/tiers/' + tierId, payload)
      : client.post(CRM + '/programs/' + id + '/tiers', payload)),
    removeTier: (id, tierId) => client.delete(CRM + '/programs/' + id + '/tiers/' + tierId),
    addLocation: (id, payload) => client.post(CRM + '/programs/' + id + '/locations', payload),
    removeLocation: (id, rowId) => client.delete(CRM + '/programs/' + id + '/locations/' + rowId),
    saveQuota: (id, quotaId, payload) => (quotaId
      ? client.put(CRM + '/programs/' + id + '/quotas/' + quotaId, payload)
      : client.post(CRM + '/programs/' + id + '/quotas', payload)),
    removeQuota: (id, quotaId) => client.delete(CRM + '/programs/' + id + '/quotas/' + quotaId),
    saveReward: (id, rewardId, payload) => (rewardId
      ? client.put(CRM + '/programs/' + id + '/rewards/' + rewardId, payload)
      : client.post(CRM + '/programs/' + id + '/rewards', payload)),
    removeReward: (id, rewardId) => client.delete(CRM + '/programs/' + id + '/rewards/' + rewardId),
    targets: (id, params) => client.get(CRM + '/programs/' + id + '/targets', { params }),
    addTarget: (id, payload) => client.post(CRM + '/programs/' + id + '/targets', payload),
    buildTargets: (id) => client.post(CRM + '/programs/' + id + '/targets/build'),
    revokeTarget: (id, targetId) => client.post(CRM + '/programs/' + id + '/targets/' + targetId + '/revoke'),
    reservations: (id, params) => client.get(CRM + '/programs/' + id + '/reservations', { params }),
    reserve: (id, payload) => client.post(CRM + '/programs/' + id + '/reservations', payload),
    reservationEvents: (reservationId) => client.get(CRM + '/reservations/' + reservationId + '/events'),
    moveReservation: (reservationId, payload) => client.post(CRM + '/reservations/' + reservationId + '/status', payload),
    awards: (id, params) => client.get(CRM + '/programs/' + id + '/awards', { params }),
    award: (id, payload) => client.post(CRM + '/programs/' + id + '/awards', payload),
    moveAward: (awardId, payload) => client.post(CRM + '/awards/' + awardId + '/status', payload)
  },

  sites: {
    list: (params) => client.get(CRM + '/sites', { params }),
    options: () => client.get(CRM + '/sites/options'),
    get: (id) => client.get(CRM + '/sites/' + id),
    create: (payload) => client.post(CRM + '/sites', payload),
    update: (id, payload) => client.put(CRM + '/sites/' + id, payload),
    addCapability: (id, payload) => client.post(CRM + '/sites/' + id + '/capabilities', payload),
    endCapability: (id, capabilityId) => client.post(CRM + '/sites/' + id + '/capabilities/' + capabilityId + '/end')
  },

  siteActivity: {
    list: (params) => client.get(CRM + '/site-activities', { params }),
    record: (payload) => client.post(CRM + '/site-activities', payload),
    reverse: (id, note) => client.post(CRM + '/site-activities/' + id + '/reverse', { note: note }),
    events: (params) => client.get(CRM + '/site-events', { params }),
    createEvent: (payload) => client.post(CRM + '/site-events', payload),
    updateEvent: (id, payload) => client.put(CRM + '/site-events/' + id, payload),
    targets: (params) => client.get(CRM + '/site-targets', { params }),
    createTarget: (payload) => client.post(CRM + '/site-targets', payload),
    updateTarget: (id, payload) => client.put(CRM + '/site-targets/' + id, payload),
    removeTarget: (id) => client.delete(CRM + '/site-targets/' + id)
  },

  segments: {
    list: (params) => client.get(CRM + '/segments', { params }),
    options: () => client.get(CRM + '/segments/options'),
    fields: () => client.get(CRM + '/segments/fields'),
    preview: (rule) => client.post(CRM + '/segments/preview', { rule_expression: rule }),
    get: (id) => client.get(CRM + '/segments/' + id),
    members: (id, params) => client.get(CRM + '/segments/' + id + '/members', { params }),
    create: (payload) => client.post(CRM + '/segments', payload),
    update: (id, payload) => client.put(CRM + '/segments/' + id, payload),
    newVersion: (id, rule) => client.post(CRM + '/segments/' + id + '/versions', { rule_expression: rule }),
    evaluate: (id) => client.post(CRM + '/segments/' + id + '/evaluate')
  },

  campaigns: {
    list: (params) => client.get(CRM + '/campaigns', { params }),
    options: () => client.get(CRM + '/campaigns/options'),
    get: (id) => client.get(CRM + '/campaigns/' + id),
    create: (payload) => client.post(CRM + '/campaigns', payload),
    update: (id, payload) => client.put(CRM + '/campaigns/' + id, payload),
    transition: (id, status) => client.post(CRM + '/campaigns/' + id + '/status', { status: status }),
    addAudience: (id, payload) => client.post(CRM + '/campaigns/' + id + '/audiences', payload),
    saveAction: (id, actionId, payload) => (actionId
      ? client.put(CRM + '/campaigns/' + id + '/actions/' + actionId, payload)
      : client.post(CRM + '/campaigns/' + id + '/actions', payload)),
    prepareAction: (id, actionId) => client.post(CRM + '/campaigns/' + id + '/actions/' + actionId + '/prepare'),
    setActionStatus: (id, actionId, status) =>
      client.post(CRM + '/campaigns/' + id + '/actions/' + actionId + '/status', { status: status }),
    recipients: (id, actionId, params) =>
      client.get(CRM + '/campaigns/' + id + '/actions/' + actionId + '/recipients', { params }),
    addCost: (id, payload) => client.post(CRM + '/campaigns/' + id + '/costs', payload),
    removeCost: (id, costId) => client.delete(CRM + '/campaigns/' + id + '/costs/' + costId)
  },

  /* The vocabularies, one generic resource each, keyed by their path on the API. */
  settings: function (path) { return createResource(CRM + '/settings/' + path); },
  statusMap: {
    list: () => client.get(CRM + '/settings/status-map'),
    save: (payload) => client.put(CRM + '/settings/status-map', payload),
    remove: (projectId, code) => client.delete(CRM + '/settings/status-map/' + projectId + '/' + encodeURIComponent(code))
  }
};

/* ---- 1. management ---- */

export const admins = createResource('/admins');
export const roles = createResource('/roles');
export const pages = createResource('/pages');

export const permissions = {
  levels: () => client.get('/permissions/levels'),
  pages: () => client.get('/permissions/pages'),
  matrix: (roleId) => client.get('/permissions/' + roleId),
  save: (roleId, entries) => client.put('/permissions/' + roleId, { entries })
};

export const audit = {
  list: (params) => client.get('/audit', { params }),
  filters: () => client.get('/audit/filters'),
  history: (entity, entityPk) => client.get('/audit/history/' + entity + '/' + entityPk)
};

export const settings = {
  list: () => client.get('/settings'),
  save: (values) => client.put('/settings', values)
};

export const footer = {
  detail: () => client.get('/footer'),
  save: (document) => client.put('/footer', document)
};

const api = {
  auth, dashboard,
  tickets, warranties, policies, symptoms, technicians, parts, stock,
  replenishments, claims, analysis,
  products, productImages, productOsHistory,
  categories, series, specGroups, specDefinitions, osVersions,
  notices, noticeOrigins,
  homeAdverts,
  smartphoneAdverts,
  popupAdverts,
  faqs, servicePrices, agencies, provinces, media, articles,
  members, wallets, crm, admins, roles, pages, permissions, audit, settings, footer
};

export default api;
