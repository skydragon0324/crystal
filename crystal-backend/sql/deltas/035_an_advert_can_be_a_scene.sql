-- 035  An advert can be a scene, not only a picture
--
-- A hero advert has been one flat file: a picture, a GIF, or a short film.
-- The fourth thing it can be is a SCENE - a background and a few transparent
-- layers, each with its own motion and its own moment to start, drawn by the
-- storefront's ImageAnimator.  A cloud drifting in over a mountain, a phone
-- rising into frame, the copy arriving after it.
--
-- IT IS A COLUMN, NOT A TABLE.  A scene belongs to exactly one advert, is
-- edited on the same screen, is read in the same query and is thrown away
-- with the row.  Two tables and a join would buy nothing and would let a
-- scene outlive the advert it was drawn for.  JSONB rather than text so the
-- shape can be indexed and read in SQL if it ever needs to be.
--
-- The LAYER PICTURES are ordinary uploads, in the same folder and signed the
-- same way, and the API attaches a signature per layer on the way out.  So a
-- scene is verified exactly as a flat advert is - every picture in it checked
-- before it is drawn - and it inherits the file-reference bookkeeping through
-- the same path (see services/storedFiles.service.js).
--
-- WHAT THE SHAPE IS is not enforced here.  Postgres can hold any JSON; the
-- rule about what counts as a scene lives in utils/scene.js, which the write
-- path validates against and the storefront normalises with.  A CHECK
-- constraint over JSON would be the third copy of a shape that changes.
--
--   { "sceneId": "...", "duration": 5000, "width": 1920, "height": 760,
--     "background": { "src": "/uploads/...", "animation": { ... } },
--     "layers": [ { "id": "...", "src": "...", "x": 0, "y": 0,
--                   "animation": { "name": "slide-bottom", "delay": 500 } } ] }
--
-- Idempotent: each column is added only when it is absent.

ALTER TABLE site_adverts ADD COLUMN IF NOT EXISTS scene jsonb NULL;

COMMENT ON COLUMN site_adverts.scene IS
  'An animated scene - background plus layers - drawn in place of file_path when present; see utils/scene.js';

-- The product's own two runs take scenes as well: the spec asks for the
-- smartphone main image and the advertising gallery to animate too, and those
-- are rows of this table rather than adverts.
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS scene jsonb NULL;

COMMENT ON COLUMN product_images.scene IS
  'An animated scene drawn in place of file_path when present; see utils/scene.js';

-- The storefront asks "is this advert a scene" on every homepage view, and
-- the answer is almost always no. A partial index keeps that cheap and stays
-- small: only the handful of rows that are scenes are in it.
CREATE INDEX IF NOT EXISTS idx_site_adverts_scene
    ON site_adverts(placement)
 WHERE scene IS NOT NULL;
