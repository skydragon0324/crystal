-- 024  About images live in named slots; retire the ones the page never shows
--
-- The About page was redesigned around one rule: every picture on it has a
-- slot of its own, named in crystal-web/src/pages/about/content.js and picked
-- from a list in the console.  These slots belong to the old page and nothing
-- renders them any more:
--
--   hero            the page never asked for a hero - the console's
--                   placeholder text suggested it, so rows were made for it
--   businesses      the businesses chapter is five titles in hexagons now
--   growth          the growth chapter is a chart; it never drew this
--   factory.floor   two gallery slots nothing rendered
--   factory.line
--   manufacturing   the chapter was folded into the factory chapter; its
--                   steps each have their own factory.flow.* slot
--   shop.interior   floors carry their own carousels (shop.floor.N)
--   presence        the map is replaced by two location photographs
--   certificate     fourteen interchangeable rows that could not say which
--                   certificate a scan belonged to; every certificate names
--                   its own slot now (recognition.certificate.*,
--                   factory.certificate.*)
--
-- SOFT DELETED, not dropped.  A retired row goes to the recycle bin with the
-- file it points at, so a scan somebody did upload into the generic
-- 'certificate' slot can be found and moved to its certificate's slot rather
-- than lost.  Nothing is inserted: a production site's real pictures are
-- uploaded through the console, and placeholders there would be a regression.
--
-- Idempotent: a row already deleted is left alone.

UPDATE about_images
   SET is_deleted = TRUE,
       updated_at = NOW()
 WHERE is_deleted = FALSE
   AND slot IN (
     'hero',
     'businesses',
     'growth',
     'factory.floor',
     'factory.line',
     'manufacturing',
     'shop.interior',
     'presence',
     'certificate'
   );
