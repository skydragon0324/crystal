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
  members, wallets, admins, roles, pages, permissions, audit, settings, footer
};

export default api;
