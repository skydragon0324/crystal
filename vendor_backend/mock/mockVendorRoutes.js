/**
 * Mock implementation of routes/vendorRoutes.js.
 *
 * Same paths, same query parameters, same `{ code, message, data }`
 * envelope - served entirely from mock/fixtures.js, so the vendor site can
 * be run and tested with no Oracle or Postgres instance present.
 *
 * Auth is NOT mocked. Login, session check, logout and refresh all go
 * through the real controllers/authController, which means the JWT and
 * refresh-token behaviour being exercised here is the production code
 * path, not a stand-in for it. Only the user lookup is swapped out.
 *
 * Enable with USE_MOCK=true (see app.js).
 */
const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { createResponse } = require('../utils/response');
const RESP_CODES = require('../constants/responseCodes');
const F = require('./fixtures');

const DEFAULT_PAGE_SIZE = 10;

/* ------------------------------------------------------------------ *
 * Query helpers
 *
 * The real controllers read offset/limit/sortKey/sortDir/keyword off the
 * query string and hand the model a filter object. These reproduce that
 * behaviour in memory so pagination and sorting are genuinely exercised
 * rather than always returning page one.
 * ------------------------------------------------------------------ */

/** Case-insensitive substring match across the given fields. */
function byKeyword(rows, keyword, fields) {
  if (!keyword) return rows;
  const needle = String(keyword).toLowerCase().trim();
  if (!needle) return rows;
  return rows.filter((row) =>
    fields.some((field) => String(row[field] == null ? '' : row[field]).toLowerCase().includes(needle))
  );
}

function sortRows(rows, key, dir) {
  if (!key) return rows;
  const sign = String(dir).toLowerCase() === 'asc' ? 1 : -1;
  // Copy first: the fixtures are module-level singletons and sorting in
  // place would let one request permanently reorder every later one.
  return rows.slice().sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sign;
    return String(av).localeCompare(String(bv)) * sign;
  });
}

/**
 * Apply keyword -> sort -> page, and return the `{ total, rows }` payload
 * the client's table pages expect. `total` is the count *before* paging,
 * which is what drives the pager.
 */
function page(rows, req, opts) {
  opts = opts || {};
  const offset = +req.query.offset || 0;
  // limit=0 means "everything" in the real controllers; a few endpoints
  // (agencies, admin recommendations) rely on that.
  const rawLimit = req.query.limit === undefined ? opts.defaultLimit : +req.query.limit;
  const limit = rawLimit === undefined ? DEFAULT_PAGE_SIZE : rawLimit;

  let out = byKeyword(rows, req.query.keyword, opts.searchFields || []);
  const total = out.length;

  out = sortRows(out, req.query.sortKey || opts.defaultSortKey, req.query.sortDir || opts.defaultSortDir || 'desc');
  out = limit > 0 ? out.slice(offset, offset + limit) : out.slice(offset);

  return { total, rows: out };
}

const ok = (res, data) => res.status(RESP_CODES.SUCCESS.code).json(createResponse(RESP_CODES.SUCCESS, data));
const notFound = (res) => res.status(RESP_CODES.NOT_FOUND.code).json(RESP_CODES.NOT_FOUND);

/** The account block for whoever the verified token says is calling. */
const accountOf = (req) => F.ACCOUNTS[req.user && req.user.user_pk] || null;

/**
 * Wrap a paged account endpoint. Every one of them is "look up my data,
 * page it, return it", so the shared shape is worth factoring out.
 */
function accountList(selector, opts) {
  return (req, res) => {
    const account = accountOf(req);
    if (!account) return notFound(res);
    return ok(res, page(selector(account, req) || [], req, opts));
  };
}

/* ------------------------------------------------------------------ *
 * Auth - real controllers, mock user table
 * ------------------------------------------------------------------ */

/**
 * Stands in for authController.webLogin, which would otherwise hit
 * UserModel/CustomerModel. Token issuing still goes through the real
 * setWebToken, so the cookie names, claim set and expiry under test are
 * exactly the ones production uses.
 */
router.post('/auth/web_login', (req, res) => {
  const { user_id, password } = req.body || {};

  if (!user_id || !password) {
    return res.status(RESP_CODES.BAD_REQUEST.code).json({
      code: RESP_CODES.BAD_REQUEST.code,
      message: 'user_id and password are required',
    });
  }

  const user = F.USERS.find((candidate) => candidate.user_id === user_id);
  if (!user) {
    return res.status(RESP_CODES.NOT_FOUND.code).json({
      code: RESP_CODES.NOT_FOUND.code,
      message: 'No such account',
    });
  }

  // The client MD5s the password before posting, so this compares hashes.
  if (user.password !== password) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json({
      code: RESP_CODES.UNAUTHORIZED.code,
      message: 'Password mismatch',
    });
  }

  if (user.status !== 1) {
    return res.status(RESP_CODES.UNAUTHORIZED.code).json({
      code: RESP_CODES.UNAUTHORIZED.code,
      message: 'Account is blocked',
    });
  }

  authController.setWebToken(user, res);

  const safeUser = Object.assign({}, user, { password: '' });
  return ok(res, { user: safeUser });
});

// Session check, logout and refresh need no database, so the real
// handlers are mounted directly.
router.get('/auth/web_auth', authController.checkWebAuth);
router.get('/auth/web_logout', authController.webLogout);
router.get('/auth/refresh_token', authController.refreshToken);

/**
 * Test-only: expire the current access token without touching the refresh
 * token, so the client's 401 -> refresh -> retry path can be driven
 * deliberately instead of waiting out the token lifetime.
 */
router.get('/auth/mock_expire_access', (req, res) => {
  res.clearCookie('webAccessToken', { path: '/' });
  return ok(res, { expired: 'webAccessToken' });
});

/** Test-only: who does the server think is calling, and on which claims. */
router.get('/auth/mock_whoami', authController.verifyWebToken, (req, res) => ok(res, { user: req.user }));

/* ------------------------------------------------------------------ *
 * Public catalogue
 * ------------------------------------------------------------------ */

router.get('/provinces', (req, res) => ok(res, { rows: F.PROVINCES }));

router.get('/phone_products', (req, res) => ok(res, { rows: F.PRODUCTS }));

router.get('/phone_specs', (req, res) => {
  const product_pk = +req.query.product_pk;
  const product = F.PRODUCTS.find((row) => row.product_pk === product_pk);
  if (!product) return notFound(res);

  return ok(res, {
    // image_type 0 = MAIN; the spec page uses images[0] as the hero.
    images: F.PRODUCT_IMAGES.filter((row) => row.product_pk === product_pk && row.image_type === 0),
    specs: F.PRODUCT_SPECS.filter((row) => row.product_pk === product_pk),
  });
});

router.get('/phone_images', (req, res) => {
  const product_pk = +req.query.product_pk;
  // image_type 1 = INTRO gallery.
  const rows = F.PRODUCT_IMAGES.filter((row) => row.product_pk === product_pk && row.image_type === 1);
  return ok(res, { rows });
});

router.get('/phone_accessories', (req, res) => {
  const product_pk = +req.query.product_pk;
  const rows = F.ACCESSORIES.filter((row) => row.product_pk === product_pk);
  return ok(res, page(rows, req, {
    defaultLimit: 0,
    defaultSortKey: 'position',
    defaultSortDir: 'asc',
    searchFields: ['accessory_name'],
  }));
});

router.get('/phone_changelog', (req, res) => {
  const product_pk = +req.query.product_pk;
  const rows = F.CHANGELOGS.filter((row) => row.product_pk === product_pk);
  return ok(res, page(rows, req, {
    defaultLimit: 0,
    defaultSortKey: 'position',
    searchFields: ['title', 'content', 'publish_num'],
  }));
});

router.get('/phone_agencies', (req, res) => {
  let rows = F.AGENCIES;

  const { parent_location_code, business_index } = req.query;
  if (parent_location_code) {
    rows = rows.filter((row) => row.parent_location_code === parent_location_code);
  }
  if (business_index !== undefined && business_index !== '') {
    // `business` is a positional flag string: index 0 = OS, 1 = Repair,
    // 2 = Insurance, 3 = Change.
    rows = rows.filter((row) => row.business[+business_index] === '1');
  }

  return ok(res, page(rows, req, {
    defaultLimit: 0,
    defaultSortKey: 'agency_rating',
    searchFields: ['agency_name', 'location_name', 'phone_numbers', 'address'],
  }));
});

router.get('/phone_faqs', (req, res) => ok(res, page(F.FAQ_ROWS, req, {
  defaultSortKey: 'position',
  defaultSortDir: 'asc',
  searchFields: ['question', 'answer'],
})));

/* ------------------------------------------------------------------ *
 * Blog
 * ------------------------------------------------------------------ */

router.get('/blog_articles', (req, res) => {
  let rows = F.BLOG_ARTICLES;
  const subject_id = +req.query.subject_id || 0;
  if (subject_id) {
    rows = rows.filter((row) => row.subject_id === subject_id);
  }
  return ok(res, page(rows, req, {
    defaultSortKey: 'publish_at',
    searchFields: ['title', 'summary', 'user_userid', 'subject_name'],
  }));
});

router.get('/admin_recom_blogs', (req, res) => {
  const rows = F.BLOG_ARTICLES.filter((row) => row.is_admin_recom === 1);
  return ok(res, page(rows, req, { defaultLimit: 0, defaultSortKey: 'publish_at' }));
});

router.get('/honormans', (req, res) => ok(res, { rows: F.HONORMANS }));

router.get('/blog_replies', (req, res) => {
  const parent = +req.query.parent_pk || +req.query.id || +req.query.blog_pk || 0;
  const article = F.BLOG_ARTICLES.find((row) => row.id === parent);
  const rows = F.BLOG_REPLIES.filter((row) => row.parent_pk === parent);

  const paged = page(rows, req, {
    defaultLimit: 0,
    defaultSortKey: 'publish_at',
    defaultSortDir: 'asc',
    searchFields: ['content', 'user_userid'],
  });

  // The replies page renders the parent article above the reply list.
  return ok(res, Object.assign({ row: article || null, article: article || null }, paged));
});

router.post('/blog_reply_view', (req, res) => {
  const id = +(req.body && (req.body.blog_pk || req.body.id));
  const row = F.BLOG_REPLIES.find((reply) => reply.id === id) || F.BLOG_ARTICLES.find((a) => a.id === id);
  if (!row) return notFound(res);
  row.visit_count += 1;
  return ok(res, { row });
});

router.post('/blog_rating_submit', authController.parseWebToken, (req, res) => {
  if (!req.user) return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  const id = +(req.body && (req.body.blog_pk || req.body.id));
  const row = F.BLOG_ARTICLES.find((a) => a.id === id) || F.BLOG_REPLIES.find((r) => r.id === id);
  if (!row) return notFound(res);

  const grade = +(req.body && req.body.grade) || 3;
  if (grade === 1) row.thumb_gold += 1;
  else if (grade === 2) row.thumb_silver += 1;
  else row.thumb_bronze += 1;

  return ok(res, { row });
});

/**
 * Writes are accepted and mutate the in-memory fixtures, so a create ->
 * list round trip actually shows the new row. They reset on restart,
 * which is what a fixture should do.
 */
router.post('/blog_add', authController.parseWebToken, (req, res) => {
  if (!req.user) return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);

  const body = req.body || {};
  const parent_pk = +body.parent_pk || 0;
  const nextId = Math.max(
    0,
    ...F.BLOG_ARTICLES.map((a) => a.id),
    ...F.BLOG_REPLIES.map((r) => r.id)
  ) + 1;
  const subject = F.BLOG_SUBJECTS.find((s) => s.subject_id === +body.subject_id) || F.BLOG_SUBJECTS[0];

  const row = {
    id: nextId,
    blog_pk: nextId,
    parent_pk,
    title: body.title || 'Untitled',
    summary: body.summary || '',
    content: body.content || '',
    subject_id: subject.subject_id,
    subject_name: subject.subject_name,
    user_pk: req.user.user_pk,
    user_userid: req.user.user_id,
    user_name: req.user.user_name,
    state: 2,
    is_admin_recom: 0,
    thumb_gold: 0,
    thumb_silver: 0,
    thumb_bronze: 0,
    thumb_count: 0,
    visit_count: 0,
    visited_num: 0,
    reply_count: 0,
    reply_num: 0,
    publish_at: F.stamp(0),
    created_at: F.stamp(0),
    updated_at: F.stamp(0),
  };

  if (parent_pk) {
    F.BLOG_REPLIES.push(row);
    const parent = F.BLOG_ARTICLES.find((a) => a.id === parent_pk);
    if (parent) {
      parent.reply_count += 1;
      parent.reply_num = parent.reply_count;
    }
  } else {
    F.BLOG_ARTICLES.unshift(row);
  }

  const account = F.ACCOUNTS[req.user.user_pk];
  if (account && !parent_pk) account.myArticles.unshift(row);

  return ok(res, { row });
});

router.post('/blog_update', authController.parseWebToken, (req, res) => {
  if (!req.user) return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  const body = req.body || {};
  const id = +(body.blog_pk || body.id);
  const row = F.BLOG_ARTICLES.find((a) => a.id === id) || F.BLOG_REPLIES.find((r) => r.id === id);
  if (!row) return notFound(res);

  ['title', 'summary', 'content'].forEach((field) => {
    if (body[field] !== undefined) row[field] = body[field];
  });
  row.updated_at = F.stamp(0);
  return ok(res, { row });
});

router.post('/blog_delete', authController.parseWebToken, (req, res) => {
  if (!req.user) return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  const id = +(req.body && req.body.blog_pk);

  const drop = (list) => {
    const idx = list.findIndex((row) => row.id === id);
    if (idx === -1) return false;
    list.splice(idx, 1);
    return true;
  };

  const removed = drop(F.BLOG_ARTICLES) || drop(F.BLOG_REPLIES);
  if (!removed) return notFound(res);

  const account = F.ACCOUNTS[req.user.user_pk];
  if (account) drop(account.myArticles);

  return ok(res, {});
});

router.post('/blog_contribute', authController.parseWebToken, (req, res) => {
  if (!req.user) return res.status(RESP_CODES.UNAUTHORIZED.code).json(RESP_CODES.UNAUTHORIZED);
  return ok(res, {});
});

/* ------------------------------------------------------------------ *
 * X.509 login
 *
 * Certificate login is a hardware path with no offline equivalent, so the
 * mock accepts any payload and signs in the first demo account. Password
 * login remains the realistic path.
 * ------------------------------------------------------------------ */

router.post('/x509/primary_data', (req, res) => ok(res, {
  primary_data: 'mock-primary-data',
  server_random: 'mock-server-random',
}));

router.post('/x509/x509_login', (req, res) => {
  const user = F.USERS[0];
  authController.setWebToken(user, res);
  return ok(res, { user: Object.assign({}, user, { password: '' }) });
});

/* ------------------------------------------------------------------ *
 * Account area - every route behind the real verifyWebToken
 * ------------------------------------------------------------------ */

const auth = authController.verifyWebToken;

/* ---- eshop ---- */

router.get('/eshop_wallet_balance', auth, (req, res) => {
  const account = accountOf(req);
  if (!account) return notFound(res);
  return ok(res, account.eshopBalance);
});

router.get('/eshop_order_list', auth, accountList((a) => a.eshopOrders, {
  defaultSortKey: 'created_at',
  searchFields: ['order_no', 'goods_name', 'address'],
}));

router.get('/eshop_order_detail', auth, (req, res) => {
  const account = accountOf(req);
  if (!account) return notFound(res);
  const rows = account.eshopOrderDetails[+req.query.order_pk || +req.query.id];
  if (!rows) return notFound(res);
  return ok(res, { total: rows.length, rows });
});

router.get('/eshop_wallet_transactions', auth, accountList((a) => a.eshopWallet, {
  defaultSortKey: 'created_at',
  searchFields: ['detail'],
}));

router.get('/eshop_exp_log', auth, accountList((a) => a.eshopExpLog, { defaultSortKey: 'created_at' }));

router.get('/eshop_commerce_values', auth, accountList((a) => a.eshopCommerceValues, { defaultSortKey: 'created_at' }));

/* ---- appstore ---- */

router.get('/appstore_purchase_log', auth, accountList((a) => a.appstorePurchases, {
  defaultSortKey: 'created_at',
  searchFields: ['app_name', 'diamond_name', 'device_no'],
}));

router.get('/appstore_license_qr', auth, (req, res) => ok(res, {
  device_license: {
    // A 1x1 transparent PNG: enough for the QR modal to render an <img>
    // without shipping a binary fixture.
    qr: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    license_file: 'license-' + (req.query.purchase_history_unique_id || 'demo') + '.dat',
    license_file_url: 'licenses/2026/06',
    issued_at: F.stamp(3),
  },
}));

router.get('/appstore_comments', auth, accountList((a) => a.appstoreComments, {
  defaultSortKey: 'created_at',
  searchFields: ['app_name', 'content'],
}));

router.get('/appstore_favorites', auth, accountList((a) => a.appstoreFavorites, {
  defaultSortKey: 'created_at',
  searchFields: ['app_name', 'category_name'],
}));

router.get('/appstore_wallet_transactions', auth, accountList((a) => a.appstoreWallet, {
  defaultSortKey: 'created_at',
  searchFields: ['detail'],
}));

/* ---- software point logs ---- */

router.get('/soft_point_log', auth, (req, res) => {
  const account = accountOf(req);
  if (!account) return notFound(res);

  // The client passes a category so one endpoint serves four pages.
  const byCategory = {
    0: account.appstorePointLog,
    1: account.karaokePointLog,
    2: account.bmediaPointLog,
    3: account.minusPointLog,
  };
  const rows = byCategory[+req.query.category || 0] || account.appstorePointLog;
  return ok(res, page(rows, req, { defaultSortKey: 'created_at', searchFields: ['detail'] }));
});

router.get('/karaoke_old_log', auth, accountList((a) => a.karaokeOldLog, { defaultSortKey: 'created_at' }));
router.get('/bmedia_old_log', auth, accountList((a) => a.bmediaOldLog, { defaultSortKey: 'created_at' }));
router.get('/activity_point_log', auth, accountList((a) => a.activityPointLog, { defaultSortKey: 'created_at' }));
router.get('/activity_old_log', auth, accountList((a) => a.activityOldLog, { defaultSortKey: 'created_at' }));

/* ---- eprod ---- */

router.get('/eprod_regist_add_log', auth, accountList((a) => a.eprodRegisterLog, {
  defaultSortKey: 'created_at',
  searchFields: ['phone_imei', 'product_name'],
}));

router.post('/eprod_license_error_report', auth, (req, res) => ok(res, { reported: true }));

router.get('/karaoke_keygen_log', auth, accountList((a) => a.karaokeKeygenLog, {
  defaultSortKey: 'created_at',
  searchFields: ['serial_no', 'device_no', 'product_name'],
}));

router.get('/manbang_keygen_log', auth, accountList((a) => a.manbangKeygenLog, {
  defaultSortKey: 'created_at',
  searchFields: ['serial_no', 'device_no', 'product_name'],
}));

router.get('/bmedia_providers', auth, (req, res) => ok(res, { rows: F.BMEDIA_PROVIDERS }));

router.get('/bmedia_keygen_log', auth, accountList((a) => a.bmediaKeygenLog, {
  defaultSortKey: 'created_at',
  searchFields: ['serial_no', 'device_no', 'provider_name'],
}));

router.get('/bmedia_keygen_by_id', auth, (req, res) => {
  const account = accountOf(req);
  if (!account) return notFound(res);
  const id = +req.query.keygen_pk || +req.query.id;
  const row = account.bmediaKeygenLog.find((entry) => entry.keygen_pk === id);
  if (!row) return notFound(res);
  // The detail modal lists the media covered by one licence.
  const rows = F.BMEDIA_PROVIDERS.map((provider, idx) => ({
    media_pk: id * 10 + idx,
    media_name: 'Track ' + (idx + 1) + ' - ' + provider.provider_name,
    provider_name: provider.provider_name,
    duration: '0' + (3 + idx) + ':' + (10 + idx * 7),
    created_at: row.created_at,
  }));
  return ok(res, { row, total: rows.length, rows });
});

/* ---- feedback ---- */

router.get('/feedback_threads', auth, accountList((a) => a.feedbackThreads, {
  defaultSortKey: 'updated_at',
  searchFields: ['title', 'last_message'],
}));

router.post('/feedback_thread_edit', auth, (req, res) => {
  const account = accountOf(req);
  if (!account) return notFound(res);
  const body = req.body || {};
  const thread_pk = +body.thread_pk;

  if (thread_pk) {
    const thread = account.feedbackThreads.find((row) => row.thread_pk === thread_pk);
    if (!thread) return notFound(res);
    if (body.title !== undefined) thread.title = body.title;
    if (body.category !== undefined) thread.category = +body.category;
    if (body.status !== undefined) thread.status = +body.status;
    thread.updated_at = F.stamp(0);
    return ok(res, { row: thread });
  }

  const nextPk = Math.max(0, ...account.feedbackThreads.map((row) => row.thread_pk)) + 1;
  const thread = {
    thread_pk: nextPk,
    user_pk: req.user.user_pk,
    category: +body.category || 0,
    status: 0,
    title: body.title || 'New enquiry',
    last_message: body.message || '',
    message_count: body.message ? 1 : 0,
    created_at: F.stamp(0),
    updated_at: F.stamp(0),
  };
  account.feedbackThreads.unshift(thread);
  account.feedbackMessages[nextPk] = body.message
    ? [{
        message_pk: nextPk * 10,
        thread_pk: nextPk,
        user_pk: req.user.user_pk,
        action_type: 0,
        writer_name: req.user.user_name,
        message: body.message,
        created_at: F.stamp(0),
      }]
    : [];
  return ok(res, { row: thread });
});

router.get('/feedback_messages', auth, (req, res) => {
  const account = accountOf(req);
  if (!account) return notFound(res);
  const rows = account.feedbackMessages[+req.query.thread_pk] || [];
  return ok(res, { total: rows.length, rows });
});

router.post('/feedback_message_add', auth, (req, res) => {
  const account = accountOf(req);
  if (!account) return notFound(res);
  const body = req.body || {};
  const thread_pk = +body.thread_pk;
  const thread = account.feedbackThreads.find((row) => row.thread_pk === thread_pk);
  if (!thread) return notFound(res);

  const rows = account.feedbackMessages[thread_pk] || (account.feedbackMessages[thread_pk] = []);
  const message = {
    message_pk: thread_pk * 10 + rows.length,
    thread_pk,
    user_pk: req.user.user_pk,
    action_type: 0,
    writer_name: req.user.user_name,
    message: body.message || '',
    created_at: F.stamp(0),
  };
  rows.push(message);

  thread.last_message = message.message;
  thread.message_count = rows.length;
  thread.updated_at = message.created_at;

  return ok(res, { row: message });
});

/* ---- my blog ---- */

router.get('/blog_my_articles', auth, (req, res) => {
  const account = accountOf(req);
  if (!account) return notFound(res);
  // state 0 is a draft; the drafts page asks for it explicitly.
  const wantDrafts = String(req.query.state) === '0' || String(req.query.is_draft) === '1';
  const rows = wantDrafts ? account.myDrafts : account.myArticles;
  return ok(res, page(rows, req, { defaultSortKey: 'created_at', searchFields: ['title', 'summary'] }));
});

router.get('/blog_article_content', auth, (req, res) => {
  const id = +req.query.blog_pk || +req.query.id;
  const account = accountOf(req);
  const row =
    F.BLOG_ARTICLES.find((a) => a.id === id) ||
    F.BLOG_REPLIES.find((r) => r.id === id) ||
    (account && account.myDrafts.find((d) => d.id === id));
  if (!row) return notFound(res);
  return ok(res, { row });
});

module.exports = router;
