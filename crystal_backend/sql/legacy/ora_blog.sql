-- =====================================================================
-- ora_blog - THE VENDOR'S LEGACY BLOG, as a development stand-in.
--
-- Three tables, one article split across them, and the split is the whole
-- reason the schema looks like this:
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
