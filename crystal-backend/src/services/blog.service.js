'use strict';

const repo = require('../repositories/legacy/articles.repository');
const thumbs = require('../repositories/legacy/thumbs.repository');
const media = require('../repositories/media.repository');
const { HttpError } = require('../utils/response');
const richText = require('../utils/richText');
const audit = require('./audit.service');

const PAGE = '/admin/blog/articles';
const TABLE = repo.TABLE;

/*
 * NO 'slug' AND NO 'cover_image_mobile'.
 *
 * The blog is stored in the vendor's database now (repositories/legacy/), and
 * that schema has neither: a slug is DERIVED from the title and the id on
 * every read, and there is one image column rather than a desktop/mobile
 * pair. Accepting either from the console would be accepting a value that is
 * silently dropped on the way to the database, which is worse than not
 * offering the field.
 */
const COLUMNS = ['title', 'cover_image', 'summary',
  'content', 'author', 'category', 'is_featured'];

const SORTABLE = ['id', 'title', 'category', 'status', 'published_at', 'view_count', 'created_at'];
const DEFAULT_SORT = 'created_at';

/**
 * The blog, and its one real rule: the workflow.
 *
 * DRAFT -> REVIEW -> PUBLISHED, and `published_at` is stamped only on the
 * transition INTO published.  Re-editing a live article must not move it back
 * to the top of the list, which is what would happen if the column were
 * touched on every save - and is the sort of thing nobody notices until an
 * old article reappears as news.
 */

const STATUS = { DRAFT: 'DRAFT', REVIEW: 'REVIEW', PUBLISHED: 'PUBLISHED' };

const FLOW = {
  DRAFT: ['REVIEW', 'PUBLISHED'],
  REVIEW: ['DRAFT', 'PUBLISHED'],
  PUBLISHED: ['DRAFT']
};

/* ------------------------------------------------------------------ */
/*  the storefront                                                     */
/* ------------------------------------------------------------------ */

/*
 * The storefront reads the blog as the vendor's forum-shaped schema has it:
 * articles on a tree of shelves, each the head of a thread of replies. What
 * that model is - depth, order, what is public, what a help request is - is
 * written down once, at the top of repositories/legacy/articles.repository.js.
 */

/** A whole number from a query string, inside [min, max], or the fallback. */
function bounded(value, min, max, fallback) {
  const n = Math.floor(Number(value));
  if (!isFinite(n) || n < min) return fallback;
  return Math.min(max, n);
}

/**
 * ONE READ PER VISITOR, PER ROW, PER DAY - the vendor's rule, kept in memory.
 *
 * The vendor counts a visit only if the same address has not visited that
 * article (or that reply) today, and it knows by looking in
 * blog_article_visit_log. Crystal does not write that log. The stand-in's copy
 * of the table is the vendor's development mock, which has neither the
 * address column nor the sequence the vendor's model writes with, and making
 * it match would be altering the vendor's schema - so the rule is kept and the
 * ledger it was kept in is not.
 *
 * WHAT THAT COSTS, said plainly: this set is per process and starts empty on
 * a restart, so a reader can count twice on a day the API restarts or across
 * two instances; and Crystal's visits are absent from the vendor's own
 * popularity ranking, which counts log rows rather than the counter. The
 * counter itself - visited_num, which is what both sites display - moves
 * exactly as the vendor moves it.
 *
 * It forgets everything at midnight (the vendor's "today" is the server's
 * day) and, as a ceiling on memory, when it reaches SEEN_LIMIT - a double
 * count on a busy day is a far cheaper failure than an unbounded set.
 */
const SEEN_LIMIT = 50000;
let seenDay = '';
let seen = new Set();

function today() {
  const now = new Date();
  return now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();
}

function firstVisitToday(id, visitor) {
  const day = today();
  if (day !== seenDay || seen.size >= SEEN_LIMIT) {
    seen = new Set();
    seenDay = day;
  }

  const key = id + '|' + String(visitor || '');
  if (seen.has(key)) return false;

  seen.add(key);
  return true;
}

/** Counts the visit if it is this visitor's first to this row today; answers whether it did. */
async function visit(id, visitor) {
  if (!firstVisitToday(id, visitor)) return false;
  await repo.countView(id);
  return true;
}

/**
 * The shelves, as a tree.
 *
 * `article_cnt` is what is filed directly on a shelf; `total_cnt` adds the
 * shelves under it, because that is what choosing the shelf shows (see
 * publicList). Siblings are in the vendor's own order_no. A shelf whose parent
 * does not exist is put at the top rather than lost - an article is filed on
 * it, so a reader has to be able to reach it.
 */
async function subjectTree() {
  const flat = await repo.subjects();

  const byId = {};
  flat.forEach(function (row) {
    byId[row.id] = Object.assign({}, row, { total_cnt: 0, children: [] });
  });

  const roots = [];
  flat.forEach(function (row) {
    const node = byId[row.id];
    const parent = row.parent_id && row.parent_id !== row.id ? byId[row.parent_id] : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });

  const ordered = function (a, b) { return a.order - b.order || a.id - b.id; };

  /* Depth-first, so a count is summed before its parent reads it. A cycle is cut, not followed. */
  const visiting = {};
  const total = function (node) {
    if (visiting[node.id]) return 0;
    visiting[node.id] = true;
    node.children.sort(ordered);
    node.total_cnt = node.children.reduce(function (sum, child) { return sum + total(child); }, node.article_cnt);
    return node.total_cnt;
  };

  roots.sort(ordered);
  roots.forEach(total);

  return { roots: roots, byId: byId };
}

/** A shelf and every shelf under it, as ids - or just the id, for a shelf the table does not have. */
function subjectAndBelow(tree, id) {
  const start = tree.byId[id];
  if (!start) return [id];

  const ids = [];
  const walk = function (node) {
    if (ids.indexOf(node.id) !== -1) return;
    ids.push(node.id);
    node.children.forEach(walk);
  };
  walk(start);

  return ids;
}

/**
 * The index.
 *
 *   subject   a shelf id; the shelves under it are included
 *   q         words in the title, the standfirst or the author's login
 *   sort      latest | replies | views | recommended
 *   category  Crystal's topic word - kept for the callers that still send it
 *   featured  has a gold recommendation
 *
 * A SHELF COVERS ITS CHILDREN, which the vendor's filter does not. The reader
 * is shown a tree; choosing "Product" and not seeing the articles filed under
 * "Product > Computer" would make a whole shelf look empty. See THE THREAD
 * MODEL in the repository.
 */
async function publicList(filters) {
  const limit = bounded(filters.limit, 1, 48, 12);
  const page = bounded(filters.page, 1, 100000, 1);

  const scoped = {
    category: filters.category,
    is_featured: filters.featured,
    q: filters.q ? String(filters.q).trim().slice(0, 100) : undefined,
    sort: repo.PUBLIC_SORTS.indexOf(filters.sort) === -1 ? 'latest' : filters.sort,
    limit: limit,
    offset: (page - 1) * limit
  };

  const subject = bounded(filters.subject, 1, Number.MAX_SAFE_INTEGER, null);
  if (subject) scoped.subject_ids = subjectAndBelow(await subjectTree(), subject);

  const [rows, countRow] = await Promise.all([
    repo.published(scoped),
    repo.countPublished(scoped)
  ]);

  return { rows: rows, total: Number(countRow.c), page: page, limit: limit };
}

/**
 * One article - its body, its shelf, its thread's tail, and, for a question,
 * the accepted answer.
 *
 * The visit is counted BEFORE the article is answered, the way the vendor's
 * thread endpoint does it, so the number a reader sees includes their own
 * visit instead of lagging one behind it.
 */
async function publicDetail(slug, visitor) {
  const article = await repo.findPublishedBySlug(slug);
  if (!article) throw new HttpError(404, 'common.notFound');

  if (await visit(article.id, visitor)) article.view_count += 1;

  const [assets, answers] = await Promise.all([
    media.ofOwner('ARTICLE', article.id, {}),
    article.is_help_request ? repo.acceptedAnswers(article.id) : Promise.resolve([])
  ]);

  return Object.assign({}, article, { media: assets, accepted_answers: answers });
}

/**
 * A page of a thread's replies, in the vendor's order.
 *
 * NOT A VISIT. The vendor's replies endpoint counts the article on every page
 * it serves, including the fifth; Crystal counts the article once, when it is
 * opened, which the per-day rule would have reduced it to anyway.
 */
async function publicReplies(slug, query) {
  const thread = await repo.findPublishedThread(repo.idFromSlug(slug));
  if (!thread) throw new HttpError(404, 'common.notFound');

  const limit = bounded(query.limit, 1, 50, 10);
  const page = bounded(query.page, 1, 100000, 1);

  const result = await repo.publishedReplies(thread.id, thread.is_help_request, {
    limit: limit,
    offset: (page - 1) * limit
  });

  return { rows: result.rows, total: result.total, page: page, limit: limit };
}

/**
 * A LINK TO ONE REPLY, resolved to the thread it lives in.
 *
 * Answers the thread's slug and which page of `limit` the reply is on, so a
 * link somebody shared lands on the conversation positioned at the reply -
 * rather than on a reply with no context, which is what a reply's own page
 * would be.
 *
 * THIS IS A VISIT TO THE REPLY, not to the article. It is the equivalent of
 * the vendor's "open this reply" (blog_reply_view), which counts for the
 * reply's own counter; the thread page that follows counts the article on its
 * own terms.
 */
async function publicReply(id, query, visitor) {
  const replyId = bounded(id, 1, Number.MAX_SAFE_INTEGER, null);
  const found = replyId ? await repo.findPublishedReply(replyId) : null;
  if (!found) throw new HttpError(404, 'common.notFound');

  const limit = bounded(query.limit, 1, 50, 10);
  const position = await repo.replyPosition(found.reply.id);

  if (await visit(found.reply.id, visitor)) found.reply.view_count += 1;

  return {
    reply: found.reply,
    thread: found.thread,
    position: position,
    page: Math.floor(position / limit) + 1,
    limit: limit
  };
}

/**
 * The member centre's "My Articles" - their articles and their replies.
 *
 * The author is the LOGIN, resolved from the session rather than taken from
 * the request - an author parameter on this endpoint would let anyone read
 * anyone's drafts.
 */
function mine(login, filters, paging) {
  const kind = filters.kind === 'ARTICLE' || filters.kind === 'REPLY' ? filters.kind : undefined;
  return repo.mine(login, { status: filters.status, kind: kind }, paging);
}

/* ------------------------------------------------------------------ */
/*  the member writes                                                  */
/* ------------------------------------------------------------------ */

/**
 * A MEMBER WRITES AN ARTICLE, OR ANSWERS SOMEBODY - the vendor's addBlog,
 * editBlog and deleteBlog (controllers/web/webBlogController.js), with its
 * validators and its blogModel behind them, done here with its bugs fixed.
 *
 * THE RULES, and where each one comes from:
 *
 *   1. SIGNED IN, AND THE AUTHOR IS THE LOGIN. blog_article records an author
 *      as `user_userid`, a login name, which is what the byline, the thumbs
 *      ledger and the member's own list are all keyed on. It comes from the
 *      session; there is no author parameter anywhere below.
 *
 *   2. NOTHING A MEMBER WRITES IS PUBLIC. Submitting puts the row in
 *      PUB_REQUEST - "waiting to be read" - and saving a draft in PUB_TEMP,
 *      exactly as the vendor does. Crystal's console is the approval screen:
 *      a submitted post reads as REVIEW there, and its status menu moves it
 *      to PUBLISHED or back to DRAFT. A submitted REPLY reads there too, now
 *      that the console can be asked for replies - see applyFilters in
 *      repositories/legacy/articles.repository.js, which used to answer
 *      articles and nothing else, which would have left every member's reply
 *      waiting for an approval nobody could give.
 *
 *   3. ONE ARTICLE AND ONE REPLY A DAY, and the vendor's own version of this
 *      rule has two bugs that are not copied:
 *
 *      (a) ITS WEBSITE LIMIT NEVER FIRES. findTodayArticleByUserId answers an
 *          ARRAY of one row and the controller reads `todayArticle.main_cnt`
 *          off the array itself, which is undefined, and `undefined >= 1` is
 *          false. Counted properly here.
 *
 *      (b) IT REFUSES THE WRONG KIND. `main_cnt >= 1 || reply_cnt >= 1`
 *          refuses a REPLY because the member posted an ARTICLE - so the
 *          allowance the message describes, one of each, is not the allowance
 *          the code enforces. Each kind is counted and refused on its own.
 *
 *      DRAFTS DO NOT COUNT. The vendor skips the check when a draft is being
 *      saved but still counts the draft row afterwards, so writing one draft
 *      in the morning silently spent the day. The day is spent by SUBMITTING,
 *      and only by submitting.
 *
 *      A DRAFT IS STAMPED WITH THE DAY IT IS SUBMITTED. The count is keyed on
 *      create_at (the vendor's column), so without this a member could write
 *      seven drafts over a week and post them all on Sunday. A row nobody has
 *      ever seen has no meaningful creation date; the day it was sent to be
 *      read is the honest one, and it is the day it counts against.
 *
 *      A REFUSED OR DELETED POST DOES NOT GIVE THE DAY BACK, which is the
 *      simplest rule that cannot be gamed: the count is of what was submitted
 *      today, whatever became of it. That is also why a member deleting a
 *      post they have already submitted SOFT-deletes it (the console's bin,
 *      restorable) rather than the vendor's hard DELETE - which, besides
 *      being unrecoverable, leaves the body and the counter rows behind as
 *      orphans, because deleteBlog only ever touched blog_article.
 *      A draft is purged outright: nobody has seen it and nothing refers to it.
 *
 *   4. ONLY YOUR OWN ROWS. The vendor's editBlog and deleteBlog take a
 *      blog_pk, check the caller is signed in, AND NEVER LOOK AT WHOSE POST
 *      IT IS - any member could rewrite or delete anybody's article. Here a
 *      post that is not the caller's answers 404, the same answer a post that
 *      does not exist gets, because "you may not" tells them it is there.
 *
 *      AN EDIT RE-ENTERS APPROVAL. The vendor's editBlog leaves `state`
 *      alone, so a member could have an article approved and then rewrite it
 *      into anything with the approval still on it. An edit to a published or
 *      refused post goes back to PUB_REQUEST - it costs the day's allowance,
 *      because it is a new thing for somebody to read - while an edit to a
 *      post that is ALREADY waiting is free and stays where it is in the
 *      queue: it is the same submission, corrected.
 *
 *   5. WHAT A POST NEEDS. An article: a title, a shelf, and something to say.
 *      A reply: something to say, and a PUBLISHED article to say it to - it
 *      takes its title ("Re: ..."), its shelf and its type from that thread,
 *      which is what the vendor's own reply form fills in for the member.
 *
 * THE BODY IS MARKUP, AND IT IS SANITISED HERE. A member writes in the same
 * editor the console uses (crystal-web components/common/RichTextEditor.js),
 * so a post arrives as HTML and is stored as HTML - passed first through
 * utils/richText.js, whose allowlist is that editor's toolbar and nothing
 * wider. It was plain text while the storefront had no editor; what has not
 * changed is that nothing a stranger sends is stored as it came.
 *
 * WHAT IS NOT GUARDED: two submissions racing each other. The count is read
 * immediately before the insert, so two requests in the same instant can both
 * see the day free and both land. The schema is the vendor's and has no
 * unique index to hang the guarantee on, a transaction would not provide one
 * at READ COMMITTED, and the failure is one extra post in a queue a human
 * reads anyway.
 */

const POST = {
  /* blog_article.title is varchar(512); this is a headline, not a paragraph. */
  TITLE_MAX: 200,
  /* The CLOB holds far more. This is what one sitting of typing is. */
  BODY_MAX: 20000,
  ORIGIN_MAX: 200,
  /*
   * The standfirst, cut at a word. The vendor slices 100 characters mid-word
   * (NEWS_SUMMARY_MAX_LEN) and the index shows the result; the column holds
   * 4000, so the only thing that limit was protecting was the line length.
   */
  SUMMARY_MAX: 200,
  PER_DAY: 1
};

/* Crystal's words for the two states a member may put a post into, and the one refusal reads as. */
const DRAFT = STATUS.DRAFT;
const REVIEW = STATUS.REVIEW;
const ARCHIVED = 'ARCHIVED';

/** The author, from the session. A member with no platform login has no byline to write. */
function loginOf(user) {
  const login = user && user.login ? String(user.login).trim() : '';
  if (!login) throw new HttpError(403, 'common.permissionDenied');
  return login;
}

/**
 * Midnight to midnight, in the SERVER'S day.
 *
 * The same day the vendor's count is keyed on (TO_CHAR(create_at,
 * 'YYYY-MM-DD') against the database's own clock) and the same day the visit
 * counter above uses. A member on the other side of a date line is on the
 * blog's day, not theirs, which is at least one answer rather than two.
 */
function dayBounds(now) {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(from.getTime());
  to.setDate(to.getDate() + 1);

  return { from: from, to: to };
}

/**
 * WHAT IS LEFT OF TODAY, for the page to say BEFORE anybody types.
 *
 * The vendor tells a member about this limit by refusing the post they have
 * just written, which is the worst moment to hear it. The storefront asks for
 * this when a compose page or a reply box opens, so the sentence is "one
 * article left today" rather than an error over a finished draft.
 */
async function allowance(login) {
  const bounds = dayBounds(new Date());
  const used = await repo.countToday(login, bounds.from, bounds.to);

  return {
    article: {
      limit: POST.PER_DAY,
      used: used.article,
      left: Math.max(0, POST.PER_DAY - used.article)
    },
    reply: {
      limit: POST.PER_DAY,
      used: used.reply,
      left: Math.max(0, POST.PER_DAY - used.reply)
    },
    /* When the allowance comes back, so the page can say it instead of "tomorrow". */
    resets_at: bounds.to.toISOString()
  };
}

/**
 * Today's allowance for one kind, or the vendor's 409.
 *
 * The refusal carries the whole allowance and the hour it returns, so a page
 * that asked before the member typed and a page that did not both have the
 * same thing to say afterwards.
 */
async function spend(login, kind) {
  const left = await allowance(login);
  const line = kind === 'REPLY' ? left.reply : left.article;
  if (line.left > 0) return left;

  throw new HttpError(409, kind === 'REPLY' ? 'blog.oneReplyADay' : 'blog.oneArticleADay', {
    reason: kind === 'REPLY' ? 'LIMIT_REPLY' : 'LIMIT_ARTICLE',
    kind: kind,
    allowance: left,
    resets_at: left.resets_at
  });
}

/**
 * The body as it will be stored: the member's markup, sanitised.
 *
 * IT IS NOT CUT TO LENGTH, it is refused. Slicing HTML at a character count
 * lands inside a tag as often as not, and what gets stored is then broken
 * markup nobody wrote - so a body over the limit comes back as a 400 saying
 * so, while there is still a page holding the words to shorten.
 */
function bodyOf(value) {
  const html = richText.memberHtml(value);
  if (!repo.plainLines(html)) throw new HttpError(400, 'blog.aPostNeedsWords', { reason: 'NO_BODY' });

  if (html.length > POST.BODY_MAX) {
    throw new HttpError(400, 'blog.thePostIsTooLong', {
      reason: 'BODY_TOO_LONG', limit: POST.BODY_MAX, length: html.length
    });
  }

  return html;
}

/** A headline is one line - a pasted paragraph with newlines in it is not a title. */
function titleOf(value) {
  const text = repo.plain(value);
  if (!text) throw new HttpError(400, 'blog.anArticleNeedsATitle', { reason: 'NO_TITLE' });

  return text.slice(0, POST.TITLE_MAX);
}

/** A reply's title is the thread's, marked - the vendor's reply form writes the same thing. */
function replyTitle(threadTitle) {
  return ('Re: ' + repo.plain(threadTitle)).trim().slice(0, POST.TITLE_MAX);
}

/** Where the words came from, when they are not the member's own. Optional, and never 'null'. */
function originOf(value) {
  const text = repo.plain(value);
  return text ? text.slice(0, POST.ORIGIN_MAX) : '';
}

/** The shelf, checked against the vendor's own tree rather than against Crystal's six topics. */
async function shelfOf(value) {
  const id = Math.floor(Number(value));
  if (!isFinite(id) || id <= 0) {
    throw new HttpError(400, 'blog.anArticleNeedsAShelf', { reason: 'NO_SHELF' });
  }

  if (!(await repo.subjectExists(id))) {
    throw new HttpError(400, 'blog.noSuchShelf', { reason: 'UNKNOWN_SHELF' });
  }

  return id;
}

/**
 * The standfirst, cut at a word boundary.
 *
 * The blog index prints this under the headline and the article page prints
 * it as a standfirst UNLESS it is the opening of the body - which, for a
 * member's post, it always is. So it is here to give the index something to
 * show, not to be read twice.
 */
function summaryOf(body) {
  const line = repo.plain(body);
  if (line.length <= POST.SUMMARY_MAX) return line;

  const cut = line.slice(0, POST.SUMMARY_MAX);
  const space = cut.lastIndexOf(' ');

  return (space > POST.SUMMARY_MAX / 2 ? cut.slice(0, space) : cut) + '…';
}

/** DRAFT when the member asked to keep it to themselves; REVIEW otherwise. */
function wantedStatus(value) {
  const word = String(value === undefined || value === null ? REVIEW : value).toUpperCase();
  if (word !== DRAFT && word !== REVIEW) {
    throw new HttpError(400, 'common.valueFailedAValidation', { reason: 'UNKNOWN_STATUS' });
  }

  return word;
}

/**
 * ONE OF THE MEMBER'S OWN POSTS, with its body - what the compose page reads
 * when it opens on something already written.
 *
 * A post belonging to somebody else answers 404 rather than 403: the id is
 * guessable, and "you may not edit that" is an answer to "does it exist".
 */
async function ownPost(user, id) {
  const login = loginOf(user);
  const post = await repo.findPost(id, true);
  if (!post || !post.author || post.author !== login) throw new HttpError(404, 'common.notFound');

  const thread = post.kind === 'REPLY' ? await repo.findPost(post.parent_id) : null;

  post.thread = post.kind === 'REPLY' ? {
    id: post.parent_id,
    title: thread ? thread.title : null,
    slug: thread ? thread.slug : null,
    is_public: !!thread && thread.kind === 'ARTICLE' && thread.status === STATUS.PUBLISHED
  } : null;

  post.is_public = post.status === STATUS.PUBLISHED
    && (post.kind === 'ARTICLE' || (!!post.thread && post.thread.is_public));

  return post;
}

/** A new article, or a reply to one. See the rules above. */
async function write(user, input) {
  const login = loginOf(user);
  const status = wantedStatus(input.status);
  const parentId = Math.floor(Number(input.parent_id || 0)) || 0;
  const body = bodyOf(input.content);

  const post = {
    author: login,
    content: body,
    summary: summaryOf(body),
    status: status,
    parent_id: 0
  };

  if (parentId) {
    const thread = await repo.findPost(parentId);
    if (!thread) throw new HttpError(404, 'common.notFound');

    /*
     * A REPLY GOES UNDER A PUBLISHED ARTICLE, and under nothing else - not a
     * reply (the vendor's blog is one level deep and every read it has
     * assumes it), and not a thread readers cannot see.
     */
    if (thread.kind !== 'ARTICLE' || thread.status !== STATUS.PUBLISHED) {
      throw new HttpError(409, 'blog.threadIsNotOpen', { reason: 'THREAD_CLOSED' });
    }

    post.parent_id = thread.id;
    post.title = replyTitle(thread.title);
    if (thread.subject_id) post.subject_id = thread.subject_id;
    if (thread.type) post.type = thread.type;
  } else {
    post.title = titleOf(input.title);
    post.subject_id = await shelfOf(input.subject_id);
    post.origin = originOf(input.origin);
  }

  if (status === REVIEW) {
    await spend(login, parentId ? 'REPLY' : 'ARTICLE');
    post.created_at = new Date();
  }

  const rows = await repo.insert(post);
  return ownPost(user, rows[0].id);
}

/** The member's own post, rewritten. See rule 4 above for what an edit costs. */
async function edit(user, id, input) {
  const login = loginOf(user);
  const status = wantedStatus(input.status);

  const post = await repo.findPost(id);
  if (!post || !post.author || post.author !== login) throw new HttpError(404, 'common.notFound');

  const body = bodyOf(input.content);
  const patch = { content: body, summary: summaryOf(body) };

  /* A reply's title and shelf are its thread's; only its words are the member's to change. */
  if (post.kind === 'ARTICLE') {
    patch.title = titleOf(input.title);
    patch.subject_id = await shelfOf(input.subject_id === undefined ? post.subject_id : input.subject_id);
    patch.origin = originOf(input.origin);
  }

  if (status === DRAFT) {
    /*
     * A submission cannot be taken back into a drawer. It is in somebody's
     * queue, and a draft that disappears from that queue while it is being
     * read is worse than no draft button at all. Deleting it withdraws it.
     */
    if (post.status !== DRAFT && post.status !== ARCHIVED) {
      throw new HttpError(409, 'blog.alreadySubmitted', { reason: 'ALREADY_SUBMITTED' });
    }
    patch.status = DRAFT;
  } else if (post.status !== REVIEW) {
    await spend(login, post.kind);
    patch.status = REVIEW;
    patch.created_at = new Date();
  }

  await repo.update(id, patch);
  return ownPost(user, id);
}

/** The member's own post, withdrawn. A draft is gone; anything submitted goes to the bin. */
async function removeOwn(user, id) {
  const login = loginOf(user);

  const post = await repo.findPost(id);
  if (!post || !post.author || post.author !== login) throw new HttpError(404, 'common.notFound');

  if (post.status === DRAFT) {
    await repo.purge(post.id);
    return { id: post.id, removed: 'PURGED' };
  }

  await repo.softDelete(post.id);
  return { id: post.id, removed: ARCHIVED };
}

/* ------------------------------------------------------------------ */
/*  thumbs                                                             */
/* ------------------------------------------------------------------ */

/**
 * A MEMBER GIVES A THUMB - gold, silver or bronze - to an article or a reply.
 *
 * The vendor's rules are listed, with where each came from, at the top of
 * repositories/legacy/thumbs.repository.js. This function enforces the ones
 * that are about the REQUEST, in the order a refusal should be decided:
 *
 *   3. the kind is one of the three            400 blog.thatIsNotAThumb
 *   4. the row is one a reader can see         404 common.notFound
 *   5. the row is not the member's own         400 blog.notOnYourOwn
 *
 * and hands the rest - once per reader per row, the count and the ledger in
 * one transaction - to the repository, turning "already given" into the
 * vendor's 409 blog.alreadyGiven.
 *
 * EVERY REFUSAL SAYS WHICH ONE IT IS in `detail.reason` (UNKNOWN_KIND, OWN,
 * ALREADY), so the page can explain it in its own words beside the button
 * that was pressed; ALREADY also carries the thumb that was given and the
 * current counts, so the page can mark the one that stands.
 *
 * The member is identified by LOGIN, from the session - the ledger records a
 * reader the way blog_article records an author. A member with no platform
 * login cannot be told apart from another in that ledger, so is refused.
 */
async function giveThumb(user, id, kind) {
  const word = String(kind || '').toUpperCase();
  if (thumbs.KINDS.indexOf(word) === -1) {
    throw new HttpError(400, 'blog.thatIsNotAThumb', { reason: 'UNKNOWN_KIND', kinds: thumbs.KINDS });
  }

  const rowId = bounded(id, 1, Number.MAX_SAFE_INTEGER, null);
  const target = rowId ? await thumbs.findTarget(rowId) : null;
  if (!target) throw new HttpError(404, 'common.notFound');

  const login = user && user.login ? String(user.login) : null;
  if (!login) throw new HttpError(403, 'common.permissionDenied');

  if (target.author !== null && target.author === login) {
    throw new HttpError(400, 'blog.notOnYourOwn', { reason: 'OWN' });
  }

  const result = await thumbs.give(target.id, login, word);

  if (!result.given) {
    throw new HttpError(409, 'blog.alreadyGiven', {
      reason: 'ALREADY',
      id: target.id,
      kind: result.kind,
      recommendations: result.recommendations
    });
  }

  return { id: target.id, kind: result.kind, recommendations: result.recommendations };
}

/**
 * Which thumb the member has given, on each of a page's rows.
 *
 * `ids` is a comma list - the article and the replies on screen, so one
 * request answers a whole page. Capped at a hundred; nothing draws more.
 */
function myThumbs(user, ids) {
  const list = String(ids || '').split(',')
    .map(function (part) { return bounded(part.trim(), 1, Number.MAX_SAFE_INTEGER, null); })
    .filter(function (value, index, all) { return value && all.indexOf(value) === index; })
    .slice(0, 100);

  return thumbs.mine(user && user.login ? String(user.login) : null, list);
}

function publicCategories() {
  return repo.publishedCategories();
}

async function publicSubjects() {
  return (await subjectTree()).roots;
}

function featured(limit) {
  return repo.published({ is_featured: true, limit: Math.min(12, Number(limit) || 4) });
}

/* ------------------------------------------------------------------ */
/*  the console                                                        */
/* ------------------------------------------------------------------ */

/**
 * The console's list.
 *
 * `kind` is ARTICLE (the default, and what this has always answered), REPLY,
 * or ALL. It exists because members write replies from the storefront now and
 * a reply waits for approval exactly as an article does - see the member
 * write path above, and applyFilters in the repository.
 */
function search(filters, paging) {
  const kind = ['ARTICLE', 'REPLY', 'ALL'].indexOf(filters.kind) === -1 ? 'ARTICLE' : filters.kind;
  return repo.search(Object.assign({}, filters, { kind: kind }), paging);
}

async function detail(id, deleted) {
  const row = await repo.findById(id, deleted);
  if (!row) throw new HttpError(404, 'common.notFound');
  return row;
}

/**
 * NO SLUG IS CHOSEN HERE ANY MORE.
 *
 * There used to be a uniqueness loop with a -2, -3 suffix, because two
 * articles genuinely can be called the same thing a year apart. The legacy
 * schema has no slug column at all, so one is derived on read from the title
 * AND THE ARTICLE ID - which cannot collide, whatever anything is called.
 * The loop had nothing left to resolve; see the note in
 * repositories/legacy/articles.repository.js.
 */

async function create(body, admin, actor) {
  const data = Object.assign({}, body);

  if (!data.title) throw new HttpError(400, 'common.valueFailedAValidation');

  /*
   * THE BYLINE IS A LOGIN NAME, not a display name and not an id.
   *
   * blog_article.user_userid is a varchar the vendor's own console fills with
   * the author's login, and its blog joins that string to resolve a name.
   * Writing an admin's display name there would put a value in the column
   * that nothing on the vendor's side can resolve, so the login goes in and
   * the display name is not stored at all - there is nowhere to put it.
   */
  data.author = data.author || (admin ? (admin.username || admin.name) : null);
  data.status = STATUS.DRAFT;

  const rows = await repo.insert(data);
  audit.created(actor, TABLE, rows[0].id, rows[0], PAGE);
  return rows[0];
}

async function update(id, body, actor) {
  const data = Object.assign({}, body);

  const previous = await repo.findRow(id);
  if (!previous) throw new HttpError(404, 'common.notFound');

  delete data.slug;

  /*
   * THE FEATURED BOX, UNTOUCHED, IS NOT WRITTEN.
   *
   * Featured is read as "has a gold thumb" and written as gold_recom_num = 1
   * or 0 (see the repository's decode and encode). The console's form sends
   * the checkbox on EVERY save - so editing a typo in an article that readers
   * had given twelve gold thumbs set the count back to 1. Gold is a reader's
   * thumb now (thumbs.repository.js), so a save that leaves the box as it
   * was leaves the count as it was. Ticking or unticking the box still does
   * what it did; that is a decision about featuring for somebody else.
   */
  if (data.is_featured !== undefined && Boolean(data.is_featured) === Boolean(previous.is_featured)) {
    delete data.is_featured;
  }

  if (!Object.keys(data).length) throw new HttpError(400, 'common.nothingToUpdate');

  const rows = await repo.update(id, data);
  audit.updated(actor, TABLE, id, previous, rows[0], PAGE);
  return rows[0];
}

/**
 * A move through the workflow.
 *
 * Publishing is separated from editing on purpose: the permission grid gives
 * an editor WRITE on this page and keeps the publish button behind SUPER, so
 * "who may write" and "who may put it in front of customers" are two
 * different answers.
 */
async function transition(id, to, actor) {
  const previous = await repo.findRow(id);
  if (!previous) throw new HttpError(404, 'common.notFound');
  if (previous.status === to) return previous;

  const allowed = FLOW[previous.status] || [];
  if (allowed.indexOf(to) === -1) throw new HttpError(409, 'common.valueFailedAValidation');

  const patch = { status: to };

  // Stamped once, on the first time it goes live, and never moved again.
  if (to === STATUS.PUBLISHED && !previous.published_at) patch.published_at = new Date();

  const rows = await repo.update(id, patch);
  audit.updated(actor, TABLE, id, previous, rows[0], PAGE);
  return rows[0];
}

/**
 * Removing an article also removes its images.
 *
 * media_assets has no foreign key - it cannot, it points at four tables - so
 * this is the price of that decision, paid explicitly here.
 *
 * IT IS NO LONGER ONE TRANSACTION, and it cannot be: the article is in the
 * vendor's database and its artwork is in Crystal's. So the order is chosen
 * instead. The article goes to the bin FIRST, because the failure that leaves
 * a hidden article with its images still on disk is invisible and reversible,
 * and the one that leaves a live article with no artwork is neither.
 */
async function remove(id, actor) {
  const previous = await repo.findRow(id);
  if (!previous) throw new HttpError(404, 'common.notFound');

  const affected = await repo.softDelete(id);
  if (!affected) throw new HttpError(404, 'common.notFound');

  await media.removeForOwner('ARTICLE', id);

  audit.deleted(actor, TABLE, id, previous, PAGE);
}

async function restore(id, actor) {
  const rows = await repo.restore(id);
  if (!rows.length || !rows[0]) throw new HttpError(404, 'common.notFound');
  audit.restored(actor, TABLE, id, rows[0], PAGE);
}

/**
 * WHAT STILL POINTS AT AN ARTICLE, and why this is hand-written.
 *
 * Every other table in this API gets its dependents from routes/purge.routes.js,
 * which asks PostgreSQL's catalogue which foreign keys reference the row. That
 * cannot answer for an article any more: the row is in a database whose
 * catalogue is not Crystal's to read, and the only thing on Crystal's side
 * that refers to it is artwork.
 *
 * So the one real answer is given directly. It never blocks - media_assets is
 * a CASCADE relationship in intent, deleted alongside rather than protecting -
 * but it is reported, because a permanent delete that silently takes six
 * images with it should say so first.
 */
async function dependents(id) {
  const article = await repo.findRow(id);
  if (!article) throw new HttpError(404, 'common.notFound');

  const [images, ratings] = await Promise.all([
    media.countForOwner('ARTICLE', id),
    thumbs.countFor(id)
  ]);

  const found = [];
  if (images) found.push({ table: 'media_assets', count: images, on_delete: 'CASCADE' });
  /* Readers' thumbs go with the article - purge removes the ledger rows first. */
  if (ratings) found.push({ table: 'ora_blog.blog_article_recommend', count: ratings, on_delete: 'CASCADE' });

  return {
    dependents: found,
    blockers: [],
    can_purge: true
  };
}

/**
 * Gone for good - the article, its counters, its body and its artwork.
 *
 * The recycle-bin rail is the same one every other table has: a live article
 * cannot be destroyed in one click. Here "in the bin" is a state rather than
 * a flag, so it reads ARCHIVED; see codes.js.
 */
async function purge(id, actor) {
  const article = await repo.findRow(id);
  if (!article) throw new HttpError(404, 'common.notFound');
  if (article.status !== 'ARCHIVED') {
    throw new HttpError(409, 'common.moveItToThe');
  }

  await repo.purge(id);
  await media.removeForOwner('ARTICLE', id);

  audit.deleted(actor, TABLE, id, article, PAGE);
}

module.exports = {
  PAGE: PAGE,
  COLUMNS: COLUMNS,
  SORTABLE: SORTABLE,
  DEFAULT_SORT: DEFAULT_SORT,
  STATUS: STATUS,

  publicList: publicList,
  publicDetail: publicDetail,
  publicReplies: publicReplies,
  publicReply: publicReply,
  mine: mine,
  allowance: allowance,
  ownPost: ownPost,
  write: write,
  edit: edit,
  removeOwn: removeOwn,
  publicCategories: publicCategories,
  publicSubjects: publicSubjects,
  featured: featured,
  giveThumb: giveThumb,
  myThumbs: myThumbs,

  search: search,
  detail: detail,
  create: create,
  update: update,
  transition: transition,
  remove: remove,
  restore: restore,
  dependents: dependents,
  purge: purge
};
