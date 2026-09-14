-- ---------------------------------------------------------------------
-- Delta 003 - a finish is a HEX, not a photograph.
--
-- `product_colors.image` was stored, seeded and returned by the API, and
-- nothing ever drew it. The swatch on a product card and on the product page
-- is painted from `hex`, deliberately: the dot has to be paintable before any
-- artwork has loaded, which is the whole reason the hex column exists.
--
-- So the column was a file path that had to be uploaded, kept and migrated to
-- feed a picture no page has ever shown.
--
-- sql/schema.sql is the source of truth and already says this; the delta is
-- what brings an existing database up to it, and it is safe to run twice.
-- ---------------------------------------------------------------------

ALTER TABLE product_colors DROP COLUMN IF EXISTS image;
