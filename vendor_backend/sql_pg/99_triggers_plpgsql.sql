-- ============================================================
-- The 4 triggers that were not the plain PK auto-increment
-- pattern, rewritten as plpgsql.
--
-- Run this AFTER the numbered table files (it references
-- blog_statistics, blog_visits, blog_ratings, blogs,
-- activity_points and point_types).
--
-- Postgres needs a FUNCTION ... RETURNS trigger plus a separate
-- CREATE TRIGGER; there is no inline trigger body as in Oracle.
-- ============================================================

-- blog_statistics needs a unique key on blog_pk for ON CONFLICT to
-- work. Oracle's MERGE matched on it without requiring a constraint.
ALTER TABLE blog_statistics
  ADD CONSTRAINT uq_blog_statistics_blog_pk UNIQUE (blog_pk);


-- ---------- update_visit_count ------------------------------
-- Oracle MERGE INTO ... USING dual -> INSERT ... ON CONFLICT.
CREATE OR REPLACE FUNCTION trg_update_visit_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO blog_statistics (blog_pk, visit_count, rating_count, last_updated)
  VALUES (NEW.blog_pk, 1, 0, CURRENT_TIMESTAMP)
  ON CONFLICT (blog_pk) DO UPDATE
    SET visit_count  = blog_statistics.visit_count + 1,
        last_updated = CURRENT_TIMESTAMP;
  RETURN NULL;              -- AFTER trigger: return value is ignored
END;
$$;

DROP TRIGGER IF EXISTS update_visit_count ON blog_visits;
CREATE TRIGGER update_visit_count
AFTER INSERT ON blog_visits
FOR EACH ROW EXECUTE FUNCTION trg_update_visit_count();


-- ---------- update_rating_count -----------------------------
CREATE OR REPLACE FUNCTION trg_update_rating_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO blog_statistics (blog_pk, visit_count, rating_count, last_updated)
  VALUES (NEW.blog_pk, 0, 1, CURRENT_TIMESTAMP)
  ON CONFLICT (blog_pk) DO UPDATE
    SET rating_count = blog_statistics.rating_count + 1,
        last_updated = CURRENT_TIMESTAMP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS update_rating_count ON blog_ratings;
CREATE TRIGGER update_rating_count
AFTER INSERT ON blog_ratings
FOR EACH ROW EXECUTE FUNCTION trg_update_rating_count();


-- ---------- add_thumb_up_points -----------------------------
CREATE OR REPLACE FUNCTION trg_add_thumb_up_points()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO activity_points (user_pk, points, point_type, reason, related_pk)
  SELECT NEW.user_pk,
         pt.points,
         1,
         'Thumb up blog',
         NEW.rating_pk
  FROM point_types pt
  WHERE pt.point_type = 1;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS add_thumb_up_points ON blog_ratings;
CREATE TRIGGER add_thumb_up_points
AFTER INSERT ON blog_ratings
FOR EACH ROW EXECUTE FUNCTION trg_add_thumb_up_points();


-- ---------- add_post_article_points -------------------------
-- Oracle ELSIF -> plpgsql ELSIF (same spelling, kept as-is).
CREATE OR REPLACE FUNCTION trg_add_post_article_points()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.post_type = 'topic' THEN
    INSERT INTO activity_points (user_pk, points, point_type, reason, related_pk)
    SELECT NEW.user_pk, pt.points, 2, 'Post main article', NEW.blog_pk
    FROM point_types pt
    WHERE pt.point_type = 2;

  ELSIF NEW.post_type = 'help' THEN
    INSERT INTO activity_points (user_pk, points, point_type, reason, related_pk)
    SELECT NEW.user_pk, pt.points, 3, 'Post reply article', NEW.blog_pk
    FROM point_types pt
    WHERE pt.point_type = 3;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS add_post_article_points ON blogs;
CREATE TRIGGER add_post_article_points
AFTER INSERT ON blogs
FOR EACH ROW EXECUTE FUNCTION trg_add_post_article_points();


-- NOTE on Postgres version: EXECUTE FUNCTION requires PG 11+.
-- On PG 10 or older use EXECUTE PROCEDURE instead.
