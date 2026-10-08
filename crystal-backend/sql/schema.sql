-- =====================================================================
-- Crystal platform - catalogue, member centre and after-sales service ops
-- PostgreSQL schema (target: PostgreSQL 12+, driver: pg 8.7.3 via knex 0.21.20)
--
-- Conventions
--   * this file is the source of truth.  The init migration executes it, so
--     `knex migrate:latest` and the raw file can never drift apart
--   * every table has created_at / updated_at (updated_at kept by trigger)
--   * soft delete via is_deleted on anything an operator removes by hand;
--     ledgers and event logs are append only and have none
--   * primary keys are `id`, as the Crystal specification writes them - the
--     spec is the contract two frontends are already written against
--   * money is NUMERIC(12,2) or NUMERIC(14,2), never float
--   * ORDERED code lists - a repair's workflow, a claim's - are smallint with
--     a CHECK, because the order is arithmetic: `status < 7` is "still open"
--     and the words for them live in src/utils/codes.js
--   * every other closed word list is a native ENUM TYPE, declared once in
--     section 0 and used by name. It used to be varchar with a CHECK per
--     column, which wrote the same list out at every column that needed it;
--     a lookup table was the other option and would have bought a join on
--     every read to turn an id back into the word it always was
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- helper: updated_at trigger
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

/*
 * The same, except that flipping `is_read` on its own leaves updated_at alone.
 *
 * One table needs it - feedback_threads - because its queue is ordered by
 * activity and READING a thread is not activity on it. See the trigger there.
 *
 * The comparison is over the whole row minus those two columns rather than a
 * list of the ones that matter, so a column added to the table later cannot
 * quietly slip through as "just a read".
 */
CREATE OR REPLACE FUNCTION set_updated_at_unless_read() RETURNS trigger AS $$
BEGIN
    IF NEW.is_read IS DISTINCT FROM OLD.is_read
       AND (to_jsonb(NEW) - 'is_read' - 'updated_at')
         = (to_jsonb(OLD) - 'is_read' - 'updated_at')
    THEN
        NEW.updated_at = OLD.updated_at;
        RETURN NEW;
    END IF;

    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

/*
 * The same rule for a COUNTER: an update that changes view_count and nothing
 * else leaves updated_at alone.
 *
 * faqs needs it because updated_at is inside an FAQ's signature and the
 * storefront counts a view on every read - with the plain trigger, opening an
 * answer broke its signature. See sql/deltas/029.
 */
CREATE OR REPLACE FUNCTION set_updated_at_unless_viewed() RETURNS trigger AS $$
BEGIN
    IF NEW.view_count IS DISTINCT FROM OLD.view_count
       AND (to_jsonb(NEW) - 'view_count' - 'updated_at')
         = (to_jsonb(OLD) - 'view_count' - 'updated_at')
    THEN
        NEW.updated_at = OLD.updated_at;
        RETURN NEW;
    END IF;

    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =====================================================================
-- 0. THE VOCABULARIES, as native enum types.
--
-- Every closed word list in this schema is declared here and used by name.
-- They were `varchar` with a CHECK, which worked and cost three things:
--
--   the list was written out AGAIN at every column that used it, so
--   warranty_policies.kind and warranties.kind were two copies of the same
--   four words with nothing keeping them in step;
--
--   nothing outside the table could refer to the list. A function taking a
--   status had to take text and hope;
--
--   a mistyped value was a check violation naming a constraint, rather than
--   an error naming the type and the value.
--
-- They are NOT lookup tables, deliberately. A table would mean a join on
-- every read of a product, a ticket or a shelf movement to turn an id back
-- into the word it always was, an id in every payload the frontends already
-- speak the words of, and a foreign key protecting a list that changes about
-- once a year. An enum is the same constraint with none of that.
--
-- The ORDER OF THE VALUES IS THE SORT ORDER. Postgres sorts an enum by
-- declaration, not alphabetically, so these are written in the order they
-- happen in - DRAFT before PUBLISHED, PENDING before RESOLVED, RECEIPT
-- before ISSUE - and `ORDER BY status` is then the lifecycle rather than the
-- alphabet. That is worth knowing before reordering one.
--
-- ADDING A VALUE is `ALTER TYPE x ADD VALUE 'y'` in a numbered delta, and it
-- cannot run inside a transaction block on PostgreSQL 11 and below. Removing
-- or renaming one is the expensive direction, which is the trade: these are
-- the lists that change about as often as the company does.
-- =====================================================================

/* Master data: is this row still in use. */
CREATE TYPE record_status AS ENUM ('ACTIVE', 'INACTIVE');

/* A member account. LOCKED is a suspension; DELETED is the member's request. */
CREATE TYPE account_status AS ENUM ('ACTIVE', 'LOCKED', 'DELETED');

/* Anything with an editorial lifecycle, in the order it goes through it. */
CREATE TYPE publish_status AS ENUM ('DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED');

/*
 * WHAT A PUBLISHED ANSWER IS FILED UNDER, and the seven places an enquiry can
 * arrive from. Two types, and they are no longer even the same shape.
 *
 * The FAQ used to share the enquiry's five systems (as `crystal_system`), which
 * filed every television, set-top box, computer and camera question under one
 * word - EPRODUCT - and left a second column, the catalogue section, to say
 * which product it was really about. A visitor does not hold "an eproduct";
 * they hold a television. So an answer is filed under the PRODUCT KIND the
 * catalogue sells (product_kind, below, value for value), then the three
 * Crystal services that are not products. In reading order: the products
 * first, because most questions are about something somebody is holding.
 *
 * An enquiry keeps its systems, because the feedback desk is still routed by
 * which counter answers it, and that includes the two registration flows.
 */
CREATE TYPE faq_category AS ENUM (
    'SMARTPHONE', 'TV', 'STB', 'COMPUTER', 'CAMERA', 'CRYSTAL_APP', 'ESHOP', 'APPSTORE');
CREATE TYPE enquiry_source AS ENUM (
    'SMARTPHONE', 'EPRODUCT', 'ESHOP', 'APPSTORE',
    'SMARTPHONE_REGISTER', 'EPRODUCT_REGISTER', 'CRYSTAL_APP');

/*
 * The two service counters, and what each one offers. The vocabularies
 * overlap only at REPAIR, which is the same word for two different desks -
 * so agency_services carries both columns and is keyed on the pair.
 */
CREATE TYPE agency_section AS ENUM ('SMARTPHONE', 'EPRODUCT');
CREATE TYPE agency_service AS ENUM (
    'REPAIR', 'OS', 'INSURANCE', 'REPLACEMENT',
    'MEDIA_SERVICE', 'STREAMING_DEVICES', 'COMPUTER', 'CORDLESS_PHONE', 'CAMERA_DEVICE');

/* The catalogue: what kind of thing a category holds, and the blog's shelf. */
CREATE TYPE product_kind AS ENUM ('SMARTPHONE', 'TV', 'STB', 'COMPUTER', 'CAMERA');
CREATE TYPE article_topic AS ENUM (
    'NEWS', 'PRODUCTS', 'SOFTWARE', 'SERVICE', 'REPAIRABILITY', 'WARRANTY');

/* Artwork: what it hangs off, which screen it is for, and which run it is. */
CREATE TYPE media_owner AS ENUM ('PRODUCT', 'SERIES', 'CATEGORY', 'ARTICLE', 'OS_VERSION');
CREATE TYPE device_target AS ENUM ('desktop', 'mobile', 'all');
CREATE TYPE product_image_kind AS ENUM ('MAIN', 'ADVERT');

/* Device licences, and the warehouse's view of a serial. */
CREATE TYPE licensed_device AS ENUM ('TV', 'STB', 'KARAOKE', 'MEDIA');
CREATE TYPE licence_status AS ENUM ('ACTIVE', 'EXPIRED', 'VOID');
CREATE TYPE serial_status AS ENUM ('AVAILABLE', 'REGISTERED', 'VOID');

/* The two member ledgers. Both are signed: a debit is a negative amount. */
CREATE TYPE wallet_movement AS ENUM (
    'CHARGE', 'WITHDRAW', 'TRANSFER_IN', 'TRANSFER_OUT',
    'PURCHASE', 'REFUND', 'REPAIR', 'COMPENSATION');
CREATE TYPE transaction_result AS ENUM ('SUCCESS', 'PENDING', 'FAILED');
CREATE TYPE point_movement AS ENUM (
    'LOGIN', 'PRODUCT_REGISTER', 'PURCHASE', 'LICENSE',
    'ACTIVITY', 'REPAIR', 'WARRANTY_EXTENSION', 'ADJUST');

/* A feedback thread's state, and which side wrote a message. */
CREATE TYPE feedback_status AS ENUM ('PENDING', 'REPLIED', 'RESOLVED', 'FINISHED');
CREATE TYPE conversation_side AS ENUM ('MEMBER', 'MANAGER');

/* Cover: the offer, where one device's copy of it came from, and its state. */
CREATE TYPE warranty_kind AS ENUM ('STANDARD', 'EXTENDED', 'CARE_PLUS');
CREATE TYPE warranty_source AS ENUM ('REGISTRATION', 'PURCHASE', 'EXTENSION', 'GOODWILL');
CREATE TYPE warranty_status AS ENUM ('ACTIVE', 'EXPIRED', 'VOID', 'TRANSFERRED');

/* The parts ledger, and what a line on a repair bill is. */
CREATE TYPE stock_movement AS ENUM (
    'RECEIPT', 'ISSUE', 'RETURN', 'SCRAP', 'ADJUST', 'TRANSFER');
CREATE TYPE stock_reference AS ENUM ('TICKET', 'REPLENISHMENT', 'STOCKTAKE', 'TRANSFER');
CREATE TYPE bill_line_type AS ENUM ('PART', 'LABOUR', 'FEE');

/* The console's own furniture. */
CREATE TYPE otp_purpose AS ENUM ('LOGIN', 'BIND', 'RESET');
CREATE TYPE audit_action AS ENUM ('create', 'update', 'delete', 'restore', 'import');
CREATE TYPE setting_type AS ENUM ('string', 'number', 'boolean', 'json');


-- =====================================================================
-- 1. MANAGEMENT
--
-- The console's own furniture: which screens exist, which roles there are,
-- and what each role may do on each screen.  A table rather than a constant
-- because "who may waive a repair charge" is a question the business answers
-- and re-answers, and a redeploy is a poor way to answer it.
-- =====================================================================

-- 1.1 manager_pages : every admin route is registered here
CREATE TABLE manager_pages (
    id           serial       PRIMARY KEY,
    parent_id    integer      NULL REFERENCES manager_pages(id) ON DELETE SET NULL,
    page_url     varchar(200) NOT NULL UNIQUE,
    page_name    varchar(100) NOT NULL,
    icon         varchar(60)  NULL,
    sort_order   integer      NOT NULL DEFAULT 0,
    is_menu      boolean      NOT NULL DEFAULT true,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    updated_at   timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON COLUMN manager_pages.parent_id IS 'self reference, lets the Horizon-UI sidebar render groups';
COMMENT ON COLUMN manager_pages.is_menu   IS 'false = the route exists and is guarded, but is not drawn in the sidebar';

CREATE TRIGGER trg_manager_pages_updated
    BEFORE UPDATE ON manager_pages
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


-- 1.2 manager_roles
CREATE TABLE manager_roles (
    id            serial       PRIMARY KEY,
    role_code     varchar(30)  NOT NULL UNIQUE,
    role_name     varchar(50)  NOT NULL,
    default_page  integer      NULL REFERENCES manager_pages(id) ON DELETE SET NULL,
    is_system     boolean      NOT NULL DEFAULT false,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON COLUMN manager_roles.default_page IS 'page the user lands on right after signing in';
COMMENT ON COLUMN manager_roles.is_system    IS 'true = shipped with the platform, cannot be deleted';

CREATE TRIGGER trg_manager_roles_updated
    BEFORE UPDATE ON manager_roles
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


-- 1.3 managers
CREATE TABLE managers (
    id             serial       PRIMARY KEY,

    /*
     * THE ONLY IDENTIFIER. Sign-in matches on this and nothing else.
     *
     * There was an `email` column beside it, unique and nullable, and nothing
     * ever read it: the console's sign-in has always matched on username, and
     * a nullable unique column that no query touches is a column that can only
     * be wrong. A console account is a login, not a person to be written to -
     * a manager's address belongs wherever the company keeps staff records.
     */
    username       varchar(60)  NOT NULL UNIQUE,
    password_hash  varchar(120) NOT NULL,
    name           varchar(80)  NOT NULL,
    avatar         varchar(255) NULL,
    role_id        integer      NOT NULL REFERENCES manager_roles(id),
    status         record_status NOT NULL DEFAULT 'ACTIVE',
    last_login_at  timestamptz  NULL,
    is_deleted     boolean      NOT NULL DEFAULT false,
    created_at     timestamptz  NOT NULL DEFAULT now(),
    updated_at     timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON COLUMN managers.password_hash IS 'bcryptjs hash, never plaintext';
COMMENT ON TABLE managers IS
  'A CONSOLE ACCOUNT: a username, a password and a role.

   It used to carry an `agency_id` as well, pinning an account to one service
   centre, and eight controllers narrowed their reads through it - a branch
   manager saw their own tickets, stock, technicians and claim and nobody
   else''s. That scoping is gone with the column: what an account may do is
   now answered by the permission grid alone, and every role that can open a
   screen sees the whole estate on it.';

CREATE INDEX idx_managers_role ON managers(role_id);

CREATE TRIGGER trg_managers_updated
    BEFORE UPDATE ON managers
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


-- 1.4 manager_permissions : role x page
CREATE TABLE manager_permissions (
    id          serial      PRIMARY KEY,
    role_id     integer     NOT NULL REFERENCES manager_roles(id) ON DELETE CASCADE,
    page_id     integer     NOT NULL REFERENCES manager_pages(id) ON DELETE CASCADE,
    permission  smallint    NOT NULL DEFAULT 0 CHECK (permission BETWEEN 0 AND 3),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_permission_role_page UNIQUE (role_id, page_id)
);
COMMENT ON COLUMN manager_permissions.permission IS '0 none, 1 read, 2 write, 3 super';

CREATE TRIGGER trg_manager_permissions_updated
    BEFORE UPDATE ON manager_permissions
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


-- 1.5 audit_log
--
-- Append only, and deliberately not a foreign key to managers: the trail has to
-- outlive the account that made the change, which is most of the point of it.
-- The person is copied in as data at the moment of the write instead.
CREATE TABLE audit_log (
    id            bigserial    PRIMARY KEY,
    manager_id      integer      NULL,
    manager_login   varchar(60)  NULL,
    manager_name    varchar(100) NULL,
    entity        varchar(60)  NOT NULL,
    entity_pk     varchar(60)  NOT NULL DEFAULT '',
    action        audit_action NOT NULL,
    page_url      varchar(200) NULL,
    changed       jsonb        NULL,
    before_data   jsonb        NULL,
    after_data    jsonb        NULL,
    method        varchar(10)  NULL,
    path          varchar(300) NULL,
    ip            varchar(45)  NULL,
    created_at    timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON COLUMN audit_log.changed IS
  'the column names that actually moved. An update that moved nothing is never written -
   a save that changed no value is not an event, and logging it would bury the ones that are.';

CREATE INDEX idx_audit_entity  ON audit_log(entity, entity_pk);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX idx_audit_manager   ON audit_log(manager_id);


-- 1.6 system_settings : one row per key, edited from the console
CREATE TABLE system_settings (
    id           serial       PRIMARY KEY,
    setting_key  varchar(80)  NOT NULL UNIQUE,
    setting_val  text         NULL,
    value_type   setting_type NOT NULL DEFAULT 'string',
    category     varchar(40)  NOT NULL DEFAULT 'general',
    label        varchar(160) NOT NULL,
    description  text         NULL,
    sort_order   integer      NOT NULL DEFAULT 0,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    updated_at   timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON TABLE system_settings IS
  'What the platform does differently without a release: SLA hours, the points a
   registration awards, the warranty grace period. value_type is what lets a
   reader cast a text column back to what it means.';

CREATE TRIGGER trg_system_settings_updated
    BEFORE UPDATE ON system_settings
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


-- =====================================================================
-- 2. MEMBERS
--
-- email and phone are both nullable and both unique: a desktop member signs
-- up with an email, a mobile member with a phone (spec 5), and either can add
-- the other later.  That is why neither can be NOT NULL, and why
-- password_hash is optional - an OTP-only account has no password to store.
-- =====================================================================

CREATE TABLE users (
    id                    serial       PRIMARY KEY,
    email                 varchar(190) NULL UNIQUE,

    /*
     * THE PLATFORM LOGIN, mirrored from ora_pid.users.user_id.
     *
     * Sign-in checks the platform's table, which is keyed by user_id - so this
     * is the name the member actually types, refreshed at every sign-in. NOT
     * unique here on purpose: the platform owns that constraint, and a second
     * one in Crystal could only ever refuse a login it has already accepted.
     */
    login                 varchar(60)  NULL,
    phone                 varchar(32)  NULL UNIQUE,
    password_hash         varchar(120) NULL,
    nickname              varchar(80)  NOT NULL,
    avatar                varchar(255) NULL,
    status                account_status NOT NULL DEFAULT 'ACTIVE',
    last_login_at         timestamptz  NULL,
    last_login_award_on   date         NULL,
    created_at            timestamptz  NOT NULL DEFAULT now(),
    updated_at            timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT chk_user_has_a_handle CHECK (login IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL)
);
COMMENT ON COLUMN users.last_login_award_on IS 'guards the once-a-day LOGIN point award';
COMMENT ON CONSTRAINT chk_user_has_a_handle ON users IS
  'an account has to carry at least one way of identifying the person behind it.
   `login` leads because it is the one sign-in actually uses - it mirrors
   ora_pid.users.user_id; the other two are for reaching somebody.';

CREATE INDEX idx_users_status ON users(status);

CREATE TRIGGER trg_users_updated
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


CREATE TABLE otp_codes (
    id          serial       PRIMARY KEY,
    phone       varchar(32)  NOT NULL,
    code        varchar(12)  NOT NULL,
    purpose     otp_purpose  NOT NULL DEFAULT 'LOGIN',
    device_id   varchar(80)  NULL,
    attempts    integer      NOT NULL DEFAULT 0,
    consumed_at timestamptz  NULL,
    expires_at  timestamptz  NOT NULL,
    created_at  timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON TABLE otp_codes IS 'append only; a consumed or expired code is kept as evidence, not deleted';

-- The verify step reads the newest unconsumed code for a phone and purpose.
CREATE INDEX idx_otp_lookup ON otp_codes(phone, purpose, created_at DESC);


-- =====================================================================
-- 3. CATALOGUE
--
-- `type` on a category is what splits the two storefront sections: the
-- smartphone landing page reads type = 'SMARTPHONE', Eproducts reads the
-- rest.  Storing it rather than inferring it from the name means renaming a
-- category cannot silently empty a section of the website.
-- =====================================================================

CREATE TABLE product_categories (
    id          serial       PRIMARY KEY,
    name        varchar(80)  NOT NULL,
    slug        varchar(80)  NOT NULL UNIQUE,
    type        product_kind NOT NULL,
    icon        varchar(255) NULL,
    description text         NULL,
    sort_order  integer      NOT NULL DEFAULT 0,
    status      record_status NOT NULL DEFAULT 'ACTIVE',
    is_deleted  boolean      NOT NULL DEFAULT false,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON COLUMN product_categories.type IS 'SMARTPHONE | TV | STB | COMPUTER | CAMERA';

CREATE INDEX idx_categories_type ON product_categories(type);

CREATE TRIGGER trg_product_categories_updated
    BEFORE UPDATE ON product_categories
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


CREATE TABLE product_series (
    id                  serial       PRIMARY KEY,
    category_id         integer      NOT NULL REFERENCES product_categories(id) ON DELETE CASCADE,
    name                varchar(80)  NOT NULL,
    slug                varchar(80)  NOT NULL UNIQUE,
    description         text         NULL,
    banner_image        varchar(255) NULL,
    banner_image_mobile varchar(255) NULL,
    sort_order          integer      NOT NULL DEFAULT 0,
    status              record_status NOT NULL DEFAULT 'ACTIVE',
    is_deleted          boolean      NOT NULL DEFAULT false,
    created_at          timestamptz  NOT NULL DEFAULT now(),
    updated_at          timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON COLUMN product_series.banner_image_mobile IS
  'the spec''s dual artwork rule: 1920x900 desktop, 1080x1350 mobile';

CREATE INDEX idx_series_category ON product_series(category_id, sort_order);

CREATE TRIGGER trg_product_series_updated
    BEFORE UPDATE ON product_series
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


CREATE TABLE products (
    id                serial       PRIMARY KEY,
    category_id       integer      NOT NULL REFERENCES product_categories(id) ON DELETE RESTRICT,
    series_id         integer      NULL REFERENCES product_series(id) ON DELETE SET NULL,
    name              varchar(160) NOT NULL,
    slug              varchar(160) NOT NULL UNIQUE,
    model_code        varchar(60)  NULL,
    tagline           varchar(255) NULL,
    description       text         NULL,
    main_image        varchar(255) NULL,
    main_image_mobile varchar(255) NULL,
    -- -1 means "not publicly priced"; the storefront keeps the price row's
    -- height but does not render an amount.
    price             numeric(12,2) NOT NULL DEFAULT 0 CHECK (price >= -1),
    currency          varchar(8)   NOT NULL DEFAULT 'USD',
    release_date      date         NULL,
    status            publish_status NOT NULL DEFAULT 'DRAFT',
    is_featured       boolean      NOT NULL DEFAULT false,
    is_hero           boolean      NOT NULL DEFAULT false,
    -- Whether the storefront offers the service pricing tab. Some products
    -- have nothing to publish, and a tab that opens on "nothing yet" is a
    -- tab that should not have been offered.
    show_service_pricing boolean   NOT NULL DEFAULT true,
    warranty_months   smallint     NOT NULL DEFAULT 12 CHECK (warranty_months >= 0),
    rating_avg        numeric(2,1) NULL CHECK (rating_avg >= 0 AND rating_avg <= 5),
    rating_count      integer      NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
    sort_order        integer      NOT NULL DEFAULT 0,
    is_deleted        boolean      NOT NULL DEFAULT false,
    created_at        timestamptz  NOT NULL DEFAULT now(),
    updated_at        timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON COLUMN products.series_id IS
  'nullable: an accessory or a one-off camera sits directly under its category';
COMMENT ON COLUMN products.model_code IS
  'what the factory and the warehouse call this product. The serial lookup arrives
   carrying a model code, not a slug, so this is the column that joins the two worlds.';
COMMENT ON COLUMN products.warranty_months IS
  'the standard cover this product ships with, before any policy or extension';
COMMENT ON COLUMN products.rating_avg IS
  'a SUMMARY, not a computed aggregate. Crystal collects its ratings in the
   Eshop, which spec 1.1 puts outside this system, so what arrives here is the
   score and the count rather than the reviews behind them. Recomputing it from
   a reviews table this database does not have is the mistake to avoid.';

CREATE INDEX idx_products_category ON products(category_id, status);
CREATE INDEX idx_products_series   ON products(series_id, sort_order);
CREATE INDEX idx_products_featured ON products(is_featured);
CREATE INDEX idx_products_model    ON products(model_code);

CREATE TRIGGER trg_products_updated
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


-- ---------------------------------------------------------------------
-- 3.1 the specification engine
--
-- Specs are a dictionary, not columns: a group ("Display") holds definitions
-- ("Size", "Refresh Rate") and a product supplies a value for each.  That is
-- what makes the compare matrix possible - two products line up row by row on
-- shared definitions without either declaring a schema.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- A SHEET BELONGS TO A SECTION.
--
-- The dictionary used to be global: every group was offered for every
-- product, so the television editor was asked for a front camera and the
-- handset editor for a backlight type, and the storefront drew the same
-- empty groups on both.
--
-- product_category_id NULL means "applies everywhere" - Build, In the box -
-- and that is the default, because most groups are genuinely shared. The
-- DEFINITIONS follow their group, which is what makes this one column
-- rather than two.
--
-- Per-PRODUCT variation needs nothing further: a product simply has no
-- value for a definition it does not answer, and the sheet prints only what
-- has been filled in.
-- ---------------------------------------------------------------------

CREATE TABLE specification_groups (
    id                  serial      PRIMARY KEY,
    product_category_id integer     NULL REFERENCES product_categories(id) ON DELETE CASCADE,
    name                varchar(80) NOT NULL,
    code                varchar(40) NOT NULL UNIQUE,
    sort_order          integer     NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN specification_groups.product_category_id IS
  'which section this group belongs to; NULL applies to every product';

CREATE INDEX idx_spec_groups_category
    ON specification_groups(product_category_id, sort_order);

CREATE TRIGGER trg_specification_groups_updated
    BEFORE UPDATE ON specification_groups
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


CREATE TABLE specification_definitions (
    id              serial       PRIMARY KEY,
    group_id        integer      NOT NULL REFERENCES specification_groups(id) ON DELETE CASCADE,
    name            varchar(120) NOT NULL,
    unit            varchar(24)  NULL,
    compare_enabled boolean      NOT NULL DEFAULT true,
    sort_order      integer      NOT NULL DEFAULT 0,
    created_at      timestamptz  NOT NULL DEFAULT now(),
    updated_at      timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON COLUMN specification_definitions.compare_enabled IS
  'a comparison of eighty rows is a comparison nobody reads';

CREATE INDEX idx_specdef_group   ON specification_definitions(group_id, sort_order);
CREATE INDEX idx_specdef_compare ON specification_definitions(compare_enabled);

CREATE TRIGGER trg_specification_definitions_updated
    BEFORE UPDATE ON specification_definitions
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


CREATE TABLE product_specifications (
    id               serial  PRIMARY KEY,
    product_id       integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    specification_id integer NOT NULL REFERENCES specification_definitions(id) ON DELETE CASCADE,
    value            text    NOT NULL,
    sort_order       integer NOT NULL DEFAULT 0,
    CONSTRAINT uq_product_specification UNIQUE (product_id, specification_id)
);
COMMENT ON CONSTRAINT uq_product_specification ON product_specifications IS
  'the spec editor upserts on this pair rather than deleting and re-inserting the sheet';


-- ---------------------------------------------------------------------
-- 3.1.1 the two things a product has that are neither a column nor a spec
--
-- A finish and a boxed accessory both belong to ONE product and both are an
-- ordered list with a picture, which is why neither is a specification: the
-- spec dictionary exists so two products can line up row by row in the
-- compare matrix, and "Glacier Blue" has nothing to line up against.
-- ---------------------------------------------------------------------

CREATE TABLE product_colors (
    id         serial       PRIMARY KEY,
    product_id integer      NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name       varchar(80)  NOT NULL,
    hex        varchar(9)   NOT NULL CHECK (hex ~ '^#[0-9A-Fa-f]{6}$'),
    sort_order integer      NOT NULL DEFAULT 0,
    CONSTRAINT uq_product_color UNIQUE (product_id, name)
);
COMMENT ON COLUMN product_colors.hex IS
  'THE SWATCH, and the only thing a finish is drawn from. The dot on a product
   card has to be paintable before any artwork has loaded, which is why the
   colour is stored as a value.

   There was an `image` column beside it - the shot of the handset in that
   finish. It was stored, seeded and returned by the API, and no page ever
   drew it, so it was a file to upload and keep for a picture nobody saw.';

CREATE INDEX idx_product_colors ON product_colors(product_id, sort_order);


CREATE TABLE product_accessories (
    id         serial       PRIMARY KEY,
    product_id integer      NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name       varchar(120) NOT NULL,
    image      varchar(255) NULL,
    sort_order integer      NOT NULL DEFAULT 0
);
COMMENT ON TABLE product_accessories IS
  'what is in the box. Deliberately not `parts`: a part is a serviceable
   component with a price and a shelf, an accessory is an item that shipped
   with the handset, and conflating them puts a USB cable into the repair
   stock ledger.';

CREATE INDEX idx_product_accessories ON product_accessories(product_id, sort_order);


-- ---------------------------------------------------------------------
-- 3.2 media, polymorphic
--
-- One table serves products, series, categories and articles through
-- (owner_type, owner_id).  There is deliberately no foreign key: one cannot
-- point at four tables, and four nullable columns instead would make every
-- gallery read a four-way OR.  The cost is that deleting an owner has to
-- delete its assets explicitly - see the repositories that do it.
-- ---------------------------------------------------------------------

CREATE TABLE media_assets (
    id          serial       PRIMARY KEY,
    owner_type  media_owner  NOT NULL,
    /*
     * BIGINT, and the width is the point: one of the tables owner_type names
     * is not Crystal's. An ARTICLE owner is a row in the vendor's
     * ora_blog.blog_article (src/config/legacy.js), whose ids are Oracle
     * NUMBERs starting well past what 32 bits holds.
     */
    owner_id    bigint       NOT NULL,
    purpose     varchar(30)  NOT NULL,
    device_type device_target NOT NULL DEFAULT 'all',
    file_path   varchar(255) NOT NULL,
    alt_text    varchar(255) NULL,
    -- Where this artwork goes when it is clicked. Only the section hero uses
    -- it: an advertisement that cannot be followed is just a picture.
    link_url    varchar(255) NULL,
    width       integer      NULL,
    height      integer      NULL,
    sort_order  integer      NOT NULL DEFAULT 0,
    created_at  timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON COLUMN media_assets.purpose     IS
  'HERO | THUMBNAIL | BANNER, and GALLERY for an article figure or an OS release screen.

   A PRODUCT''s own two runs are NOT here - the studio set and the advertising run live
   in product_images, which is a real relation rather than a polymorphic one. See the
   comment on that table.';
COMMENT ON COLUMN media_assets.device_type IS 'the spec''s dual artwork rule; `all` serves both';

-- Every read is "this owner's assets, for this purpose, in this device
-- flavour, in order".
CREATE INDEX idx_media_owner  ON media_assets(owner_type, owner_id, purpose, sort_order);
CREATE INDEX idx_media_device ON media_assets(device_type);


-- ---------------------------------------------------------------------
-- A PRODUCT'S OWN PICTURES, out of media_assets and into a real relation.
--
-- media_assets is polymorphic - (owner_type, owner_id) with no foreign key,
-- because one column cannot point at five tables. That is the right shape for
-- artwork that hangs off four different kinds of owner, and the wrong shape
-- for the two runs that every single product has: there is no owner_type to
-- resolve, no chance of the id pointing at a deleted row of another table, and
-- no reason a product's own pictures should be unreachable by a join.
--
-- Two kinds, and the distinction is the one that kept going wrong:
--
--   MAIN    the studio set - front, back, three quarter. Shown as the row of
--           1 to 3 square images at the TOP of the product page, and the same
--           shots the listing tile uses.
--   ADVERT  the advertising run - full width marketing panels, each one a
--           whole picture with its copy burnt into the artwork. Shown down the
--           GALLERY TAB, 1 x n, butted together.
--
-- media_assets keeps what is genuinely polymorphic: section and series
-- banners, article figures, Crystal OS screens, and a product's HERO and
-- THUMBNAIL slots.
-- ---------------------------------------------------------------------

CREATE TABLE product_images (
    id          serial       PRIMARY KEY,
    product_id  integer      NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    kind        product_image_kind NOT NULL,
    device_type device_target NOT NULL DEFAULT 'all',
    file_path   varchar(255) NOT NULL,
    alt_text    varchar(255) NULL,
    width       integer      NULL,
    height      integer      NULL,
    sort_order  integer      NOT NULL DEFAULT 0,
    is_deleted  boolean      NOT NULL DEFAULT false,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON COLUMN product_images.kind        IS 'MAIN = the studio set at the top of the page | ADVERT = the gallery tab run';
COMMENT ON COLUMN product_images.device_type IS 'the spec''s dual artwork rule; `all` serves both';

-- Every read is "this product's pictures, of this kind, in order".
CREATE INDEX idx_product_images ON product_images(product_id, kind, sort_order);


-- ---------------------------------------------------------------------
-- 3.3 Crystal OS
--
-- A version ships to the C9 in March and to the C5 in June, so the date lives
-- on the join row rather than on the version.
-- ---------------------------------------------------------------------

CREATE TABLE os_versions (
    id           serial       PRIMARY KEY,
    version      varchar(40)  NOT NULL UNIQUE,
    title        varchar(160) NOT NULL,
    description  text         NULL,
    highlights   text         NULL,
    cover_image  varchar(255) NULL,
    release_date date         NULL,
    status       publish_status NOT NULL DEFAULT 'PUBLISHED',
    is_deleted   boolean      NOT NULL DEFAULT false,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    updated_at   timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON COLUMN os_versions.highlights IS 'newline separated bullet list';

CREATE INDEX idx_os_release ON os_versions(release_date DESC);

CREATE TRIGGER trg_os_versions_updated
    BEFORE UPDATE ON os_versions
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


-- ---------------------------------------------------------------------
-- A PRODUCT'S OWN update record.
--
-- This used to be the rollout table for os_versions: a row said "release 5.2
-- reached the C9 Pro on this date", and everything shown about it - the name,
-- the notes, the artwork - came from the release.
--
-- It is not that any more, because the premise was wrong. The firmware a
-- television or a set-top box ships is not a Crystal OS build at all, and even
-- on the handsets the version string a device reports is its own. Tying the
-- two together meant a version could only be recorded here if somebody first
-- invented a matching os_versions row for it.
--
-- So os_version is a plain STRING and this table stands on its own.
-- os_versions is still the Crystal OS product page (Support / Crystal OS); the
-- two are simply not the same list, and nothing joins them.
-- ---------------------------------------------------------------------

CREATE TABLE product_os_history (
    id                 serial       PRIMARY KEY,
    product_id         integer      NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    os_version         varchar(60)  NOT NULL,
    release_date       date         NULL,
    content            text         NULL,
    pub_approve_number varchar(60)  NULL,
    sort_order         integer      NOT NULL DEFAULT 0,
    is_deleted         boolean      NOT NULL DEFAULT false,
    created_at         timestamptz  NOT NULL DEFAULT now(),
    updated_at         timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON COLUMN product_os_history.os_version IS
  'the version as the DEVICE reports it - a free string, not a link to os_versions';
COMMENT ON COLUMN product_os_history.release_date IS
  'when THIS model received it, which is not the date the version was released:
   a build reaches the flagship in March and the budget line in June, and one date
   for both is what makes people think their phone has been forgotten';
COMMENT ON COLUMN product_os_history.content IS
  'the release notes for this device, as prose - sentences rather than a bullet list';
COMMENT ON COLUMN product_os_history.pub_approve_number IS
  'the publication approval reference for the notice, a free string';

CREATE INDEX idx_product_os ON product_os_history(product_id, sort_order, release_date DESC);

CREATE TRIGGER trg_product_os_history_updated
    BEFORE UPDATE ON product_os_history
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


-- =====================================================================
-- 4. SUPPORT NETWORK
--
-- The service centres are no longer only a store locator: from section 6
-- downwards they are the places repairs physically happen, hold parts and get
-- measured on turnaround.  That is why `agencies` grows an SLA and a capacity
-- here rather than staying the address book the storefront needs.
-- =====================================================================

/*
 * THE PROVINCES, IN THE ORDER A VISITOR READS THEM.
 *
 * The locator's province dropdown used to be `SELECT DISTINCT province ...
 * ORDER BY province` - the alphabet, which put Anhui first and Shanghai
 * twentieth in a network whose biggest counters are in Shanghai. Nobody
 * decided that order; it fell out of the query.
 *
 * So the order is DATA, edited on its own console screen
 * (/admin/support/provinces): the lower `sort_order`, the higher in the
 * dropdown. It is a table rather than a list in the code because it is an
 * operational decision - a new province opens, a region becomes the busiest -
 * and none of those is worth a release.
 *
 * It is also the VOCABULARY. `agencies.province` refers to `name` here, so a
 * centre cannot be filed under "Guangdong " or "GuangDong" and quietly vanish
 * from the filter it was typed for; ON UPDATE CASCADE means renaming a
 * province here renames it on every centre in it, in the same statement.
 * Keyed by the NAME rather than an id because the name is what every reader
 * already speaks - the storefront filter, the spreadsheet, the health board -
 * and turning it into a number would have changed all of them for nothing.
 */
CREATE TABLE provinces (
    id         serial       PRIMARY KEY,
    name       varchar(80)  NOT NULL UNIQUE,
    sort_order integer      NOT NULL DEFAULT 0,
    is_deleted boolean      NOT NULL DEFAULT false,
    created_at timestamptz  NOT NULL DEFAULT now(),
    updated_at timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON TABLE provinces IS
  'the provinces a service centre can be in, and the ORDER the locator lists them in -
   lower sort_order first. Edited at /admin/support/provinces.';
COMMENT ON COLUMN provinces.sort_order IS
  'the position in the storefront''s province filter, lower first; ties by name';

CREATE INDEX idx_provinces_order ON provinces(sort_order, name);

CREATE TRIGGER trg_provinces_updated
    BEFORE UPDATE ON provinces
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TABLE agencies (
    id             serial        PRIMARY KEY,
    name           varchar(160)  NOT NULL,
    code           varchar(40)   NULL UNIQUE,
    province       varchar(80)   NOT NULL
                   CONSTRAINT fk_agencies_province REFERENCES provinces(name) ON UPDATE CASCADE,
    address        varchar(255)  NOT NULL,
    /*
     * The well-known building nearby - "opposite the Grand Theatre, beside
     * Exit 3" - which is what staff actually give a courier or a technician
     * who cannot find the address. CONSOLE ONLY: it is written for colleagues,
     * often names a neighbour's business, and is never selected by a
     * storefront read (see repositories/agencies.repository.js, PUBLIC).
     */
    landmark       varchar(200)  NULL,
    tier           smallint      NOT NULL DEFAULT 1 CHECK (tier BETWEEN 0 AND 3),
    sla_hours      integer       NOT NULL DEFAULT 72 CHECK (sla_hours > 0),
    daily_capacity integer       NOT NULL DEFAULT 20 CHECK (daily_capacity > 0),
    /*
     * THE DISPLAY ORDER, lower first - of the console list and of the
     * storefront's. NULL IS ALLOWED, and means "not placed": an unplaced centre
     * follows every placed one, in the order the list always had (province,
     * then tier, then name). With a hundred and thirty centres nobody numbers
     * them all to move one to the top, and a NOT NULL DEFAULT 0 would have put
     * every new centre at the top of the list on the day it was created.
     */
    sort_order     integer       NULL,
    status         record_status NOT NULL DEFAULT 'ACTIVE',
    is_deleted     boolean       NOT NULL DEFAULT false,
    created_at     timestamptz   NOT NULL DEFAULT now(),
    updated_at     timestamptz   NOT NULL DEFAULT now()
);
COMMENT ON COLUMN agencies.tier IS
  '0 collection point, 1 authorised, 2 flagship, 3 factory service. Tier decides what a
   centre is allowed to attempt: a board-level repair does not belong at a collection point.';
COMMENT ON COLUMN agencies.sla_hours IS
  'promised turnaround. Per centre rather than global because a flagship in a capital city
   and a collection point three provinces away cannot honestly promise the same thing.';
COMMENT ON COLUMN agencies.daily_capacity IS 'tickets a day this centre can take before it is over-committed';

COMMENT ON TABLE agencies IS
  'A SERVICE CENTRE, as an address book entry plus the three figures the
   repair system runs on.

   It carried a short province code, a city, a district, opening hours, a
   latitude and a longitude as well. The code duplicated the province, the
   district was never shown, the hours were a free string on one card, and
   the coordinates existed to sort the locator by distance - which the
   province filter above it does perfectly well.';
COMMENT ON COLUMN agencies.code IS
  'the natural key the whole service system addresses a centre by - tickets,
   stock, technicians and the seeds all join on it';
COMMENT ON COLUMN agencies.landmark IS
  'the well-known building nearby, so staff can find the address. CONSOLE ONLY - never
   sent by the storefront API, which selects its columns by name';
COMMENT ON COLUMN agencies.sort_order IS
  'display order, lower first, in the console and on the storefront. NULL = not placed:
   after every placed centre, in province, tier and name order';

CREATE INDEX idx_agencies_area   ON agencies(province);
CREATE INDEX idx_agencies_status ON agencies(status);
CREATE INDEX idx_agencies_order  ON agencies(sort_order, name);

CREATE TRIGGER trg_agencies_updated
    BEFORE UPDATE ON agencies
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- ---------------------------------------------------------------------
-- A CENTRE HAS SEVERAL NUMBERS.
--
-- A front desk, a repair line, a manager's mobile - one `phone` column held
-- the first and people typed the rest into it with slashes. A child table
-- rather than an array column, for the same reason agency_services is one:
-- each number carries its own label and its own place in the list, and
-- "which centre called from this number" is a question the console asks.
-- ---------------------------------------------------------------------

CREATE TABLE agency_phones (
    id         serial       PRIMARY KEY,
    agency_id  integer      NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    phone      varchar(40)  NOT NULL,
    /* What the number is FOR - "Front desk", "Repairs". Optional; shown beside it. */
    label      varchar(60)  NULL,
    /* Lower first. The first number is the one a card leads with. */
    sort_order integer      NOT NULL DEFAULT 0,
    CONSTRAINT uq_agency_phone UNIQUE (agency_id, phone)
);
COMMENT ON TABLE agency_phones IS
  'every number a service centre answers, in the order it lists them. Replaced as a whole
   list on save - see agencies.repository.js replacePhones - so the order on screen is the
   order stored.';

CREATE INDEX idx_agency_phones_agency ON agency_phones(agency_id, sort_order);

-- ---------------------------------------------------------------------
-- ONE CENTRE, TWO LISTS.
--
-- The same building repairs a handset and a set-top box, but they are two
-- businesses to the people who run them: a different manager, a different
-- service vocabulary, and a different page in the console.
--
-- Splitting `agencies` in two would have meant one real place described
-- twice, with two addresses to keep in step when it moves. The split
-- belongs on what a centre OFFERS, which is this table.
-- ---------------------------------------------------------------------

CREATE TABLE agency_services (
    id           serial      PRIMARY KEY,
    agency_id    integer     NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    section      agency_section NOT NULL DEFAULT 'SMARTPHONE',
    service_type agency_service NOT NULL,
    -- A centre may offer REPAIR in both sections, so the section is part
    -- of the key rather than a filter over it.
    CONSTRAINT uq_agency_service UNIQUE (agency_id, section, service_type)
);
COMMENT ON COLUMN agency_services.service_type IS
  'from a FIXED vocabulary, and a different one per section:

     SMARTPHONE   OS | REPAIR | INSURANCE | REPLACEMENT
     EPRODUCT     MEDIA_SERVICE | REPAIR | STREAMING_DEVICES | COMPUTER
                  | CORDLESS_PHONE | CAMERA_DEVICE

   The API rejects anything else - see services/agencies.service.js.';

CREATE INDEX idx_agency_services_section ON agency_services(section, service_type);
COMMENT ON TABLE agency_services IS
  'a separate table rather than a comma joined column: the locator filters on it
   ("centres near me that do OS installs"), and a LIKE over a joined string cannot use an index';
COMMENT ON COLUMN agency_services.service_type IS
  'REPAIR | OS | INSURANCE | REPLACEMENT | INSTALLATION | MEDIA_SERVICE';

CREATE INDEX idx_agency_services_type ON agency_services(service_type);


CREATE TABLE faqs (
    id                  serial       PRIMARY KEY,

    /*
     * WHAT THE QUESTION IS ABOUT: the product kind in the visitor's hands -
     * SMARTPHONE, TV, STB, COMPUTER, CAMERA - or one of the three Crystal
     * services that are not products - CRYSTAL_APP, ESHOP, APPSTORE.
     *
     * It was the TOPIC once (warranty, repair, account), then the SYSTEM
     * (smartphone, eproduct, ...) with a second column - the catalogue
     * section - to say which eproduct. One answer, filed twice, on two
     * screens. The product kind says both at once, and the storefront's
     * section pages ask for exactly it (sql/deltas/033).
     */
    category            faq_category NOT NULL,
    question            varchar(300) NOT NULL,
    answer              text         NOT NULL,
    sort_order          integer      NOT NULL DEFAULT 0,
    view_count          integer      NOT NULL DEFAULT 0,
    status              publish_status NOT NULL DEFAULT 'PUBLISHED',
    is_deleted          boolean      NOT NULL DEFAULT false,
    created_at          timestamptz  NOT NULL DEFAULT now(),
    updated_at          timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON COLUMN faqs.category IS
  'WHAT the question is about: the product kind the visitor is holding (the catalogue''s
   product_kind, value for value), or the Crystal App, the Eshop or the Appstore.
   Inside the signed payload - a change to the vocabulary is a change to what an FAQ
   signature can say (src/security/schemas.js).';
COMMENT ON COLUMN faqs.view_count IS 'drives the support page''s "Popular Problems" block';

CREATE INDEX idx_faqs_category ON faqs(category, status);
CREATE INDEX idx_faqs_views    ON faqs(view_count DESC);

/*
 * A VIEW IS NOT AN EDIT. Opening an answer increments view_count, and
 * updated_at is part of what an FAQ's signature covers - so an update that
 * changes view_count and nothing else leaves updated_at alone. See
 * set_updated_at_unless_viewed() and sql/deltas/029.
 */
CREATE TRIGGER trg_faqs_updated
    BEFORE UPDATE ON faqs
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at_unless_viewed();


-- The published price list.  It is quoted to customers on the website, and
-- from section 6 it is also what a repair line is priced from - so a change
-- here changes what the next ticket charges, and the ticket copies the two
-- numbers onto its own line so an old ticket keeps the price it was quoted.
CREATE TABLE service_prices (
    id            serial        PRIMARY KEY,
    product_id    integer       NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    part_name     varchar(160)  NOT NULL,
    part_price    numeric(12,2) NOT NULL DEFAULT 0 CHECK (part_price >= 0),
    service_price numeric(12,2) NOT NULL DEFAULT 0 CHECK (service_price >= 0),
    approval_no   varchar(60)   NULL,
    sort_order    integer       NOT NULL DEFAULT 0,
    is_deleted    boolean       NOT NULL DEFAULT false,
    created_at    timestamptz   NOT NULL DEFAULT now(),
    updated_at    timestamptz   NOT NULL DEFAULT now()
);
COMMENT ON TABLE service_prices IS
  'THE PUBLISHED PRICE LIST, and only that.

   It used to carry the ticket side of a repair too - the stock item a line consumed,
   the bench minutes it took, how many were covered per repair, an internal costing
   price alongside the counter one. All of that is the REPAIR''s business rather than
   the price list''s, and repair_ticket_items already holds its own copy of every
   figure it charged, so a ticket keeps the price it quoted whatever happens here.

   What is left is the four things a customer reads: which part, what the part costs,
   what the labour costs, and the reference the figure was approved under.';
COMMENT ON COLUMN service_prices.part_name IS
  'the part or job as PUBLISHED, a plain string. Deliberately not a link to parts:
   the price list names things the way a customer would recognise them, and the shelf
   names them the way a technician orders them.';
COMMENT ON COLUMN service_prices.approval_no IS
  'the regulator''s approval reference for this published price, a free string because
   its format differs by market and it is never arithmetic.';

CREATE INDEX idx_service_prices_product ON service_prices(product_id, sort_order);

CREATE TRIGGER trg_service_prices_updated
    BEFORE UPDATE ON service_prices
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();



-- ---------------------------------------------------------------------
-- WHO A NOTICE IS FROM.
--
-- Its own table rather than a CHECK constraint, because the list is
-- OPERATIONAL rather than structural: a marketing campaign, a new store, a
-- regulator's announcement. Somebody in operations adds one, and none of them
-- is worth a release.
-- ---------------------------------------------------------------------

CREATE TABLE notice_origins (
    id         serial       PRIMARY KEY,
    code       varchar(40)  NOT NULL UNIQUE,
    name       varchar(120) NOT NULL,
    colour     varchar(7)   NULL,
    sort_order integer      NOT NULL DEFAULT 0,
    status     record_status NOT NULL DEFAULT 'ACTIVE',
    is_deleted boolean      NOT NULL DEFAULT false,
    created_at timestamptz  NOT NULL DEFAULT now(),
    updated_at timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON TABLE notice_origins IS
  'who a site notice is FROM - a team, a campaign, a regulator';
COMMENT ON COLUMN notice_origins.code IS
  'the natural key the seeds and any import address an origin by';
COMMENT ON COLUMN notice_origins.colour IS
  'hex, for the badge. A reader picks their own origin out of a list of six by
   colour before they read a single label.';

CREATE TRIGGER trg_notice_origins_updated
    BEFORE UPDATE ON notice_origins
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


-- ---------------------------------------------------------------------
-- THE NOTICES A VISITOR IS GREETED WITH.
--
-- A dialog on arrival is the most intrusive thing a website can do, so the
-- table is shaped to make the intrusion answerable rather than permanent:
--
--   it has a WINDOW      starts_at / ends_at, so a notice about a sale stops
--                        appearing when the sale ends without anybody
--                        remembering to switch it off
--   it can be DISMISSED  the visitor says "not today" and it stays away for
--                        the rest of the day
--   it has an ORDER      several notices can be live at once and the higher
--                        one is read first
--   it has an ORIGIN     which is what stops a list of six announcements
--                        reading as one undifferentiated wall
--
-- It used to be ONE notice: two live ones meant the higher order won and the
-- runner-up waited for it to expire. That was a rule about the DIALOG - a
-- stack of modals on arrival is an obstacle, not a greeting - written into
-- the query, so a second thing worth saying on the same day simply did not
-- get said. The dialog still shows them one at a time; the storefront now
-- reads them all and pages through, and the notification page lists them.
-- ---------------------------------------------------------------------

CREATE TABLE site_notices (
    id           serial       PRIMARY KEY,
    title        varchar(200) NOT NULL,
    content      text         NOT NULL,
    origin_id    integer      NULL
                              CONSTRAINT fk_site_notices_origin
                              REFERENCES notice_origins(id) ON DELETE SET NULL,
    status       publish_status NOT NULL DEFAULT 'DRAFT',
    starts_at    timestamptz(0) NULL,
    ends_at      timestamptz(0) NULL,
    sort_order   integer      NOT NULL DEFAULT 0,
    is_deleted   boolean      NOT NULL DEFAULT false,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    updated_at   timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON COLUMN site_notices.content IS
  'HTML from the console rich text editor - the same editor the blog uses, so
   a notice can carry a link and a line break without a second content format';
COMMENT ON COLUMN site_notices.origin_id IS
  'who it is from. NULL is allowed and means Crystal itself, so an origin that
   is later retired does not take its notices with it - ON DELETE SET NULL.';
COMMENT ON COLUMN site_notices.status IS
  'PUBLISHED is necessary but not sufficient: the window decides whether a
   published notice is live RIGHT NOW. Two switches, because writing a notice
   in advance and taking one down are different acts.';
COMMENT ON COLUMN site_notices.starts_at IS
  'NULL means "already started"; with ends_at it is the window the notice is live in';
COMMENT ON COLUMN site_notices.sort_order IS
  'higher shows first. It used to decide WHICH single notice was shown; now
   that they all are, it decides the order they are read in.';

CREATE INDEX idx_site_notices_live
    ON site_notices(status, is_deleted, sort_order DESC, id DESC);
CREATE INDEX idx_site_notices_origin ON site_notices(origin_id);

CREATE TRIGGER trg_site_notices_updated
    BEFORE UPDATE ON site_notices
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


-- =====================================================================
-- 5. BLOG
--
-- `author` is a denormalised name as the spec lists it, but author_id keeps
-- the link so the console can show an editor their own drafts.  The name
-- survives the admin being deleted; the link survives them being renamed.
-- =====================================================================

CREATE TABLE articles (
    id                 serial       PRIMARY KEY,
    title              varchar(240) NOT NULL,
    slug               varchar(240) NOT NULL UNIQUE,
    cover_image        varchar(255) NULL,
    cover_image_mobile varchar(255) NULL,
    summary            text         NULL,
    content            text         NULL,
    author             varchar(120) NULL,
    author_id          integer      NULL REFERENCES managers(id) ON DELETE SET NULL,
    category           article_topic NOT NULL DEFAULT 'NEWS',
    status             publish_status NOT NULL DEFAULT 'DRAFT',
    view_count         integer      NOT NULL DEFAULT 0,
    is_featured        boolean      NOT NULL DEFAULT false,
    published_at       timestamptz  NULL,
    is_deleted         boolean      NOT NULL DEFAULT false,
    created_at         timestamptz  NOT NULL DEFAULT now(),
    updated_at         timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON COLUMN articles.published_at IS
  'set only on the transition into PUBLISHED - re-editing a live article must not
   move it back to the top of the list';

CREATE INDEX idx_articles_status   ON articles(status, published_at DESC);
CREATE INDEX idx_articles_category ON articles(category);

CREATE TRIGGER trg_articles_updated
    BEFORE UPDATE ON articles
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


-- =====================================================================
-- 6. MEMBER DEVICES
-- =====================================================================

-- A local mirror of the vendor's legacy warehouse table (spec 2, spec 11).
-- The registration flow asks Oracle for a serial and reads this instead when
-- Oracle is switched off or unreachable - so a warehouse outage degrades
-- rather than stopping a member registering a device they physically hold.
-- Its columns mirror what the Oracle lookup returns, not what Crystal would
-- have designed.
CREATE TABLE oracle_serials (
    id              serial       PRIMARY KEY,
    serial_number   varchar(60)  NOT NULL UNIQUE,
    model_code      varchar(60)  NOT NULL,
    product_id      integer      NULL REFERENCES products(id) ON DELETE SET NULL,
    manufactured_on date         NULL,
    warranty_until  date         NULL,
    factory_code    varchar(40)  NULL,
    batch_code      varchar(40)  NULL,
    status          serial_status NOT NULL DEFAULT 'AVAILABLE'
);
COMMENT ON COLUMN oracle_serials.product_id IS
  'resolved to a Crystal product at seed time; a serial for a model Crystal does not
   carry yet stays unresolved rather than blocking the whole mirror';
COMMENT ON COLUMN oracle_serials.batch_code IS
  'the production batch. Section 8''s defect watch groups repairs by it - a fault that
   is really a bad batch looks like a bad product until someone can group by this.';

CREATE INDEX idx_oracle_serials_model ON oracle_serials(model_code);
CREATE INDEX idx_oracle_serials_batch ON oracle_serials(batch_code);


CREATE TABLE registered_products (
    id             serial       PRIMARY KEY,
    user_id        integer      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id     integer      NULL REFERENCES products(id) ON DELETE SET NULL,
    serial_number  varchar(60)  NOT NULL UNIQUE,
    nickname       varchar(80)  NULL,
    purchase_date  date         NULL,
    warranty_until date         NULL,
    points         integer      NOT NULL DEFAULT 0,
    register_time  timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON CONSTRAINT registered_products_serial_number_key ON registered_products IS
  'a serial number identifies one physical device, so it can only ever be registered
   once. This unique index is the actual guard against a serial being farmed for points.';

CREATE INDEX idx_registrations_user ON registered_products(user_id, register_time DESC);


CREATE TABLE licenses (
    id                    serial       PRIMARY KEY,
    user_id               integer      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    registered_product_id integer      NULL REFERENCES registered_products(id) ON DELETE SET NULL,
    device_type           licensed_device NOT NULL,
    device_sn             varchar(60)  NOT NULL,
    device_no             varchar(60)  NULL,
    license_key           varchar(120) NOT NULL UNIQUE,
    points_used           integer      NOT NULL DEFAULT 0,
    valid_until           date         NULL,
    status                licence_status NOT NULL DEFAULT 'ACTIVE',
    created_at            timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_licenses_user ON licenses(user_id, created_at DESC);
CREATE INDEX idx_licenses_sn   ON licenses(device_sn);


-- =====================================================================
-- 7. WALLET AND POINTS
--
-- Both are ledgers with a cached total: every movement writes a row AND
-- updates the balance inside one transaction, under a row lock on the wallet.
-- A SUM() on every account page load would be correct and would get slower
-- for exactly the members who use the site most.
--
-- balance_after is stored on each row so a statement renders without
-- replaying the history, and so a drifted cache is detectable - the smoke
-- test asserts the ledger still sums to the cached balance.
-- =====================================================================

CREATE TABLE wallets (
    user_id           integer       PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance           numeric(14,2) NOT NULL DEFAULT 0,
    frozen            numeric(14,2) NOT NULL DEFAULT 0 CHECK (frozen >= 0),
    currency          varchar(8)    NOT NULL DEFAULT 'USD',
    -- Points carry three decimals, the same as the ledger that sums to this.
    point_balance     numeric(14,3) NOT NULL DEFAULT 0,
    pay_password_hash varchar(120)  NULL,
    created_at        timestamptz   NOT NULL DEFAULT now(),
    updated_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_wallets_updated
    BEFORE UPDATE ON wallets
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


CREATE TABLE wallet_transactions (
    id              serial        PRIMARY KEY,
    user_id         integer       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            wallet_movement NOT NULL,
    amount          numeric(14,2) NOT NULL,
    balance_after   numeric(14,2) NOT NULL,
    currency        varchar(8)    NOT NULL DEFAULT 'USD',
    reference       varchar(80)   NULL,
    description     varchar(255)  NULL,
    counterparty_id integer       NULL REFERENCES users(id) ON DELETE SET NULL,
    status          transaction_result NOT NULL DEFAULT 'SUCCESS',
    created_at      timestamptz   NOT NULL DEFAULT now()
);
COMMENT ON COLUMN wallet_transactions.amount IS 'signed: a debit is negative, so SUM(amount) is the balance';
COMMENT ON COLUMN wallet_transactions.type IS
  'REPAIR and COMPENSATION were added with section 8 - paying for a repair from the wallet,
   and crediting a member back when a repair went wrong, are both wallet movements';

CREATE INDEX idx_wallet_tx_user ON wallet_transactions(user_id, created_at DESC);
CREATE INDEX idx_wallet_tx_type ON wallet_transactions(type);


CREATE TABLE point_logs (
    id            serial       PRIMARY KEY,
    user_id       integer      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type          point_movement NOT NULL,
    -- NUMERIC, NOT INTEGER, and the scale is the vendor's. The four point
    -- systems this ledger is shown beside keep tenths (activity) and
    -- thousandths (the soft-point family) of a point; rounding them to whole
    -- numbers here does not display a movement differently, it records a
    -- different movement. See sql/deltas/027.
    amount        numeric(14,3) NOT NULL,
    balance_after numeric(14,3) NOT NULL,
    description   varchar(255) NULL,
    reference     varchar(80)  NULL,
    created_at    timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON COLUMN point_logs.amount IS
  'signed as well. LICENSE and WARRANTY_EXTENSION are negative - they spend points.';

CREATE INDEX idx_point_logs_user ON point_logs(user_id, created_at DESC);
CREATE INDEX idx_point_logs_type ON point_logs(type);


-- ---------------------------------------------------------------------
-- FEEDBACK IS A CONVERSATION, not a form and a footnote.
--
-- It used to be one row: a title, a body, one reply, one status. That shape
-- holds exactly one exchange - a member who needed to add a detail had to
-- open a second enquiry, and a manager who needed to ask a question had
-- nowhere to put it.
--
-- A THREAD carries the subject and the state; the MESSAGES underneath it are
-- the exchange. Both sides post into the same chain.
-- ---------------------------------------------------------------------

CREATE TABLE feedback_threads (
    id            serial        PRIMARY KEY,
    user_id       integer       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         varchar(512)  NOT NULL,
    thread_source enquiry_source NOT NULL DEFAULT 'SMARTPHONE',
    status        feedback_status NOT NULL DEFAULT 'PENDING',
    last_message  varchar(4000) NULL,
    last_type     conversation_side NULL,
    is_read       boolean       NOT NULL DEFAULT false,
    session_by    integer       NULL REFERENCES managers(id) ON DELETE SET NULL,
    is_deleted    boolean       NOT NULL DEFAULT false,
    created_at    timestamptz   NOT NULL DEFAULT now(),
    updated_at    timestamptz   NOT NULL DEFAULT now()
);
COMMENT ON COLUMN feedback_threads.thread_source IS
  'WHERE the enquiry came from, which is not what it is about: the smartphone
   site, the eproduct site, the Eshop, the Appstore, a registration flow or the
   Crystal app. Different teams answer different origins.';
COMMENT ON COLUMN feedback_threads.status IS
  'PENDING  the member has written and nobody has answered
   REPLIED  a manager has answered and it is back with the member
   RESOLVED either side says the problem is fixed
   FINISHED nobody resolved it and it aged out - see the housekeeping job';
COMMENT ON COLUMN feedback_threads.last_message IS
  'the newest message, denormalised so a list of threads does not need a
   correlated subquery per row. Written in the same transaction as the message
   itself, so it cannot drift.';
COMMENT ON COLUMN feedback_threads.is_read IS
  'whether the side that did NOT write last has seen it';
COMMENT ON COLUMN feedback_threads.session_by IS
  'the manager who picked it up, so a thread has an owner rather than being
   answered by whoever happens to be looking';

CREATE INDEX idx_feedback_threads_user  ON feedback_threads(user_id, updated_at DESC);
CREATE INDEX idx_feedback_threads_state ON feedback_threads(status, thread_source, updated_at DESC);

/*
 * NOT set_updated_at, and the difference is the queue's ordering.
 *
 * The console sorts its queue by `updated_at DESC` - the thread somebody wrote
 * in most recently is the one to answer next. Marking a thread READ is an
 * UPDATE, so with the ordinary trigger, opening a thread stamped it as the
 * newest activity and jumped it to the top: the list reordered itself under
 * the manager the moment they clicked a row.
 *
 * So on THIS table `updated_at` means the last time somebody wrote in the
 * thread. Reading it is not writing in it.
 */
CREATE TRIGGER trg_feedback_threads_updated
    BEFORE UPDATE ON feedback_threads
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at_unless_read();


CREATE TABLE feedback_messages (
    id          serial      PRIMARY KEY,
    thread_id   integer     NOT NULL REFERENCES feedback_threads(id) ON DELETE CASCADE,
    message     text        NOT NULL,
    action_type conversation_side NOT NULL,
    action_by   integer     NOT NULL,
    action_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN feedback_messages.action_by IS
  'a users.id when action_type is MEMBER, an managers.id when it is MANAGER.

   No foreign key, deliberately: one column cannot point at two tables, and two
   nullable columns would make every read a COALESCE for a value that is never
   ambiguous once action_type is known.';

CREATE INDEX idx_feedback_messages_thread ON feedback_messages(thread_id, action_at);


-- =====================================================================
-- 8. AFTER-SALES SERVICE OPERATIONS
--
-- Everything above this line describes what Crystal sells.  This section
-- describes what happens afterwards, which is where an electronics company
-- actually keeps or loses its customers.
--
-- The spine is a repair ticket.  A device comes in, someone works out what is
-- wrong with it, parts come off a shelf, the bill is either the customer's or
-- Crystal's depending on a warranty, and the centre that did the work claims
-- the covered half back.  Each of those is a table below, and each of them is
-- also a number the business is judged on - which is why section 9 can score
-- a service centre without any of these tables knowing that it does.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 8.1 warranty
--
-- A policy is the offer; a warranty is one device's copy of it.  They are
-- separate because the offer changes - a policy repriced in March must not
-- silently re-write what a member bought in January - so a warranty stores
-- the dates and the cover it was actually sold, and only points back at the
-- policy for provenance.
-- ---------------------------------------------------------------------

CREATE TABLE warranty_policies (
    id                serial        PRIMARY KEY,
    code              varchar(40)   NOT NULL UNIQUE,
    name              varchar(120)  NOT NULL,
    category_id       integer       NULL REFERENCES product_categories(id) ON DELETE CASCADE,
    series_id         integer       NULL REFERENCES product_series(id) ON DELETE CASCADE,
    kind              warranty_kind NOT NULL DEFAULT 'STANDARD',
    months            smallint      NOT NULL CHECK (months > 0),
    covers_parts      boolean       NOT NULL DEFAULT true,
    covers_labour     boolean       NOT NULL DEFAULT true,
    covers_accidental boolean       NOT NULL DEFAULT false,
    claim_limit       smallint      NOT NULL DEFAULT 0,
    price             numeric(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    points_price      integer       NOT NULL DEFAULT 0 CHECK (points_price >= 0),
    currency          varchar(8)    NOT NULL DEFAULT 'USD',
    is_default        boolean       NOT NULL DEFAULT false,
    sort_order        integer       NOT NULL DEFAULT 0,
    status            record_status NOT NULL DEFAULT 'ACTIVE',
    is_deleted        boolean       NOT NULL DEFAULT false,
    created_at        timestamptz   NOT NULL DEFAULT now(),
    updated_at        timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT chk_policy_scope CHECK (category_id IS NOT NULL OR series_id IS NOT NULL)
);
COMMENT ON COLUMN warranty_policies.claim_limit IS
  '0 = unlimited. A CARE_PLUS plan that covers accidental damage has to cap it, or it is
   not insurance, it is a subscription to free screens.';
COMMENT ON COLUMN warranty_policies.is_default IS
  'the policy a registration of this category gets automatically, with no purchase';
COMMENT ON COLUMN warranty_policies.points_price IS
  'members can buy an extension with points instead of money; 0 means points are not accepted';

CREATE INDEX idx_policies_category ON warranty_policies(category_id);
CREATE INDEX idx_policies_series   ON warranty_policies(series_id);

CREATE TRIGGER trg_warranty_policies_updated
    BEFORE UPDATE ON warranty_policies
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


CREATE TABLE warranties (
    id                    serial        PRIMARY KEY,
    warranty_no           varchar(40)   NOT NULL UNIQUE,
    user_id               integer       NULL REFERENCES users(id) ON DELETE SET NULL,
    registered_product_id integer       NULL REFERENCES registered_products(id) ON DELETE SET NULL,
    product_id            integer       NULL REFERENCES products(id) ON DELETE SET NULL,
    serial_number         varchar(60)   NOT NULL,
    policy_id             integer       NULL REFERENCES warranty_policies(id) ON DELETE SET NULL,
    kind                  warranty_kind NOT NULL DEFAULT 'STANDARD',
    source                warranty_source NOT NULL DEFAULT 'REGISTRATION',
    start_date            date          NOT NULL,
    end_date              date          NOT NULL,
    covers_parts          boolean       NOT NULL DEFAULT true,
    covers_labour         boolean       NOT NULL DEFAULT true,
    covers_accidental     boolean       NOT NULL DEFAULT false,
    claim_limit           smallint      NOT NULL DEFAULT 0,
    claims_used           smallint      NOT NULL DEFAULT 0 CHECK (claims_used >= 0),
    price_paid            numeric(12,2) NOT NULL DEFAULT 0,
    points_used           integer       NOT NULL DEFAULT 0,
    currency              varchar(8)    NOT NULL DEFAULT 'USD',
    status                warranty_status NOT NULL DEFAULT 'ACTIVE',
    void_reason           varchar(255)  NULL,
    remark                text          NULL,
    is_deleted            boolean       NOT NULL DEFAULT false,
    created_at            timestamptz   NOT NULL DEFAULT now(),
    updated_at            timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT chk_warranty_period CHECK (end_date >= start_date),
    CONSTRAINT chk_warranty_claims CHECK (claim_limit = 0 OR claims_used <= claim_limit)
);
COMMENT ON TABLE warranties IS
  'One device''s cover, as it was actually sold. The cover flags are copied from the policy
   rather than read through it, because a policy repriced in March must not silently rewrite
   what a member bought in January.';
COMMENT ON COLUMN warranties.serial_number IS
  'the device, named the way the factory names it. Not a FK to registered_products: a device
   can be repaired under warranty by someone who never created an account for it.';
COMMENT ON COLUMN warranties.claims_used IS
  'kept in step by the ticket service when a covered repair closes, not by a trigger - the
   rule about what counts as a claim belongs with the rest of the repair rules';
COMMENT ON COLUMN warranties.status IS
  'EXPIRED is set by the nightly sweep rather than inferred from end_date, so that "why is
   this not covered" has an answer with a date on it';

CREATE INDEX idx_warranties_serial ON warranties(serial_number);
CREATE INDEX idx_warranties_user   ON warranties(user_id);
CREATE INDEX idx_warranties_end    ON warranties(end_date);
CREATE INDEX idx_warranties_status ON warranties(status);

CREATE TRIGGER trg_warranties_updated
    BEFORE UPDATE ON warranties
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


-- ---------------------------------------------------------------------
-- 8.2 symptoms
--
-- What the customer says is wrong, from a list rather than in their own words.
-- The free text is kept too - it is on the ticket - but a hundred ways of
-- writing "screen flickers" cannot be counted, and section 9's defect watch is
-- entirely a matter of counting.
-- ---------------------------------------------------------------------

CREATE TABLE symptom_catalog (
    id          serial       PRIMARY KEY,
    code        varchar(40)  NOT NULL UNIQUE,
    name        varchar(160) NOT NULL,
    category_id integer      NULL REFERENCES product_categories(id) ON DELETE CASCADE,
    component   varchar(40)  NOT NULL DEFAULT 'OTHER',
    severity    smallint     NOT NULL DEFAULT 1 CHECK (severity BETWEEN 0 AND 3),
    sort_order  integer      NOT NULL DEFAULT 0,
    is_deleted  boolean      NOT NULL DEFAULT false,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON COLUMN symptom_catalog.component IS
  'DISPLAY | BATTERY | BOARD | CAMERA | AUDIO | POWER | NETWORK | SOFTWARE | CASING | OTHER.
   The part of the device blamed at intake, before anyone has opened it.';
COMMENT ON COLUMN symptom_catalog.severity IS
  '0 cosmetic, 1 normal, 2 unusable, 3 safety. Safety symptoms are what a defect watch has
   to surface within days rather than within a quarter.';

CREATE INDEX idx_symptoms_category  ON symptom_catalog(category_id);
CREATE INDEX idx_symptoms_component ON symptom_catalog(component);

CREATE TRIGGER trg_symptom_catalog_updated
    BEFORE UPDATE ON symptom_catalog
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


-- ---------------------------------------------------------------------
-- 8.3 technicians
-- ---------------------------------------------------------------------

CREATE TABLE technicians (
    id         serial       PRIMARY KEY,
    agency_id  integer      NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    code       varchar(40)  NOT NULL UNIQUE,
    name       varchar(80)  NOT NULL,
    phone      varchar(40)  NULL,
    grade      smallint     NOT NULL DEFAULT 1 CHECK (grade BETWEEN 1 AND 4),
    daily_minutes integer   NOT NULL DEFAULT 420 CHECK (daily_minutes > 0),
    hired_on   date         NULL,
    status     record_status NOT NULL DEFAULT 'ACTIVE',
    is_deleted boolean      NOT NULL DEFAULT false,
    created_at timestamptz  NOT NULL DEFAULT now(),
    updated_at timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON COLUMN technicians.grade IS
  '1 trainee, 2 technician, 3 senior, 4 master. A board-level job assigned to a trainee is
   how a one-visit repair becomes three.';
COMMENT ON COLUMN technicians.daily_minutes IS
  'bench minutes available per day. Priced work carries labour_minutes, so a day''s
   assignments can be added up against this instead of counted.';

CREATE INDEX idx_technicians_agency ON technicians(agency_id, status);

CREATE TRIGGER trg_technicians_updated
    BEFORE UPDATE ON technicians
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


CREATE TABLE technician_skills (
    id            serial      PRIMARY KEY,
    technician_id integer     NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
    component     varchar(40) NOT NULL,
    level         smallint    NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 4),
    CONSTRAINT uq_technician_skill UNIQUE (technician_id, component)
);
COMMENT ON TABLE technician_skills IS
  'the same component vocabulary as symptom_catalog, which is what lets an intake symptom
   suggest who should be given the job';


-- ---------------------------------------------------------------------
-- 8.4 parts and stock
--
-- Stock is a ledger with a cached total, the same shape as the member wallet
-- in section 7 and for the same reason.  part_stock.on_hand is the cache;
-- part_movements is the truth, signed so that SUM(quantity) is the balance.
-- Nothing writes one without the other, inside one transaction, under a row
-- lock on the stock row.
-- ---------------------------------------------------------------------

CREATE TABLE parts (
    id              serial        PRIMARY KEY,
    part_no         varchar(60)   NOT NULL UNIQUE,
    name            varchar(160)  NOT NULL,
    component       varchar(40)   NOT NULL DEFAULT 'OTHER',
    unit_cost       numeric(12,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
    currency        varchar(8)    NOT NULL DEFAULT 'USD',
    warranty_months smallint      NOT NULL DEFAULT 3 CHECK (warranty_months >= 0),
    lead_days       smallint      NOT NULL DEFAULT 7 CHECK (lead_days >= 0),
    is_serialised   boolean       NOT NULL DEFAULT false,
    status          record_status NOT NULL DEFAULT 'ACTIVE',
    is_deleted      boolean       NOT NULL DEFAULT false,
    created_at      timestamptz   NOT NULL DEFAULT now(),
    updated_at      timestamptz   NOT NULL DEFAULT now()
);
COMMENT ON COLUMN parts.warranty_months IS
  'cover on the part itself. A screen that fails six weeks after being fitted is Crystal''s
   problem, not the customer''s, and this is the column that says so.';
COMMENT ON COLUMN parts.lead_days IS
  'how long a replenishment takes to arrive. A reorder level that ignores lead time reorders
   too late every time.';

CREATE INDEX idx_parts_component ON parts(component);

CREATE TRIGGER trg_parts_updated
    BEFORE UPDATE ON parts
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- Deferred from section 4: a price line consumes a stock item.

CREATE TABLE part_compatibility (
    id         serial  PRIMARY KEY,
    part_id    integer NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
    product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT uq_part_product UNIQUE (part_id, product_id)
);
COMMENT ON TABLE part_compatibility IS
  'which parts fit which products. A battery shared across three handsets is one part and
   three rows here, so ordering it for one model stocks it for all three.';

CREATE INDEX idx_part_compat_product ON part_compatibility(product_id);


CREATE TABLE part_stock (
    id            serial      PRIMARY KEY,
    agency_id     integer     NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    part_id       integer     NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
    on_hand       integer     NOT NULL DEFAULT 0,
    reserved      integer     NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    reorder_level integer     NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
    bin           varchar(40) NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_stock_agency_part UNIQUE (agency_id, part_id),
    CONSTRAINT chk_stock_not_negative CHECK (on_hand >= 0)
);
COMMENT ON COLUMN part_stock.on_hand IS
  'the cache. part_movements is the truth; these two are written together or not at all.';
COMMENT ON COLUMN part_stock.reserved IS
  'committed to tickets that have not consumed it yet. on_hand minus reserved is what a new
   ticket can actually promise, and quoting the wrong one of those is how two customers get
   told the same screen is waiting for them.';
COMMENT ON CONSTRAINT chk_stock_not_negative ON part_stock IS
  'the database''s own refusal to let a centre issue a part it does not have. The service
   checks first and says something useful; this is what catches the race between two clerks.';

CREATE INDEX idx_stock_part ON part_stock(part_id);

CREATE TRIGGER trg_part_stock_updated
    BEFORE UPDATE ON part_stock
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


CREATE TABLE part_movements (
    id             serial        PRIMARY KEY,
    agency_id      integer       NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    part_id        integer       NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
    movement        stock_movement NOT NULL,
    quantity       integer       NOT NULL CHECK (quantity <> 0),
    balance_after  integer       NOT NULL,
    unit_cost      numeric(12,2) NOT NULL DEFAULT 0,
    reference_type stock_reference NULL,
    reference_id   integer       NULL,
    note           varchar(255)  NULL,
    manager_id       integer       NULL,
    manager_name     varchar(100)  NULL,
    created_at     timestamptz   NOT NULL DEFAULT now()
);
COMMENT ON TABLE part_movements IS 'append only: a correction is another movement, never an edit';
COMMENT ON COLUMN part_movements.quantity IS
  'signed. RECEIPT and RETURN are positive, ISSUE and SCRAP negative, ADJUST either way -
   so SUM(quantity) is the balance and a drifted cache is one query away from being found.';
COMMENT ON COLUMN part_movements.manager_id IS
  'copied in as data rather than referenced, for the same reason audit_log does it: the
   movement has to outlive the account';

CREATE INDEX idx_movements_stock   ON part_movements(agency_id, part_id, created_at DESC);
CREATE INDEX idx_movements_ref     ON part_movements(reference_type, reference_id);
CREATE INDEX idx_movements_created ON part_movements(created_at DESC);


CREATE TABLE part_replenishments (
    id            serial        PRIMARY KEY,
    order_no      varchar(40)   NOT NULL UNIQUE,
    agency_id     integer       NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
    status        smallint      NOT NULL DEFAULT 0 CHECK (status IN (0,1,2,3,4,9)),
    requested_on  date          NOT NULL DEFAULT CURRENT_DATE,
    expected_on   date          NULL,
    received_on   date          NULL,
    total_cost    numeric(14,2) NOT NULL DEFAULT 0,
    currency      varchar(8)    NOT NULL DEFAULT 'USD',
    is_auto       boolean       NOT NULL DEFAULT false,
    approved_by   integer       NULL REFERENCES managers(id) ON DELETE SET NULL,
    approved_at   timestamptz   NULL,
    remark        text          NULL,
    is_deleted    boolean       NOT NULL DEFAULT false,
    created_at    timestamptz   NOT NULL DEFAULT now(),
    updated_at    timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT chk_replenishment_dates CHECK (received_on IS NULL OR received_on >= requested_on)
);
COMMENT ON COLUMN part_replenishments.status IS '0 draft, 1 submitted, 2 approved, 3 shipped, 4 received, 9 cancelled';
COMMENT ON COLUMN part_replenishments.is_auto IS
  'raised by the low-stock sweep rather than by a person. Worth knowing when reading the
   list: an automatic order nobody has looked at is a different thing from one somebody asked for.';

CREATE INDEX idx_replenishments_agency ON part_replenishments(agency_id, status);
CREATE INDEX idx_replenishments_date   ON part_replenishments(requested_on DESC);

CREATE TRIGGER trg_part_replenishments_updated
    BEFORE UPDATE ON part_replenishments
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


CREATE TABLE part_replenishment_items (
    id                serial        PRIMARY KEY,
    replenishment_id  integer       NOT NULL REFERENCES part_replenishments(id) ON DELETE CASCADE,
    part_id           integer       NOT NULL REFERENCES parts(id) ON DELETE RESTRICT,
    quantity          integer       NOT NULL CHECK (quantity > 0),
    received_quantity integer       NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
    unit_cost         numeric(12,2) NOT NULL DEFAULT 0,
    amount            numeric(14,2) NOT NULL DEFAULT 0,
    CONSTRAINT uq_replenishment_part UNIQUE (replenishment_id, part_id),
    CONSTRAINT chk_received_not_over CHECK (received_quantity <= quantity)
);
COMMENT ON COLUMN part_replenishment_items.received_quantity IS
  'a short delivery is normal and has to be recordable; the stock movement is written for
   what arrived, not for what was ordered';


-- ---------------------------------------------------------------------
-- 8.5 repair tickets
--
-- The spine.  Everything else in this section exists because a ticket needs
-- it, and section 9's whole scoreboard is derived from these rows.
--
-- The status codes are smallint with a CHECK rather than a varchar because
-- they are a closed list that the workflow reasons about in order - "still
-- open" is `status < 7`, and that is a comparison, not a set membership test.
-- The words for them are in src/utils/codes.js.
-- ---------------------------------------------------------------------

CREATE TABLE repair_tickets (
    id                    serial        PRIMARY KEY,
    ticket_no             varchar(40)   NOT NULL UNIQUE,

    -- who
    user_id               integer       NULL REFERENCES users(id) ON DELETE SET NULL,
    customer_name         varchar(120)  NOT NULL,
    customer_phone        varchar(40)   NOT NULL,
    customer_email        varchar(190)  NULL,

    -- what
    product_id            integer       NULL REFERENCES products(id) ON DELETE SET NULL,
    registered_product_id integer       NULL REFERENCES registered_products(id) ON DELETE SET NULL,
    serial_number         varchar(60)   NOT NULL,
    warranty_id           integer       NULL REFERENCES warranties(id) ON DELETE SET NULL,

    -- where
    agency_id             integer       NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
    technician_id         integer       NULL REFERENCES technicians(id) ON DELETE SET NULL,
    intake_channel        smallint      NOT NULL DEFAULT 0 CHECK (intake_channel BETWEEN 0 AND 3),

    -- the fault
    symptom_id            integer       NULL REFERENCES symptom_catalog(id) ON DELETE SET NULL,
    fault_description     text          NOT NULL,
    diagnosis             text          NULL,
    resolution            text          NULL,
    accessories           varchar(255)  NULL,
    condition_note        varchar(255)  NULL,

    -- state
    status                smallint      NOT NULL DEFAULT 0 CHECK (status IN (0,1,2,3,4,5,6,7,9)),
    priority              smallint      NOT NULL DEFAULT 1 CHECK (priority BETWEEN 0 AND 2),
    is_warranty           boolean       NOT NULL DEFAULT false,
    warranty_note         varchar(255)  NULL,
    reopened_from         integer       NULL REFERENCES repair_tickets(id) ON DELETE SET NULL,

    -- the clock
    received_at           timestamptz   NOT NULL DEFAULT now(),
    promised_at           timestamptz   NULL,
    diagnosed_at          timestamptz   NULL,
    repaired_at           timestamptz   NULL,
    closed_at             timestamptz   NULL,

    -- the money
    parts_amount          numeric(12,2) NOT NULL DEFAULT 0 CHECK (parts_amount >= 0),
    labour_amount         numeric(12,2) NOT NULL DEFAULT 0 CHECK (labour_amount >= 0),
    discount_amount       numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    covered_amount        numeric(12,2) NOT NULL DEFAULT 0 CHECK (covered_amount >= 0),
    total_amount          numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    currency              varchar(8)    NOT NULL DEFAULT 'USD',
    pay_state             smallint      NOT NULL DEFAULT 0 CHECK (pay_state BETWEEN 0 AND 3),
    pay_method            smallint      NULL CHECK (pay_method BETWEEN 0 AND 5),
    claim_id              integer       NULL,

    -- what the customer thought of it
    rating                smallint      NULL CHECK (rating BETWEEN 1 AND 5),
    rating_comment        varchar(500)  NULL,
    rated_at              timestamptz   NULL,

    remark                text          NULL,
    created_by            integer       NULL REFERENCES managers(id) ON DELETE SET NULL,
    is_deleted            boolean       NOT NULL DEFAULT false,
    created_at            timestamptz   NOT NULL DEFAULT now(),
    updated_at            timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT chk_ticket_not_own_parent CHECK (reopened_from IS NULL OR reopened_from <> id),
    CONSTRAINT chk_ticket_closed_after   CHECK (closed_at IS NULL OR closed_at >= received_at)
);

COMMENT ON TABLE repair_tickets IS
  'One device, one visit. A device that comes back for the same fault gets a NEW ticket
   with reopened_from pointing at the old one - overwriting the first would destroy exactly
   the evidence that says this repair did not work.';
COMMENT ON COLUMN repair_tickets.user_id IS
  'nullable on purpose: a walk-in with a receipt and no account is still owed a repair.
   customer_name and customer_phone are therefore NOT NULL and the account is not.';
COMMENT ON COLUMN repair_tickets.status IS
  '0 received, 1 diagnosing, 2 waiting for parts, 3 waiting for approval, 4 repairing,
   5 quality check, 6 ready for collection, 7 closed, 9 cancelled';
COMMENT ON COLUMN repair_tickets.intake_channel IS '0 walk-in, 1 mail-in, 2 on-site, 3 courier pickup';
COMMENT ON COLUMN repair_tickets.priority IS '0 low, 1 normal, 2 urgent';
COMMENT ON COLUMN repair_tickets.is_warranty IS
  'decided at intake and then stored, not recomputed. Whether the repair was covered is a
   decision somebody made on a day, and a warranty that expires next week must not
   retroactively make last month''s free repair chargeable.';
COMMENT ON COLUMN repair_tickets.promised_at IS
  'received_at plus the centre''s sla_hours, stamped at intake. Stored rather than derived
   because the centre''s SLA can be changed afterwards and the promise cannot.';
COMMENT ON COLUMN repair_tickets.covered_amount IS
  'the half of the bill the warranty pays. total_amount is what the customer owes; the two
   together are what the repair cost, and covered_amount is what the centre claims back.';
COMMENT ON COLUMN repair_tickets.pay_state IS '0 unpaid, 1 part paid, 2 paid, 3 nothing to pay';
COMMENT ON COLUMN repair_tickets.pay_method IS '0 cash, 1 bank transfer, 2 card, 3 wallet, 4 cheque, 5 other';
COMMENT ON COLUMN repair_tickets.rating IS
  '1-5, asked for after collection. The one number in this table the centre cannot influence
   by editing a field, which is what makes it worth putting in the health score.';
COMMENT ON COLUMN repair_tickets.claim_id IS 'the settlement batch this covered repair went out on; FK added below';

CREATE INDEX idx_tickets_agency   ON repair_tickets(agency_id, status);
CREATE INDEX idx_tickets_status   ON repair_tickets(status, received_at DESC);
CREATE INDEX idx_tickets_serial   ON repair_tickets(serial_number);
CREATE INDEX idx_tickets_user     ON repair_tickets(user_id, received_at DESC);
CREATE INDEX idx_tickets_product  ON repair_tickets(product_id);
CREATE INDEX idx_tickets_received ON repair_tickets(received_at DESC);
CREATE INDEX idx_tickets_tech     ON repair_tickets(technician_id, status);
CREATE INDEX idx_tickets_claim    ON repair_tickets(claim_id);

-- The open queue is read on every console page load and is a small slice of a
-- table that only grows, so it gets an index of its own.
CREATE INDEX idx_tickets_open ON repair_tickets(agency_id, promised_at)
    WHERE status < 7 AND is_deleted = false;

CREATE TRIGGER trg_repair_tickets_updated
    BEFORE UPDATE ON repair_tickets
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


CREATE TABLE repair_ticket_items (
    id               serial        PRIMARY KEY,
    ticket_id        integer       NOT NULL REFERENCES repair_tickets(id) ON DELETE CASCADE,
    item_type        bill_line_type NOT NULL,
    part_id          integer       NULL REFERENCES parts(id) ON DELETE SET NULL,
    service_price_id integer       NULL REFERENCES service_prices(id) ON DELETE SET NULL,
    name             varchar(160)  NOT NULL,
    quantity         integer       NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price       numeric(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    amount           numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    is_covered       boolean       NOT NULL DEFAULT false,
    labour_minutes   integer       NOT NULL DEFAULT 0 CHECK (labour_minutes >= 0),
    issued           boolean       NOT NULL DEFAULT false,
    remark           varchar(255)  NULL,
    created_at       timestamptz   NOT NULL DEFAULT now()
);
COMMENT ON TABLE repair_ticket_items IS
  'the bill, one line at a time. name and unit_price are copied off the price list rather
   than joined to it, so a ticket keeps the price it was quoted when the list moves.';
COMMENT ON COLUMN repair_ticket_items.is_covered IS
  'this line is on the warranty rather than on the customer. Per line, not per ticket:
   a covered board replacement and an uncovered cracked-glass charge sit on one repair.';
COMMENT ON COLUMN repair_ticket_items.issued IS
  'the part has actually left the shelf. Adding a line reserves stock; issuing it consumes
   stock, and they are different moments - a quote the customer refuses must not have
   silently emptied the shelf in between.';

CREATE INDEX idx_ticket_items_ticket ON repair_ticket_items(ticket_id);
CREATE INDEX idx_ticket_items_part   ON repair_ticket_items(part_id);


CREATE TABLE repair_ticket_events (
    id            serial       PRIMARY KEY,
    ticket_id     integer      NOT NULL REFERENCES repair_tickets(id) ON DELETE CASCADE,
    from_status   smallint     NULL,
    to_status     smallint     NULL,
    action        varchar(30)  NOT NULL,
    note          text         NULL,
    technician_id integer      NULL REFERENCES technicians(id) ON DELETE SET NULL,
    manager_id      integer      NULL,
    manager_name    varchar(100) NULL,
    is_public     boolean      NOT NULL DEFAULT false,
    created_at    timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON TABLE repair_ticket_events IS
  'the ticket''s history, append only. Every status change writes one, which is what lets
   turnaround be measured between two real events rather than guessed from the row''s
   current state - and what lets a customer be told where their device is.';
COMMENT ON COLUMN repair_ticket_events.is_public IS
  'shown to the customer on the website''s tracking page. An internal note about a
   technician''s mistake is a note; "waiting for a screen from the warehouse" is an update.';

CREATE INDEX idx_ticket_events ON repair_ticket_events(ticket_id, created_at);


-- ---------------------------------------------------------------------
-- 8.6 settlement
--
-- An in-warranty repair is free to the customer and not free to anybody else.
-- The centre did the work and consumed the part; Crystal owes it that money.
-- A claim is one month's worth of those, batched, because paying them one
-- ticket at a time is a full time job for two people.
-- ---------------------------------------------------------------------

CREATE TABLE warranty_claims (
    id            serial        PRIMARY KEY,
    claim_no      varchar(40)   NOT NULL UNIQUE,
    agency_id     integer       NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,
    period_month  date          NOT NULL,
    status        smallint      NOT NULL DEFAULT 0 CHECK (status IN (0,1,2,3,4,9)),
    ticket_count  integer       NOT NULL DEFAULT 0 CHECK (ticket_count >= 0),
    parts_amount  numeric(14,2) NOT NULL DEFAULT 0,
    labour_amount numeric(14,2) NOT NULL DEFAULT 0,
    total_amount  numeric(14,2) NOT NULL DEFAULT 0,
    approved_amount numeric(14,2) NULL,
    currency      varchar(8)    NOT NULL DEFAULT 'USD',
    submitted_at  timestamptz   NULL,
    reviewed_at   timestamptz   NULL,
    reviewed_by   integer       NULL REFERENCES managers(id) ON DELETE SET NULL,
    paid_at       timestamptz   NULL,
    reject_reason varchar(255)  NULL,
    remark        text          NULL,
    is_deleted    boolean       NOT NULL DEFAULT false,
    created_at    timestamptz   NOT NULL DEFAULT now(),
    updated_at    timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT uq_claim_agency_month UNIQUE (agency_id, period_month),
    CONSTRAINT chk_claim_rejected_has_reason
        CHECK (status <> 3 OR reject_reason IS NOT NULL)
);
COMMENT ON COLUMN warranty_claims.period_month IS
  'the first of the month being claimed for. A date rather than a string so it sorts and
   ranges properly, and UNIQUE with the centre so one month cannot be claimed twice.';
COMMENT ON COLUMN warranty_claims.status IS '0 draft, 1 submitted, 2 approved, 3 rejected, 4 paid, 9 cancelled';
COMMENT ON COLUMN warranty_claims.approved_amount IS
  'what head office agreed to, which is not always what was asked for. NULL until reviewed;
   the difference between this and total_amount is the conversation.';
COMMENT ON CONSTRAINT chk_claim_rejected_has_reason ON warranty_claims IS
  'a rejection with no reason is an argument waiting to happen';

CREATE INDEX idx_claims_agency ON warranty_claims(agency_id, period_month DESC);
CREATE INDEX idx_claims_status ON warranty_claims(status);

CREATE TRIGGER trg_warranty_claims_updated
    BEFORE UPDATE ON warranty_claims
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- Deferred from 8.5: a covered ticket rides on one claim batch.
ALTER TABLE repair_tickets
    ADD CONSTRAINT fk_tickets_claim FOREIGN KEY (claim_id) REFERENCES warranty_claims(id) ON DELETE SET NULL;


-- ---------------------------------------------------------------------
-- 8.7 the one rule the database enforces itself
--
-- Everything else about a repair is a decision, and decisions belong in the
-- service layer where they can be explained.  This one is not a decision: a
-- ticket that says it was covered, and cannot name a warranty that was in
-- force on the day the device arrived, is a false statement about money.  It
-- would flow straight into a claim, and from there into an invoice to head
-- office, so it is refused here as well as above - a bulk import and a
-- correction run in psql do not go through the service layer.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_ticket_warranty() RETURNS trigger AS $$
DECLARE
    w RECORD;
BEGIN
    IF NEW.is_warranty IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    IF NEW.warranty_id IS NULL THEN
        RAISE EXCEPTION 'a covered repair must name the warranty covering it'
            USING ERRCODE = 'CR001';
    END IF;

    SELECT serial_number, start_date, end_date, status
      INTO w
      FROM warranties
     WHERE id = NEW.warranty_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'warranty % does not exist', NEW.warranty_id
            USING ERRCODE = 'CR002',
                  DETAIL  = json_build_object('id', NEW.warranty_id)::text;
    END IF;

    IF w.serial_number <> NEW.serial_number THEN
        RAISE EXCEPTION 'warranty % covers device %, not %',
              NEW.warranty_id, w.serial_number, NEW.serial_number
            USING ERRCODE = 'CR003',
                  DETAIL  = json_build_object(
                              'id', NEW.warranty_id,
                              'covers', w.serial_number,
                              'given', NEW.serial_number
                            )::text;
    END IF;

    IF w.status = 'VOID' THEN
        RAISE EXCEPTION 'warranty % has been voided', NEW.warranty_id
            USING ERRCODE = 'CR004',
                  DETAIL  = json_build_object('id', NEW.warranty_id)::text;
    END IF;

    -- Against the day the device arrived, not against today: a repair that
    -- ran past the expiry date was still taken in under cover.
    IF NEW.received_at::date < w.start_date OR NEW.received_at::date > w.end_date THEN
        RAISE EXCEPTION 'warranty % ran from % to % and the device arrived on %',
              NEW.warranty_id, w.start_date, w.end_date, NEW.received_at::date
            USING ERRCODE = 'CR005',
                  DETAIL  = json_build_object(
                              'id', NEW.warranty_id,
                              'from', w.start_date,
                              'to', w.end_date,
                              'arrived', NEW.received_at::date
                            )::text;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_repair_tickets_warranty
    BEFORE INSERT OR UPDATE OF is_warranty, warranty_id, serial_number, received_at
    ON repair_tickets
    FOR EACH ROW EXECUTE PROCEDURE check_ticket_warranty();


-- =====================================================================
-- 8.9 THE ABOUT PAGE - NOT HERE
--
-- The page has no table.  Its words are
-- crystal-web/src/pages/about/content.js and its pictures are files beside
-- them in crystal-web/src/assets/images/about/, listed by
-- crystal-web/src/pages/about/images.js - so the page draws itself out of
-- its own bundle and asks this database for nothing.
--
-- It got here in two steps: the copy left in delta 019 (as rows it could not
-- be reviewed, diffed or translated with the rest of the site's words), and
-- the photographs followed in delta 031, which dropped about_images, the
-- console screen that filled it and the storefront endpoint that served it.
-- =====================================================================

/*
 * THE ADVERTISING AT THE TOP OF TWO PAGES - the homepage and /smartphones.
 *
 * NOT media_assets, whose every row belongs to something: a product, a series,
 * a category. An advert belongs to nothing. It is a picture with its copy
 * burnt in and somewhere to go, and it is the same picture whichever phone is
 * in fashion - so it has a PLACEMENT instead of an owner.
 *
 * Each placement is its own console page, and the API pins a page to its
 * placement (crud.repository.js `fixed`), so the person running the homepage
 * cannot reach the smartphone run by leaving a filter off. See sql/deltas/026.
 */
CREATE TYPE advert_placement AS ENUM ('HOME', 'SMARTPHONE');

CREATE TABLE site_adverts (
    id           serial           PRIMARY KEY,
    placement    advert_placement NOT NULL,

    /* A banner cropped for a desktop is a strip on a phone, so each has its own. */
    device_type  device_target    NOT NULL DEFAULT 'all',

    file_path    varchar(255)     NOT NULL,
    alt_text     varchar(255)     NULL,
    /* A path on the site ('/smartphones/c9') or a full URL; empty is not a link. */
    link_url     varchar(255)     NULL,

    sort_order   integer          NOT NULL DEFAULT 0,
    status       record_status    NOT NULL DEFAULT 'ACTIVE',
    is_deleted   boolean          NOT NULL DEFAULT false,
    created_at   timestamptz      NOT NULL DEFAULT now(),
    updated_at   timestamptz      NOT NULL DEFAULT now()
);
COMMENT ON TABLE site_adverts IS
  'the advertising runs at the top of the homepage and the smartphone page;
   an advert has a placement, not an owner';

CREATE INDEX idx_site_adverts_placement ON site_adverts(placement, device_type, sort_order);

CREATE TRIGGER trg_site_adverts_updated
    BEFORE UPDATE ON site_adverts
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


/*
 * SIGNATURES FOR WHAT THE STOREFRONT VERIFIES - notices, FAQs and uploaded
 * images. See docs/content-signing.md and sql/deltas/029.
 *
 * One table for all three, keyed by the item: an image is a file with no row
 * of its own - a signature column could only ever cover the notices and the
 * FAQs.
 *
 * ONE CURRENT SIGNATURE PER ITEM. Re-signing replaces the row; an old
 * signature kept for history is a signature for content that no longer
 * exists. History is the audit log's job.
 *
 * content_type is varchar with a CHECK rather than an enum type, against this
 * file's convention, because the list moves with the SIGNING schema - versioned
 * in crystal-backend and crystal-web together - rather than with this database.
 */
CREATE TABLE content_signatures (
    id              serial       PRIMARY KEY,
    content_type    varchar(40)  NOT NULL
                    CONSTRAINT chk_content_signatures_type
                    CHECK (content_type IN ('notification', 'faq', 'image')),
    /* the row id as text, or an image's storage key ('/uploads/adverts/x.svg') */
    content_ref     varchar(255) NOT NULL,
    schema_version  smallint     NOT NULL CHECK (schema_version > 0),
    algorithm       varchar(40)  NOT NULL,
    key_id          varchar(64)  NOT NULL,
    encoding        varchar(20)  NOT NULL,
    signature       text         NOT NULL,
    payload_sha256  char(64)     NOT NULL,
    signed_at       timestamptz  NOT NULL DEFAULT now(),
    /* the last audit's verdict on THIS signature - see the views below and delta 030 */
    audit_status    text         NULL,
    audit_reason    text         NULL,
    audited_at      timestamptz  NULL,
    CONSTRAINT uq_content_signatures_item UNIQUE (content_type, content_ref)
);
COMMENT ON COLUMN content_signatures.signature IS
  'standard base64: 64 bytes (IEEE P1363 r||s) for ECDSA-P256-SHA256, the modulus length for RSA-PSS-SHA256';
COMMENT ON COLUMN content_signatures.payload_sha256 IS
  'SHA-256 of the exact canonical bytes signed - lets an audit tell "the content changed" from
   "the signature was replaced" without the key. Nothing verifies against it.';
COMMENT ON COLUMN content_signatures.audit_status IS
  'what the last audit found: valid, valid (old key), INVALID, MISSING, revoked key, unknown key, orphaned';
COMMENT ON COLUMN content_signatures.audit_reason IS
  'why, when it was not valid - the verifier''s reason (signature-invalid, content-fails-schema ...)';
COMMENT ON COLUMN content_signatures.audited_at IS
  'when the audit read the item; a verdict older than signed_at is about a signature that has since been replaced';

CREATE INDEX idx_content_signatures_key ON content_signatures(key_id);


/*
 * EACH SIGNED THING BESIDE ITS SIGNATURE, for anybody reading the database.
 *
 * A view cannot verify a signature - that takes the canonical payload, the
 * file's bytes and ECDSA or RSA-PSS - so `npm run sign:audit` and the nightly
 * sweep write their verdict onto the signature row, and signature_state reads:
 *
 *   'unsigned'                   no signature row;
 *   the audit's verdict          when the audit is newer than the signature
 *                                (and, for notices and FAQs, than the row);
 *   'changed after signing'      a notice or FAQ updated after it was signed -
 *                                its updated_at is inside the signed payload,
 *                                so the timestamp alone proves the mismatch;
 *   'signed - not yet audited'   everything else.
 *
 * An image view never says 'changed after signing': the signature covers the
 * file, not the advert or product row that shows it, and a file changed on
 * disk leaves no trace here. The reasoning is in sql/deltas/030.
 */
CREATE VIEW v_notice_signatures AS
SELECT
    n.id,
    n.title,
    n.status,
    n.is_deleted,
    n.updated_at,
    s.key_id,
    s.algorithm,
    s.signed_at,
    s.payload_sha256,
    left(s.signature, 24) || '...'           AS signature_short,
    s.audit_status,
    s.audit_reason,
    s.audited_at,
    CASE
        WHEN s.id IS NULL                   THEN 'unsigned'
        WHEN s.audited_at >= s.signed_at
         AND s.audited_at >= n.updated_at   THEN s.audit_status
        WHEN n.updated_at >  s.signed_at    THEN 'changed after signing'
        ELSE 'signed - not yet audited'
    END AS signature_state
FROM site_notices n
LEFT JOIN content_signatures s
       ON s.content_type = 'notification'
      AND s.content_ref  = n.id::text;

COMMENT ON VIEW v_notice_signatures IS
  'Each notice beside its signature. A view cannot verify a signature, so signature_state is the
   verdict the audit recorded (npm run sign:audit, or the nightly sweep) when it is newer than the
   signature and the row - otherwise only what the timestamps can say.';

CREATE VIEW v_faq_signatures AS
SELECT
    f.id,
    f.question,
    f.category,
    f.status,
    f.is_deleted,
    f.updated_at,
    s.key_id,
    s.algorithm,
    s.signed_at,
    s.payload_sha256,
    left(s.signature, 24) || '...'           AS signature_short,
    s.audit_status,
    s.audit_reason,
    s.audited_at,
    CASE
        WHEN s.id IS NULL                   THEN 'unsigned'
        WHEN s.audited_at >= s.signed_at
         AND s.audited_at >= f.updated_at   THEN s.audit_status
        WHEN f.updated_at >  s.signed_at    THEN 'changed after signing'
        ELSE 'signed - not yet audited'
    END AS signature_state
FROM faqs f
LEFT JOIN content_signatures s
       ON s.content_type = 'faq'
      AND s.content_ref  = f.id::text;

COMMENT ON VIEW v_faq_signatures IS
  'Each FAQ beside its signature. A view cannot verify a signature, so signature_state is the
   verdict the audit recorded (npm run sign:audit, or the nightly sweep) when it is newer than the
   signature and the row - otherwise only what the timestamps can say.';

CREATE VIEW v_advert_signatures AS
SELECT
    a.id,
    a.placement,
    a.device_type,
    a.file_path,
    a.alt_text,
    a.status,
    a.is_deleted,
    a.updated_at,
    s.key_id,
    s.algorithm,
    s.signed_at,
    s.payload_sha256,
    left(s.signature, 24) || '...'           AS signature_short,
    s.audit_status,
    s.audit_reason,
    s.audited_at,
    CASE
        WHEN s.id IS NULL                   THEN 'unsigned'
        WHEN s.audited_at >= s.signed_at    THEN s.audit_status
        ELSE 'signed - not yet audited'
    END AS signature_state
FROM site_adverts a
LEFT JOIN content_signatures s
       ON s.content_type = 'image'
      AND s.content_ref  = a.file_path;

COMMENT ON VIEW v_advert_signatures IS
  'Each advert beside the signature of the image file it shows. A view can neither hash a file nor
   verify a signature, so signature_state is the verdict the audit last recorded (npm run sign:audit,
   or the nightly sweep); a file changed on disk since then shows only after the next audit.';

CREATE VIEW v_product_image_signatures AS
SELECT
    i.id,
    i.product_id,
    p.name                                   AS product_name,
    i.kind,
    i.device_type,
    i.file_path,
    i.is_deleted,
    i.updated_at,
    s.key_id,
    s.algorithm,
    s.signed_at,
    s.payload_sha256,
    left(s.signature, 24) || '...'           AS signature_short,
    s.audit_status,
    s.audit_reason,
    s.audited_at,
    CASE
        WHEN s.id IS NULL                   THEN 'unsigned'
        WHEN s.audited_at >= s.signed_at    THEN s.audit_status
        ELSE 'signed - not yet audited'
    END AS signature_state
FROM product_images i
JOIN products p ON p.id = i.product_id
LEFT JOIN content_signatures s
       ON s.content_type = 'image'
      AND s.content_ref  = i.file_path;

COMMENT ON VIEW v_product_image_signatures IS
  'Each product image beside the signature of its file. A view can neither hash a file nor verify
   a signature, so signature_state is the verdict the audit last recorded (npm run sign:audit, or
   the nightly sweep); a file changed on disk since then shows only after the next audit.';

CREATE VIEW v_image_signatures AS
SELECT
    m.id,
    m.owner_type,
    m.owner_id,
    m.purpose,
    m.device_type,
    m.file_path,
    m.alt_text,
    m.created_at,
    s.key_id,
    s.algorithm,
    s.signed_at,
    s.payload_sha256,
    left(s.signature, 24) || '...'           AS signature_short,
    s.audit_status,
    s.audit_reason,
    s.audited_at,
    CASE
        WHEN s.id IS NULL                   THEN 'unsigned'
        WHEN s.audited_at >= s.signed_at    THEN s.audit_status
        ELSE 'signed - not yet audited'
    END AS signature_state
FROM media_assets m
LEFT JOIN content_signatures s
       ON s.content_type = 'image'
      AND s.content_ref  = m.file_path;

COMMENT ON VIEW v_image_signatures IS
  'Each media library image (media_assets) beside the signature of its file. A view can neither hash
   a file nor verify a signature, so signature_state is the verdict the audit last recorded (npm run
   sign:audit, or the nightly sweep); a file changed on disk since then shows only after the next audit.';



-- =====================================================================
-- 9. THE SCOREBOARD
--
-- Four views.  They exist because the questions below are asked on every
-- console page load, are the same question every time, and are each a join
-- and an aggregate that nobody should be re-typing into a repository.
--
-- Putting them here rather than in JavaScript also means the numbers on the
-- dashboard, the numbers in an export and the numbers somebody checks by hand
-- in psql are the same numbers, computed once.
-- =====================================================================

-- 9.1 what is on the shelf, and what is about to not be
CREATE VIEW v_part_balance AS
SELECT
    s.id,
    s.agency_id,
    a.name  AS agency_name,
    a.code  AS agency_code,
    s.part_id,
    p.part_no,
    p.name  AS part_name,
    p.component,
    p.lead_days,
    p.unit_cost,
    s.bin,
    s.on_hand,
    s.reserved,
    s.on_hand - s.reserved                              AS available,
    s.reorder_level,
    GREATEST(s.reorder_level - (s.on_hand - s.reserved), 0) AS shortfall,
    ROUND(s.on_hand * p.unit_cost, 2)                   AS stock_value,
    CASE
        WHEN s.on_hand - s.reserved <= 0              THEN 'OUT'
        WHEN s.on_hand - s.reserved <= s.reorder_level THEN 'LOW'
        ELSE 'OK'
    END AS stock_state
FROM part_stock s
JOIN agencies a ON a.id = s.agency_id
JOIN parts    p ON p.id = s.part_id
WHERE a.is_deleted = false
  AND p.is_deleted = false;

COMMENT ON VIEW v_part_balance IS
  'available, not on_hand, is what decides whether a part can be promised: stock reserved
   against an open ticket is spoken for. Both are shown, because "we have four and can use
   none of them" is a different problem from "we have none".';


-- 9.2 the month, per centre
CREATE VIEW v_repair_monthly_stats AS
SELECT
    date_trunc('month', t.received_at)::date AS period_month,
    t.agency_id,
    a.name AS agency_name,
    COUNT(*)                                                        AS ticket_cnt,
    COUNT(*) FILTER (WHERE t.status = 7)                            AS closed_cnt,
    COUNT(*) FILTER (WHERE t.status < 7)                            AS open_cnt,
    COUNT(*) FILTER (WHERE t.is_warranty)                           AS warranty_cnt,
    COUNT(*) FILTER (WHERE t.reopened_from IS NOT NULL)             AS repeat_cnt,
    COUNT(DISTINCT t.serial_number)                                 AS device_cnt,
    ROUND(COALESCE(SUM(t.total_amount), 0), 2)                      AS charged_amount,
    ROUND(COALESCE(SUM(t.covered_amount), 0), 2)                    AS covered_amount,
    ROUND(COALESCE(SUM(t.parts_amount), 0), 2)                      AS parts_amount,
    ROUND(COALESCE(SUM(t.labour_amount), 0), 2)                     AS labour_amount,
    ROUND(AVG(EXTRACT(EPOCH FROM (t.closed_at - t.received_at)) / 86400.0)
          FILTER (WHERE t.closed_at IS NOT NULL)::numeric, 2)       AS avg_turnaround_days,
    COUNT(*) FILTER (WHERE t.closed_at IS NOT NULL
                       AND t.promised_at IS NOT NULL
                       AND t.closed_at > t.promised_at)             AS breach_cnt,
    ROUND(AVG(t.rating) FILTER (WHERE t.rating IS NOT NULL), 2)     AS csat
FROM repair_tickets t
JOIN agencies a ON a.id = t.agency_id
WHERE t.is_deleted = false
  AND t.status <> 9
GROUP BY 1, 2, 3;

COMMENT ON VIEW v_repair_monthly_stats IS
  'cancelled tickets are excluded throughout: a repair that never happened is not a fast
   repair, and leaving them in flatters every turnaround figure on the page';


-- 9.3 which service centre needs attention, and why
--
-- The console can already list every centre.  What it could not do is say
-- which of the twenty-six to open first, and that is the only question the
-- person looking at the list actually has.
--
-- Five signals, each of which is a different way of being in trouble, scored
-- 0-100 where 100 is worst.  They are weighted rather than averaged because
-- they are not equally bad: a centre missing its promised dates is failing
-- customers today, a centre low on one part is failing them next week.
CREATE VIEW v_agency_health AS
WITH ticket_stats AS (
    SELECT
        t.agency_id,
        COUNT(*) FILTER (WHERE t.status < 7)                                     AS open_cnt,
        COUNT(*) FILTER (WHERE t.status < 7 AND t.promised_at < now())           AS overdue_cnt,
        COUNT(*) FILTER (WHERE t.status = 2)                                     AS waiting_parts_cnt,
        COUNT(*) FILTER (WHERE t.status = 6)                                     AS ready_cnt,
        MAX(EXTRACT(EPOCH FROM (now() - t.received_at)) / 86400.0)
            FILTER (WHERE t.status < 7)                                          AS oldest_open_days,
        COUNT(*) FILTER (WHERE t.received_at >= now() - interval '90 days')      AS tickets_90d,
        COUNT(*) FILTER (WHERE t.reopened_from IS NOT NULL
                           AND t.received_at >= now() - interval '90 days')      AS repeat_90d,
        COUNT(*) FILTER (WHERE t.closed_at >= now() - interval '90 days')        AS closed_90d,
        COUNT(*) FILTER (WHERE t.closed_at >= now() - interval '90 days'
                           AND t.promised_at IS NOT NULL
                           AND t.closed_at > t.promised_at)                      AS breach_90d,
        AVG(EXTRACT(EPOCH FROM (t.closed_at - t.received_at)) / 86400.0)
            FILTER (WHERE t.closed_at >= now() - interval '90 days')             AS avg_turnaround_days,
        AVG(t.rating) FILTER (WHERE t.rated_at >= now() - interval '90 days')    AS csat,
        COUNT(t.rating) FILTER (WHERE t.rated_at >= now() - interval '90 days')  AS rating_cnt,
        MAX(t.closed_at)                                                         AS last_closed_at,
        SUM(t.covered_amount) FILTER (WHERE t.received_at >= now() - interval '90 days') AS covered_90d,
        SUM(t.total_amount)   FILTER (WHERE t.received_at >= now() - interval '90 days') AS charged_90d
    FROM repair_tickets t
    WHERE t.is_deleted = false
      AND t.status <> 9
    GROUP BY t.agency_id
),
stock_stats AS (
    SELECT
        agency_id,
        COUNT(*) FILTER (WHERE stock_state = 'OUT') AS out_of_stock_cnt,
        COUNT(*) FILTER (WHERE stock_state = 'LOW') AS low_stock_cnt
    FROM v_part_balance
    GROUP BY agency_id
),
tech_stats AS (
    SELECT agency_id, COUNT(*) AS technician_cnt, SUM(daily_minutes) AS bench_minutes
    FROM technicians
    WHERE is_deleted = false AND status = 'ACTIVE'
    GROUP BY agency_id
),
metrics AS (
    SELECT
        a.id            AS agency_id,
        a.name          AS agency_name,
        a.code          AS agency_code,
        a.province,
        a.tier,
        a.sla_hours,
        a.daily_capacity,
        a.status,
        COALESCE(ts.open_cnt, 0)            AS open_cnt,
        COALESCE(ts.overdue_cnt, 0)         AS overdue_cnt,
        COALESCE(ts.waiting_parts_cnt, 0)   AS waiting_parts_cnt,
        COALESCE(ts.ready_cnt, 0)           AS ready_cnt,
        ROUND(COALESCE(ts.oldest_open_days, 0)::numeric, 1)      AS oldest_open_days,
        COALESCE(ts.tickets_90d, 0)         AS tickets_90d,
        COALESCE(ts.closed_90d, 0)          AS closed_90d,
        COALESCE(ts.repeat_90d, 0)          AS repeat_90d,
        COALESCE(ts.breach_90d, 0)          AS breach_90d,
        ROUND(COALESCE(ts.avg_turnaround_days, 0)::numeric, 2)   AS avg_turnaround_days,
        ROUND(ts.csat, 2)                   AS csat,
        COALESCE(ts.rating_cnt, 0)          AS rating_cnt,
        ts.last_closed_at,
        ROUND(COALESCE(ts.covered_90d, 0), 2) AS covered_90d,
        ROUND(COALESCE(ts.charged_90d, 0), 2) AS charged_90d,
        COALESCE(ss.out_of_stock_cnt, 0)    AS out_of_stock_cnt,
        COALESCE(ss.low_stock_cnt, 0)       AS low_stock_cnt,
        COALESCE(tt.technician_cnt, 0)      AS technician_cnt,
        COALESCE(tt.bench_minutes, 0)       AS bench_minutes,
        -- The ratios the score is actually built from.  Each is guarded
        -- against its own empty denominator: a centre that has closed nothing
        -- has not breached anything, and must not read as 100% breached.
        CASE WHEN COALESCE(ts.open_cnt, 0) = 0 THEN 0
             ELSE ROUND(ts.overdue_cnt::numeric / ts.open_cnt, 4) END   AS overdue_ratio,
        CASE WHEN COALESCE(ts.closed_90d, 0) = 0 THEN 0
             ELSE ROUND(ts.breach_90d::numeric / ts.closed_90d, 4) END  AS sla_breach_ratio,
        CASE WHEN COALESCE(ts.tickets_90d, 0) = 0 THEN 0
             ELSE ROUND(ts.repeat_90d::numeric / ts.tickets_90d, 4) END AS repeat_ratio,
        CASE WHEN a.daily_capacity = 0 THEN 0
             ELSE ROUND(COALESCE(ts.open_cnt, 0)::numeric / a.daily_capacity, 2) END AS load_ratio,
        CASE WHEN ts.last_closed_at IS NULL THEN NULL
             ELSE ROUND(EXTRACT(EPOCH FROM (now() - ts.last_closed_at))::numeric / 86400.0, 1) END
                                                                        AS days_since_last_close
    FROM agencies a
    LEFT JOIN ticket_stats ts ON ts.agency_id = a.id
    LEFT JOIN stock_stats  ss ON ss.agency_id = a.id
    LEFT JOIN tech_stats   tt ON tt.agency_id = a.id
    WHERE a.is_deleted = false
),
scored AS (
    SELECT
        m.*,
        LEAST(100, ROUND(
              m.overdue_ratio    * 30      -- promises being missed right now
            + m.sla_breach_ratio * 25      -- promises missed over the quarter
            + m.repeat_ratio     * 20      -- repairs that did not repair anything
            -- Satisfaction only counts once enough people have answered.  Three
            -- ratings is not a verdict, and letting it behave like one would
            -- punish a quiet centre for one bad week.
            + CASE WHEN m.rating_cnt >= 5 AND m.csat IS NOT NULL
                   THEN GREATEST(0, (5 - m.csat) / 4) * 15
                   ELSE 0 END
            -- Empty shelves, capped: at some point more missing parts do not
            -- make a centre more broken, they make it the same kind of broken.
            + LEAST(10, m.out_of_stock_cnt * 3 + m.low_stock_cnt)
        ))::int AS risk_score
    FROM metrics m
)
SELECT
    s.*,
    CASE WHEN s.risk_score >= 60 THEN 'HIGH'
         WHEN s.risk_score >= 35 THEN 'MEDIUM'
         ELSE 'LOW' END AS risk_level,
    -- Not the same question as the score.  The score says how badly this
    -- centre is running; this says what is actually wrong with it, which is
    -- what decides who gets called - the parts desk or the regional manager.
    CASE
        WHEN s.status <> 'ACTIVE'                        THEN 'CLOSED'
        WHEN s.technician_cnt = 0                        THEN 'UNSTAFFED'
        WHEN s.open_cnt = 0                              THEN 'CLEAR'
        WHEN s.overdue_ratio >= 0.4                      THEN 'OVERDUE'
        WHEN s.waiting_parts_cnt >= GREATEST(1, s.open_cnt / 3) THEN 'PARTS_BOUND'
        WHEN s.load_ratio >= 3                           THEN 'OVER_CAPACITY'
        WHEN s.repeat_ratio >= 0.15                      THEN 'QUALITY'
        ELSE 'NORMAL'
    END AS health_status
FROM scored s;

COMMENT ON VIEW v_agency_health IS
  'One row per service centre, worst first when sorted by risk_score. The five signals are
   weighted rather than averaged because they are not equally urgent, and each ratio is
   guarded against its own empty denominator - a centre that has closed nothing this quarter
   has not breached anything, and must not read as having breached everything.';


-- 9.4 the defect watch
--
-- A product fault does not announce itself.  It arrives as one more repair
-- than last quarter, at nine different centres, none of which can see the
-- other eight.  This is the view that lets somebody see all nine at once.
--
-- Counted per product AND symptom, because "the C9 has 400 repairs" is not a
-- finding - "the C9 has 40 repairs for the same symptom, up 180% on last
-- quarter" is.
CREATE VIEW v_defect_watch AS
WITH installed_base AS (
    SELECT product_id, COUNT(*) AS registered_cnt
    FROM registered_products
    WHERE product_id IS NOT NULL
    GROUP BY product_id
),
windowed AS (
    SELECT
        t.product_id,
        t.symptom_id,
        COUNT(*) FILTER (WHERE t.received_at >= now() - interval '90 days')  AS cnt_90d,
        COUNT(*) FILTER (WHERE t.received_at >= now() - interval '180 days'
                           AND t.received_at <  now() - interval '90 days')  AS cnt_prev_90d,
        COUNT(DISTINCT t.serial_number)
            FILTER (WHERE t.received_at >= now() - interval '90 days')       AS device_cnt_90d,
        COUNT(*) FILTER (WHERE t.reopened_from IS NOT NULL
                           AND t.received_at >= now() - interval '90 days')  AS repeat_90d,
        COUNT(DISTINCT t.agency_id)
            FILTER (WHERE t.received_at >= now() - interval '90 days')       AS agency_cnt_90d,
        SUM(t.covered_amount) FILTER (WHERE t.received_at >= now() - interval '90 days') AS covered_90d,
        MAX(t.received_at)                                                   AS last_seen_at
    FROM repair_tickets t
    WHERE t.is_deleted = false
      AND t.status <> 9
      AND t.product_id IS NOT NULL
      AND t.symptom_id IS NOT NULL
    GROUP BY t.product_id, t.symptom_id
),
shaped AS (
    SELECT
        w.product_id,
        p.name      AS product_name,
        p.slug      AS product_slug,
        p.model_code,
        c.id        AS category_id,
        c.name      AS category_name,
        w.symptom_id,
        sy.code     AS symptom_code,
        sy.name     AS symptom_name,
        sy.component,
        sy.severity,
        w.cnt_90d,
        w.cnt_prev_90d,
        w.device_cnt_90d,
        w.repeat_90d,
        w.agency_cnt_90d,
        ROUND(COALESCE(w.covered_90d, 0), 2) AS covered_90d,
        w.last_seen_at,
        COALESCE(ib.registered_cnt, 0)       AS registered_cnt,
        -- A percentage against nothing is not a percentage.  A symptom seen
        -- for the first time this quarter has no trend, and reporting it as
        -- +100% would put every new symptom at the top of the list forever.
        CASE WHEN COALESCE(w.cnt_prev_90d, 0) = 0 THEN NULL
             ELSE ROUND((w.cnt_90d - w.cnt_prev_90d)::numeric * 100 / w.cnt_prev_90d, 1) END
                                             AS trend_pct,
        -- Repairs per thousand devices actually out there.  Raw counts always
        -- name the best selling product as the worst built one.
        CASE WHEN COALESCE(ib.registered_cnt, 0) = 0 THEN NULL
             ELSE ROUND(w.cnt_90d::numeric * 1000 / ib.registered_cnt, 2) END
                                             AS rate_per_1k
    FROM windowed w
    JOIN products p            ON p.id  = w.product_id
    JOIN product_categories c  ON c.id  = p.category_id
    JOIN symptom_catalog sy    ON sy.id = w.symptom_id
    LEFT JOIN installed_base ib ON ib.product_id = w.product_id
    WHERE w.cnt_90d > 0
)
SELECT
    s.*,
    CASE
        -- A safety symptom does not wait for a trend to develop.
        WHEN s.severity = 3 AND s.cnt_90d >= 2                              THEN 'ALERT'
        WHEN s.cnt_90d >= 10 AND COALESCE(s.trend_pct, 0) >= 50             THEN 'ALERT'
        -- Spread matters as much as volume: the same fault at six centres is
        -- a product problem, twenty at one centre is a centre problem.
        WHEN s.cnt_90d >= 6 AND s.agency_cnt_90d >= 4                       THEN 'ALERT'
        WHEN s.cnt_90d >= 5 OR COALESCE(s.trend_pct, 0) >= 25               THEN 'WATCH'
        ELSE 'NORMAL'
    END AS watch_level
FROM shaped s;

COMMENT ON VIEW v_defect_watch IS
  'Product x symptom over the last 90 days, against the 90 before it. rate_per_1k is the
   column to sort by - a raw count always names the best selling product as the worst
   built one. watch_level folds severity, volume, trend and how many centres are seeing
   it into the one question worth asking: does an engineer need to look at this.';



-- =====================================================================
-- 10. CRM
--
-- The Dream CRM, as designed in "Crystal CRM - Logic & DB Design (v2)".
-- Every table is prefixed crm_ and keeps the design's own names - party_pk
-- rather than id, varchar codes with a CHECK rather than enum types -
-- because the design is the contract the other projects (the vendor
-- platform, eproduct, Eshop, Appstore, Karaoke, B-media) will be mapped
-- against, and renaming it here would give it two vocabularies.
--
-- NOTHING ABOVE THIS LINE CHANGES. The CRM reads Crystal tables and points at
-- them with nullable, ON DELETE SET NULL keys (users, agencies, products,
-- registered_products, repair_tickets, symptom_catalog, provinces,
-- managers); no Crystal table gains a column or loses a row because of it.
-- The design's two optional changes to existing tables - repair_tickets.
-- crm_party_pk and manager_departments - are deliberately NOT applied:
-- crm_service_case.crystal_repair_ticket_id already links a ticket to its
-- case from the CRM side.
--
-- Deviations from the Dream design, all deliberate:
--   * crm_internal_user / crm_role / crm_permission / crm_user_role /
--     crm_role_permission -> the existing managers / manager_roles /
--     manager_pages / manager_permissions. Every *_user_id of the design is
--     *_manager_id here.
--   * crm_audit_event -> the existing audit_log.
--   * UNIQUE NULLS NOT DISTINCT (PostgreSQL 15) -> a unique index on
--     COALESCE(project_id, 0) (PostgreSQL 12). Same guarantee.
--   * crm_membership_point_event -> crm_point_event on crm_point_account, so
--     a currency that is not tied to one membership still has a ledger.
--   * crm_service_case.service_center_id -> crm_service_center.
--
-- The vocabularies at the end are the design's seed values; the console
-- edits them at /admin/crm/settings.
-- =====================================================================

CREATE TABLE crm_project (
    project_id                         int            GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    project_code                       varchar(30)    NOT NULL UNIQUE,
    project_name                       varchar(150)   NOT NULL,
    project_type_code                  varchar(30)    NULL,
    source_system_code                 varchar(40)    NULL,
    legal_entity_code                  varchar(50)    NULL,
    status                             varchar(20)    NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    identity_role                      varchar(30)    NULL CONSTRAINT crm_project_identity_role_check CHECK (identity_role IN ('ESHOP','USER_MANAGEMENT'))
);
COMMENT ON COLUMN crm_project.identity_role IS 'ESHOP or USER_MANAGEMENT: the project whose identifiers the Excel import carries in its E-shop and User columns. At most one project per role.';
CREATE UNIQUE INDEX uq_crm_project_identity_role ON crm_project(identity_role) WHERE identity_role IS NOT NULL;
COMMENT ON TABLE crm_project IS 'Registry of Dream projects. Each project is one operational source system and therefore the source boundary for external ids. Seeded with PLATFORM, CRYSTAL, EPRODUCT, ESHOP, APPSTORE, KARAOKE, BMEDIA.';

CREATE TABLE crm_currency (
    currency_code                      varchar(3)     PRIMARY KEY,
    currency_name                      varchar(80)    NULL,
    decimal_places                     smallint       NOT NULL DEFAULT 2,
    is_reporting                       boolean        NOT NULL DEFAULT false,
    is_active                          boolean        NOT NULL DEFAULT true
);
COMMENT ON TABLE crm_currency IS 'Currencies used by transactions, costs, rewards and reporting.';
CREATE UNIQUE INDEX uq_crm_currency_reporting ON crm_currency(is_reporting) WHERE is_reporting;

/*
 * THE VENDOR'S LOCATION LIST, copied as it is (ora_pid.locations).
 *
 * Same columns, same keys: location_pk is the vendor's own number, so a vendor
 * user's users.location_pk points at the same row here. The hierarchy runs on
 * codes, as the vendor's does - a row's parent_code is its parent's
 * location_code, and a province has parent_code NULL or '0'. Refreshed from the
 * vendor by the CRM import (Overview > Import, step "locations"); every
 * *_location_pk column in the CRM points at location_pk.
 */
CREATE TABLE crm_location (
    location_pk                        bigint         PRIMARY KEY,
    location_name                      varchar(100)   NOT NULL,
    location_code                      varchar(8)     NOT NULL UNIQUE,
    parent_code                        varchar(8)     NULL,
    position                           smallint       NOT NULL DEFAULT 0,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now()
);
COMMENT ON TABLE crm_location IS 'The vendor location list (ora_pid.locations), same columns and keys. Province = parent_code NULL or 0.';
COMMENT ON COLUMN crm_location.parent_code IS 'Parent location_code; NULL or 0 for a province.';
CREATE INDEX idx_crm_location_parent ON crm_location(parent_code, position);

/*
 * A new customer's public id: 12 characters from an alphabet without look-alikes
 * (no 0/O, 1/I/L), drawn from the random bytes of a UUID (bytes 6 and 8 carry
 * the UUID version and variant, so they are skipped). About 59 bits: not
 * guessable, short enough to read out on the phone.
 */
CREATE OR REPLACE FUNCTION crm_new_party_id() RETURNS varchar AS $$
DECLARE
    alphabet     constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    random_bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    byte_index   int;
    code         text := '';
BEGIN
    FOREACH byte_index IN ARRAY ARRAY[0, 1, 2, 3, 4, 5, 10, 11, 12, 13, 14, 15] LOOP
        code := code || substr(alphabet, get_byte(random_bytes, byte_index) % length(alphabet) + 1, 1);
    END LOOP;
    RETURN code;
END;
$$ LANGUAGE plpgsql VOLATILE;

CREATE TABLE crm_party (
    party_pk                           bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    party_id                           varchar(32)    NULL UNIQUE CHECK (party_id ~ '^[A-Za-z0-9_-]{1,32}$'),
    party_type                         varchar(20)    NOT NULL CHECK (party_type IN ('PERSON','ORGANIZATION')),
    party_status                       varchar(20)    NOT NULL DEFAULT 'ACTIVE' CHECK (party_status IN ('ACTIVE','INACTIVE','MERGED','DELETED')),
    display_name                       varchar(250)   NULL,
    origin_project_id                  int            NULL REFERENCES crm_project(project_id),
    merged_into_party_pk               bigint    NULL REFERENCES crm_party(party_pk),
    first_seen_at                      timestamptz    NULL,
    last_seen_at                       timestamptz    NULL,
    deleted_at                         timestamptz    NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT chk_crm_party_merged CHECK ((party_status = 'MERGED') = (merged_into_party_pk IS NOT NULL)),
    CONSTRAINT chk_crm_party_not_self CHECK (merged_into_party_pk IS NULL OR merged_into_party_pk <> party_pk)
);
COMMENT ON TABLE crm_party IS 'Central identity root. Every person and organization known to Dream gets one party_pk.';
COMMENT ON COLUMN crm_party.party_pk IS 'Phase 1 customer key used by CRM foreign keys, URLs and department records.';
COMMENT ON COLUMN crm_party.party_id IS 'Reserved public identifier for a later phase. Not generated or used in phase 1: customers are identified by party_pk.';
CREATE INDEX idx_crm_party_type_status ON crm_party(party_type, party_status);
CREATE INDEX idx_crm_party_origin ON crm_party(origin_project_id);
CREATE INDEX idx_crm_party_name ON crm_party(lower(display_name));

CREATE TABLE crm_job_title (
    job_title_id                       int            GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    job_code                           varchar(30)    NOT NULL UNIQUE,
    job_name                           varchar(100)   NOT NULL UNIQUE,
    sort_order                         smallint       NOT NULL DEFAULT 0,
    is_active                          boolean        NOT NULL DEFAULT true
);
COMMENT ON TABLE crm_job_title IS 'The job titles a person can be given. Seeded from the vendor JOBS list; edited at /admin/crm/settings.';

CREATE TABLE crm_person (
    party_pk                           bigint    PRIMARY KEY REFERENCES crm_party(party_pk) ON DELETE CASCADE,
    full_name                          varchar(250)   NULL,
    gender_code                        varchar(20)    NULL CHECK (gender_code IN ('M','F','OTHER','UNKNOWN')),
    birth_date                         date           NULL,
    birth_year                         smallint       NULL CHECK (birth_year BETWEEN 1900 AND 2100),
    job_title_id                       int            NULL REFERENCES crm_job_title(job_title_id),
    home_location_pk                   bigint         NULL REFERENCES crm_location(location_pk),
    address_line                       varchar(255)   NULL,
    is_checked_manually                boolean        NOT NULL DEFAULT false,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT chk_crm_person_birth CHECK (birth_date IS NULL OR birth_year IS NULL OR birth_year = EXTRACT(YEAR FROM birth_date))
);
COMMENT ON TABLE crm_person IS 'Person-only attributes for a PERSON party.';
COMMENT ON COLUMN crm_person.is_checked_manually IS 'true once a manager has reviewed this person by hand. Who and when is in audit_log.';
CREATE INDEX idx_crm_person_job ON crm_person(job_title_id) WHERE job_title_id IS NOT NULL;
CREATE INDEX idx_crm_person_unchecked ON crm_person(party_pk) WHERE NOT is_checked_manually;

CREATE TABLE crm_organization (
    party_pk                           bigint    PRIMARY KEY REFERENCES crm_party(party_pk) ON DELETE CASCADE,
    legal_name                         varchar(250)   NULL,
    trading_name                       varchar(250)   NULL,
    registration_number                varchar(100)   NULL,
    website_url                        text           NULL,
    founded_date                       date           NULL,
    organization_status                varchar(30)    NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now()
);
COMMENT ON TABLE crm_organization IS 'Organization-only attributes: agencies and service-centre operators, media providers, business customers, suppliers.';

CREATE TABLE crm_project_account (
    project_account_id                 bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk),
    project_id                         int            NOT NULL REFERENCES crm_project(project_id),
    external_account_id                varchar(250)   NOT NULL,
    external_login                     varchar(100)   NULL,
    external_account_type              varchar(50)    NULL,
    crystal_user_id                    integer        NULL REFERENCES users(id) ON DELETE SET NULL,
    account_status                     varchar(30)    NULL,
    is_primary                         boolean        NOT NULL DEFAULT false,
    link_method                        varchar(30)    NOT NULL CHECK (link_method IN ('PLATFORM','EXACT','MATCHED','REVIEWED','MANUAL','IMPORT')),
    link_confidence                    numeric(5,4)   NULL CHECK (link_confidence BETWEEN 0 AND 1),
    linked_at                          timestamptz    NOT NULL DEFAULT now(),
    unlinked_at                        timestamptz    NULL,
    source_created_at                  timestamptz    NULL,
    source_updated_at                  timestamptz    NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT chk_crm_account_period CHECK (unlinked_at IS NULL OR unlinked_at >= linked_at)
);
COMMENT ON TABLE crm_project_account IS 'Links a party to the account id a project issues. Main cross-project identity map.';
CREATE UNIQUE INDEX uq_crm_project_account ON crm_project_account(project_id, external_account_id) WHERE unlinked_at IS NULL;
CREATE INDEX idx_crm_project_account_party ON crm_project_account(party_pk, project_id);
CREATE INDEX idx_crm_project_account_user ON crm_project_account(crystal_user_id) WHERE crystal_user_id IS NOT NULL;

CREATE TABLE crm_identity_match_candidate (
    match_candidate_id                 bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    incoming_project_id                int            NOT NULL REFERENCES crm_project(project_id),
    incoming_external_record_id        varchar(250)   NOT NULL,
    incoming_party_pk                  bigint    NULL REFERENCES crm_party(party_pk),
    candidate_party_pk                 bigint    NOT NULL REFERENCES crm_party(party_pk),
    match_rule_code                    varchar(50)    NOT NULL,
    match_score                        numeric(5,0)   NULL CHECK (match_score BETWEEN 0 AND 110),
    match_status                       varchar(30)    NOT NULL DEFAULT 'PENDING' CHECK (match_status IN ('PENDING','ACCEPTED','REJECTED')),
    explanation_json                   jsonb          NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    reviewed_at                        timestamptz    NULL,
    reviewed_by_manager_id             integer        REFERENCES managers(id) ON DELETE SET NULL,
    CONSTRAINT uq_crm_match_pair UNIQUE (incoming_project_id, incoming_external_record_id, candidate_party_pk)
);
COMMENT ON TABLE crm_identity_match_candidate IS 'Uncertain matches waiting for review before an incoming record is linked to an existing party.';
CREATE INDEX idx_crm_match_pending ON crm_identity_match_candidate(created_at) WHERE match_status = 'PENDING';
CREATE INDEX idx_crm_match_candidate ON crm_identity_match_candidate(candidate_party_pk);

CREATE TABLE crm_party_merge_history (
    merge_id                           bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    surviving_party_pk                 bigint    NOT NULL REFERENCES crm_party(party_pk),
    merged_party_pk                    bigint    NOT NULL REFERENCES crm_party(party_pk),
    merge_reason                       varchar(250)   NULL,
    merge_method                       varchar(30)    NULL CHECK (merge_method IN ('MANUAL','EXACT_MATCH','REVIEWED_MATCH','PLATFORM')),
    match_score                        numeric(5,0)   NULL CHECK (match_score BETWEEN 0 AND 110),
    moved_rows                         jsonb          NOT NULL,
    platform_merge_log_pk              bigint         NULL UNIQUE,
    merged_by_manager_id               integer        REFERENCES managers(id) ON DELETE SET NULL,
    merged_at                          timestamptz    NOT NULL DEFAULT now(),
    merge_metadata                     jsonb          NULL,
    CONSTRAINT chk_crm_merge_not_self CHECK (surviving_party_pk <> merged_party_pk)
);
COMMENT ON TABLE crm_party_merge_history IS 'Audit of duplicate parties merged into a survivor.';
CREATE INDEX idx_crm_merge_parties ON crm_party_merge_history(surviving_party_pk, merged_party_pk);

CREATE TABLE crm_party_split_history (
    split_id                           bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    original_party_pk                  bigint    NOT NULL REFERENCES crm_party(party_pk),
    new_party_pk                       bigint    NOT NULL REFERENCES crm_party(party_pk),
    reversed_merge_id                  bigint         NULL REFERENCES crm_party_merge_history(merge_id),
    split_reason                       varchar(250)   NULL,
    split_by_manager_id                integer        REFERENCES managers(id) ON DELETE SET NULL,
    split_at                           timestamptz    NOT NULL DEFAULT now(),
    split_metadata                     jsonb          NULL,
    CONSTRAINT chk_crm_split_not_self CHECK (original_party_pk <> new_party_pk)
);
COMMENT ON TABLE crm_party_split_history IS 'Audit of a wrongly merged party being split again.';

CREATE TABLE crm_contact_point (
    contact_point_id                   bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk) ON DELETE CASCADE,
    contact_type                       varchar(30)    NOT NULL CHECK (contact_type IN ('EMAIL','MOBILE','PHONE','SIM_CID','WECHAT_ID','WHATSAPP','PUSH_TOKEN')),
    contact_value                      varchar(500)   NOT NULL,
    normalized_value                   varchar(500)   NOT NULL,
    label                              varchar(50)    NULL,
    is_verified                        boolean        NOT NULL DEFAULT false,
    is_primary                         boolean        NOT NULL DEFAULT false,
    status                             varchar(20)    NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INVALID','RETIRED')),
    source_project_id                  int            NULL REFERENCES crm_project(project_id),
    valid_from                         timestamptz    NULL,
    valid_to                           timestamptz    NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT uq_crm_contact UNIQUE (party_pk, contact_type, normalized_value),
    CONSTRAINT chk_crm_contact_period CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);
COMMENT ON TABLE crm_contact_point IS 'Reusable contact values of a party. Replaces comma-joined phone columns in the vendor CRM.';
CREATE INDEX idx_crm_contact_lookup ON crm_contact_point(contact_type, normalized_value) WHERE status = 'ACTIVE';
CREATE INDEX idx_crm_contact_party ON crm_contact_point(party_pk, contact_type, status);
CREATE UNIQUE INDEX uq_crm_contact_primary ON crm_contact_point(party_pk, contact_type) WHERE is_primary;

CREATE TABLE crm_communication_channel (
    channel_id                         smallint       GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    channel_code                       varchar(30)    NOT NULL UNIQUE,
    channel_name                       varchar(100)   NOT NULL,
    required_contact_type              varchar(30)    NULL,
    is_active                          boolean        NOT NULL DEFAULT true
);
COMMENT ON TABLE crm_communication_channel IS 'Communication channels. Seeded: EMAIL, SMS, PUSH, IN_APP, PHONE_CALL.';

CREATE TABLE crm_communication_purpose (
    purpose_id                         smallint       GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    purpose_code                       varchar(40)    NOT NULL UNIQUE,
    purpose_name                       varchar(120)   NOT NULL,
    requires_opt_in                    boolean        NOT NULL DEFAULT true,
    description                        text           NULL
);
COMMENT ON TABLE crm_communication_purpose IS 'Why Dream communicates. Seeded: TRANSACTIONAL, SERVICE_NOTICE, MARKETING, SURVEY, EVENT_NOTICE.';

CREATE TABLE crm_project_communication_option (
    project_communication_option_id    int            GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    project_id                         int            NOT NULL REFERENCES crm_project(project_id),
    purpose_id                         smallint       NOT NULL REFERENCES crm_communication_purpose(purpose_id),
    channel_id                         smallint       NOT NULL REFERENCES crm_communication_channel(channel_id),
    consent_required                   boolean        NOT NULL DEFAULT true,
    is_enabled                         boolean        NOT NULL DEFAULT true,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT uq_crm_comm_option UNIQUE (project_id, purpose_id, channel_id)
);
COMMENT ON TABLE crm_project_communication_option IS 'Which project x purpose x channel combinations exist and whether explicit consent is needed.';

CREATE TABLE crm_party_communication_consent (
    party_communication_consent_id     bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk) ON DELETE CASCADE,
    project_communication_option_id    int            NOT NULL REFERENCES crm_project_communication_option(project_communication_option_id),
    contact_point_id                   bigint         NULL REFERENCES crm_contact_point(contact_point_id) ON DELETE SET NULL,
    consent_status                     varchar(20)    NOT NULL CHECK (consent_status IN ('GRANTED','DENIED','WITHDRAWN','NOT_REQUIRED')),
    is_preferred                       boolean        NOT NULL DEFAULT false,
    frequency_code                     varchar(30)    NULL,
    captured_via                       varchar(40)    NULL,
    captured_at                        timestamptz    NOT NULL DEFAULT now(),
    effective_from                     timestamptz    NULL,
    effective_to                       timestamptz    NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT uq_crm_consent UNIQUE (party_pk, project_communication_option_id),
    CONSTRAINT chk_crm_consent_period CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);
COMMENT ON TABLE crm_party_communication_consent IS 'Current consent of one party for one project option, with the contact point to use.';
CREATE INDEX idx_crm_consent_option ON crm_party_communication_consent(project_communication_option_id, party_pk);

CREATE TABLE crm_consent_event (
    consent_event_id                   bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    party_communication_consent_id     bigint         NOT NULL REFERENCES crm_party_communication_consent(party_communication_consent_id) ON DELETE CASCADE,
    old_status                         varchar(20)    NULL,
    new_status                         varchar(20)    NOT NULL,
    changed_by_type                    varchar(30)    NOT NULL CHECK (changed_by_type IN ('PARTY','MANAGER','SYSTEM','IMPORT')),
    changed_by_manager_id              integer        REFERENCES managers(id) ON DELETE SET NULL,
    reason                             varchar(255)   NULL,
    occurred_at                        timestamptz    NOT NULL DEFAULT now(),
    evidence_json                      jsonb          NULL,
    CONSTRAINT chk_crm_consent_mgr_reason CHECK (changed_by_type <> 'MANAGER' OR reason IS NOT NULL)
);
COMMENT ON TABLE crm_consent_event IS 'Append-only history of consent changes.';
CREATE INDEX idx_crm_consent_event ON crm_consent_event(party_communication_consent_id, occurred_at);

CREATE TABLE crm_industry (
    industry_id                        int            GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    industry_code                      varchar(50)    NOT NULL UNIQUE,
    industry_name                      varchar(150)   NOT NULL,
    parent_industry_id                 int            NULL REFERENCES crm_industry(industry_id),
    is_active                          boolean        NOT NULL DEFAULT true
);
COMMENT ON TABLE crm_industry IS 'Hierarchical industry classification.';

CREATE TABLE crm_organization_industry (
    organization_party_pk              bigint    NOT NULL REFERENCES crm_organization(party_pk) ON DELETE CASCADE,
    industry_id                        int            NOT NULL REFERENCES crm_industry(industry_id),
    is_primary                         boolean        NOT NULL DEFAULT false,
    valid_from                         date           NULL,
    valid_to                           date           NULL,
    PRIMARY KEY (organization_party_pk, industry_id),
    CONSTRAINT chk_crm_org_industry_period CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);
COMMENT ON TABLE crm_organization_industry IS 'Industries of an organization.';

CREATE TABLE crm_organization_type (
    organization_type_id               int            GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    type_code                          varchar(50)    NOT NULL UNIQUE,
    type_name                          varchar(150)   NOT NULL
);
COMMENT ON TABLE crm_organization_type IS 'Organization relationship types. Seeded: SALES_AGENCY, SERVICE_CENTER_OPERATOR, COLLECTION_POINT_OPERATOR, MEDIA_PROVIDER, BUSINESS_CUSTOMER, SUPPLIER, LOGISTICS_PARTNER.';

CREATE TABLE crm_organization_type_assignment (
    organization_type_assignment_id    bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    organization_party_pk              bigint    NOT NULL REFERENCES crm_organization(party_pk) ON DELETE CASCADE,
    organization_type_id               int            NOT NULL REFERENCES crm_organization_type(organization_type_id),
    project_id                         int            NULL REFERENCES crm_project(project_id),
    status                             varchar(20)    NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ENDED')),
    assigned_at                        timestamptz    NOT NULL DEFAULT now(),
    ended_at                           timestamptz    NULL
);
COMMENT ON TABLE crm_organization_type_assignment IS 'Types an organization holds, Dream-wide (project NULL) or per project.';
CREATE UNIQUE INDEX uq_crm_org_type_assignment ON crm_organization_type_assignment(organization_party_pk, organization_type_id, COALESCE(project_id, 0));

CREATE TABLE crm_org_contact_role (
    contact_role_id                    int            GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    role_code                          varchar(50)    NOT NULL UNIQUE,
    role_name                          varchar(150)   NOT NULL
);
COMMENT ON TABLE crm_org_contact_role IS 'Roles a person holds for an organization. Seeded: OWNER, MANAGER, TECHNICIAN, SALES_STAFF, FINANCE_CONTACT, PROCUREMENT_CONTACT.';

CREATE TABLE crm_organization_person_relationship (
    org_person_relationship_id         bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    organization_party_pk              bigint    NOT NULL REFERENCES crm_organization(party_pk),
    person_party_pk                    bigint    NOT NULL REFERENCES crm_person(party_pk),
    project_id                         int            NULL REFERENCES crm_project(project_id),
    relationship_status                varchar(20)    NOT NULL DEFAULT 'ACTIVE' CHECK (relationship_status IN ('ACTIVE','ENDED')),
    valid_from                         date           NULL,
    valid_to                           date           NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now()
);
COMMENT ON TABLE crm_organization_person_relationship IS 'A person working for or representing an organization.';
CREATE INDEX idx_crm_org_person ON crm_organization_person_relationship(organization_party_pk, person_party_pk, project_id);
CREATE INDEX idx_crm_org_person_person ON crm_organization_person_relationship(person_party_pk);

CREATE TABLE crm_organization_person_role (
    org_person_role_id                 bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    org_person_relationship_id         bigint         NOT NULL REFERENCES crm_organization_person_relationship(org_person_relationship_id) ON DELETE CASCADE,
    contact_role_id                    int            NOT NULL REFERENCES crm_org_contact_role(contact_role_id),
    department_name                    varchar(100)   NULL,
    is_primary                         boolean        NOT NULL DEFAULT false,
    valid_from                         date           NULL,
    valid_to                           date           NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now()
);
COMMENT ON TABLE crm_organization_person_role IS 'Roles on an organization-person relationship.';
CREATE INDEX idx_crm_org_person_role_rel ON crm_organization_person_role(org_person_relationship_id);
CREATE INDEX idx_crm_org_person_role_role ON crm_organization_person_role(contact_role_id);

CREATE TABLE crm_service_center (
    service_center_id                  bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    service_center_code                varchar(40)    NOT NULL UNIQUE,
    service_center_name                varchar(200)   NOT NULL,
    service_center_kind                varchar(30)    NOT NULL CHECK (service_center_kind IN ('SERVICE_CENTER','SALES_AGENCY','COLLECTION_POINT','PARTNER_SHOP','OFFICE','EVENT_VENUE')),
    operator_party_pk                  bigint    NULL REFERENCES crm_organization(party_pk),
    location_pk                        bigint         NULL REFERENCES crm_location(location_pk),
    address_line                       varchar(255)   NULL,
    landmark                           varchar(255)   NULL,
    map_position                       varchar(64)    NULL,
    crystal_agency_id                  integer        NULL UNIQUE REFERENCES agencies(id) ON DELETE SET NULL,
    source_project_id                  int            NULL REFERENCES crm_project(project_id),
    source_service_center_key          varchar(64)    NULL,
    source_table_code                  varchar(40)    NULL,
    rating                             numeric(5,2)   NULL,
    status                             varchar(20)    NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED')),
    opened_on                          date           NULL,
    closed_on                          date           NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT chk_crm_site_dates CHECK (closed_on IS NULL OR opened_on IS NULL OR closed_on >= opened_on)
);
COMMENT ON TABLE crm_service_center IS 'A service centre, sales agency, collection point, partner shop, office or event venue - whoever runs it. Merged from Crystal agencies and the three vendor agency tables. location_pk is where it is on the map (crm_location).';
CREATE UNIQUE INDEX uq_crm_site_source ON crm_service_center(source_table_code, source_service_center_key) WHERE source_service_center_key IS NOT NULL;
CREATE INDEX idx_crm_site_operator ON crm_service_center(operator_party_pk);
CREATE INDEX idx_crm_site_location ON crm_service_center(location_pk, status);

CREATE TABLE crm_service_center_capability (
    capability_id                      bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    service_center_id                bigint         NOT NULL REFERENCES crm_service_center(service_center_id) ON DELETE CASCADE,
    project_id                         int            NULL REFERENCES crm_project(project_id),
    capability_code                    varchar(40)    NOT NULL,
    crystal_section                    varchar(20)    NULL,
    valid_from                         date           NULL,
    valid_to                           date           NULL,
    is_active                          boolean        NOT NULL DEFAULT true,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT chk_crm_capability_period CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);
COMMENT ON TABLE crm_service_center_capability IS 'What a site is allowed to do, per project, with validity dates. Mirrors agency_services and adds sales, software and event capabilities.';
CREATE UNIQUE INDEX uq_crm_capability ON crm_service_center_capability(service_center_id, COALESCE(project_id, 0), capability_code) WHERE is_active;
CREATE INDEX idx_crm_capability_code ON crm_service_center_capability(capability_code, service_center_id);

CREATE TABLE crm_service_center_activity_type (
    activity_type_id                   smallint       GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    activity_code                      varchar(40)    NOT NULL UNIQUE,
    activity_name                      varchar(120)   NOT NULL,
    activity_group                     varchar(30)    NOT NULL CHECK (activity_group IN ('SERVICE','SALES','SOFTWARE','EVENT','MARKETING','OPERATIONS')),
    required_capability_code           varchar(40)    NULL,
    counts_quantity                    boolean        NOT NULL DEFAULT true,
    counts_amount                      boolean        NOT NULL DEFAULT false,
    is_active                          boolean        NOT NULL DEFAULT true
);
COMMENT ON TABLE crm_service_center_activity_type IS 'Dictionary of activities that can happen at a site.';

CREATE TABLE crm_service_center_event (
    service_center_event_id                  bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    service_center_id                bigint         NOT NULL REFERENCES crm_service_center(service_center_id),
    event_type_code                    varchar(30)    NOT NULL CHECK (event_type_code IN ('PROMOTION_DAY','PRODUCT_LAUNCH','ROADSHOW','TRAINING','INSPECTION','EVENT_PICKUP_DAY','COMMUNITY_EVENT')),
    title                              varchar(200)   NOT NULL,
    description                        text           NULL,
    project_id                         int            NULL REFERENCES crm_project(project_id),
    event_id                bigint         NULL,
    campaign_id                        bigint         NULL,
    planned_start_at                   timestamptz    NOT NULL,
    planned_end_at                     timestamptz    NOT NULL,
    actual_start_at                    timestamptz    NULL,
    actual_end_at                      timestamptz    NULL,
    capacity                           integer        NULL CHECK (capacity >= 0),
    attendee_count                     integer        NULL CHECK (attendee_count >= 0),
    status                             varchar(20)    NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED')),
    owner_manager_id                   integer        REFERENCES managers(id) ON DELETE SET NULL,
    outcome_note                       text           NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT chk_crm_loc_event_plan CHECK (planned_end_at >= planned_start_at),
    CONSTRAINT chk_crm_loc_event_actual CHECK (actual_end_at IS NULL OR actual_start_at IS NULL OR actual_end_at >= actual_start_at)
);
COMMENT ON TABLE crm_service_center_event IS 'A planned on-site event: promotion day, launch, roadshow, training, inspection, pickup day for an event.';
CREATE INDEX idx_crm_loc_event_site ON crm_service_center_event(service_center_id, planned_start_at);
CREATE INDEX idx_crm_loc_event_open ON crm_service_center_event(planned_start_at) WHERE status IN ('PLANNED','CONFIRMED','IN_PROGRESS');

CREATE TABLE crm_service_center_activity (
    service_center_activity_id               bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    service_center_id                bigint         NOT NULL REFERENCES crm_service_center(service_center_id),
    activity_type_id                   smallint       NOT NULL REFERENCES crm_service_center_activity_type(activity_type_id),
    project_id                         int            NULL REFERENCES crm_project(project_id),
    service_center_event_id                  bigint         NULL REFERENCES crm_service_center_event(service_center_event_id),
    occurred_at                        timestamptz    NOT NULL,
    party_pk                           bigint    NULL REFERENCES crm_party(party_pk),
    performed_by_party_pk              bigint    NULL REFERENCES crm_person(party_pk),
    performed_by_manager_id            integer        REFERENCES managers(id) ON DELETE SET NULL,
    quantity                           numeric(12,3)  NOT NULL DEFAULT 1 CHECK (quantity >= 0),
    amount                             numeric(20,4)  NULL,
    currency_code                      varchar(3)     NULL REFERENCES crm_currency(currency_code),
    status                             varchar(20)    NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED','CANCELLED','REVERSED')),
    related_service_case_id            bigint         NULL,
    related_transaction_id             bigint         NULL,
    related_product_instance_id        bigint         NULL,
    related_reservation_id             bigint         NULL,
    related_award_id                   bigint         NULL,
    external_activity_id               varchar(250)   NULL,
    note                               varchar(500)   NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT chk_crm_loc_activity_currency CHECK (amount IS NULL OR currency_code IS NOT NULL)
);
COMMENT ON TABLE crm_service_center_activity IS 'One activity or service actually performed at a site: a repair taken in, a device sold, an app installed, a licence issued, a reservation picked up, a prize handed over, a visitor at an event. The fact table behind site dashboards and the "agency" reservation sources.';
CREATE UNIQUE INDEX uq_crm_loc_activity_ext ON crm_service_center_activity(project_id, activity_type_id, external_activity_id) WHERE external_activity_id IS NOT NULL;
CREATE INDEX idx_crm_loc_activity_site ON crm_service_center_activity(service_center_id, occurred_at DESC);
CREATE INDEX idx_crm_loc_activity_type ON crm_service_center_activity(activity_type_id, occurred_at DESC);
CREATE INDEX idx_crm_loc_activity_party ON crm_service_center_activity(party_pk, occurred_at DESC) WHERE party_pk IS NOT NULL;

CREATE TABLE crm_service_center_activity_target (
    service_center_activity_target_id        bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    service_center_id                bigint         NOT NULL REFERENCES crm_service_center(service_center_id) ON DELETE CASCADE,
    activity_type_id                   smallint       NOT NULL REFERENCES crm_service_center_activity_type(activity_type_id),
    period_start                       date           NOT NULL,
    period_end                         date           NOT NULL,
    target_quantity                    numeric(12,3)  NULL CHECK (target_quantity >= 0),
    target_amount                      numeric(20,4)  NULL CHECK (target_amount >= 0),
    currency_code                      varchar(3)     NULL REFERENCES crm_currency(currency_code),
    set_by_manager_id                  integer        REFERENCES managers(id) ON DELETE SET NULL,
    note                               varchar(255)   NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT uq_crm_loc_target UNIQUE (service_center_id, activity_type_id, period_start),
    CONSTRAINT chk_crm_loc_target_period CHECK (period_end >= period_start),
    CONSTRAINT chk_crm_loc_target_value CHECK (target_quantity IS NOT NULL OR target_amount IS NOT NULL)
);
COMMENT ON TABLE crm_service_center_activity_target IS 'Per-site targets for a period: e.g. 40 repair intakes and 25 device sales in October. Read against crm_service_center_activity by the view v_crm_service_center_activity_progress.';

CREATE TABLE crm_product_class (
    product_class_id                   int            GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    class_code                         varchar(40)    NOT NULL UNIQUE,
    class_name                         varchar(120)   NOT NULL,
    parent_product_class_id            int            NULL REFERENCES crm_product_class(product_class_id),
    product_domain                     varchar(20)    NOT NULL CHECK (product_domain IN ('SMARTPHONE','EPRODUCT','SOFTWARE','LICENCE','GOODS','SERVICE')),
    rank_no                            smallint       NULL,
    legacy_column                      varchar(40)    NULL,
    description                        text           NULL,
    is_active                          boolean        NOT NULL DEFAULT true
);
COMMENT ON TABLE crm_product_class IS 'One classification for every product line, replacing the vendor per-user counter columns (uclass_phone_values phone_9/7/5/3, uclass_eprod_values tv_3, tv_2, stb, pc ...). Hierarchical: SMARTPHONE > PHONE_9.';

CREATE TABLE crm_product_catalog (
    product_id                         bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    project_id                         int            NOT NULL REFERENCES crm_project(project_id),
    product_code                       varchar(100)   NOT NULL,
    product_name                       varchar(250)   NOT NULL,
    parent_product_id                  bigint         NULL REFERENCES crm_product_catalog(product_id),
    product_type                       varchar(50)    NULL,
    product_kind                       varchar(20)    NOT NULL DEFAULT 'DEVICE' CHECK (product_kind IN ('DEVICE','LICENCE','SOFTWARE','SUBSCRIPTION','GOODS','SERVICE')),
    product_class_id                   int            NULL REFERENCES crm_product_class(product_class_id),
    crystal_product_id                 integer        NULL REFERENCES products(id) ON DELETE SET NULL,
    model_code                         varchar(60)    NULL,
    imei_prefixes                      varchar(15)[]  NULL,
    list_price                         numeric(20,4)  NULL,
    currency_code                      varchar(3)     NULL REFERENCES crm_currency(currency_code),
    is_reservable                      boolean        NOT NULL DEFAULT false,
    status                             varchar(20)    NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','DISCONTINUED')),
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT uq_crm_product_code UNIQUE (project_id, product_code),
    CONSTRAINT uq_crm_product_project UNIQUE (product_id, project_id)
);
COMMENT ON TABLE crm_product_catalog IS 'Project-owned product definitions at the level CRM needs: device models, eproduct models, licence products, apps, prize goods.';
CREATE INDEX idx_crm_product_class ON crm_product_catalog(product_class_id);
CREATE INDEX idx_crm_product_crystal ON crm_product_catalog(crystal_product_id) WHERE crystal_product_id IS NOT NULL;
CREATE INDEX idx_crm_product_model ON crm_product_catalog(model_code) WHERE model_code IS NOT NULL;

CREATE TABLE crm_product_instance (
    product_instance_id                bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    product_id                         bigint         NOT NULL,
    project_id                         int            NOT NULL,
    external_product_instance_id       varchar(250)   NOT NULL,
    instance_kind                      varchar(20)    NOT NULL DEFAULT 'DEVICE' CHECK (instance_kind IN ('DEVICE','LICENCE','ENTITLEMENT')),
    serial_number                      varchar(100)   NULL,
    imei                               varchar(20)    NULL,
    license_key_hash                   varchar(64)    NULL,
    bound_instance_id                  bigint         NULL REFERENCES crm_product_instance(product_instance_id),
    provider_party_pk                  bigint    NULL REFERENCES crm_organization(party_pk),
    valid_until                        timestamptz    NULL,
    manufactured_at                    date           NULL,
    batch_code                         varchar(40)    NULL,
    activated_at                       timestamptz    NULL,
    status                             varchar(30)    NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','LOST','STOLEN','SCRAPPED','VOID','EXPIRED')),
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT fk_crm_instance_product FOREIGN KEY (product_id, project_id) REFERENCES crm_product_catalog(product_id, project_id),
    CONSTRAINT uq_crm_instance_ext UNIQUE (project_id, external_product_instance_id),
    CONSTRAINT chk_crm_instance_bound CHECK (bound_instance_id IS NULL OR bound_instance_id <> product_instance_id)
);
COMMENT ON TABLE crm_product_instance IS 'One concrete thing a party can hold: a phone (IMEI), an eproduct (serial), a licence (key hash, bound to a device), an app entitlement.';
CREATE INDEX idx_crm_instance_serial ON crm_product_instance(serial_number) WHERE serial_number IS NOT NULL;
CREATE INDEX idx_crm_instance_imei ON crm_product_instance(imei) WHERE imei IS NOT NULL;
CREATE INDEX idx_crm_instance_product ON crm_product_instance(product_id, project_id);
CREATE INDEX idx_crm_instance_bound ON crm_product_instance(bound_instance_id) WHERE bound_instance_id IS NOT NULL;

CREATE TABLE crm_product_relationship_type (
    relationship_type_id               smallint       GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    relationship_code                  varchar(30)    NOT NULL UNIQUE,
    relationship_name                  varchar(100)   NOT NULL,
    is_exclusive                       boolean        NOT NULL DEFAULT false,
    awards_registration_points         boolean        NOT NULL DEFAULT false,
    CONSTRAINT uq_crm_rel_type_pair UNIQUE (relationship_type_id, relationship_code)
);
COMMENT ON TABLE crm_product_relationship_type IS 'How a party relates to an instance. Seeded: OWNER, USER (assigned user), REGISTERED_USER, LESSEE, LICENSEE.';

CREATE TABLE crm_purchase_purpose (
    purchase_purpose_id                smallint       GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    purpose_code                       varchar(30)    NOT NULL UNIQUE,
    purpose_name                       varchar(100)   NOT NULL,
    is_active                          boolean        NOT NULL DEFAULT true
);
COMMENT ON TABLE crm_purchase_purpose IS 'Selectable purchase purpose. Seeded: PERSONAL_USE, BUSINESS_USE, GIFT, RESALE, REPLACEMENT.';

CREATE TABLE crm_product_usage_type (
    usage_type_id                      smallint       GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    usage_code                         varchar(30)    NOT NULL UNIQUE,
    usage_name                         varchar(100)   NOT NULL,
    is_active                          boolean        NOT NULL DEFAULT true
);
COMMENT ON TABLE crm_product_usage_type IS 'Selectable intended use. Seeded: HOME_USE, OFFICE_USE, SCHOOL, SHOP, DEMO, TESTING.';

CREATE TABLE crm_acquisition_type (
    acquisition_type_id                smallint       GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    acquisition_code                   varchar(30)    NOT NULL UNIQUE,
    acquisition_name                   varchar(100)   NOT NULL,
    is_active                          boolean        NOT NULL DEFAULT true
);
COMMENT ON TABLE crm_acquisition_type IS 'How the holder obtained it. Seeded: PURCHASED, GIFT, TRANSFER, SECOND_HAND, COMPANY_ASSIGNED, PRIZE, REPLACEMENT.';

CREATE TABLE crm_product_registration (
    product_registration_id            bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk),
    product_instance_id                bigint         NOT NULL REFERENCES crm_product_instance(product_instance_id),
    relationship_type_id               smallint       NOT NULL,
    relationship_code                  varchar(30)    NOT NULL,
    project_id                         int            NOT NULL REFERENCES crm_project(project_id),
    registration_channel               varchar(20)    NULL CHECK (registration_channel IN ('APP','WEB','AGENCY','CONSOLE','IMPORT','TRANSFER')),
    registered_at_service_center_id          bigint         NULL REFERENCES crm_service_center(service_center_id),
    purchase_purpose_id                smallint       NULL REFERENCES crm_purchase_purpose(purchase_purpose_id),
    usage_type_id                      smallint       NULL REFERENCES crm_product_usage_type(usage_type_id),
    acquisition_type_id                smallint       NULL REFERENCES crm_acquisition_type(acquisition_type_id),
    previous_owner_party_pk            bigint    NULL REFERENCES crm_party(party_pk),
    related_transaction_id             bigint         NULL,
    transfer_id                        bigint         NULL,
    purchase_date                      date           NULL,
    purchase_place                     varchar(255)   NULL,
    sim_cid                            varchar(12)    NULL,
    registration_status                varchar(20)    NOT NULL DEFAULT 'ACTIVE' CHECK (registration_status IN ('ACTIVE','ENDED','CANCELLED')),
    end_reason_code                    varchar(30)    NULL CHECK (end_reason_code IN ('TRANSFER','ASSIGNMENT_END','CANCELLED','LOST','SCRAPPED','RETURNED','EXPIRED','MERGE')),
    registered_at                      timestamptz    NOT NULL,
    valid_from                         timestamptz    NOT NULL,
    valid_to                           timestamptz    NULL,
    source_record_id                   varchar(250)   NULL,
    crystal_registered_product_id      integer        NULL REFERENCES registered_products(id) ON DELETE SET NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT fk_crm_reg_rel_type FOREIGN KEY (relationship_type_id, relationship_code) REFERENCES crm_product_relationship_type(relationship_type_id, relationship_code),
    CONSTRAINT chk_crm_reg_period CHECK (valid_to IS NULL OR valid_to >= valid_from),
    CONSTRAINT chk_crm_reg_prev CHECK (previous_owner_party_pk IS NULL OR previous_owner_party_pk <> party_pk),
    CONSTRAINT chk_crm_reg_ended CHECK ((valid_to IS NULL) = (registration_status = 'ACTIVE')),
    CONSTRAINT chk_crm_reg_end_reason CHECK (registration_status = 'ACTIVE' OR end_reason_code IS NOT NULL)
);
COMMENT ON TABLE crm_product_registration IS 'Time-bounded party <-> instance relationship: registration, ownership, assignment, licence. One table for phone, eproduct, licence and app registrations. valid_to NULL = current.';
CREATE UNIQUE INDEX uq_crm_reg_one_owner ON crm_product_registration(product_instance_id) WHERE relationship_code IN ('OWNER','LICENSEE') AND valid_to IS NULL;
CREATE UNIQUE INDEX uq_crm_reg_current ON crm_product_registration(product_instance_id, party_pk, relationship_type_id) WHERE valid_to IS NULL;
CREATE INDEX idx_crm_reg_party ON crm_product_registration(party_pk, valid_to);
CREATE INDEX idx_crm_reg_instance ON crm_product_registration(product_instance_id, valid_from);
CREATE UNIQUE INDEX uq_crm_reg_source ON crm_product_registration(project_id, source_record_id) WHERE source_record_id IS NOT NULL;

CREATE TABLE crm_product_transfer (
    product_transfer_id                bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    product_instance_id                bigint         NOT NULL REFERENCES crm_product_instance(product_instance_id),
    transfer_kind                      varchar(30)    NOT NULL CHECK (transfer_kind IN ('OWNERSHIP_TRANSFER','ASSIGN_USER','END_ASSIGNMENT','RETURN_TO_OWNER','LEASE_START','LEASE_END','LICENCE_REBIND')),
    from_party_pk                      bigint    NULL REFERENCES crm_party(party_pk),
    to_party_pk                        bigint    NULL REFERENCES crm_party(party_pk),
    to_instance_id                     bigint         NULL REFERENCES crm_product_instance(product_instance_id),
    acquisition_type_id                smallint       NULL REFERENCES crm_acquisition_type(acquisition_type_id),
    requested_by_type                  varchar(20)    NOT NULL CHECK (requested_by_type IN ('PARTY','MANAGER','LOCATION','SYSTEM')),
    requested_by_party_pk              bigint    NULL REFERENCES crm_party(party_pk),
    requested_by_manager_id            integer        REFERENCES managers(id) ON DELETE SET NULL,
    handled_at_service_center_id             bigint         NULL REFERENCES crm_service_center(service_center_id),
    related_transaction_id             bigint         NULL,
    status                             varchar(20)    NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','ACCEPTED','REJECTED','CANCELLED','COMPLETED','EXPIRED')),
    reason                             varchar(500)   NULL,
    requested_at                       timestamptz    NOT NULL DEFAULT now(),
    expires_at                         timestamptz    NULL,
    responded_at                       timestamptz    NULL,
    completed_at                       timestamptz    NULL,
    closed_registration_id             bigint         NULL,
    created_registration_id            bigint         NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT chk_crm_transfer_parties CHECK (from_party_pk IS NULL OR to_party_pk IS NULL OR from_party_pk <> to_party_pk),
    CONSTRAINT chk_crm_transfer_completed CHECK (status <> 'COMPLETED' OR completed_at IS NOT NULL),
    CONSTRAINT chk_crm_transfer_target CHECK (transfer_kind IN ('END_ASSIGNMENT','LEASE_END','RETURN_TO_OWNER','LICENCE_REBIND') OR to_party_pk IS NOT NULL)
);
COMMENT ON TABLE crm_product_transfer IS 'Request and outcome of a product-specific action: ownership transfer, assigning a user, ending an assignment, returning to the owner, leasing. Completing it closes and opens crm_product_registration rows in one transaction.';
CREATE UNIQUE INDEX uq_crm_transfer_open ON crm_product_transfer(product_instance_id, transfer_kind) WHERE status IN ('REQUESTED','ACCEPTED');
CREATE INDEX idx_crm_transfer_to ON crm_product_transfer(to_party_pk, status);
CREATE INDEX idx_crm_transfer_from ON crm_product_transfer(from_party_pk, status);

CREATE TABLE crm_registration_question (
    question_id                        int            GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    project_id                         int            NULL REFERENCES crm_project(project_id),
    product_class_id                   int            NULL REFERENCES crm_product_class(product_class_id),
    question_code                      varchar(60)    NOT NULL,
    question_label                     varchar(255)   NOT NULL,
    answer_type                        varchar(20)    NOT NULL CHECK (answer_type IN ('SINGLE','MULTIPLE','TEXT','NUMBER','RATING')),
    is_required                        boolean        NOT NULL DEFAULT false,
    sort_order                         integer        NOT NULL DEFAULT 0,
    is_active                          boolean        NOT NULL DEFAULT true,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now()
);
COMMENT ON TABLE crm_registration_question IS 'Extra registration questions per product class or project, for answers that are not purpose/usage/acquisition (vendor spec keys: serious_views, purchase_motives, old_prod_name, outlook, led_type, has_tv_mount, is_kara_user ...).';
CREATE UNIQUE INDEX uq_crm_question_code ON crm_registration_question(COALESCE(project_id, 0), COALESCE(product_class_id, 0), question_code);

CREATE TABLE crm_registration_question_option (
    option_id                          int            GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    question_id                        int            NOT NULL REFERENCES crm_registration_question(question_id) ON DELETE CASCADE,
    option_label                       varchar(255)   NOT NULL,
    sort_order                         integer        NOT NULL DEFAULT 0,
    is_active                          boolean        NOT NULL DEFAULT true,
    CONSTRAINT uq_crm_question_option UNIQUE (question_id, option_id)
);
COMMENT ON TABLE crm_registration_question_option IS 'Selectable options of a question.';

CREATE TABLE crm_registration_answer (
    answer_id                          bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    product_registration_id            bigint         NOT NULL REFERENCES crm_product_registration(product_registration_id) ON DELETE CASCADE,
    question_id                        int            NOT NULL REFERENCES crm_registration_question(question_id),
    option_id                          int            NULL,
    text_value                         varchar(1000)  NULL,
    number_value                       numeric(14,3)  NULL,
    rating                             smallint       NULL CHECK (rating IN (-1, 1)),
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT fk_crm_answer_option FOREIGN KEY (question_id, option_id) REFERENCES crm_registration_question_option(question_id, option_id),
    CONSTRAINT chk_crm_answer_one CHECK (num_nonnulls(option_id, text_value, number_value) = 1),
    CONSTRAINT chk_crm_answer_rating CHECK (rating IS NULL OR option_id IS NOT NULL)
);
COMMENT ON TABLE crm_registration_answer IS 'Answers given with a registration.';
CREATE UNIQUE INDEX uq_crm_answer_option ON crm_registration_answer(product_registration_id, question_id, option_id) WHERE option_id IS NOT NULL;
CREATE INDEX idx_crm_answer_reg ON crm_registration_answer(product_registration_id);
CREATE INDEX idx_crm_answer_option ON crm_registration_answer(question_id, option_id);

CREATE TABLE crm_transaction (
    transaction_id                     bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    project_id                         int            NOT NULL REFERENCES crm_project(project_id),
    external_transaction_id            varchar(250)   NOT NULL,
    original_transaction_id            bigint         NULL REFERENCES crm_transaction(transaction_id),
    transaction_type_code              varchar(30)    NOT NULL CHECK (transaction_type_code IN ('SALE','LICENCE_PURCHASE','APP_PURCHASE','SERVICE_PAYMENT','RESERVATION_PAYMENT','REFUND','RETURN','REVERSAL')),
    transaction_status                 varchar(30)    NOT NULL,
    currency_code                      varchar(3)     NOT NULL REFERENCES crm_currency(currency_code),
    gross_amount                       numeric(20,4)  NULL,
    discount_amount                    numeric(20,4)  NULL,
    net_amount                         numeric(20,4)  NULL,
    reporting_currency_code            varchar(3)     NULL REFERENCES crm_currency(currency_code),
    reporting_net_amount               numeric(20,4)  NULL,
    points_used                        numeric(14,3)  NULL,
    sales_channel_code                 varchar(30)    NULL,
    service_center_id                bigint         NULL REFERENCES crm_service_center(service_center_id),
    transaction_at                     timestamptz    NOT NULL,
    source_created_at                  timestamptz    NULL,
    source_updated_at                  timestamptz    NULL,
    ingested_at                        timestamptz    NOT NULL DEFAULT now(),
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT uq_crm_transaction UNIQUE (project_id, external_transaction_id),
    CONSTRAINT chk_crm_txn_sign CHECK (net_amount IS NULL OR (transaction_type_code IN ('REFUND','RETURN','REVERSAL')) = (net_amount < 0) OR net_amount = 0),
    CONSTRAINT chk_crm_txn_original CHECK (transaction_type_code NOT IN ('REFUND','RETURN','REVERSAL') OR original_transaction_id IS NOT NULL)
);
COMMENT ON TABLE crm_transaction IS 'Transaction header. A refund/return/reversal is its own row pointing at the original.';
CREATE INDEX idx_crm_txn_project_time ON crm_transaction(project_id, transaction_at DESC);
CREATE INDEX idx_crm_txn_original ON crm_transaction(original_transaction_id) WHERE original_transaction_id IS NOT NULL;
CREATE INDEX idx_crm_txn_site ON crm_transaction(service_center_id, transaction_at DESC) WHERE service_center_id IS NOT NULL;

CREATE TABLE crm_transaction_party (
    transaction_party_id               bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    transaction_id                     bigint         NOT NULL REFERENCES crm_transaction(transaction_id) ON DELETE CASCADE,
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk),
    party_role_code                    varchar(30)    NOT NULL CHECK (party_role_code IN ('BUYER','PAYER','RECEIVER','SELLER','AGENT')),
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT uq_crm_txn_party UNIQUE (transaction_id, party_pk, party_role_code)
);
COMMENT ON TABLE crm_transaction_party IS 'Parties in a transaction and their role.';
CREATE INDEX idx_crm_txn_party ON crm_transaction_party(party_pk, transaction_id);

CREATE TABLE crm_transaction_item (
    transaction_item_id                bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    transaction_id                     bigint         NOT NULL REFERENCES crm_transaction(transaction_id) ON DELETE CASCADE,
    product_id                         bigint         NULL REFERENCES crm_product_catalog(product_id),
    product_instance_id                bigint         NULL REFERENCES crm_product_instance(product_instance_id),
    external_item_id                   varchar(250)   NULL,
    quantity                           numeric(18,4)  NOT NULL,
    unit_price                         numeric(20,4)  NULL,
    gross_amount                       numeric(20,4)  NULL,
    discount_amount                    numeric(20,4)  NULL,
    net_amount                         numeric(20,4)  NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now()
);
COMMENT ON TABLE crm_transaction_item IS 'Transaction lines.';
CREATE INDEX idx_crm_txn_item_txn ON crm_transaction_item(transaction_id);
CREATE INDEX idx_crm_txn_item_product ON crm_transaction_item(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX idx_crm_txn_item_instance ON crm_transaction_item(product_instance_id) WHERE product_instance_id IS NOT NULL;

CREATE TABLE crm_service_case_type (
    case_type_id                       smallint       GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    case_type_code                     varchar(40)    NOT NULL UNIQUE,
    display_name                       varchar(120)   NOT NULL
);
COMMENT ON TABLE crm_service_case_type IS 'Case types. Seeded: REPAIR, WARRANTY_REPAIR, COMPLAINT, INQUIRY, RETURN_SUPPORT, INSTALLATION, SOFTWARE_SUPPORT.';

CREATE TABLE crm_service_status (
    service_status_id                  smallint       GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    status_code                        varchar(30)    NOT NULL UNIQUE,
    display_name                       varchar(100)   NOT NULL,
    sequence_no                        smallint       NULL,
    is_terminal                        boolean        NOT NULL DEFAULT false
);
COMMENT ON TABLE crm_service_status IS 'CRM-level states. Seeded: RECEIVED, DIAGNOSING, WAITING_PARTS, WAITING_APPROVAL, IN_REPAIR, QUALITY_CHECK, READY, CLOSED (terminal), CANCELLED (terminal).';

CREATE TABLE crm_service_status_map (
    project_id                         int            NOT NULL REFERENCES crm_project(project_id),
    source_status_code                 varchar(30)    NOT NULL,
    service_status_id                  smallint       NOT NULL REFERENCES crm_service_status(service_status_id),
    source_status_label                varchar(100)   NULL,
    PRIMARY KEY (project_id, source_status_code)
);
COMMENT ON TABLE crm_service_status_map IS 'Maps each project''s own status codes to a CRM status, so sync code carries no hard-coded switch (Crystal repair_tickets.status 0..9, vendor agency repair states).';

CREATE TABLE crm_service_priority (
    service_priority_id                smallint       GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    priority_code                      varchar(20)    NOT NULL UNIQUE,
    priority_name                      varchar(80)    NOT NULL,
    rank_no                            smallint       NULL
);
COMMENT ON TABLE crm_service_priority IS 'Priorities. Seeded: LOW, NORMAL, HIGH, URGENT (Crystal priority 0-2 map to LOW..HIGH).';

CREATE TABLE crm_issue_category (
    issue_category_id                  int            GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    parent_issue_category_id           int            NULL REFERENCES crm_issue_category(issue_category_id),
    project_id                         int            NULL REFERENCES crm_project(project_id),
    category_code                      varchar(50)    NOT NULL,
    display_name                       varchar(150)   NOT NULL,
    is_active                          boolean        NOT NULL DEFAULT true
);
COMMENT ON TABLE crm_issue_category IS 'What the customer reports, hierarchical, shared or per project.';
CREATE UNIQUE INDEX uq_crm_issue_code ON crm_issue_category(COALESCE(project_id, 0), category_code);

CREATE TABLE crm_fault_category (
    fault_category_id                  int            GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    parent_fault_category_id           int            NULL REFERENCES crm_fault_category(fault_category_id),
    project_id                         int            NULL REFERENCES crm_project(project_id),
    fault_code                         varchar(50)    NULL,
    display_name                       varchar(150)   NOT NULL,
    crystal_symptom_id                 integer        NULL UNIQUE REFERENCES symptom_catalog(id) ON DELETE SET NULL,
    is_active                          boolean        NOT NULL DEFAULT true
);
COMMENT ON TABLE crm_fault_category IS 'Technical fault found, hierarchical. Crystal symptom_catalog rows load here.';

CREATE TABLE crm_root_cause (
    root_cause_id                      int            GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    project_id                         int            NULL REFERENCES crm_project(project_id),
    root_cause_code                    varchar(50)    NULL,
    display_name                       varchar(150)   NOT NULL,
    is_active                          boolean        NOT NULL DEFAULT true
);
COMMENT ON TABLE crm_root_cause IS 'Selectable root causes.';

CREATE TABLE crm_resolution_category (
    resolution_category_id             int            GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    project_id                         int            NULL REFERENCES crm_project(project_id),
    resolution_code                    varchar(50)    NULL,
    display_name                       varchar(150)   NOT NULL,
    is_active                          boolean        NOT NULL DEFAULT true
);
COMMENT ON TABLE crm_resolution_category IS 'Selectable resolutions.';

CREATE TABLE crm_service_case (
    case_id                            bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk),
    project_id                         int            NOT NULL REFERENCES crm_project(project_id),
    external_case_id                   varchar(250)   NULL,
    crystal_repair_ticket_id           integer        NULL UNIQUE REFERENCES repair_tickets(id) ON DELETE SET NULL,
    service_provider_party_pk          bigint    NULL REFERENCES crm_organization(party_pk),
    service_center_id                bigint         NULL REFERENCES crm_service_center(service_center_id),
    case_type_id                       smallint       NOT NULL REFERENCES crm_service_case_type(case_type_id),
    service_status_id                  smallint       NOT NULL REFERENCES crm_service_status(service_status_id),
    service_priority_id                smallint       NULL REFERENCES crm_service_priority(service_priority_id),
    reception_channel_code             varchar(30)    NULL CHECK (reception_channel_code IN ('WALK_IN','MAIL_IN','ON_SITE','COURIER','PHONE','APP','WEB','AGENCY')),
    related_transaction_id             bigint         NULL REFERENCES crm_transaction(transaction_id),
    related_product_instance_id        bigint         NULL REFERENCES crm_product_instance(product_instance_id),
    reopened_from_case_id              bigint         NULL REFERENCES crm_service_case(case_id),
    is_warranty                        boolean        NULL,
    title                              varchar(250)   NULL,
    description                        text           NULL,
    received_at                        timestamptz    NOT NULL,
    first_response_at                  timestamptz    NULL,
    due_at                             timestamptz    NULL,
    completed_at                       timestamptz    NULL,
    closed_at                          timestamptz    NULL,
    total_cost                         numeric(20,4)  NULL,
    customer_paid_amount               numeric(20,4)  NULL,
    currency_code                      varchar(3)     NULL REFERENCES crm_currency(currency_code),
    satisfaction_rating                smallint       NULL CHECK (satisfaction_rating BETWEEN 1 AND 5),
    source_created_at                  timestamptz    NULL,
    source_updated_at                  timestamptz    NULL,
    ingested_at                        timestamptz    NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT chk_crm_case_closed CHECK (closed_at IS NULL OR closed_at >= received_at),
    CONSTRAINT chk_crm_case_not_own_parent CHECK (reopened_from_case_id IS NULL OR reopened_from_case_id <> case_id)
);
COMMENT ON TABLE crm_service_case IS 'CRM-level service summary. Detailed repair workflow stays in the project (Crystal repair_tickets, parts, claims).';
CREATE UNIQUE INDEX uq_crm_case_ext ON crm_service_case(project_id, external_case_id) WHERE external_case_id IS NOT NULL;
CREATE INDEX idx_crm_case_party ON crm_service_case(party_pk, received_at DESC);
CREATE INDEX idx_crm_case_queue ON crm_service_case(project_id, service_status_id, received_at);
CREATE INDEX idx_crm_case_instance ON crm_service_case(related_product_instance_id, received_at) WHERE related_product_instance_id IS NOT NULL;
CREATE INDEX idx_crm_case_site ON crm_service_case(service_center_id, received_at DESC);

CREATE TABLE crm_service_case_classification (
    service_case_classification_id     bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    case_id                            bigint         NOT NULL UNIQUE REFERENCES crm_service_case(case_id) ON DELETE CASCADE,
    issue_category_id                  int            NULL REFERENCES crm_issue_category(issue_category_id),
    fault_category_id                  int            NULL REFERENCES crm_fault_category(fault_category_id),
    root_cause_id                      int            NULL REFERENCES crm_root_cause(root_cause_id),
    resolution_category_id             int            NULL REFERENCES crm_resolution_category(resolution_category_id),
    resolution_text                    text           NULL,
    classified_at                      timestamptz    NOT NULL DEFAULT now(),
    classified_by_manager_id           integer        REFERENCES managers(id) ON DELETE SET NULL
);
COMMENT ON TABLE crm_service_case_classification IS 'Current structured classification of a case (one per case).';

CREATE TABLE crm_project_tier (
    project_tier_id                    int            GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    project_id                         int            NOT NULL REFERENCES crm_project(project_id),
    tier_code                          varchar(30)    NOT NULL,
    tier_name                          varchar(100)   NOT NULL,
    rank_no                            smallint       NULL,
    tier_kind                          varchar(20)    NOT NULL DEFAULT 'LEVEL' CHECK (tier_kind IN ('LEVEL','GRADE','CARD_CLASS')),
    source_code                        varchar(60)    NULL,
    min_value                          numeric(20,4)  NULL,
    is_active                          boolean        NOT NULL DEFAULT true,
    CONSTRAINT uq_crm_tier_code UNIQUE (project_id, tier_kind, tier_code),
    CONSTRAINT uq_crm_tier_project UNIQUE (project_tier_id, project_id)
);
COMMENT ON TABLE crm_project_tier IS 'Levels calculated by a project. Rank is meaningful only inside the project.';

CREATE TABLE crm_membership (
    membership_id                      bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk),
    project_id                         int            NOT NULL REFERENCES crm_project(project_id),
    external_member_id                 varchar(250)   NULL,
    current_tier_id                    int            NULL,
    tier_value                         numeric(20,4)  NULL,
    available_reward_points            numeric(20,4)  NULL,
    membership_status                  varchar(30)    NOT NULL DEFAULT 'ACTIVE' CHECK (membership_status IN ('ACTIVE','INACTIVE','SUSPENDED','LEFT')),
    source_payload                     jsonb          NULL,
    joined_at                          timestamptz    NULL,
    left_at                            timestamptz    NULL,
    synced_at                          timestamptz    NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT uq_crm_membership UNIQUE (party_pk, project_id),
    CONSTRAINT fk_crm_membership_tier FOREIGN KEY (current_tier_id, project_id) REFERENCES crm_project_tier(project_tier_id, project_id),
    CONSTRAINT chk_crm_membership_period CHECK (left_at IS NULL OR joined_at IS NULL OR left_at >= joined_at)
);
COMMENT ON TABLE crm_membership IS 'Current membership state of a party in a project.';
CREATE UNIQUE INDEX uq_crm_membership_ext ON crm_membership(project_id, external_member_id) WHERE external_member_id IS NOT NULL;
CREATE INDEX idx_crm_membership_tier ON crm_membership(project_id, current_tier_id);

CREATE TABLE crm_membership_tier_history (
    membership_tier_history_id         bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    membership_id                      bigint         NOT NULL REFERENCES crm_membership(membership_id) ON DELETE CASCADE,
    old_tier_id                        int            NULL REFERENCES crm_project_tier(project_tier_id),
    new_tier_id                        int            NOT NULL REFERENCES crm_project_tier(project_tier_id),
    change_reason                      varchar(250)   NULL,
    changed_at                         timestamptz    NOT NULL DEFAULT now()
);
COMMENT ON TABLE crm_membership_tier_history IS 'History of tier changes.';
CREATE INDEX idx_crm_tier_history ON crm_membership_tier_history(membership_id, changed_at);

CREATE TABLE crm_point_type (
    point_type_id                      smallint       GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    point_type_code                    varchar(30)    NOT NULL UNIQUE,
    point_type_name                    varchar(100)   NOT NULL,
    owner_project_id                   int            NULL REFERENCES crm_project(project_id),
    is_dream_managed                   boolean        NOT NULL DEFAULT true,
    decimal_places                     smallint       NOT NULL DEFAULT 3,
    expires_after_days                 integer        NULL CHECK (expires_after_days > 0),
    is_active                          boolean        NOT NULL DEFAULT true
);
COMMENT ON TABLE crm_point_type IS 'A point currency. Currencies are not interchangeable (karaoke points cannot buy an app). Seeded: ACTIVITY, SOFT (appstore + karaoke + bmedia), REGISTER (phone + eproduct registration), CRYSTAL (point_logs), ESHOP_PRIZE.';

CREATE TABLE crm_point_event_type (
    point_event_type_id                smallint       GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    event_code                         varchar(30)    NOT NULL UNIQUE,
    display_name                       varchar(100)   NOT NULL,
    direction                          smallint       NOT NULL CHECK (direction IN (-1, 0, 1))
);
COMMENT ON TABLE crm_point_event_type IS 'Point event categories. Seeded: EARN, REDEEM, EXPIRE, ADJUST, REFUND, RESERVATION_COST, EVENT_AWARD, MERGE_CARRY_OVER.';

CREATE TABLE crm_point_rule (
    point_rule_id                      int            GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    rule_code                          varchar(60)    NOT NULL UNIQUE,
    rule_name                          varchar(200)   NOT NULL,
    point_type_id                      smallint       NOT NULL REFERENCES crm_point_type(point_type_id),
    project_id                         int            NULL REFERENCES crm_project(project_id),
    trigger_code                       varchar(30)    NOT NULL CHECK (trigger_code IN ('PRODUCT_REGISTRATION','DAILY_LOGIN','DUTY','PURCHASE','LICENCE_PURCHASE','APP_PURCHASE','REPAIR','SURVEY','BLOG','MANUAL','EVENT_AWARD')),
    main_type                          varchar(100)   NULL,
    sub_type                           varchar(100)   NULL,
    product_class_id                   int            NULL REFERENCES crm_product_class(product_class_id),
    product_id                         bigint         NULL REFERENCES crm_product_catalog(product_id),
    points                             numeric(12,3)  NOT NULL,
    daily_cap_count                    smallint       NULL CHECK (daily_cap_count > 0),
    valid_from                         timestamptz    NULL,
    valid_to                           timestamptz    NULL,
    source_rule_key                    varchar(40)    NULL,
    is_active                          boolean        NOT NULL DEFAULT true,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT chk_crm_rule_period CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);
COMMENT ON TABLE crm_point_rule IS 'How points are earned: one row per rule, replacing activity_point_types (6-digit codes), register_point_types (points per product) and duties (tasks).';
CREATE INDEX idx_crm_point_rule_trigger ON crm_point_rule(trigger_code, point_type_id) WHERE is_active;
CREATE UNIQUE INDEX uq_crm_point_rule_product ON crm_point_rule(product_id, point_type_id) WHERE product_id IS NOT NULL AND is_active;

CREATE TABLE crm_point_account (
    point_account_id                   bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk),
    point_type_id                      smallint       NOT NULL REFERENCES crm_point_type(point_type_id),
    membership_id                      bigint         NULL REFERENCES crm_membership(membership_id),
    balance                            numeric(14,3)  NOT NULL DEFAULT 0,
    lifetime_earned                    numeric(14,3)  NOT NULL DEFAULT 0,
    lifetime_spent                     numeric(14,3)  NOT NULL DEFAULT 0,
    last_event_at                      timestamptz    NULL,
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT uq_crm_point_account UNIQUE (party_pk, point_type_id),
    CONSTRAINT chk_crm_point_account_sum CHECK (balance = lifetime_earned - lifetime_spent)
);
COMMENT ON TABLE crm_point_account IS 'Balance of one party in one currency: the cached total of crm_point_event, like wallets.point_balance over point_logs.';

CREATE TABLE crm_point_event (
    point_event_id                     bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    point_account_id                   bigint         NOT NULL REFERENCES crm_point_account(point_account_id),
    point_event_type_id                smallint       NOT NULL REFERENCES crm_point_event_type(point_event_type_id),
    point_rule_id                      int            NULL REFERENCES crm_point_rule(point_rule_id),
    project_id                         int            NOT NULL REFERENCES crm_project(project_id),
    points_delta                       numeric(14,3)  NOT NULL CHECK (points_delta <> 0),
    pay_amount                         numeric(14,3)  NULL,
    points_balance_after               numeric(14,3)  NOT NULL,
    related_transaction_id             bigint         NULL REFERENCES crm_transaction(transaction_id),
    related_product_registration_id    bigint         NULL REFERENCES crm_product_registration(product_registration_id),
    related_reservation_id             bigint         NULL,
    related_award_id                   bigint         NULL,
    related_service_center_activity_id       bigint         NULL REFERENCES crm_service_center_activity(service_center_activity_id),
    performed_by_service_center_id           bigint         NULL REFERENCES crm_service_center(service_center_id),
    performed_by_manager_id            integer        REFERENCES managers(id) ON DELETE SET NULL,
    description                        varchar(500)   NULL,
    device_ref                         varchar(64)    NULL,
    source_table_code                  varchar(40)    NULL,
    external_event_id                  varchar(250)   NULL,
    ip_address                         inet           NULL,
    occurred_at                        timestamptz    NOT NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now()
);
COMMENT ON TABLE crm_point_event IS 'Append-only point ledger for every currency. Generalises crm_membership_point_event: an event belongs to a point account, and through it to a membership when there is one.';
CREATE UNIQUE INDEX uq_crm_point_event_src ON crm_point_event(project_id, source_table_code, external_event_id) WHERE external_event_id IS NOT NULL;
CREATE INDEX idx_crm_point_event_account ON crm_point_event(point_account_id, occurred_at DESC);
CREATE INDEX idx_crm_point_event_rule ON crm_point_event(point_rule_id, occurred_at) WHERE point_rule_id IS NOT NULL;
CREATE INDEX idx_crm_point_event_reg ON crm_point_event(related_product_registration_id) WHERE related_product_registration_id IS NOT NULL;

CREATE TABLE crm_corporate_grade (
    corporate_grade_id                 smallint       GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    grade_code                         varchar(20)    NOT NULL UNIQUE,
    grade_name                         varchar(100)   NOT NULL,
    rank_no                            smallint       NOT NULL UNIQUE,
    min_score                          numeric(12,4)  NULL,
    max_score                          numeric(12,4)  NULL,
    is_active                          boolean        NOT NULL DEFAULT true,
    CONSTRAINT chk_crm_grade_band CHECK (max_score IS NULL OR min_score IS NULL OR max_score > min_score)
);
COMMENT ON TABLE crm_corporate_grade IS 'Dream-wide grade bands produced from the corporate score. Replaces vendor integrated_user_class (class_level 0-3).';

/* A grade a manager gives a customer by hand; it stands in for the computed one while set. Added here, after the grade table it points at. */
ALTER TABLE crm_party ADD COLUMN assigned_grade_id smallint NULL REFERENCES crm_corporate_grade(corporate_grade_id);
ALTER TABLE crm_party ADD COLUMN assigned_grade_reason varchar(500) NULL;
ALTER TABLE crm_party ADD COLUMN assigned_grade_at timestamptz NULL;
ALTER TABLE crm_party ADD COLUMN assigned_grade_by_manager_id integer NULL REFERENCES managers(id) ON DELETE SET NULL;
COMMENT ON COLUMN crm_party.assigned_grade_id IS 'Corporate grade set by a manager; overrides the computed grade from the latest analysis snapshot while set.';
CREATE INDEX idx_crm_party_assigned_grade ON crm_party(assigned_grade_id) WHERE assigned_grade_id IS NOT NULL;

CREATE TABLE crm_party_analysis_snapshot (
    analysis_snapshot_id               bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk),
    project_id                         int            NULL REFERENCES crm_project(project_id),
    reference_date                     date           NOT NULL,
    calculated_at                      timestamptz    NOT NULL DEFAULT now(),
    reporting_currency_code            varchar(3)     NULL REFERENCES crm_currency(currency_code),
    first_transaction_at               timestamptz    NULL,
    last_transaction_at                timestamptz    NULL,
    purchase_amount_lifetime           numeric(20,4)  NULL,
    purchase_amount_12m                numeric(20,4)  NULL,
    transaction_count_lifetime         int            NULL,
    transaction_count_12m              int            NULL,
    active_purchase_days_12m           int            NULL,
    average_transaction_amount_12m     numeric(20,4)  NULL,
    service_case_count_12m             int            NULL,
    complaint_count_12m                int            NULL,
    registered_device_count            int            NULL,
    points_earned_12m                  numeric(14,3)  NULL,
    location_visit_count_12m           int            NULL,
    score_components                   jsonb          NULL,
    activity_status                    varchar(30)    NULL CHECK (activity_status IN ('NEW','ACTIVE','AT_RISK','LAPSED','NEVER_BOUGHT')),
    corporate_score                    numeric(12,4)  NULL,
    corporate_grade_id                 smallint       NULL REFERENCES crm_corporate_grade(corporate_grade_id),
    model_version                      varchar(50)    NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT chk_crm_snapshot_grade_scope CHECK (project_id IS NULL OR (corporate_score IS NULL AND corporate_grade_id IS NULL))
);
COMMENT ON TABLE crm_party_analysis_snapshot IS 'Periodic snapshot per party: project row or Dream-wide row (project_id NULL). Replaces integrated_user_values.';
CREATE UNIQUE INDEX uq_crm_snapshot_scope ON crm_party_analysis_snapshot(party_pk, COALESCE(project_id, 0), reference_date);
CREATE INDEX idx_crm_snapshot_history ON crm_party_analysis_snapshot(party_pk, reference_date DESC);
CREATE INDEX idx_crm_snapshot_grade ON crm_party_analysis_snapshot(reference_date, corporate_grade_id, party_pk) WHERE project_id IS NULL;

CREATE TABLE crm_metric_definition (
    metric_definition_id               bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    metric_code                        varchar(80)    NOT NULL UNIQUE,
    metric_name                        varchar(150)   NOT NULL,
    value_type                         varchar(20)    NOT NULL CHECK (value_type IN ('NUMBER','TEXT','BOOLEAN','DATE')),
    unit_code                          varchar(30)    NULL,
    description                        text           NULL,
    is_active                          boolean        NOT NULL DEFAULT true
);
COMMENT ON TABLE crm_metric_definition IS 'Extensible metric dictionary.';

CREATE TABLE crm_party_metric_value (
    party_metric_value_id              bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk),
    project_id                         int            NULL REFERENCES crm_project(project_id),
    metric_definition_id               bigint         NOT NULL REFERENCES crm_metric_definition(metric_definition_id),
    reference_date                     date           NOT NULL,
    numeric_value                      numeric(30,10) NULL,
    text_value                         text           NULL,
    boolean_value                      boolean        NULL,
    date_value                         date           NULL,
    calculated_at                      timestamptz    NOT NULL DEFAULT now(),
    model_version                      varchar(50)    NULL,
    CONSTRAINT chk_crm_metric_one_value CHECK (num_nonnulls(numeric_value, text_value, boolean_value, date_value) = 1)
);
COMMENT ON TABLE crm_party_metric_value IS 'Metric value per party, scope and date.';
CREATE UNIQUE INDEX uq_crm_metric_value ON crm_party_metric_value(party_pk, COALESCE(project_id, 0), metric_definition_id, reference_date);
CREATE INDEX idx_crm_metric_eval ON crm_party_metric_value(metric_definition_id, project_id, reference_date, party_pk);

CREATE TABLE crm_party_product_class_stat (
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk),
    product_class_id                   int            NOT NULL REFERENCES crm_product_class(product_class_id),
    active_owned_count                 int            NOT NULL DEFAULT 0 CHECK (active_owned_count >= 0),
    lifetime_registered_count          int            NOT NULL DEFAULT 0 CHECK (lifetime_registered_count >= 0),
    last_registered_at                 timestamptz    NULL,
    calculated_at                      timestamptz    NOT NULL DEFAULT now(),
    PRIMARY KEY (party_pk, product_class_id)
);
COMMENT ON TABLE crm_party_product_class_stat IS 'How many products of each class a party holds and has ever registered. Replaces the fixed counter columns of uclass_phone_values / uclass_eprod_values with one row per class, so a new class needs no new column.';
CREATE INDEX idx_crm_class_stat_class ON crm_party_product_class_stat(product_class_id, active_owned_count);

CREATE TABLE crm_segment (
    segment_id                         bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    project_id                         int            NULL REFERENCES crm_project(project_id),
    segment_code                       varchar(50)    NOT NULL,
    segment_name                       varchar(150)   NOT NULL,
    segment_description                text           NULL,
    current_version_id                 bigint         NULL,
    calculation_frequency              varchar(30)    NULL CHECK (calculation_frequency IN ('REALTIME','DAILY','WEEKLY','ON_DEMAND')),
    status                             varchar(20)    NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','PAUSED','ARCHIVED')),
    member_count                       int            NULL,
    last_evaluated_at                  timestamptz    NULL,
    created_by_manager_id              integer        REFERENCES managers(id) ON DELETE SET NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now()
);
COMMENT ON TABLE crm_segment IS 'Stable identity of a dynamic group.';
CREATE UNIQUE INDEX uq_crm_segment_code ON crm_segment(COALESCE(project_id, 0), segment_code);

CREATE TABLE crm_segment_version (
    segment_version_id                 bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    segment_id                         bigint         NOT NULL REFERENCES crm_segment(segment_id) ON DELETE CASCADE,
    version_no                         int            NOT NULL CHECK (version_no > 0),
    rule_expression                    jsonb          NOT NULL,
    effective_from                     timestamptz    NOT NULL DEFAULT now(),
    effective_to                       timestamptz    NULL,
    created_by_manager_id              integer        REFERENCES managers(id) ON DELETE SET NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT uq_crm_segment_version UNIQUE (segment_id, version_no),
    CONSTRAINT uq_crm_segment_version_owner UNIQUE (segment_version_id, segment_id),
    CONSTRAINT chk_crm_segment_version_period CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
COMMENT ON TABLE crm_segment_version IS 'Versioned rule of a segment.';

CREATE TABLE crm_segment_membership (
    segment_membership_id              bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    segment_id                         bigint         NOT NULL REFERENCES crm_segment(segment_id) ON DELETE CASCADE,
    segment_version_id                 bigint         NOT NULL,
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk),
    matched_at                         timestamptz    NOT NULL DEFAULT now(),
    unmatched_at                       timestamptz    NULL,
    evaluation_reference_date          date           NULL,
    explanation_json                   jsonb          NULL,
    CONSTRAINT fk_crm_segment_membership_version FOREIGN KEY (segment_version_id, segment_id) REFERENCES crm_segment_version(segment_version_id, segment_id),
    CONSTRAINT chk_crm_segment_membership_period CHECK (unmatched_at IS NULL OR unmatched_at >= matched_at)
);
COMMENT ON TABLE crm_segment_membership IS 'Materialised current and past members.';
CREATE UNIQUE INDEX uq_crm_segment_current ON crm_segment_membership(segment_id, party_pk) WHERE unmatched_at IS NULL;
CREATE INDEX idx_crm_segment_membership_hist ON crm_segment_membership(segment_id, party_pk);
CREATE INDEX idx_crm_segment_membership_party ON crm_segment_membership(party_pk, unmatched_at);

CREATE TABLE crm_event (
    event_id                bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    event_code                       varchar(50)    NOT NULL UNIQUE,
    event_name                       varchar(250)   NOT NULL,
    event_type                       varchar(30)    NOT NULL CHECK (event_type IN ('RESERVATION','LOTTERY','PRIZE_SERVICE','PUZZLE','SURVEY_REWARD','EVENT_ATTENDANCE')),
    project_id                         int            NULL REFERENCES crm_project(project_id),
    description                        text           NULL,
    summary                            varchar(120)   NULL,
    approval_no                        varchar(40)    NULL,
    reserved_product_id                bigint         NULL REFERENCES crm_product_catalog(product_id),
    eligibility_basis                  varchar(30)    NOT NULL CHECK (eligibility_basis IN ('SEGMENT','POINT_RANKING','CORPORATE_GRADE','PRODUCT_REGISTRATION','SERVICE_CENTER_ACTIVITY','MANUAL','IMPORT','OPEN')),
    eligibility_segment_id             bigint         NULL REFERENCES crm_segment(segment_id),
    eligibility_rule                   jsonb          NULL,
    ranking_point_type_id              smallint       NULL REFERENCES crm_point_type(point_type_id),
    ranking_cutoff_at                  timestamptz    NULL,
    ranking_top_n                      int            NULL CHECK (ranking_top_n > 0),
    cost_point_type_id                 smallint       NULL REFERENCES crm_point_type(point_type_id),
    cost_points                        numeric(14,3)  NULL CHECK (cost_points > 0),
    number_prefix                      varchar(10)    NULL,
    number_suffix                      varchar(10)    NULL,
    number_start                       int            NULL CHECK (number_start >= 0),
    number_end                         int            NULL,
    display_at                         timestamptz    NULL,
    starts_at                          timestamptz    NULL,
    ends_at                            timestamptz    NULL,
    fulfilment_ends_at                 timestamptz    NULL,
    is_private                         boolean        NOT NULL DEFAULT false,
    status                             varchar(20)    NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','TARGETS_FROZEN','OPEN','CLOSED','FULFILLED','CANCELLED')),
    campaign_id                        bigint         NULL,
    external_system_code               varchar(30)    NULL,
    is_test                            boolean        NOT NULL DEFAULT false,
    created_by_manager_id              integer        REFERENCES managers(id) ON DELETE SET NULL,
    approved_by_manager_id             integer        REFERENCES managers(id) ON DELETE SET NULL,
    approved_at                        timestamptz    NULL,
    legacy_table_code                  varchar(30)    NULL,
    legacy_key                         bigint         NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT chk_crm_event_window CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at),
    CONSTRAINT chk_crm_event_numbers CHECK (number_end IS NULL OR number_start IS NULL OR number_end >= number_start),
    CONSTRAINT chk_crm_event_four_eyes CHECK (approved_by_manager_id IS NULL OR approved_by_manager_id IS DISTINCT FROM created_by_manager_id),
    CONSTRAINT chk_crm_event_approved CHECK (status IN ('DRAFT','CANCELLED') OR approved_by_manager_id IS NOT NULL),
    CONSTRAINT chk_crm_event_segment CHECK (eligibility_basis <> 'SEGMENT' OR eligibility_segment_id IS NOT NULL),
    CONSTRAINT chk_crm_event_ranking CHECK (eligibility_basis <> 'POINT_RANKING' OR (ranking_point_type_id IS NOT NULL AND ranking_cutoff_at IS NOT NULL)),
    CONSTRAINT chk_crm_event_cost CHECK ((cost_point_type_id IS NULL) = (cost_points IS NULL))
);
COMMENT ON TABLE crm_event IS 'One activity event: a new-phone reservation, a lottery, a year-end prize service, a puzzle, a survey reward.';
CREATE UNIQUE INDEX uq_crm_event_legacy ON crm_event(legacy_table_code, legacy_key) WHERE legacy_key IS NOT NULL;
CREATE INDEX idx_crm_event_open ON crm_event(starts_at, ends_at) WHERE status IN ('TARGETS_FROZEN','OPEN');

CREATE TABLE crm_event_tier (
    event_tier_id                    bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    event_id                bigint         NOT NULL REFERENCES crm_event(event_id) ON DELETE CASCADE,
    tier_code                          varchar(30)    NOT NULL,
    tier_name                          varchar(100)   NOT NULL,
    rank_no                            smallint       NOT NULL,
    min_value                          numeric(20,4)  NOT NULL DEFAULT 0,
    max_value                          numeric(20,4)  NULL,
    entries_per_target                 smallint       NOT NULL DEFAULT 1 CHECK (entries_per_target > 0),
    number_range_start                 int            NULL,
    number_range_end                   int            NULL,
    CONSTRAINT uq_crm_event_tier UNIQUE (event_id, tier_code),
    CONSTRAINT uq_crm_event_tier_owner UNIQUE (event_tier_id, event_id),
    CONSTRAINT chk_crm_event_tier_band CHECK (max_value IS NULL OR max_value > min_value),
    CONSTRAINT chk_crm_event_tier_range CHECK (number_range_end IS NULL OR number_range_start IS NULL OR number_range_end >= number_range_start)
);
COMMENT ON TABLE crm_event_tier IS 'Classes inside one event, by qualifying value (premium_user_class). Decide entries per target, number ranges and rewards.';

CREATE TABLE crm_event_service_center (
    event_service_center_id                bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    event_id                bigint         NOT NULL REFERENCES crm_event(event_id) ON DELETE CASCADE,
    service_center_id                bigint         NOT NULL REFERENCES crm_service_center(service_center_id),
    service_center_role                      varchar(20)    NOT NULL DEFAULT 'PICKUP' CHECK (service_center_role IN ('PICKUP','SALE','EVENT_VENUE','DELIVERY_HUB')),
    CONSTRAINT uq_crm_event_location UNIQUE (event_id, service_center_id, service_center_role)
);
COMMENT ON TABLE crm_event_service_center IS 'Sites taking part in an event, and their role. Replaces the comma list reserve_prefix.agency_ids.';

CREATE TABLE crm_event_quota (
    event_quota_id                   bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    event_id                bigint         NOT NULL REFERENCES crm_event(event_id) ON DELETE CASCADE,
    entry_type                         varchar(10)    NOT NULL DEFAULT 'NORMAL' CHECK (entry_type IN ('NORMAL','REWARD')),
    event_tier_id                    bigint         NULL,
    service_center_id                bigint         NULL REFERENCES crm_service_center(service_center_id),
    quota_count                        int            NOT NULL CHECK (quota_count >= 0),
    used_count                         int            NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT fk_crm_quota_tier FOREIGN KEY (event_tier_id, event_id) REFERENCES crm_event_tier(event_tier_id, event_id),
    CONSTRAINT chk_crm_quota_not_over CHECK (used_count <= quota_count)
);
COMMENT ON TABLE crm_event_quota IS 'How many reservations/entries are available: overall, per entry type (NORMAL / REWARD), per tier or per site. Replaces normal_cnt / reward_cnt and adds per-site limits.';
CREATE UNIQUE INDEX uq_crm_event_quota ON crm_event_quota(event_id, entry_type, COALESCE(event_tier_id, 0), COALESCE(service_center_id, 0));

CREATE TABLE crm_activity_target (
    activity_target_id                 bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    event_id                bigint         NOT NULL REFERENCES crm_event(event_id) ON DELETE CASCADE,
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk),
    event_tier_id                    bigint         NULL,
    entry_type                         varchar(10)    NOT NULL DEFAULT 'NORMAL' CHECK (entry_type IN ('NORMAL','REWARD')),
    allowed_count                      smallint       NOT NULL CHECK (allowed_count >= 0),
    used_count                         smallint       NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    qualification_value                numeric(20,4)  NULL,
    qualification_rank                 int            NULL,
    qualification_reason               jsonb          NULL,
    source                             varchar(20)    NOT NULL CHECK (source IN ('SEGMENT','RANKING','GRADE','REGISTRATION','SERVICE_CENTER','MANUAL','IMPORT')),
    source_segment_membership_id       bigint         NULL REFERENCES crm_segment_membership(segment_membership_id) ON DELETE SET NULL,
    status                             varchar(20)    NOT NULL DEFAULT 'ELIGIBLE' CHECK (status IN ('ELIGIBLE','NOTIFIED','EXHAUSTED','REVOKED')),
    added_by_manager_id                integer        REFERENCES managers(id) ON DELETE SET NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT uq_crm_target UNIQUE (event_id, party_pk, entry_type),
    CONSTRAINT uq_crm_target_key UNIQUE (activity_target_id, event_id, party_pk),
    CONSTRAINT fk_crm_target_tier FOREIGN KEY (event_tier_id, event_id) REFERENCES crm_event_tier(event_tier_id, event_id),
    CONSTRAINT chk_crm_target_used CHECK (used_count <= allowed_count)
);
COMMENT ON TABLE crm_activity_target IS 'The activity targets: who may take part, in which tier, how many times, and why. Frozen when the event moves to TARGETS_FROZEN, like a campaign audience.';
CREATE INDEX idx_crm_target_party ON crm_activity_target(party_pk, event_id);
CREATE INDEX idx_crm_target_rank ON crm_activity_target(event_id, qualification_rank);

CREATE TABLE crm_activity_reservation (
    reservation_id                     bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    event_id                bigint         NOT NULL REFERENCES crm_event(event_id),
    activity_target_id                 bigint         NULL,
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk),
    event_tier_id                    bigint         NULL,
    entry_type                         varchar(10)    NOT NULL DEFAULT 'NORMAL' CHECK (entry_type IN ('NORMAL','REWARD')),
    reservation_no                     int            NOT NULL,
    reservation_code                   varchar(30)    NOT NULL UNIQUE,
    holder_name                        varchar(100)   NULL,
    holder_id_card_hash                varchar(64)    NULL,
    holder_id_card_masked              varchar(20)    NULL,
    holder_phone                       varchar(32)    NULL,
    service_center_id                bigint         NULL REFERENCES crm_service_center(service_center_id),
    product_instance_id                bigint         NULL REFERENCES crm_product_instance(product_instance_id),
    related_transaction_id             bigint         NULL REFERENCES crm_transaction(transaction_id),
    status                             varchar(20)    NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RESERVED','PAID','FULFILLED','CANCELLED','EXPIRED','FAILED')),
    external_booking_ref               varchar(100)   NULL,
    reserved_at                        timestamptz    NULL,
    paid_at                            timestamptz    NULL,
    fulfilled_at                       timestamptz    NULL,
    cancelled_at                       timestamptz    NULL,
    cancel_reason                      varchar(255)   NULL,
    legacy_key                         bigint         NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT uq_crm_reservation_no UNIQUE (event_id, reservation_no),
    CONSTRAINT fk_crm_reservation_target FOREIGN KEY (activity_target_id, event_id, party_pk) REFERENCES crm_activity_target(activity_target_id, event_id, party_pk),
    CONSTRAINT fk_crm_reservation_tier FOREIGN KEY (event_tier_id, event_id) REFERENCES crm_event_tier(event_tier_id, event_id),
    CONSTRAINT chk_crm_reservation_cancel CHECK (status <> 'CANCELLED' OR cancelled_at IS NOT NULL)
);
COMMENT ON TABLE crm_activity_reservation IS 'A numbered entry taken by a target: a phone reservation or a lottery number. Holds the identity used for pickup and the whole lifecycle to sale.';
CREATE UNIQUE INDEX uq_crm_reservation_id_card ON crm_activity_reservation(event_id, holder_id_card_hash) WHERE holder_id_card_hash IS NOT NULL AND status NOT IN ('CANCELLED','EXPIRED','FAILED');
CREATE INDEX idx_crm_reservation_party ON crm_activity_reservation(party_pk, created_at DESC);
CREATE INDEX idx_crm_reservation_site ON crm_activity_reservation(service_center_id, status);
CREATE INDEX idx_crm_reservation_status ON crm_activity_reservation(event_id, status);

CREATE TABLE crm_activity_reservation_event (
    reservation_event_id               bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    reservation_id                     bigint         NOT NULL REFERENCES crm_activity_reservation(reservation_id) ON DELETE CASCADE,
    old_status                         varchar(20)    NULL,
    new_status                         varchar(20)    NOT NULL,
    actor_type                         varchar(20)    NOT NULL CHECK (actor_type IN ('PARTY','MANAGER','LOCATION','SYSTEM')),
    actor_manager_id                   integer        REFERENCES managers(id) ON DELETE SET NULL,
    actor_service_center_id                  bigint         NULL REFERENCES crm_service_center(service_center_id),
    note                               varchar(500)   NULL,
    occurred_at                        timestamptz    NOT NULL DEFAULT now()
);
COMMENT ON TABLE crm_activity_reservation_event IS 'Status history of a reservation.';
CREATE INDEX idx_crm_reservation_event ON crm_activity_reservation_event(reservation_id, occurred_at);

CREATE TABLE crm_activity_reward (
    reward_id                          bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    event_id                bigint         NOT NULL REFERENCES crm_event(event_id) ON DELETE CASCADE,
    event_tier_id                    bigint         NULL,
    reward_name                        varchar(255)   NOT NULL,
    reward_type                        varchar(30)    NOT NULL CHECK (reward_type IN ('DELIVERABLE_GOODS','PICKUP_GOODS','PRODUCT_COUPON','POINTS','WALLET_CREDIT')),
    product_id                         bigint         NULL REFERENCES crm_product_catalog(product_id),
    point_type_id                      smallint       NULL REFERENCES crm_point_type(point_type_id),
    points                             numeric(14,3)  NULL,
    unit_value                         numeric(20,4)  NULL,
    currency_code                      varchar(3)     NULL REFERENCES crm_currency(currency_code),
    quantity_total                     int            NOT NULL CHECK (quantity_total >= 0),
    quantity_awarded                   int            NOT NULL DEFAULT 0 CHECK (quantity_awarded >= 0),
    sort_order                         int            NOT NULL DEFAULT 0,
    note                               text           NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT fk_crm_reward_tier FOREIGN KEY (event_tier_id, event_id) REFERENCES crm_event_tier(event_tier_id, event_id),
    CONSTRAINT uq_crm_reward_owner UNIQUE (reward_id, event_id),
    CONSTRAINT chk_crm_reward_stock CHECK (quantity_awarded <= quantity_total),
    CONSTRAINT chk_crm_reward_points CHECK (reward_type <> 'POINTS' OR (point_type_id IS NOT NULL AND points > 0))
);
COMMENT ON TABLE crm_activity_reward IS 'Rewards an event can hand out (premium_goods): goods to deliver or pick up, product coupons, points, wallet credit.';

CREATE TABLE crm_activity_award (
    award_id                           bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    event_id                bigint         NOT NULL REFERENCES crm_event(event_id),
    reward_id                          bigint         NOT NULL,
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk),
    activity_target_id                 bigint         NULL REFERENCES crm_activity_target(activity_target_id),
    reservation_id                     bigint         NULL REFERENCES crm_activity_reservation(reservation_id),
    fulfilment_method                  varchar(20)    NOT NULL CHECK (fulfilment_method IN ('DELIVERY','PICKUP','POINTS','WALLET')),
    status                             varchar(20)    NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','READY','DISPATCHED','DELIVERED','PICKED_UP','CREDITED','FAILED','CANCELLED')),
    recipient_name                     varchar(100)   NULL,
    recipient_phone                    varchar(64)    NULL,
    recipient_id_card_hash             varchar(64)    NULL,
    delivery_location_pk               bigint         NULL REFERENCES crm_location(location_pk),
    delivery_address                   varchar(255)   NULL,
    pickup_service_center_id                 bigint         NULL REFERENCES crm_service_center(service_center_id),
    point_event_id                     bigint         NULL REFERENCES crm_point_event(point_event_id),
    external_credit_ref                varchar(100)   NULL,
    awarded_at                         timestamptz    NOT NULL DEFAULT now(),
    fulfilled_at                       timestamptz    NULL,
    handled_by_manager_id              integer        REFERENCES managers(id) ON DELETE SET NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT fk_crm_award_reward FOREIGN KEY (reward_id, event_id) REFERENCES crm_activity_reward(reward_id, event_id),
    CONSTRAINT chk_crm_award_pickup CHECK (fulfilment_method <> 'PICKUP' OR pickup_service_center_id IS NOT NULL),
    CONSTRAINT chk_crm_award_delivery CHECK (fulfilment_method <> 'DELIVERY' OR status IN ('PENDING','CANCELLED') OR delivery_address IS NOT NULL)
);
COMMENT ON TABLE crm_activity_award IS 'One reward given to one party and how it reaches them: delivery, pickup at a site, points or wallet credit.';
CREATE UNIQUE INDEX uq_crm_award_entry ON crm_activity_award(reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX idx_crm_award_party ON crm_activity_award(party_pk, awarded_at DESC);
CREATE INDEX idx_crm_award_status ON crm_activity_award(event_id, status);

CREATE TABLE crm_campaign (
    campaign_id                        bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    project_id                         int            NULL REFERENCES crm_project(project_id),
    campaign_code                      varchar(50)    NOT NULL,
    campaign_name                      varchar(250)   NOT NULL,
    campaign_type                      varchar(40)    NOT NULL CHECK (campaign_type IN ('PROMOTION','RETENTION','WIN_BACK','PRODUCT_LAUNCH','SERVICE','EVENT_NOTICE','SURVEY')),
    description                        text           NULL,
    campaign_status                    varchar(30)    NOT NULL DEFAULT 'DRAFT' CHECK (campaign_status IN ('DRAFT','APPROVED','ACTIVE','COMPLETED','CANCELLED')),
    start_at                           timestamptz    NULL,
    end_at                             timestamptz    NULL,
    completed_at                       timestamptz    NULL,
    owner_manager_id                   integer        REFERENCES managers(id) ON DELETE SET NULL,
    created_by_manager_id              integer        REFERENCES managers(id) ON DELETE SET NULL,
    approved_by_manager_id             integer        REFERENCES managers(id) ON DELETE SET NULL,
    approved_at                        timestamptz    NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT chk_crm_campaign_period CHECK (end_at IS NULL OR start_at IS NULL OR end_at >= start_at),
    CONSTRAINT chk_crm_campaign_four_eyes CHECK (approved_by_manager_id IS NULL OR approved_by_manager_id IS DISTINCT FROM created_by_manager_id)
);
COMMENT ON TABLE crm_campaign IS 'Campaign header.';
CREATE UNIQUE INDEX uq_crm_campaign_code ON crm_campaign(COALESCE(project_id, 0), campaign_code);

CREATE TABLE crm_campaign_audience (
    audience_id                        bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    campaign_id                        bigint         NOT NULL REFERENCES crm_campaign(campaign_id) ON DELETE CASCADE,
    audience_name                      varchar(150)   NOT NULL,
    audience_type                      varchar(30)    NOT NULL CHECK (audience_type IN ('SEGMENT','RULE','MANUAL','EVENT_TARGETS')),
    source_segment_id                  bigint         NULL REFERENCES crm_segment(segment_id),
    source_event_id         bigint         NULL REFERENCES crm_event(event_id),
    rule_expression                    jsonb          NULL,
    snapshot_at                        timestamptz    NULL,
    member_count                       int            NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT uq_crm_audience_campaign UNIQUE (audience_id, campaign_id),
    CONSTRAINT chk_crm_audience_source CHECK ((audience_type = 'SEGMENT') = (source_segment_id IS NOT NULL) AND (audience_type = 'EVENT_TARGETS') = (source_event_id IS NOT NULL) AND (audience_type <> 'RULE' OR rule_expression IS NOT NULL))
);
COMMENT ON TABLE crm_campaign_audience IS 'Audience selection of a campaign, frozen before execution.';
CREATE INDEX idx_crm_audience_campaign ON crm_campaign_audience(campaign_id);

CREATE TABLE crm_campaign_audience_member (
    audience_member_id                 bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    audience_id                        bigint         NOT NULL,
    campaign_id                        bigint         NOT NULL,
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk),
    assigned_at                        timestamptz    NOT NULL DEFAULT now(),
    qualification_reason               jsonb          NULL,
    source_segment_membership_id       bigint         NULL REFERENCES crm_segment_membership(segment_membership_id) ON DELETE SET NULL,
    source_activity_target_id          bigint         NULL REFERENCES crm_activity_target(activity_target_id) ON DELETE SET NULL,
    CONSTRAINT fk_crm_member_audience FOREIGN KEY (audience_id, campaign_id) REFERENCES crm_campaign_audience(audience_id, campaign_id) ON DELETE CASCADE,
    CONSTRAINT uq_crm_audience_party UNIQUE (audience_id, party_pk),
    CONSTRAINT uq_crm_audience_member_key UNIQUE (audience_member_id, campaign_id, party_pk)
);
COMMENT ON TABLE crm_campaign_audience_member IS 'Frozen party membership of an audience.';
CREATE INDEX idx_crm_audience_member_party ON crm_campaign_audience_member(party_pk, audience_id);

CREATE TABLE crm_campaign_content (
    content_id                         bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    content_type                       varchar(30)    NOT NULL CHECK (content_type IN ('EMAIL','SMS','PUSH','IN_APP','LANDING_PAGE')),
    content_name                       varchar(150)   NULL,
    title                              varchar(250)   NULL,
    body                               text           NULL,
    media_url                          text           NULL,
    landing_page_url                   text           NULL,
    language_code                      varchar(20)    NULL,
    locked_at                          timestamptz    NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now()
);
COMMENT ON TABLE crm_campaign_content IS 'Content/template used by actions; frozen once sent.';

CREATE TABLE crm_campaign_action (
    action_id                          bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    campaign_id                        bigint         NOT NULL REFERENCES crm_campaign(campaign_id) ON DELETE CASCADE,
    audience_id                        bigint         NOT NULL,
    action_name                        varchar(150)   NULL,
    action_type                        varchar(40)    NOT NULL CHECK (action_type IN ('SEND_MESSAGE','CALL','PUSH','IN_APP')),
    channel_id                         smallint       NOT NULL REFERENCES crm_communication_channel(channel_id),
    purpose_id                         smallint       NOT NULL REFERENCES crm_communication_purpose(purpose_id),
    content_id                         bigint         NULL REFERENCES crm_campaign_content(content_id),
    execution_order                    int            NULL,
    scheduled_at                       timestamptz    NULL,
    action_status                      varchar(30)    NOT NULL DEFAULT 'DRAFT' CHECK (action_status IN ('DRAFT','READY','RUNNING','COMPLETE','CANCELLED')),
    attribution_window_days            smallint       NOT NULL DEFAULT 14 CHECK (attribution_window_days BETWEEN 0 AND 180),
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT fk_crm_action_audience FOREIGN KEY (audience_id, campaign_id) REFERENCES crm_campaign_audience(audience_id, campaign_id),
    CONSTRAINT uq_crm_action_campaign UNIQUE (action_id, campaign_id)
);
COMMENT ON TABLE crm_campaign_action IS 'One execution step of a campaign.';
CREATE INDEX idx_crm_action_plan ON crm_campaign_action(campaign_id, execution_order);
CREATE INDEX idx_crm_action_due ON crm_campaign_action(scheduled_at) WHERE action_status = 'READY';

CREATE TABLE crm_campaign_recipient (
    recipient_id                       bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    action_id                          bigint         NOT NULL,
    campaign_id                        bigint         NOT NULL,
    audience_member_id                 bigint         NOT NULL,
    party_pk                           bigint    NOT NULL,
    contact_point_id                   bigint         NULL REFERENCES crm_contact_point(contact_point_id) ON DELETE SET NULL,
    party_communication_consent_id     bigint         NULL REFERENCES crm_party_communication_consent(party_communication_consent_id) ON DELETE SET NULL,
    destination_snapshot               varchar(500)   NULL,
    recipient_status                   varchar(30)    NOT NULL CHECK (recipient_status IN ('ELIGIBLE','SKIPPED','QUEUED','SENT','DELIVERED','FAILED')),
    skip_reason_code                   varchar(50)    NULL,
    provider_message_id                varchar(250)   NULL,
    queued_at                          timestamptz    NULL,
    sent_at                            timestamptz    NULL,
    delivered_at                       timestamptz    NULL,
    failed_at                          timestamptz    NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT fk_crm_recipient_action FOREIGN KEY (action_id, campaign_id) REFERENCES crm_campaign_action(action_id, campaign_id),
    CONSTRAINT fk_crm_recipient_member FOREIGN KEY (audience_member_id, campaign_id, party_pk) REFERENCES crm_campaign_audience_member(audience_member_id, campaign_id, party_pk),
    CONSTRAINT uq_crm_recipient UNIQUE (action_id, audience_member_id),
    CONSTRAINT uq_crm_recipient_key UNIQUE (recipient_id, campaign_id, party_pk),
    CONSTRAINT chk_crm_recipient_skip CHECK ((recipient_status = 'SKIPPED') = (skip_reason_code IS NOT NULL))
);
COMMENT ON TABLE crm_campaign_recipient IS 'One delivery attempt for one frozen member, with the consent decision used.';
CREATE INDEX idx_crm_recipient_work ON crm_campaign_recipient(action_id, recipient_status);
CREATE INDEX idx_crm_recipient_party ON crm_campaign_recipient(party_pk, created_at DESC);

CREATE TABLE crm_campaign_interaction (
    interaction_id                     bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    campaign_id                        bigint         NOT NULL REFERENCES crm_campaign(campaign_id) ON DELETE CASCADE,
    action_id                          bigint         NULL,
    recipient_id                       bigint         NULL,
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk),
    interaction_type                   varchar(40)    NOT NULL CHECK (interaction_type IN ('OPEN','CLICK','REPLY','VIEW','FORM_SUBMIT','UNSUBSCRIBE')),
    interaction_url                    text           NULL,
    source_event_id                    varchar(250)   NULL UNIQUE,
    utm_source                         varchar(100)   NULL,
    utm_medium                         varchar(100)   NULL,
    utm_campaign                       varchar(100)   NULL,
    utm_content                        varchar(100)   NULL,
    occurred_at                        timestamptz    NOT NULL,
    event_metadata                     jsonb          NULL,
    CONSTRAINT fk_crm_interaction_action FOREIGN KEY (action_id, campaign_id) REFERENCES crm_campaign_action(action_id, campaign_id),
    CONSTRAINT fk_crm_interaction_recipient FOREIGN KEY (recipient_id, campaign_id, party_pk) REFERENCES crm_campaign_recipient(recipient_id, campaign_id, party_pk)
);
COMMENT ON TABLE crm_campaign_interaction IS 'Engagement events.';
CREATE INDEX idx_crm_interaction_campaign ON crm_campaign_interaction(campaign_id, occurred_at);
CREATE INDEX idx_crm_interaction_party ON crm_campaign_interaction(party_pk, occurred_at);

CREATE TABLE crm_campaign_conversion (
    conversion_id                      bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    campaign_id                        bigint         NOT NULL REFERENCES crm_campaign(campaign_id) ON DELETE CASCADE,
    action_id                          bigint         NULL,
    recipient_id                       bigint         NULL,
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk),
    conversion_type                    varchar(40)    NOT NULL CHECK (conversion_type IN ('PURCHASE','REGISTRATION','RENEWAL','SERVICE_BOOKING','RESERVATION','EVENT_ENTRY')),
    source_project_id                  int            NULL REFERENCES crm_project(project_id),
    related_transaction_id             bigint         NULL REFERENCES crm_transaction(transaction_id),
    related_service_case_id            bigint         NULL REFERENCES crm_service_case(case_id),
    related_product_instance_id        bigint         NULL REFERENCES crm_product_instance(product_instance_id),
    related_reservation_id             bigint         NULL REFERENCES crm_activity_reservation(reservation_id),
    conversion_value                   numeric(20,4)  NULL,
    currency_code                      varchar(3)     NULL REFERENCES crm_currency(currency_code),
    attribution_model                  varchar(50)    NULL,
    attribution_window_days            int            NULL,
    attribution_score                  numeric(8,6)   NULL CHECK (attribution_score BETWEEN 0 AND 1),
    occurred_at                        timestamptz    NOT NULL,
    recorded_at                        timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT fk_crm_conversion_action FOREIGN KEY (action_id, campaign_id) REFERENCES crm_campaign_action(action_id, campaign_id),
    CONSTRAINT fk_crm_conversion_recipient FOREIGN KEY (recipient_id, campaign_id, party_pk) REFERENCES crm_campaign_recipient(recipient_id, campaign_id, party_pk)
);
COMMENT ON TABLE crm_campaign_conversion IS 'Business outcome attributed to a campaign.';
CREATE UNIQUE INDEX uq_crm_conversion_txn ON crm_campaign_conversion(campaign_id, related_transaction_id) WHERE related_transaction_id IS NOT NULL;
CREATE INDEX idx_crm_conversion_campaign ON crm_campaign_conversion(campaign_id, occurred_at);
CREATE INDEX idx_crm_conversion_party ON crm_campaign_conversion(party_pk, occurred_at);

CREATE TABLE crm_campaign_cost (
    campaign_cost_id                   bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    campaign_id                        bigint         NOT NULL REFERENCES crm_campaign(campaign_id) ON DELETE CASCADE,
    action_id                          bigint         NULL,
    cost_type                          varchar(40)    NOT NULL CHECK (cost_type IN ('MEDIA','SMS','EMAIL_PROVIDER','COUPON','AGENCY','PRIZE','OTHER')),
    amount                             numeric(20,4)  NOT NULL CHECK (amount >= 0),
    currency_code                      varchar(3)     NOT NULL REFERENCES crm_currency(currency_code),
    occurred_at                        timestamptz    NOT NULL,
    created_by_manager_id              integer        REFERENCES managers(id) ON DELETE SET NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT fk_crm_cost_action FOREIGN KEY (action_id, campaign_id) REFERENCES crm_campaign_action(action_id, campaign_id)
);
COMMENT ON TABLE crm_campaign_cost IS 'Campaign/action costs for ROI.';
CREATE INDEX idx_crm_cost_campaign ON crm_campaign_cost(campaign_id, occurred_at);

-- foreign keys to tables defined later in this file
ALTER TABLE crm_service_center_event ADD CONSTRAINT fk_location_event_event_id FOREIGN KEY (event_id) REFERENCES crm_event(event_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE crm_service_center_event ADD CONSTRAINT fk_location_event_campaign_id FOREIGN KEY (campaign_id) REFERENCES crm_campaign(campaign_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE crm_service_center_activity ADD CONSTRAINT fk_service_center_activity_related_service_case_id FOREIGN KEY (related_service_case_id) REFERENCES crm_service_case(case_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE crm_service_center_activity ADD CONSTRAINT fk_service_center_activity_related_transaction_id FOREIGN KEY (related_transaction_id) REFERENCES crm_transaction(transaction_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE crm_service_center_activity ADD CONSTRAINT fk_service_center_activity_related_product_instance_id FOREIGN KEY (related_product_instance_id) REFERENCES crm_product_instance(product_instance_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE crm_service_center_activity ADD CONSTRAINT fk_service_center_activity_related_reservation_id FOREIGN KEY (related_reservation_id) REFERENCES crm_activity_reservation(reservation_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE crm_service_center_activity ADD CONSTRAINT fk_service_center_activity_related_award_id FOREIGN KEY (related_award_id) REFERENCES crm_activity_award(award_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE crm_product_registration ADD CONSTRAINT fk_product_registration_related_transaction_id FOREIGN KEY (related_transaction_id) REFERENCES crm_transaction(transaction_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE crm_product_registration ADD CONSTRAINT fk_product_registration_transfer_id FOREIGN KEY (transfer_id) REFERENCES crm_product_transfer(product_transfer_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE crm_product_transfer ADD CONSTRAINT fk_product_transfer_related_transaction_id FOREIGN KEY (related_transaction_id) REFERENCES crm_transaction(transaction_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE crm_point_event ADD CONSTRAINT fk_point_event_related_reservation_id FOREIGN KEY (related_reservation_id) REFERENCES crm_activity_reservation(reservation_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE crm_point_event ADD CONSTRAINT fk_point_event_related_award_id FOREIGN KEY (related_award_id) REFERENCES crm_activity_award(award_id) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE crm_event ADD CONSTRAINT fk_event_campaign_id FOREIGN KEY (campaign_id) REFERENCES crm_campaign(campaign_id) DEFERRABLE INITIALLY IMMEDIATE;

-- ---------------------------------------------------------------------
-- circular / late keys written by hand
-- ---------------------------------------------------------------------
ALTER TABLE crm_segment ADD CONSTRAINT fk_segment_current_version
    FOREIGN KEY (current_version_id, segment_id) REFERENCES crm_segment_version(segment_version_id, segment_id)
    DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE crm_product_transfer ADD CONSTRAINT fk_product_transfer_closed
    FOREIGN KEY (closed_registration_id) REFERENCES crm_product_registration(product_registration_id);
ALTER TABLE crm_product_transfer ADD CONSTRAINT fk_product_transfer_created
    FOREIGN KEY (created_registration_id) REFERENCES crm_product_registration(product_registration_id);


-- ---------------------------------------------------------------------
-- rules a CHECK cannot express
-- ---------------------------------------------------------------------

/* crm_person rows only for PERSON parties, crm_organization only for ORGANIZATION. */
CREATE OR REPLACE FUNCTION crm_check_party_subtype() RETURNS trigger AS $$
DECLARE
    expected varchar(20) := CASE TG_TABLE_NAME WHEN 'crm_person' THEN 'PERSON' ELSE 'ORGANIZATION' END;
    actual   varchar(20);
BEGIN
    SELECT party_type INTO actual FROM crm_party WHERE party_pk = NEW.party_pk;
    IF actual IS DISTINCT FROM expected THEN
        RAISE EXCEPTION '% row needs a % party, party % is %', TG_TABLE_NAME, expected, NEW.party_pk, actual;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crm_person_subtype BEFORE INSERT OR UPDATE ON crm_person
    FOR EACH ROW EXECUTE PROCEDURE crm_check_party_subtype();
CREATE TRIGGER trg_crm_organization_subtype BEFORE INSERT OR UPDATE ON crm_organization
    FOR EACH ROW EXECUTE PROCEDURE crm_check_party_subtype();

/* the one filled value column of a metric must match its definition's value_type */
CREATE OR REPLACE FUNCTION crm_check_metric_type() RETURNS trigger AS $$
DECLARE
    vt varchar(20);
BEGIN
    SELECT value_type INTO vt FROM crm_metric_definition WHERE metric_definition_id = NEW.metric_definition_id;
    IF (vt = 'NUMBER'  AND NEW.numeric_value IS NULL) OR
       (vt = 'TEXT'    AND NEW.text_value    IS NULL) OR
       (vt = 'BOOLEAN' AND NEW.boolean_value IS NULL) OR
       (vt = 'DATE'    AND NEW.date_value    IS NULL) THEN
        RAISE EXCEPTION 'metric % is %, the matching column is empty', NEW.metric_definition_id, vt;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crm_metric_value_type BEFORE INSERT OR UPDATE ON crm_party_metric_value
    FOR EACH ROW EXECUTE PROCEDURE crm_check_metric_type();

/* points_delta must follow the event type's direction */
CREATE OR REPLACE FUNCTION crm_check_point_direction() RETURNS trigger AS $$
DECLARE
    dir smallint;
BEGIN
    SELECT direction INTO dir FROM crm_point_event_type WHERE point_event_type_id = NEW.point_event_type_id;
    IF dir <> 0 AND sign(NEW.points_delta) <> dir THEN
        RAISE EXCEPTION 'point event type % needs sign %, got %', NEW.point_event_type_id, dir, NEW.points_delta;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crm_point_event_direction BEFORE INSERT ON crm_point_event
    FOR EACH ROW EXECUTE PROCEDURE crm_check_point_direction();

/* updated_at on every CRM table that has one, as elsewhere in schema.sql */
DO $$
DECLARE crm_table record;
BEGIN
    FOR crm_table IN SELECT column_info.table_name FROM information_schema.columns column_info
             WHERE column_info.table_schema = current_schema() AND column_info.table_name LIKE 'crm\_%' AND column_info.column_name = 'updated_at'
    LOOP
        EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE PROCEDURE set_updated_at()',
                       crm_table.table_name, crm_table.table_name);
    END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- views
-- ---------------------------------------------------------------------

/* service centre targets against what was actually done */
CREATE VIEW v_crm_service_center_activity_progress AS
SELECT target.service_center_activity_target_id,
       target.service_center_id,
       center.service_center_name,
       target.activity_type_id,
       activity_type.activity_code,
       target.period_start,
       target.period_end,
       target.target_quantity,
       COALESCE(SUM(activity.quantity), 0)                    AS actual_quantity,
       target.target_amount,
       COALESCE(SUM(activity.amount), 0)                      AS actual_amount,
       CASE WHEN target.target_quantity > 0
            THEN round(COALESCE(SUM(activity.quantity), 0) / target.target_quantity * 100, 1) END AS quantity_pct
FROM crm_service_center_activity_target target
JOIN crm_service_center center                 ON center.service_center_id = target.service_center_id
JOIN crm_service_center_activity_type activity_type ON activity_type.activity_type_id = target.activity_type_id
LEFT JOIN crm_service_center_activity activity ON activity.service_center_id = target.service_center_id
                                              AND activity.activity_type_id = target.activity_type_id
                                              AND activity.status = 'COMPLETED'
                                              AND activity.occurred_at >= target.period_start
                                              AND activity.occurred_at <  target.period_end + 1
GROUP BY target.service_center_activity_target_id, center.service_center_name, activity_type.activity_code;

/* a point account whose cached balance no longer equals its ledger */
CREATE VIEW v_crm_point_account_drift AS
SELECT pa.point_account_id, pa.party_pk, pa.point_type_id, pa.balance,
       COALESCE(SUM(pe.points_delta), 0) AS ledger_balance
FROM crm_point_account pa
LEFT JOIN crm_point_event pe ON pe.point_account_id = pa.point_account_id
GROUP BY pa.point_account_id
HAVING pa.balance <> COALESCE(SUM(pe.points_delta), 0);

/* current holders of every instance, one row per active relationship */
CREATE VIEW v_crm_current_holding AS
SELECT registration.product_instance_id, instance.project_id, instance.external_product_instance_id, instance.instance_kind,
       product.product_id, product.product_name, product.product_class_id,
       registration.party_pk, registration.relationship_code, registration.valid_from, registration.product_registration_id
FROM crm_product_registration registration
JOIN crm_product_instance instance ON instance.product_instance_id = registration.product_instance_id
JOIN crm_product_catalog  product ON product.product_id = instance.product_id
WHERE registration.valid_to IS NULL;


-- ---------------------------------------------------------------------
-- seed vocabularies
-- ---------------------------------------------------------------------
INSERT INTO crm_project (project_code, project_name, project_type_code, source_system_code) VALUES
 ('PLATFORM',  'Vendor platform (PID)',       'PLATFORM', 'VENDOR_ORACLE'),
 ('CRYSTAL',   'Crystal web and console',     'SERVICE',  'CRYSTAL_PG'),
 ('EPRODUCT',  'Eproduct site and agencies',  'SERVICE',  'EPROD_API'),
 ('ESHOP',     'Eshop',                       'COMMERCE', 'ESHOP_API'),
 ('APPSTORE',  'Appstore',                    'SOFTWARE', 'APPSTORE_API'),
 ('KARAOKE',   'Karaoke licence service',     'SOFTWARE', 'LICENSE_DB'),
 ('BMEDIA',    'Broadcast media licences',    'CONTENT',  'MEDIA_DB');

INSERT INTO crm_currency (currency_code, currency_name, is_reporting) VALUES ('USD', 'US dollar', true);

INSERT INTO crm_communication_channel (channel_code, channel_name, required_contact_type) VALUES
 ('EMAIL', 'Email', 'EMAIL'), ('SMS', 'SMS', 'MOBILE'), ('PUSH', 'App push', 'PUSH_TOKEN'),
 ('IN_APP', 'Member inbox', NULL), ('PHONE_CALL', 'Phone call', 'MOBILE');

INSERT INTO crm_communication_purpose (purpose_code, purpose_name, requires_opt_in) VALUES
 ('TRANSACTIONAL', 'Transactional', false), ('SERVICE_NOTICE', 'Service notice', false),
 ('EVENT_NOTICE', 'Event notice', false), ('MARKETING', 'Marketing', true), ('SURVEY', 'Survey', true);

INSERT INTO crm_organization_type (type_code, type_name) VALUES
 ('SALES_AGENCY', 'Sales agency'), ('SERVICE_CENTER_OPERATOR', 'Service centre operator'),
 ('COLLECTION_POINT_OPERATOR', 'Collection point operator'), ('MEDIA_PROVIDER', 'Media provider'),
 ('BUSINESS_CUSTOMER', 'Business customer'), ('SUPPLIER', 'Supplier'), ('LOGISTICS_PARTNER', 'Logistics partner');

INSERT INTO crm_org_contact_role (role_code, role_name) VALUES
 ('OWNER', 'Owner'), ('MANAGER', 'Manager'), ('TECHNICIAN', 'Technician'), ('SALES_STAFF', 'Sales staff'),
 ('FINANCE_CONTACT', 'Finance contact'), ('PROCUREMENT_CONTACT', 'Procurement contact');

INSERT INTO crm_service_center_activity_type (activity_code, activity_name, activity_group, required_capability_code, counts_amount) VALUES
 ('REPAIR_INTAKE', 'Repair taken in', 'SERVICE', 'REPAIR', false),
 ('REPAIR_DELIVERY', 'Repaired device returned', 'SERVICE', 'REPAIR', false),
 ('DEVICE_SALE', 'Phone sold', 'SALES', 'DEVICE_SALE', true),
 ('EPROD_SALE', 'Eproduct sold', 'SALES', 'DEVICE_SALE', true),
 ('APP_INSTALL', 'Apps installed for a customer', 'SOFTWARE', 'APP_INSTALL', true),
 ('LICENCE_ISSUE', 'Licence issued for a customer', 'SOFTWARE', 'LICENCE_ISSUE', true),
 ('REGISTRATION_ASSIST', 'Product registered for a customer', 'SERVICE', 'REGISTRATION_ASSIST', false),
 ('RESERVATION_PICKUP', 'Reserved device picked up', 'EVENT', 'RESERVATION_PICKUP', true),
 ('PRIZE_HANDOVER', 'Prize handed over', 'EVENT', 'PRIZE_PICKUP', false),
 ('PROMOTION_EVENT', 'Promotion event attendee', 'MARKETING', NULL, false),
 ('TRAINING', 'Staff training session', 'OPERATIONS', NULL, false),
 ('INSPECTION', 'Site inspection', 'OPERATIONS', NULL, false),
 ('CUSTOMER_VISIT', 'Customer visit / enquiry', 'SERVICE', NULL, false);

INSERT INTO crm_product_class (class_code, class_name, product_domain, rank_no, legacy_column) VALUES
 ('SMARTPHONE', 'Smartphones', 'SMARTPHONE', NULL, NULL),
 ('EPRODUCT', 'Electronic products', 'EPRODUCT', NULL, NULL),
 ('SOFTWARE', 'Software and licences', 'SOFTWARE', NULL, NULL);
INSERT INTO crm_product_class (class_code, class_name, parent_product_class_id, product_domain, rank_no, legacy_column)
SELECT seed.code, seed.name, parent_class.product_class_id, seed.domain, seed.rank_no, seed.legacy
FROM (VALUES
 ('PHONE_9', 'Phone class 9', 'SMARTPHONE', 'SMARTPHONE', 4, 'phone_9'),
 ('PHONE_7', 'Phone class 7', 'SMARTPHONE', 'SMARTPHONE', 3, 'phone_7'),
 ('PHONE_5', 'Phone class 5', 'SMARTPHONE', 'SMARTPHONE', 2, 'phone_5'),
 ('PHONE_3', 'Phone class 3', 'SMARTPHONE', 'SMARTPHONE', 1, 'phone_3'),
 ('TV_LARGE', 'TV 75-100in, smart', 'EPRODUCT', 'EPRODUCT', 3, 'tv_3'),
 ('TV_MEDIUM', 'TV 50-65in', 'EPRODUCT', 'EPRODUCT', 2, 'tv_2'),
 ('TV_SMALL', 'TV 19-43in', 'EPRODUCT', 'EPRODUCT', 1, 'tv_1'),
 ('STB', 'Set-top box', 'EPRODUCT', 'EPRODUCT', NULL, 'stb'),
 ('NOTECOM', 'Notebook, split, pad', 'EPRODUCT', 'EPRODUCT', NULL, 'notecom'),
 ('PC', 'PC, all-in-one, mini PC', 'EPRODUCT', 'EPRODUCT', NULL, 'pc'),
 ('CAMERA', 'Camera, recorder', 'EPRODUCT', 'EPRODUCT', NULL, 'camera'),
 ('CORDLESS_PHONE', 'Wireless line phone', 'EPRODUCT', 'EPRODUCT', NULL, 'phone'),
 ('OTHER_EPROD', 'Other eproducts', 'EPRODUCT', 'EPRODUCT', NULL, 'other'),
 ('APP', 'Appstore app', 'SOFTWARE', 'SOFTWARE', NULL, NULL),
 ('KARAOKE_LICENCE', 'Karaoke licence', 'SOFTWARE', 'LICENCE', NULL, NULL),
 ('MEDIA_LICENCE', 'Broadcast media licence', 'SOFTWARE', 'LICENCE', NULL, NULL)
) AS seed(code, name, parent, domain, rank_no, legacy)
JOIN crm_product_class parent_class ON parent_class.class_code = seed.parent;

INSERT INTO crm_product_relationship_type (relationship_code, relationship_name, is_exclusive, awards_registration_points) VALUES
 ('OWNER', 'Owner', true, true), ('USER', 'Assigned user', false, false),
 ('REGISTERED_USER', 'Registered user', false, false), ('LESSEE', 'Lessee', false, false),
 ('LICENSEE', 'Licence holder', true, false);

INSERT INTO crm_purchase_purpose (purpose_code, purpose_name) VALUES
 ('PERSONAL_USE', 'Personal use'), ('BUSINESS_USE', 'Business use'), ('GIFT', 'Gift'),
 ('RESALE', 'Resale'), ('REPLACEMENT', 'Replacing an old device');
INSERT INTO crm_product_usage_type (usage_code, usage_name) VALUES
 ('HOME_USE', 'Home'), ('OFFICE_USE', 'Office'), ('SCHOOL', 'School'), ('SHOP', 'Shop'), ('DEMO', 'Demo'), ('TESTING', 'Testing');
INSERT INTO crm_acquisition_type (acquisition_code, acquisition_name) VALUES
 ('PURCHASED', 'Purchased'), ('GIFT', 'Gift'), ('TRANSFER', 'Transfer'), ('SECOND_HAND', 'Second hand'),
 ('COMPANY_ASSIGNED', 'Company assigned'), ('PRIZE', 'Event prize'), ('REPLACEMENT', 'Warranty replacement');

INSERT INTO crm_service_case_type (case_type_code, display_name) VALUES
 ('REPAIR', 'Repair'), ('WARRANTY_REPAIR', 'Warranty repair'), ('COMPLAINT', 'Complaint'), ('INQUIRY', 'Inquiry'),
 ('RETURN_SUPPORT', 'Return support'), ('INSTALLATION', 'Installation'), ('SOFTWARE_SUPPORT', 'Software support');
INSERT INTO crm_service_status (status_code, display_name, sequence_no, is_terminal) VALUES
 ('RECEIVED', 'Received', 1, false), ('DIAGNOSING', 'Diagnosing', 2, false), ('WAITING_PARTS', 'Waiting for parts', 3, false),
 ('WAITING_APPROVAL', 'Waiting for approval', 4, false), ('IN_REPAIR', 'In repair', 5, false),
 ('QUALITY_CHECK', 'Quality check', 6, false), ('READY', 'Ready for collection', 7, false),
 ('CLOSED', 'Closed', 8, true), ('CANCELLED', 'Cancelled', 9, true);
INSERT INTO crm_service_priority (priority_code, priority_name, rank_no) VALUES
 ('LOW', 'Low', 1), ('NORMAL', 'Normal', 2), ('HIGH', 'High', 3), ('URGENT', 'Urgent', 4);

INSERT INTO crm_service_status_map (project_id, source_status_code, service_status_id, source_status_label)
SELECT project.project_id, seed.src, status.service_status_id, seed.label
FROM (VALUES ('0','RECEIVED','Received'), ('1','DIAGNOSING','Diagnosing'), ('2','WAITING_PARTS','Waiting for parts'),
             ('3','WAITING_APPROVAL','Waiting for approval'), ('4','IN_REPAIR','Repairing'), ('5','QUALITY_CHECK','Quality check'),
             ('6','READY','Ready for collection'), ('7','CLOSED','Closed'), ('9','CANCELLED','Cancelled')) AS seed(src, code, label)
JOIN crm_service_status status ON status.status_code = seed.code
JOIN crm_project project ON project.project_code = 'CRYSTAL';

INSERT INTO crm_point_type (point_type_code, point_type_name, owner_project_id, is_dream_managed, decimal_places)
SELECT seed.code, seed.name, project.project_id, seed.managed, seed.dp
FROM (VALUES ('ACTIVITY', 'Activity points', 'PLATFORM', true, 1),
             ('SOFT', 'Software points (Appstore, Karaoke, Media)', NULL, true, 3),
             ('REGISTER', 'Registration points (phone, eproduct)', 'PLATFORM', true, 1),
             ('CRYSTAL', 'Crystal member points', 'CRYSTAL', true, 3),
             ('ESHOP_PRIZE', 'Eshop prize balance', 'ESHOP', false, 3)) AS seed(code, name, proj, managed, dp)
LEFT JOIN crm_project project ON project.project_code = seed.proj;

INSERT INTO crm_point_event_type (event_code, display_name, direction) VALUES
 ('EARN', 'Earned', 1), ('REDEEM', 'Redeemed', -1), ('EXPIRE', 'Expired', -1), ('ADJUST', 'Manual adjustment', 0),
 ('REFUND', 'Refunded', 1), ('RESERVATION_COST', 'Spent on a reservation', -1),
 ('EVENT_AWARD', 'Event award', 1), ('MERGE_CARRY_OVER', 'Carried over from a merged account', 0);

-- ---------------------------------------------------------------------
-- internal departments (design 3.2)
--
-- The design's crm_department. A department says where an employee works;
-- a ROLE says what they may do - permissions stay on manager_roles and the
-- page grid. The console's own managers and manager_roles are not altered:
-- which department a manager is in, and which department a role is meant
-- for, are CRM-owned link tables keyed by their ids.
-- ---------------------------------------------------------------------
CREATE TABLE crm_department (
    department_id                      int            GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    department_code                    varchar(30)    NOT NULL UNIQUE,
    department_name                    varchar(100)   NOT NULL,
    is_active                          boolean        NOT NULL DEFAULT true,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now()
);
COMMENT ON TABLE crm_department IS 'Dream internal functional departments (design crm_department). Descriptive: permissions are granted by roles, never by a department.';

CREATE TABLE crm_manager_department (
    manager_id                         integer        PRIMARY KEY REFERENCES managers(id) ON DELETE CASCADE,
    department_id                      int            NOT NULL REFERENCES crm_department(department_id),
    assigned_at                        timestamptz    NOT NULL DEFAULT now(),
    assigned_by_manager_id             integer        NULL REFERENCES managers(id) ON DELETE SET NULL
);
COMMENT ON TABLE crm_manager_department IS 'The department one console manager belongs to (design crm_internal_user.department_id), kept beside managers rather than in it.';
CREATE INDEX idx_crm_manager_department ON crm_manager_department(department_id);

CREATE TABLE crm_role_department (
    role_id                            integer        PRIMARY KEY REFERENCES manager_roles(id) ON DELETE CASCADE,
    department_id                      int            NOT NULL REFERENCES crm_department(department_id)
);
COMMENT ON TABLE crm_role_department IS 'The department a role is intended for (design crm_role.department_id). A manager in another department may not be given that role from the CRM screen.';

CREATE TRIGGER trg_crm_department_updated BEFORE UPDATE ON crm_department
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

INSERT INTO crm_department (department_code, department_name) VALUES
 ('MARKETING', 'Marketing'), ('SALES', 'Sales'), ('SERVICE', 'After-sales service'),
 ('FINANCE', 'Finance'), ('OPERATIONS', 'Operations'), ('IT', 'Information technology');


-- ---------------------------------------------------------------------
-- the design's analytical vocabularies
-- ---------------------------------------------------------------------

/* The job list a person's job_title_id points at (the vendor's JOBS, in its order). */
INSERT INTO crm_job_title (job_code, job_name, sort_order) VALUES
 ('WORKER', 'Worker', 1), ('FARMER', 'Farmer', 2), ('TEACHER', 'Teacher', 3), ('SCIENTIST', 'Scientist', 4),
 ('ENGINEER', 'Engineer', 5), ('EMPLOYEE', 'Employee', 6), ('ARTISTE', 'Artiste', 7), ('ATHLETE', 'Athlete', 8),
 ('DOCTOR', 'Doctor', 9), ('STUDENT', 'Student', 10), ('PUBLIC_CATERING', 'Public catering', 11),
 ('PUPIL', 'Pupil', 12), ('OTHER', 'Other', 99);

/* Dream-wide grade bands over corporate_score (0-100). A higher rank is a better grade. */
INSERT INTO crm_corporate_grade (grade_code, grade_name, rank_no, min_score, max_score) VALUES
 ('AAA', 'Strategic', 5, 80, NULL),
 ('AA',  'High value', 4, 60, 80),
 ('A',   'Established', 3, 40, 60),
 ('B',   'Developing', 2, 20, 40),
 ('C',   'Occasional', 1, 0, 20);

/* The metrics the analysis run writes. More are added here, not as snapshot columns. */
INSERT INTO crm_metric_definition (metric_code, metric_name, value_type, unit_code, description) VALUES
 ('DAYS_SINCE_LAST_PURCHASE', 'Days since last purchase', 'NUMBER', 'DAYS', 'Whole days from the last transaction in scope to the reference date.'),
 ('CROSS_PROJECT_COUNT', 'Projects active in', 'NUMBER', 'COUNT', 'Projects in which the party had a transaction, a registration or a service case in the last 12 months.'),
 ('PRODUCT_OWNERSHIP_COUNT', 'Products owned', 'NUMBER', 'COUNT', 'Products the party owns or holds a licence for now.'),
 ('CHURN_RISK', 'Churn risk', 'NUMBER', 'SCORE', '0 to 1. Rises with time since the last purchase and with complaints, falls with recent activity.'),
 ('POINTS_BALANCE', 'Points balance, all types', 'NUMBER', 'POINTS', 'Sum of balances across point types - for ranking only, never for spending.'),
 ('IS_MULTI_PROJECT', 'Customer of more than one project', 'BOOLEAN', NULL, 'True when the party holds accounts in two or more projects.'),
 ('LAST_SERVICE_DATE', 'Last service case', 'DATE', NULL, 'Date the most recent service case was received.');

/* What each project may send, and whether it needs consent first (design 5.1). */
INSERT INTO crm_project_communication_option (project_id, purpose_id, channel_id, consent_required)
SELECT project.project_id, purpose.purpose_id, channel.channel_id, seed.needs
FROM (VALUES
  ('CRYSTAL', 'TRANSACTIONAL', 'EMAIL', false), ('CRYSTAL', 'TRANSACTIONAL', 'SMS', false),
  ('CRYSTAL', 'SERVICE_NOTICE', 'SMS', false), ('CRYSTAL', 'SERVICE_NOTICE', 'EMAIL', false),
  ('CRYSTAL', 'MARKETING', 'EMAIL', true), ('CRYSTAL', 'MARKETING', 'SMS', true), ('CRYSTAL', 'SURVEY', 'EMAIL', true),
  ('ESHOP', 'TRANSACTIONAL', 'SMS', false), ('ESHOP', 'MARKETING', 'EMAIL', true), ('ESHOP', 'MARKETING', 'SMS', true),
  ('ESHOP', 'MARKETING', 'PUSH', true),
  ('APPSTORE', 'TRANSACTIONAL', 'IN_APP', false), ('APPSTORE', 'MARKETING', 'PUSH', true), ('APPSTORE', 'MARKETING', 'IN_APP', true),
  ('PLATFORM', 'EVENT_NOTICE', 'SMS', true), ('PLATFORM', 'EVENT_NOTICE', 'IN_APP', false),
  ('PLATFORM', 'MARKETING', 'EMAIL', true), ('PLATFORM', 'MARKETING', 'SMS', true)
) AS seed(project, purpose, channel, needs)
JOIN crm_project project ON project.project_code = seed.project
JOIN crm_communication_purpose purpose ON purpose.purpose_code = seed.purpose
JOIN crm_communication_channel channel ON channel.channel_code = seed.channel;

/* The Eshop's card levels, which are its member tiers. */
INSERT INTO crm_project_tier (project_id, tier_code, tier_name, rank_no, tier_kind, source_code)
SELECT project.project_id, 'LV' || level_no, 'Eshop card level ' || level_no, level_no, 'CARD_CLASS', level_no::text
FROM generate_series(1, 5) AS level_no JOIN crm_project project ON project.project_code = 'ESHOP';

/* The currency the Eshop and the Appstore call native; converted at the rate in system settings. */
INSERT INTO crm_currency (currency_code, currency_name, decimal_places) VALUES ('NTV', 'Native currency', 2);


-- =============================================================================
-- 11. CUSTOMER 360  (also sql/deltas/037_customer_360.sql)
--
-- What the customer record shows that the CRM did not yet keep:
--
--   crm_tag / crm_party_tag             labels staff put on a customer
--   crm_party_relationship_type         spouse, parent company, affiliate ...
--   crm_party_relationship              one customer's relation to another
--   crm_party_interaction               calls, emails, chats and messages, with
--                                       the agent and how it ended
--   crm_party_note / crm_party_file     staff notes and attached documents
--   crm_party_team_member               who looks after the customer
--   crm_party_agreement                 contracts with the customer
--   crm_organization (+5 columns)       local name, size, location, address, about
--                                       (location_pk was headquarters_location_id
--                                       until delta 038)
--
-- New CRM tables and columns only; no Crystal table is touched.
-- =============================================================================

CREATE TABLE crm_tag (
    tag_id                             int            GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    tag_code                           varchar(50)    NOT NULL UNIQUE,
    tag_name                           varchar(100)   NOT NULL,
    color_scheme                       varchar(20)    NOT NULL DEFAULT 'gray'
                                       CHECK (color_scheme IN ('gray','green','blue','purple','pink','orange','red','teal','yellow','cyan')),
    description                        varchar(255)   NULL,
    is_active                          boolean        NOT NULL DEFAULT true,
    created_at                         timestamptz    NOT NULL DEFAULT now()
);
COMMENT ON TABLE crm_tag IS 'Labels staff put on customers (High value, Early adopter ...). Basic data.';

CREATE TABLE crm_party_tag (
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk) ON DELETE CASCADE,
    tag_id                             int            NOT NULL REFERENCES crm_tag(tag_id) ON DELETE CASCADE,
    tagged_at                          timestamptz    NOT NULL DEFAULT now(),
    tagged_by_manager_id               integer        NULL REFERENCES managers(id) ON DELETE SET NULL,
    PRIMARY KEY (party_pk, tag_id)
);
CREATE INDEX idx_crm_party_tag_tag ON crm_party_tag(tag_id);

CREATE TABLE crm_party_relationship_type (
    relationship_type_code             varchar(40)    PRIMARY KEY,
    relationship_name                  varchar(100)   NOT NULL,
    inverse_code                       varchar(40)    NOT NULL,
    applies_to                         varchar(20)    NOT NULL CHECK (applies_to IN ('PERSON','ORGANIZATION','ANY')),
    is_hierarchy                       boolean        NOT NULL DEFAULT false,
    sort_order                         smallint       NOT NULL DEFAULT 0,
    is_active                          boolean        NOT NULL DEFAULT true
);
COMMENT ON TABLE crm_party_relationship_type IS 'A row (A, B, T) reads "B is the T of A"; inverse_code is what A is to B. is_hierarchy marks the parent-company link the group tree follows.';

CREATE TABLE crm_party_relationship (
    party_relationship_id              bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk) ON DELETE CASCADE,
    related_party_pk                   bigint    NOT NULL REFERENCES crm_party(party_pk) ON DELETE CASCADE,
    relationship_type_code             varchar(40)    NOT NULL REFERENCES crm_party_relationship_type(relationship_type_code),
    status                             varchar(20)    NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ENDED')),
    valid_from                         date           NULL,
    valid_to                           date           NULL,
    note                               varchar(255)   NULL,
    created_by_manager_id              integer        NULL REFERENCES managers(id) ON DELETE SET NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT chk_crm_party_rel_self CHECK (party_pk <> related_party_pk),
    CONSTRAINT chk_crm_party_rel_period CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);
CREATE UNIQUE INDEX uq_crm_party_rel_active ON crm_party_relationship(party_pk, related_party_pk, relationship_type_code) WHERE status = 'ACTIVE';
CREATE INDEX idx_crm_party_rel_related ON crm_party_relationship(related_party_pk, status);

CREATE TABLE crm_party_interaction (
    interaction_id                     bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk) ON DELETE CASCADE,
    project_id                         int            NULL REFERENCES crm_project(project_id),
    direction                          varchar(10)    NOT NULL CHECK (direction IN ('INBOUND','OUTBOUND')),
    channel_code                       varchar(20)    NOT NULL CHECK (channel_code IN ('EMAIL','PHONE','SMS','CHAT','IN_PERSON','APP','WEB','LETTER','PUSH')),
    interaction_type                   varchar(30)    NOT NULL CHECK (interaction_type IN ('GENERAL_INQUIRY','PRODUCT_SUPPORT','ORDER_INQUIRY',
                                                     'COMPLAINT','FEEDBACK','SALES','SERVICE_NOTICE','MARKETING','FOLLOW_UP')),
    purpose_id                         int            NULL REFERENCES crm_communication_purpose(purpose_id),
    subject                            varchar(250)   NOT NULL,
    body                               text           NULL,
    case_id                            bigint         NULL REFERENCES crm_service_case(case_id) ON DELETE SET NULL,
    contact_point_id                   bigint         NULL REFERENCES crm_contact_point(contact_point_id) ON DELETE SET NULL,
    destination_snapshot               varchar(500)   NULL,
    manager_id                         integer        NULL REFERENCES managers(id) ON DELETE SET NULL,
    outcome_code                       varchar(20)    NOT NULL CHECK (outcome_code IN ('ANSWERED','FOLLOW_UP','RESOLVED','CLOSED','NO_ANSWER','QUEUED','SENT','FAILED')),
    occurred_at                        timestamptz    NOT NULL DEFAULT now(),
    duration_seconds                   integer        NULL CHECK (duration_seconds >= 0),
    created_at                         timestamptz    NOT NULL DEFAULT now()
);
COMMENT ON TABLE crm_party_interaction IS 'One contact with a customer outside a campaign: a call taken, an email answered, a message sent from the customer record.';
CREATE INDEX idx_crm_party_interaction_party ON crm_party_interaction(party_pk, occurred_at DESC);
CREATE INDEX idx_crm_party_interaction_case ON crm_party_interaction(case_id) WHERE case_id IS NOT NULL;

CREATE TABLE crm_party_note (
    note_id                            bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk) ON DELETE CASCADE,
    note_text                          text           NOT NULL,
    is_pinned                          boolean        NOT NULL DEFAULT false,
    created_by_manager_id              integer        NULL REFERENCES managers(id) ON DELETE SET NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    deleted_at                         timestamptz    NULL
);
CREATE INDEX idx_crm_note_party ON crm_party_note(party_pk, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE crm_party_file (
    file_id                            bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk) ON DELETE CASCADE,
    file_name                          varchar(255)   NOT NULL,
    storage_key                        varchar(255)   NOT NULL UNIQUE,
    content_type                       varchar(100)   NOT NULL,
    byte_size                          bigint         NOT NULL CHECK (byte_size >= 0),
    description                        varchar(255)   NULL,
    uploaded_by_manager_id             integer        NULL REFERENCES managers(id) ON DELETE SET NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    deleted_at                         timestamptz    NULL
);
COMMENT ON TABLE crm_party_file IS 'A document kept with a customer. The bytes live in the private CRM file folder, never under the public uploads; storage_key is the name there.';
CREATE INDEX idx_crm_file_party ON crm_party_file(party_pk, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE crm_party_team_member (
    team_member_id                     bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk) ON DELETE CASCADE,
    manager_id                         integer        NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
    team_role                          varchar(30)    NOT NULL CHECK (team_role IN ('ACCOUNT_MANAGER','SALES_REP','SUPPORT_MANAGER')),
    assigned_at                        timestamptz    NOT NULL DEFAULT now(),
    ended_at                           timestamptz    NULL,
    assigned_by_manager_id             integer        NULL REFERENCES managers(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX uq_crm_team_role_current ON crm_party_team_member(party_pk, team_role) WHERE ended_at IS NULL;
CREATE INDEX idx_crm_team_manager ON crm_party_team_member(manager_id) WHERE ended_at IS NULL;

CREATE TABLE crm_party_agreement (
    agreement_id                       bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    party_pk                           bigint    NOT NULL REFERENCES crm_party(party_pk) ON DELETE CASCADE,
    agreement_no                       varchar(60)    NULL,
    agreement_type                     varchar(30)    NOT NULL CHECK (agreement_type IN ('ENTERPRISE','RESELLER','DISTRIBUTION','SERVICE_LEVEL','PURCHASE','PARTNERSHIP')),
    title                              varchar(200)   NULL,
    start_date                         date           NOT NULL,
    end_date                           date           NULL,
    renewal_date                       date           NULL,
    status                             varchar(20)    NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','EXPIRED','TERMINATED')),
    annual_value                       numeric(20,4)  NULL CHECK (annual_value >= 0),
    currency_code                      varchar(3)     NULL REFERENCES crm_currency(currency_code),
    note                               text           NULL,
    created_by_manager_id              integer        NULL REFERENCES managers(id) ON DELETE SET NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    updated_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT chk_crm_agreement_period CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX idx_crm_agreement_party ON crm_party_agreement(party_pk, status);

ALTER TABLE crm_organization ADD COLUMN local_name varchar(250) NULL;
ALTER TABLE crm_organization ADD COLUMN employee_count_band varchar(20) NULL
    CHECK (employee_count_band IN ('1-10','11-50','51-200','201-1000','1001-5000','5001+'));
ALTER TABLE crm_organization ADD COLUMN description text NULL;
ALTER TABLE crm_organization ADD COLUMN location_pk bigint NULL REFERENCES crm_location(location_pk);
ALTER TABLE crm_organization ADD COLUMN headquarters_address varchar(255) NULL;

INSERT INTO crm_tag (tag_code, tag_name, color_scheme) VALUES
 ('HIGH_VALUE', 'High value', 'green'), ('TECH_ENTHUSIAST', 'Tech enthusiast', 'blue'), ('EARLY_ADOPTER', 'Early adopter', 'pink'),
 ('VIP', 'VIP', 'purple'), ('PRICE_SENSITIVE', 'Price sensitive', 'orange'), ('NEEDS_ATTENTION', 'Needs attention', 'red'),
 ('KEY_ACCOUNT', 'Key account', 'purple'), ('STRATEGIC_ACCOUNT', 'Strategic account', 'teal');

INSERT INTO crm_party_relationship_type (relationship_type_code, relationship_name, inverse_code, applies_to, is_hierarchy, sort_order) VALUES
 ('SPOUSE', 'Spouse', 'SPOUSE', 'PERSON', false, 1),
 ('PARENT', 'Parent', 'CHILD', 'PERSON', false, 2),
 ('CHILD', 'Child', 'PARENT', 'PERSON', false, 3),
 ('SIBLING', 'Sibling', 'SIBLING', 'PERSON', false, 4),
 ('RELATIVE', 'Family member', 'RELATIVE', 'PERSON', false, 5),
 ('REFERRER', 'Referred by', 'REFERRAL', 'ANY', false, 6),
 ('REFERRAL', 'Referred', 'REFERRER', 'ANY', false, 7),
 ('PARENT_COMPANY', 'Parent company', 'SUBSIDIARY', 'ORGANIZATION', true, 10),
 ('SUBSIDIARY', 'Subsidiary', 'PARENT_COMPANY', 'ORGANIZATION', false, 11),
 ('AFFILIATE', 'Affiliate', 'AFFILIATE', 'ORGANIZATION', false, 12),
 ('PARTNER', 'Business partner', 'PARTNER', 'ORGANIZATION', false, 13);

INSERT INTO crm_org_contact_role (role_code, role_name) VALUES
 ('DECISION_MAKER', 'Decision maker'), ('INFLUENCER', 'Influencer'), ('PURCHASING', 'Purchasing'),
 ('OPERATIONAL', 'Operational'), ('REPRESENTATIVE', 'Legal representative')
ON CONFLICT (role_code) DO NOTHING;


COMMIT;


CREATE TABLE crm_registration_intake (
 intake_id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
 source_project_id bigint REFERENCES crm_project(project_id),
 source_record_id text,
 category text NOT NULL DEFAULT 'PERSON' CHECK (category IN ('PERSON','ESHOP')),
 status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','MERGED','CREATED','ASSIGNED','REJECTED')),
 payload jsonb NOT NULL,
 candidates jsonb NOT NULL DEFAULT '[]',
 party_pk bigint REFERENCES crm_party(party_pk),
 reviewed_by_manager_id integer REFERENCES managers(id),
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_project_id,source_record_id,category)
);
CREATE INDEX idx_crm_intake_pending ON crm_registration_intake(category,status,created_at);
CREATE TABLE crm_identity_resolution (
 resolution_id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
 intake_id bigint NOT NULL UNIQUE REFERENCES crm_registration_intake(intake_id),
 source_project_id bigint REFERENCES crm_project(project_id),
 source_record_id text,
 party_pk bigint NOT NULL REFERENCES crm_party(party_pk),
 outcome text NOT NULL,
 acknowledged_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

-- Rows of a customer Excel import that failed the file check. Valid rows are
-- imported; these are kept with their reasons so an administrator can see and
-- fix what was not loaded.
CREATE TABLE crm_person_import_error (
    import_error_id                    bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    batch_hash                         char(64)       NOT NULL,
    file_name                          varchar(255)   NULL,
    row_number                         int            NOT NULL,
    cells                              jsonb          NOT NULL,
    errors                             jsonb          NOT NULL,
    status                             varchar(20)    NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','DISMISSED')),
    imported_by_manager_id             integer        NULL REFERENCES managers(id) ON DELETE SET NULL,
    dismissed_by_manager_id            integer        NULL REFERENCES managers(id) ON DELETE SET NULL,
    dismissed_at                       timestamptz    NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT uq_crm_person_import_error_row UNIQUE (batch_hash, row_number)
);
COMMENT ON TABLE crm_person_import_error IS 'Customer Excel import rows that failed the file check, with the cells as written and every reason. Valid rows of the same file are imported.';
CREATE INDEX idx_crm_person_import_error_open ON crm_person_import_error(status, created_at);

CREATE TABLE crm_project_api_key (
    api_key_id                         bigint         GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    project_id                         int            NOT NULL REFERENCES crm_project(project_id),
    key_prefix                         varchar(16)    NOT NULL UNIQUE,
    key_hash                           char(64)       NOT NULL,
    label                              varchar(100)   NOT NULL,
    last_used_at                       timestamptz    NULL,
    revoked_at                         timestamptz    NULL,
    created_at                         timestamptz    NOT NULL DEFAULT now()
);
COMMENT ON TABLE crm_project_api_key IS 'Keys a department system uses for /api/integration/crm. Only the SHA-256 of the secret is stored; the project comes from the key, never the request.';
CREATE INDEX idx_crm_project_api_key_project ON crm_project_api_key(project_id) WHERE revoked_at IS NULL;
