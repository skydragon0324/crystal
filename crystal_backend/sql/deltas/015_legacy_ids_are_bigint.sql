-- ---------------------------------------------------------------------
-- Delta 015 - one column, widened, because it now holds somebody else's key.
--
-- Feedback and the blog moved to the vendor's database (src/config/legacy.js).
-- Crystal keeps no copy of an article row any more, but it still keeps the
-- ARTWORK: media_assets is polymorphic over (owner_type, owner_id), and
-- 'ARTICLE' rows now point at ora_blog.blog_article.
--
-- Those ids are Oracle NUMBERs. The live ones on the development instance
-- start at 900001009000, and `integer` stops at 2147483647 - so the first
-- image attached to a legacy article failed with
--
--   value "900004009014" is out of range for type integer
--
-- which is not a clean failure: the article had already been written, and it
-- was the console's SECOND statement that refused. An article could be created
-- and then not be deletable.
--
-- integer -> bigint. Nothing else in this table changes, no data moves, and
-- every existing row keeps its value: bigint is a widening, so the four
-- owner types that still point at Crystal's own serial keys are unaffected.
--
-- WHY NOT ALL THE OTHER ID COLUMNS: because there are none. audit_log.entity_pk
-- is already varchar(60) and stores the key as text, which is what makes it
-- able to log a change to a row in a database it cannot join to. The rest of
-- Crystal's tables reference Crystal's own rows.
--
-- sql/schema.sql is the source of truth and already says this; this file
-- brings an existing database up to it, and it is safe to run twice.
-- ---------------------------------------------------------------------

ALTER TABLE media_assets
    ALTER COLUMN owner_id TYPE bigint;

COMMENT ON COLUMN media_assets.owner_id IS
  'the key of the owning row, in whichever table owner_type names. BIGINT rather
   than integer because one of those tables is not Crystal''s: an ARTICLE owner
   is a row in the vendor''s ora_blog.blog_article, whose ids are Oracle NUMBERs
   and do not fit in 32 bits.';
