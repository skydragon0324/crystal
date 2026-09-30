-- ---------------------------------------------------------------------
-- Delta 005 - a specification sheet belongs to a CATEGORY, and a product can
-- say whether it publishes a price list.
--
-- sql/schema.sql is the source of truth and already says both of these; this
-- file brings an existing database up to it, and every statement is safe to
-- run twice.
-- ---------------------------------------------------------------------


-- =====================================================================
-- 1. specification_groups gains a category.
--
-- The dictionary was GLOBAL: every group and every definition was offered for
-- every product, so the television editor was asked for a front camera and the
-- handset editor for a backlight type. Worse, the storefront sheet showed the
-- same empty groups on both.
--
-- `product_category_id` NULL means "applies everywhere" - Build, In the box -
-- and that is deliberately the default, because most of the existing groups
-- are genuinely shared. A group pinned to a category is offered only for
-- products in it.
--
-- The DEFINITIONS follow their group, which is what makes this one column
-- rather than two: a definition belongs to exactly one group, and a group
-- belongs to at most one category. Per-PRODUCT variation needs nothing extra -
-- a product simply has no value for a definition it does not answer, and the
-- sheet only prints what has been filled in.
-- =====================================================================

ALTER TABLE specification_groups ADD COLUMN IF NOT EXISTS
    product_category_id integer NULL REFERENCES product_categories(id) ON DELETE CASCADE;

COMMENT ON COLUMN specification_groups.product_category_id IS
  'which section this group belongs to; NULL applies to every product';

CREATE INDEX IF NOT EXISTS idx_spec_groups_category
    ON specification_groups(product_category_id, sort_order);


-- =====================================================================
-- 2. products gains a service-pricing switch.
--
-- Some products have nothing to publish - an accessory, a line that is
-- serviced by exchange rather than repair - and a tab that opens on "nothing
-- published yet" is a tab that should not have been offered.
--
-- Defaults to true so nothing disappears when this runs; the storefront also
-- hides the tab when the list is empty, so the flag is for the case where
-- there ARE prices and they should not be public.
-- =====================================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS
    show_service_pricing boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN products.show_service_pricing IS
  'whether the storefront offers the service pricing tab for this product';
