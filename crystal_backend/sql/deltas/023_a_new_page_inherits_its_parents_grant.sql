-- 023  A page added by a delta inherits its parent's grant
--
-- Delta 021 registered the wallets screen and copied READ from the member
-- accounts screen, on the reasoning that whoever handles member support
-- should be able to see it.  That is the wrong rule, and it locked the
-- SUPER ADMINISTRATOR out of writing on a page it owns.
--
-- The seed's rule is different and it is the right one: a role's level on a
-- page is the level of its LONGEST MATCHING PREFIX grant (see levelFor in
-- 01_management.js).  SUPER_ADMIN is granted ['/admin', 3], so every page
-- under /admin is its to write - including ones that did not exist when the
-- grant was written.  Copying a sibling's level ignores that entirely.
--
-- A FRESH INSTALL WAS NEVER WRONG: the seed computes the grid from the role
-- definitions, and it already gives SUPER_ADMIN 3 here.  This only corrects
-- a database that was migrated rather than reseeded.
--
-- Idempotent, and it only ever RAISES a level - a permission somebody removed
-- on purpose is not restored by running this twice.

UPDATE manager_permissions AS child
   SET permission = parent.permission,
       updated_at = now()
  FROM manager_permissions AS parent
 WHERE child.page_id  = (SELECT id FROM manager_pages WHERE page_url = '/admin/members/wallets')
   AND parent.page_id = (SELECT id FROM manager_pages WHERE page_url = '/admin/members')
   AND parent.role_id = child.role_id
   AND parent.permission > child.permission;

-- And a role that holds the parent but was never given the child at all.
INSERT INTO manager_permissions (role_id, page_id, permission)
SELECT parent.role_id,
       (SELECT id FROM manager_pages WHERE page_url = '/admin/members/wallets'),
       parent.permission
  FROM manager_permissions AS parent
 WHERE parent.page_id = (SELECT id FROM manager_pages WHERE page_url = '/admin/members')
   AND parent.permission > 0
   AND NOT EXISTS (
         SELECT 1
           FROM manager_permissions existing
          WHERE existing.role_id = parent.role_id
            AND existing.page_id = (SELECT id FROM manager_pages WHERE page_url = '/admin/members/wallets')
       );
