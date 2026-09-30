-- 029  Content signatures
--
-- Notices, FAQs and every uploaded image are now SIGNED on the server, and
-- the storefront verifies the signature before it renders them.  See
-- docs/content-signing.md; the design is in src/security/.
--
-- ONE TABLE FOR EVERY SIGNED THING, keyed by what the thing is and which one:
--
--   content_type  notification | faq | image
--   content_ref   the row's id as text, or an image's storage key
--                 ('/uploads/adverts/home-crystal.svg')
--
-- rather than a signature column on each table, for two reasons:
--
--   an image is a file, which has no row of its own at all - the same path
--   can be named by an advert, a product and a media asset at once.  A
--   signature column could only ever cover the notices and the FAQs;
--
--   the audit reads every signature in the system, and one table is one
--   query.
--
-- ONE CURRENT SIGNATURE PER ITEM: the unique key is the item, and re-signing
-- replaces the row.  An old signature kept "for history" is a signature for
-- content that no longer exists, and nothing good can come of one verifying.
--
-- content_type IS varchar WITH A CHECK, not a native enum, against this
-- schema's own convention - because the list moves with the SIGNING SCHEMA,
-- which is versioned in two codebases, rather than with this database, and a
-- CHECK can be widened inside the same transaction as the rows that need it.
--
-- payload_sha256 is the hash of the exact bytes that were signed.  Nothing
-- verifies against it; it is there so an audit can say "the content changed"
-- and "the signature was replaced" apart without holding the key.
--
-- THE FAQ TRIGGER CHANGES TOO.  `trg_faqs_updated` moved updated_at on EVERY
-- update, and the storefront increments view_count every time an answer is
-- opened - so an FAQ's updatedAt, which is signed, changed on its first read
-- and its signature broke with it.  A view is not an edit, exactly as reading
-- a feedback thread is not activity on it (see set_updated_at_unless_read):
-- an update that changes view_count and nothing else now leaves updated_at
-- where it was.  The comparison is over the whole row minus those two columns,
-- so a column added later cannot slip through as "just a view".
--
-- Idempotent: the table, index and function are created only when absent, and
-- the trigger is dropped and recreated.

CREATE TABLE IF NOT EXISTS content_signatures (
    id              serial       PRIMARY KEY,
    content_type    varchar(40)  NOT NULL
                    CONSTRAINT chk_content_signatures_type
                    CHECK (content_type IN ('notification', 'faq', 'image')),
    content_ref     varchar(255) NOT NULL,
    schema_version  smallint     NOT NULL CHECK (schema_version > 0),
    algorithm       varchar(40)  NOT NULL,
    key_id          varchar(64)  NOT NULL,
    encoding        varchar(20)  NOT NULL,
    signature       text         NOT NULL,
    payload_sha256  char(64)     NOT NULL,
    signed_at       timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT uq_content_signatures_item UNIQUE (content_type, content_ref)
);

-- Rotation asks "what is still signed by v1" and the audit asks it per key.
CREATE INDEX IF NOT EXISTS idx_content_signatures_key ON content_signatures(key_id);

CREATE OR REPLACE FUNCTION set_updated_at_unless_viewed() RETURNS trigger AS $$
BEGIN
    IF NEW.view_count IS DISTINCT FROM OLD.view_count
       AND (to_jsonb(NEW) - 'view_count' - 'updated_at')
         = (to_jsonb(OLD) - 'view_count' - 'updated_at')
    THEN
        NEW.updated_at = OLD.updated_at;
        RETURN NEW;
    END IF;

    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_faqs_updated ON faqs;
CREATE TRIGGER trg_faqs_updated
    BEFORE UPDATE ON faqs
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at_unless_viewed();
