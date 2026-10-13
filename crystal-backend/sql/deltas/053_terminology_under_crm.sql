-- ---------------------------------------------------------------------
-- Delta 053 - the terminology screen moves from Base to the CRM.
--
-- The page row is MOVED rather than replaced, so every role keeps the level
-- it was given on it. Last in the CRM group. On a database that never had
-- the Base page (a fresh install registers it under the CRM directly) this
-- changes nothing, and it is safe to run twice.
-- ---------------------------------------------------------------------

UPDATE manager_pages AS page
   SET page_url   = '/admin/crm/terminology',
       parent_id  = crm.id,
       sort_order = (SELECT COALESCE(MAX(sibling.sort_order), 0) + 10
                       FROM manager_pages AS sibling
                      WHERE sibling.parent_id = crm.id)
  FROM manager_pages AS crm
 WHERE crm.page_url = '/admin/crm'
   AND page.page_url = '/admin/base/terminology'
   AND NOT EXISTS (SELECT 1 FROM manager_pages WHERE page_url = '/admin/crm/terminology');
