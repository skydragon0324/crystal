-- ---------------------------------------------------------------------
-- Delta 006 - a piece of artwork can point somewhere.
--
-- The section hero is a run of ADVERTISING images that belong to the section
-- rather than to any one product - "the C9 range", "fast charging on the C7
-- Pro" - and the whole point of an advertisement is that it is clickable.
--
-- On the hero the copy is burnt into the picture, exactly as it is on the
-- product advertising run, so there is no title or subtitle column to add:
-- what a hero slide needs beyond the image is somewhere to go.
--
-- Nullable, because most media is not a link: a thumbnail, an article figure
-- and a studio shot all have nowhere to point.
--
-- sql/schema.sql is the source of truth and already says this; the delta is
-- what brings an existing database up to it, and it is safe to run twice.
-- ---------------------------------------------------------------------

ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS link_url varchar(255) NULL;

COMMENT ON COLUMN media_assets.link_url IS
  'where this artwork goes when it is clicked; NULL for artwork that is not a link';
