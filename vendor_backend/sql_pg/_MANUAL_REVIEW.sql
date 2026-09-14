-- Triggers that are NOT the plain PK auto-increment pattern.
-- Each needs a hand-written plpgsql function + CREATE TRIGGER.

-- ==== blog_tables.sql :: update_visit_count ====
CREATE OR REPLACE TRIGGER update_visit_count
AFTER INSERT ON blog_visits
FOR EACH ROW
BEGIN
  -- Increment the visit_count for the corresponding blog_pk
  MERGE INTO blog_statistics bs
  USING dual
  ON (bs.blog_pk = :NEW.blog_pk)
  WHEN MATCHED THEN
    UPDATE SET bs.visit_count = bs.visit_count + 1, bs.last_updated = CURRENT_TIMESTAMP
  WHEN NOT MATCHED THEN
    INSERT (blog_pk, visit_count, rating_count, last_updated)
    VALUES (:NEW.blog_pk, 1, 0, CURRENT_TIMESTAMP);
END;
/

-- ==== blog_tables.sql :: update_rating_count ====
CREATE OR REPLACE TRIGGER update_rating_count
AFTER INSERT ON blog_ratings
FOR EACH ROW
BEGIN
  -- Increment the rating_count for the corresponding blog_pk
  MERGE INTO blog_statistics bs
  USING dual
  ON (bs.blog_pk = :NEW.blog_pk)
  WHEN MATCHED THEN
    UPDATE SET bs.rating_count = bs.rating_count + 1, bs.last_updated = CURRENT_TIMESTAMP
  WHEN NOT MATCHED THEN
    INSERT (blog_pk, visit_count, rating_count, last_updated)
    VALUES (:NEW.blog_pk, 0, 1, CURRENT_TIMESTAMP);
END;
/

-- ==== blog_tables.sql :: add_thumb_up_points ====
CREATE OR REPLACE TRIGGER add_thumb_up_points
AFTER INSERT ON blog_ratings
FOR EACH ROW
BEGIN
  -- Add points for rating (thumbs up/down)
  INSERT INTO activity_points (user_pk, points, point_type, reason, related_pk)
  SELECT
    :NEW.user_pk,  -- User who rated
    pt.points,  -- Points for the action (pulled from point_types)
    1,  -- Point type (1 = Thumb Up)
    'Thumb up blog',  -- Reason for the points
    :NEW.rating_pk  -- Foreign key to blog_ratings table
  FROM point_types pt
  WHERE pt.point_type = 1;  -- Thumb Up
END;
/

-- ==== blog_tables.sql :: add_post_article_points ====
CREATE OR REPLACE TRIGGER add_post_article_points
AFTER INSERT ON blogs
FOR EACH ROW
BEGIN
  -- If the post is a main article, award points
  IF :NEW.post_type = 'topic' THEN
    INSERT INTO activity_points (user_pk, points, point_type, reason, related_pk)
    SELECT
      :NEW.user_pk,  -- User who posted the article
      pt.points,  -- Points for posting a main article (pulled from point_types)
      2,  -- Point type (2 = Post Main Article)
      'Post main article',  -- Reason for the points
      :NEW.blog_pk  -- Foreign key to blogs table
    FROM point_types pt
    WHERE pt.point_type = 2;  -- Post Main Article
  ELSIF :NEW.post_type = 'help' THEN
    INSERT INTO activity_points (user_pk, points, point_type, reason, related_pk)
    SELECT
      :NEW.user_pk,  -- User who posted the article
      pt.points,  -- Points for posting a reply (pulled from point_types)
      3,  -- Point type (3 = Post Reply Article)
      'Post reply article',  -- Reason for the points
      :NEW.blog_pk  -- Foreign key to blogs table
    FROM point_types pt
    WHERE pt.point_type = 3;  -- Post Reply Article
  END IF;
END;
/

