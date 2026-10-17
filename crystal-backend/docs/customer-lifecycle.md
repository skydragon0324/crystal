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

---

# 고객 생애주기 KPI

위 영문 문서의 한국어 번역입니다. 표·셸 명령·API 경로·데이터베이스 식별자는 원문 그대로 두었고, 설정 블록 안의 주석은 읽는 사람을 위해 번역하면서 키와 값은 손대지 않았습니다. 기술 용어는 처음 나올 때 영문을 함께 적었습니다.

로그인에 기초한 네 가지 상태 — **NEW, ACTIVE, DORMANT, CHURNED** — 그 역사, 상태들 사이의 이동, 그리고 사업 사건을 둘러싸고 운영자가 끌어낼 수 있는 비교.

이 문서는 이 기능을 배치하고, 일정을 걸고, 채워넣기(backfill)를 돌리고, 감사하는 사람을 위한 것입니다. 설계상의 판단은 코드 옆 주석(`src/services/lifecycle/`)에 적혀 있고, 이 문서는 운영 지침서입니다. 이 기능이 구현하는 요구사항은 저장소 뿌리의 `CUSTOMER_LIFECYCLE_KPI_REQUIREMENTS.md`에 있으며, 아래의 절 번호(§)는 그 문서를 가리킵니다.

**어떻게 동작하는가** — 이 기능이 쓰는 모든 기록, 고객이 로그인할 때 일어나는 일, 아무도 로그인하지 않을 때 일어나는 일, 화면의 숫자가 각각 어디서 오는가 — 는 [customer-lifecycle-dataflow.md](customer-lifecycle-dataflow.md)를 보십시오.

- 숫자의 뜻
- 무엇으로 이루어져 있는가
- 설정
- 배치
- 되돌리기
- 첫 채워넣기
- 일정
- 권한
- 내보내기와 감사 기록
- 점검과 시험
- 모의 자료
- 운영
- 한계

---

## 숫자의 뜻

고객은 가입 후 30일 동안, 무엇을 하든 **NEW**입니다. 그 뒤로는 마지막 로그인이 30일 미만이면 **ACTIVE**, 90일까지는 **DORMANT**, 그보다 지나면 **CHURNED**입니다. 문턱값은 경과 시간(720 / 720 / 2160시간)이고, 경계는 정확합니다 — 경과 30일이 되는 순간 그 고객은 더 이상 ACTIVE가 아닙니다. 한 번도 로그인하지 않은 고객은 가입 시점을 기준으로 재므로, 로그인 기록이 전혀 없는 상태에서 DORMANT가 되고 그다음 CHURNED가 됩니다.

**이것은 로그인만을 측정합니다.** 구매도, 고객지원 접촉도 아닙니다. 플랫폼 자신의 계정 표식(`USERS.STATUS`)은 생애주기 상태 옆에 나란히 보여 주며, 결코 그것과 합치지 않습니다.

여기서 세 가지 종류의 숫자가 나오고, 이들은 섞어서는 안 됩니다(§5).

| 종류 | 무엇인가 | 합산 가능? |
|---|---|---|
| **재고(stock)** | 묶음의 **끝** 시점에 그 상태에 있던 고객 수 | **아님.** 합산하면 같은 고객을 묶음마다 한 번씩 센다 |
| **흐름(flow)** | 어떤 구간 **안에서** 일어난 상태 변화 | 가능 |
| **동일집단(cohort)** | 고객당 한 쌍: 같은 모집단이 어디서 시작해 어디서 끝났는가 | 아님 — 이미 고객당 한 행이다 |

모든 API 응답은 어느 종류인지 `metricType`으로 밝히며, 관리화면이 재고와 흐름을 서로 다른 탭에 두는 이유도 같습니다. 실제 자료에서 임의 묶음 다섯 개의 재고를 더하면 152,157이 나오는데, 참된 모집단은 30,551명입니다. 이 규칙이 막으려는 셈이 바로 그것입니다.

## 무엇으로 이루어져 있는가

표 아홉 개이며, 모두 응용 데이터베이스 안에 있고 모두 `lifecycle_`로 시작합니다.

| 표 | 담는 것 |
|---|---|
| `lifecycle_customer_profile` | 원천 고객당 한 행: 가입, 표시용 전화번호, 직업, 지역 |
| `lifecycle_login_event` | 로그인 기록부, 원천의 `TABLE_PK`를 키로 한다 |
| `lifecycle_customer_current` | 각 고객이 지금 어디에 있고, 다음에 언제 바뀌는가 |
| `lifecycle_customer_period` | 역사: 상태별 `[valid_from, valid_to)`와 그 이유 |
| `lifecycle_kpi_daily` | 달력날짜당 한 행: 네 가지 재고, 합계, 그리고 흐름으로서의 가입 수 |
| `lifecycle_business_event` | 비교의 기준이 되는, 이름 붙은 시점 |
| `lifecycle_sync_checkpoint` | 각 흐름이 어디까지 왔는가 |
| `lifecycle_job_run` | 모든 작업의 모든 실행, 건수·소요·오류와 함께 |
| `lifecycle_exception` | 형식이 깨진 행과 부모 없는 원천 행 — 버리지 않고 따로 둔다 |

원천은 `src/repositories/legacy/lifecycleSource.repository.js`를 통해 **읽기 전용**으로 읽습니다(Oracle 또는 그 자리를 대신하는 PostgreSQL — `src/config/legacy.js`를 보십시오). 원천에는 아무것도 되쓰지 않습니다.

## 설정

모두 선택 사항이며, 아래 기본값이 코드가 실제로 쓰는 값입니다.

```ini
# 원천(SOURCE) 시각이 뜻하는 시간대. 경계 날짜를 믿기 전에 공급사 자신의
# 보고서와 맞추어 이 값을 확인하십시오 - 틀리면 모든 문턱값이 그 차이만큼
# 밀립니다.
LIFECYCLE_SOURCE_TIMEZONE=Asia/Shanghai

# 달력날짜를 세는 시간대. 일별 집계, 묶음, 그림표에 쓰입니다.
LIFECYCLE_REPORT_TIMEZONE=Asia/Shanghai

# 원천 읽기 한 번과 PostgreSQL 쓰기 한 번의 행 수. 쓰기 상한은 취향이
# 아닙니다. PostgreSQL은 한 문장에 결합 파라메터 65,535개를 받습니다.
LIFECYCLE_IMPORT_BATCH=5000

# 끌어오기마다 최고 수위 키 아래로 얼마나 다시 읽는가. 한계 절을 보십시오.
LIFECYCLE_PK_OVERLAP=10000

# 대조가 원천 전체를 비교할 때 묶음당 키 수.
LIFECYCLE_RECONCILE_BATCH=50000

# 이보다 오래되면 관리 상태 화면이 자료를 낡은 것으로 표시합니다.
LIFECYCLE_FRESHNESS_WARN_MINUTES=180

# 상점 로그인을 플랫폼 자신의 로그인 기록부에 쓸 것인가. 이 지표들이 읽는
# 것은 그 기록부뿐입니다. 끄면 이 상태값들은 공급사 자신의 앱만 측정합니다
# - 자료 흐름 문서를 보십시오.
LIFECYCLE_RECORD_WEB_LOGINS=true

# 로그인 시각이 현재보다 얼마나 앞서 있어도 사실로 볼 것인가. 그보다
# 앞서면 사실이 아니라 예외로 둡니다. 시계는 어긋나지만, 시간 단위로
# 어긋나는 것은 고장난 시계입니다.
LIFECYCLE_CLOCK_SKEW_MINUTES=15

# 모든 구간과 집계에 함께 기록됩니다. 30/90일 계약을 바꾼다는 것은 이 값을
# 올리고 **또** 채워넣기를 돌린다는 뜻입니다 - §4는 역사를 제자리에서
# 다시 해석하는 것을 금합니다.
LIFECYCLE_RULE_VERSION=1
```

## 배치

1. **이행(migrate).** 이 기능에 속한 델타는 셋이며, 각각 `sql/deltas/`의 손으로 쓴 파일을 실행하는 knex 이행입니다.

   ```sh
   npx knex --knexfile src/db/knexfile.js migrate:latest
   ```

   | 델타 | 하는 일 |
   |---|---|
   | `054_customer_lifecycle.sql` | 표 아홉 개, 색인 14개, 합계 제약과 길이 0 구간 금지 제약, 열린 구간이 하나뿐임을 보장하는 유일 색인 |
   | `055_customer_lifecycle_page.sql` | `manager_pages`에 `/admin/crm/lifecycle`을 등록한다. **누구에게도 부여하지 않는다** |
   | `056_exports_are_audited.sql` | `audit_action` 어휘에 `export`를 더한다 |

   셋 다 두 번 돌려도 되게 쓰여 있으므로, 현재의 `sql/schema.sql`로 만든 데이터베이스도 불평 없이 받아들입니다.

2. **페이지를 부여한다.** 관리 → 권한, `/admin/crm/lifecycle`. 보고서와 내보내기에는 READ, 사건 관리와 대조 단추에는 추가로 WRITE. 누군가 부여할 때까지 아무도 갖지 못합니다 — 페이지를 등록하는 것과 그것을 부여하는 것은 서로 다른 두 결정이고, 두 번째는 콘솔을 운영하는 사람의 몫입니다.

3. **채워넣기** — 아래를 보십시오. 그것을 돌리기 전까지 화면은 틀린 것이 아니라 비어 있습니다.

4. **API와 콘솔을 배치한다**, 평소처럼. 일정에 걸린 네 작업은 API 프로세스와 함께 시작됩니다(`src/services/sweeps.service.js`).

## 되돌리기

순서대로, 필요한 만큼만.

1. **페이지 부여를 회수한다.** 그것이 기능 전체를, 모든 사람에 대해, 한 행으로 끄는 것입니다 — 모든 끝점이 403으로 답하고 메뉴 항목이 사라집니다. 재배치도, 중단 시간도 없습니다. 거의 언제나 이것이 옳은 답입니다.

2. **작업을 멈춘다** — API 배치를 이전으로 되돌리는 것으로. 그러면 표들은 낡아 가지만, 읽을 수 있고 모순 없는 상태로 남습니다.

3. **표를 버린다** — 기능을 잠시 멈추는 것이 아니라 없애는 경우에만.

   ```sh
   npx knex --knexfile src/db/knexfile.js migrate:down   # 056 - a no-op, see below
   npx knex --knexfile src/db/knexfile.js migrate:down   # 055 - removes the page and its grants
   npx knex --knexfile src/db/knexfile.js migrate:down   # 054 - drops the nine tables
   ```

**되돌리기의 대가.** 분석 저장소는 다시 만들 수 있습니다 — 그 안의 모든 숫자는 원천 기록부로부터 채워넣기로 재건됩니다 — 그러나 값이 없는 것은 아닙니다. 고객 30,551명과 로그인 104만 건에서 전체 재건은 약 3분이 걸리고, 기록부가 자라면 함께 자랍니다. **다시 만들 수 없는 것**은 실행 역사, 검사점, 그리고 사업 사건입니다. 그러므로 표를 버리는 것은 이 기능을 영구히 없애는 때뿐입니다.

**`056`에는 되돌리기가 없습니다.** PostgreSQL은 렬거형(enum)에서 값을 뺄 수 없고, 그것을 되돌린다는 것은 형을 다시 만들고 모든 `audit_log` 행을 거기에 다시 쓰는 일입니다 — 내용을 다시 써서는 안 되는 바로 그 표에서 말입니다. 쓰이지 않는 이름표는 아무 대가도 없으므로, 되돌리기는 그것을 그냥 두는 것입니다.

## 첫 채워넣기

```sh
npm run lifecycle:backfill                 # profiles, logins, timelines, snapshots
npm run lifecycle:backfill -- --step logins
npm run lifecycle:backfill -- --verify     # the invariants only, writing nothing
```

네 단계를 순서대로 돕니다. 각 단계가 앞 단계를 필요로 하기 때문입니다. 모든 단계는 `lifecycle_job_run` 행을 쓰므로, 중단된 채워넣기는 침묵이 아니라 어디까지 갔는지의 증거를 남깁니다. 그리고 **모든 단계는 멱등(idempotent)합니다** — 반입은 원천 키로 올려쓰기하고, 다시 만들기는 고객의 역사를 기록부가 말하는 것으로 바꿔 놓고, 집계 생성은 계열 전체를 덮어씁니다. 두 번 돌려도 같은 데이터베이스가 됩니다.

개발 자료(고객 30,551명, 3년 반에 걸친 로그인 1,041,989건)에서 측정한 값입니다.

| 단계 | |
|---|---|
| profiles | 30,551행, 2.1초 |
| logins | 1,041,989행, 25.1초 |
| timelines | 299,133구간, 150초 |
| snapshots | 1,306일, 0.4초 |

`--verify`는 중요한 두 불변식을 점검합니다. 하루의 네 재고의 합이 가입 모집단과 같은가, 그리고 집계 계열이 구간 표와 일치하는가.

## 일정

cron 작업 넷이 API와 함께 시작됩니다. 각 작업은 **이름 붙은 권고 잠금(advisory lock)**을 잡고, 다른 인스턴스가 그것을 쥐고 있으면 스스로 물러납니다. 그래서 API 프로세스를 여럿 돌려도 안전합니다(§7.7). 물러난 실행도 `SKIPPED`로 기록됩니다.

| 작업 | Cron | 하는 일 |
|---|---|---|
| poll | `0 */10 * * * *` | 새 로그인, 그것이 건드린 고객, 바뀐 날짜 |
| deadlines | `0 5 * * * *` | 시간이 지나서 바뀌는 상태 — 로그인이 필요 없다 |
| profiles | `0 50 2 * * *` | 새 고객과 바뀐 세부 사항 |
| reconcile | `0 30 4 * * *` | 모든 원천 키를 기록부와 비교 |

기한 작업이야말로 로그인이 전혀 없어도 이 기능을 옳게 만들어 주는 것입니다. 한 번도 로그인하지 않는 고객이 DORMANT가 되고 그다음 CHURNED가 되는 곳이 여기입니다.

## 운영 비용

개발 자료(고객 30,551명, 로그인 1,041,989건, 구간 299,133개, 집계 1,306일)에서 `EXPLAIN (ANALYZE, BUFFERS)`로 측정했습니다.

| 경로 | 계획 | 시간 |
|---|---|---|
| 개요, 추이 | `lifecycle_kpi_daily`를 주키 구간으로 한 번 읽기 | 수 밀리초 |
| 상태변화 행렬과 목록 | `(previous_status, status, valid_from)`에 대한 비트맵 색인 주사 | 5–15밀리초 |
| 기록부 대조 구간 | 105만 키에 대한 색인만 보는 주사 | — |
| 어느 시점의 재고 | 구간들에 대한 **병렬 순차 주사** | 약 110밀리초 |
| 고정 동일집단 행렬 | `user_pk`로 결합한 두 번의 포함 관계 주사 | 약 65밀리초 |
| 비교 하나 전체 | 경계 셋 + 구간 둘 + 동일집단 | 약 380밀리초 |

**두 번의 포함 관계 주사가 순차 주사인 것은 일부러이고, 계획기(planner)의 판단이 옳습니다.** "시점 T에 어떤 상태에 있던 사람은 누구인가"는 대략 열 구간 중 하나에 들어맞는데, 그 정도의 선택도에서는 색인이 아끼는 것보다 더 많은 대가를 치릅니다 — 표의 10%를 남기는 조건에서 순차 주사를 이기는 색인은 존재하지 않습니다. 이것은 구간 표에 비례해 자라므로, 이 자료의 열 배에서는 비교 한 번이 몇 초가 됩니다. 그것을 묶어 두는 것이 구간 양쪽에 걸린 180일 상한입니다. 운영자가 반복해서 보는 것 — 카드, 그림표, 행렬 — 은 모두 일별 집계나 색인을 읽으며, 집계가 존재하는 이유가 바로 그것입니다.

## 권한

모든 끝점은 `requirePermission('/admin/crm/lifecycle')` 뒤에 있습니다.

| 수준 | 허용하는 것 |
|---|---|
| READ | 보고서, 사건 목록, 비교, 내보내기 셋, 작업 상태 |
| WRITE | 사업 사건의 생성·수정·삭제, 대조 실행 |

이 페이지 부여는 §12.B가 권한 통제를 요구하는 생일 칸에 대한 통제이기도 합니다. 그 칸은 상태변화 목록과 내보내기에 나타나며, 이 부여 외에는 어느 것도 그 둘을 열지 못합니다. 분석 저장소에는 비밀번호도, 공민번호도, 단말 식별자도 들어 있지 않습니다 — 애초에 그중 어느 것도 거기로 복사되지 않습니다.

## 내보내기와 감사 기록

내보내기는 셋이고, 모두 콘솔의 기존 `services/excel.service.js`를 통한 `.xlsx`이며, 모두 READ 수준입니다(집안의 관례입니다 — `routes/crud.routes.js`는 모든 `/export`를 READ에 둡니다).

```
GET /api/admin/customer-lifecycle/trend/export
GET /api/admin/customer-lifecycle/transitions/export
GET /api/admin/customer-lifecycle/customers/export
```

각각은 **묶여 있습니다**. 표는 API 자신의 질의를 한 번에 200행씩 넘겨 가며 `excel.EXPORT_LIMIT`(5,000)까지 만듭니다. 묶이지 않은 것은 결코 기억기에 들고 있지 않으며, 같은 필터를 쓴 같은 SQL이므로 내보낸 것이 화면과 어긋날 수 없습니다. 잘린 내보내기는 `X-Truncated`로 그렇다고 말하고, 참된 행 수를 `X-Available-Rows`에 담습니다.

각각은 **감사됩니다**. 어떤 필터로 요청되었고 얼마가 돌아왔는지와 함께. 이 기능에서 `audit_log`에 쓰는 것은 셋입니다.

| 동작 | 대상 | 시점 |
|---|---|---|
| `create` / `update` / `delete` | `lifecycle_business_event` | 사건을 관리할 때 |
| `export` | `lifecycle_export_transitions`, `lifecycle_export_customers`, `lifecycle_export_stock` | 표를 내릴 때 |
| `import` | `lifecycle_login_event` | 운영자가 대조를 실행할 때 |

대조가 반입으로 기록되는 것은 그것이 실제로 반입이기 때문입니다. 원천 키 공간 전체를 읽고 기록부에 빠진 것을 반입합니다. 또한 요청한 관리자와 함께 `lifecycle_job_run`에도 기록됩니다.

## 점검과 시험

백엔드에는 시험 실행기가 없습니다. 집안의 관례는 `scripts/check-*.js`이며, 아래 각각은 실제 데이터베이스를 상대로 돕니다.

```sh
npm run check:lifecycle        # the rules, as pure functions - §14's fixtures
npm run check:lifecycle-sync   # import, replay, reconciliation, bad rows
npm run check:lifecycle-api    # the report endpoints, over real HTTP
npm run check:lifecycle-ops    # events, the comparison, the exports, job health
```

이 글을 쓰는 시점에 각각 48, 23, 44, 77개의 점검이 모두 통과합니다. 화면은 콘솔 자신의 시험 묶음(`crystal-admin`에서 `npm test`)이 덮습니다.

이 점검들이 실제로 맡은 것은 코드를 읽어서는 닿을 수 없는 절반 — 세 가지 종류의 숫자 사이의 산술적 동일성입니다. 비교의 점검이 가장 또렷한 보기입니다. 두 반쪽 구간의 흐름은 구간 전체의 흐름과 정확히 더해 맞아야 하고, 동일집단에 새로 들어온 수를 더하면 끝 시점의 모집단과 같아야 하며, 동일집단이 움직였다고 말하는 고객에게는 그 이름으로 된 상태변화가 적어도 하나 있어야 합니다. 잘못된 구간 위에 세운 비교도 그럴듯한 숫자를 돌려줄 것이고, 이 모든 것을 하나씩 깨뜨릴 것입니다.

## 모의 자료

```sh
npm run lifecycle:mock                      # 30,000 customers, ~1.05M logins
npm run lifecycle:mock -- --customers 5000
npm run lifecycle:mock -- --rows 3000000
npm run lifecycle:mock -- --history-days 400
npm run lifecycle:mock -- --reset           # remove what it made
```

결정론적(고객 키별 씨앗값)이고, **덧붙이기만 하며** — 자기가 만들지 않은 행은 결코 고치지 않습니다 — 표시가 남습니다. `phone_brand = 'mock'`, 그리고 `mock-`으로 시작하는 `user_id`. Oracle 구동기를 상대로는 돌기를 거부합니다.

이것이 있는 이유는 씨앗 개발 자료로는 이 지표들을 움직여 볼 수 없기 때문입니다. 모두가 같은 달에 가입했으므로 모든 상태 경계가 같은 주에 떨어지고, 그림표는 계단 하나가 됩니다.

## 운영

**작업 상태(Job health)** 탭이 운영 화면입니다(§12.E). 기록부 크기, 두 가지 최신성 시각, 종류별 미해결 예외, 집계 계열이 닿은 범위와 마지막으로 만들어진 시각, 작업별 소요와 실패 건수, 연결 풀 사용량, 그리고 최근 실행과 그 오류를 보여 줍니다.

그중 혼동하기 쉬운 두 숫자는 일부러 따로 두었습니다.

- **동기화 지연(Sync lag)** — 끌어오기가 마지막으로 성공한 뒤 얼마나 지났는가. 작업의 문제입니다.
- **원천 지연(Source lag)** — 기록부에서 가장 새로운 로그인이 얼마나 오래되었는가. 조용한 밤이라면 이것은 단지 아무도 로그인하지 않은 시간이며, 결함이 **아닙니다**. 둘을 한 숫자로 합치면 새벽 네 시에 경보를 울리는 감시판이 됩니다.

연결 풀에서 중요한 수치는 몇 개가 쓰이고 있는가가 아닙니다 — 바쁜 풀은 일하는 풀입니다 — `pendingAcquires`입니다. 연결을 기다리는 요청은 다른 누군가의 작업을 기다리는 요청입니다.

**무언가 잘못된 것처럼 보일 때**는 순서대로 하십시오. 최신성 줄을 보고, 최근 실행에서 `FAILED` 행과 그 오류를 보고, 따로 떼어 둔 행이 있는지 예외 목록을 보고, 그다음 **Reconcile now**(WRITE 수준)를 누르십시오. 그것은 모든 원천 키를 읽고 빠진 것을 반입하며, 완전성을 희망이 아니라 사실로 만드는 유일한 조작입니다.

## 한계

**최고 수위 표식은 완전성의 보증이 아닙니다.** `USER_LOGIN_LOG.TABLE_PK`는 확정(commit) 전에 배정되므로, 늦게 확정된 트랜잭션은 표식 아래에 키를 남기고, "마지막으로 본 것보다 큰 것"만 읽는 단순한 주사는 그것을 결코 돌려주지 않습니다. 세 가지가 따라오고, 셋 다 일부러 그렇게 한 것입니다.

1. 끌어오기마다 표식 아래의 설정 가능한 구간(`LIFECYCLE_PK_OVERLAP`)을 다시 읽습니다. 흔한 경우를 값싸게 잡아냅니다.
2. 야간 대조가 원천 키 공간 전체를 기록부와 비교하고 차이를 반입합니다. **구멍을 닫는 것은 이것뿐입니다.**
3. 관리 상태 화면이 그 사실을 주석에 묻어 두지 않고 말로 적어 둡니다. 자료는 마지막 대조 시점까지 완전하다고.

**따로 승인된, 진짜 해결의 길**(§15.10)은 단조 증가 키에 의존하지 않는 반입입니다. 원천이 유지하는 확정 시각 칸, 로그인과 같은 트랜잭션에서 쓰이는 아웃박스 표, 또는 원천 데이터베이스로부터의 론리적 복호화(logical decoding)/CDC. 셋 중 어느 것이든 대조를 기구 자체가 아니라 안전망으로 만들어 줍니다. 셋 다 원천 체계 소유자가 변경에 동의해 주어야 하며, 그래서 이 구현은 끌어오고 대조합니다.

**비교는 상관관계입니다.** 사건 영향 화면은 경계 세 곳의 재고, 각 반쪽 구간의 흐름, 고정 동일집단의 시작과 끝을 돌려줍니다 — 그리고 그 구간에는 그 안에서 일어난 다른 모든 것이, 계절까지 포함되어 들어 있습니다. 응답이 그 유보를 담고 있고 화면이 그것을 보여 줍니다. 여기 있는 어느 것도 사건이 변화를 일으켰음을 입증하지 않습니다.

**보고 시간대는 설정된 가정입니다.** `Asia/Shanghai`는 기본값이며, 원천에 대해 검증된 사실이 아닙니다. 누구든 경계 날짜를 믿기 전에 공급사 자신의 보고서와 맞추어 확인하십시오.

**규칙 변경은 소급되지 않습니다.** 30/90일 계약은 모든 구간과 집계에 `rule_version`으로 함께 기록됩니다. 그것을 바꾼다는 것은 번호를 올리고 채워넣기를 돌린다는 뜻이며, 저장된 역사를 제자리에서 다시 해석하는 것은 §4가 금합니다. 누군가 지난달에 인쇄한 보고서가 오늘 인쇄하는 보고서와 조용히 어긋나게 될 것이기 때문입니다.
