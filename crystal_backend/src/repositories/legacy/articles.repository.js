const legacy = require('../../config/legacy');
const codes = require('./codes');

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
 */

const ARTICLES = 'blog_article';
const INFOS = 'blog_article_info';
const LOBS = 'blog_article_lob';

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
/*  reads                                                              */
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
   * ARTICLES ONLY, never replies. `parent` is 0 for an article and the
   * parent's id for a reply to one; the legacy blog is a forum as well as a
   * publication, and Crystal publishes only the top level of it.
   */
  qb.where('a.parent', 0);
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

  const rows = await qb.clone()
    .select(LIST_COLUMNS)
    .orderBy(SORTS[paging.sort] || SORTS.created_at, paging.dir || 'desc')
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows.map(decode), total: Number(countRow.c) };
}

/** One article WITH its body - the only read that touches the lob table. */
async function findById(id, deleted) {
  const row = await applyScope(base(), deleted)
    .leftJoin(legacy.blog(LOBS) + ' as l', 'l.id', 'a.id')
    .where('a.id', id)
    .first(LIST_COLUMNS.concat(['l.content']));

  return decode(row);
}

/** The bare row, for the write paths to check before they write. */
/**
 * ONE MEMBER'S OWN ARTICLES, drafts included.
 *
 * Keyed on `user_userid` - the login, not a number - because that is what this
 * schema records an author by. The member's login is the same string sign-in
 * checks against ora_pid.users, which is why it can be trusted here.
 *
 * Unlike the public list this does NOT hide drafts or refusals: it is the
 * author's own view, and an article they submitted and had refused is exactly
 * the thing they came here to find. `status` filters it when they want one.
 */
async function mine(login, filters, paging) {
  const qb = base()
    .where('a.user_userid', login)
    .where('a.parent', 0);

  if (filters.status) qb.where('a.state', codes.articleStatusToState(filters.status));

  const countRow = await qb.clone().clearSelect().clearOrder().count({ c: '*' }).first();

  const rows = await qb.clone()
    .select(LIST_COLUMNS)
    .orderBy('a.modify_at', 'desc')
    .limit(paging.limit).offset(paging.offset);

  return { rows: rows.map(decode), total: Number(countRow.c) };
}

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

function published(filters) {
  const qb = applyFilters(
    base().where('a.state', codes.ARTICLE_STATE.PUB_APPROVED),
    filters
  );

  return qb.orderBy('a.publish_at', 'desc')
    .limit(filters.limit || 12).offset(filters.offset || 0)
    .select(LIST_COLUMNS)
    .then(function (rows) { return rows.map(decode); });
}

function countPublished(filters) {
  return applyFilters(base().where('a.state', codes.ARTICLE_STATE.PUB_APPROVED), filters)
    .clearSelect().count({ c: '*' }).first();
}

async function findPublishedBySlug(slug) {
  const id = idFromSlug(slug);
  if (!id) return null;

  const row = await base()
    .leftJoin(legacy.blog(LOBS) + ' as l', 'l.id', 'a.id')
    .where('a.id', id)
    .where('a.state', codes.ARTICLE_STATE.PUB_APPROVED)
    .where('a.parent', 0)
    .first(LIST_COLUMNS.concat(['l.content']));

  return decode(row);
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
    .where('state', codes.ARTICLE_STATE.PUB_APPROVED)
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
 */
async function countView(id) {
  const changed = await conn()(legacy.blog(INFOS)).where('id', id).increment('visited_num', 1);
  if (changed) return changed;

  return conn()(legacy.blog(INFOS)).insert({ id: id, visited_num: 1 });
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

  slugOf: slugOf,
  idFromSlug: idFromSlug,

  search: search,
  findById: findById,
  mine: mine,
  findRow: findRow,
  findBySlug: findBySlug,
  published: published,
  countPublished: countPublished,
  findPublishedBySlug: findPublishedBySlug,
  publishedCategories: publishedCategories,
  countView: countView,
  insert: insert,
  update: update,
  softDelete: softDelete,
  restore: restore,
  purge: purge,
  transaction: transaction
};
