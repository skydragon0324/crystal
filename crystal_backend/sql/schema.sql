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
 * THE FIVE CRYSTAL SYSTEMS a customer can be standing in front of, and the
 * seven places an enquiry can arrive from - which is those five plus the two
 * registration flows. Two types rather than one, because a published answer
 * cannot be filed under a step in a flow.
 */
CREATE TYPE crystal_system AS ENUM (
    'SMARTPHONE', 'EPRODUCT', 'ESHOP', 'APPSTORE', 'CRYSTAL_APP');
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
    price             numeric(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
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

CREATE TABLE agencies (
    id             serial        PRIMARY KEY,
    name           varchar(160)  NOT NULL,
    code           varchar(40)   NULL UNIQUE,
    province       varchar(80)   NOT NULL,
    address        varchar(255)  NOT NULL,
    phone          varchar(40)   NULL,
    tier           smallint      NOT NULL DEFAULT 1 CHECK (tier BETWEEN 0 AND 3),
    sla_hours      integer       NOT NULL DEFAULT 72 CHECK (sla_hours > 0),
    daily_capacity integer       NOT NULL DEFAULT 20 CHECK (daily_capacity > 0),
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

CREATE INDEX idx_agencies_area   ON agencies(province);
CREATE INDEX idx_agencies_status ON agencies(status);

CREATE TRIGGER trg_agencies_updated
    BEFORE UPDATE ON agencies
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

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
     * WHICH CRYSTAL SYSTEM the question is about - the same five values the
     * feedback threads are routed by, so a question and an enquiry about the
     * same thing are not filed under two different words.
     *
     * It used to be the TOPIC: warranty, repair, account, OS, order. A real
     * axis, but not the one a visitor arrives on - somebody with a set-top
     * box problem looks for the product in their hands, not for a subject
     * heading. The topic survives in the wording of the question, which is
     * where it was already legible.
     */
    category            crystal_system NOT NULL,
    product_category_id integer      NULL REFERENCES product_categories(id) ON DELETE SET NULL,
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
  'WHICH CRYSTAL SYSTEM the question is about, from the same five the feedback
   threads are routed by. Not the topic: a visitor arrives holding a product,
   not holding a subject heading.';
COMMENT ON COLUMN faqs.product_category_id IS
  'which storefront catalogue section, one level finer than the category above
   and only meaningful under SMARTPHONE and EPRODUCT; NULL applies to all';
COMMENT ON COLUMN faqs.view_count IS 'drives the support page''s "Popular Problems" block';

CREATE INDEX idx_faqs_category ON faqs(category, status);
CREATE INDEX idx_faqs_views    ON faqs(view_count DESC);

CREATE TRIGGER trg_faqs_updated
    BEFORE UPDATE ON faqs
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


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
    starts_at    timestamptz  NULL,
    ends_at      timestamptz  NULL,
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
    point_balance     integer       NOT NULL DEFAULT 0,
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
    amount        integer      NOT NULL,
    balance_after integer      NOT NULL,
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
-- 8.9 THE ABOUT PAGE
--
-- Ten chapters of corporate storytelling - who we are, what we sell, what we
-- have been recognised for, eleven years of history, the institute, the
-- factory, how we manufacture, the shop, after-service, and where we are.
--
-- ONE TABLE, AND IT HOLDS ONLY PICTURES.
--
-- There were three here, with ten console screens editing them, and the copy
-- lived in the database. That was the wrong shape: a company description is
-- not content that turns over, it is the company's own account of itself,
-- rewritten every few years by somebody who cares about the wording. As rows
-- it could not be reviewed, diffed or translated alongside the rest of the
-- site's words, and ten screens existed to edit text nobody edits.
--
-- So the words moved to crystal-web/src/pages/about/content.js, where they
-- are under review like every other line in the project. What could not move
-- is the photographs - a picture of the factory floor is uploaded, replaced
-- when the floor is repainted, and has to be served from somewhere.
--
-- See sql/deltas/019 for what was dropped and why.
-- =====================================================================

/*
 * THE ABOUT PAGE IS WRITTEN IN CODE, and only its pictures are data.
 *
 * There were three tables here - ten chapters of copy, sixty-two bullets and
 * fourteen certificates - with ten console screens editing them. That was the
 * wrong shape for what the page is: a company's own description of itself,
 * rewritten every few years by somebody who cares about the wording. As data
 * it could not be reviewed, diffed or translated with the rest of the site's
 * words, and ten screens existed to change text nobody changes.
 *
 * The copy is now crystal-web/src/pages/about/content.js. What could not move
 * is the photographs - a picture of the factory floor is uploaded and replaced
 * and has to be served from somewhere - so one table holds those and nothing
 * else. See sql/deltas/019.
 */
CREATE TABLE about_images (
    id             serial       PRIMARY KEY,

    /*
     * WHERE ON THE PAGE THIS PICTURE GOES - 'hero', 'factory.floor',
     * 'certificate'. A slot holds one image or many.
     *
     * A plain varchar rather than an enum, which is a change of mind from the
     * enum the old sections used: a slot is not a vocabulary the database has
     * an opinion about. The page decides what it asks for, and adding a band
     * to a static page should not need a migration to give it a photograph.
     */
    slot           varchar(60)  NOT NULL,

    file_path      varchar(255) NOT NULL,

    /*
     * The dark variant, optional, falling back to the light one. A photograph
     * must never be inverted to fit a colour mode; a diagram or a map often
     * has a dark rendering, and when there is one it should be used.
     */
    file_path_dark varchar(255) NULL,

    /* The two strings that belong to the FILE rather than to the page. */
    alt_text       varchar(255) NULL,
    caption        varchar(200) NULL,

    sort_order     integer      NOT NULL DEFAULT 0,
    status         record_status NOT NULL DEFAULT 'ACTIVE',
    is_deleted     boolean      NOT NULL DEFAULT false,
    created_at     timestamptz  NOT NULL DEFAULT now(),
    updated_at     timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON TABLE about_images IS
  'the only part of the About page that is data; its copy is in
   crystal-web/src/pages/about/content.js';
COMMENT ON COLUMN about_images.caption IS
  'shown under a gallery image. NULL for a slot the page captions itself.';

CREATE INDEX idx_about_images_slot ON about_images(slot, sort_order);

CREATE TRIGGER trg_about_images_updated
    BEFORE UPDATE ON about_images
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();



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


COMMIT;
