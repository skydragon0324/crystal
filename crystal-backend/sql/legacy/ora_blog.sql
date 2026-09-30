-- =====================================================================
-- ora_blog - THE VENDOR'S LEGACY BLOG, as a development stand-in.
--
-- Three tables, one article split across them, and the split is the whole
-- reason the schema looks like this (plus blog_subject, the shelves they are
-- filed on):
--
--   blog_article       the row itself - who wrote it, what it is called,
--                      what state it is in. Read by every list.
--   blog_article_info  the counters - visits, replies, recommendations.
--                      Written far more often than the article is.
--   blog_article_lob   the BODY, which in Oracle is a CLOB. Kept out of the
--                      article table so that listing twenty of them does not
--                      drag twenty article bodies across the network.
--
-- All three share one primary key: the article id. A list joins the first
-- two; a detail read joins all three. That is what repositories/legacy/
-- does, and it is what vendor_backend/models/blogModel.js does.
--
-- Like sql/legacy/ora_pid.sql this is a TRANSCRIPTION, not a design. The
-- columns and types are the ones the vendor's Oracle instance has and the
-- ones vendor_backend queries; Crystal must not add to them. Anything Crystal
-- wants that is not here has to be derived at read time - which is why an
-- article's slug is computed from its title and id rather than stored.
--
--   npm run legacy:install     creates it, then seeds it
--
-- Re-runnable: everything is IF NOT EXISTS.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS ora_blog;

CREATE SEQUENCE IF NOT EXISTS ora_blog.blog_article_s START WITH 1 INCREMENT BY 1;


/*
 * THE SHELVES. A tree two levels deep - `parent` is 0 at the top - that every
 * article's subject_id points into, and that the storefront's index navigates
 * by. Transcribed from the vendor's own development DDL
 * (vendor_backend/sql_pg/91_mock_satellite_schemas.sql), column for column.
 *
 * `state` is carried and not relied on: the vendor's model reads 0 as live,
 * its own seed writes 1 on every row, and its reader never looks. See THE
 * THREAD MODEL in repositories/legacy/articles.repository.js.
 */
CREATE TABLE IF NOT EXISTS ora_blog.blog_subject (
    id          bigint        PRIMARY KEY,
    name        varchar(255)  NULL,
    parent      bigint        DEFAULT 0,
    order_no    integer       DEFAULT 0,
    state       smallint      DEFAULT 1,
    created_at  timestamp     DEFAULT CURRENT_TIMESTAMP,
    updated_at  timestamp     DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS ora_blog.blog_article (
    id              bigint        PRIMARY KEY DEFAULT nextval('ora_blog.blog_article_s'),

    /*
     * THE AUTHOR IS A LOGIN NAME, not a number - this schema predates the
     * user table Crystal joins to, and the vendor's own code resolves it by
     * joining ora_old_db.customers on the same string. Crystal shows it as
     * the byline and does not try to resolve it, because the customer
     * database is a third instance that is not part of this integration.
     */
    user_userid     varchar(50)   NULL,

    /* The shelf. Mapped onto Crystal's article_topic by ordinal; see codes.js. */
    subject_id      bigint        NULL,

    /* 0 for an article, or the id of the article this one replies to. */
    parent          bigint        DEFAULT 0,

    title           varchar(512)  NULL,

    /* Carries HTML. The vendor strips tags with REGEXP_REPLACE on read. */
    summary         varchar(4000) NULL,
    hash_summary    varchar(64)   NULL,
    cleaned_content text          NULL,

    image_url       varchar(512)  NULL,

    /* ARTICLE_STATES: -2 temp/draft, 0 requested, 4 approved/published ... */
    state           smallint      DEFAULT 1,

    /* OLD_BLOG_ARTICLE_TYPES: 1 bbs, 2 blog. */
    type            smallint      DEFAULT 0,

    reason          varchar(512)  NULL,
    origin          varchar(255)  NULL,
    publish_num     integer       DEFAULT 0,
    publish_org     varchar(255)  NULL,

    create_at       timestamp(0)  DEFAULT CURRENT_TIMESTAMP,
    modify_at       timestamp(0)  DEFAULT CURRENT_TIMESTAMP,
    publish_at      timestamp(0)  NULL,
    notice_at       timestamp(0)  NULL
);

CREATE INDEX IF NOT EXISTS ix_blog_article_userid ON ora_blog.blog_article (user_userid);
CREATE INDEX IF NOT EXISTS ix_blog_article_parent ON ora_blog.blog_article (parent);
CREATE INDEX IF NOT EXISTS ix_blog_article_state  ON ora_blog.blog_article (state, publish_at DESC);


CREATE TABLE IF NOT EXISTS ora_blog.blog_article_info (
    id               bigint   PRIMARY KEY
                              REFERENCES ora_blog.blog_article (id) ON DELETE CASCADE,
    is_help_request  smallint DEFAULT 0,
    help_status      smallint DEFAULT 0,

    /* Crystal's view_count. Incremented on every detail read. */
    visited_num      integer  DEFAULT 0,

    reply_num        integer  DEFAULT 0,
    gold_recom_num   integer  DEFAULT 0,

    /* Spelled this way in the original. It is not a typo to fix here: the
       column name is what the production database answers to. */
    silber_recom_num integer  DEFAULT 0,

    recommended_num  integer  DEFAULT 0,
    is_new           smallint DEFAULT 0
);


CREATE TABLE IF NOT EXISTS ora_blog.blog_article_lob (
    id           bigint       PRIMARY KEY
                              REFERENCES ora_blog.blog_article (id) ON DELETE CASCADE,

    /* CLOB in Oracle. The article body, as HTML. */
    content      text         NULL,

    approval_num integer      DEFAULT 0
);


/*
 * THE THUMBS - one row per reader per article or reply, and never a second.
 *
 * gold_recom_num / silber_recom_num / recommended_num on blog_article_info
 * are the COUNTS; this is the LEDGER that stops a reader adding to them twice.
 * The vendor's submitBlogRating (controllers/web/webBlogController.js and
 * controllers/client/clientBlogController.js) looks here before it counts and
 * writes here after, and the storefront does the same - see
 * repositories/legacy/thumbs.repository.js for every rule.
 *
 * THE FIRST FOUR COLUMNS are the vendor's own development DDL
 * (vendor_backend/sql_pg/91_mock_satellite_schemas.sql), column for column.
 *
 * THE LAST TWO ARE NOT IN THAT DDL, and the vendor's model writes both on
 * every thumb (blogModel.addOldBlogRating inserts recommend_type and ip). The
 * mock was written for a query that only reads the first four, so a
 * development copy built from it refuses the vendor's own insert. They are
 * ADDED here rather than the table redefined - IF NOT EXISTS, so the columns
 * the production table already has are never touched - with the names the
 * vendor writes and types that hold what it writes:
 *
 *   recommend_type  OLD_BLOG_RATING_TYPES: 1 gold, 2 silver, 3 bronze
 *   ip              the app's device IMEI; empty from the website
 *
 * The id comes from blog_article_recommend_s, the sequence the vendor's model
 * names (`${T_OLD_RECOMMENDS}_S.nextval`); there is no default on the column.
 */
CREATE SEQUENCE IF NOT EXISTS ora_blog.blog_article_recommend_s START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS ora_blog.blog_article_recommend (
    id                     bigint       PRIMARY KEY,
    article_id             bigint       REFERENCES ora_blog.blog_article (id) ON DELETE CASCADE,
    recommend_user_userid  varchar(50)  NULL,
    reg_date               timestamp    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_blog_recommend_article ON ora_blog.blog_article_recommend (article_id);

ALTER TABLE ora_blog.blog_article_recommend ADD COLUMN IF NOT EXISTS recommend_type smallint NULL;
ALTER TABLE ora_blog.blog_article_recommend ADD COLUMN IF NOT EXISTS ip varchar(64) NULL;
