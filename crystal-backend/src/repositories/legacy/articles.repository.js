'use strict';

const legacy = require('../../config/legacy');
const codes = require('./codes');
const thumbs = require('./thumbs.repository');

/**
 * THE BLOG, read and written in the vendor's database.
 *
 * This replaces repositories/articles.repository.js, which read the same
 * articles out of PostgreSQL. As with feedback, the PostgreSQL `articles`
 * table stays in sql/schema.sql: it is where this content will land when it
 * is migrated, and it is still what media_assets hangs off.
 *
 * ONE ARTICLE, THREE TABLES, and the split is the point:
 *
 *   blog_article       the row - author, title, state, dates
 *   blog_article_info  the counters - visits, replies, recommendations
 *   blog_article_lob   the BODY, a CLOB
 *
 * A LIST JOINS THE FIRST TWO AND NOT THE THIRD. That is not a micro
 * optimisation: an article body is measured in kilobytes, a page of twenty is
 * a megabyte, and the list has no use for any of it. The previous PostgreSQL
 * repository had to remember to leave `content` out of its select; here the
 * schema does the remembering.
 *
 * TWO THINGS THIS SCHEMA DOES NOT HAVE, and how each is answered:
 *
 * 1. THERE IS NO SLUG. The storefront routes on /blog/:slug and has done
 *    since before this integration. So the slug is DERIVED - the title,
 *    slugified, with the id on the end - and read back by taking the id off
 *    again. It is stable because the id is, it stays readable in a URL, and
 *    it needs no column the vendor would have to add. An article whose title
 *    is later edited keeps working on the old link, because only the trailing
 *    number is ever looked at.
 *
 * 2. THERE IS NO is_deleted. There is `state`, which already carries a whole
 *    publishing workflow - so a soft delete is PUB_CANCEL and a restore is
 *    back to PUB_TEMP. See codes.js for the full mapping and for what is lost.
 *
 * ======================================================================
 * THE THREAD MODEL, as the vendor's own code reads it
 * ======================================================================
 *
 * Found by reading vendor_backend (routes/vendorRoutes.js and routes/v2/
 * blogRoutes.js, controllers/web/webBlogController.js and client/
 * clientBlogController.js, models/blogModel.js, constants/constants.js) and
 * vendor_client (pages/client/blog/*, pages/client/account/AccountBlog*).
 * Written down here so the next reader does not have to do it again.
 *
 * THE BLOG IS A FORUM AS WELL AS A PUBLICATION. `blog_article.parent` is 0 for
 * an article and the id of an article for a REPLY to it. A reply is a whole
 * row in all three tables - its own title, body, state, visit counter and
 * recommendations - not a comment hung off the article.
 *
 * ONE LEVEL DEEP, BY CONSTRUCTION. Nothing stops `parent` pointing at a reply,
 * but nothing the vendor has ever writes one: the only reply button
 * (BlogInfoCard) posts to /blog/add/<the article's id>, a reply card has no
 * reply button of its own, and every read - findOldReplies, the member's
 * counts, the honour roll - asks `parent = <article>` and never walks further.
 * So a thread is an article plus the rows whose parent is that article, and
 * Crystal reads it the same way. A row whose parent is itself a reply is not
 * part of any thread the vendor can show, and Crystal does not invent one.
 *
 * ORDER: NEWEST ACTIVITY FIRST. fetchOldBlogReplies defaults to
 * `articles.modify_at DESC` and the vendor's thread page asks for exactly that
 * (it sends an empty sortKey). modify_at is stamped by every edit AND by the
 * approval that publishes a reply, so in practice it is "most recently
 * published or edited on top". The vendor has no tie-breaker, which on a page
 * boundary can show one reply twice and another never; Crystal adds `id DESC`
 * so paging is stable, and changes nothing else about the order. (The
 * vendor's `thumb_count` sort for replies - gold minus bronze, oldest first -
 * exists in the model but no reader screen asks for it.)
 *
 * PAGING: offset/limit on the replies, with the article prepended to the first
 * page and `total` counting replies only. The vendor's own page asks for a
 * thousand at once and says why in a FIXME; the API itself pages.
 *
 * WHAT IS PUBLIC: `state = 4` (PUB_APPROVED), and nothing else - for the
 * article list (`parent = 0`), for the thread's article, and for each reply.
 * A draft (-2), a submission waiting for review (0, 1, 3, 7) or a refusal
 * (2, 5, 6) is never shown to a reader, and that includes a pending reply in
 * a published thread. Crystal applies the same single predicate everywhere,
 * and a thread whose article is not approved is not a thread at all (the
 * vendor's page shows "no content" for it; Crystal answers 404).
 *
 * HELP REQUESTS. `blog_article_info.is_help_request = 1` marks an article as
 * a question. Its `help_status` is where the question has got to - in
 * progress 0, resolved 1, finished 2, correct answer chosen 3, verifying 4 -
 * and the vendor shows that badge only on a published top-level row. On a
 * REPLY, `help_status = 4` with `is_help_request = 0` is the vendor backend's
 * CORRECT_CHECK: that reply is the accepted answer. See codes.js for why one
 * number means two things. Crystal surfaces the accepted answer at the head of
 * a question's thread and marks it where it sits in the order.
 *
 * SUBJECTS ARE A TREE, TWO LEVELS. `blog_subject` (id, name, parent, order_no,
 * state): six shelves at the top and four under "Product" (21-24). The
 * vendor's reader screens never actually read the table - the subject query
 * is switched off with a FIXME and the sidebar is a hard-coded list of the six
 * top-level shelves - and its filter is an exact `subject_id = ?`. The
 * combination means an article filed under "Product > Computer" cannot be
 * reached from the vendor's sidebar at all. Crystal reads the tree, and a
 * shelf covers the shelves under it; that is the one place it does not copy
 * the vendor, and it is deliberate.
 *
 * `blog_subject.state` is not used to hide a shelf. The vendor's model treats
 * 0 as live (FLAG_EXIST), the vendor's own development seed writes 1 on every
 * row, and the vendor's reader ignores the column entirely - so it cannot be
 * trusted to mean one thing. What decides whether a reader sees a shelf is
 * whether anything published sits on it.
 *
 * THE COUNTERS on blog_article_info:
 *
 *   visited_num      reads. The vendor counts ONE per visitor address per
 *                    article per day: opening a thread counts for the
 *                    article, and opening a reply's body counts for THAT
 *                    REPLY - never for the article it belongs to.
 *   reply_num        a denormalised counter maintained by tooling Crystal
 *                    cannot see. The vendor's own web controller never moves
 *                    it when a reply is added, and in the development data it
 *                    disagrees with the rows. Crystal shows the number of
 *                    PUBLISHED replies it can actually list instead, so the
 *                    count on the index is the count the thread delivers.
 *   gold_recom_num   the three thumbs a signed-in reader can give an article
 *   silber_recom_num or a reply - gold, silver, bronze, one per reader per
 *   recommended_num  row, for good. Every rule of giving one is in
 *                    thumbs.repository.js. The vendor's "by thumbs" order
 *                    is gold minus the third grade, which is transcribed as
 *                    it is.
 *   is_new           set on insert; nothing a reader sees reads it.
 */

const ARTICLES = 'blog_article';
const INFOS = 'blog_article_info';
const LOBS = 'blog_article_lob';
const SUBJECTS = 'blog_subject';

/** The one state a reader may see. See THE THREAD MODEL above. */
const PUBLIC = codes.ARTICLE_STATE.PUB_APPROVED;

function conn(trx) {
  return trx || legacy.connection();
}

function base(trx) {
  return conn(trx)(legacy.blog(ARTICLES) + ' as a')
    .leftJoin(legacy.blog(INFOS) + ' as i', 'i.id', 'a.id');
}

/* ------------------------------------------------------------------ */
/*  the derived slug                                                   */
/* ------------------------------------------------------------------ */

/**
 * A URL-safe title with the id on the end.
 *
 * Non-ASCII titles matter here - this blog is written in two languages - and
 * a slugifier that strips everything it does not recognise turns a Chinese
 * title into the empty string. When nothing survives, the id alone IS the
 * slug: ugly, and it resolves, which is the property that matters.
 */
function slugOf(row) {
  const text = String(row.title || '')
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return text ? text + '-' + row.id : String(row.id);
}

/**
 * The id back out of a slug.
 *
 * Everything before the last hyphen is decoration and is not checked, so an
 * article that has been retitled still answers on links written before the
 * change. A slug with no trailing number is not an article id and returns
 * null, which the caller turns into a 404.
 */
function idFromSlug(slug) {
  const match = String(slug || '').match(/(\d+)$/);
  return match ? Number(match[1]) : null;
}

/* ------------------------------------------------------------------ */
/*  shape                                                              */
/* ------------------------------------------------------------------ */

/** A legacy row, in the words the API and both frontends already use. */
function decode(row) {
  if (!row) return null;

  const id = Number(row.id);

  return {
    id: id,
    title: row.title,
    slug: slugOf({ id: id, title: row.title }),
    cover_image: row.image_url || null,

    /*
     * The legacy schema has ONE image, not the desktop/mobile pair Crystal's
     * own table carries. Answering null rather than repeating the desktop
     * image is deliberate: the storefront already falls back to `cover_image`
     * when the mobile one is missing, and duplicating it here would make a
     * missing mobile crop indistinguishable from a deliberate one.
     */
    cover_image_mobile: null,

    summary: row.summary || null,
    content: row.content === undefined ? undefined : row.content,

    /* The byline is a login name; see the note at the top of this file. */
    author: row.user_userid || null,
    author_id: null,
    author_name: row.user_userid || null,

    category: codes.topicFromSubject(row.subject_id),
    status: codes.articleStatusFromState(row.state),
    view_count: Number(row.visited_num || 0),
    /*
     * THE EDITOR'S PICK IS A COUNTER, not a flag.
     *
     * There is no boolean on the article for this. The legacy blog records
     * recommendations in three grades on the info row, and the GOLD one is
     * the editorial pick - the other two are readers recommending each other's
     * posts. So featured means 'has a gold recommendation', which is the
     * closest thing this schema has to the switch Crystal's console shows.
     */
    is_featured: Number(row.gold_recom_num || 0) > 0,

    published_at: row.publish_at || null,
    is_deleted: codes.articleStatusFromState(row.state) === 'ARCHIVED',
    created_at: row.create_at || null,
    updated_at: row.modify_at || null
  };
}

/**
 * STORED HTML AS THE WORDS IN IT.
 *
 * `summary` carries markup - the vendor's own editor writes it, and the
 * vendor strips it with REGEXP_REPLACE on every reader query rather than
 * storing it clean. A reader's list is text, so the same thing is done here,
 * once, rather than by every screen that shows a standfirst: the storefront
 * rendered `<p>Two weeks with the C9 Pro.</p>` with its tags showing.
 *
 * The common entities are decoded as well, because a tag-stripped "&amp;"
 * rendered as text is four characters of noise. This is for PLAIN TEXT only -
 * the result is escaped by whatever displays it, and nothing here makes HTML
 * safe to insert.
 */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' };

function plain(html) {
  if (html === null || html === undefined) return '';

  return String(html)
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (whole, name) {
      const lower = name.toLowerCase();
      if (lower.charAt(0) === '#') {
        const code = lower.charAt(1) === 'x' ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
        return isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
      }
      return ENTITIES[lower] === undefined ? whole : ENTITIES[lower];
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * THE SAME THING, WITH THE PARAGRAPHS LEFT IN - what a member typed, as the
 * words in it and nothing else.
 *
 * plain() above is for comparing and for standfirsts, so it flattens every
 * run of whitespace into one space. A BODY cannot be flattened: the blog
 * renderer draws plain text by splitting it on blank lines, so flattening it
 * would deliver one unreadable paragraph. This keeps the line breaks and
 * takes everything else away.
 *
 * WHY A MEMBER'S BODY IS STORED AS TEXT AT ALL. The vendor's addBlog puts
 * `params.content` into the CLOB exactly as it arrived and strips tags only
 * for the summary - so anything a member's browser sent is stored as markup,
 * and every reader of that row afterwards has to be trusted to make it safe.
 * Crystal takes the markup out ON THE WAY IN, once, and what is stored is
 * text. The console's editor still writes HTML and still reads back as HTML;
 * it is a member's body that can no longer be one.
 *
 * TAG-SHAPED, NOT ANGLE-BRACKET-SHAPED. `<[^>]*>` would eat "2 < 3 and 5 > 4"
 * out of somebody's sentence. What is removed is what the storefront's
 * isHtml() would call a tag, which is also why the strip runs AGAIN after the
 * entities are decoded: `&lt;script&gt;` must not be able to become markup by
 * being unescaped, and a body that has been through here can never come back
 * as HTML.
 */
const TAGS = /<!--[\s\S]*?-->|<\/?[a-z][a-z0-9]*(?:\s[^<>]*?)?\/?>/gi;

/* A tag that ENDS a block becomes the break it was drawing, so pasted HTML keeps its shape. */
const BREAKS = /<(?:br\s*\/?|\/p|\/div|\/li|\/h[1-6]|\/tr|\/blockquote)\s*>/gi;

function plainLines(html) {
  if (html === null || html === undefined) return '';

  return String(html)
    .replace(/\r\n?/g, '\n')
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(BREAKS, '\n')
    .replace(TAGS, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (whole, name) {
      const lower = name.toLowerCase();
      if (lower.charAt(0) === '#') {
        const code = lower.charAt(1) === 'x' ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
        return isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
      }
      return ENTITIES[lower] === undefined ? whole : ENTITIES[lower];
    })
    .replace(TAGS, '')
    .split('\n')
    .map(function (line) { return line.replace(/[^\S\n]+/g, ' ').trim(); })
    .join('\n')
    /* Any number of blank lines is ONE blank line: the renderer's paragraph break. */
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The shelf an article sits on, and the shelf that one sits under. */
function subjectOf(row) {
  if (row.subject_ref === null || row.subject_ref === undefined) return null;

  /* A parent id with no row behind it is not a shelf anybody can be sent to. */
  const parent = row.subject_parent_ref === null || row.subject_parent_ref === undefined
    ? null
    : Number(row.subject_parent_ref);

  return {
    id: Number(row.subject_ref),
    name: row.subject_name || null,
    parent_id: parent,
    parent_name: parent ? (row.subject_parent_name || null) : null
  };
}

function recommendationsOf(row) {
  return {
    gold: Number(row.gold_recom_num || 0),
    silver: Number(row.silber_recom_num || 0),
    bronze: Number(row.recommended_num || 0)
  };
}

/** "null" is what the vendor's form has stored for an empty origin; it shows as nothing. */
function originOf(value) {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text && text !== 'null' ? text : null;
}

function later(one, two) {
  if (!one) return two || null;
  if (!two) return one;
  return new Date(two).getTime() > new Date(one).getTime() ? two : one;
}

/**
 * AN ARTICLE AS A READER SEES IT - everything decode() answers, plus the
 * thread around it.
 *
 * `tail` is this article's row out of threadTails(): how many published
 * replies it has, which one is on top, and whether one of them is the
 * accepted answer. An article nobody has replied to has no tail.
 */
function decodePublic(row, tail) {
  const out = decode(row);
  const question = Number(row.is_help_request) === 1;

  out.summary = plain(row.summary) || null;
  out.subject = subjectOf(row);

  out.is_help_request = question;
  out.help_status = question ? codes.helpStatusFromCode(row.help_status) : null;
  out.has_accepted_answer = question && !!tail && Number(tail.accepted_cnt || 0) > 0;

  out.reply_count = tail ? Number(tail.reply_cnt || 0) : 0;
  out.last_reply = tail ? {
    id: Number(tail.id),
    author: tail.user_userid || null,
    at: tail.publish_at || tail.create_at || null
  } : null;
  out.last_activity_at = later(out.published_at, out.last_reply ? out.last_reply.at : null);

  out.recommendations = recommendationsOf(row);

  return out;
}

/**
 * One reply, WITH its body.
 *
 * `inQuestion` says whether the thread is a help request: the accepted-answer
 * mark only means something there, and a stray help_status on a reply in an
 * ordinary thread is not shown as one. There is no title - the vendor's reply
 * card never shows one either, because it is almost always "Re:" and the
 * article's own.
 */
function decodeReply(row, inQuestion) {
  if (!row) return null;

  return {
    id: Number(row.id),
    parent_id: Number(row.parent),
    author: row.user_userid || null,
    content: row.content || '',
    published_at: row.publish_at || row.create_at || null,
    updated_at: row.modify_at || null,
    view_count: Number(row.visited_num || 0),
    is_accepted: !!inQuestion
      && Number(row.help_status) === codes.HELP_CORRECT_CHECK
      && Number(row.is_help_request || 0) === 0,
    recommendations: recommendationsOf(row),
    approval_num: Number(row.approval_num || 0)
  };
}

/** Crystal's words back into the vendor's columns. */
function encode(data) {
  const article = {};
  const info = {};
  const lob = {};

  if (data.title !== undefined) article.title = data.title;
  if (data.summary !== undefined) article.summary = data.summary;
  if (data.cover_image !== undefined) article.image_url = data.cover_image;
  if (data.author !== undefined) article.user_userid = data.author;
  if (data.category !== undefined) article.subject_id = codes.topicToSubject(data.category);
  if (data.status !== undefined) article.state = codes.articleStatusToState(data.status);
  if (data.is_featured !== undefined) info.gold_recom_num = data.is_featured ? 1 : 0;
  if (data.published_at !== undefined) article.publish_at = data.published_at;

  /*
   * THE SHELF ITSELF, for a caller that knows which one it means.
   *
   * `category` above is one of Crystal's six topics and maps onto subject ids
   * 1 to 6 ONLY, so nothing written through it can be filed on "Product >
   * Computer" (21-24) - shelves the storefront's own index navigates by. A
   * member choosing a shelf picks from the vendor's tree, so the id is
   * written as it comes and the topic is derived back out of it on read.
   * Both are accepted; a caller sends one or the other, never both.
   */
  if (data.subject_id !== undefined) article.subject_id = Number(data.subject_id);

  /* 0 for an article, the article's id for a reply - see THE THREAD MODEL. */
  if (data.parent_id !== undefined) article.parent = Number(data.parent_id);

  /* OLD_BLOG_ARTICLE_TYPES: 1 bbs, 2 blog. A reply carries its thread's. */
  if (data.type !== undefined) article.type = Number(data.type);

  /* Where the words came from, when they are not the author's own. */
  if (data.origin !== undefined) article.origin = data.origin;

  /*
   * `create_at`, WRITABLE - which looks wrong and is the point.
   *
   * The vendor's daily limit counts a member's rows by this column
   * (findTodayArticleByUserId), and a draft is a row that exists without
   * having been posted. So a draft written last week and SUBMITTED today is
   * stamped today: the day a post counts against is the day it was sent to
   * be read, and this is the column that has to say so for the count to be
   * true. See the member write path in services/blog.service.js.
   */
  if (data.created_at !== undefined) article.create_at = data.created_at;

  if (data.content !== undefined) {
    lob.content = data.content;

    /*
     * `cleaned_content` is the body with its markup taken out, and the vendor
     * keeps it because its search reads that column rather than the CLOB.
     * Writing the body without it would make a Crystal-authored article
     * invisible to the vendor's own search - a silent one-way break, so it is
     * derived on every write.
     */
    article.cleaned_content = String(data.content).replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  if (data.view_count !== undefined) info.visited_num = data.view_count;

  return { article: article, info: info, lob: lob };
}

/* ------------------------------------------------------------------ */
/*  reads - the console                                                */
/* ------------------------------------------------------------------ */

const LIST_COLUMNS = ['a.id', 'a.title', 'a.summary', 'a.image_url', 'a.user_userid',
  'a.subject_id', 'a.state', 'a.publish_at', 'a.create_at', 'a.modify_at',
  'i.visited_num', 'i.gold_recom_num'];

function applyFilters(qb, filters) {
  if (filters.category) qb.where('a.subject_id', codes.topicToSubject(filters.category));
  if (filters.status) qb.where('a.state', codes.articleStatusToState(filters.status));
  if (filters.is_featured !== undefined && filters.is_featured !== '') {
    const on = filters.is_featured === true || filters.is_featured === '1';
    if (on) qb.where('i.gold_recom_num', '>', 0);
    else qb.where(function () { this.where('i.gold_recom_num', 0).orWhereNull('i.gold_recom_num'); });
  }

  /*
   * ARTICLES, AND REPLIES ONLY WHEN THEY ARE ASKED FOR. `parent` is 0 for an
   * article and the parent's id for a reply to one. The console manages
   * articles, and a reply reaches a reader through its thread (see THE THREAD
   * MODEL above) rather than as a row of its own in a list of articles - so
   * articles are still what this answers unless the caller says otherwise.
   *
   * IT HAD TO BECOME ASKABLE. Members write replies from the storefront now
   * and a reply waits for approval exactly as an article does; with `parent =
   * 0` welded on, the console was the only place that approval can happen and
   * the one thing it could not see. `kind` is 'ARTICLE' (the default),
   * 'REPLY', or 'ALL' for the queue that wants both.
   */
  if (filters.kind === 'REPLY') qb.whereNot('a.parent', 0);
  else if (filters.kind !== 'ALL') qb.where('a.parent', 0);

  return qb;
}

/**
 * The deleted/live split, which is a state here rather than a flag.
 *
 * `deleted` true means "in the bin", which is Crystal's ARCHIVED and the
 * vendor's three refusal states - so it is a set, not a value.
 */
function applyScope(qb, deleted) {
  const archived = [codes.ARTICLE_STATE.PUB_ADMIN_DENY, codes.ARTICLE_STATE.PUB_DENY,
    codes.ARTICLE_STATE.PUB_CANCEL];

  return deleted ? qb.whereIn('a.state', archived) : qb.whereNotIn('a.state', archived);
}

function applySearch(qb, word) {
  if (!word) return qb;
  const like = '%' + String(word).toLowerCase().trim() + '%';

  return qb.where(function () {
    this.where(legacy.connection().raw('LOWER(a.title)'), 'like', like)
      .orWhere(legacy.connection().raw('LOWER(a.summary)'), 'like', like)
      .orWhere(legacy.connection().raw('LOWER(a.user_userid)'), 'like', like);
  });
}

const SORTS = {
  id: 'a.id',
  title: 'a.title',
  category: 'a.subject_id',
  status: 'a.state',
  published_at: 'a.publish_at',
  view_count: 'i.visited_num',
  created_at: 'a.create_at'
};

async function search(filters, paging) {
  const qb = applySearch(applyFilters(applyScope(base(), filters.deleted), filters), filters.q);

  const countRow = await qb.clone().clearSelect().clearOrder().count({ c: '*' }).first();

  /*
   * THE THREAD A ROW BELONGS TO comes with it, and decodeMine is what shapes
   * it - the same shape the member's own list already answers in.
   *
   * The console can ask for replies now (see applyFilters), and a reply's own
   * title is "Re:" and somebody else's headline: without the thread on the
   * row, a queue of replies waiting for approval is a list of near-identical
   * lines. The join is on the parent's primary key and is left OFF the count,
   * which does not need it.
   */
  const rows = await qb.clone()
    .leftJoin(legacy.blog(ARTICLES) + ' as p', 'p.id', 'a.parent')
    .select(LIST_COLUMNS.concat(['a.parent', 'p.title as thread_title', 'p.state as thread_state',
      'p.parent as thread_parent']))
    .orderBy(SORTS[paging.sort] || SORTS.created_at, paging.dir || 'desc')
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows.map(decodeMine), total: Number(countRow.c) };
}

/** One article WITH its body - the only read that touches the lob table. */
async function findById(id, deleted) {
  const row = await applyScope(base(), deleted)
    .leftJoin(legacy.blog(LOBS) + ' as l', 'l.id', 'a.id')
    .where('a.id', id)
    .first(LIST_COLUMNS.concat(['l.content']));

  return decode(row);
}

/**
 * ONE MEMBER'S OWN WRITING - articles AND replies, drafts included.
 *
 * Keyed on `user_userid` - the login, not a number - because that is what this
 * schema records an author by. The member's login is the same string sign-in
 * checks against ora_pid.users, which is why it can be trusted here.
 *
 * Unlike the public list this does NOT hide drafts or refusals: it is the
 * author's own view, and an article they submitted and had refused is exactly
 * the thing they came here to find. `status` filters it when they want one.
 *
 * REPLIES ARE IN IT, AS REPLIES. This read `parent = 0` and so a member who
 * had only ever answered other people's questions was told they had written
 * nothing. A reply comes back with the thread it belongs to - title, slug, and
 * whether that thread is public - so the page can say "a reply in X" and link
 * to it, rather than listing it as an article with somebody else's subject.
 * `kind` narrows to one or the other.
 */
async function mine(login, filters, paging) {
  const qb = base()
    .leftJoin(legacy.blog(ARTICLES) + ' as p', 'p.id', 'a.parent')
    .where('a.user_userid', login);

  if (filters.status) qb.where('a.state', codes.articleStatusToState(filters.status));
  if (filters.kind === 'ARTICLE') qb.where('a.parent', 0);
  if (filters.kind === 'REPLY') qb.whereNot('a.parent', 0);

  const countRow = await qb.clone().clearSelect().clearOrder().count({ c: '*' }).first();

  const rows = await qb.clone()
    .select(LIST_COLUMNS.concat(['a.parent', 'a.reason', 'p.title as thread_title',
      'p.state as thread_state', 'p.parent as thread_parent']))
    .orderBy('a.modify_at', 'desc')
    .orderBy('a.id', 'desc')
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows.map(decodeMine), total: Number(countRow.c) };
}

/** A member's row, with where it sits: its own article, or a reply in somebody's thread. */
function decodeMine(row) {
  const out = decode(row);
  const parent = Number(row.parent || 0);

  out.kind = parent ? 'REPLY' : 'ARTICLE';
  out.parent_id = parent || null;

  /*
   * A parent that no longer exists is still a reply - the row says so - but
   * there is nowhere to send the reader, so it has no slug and is not public.
   */
  const found = parent && row.thread_state !== null && row.thread_state !== undefined;

  out.thread = parent ? {
    id: parent,
    title: found ? (row.thread_title || null) : null,
    slug: found ? slugOf({ id: parent, title: row.thread_title }) : null,
    is_public: !!found && Number(row.thread_state) === PUBLIC && Number(row.thread_parent || 0) === 0
  } : null;

  out.is_public = Number(row.state) === PUBLIC && (!parent || out.thread.is_public);

  /*
   * WHY IT WAS REFUSED, and only when it was.
   *
   * `reason` is the note whoever refused the post left on the row. It is
   * carried on every state in the column and means nothing on most of them -
   * the vendor's own add and edit write an empty string into it - so it is
   * answered for a refusal alone. A member looking at "Not published" with no
   * reason beside it has no idea whether to rewrite it or give up.
   */
  out.reason = out.status === 'ARCHIVED' && row.reason ? String(row.reason).trim() || null : null;

  return out;
}

/** The bare row, for the write paths to check before they write. */
async function findRow(id, trx) {
  const row = await conn(trx)(legacy.blog(ARTICLES) + ' as a')
    .leftJoin(legacy.blog(INFOS) + ' as i', 'i.id', 'a.id')
    .where('a.id', id)
    .first(LIST_COLUMNS);

  return decode(row);
}

/**
 * Is this slug taken?
 *
 * It cannot be. The slug ends in the article's own id, so two articles cannot
 * collide however they are titled - which is the second reason to derive it
 * rather than store it. The function stays because the service checks
 * uniqueness before every save, and answering honestly is cheaper than
 * unpicking that.
 */
function findBySlug() {
  return Promise.resolve(null);
}

/* ------------------------------------------------------------------ */
/*  reads - the reader                                                 */
/* ------------------------------------------------------------------ */

const PUBLIC_COLUMNS = LIST_COLUMNS.concat([
  'a.parent', 'i.is_help_request', 'i.help_status', 'i.silber_recom_num', 'i.recommended_num',
  's.id as subject_ref', 's.name as subject_name',
  'ps.id as subject_parent_ref', 'ps.name as subject_parent_name'
]);

const REPLY_COLUMNS = ['r.id', 'r.parent', 'r.user_userid', 'r.state', 'r.publish_at',
  'r.create_at', 'r.modify_at', 'i.visited_num', 'i.is_help_request', 'i.help_status',
  'i.gold_recom_num', 'i.silber_recom_num', 'i.recommended_num', 'l.content', 'l.approval_num'];

/**
 * Published articles, each with the shelf it is on.
 *
 * The subject is joined twice - its own row and its parent's - because a
 * reader's breadcrumb is "Product > Computer", and asking for the parent's
 * name afterwards would be a query per row.
 */
function publicBase(filters) {
  const qb = conn()(legacy.blog(ARTICLES) + ' as a')
    .leftJoin(legacy.blog(INFOS) + ' as i', 'i.id', 'a.id')
    .leftJoin(legacy.blog(SUBJECTS) + ' as s', 's.id', 'a.subject_id')
    .leftJoin(legacy.blog(SUBJECTS) + ' as ps', 'ps.id', 's.parent')
    .where('a.state', PUBLIC)
    .where('a.parent', 0);

  const opts = filters || {};

  if (opts.category) qb.where('a.subject_id', codes.topicToSubject(opts.category));

  if (opts.is_featured !== undefined && opts.is_featured !== '') {
    const on = opts.is_featured === true || opts.is_featured === '1';
    if (on) qb.where('i.gold_recom_num', '>', 0);
    else qb.where(function () { this.where('i.gold_recom_num', 0).orWhereNull('i.gold_recom_num'); });
  }

  /* A shelf and every shelf under it - the service works out which ids those are. */
  if (opts.subject_ids && opts.subject_ids.length) qb.whereIn('a.subject_id', opts.subject_ids);

  /*
   * The vendor's reader search is the title or the author; the standfirst is
   * searched too, because the standfirst is where an article says what it is
   * about and a title often does not.
   */
  applySearch(qb, opts.q);

  return qb;
}

/**
 * Published replies per thread, as a table to join - used only to ORDER by
 * reply count, which is the one thing that needs the number inside the query.
 */
function replyStats() {
  return conn()(legacy.blog(ARTICLES))
    .where('state', PUBLIC)
    .whereNot('parent', 0)
    .groupBy('parent')
    .select('parent')
    .count({ reply_cnt: '*' })
    .as('r');
}

/**
 * The reader's four orders - the vendor's four, by name rather than by column.
 *
 *   latest       publish_at, newest first (the vendor's default)
 *   replies      most published replies first
 *   views        most read first
 *   recommended  gold minus the third grade, then newest - the vendor's
 *                `thumb_count`, transcribed as it is
 *
 * `id` breaks every tie, so a page boundary cannot fall between two rows that
 * sort equal and show one of them twice.
 */
const PUBLIC_SORTS = ['latest', 'replies', 'views', 'recommended'];

function applyPublicSort(qb, sort) {
  if (sort === 'replies') {
    qb.leftJoin(replyStats(), 'r.parent', 'a.id')
      .orderByRaw('COALESCE(r.reply_cnt, 0) DESC')
      .orderBy('a.publish_at', 'desc');
  } else if (sort === 'views') {
    qb.orderByRaw('COALESCE(i.visited_num, 0) DESC').orderBy('a.publish_at', 'desc');
  } else if (sort === 'recommended') {
    qb.orderByRaw('COALESCE(i.gold_recom_num, 0) - COALESCE(i.recommended_num, 0) DESC')
      .orderBy('a.create_at', 'desc');
  } else {
    qb.orderBy('a.publish_at', 'desc');
  }

  return qb.orderBy('a.id', 'desc');
}

/**
 * WHAT HAPPENED LAST IN EACH THREAD, for a page of articles at once.
 *
 * One row per thread: its top reply in the vendor's order (see THE THREAD
 * MODEL), how many published replies it has, and how many of those are the
 * accepted answer. Window functions rather than a query per article, and
 * rather than fetching every reply of twenty threads to keep one each - a
 * popular thread has hundreds. Both drivers have had ROW_NUMBER() OVER for
 * longer than either has had this schema.
 */
async function threadTails(ids) {
  const out = {};
  if (!ids.length) return out;

  const raw = function (sql, bindings) { return legacy.connection().raw(sql, bindings || []); };

  const inner = conn()(legacy.blog(ARTICLES) + ' as t')
    .leftJoin(legacy.blog(INFOS) + ' as ti', 'ti.id', 't.id')
    .whereIn('t.parent', ids)
    .where('t.state', PUBLIC)
    .select('t.id', 't.parent', 't.user_userid', 't.publish_at', 't.create_at')
    .select(raw('ROW_NUMBER() OVER (PARTITION BY t.parent ORDER BY t.modify_at DESC, t.id DESC) AS rn'))
    .select(raw('COUNT(*) OVER (PARTITION BY t.parent) AS reply_cnt'))
    .select(raw(
      'SUM(CASE WHEN ti.help_status = ? AND COALESCE(ti.is_help_request, 0) = 0 THEN 1 ELSE 0 END) '
        + 'OVER (PARTITION BY t.parent) AS accepted_cnt',
      [codes.HELP_CORRECT_CHECK]
    ))
    .as('tail');

  const rows = await conn().select('*').from(inner).where('tail.rn', 1);

  rows.forEach(function (row) { out[Number(row.parent)] = row; });
  return out;
}

async function withTails(rows) {
  const tails = await threadTails(rows.map(function (row) { return Number(row.id); }));
  return rows.map(function (row) { return decodePublic(row, tails[Number(row.id)]); });
}

/**
 * A page of published articles, as a reader sees them.
 *
 * `filters`: category, is_featured, subject_ids, q, sort, limit, offset.
 */
async function published(filters) {
  const opts = filters || {};
  const qb = publicBase(opts).select(PUBLIC_COLUMNS);

  applyPublicSort(qb, opts.sort);

  const rows = await qb.limit(opts.limit || 12).offset(opts.offset || 0);
  return withTails(rows);
}

function countPublished(filters) {
  return publicBase(filters).clearSelect().count({ c: '*' }).first();
}

/** One published article with its body, its origin and its thread's tail. */
async function findPublishedBySlug(slug) {
  const id = idFromSlug(slug);
  if (!id) return null;

  const row = await publicBase({})
    .leftJoin(legacy.blog(LOBS) + ' as l', 'l.id', 'a.id')
    .where('a.id', id)
    .first(PUBLIC_COLUMNS.concat(['l.content', 'l.approval_num', 'a.origin']));

  if (!row) return null;

  const decoded = (await withTails([row]))[0];
  decoded.origin = originOf(row.origin);
  decoded.approval_num = Number(row.approval_num || 0);

  return decoded;
}

/** Just enough of a published article to hang its replies off. */
async function findPublishedThread(id) {
  if (!id) return null;

  const row = await conn()(legacy.blog(ARTICLES) + ' as a')
    .leftJoin(legacy.blog(INFOS) + ' as i', 'i.id', 'a.id')
    .where('a.id', id)
    .where('a.state', PUBLIC)
    .where('a.parent', 0)
    .first('a.id', 'a.title', 'i.is_help_request');

  if (!row) return null;

  return {
    id: Number(row.id),
    title: row.title,
    slug: slugOf({ id: Number(row.id), title: row.title }),
    is_help_request: Number(row.is_help_request) === 1
  };
}

function replyBase() {
  return conn()(legacy.blog(ARTICLES) + ' as r')
    .leftJoin(legacy.blog(INFOS) + ' as i', 'i.id', 'r.id')
    .leftJoin(legacy.blog(LOBS) + ' as l', 'l.id', 'r.id')
    .where('r.state', PUBLIC);
}

/** The vendor's order, with the tie broken - see THE THREAD MODEL. */
function replyOrder(qb) {
  return qb.orderBy('r.modify_at', 'desc').orderBy('r.id', 'desc');
}

/**
 * A page of one thread's published replies, bodies included.
 *
 * The bodies come with the page rather than one click at a time. The vendor
 * shows two lines of summary and fetches a body when a reply is tapped; on a
 * phone that is a request per reply to read a conversation, and a reader
 * scrolling a thread is reading all of it. A page is ten replies, which is
 * what bounds the payload - not leaving the bodies out.
 */
async function publishedReplies(threadId, inQuestion, paging) {
  const qb = replyBase().where('r.parent', threadId);

  const countRow = await qb.clone().clearSelect().count({ c: '*' }).first();

  const rows = await replyOrder(qb.clone().select(REPLY_COLUMNS))
    .limit(paging.limit).offset(paging.offset);

  return {
    rows: rows.map(function (row) { return decodeReply(row, inQuestion); }),
    total: Number(countRow.c)
  };
}

/**
 * The accepted answer to a question - normally one, never more than three.
 *
 * Fetched apart from the pages because it is shown ABOVE the thread, and a
 * reader should not have to page to reply 40 to find out whether the question
 * they searched for was answered.
 */
async function acceptedAnswers(threadId) {
  const rows = await replyOrder(
    replyBase()
      .where('r.parent', threadId)
      .where('i.help_status', codes.HELP_CORRECT_CHECK)
      .where(function () { this.where('i.is_help_request', 0).orWhereNull('i.is_help_request'); })
      .select(REPLY_COLUMNS)
  ).limit(3);

  return rows.map(function (row) { return decodeReply(row, true); });
}

/**
 * One published reply, and the published thread it belongs to.
 *
 * Both halves have to be public: a reply approved into a thread that was
 * later withdrawn is not somewhere a link can take a reader.
 */
async function findPublishedReply(id) {
  if (!id) return null;

  const row = await replyBase()
    .join(legacy.blog(ARTICLES) + ' as p', 'p.id', 'r.parent')
    .leftJoin(legacy.blog(INFOS) + ' as pi', 'pi.id', 'p.id')
    .where('r.id', id)
    .whereNot('r.parent', 0)
    .where('p.state', PUBLIC)
    .where('p.parent', 0)
    .first(REPLY_COLUMNS.concat(['p.title as thread_title', 'pi.is_help_request as thread_help']));

  if (!row) return null;

  const question = Number(row.thread_help) === 1;
  const threadId = Number(row.parent);

  return {
    reply: decodeReply(row, question),
    thread: {
      id: threadId,
      title: row.thread_title,
      slug: slugOf({ id: threadId, title: row.thread_title }),
      is_help_request: question
    }
  };
}

/**
 * WHERE A REPLY SITS in its thread's order: how many published replies come
 * before it.
 *
 * Asked of the database as a self-join rather than by handing the reply's
 * modify_at back as a parameter. That timestamp has no zone in either
 * schema, and a Date that went out through the driver and came back in as a
 * binding is reinterpreted in whichever zone the process and the session
 * happen to disagree about - which moves a reply by eight hours and onto
 * the wrong page. Compared column to column, it cannot move.
 */
async function replyPosition(id) {
  const row = await conn()(legacy.blog(ARTICLES) + ' as o')
    .join(legacy.blog(ARTICLES) + ' as t', 't.parent', 'o.parent')
    .where('t.id', id)
    .where('o.state', PUBLIC)
    .where(function () {
      this.whereRaw('o.modify_at > t.modify_at')
        .orWhere(function () {
          this.whereRaw('o.modify_at = t.modify_at').whereRaw('o.id > t.id');
        });
    })
    .count({ c: '*' })
    .first();

  return Number(row.c);
}

/**
 * Every shelf, with how many published articles are filed DIRECTLY on it.
 *
 * Flat; the service builds the tree and adds the children's counts up. See
 * THE THREAD MODEL for why `state` is read but not used to hide anything.
 */
async function subjects() {
  const results = await Promise.all([
    conn()(legacy.blog(SUBJECTS)).select('id', 'name', 'parent', 'order_no'),
    conn()(legacy.blog(ARTICLES))
      .where('state', PUBLIC)
      .where('parent', 0)
      .groupBy('subject_id')
      .select('subject_id')
      .count({ c: '*' })
  ]);

  const counts = {};
  results[1].forEach(function (row) { counts[String(Number(row.subject_id))] = Number(row.c); });

  return results[0].map(function (row) {
    return {
      id: Number(row.id),
      name: row.name || null,
      parent_id: Number(row.parent || 0) || null,
      order: Number(row.order_no || 0),
      article_cnt: counts[String(Number(row.id))] || 0
    };
  });
}

/**
 * The shelves that have something published on them.
 *
 * Grouped by the legacy subject and translated after, rather than translated
 * and grouped - two subjects can map to the same Crystal topic, and adding
 * their counts in JS is the only place that can be got right.
 */
async function publishedCategories() {
  const rows = await conn()(legacy.blog(ARTICLES))
    .where('state', PUBLIC)
    .where('parent', 0)
    .groupBy('subject_id')
    .select('subject_id')
    .count({ c: '*' });

  const totals = {};
  rows.forEach(function (row) {
    const topic = codes.topicFromSubject(row.subject_id);
    totals[topic] = (totals[topic] || 0) + Number(row.c);
  });

  return Object.keys(totals).sort().map(function (topic) {
    return { category: topic, article_cnt: totals[topic] };
  });
}

/**
 * One more visit.
 *
 * The counter is in the info table, and an article can be missing its info
 * row - the vendor's own console creates one only when it first needs it. So
 * this updates and, if it changed nothing, inserts. An UPSERT would be one
 * statement and is not portable between the two drivers.
 *
 * WHETHER a visit counts is the service's decision (one per visitor per row
 * per day, as the vendor counts); this only moves the number.
 */
async function countView(id) {
  const changed = await conn()(legacy.blog(INFOS)).where('id', id).increment('visited_num', 1);
  if (changed) return changed;

  return conn()(legacy.blog(INFOS)).insert({ id: id, visited_num: 1 });
}

/* ------------------------------------------------------------------ */
/*  the member's own posts - reads the write paths make first          */
/* ------------------------------------------------------------------ */

/**
 * ONE ROW AS ITS AUTHOR NEEDS IT - where it sits in a thread, which shelf it
 * is filed on, and (asked for) the body to put back in the form.
 *
 * findRow() above answers what the console's write paths check, and it has
 * neither `parent` nor `subject_id` on it: an edit from the member centre has
 * to know whether it is holding an article or a reply, and a reply takes its
 * shelf and its type from the thread it belongs to. The body is behind a flag
 * because two of the three callers - the ownership check before an edit, and
 * the parent check before a reply - would be reading a CLOB they never look
 * at.
 */
async function findPost(id, withBody) {
  const number = Number(id);
  if (!isFinite(number) || number <= 0) return null;

  const qb = conn()(legacy.blog(ARTICLES) + ' as a').where('a.id', number);
  const columns = LIST_COLUMNS.concat(['a.parent', 'a.type', 'a.origin', 'a.reason']);

  if (withBody) qb.leftJoin(legacy.blog(LOBS) + ' as l', 'l.id', 'a.id');
  /* i.* is in LIST_COLUMNS; a post with no info row still has to answer. */
  qb.leftJoin(legacy.blog(INFOS) + ' as i', 'i.id', 'a.id');

  const row = await qb.first(withBody ? columns.concat(['l.content']) : columns);
  if (!row) return null;

  const out = decode(row);
  const parent = Number(row.parent || 0);

  out.kind = parent ? 'REPLY' : 'ARTICLE';
  out.parent_id = parent || null;
  out.subject_id = row.subject_id === null || row.subject_id === undefined ? null : Number(row.subject_id);
  out.type = row.type === null || row.type === undefined ? null : Number(row.type);
  out.origin = originOf(row.origin);
  out.reason = row.reason ? String(row.reason).trim() || null : null;

  return out;
}

/**
 * WHAT THIS MEMBER HAS POSTED TODAY, an article and a reply counted apart.
 *
 * The vendor's findTodayArticleByUserId, which is two grouped counts UNIONed
 * and summed into one row, and which its website controller then reads off
 * the ARRAY that comes back - so `todayArticle.main_cnt` is undefined there
 * and its daily limit has never once fired on the website. Counting the rows
 * here instead of asking the database to add them up is not laziness: a
 * member posts a handful of rows a day, the two drivers disagree about what
 * a COUNT comes back as (a number, a string, a BigInt), and this way the
 * answer is a number on both.
 *
 * DRAFTS ARE NOT COUNTED. The vendor counts every row a member created today
 * whatever state it is in, and skips the check when a draft is being saved -
 * so saving one draft in the morning silently used up the day. What is
 * counted here is what was SUBMITTED, which is what the limit is about; see
 * the member write path in services/blog.service.js for the rest of the rule.
 *
 * `from` and `to` are the day's bounds, decided by the service, because "the
 * server's day" is the same decision the visit counter already makes.
 */
async function countToday(login, from, to) {
  const rows = await conn()(legacy.blog(ARTICLES))
    .where('user_userid', login)
    .whereNot('state', codes.ARTICLE_STATE.PUB_TEMP)
    .where('create_at', '>=', from)
    .where('create_at', '<', to)
    .select('parent');

  return {
    article: rows.filter(function (row) { return Number(row.parent || 0) === 0; }).length,
    reply: rows.filter(function (row) { return Number(row.parent || 0) !== 0; }).length
  };
}

/** Is that a shelf? A member picks one from the vendor's own tree, so it is checked against it. */
async function subjectExists(id) {
  const row = await conn()(legacy.blog(SUBJECTS)).where('id', Number(id)).first('id');
  return !!row;
}

/* ------------------------------------------------------------------ */
/*  writes                                                             */
/* ------------------------------------------------------------------ */

/**
 * A new article, across all three tables.
 *
 * The info and lob rows are written even when they are empty, because every
 * read left-joins them and a later UPDATE has to have something to update.
 */
async function insert(data, trx) {
  const parts = encode(data);
  const now = new Date();

  /*
   * THE ID IS ASKED FOR, not returned.
   *
   * blog_article has no identity column, no default and no insert trigger -
   * the vendor's own code allocates from blog_article_s and inserts the value.
   * So `returning('id')` would hand back the null that was just refused, and
   * this is one of the two places the driver difference is unavoidable; see
   * config/legacy.js.
   */
  const id = await legacy.nextValue(legacy.blog('blog_article_s'));

  const article = Object.assign(
    { id: id, parent: 0, type: 2, create_at: now, modify_at: now },
    parts.article
  );
  await conn(trx)(legacy.blog(ARTICLES)).insert(article);

  await conn(trx)(legacy.blog(INFOS)).insert(Object.assign({ id: id, visited_num: 0 }, parts.info));
  await conn(trx)(legacy.blog(LOBS)).insert(Object.assign({ id: id }, parts.lob));

  return [await findRow(id, trx)];
}

async function update(id, data, trx) {
  const parts = encode(data);
  const now = new Date();

  if (Object.keys(parts.article).length) {
    await conn(trx)(legacy.blog(ARTICLES)).where('id', id)
      .update(Object.assign({ modify_at: now }, parts.article));
  }

  if (Object.keys(parts.info).length) {
    await conn(trx)(legacy.blog(INFOS)).where('id', id).update(parts.info);
  }

  if (Object.keys(parts.lob).length) {
    const changed = await conn(trx)(legacy.blog(LOBS)).where('id', id).update(parts.lob);
    if (!changed) {
      await conn(trx)(legacy.blog(LOBS)).insert(Object.assign({ id: id }, parts.lob));
    }
  }

  return [await findRow(id, trx)];
}

/** The bin, which in this schema is a state. */
function softDelete(id, trx) {
  return conn(trx)(legacy.blog(ARTICLES)).where('id', id)
    .update({ state: codes.ARTICLE_STATE.PUB_CANCEL, modify_at: new Date() });
}

async function restore(id, trx) {
  await conn(trx)(legacy.blog(ARTICLES)).where('id', id)
    .update({ state: codes.ARTICLE_STATE.PUB_TEMP, modify_at: new Date() });

  return [await findRow(id, trx)];
}

/**
 * Gone for good.
 *
 * The children go first: the stand-in schema declares ON DELETE CASCADE and
 * the vendor's Oracle does not, so relying on it would work in development
 * and leave orphaned bodies in production.
 */
async function purge(id, trx) {
  /* The readers' thumbs are children too - the ledger in thumbs.repository. */
  await thumbs.purgeFor(id, trx);
  await conn(trx)(legacy.blog(LOBS)).where('id', id).del();
  await conn(trx)(legacy.blog(INFOS)).where('id', id).del();
  return conn(trx)(legacy.blog(ARTICLES)).where('id', id).del();
}

function idOf(returned) {
  const first = Array.isArray(returned) ? returned[0] : returned;
  if (first === null || first === undefined) return null;
  if (typeof first === 'object') {
    const key = Object.keys(first)[0];
    return Number(first[key]);
  }
  return Number(first);
}

function transaction(handler) {
  return legacy.connection().transaction(handler);
}

module.exports = {
  TABLE: 'ora_blog.' + ARTICLES,
  PK: 'id',
  PUBLIC_SORTS: PUBLIC_SORTS,

  slugOf: slugOf,
  idFromSlug: idFromSlug,
  plain: plain,
  plainLines: plainLines,

  search: search,
  findById: findById,
  mine: mine,
  findRow: findRow,
  findPost: findPost,
  countToday: countToday,
  subjectExists: subjectExists,
  findBySlug: findBySlug,

  published: published,
  countPublished: countPublished,
  findPublishedBySlug: findPublishedBySlug,
  findPublishedThread: findPublishedThread,
  publishedReplies: publishedReplies,
  acceptedAnswers: acceptedAnswers,
  findPublishedReply: findPublishedReply,
  replyPosition: replyPosition,
  subjects: subjects,
  publishedCategories: publishedCategories,
  countView: countView,

  insert: insert,
  update: update,
  softDelete: softDelete,
  restore: restore,
  purge: purge,
  transaction: transaction
};
