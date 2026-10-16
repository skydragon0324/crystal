# Customer Lifecycle KPI and Transition Analytics — Implementation Requirements

**Target repositories:** `crystal_backend` (Node.js API, jobs, Oracle + PostgreSQL access) and `crystal_admin` (existing administration UI).  
**Existing source writer:** `vendor_backend` (app/web login events written to Oracle).  
**Source of truth:** Oracle. **Analytical datastore:** PostgreSQL.  
**Document purpose:** A production-oriented specification that can be handed to Claude Code. Inspect the real repositories before selecting libraries, migration syntax, folders, or UI components.

## 1. Objective and scope

Build an admin feature that computes and displays login-based customer lifecycle statuses and their history. Admins must be able to:

1. View **New, Active, Dormant, Churned**, and Total registered customer counts as of historical dates.
2. Select a date range; group results by calendar day, calendar week, or consecutive custom N-day buckets (2, 3, 7, etc.).
3. Inspect a status trend chart and corresponding numerical table. Point-in-time counts are **stock** metrics, never a sum of daily customer counts.
4. Analyze **transition/flow** counts within a period, including Dormant → Active, Dormant → Churned, Churned → Active, Active → Dormant, New → Active, and New → Dormant.
5. Open a paginated list of transition events and see the corresponding customer name, birthdate, contact phone(s), occupation, location/address, event time, previous status, new status, last login, and current status.
6. View an individual customer's full timeline and login recency.
7. Compare customer populations and transitions around a user-entered or saved business-event timestamp, not only calendar week boundaries.
8. See ingestion freshness and analytics job health. Authorized operators can request a safe reconciliation/rebuild.

**Out of scope for v1:** Predictive churn models, notification campaigns, billing, changing account status in Oracle, modifying mobile/web authentication, and pretending login activity measures all customer engagement. Always label the classification **login-based**.

## 2. Discover and honor the existing codebase

Claude must inspect `crystal_backend`, `crystal_admin`, and (read-only unless separately approved) the relevant Oracle-writing logic in `vendor_backend` before coding. Identify actual package managers, Node versions, routing/controllers, data access/ORM/query builder, migrations, Oracle/PostgreSQL clients and pooling, scheduler/worker arrangement, admin authentication/permissions, API response envelope, testing conventions, frontend framework, chart library, table/grid components, style system, and environment-variable conventions.

**Reuse existing infrastructure and conventions. Do not build a separate service or replace frameworks merely for this feature.** Avoid changing `vendor_backend` and Oracle DDL in the first implementation unless specifically approved. Never write analytics lifecycle status into `USERS.STATUS`; it is the source account active/inactive flag, not lifecycle classification.

Deliver changes to `crystal_backend` and `crystal_admin` with migrations, tests, runbook, and example environment variables. Do not assume a particular frontend framework just because the backend is Node.js.

## 3. Oracle source model and data rules

Existing Oracle objects:

- `USERS(USER_PK, USER_ID, USER_NAME, BIRTHDAY, JOB, LOCATION_PK, STATUS, CREATED_AT, UPDATED_AT, ...)`
- `USER_LOGIN_LOG(TABLE_PK, USER_PK, ACTION_AT, CID, PHONE_BRAND, PHONE_MODEL, PHONE_IMEI, ...)`
- `USER_PHONE_NUMBERS(PHONE_PK, USER_PK, PHONE_NUMBER, PHONE_TYPE, CREATED_AT, UPDATED_AT)`
- `LOCATIONS` exists but its shape must be inspected in the actual database/project.

Interpret `USER_LOGIN_LOG.ACTION_AT` as **login event time**, not row insertion time. `USERS.CREATED_AT` is registration time. `USERS.STATUS` is independent operational account status (0/1). Oracle `DATE` carries date/time without time-zone metadata: explicitly configure **SOURCE_TIMEZONE** and **REPORT_TIMEZONE** (IANA time zones), validate the real source convention, and convert Oracle timestamps to PostgreSQL `timestamptz` consistently. The existing system may use one business time zone, but do not silently assume UTC. Never use server-local time implicitly.

`USER_PHONE_NUMBERS` can have multiple entries. A report row must not multiply a customer because of joins. Show one deterministic **display phone** in report rows and provide all available numbers in the detail view. If no business-designated primary exists, do **not** describe the selected number as a verified primary. Document the selection policy (suggested deterministic order: most recent `UPDATED_AT`, then `PHONE_PK`). Map job code to occupation description only if an authoritative source lookup exists. Derive address through the real `LOCATIONS` relationship, not guessed field names.

Exclude credentials, citizen IDs, CID, IMEI and handset identifiers from the PostgreSQL KPI dataset; none is needed for lifecycle metrics. Enforce access controls around copied contact and birthdate data.

## 4. Status calculation — authoritative, testable business contract

**Version 1 uses rolling elapsed 30 and 90 days (720 hours and 2160 hours), not calendar months.** Calculate thresholds on normalized instants (UTC) so a daylight-saving boundary does not silently turn 30 elapsed days into 29 days 23 hours or 30 days 1 hour. Use the reporting time zone only to define local calendar buckets. Define event-time status as of instant `T`, for users registered no later than `T`:

- **NEW:** `T < registered_at + 30 days` (takes precedence over activity).
- **ACTIVE:** otherwise, `T < effective_last_activity_at + 30 days`.
- **DORMANT:** otherwise, `T < effective_last_activity_at + 90 days`.
- **CHURNED:** otherwise.

Here, `effective_last_activity_at = MAX(registered_at, latest valid login at or before T)`; if the user never logged in, use registration time. At the **exact** 30-day boundary the activity is no longer Active; at the **exact** 90-day boundary it is Churned. The first 30 days are always New even after logging in. The four statuses are mutually exclusive and exhaustive for users already registered.

A login resets the inactivity deadline, but an Active → Active login **does not create a redundant transition**. Statuses change at calculated deadlines even if **no new login** occurs. Persist the **effective event timestamp** of such a transition, not the background job's processing time.

The default reporting population is **all registered users**, including operational `USERS.STATUS=0`; add an optional account-status filter only if supported consistently by the reporting query. Do not mix operational account status and lifecycle status. Existing users with future or impossible timestamps are reported as data-quality exceptions, not silently treated as valid.

**Status semantics are configuration/version controlled.** Changing the 30/90-day rule requires explicit backfill of affected historical periods and snapshots; never silently change historical definitions.

## 5. Critical distinction: stock counts vs transition counts vs endpoint migration

Implement and label three different metric modes:

1. **Status stock:** Number of distinct customers in each status at the end of each selected reporting bucket. `NEW + ACTIVE + DORMANT + CHURNED = TOTAL` at every cutoff. Never SUM multiple daily stock counts.
2. **Transition flow:** Number of actual status-change events with `transitioned_at` inside `[from, to)`. A customer may contribute multiple transitions. Supply optional `COUNT(DISTINCT user_pk)` to show unique transitioned customers, distinctly labeled.
3. **Start → end cohort matrix:** One pair of statuses per customer, comparing the status immediately at the specified starting instant and at the ending instant. This is not identical to counting intermediate transition events.

**New registration count** is the number of registrations in the date window, which is different from the number of New-status customers at the window end. **Churn inflow** is Dormant → Churned transitions, not the size of the Churned population. Define denominators and cohorts explicitly for rates.

## 6. Architecture and data ownership

```text
vendor_backend / mobile + web login
             |
             v
      Oracle operational DB
      USERS / USER_LOGIN_LOG / USER_PHONE_NUMBERS / LOCATIONS
             | (read/synchronize)
             v
     crystal_backend Node.js
     - historical importer
     - incremental source synchronizer
     - lifecycle rules + history builder
     - inactivity deadline processor
     - KPI snapshot / reconciliation jobs
     - admin-protected analytics API
             |
             v
      PostgreSQL analytics DB
      - minimal source event journal
      - customer reporting profile
      - current lifecycle state
      - status periods / transitions
      - daily stock snapshots
      - business events
      - ingestion checkpoints / job audit
             |
             v
       crystal_admin UI
```

Keep the original Oracle tables authoritative for logins and registration. PostgreSQL tables are derived/read models: safe to rebuild, with a documented correction/replay process. Use the existing Oracle and PostgreSQL connection pools. Do not send request-path writes from `vendor_backend` to PostgreSQL as a naive dual write; failures across two databases are not atomic.

## 7. Proposed PostgreSQL logical schema

Implement real versioned migrations in the project's existing migration style. Names below are suggestions; follow repository conventions while preserving semantics.

### 7.1 `lifecycle_customer_profile`

- `user_pk bigint PRIMARY KEY` — Oracle user key.
- `user_id text`, `user_name text`, `birthday date NULL`, `job_code smallint NULL`, `location_pk bigint NULL`, `display_phone text NULL`, `oracle_account_status smallint NULL`.
- `registered_at timestamptz NOT NULL`, `source_updated_at timestamptz NULL`, `synced_at timestamptz NOT NULL`.
- Add an address display value **only after** verifying the Oracle `LOCATIONS` schema; alternatively resolve address on demand for detail views. Minimize personal data replicated.

### 7.2 `lifecycle_login_event`

A **minimal, idempotent local event journal** needed for backfill, correcting late events and rebuilding a customer's timeline without repeatedly scanning all Oracle logs:

- `source_table_pk bigint PRIMARY KEY` (Oracle `USER_LOGIN_LOG.TABLE_PK`).
- `user_pk bigint NOT NULL`.
- `action_at timestamptz NOT NULL`.
- `ingested_at timestamptz NOT NULL`.
- Index `(user_pk, action_at, source_table_pk)`.
- Deliberately **do not** copy IMEI, CID, device details, or phone identity metadata.

### 7.3 `lifecycle_customer_current`

- `user_pk bigint PRIMARY KEY` and FK to profile.
- `status varchar(10)` with check NEW/ACTIVE/DORMANT/CHURNED.
- `status_since timestamptz NOT NULL`.
- `last_login_at timestamptz NULL`.
- `effective_last_activity_at timestamptz NOT NULL`.
- `next_transition_at timestamptz NULL` — due time for automatic status progression, recalculated after login.
- `computed_at timestamptz NOT NULL`.
- Index `next_transition_at WHERE next_transition_at IS NOT NULL`.

### 7.4 `lifecycle_customer_period`

This is the **canonical historical truth** about lifecycle state:

- `user_pk bigint NOT NULL`.
- `status varchar(10) NOT NULL`.
- `previous_status varchar(10) NULL`.
- `valid_from timestamptz NOT NULL`.
- `valid_to timestamptz NULL` (open current interval).
- `reason varchar(30) NOT NULL` (e.g. REGISTRATION, LOGIN, NEW_EXPIRED, INACTIVITY_30, INACTIVITY_90).
- `rule_version integer NOT NULL DEFAULT 1`.
- Unique `(user_pk, valid_from)` (or an appropriate surrogate ID with corresponding uniqueness).
- Index `(previous_status, status, valid_from DESC)`, `(valid_from)`, and indexed lookup for `user_pk` + period.
- Enforce one open interval per customer via a partial unique index on `(user_pk) WHERE valid_to IS NULL`.
- Maintain nonoverlapping **half-open intervals** `[valid_from, valid_to)`, optionally enforcing with PostgreSQL exclusion constraints if compatible with deployment. No gaps after registration. Do not produce Active → Active rows.

An actual transition event can be derived from every row except the initial registration row; `previous_status` refers to the immediately preceding historical interval.

### 7.5 `lifecycle_kpi_daily`

- `snapshot_date date PRIMARY KEY` in reporting time zone.
- `new_count bigint`, `active_count bigint`, `dormant_count bigint`, `churned_count bigint`, `total_count bigint`, all nonnegative.
- `registered_count bigint` (registrations occurring during that day; **flow**, not stock).
- `recalculated_at timestamptz`, `rule_version integer`, optional `is_final boolean`.
- One row per calendar day, not per user per day.
- **End-of-day meaning:** Include registrations and transitions strictly earlier than next local midnight; exclude events exactly at next midnight. Preserve this convention for historical snapshot builds, API, chart and tests.
- Prefer sweep-line daily deltas from registrations + status changes or range-based repair, not one full source scan per day.

### 7.6 `lifecycle_business_event`

- `event_id` primary key; `name`, `description` optional, `event_at timestamptz NOT NULL`, optional event category, `created_by`, `created_at`.
- Used to compare fixed customer cohorts and transition flows in before/after windows; admin authorized CRUD.
- Show comparisons but **never claim causality** from pre/post correlations alone.

### 7.7 `lifecycle_sync_checkpoint` and `lifecycle_job_run`

- Track source cursor/checkpoint, last successful ingest, last reconciliation, row counts, job start/finish, error, status, and a rule/schema version.
- Job/rebuild handlers must be resumable and idempotent.
- Use a PostgreSQL advisory lock or existing distributed scheduler locking so multiple Node instances cannot run the same writer concurrently.

## 8. Source synchronization — safety requirements

The source `USER_LOGIN_LOG` has `TABLE_PK` and `ACTION_AT` but **no reliable insertion/update timestamp shown**. A simple `WHERE TABLE_PK > last_seen_pk` can skip records under concurrent transactions if PK assignment and commit order differ. `ACTION_AT` is the event timestamp and can be backdated; it is **not** a safe insert watermark. Therefore:

**V1 with no change to `vendor_backend` or Oracle DDL:**

- Perform an initial import with keyset pagination or a streamed Oracle cursor; process in bounded batches (e.g. 2,000–10,000) and bulk upsert into PostgreSQL by `source_table_pk`.
- Use a high-water scan with a **configurable overlapping PK window** as a practical near-term ingestion mechanism; tolerate replays via unique keys.
- Add a **scheduled full source key reconciliation** (stream source `TABLE_PK` values and compare with the local journal in batches) to find anything skipped or missing. Import missing records and rebuild affected customers. Schedule off-peak; this improves completeness but creates a window before reconciliation.
- Treat the Oracle source log as append-only only after verifying whether rows can be updated/deleted. If it can be mutated, reconcile changed event data too or adopt CDC. Document limitation visibly in job health.
- Sync newly created users and profile/phone changes by a source-supported reliable method; `USERS.UPDATED_AT DEFAULT CURRENT_TIMESTAMP` alone does **not** prove that the column is automatically changed on UPDATE. Use periodic profile reconciliation when update semantics are unclear.
- Ingest source events only after the corresponding profile exists, or stage them until the profile is available. Do not discard orphaned events silently.
- Use source-side Oracle indexes only after DBA review and actual query-plan measurement.

**Stronger production option (separately approved):** Oracle change data capture (for example existing CDC) or a **transactional Oracle outbox** for user-registration and login inserts. If using outbox, ensure events are written within the source transaction and are acknowledged **only after** successful PostgreSQL persistence. Do not rely on a simple unacknowledged increasing outbox ID if commit order can differ. A trigger/outbox change must be reviewed for operational failure impact and tested before applying to the live source. Neither approach should require synchronous cross-database writes in login requests.

Expose sync freshness, last successful reconciliation, pending errors, and imported counts on the admin health view. Set freshness thresholds through configuration.

## 9. Lifecycle worker algorithm

For initial import, group each customer's registration and login events; process chronologically by `(action_at, source_table_pk)`. Timeline generation must account for **timer-driven transitions between logins**:

1. At `registered_at`, emit NEW; effective activity initially registration time.
2. Before the next login at time L, advance the state through any scheduled thresholds strictly before (or at) L. Resolve same-instant ordering consistently: apply registrations/logins occurring at the instant, then evaluate the status at that instant; persist only the net state at that instant.
3. On login, refresh `last_login_at` and `effective_last_activity_at`; if state changes to ACTIVE, close prior period at L and start ACTIVE at L. If status stays the same, extend the current period, do not add a row, and reschedule deadlines.
4. At `registered_at+30d`, the NEW override expires; classify using the **most recent login** as of that instant. Result might be ACTIVE or DORMANT.
5. At `last_activity+30d`, status is DORMANT (unless still overridden by NEW); at `last_activity+90d`, status is CHURNED. A later login can restore ACTIVE.
6. After the last known login, calculate deadlines through the current processing horizon. Store `next_transition_at` for any still-upcoming automatic change.
7. Execute current-state update and period rewrite in one PostgreSQL transaction; lock per affected customer or otherwise serialize conflicting updates.

A late/repaired event requires rebuilding the affected customer's timeline from their persisted minimal login journal (at minimum from the earliest affected timestamp), replacing that customer's affected periods transactionally, updating `current`, and marking affected snapshot dates dirty for deterministic recomputation. Handle an invalid event (`ACTION_AT` missing, before registration, in the future beyond tolerated clock skew, unknown user) in a visible exception/audit channel, not with silent misclassification.

**Cost guidance:** ~1 million source log rows is manageable with bounded pagination and indexes; do not introduce Kafka, Flink, Redis or a second microservice unless the actual repository/workload requires it.

## 10. KPI snapshot computation

- Backfill daily totals for the chosen historical range after timeline construction.
- Produce snapshots in the configured reporting timezone, reflecting state immediately **before** next local midnight. Midnight on the following day belongs to the following day.
- Efficient strategy: daily registration deltas and transition deltas (`previous_status -= 1; new_status += 1`), plus cumulative counts; avoid O(number_of_days × number_of_users) reclassification.
- A late login or corrected profile may invalidate historical snapshots. Mark the earliest impacted reporting date, recalculate affected daily rows and all dependent later rows safely.
- Validate `total_count = new_count + active_count + dormant_count + churned_count`; also validate `total_count = number of registered customers at that cutoff` under the same filters.
- Optionally distinguish provisional vs reconciled/final snapshots when data has not yet been checked for late events.

For custom N-day buckets, return the **last calendar day's snapshot within each bucket** as its stock count, and independently sum flow transitions occurring within the bucket. For calendar weeks, use Monday–Sunday in the report timezone, truncating to the selected date range at the edges. For event-time cutoffs, query `lifecycle_customer_period` directly using temporal containment; do not approximate arbitrary times using daily snapshots.

## 11. API contract (adapt URLs to existing project conventions)

All routes should be protected with the existing admin auth and a specific lifecycle-report permission. Validate ISO dates/times, range order, groupings, pagination, sort fields, timezone rules and reasonable query limits. Use prepared SQL/bind parameters. Preserve existing JSON error and response envelope conventions.

| Method | Suggested path | Purpose |
|---|---|---|
| GET | `/api/admin/customer-lifecycle/overview?asOf=...` | Current or historical stock KPIs, totals, percentages, and freshness metadata. |
| GET | `/api/admin/customer-lifecycle/trend?from=...&to=...&groupBy=DAY\|WEEK\|CUSTOM&intervalDays=3` | Status stock series by bucket with period start/end/as-of and counts. |
| GET | `/api/admin/customer-lifecycle/transitions/summary?from=...&to=...&groupBy=...` | Transition matrix and optional flows by bucket (events + unique users). |
| GET | `/api/admin/customer-lifecycle/transitions?from=...&to=...&fromStatus=...&toStatus=...&page=1&pageSize=50&search=...` | Paginated transition event records joined to display profile. |
| GET | `/api/admin/customer-lifecycle/customers?status=...&asOf=...&page=1&pageSize=50` | Historical status member list. |
| GET | `/api/admin/customer-lifecycle/customers/:userPk/timeline?from=...&to=...` | Periods, transitions and customer display details; include prior period overlapping start. |
| GET/POST/PUT/DELETE | `/api/admin/customer-lifecycle/events[/:eventId]` | Business-event administration (write requires elevated role). |
| GET | `/api/admin/customer-lifecycle/events/:eventId/impact?beforeDays=7&afterDays=7` | Stock, flows and fixed-cohort endpoint matrix around event. |
| GET | `/api/admin/customer-lifecycle/health` | Job checkpoints, data freshness, exceptions and snapshot recency. |
| POST | `/api/admin/customer-lifecycle/jobs/reconcile` | Authorized asynchronous job request, protected against duplicate concurrent runs. |

Example trend response **data shape**, adapt envelope:

```json
{
  "reportTimezone": "<configured IANA zone>",
  "metricType": "STOCK_END_OF_BUCKET",
  "buckets": [
    {
      "periodStart": "2026-09-01",
      "periodEnd": "2026-09-03",
      "snapshotDate": "2026-09-03",
      "new": 0,
      "active": 0,
      "dormant": 0,
      "churned": 0,
      "total": 0
    }
  ],
  "lastSynchronizedAt": null
}
```

The zero values are example placeholders only. Don't hardcode or demonstrate fictitious production metrics as factual. For transition details return `transitionedAt`, `fromStatus`, `toStatus`, `reason`, `statusAsOfEnd`, `currentStatus`, profile display fields, and `userPk` for detail routing. Use server-side filtering, sorting and pagination; never load all transitions or customer records into the browser. Large exports must have a permission and bounded or streamed processing.

## 12. Frontend: `crystal_admin`

Add an Admin navigation feature named **Customer Lifecycle KPIs** using existing UI/layout components. Required surfaces:

**A. Overview**
- Date range, grouping selector (Daily, Calendar weekly, Every 2/3/7 days, Custom N days), refresh/apply, and report timezone indication.
- Five summary cards: Total, New, Active, Dormant, Churned. Show comparison deltas only with explicitly labeled baseline dates.
- Interactive multi-series line or stacked-area chart showing status stock **at the end** of each bucket; numeric data table under chart, CSV export if existing patterns support it.
- Switch/tab for status stock versus transition flows; don't label flow counts as stock.
- State definitions popover explaining New priority, 30/90-day rolling thresholds, never-login policy, and `USERS.STATUS` distinction.

**B. Transition Explorer**
- Matrix/table: from status × to status, with count of transition events and count of unique customers.
- Date/time filters, before/after status filters (including Dormant → Active, Dormant → Churned), optional user search; clicking a matrix cell opens filtered details.
- Paginated results columns: customer ID, name, birthday (permission controlled), display phone, job, address, previous status, new status, timestamp, current status. Clicking row opens timeline/customer details.
- Clearly distinguish event-time status from the customer's current status.

**C. Customer Timeline**
- Chronological status periods with exact start/end instants and reason; most recent login; current lifecycle status; original Oracle account status; available phone numbers; address where source mapping is known.
- Handle no-logins, missing profile fields, data correction and a customer with many login events.

**D. Event Impact**
- Define/select named business events or enter an event timestamp ad hoc.
- Configure windows before/after (e.g. 7 days on each side); show historical stock at chosen boundaries, transition flows in each window, and fixed-cohort start/end migration matrix.
- Show denominator/cohort explanation and note that correlation alone does not prove causation.

**E. Job Health (admin only)**
- Source login imported count, last successful sync, last reconciliation, stale-data warnings, exceptions, snapshot freshness, lock/running-job state, operator-triggered reconciliation if authorized.

UX: loading/empty/error states, retry, responsive desktop-first layout, fixed table header when useful, compact filters and dense but readable data grid; use existing design tokens and localization conventions. No exposure of sensitive identity fields not required for the report. Date inputs must not produce off-by-one-day or time-zone errors.

## 13. Performance and operations

- First target **1M+ login records**, design for 10M+ without changing business semantics; index the exact access paths and verify with `EXPLAIN (ANALYZE, BUFFERS)` in PostgreSQL and Oracle query plans where allowed.
- Use bulk upsert, streamed/keyset imports, batch transactions and capped concurrency. Avoid N+1 Oracle profile/location/phone lookups.
- Common daily chart requests must use `lifecycle_kpi_daily`, not Oracle scans or per-user on-the-fly classification.
- Transition details require pagination and indexed `previous_status, status, valid_from`; profile joins must not expand rows via multiple phones.
- Observe pool usage, job duration, sync lag, malformed records, number of rebuilt customers, and time taken to generate snapshots.
- Configure batch size, polling frequency, reconciliation schedule, snapshot job time, historical rebuild range, report timezone and log retention through environment/configuration.
- AuthN/AuthZ must use existing project controls. Audit admin-triggered reconciliations, event edits and sensitive exports. Avoid raw SQL concatenation from filters.
- Backups/restores, migrations and rollback must conform to repo standards. The analytics database is reconstructible but costly; preserve checkpoints, run history and event definitions appropriately.

## 14. Exact acceptance-test fixtures

Use deterministic fixtures in a fixed configured timezone (not machine local time). The following event instants are 00:00 local for simplicity:

**Fixture A: automatic decay and reactivation.** User registers and logs in **2026-05-04**; logs in **2026-06-05**, **2026-07-21**, **2026-11-06**. Expected transitions:

| Effective timestamp | From | To | Why |
|---|---|---|---|
| 2026-05-04 | — | NEW | Registration |
| 2026-06-03 | NEW | DORMANT | 30 days from initial activity; no intervening login |
| 2026-06-05 | DORMANT | ACTIVE | Login |
| 2026-08-20 | ACTIVE | DORMANT | 30 days since July 21 login |
| 2026-10-19 | DORMANT | CHURNED | 90 days since July 21 login |
| 2026-11-06 | CHURNED | ACTIVE | Login |

The July 21 login must extend the Active period and **not** create Active → Active. As-of 2026-09-05, status is DORMANT. Selecting `fromStatus=DORMANT&toStatus=CHURNED` in October returns exactly one transition for this customer.

**Fixture B: new customer with recent login.** Registered May 4, logged in May 20: NEW until June 3; then NEW → ACTIVE on June 3; ACTIVE → DORMANT on June 19 absent further login. This tests the NEW priority rule.

**Fixture C: never logged in.** Registered May 4: NEW → DORMANT on June 3, DORMANT → CHURNED on August 2 (90 days). No log record is required for either change.

**Fixture D: multiple phones.** One customer with three phone records still counts as exactly **one** customer in every status count and one transition event per actual change.

**Fixture E: historical repair.** Import a late event timestamped inside an existing dormant gap. Recompute the customer's timeline; remove invalid former transitions; correct current state and all affected daily snapshots. Re-running import is idempotent.

**Fixture F: boundary and time zones.** Events at exactly 30 and 90 elapsed days; exact midnight at custom period edge; event timestamp exactly at range end is excluded; daylight-saving reporting dates are handled as calendar-day boundaries, not fixed 24-hour UTC offsets.

**Fixture G: dataset/metric invariants.** At every day-end, status stock categories sum to all registered customers. Two or more logins from same user never create duplicate customers. SUM of stock buckets is never used as unique period count. A customer can have more than one transition during a period; event count and unique user count differ accordingly.

**Fixture H: synchronization reliability.** Simulate duplicate Oracle batches, interruption after PG commit before checkpoint, Oracle outage, late commit missed by PK high watermark and subsequently detected by reconciliation, job run overlap, and malformed/orphan data.

## 15. Delivery checklist for Claude

1. Describe observed architecture and files **before** changing code; list uncertainties instead of guessing.
2. Present migration plan and actual PostgreSQL DDL according to the repository's migration tool.
3. Implement source importer and incremental sync with resumable/idempotent batches and source reconciliation.
4. Implement pure, thoroughly tested lifecycle classification and historical timeline builder.
5. Implement deadline processing, snapshots, correction/backfill, audit and job health.
6. Implement protected REST APIs and tests for filtering, dates, permissions and pagination.
7. Implement all `crystal_admin` pages integrated with real APIs; no fake production metrics.
8. Provide deployment and rollback steps, configuration example, backfill CLI/job instructions, recommended scheduling and test commands.
9. Run the repository's real lint/typecheck/tests/build commands; report what passed, failed, or could not run.
10. Explain sync limitations of a source log without trustworthy commit-time change tracking and identify the separately approved path to lossless CDC/outbox ingestion.

## 16. Recommended phases / implementation order

- **Phase 1 — Foundation:** inspect repos, write rule tests, design migrations, source profile + journal sync, historical timeline backfill and validation.
- **Phase 2 — Correctness/automation:** current status, inactivity due events, incremental import, reconciliation and daily snapshots.
- **Phase 3 — Admin dashboard:** status stock cards/trends, transition explorer and detail timeline.
- **Phase 4 — Event comparisons/operability:** before-after evaluation, event manager, monitoring, export/audit, scale and security hardening.

Do not ship charts before historical integrity tests succeed. Mark calculations as stale/unreconciled where appropriate, not as exact real-time truth.
