-- ---------------------------------------------------------------------
-- Delta 055 - the Customer Lifecycle KPIs page, and its permission.
--
-- A grant in this console is per admin page URL, so the page row IS the
-- permission the API checks: routes/lifecycle.routes.js guards every endpoint
-- with requirePermission('/admin/crm/lifecycle'). Without this row nobody can
-- be granted the feature, and every one of its endpoints answers 403 -
-- including to an administrator who can see everything else.
--
-- LAST IN THE CRM GROUP, beside the other customer screens, which is where an
-- operator would look for it.
--
-- NO ROLE IS GRANTED ANYTHING HERE. Registering a page and granting it are
-- two decisions, and the second belongs to whoever runs the console - a
-- migration that quietly handed every existing role a new screen carrying
-- customers' birthdays would be making an access-control decision on their
-- behalf.
--
-- Safe to run twice.
-- ---------------------------------------------------------------------

INSERT INTO manager_pages (page_url, page_name, icon, parent_id, sort_order, is_menu)
SELECT '/admin/crm/lifecycle',
       'Customer lifecycle KPIs',
       'MdTimeline',
       crm.id,
       (SELECT COALESCE(MAX(sibling.sort_order), 0) + 10
          FROM manager_pages AS sibling
         WHERE sibling.parent_id = crm.id),
       true
  FROM manager_pages AS crm
 WHERE crm.page_url = '/admin/crm'
   AND NOT EXISTS (
     SELECT 1 FROM manager_pages WHERE page_url = '/admin/crm/lifecycle'
   );
