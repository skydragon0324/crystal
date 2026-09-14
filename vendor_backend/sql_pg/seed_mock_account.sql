-- =====================================================================
-- seed_mock_account.sql - fixture data for the ACCOUNT pages
--
-- seed_mock_data.sql seeds the public catalogue (products, FAQs,
-- agencies). It inserts nothing for the account area, which is why every
-- page under /vendor/account renders an empty table even on a database
-- that loaded cleanly.
--
-- This file fills the account tables. Unlike seed_mock_data.sql it is not
-- generated from mock/fixtures.js and is not keyed to fixed user pks:
-- it loops over whatever rows are in ora_pid.users and gives each one a
-- full history. That way it covers the account you actually log in with,
-- not just the three fixture logins.
--
-- Prerequisites:
--   sql_pg/00_compat.sql + the numbered schema files   (ora_pid tables)
--   sql_pg/91_mock_satellite_schemas.sql               (ora_blog, ora_license,
--                                                       ora_media, ora_old_db)
--
-- Run:
--   psql -d vendor -f sql_pg/91_mock_satellite_schemas.sql
--   psql -d vendor -f sql_pg/seed_mock_account.sql
--
-- Re-runnable. Every row it writes carries a pk at or above MOCK_BASE
-- (9e11) and the delete block below removes exactly that range, so a
-- second run replaces the mock rows and leaves anything real untouched.
--
-- What it does NOT cover: the eshop, appstore and licence-keygen pages.
-- Those endpoints do not read the database at all - they proxy an
-- external HTTP service (api/eshopApi.js, api/appstoreApi.js,
-- api/webApi.js). Set USE_MOCK_API=true to serve those from
-- mock/mockExternalApi.js. See mock/README.md.
-- =====================================================================

\set ON_ERROR_STOP on

SET search_path TO ora_pid, public;

BEGIN;

-- ---------------------------------------------------------------
-- Remove a previous run. Children before parents.
-- 900000000000 is MOCK_BASE; see the DO block below.
-- ---------------------------------------------------------------
DELETE FROM ora_pid.feedback_messages      WHERE message_pk  >= 900000000000;
DELETE FROM ora_pid.feedback_threads       WHERE thread_pk   >= 900000000000;
DELETE FROM ora_pid.activity_point_log     WHERE table_pk    >= 900000000000;
DELETE FROM ora_pid.appstore_point_log     WHERE table_pk    >= 900000000000;
DELETE FROM ora_pid.karaoke_point_log      WHERE table_pk    >= 900000000000;
DELETE FROM ora_pid.bmedia_point_log       WHERE table_pk    >= 900000000000;
DELETE FROM ora_pid.soft_point_log         WHERE table_pk    >= 900000000000;

DELETE FROM ora_blog.blog_article_lob      WHERE id          >= 900000000000;
DELETE FROM ora_blog.blog_article_info     WHERE id          >= 900000000000;
DELETE FROM ora_blog.blog_article          WHERE id          >= 900000000000;

DELETE FROM ora_license.tbl_error_list     WHERE id          >= 900000000000;
DELETE FROM ora_license.tbl_licgen         WHERE id          >= 900000000000;

DELETE FROM ora_media.tbl_licenses         WHERE id          >= 900000000000;
DELETE FROM ora_media.tbl_old_license_score WHERE id         >= 900000000000;

DELETE FROM ora_old_db.customer_prize_log  WHERE id          >= 900000000000;
DELETE FROM ora_old_db.customers           WHERE user_pk     >= 900000000000;


-- ---------------------------------------------------------------
-- Reference rows shared by every user.
--
-- activity_point_types: findActivityPointLog falls back to
-- "main_type sub_type" when activity_point_log.reason is NULL, so the
-- Activity page shows a blank reason column without these. type_pk
-- values are POINT_TYPE_VALUES from constants/constants.js - the point
-- log joins on them, so they cannot be renumbered freely.
-- ---------------------------------------------------------------
INSERT INTO ora_pid.activity_point_types (type_pk, main_type, sub_type, note, points) VALUES
  (100001, 'Daily login',   'Fixed line',        'First login of the day',      5),
  (100101, 'Holiday',       'Public holiday',    'Holiday bonus',              20),
  (100201, 'Birthday',      'Birthday bonus',    'Once a year',               100),
  (200001, 'Daily login',   'Mobile',            'First mobile login',          5),
  (200201, 'Birthday',      'Mobile birthday',   'Once a year',               100),
  (209001, 'Registration',  'Mobile register',   'Handset registered',        200),
  (300001, 'Blog',          'Posted a topic',    'Discussion board',           30),
  (300002, 'Blog',          'Replied',           'Reply to an article',        10),
  (300006, 'Blog',          'Posted to PID',     'Main board',                 40),
  (300101, 'Blog',          'Gold recommend',    'Received a gold thumb',      50),
  (300102, 'Blog',          'Silver recommend',  'Received a silver thumb',    30),
  (300103, 'Blog',          'Bronze recommend',  'Received a bronze thumb',    10),
  (900101, 'Manager',       'Manual credit',     'Adjusted by an operator',     0),
  (900102, 'Manager',       'Manual debit',      'Adjusted by an operator',     0)
ON CONFLICT (type_pk) DO NOTHING;

-- Media providers back the "reason" column of the legacy B-media log.
INSERT INTO ora_media.tbl_media_providers (id, short_name, full_name, contact) VALUES
  (1, 'Central Media',   'Central Media Distribution', '191-300-1000'),
  (2, 'Northern Studio', 'Northern Studio Ltd',        '192-410-2200'),
  (3, 'Coastal Records', 'Coastal Records Group',      '193-520-3300')
ON CONFLICT (id) DO NOTHING;

-- Subjects for the legacy blog. The ids match BLOG_OLD_CATEGORIES in the
-- client's constants.js, which is what turns subject_id into a label -
-- an id outside this set renders as an empty Subject cell.
INSERT INTO ora_blog.blog_subject (id, name, parent, order_no, state) VALUES
  (1,  'Discussion',   0, 1, 1),
  (2,  'Product',      0, 2, 1),
  (21, 'Mobile phone', 2, 1, 1),
  (22, 'TV',           2, 2, 1),
  (23, 'Computer',     2, 3, 1),
  (24, 'Other',        2, 4, 1),
  (3,  'IT',           0, 3, 1),
  (4,  'Science',      0, 4, 1),
  (5,  'Economy',      0, 5, 1),
  (6,  'Help',         0, 6, 1)
ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------
-- A deterministic stand-in for random().
--
-- Plain (user_pk + i * k) % m arithmetic looks fine until a user_pk is
-- a round number: 10000000 % 5000 is 0, so a whole column comes out
-- zero and the page looks broken rather than seeded. Hashing the seed
-- string first removes that coupling.
--
-- Deterministic on purpose - the same database twice gives byte
-- identical rows, so re-running the seed is a no-op you can diff.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.mock_rand(seed TEXT, modulus INT)
RETURNS INT
LANGUAGE sql IMMUTABLE
-- The bigint cast is not cosmetic: bit(32) can land on -2147483648 and
-- abs() of that overflows a signed int.
AS $$ SELECT (abs((('x' || substr(md5(seed), 1, 8))::bit(32)::int)::bigint) % modulus)::int $$;


-- ---------------------------------------------------------------
-- Per-user history.
--
-- seq numbers the users so each one gets a disjoint pk block.
-- ---------------------------------------------------------------
DO $seed$
DECLARE
  MOCK_BASE   CONSTANT BIGINT := 900000000000;
  BLOCK       CONSTANT BIGINT := 1000000;   -- pk room per user
  u           RECORD;
  seq         BIGINT := 0;
  ubase       BIGINT;
  -- Every timestamp is measured back from this instant so the pages show
  -- a plausible recent history whenever the seed is run.
  now_ts      CONSTANT TIMESTAMP := date_trunc('minute', CURRENT_TIMESTAMP);
  reasons     CONSTANT TEXT[] := ARRAY[
                'Licence issued', 'Purchase reward', 'Daily login bonus',
                'Refund adjustment', 'Song pack unlocked', 'Provider bonus',
                'Point expiry', 'Manual correction'];
  minus_why   CONSTANT TEXT[] := ARRAY[
                'Penalty: duplicate registration', 'Manual deduction',
                'Chargeback', 'Licence revoked'];
  fb_titles   CONSTANT TEXT[] := ARRAY[
                'Screen flickers after the 5.1 update',
                'Order never arrived',
                'Wallet balance is wrong',
                'Cannot register my IMEI',
                'Suggestion: dark mode for the store'];
  fb_last     CONSTANT TEXT[] := ARRAY[
                'Thanks for the report - we have escalated this to the service team.',
                'Could you send the job number from your drop-off receipt?',
                'This has been resolved in build B2039.',
                'We have credited the difference back to your wallet.'];
  art_titles  CONSTANT TEXT[] := ARRAY[
                'Two weeks with the new flagship',
                'How I fixed the sync drop-outs',
                'Battery life compared across three handsets',
                'A short guide to the camera modes',
                'Which storage tier is actually worth it',
                'Setting up a home media server',
                'What the 5.1 update changed'];
  subjects    CONSTANT INT[]  := ARRAY[1, 21, 22, 23, 24, 3, 4, 5, 6];
  art_states  CONSTANT INT[]  := ARRAY[0, 1, 3, 4, 5];   -- ARTICLE_STATES, minus PUB_TEMP
  i           INT;
  n_rows      INT;
  cust_pk     BIGINT;
  thread_pk   BIGINT;
  art_id      BIGINT;
  msg_count   INT;
  j           INT;
BEGIN
  FOR u IN SELECT user_pk, user_id, user_name FROM ora_pid.users ORDER BY user_pk LOOP
    seq   := seq + 1;
    ubase := MOCK_BASE + seq * BLOCK;

    -- -----------------------------------------------------------
    -- Merge ids.
    --
    -- The eshop and appstore controllers resolve the external account
    -- from this table before they call out. With no row they answer
    -- "Eshop user id not found" and never reach the API at all, so the
    -- mock API layer needs this row just as much as a real deployment.
    -- -----------------------------------------------------------
    INSERT INTO ora_pid.user_merge_ids
      (pvendor_pk, pvendor_id, fixed_pk, fixed_id, fixed_status,
       appstore_pk, appstore_id, eshop_pk, eshop_id)
    VALUES
      (u.user_pk, u.user_id, ubase, u.user_id || '_fx', 1,
       'mock-appstore-' || u.user_pk, u.user_id, ubase, u.user_id)
    ON CONFLICT (pvendor_pk) DO UPDATE
      SET appstore_pk = EXCLUDED.appstore_pk,
          appstore_id = EXCLUDED.appstore_id,
          eshop_pk    = EXCLUDED.eshop_pk,
          eshop_id    = EXCLUDED.eshop_id;

    -- -----------------------------------------------------------
    -- Legacy customer record. activity_old_log looks the customer up by
    -- LOGIN NAME and then pages the prize log by the customer's own pk,
    -- which is a different number space from ora_pid.users.user_pk.
    -- -----------------------------------------------------------
    cust_pk := ubase;
    INSERT INTO ora_old_db.customers (user_pk, user_name, user_sex, user_birthday, user_password, user_userid)
    VALUES (cust_pk, COALESCE(u.user_name, u.user_id), 1, TIMESTAMP '1990-01-01', '', u.user_id);

    FOR i IN 0..17 LOOP
      INSERT INTO ora_old_db.customer_prize_log (id, customer_id, prize_val, note, fill_date)
      VALUES (
        ubase + 40000 + i,
        cust_pk,
        (pg_temp.mock_rand(u.user_id || '-37-' || i, 900) + 50)::numeric / 10,
        (ARRAY['Legacy event credit', 'Migrated balance', 'Anniversary prize', 'Survey reward'])[(i % 4) + 1],
        now_ts - ((i * 9 + 3) || ' days')::interval);
    END LOOP;

    -- -----------------------------------------------------------
    -- Software point logs.
    --
    -- Four pages share one shape. appstore/karaoke/bmedia each have
    -- their own table; the "minus point" page reads soft_point_log
    -- filtered to point_type = 3 (SOFT_POINT_TYPES.MANAGER).
    -- pay_points is what the user spent, soft_points what they earned.
    -- -----------------------------------------------------------
    FOR i IN 0..18 LOOP
      INSERT INTO ora_pid.appstore_point_log
        (table_pk, user_pk, status, reason, equ_num, pay_points, soft_points, related_pk, is_agency, action_at)
      VALUES (
        ubase + 1000 + i, u.user_pk, (i % 2),
        reasons[(pg_temp.mock_rand(u.user_id || '-a-' || i, 8)) + 1],
        'APP-' || lpad(((pg_temp.mock_rand(u.user_id || '-17-' || i, 900000)) + 100000)::text, 6, '0'),
        (pg_temp.mock_rand(u.user_id || '-23-' || i, 5000))::numeric / 10,
        (pg_temp.mock_rand(u.user_id || '-11-' || i, 900))::numeric / 10,
        NULL, 0,
        now_ts - ((i * 6 + 1) || ' days')::interval);

      INSERT INTO ora_pid.karaoke_point_log
        (table_pk, user_pk, status, reason, equ_num, pay_points, soft_points, related_pk, is_agency, action_at)
      VALUES (
        ubase + 2000 + i, u.user_pk, (i % 2),
        reasons[(pg_temp.mock_rand(u.user_id || '-3-' || i, 8)) + 1],
        'KAR-' || lpad(((pg_temp.mock_rand(u.user_id || '-29-' || i, 900000)) + 100000)::text, 6, '0'),
        (pg_temp.mock_rand(u.user_id || '-31-' || i, 4000))::numeric / 10,
        (pg_temp.mock_rand(u.user_id || '-7-' || i, 800))::numeric / 10,
        NULL, 0,
        now_ts - ((i * 7 + 2) || ' days')::interval);

      INSERT INTO ora_pid.bmedia_point_log
        (table_pk, user_pk, status, reason, equ_num, pay_points, soft_points, related_pk, is_agency, action_at)
      VALUES (
        ubase + 3000 + i, u.user_pk, (i % 2),
        reasons[(pg_temp.mock_rand(u.user_id || '-5-' || i, 8)) + 1],
        'BM-' || lpad(((pg_temp.mock_rand(u.user_id || '-41-' || i, 900000)) + 100000)::text, 6, '0'),
        (pg_temp.mock_rand(u.user_id || '-19-' || i, 3000))::numeric / 10,
        (pg_temp.mock_rand(u.user_id || '-13-' || i, 700))::numeric / 10,
        NULL, 0,
        now_ts - ((i * 8 + 3) || ' days')::interval);

      -- point_type 3 = SOFT_POINT_TYPES.MANAGER, the minus-point page.
      INSERT INTO ora_pid.soft_point_log
        (table_pk, user_pk, point_type, status, reason, equ_num, pay_points, soft_points, related_pk, is_agency, action_at)
      VALUES (
        ubase + 4000 + i, u.user_pk, 3, (i % 2),
        minus_why[(i % 4) + 1],
        'SFT-' || lpad(((pg_temp.mock_rand(u.user_id || '-43-' || i, 900000)) + 100000)::text, 6, '0'),
        0,
        -1 * ((pg_temp.mock_rand(u.user_id || '-17-' || i, 500))::numeric / 10),
        NULL, 0,
        now_ts - ((i * 5 + 1) || ' days')::interval);
    END LOOP;

    -- -----------------------------------------------------------
    -- Activity points. type_pk has to exist in activity_point_types or
    -- the reason column falls back to NULL.
    -- -----------------------------------------------------------
    FOR i IN 0..18 LOOP
      INSERT INTO ora_pid.activity_point_log
        (table_pk, user_pk, type_pk, points, reason, related_pk, everyday_cnt, ip_address, action_at)
      VALUES (
        ubase + 5000 + i,
        u.user_pk,
        (ARRAY[100001, 100101, 100201, 200001, 209001, 300001, 300002, 300006, 900101])[(i % 9) + 1],
        (pg_temp.mock_rand(u.user_id || '-13-' || i, 200) + 5)::numeric / 1,
        CASE WHEN i % 3 = 0 THEN NULL   -- exercise the main_type/sub_type fallback
             ELSE (ARRAY['Event participation', 'Survey completed', 'Referral reward'])[(i % 3) + 1] END,
        NULL,
        1,
        CASE WHEN i % 2 = 0 THEN NULL ELSE '10.0.' || (i % 250) || '.' || ((i * 7) % 250) END,
        now_ts - ((i * 4 + 1) || ' days')::interval);
    END LOOP;

    -- -----------------------------------------------------------
    -- Legacy karaoke licences  ->  "Karaoke old log".
    --
    -- The query keeps rows with is_agent = 0 and resultlog = 0 and drops
    -- any whose error row has error_status = 2, and it hard-filters
    -- created_at >= 2025-08-20, so nothing older than that will ever
    -- appear on the page no matter what is inserted here.
    -- -----------------------------------------------------------
    FOR i IN 0..15 LOOP
      INSERT INTO ora_license.tbl_licgen
        (id, userid, machinekey, real_price, bonus_score, is_agent, resultlog, created_at)
      VALUES (
        ubase + 6000 + i, u.user_id,
        'MK-' || lpad(((pg_temp.mock_rand(u.user_id || '-53-' || i, 900000)) + 100000)::text, 6, '0'),
        (pg_temp.mock_rand(u.user_id || '-27-' || i, 6000))::numeric / 10,
        (pg_temp.mock_rand(u.user_id || '-9-' || i, 600))::numeric / 10,
        0, 0,
        now_ts - ((i * 6 + 2) || ' days')::interval);
    END LOOP;

    -- One rejected licence, so the "error_status = 2 is hidden" branch
    -- has something to hide.
    INSERT INTO ora_license.tbl_error_list (id, lic_id, error_status, note)
    VALUES (ubase + 6900, ubase + 6000, 2, 'Reported as a bad key and withdrawn');

    -- -----------------------------------------------------------
    -- Legacy media licences  ->  "B-media old log". Same 2025-08-20
    -- floor as the karaoke log.
    -- -----------------------------------------------------------
    FOR i IN 0..15 LOOP
      INSERT INTO ora_media.tbl_licenses
        (id, userid, dev_id, provider, cal_price, bonus_score, result, date_time)
      VALUES (
        ubase + 7000 + i, u.user_id,
        'DEV-' || lpad(((pg_temp.mock_rand(u.user_id || '-61-' || i, 900000)) + 100000)::text, 6, '0'),
        ((i % 3) + 1),
        (pg_temp.mock_rand(u.user_id || '-33-' || i, 5000))::numeric / 10,
        (pg_temp.mock_rand(u.user_id || '-15-' || i, 500))::numeric / 10,
        1,
        now_ts - ((i * 7 + 1) || ' days')::interval);
    END LOOP;

    -- The carried-over balance the controller prepends to page 1.
    INSERT INTO ora_media.tbl_old_license_score (id, userid, cal_price, score, status, date_time)
    VALUES (ubase + 7900, u.user_id,
            (pg_temp.mock_rand(u.user_id || '-b', 4000))::numeric / 10,
            (pg_temp.mock_rand(u.user_id || '-b', 3000))::numeric / 10,
            1,
            now_ts - INTERVAL '200 days');

    -- -----------------------------------------------------------
    -- Feedback threads and their messages.
    --
    -- action_type 0 = written by the customer, 1 = written by support;
    -- the thread's last_type mirrors whoever spoke last, which is what
    -- decides the unread marker on the list.
    -- -----------------------------------------------------------
    FOR i IN 0..10 LOOP
      thread_pk := ubase + 8000 + i;
      msg_count := (i % 5) + 2;

      INSERT INTO ora_pid.feedback_threads
        (thread_pk, user_pk, title, category, thread_source, last_message, last_type,
         status, is_read, is_deleted, session_by, created_at, updated_at)
      VALUES (
        thread_pk, u.user_pk,
        fb_titles[(i % 5) + 1],
        (i % 4),
        0,
        fb_last[(i % 4) + 1],
        CASE WHEN (msg_count - 1) % 2 = 0 THEN 0 ELSE 1 END,
        (i % 3),
        (i % 2),
        0,
        NULL,
        now_ts - ((i * 14 + 5) || ' days')::interval,
        now_ts - ((i * 14) || ' days')::interval);

      FOR j IN 0..(msg_count - 1) LOOP
        INSERT INTO ora_pid.feedback_messages
          (message_pk, thread_pk, message, action_type, action_by, action_at)
        VALUES (
          ubase + 900000 + i * 20 + j,
          thread_pk,
          CASE WHEN j % 2 = 0
               THEN 'Message ' || (j + 1) || ' from the customer describing the issue in more detail.'
               ELSE 'Message ' || (j + 1) || ' from support with the next step.' END,
          (j % 2),
          u.user_pk,
          now_ts - ((i * 14 + 5) || ' days')::interval + ((j * 3) || ' hours')::interval);
      END LOOP;
    END LOOP;

    -- -----------------------------------------------------------
    -- Legacy blog articles  ->  "My articles" and "My drafts".
    --
    -- Keyed by LOGIN NAME (blog_article.user_userid), not user_pk.
    -- state = -2 (ARTICLE_STATES.PUB_TEMP) is the draft state: the
    -- articles page excludes it and the drafts page asks for it, so the
    -- two pages are the same query split on this column.
    -- -----------------------------------------------------------
    FOR i IN 0..11 LOOP
      art_id := ubase + 9000 + i;
      -- The last four are drafts.
      INSERT INTO ora_blog.blog_article
        (id, user_userid, subject_id, parent, title, summary, hash_summary, cleaned_content,
         image_url, state, type, reason, origin, publish_num, publish_org,
         create_at, modify_at, publish_at, notice_at)
      VALUES (
        art_id, u.user_id,
        subjects[(i % 9) + 1],
        0,
        CASE WHEN i >= 8 THEN 'Draft: ' ELSE '' END || art_titles[(i % 7) + 1],
        '<p>' || art_titles[(i % 7) + 1] || ' - a short summary of what the article covers.</p>',
        NULL,
        NULL,
        NULL,
        CASE WHEN i >= 8 THEN -2 ELSE art_states[(i % 5) + 1] END,
        CASE WHEN i % 2 = 0 THEN 2 ELSE 1 END,   -- 2 = BLOG, 1 = BBS
        CASE WHEN art_states[(i % 5) + 1] = 5 THEN 'Does not meet the publishing guidelines' ELSE NULL END,
        NULL, 0, NULL,
        now_ts - ((i * 9 + 2) || ' days')::interval,
        now_ts - ((i * 9) || ' days')::interval,
        CASE WHEN i < 8 THEN now_ts - ((i * 9) || ' days')::interval ELSE NULL END,
        NULL);

      INSERT INTO ora_blog.blog_article_info
        (id, is_help_request, help_status, visited_num, reply_num,
         gold_recom_num, silber_recom_num, recommended_num, is_new)
      VALUES (
        art_id,
        (i % 3 = 0)::int,
        (i % 5),
        pg_temp.mock_rand(u.user_id || '-71-' || i, 4000),
        pg_temp.mock_rand(u.user_id || '-7-' || i, 40),
        pg_temp.mock_rand(u.user_id || '-a-' || i, 6),
        pg_temp.mock_rand(u.user_id || '-3-' || i, 15),
        pg_temp.mock_rand(u.user_id || '-5-' || i, 30),
        (i < 2)::int);

      INSERT INTO ora_blog.blog_article_lob (id, content, approval_num)
      VALUES (
        art_id,
        '<p>' || art_titles[(i % 7) + 1] || '</p>' ||
        '<p>Body text for the mock article. It is long enough to show how the ' ||
        'detail modal wraps a paragraph, and short enough to stay readable.</p>',
        pg_temp.mock_rand(u.user_id || '-a-' || i, 5));
    END LOOP;

  END LOOP;

  RAISE NOTICE 'seeded the account area for % user(s)', seq;
END
$seed$;

COMMIT;


-- ---------------------------------------------------------------
-- Row counts, for a quick check that the load did what it should.
-- ---------------------------------------------------------------
SELECT 'user_merge_ids'        AS table_name, COUNT(*) AS rows FROM ora_pid.user_merge_ids
UNION ALL SELECT 'appstore_point_log',   COUNT(*) FROM ora_pid.appstore_point_log
UNION ALL SELECT 'karaoke_point_log',    COUNT(*) FROM ora_pid.karaoke_point_log
UNION ALL SELECT 'bmedia_point_log',     COUNT(*) FROM ora_pid.bmedia_point_log
UNION ALL SELECT 'soft_point_log',       COUNT(*) FROM ora_pid.soft_point_log
UNION ALL SELECT 'activity_point_log',   COUNT(*) FROM ora_pid.activity_point_log
UNION ALL SELECT 'feedback_threads',     COUNT(*) FROM ora_pid.feedback_threads
UNION ALL SELECT 'feedback_messages',    COUNT(*) FROM ora_pid.feedback_messages
UNION ALL SELECT 'customers',            COUNT(*) FROM ora_old_db.customers
UNION ALL SELECT 'customer_prize_log',   COUNT(*) FROM ora_old_db.customer_prize_log
UNION ALL SELECT 'tbl_licgen',           COUNT(*) FROM ora_license.tbl_licgen
UNION ALL SELECT 'tbl_licenses',         COUNT(*) FROM ora_media.tbl_licenses
UNION ALL SELECT 'blog_article',         COUNT(*) FROM ora_blog.blog_article;
