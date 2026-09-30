-- ---------------------------------------------------------------------
-- Delta 011 - every closed word list becomes a native enum TYPE.
--
-- They were `varchar` with a CHECK per column. That worked, and cost three
-- things worth naming:
--
--   the list was written out AGAIN at every column that used it, so
--   warranty_policies.kind and warranties.kind were two copies of the same
--   four words with nothing keeping them in step - and faqs.status was a
--   third case, where the table defaulted to PUBLISHED while the import
--   sheet offered ACTIVE and INACTIVE, and neither knew about the other;
--
--   nothing outside a table could refer to its list. A function taking a
--   status had to take text and hope;
--
--   a mistyped value raised a check violation naming a constraint, rather
--   than an error naming the type and the value that is not in it.
--
-- A lookup table was the other way to fix it, and would have bought a join
-- on every read of a product, a ticket or a shelf movement to turn an id
-- back into the word it always was - plus an id in payloads both frontends
-- already speak the words of. An enum is the same constraint with none of
-- that.
--
-- THE ORDER OF THE VALUES IS THE SORT ORDER: Postgres sorts an enum by
-- declaration rather than alphabetically, so `ORDER BY status` becomes the
-- lifecycle instead of the alphabet. That is a change in behaviour on any
-- screen sorted by one of these columns, and it is the reason the values are
-- declared in the order they happen in.
--
-- sql/schema.sql is the source of truth and already says all of this; this
-- file brings an existing database up to it, and it is safe to run twice.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 1. THE TYPES
--
-- `CREATE TYPE IF NOT EXISTS` does not exist, so each one is attempted and
-- its duplicate_object swallowed. That is what makes this file re-runnable.
-- ---------------------------------------------------------------------

DO $$
DECLARE
    spec record;
BEGIN
    FOR spec IN
        SELECT * FROM (VALUES
            ('record_status',      ARRAY['ACTIVE','INACTIVE']),
            ('account_status',     ARRAY['ACTIVE','LOCKED','DELETED']),
            ('publish_status',     ARRAY['DRAFT','REVIEW','PUBLISHED','ARCHIVED']),
            ('crystal_system',     ARRAY['SMARTPHONE','EPRODUCT','ESHOP','APPSTORE','CRYSTAL_APP']),
            ('enquiry_source',     ARRAY['SMARTPHONE','EPRODUCT','ESHOP','APPSTORE',
                                         'SMARTPHONE_REGISTER','EPRODUCT_REGISTER','CRYSTAL_APP']),
            ('agency_section',     ARRAY['SMARTPHONE','EPRODUCT']),
            ('agency_service',     ARRAY['REPAIR','OS','INSURANCE','REPLACEMENT','MEDIA_SERVICE',
                                         'STREAMING_DEVICES','COMPUTER','CORDLESS_PHONE','CAMERA_DEVICE']),
            ('product_kind',       ARRAY['SMARTPHONE','TV','STB','COMPUTER','CAMERA']),
            ('article_topic',      ARRAY['NEWS','PRODUCTS','SOFTWARE','SERVICE','REPAIRABILITY','WARRANTY']),
            ('media_owner',        ARRAY['PRODUCT','SERIES','CATEGORY','ARTICLE','OS_VERSION']),
            ('device_target',      ARRAY['desktop','mobile','all']),
            ('product_image_kind', ARRAY['MAIN','ADVERT']),
            ('licensed_device',    ARRAY['TV','STB','KARAOKE','MEDIA']),
            ('licence_status',     ARRAY['ACTIVE','EXPIRED','VOID']),
            ('serial_status',      ARRAY['AVAILABLE','REGISTERED','VOID']),
            ('wallet_movement',    ARRAY['CHARGE','WITHDRAW','TRANSFER_IN','TRANSFER_OUT',
                                         'PURCHASE','REFUND','REPAIR','COMPENSATION']),
            ('transaction_result', ARRAY['SUCCESS','PENDING','FAILED']),
            ('point_movement',     ARRAY['LOGIN','PRODUCT_REGISTER','PURCHASE','LICENSE',
                                         'ACTIVITY','REPAIR','WARRANTY_EXTENSION','ADJUST']),
            ('feedback_status',    ARRAY['PENDING','REPLIED','RESOLVED','FINISHED']),
            ('conversation_side',  ARRAY['MEMBER','MANAGER']),
            ('warranty_kind',      ARRAY['STANDARD','EXTENDED','CARE_PLUS']),
            ('warranty_source',    ARRAY['REGISTRATION','PURCHASE','EXTENSION','GOODWILL']),
            ('warranty_status',    ARRAY['ACTIVE','EXPIRED','VOID','TRANSFERRED']),
            ('stock_movement',     ARRAY['RECEIPT','ISSUE','RETURN','SCRAP','ADJUST','TRANSFER']),
            ('stock_reference',    ARRAY['TICKET','REPLENISHMENT','STOCKTAKE','TRANSFER']),
            ('bill_line_type',     ARRAY['PART','LABOUR','FEE']),
            ('otp_purpose',        ARRAY['LOGIN','BIND','RESET']),
            ('audit_action',       ARRAY['create','update','delete','restore','import']),
            ('setting_type',       ARRAY['string','number','boolean','json'])
        ) AS v(name, values)
    LOOP
        BEGIN
            EXECUTE format(
                'CREATE TYPE %I AS ENUM (%s)',
                spec.name,
                (SELECT string_agg(quote_literal(x), ', ') FROM unnest(spec.values) AS x)
            );
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        END;
    END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 2. ONE VALUE THAT WAS ALREADY WRONG
--
-- faqs.status defaults to PUBLISHED and the storefront reads that word, but
-- the import sheet offered ACTIVE and INACTIVE - so a spreadsheet round trip
-- could set a status that quietly removed the answer from the website while
-- the console still showed it. Nothing caught it, because the column had no
-- CHECK at all. The enum below will refuse it from now on; anything already
-- stored has to be brought back first, or the cast fails on it.
-- ---------------------------------------------------------------------

UPDATE faqs SET status = 'PUBLISHED'
 WHERE status NOT IN ('DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED');


-- ---------------------------------------------------------------------
-- 3. THE COLUMNS
--
-- A view that reads a column blocks ALTER COLUMN TYPE on it, so v_agency_health
-- - which reads agencies.status and technicians.status - has to come down
-- first and go back afterwards.
--
-- It is saved and restored with pg_get_viewdef rather than pasted in below.
-- A copy here would be a second description of a view that already has one in
-- sql/schema.sql, and the two would be free to drift the first time somebody
-- changed the scoring. What Postgres hands back is the definition this
-- database is actually running, which is the only one that can be right.
--
-- Each column is done generically: drop the default so the type can move,
-- drop whatever CHECK was guarding the old vocabulary, cast through text, put
-- the default back. Anything already of the right type is skipped, which is
-- what makes the whole file re-runnable.
-- ---------------------------------------------------------------------

DO $$
DECLARE
    target     record;
    guard      record;
    view_sql   text;
    old_default text;
    literal    text;
BEGIN
    /* to_regclass rather than a cast: the cast raises when the view is not
       there, and on a database built from the current schema.sql it may not
       have been created yet. */
    IF to_regclass('v_agency_health') IS NOT NULL THEN
        view_sql := pg_get_viewdef(to_regclass('v_agency_health'), true);
        EXECUTE 'DROP VIEW v_agency_health';
    END IF;

    FOR target IN
        SELECT * FROM (VALUES
            ('managers',              'status',        'record_status'),
            ('product_categories',  'status',        'record_status'),
            ('product_series',      'status',        'record_status'),
            ('agencies',            'status',        'record_status'),
            ('technicians',         'status',        'record_status'),
            ('parts',               'status',        'record_status'),
            ('warranty_policies',   'status',        'record_status'),
            ('notice_origins',      'status',        'record_status'),
            ('users',               'status',        'account_status'),
            ('products',            'status',        'publish_status'),
            ('articles',            'status',        'publish_status'),
            ('os_versions',         'status',        'publish_status'),
            ('site_notices',        'status',        'publish_status'),
            ('faqs',                'status',        'publish_status'),
            ('faqs',                'category',      'crystal_system'),
            ('feedback_threads',    'thread_source', 'enquiry_source'),
            ('feedback_threads',    'status',        'feedback_status'),
            ('feedback_threads',    'last_type',     'conversation_side'),
            ('feedback_messages',   'action_type',   'conversation_side'),
            ('agency_services',     'section',       'agency_section'),
            ('agency_services',     'service_type',  'agency_service'),
            ('product_categories',  'type',          'product_kind'),
            ('articles',            'category',      'article_topic'),
            ('media_assets',        'owner_type',    'media_owner'),
            ('media_assets',        'device_type',   'device_target'),
            ('product_images',      'device_type',   'device_target'),
            ('product_images',      'kind',          'product_image_kind'),
            ('licenses',            'device_type',   'licensed_device'),
            ('licenses',            'status',        'licence_status'),
            ('oracle_serials',      'status',        'serial_status'),
            ('wallet_transactions', 'type',          'wallet_movement'),
            ('wallet_transactions', 'status',        'transaction_result'),
            ('point_logs',          'type',          'point_movement'),
            ('warranty_policies',   'kind',          'warranty_kind'),
            ('warranties',          'kind',          'warranty_kind'),
            ('warranties',          'source',        'warranty_source'),
            ('warranties',          'status',        'warranty_status'),
            ('part_movements',      'movement',      'stock_movement'),
            ('part_movements',      'reference_type','stock_reference'),
            ('repair_ticket_items', 'item_type',     'bill_line_type'),
            ('otp_codes',           'purpose',       'otp_purpose'),
            ('audit_log',           'action',        'audit_action'),
            ('system_settings',     'value_type',    'setting_type')
        ) AS v(tbl, col, typ)
    LOOP
        /* Already converted - a second run, or a database built from the
           current schema.sql, which declares these types on the column. */
        CONTINUE WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema()
               AND table_name = target.tbl
               AND column_name = target.col
               AND udt_name = target.typ
        );

        /*
         * ALREADY AN ENUM OF ANOTHER NAME - a vocabulary a later delta
         * replaced. faqs.category became faq_category in delta 033, so on a
         * database built from the current schema.sql it is an enum here, just
         * not this one, and "converting" it back would try to rewrite a column
         * v_faq_signatures reads (and fail on it). This file only ever turned
         * TEXT into enums; an enum column is finished business whatever its
         * type is called.
         */
        CONTINUE WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = current_schema()
               AND table_name = target.tbl
               AND column_name = target.col
               AND data_type = 'USER-DEFINED'
        );

        SELECT column_default INTO old_default
          FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = target.tbl
           AND column_name = target.col;

        IF old_default IS NOT NULL THEN
            EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT', target.tbl, target.col);
        END IF;

        /*
         * Every CHECK guarding this one column, by what it covers rather than
         * by name: these were auto-named by Postgres, so `users_status_check`
         * on one database is not necessarily what it is called on another.
         */
        FOR guard IN
            SELECT c.conname
              FROM pg_constraint c
              JOIN pg_attribute a
                ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
             WHERE c.contype = 'c'
               AND c.conrelid = format('%I', target.tbl)::regclass
               AND array_length(c.conkey, 1) = 1
               AND a.attname = target.col
        LOOP
            EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', target.tbl, guard.conname);
        END LOOP;

        EXECUTE format(
            'ALTER TABLE %I ALTER COLUMN %I TYPE %I USING %I::text::%I',
            target.tbl, target.col, target.typ, target.col, target.typ
        );

        /* 'ACTIVE'::character varying is what the catalog stores; the enum
           column wants the literal on its own. */
        IF old_default IS NOT NULL THEN
            literal := substring(old_default from '^''(.*)''::');
            IF literal IS NOT NULL THEN
                EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT %L',
                    target.tbl, target.col, literal);
            END IF;
        END IF;
    END LOOP;

    IF view_sql IS NOT NULL THEN
        EXECUTE 'CREATE VIEW v_agency_health AS ' || view_sql;
    END IF;
END $$;


-- ---------------------------------------------------------------------
-- 4. THE COMMENTS THE OLD CHECKS CARRIED
--
-- A type is self-describing where a CHECK was not, so most of the column
-- comments that listed a vocabulary are now saying what `\d faqs` already
-- says. These two are kept because they say something the list does not.
-- ---------------------------------------------------------------------

COMMENT ON TYPE crystal_system IS
  'the five Crystal systems a customer can be standing in front of';
COMMENT ON TYPE enquiry_source IS
  'where an enquiry came from: the five systems, plus the two registration
   flows an enquiry can be raised in the middle of';
COMMENT ON TYPE publish_status IS
  'declared in lifecycle order, so ORDER BY on it is the lifecycle';
