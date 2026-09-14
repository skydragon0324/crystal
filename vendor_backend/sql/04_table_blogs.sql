-- blog categories
CREATE SEQUENCE "BLOG_CATEGORIES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE blog_categories (
  category_pk NUMBER PRIMARY KEY,
  name VARCHAR2(100) NOT NULL,
  description VARCHAR2(255),
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON COLUMN "BLOG_CATEGORIES"."NAME" IS 'Category Name';
COMMENT ON COLUMN "BLOG_CATEGORIES"."DESCRIPTION" IS 'Category Description';

CREATE OR REPLACE TRIGGER blog_category_id_trigger
BEFORE INSERT ON blog_categories
FOR EACH ROW
BEGIN
  IF :NEW.category_id IS NULL THEN
    SELECT "BLOG_CATEGORIES_S".NEXTVAL
    INTO :NEW.category_id
    FROM dual;
  END IF;
END;
/

INSERT INTO blog_categories (name, description) VALUES ('Phone', 'About phones');
INSERT INTO blog_categories (name, description) VALUES ('EProd', 'About electronic products');

-- Blogs
CREATE SEQUENCE "BLOGS_S" MINVALUE 10000000 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 10000000 CACHE 20;

CREATE TABLE blogs (
  blog_pk NUMBER PRIMARY KEY,
  title VARCHAR2(255) NOT NULL,
  content CLOB,
  cleaned_content VARCHAR2(4000),
  image_url VARCHAR2(255),
  status NUMBER(1) DEFAULT 0,
  category_pk NUMBER,
  post_type VARCHAR2(10) NOT NULL,
  series_group_id NUMBER,
  -- series_part_number NUMBER,
  parent_pk NUMBER,
  user_pk NUMBER NOT NULL,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_blog_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_blog_category_id FOREIGN KEY (category_pk) REFERENCES blog_categories(category_pk),
  CONSTRAINT fk_blog_parent_pk FOREIGN KEY (parent_pk) REFERENCES blogs(blog_pk),
  CONSTRAINT ck_blog_status CHECK (status IN (0, 1, 2, 3)),
  CONSTRAINT ck_blog_post_type CHECK (post_type IN ('general', 'help', 'topic', 'series')),
  CONSTRAINT ck_blog_is_deleted CHECK (is_deleted IN (0, 1))
);

COMMENT ON COLUMN "BLOGS"."TITLE" IS 'Blog Title';
COMMENT ON COLUMN "BLOGS"."CONTENT" IS 'Blog Content (containing html tag)';
COMMENT ON COLUMN "BLOGS"."CLEANED_CONTENT" IS 'Blog Content (html tag stripped)';
COMMENT ON COLUMN "BLOGS"."IMAGE_URL" IS 'blog if image containes';
COMMENT ON COLUMN "BLOGS"."STATUS" IS '(0: Pending, 1: Published, 2: Manager Checking, 3: Draft)';
COMMENT ON COLUMN "BLOGS"."CATEGORY_ID" IS 'blog_categories.category_id';
COMMENT ON COLUMN "BLOGS"."POST_TYPE" IS 'general, help, topic, series';
COMMENT ON COLUMN "BLOGS"."SERIES_GROUP_ID" IS 'Group identifier for articles in a series (NULL for non-series blogs)';
COMMENT ON COLUMN "BLOGS"."PARENT_PK" IS 'Self-referencing blog (for replies) = blogs.blog_pk';
COMMENT ON COLUMN "BLOGS"."USER_PK" IS 'users.user_pk that whom posts blog';

CREATE OR REPLACE TRIGGER blog_pk_trigger
BEFORE INSERT ON blogs
FOR EACH ROW
BEGIN
  IF :NEW.blog_pk IS NULL THEN
    SELECT "BLOGS_S".NEXTVAL
    INTO :NEW.blog_pk
    FROM dual;
  END IF;
END;
/

