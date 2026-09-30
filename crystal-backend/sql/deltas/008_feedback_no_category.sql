-- ---------------------------------------------------------------------
-- Delta 008 - a feedback thread has a SOURCE, not a category.
--
-- Both columns tried to say what an enquiry was about, and the two were never
-- independent: somebody writing from the Eshop about an order picked ESHOP and
-- then ORDER, and somebody writing from a product page picked SMARTPHONE and
-- then PRODUCT. Two dropdowns to answer one question is two chances to
-- disagree, and it was the SOURCE that mattered - it decides which team the
-- thread reaches.
--
-- sql/schema.sql is the source of truth and already omits it; this file brings
-- an existing database up to that, and it is safe to run twice.
-- ---------------------------------------------------------------------

ALTER TABLE feedback_threads DROP COLUMN IF EXISTS category;
