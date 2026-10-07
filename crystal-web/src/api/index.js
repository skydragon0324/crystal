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
  /* `cid` only from the /login mobile form; the server records it and never checks it. */
  login: (userId, password, cid) => client.post('/auth/login', cid ? { user_id: userId, password, cid } : { user_id: userId, password }),
  /*
   * THE DESKTOP CERTIFICATE SIGN-IN - the server's two halves. The member's
   * certificate agent does the rest; see app/x509Agent.js.
   */
  x509PrimaryData: (clientRand, userId, version) =>
    client.post('/auth/x509/primary_data', { client_rand: clientRand, userid: userId, version }),
  x509Login: (payload) => client.post('/auth/x509/x509_login', payload),
  /*
   * THE PHONE'S SIM, the same idea for a device that has the card in it.
   * The customised browser signs the challenge; see app/mikAgent.js.
   */
  mikRegister: (cid, mikData) => client.post('/auth/mik/register', { cid, mikData }),
  mikChallenge: (cid) => client.post('/auth/mik/challenge', { cid }),
  mikLogin: (payload) => client.post('/auth/mik/login', payload),
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
  /* In the order set in the console; `{ section }` counts one counter's centres. */
  regions: (params) => client.get('/support/agencies/regions', { params }),

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

/* ------------------------------------------------------------------ site */

export const site = {
  /** Footer/contact data shared with the native apps and managed in admin. */
  footer: () => client.get('/site/footer'),
  /*
   * The advertising at the top of a page - 'home' or 'smartphone' - already
   * narrowed to this device's crops by the X-Crystal-Device header.
   */
  /* /site/showcase, not /site/adverts: ad blockers block any address containing /adverts/. */
  adverts: (placement) => client.get(`/site/showcase/${placement}`),
  /* The full-screen ones running today - the server decides what 'today' means. */
  popups: () => client.get('/site/showcase-popups')
};

export const blog = {
  /* ?subject= (a shelf, its sub-shelves included), ?q=, ?sort=latest|replies|views|recommended */
  list: (params) => client.get('/blog', { params }),
  article: (slug) => client.get(`/blog/${slug}`),
  categories: () => client.get('/blog/categories'),
  featured: (limit) => client.get('/blog/featured', { params: { limit } }),
  /* The vendor's shelves as a tree, each with what is published on it. */
  subjects: () => client.get('/blog/subjects'),
  /* A thread's replies, a page at a time, newest activity first - the vendor's order. */
  replies: (slug, params) => client.get(`/blog/${slug}/replies`, { params }),
  /*
   * ONE REPLY, RESOLVED TO ITS THREAD: { reply, thread: { id, slug }, position,
   * page }. Replies have no page of their own; this is what turns a link to
   * one into "that conversation, at that reply".
   */
  reply: (id, params) => client.get(`/blog/reply/${id}`, { params })
};

/* ------------------------------------------------------------ member centre */

export const account = {
  dashboard: () => client.get('/account/dashboard'),
  profile: () => client.get('/account/profile'),
  updateProfile: (payload) => client.patch('/account/profile', payload),

  /*
   * REGISTERING A DEVICE, and what the support page shows of it.
   *
   * The account's own device list and its licence page are gone - the member
   * reads both on the eproduct pages, which are the systems that actually hold
   * them. What is left is the registration form and the three most recent
   * devices on the support page, so the endpoints the two removed pages used
   * alone went with them: removeRegistration, licenses, licensableDevices,
   * issueLicense, and the Crystal wallet's charge, transfer, transactions and
   * pay-password. The API still serves all of them; nothing here calls them.
   */
  checkSerial: (sn) => client.get('/account/products/check', { params: { sn } }),
  registrations: (params) => client.get('/account/products', { params }),
  registerProduct: (payload) => client.post('/account/products', payload),

  /* The balance in the header, which is the Appstore's - see storefront below. */
  wallet: () => client.get('/account/wallet'),

  /*
   * ONE ENDPOINT, THREE PAGES - pages/account/points/. `source` is always
   * sent (CRYSTAL, ACTIVITY, or one of the four software ledgers) with `from`,
   * `to` and `q`; `type` narrows Crystal's own ledger and `category` the
   * activity log. Without a source the API merges all six, which no page asks
   * for any more.
   */
  points: (params) => client.get('/account/points', { params }),
  /* Crystal's own ledger, earned and spent per movement kind. */
  pointSummary: () => client.get('/account/points/summary'),
  /* Every system the member holds points in, with its balance and cap. */
  pointSystems: () => client.get('/account/points/systems'),

  /* Repairs and the member's own articles - both were menu entries with no
     API call behind them, which is why both pages silently redirected. */
  repairs: (params) => client.get('/account/repairs', { params }),
  repair: (id) => client.get(`/account/repairs/${id}`),
  rateRepair: (id, body) => client.post(`/account/repairs/${id}/rating`, body),
  articles: (params) => client.get('/account/articles', { params }),

  /*
   * WRITING ONE, which lives under /account because it needs a signed-in
   * author - the same reason the thumbs below do.
   *
   * `writeArticle` takes an article, or a reply when it carries `parent_id`;
   * both go to staff to be read before anybody sees them. `allowance` is what
   * is left of today (one article and one reply), asked for BEFORE the member
   * types rather than after - see components/blog/BlogCompose.js.
   */
  articleAllowance: () => client.get('/account/articles/allowance'),
  myArticle: (id) => client.get(`/account/articles/${id}`),
  writeArticle: (payload) => client.post('/account/articles', payload),
  editArticle: (id, payload) => client.put(`/account/articles/${id}`, payload),
  removeArticle: (id) => client.delete(`/account/articles/${id}`),

  /*
   * The blog's gold, silver and bronze thumbs - components/blog/BlogThumbs.js.
   * Under /account because giving one needs a member; the counts themselves
   * come with the public article and its replies.
   */
  blogThumbs: (ids) => client.get('/account/blog/thumbs', { params: { ids: ids.join(',') } }),
  giveBlogThumb: (id, kind) => client.post(`/account/blog/${id}/thumb`, { kind }),

  /*
   * THE TWO STOREFRONTS. Crystal does not run either one - these reach the
   * Eshop and the Appstore over HTTP through the backend, which resolves the
   * member's key in each before it calls. See config/remote.js there.
   */
  eshopCard: () => client.get('/account/eshop/card'),
  eshopOrders: (params) => client.get('/account/eshop/orders', { params }),
  eshopOrder: (orderId) => client.get(`/account/eshop/orders/${orderId}`),
  /*
   * One endpoint, three views: TRANSACTIONS, EXPERIENCE, COMMERCE.
   *
   * `view` is NOT decoration - it is the whole difference between the three
   * menu entries, and a request that leaves it out silently answers with the
   * transaction log under whichever heading asked. See EshopLog.js, which has
   * to push it back into the params itself because React Router reuses the
   * component across all three routes.
   */
  eshopLog: (params) => client.get('/account/eshop/log', { params }),

  appstoreBalance: () => client.get('/account/appstore/balance'),

  /*
   * THE FOUR STORE LISTS TAKE A WINDOW AND A SEARCH, and the names are the
   * API's rather than the store's: `from`, `to` and `q` - never `start_date`,
   * `end_date` or `sSearch`, which are what the Appstore itself speaks and
   * what the backend translates them into. `page` and `limit` come from
   * useList and become the offset upstream.
   *
   * The WALLET takes `type` and the window but NO search term - its endpoint
   * has none - which is why the wallet page offers a period and a type select
   * and the other three offer a period and a search box.
   */
  appstoreTransactions: (params) => client.get('/account/appstore/transactions', { params }),
  appstorePurchases: (params) => client.get('/account/appstore/purchases', { params }),
  appstoreComments: (params) => client.get('/account/appstore/comments', { params }),
  appstoreFavourites: (params) => client.get('/account/appstore/favourites', { params }),
  /* Fetched per row, on demand - a licence key does not belong in a column. */
  appstoreLicense: (purchaseId) => client.get(`/account/appstore/purchases/${purchaseId}/license`),

  /*
   * THE APPSTORE WALLET'S WRITES - Crystal Points > Transfer, Charge and Wallet
   * Password. A refusal carries `detail: { field, reason }`, which the forms
   * use to put the message under the field it is about; see
   * pages/account/points/walletForm.js.
   *
   *   appstoreWalletReceiver(userId)   who a transfer would go to - { user_id, nickname }
   *   appstoreChargeOptions()          { money: [{ key, channels }], limit }
   *   appstoreCharge({ money, channel, amount })
   *   appstoreTransfer({ receiver, amount, password })
   *   appstoreWalletPassword({ current, next })
   */
  appstoreWalletReceiver: (userId) => client.get('/account/appstore/wallet/receiver', { params: { user_id: userId } }),
  appstoreChargeOptions: () => client.get('/account/appstore/wallet/charge'),
  appstoreCharge: (payload) => client.post('/account/appstore/wallet/charge', payload),
  appstoreTransfer: (payload) => client.post('/account/appstore/wallet/transfer', payload),
  appstoreWalletPassword: (payload) => client.post('/account/appstore/wallet/password', payload),

  /*
   * THE EPRODUCT SITE, a third outside system keyed by the member's LOGIN
   * rather than by either of the storefront pks.
   *
   * `eprodRegistrations` is NOT `registrations`. That one is what Crystal
   * knows about; this is what the eproduct site knows about, and a member can
   * appear in one and not the other - which is why both exist.
   *
   * There was an `eprodBalance` here too, and it is gone: the page that read
   * it was removed and nothing else ever called it. An endpoint with no
   * caller is a promise this module cannot be held to.
   */
  eprodRegistrations: (params) => client.get('/account/eproduct/registrations', { params }),
  karaokeKeygen: (params) => client.get('/account/eproduct/keygen/karaoke', { params }),
  manbangKeygen: (params) => client.get('/account/eproduct/keygen/manbang', { params }),
  bmediaKeygen: (params) => client.get('/account/eproduct/keygen/bmedia', { params }),

  /*
   * WHAT A MEMBER CAN DO TO ONE KEYGEN ROW, which is the vendor's set.
   *
   * The three keygen logs are lists of attempts, and an attempt is not just a
   * record: it has a licence file to fetch, it can be retried when it failed,
   * and it can be reported when retrying does not help. B-media has a fourth -
   * the media lines that one licence covered - because there the licence is
   * for a batch rather than for a single device.
   *
   * `system` is 'karaoke' | 'manbang' | 'bmedia' and goes in the PATH rather
   * than in a query, because the three are separate services behind one shape
   * and the route is what says which one is being asked.
   */
  keygenLicense: (system, id) => client.get(`/account/eproduct/keygen/${system}/${id}/license`),
  /*
   * THE FILE ITSELF, as bytes, for the page to save without opening a tab.
   *
   * An ArrayBuffer rather than a Blob because a FAILURE comes back as bytes
   * too - the API's JSON refusal, in the member's language - and a buffer can
   * be decoded synchronously here, where a Blob cannot. Decoded, the refusal
   * reaches the client's error handler as the envelope it expects, and the
   * toast says what the API said instead of "could not reach Crystal".
   */
  keygenLicenseFile: (system, id) => client.get(`/account/eproduct/keygen/${system}/${id}/license/file`, {
    responseType: 'arraybuffer',
    transformResponse: [(body, headers) => {
      const type = (headers && headers['content-type']) || '';
      if (!/json/i.test(type) || typeof TextDecoder === 'undefined') return body;
      try {
        return JSON.parse(new TextDecoder('utf-8').decode(body));
      } catch (err) {
        return body;
      }
    }]
  }),
  retryKeygen: (system, id) => client.post(`/account/eproduct/keygen/${system}/${id}/retry`),
  reportKeygenError: (system, id, payload) =>
    client.post(`/account/eproduct/keygen/${system}/${id}/error-report`, payload),
  bmediaKeygenDetail: (id) => client.get(`/account/eproduct/keygen/bmedia/${id}`),

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

const api = { auth, catalog, support, site, blog, account };

export default api;
