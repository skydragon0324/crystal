-- 031  The About page's pictures leave the database
--
-- The About page was the last screen whose artwork was DATA.  Its words had
-- already moved into the site's own source (delta 019,
-- crystal-web/src/pages/about/content.js) because a company's account of
-- itself is rewritten every few years by somebody who cares about the
-- wording; the photographs stayed behind in about_images, uploaded through a
-- console screen and served from /uploads/about/.
--
-- THE PICTURES HAVE FOLLOWED THE WORDS.  They are files in the web project
-- now - crystal-web/src/assets/images/about/, listed in
-- crystal-web/src/pages/about/images.js - which buys three things the table
-- could not:
--
--   they are versioned and reviewed with the copy they illustrate, instead of
--   being an upload nobody can diff;
--
--   the build fingerprints each file, so a replaced picture reaches every
--   browser at once rather than waiting behind a cached /uploads/ address,
--   and a picture that is missing is a build error rather than a hole in the
--   page;
--
--   and the page fetches nothing at all to draw itself.
--
-- The cost is that changing one needs a developer and a deploy.  That is the
-- right trade for artwork that changes with the design rather than with the
-- business - and it was already the trade made for the words beside it.
--
-- WHAT GOES WITH THE TABLE: the console screen (/admin/company/about-images
-- and the Company group that held only it), the storefront's GET /about, the
-- seed, and the signatures of the files themselves.  Uploaded images are
-- signed and audited (delta 029), so leaving those rows behind would make
-- `npm run sign:audit` report every one of them MISSING for ever.

DELETE FROM content_signatures
 WHERE content_type = 'image'
   AND content_ref LIKE '/uploads/about/%';

-- The screen, then the group that existed only to hold it.  Grants against
-- either go with them: manager_permissions references the page ON DELETE
-- CASCADE, so a role keeps every grant it still has a screen for.
DELETE FROM manager_pages WHERE page_url = '/admin/company/about-images';
DELETE FROM manager_pages WHERE page_url = '/admin/company';

DROP TABLE IF EXISTS about_images;
