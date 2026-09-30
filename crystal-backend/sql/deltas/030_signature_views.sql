-- 030  Signature views
--
-- A signed notice, FAQ or image looked exactly like an unsigned one to anybody
-- reading the database: the signature lived in content_signatures, keyed by a
-- type and a reference, and whether it still held was something only the
-- storefront and `npm run sign:audit` knew - and the audit printed it and
-- forgot it.  Five views now put each row beside its signature, and the audit
-- writes down what it found:
--
--   v_notice_signatures          site_notices
--   v_faq_signatures             faqs
--   v_advert_signatures          site_adverts, by file_path to the image's signature
--   v_product_image_signatures   product_images, likewise
--   v_image_signatures           media_assets (the media library), likewise
--
-- Each shows the row's id and what a person recognises it by, then the
-- signature (key, algorithm, when, the payload hash and the first characters
-- of the signature itself), the last audit's verdict, and signature_state.
--
-- A VIEW CANNOT VERIFY A SIGNATURE.  Checking one means rebuilding the
-- canonical payload, hashing the file on disk and running ECDSA or RSA-PSS
-- against the public key - none of which SQL does.  So the audit RECORDS its
-- verdict on the signature row (audit_status, audit_reason, audited_at), and
-- signature_state reads, in this order:
--
--   'unsigned'                   no signature row at all;
--   the audit's verdict          when the audit ran after the item was signed
--                                and, for notices and FAQs, after the row was
--                                last updated - 'valid', 'valid (old key)',
--                                'INVALID', 'MISSING', 'revoked key',
--                                'unknown key';
--   'changed after signing'      notices and FAQs whose updated_at is later
--                                than signed_at, not audited since;
--   'signed - not yet audited'   everything else.
--
-- The audit wins over the timestamps when it is newer than both, because it
-- is the one that actually checked.  A row changed after signing and audited
-- since says INVALID, which is the more precise thing to say; a row whose
-- clocks disagree by a moment says what the cryptography says.
--
-- 'CHANGED AFTER SIGNING' IS FOR NOTICES AND FAQS ONLY.  Their updated_at is
-- inside the signed payload, so a row updated after it was signed no longer
-- matches its signature - the timestamp alone proves it.  An advert's,
-- product image's or media row's updated_at says nothing about the IMAGE: the
-- signature covers the file at its path, and reordering the adverts or
-- rewording an alt text is not a change to it.  Nor does a file changed on
-- disk leave any trace in the database, so for images the audit's verdict is
-- all a view can show, and it is only as fresh as the last audit.
--
-- signed_at and audited_at are both written by the API's clock; updated_at by
-- the database's.  The comparisons assume the two agree, as NTP makes them.
--
-- Re-signing replaces the signature and signed_at but leaves the audit
-- columns as they were, so the row keeps showing the old verdict in
-- audit_status - and 'signed - not yet audited' in signature_state, which is
-- the column that decides.  The audit never writes a verdict onto a signature
-- that was replaced while it ran.
--
-- THE AUDIT RUNS EVERY NIGHT in the API's housekeeping (sweeps.service.js),
-- and whenever somebody runs `npm run sign:audit`.  docs/content-signing.md
-- ("Signatures in the database") has a tamper walkthrough against these views.
--
-- Idempotent: the columns are added only when absent, and the views are
-- dropped and recreated.

ALTER TABLE content_signatures
    ADD COLUMN IF NOT EXISTS audit_status  text         NULL,
    ADD COLUMN IF NOT EXISTS audit_reason  text         NULL,
    ADD COLUMN IF NOT EXISTS audited_at    timestamptz  NULL;

COMMENT ON COLUMN content_signatures.audit_status IS
  'what the last audit found: valid, valid (old key), INVALID, MISSING, revoked key, unknown key, orphaned';
COMMENT ON COLUMN content_signatures.audit_reason IS
  'why, when it was not valid - the verifier''s reason (signature-invalid, content-fails-schema ...)';
COMMENT ON COLUMN content_signatures.audited_at IS
  'when the audit read the item; a verdict older than signed_at is about a signature that has since been replaced';

DROP VIEW IF EXISTS
    v_notice_signatures, v_faq_signatures, v_advert_signatures,
    v_product_image_signatures, v_image_signatures;

CREATE VIEW v_notice_signatures AS
SELECT
    n.id,
    n.title,
    n.status,
    n.is_deleted,
    n.updated_at,
    s.key_id,
    s.algorithm,
    s.signed_at,
    s.payload_sha256,
    left(s.signature, 24) || '...'           AS signature_short,
    s.audit_status,
    s.audit_reason,
    s.audited_at,
    CASE
        WHEN s.id IS NULL                   THEN 'unsigned'
        WHEN s.audited_at >= s.signed_at
         AND s.audited_at >= n.updated_at   THEN s.audit_status
        WHEN n.updated_at >  s.signed_at    THEN 'changed after signing'
        ELSE 'signed - not yet audited'
    END AS signature_state
FROM site_notices n
LEFT JOIN content_signatures s
       ON s.content_type = 'notification'
      AND s.content_ref  = n.id::text;

COMMENT ON VIEW v_notice_signatures IS
  'Each notice beside its signature. A view cannot verify a signature, so signature_state is the
   verdict the audit recorded (npm run sign:audit, or the nightly sweep) when it is newer than the
   signature and the row - otherwise only what the timestamps can say.';

CREATE VIEW v_faq_signatures AS
SELECT
    f.id,
    f.question,
    f.category,
    f.status,
    f.is_deleted,
    f.updated_at,
    s.key_id,
    s.algorithm,
    s.signed_at,
    s.payload_sha256,
    left(s.signature, 24) || '...'           AS signature_short,
    s.audit_status,
    s.audit_reason,
    s.audited_at,
    CASE
        WHEN s.id IS NULL                   THEN 'unsigned'
        WHEN s.audited_at >= s.signed_at
         AND s.audited_at >= f.updated_at   THEN s.audit_status
        WHEN f.updated_at >  s.signed_at    THEN 'changed after signing'
        ELSE 'signed - not yet audited'
    END AS signature_state
FROM faqs f
LEFT JOIN content_signatures s
       ON s.content_type = 'faq'
      AND s.content_ref  = f.id::text;

COMMENT ON VIEW v_faq_signatures IS
  'Each FAQ beside its signature. A view cannot verify a signature, so signature_state is the
   verdict the audit recorded (npm run sign:audit, or the nightly sweep) when it is newer than the
   signature and the row - otherwise only what the timestamps can say.';

CREATE VIEW v_advert_signatures AS
SELECT
    a.id,
    a.placement,
    a.device_type,
    a.file_path,
    a.alt_text,
    a.status,
    a.is_deleted,
    a.updated_at,
    s.key_id,
    s.algorithm,
    s.signed_at,
    s.payload_sha256,
    left(s.signature, 24) || '...'           AS signature_short,
    s.audit_status,
    s.audit_reason,
    s.audited_at,
    CASE
        WHEN s.id IS NULL                   THEN 'unsigned'
        WHEN s.audited_at >= s.signed_at    THEN s.audit_status
        ELSE 'signed - not yet audited'
    END AS signature_state
FROM site_adverts a
LEFT JOIN content_signatures s
       ON s.content_type = 'image'
      AND s.content_ref  = a.file_path;

COMMENT ON VIEW v_advert_signatures IS
  'Each advert beside the signature of the image file it shows. A view can neither hash a file nor
   verify a signature, so signature_state is the verdict the audit last recorded (npm run sign:audit,
   or the nightly sweep); a file changed on disk since then shows only after the next audit.';

CREATE VIEW v_product_image_signatures AS
SELECT
    i.id,
    i.product_id,
    p.name                                   AS product_name,
    i.kind,
    i.device_type,
    i.file_path,
    i.is_deleted,
    i.updated_at,
    s.key_id,
    s.algorithm,
    s.signed_at,
    s.payload_sha256,
    left(s.signature, 24) || '...'           AS signature_short,
    s.audit_status,
    s.audit_reason,
    s.audited_at,
    CASE
        WHEN s.id IS NULL                   THEN 'unsigned'
        WHEN s.audited_at >= s.signed_at    THEN s.audit_status
        ELSE 'signed - not yet audited'
    END AS signature_state
FROM product_images i
JOIN products p ON p.id = i.product_id
LEFT JOIN content_signatures s
       ON s.content_type = 'image'
      AND s.content_ref  = i.file_path;

COMMENT ON VIEW v_product_image_signatures IS
  'Each product image beside the signature of its file. A view can neither hash a file nor verify
   a signature, so signature_state is the verdict the audit last recorded (npm run sign:audit, or
   the nightly sweep); a file changed on disk since then shows only after the next audit.';

CREATE VIEW v_image_signatures AS
SELECT
    m.id,
    m.owner_type,
    m.owner_id,
    m.purpose,
    m.device_type,
    m.file_path,
    m.alt_text,
    m.created_at,
    s.key_id,
    s.algorithm,
    s.signed_at,
    s.payload_sha256,
    left(s.signature, 24) || '...'           AS signature_short,
    s.audit_status,
    s.audit_reason,
    s.audited_at,
    CASE
        WHEN s.id IS NULL                   THEN 'unsigned'
        WHEN s.audited_at >= s.signed_at    THEN s.audit_status
        ELSE 'signed - not yet audited'
    END AS signature_state
FROM media_assets m
LEFT JOIN content_signatures s
       ON s.content_type = 'image'
      AND s.content_ref  = m.file_path;

COMMENT ON VIEW v_image_signatures IS
  'Each media library image (media_assets) beside the signature of its file. A view can neither hash
   a file nor verify a signature, so signature_state is the verdict the audit last recorded (npm run
   sign:audit, or the nightly sweep); a file changed on disk since then shows only after the next audit.';
