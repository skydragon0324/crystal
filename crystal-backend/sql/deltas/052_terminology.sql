-- ---------------------------------------------------------------------
-- Delta 052 - the company's terminology.
--
-- A term, the language it is written in, what it means and anything else
-- worth saying about it, so every workflow uses one word for one thing.
-- Unique per language, ignoring case, among the rows not deleted.
--
-- sql/schema.sql is the source of truth and already says this; this file
-- brings an existing database up to it, and it is safe to run twice.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS terms (
    id          serial       PRIMARY KEY,
    term        varchar(200) NOT NULL,
    language    varchar(10)  NOT NULL,
    meaning     text         NOT NULL,
    description text         NULL,
    is_deleted  boolean      NOT NULL DEFAULT false,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON TABLE terms IS
  'the company''s standard terminology: a term, its language, what it means';
COMMENT ON COLUMN terms.language IS
  'a language code - ko, en, zh, ru';
COMMENT ON COLUMN terms.meaning IS
  'the definition, in one or two sentences';
COMMENT ON COLUMN terms.description IS
  'anything else: where the term is used, what it is NOT, examples';

CREATE UNIQUE INDEX IF NOT EXISTS uq_terms_term_language ON terms (lower(term), language) WHERE NOT is_deleted;

DROP TRIGGER IF EXISTS trg_terms_updated ON terms;
CREATE TRIGGER trg_terms_updated
    BEFORE UPDATE ON terms
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
