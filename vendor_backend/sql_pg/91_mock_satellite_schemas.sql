-- =====================================================================
-- 91_mock_satellite_schemas.sql
--
-- The account pages do not read from ora_pid alone. models/ also query
-- four *other* databases that were separate Oracle instances in the old
-- deployment and were never part of the ora_pid conversion:
--
--   ora_blog     the legacy blog  (blogModel, pointModel)
--   ora_license  karaoke licences (eprodModel)
--   ora_media    media licences   (eprodModel)
--   ora_old_db   the legacy customer DB (customerModel)
--
-- Only ora_old_db.customers survived the conversion. Every query that
-- touched the other three failed with "relation ... does not exist",
-- which is a 500 on the account page, not an empty list.
--
-- This file creates just the tables those queries name, with the columns
-- and types the queries actually use. It is a stand-in that lets the
-- pages render against a local Postgres - it is NOT a faithful copy of
-- the original schemas, so do not point a migration at it.
--
-- Run once, before sql_pg/seed_mock_data.sql:
--   psql -d vendor -f sql_pg/91_mock_satellite_schemas.sql
--
-- Re-runnable: everything is IF NOT EXISTS.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS ora_blog;
CREATE SCHEMA IF NOT EXISTS ora_license;
CREATE SCHEMA IF NOT EXISTS ora_media;
CREATE SCHEMA IF NOT EXISTS ora_old_db;


-- ---------------------------------------------------------------
-- ora_blog
--
-- blogModel.findOldArticlesForWeb drives "My articles" and "My drafts"
-- off blog_article + blog_article_info, keyed by user_userid (the login
-- name, not the pk). pointModel.findActivityPointLog left-joins
-- blog_article and blog_article_recommend to turn a point row into the
-- title of the article that earned it.
--
-- article ids are BIGINT because activity_point_log.related_pk is BIGINT
-- and joins straight onto them.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ora_blog.blog_subject (
  id          BIGINT PRIMARY KEY,
  name        VARCHAR(255),
  parent      BIGINT       DEFAULT 0,
  order_no    INTEGER      DEFAULT 0,
  state       SMALLINT     DEFAULT 1,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ora_blog.blog_article (
  id               BIGINT PRIMARY KEY,
  user_userid      VARCHAR(50),
  subject_id       BIGINT,
  parent           BIGINT      DEFAULT 0,
  title            VARCHAR(512),
  -- summary carries HTML; the query strips tags with REGEXP_REPLACE.
  summary          VARCHAR(4000),
  hash_summary     VARCHAR(64),
  cleaned_content  TEXT,
  image_url        VARCHAR(512),
  -- state: see ARTICLE_STATES in constants/. type: OLD_BLOG_ARTICLE_TYPES.
  state            SMALLINT    DEFAULT 1,
  type             SMALLINT    DEFAULT 0,
  reason           VARCHAR(512),
  origin           VARCHAR(255),
  publish_num      INTEGER     DEFAULT 0,
  publish_org      VARCHAR(255),
  create_at        TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  modify_at        TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  publish_at       TIMESTAMP,
  notice_at        TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_blog_article_userid ON ora_blog.blog_article (user_userid);
CREATE INDEX IF NOT EXISTS ix_blog_article_parent ON ora_blog.blog_article (parent);

CREATE TABLE IF NOT EXISTS ora_blog.blog_article_info (
  id                BIGINT PRIMARY KEY REFERENCES ora_blog.blog_article (id) ON DELETE CASCADE,
  is_help_request   SMALLINT DEFAULT 0,
  help_status       SMALLINT DEFAULT 0,
  visited_num       INTEGER  DEFAULT 0,
  reply_num         INTEGER  DEFAULT 0,
  gold_recom_num    INTEGER  DEFAULT 0,
  silber_recom_num  INTEGER  DEFAULT 0,
  recommended_num   INTEGER  DEFAULT 0,
  is_new            SMALLINT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ora_blog.blog_article_lob (
  id            BIGINT PRIMARY KEY REFERENCES ora_blog.blog_article (id) ON DELETE CASCADE,
  content       TEXT,
  approval_num  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ora_blog.blog_article_recommend (
  id                     BIGINT PRIMARY KEY,
  article_id             BIGINT REFERENCES ora_blog.blog_article (id) ON DELETE CASCADE,
  recommend_user_userid  VARCHAR(50),
  reg_date               TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_blog_recommend_article ON ora_blog.blog_article_recommend (article_id);

CREATE TABLE IF NOT EXISTS ora_blog.blog_article_visit_log (
  article_id  BIGINT REFERENCES ora_blog.blog_article (id) ON DELETE CASCADE,
  visit_date  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ora_blog.blog_config (
  key   VARCHAR(64) PRIMARY KEY,
  val   VARCHAR(512),
  type  SMALLINT DEFAULT 0,
  note  VARCHAR(255)
);


-- ---------------------------------------------------------------
-- ora_license  --  eprodModel.findKaraOldLog
--
-- The query keeps a row only when it has no error row, or an error row
-- whose error_status is not 2, so tbl_error_list has to exist even when
-- it is empty.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ora_license.tbl_licgen (
  id           BIGINT PRIMARY KEY,
  userid       VARCHAR(50),
  machinekey   VARCHAR(64),
  real_price   NUMERIC(10,3) DEFAULT 0,
  bonus_score  NUMERIC(10,3) DEFAULT 0,
  -- both are filtered to 0: is_agent 0 = bought by the user, not an
  -- agency; resultlog 0 = the licence was issued successfully.
  is_agent     SMALLINT DEFAULT 0,
  resultlog    SMALLINT DEFAULT 0,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_licgen_userid ON ora_license.tbl_licgen (userid);

CREATE TABLE IF NOT EXISTS ora_license.tbl_error_list (
  id            BIGINT PRIMARY KEY,
  lic_id        BIGINT REFERENCES ora_license.tbl_licgen (id) ON DELETE CASCADE,
  error_status  SMALLINT DEFAULT 0,
  note          VARCHAR(512),
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ---------------------------------------------------------------
-- ora_media  --  eprodModel.findBMediaOldLog / findBMediaOldOne
--
-- tbl_old_license_score holds at most one carried-over balance row per
-- user; the controller prepends it to the log when the first page is
-- requested. score/15 is the conversion the query applies.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ora_media.tbl_media_providers (
  id          BIGINT PRIMARY KEY,
  short_name  VARCHAR(100),
  full_name   VARCHAR(255),
  contact     VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS ora_media.tbl_licenses (
  id           BIGINT PRIMARY KEY,
  userid       VARCHAR(50),
  dev_id       VARCHAR(64),
  provider     BIGINT REFERENCES ora_media.tbl_media_providers (id),
  cal_price    NUMERIC(10,3) DEFAULT 0,
  bonus_score  NUMERIC(10,3) DEFAULT 0,
  -- filtered to 1 = issued.
  result       SMALLINT DEFAULT 1,
  date_time    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_media_licenses_userid ON ora_media.tbl_licenses (userid);

CREATE TABLE IF NOT EXISTS ora_media.tbl_old_license_score (
  id         BIGINT PRIMARY KEY,
  userid     VARCHAR(50),
  cal_price  NUMERIC(10,3) DEFAULT 0,
  score      NUMERIC(10,3) DEFAULT 0,
  status     SMALLINT DEFAULT 1,
  date_time  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_media_score_userid ON ora_media.tbl_old_license_score (userid);


-- ---------------------------------------------------------------
-- ora_old_db  --  customerModel
--
-- customers already exists from the conversion; only the prize log is
-- missing. customer_id points at customers.user_pk, which is NOT the
-- ora_pid user_pk - the account controller looks the customer up by
-- login name first and passes that pk down.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ora_old_db.customer_prize_log (
  id           BIGINT PRIMARY KEY,
  customer_id  BIGINT,
  prize_val    NUMERIC(10,1) DEFAULT 0,
  note         VARCHAR(512),
  fill_date    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_prize_log_customer ON ora_old_db.customer_prize_log (customer_id);
