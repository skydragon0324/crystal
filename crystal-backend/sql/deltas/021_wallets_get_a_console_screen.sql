-- 021  Member wallets get a console screen
--
-- The storefront has had wallet pages for a while and the console had none,
-- so a member's money and points were the one part of the system an operator
-- could not see.  Support answering "my top-up never arrived" had a database
-- client and nothing else.
--
-- No table changes: `wallets`, `wallet_transactions` and `point_logs` already
-- hold everything the screen needs.  What was missing was the page row, since
-- an endpoint behind requirePermission answers 403 for a page that is not
-- registered - the screen would exist and refuse to open.

INSERT INTO manager_pages (page_url, page_name, icon, sort_order, is_menu, parent_id)
SELECT '/admin/members/wallets', 'Wallets', 'MdAccountBalanceWallet',
       COALESCE(
         (SELECT sort_order + 1 FROM manager_pages WHERE page_url = '/admin/members/feedback'),
         50
       ),
       true,
       (SELECT id FROM manager_pages WHERE page_url = '/admin/members')
WHERE NOT EXISTS (SELECT 1 FROM manager_pages WHERE page_url = '/admin/members/wallets');

-- Whoever can already read the member accounts screen can read this one.
--
-- Granting nothing would be safer and is the wrong default here: the page
-- exists to be used by the people already handling member support, and a new
-- screen nobody can open is a screen nobody reports as broken.  WRITE is not
-- copied - adjusting a balance is a decision an administrator makes on
-- purpose, so it is granted by hand.
INSERT INTO manager_permissions (role_id, page_id, permission)
SELECT p.role_id,
       (SELECT id FROM manager_pages WHERE page_url = '/admin/members/wallets'),
       1
  FROM manager_permissions p
 WHERE p.page_id = (SELECT id FROM manager_pages WHERE page_url = '/admin/members/accounts')
   AND p.permission >= 1
   AND NOT EXISTS (
         SELECT 1 FROM manager_permissions x
          WHERE x.role_id = p.role_id
            AND x.page_id = (SELECT id FROM manager_pages WHERE page_url = '/admin/members/wallets')
       );
