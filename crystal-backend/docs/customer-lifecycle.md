# Customer lifecycle KPIs

Four login-based statuses — **NEW, ACTIVE, DORMANT, CHURNED** — their history,
the transitions between them, and the comparisons an operator can draw around
a business event.

This document is for whoever deploys, schedules, backfills or audits the
feature. The design decisions live beside the code, in the comments
(`src/services/lifecycle/`); this is the operating manual. The requirements it
implements are in `CUSTOMER_LIFECYCLE_KPI_REQUIREMENTS.md` at the repository
root, and section numbers below refer to it.

**For how it works** — every write it makes, what happens when a customer
signs in, what happens when nobody does, and where each number on the screen
comes from — see
[customer-lifecycle-dataflow.md](customer-lifecycle-dataflow.md).

- [What the numbers mean](#what-the-numbers-mean)
- [What it is made of](#what-it-is-made-of)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Rollback](#rollback)
- [The first backfill](#the-first-backfill)
- [Scheduling](#scheduling)
- [Permissions](#permissions)
- [Exports and the audit trail](#exports-and-the-audit-trail)
- [Checks and tests](#checks-and-tests)
- [Mock data](#mock-data)
- [Operating it](#operating-it)
- [Limitations](#limitations)

---

## What the numbers mean

A customer is **NEW** for 30 days after registering, whatever they do.
Afterwards they are **ACTIVE** while their last login is under 30 days old,
**DORMANT** up to 90 days, and **CHURNED** after that. The thresholds are
elapsed hours (720 / 720 / 2160), the boundaries are exact — at 30 elapsed
days a customer is no longer ACTIVE — and a customer who has never logged in
is measured from their registration, so they go DORMANT and then CHURNED with
no login records at all.

**This measures logins only.** Not purchases, not support contact. The
platform's own account flag (`USERS.STATUS`) is reported beside the lifecycle
status and is never merged with it.

Three kinds of number come out of it and they must not be mixed (§5):

| Kind | What it is | May be summed? |
|---|---|---|
| **Stock** | How many customers were in a status at the END of a bucket | **No.** Summing counts the same customer once per bucket |
| **Flow** | Status changes that happened inside a window | Yes |
| **Cohort** | One pair per customer: where the same population started and ended | No — it is already one row per customer |

Every API payload carries a `metricType` saying which it is, and the admin
screen keeps stock and flows on separate tabs for the same reason. On the real
dataset, summing five custom buckets gives 152,157 against a true population
of 30,551 — which is the arithmetic that rule exists to prevent.

## What it is made of

Nine tables, all in the application database, all prefixed `lifecycle_`:

| Table | Holds |
|---|---|
| `lifecycle_customer_profile` | One row per source customer: registration, display phone, job, location |
| `lifecycle_login_event` | The login journal, keyed by the source's `TABLE_PK` |
| `lifecycle_customer_current` | Where each customer is now, and when they next change |
| `lifecycle_customer_period` | The history: `[valid_from, valid_to)` per status, with its reason |
| `lifecycle_kpi_daily` | One row per calendar day: the four stocks, the total, and registrations as a flow |
| `lifecycle_business_event` | Named instants to compare around |
| `lifecycle_sync_checkpoint` | Where each stream got to |
| `lifecycle_job_run` | Every run of every job, with counts, duration and error |
| `lifecycle_exception` | Malformed and orphan source rows, set aside rather than dropped |

The source is read **read-only** through `src/repositories/legacy/lifecycleSource.repository.js`
(Oracle or a PostgreSQL stand-in — see `src/config/legacy.js`). Nothing is
ever written back to it.

## Configuration

All of it optional; the defaults are what the code runs with.

```ini
# The zone the SOURCE timestamps mean. CONFIRM THIS against the vendor's own
# reporting before trusting a boundary date - every threshold shifts by the
# offset if it is wrong.
LIFECYCLE_SOURCE_TIMEZONE=Asia/Shanghai

# The zone calendar days are counted in, for snapshots, buckets and charts.
LIFECYCLE_REPORT_TIMEZONE=Asia/Shanghai

# Rows per source read and per PostgreSQL write. The write ceiling is not
# taste: PostgreSQL takes 65,535 bind parameters in one statement.
LIFECYCLE_IMPORT_BATCH=5000

# How far below the high-water key each poll re-reads. See Limitations.
LIFECYCLE_PK_OVERLAP=10000

# Keys per batch when the reconciliation compares the whole source.
LIFECYCLE_RECONCILE_BATCH=50000

# Older than this and the admin health view calls the data stale.
LIFECYCLE_FRESHNESS_WARN_MINUTES=180

# Whether a storefront sign-in is written to the platform's own login log,
# which is the only thing these metrics read. Off means the statuses measure
# the vendor's own apps alone - see the data-flow document.
LIFECYCLE_RECORD_WEB_LOGINS=true

# How far ahead of now a login may be stamped before it is an exception
# rather than a fact. Clocks differ; hours of difference are a broken clock.
LIFECYCLE_CLOCK_SKEW_MINUTES=15

# Written onto every period and snapshot. Changing the 30/90-day contract
# means incrementing this AND backfilling - §4 forbids reinterpreting history
# in place.
LIFECYCLE_RULE_VERSION=1
```

## Deployment

1. **Migrate.** Three deltas belong to this feature and each is a knex
   migration executing a hand-written file in `sql/deltas/`:

   ```sh
   npx knex --knexfile src/db/knexfile.js migrate:latest
   ```

   | Delta | What it does |
   |---|---|
   | `054_customer_lifecycle.sql` | The nine tables, 14 indexes, the sum and the no-zero-length-period constraints, the one-open-period unique index |
   | `055_customer_lifecycle_page.sql` | Registers `/admin/crm/lifecycle` in `manager_pages`. **Grants it to nobody** |
   | `056_exports_are_audited.sql` | Adds `export` to the `audit_action` vocabulary |

   Every one is written to run twice, so a database built from the current
   `sql/schema.sql` takes them without complaint.

2. **Grant the page.** Management → Permissions, `/admin/crm/lifecycle`.
   READ for the reports and the exports; WRITE additionally for the event
   manager and the reconcile button. Nobody has it until somebody grants it —
   registering a page and granting it are two decisions, and the second
   belongs to whoever runs the console.

3. **Backfill** — see below. Until it has run, the screens are empty rather
   than wrong.

4. **Deploy the API and the console** as usual. The four scheduled jobs start
   with the API process (`src/services/sweeps.service.js`).

## Rollback

In order, and only as far as needed:

1. **Revoke the page grant.** That is the whole feature off, for everybody, in
   one row — every endpoint answers 403 and the menu entry disappears. No
   deploy, no downtime. This is almost always the right answer.

2. **Stop the jobs** by reverting the API deploy. The tables then go stale but
   stay readable and consistent.

3. **Drop the tables**, if the feature is being removed rather than paused:

   ```sh
   npx knex --knexfile src/db/knexfile.js migrate:down   # 056 - a no-op, see below
   npx knex --knexfile src/db/knexfile.js migrate:down   # 055 - removes the page and its grants
   npx knex --knexfile src/db/knexfile.js migrate:down   # 054 - drops the nine tables
   ```

**What a rollback costs.** The analytics store is reconstructible — every
number in it can be rebuilt from the source log by a backfill — but it is not
free: on 30,551 customers and 1.04M logins a full rebuild takes about three
minutes, and it grows with the journal. What is NOT reconstructible is the
run history, the checkpoints and the business events, so drop the tables only
when the feature is going for good.

**`056` has no down.** PostgreSQL cannot remove a value from an enum, and
undoing it would mean rebuilding the type and rewriting every `audit_log` row
onto it — on the one table whose contents must not be rewritten. An unused
label costs nothing, so the rollback is to leave it.

## The first backfill

```sh
npm run lifecycle:backfill                 # profiles, logins, timelines, snapshots
npm run lifecycle:backfill -- --step logins
npm run lifecycle:backfill -- --verify     # the invariants only, writing nothing
```

Four steps in order, because each needs the one before it. Every step writes a
`lifecycle_job_run` row, so an interrupted backfill leaves evidence of how far
it got rather than silence, and **every step is idempotent** — the imports
upsert by source key, a rebuild replaces a customer's history with what the
journal says it is, and the snapshot sweep overwrites the series. Running it
twice gives the same database.

Measured on the development dataset (30,551 customers, 1,041,989 logins over
three and a half years):

| Step | |
|---|---|
| profiles | 30,551 rows, 2.1s |
| logins | 1,041,989 rows, 25.1s |
| timelines | 299,133 periods, 150s |
| snapshots | 1,306 days, 0.4s |

`--verify` checks the two invariants that matter: that each day's four stocks
sum to the registered population, and that the snapshot series agrees with the
period table.

## Scheduling

Four cron jobs, started with the API. Each takes a **named advisory lock** and
declines if another instance holds it, so running several API processes is
safe (§7.7); a declined run is still recorded, as `SKIPPED`.

| Job | Cron | What it does |
|---|---|---|
| poll | `0 */10 * * * *` | New logins, the customers they touch, the days that changed |
| deadlines | `0 5 * * * *` | Statuses that change because time passed — no login needed |
| profiles | `0 50 2 * * *` | New customers and changed details |
| reconcile | `0 30 4 * * *` | Every source key compared with the journal |

The deadline job is the one that makes the feature correct without any login
at all: a customer who never logs in becomes DORMANT and then CHURNED here.

## What things cost

Measured on the development dataset (30,551 customers, 1,041,989 logins,
299,133 periods, 1,306 snapshots) with `EXPLAIN (ANALYZE, BUFFERS)`:

| Path | Plan | Time |
|---|---|---|
| Overview, trend | one read of `lifecycle_kpi_daily` by primary key range | a few ms |
| Transition matrix and list | bitmap index scan on `(previous_status, status, valid_from)` | 5–15ms |
| Journal reconciliation band | index-only scan over 1.05M keys | — |
| Stock at an instant | **parallel sequential scan** of the periods | ~110ms |
| Fixed-cohort matrix | two containment scans joined on `user_pk` | ~65ms |
| A whole comparison | three boundaries + two windows + the cohort | ~380ms |

**The two containment scans are a sequential scan on purpose, and the planner
is right.** "Who was in a status at instant T" matches roughly one period in
ten, and at that selectivity an index costs more than it saves — there is no
index that beats a sequential scan for a predicate that keeps 10% of the
table. It grows linearly with the period table, so at ten times this dataset a
comparison is a few seconds; the 180-day cap on each side of a window is what
bounds it. Everything an operator looks at repeatedly — the cards, the chart,
the matrix — reads the daily snapshots or an index instead, which is what the
snapshots are for.

## Permissions

Every endpoint is behind `requirePermission('/admin/crm/lifecycle')`:

| Level | What it allows |
|---|---|
| READ | The reports, the event list, the comparison, the three exports, job health |
| WRITE | Creating, editing and deleting business events; triggering a reconciliation |

The page grant is also the control over the birthday column, which §12.B asks
to be permission-controlled: it appears in the transition list and in the
export, and nothing but this grant opens either. Nothing in the analytics
store holds a password, a citizen id or a handset identifier — none of them is
copied into it at all.

## Exports and the audit trail

Three exports, all `.xlsx` through the console's existing
`services/excel.service.js`, all at READ level (the house convention —
`routes/crud.routes.js` puts every `/export` at READ):

```
GET /api/admin/customer-lifecycle/trend/export
GET /api/admin/customer-lifecycle/transitions/export
GET /api/admin/customer-lifecycle/customers/export
```

Each is **bounded**: the sheet is built by paging through the API's own query,
200 rows at a time, up to `excel.EXPORT_LIMIT` (5,000). Nothing unbounded is
ever held in memory, and the export cannot disagree with the screen because it
is the same SQL with the same filters. A truncated export says so, in
`X-Truncated`, with the true row count in `X-Available-Rows`.

Each is **audited**, with the filter it was asked for and how much came back.
Three things in this feature write to `audit_log`:

| Action | Entity | When |
|---|---|---|
| `create` / `update` / `delete` | `lifecycle_business_event` | An event is managed |
| `export` | `lifecycle_export_transitions`, `lifecycle_export_customers`, `lifecycle_export_stock` | A sheet is downloaded |
| `import` | `lifecycle_login_event` | An operator triggers a reconciliation |

A reconciliation is recorded as an import because that is what it is: it reads
the whole source key space and imports whatever the journal is missing. It is
also recorded in `lifecycle_job_run`, with the admin who asked.

## Checks and tests

The backend has no test runner; the house convention is `scripts/check-*.js`,
and each of these runs against the real database.

```sh
npm run check:lifecycle        # the rules, as pure functions - §14's fixtures
npm run check:lifecycle-sync   # import, replay, reconciliation, bad rows
npm run check:lifecycle-api    # the report endpoints, over real HTTP
npm run check:lifecycle-ops    # events, the comparison, the exports, job health
```

At the time of writing: 48, 23, 44 and 77 checks, all passing. The console's
own suite (`npm test` in `crystal-admin`) covers the screen.

What the checks are actually for is the half that reading the code cannot
reach — the arithmetic identities between the three kinds of number. The
comparison's checks are the clearest example: the two half-windows' flows must
add up to the whole window's exactly, the cohort plus the arrivals must equal
the population at the end, and a customer the cohort says moved must have at
least one transition to its name. A comparison built on the wrong window would
still return plausible numbers and would break every one of them.

## Mock data

```sh
npm run lifecycle:mock                      # 30,000 customers, ~1.05M logins
npm run lifecycle:mock -- --customers 5000
npm run lifecycle:mock -- --rows 3000000
npm run lifecycle:mock -- --history-days 400
npm run lifecycle:mock -- --reset           # remove what it made
```

Deterministic (seeded per customer key), **append-only** — it never modifies a
row it did not create — and marked: `phone_brand = 'mock'` and a `user_id`
prefixed `mock-`. It refuses to run against the Oracle driver.

It exists because the seeded development data cannot exercise these metrics:
everybody registered in the same month, so every status boundary falls on the
same week and a chart of it is a single step.

## Operating it

The **Job health** tab is the operations view (§12.E). It reports the journal
size, the two freshness timestamps, open exceptions by kind, the snapshot
series' reach and when it was last built, per-job durations and failure
counts, connection-pool usage, and the recent runs with their errors.

Two numbers there are easy to confuse and are deliberately separate:

- **Sync lag** — how long since a poll succeeded. A job problem.
- **Source lag** — how old the newest login in the journal is. On a quiet
  night this is simply how long since anybody logged in, and is **not** a
  fault. One number for both is how a dashboard ends up alarming at 4am.

The pool figure that matters is not how many connections are in use — a busy
pool is a working pool — but `pendingAcquires`: a request waiting for a
connection is a request waiting for somebody else's job.

**When something looks wrong**, in order: check the freshness line, then the
recent runs for a `FAILED` row and its error, then the exception list for rows
that were set aside, then press **Reconcile now** (WRITE level) — it reads
every source key and imports anything missing, and it is the only operation
that makes completeness a fact rather than a hope.

## Limitations

**The high-water mark is not a completeness guarantee.** `USER_LOGIN_LOG.TABLE_PK`
is assigned before commit, so a transaction that commits late leaves a key
below the mark that a plain "greater than the last one seen" scan will never
return. Three things follow, and all three are deliberate:

1. Each poll re-reads a configurable band below the mark
   (`LIFECYCLE_PK_OVERLAP`), which catches the common case cheaply.
2. The nightly reconciliation compares the whole source key space with the
   journal and imports the difference. **Only this closes the hole.**
3. The admin health view says so, in words, rather than leaving it in a
   comment: the data is complete as of the last reconciliation.

**The separately approved path to a real fix** (§15.10) is ingestion that does
not depend on a monotonic key: either a commit-time column the source
maintains, or an outbox table written in the same transaction as the login,
or logical decoding / CDC from the source database. Any of the three makes the
reconciliation a safety net rather than the mechanism. All three need the
source system's owner to agree to a change, which is why this implementation
polls and reconciles instead.

**A comparison is a correlation.** The event impact view returns stock at
three boundaries, flows in each half-window and a fixed cohort's start and end
— and the window contains everything else that happened in it, the season
included. The payload carries that caveat and the screen shows it. Nothing
here establishes that an event caused a change.

**The report timezone is a configured assumption.** `Asia/Shanghai` is a
default, not a verified fact about the source. Confirm it against the vendor's
own reporting before anybody trusts a boundary date.

**Rule changes are not retroactive.** The 30/90-day contract is written onto
every period and snapshot as `rule_version`. Changing it means incrementing
the version and backfilling; reinterpreting stored history in place is
forbidden by §4, because a report somebody printed last month would quietly
stop matching the one they print today.
