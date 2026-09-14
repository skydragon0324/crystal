import client from './client';

/**
 * Every endpoint the storefront calls.
 *
 * The catalogue functions take a `section` where the API does, so the
 * Smartphone and Eproducts pages share one implementation instead of two
 * near-identical copies.
 */

/* -------------------------------------------------------------------- auth */

export const auth = {
  /** Which credentials this device may use (spec 5). */
  methods: () => client.get('/auth/methods'),
  register: (payload) => client.post('/auth/register', payload),
  /* The platform identifies a person by user_id; it has no email column. */
  login: (userId, password) => client.post('/auth/login', { user_id: userId, password }),
  requestOtp: (phone, purpose) => client.post('/auth/otp/request', { phone, purpose }),
  verifyOtp: (phone, code, deviceId) =>
    client.post('/auth/otp/verify', { phone, code, deviceId }),
  refresh: (refreshToken) => client.post('/auth/refresh', { refreshToken }),
  me: () => client.get('/auth/me'),
  logout: () => client.post('/auth/logout'),
  changePassword: (currentPassword, newPassword) =>
    client.post('/auth/password', { currentPassword, newPassword }),
  bindPhone: (phone, code) => client.post('/auth/phone', { phone, code })
};

/* --------------------------------------------------------------- catalogue */

export const catalog = {
  categories: (type) => client.get('/categories', { params: { type } }),

  /*
   * A section is addressed by SLUG or by TYPE and the API takes them as two
   * different parameters - `?category=smartphones` is a slug, `?type=TV` is
   * a category type.  Passing one where the other is expected matches
   * nothing, so the choice is made here rather than at each call site.
   */
  series: (section) =>
    client.get('/series', {
      params: /^[A-Z_]+$/.test(String(section || '')) ? { type: section } : { category: section }
    }),

  /** The smartphone landing page, and the same builder for other sections. */
  smartphoneHome: () => client.get('/smartphones/home'),
  sectionHome: (type) => client.get(`/sections/${type}/home`),

  products: (params) => client.get('/products', { params }),
  product: (slug) => client.get(`/products/${slug}`),
  gallery: (slug) => client.get(`/products/${slug}/gallery`),
  servicePricing: (slug, params) =>
    client.get(`/products/${slug}/service-pricing`, { params }),
  osHistory: (slug) => client.get(`/products/${slug}/os-history`),

  compare: (ids) => client.get('/products/compare', { params: { id: ids.join(',') } }),
  comparable: (type) => client.get('/products/comparable', { params: { type } })
};

/* ----------------------------------------------------------------- support */

export const support = {
  home: () => client.get('/support/home'),
  agencies: (params) => client.get('/support/agencies', { params }),
  agency: (id) => client.get(`/support/agencies/${id}`),
  regions: () => client.get('/support/agencies/regions'),

  /*
   * Every notice that is live right now, highest first - an empty list on a
   * day with nothing to say. Public and unauthenticated: it is the first
   * request the site makes, before anybody has signed in.
   *
   * A LIST rather than the single notice this used to fetch. The arrival
   * dialog still shows them one at a time, because a stack of modals is an
   * obstacle rather than a greeting - but that is a decision the dialog
   * makes, and the notification page shows the rest.
   */
  notices: (params) => client.get('/notices', { params }),
  faqs: (params) => client.get('/support/faqs', { params }),
  faqCategories: () => client.get('/support/faqs/categories'),
  faq: (id) => client.get(`/support/faqs/${id}`),
  os: () => client.get('/support/os'),
  latestOs: () => client.get('/support/os/latest')
};

/* -------------------------------------------------------------------- blog */

/* ------------------------------------------------------------------ site */

export const site = {
  /*
   * THE FOOTER, which the console owns rather than the code. Public and
   * unauthenticated - it is on every page including the ones a signed-out
   * visitor sees.
   */
  footer: () => client.get('/site/footer')
};

/* ---------------------------------------------------------- the company */

export const about = {
  /*
   * TEN CHAPTERS IN ONE REPLY. The About page is one long story, and a
   * request per chapter would be ten round trips to draw it - and a page
   * that settles ten times while somebody reads the first paragraph.
   */
  page: () => client.get('/about')
};

export const blog = {
  list: (params) => client.get('/blog', { params }),
  article: (slug) => client.get(`/blog/${slug}`),
  categories: () => client.get('/blog/categories'),
  featured: (limit) => client.get('/blog/featured', { params: { limit } })
};

/* ------------------------------------------------------------ member centre */

export const account = {
  dashboard: () => client.get('/account/dashboard'),
  profile: () => client.get('/account/profile'),
  updateProfile: (payload) => client.patch('/account/profile', payload),

  checkSerial: (sn) => client.get('/account/products/check', { params: { sn } }),
  registrations: (params) => client.get('/account/products', { params }),
  registerProduct: (payload) => client.post('/account/products', payload),
  removeRegistration: (id) => client.delete(`/account/products/${id}`),

  licenses: (params) => client.get('/account/licenses', { params }),
  licensableDevices: () => client.get('/account/licenses/devices'),
  issueLicense: (payload) => client.post('/account/licenses', payload),

  wallet: () => client.get('/account/wallet'),
  walletTransactions: (params) => client.get('/account/wallet/transactions', { params }),
  charge: (amount, reference) => client.post('/account/wallet/charge', { amount, reference }),
  transfer: (payload) => client.post('/account/wallet/transfer', payload),
  setPayPassword: (currentPassword, newPassword) =>
    client.post('/account/wallet/pay-password', { currentPassword, newPassword }),

  points: (params) => client.get('/account/points', { params }),
  pointSummary: () => client.get('/account/points/summary'),
  /* Every system the member holds points in - see pages/account/Points.js. */
  pointSystems: () => client.get('/account/points/systems'),

  /* Repairs and the member's own articles - both were menu entries with no
     API call behind them, which is why both pages silently redirected. */
  repairs: (params) => client.get('/account/repairs', { params }),
  repair: (id) => client.get(`/account/repairs/${id}`),
  rateRepair: (id, body) => client.post(`/account/repairs/${id}/rating`, body),
  articles: (params) => client.get('/account/articles', { params }),

  /*
   * THE TWO STOREFRONTS. Crystal does not run either one - these reach the
   * Eshop and the Appstore over HTTP through the backend, which resolves the
   * member's key in each before it calls. See config/remote.js there.
   */
  eshopCard: () => client.get('/account/eshop/card'),
  eshopOrders: (params) => client.get('/account/eshop/orders', { params }),
  eshopOrder: (orderId) => client.get(`/account/eshop/orders/${orderId}`),
  /* One endpoint, three views: TRANSACTIONS, EXPERIENCE, COMMERCE. */
  eshopLog: (params) => client.get('/account/eshop/log', { params }),

  appstoreBalance: () => client.get('/account/appstore/balance'),
  appstoreTransactions: (params) => client.get('/account/appstore/transactions', { params }),
  appstorePurchases: (params) => client.get('/account/appstore/purchases', { params }),
  appstoreComments: (params) => client.get('/account/appstore/comments', { params }),
  appstoreFavourites: (params) => client.get('/account/appstore/favourites', { params }),
  /* Fetched per row, on demand - a licence key does not belong in a column. */
  appstoreLicense: (purchaseId) => client.get(`/account/appstore/purchases/${purchaseId}/license`),

  /*
   * THE EPRODUCT SITE, a third outside system keyed by the member's LOGIN
   * rather than by either of the storefront pks.
   *
   * `eprodRegistrations` is NOT `products` below. That one is what Crystal
   * knows about; this is what the eproduct site knows about, and a member can
   * appear in one and not the other - which is why both exist.
   */
  eprodBalance: () => client.get('/account/eproduct/balance'),
  eprodRegistrations: (params) => client.get('/account/eproduct/registrations', { params }),
  karaokeKeygen: (params) => client.get('/account/eproduct/keygen/karaoke', { params }),
  manbangKeygen: (params) => client.get('/account/eproduct/keygen/manbang', { params }),
  bmediaKeygen: (params) => client.get('/account/eproduct/keygen/bmedia', { params }),

  /*
   * WHAT YOU DID BEFORE, in the systems that ran before this one. Database
   * reads rather than HTTP, and a closed record: nothing new is written to
   * any of them, and a merged account's history stops at the merge.
   */
  activityOldLog: (params) => client.get('/account/history/activity', { params }),
  karaokeOldLog: (params) => client.get('/account/history/karaoke', { params }),
  mediaOldLog: (params) => client.get('/account/history/media', { params }),

  /*
   * Feedback is a CONVERSATION: a thread carries the subject and the state,
   * and both sides post into one chain underneath it.
   */
  feedback: (params) => client.get('/account/feedback', { params }),
  feedbackDetail: (id) => client.get(`/account/feedback/${id}`),
  submitFeedback: (payload) => client.post('/account/feedback', payload),
  postFeedback: (id, message) => client.post(`/account/feedback/${id}/messages`, { message }),
  closeFeedback: (id) => client.post(`/account/feedback/${id}/close`),

  /*
   * A member removing a conversation of their own. A soft delete: it leaves
   * their list and the support queue, and stays recoverable from the recycle
   * bin - which is why the confirmation says "you will not be able to reopen
   * it" rather than promising it is gone.
   */
  removeFeedback: (id) => client.delete(`/account/feedback/${id}`)
};

const api = { auth, catalog, support, site, about, blog, account };

export default api;
