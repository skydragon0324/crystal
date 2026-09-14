-- ---------------------------------------------------------------------
-- Delta 004 - the service centre address book, cut back and split by section.
--
--   1. agencies loses seven columns
--   2. agency_services gains `section`
--
-- sql/schema.sql is the source of truth and already says all of this; this
-- file brings an existing database up to it, and every statement is safe to
-- run twice.
-- ---------------------------------------------------------------------


-- =====================================================================
-- 1. agencies: name, province, address, phone, tier, status - plus the three
--    the service system genuinely runs on.
--
-- WHAT GOES, and why none of it is load bearing:
--   province_code   a duplicate of `province` in short form
--   district        never shown anywhere
--   business_hours  a free string on the locator card
--   opened_on       recorded and never read
--   latitude        )  the locator's "nearest first" sort. It is now ordered
--   longitude       )  by province and tier instead, which is what the
--                      province dropdown above it was always really for.
--   city            part of the address; the address column carries it
--
-- WHAT STAYS, and why:
--   code            the natural key the whole service system joins on -
--                   tickets, stock, technicians and the seeds all address a
--                   centre by it
--   sla_hours       the promised turnaround a ticket is measured against
--   daily_capacity  what v_agency_health divides the open count by
-- =====================================================================

-- The view reads a.city, so it has to be rebuilt before the column can go.
DROP VIEW IF EXISTS v_agency_health;

DROP INDEX IF EXISTS idx_agencies_area;

ALTER TABLE agencies DROP COLUMN IF EXISTS province_code;
ALTER TABLE agencies DROP COLUMN IF EXISTS district;
ALTER TABLE agencies DROP COLUMN IF EXISTS business_hours;
ALTER TABLE agencies DROP COLUMN IF EXISTS opened_on;
ALTER TABLE agencies DROP COLUMN IF EXISTS latitude;
ALTER TABLE agencies DROP COLUMN IF EXISTS longitude;
ALTER TABLE agencies DROP COLUMN IF EXISTS city;

CREATE INDEX IF NOT EXISTS idx_agencies_area ON agencies(province);

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



-- =====================================================================
-- 2. agency_services gains a SECTION.
--
-- One centre, two lists. The same building repairs a handset and a set-top
-- box, but they are different businesses to the people who run them: a
-- different manager, a different service vocabulary, and a different page in
-- the console.
--
-- Splitting `agencies` into two tables would have meant one real place
-- described twice, with two addresses to keep in step when it moves. The
-- split belongs on what a centre OFFERS, which is this table.
-- =====================================================================

ALTER TABLE agency_services ADD COLUMN IF NOT EXISTS
    section varchar(20) NOT NULL DEFAULT 'SMARTPHONE';

DO $$
BEGIN
    ALTER TABLE agency_services ADD CONSTRAINT agency_services_section_check
        CHECK (section IN ('SMARTPHONE','EPRODUCT'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- A centre can offer REPAIR in both sections, so the key grows the section.
ALTER TABLE agency_services DROP CONSTRAINT IF EXISTS uq_agency_service;

DO $$
BEGIN
    ALTER TABLE agency_services ADD CONSTRAINT uq_agency_service
        UNIQUE (agency_id, section, service_type);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_agency_services_section
    ON agency_services(section, service_type);
