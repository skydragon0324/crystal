-- news categories
CREATE SEQUENCE "NEWS_CATEGORIES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 CACHE 20;

CREATE TABLE news_categories (
  category_pk NUMBER PRIMARY KEY,
  category_name VARCHAR2(128) NOT NULL UNIQUE,
  position NUMBER(2) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON COLUMN "NEWS_CATEGORIES"."CATEGORY_NAME" IS 'category name';
COMMENT ON COLUMN "NEWS_CATEGORIES"."POSITION" IS 'display order';
COMMENT ON COLUMN "NEWS_CATEGORIES"."IS_DELETED" IS '1: deleted';

CREATE OR REPLACE TRIGGER news_category_trigger
BEFORE INSERT ON news_categories
FOR EACH ROW
BEGIN
  IF :NEW.category_pk IS NULL THEN
    SELECT "NEWS_CATEGORIES_S".NEXTVAL
    INTO :NEW.category_pk
    FROM dual;
  END IF;
END;
/

-- news articles
CREATE SEQUENCE "NEWS_ARTICLES_S" MINVALUE 10000000 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 10000000 CACHE 20;

CREATE TABLE news_articles (
  article_pk NUMBER PRIMARY KEY,
  article_title VARCHAR2(512) NOT NULL,
  article_summary VARCHAR2(512) NOT NULL,
  cleaned_content VARCHAR2(4000) NOT NULL,
  image_url VARCHAR2(255),
  category_pk NUMBER,
  article_source NUMBER(2) DEFAULT 0 NOT NULL,
  status NUMBER(1) DEFAULT 0,
  publish_org VARCHAR2(64),
  publish_num VARCHAR2(64),
  hash_summary VARCHAR2(255),
  reason VARCHAR2(1024),
  provider_pk NUMBER,
  is_deleted NUMBER(1) DEFAULT 0,
  notice_at DATE,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_news_article_cat_pk FOREIGN KEY (category_pk) REFERENCES news_categories(category_pk)
);

COMMENT ON COLUMN "NEWS_ARTICLES"."ARTICLE_TITLE" IS 'article title';
COMMENT ON COLUMN "NEWS_ARTICLES"."ARTICLE_SUMMARY" IS 'article summary including 1 or 2 sentences';
COMMENT ON COLUMN "NEWS_ARTICLES"."CLEANED_CONTENT" IS 'html stripped content, for content search';
COMMENT ON COLUMN "NEWS_ARTICLES"."IMAGE_URL" IS 'image url if exists';
COMMENT ON COLUMN "NEWS_ARTICLES"."CATEGORY_PK" IS 'news_categories.category_pk';
COMMENT ON COLUMN "NEWS_ARTICLES"."ARTICLE_SOURCE" IS '1: morning, 2: polestar';
COMMENT ON COLUMN "NEWS_ARTICLES"."STATUS" IS '0: draft or copy, 1: user pending, 2: admin accept, 3: admin deny, 4: pub pending, 5: pub accept, 6: pub deny, 7: pub cancel, 8: notice, 9: news cancel (by provider)';
COMMENT ON COLUMN "NEWS_ARTICLES"."PUBLISH_ORG" IS 'original publish approve number';
COMMENT ON COLUMN "NEWS_ARTICLES"."PUBLISH_NUM" IS 'company publish approve number';
COMMENT ON COLUMN "NEWS_ARTICLES"."HASH_SUMMARY" IS 'hash of summary when pub accepted for prevent modification';
COMMENT ON COLUMN "NEWS_ARTICLES"."REASON" IS 'reject reason';
COMMENT ON COLUMN "NEWS_ARTICLES"."PROVIDER_PK" IS 'article id of provider (morning, polestar, ...)';
COMMENT ON COLUMN "NEWS_ARTICLES"."NOTICE_AT" IS 'notice(display) time';
COMMENT ON COLUMN "NEWS_ARTICLES"."IS_DELETED" IS '1: deleted';

CREATE OR REPLACE TRIGGER news_article_trigger
BEFORE INSERT ON news_articles
FOR EACH ROW
BEGIN
  IF :NEW.article_pk IS NULL THEN
    SELECT "NEWS_ARTICLES_S".NEXTVAL
    INTO :NEW.article_pk
    FROM dual;
  END IF;
END;
/

-- news moning
CREATE TABLE news_morning (
  article_pk NUMBER NOT NULL,
  article_content NCLOB,
  article_origin VARCHAR2(255),
  cert_data VARCHAR2(1024),
  sign_data VARCHAR2(1024),
  hash_content VARCHAR2(1024),
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_news_morning_news_pk FOREIGN KEY (article_pk) REFERENCES news_articles(article_pk)
);

COMMENT ON COLUMN "NEWS_MORNING"."ARTICLE_PK" IS 'news_articles.article_pk';
COMMENT ON COLUMN "NEWS_MORNING"."ARTICLE_CONTENT" IS 'article content';
COMMENT ON COLUMN "NEWS_MORNING"."ARTICLE_ORIGIN" IS 'origin of article';
COMMENT ON COLUMN "NEWS_MORNING"."CERT_DATA" IS 'cert data';
COMMENT ON COLUMN "NEWS_MORING"."SIGN_DATA" IS 'signature data';
COMMENT ON COLUMN "NEWS_MORNING"."HASH_CONTENT" IS 'hash of content when pub accepted for prevent modification';

CREATE INDEX idx_news_morning_pk ON news_morning (article_pk);

-- news polestar
CREATE TABLE news_polestar (
  article_pk NUMBER NOT NULL,
  article_content NCLOB,
  article_origin VARCHAR2(255),
  cert_data VARCHAR2(1024),
  sign_data VARCHAR2(1024),
  hash_content VARCHAR2(1024),
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_news_polestar_news_pk FOREIGN KEY (article_pk) REFERENCES news_articles(article_pk)
);

COMMENT ON COLUMN "NEWS_POLESTAR"."ARTICLE_PK" IS 'news_articles.article_pk';
COMMENT ON COLUMN "NEWS_POLESTAR"."ARTICLE_CONTENT" IS 'article content';
COMMENT ON COLUMN "NEWS_POLESTAR"."ARTICLE_ORIGIN" IS 'origin of article';
COMMENT ON COLUMN "NEWS_POLESTAR"."CERT_DATA" IS 'cert data';
COMMENT ON COLUMN "NEWS_POLESTAR"."SIGN_DATA" IS 'signature data';
COMMENT ON COLUMN "NEWS_POLESTAR"."HASH_CONTENT" IS 'hash of content when pub accepted for prevent modification';

CREATE INDEX idx_news_polestar_pk ON news_polestar (article_pk);

-- news favorites
CREATE SEQUENCE "NEWS_FAVORITES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 CACHE 20;

CREATE TABLE news_favorites (
  table_pk NUMBER PRIMARY KEY,
  user_pk NUMBER NOT NULL,
  article_pk NUMBER NOT NULL,
  action_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_news_favorite_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_news_favorite_article_pk FOREIGN KEY (article_pk) REFERENCES news_articles(article_pk),
  CONSTRAINT uq_news_favorites UNIQUE (user_pk, article_pk)
);

COMMENT ON COLUMN "NEWS_FAVORITES"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "NEWS_FAVORITES"."ARTICLE_PK" IS 'news_articles.article_pk';

CREATE OR REPLACE TRIGGER news_favorite_trigger
BEFORE INSERT ON news_favorites
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "NEWS_FAVORITES_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/
