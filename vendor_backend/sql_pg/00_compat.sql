-- ============================================================
-- Oracle compatibility shims
-- Run this FIRST, before any of the numbered schema files.
--
-- Purpose: let the ~1,170 db.raw() calls in models/ keep their
-- Oracle spelling instead of being rewritten by hand.
-- ============================================================

-- ---------- NVL (86 uses in models/) -------------------------
-- COALESCE is the standard equivalent. Defining NVL means none of
-- those call sites have to change.
CREATE OR REPLACE FUNCTION nvl(anyelement, anyelement)
RETURNS anyelement
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT COALESCE($1, $2) $$;

-- NVL is also called as NVL(SUM(x), 0) where the two arguments are
-- numeric and integer. Postgres resolves that through the implicit
-- integer -> numeric cast, so the polymorphic version above covers it.

-- anyelement requires BOTH arguments to settle on the same type, and it
-- will not unify varchar with text. pointModel.findActivityPointLog does
--   NVL(point_log.reason, CONCAT(point_type.main_type, ' ', ...))
-- where reason is VARCHAR(255) and CONCAT returns text, which fails to
-- resolve against the polymorphic version alone. varchar is binary
-- coercible to text, so a plain text overload covers that shape - and
-- Postgres prefers the exact match over the polymorphic one, so this
-- does not make the call ambiguous.
CREATE OR REPLACE FUNCTION nvl(text, text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT COALESCE($1, $2) $$;

-- ---------- NVL2 --------------------------------------------
CREATE OR REPLACE FUNCTION nvl2(anyelement, anyelement, anyelement)
RETURNS anyelement
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT CASE WHEN $1 IS NULL THEN $3 ELSE $2 END $$;

-- ---------- DUAL --------------------------------------------
-- Not used by the current models, but harmless and it makes any
-- copy-pasted Oracle snippet run as-is.
CREATE OR REPLACE VIEW dual AS SELECT 'X'::varchar AS dummy;

-- ============================================================
-- NOT shimmed on purpose - these need real code edits:
--
--   SYSDATE   (16 uses)  Postgres cannot resolve a bare identifier as
--                        a zero-argument function call, so SYSDATE can
--                        only become CURRENT_TIMESTAMP in the JS.
--
--   TO_CHAR() in arithmetic (14 uses)
--                        Oracle implicitly casts text to number, so
--                        TO_CHAR(d,'YYYY') - TO_CHAR(d2,'YYYY') works
--                        there. In Postgres text minus text is an
--                        error. Use EXTRACT(YEAR FROM ...) instead.
--
-- Both are handled by tools/patch_models.sh
-- ============================================================

-- TO_CHAR itself needs no shim: Postgres implements the same format
-- masks this codebase uses ('YYYY-MM-DD HH24:MI:SS', 'YYYY-MM-DD',
-- 'YYYY', 'YYYY.MM.DD', 'MM-DD'). SUBSTR, CONCAT, FLOOR and the ||
-- operator are likewise compatible as used here.
