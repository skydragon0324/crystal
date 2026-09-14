-- =====================================================================
-- seed_mock_data.sql - fixture data for the vendor site
--
-- GENERATED FILE. Do not edit by hand.
--   Source:    mock/fixtures.js
--   Generator: node mock/generate_seed_sql.js
--
-- These are the same rows the mock API serves with USE_MOCK=true, so a
-- page behaves identically against either.
--
-- Prerequisites: run sql_pg/00_compat.sql and the numbered schema files
-- first. This file only inserts rows.
--
-- Schema: models/ qualify every table as "ora_pid.<table>", so the tables
-- have to live in a schema called ora_pid. The search_path below points
-- there and falls back to public. Adjust if your deployment differs.
--
-- Re-runnable: every statement is preceded by a DELETE of the rows it
-- inserts, so running this twice leaves the same state as running it once.
-- It touches ONLY the pk ranges used below and will not disturb real data,
-- but do not run it against production.
-- =====================================================================

SET search_path TO ora_pid, public;

BEGIN;

-- ---------------------------------------------------------------
-- Remove any previous seed. Ordered children-first so the foreign
-- keys never block the delete.
-- ---------------------------------------------------------------
DELETE FROM phone_changelog     WHERE product_pk BETWEEN 101 AND 199;
DELETE FROM phone_accessories   WHERE product_pk BETWEEN 101 AND 199;
DELETE FROM product_models      WHERE product_pk BETWEEN 101 AND 199;
DELETE FROM product_spec_values WHERE product_pk BETWEEN 101 AND 199;
DELETE FROM product_spec_orders WHERE root_pk = 1;
DELETE FROM product_images      WHERE product_pk BETWEEN 101 AND 199;
DELETE FROM products            WHERE product_pk BETWEEN 101 AND 199;
DELETE FROM product_spec_keys   WHERE spec_pk BETWEEN 1 AND 99;
DELETE FROM product_categories  WHERE category_pk IN (1, 13, 15, 17);
DELETE FROM faqs                WHERE faq_pk BETWEEN 1 AND 999;
DELETE FROM phone_agencies      WHERE agency_pk BETWEEN 1 AND 999;
-- users and locations are deliberately absent: both are upserted
-- further down instead. See the comment on the users INSERT.
DELETE FROM managers            WHERE manager_pk = 1;


-- ---------------------------------------------------------------
-- Locations (provinces).
--
-- parent_code is the STRING '0' for a top-level region, not NULL:
-- userModel.findProvinces filters on .where("loc.parent_code", "0"),
-- so a NULL here means /vendor/api/provinces answers 200 with an empty
-- list and every province dropdown on the site is blank.
--
-- Upserted for the same reason as users, which references it through
-- users.location_pk.
-- ---------------------------------------------------------------
INSERT INTO locations (location_pk, location_name, location_code, parent_code, position) VALUES
  (1, 'Capital', '01', '0', 1),
  (2, 'North Province', '02', '0', 2),
  (3, 'South Province', '03', '0', 3),
  (4, 'East Province', '04', '0', 4),
  (5, 'West Province', '05', '0', 5),
  (6, 'Coastal Region', '06', '0', 6),
  (7, 'Highland Region', '07', '0', 7)
ON CONFLICT (location_pk) DO UPDATE SET
  location_name = EXCLUDED.location_name,
  location_code = EXCLUDED.location_code,
  parent_code   = EXCLUDED.parent_code,
  position      = EXCLUDED.position;


-- ---------------------------------------------------------------
-- One manager. faqs.created_by is a NOT NULL foreign key onto this
-- table, so the FAQ rows below cannot be inserted without it.
-- Password is MD5('1234').
-- ---------------------------------------------------------------
INSERT INTO managers (manager_pk, manager_id, manager_name, password, role_pk) VALUES
  (1, 'seedadmin', 'Seed Administrator', '81dc9bdb52d04dc20036dbd8313ed055', NULL);


-- ---------------------------------------------------------------
-- Users. Passwords are stored as the MD5 the client posts:
--   demo    / 1234
--   tester  / 123456
--   fixed01 / 1234
-- gender is CHAR(1) constrained to 'M' or 'F'.
--
-- Upserted rather than deleted and reinserted. Almost every table in the
-- account area is a child of users, so once seed_mock_account.sql has
-- run, a DELETE here fails on whichever foreign key it meets first -
-- and listing them all would mean this file had to be edited every time
-- the account seed grew a table.
-- ---------------------------------------------------------------
INSERT INTO users (user_pk, user_id, password, user_name, gender, birthday, location_pk, cid, status, locked, created_at) VALUES
  (1001, 'demo', '81dc9bdb52d04dc20036dbd8313ed055', 'Demo User', 'M', '1992-04-18 00:00:00'::timestamp, 1, '1980001234', 1, 0, '2024-01-12 09:00:00'::timestamp),
  (1002, 'tester', 'e10adc3949ba59abbe56e057f20f883e', 'QA Tester', 'F', '1988-11-02 00:00:00'::timestamp, 2, '1980005678', 1, 0, '2024-09-28 09:00:00'::timestamp),
  (2001, 'fixed01', '81dc9bdb52d04dc20036dbd8313ed055', 'Fixed Line Customer', 'M', '1975-01-30 00:00:00'::timestamp, 7, '2380009999', 1, 0, '2023-03-18 09:00:00'::timestamp)
ON CONFLICT (user_pk) DO UPDATE SET
  user_id     = EXCLUDED.user_id,
  password    = EXCLUDED.password,
  user_name   = EXCLUDED.user_name,
  gender      = EXCLUDED.gender,
  birthday    = EXCLUDED.birthday,
  location_pk = EXCLUDED.location_pk,
  cid         = EXCLUDED.cid,
  status      = EXCLUDED.status,
  locked      = EXCLUDED.locked;


-- ---------------------------------------------------------------
-- Product categories.
--
-- productModel.findProductPhonesForWeb joins products.root_pk to the
-- category whose parent_pk = 0 and whose category_name is exactly the
-- PRODUCT_CATEGORY_PHONE string from lang/en.js. Rename the root and the
-- product list on the site goes empty with no error anywhere.
-- ---------------------------------------------------------------
INSERT INTO product_categories (category_pk, category_name, node_value, parent_pk, position, is_leaf, is_deleted) VALUES
  (1, 'Smart Phone', '1', 0, 1, 0, 0),
  (13, 'S-9', '13', 1, 1, 1, 0),
  (15, 'S-7', '15', 1, 2, 1, 0),
  (17, 'S-5', '17', 1, 3, 1, 0);


-- ---------------------------------------------------------------
-- Products. status = 1 (SYNC_STATUS.APPROVED) and is_deleted = 0
-- (FLAG_EXIST) are both required by the web query.
-- price = -1 is the "price on request" sentinel the grid renders as "--".
-- ---------------------------------------------------------------
INSERT INTO products (product_pk, product_name, simple_name, category_pk, root_pk, image_url, price, position, is_new, is_deleted, status, created_at) VALUES
  (101, 'S-9 64GB Graphite', 'S-9-64', 13, 1, 'uploads/products/s-9-1.png', 2200000, 1, 1, 0, 1, '2025-05-27 09:00:00'::timestamp),
  (102, 'S-9 128GB Silver', 'S-9-128', 13, 1, 'uploads/products/s-9-2.png', 2320000, 2, 0, 0, 1, '2024-08-06 09:00:00'::timestamp),
  (103, 'S-9 256GB Midnight', 'S-9-256', 13, 1, 'uploads/products/s-9-3.png', 2440000, 3, 0, 0, 1, '2024-07-24 09:00:00'::timestamp),
  (104, 'S-9 512GB Ocean', 'S-9-512', 13, 1, 'uploads/products/s-9-4.png', 2560000, 4, 0, 0, 1, '2024-05-24 09:00:00'::timestamp),
  (105, 'S-9 64GB Sand', 'S-9-64', 13, 1, 'uploads/products/s-9-5.png', 2680000, 5, 0, 0, 1, '2025-03-05 09:00:00'::timestamp),
  (106, 'S-9 128GB Graphite', 'S-9-128', 13, 1, 'uploads/products/s-9-6.png', -1, 6, 0, 0, 1, '2024-10-26 09:00:00'::timestamp),
  (107, 'S-7 64GB Graphite', 'S-7-64', 15, 1, 'uploads/products/s-7-1.png', 1700000, 1, 1, 0, 1, '2025-08-28 09:00:00'::timestamp),
  (108, 'S-7 128GB Silver', 'S-7-128', 15, 1, 'uploads/products/s-7-2.png', 1820000, 2, 0, 0, 1, '2026-01-18 09:00:00'::timestamp),
  (109, 'S-7 256GB Midnight', 'S-7-256', 15, 1, 'uploads/products/s-7-3.png', 1940000, 3, 0, 0, 1, '2026-04-14 09:00:00'::timestamp),
  (110, 'S-7 512GB Ocean', 'S-7-512', 15, 1, 'uploads/products/s-7-4.png', 2060000, 4, 0, 0, 1, '2024-06-17 09:00:00'::timestamp),
  (111, 'S-7 64GB Sand', 'S-7-64', 15, 1, 'uploads/products/s-7-5.png', 2180000, 5, 0, 0, 1, '2024-06-04 09:00:00'::timestamp),
  (112, 'S-7 128GB Graphite', 'S-7-128', 15, 1, 'uploads/products/s-7-6.png', -1, 6, 0, 0, 1, '2025-03-11 09:00:00'::timestamp),
  (113, 'S-5 64GB Graphite', 'S-5-64', 17, 1, 'uploads/products/s-5-1.png', 1200000, 1, 1, 0, 1, '2026-01-30 09:00:00'::timestamp),
  (114, 'S-5 128GB Silver', 'S-5-128', 17, 1, 'uploads/products/s-5-2.png', 1320000, 2, 0, 0, 1, '2025-01-21 09:00:00'::timestamp),
  (115, 'S-5 256GB Midnight', 'S-5-256', 17, 1, 'uploads/products/s-5-3.png', 1440000, 3, 0, 0, 1, '2025-10-17 09:00:00'::timestamp),
  (116, 'S-5 512GB Ocean', 'S-5-512', 17, 1, 'uploads/products/s-5-4.png', 1560000, 4, 0, 0, 1, '2025-07-04 09:00:00'::timestamp),
  (117, 'S-5 64GB Sand', 'S-5-64', 17, 1, 'uploads/products/s-5-5.png', 1680000, 5, 0, 0, 1, '2025-09-03 09:00:00'::timestamp),
  (118, 'S-5 128GB Graphite', 'S-5-128', 17, 1, 'uploads/products/s-5-6.png', -1, 6, 0, 0, 1, '2024-06-30 09:00:00'::timestamp);


-- ---------------------------------------------------------------
-- Product images. image_type 0 = main (the hero on the spec tab),
-- 1 = intro (the gallery). status = 1 so the client filter passes.
-- ---------------------------------------------------------------
INSERT INTO product_images (table_pk, product_pk, image_type, image_url, image_ratio, position, is_deleted, status) VALUES
  (1, 101, 0, 'uploads/products/s-9-1.png', 1.0000, 1, 0, 1),
  (2, 101, 1, 'uploads/products/intro/101-1.jpg', 1.0000, 1, 0, 1),
  (3, 101, 1, 'uploads/products/intro/101-2.jpg', 1.0000, 2, 0, 1),
  (4, 101, 1, 'uploads/products/intro/101-3.jpg', 1.0000, 3, 0, 1),
  (5, 101, 1, 'uploads/products/intro/101-4.jpg', 1.0000, 4, 0, 1),
  (6, 102, 0, 'uploads/products/s-9-2.png', 1.0000, 1, 0, 1),
  (7, 102, 1, 'uploads/products/intro/102-1.jpg', 1.0000, 1, 0, 1),
  (8, 102, 1, 'uploads/products/intro/102-2.jpg', 1.0000, 2, 0, 1),
  (9, 102, 1, 'uploads/products/intro/102-3.jpg', 1.0000, 3, 0, 1),
  (10, 102, 1, 'uploads/products/intro/102-4.jpg', 1.0000, 4, 0, 1),
  (11, 103, 0, 'uploads/products/s-9-3.png', 1.0000, 1, 0, 1),
  (12, 103, 1, 'uploads/products/intro/103-1.jpg', 1.0000, 1, 0, 1),
  (13, 103, 1, 'uploads/products/intro/103-2.jpg', 1.0000, 2, 0, 1),
  (14, 103, 1, 'uploads/products/intro/103-3.jpg', 1.0000, 3, 0, 1),
  (15, 103, 1, 'uploads/products/intro/103-4.jpg', 1.0000, 4, 0, 1),
  (16, 104, 0, 'uploads/products/s-9-4.png', 1.0000, 1, 0, 1),
  (17, 104, 1, 'uploads/products/intro/104-1.jpg', 1.0000, 1, 0, 1),
  (18, 104, 1, 'uploads/products/intro/104-2.jpg', 1.0000, 2, 0, 1),
  (19, 104, 1, 'uploads/products/intro/104-3.jpg', 1.0000, 3, 0, 1),
  (20, 104, 1, 'uploads/products/intro/104-4.jpg', 1.0000, 4, 0, 1),
  (21, 105, 0, 'uploads/products/s-9-5.png', 1.0000, 1, 0, 1),
  (22, 105, 1, 'uploads/products/intro/105-1.jpg', 1.0000, 1, 0, 1),
  (23, 105, 1, 'uploads/products/intro/105-2.jpg', 1.0000, 2, 0, 1),
  (24, 105, 1, 'uploads/products/intro/105-3.jpg', 1.0000, 3, 0, 1),
  (25, 105, 1, 'uploads/products/intro/105-4.jpg', 1.0000, 4, 0, 1),
  (26, 106, 0, 'uploads/products/s-9-6.png', 1.0000, 1, 0, 1),
  (27, 106, 1, 'uploads/products/intro/106-1.jpg', 1.0000, 1, 0, 1),
  (28, 106, 1, 'uploads/products/intro/106-2.jpg', 1.0000, 2, 0, 1),
  (29, 106, 1, 'uploads/products/intro/106-3.jpg', 1.0000, 3, 0, 1),
  (30, 106, 1, 'uploads/products/intro/106-4.jpg', 1.0000, 4, 0, 1),
  (31, 107, 0, 'uploads/products/s-7-1.png', 1.0000, 1, 0, 1),
  (32, 107, 1, 'uploads/products/intro/107-1.jpg', 1.0000, 1, 0, 1),
  (33, 107, 1, 'uploads/products/intro/107-2.jpg', 1.0000, 2, 0, 1),
  (34, 107, 1, 'uploads/products/intro/107-3.jpg', 1.0000, 3, 0, 1),
  (35, 107, 1, 'uploads/products/intro/107-4.jpg', 1.0000, 4, 0, 1),
  (36, 108, 0, 'uploads/products/s-7-2.png', 1.0000, 1, 0, 1),
  (37, 108, 1, 'uploads/products/intro/108-1.jpg', 1.0000, 1, 0, 1),
  (38, 108, 1, 'uploads/products/intro/108-2.jpg', 1.0000, 2, 0, 1),
  (39, 108, 1, 'uploads/products/intro/108-3.jpg', 1.0000, 3, 0, 1),
  (40, 108, 1, 'uploads/products/intro/108-4.jpg', 1.0000, 4, 0, 1),
  (41, 109, 0, 'uploads/products/s-7-3.png', 1.0000, 1, 0, 1),
  (42, 109, 1, 'uploads/products/intro/109-1.jpg', 1.0000, 1, 0, 1),
  (43, 109, 1, 'uploads/products/intro/109-2.jpg', 1.0000, 2, 0, 1),
  (44, 109, 1, 'uploads/products/intro/109-3.jpg', 1.0000, 3, 0, 1),
  (45, 109, 1, 'uploads/products/intro/109-4.jpg', 1.0000, 4, 0, 1),
  (46, 110, 0, 'uploads/products/s-7-4.png', 1.0000, 1, 0, 1),
  (47, 110, 1, 'uploads/products/intro/110-1.jpg', 1.0000, 1, 0, 1),
  (48, 110, 1, 'uploads/products/intro/110-2.jpg', 1.0000, 2, 0, 1),
  (49, 110, 1, 'uploads/products/intro/110-3.jpg', 1.0000, 3, 0, 1),
  (50, 110, 1, 'uploads/products/intro/110-4.jpg', 1.0000, 4, 0, 1),
  (51, 111, 0, 'uploads/products/s-7-5.png', 1.0000, 1, 0, 1),
  (52, 111, 1, 'uploads/products/intro/111-1.jpg', 1.0000, 1, 0, 1),
  (53, 111, 1, 'uploads/products/intro/111-2.jpg', 1.0000, 2, 0, 1),
  (54, 111, 1, 'uploads/products/intro/111-3.jpg', 1.0000, 3, 0, 1),
  (55, 111, 1, 'uploads/products/intro/111-4.jpg', 1.0000, 4, 0, 1),
  (56, 112, 0, 'uploads/products/s-7-6.png', 1.0000, 1, 0, 1),
  (57, 112, 1, 'uploads/products/intro/112-1.jpg', 1.0000, 1, 0, 1),
  (58, 112, 1, 'uploads/products/intro/112-2.jpg', 1.0000, 2, 0, 1),
  (59, 112, 1, 'uploads/products/intro/112-3.jpg', 1.0000, 3, 0, 1),
  (60, 112, 1, 'uploads/products/intro/112-4.jpg', 1.0000, 4, 0, 1),
  (61, 113, 0, 'uploads/products/s-5-1.png', 1.0000, 1, 0, 1),
  (62, 113, 1, 'uploads/products/intro/113-1.jpg', 1.0000, 1, 0, 1),
  (63, 113, 1, 'uploads/products/intro/113-2.jpg', 1.0000, 2, 0, 1),
  (64, 113, 1, 'uploads/products/intro/113-3.jpg', 1.0000, 3, 0, 1),
  (65, 113, 1, 'uploads/products/intro/113-4.jpg', 1.0000, 4, 0, 1),
  (66, 114, 0, 'uploads/products/s-5-2.png', 1.0000, 1, 0, 1),
  (67, 114, 1, 'uploads/products/intro/114-1.jpg', 1.0000, 1, 0, 1),
  (68, 114, 1, 'uploads/products/intro/114-2.jpg', 1.0000, 2, 0, 1),
  (69, 114, 1, 'uploads/products/intro/114-3.jpg', 1.0000, 3, 0, 1),
  (70, 114, 1, 'uploads/products/intro/114-4.jpg', 1.0000, 4, 0, 1),
  (71, 115, 0, 'uploads/products/s-5-3.png', 1.0000, 1, 0, 1),
  (72, 115, 1, 'uploads/products/intro/115-1.jpg', 1.0000, 1, 0, 1),
  (73, 115, 1, 'uploads/products/intro/115-2.jpg', 1.0000, 2, 0, 1),
  (74, 115, 1, 'uploads/products/intro/115-3.jpg', 1.0000, 3, 0, 1),
  (75, 115, 1, 'uploads/products/intro/115-4.jpg', 1.0000, 4, 0, 1),
  (76, 116, 0, 'uploads/products/s-5-4.png', 1.0000, 1, 0, 1),
  (77, 116, 1, 'uploads/products/intro/116-1.jpg', 1.0000, 1, 0, 1),
  (78, 116, 1, 'uploads/products/intro/116-2.jpg', 1.0000, 2, 0, 1),
  (79, 116, 1, 'uploads/products/intro/116-3.jpg', 1.0000, 3, 0, 1),
  (80, 116, 1, 'uploads/products/intro/116-4.jpg', 1.0000, 4, 0, 1),
  (81, 117, 0, 'uploads/products/s-5-5.png', 1.0000, 1, 0, 1),
  (82, 117, 1, 'uploads/products/intro/117-1.jpg', 1.0000, 1, 0, 1),
  (83, 117, 1, 'uploads/products/intro/117-2.jpg', 1.0000, 2, 0, 1),
  (84, 117, 1, 'uploads/products/intro/117-3.jpg', 1.0000, 3, 0, 1),
  (85, 117, 1, 'uploads/products/intro/117-4.jpg', 1.0000, 4, 0, 1),
  (86, 118, 0, 'uploads/products/s-5-6.png', 1.0000, 1, 0, 1),
  (87, 118, 1, 'uploads/products/intro/118-1.jpg', 1.0000, 1, 0, 1),
  (88, 118, 1, 'uploads/products/intro/118-2.jpg', 1.0000, 2, 0, 1),
  (89, 118, 1, 'uploads/products/intro/118-3.jpg', 1.0000, 3, 0, 1),
  (90, 118, 1, 'uploads/products/intro/118-4.jpg', 1.0000, 4, 0, 1);


-- ---------------------------------------------------------------
-- Spec keys are shared across products; the per-product text lives in
-- product_spec_values. spec_type 0 = plain string, which is the only
-- type the client spec table renders.
-- ---------------------------------------------------------------
INSERT INTO product_spec_keys (spec_pk, spec_name, spec_type, is_deleted) VALUES
  (1, 'Display', 0, 0),
  (2, 'Processor', 0, 0),
  (3, 'Memory', 0, 0),
  (4, 'Storage', 0, 0),
  (5, 'Rear Camera', 0, 0),
  (6, 'Front Camera', 0, 0),
  (7, 'Battery', 0, 0),
  (8, 'Operating System', 0, 0),
  (9, 'Network', 0, 0),
  (10, 'SIM', 0, 0),
  (11, 'Connectivity', 0, 0),
  (12, 'Dimensions', 0, 0),
  (13, 'Weight', 0, 0),
  (14, 'Water Resistance', 0, 0);


-- ---------------------------------------------------------------
-- Spec ordering, per root category. findSpecKeyAndValues drives the
-- whole spec table off this table, left-joining the values - so a key
-- missing from here never appears, however many values it has.
-- ---------------------------------------------------------------
INSERT INTO product_spec_orders (table_pk, root_pk, spec_pk, position, is_deleted) VALUES
  (1, 1, 1, 1, 0),
  (2, 1, 2, 2, 0),
  (3, 1, 3, 3, 0),
  (4, 1, 4, 4, 0),
  (5, 1, 5, 5, 0),
  (6, 1, 6, 6, 0),
  (7, 1, 7, 7, 0),
  (8, 1, 8, 8, 0),
  (9, 1, 9, 9, 0),
  (10, 1, 10, 10, 0),
  (11, 1, 11, 11, 0),
  (12, 1, 12, 12, 0),
  (13, 1, 13, 13, 0),
  (14, 1, 14, 14, 0);


-- ---------------------------------------------------------------
-- Spec values, unique per (product_pk, spec_pk).
-- ---------------------------------------------------------------
INSERT INTO product_spec_values (table_pk, product_pk, spec_pk, spec_value, position) VALUES
  (1, 101, 1, '6.7" AMOLED, 2400 x 1080, 120Hz', 1),
  (2, 101, 2, 'Octa-core 2.8GHz', 2),
  (3, 101, 3, '8GB RAM', 3),
  (4, 101, 4, '64GB, expandable to 1TB', 4),
  (5, 101, 5, '50MP wide + 12MP ultrawide + 5MP macro', 5),
  (6, 101, 6, '16MP', 6),
  (7, 101, 7, '5000mAh, 33W fast charge', 7),
  (8, 101, 8, 'Vendor OS 5.1', 8),
  (9, 101, 9, '2G / 3G / 4G LTE', 9),
  (10, 101, 10, 'Dual nano-SIM', 10),
  (11, 101, 11, 'Wi-Fi 6, Bluetooth 5.2, GPS', 11),
  (12, 101, 12, '163.2 x 75.6 x 8.3 mm', 12),
  (13, 101, 13, '198 g', 13),
  (14, 101, 14, 'IP53', 14),
  (15, 102, 1, '6.7" AMOLED, 2400 x 1080, 120Hz', 1),
  (16, 102, 2, 'Octa-core 2.8GHz', 2),
  (17, 102, 3, '8GB RAM', 3),
  (18, 102, 4, '128GB, expandable to 1TB', 4),
  (19, 102, 5, '50MP wide + 12MP ultrawide + 5MP macro', 5),
  (20, 102, 6, '16MP', 6),
  (21, 102, 7, '5000mAh, 33W fast charge', 7),
  (22, 102, 8, 'Vendor OS 5.1', 8),
  (23, 102, 9, '2G / 3G / 4G LTE', 9),
  (24, 102, 10, 'Dual nano-SIM', 10),
  (25, 102, 11, 'Wi-Fi 6, Bluetooth 5.2, GPS', 11),
  (26, 102, 12, '163.2 x 75.6 x 8.3 mm', 12),
  (27, 102, 13, '198 g', 13),
  (28, 102, 14, 'IP53', 14),
  (29, 103, 1, '6.7" AMOLED, 2400 x 1080, 120Hz', 1),
  (30, 103, 2, 'Octa-core 2.8GHz', 2),
  (31, 103, 3, '8GB RAM', 3),
  (32, 103, 4, '256GB, expandable to 1TB', 4),
  (33, 103, 5, '50MP wide + 12MP ultrawide + 5MP macro', 5),
  (34, 103, 6, '16MP', 6),
  (35, 103, 7, '5000mAh, 33W fast charge', 7),
  (36, 103, 8, 'Vendor OS 5.1', 8),
  (37, 103, 9, '2G / 3G / 4G LTE', 9),
  (38, 103, 10, 'Dual nano-SIM', 10),
  (39, 103, 11, 'Wi-Fi 6, Bluetooth 5.2, GPS', 11),
  (40, 103, 12, '163.2 x 75.6 x 8.3 mm', 12),
  (41, 103, 13, '198 g', 13),
  (42, 103, 14, 'IP53', 14),
  (43, 104, 1, '6.7" AMOLED, 2400 x 1080, 120Hz', 1),
  (44, 104, 2, 'Octa-core 2.8GHz', 2),
  (45, 104, 3, '8GB RAM', 3),
  (46, 104, 4, '512GB, expandable to 1TB', 4),
  (47, 104, 5, '50MP wide + 12MP ultrawide + 5MP macro', 5),
  (48, 104, 6, '16MP', 6),
  (49, 104, 7, '5000mAh, 33W fast charge', 7),
  (50, 104, 8, 'Vendor OS 5.1', 8),
  (51, 104, 9, '2G / 3G / 4G LTE', 9),
  (52, 104, 10, 'Dual nano-SIM', 10),
  (53, 104, 11, 'Wi-Fi 6, Bluetooth 5.2, GPS', 11),
  (54, 104, 12, '163.2 x 75.6 x 8.3 mm', 12),
  (55, 104, 13, '198 g', 13),
  (56, 104, 14, 'IP53', 14),
  (57, 105, 1, '6.7" AMOLED, 2400 x 1080, 120Hz', 1),
  (58, 105, 2, 'Octa-core 2.8GHz', 2),
  (59, 105, 3, '8GB RAM', 3),
  (60, 105, 4, '64GB, expandable to 1TB', 4),
  (61, 105, 5, '50MP wide + 12MP ultrawide + 5MP macro', 5),
  (62, 105, 6, '16MP', 6),
  (63, 105, 7, '5000mAh, 33W fast charge', 7),
  (64, 105, 8, 'Vendor OS 5.1', 8),
  (65, 105, 9, '2G / 3G / 4G LTE', 9),
  (66, 105, 10, 'Dual nano-SIM', 10),
  (67, 105, 11, 'Wi-Fi 6, Bluetooth 5.2, GPS', 11),
  (68, 105, 12, '163.2 x 75.6 x 8.3 mm', 12),
  (69, 105, 13, '198 g', 13),
  (70, 105, 14, 'IP53', 14),
  (71, 106, 1, '6.7" AMOLED, 2400 x 1080, 120Hz', 1),
  (72, 106, 2, 'Octa-core 2.8GHz', 2),
  (73, 106, 3, '8GB RAM', 3),
  (74, 106, 4, '128GB, expandable to 1TB', 4),
  (75, 106, 5, '50MP wide + 12MP ultrawide + 5MP macro', 5),
  (76, 106, 6, '16MP', 6),
  (77, 106, 7, '5000mAh, 33W fast charge', 7),
  (78, 106, 8, 'Vendor OS 5.1', 8),
  (79, 106, 9, '2G / 3G / 4G LTE', 9),
  (80, 106, 10, 'Dual nano-SIM', 10),
  (81, 106, 11, 'Wi-Fi 6, Bluetooth 5.2, GPS', 11),
  (82, 106, 12, '163.2 x 75.6 x 8.3 mm', 12),
  (83, 106, 13, '198 g', 13),
  (84, 106, 14, 'IP53', 14),
  (85, 107, 1, '6.7" AMOLED, 2400 x 1080, 120Hz', 1),
  (86, 107, 2, 'Octa-core 2.8GHz', 2),
  (87, 107, 3, '8GB RAM', 3),
  (88, 107, 4, '64GB, expandable to 1TB', 4),
  (89, 107, 5, '50MP wide + 12MP ultrawide + 5MP macro', 5),
  (90, 107, 6, '16MP', 6),
  (91, 107, 7, '5000mAh, 33W fast charge', 7),
  (92, 107, 8, 'Vendor OS 5.1', 8),
  (93, 107, 9, '2G / 3G / 4G LTE', 9),
  (94, 107, 10, 'Dual nano-SIM', 10),
  (95, 107, 11, 'Wi-Fi 6, Bluetooth 5.2, GPS', 11),
  (96, 107, 12, '163.2 x 75.6 x 8.3 mm', 12),
  (97, 107, 13, '198 g', 13),
  (98, 107, 14, 'IP53', 14),
  (99, 108, 1, '6.7" AMOLED, 2400 x 1080, 120Hz', 1),
  (100, 108, 2, 'Octa-core 2.8GHz', 2),
  (101, 108, 3, '8GB RAM', 3),
  (102, 108, 4, '128GB, expandable to 1TB', 4),
  (103, 108, 5, '50MP wide + 12MP ultrawide + 5MP macro', 5),
  (104, 108, 6, '16MP', 6),
  (105, 108, 7, '5000mAh, 33W fast charge', 7),
  (106, 108, 8, 'Vendor OS 5.1', 8),
  (107, 108, 9, '2G / 3G / 4G LTE', 9),
  (108, 108, 10, 'Dual nano-SIM', 10),
  (109, 108, 11, 'Wi-Fi 6, Bluetooth 5.2, GPS', 11),
  (110, 108, 12, '163.2 x 75.6 x 8.3 mm', 12),
  (111, 108, 13, '198 g', 13),
  (112, 108, 14, 'IP53', 14),
  (113, 109, 1, '6.7" AMOLED, 2400 x 1080, 120Hz', 1),
  (114, 109, 2, 'Octa-core 2.8GHz', 2),
  (115, 109, 3, '8GB RAM', 3),
  (116, 109, 4, '256GB, expandable to 1TB', 4),
  (117, 109, 5, '50MP wide + 12MP ultrawide + 5MP macro', 5),
  (118, 109, 6, '16MP', 6),
  (119, 109, 7, '5000mAh, 33W fast charge', 7),
  (120, 109, 8, 'Vendor OS 5.1', 8),
  (121, 109, 9, '2G / 3G / 4G LTE', 9),
  (122, 109, 10, 'Dual nano-SIM', 10),
  (123, 109, 11, 'Wi-Fi 6, Bluetooth 5.2, GPS', 11),
  (124, 109, 12, '163.2 x 75.6 x 8.3 mm', 12),
  (125, 109, 13, '198 g', 13),
  (126, 109, 14, 'IP53', 14),
  (127, 110, 1, '6.7" AMOLED, 2400 x 1080, 120Hz', 1),
  (128, 110, 2, 'Octa-core 2.8GHz', 2),
  (129, 110, 3, '8GB RAM', 3),
  (130, 110, 4, '512GB, expandable to 1TB', 4),
  (131, 110, 5, '50MP wide + 12MP ultrawide + 5MP macro', 5),
  (132, 110, 6, '16MP', 6),
  (133, 110, 7, '5000mAh, 33W fast charge', 7),
  (134, 110, 8, 'Vendor OS 5.1', 8),
  (135, 110, 9, '2G / 3G / 4G LTE', 9),
  (136, 110, 10, 'Dual nano-SIM', 10),
  (137, 110, 11, 'Wi-Fi 6, Bluetooth 5.2, GPS', 11),
  (138, 110, 12, '163.2 x 75.6 x 8.3 mm', 12),
  (139, 110, 13, '198 g', 13),
  (140, 110, 14, 'IP53', 14),
  (141, 111, 1, '6.7" AMOLED, 2400 x 1080, 120Hz', 1),
  (142, 111, 2, 'Octa-core 2.8GHz', 2),
  (143, 111, 3, '8GB RAM', 3),
  (144, 111, 4, '64GB, expandable to 1TB', 4),
  (145, 111, 5, '50MP wide + 12MP ultrawide + 5MP macro', 5),
  (146, 111, 6, '16MP', 6),
  (147, 111, 7, '5000mAh, 33W fast charge', 7),
  (148, 111, 8, 'Vendor OS 5.1', 8),
  (149, 111, 9, '2G / 3G / 4G LTE', 9),
  (150, 111, 10, 'Dual nano-SIM', 10),
  (151, 111, 11, 'Wi-Fi 6, Bluetooth 5.2, GPS', 11),
  (152, 111, 12, '163.2 x 75.6 x 8.3 mm', 12),
  (153, 111, 13, '198 g', 13),
  (154, 111, 14, 'IP53', 14),
  (155, 112, 1, '6.7" AMOLED, 2400 x 1080, 120Hz', 1),
  (156, 112, 2, 'Octa-core 2.8GHz', 2),
  (157, 112, 3, '8GB RAM', 3),
  (158, 112, 4, '128GB, expandable to 1TB', 4),
  (159, 112, 5, '50MP wide + 12MP ultrawide + 5MP macro', 5),
  (160, 112, 6, '16MP', 6),
  (161, 112, 7, '5000mAh, 33W fast charge', 7),
  (162, 112, 8, 'Vendor OS 5.1', 8),
  (163, 112, 9, '2G / 3G / 4G LTE', 9),
  (164, 112, 10, 'Dual nano-SIM', 10),
  (165, 112, 11, 'Wi-Fi 6, Bluetooth 5.2, GPS', 11),
  (166, 112, 12, '163.2 x 75.6 x 8.3 mm', 12),
  (167, 112, 13, '198 g', 13),
  (168, 112, 14, 'IP53', 14),
  (169, 113, 1, '6.7" AMOLED, 2400 x 1080, 120Hz', 1),
  (170, 113, 2, 'Octa-core 2.8GHz', 2),
  (171, 113, 3, '8GB RAM', 3),
  (172, 113, 4, '64GB, expandable to 1TB', 4),
  (173, 113, 5, '50MP wide + 12MP ultrawide + 5MP macro', 5),
  (174, 113, 6, '16MP', 6),
  (175, 113, 7, '5000mAh, 33W fast charge', 7),
  (176, 113, 8, 'Vendor OS 5.1', 8),
  (177, 113, 9, '2G / 3G / 4G LTE', 9),
  (178, 113, 10, 'Dual nano-SIM', 10),
  (179, 113, 11, 'Wi-Fi 6, Bluetooth 5.2, GPS', 11),
  (180, 113, 12, '163.2 x 75.6 x 8.3 mm', 12),
  (181, 113, 13, '198 g', 13),
  (182, 113, 14, 'IP53', 14),
  (183, 114, 1, '6.7" AMOLED, 2400 x 1080, 120Hz', 1),
  (184, 114, 2, 'Octa-core 2.8GHz', 2),
  (185, 114, 3, '8GB RAM', 3),
  (186, 114, 4, '128GB, expandable to 1TB', 4),
  (187, 114, 5, '50MP wide + 12MP ultrawide + 5MP macro', 5),
  (188, 114, 6, '16MP', 6),
  (189, 114, 7, '5000mAh, 33W fast charge', 7),
  (190, 114, 8, 'Vendor OS 5.1', 8),
  (191, 114, 9, '2G / 3G / 4G LTE', 9),
  (192, 114, 10, 'Dual nano-SIM', 10),
  (193, 114, 11, 'Wi-Fi 6, Bluetooth 5.2, GPS', 11),
  (194, 114, 12, '163.2 x 75.6 x 8.3 mm', 12),
  (195, 114, 13, '198 g', 13),
  (196, 114, 14, 'IP53', 14),
  (197, 115, 1, '6.7" AMOLED, 2400 x 1080, 120Hz', 1),
  (198, 115, 2, 'Octa-core 2.8GHz', 2),
  (199, 115, 3, '8GB RAM', 3),
  (200, 115, 4, '256GB, expandable to 1TB', 4),
  (201, 115, 5, '50MP wide + 12MP ultrawide + 5MP macro', 5),
  (202, 115, 6, '16MP', 6),
  (203, 115, 7, '5000mAh, 33W fast charge', 7),
  (204, 115, 8, 'Vendor OS 5.1', 8),
  (205, 115, 9, '2G / 3G / 4G LTE', 9),
  (206, 115, 10, 'Dual nano-SIM', 10),
  (207, 115, 11, 'Wi-Fi 6, Bluetooth 5.2, GPS', 11),
  (208, 115, 12, '163.2 x 75.6 x 8.3 mm', 12),
  (209, 115, 13, '198 g', 13),
  (210, 115, 14, 'IP53', 14),
  (211, 116, 1, '6.7" AMOLED, 2400 x 1080, 120Hz', 1),
  (212, 116, 2, 'Octa-core 2.8GHz', 2),
  (213, 116, 3, '8GB RAM', 3),
  (214, 116, 4, '512GB, expandable to 1TB', 4),
  (215, 116, 5, '50MP wide + 12MP ultrawide + 5MP macro', 5),
  (216, 116, 6, '16MP', 6),
  (217, 116, 7, '5000mAh, 33W fast charge', 7),
  (218, 116, 8, 'Vendor OS 5.1', 8),
  (219, 116, 9, '2G / 3G / 4G LTE', 9),
  (220, 116, 10, 'Dual nano-SIM', 10),
  (221, 116, 11, 'Wi-Fi 6, Bluetooth 5.2, GPS', 11),
  (222, 116, 12, '163.2 x 75.6 x 8.3 mm', 12),
  (223, 116, 13, '198 g', 13),
  (224, 116, 14, 'IP53', 14),
  (225, 117, 1, '6.7" AMOLED, 2400 x 1080, 120Hz', 1),
  (226, 117, 2, 'Octa-core 2.8GHz', 2),
  (227, 117, 3, '8GB RAM', 3),
  (228, 117, 4, '64GB, expandable to 1TB', 4),
  (229, 117, 5, '50MP wide + 12MP ultrawide + 5MP macro', 5),
  (230, 117, 6, '16MP', 6),
  (231, 117, 7, '5000mAh, 33W fast charge', 7),
  (232, 117, 8, 'Vendor OS 5.1', 8),
  (233, 117, 9, '2G / 3G / 4G LTE', 9),
  (234, 117, 10, 'Dual nano-SIM', 10),
  (235, 117, 11, 'Wi-Fi 6, Bluetooth 5.2, GPS', 11),
  (236, 117, 12, '163.2 x 75.6 x 8.3 mm', 12),
  (237, 117, 13, '198 g', 13),
  (238, 117, 14, 'IP53', 14),
  (239, 118, 1, '6.7" AMOLED, 2400 x 1080, 120Hz', 1),
  (240, 118, 2, 'Octa-core 2.8GHz', 2),
  (241, 118, 3, '8GB RAM', 3),
  (242, 118, 4, '128GB, expandable to 1TB', 4),
  (243, 118, 5, '50MP wide + 12MP ultrawide + 5MP macro', 5),
  (244, 118, 6, '16MP', 6),
  (245, 118, 7, '5000mAh, 33W fast charge', 7),
  (246, 118, 8, 'Vendor OS 5.1', 8),
  (247, 118, 9, '2G / 3G / 4G LTE', 9),
  (248, 118, 10, 'Dual nano-SIM', 10),
  (249, 118, 11, 'Wi-Fi 6, Bluetooth 5.2, GPS', 11),
  (250, 118, 12, '163.2 x 75.6 x 8.3 mm', 12),
  (251, 118, 13, '198 g', 13),
  (252, 118, 14, 'IP53', 14);


-- ---------------------------------------------------------------
-- Product models, one per product (the column is UNIQUE).
-- ---------------------------------------------------------------
INSERT INTO product_models (model_pk, product_pk, model_name, reservable, is_deleted, created_by) VALUES
  (101, 101, 'S-9-64', 0, 0, 1),
  (102, 102, 'S-9-128', 0, 0, 1),
  (103, 103, 'S-9-256', 0, 0, 1),
  (104, 104, 'S-9-512', 0, 0, 1),
  (105, 105, 'S-9-64', 0, 0, 1),
  (106, 106, 'S-9-128', 0, 0, 1),
  (107, 107, 'S-7-64', 0, 0, 1),
  (108, 108, 'S-7-128', 0, 0, 1),
  (109, 109, 'S-7-256', 0, 0, 1),
  (110, 110, 'S-7-512', 0, 0, 1),
  (111, 111, 'S-7-64', 0, 0, 1),
  (112, 112, 'S-7-128', 0, 0, 1),
  (113, 113, 'S-5-64', 0, 0, 1),
  (114, 114, 'S-5-128', 0, 0, 1),
  (115, 115, 'S-5-256', 0, 0, 1),
  (116, 116, 'S-5-512', 0, 0, 1),
  (117, 117, 'S-5-64', 0, 0, 1),
  (118, 118, 'S-5-128', 0, 0, 1);


-- ---------------------------------------------------------------
-- Service / accessory pricing.
-- resource_price and service_price are NUMERIC(6,2), so 9999.99 is the
-- ceiling - the fixture values are scaled to fit and the client's
-- formatPrice handles the display.
-- ---------------------------------------------------------------
INSERT INTO phone_accessories (accessory_pk, product_pk, product_name, accessory_name, resource_price, service_price, allow_num, is_deleted, created_at) VALUES
  (1, 101, 'S-9-64', 'Display Assembly', 213.85, 13.86, '2', 0, '2025-09-06 09:00:00'::timestamp),
  (2, 101, 'S-9-64', 'Battery Pack', 261.88, 9.46, '2', 0, '2025-04-23 09:00:00'::timestamp),
  (3, 101, 'S-9-64', 'Rear Cover', 280.88, 25.11, '1', 0, '2025-01-16 09:00:00'::timestamp),
  (4, 101, 'S-9-64', 'Charging Port', 28.13, 50.22, '1', 0, '2025-09-03 09:00:00'::timestamp),
  (5, 101, 'S-9-64', 'Main Camera Module', 78.44, 26.11, '2', 0, '2026-05-02 09:00:00'::timestamp),
  (6, 101, 'S-9-64', 'Front Camera Module', 79.05, 50.30, '3', 0, '2025-05-03 09:00:00'::timestamp),
  (7, 101, 'S-9-64', 'Speaker Unit', 60.58, 55.61, '2', 0, '2025-04-06 09:00:00'::timestamp),
  (8, 101, 'S-9-64', 'Vibration Motor', 287.43, 20.71, '1', 0, '2025-08-14 09:00:00'::timestamp),
  (9, 101, 'S-9-64', 'Side Button Flex', 243.41, 44.92, '3', 0, '2025-11-30 09:00:00'::timestamp),
  (10, 101, 'S-9-64', 'SIM Tray', 56.60, 43.33, '3', 0, '2026-04-19 09:00:00'::timestamp),
  (11, 102, 'S-9-128', 'Display Assembly', 129.61, 50.10, '1', 0, '2025-06-11 09:00:00'::timestamp),
  (12, 102, 'S-9-128', 'Battery Pack', 114.98, 18.54, '2', 0, '2025-08-25 09:00:00'::timestamp),
  (13, 102, 'S-9-128', 'Rear Cover', 53.22, 21.97, '1', 0, '2026-04-27 09:00:00'::timestamp),
  (14, 102, 'S-9-128', 'Charging Port', 264.67, 19.41, '3', 0, '2025-05-15 09:00:00'::timestamp),
  (15, 102, 'S-9-128', 'Main Camera Module', 293.18, 42.44, '3', 0, '2025-07-28 09:00:00'::timestamp),
  (16, 102, 'S-9-128', 'Front Camera Module', 135.74, 34.40, '1', 0, '2026-05-02 09:00:00'::timestamp),
  (17, 102, 'S-9-128', 'Speaker Unit', 191.30, 6.78, '2', 0, '2025-08-14 09:00:00'::timestamp),
  (18, 102, 'S-9-128', 'Vibration Motor', 240.34, 19.39, '1', 0, '2025-09-19 09:00:00'::timestamp),
  (19, 102, 'S-9-128', 'Side Button Flex', 23.34, 53.88, '1', 0, '2024-12-26 09:00:00'::timestamp),
  (20, 102, 'S-9-128', 'SIM Tray', 284.10, 9.55, '1', 0, '2025-12-20 09:00:00'::timestamp),
  (21, 103, 'S-9-256', 'Display Assembly', 32.70, 35.81, '2', 0, '2026-05-29 09:00:00'::timestamp),
  (22, 103, 'S-9-256', 'Battery Pack', 26.05, 46.23, '3', 0, '2026-02-19 09:00:00'::timestamp),
  (23, 103, 'S-9-256', 'Rear Cover', 229.31, 30.88, '2', 0, '2026-01-25 09:00:00'::timestamp),
  (24, 103, 'S-9-256', 'Charging Port', 156.94, 42.24, '2', 0, '2026-03-13 09:00:00'::timestamp),
  (25, 103, 'S-9-256', 'Main Camera Module', 129.55, 20.65, '2', 0, '2026-01-12 09:00:00'::timestamp),
  (26, 103, 'S-9-256', 'Front Camera Module', 247.77, 46.47, '3', 0, '2026-03-25 09:00:00'::timestamp),
  (27, 103, 'S-9-256', 'Speaker Unit', 199.72, 50.75, '2', 0, '2025-11-11 09:00:00'::timestamp),
  (28, 103, 'S-9-256', 'Vibration Motor', 269.37, 49.36, '2', 0, '2026-03-17 09:00:00'::timestamp),
  (29, 103, 'S-9-256', 'Side Button Flex', 293.17, 47.81, '2', 0, '2025-07-10 09:00:00'::timestamp),
  (30, 103, 'S-9-256', 'SIM Tray', 201.83, 29.63, '2', 0, '2025-04-16 09:00:00'::timestamp),
  (31, 104, 'S-9-512', 'Display Assembly', 137.53, 44.18, '2', 0, '2025-12-03 09:00:00'::timestamp),
  (32, 104, 'S-9-512', 'Battery Pack', 269.73, 33.94, '1', 0, '2025-02-17 09:00:00'::timestamp),
  (33, 104, 'S-9-512', 'Rear Cover', 318.24, 49.20, '2', 0, '2025-06-03 09:00:00'::timestamp),
  (34, 104, 'S-9-512', 'Charging Port', 27.71, 15.94, '1', 0, '2026-02-04 09:00:00'::timestamp),
  (35, 104, 'S-9-512', 'Main Camera Module', 76.22, 10.40, '1', 0, '2025-05-04 09:00:00'::timestamp),
  (36, 104, 'S-9-512', 'Front Camera Module', 144.19, 45.69, '3', 0, '2025-07-13 09:00:00'::timestamp),
  (37, 104, 'S-9-512', 'Speaker Unit', 273.56, 34.50, '3', 0, '2024-12-15 09:00:00'::timestamp),
  (38, 104, 'S-9-512', 'Vibration Motor', 129.02, 18.81, '2', 0, '2025-03-04 09:00:00'::timestamp),
  (39, 104, 'S-9-512', 'Side Button Flex', 235.43, 5.23, '3', 0, '2025-06-26 09:00:00'::timestamp),
  (40, 104, 'S-9-512', 'SIM Tray', 78.29, 10.65, '1', 0, '2024-12-11 09:00:00'::timestamp),
  (41, 105, 'S-9-64', 'Display Assembly', 231.04, 57.00, '1', 0, '2025-11-16 09:00:00'::timestamp),
  (42, 105, 'S-9-64', 'Battery Pack', 78.12, 10.41, '3', 0, '2025-08-07 09:00:00'::timestamp),
  (43, 105, 'S-9-64', 'Rear Cover', 127.13, 24.23, '1', 0, '2025-01-29 09:00:00'::timestamp),
  (44, 105, 'S-9-64', 'Charging Port', 245.83, 34.20, '2', 0, '2025-08-03 09:00:00'::timestamp),
  (45, 105, 'S-9-64', 'Main Camera Module', 136.21, 31.87, '2', 0, '2026-05-31 09:00:00'::timestamp),
  (46, 105, 'S-9-64', 'Front Camera Module', 265.08, 14.12, '3', 0, '2025-03-03 09:00:00'::timestamp),
  (47, 105, 'S-9-64', 'Speaker Unit', 110.27, 30.60, '3', 0, '2026-01-07 09:00:00'::timestamp),
  (48, 105, 'S-9-64', 'Vibration Motor', 36.74, 55.73, '3', 0, '2025-12-15 09:00:00'::timestamp),
  (49, 105, 'S-9-64', 'Side Button Flex', 84.42, 38.33, '3', 0, '2025-11-21 09:00:00'::timestamp),
  (50, 105, 'S-9-64', 'SIM Tray', 167.36, 22.82, '2', 0, '2025-07-05 09:00:00'::timestamp),
  (51, 106, 'S-9-128', 'Display Assembly', 98.58, 56.64, '2', 0, '2026-01-23 09:00:00'::timestamp),
  (52, 106, 'S-9-128', 'Battery Pack', 59.88, 40.44, '3', 0, '2024-12-08 09:00:00'::timestamp),
  (53, 106, 'S-9-128', 'Rear Cover', 132.64, 36.38, '2', 0, '2025-07-04 09:00:00'::timestamp),
  (54, 106, 'S-9-128', 'Charging Port', 104.75, 26.38, '1', 0, '2026-05-09 09:00:00'::timestamp),
  (55, 106, 'S-9-128', 'Main Camera Module', 57.20, 50.06, '2', 0, '2025-05-10 09:00:00'::timestamp),
  (56, 106, 'S-9-128', 'Front Camera Module', 258.55, 47.57, '3', 0, '2025-07-18 09:00:00'::timestamp),
  (57, 106, 'S-9-128', 'Speaker Unit', 125.54, 25.87, '1', 0, '2025-10-22 09:00:00'::timestamp),
  (58, 106, 'S-9-128', 'Vibration Motor', 186.00, 16.36, '1', 0, '2025-06-05 09:00:00'::timestamp),
  (59, 106, 'S-9-128', 'Side Button Flex', 300.40, 10.88, '2', 0, '2025-07-14 09:00:00'::timestamp),
  (60, 106, 'S-9-128', 'SIM Tray', 185.94, 11.11, '3', 0, '2025-04-03 09:00:00'::timestamp),
  (61, 107, 'S-7-64', 'Display Assembly', 134.87, 8.23, '3', 0, '2025-08-19 09:00:00'::timestamp),
  (62, 107, 'S-7-64', 'Battery Pack', 80.88, 13.18, '1', 0, '2026-05-17 09:00:00'::timestamp),
  (63, 107, 'S-7-64', 'Rear Cover', 53.61, 22.06, '2', 0, '2026-05-11 09:00:00'::timestamp),
  (64, 107, 'S-7-64', 'Charging Port', 307.86, 50.41, '2', 0, '2025-04-21 09:00:00'::timestamp),
  (65, 107, 'S-7-64', 'Main Camera Module', 81.34, 43.68, '1', 0, '2025-04-07 09:00:00'::timestamp),
  (66, 107, 'S-7-64', 'Front Camera Module', 319.42, 38.84, '1', 0, '2025-06-25 09:00:00'::timestamp),
  (67, 107, 'S-7-64', 'Speaker Unit', 212.19, 23.13, '1', 0, '2025-09-11 09:00:00'::timestamp),
  (68, 107, 'S-7-64', 'Vibration Motor', 56.73, 15.08, '3', 0, '2026-05-22 09:00:00'::timestamp),
  (69, 107, 'S-7-64', 'Side Button Flex', 159.14, 9.89, '2', 0, '2026-02-12 09:00:00'::timestamp),
  (70, 107, 'S-7-64', 'SIM Tray', 94.39, 45.38, '1', 0, '2026-03-31 09:00:00'::timestamp),
  (71, 108, 'S-7-128', 'Display Assembly', 236.60, 57.47, '3', 0, '2024-12-16 09:00:00'::timestamp),
  (72, 108, 'S-7-128', 'Battery Pack', 118.87, 27.97, '2', 0, '2026-04-24 09:00:00'::timestamp),
  (73, 108, 'S-7-128', 'Rear Cover', 278.27, 7.02, '2', 0, '2025-03-30 09:00:00'::timestamp),
  (74, 108, 'S-7-128', 'Charging Port', 303.52, 38.36, '2', 0, '2025-08-12 09:00:00'::timestamp),
  (75, 108, 'S-7-128', 'Main Camera Module', 153.25, 39.28, '1', 0, '2026-01-15 09:00:00'::timestamp),
  (76, 108, 'S-7-128', 'Front Camera Module', 93.06, 18.22, '1', 0, '2025-02-17 09:00:00'::timestamp),
  (77, 108, 'S-7-128', 'Speaker Unit', 296.37, 24.16, '3', 0, '2025-02-22 09:00:00'::timestamp),
  (78, 108, 'S-7-128', 'Vibration Motor', 280.85, 17.99, '2', 0, '2025-11-18 09:00:00'::timestamp),
  (79, 108, 'S-7-128', 'Side Button Flex', 317.91, 37.82, '3', 0, '2026-01-21 09:00:00'::timestamp),
  (80, 108, 'S-7-128', 'SIM Tray', 121.55, 59.42, '1', 0, '2026-02-22 09:00:00'::timestamp),
  (81, 109, 'S-7-256', 'Display Assembly', 259.35, 23.11, '2', 0, '2026-03-15 09:00:00'::timestamp),
  (82, 109, 'S-7-256', 'Battery Pack', 293.91, 44.06, '2', 0, '2025-05-16 09:00:00'::timestamp),
  (83, 109, 'S-7-256', 'Rear Cover', 315.41, 39.22, '2', 0, '2025-01-30 09:00:00'::timestamp),
  (84, 109, 'S-7-256', 'Charging Port', 95.22, 17.80, '1', 0, '2025-09-18 09:00:00'::timestamp),
  (85, 109, 'S-7-256', 'Main Camera Module', 156.68, 46.57, '3', 0, '2025-07-22 09:00:00'::timestamp),
  (86, 109, 'S-7-256', 'Front Camera Module', 84.35, 21.18, '2', 0, '2024-12-27 09:00:00'::timestamp),
  (87, 109, 'S-7-256', 'Speaker Unit', 207.61, 19.52, '3', 0, '2025-11-29 09:00:00'::timestamp),
  (88, 109, 'S-7-256', 'Vibration Motor', 201.24, 5.21, '1', 0, '2025-02-02 09:00:00'::timestamp),
  (89, 109, 'S-7-256', 'Side Button Flex', 94.69, 6.11, '2', 0, '2026-05-20 09:00:00'::timestamp),
  (90, 109, 'S-7-256', 'SIM Tray', 163.82, 44.44, '1', 0, '2025-12-02 09:00:00'::timestamp),
  (91, 110, 'S-7-512', 'Display Assembly', 154.04, 7.48, '1', 0, '2025-08-10 09:00:00'::timestamp),
  (92, 110, 'S-7-512', 'Battery Pack', 242.94, 19.28, '3', 0, '2025-07-05 09:00:00'::timestamp),
  (93, 110, 'S-7-512', 'Rear Cover', 254.06, 6.70, '3', 0, '2024-12-04 09:00:00'::timestamp),
  (94, 110, 'S-7-512', 'Charging Port', 188.11, 13.76, '1', 0, '2026-03-10 09:00:00'::timestamp),
  (95, 110, 'S-7-512', 'Main Camera Module', 131.02, 51.57, '2', 0, '2025-11-18 09:00:00'::timestamp),
  (96, 110, 'S-7-512', 'Front Camera Module', 211.76, 36.81, '2', 0, '2025-03-14 09:00:00'::timestamp),
  (97, 110, 'S-7-512', 'Speaker Unit', 50.39, 34.43, '1', 0, '2025-05-09 09:00:00'::timestamp),
  (98, 110, 'S-7-512', 'Vibration Motor', 161.08, 55.44, '3', 0, '2025-02-16 09:00:00'::timestamp),
  (99, 110, 'S-7-512', 'Side Button Flex', 198.55, 17.24, '3', 0, '2025-04-12 09:00:00'::timestamp),
  (100, 110, 'S-7-512', 'SIM Tray', 187.28, 47.84, '1', 0, '2024-11-07 09:00:00'::timestamp),
  (101, 111, 'S-7-64', 'Display Assembly', 206.51, 45.90, '1', 0, '2024-11-12 09:00:00'::timestamp),
  (102, 111, 'S-7-64', 'Battery Pack', 88.90, 15.88, '2', 0, '2025-04-01 09:00:00'::timestamp),
  (103, 111, 'S-7-64', 'Rear Cover', 20.43, 10.58, '1', 0, '2025-11-30 09:00:00'::timestamp),
  (104, 111, 'S-7-64', 'Charging Port', 171.04, 51.28, '3', 0, '2025-08-26 09:00:00'::timestamp),
  (105, 111, 'S-7-64', 'Main Camera Module', 82.88, 27.79, '2', 0, '2024-11-26 09:00:00'::timestamp),
  (106, 111, 'S-7-64', 'Front Camera Module', 41.06, 33.02, '1', 0, '2025-07-14 09:00:00'::timestamp),
  (107, 111, 'S-7-64', 'Speaker Unit', 136.01, 36.16, '2', 0, '2025-04-07 09:00:00'::timestamp),
  (108, 111, 'S-7-64', 'Vibration Motor', 234.50, 44.33, '1', 0, '2025-06-09 09:00:00'::timestamp),
  (109, 111, 'S-7-64', 'Side Button Flex', 234.46, 29.37, '2', 0, '2024-11-14 09:00:00'::timestamp),
  (110, 111, 'S-7-64', 'SIM Tray', 145.17, 49.93, '3', 0, '2025-09-14 09:00:00'::timestamp),
  (111, 112, 'S-7-128', 'Display Assembly', 119.84, 15.96, '2', 0, '2025-01-06 09:00:00'::timestamp),
  (112, 112, 'S-7-128', 'Battery Pack', 213.32, 54.80, '3', 0, '2025-07-17 09:00:00'::timestamp),
  (113, 112, 'S-7-128', 'Rear Cover', 71.60, 29.21, '2', 0, '2025-11-15 09:00:00'::timestamp),
  (114, 112, 'S-7-128', 'Charging Port', 60.05, 12.62, '3', 0, '2024-12-21 09:00:00'::timestamp),
  (115, 112, 'S-7-128', 'Main Camera Module', 270.17, 28.61, '3', 0, '2026-02-18 09:00:00'::timestamp),
  (116, 112, 'S-7-128', 'Front Camera Module', 36.15, 10.99, '3', 0, '2025-07-14 09:00:00'::timestamp),
  (117, 112, 'S-7-128', 'Speaker Unit', 192.25, 34.94, '2', 0, '2024-12-21 09:00:00'::timestamp),
  (118, 112, 'S-7-128', 'Vibration Motor', 119.70, 7.77, '1', 0, '2025-06-11 09:00:00'::timestamp),
  (119, 112, 'S-7-128', 'Side Button Flex', 306.99, 48.65, '2', 0, '2026-01-22 09:00:00'::timestamp),
  (120, 112, 'S-7-128', 'SIM Tray', 237.40, 58.44, '3', 0, '2025-02-01 09:00:00'::timestamp),
  (121, 113, 'S-5-64', 'Display Assembly', 133.27, 38.27, '3', 0, '2025-04-23 09:00:00'::timestamp),
  (122, 113, 'S-5-64', 'Battery Pack', 187.01, 30.79, '3', 0, '2025-09-26 09:00:00'::timestamp),
  (123, 113, 'S-5-64', 'Rear Cover', 241.67, 43.82, '2', 0, '2025-08-24 09:00:00'::timestamp),
  (124, 113, 'S-5-64', 'Charging Port', 191.87, 7.44, '1', 0, '2026-02-04 09:00:00'::timestamp),
  (125, 113, 'S-5-64', 'Main Camera Module', 161.45, 47.36, '3', 0, '2025-12-27 09:00:00'::timestamp),
  (126, 113, 'S-5-64', 'Front Camera Module', 66.44, 23.85, '3', 0, '2025-05-02 09:00:00'::timestamp),
  (127, 113, 'S-5-64', 'Speaker Unit', 28.38, 13.30, '1', 0, '2026-04-18 09:00:00'::timestamp),
  (128, 113, 'S-5-64', 'Vibration Motor', 315.46, 16.52, '2', 0, '2024-12-13 09:00:00'::timestamp),
  (129, 113, 'S-5-64', 'Side Button Flex', 58.84, 47.37, '1', 0, '2024-12-26 09:00:00'::timestamp),
  (130, 113, 'S-5-64', 'SIM Tray', 83.66, 36.19, '2', 0, '2024-12-15 09:00:00'::timestamp),
  (131, 114, 'S-5-128', 'Display Assembly', 311.39, 19.29, '1', 0, '2025-04-22 09:00:00'::timestamp),
  (132, 114, 'S-5-128', 'Battery Pack', 134.87, 45.21, '3', 0, '2025-12-18 09:00:00'::timestamp),
  (133, 114, 'S-5-128', 'Rear Cover', 44.84, 19.64, '1', 0, '2026-02-10 09:00:00'::timestamp),
  (134, 114, 'S-5-128', 'Charging Port', 207.24, 60.88, '1', 0, '2025-06-20 09:00:00'::timestamp),
  (135, 114, 'S-5-128', 'Main Camera Module', 24.06, 25.24, '3', 0, '2025-03-09 09:00:00'::timestamp),
  (136, 114, 'S-5-128', 'Front Camera Module', 231.18, 29.15, '2', 0, '2025-04-14 09:00:00'::timestamp),
  (137, 114, 'S-5-128', 'Speaker Unit', 233.42, 23.87, '3', 0, '2026-02-04 09:00:00'::timestamp),
  (138, 114, 'S-5-128', 'Vibration Motor', 201.66, 58.37, '2', 0, '2025-07-31 09:00:00'::timestamp),
  (139, 114, 'S-5-128', 'Side Button Flex', 249.98, 49.48, '1', 0, '2026-01-28 09:00:00'::timestamp),
  (140, 114, 'S-5-128', 'SIM Tray', 166.20, 31.20, '1', 0, '2025-08-28 09:00:00'::timestamp),
  (141, 115, 'S-5-256', 'Display Assembly', 194.11, 35.12, '1', 0, '2025-03-16 09:00:00'::timestamp),
  (142, 115, 'S-5-256', 'Battery Pack', 87.23, 56.83, '2', 0, '2025-06-01 09:00:00'::timestamp),
  (143, 115, 'S-5-256', 'Rear Cover', 64.75, 59.78, '3', 0, '2025-08-21 09:00:00'::timestamp),
  (144, 115, 'S-5-256', 'Charging Port', 217.42, 45.03, '3', 0, '2026-02-18 09:00:00'::timestamp),
  (145, 115, 'S-5-256', 'Main Camera Module', 201.87, 42.06, '3', 0, '2026-02-17 09:00:00'::timestamp),
  (146, 115, 'S-5-256', 'Front Camera Module', 50.29, 35.94, '2', 0, '2025-03-10 09:00:00'::timestamp),
  (147, 115, 'S-5-256', 'Speaker Unit', 180.05, 35.17, '1', 0, '2025-07-26 09:00:00'::timestamp),
  (148, 115, 'S-5-256', 'Vibration Motor', 143.89, 10.56, '3', 0, '2026-03-24 09:00:00'::timestamp),
  (149, 115, 'S-5-256', 'Side Button Flex', 312.27, 9.44, '3', 0, '2025-09-11 09:00:00'::timestamp),
  (150, 115, 'S-5-256', 'SIM Tray', 169.71, 7.22, '3', 0, '2026-02-11 09:00:00'::timestamp),
  (151, 116, 'S-5-512', 'Display Assembly', 268.62, 17.45, '1', 0, '2025-03-26 09:00:00'::timestamp),
  (152, 116, 'S-5-512', 'Battery Pack', 287.28, 37.54, '1', 0, '2025-11-15 09:00:00'::timestamp),
  (153, 116, 'S-5-512', 'Rear Cover', 286.44, 22.63, '1', 0, '2025-06-03 09:00:00'::timestamp),
  (154, 116, 'S-5-512', 'Charging Port', 35.29, 9.18, '2', 0, '2026-02-15 09:00:00'::timestamp),
  (155, 116, 'S-5-512', 'Main Camera Module', 108.90, 41.79, '3', 0, '2025-03-25 09:00:00'::timestamp),
  (156, 116, 'S-5-512', 'Front Camera Module', 142.71, 27.39, '3', 0, '2024-11-25 09:00:00'::timestamp),
  (157, 116, 'S-5-512', 'Speaker Unit', 218.81, 51.14, '3', 0, '2025-10-07 09:00:00'::timestamp),
  (158, 116, 'S-5-512', 'Vibration Motor', 91.79, 46.93, '3', 0, '2025-01-17 09:00:00'::timestamp),
  (159, 116, 'S-5-512', 'Side Button Flex', 133.47, 52.11, '3', 0, '2025-06-22 09:00:00'::timestamp),
  (160, 116, 'S-5-512', 'SIM Tray', 307.20, 13.79, '3', 0, '2026-02-23 09:00:00'::timestamp),
  (161, 117, 'S-5-64', 'Display Assembly', 110.66, 6.30, '3', 0, '2025-09-29 09:00:00'::timestamp),
  (162, 117, 'S-5-64', 'Battery Pack', 230.45, 53.03, '3', 0, '2025-10-03 09:00:00'::timestamp),
  (163, 117, 'S-5-64', 'Rear Cover', 121.04, 28.51, '1', 0, '2025-08-24 09:00:00'::timestamp),
  (164, 117, 'S-5-64', 'Charging Port', 209.58, 13.86, '1', 0, '2025-03-29 09:00:00'::timestamp),
  (165, 117, 'S-5-64', 'Main Camera Module', 108.54, 5.50, '2', 0, '2025-01-25 09:00:00'::timestamp),
  (166, 117, 'S-5-64', 'Front Camera Module', 275.87, 15.76, '1', 0, '2025-10-03 09:00:00'::timestamp),
  (167, 117, 'S-5-64', 'Speaker Unit', 319.54, 32.25, '1', 0, '2025-10-23 09:00:00'::timestamp),
  (168, 117, 'S-5-64', 'Vibration Motor', 267.96, 42.76, '3', 0, '2025-09-11 09:00:00'::timestamp),
  (169, 117, 'S-5-64', 'Side Button Flex', 74.51, 60.69, '3', 0, '2025-04-20 09:00:00'::timestamp),
  (170, 117, 'S-5-64', 'SIM Tray', 92.17, 20.51, '2', 0, '2026-05-12 09:00:00'::timestamp),
  (171, 118, 'S-5-128', 'Display Assembly', 31.24, 19.61, '3', 0, '2025-12-28 09:00:00'::timestamp),
  (172, 118, 'S-5-128', 'Battery Pack', 72.35, 52.39, '3', 0, '2026-02-20 09:00:00'::timestamp),
  (173, 118, 'S-5-128', 'Rear Cover', 123.30, 27.95, '1', 0, '2026-05-03 09:00:00'::timestamp),
  (174, 118, 'S-5-128', 'Charging Port', 124.04, 14.15, '1', 0, '2026-02-26 09:00:00'::timestamp),
  (175, 118, 'S-5-128', 'Main Camera Module', 309.43, 41.37, '3', 0, '2025-04-19 09:00:00'::timestamp),
  (176, 118, 'S-5-128', 'Front Camera Module', 281.21, 33.65, '1', 0, '2025-12-07 09:00:00'::timestamp),
  (177, 118, 'S-5-128', 'Speaker Unit', 258.52, 31.76, '3', 0, '2025-05-29 09:00:00'::timestamp),
  (178, 118, 'S-5-128', 'Vibration Motor', 242.65, 9.71, '3', 0, '2025-06-04 09:00:00'::timestamp),
  (179, 118, 'S-5-128', 'Side Button Flex', 179.03, 41.36, '3', 0, '2025-10-27 09:00:00'::timestamp),
  (180, 118, 'S-5-128', 'SIM Tray', 273.51, 34.08, '3', 0, '2026-04-07 09:00:00'::timestamp);


-- ---------------------------------------------------------------
-- OS changelog per product.
-- ---------------------------------------------------------------
INSERT INTO phone_changelog (table_pk, product_pk, product_name, title, content, publish_num, position, is_deleted, created_at) VALUES
  (1, 101, 'S-9-64', 'Vendor OS 5.4 for S-9 64GB Graphite', 'Security patches rolled up to 2026-01-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 10%.
Fixed a crash when switching SIM slots while on a call.', 'B2052.92', 4, 0, '2026-01-01 09:00:00'::timestamp),
  (2, 101, 'S-9-64', 'Vendor OS 5.3 for S-9 64GB Graphite', 'Security patches rolled up to 2026-02-15.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 5%.
Fixed a crash when switching SIM slots while on a call.', 'B2039.60', 3, 0, '2026-02-15 09:00:00'::timestamp),
  (3, 101, 'S-9-64', 'Vendor OS 5.2 for S-9 64GB Graphite', 'Security patches rolled up to 2026-04-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 4%.
Fixed a crash when switching SIM slots while on a call.', 'B2026.63', 2, 0, '2026-04-01 09:00:00'::timestamp),
  (4, 101, 'S-9-64', 'Vendor OS 5.1 for S-9 64GB Graphite', 'Security patches rolled up to 2026-05-16.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 9%.
Fixed a crash when switching SIM slots while on a call.', 'B2013.57', 1, 0, '2026-05-16 09:00:00'::timestamp),
  (5, 102, 'S-9-128', 'Vendor OS 5.4 for S-9 128GB Silver', 'Security patches rolled up to 2026-01-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 8%.
Fixed a crash when switching SIM slots while on a call.', 'B2052.53', 4, 0, '2026-01-01 09:00:00'::timestamp),
  (6, 102, 'S-9-128', 'Vendor OS 5.3 for S-9 128GB Silver', 'Security patches rolled up to 2026-02-15.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 11%.
Fixed a crash when switching SIM slots while on a call.', 'B2039.92', 3, 0, '2026-02-15 09:00:00'::timestamp),
  (7, 102, 'S-9-128', 'Vendor OS 5.2 for S-9 128GB Silver', 'Security patches rolled up to 2026-04-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 8%.
Fixed a crash when switching SIM slots while on a call.', 'B2026.60', 2, 0, '2026-04-01 09:00:00'::timestamp),
  (8, 102, 'S-9-128', 'Vendor OS 5.1 for S-9 128GB Silver', 'Security patches rolled up to 2026-05-16.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 9%.
Fixed a crash when switching SIM slots while on a call.', 'B2013.53', 1, 0, '2026-05-16 09:00:00'::timestamp),
  (9, 103, 'S-9-256', 'Vendor OS 5.4 for S-9 256GB Midnight', 'Security patches rolled up to 2026-01-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 11%.
Fixed a crash when switching SIM slots while on a call.', 'B2052.91', 4, 0, '2026-01-01 09:00:00'::timestamp),
  (10, 103, 'S-9-256', 'Vendor OS 5.3 for S-9 256GB Midnight', 'Security patches rolled up to 2026-02-15.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 5%.
Fixed a crash when switching SIM slots while on a call.', 'B2039.48', 3, 0, '2026-02-15 09:00:00'::timestamp),
  (11, 103, 'S-9-256', 'Vendor OS 5.2 for S-9 256GB Midnight', 'Security patches rolled up to 2026-04-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 9%.
Fixed a crash when switching SIM slots while on a call.', 'B2026.69', 2, 0, '2026-04-01 09:00:00'::timestamp),
  (12, 103, 'S-9-256', 'Vendor OS 5.1 for S-9 256GB Midnight', 'Security patches rolled up to 2026-05-16.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 10%.
Fixed a crash when switching SIM slots while on a call.', 'B2013.83', 1, 0, '2026-05-16 09:00:00'::timestamp),
  (13, 104, 'S-9-512', 'Vendor OS 5.5 for S-9 512GB Ocean', 'Security patches rolled up to 2025-11-17.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 10%.
Fixed a crash when switching SIM slots while on a call.', 'B2065.59', 5, 0, '2025-11-17 09:00:00'::timestamp),
  (14, 104, 'S-9-512', 'Vendor OS 5.4 for S-9 512GB Ocean', 'Security patches rolled up to 2026-01-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 8%.
Fixed a crash when switching SIM slots while on a call.', 'B2052.38', 4, 0, '2026-01-01 09:00:00'::timestamp),
  (15, 104, 'S-9-512', 'Vendor OS 5.3 for S-9 512GB Ocean', 'Security patches rolled up to 2026-02-15.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 5%.
Fixed a crash when switching SIM slots while on a call.', 'B2039.67', 3, 0, '2026-02-15 09:00:00'::timestamp),
  (16, 104, 'S-9-512', 'Vendor OS 5.2 for S-9 512GB Ocean', 'Security patches rolled up to 2026-04-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 5%.
Fixed a crash when switching SIM slots while on a call.', 'B2026.58', 2, 0, '2026-04-01 09:00:00'::timestamp),
  (17, 104, 'S-9-512', 'Vendor OS 5.1 for S-9 512GB Ocean', 'Security patches rolled up to 2026-05-16.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 5%.
Fixed a crash when switching SIM slots while on a call.', 'B2013.19', 1, 0, '2026-05-16 09:00:00'::timestamp),
  (18, 105, 'S-9-64', 'Vendor OS 5.5 for S-9 64GB Sand', 'Security patches rolled up to 2025-11-17.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 6%.
Fixed a crash when switching SIM slots while on a call.', 'B2065.84', 5, 0, '2025-11-17 09:00:00'::timestamp),
  (19, 105, 'S-9-64', 'Vendor OS 5.4 for S-9 64GB Sand', 'Security patches rolled up to 2026-01-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 10%.
Fixed a crash when switching SIM slots while on a call.', 'B2052.98', 4, 0, '2026-01-01 09:00:00'::timestamp),
  (20, 105, 'S-9-64', 'Vendor OS 5.3 for S-9 64GB Sand', 'Security patches rolled up to 2026-02-15.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 7%.
Fixed a crash when switching SIM slots while on a call.', 'B2039.53', 3, 0, '2026-02-15 09:00:00'::timestamp),
  (21, 105, 'S-9-64', 'Vendor OS 5.2 for S-9 64GB Sand', 'Security patches rolled up to 2026-04-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 7%.
Fixed a crash when switching SIM slots while on a call.', 'B2026.93', 2, 0, '2026-04-01 09:00:00'::timestamp),
  (22, 105, 'S-9-64', 'Vendor OS 5.1 for S-9 64GB Sand', 'Security patches rolled up to 2026-05-16.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 9%.
Fixed a crash when switching SIM slots while on a call.', 'B2013.82', 1, 0, '2026-05-16 09:00:00'::timestamp),
  (23, 106, 'S-9-128', 'Vendor OS 5.3 for S-9 128GB Graphite', 'Security patches rolled up to 2026-02-15.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 6%.
Fixed a crash when switching SIM slots while on a call.', 'B2039.60', 3, 0, '2026-02-15 09:00:00'::timestamp),
  (24, 106, 'S-9-128', 'Vendor OS 5.2 for S-9 128GB Graphite', 'Security patches rolled up to 2026-04-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 11%.
Fixed a crash when switching SIM slots while on a call.', 'B2026.12', 2, 0, '2026-04-01 09:00:00'::timestamp),
  (25, 106, 'S-9-128', 'Vendor OS 5.1 for S-9 128GB Graphite', 'Security patches rolled up to 2026-05-16.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 12%.
Fixed a crash when switching SIM slots while on a call.', 'B2013.98', 1, 0, '2026-05-16 09:00:00'::timestamp),
  (26, 107, 'S-7-64', 'Vendor OS 5.5 for S-7 64GB Graphite', 'Security patches rolled up to 2025-11-17.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 10%.
Fixed a crash when switching SIM slots while on a call.', 'B2065.50', 5, 0, '2025-11-17 09:00:00'::timestamp),
  (27, 107, 'S-7-64', 'Vendor OS 5.4 for S-7 64GB Graphite', 'Security patches rolled up to 2026-01-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 11%.
Fixed a crash when switching SIM slots while on a call.', 'B2052.29', 4, 0, '2026-01-01 09:00:00'::timestamp),
  (28, 107, 'S-7-64', 'Vendor OS 5.3 for S-7 64GB Graphite', 'Security patches rolled up to 2026-02-15.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 8%.
Fixed a crash when switching SIM slots while on a call.', 'B2039.22', 3, 0, '2026-02-15 09:00:00'::timestamp),
  (29, 107, 'S-7-64', 'Vendor OS 5.2 for S-7 64GB Graphite', 'Security patches rolled up to 2026-04-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 10%.
Fixed a crash when switching SIM slots while on a call.', 'B2026.55', 2, 0, '2026-04-01 09:00:00'::timestamp),
  (30, 107, 'S-7-64', 'Vendor OS 5.1 for S-7 64GB Graphite', 'Security patches rolled up to 2026-05-16.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 12%.
Fixed a crash when switching SIM slots while on a call.', 'B2013.75', 1, 0, '2026-05-16 09:00:00'::timestamp),
  (31, 108, 'S-7-128', 'Vendor OS 5.3 for S-7 128GB Silver', 'Security patches rolled up to 2026-02-15.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 11%.
Fixed a crash when switching SIM slots while on a call.', 'B2039.39', 3, 0, '2026-02-15 09:00:00'::timestamp),
  (32, 108, 'S-7-128', 'Vendor OS 5.2 for S-7 128GB Silver', 'Security patches rolled up to 2026-04-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 11%.
Fixed a crash when switching SIM slots while on a call.', 'B2026.33', 2, 0, '2026-04-01 09:00:00'::timestamp),
  (33, 108, 'S-7-128', 'Vendor OS 5.1 for S-7 128GB Silver', 'Security patches rolled up to 2026-05-16.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 12%.
Fixed a crash when switching SIM slots while on a call.', 'B2013.71', 1, 0, '2026-05-16 09:00:00'::timestamp),
  (34, 109, 'S-7-256', 'Vendor OS 5.3 for S-7 256GB Midnight', 'Security patches rolled up to 2026-02-15.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 4%.
Fixed a crash when switching SIM slots while on a call.', 'B2039.14', 3, 0, '2026-02-15 09:00:00'::timestamp),
  (35, 109, 'S-7-256', 'Vendor OS 5.2 for S-7 256GB Midnight', 'Security patches rolled up to 2026-04-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 11%.
Fixed a crash when switching SIM slots while on a call.', 'B2026.25', 2, 0, '2026-04-01 09:00:00'::timestamp),
  (36, 109, 'S-7-256', 'Vendor OS 5.1 for S-7 256GB Midnight', 'Security patches rolled up to 2026-05-16.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 11%.
Fixed a crash when switching SIM slots while on a call.', 'B2013.86', 1, 0, '2026-05-16 09:00:00'::timestamp),
  (37, 110, 'S-7-512', 'Vendor OS 5.4 for S-7 512GB Ocean', 'Security patches rolled up to 2026-01-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 5%.
Fixed a crash when switching SIM slots while on a call.', 'B2052.31', 4, 0, '2026-01-01 09:00:00'::timestamp),
  (38, 110, 'S-7-512', 'Vendor OS 5.3 for S-7 512GB Ocean', 'Security patches rolled up to 2026-02-15.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 6%.
Fixed a crash when switching SIM slots while on a call.', 'B2039.55', 3, 0, '2026-02-15 09:00:00'::timestamp),
  (39, 110, 'S-7-512', 'Vendor OS 5.2 for S-7 512GB Ocean', 'Security patches rolled up to 2026-04-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 4%.
Fixed a crash when switching SIM slots while on a call.', 'B2026.36', 2, 0, '2026-04-01 09:00:00'::timestamp),
  (40, 110, 'S-7-512', 'Vendor OS 5.1 for S-7 512GB Ocean', 'Security patches rolled up to 2026-05-16.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 5%.
Fixed a crash when switching SIM slots while on a call.', 'B2013.96', 1, 0, '2026-05-16 09:00:00'::timestamp),
  (41, 111, 'S-7-64', 'Vendor OS 5.5 for S-7 64GB Sand', 'Security patches rolled up to 2025-11-17.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 11%.
Fixed a crash when switching SIM slots while on a call.', 'B2065.84', 5, 0, '2025-11-17 09:00:00'::timestamp),
  (42, 111, 'S-7-64', 'Vendor OS 5.4 for S-7 64GB Sand', 'Security patches rolled up to 2026-01-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 12%.
Fixed a crash when switching SIM slots while on a call.', 'B2052.13', 4, 0, '2026-01-01 09:00:00'::timestamp),
  (43, 111, 'S-7-64', 'Vendor OS 5.3 for S-7 64GB Sand', 'Security patches rolled up to 2026-02-15.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 6%.
Fixed a crash when switching SIM slots while on a call.', 'B2039.74', 3, 0, '2026-02-15 09:00:00'::timestamp),
  (44, 111, 'S-7-64', 'Vendor OS 5.2 for S-7 64GB Sand', 'Security patches rolled up to 2026-04-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 6%.
Fixed a crash when switching SIM slots while on a call.', 'B2026.13', 2, 0, '2026-04-01 09:00:00'::timestamp),
  (45, 111, 'S-7-64', 'Vendor OS 5.1 for S-7 64GB Sand', 'Security patches rolled up to 2026-05-16.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 10%.
Fixed a crash when switching SIM slots while on a call.', 'B2013.30', 1, 0, '2026-05-16 09:00:00'::timestamp),
  (46, 112, 'S-7-128', 'Vendor OS 5.3 for S-7 128GB Graphite', 'Security patches rolled up to 2026-02-15.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 4%.
Fixed a crash when switching SIM slots while on a call.', 'B2039.28', 3, 0, '2026-02-15 09:00:00'::timestamp),
  (47, 112, 'S-7-128', 'Vendor OS 5.2 for S-7 128GB Graphite', 'Security patches rolled up to 2026-04-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 5%.
Fixed a crash when switching SIM slots while on a call.', 'B2026.72', 2, 0, '2026-04-01 09:00:00'::timestamp),
  (48, 112, 'S-7-128', 'Vendor OS 5.1 for S-7 128GB Graphite', 'Security patches rolled up to 2026-05-16.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 10%.
Fixed a crash when switching SIM slots while on a call.', 'B2013.90', 1, 0, '2026-05-16 09:00:00'::timestamp),
  (49, 113, 'S-5-64', 'Vendor OS 5.3 for S-5 64GB Graphite', 'Security patches rolled up to 2026-02-15.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 9%.
Fixed a crash when switching SIM slots while on a call.', 'B2039.40', 3, 0, '2026-02-15 09:00:00'::timestamp),
  (50, 113, 'S-5-64', 'Vendor OS 5.2 for S-5 64GB Graphite', 'Security patches rolled up to 2026-04-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 8%.
Fixed a crash when switching SIM slots while on a call.', 'B2026.22', 2, 0, '2026-04-01 09:00:00'::timestamp),
  (51, 113, 'S-5-64', 'Vendor OS 5.1 for S-5 64GB Graphite', 'Security patches rolled up to 2026-05-16.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 11%.
Fixed a crash when switching SIM slots while on a call.', 'B2013.51', 1, 0, '2026-05-16 09:00:00'::timestamp),
  (52, 114, 'S-5-128', 'Vendor OS 5.5 for S-5 128GB Silver', 'Security patches rolled up to 2025-11-17.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 4%.
Fixed a crash when switching SIM slots while on a call.', 'B2065.71', 5, 0, '2025-11-17 09:00:00'::timestamp),
  (53, 114, 'S-5-128', 'Vendor OS 5.4 for S-5 128GB Silver', 'Security patches rolled up to 2026-01-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 11%.
Fixed a crash when switching SIM slots while on a call.', 'B2052.86', 4, 0, '2026-01-01 09:00:00'::timestamp),
  (54, 114, 'S-5-128', 'Vendor OS 5.3 for S-5 128GB Silver', 'Security patches rolled up to 2026-02-15.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 6%.
Fixed a crash when switching SIM slots while on a call.', 'B2039.42', 3, 0, '2026-02-15 09:00:00'::timestamp),
  (55, 114, 'S-5-128', 'Vendor OS 5.2 for S-5 128GB Silver', 'Security patches rolled up to 2026-04-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 8%.
Fixed a crash when switching SIM slots while on a call.', 'B2026.59', 2, 0, '2026-04-01 09:00:00'::timestamp),
  (56, 114, 'S-5-128', 'Vendor OS 5.1 for S-5 128GB Silver', 'Security patches rolled up to 2026-05-16.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 4%.
Fixed a crash when switching SIM slots while on a call.', 'B2013.89', 1, 0, '2026-05-16 09:00:00'::timestamp),
  (57, 115, 'S-5-256', 'Vendor OS 5.5 for S-5 256GB Midnight', 'Security patches rolled up to 2025-11-17.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 7%.
Fixed a crash when switching SIM slots while on a call.', 'B2065.83', 5, 0, '2025-11-17 09:00:00'::timestamp),
  (58, 115, 'S-5-256', 'Vendor OS 5.4 for S-5 256GB Midnight', 'Security patches rolled up to 2026-01-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 4%.
Fixed a crash when switching SIM slots while on a call.', 'B2052.86', 4, 0, '2026-01-01 09:00:00'::timestamp),
  (59, 115, 'S-5-256', 'Vendor OS 5.3 for S-5 256GB Midnight', 'Security patches rolled up to 2026-02-15.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 10%.
Fixed a crash when switching SIM slots while on a call.', 'B2039.24', 3, 0, '2026-02-15 09:00:00'::timestamp),
  (60, 115, 'S-5-256', 'Vendor OS 5.2 for S-5 256GB Midnight', 'Security patches rolled up to 2026-04-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 12%.
Fixed a crash when switching SIM slots while on a call.', 'B2026.41', 2, 0, '2026-04-01 09:00:00'::timestamp),
  (61, 115, 'S-5-256', 'Vendor OS 5.1 for S-5 256GB Midnight', 'Security patches rolled up to 2026-05-16.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 4%.
Fixed a crash when switching SIM slots while on a call.', 'B2013.95', 1, 0, '2026-05-16 09:00:00'::timestamp),
  (62, 116, 'S-5-512', 'Vendor OS 5.4 for S-5 512GB Ocean', 'Security patches rolled up to 2026-01-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 5%.
Fixed a crash when switching SIM slots while on a call.', 'B2052.43', 4, 0, '2026-01-01 09:00:00'::timestamp),
  (63, 116, 'S-5-512', 'Vendor OS 5.3 for S-5 512GB Ocean', 'Security patches rolled up to 2026-02-15.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 4%.
Fixed a crash when switching SIM slots while on a call.', 'B2039.10', 3, 0, '2026-02-15 09:00:00'::timestamp),
  (64, 116, 'S-5-512', 'Vendor OS 5.2 for S-5 512GB Ocean', 'Security patches rolled up to 2026-04-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 11%.
Fixed a crash when switching SIM slots while on a call.', 'B2026.63', 2, 0, '2026-04-01 09:00:00'::timestamp),
  (65, 116, 'S-5-512', 'Vendor OS 5.1 for S-5 512GB Ocean', 'Security patches rolled up to 2026-05-16.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 8%.
Fixed a crash when switching SIM slots while on a call.', 'B2013.27', 1, 0, '2026-05-16 09:00:00'::timestamp),
  (66, 117, 'S-5-64', 'Vendor OS 5.5 for S-5 64GB Sand', 'Security patches rolled up to 2025-11-17.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 7%.
Fixed a crash when switching SIM slots while on a call.', 'B2065.69', 5, 0, '2025-11-17 09:00:00'::timestamp),
  (67, 117, 'S-5-64', 'Vendor OS 5.4 for S-5 64GB Sand', 'Security patches rolled up to 2026-01-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 11%.
Fixed a crash when switching SIM slots while on a call.', 'B2052.22', 4, 0, '2026-01-01 09:00:00'::timestamp),
  (68, 117, 'S-5-64', 'Vendor OS 5.3 for S-5 64GB Sand', 'Security patches rolled up to 2026-02-15.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 4%.
Fixed a crash when switching SIM slots while on a call.', 'B2039.84', 3, 0, '2026-02-15 09:00:00'::timestamp),
  (69, 117, 'S-5-64', 'Vendor OS 5.2 for S-5 64GB Sand', 'Security patches rolled up to 2026-04-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 7%.
Fixed a crash when switching SIM slots while on a call.', 'B2026.74', 2, 0, '2026-04-01 09:00:00'::timestamp),
  (70, 117, 'S-5-64', 'Vendor OS 5.1 for S-5 64GB Sand', 'Security patches rolled up to 2026-05-16.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 11%.
Fixed a crash when switching SIM slots while on a call.', 'B2013.99', 1, 0, '2026-05-16 09:00:00'::timestamp),
  (71, 118, 'S-5-128', 'Vendor OS 5.4 for S-5 128GB Graphite', 'Security patches rolled up to 2026-01-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 6%.
Fixed a crash when switching SIM slots while on a call.', 'B2052.65', 4, 0, '2026-01-01 09:00:00'::timestamp),
  (72, 118, 'S-5-128', 'Vendor OS 5.3 for S-5 128GB Graphite', 'Security patches rolled up to 2026-02-15.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 6%.
Fixed a crash when switching SIM slots while on a call.', 'B2039.45', 3, 0, '2026-02-15 09:00:00'::timestamp),
  (73, 118, 'S-5-128', 'Vendor OS 5.2 for S-5 128GB Graphite', 'Security patches rolled up to 2026-04-01.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 6%.
Fixed a crash when switching SIM slots while on a call.', 'B2026.47', 2, 0, '2026-04-01 09:00:00'::timestamp),
  (74, 118, 'S-5-128', 'Vendor OS 5.1 for S-5 128GB Graphite', 'Security patches rolled up to 2026-05-16.
Camera night mode noise reduction improved.
Battery drain during standby reduced by roughly 9%.
Fixed a crash when switching SIM slots while on a call.', 'B2013.39', 1, 0, '2026-05-16 09:00:00'::timestamp);


-- ---------------------------------------------------------------
-- Service agencies.
-- The business column is a positional flag string read by index on the client:
-- 0 = OS, 1 = Repair, 2 = Insurance, 3 = Change. It must stay exactly
-- four characters of '0'/'1'.
-- ---------------------------------------------------------------
INSERT INTO phone_agencies (agency_pk, agency_name, phone_numbers, business, location_pk, location_more, agency_rating, is_deleted, created_at) VALUES
  (1, 'Capital Repair Studio #1', '198-330-9714', '0101', 1, '224 Garden Street', 3.30, 0, '2024-05-29 09:00:00'::timestamp),
  (2, 'Capital Repair Studio #2', '195-259-5947', '0011', 1, '126 Main Street', 4.00, 0, '2024-12-29 09:00:00'::timestamp),
  (3, 'Capital Tech Hub #3', '197-470-7327', '1010', 1, '38 Harbour Street', 4.70, 0, '2024-09-16 09:00:00'::timestamp),
  (4, 'Capital Repair Studio #4', '192-307-3325', '0101', 1, '82 Market Street', 3.50, 0, '2025-07-27 09:00:00'::timestamp),
  (5, 'Capital Tech Hub #5', '199-438-1457', '1110', 1, '173 Harbour Street', 4.10, 0, '2024-04-29 09:00:00'::timestamp),
  (6, 'North Province Support Desk #1', '196-578-2725', '1110', 2, '3 Garden Street', 4.60, 0, '2024-03-28 09:00:00'::timestamp),
  (7, 'North Province Support Desk #2', '196-663-6876', '0100', 2, '240 Station Street', 3.90, 0, '2026-02-25 09:00:00'::timestamp),
  (8, 'North Province Tech Hub #3', '196-411-1047', '0001', 2, '80 Harbour Street', 3.40, 0, '2024-05-26 09:00:00'::timestamp),
  (9, 'South Province Tech Hub #1', '191-535-3519', '1011', 3, '156 Garden Street', 4.30, 0, '2024-12-28 09:00:00'::timestamp),
  (10, 'South Province Tech Hub #2', '195-591-2846', '0010', 3, '191 Main Street', 3.10, 0, '2026-02-21 09:00:00'::timestamp),
  (11, 'South Province Tech Hub #3', '195-477-2392', '0100', 3, '169 Market Street', 3.20, 0, '2025-11-22 09:00:00'::timestamp),
  (12, 'South Province Tech Hub #4', '197-440-6870', '1001', 3, '154 Main Street', 3.90, 0, '2025-06-19 09:00:00'::timestamp),
  (13, 'East Province Care Point #1', '193-335-3907', '0100', 4, '211 Main Street', 4.00, 0, '2025-07-29 09:00:00'::timestamp),
  (14, 'East Province Tech Hub #2', '196-656-5693', '0111', 4, '36 Garden Street', 3.20, 0, '2024-06-02 09:00:00'::timestamp),
  (15, 'East Province Repair Studio #3', '196-725-4973', '1111', 4, '92 Main Street', 4.80, 0, '2025-11-07 09:00:00'::timestamp),
  (16, 'West Province Service Center #1', '192-696-3667', '1011', 5, '35 Market Street', 3.20, 0, '2024-03-05 09:00:00'::timestamp),
  (17, 'West Province Care Point #2', '191-482-3144', '1011', 5, '22 Station Street', 3.30, 0, '2024-11-30 09:00:00'::timestamp),
  (18, 'West Province Service Center #3', '196-492-6480', '1010', 5, '179 Garden Street', 4.50, 0, '2025-12-06 09:00:00'::timestamp),
  (19, 'Coastal Region Repair Studio #1', '195-382-7273', '0111', 6, '102 Main Street', 4.50, 0, '2025-02-21 09:00:00'::timestamp),
  (20, 'Coastal Region Repair Studio #2', '193-706-7140', '0010', 6, '55 Garden Street', 4.60, 0, '2024-08-25 09:00:00'::timestamp),
  (21, 'Coastal Region Service Center #3', '191-746-7771', '0111', 6, '185 Market Street', 3.30, 0, '2025-11-26 09:00:00'::timestamp),
  (22, 'Highland Region Support Desk #1', '197-999-6289', '1011', 7, '114 Main Street', 4.40, 0, '2024-10-14 09:00:00'::timestamp),
  (23, 'Highland Region Support Desk #2', '195-355-3381', '0111', 7, '126 Market Street', 3.80, 0, '2024-08-21 09:00:00'::timestamp),
  (24, 'Highland Region Service Center #3', '197-980-4846', '1001', 7, '144 Harbour Street', 4.10, 0, '2025-10-04 09:00:00'::timestamp);


-- ---------------------------------------------------------------
-- FAQs. category = 1 is FAQ_CATEGORY.PHONE, which is what the vendor
-- site's /phone_faqs endpoint filters on.
-- ---------------------------------------------------------------
INSERT INTO faqs (faq_pk, question, answer, category, position, is_deleted, created_by, created_at) VALUES
  (1, 'How do I register my phone for warranty?', 'Open Settings > About > Register, or bring the handset to any authorised service centre with the purchase receipt. Registration must be completed within 30 days of purchase.', 1, 1, 0, 1, '2025-12-10 09:00:00'::timestamp),
  (2, 'What does the standard warranty cover?', 'Manufacturing defects for 12 months from the purchase date. Physical damage, liquid ingress and unauthorised repairs are not covered.', 1, 2, 0, 1, '2026-03-26 09:00:00'::timestamp),
  (3, 'How long does a screen replacement take?', 'Most service centres complete a display replacement the same day, provided the part is in stock. Allow 3 working days if the part has to be ordered.', 1, 3, 0, 1, '2025-03-27 09:00:00'::timestamp),
  (4, 'Can I transfer my warranty to another owner?', 'Yes. Both parties should visit a service centre with identification so the registration can be reassigned.', 1, 4, 0, 1, '2025-11-24 09:00:00'::timestamp),
  (5, 'My handset will not power on. What should I check first?', 'Charge for at least 30 minutes with the supplied adapter, then hold the power button for 15 seconds. If there is still no response, contact a service centre.', 1, 5, 0, 1, '2026-03-31 09:00:00'::timestamp),
  (6, 'How do I back up before a repair?', 'Settings > System > Backup writes a full archive to an SD card or to your account. Service centres cannot guarantee data retention during a repair.', 1, 6, 0, 1, '2025-10-12 09:00:00'::timestamp),
  (7, 'Where can I check the status of my repair?', 'The service centre issues a job number on drop-off. Quote it on the support line to get the current status.', 1, 7, 0, 1, '2026-02-17 09:00:00'::timestamp),
  (8, 'Is the battery user-replaceable?', 'No. The battery is sealed. Replacement is a service-centre operation and is priced in the accessory table on each product page.', 1, 8, 0, 1, '2025-09-28 09:00:00'::timestamp),
  (9, 'How often are OS updates released?', 'Security updates roughly every 45 days, feature updates twice a year. The changelog on each product page lists every build.', 1, 9, 0, 1, '2026-04-25 09:00:00'::timestamp),
  (10, 'What should I do if I forget my account password?', 'Use "Forgot password" on the sign-in screen. A verification code is sent to the registered phone number.', 1, 10, 0, 1, '2025-11-29 09:00:00'::timestamp),
  (11, 'Does the phone support memory card expansion?', 'Yes, up to 1TB via the microSD slot in the SIM tray.', 1, 11, 0, 1, '2026-04-01 09:00:00'::timestamp),
  (12, 'How do I find my IMEI?', 'Dial *#06#, or check Settings > About > Status. It is also printed on the retail box.', 1, 12, 0, 1, '2025-05-28 09:00:00'::timestamp);


-- ---------------------------------------------------------------
-- Explicit pks were supplied above, which leaves every sequence behind
-- the data. Without this the next application insert collides on the
-- primary key. setval is guarded so a missing sequence is skipped
-- rather than aborting the transaction.
-- ---------------------------------------------------------------
DO $seed$
DECLARE
  pair    RECORD;
  seq_min BIGINT;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('locations_s',           'locations',           'location_pk'),
      ('managers_s',            'managers',            'manager_pk'),
      ('users_s',               'users',               'user_pk'),
      ('product_categories_s',  'product_categories',  'category_pk'),
      ('products_s',            'products',            'product_pk'),
      ('product_images_s',      'product_images',      'table_pk'),
      ('product_spec_keys_s',   'product_spec_keys',   'spec_pk'),
      ('product_spec_orders_s', 'product_spec_orders', 'table_pk'),
      ('product_spec_values_s', 'product_spec_values', 'table_pk'),
      ('product_models_s',      'product_models',      'model_pk'),
      ('phone_accessories_s',   'phone_accessories',   'accessory_pk'),
      ('phone_changelog_s',     'phone_changelog',     'table_pk'),
      ('phone_agencies_s',      'phone_agencies',      'agency_pk'),
      ('faqs_s',                'faqs',                'faq_pk')
    ) AS t(seq, tbl, col)
  LOOP
    IF to_regclass(pair.seq) IS NOT NULL AND to_regclass(pair.tbl) IS NOT NULL THEN
      -- Clamp to the sequence's OWN minimum, not to 1. Several of these
      -- sequences start at 1000 to leave room below for reserved rows,
      -- and setval rejects a value under MINVALUE outright - which
      -- aborted the whole seed at the very last statement, after every
      -- insert had already run.
      SELECT min_value INTO seq_min
        FROM pg_sequences
       WHERE schemaname || '.' || sequencename = pair.seq
          OR (sequencename = pair.seq AND schemaname = current_schema());

      EXECUTE format(
        'SELECT setval(%L, GREATEST((SELECT COALESCE(MAX(%I), 0) FROM %I), %s))',
        pair.seq, pair.col, pair.tbl, COALESCE(seq_min, 1)
      );
    END IF;
  END LOOP;
END
$seed$;

COMMIT;

-- ---------------------------------------------------------------
-- Row counts, for a quick check that the load did what it should.
-- ---------------------------------------------------------------
SELECT 'locations'          AS table_name, COUNT(*) AS rows FROM locations
UNION ALL SELECT 'users',               COUNT(*) FROM users
UNION ALL SELECT 'product_categories',  COUNT(*) FROM product_categories
UNION ALL SELECT 'products',            COUNT(*) FROM products
UNION ALL SELECT 'product_images',      COUNT(*) FROM product_images
UNION ALL SELECT 'product_spec_keys',   COUNT(*) FROM product_spec_keys
UNION ALL SELECT 'product_spec_orders', COUNT(*) FROM product_spec_orders
UNION ALL SELECT 'product_spec_values', COUNT(*) FROM product_spec_values
UNION ALL SELECT 'product_models',      COUNT(*) FROM product_models
UNION ALL SELECT 'phone_accessories',   COUNT(*) FROM phone_accessories
UNION ALL SELECT 'phone_changelog',     COUNT(*) FROM phone_changelog
UNION ALL SELECT 'phone_agencies',      COUNT(*) FROM phone_agencies
UNION ALL SELECT 'faqs',                COUNT(*) FROM faqs;
