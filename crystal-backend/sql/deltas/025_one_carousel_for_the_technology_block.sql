-- 025  The technology block has one carousel, not one per technology
--
-- Delta 024 gave each of the institute's seven technologies its own
-- certificate slot (institute.technology.crystal-os, .bios, ...). There are
-- fewer certificates than technologies, so most rows sat beside an empty
-- frame; the page now lists the technologies as titles and shows ONE carousel
-- of certificates beside the list, from the single slot
-- 'institute.technology'.
--
-- MOVED, NOT RETIRED. A certificate already uploaded under one technology's
-- slot is still a certificate of Crystal's technology, so it joins the one
-- carousel rather than going to the recycle bin. Its order is kept, offset by
-- the technology's old position so two technologies' first scans do not tie.
--
-- Idempotent: once moved, no row matches 'institute.technology.%'.

UPDATE about_images
   SET slot       = 'institute.technology',
       sort_order = sort_order + 100 * CASE slot
                      WHEN 'institute.technology.crystal-os'           THEN 1
                      WHEN 'institute.technology.smarttv-os'           THEN 2
                      WHEN 'institute.technology.bios'                 THEN 3
                      WHEN 'institute.technology.camera-security'      THEN 4
                      WHEN 'institute.technology.print-authentication' THEN 5
                      WHEN 'institute.technology.exfat'                THEN 6
                      WHEN 'institute.technology.cordless-encryption'  THEN 7
                      ELSE 8
                    END,
       updated_at = NOW()
 WHERE slot LIKE 'institute.technology.%';
