# From a sign-in to a number on the screen

How the customer-lifecycle feature actually works: every write it makes, what
happens when a customer signs in, what happens when nobody does, and what has
to be true for a number on the admin screen to be right.

The companion document, [customer-lifecycle.md](customer-lifecycle.md), is the
operating manual — deploy, rollback, backfill, scheduling, permissions. This
one is the data flow.

- [The pipeline](#the-pipeline)
- [What happens when a customer signs in](#what-happens-when-a-customer-signs-in)
- [Who writes the login log — and does the vendor project need changing?](#who-writes-the-login-log--and-does-the-vendor-project-need-changing)
- [What happens when nobody signs in](#what-happens-when-nobody-signs-in)
- [Why it is a poll and not a hook](#why-it-is-a-poll-and-not-a-hook)
- [Where each number on the screen comes from](#where-each-number-on-the-screen-comes-from)
- [I want X to show up — what has to happen](#i-want-x-to-show-up--what-has-to-happen)

---

## The pipeline

Five stages. Each writes one thing and reads the stage before it, so there is
exactly one place to look when a number is wrong.

```
  the platform (vendor, read-only)
  bs_prhnid.users            bs_prhnid.user_login_log
        |                          |
        | profiles job             | poll job
        | (02:50 daily)            | (every 10 min)
        v                          v
  lifecycle_customer_profile   lifecycle_login_event      <-- 1, 2  what happened
        \                         /
         \                       /
          v                     v
         the rules (services/lifecycle/rules.js)
         pure functions: registration + logins -> a timeline
                          |
                          v
          lifecycle_customer_period   (the history)        <-- 3  what it means
          lifecycle_customer_current  (where they are now)
                          |
                          v
          lifecycle_kpi_daily  (one row per calendar day)   <-- 4  counted once
                          |
                          v
          the API  ->  the admin screen                     <-- 5  read only
```

| Stage | Table | Written by | When |
|---|---|---|---|
| 1 | `lifecycle_customer_profile` | `sync.service.syncProfiles` | 02:50 daily |
| 2 | `lifecycle_login_event` | `sync.service.importLogins` | every 10 minutes |
| 3 | `lifecycle_customer_period`, `_current` | `timeline.service.rebuild` | after an import, and hourly for deadlines |
| 4 | `lifecycle_kpi_daily` | `snapshots.service.repairDays` | immediately after stage 3, for the days that changed |
| 5 | nothing | — | the API only reads |

**Nothing is computed in the browser.** The admin screen asks the API, the API
reads stages 3 and 4. There is no client-side aggregation that could disagree
with the server.

**A timeline is rebuilt, never patched.** When a customer's logins change, the
whole timeline for that customer is deleted and rebuilt from the journal
inside one transaction, under a per-customer advisory lock. That is what makes
a late-arriving login correct rather than merely inserted: the periods it
invalidates go away instead of being left behind.

## What happens when a customer signs in

Measured on the development database, with real numbers from a real sign-in.

**T+0 — the sign-in itself.** The member signs in at the storefront. Every
sign-in path funnels through `afterLogin` in
`services/memberAuth.service.js`, which writes a row into the platform's own
login log, `bs_prhnid.user_login_log`:

```
table_pk  3162048
user_pk   1
cid       null          (a desktop sign-in has no SIM card number)
action_at 2026-10-14 23:00:00.766Z
```

That write is fire-and-forget: if it fails it is logged and the member keeps
the session they just proved they own. A lost log row costs one lifecycle
event, which is the right way round — but note that the nightly
reconciliation **cannot** recover it, because a row that was never written is
not a row that was missed.

**T+0 to T+10 min — nothing visible yet.** The admin screen still shows the
member wherever they were. That is not a bug and the screen says so: the
freshness line reports when the last synchronisation was, and the health tab
carries the completeness caveat in full.

**Within 10 minutes — the poll.** `lifecycle_poll` runs on
`0 */10 * * * *`. One real run, after the sign-in above:

```
lifecycle_poll SUCCEEDED 1.9s  read 9986  written 2  rebuilt 260  days 45
```

Read in order, that is:

- **read 9,986** — everything above the high-water key, plus the overlap band
  of 10,000 keys below it (`LIFECYCLE_PK_OVERLAP`). The band is there because
  `TABLE_PK` is assigned before commit, so a late commit can sit below the
  mark.
- **written 2** — the two rows that were actually new. The rest were already
  in the journal; the upsert is keyed on the source key, so re-reading them
  changes nothing.
- **rebuilt 260** — every customer who appeared anywhere in that batch has
  their timeline rebuilt, not only the two who were new. A rebuild is
  idempotent, so this is wasted work rather than wrong work, and it is
  bounded by the overlap band. It costs about a second and a half.
- **days 45** — the calendar days whose snapshots those rebuilds could have
  changed, recomputed. Only those days, not the whole series.

**After the poll — the status has moved.** The member's row in
`lifecycle_customer_current`:

```
demo.1   ACTIVE   last login 2026-10-14T23:00:00Z   next change 2026-11-13T23:00:00Z
```

and their timeline:

```
NEW     2026-09-01 13:35:34Z -> 2026-10-01 13:35:34Z   REGISTRATION
ACTIVE  2026-10-01 13:35:34Z -> open                   NEW_EXPIRED
```

The `next change` is 30 days after the login: if they do not come back, the
hourly deadline job will close the ACTIVE period at that instant and open a
DORMANT one. The customer timeline on the admin screen shows that date.

**What a reader sees change.** The stock cards and the trend chart move
because today's snapshot was recomputed. If the sign-in produced a status
change, a row appears in the transition explorer — with the reason the rules
gave (`LOGIN`), the status it produced, and the customer's current status
beside it.

## Who writes the login log — and does the vendor project need changing?

**No. The vendor project needs no change, and never did.**
`bs_prhnid.user_login_log` is the platform's own record of who signed in, the
vendor's apps already write to it when their users sign in, and this feature
only ever reads it. That is the whole integration: one table, read-only, no
callback, no notification, nothing to deploy on their side.

**What did need fixing was our side.** `crystal-backend` has always written
into that table on sign-in — but until this change it did so only on the two
paths that carried a SIM card number (`cid`): the mobile password form and the
MIK card. A sign-in by **desktop certificate**, by **one-time code**, or by
**password with no cid** wrote nothing at all.

The consequence was not subtle. A member who signed in to this storefront
every single day by certificate would have decayed NEW → DORMANT → CHURNED
while doing it, because as far as the log was concerned they had never come
back. Every number in this feature would have been wrong for them, and wrong
in the most believable direction.

So the write moved into `afterLogin`, the one function every real sign-in
already passes through:

| Path | Before | Now |
|---|---|---|
| Password, mobile form (sends a cid) | recorded | recorded, with the cid |
| Password, desktop (`/auth/reganam`, no cid) | **not recorded** | recorded, cid null |
| X.509 certificate | **not recorded** | recorded, cid null |
| One-time code | **not recorded** | recorded, cid null |
| MIK card | recorded | recorded, with the cid |
| Token refresh | not recorded | **still not recorded** — a refreshed token is not a sign-in, and counting it would make a member who left a tab open look active for ever |
| Registration | not recorded | **still not recorded** — registering is not signing in, and the rules already measure a customer who has never logged in from their registration date |

The `cid` column is nullable, and a sign-in with no card number is recorded
with it null. The phone columns are NOT NULL, so they are written as empty
strings — which is what the vendor's own login writes when a handset model is
missing, rather than a placeholder that would look like data.

**It can be switched off.** `LIFECYCLE_RECORD_WEB_LOGINS=false` stops
`crystal-backend` writing to the platform's log entirely. It defaults to
**on**, because the alternative is a report that is quietly wrong about
everybody who uses the new storefront. Turn it off only if the platform's
owner does not want our sign-ins in their log — and expect these statuses to
measure the vendor's own apps alone if you do.

## What happens when nobody signs in

This is the half that a login-driven design usually gets wrong, so it has its
own job. `lifecycle_deadlines` runs at five past every hour and asks a
different question: **who should have changed status by now because time has
passed?**

`lifecycle_customer_current.next_transition_at` holds, for every customer, the
instant their status changes if they do nothing. The job takes the ones whose
instant has passed and rebuilds them. That is how:

- a customer who signed in 30 days ago becomes DORMANT without doing anything;
- a customer who signed in 90 days ago becomes CHURNED;
- a customer who has **never** signed in still gets a history — NEW for 30
  days from registration, then DORMANT, then CHURNED at day 90 — with no
  login record ever existing for them.

The snapshots for the affected days are recomputed in the same run, so the
chart moves without anybody logging in anywhere.

## Why it is a poll and not a hook

Because the source cannot tell us when it changes. `user_login_log` has no
commit-time column, no trigger we may add, and `TABLE_PK` is assigned from a
sequence *before* the transaction commits — so a row can appear below a mark
we have already passed.

Three things follow:

1. **The overlap band.** Each poll re-reads `LIFECYCLE_PK_OVERLAP` (10,000)
   keys below the high-water mark, which catches the ordinary late commit
   cheaply.
2. **The reconciliation.** At 04:30 a job compares the *whole* source key
   space against the journal and imports whatever is missing. This is the only
   thing that makes completeness a fact rather than a hope, which is why the
   admin health tab says "complete as of the last reconciliation" rather than
   claiming real time.
3. **The honest ceiling.** A row that the vendor's own app never wrote cannot
   be recovered by any of this. The lossless alternatives — a commit-time
   column, an outbox table written in the same transaction, or logical
   decoding/CDC — all need the platform owner to change something, which is
   why this implementation polls and reconciles instead.

## Where each number on the screen comes from

| On screen | Read from | Kind of number |
|---|---|---|
| The five overview cards | `lifecycle_kpi_daily` for that day, or the periods if that day has no snapshot yet | stock |
| The stacked chart and the table under it | `lifecycle_kpi_daily`, one bucket per group | stock — never summed across buckets |
| "Registered (flow)" column | `lifecycle_kpi_daily.registered_count`, summed across the bucket | flow — may be summed |
| The transition matrix and list | `lifecycle_customer_period` where `previous_status IS NOT NULL` | flow |
| A customer's timeline | that customer's periods, plus a bounded list of their logins | history |
| Event impact: boundaries | the periods, by containment at three instants | stock |
| Event impact: flows | the periods, in each half-window | flow |
| Event impact: cohort | one pair per customer, same population at both ends | neither — one row per customer |
| Job health | `lifecycle_sync_checkpoint`, `lifecycle_job_run`, `lifecycle_exception`, the pool | operational |

Stock, flow and cohort answer different questions and must not be mixed: on
this dataset, summing five 3-day stock buckets gives 152,157 customers against
a true population of 30,551. Every API payload carries a `metricType` saying
which it is, and the screen keeps them on separate tabs for that reason.

## I want X to show up — what has to happen

| You want | What has to be true |
|---|---|
| A new sign-in to count | The sign-in wrote a row to `bs_prhnid.user_login_log` (any path, now), and the poll has run — within 10 minutes |
| A brand-new customer to appear | The profiles job has run (02:50 daily), or `npm run lifecycle:backfill -- --step profiles` |
| A status to decay without a login | The deadline job has run — within the hour |
| Today's chart to include the last hour | The poll or the deadline job has repaired today's snapshot; both do it automatically for the days they touch |
| A number to be *complete*, not just current | A reconciliation has run since the event (04:30 daily, or the **Reconcile now** button with WRITE permission) |
| Historical months to exist at all | The backfill has been run once — see the operating manual |
| Anything at all to be visible to an operator | The role has been granted `/admin/crm/lifecycle`. No role has it by default |

---

# 로그인 한 번에서 화면의 숫자까지

위 영문 문서의 한국어 번역입니다. 표·코드·식별자·환경변수는 원문 그대로 두었습니다.

고객 생애주기(customer lifecycle) 기능이 실제로 어떻게 동작하는가. 이 기능이 쓰는 모든 기록, 고객이 로그인할 때 일어나는 일, 아무도 로그인하지 않을 때 일어나는 일, 그리고 관리화면의 숫자가 옳기 위해 무엇이 참이어야 하는가.

짝이 되는 문서 [customer-lifecycle.md](customer-lifecycle.md)는 운영 지침서입니다. 배치, 되돌리기, 채워넣기(backfill), 일정, 권한을 다룹니다. 이 문서는 자료 흐름을 다룹니다.

- 처리 흐름
- 고객이 로그인할 때 일어나는 일
- 로그인 기록은 누가 쓰는가 — 공급사 체계를 고쳐야 하는가
- 아무도 로그인하지 않을 때 일어나는 일
- 왜 끌어오기(poll)이고 걸이(hook)가 아닌가
- 화면의 숫자는 각각 어디서 오는가
- X를 보이게 하려면 — 무엇이 일어나야 하는가

---

## 처리 흐름

다섯 단계입니다. 각 단계는 하나만 쓰고 바로 앞 단계만 읽습니다. 그래서 숫자가 틀렸을 때 들여다볼 곳이 정확히 한 군데입니다.

```
  the platform (vendor, read-only)
  bs_prhnid.users            bs_prhnid.user_login_log
        |                          |
        | profiles job             | poll job
        | (02:50 daily)            | (every 10 min)
        v                          v
  lifecycle_customer_profile   lifecycle_login_event      <-- 1, 2  what happened
        \                         /
         \                       /
          v                     v
         the rules (services/lifecycle/rules.js)
         pure functions: registration + logins -> a timeline
                          |
                          v
          lifecycle_customer_period   (the history)        <-- 3  what it means
          lifecycle_customer_current  (where they are now)
                          |
                          v
          lifecycle_kpi_daily  (one row per calendar day)   <-- 4  counted once
                          |
                          v
          the API  ->  the admin screen                     <-- 5  read only
```

| 단계 | 표 | 쓰는 쪽 | 시점 |
|---|---|---|---|
| 1 | `lifecycle_customer_profile` | `sync.service.syncProfiles` | 매일 02:50 |
| 2 | `lifecycle_login_event` | `sync.service.importLogins` | 10분마다 |
| 3 | `lifecycle_customer_period`, `_current` | `timeline.service.rebuild` | 반입 뒤, 그리고 기한 처리를 위해 매시간 |
| 4 | `lifecycle_kpi_daily` | `snapshots.service.repairDays` | 3단계 직후, 바뀐 날짜에 대해서만 |
| 5 | 없음 | — | API는 읽기만 한다 |

**브라우저에서 계산하는 것은 아무것도 없습니다.** 관리화면은 API에 묻고, API는 3·4단계를 읽습니다. 서버와 어긋날 수 있는 클라이언트 집계는 존재하지 않습니다.

**생애주기는 고쳐 쓰는 것이 아니라 다시 만듭니다.** 어떤 고객의 로그인이 바뀌면 그 고객의 생애주기 전체를 지우고 기록부(journal)에서 다시 만듭니다. 하나의 트랜잭션 안에서, 고객별 권고 잠금(advisory lock)을 걸고 수행합니다. 늦게 도착한 로그인이 그저 끼워넣어지는 것이 아니라 **올바르게** 반영되는 이유가 이것입니다. 그 로그인 때문에 무효가 된 구간들이 남아 있지 않고 사라집니다.

## 고객이 로그인할 때 일어나는 일

개발 데이터베이스에서 실제 로그인으로 측정한 수치입니다.

**T+0 — 로그인 그 자체.** 회원이 상점에서 로그인합니다. 모든 로그인 경로는 `services/memberAuth.service.js`의 `afterLogin`을 거치고, 거기서 플랫폼 자신의 로그인 기록부 `bs_prhnid.user_login_log`에 한 행을 씁니다.

```
table_pk  3162048
user_pk   1
cid       null          (a desktop sign-in has no SIM card number)
action_at 2026-10-14 23:00:00.766Z
```

이 쓰기는 보내고 잊는(fire-and-forget) 방식입니다. 실패하면 기록만 남기고, 회원은 방금 자기 것임을 증명한 세션을 그대로 유지합니다. 기록 한 줄을 잃는 대가는 생애주기 사건 하나이고, 이것이 옳은 쪽입니다. 다만 야간 대조(reconciliation)가 그것을 **복구하지 못한다**는 점은 유념하십시오. 애초에 쓰이지 않은 행은 빠뜨린 행이 아닙니다.

**T+0 ~ T+10분 — 아직 화면에는 아무 변화가 없습니다.** 관리화면은 그 회원을 여전히 이전 상태로 보여 줍니다. 이것은 결함이 아니고, 화면도 그렇게 말합니다. 최신성 줄은 마지막 동기화 시각을 알려 주고, 작업 상태 탭은 완전성에 대한 유보를 그대로 적어 둡니다.

**10분 안에 — 끌어오기 작업.** `lifecycle_poll`이 `0 */10 * * * *`로 돕니다. 위 로그인 뒤의 실제 실행 한 번입니다.

```
lifecycle_poll SUCCEEDED 1.9s  read 9986  written 2  rebuilt 260  days 45
```

순서대로 읽으면 이런 뜻입니다.

- **read 9,986** — 최고 수위 키보다 위에 있는 전부, 그리고 그 아래 1만 개의 겹침 구간(`LIFECYCLE_PK_OVERLAP`). 이 구간이 있는 이유는 `TABLE_PK`가 확정(commit) 전에 배정되기 때문입니다. 늦게 확정된 거래가 수위 아래에 남을 수 있습니다.
- **written 2** — 실제로 새로웠던 두 행. 나머지는 이미 기록부에 있었고, 올려쓰기(upsert)가 원천 키를 기준으로 하므로 다시 읽어도 아무것도 바뀌지 않습니다.
- **rebuilt 260** — 그 묶음에 나타난 모든 고객의 생애주기를 다시 만듭니다. 새로웠던 두 명만이 아닙니다. 다시 만들기는 멱등(idempotent)하므로 이것은 잘못된 일이 아니라 낭비된 일이고, 겹침 구간이 그 양을 제한합니다. 1.5초쯤 듭니다.
- **days 45** — 그 다시 만들기가 바꿀 수 있었던 날짜들의 일별 집계만 다시 계산합니다. 전체 기간이 아니라 그 날짜들만.

**끌어오기 뒤 — 상태가 움직입니다.** 그 회원의 `lifecycle_customer_current` 행입니다.

```
demo.1   ACTIVE   last login 2026-10-14T23:00:00Z   next change 2026-11-13T23:00:00Z
```

그리고 그 생애주기입니다.

```
NEW     2026-09-01 13:35:34Z -> 2026-10-01 13:35:34Z   REGISTRATION
ACTIVE  2026-10-01 13:35:34Z -> open                   NEW_EXPIRED
```

`next change`는 로그인 30일 뒤입니다. 그때까지 돌아오지 않으면 매시간 도는 기한 작업이 그 시각에 ACTIVE 구간을 닫고 DORMANT 구간을 엽니다. 관리화면의 고객 생애주기에 그 날짜가 표시됩니다.

**보는 사람에게 무엇이 달라지는가.** 오늘의 집계가 다시 계산되었으므로 상태 카드와 추이 그림표가 움직입니다. 그 로그인이 상태 변화를 만들었다면 상태변화 탐색기에 한 줄이 나타납니다. 규칙이 준 이유(`LOGIN`), 그 변화가 만든 상태, 그리고 그 고객의 현재 상태가 나란히 붙습니다.

## 로그인 기록은 누가 쓰는가 — 공급사 체계를 고쳐야 하는가

**아닙니다. 공급사 체계는 고칠 필요가 없고, 처음부터 없었습니다.** `bs_prhnid.user_login_log`는 누가 로그인했는지에 대한 플랫폼 자신의 기록이고, 공급사의 앱들은 자기 사용자가 로그인할 때 이미 거기에 씁니다. 이 기능은 그것을 **읽기만** 합니다. 연동의 전부가 이것입니다. 표 하나, 읽기 전용, 되부름(callback)도 통보도 없고, 그쪽에 배치할 것도 없습니다.

**고쳐야 했던 것은 우리 쪽입니다.** `crystal-backend`는 로그인할 때 늘 그 표에 써 왔습니다. 그런데 이번 수정 전까지는 SIM 카드 번호(`cid`)를 들고 오는 두 경로에서만 썼습니다. 이동전화 비밀번호 양식과 MIK 카드입니다. **데스크톱 증명서** 로그인, **1회용 번호** 로그인, **cid 없는 비밀번호** 로그인은 아무것도 쓰지 않았습니다.

결과는 미묘하지 않았습니다. 이 상점에 증명서로 매일 로그인하던 회원도 NEW → DORMANT → CHURNED로 떨어졌을 것입니다. 기록부가 보기에는 한 번도 돌아오지 않았으니까요. 이 기능의 모든 숫자가 그 회원에 대해 틀렸을 것이고, 가장 그럴듯한 방향으로 틀렸을 것입니다.

그래서 쓰기를 `afterLogin`으로 옮겼습니다. 실제 로그인이라면 반드시 지나가는 단 하나의 함수입니다.

| 경로 | 이전 | 지금 |
|---|---|---|
| 비밀번호, 이동전화 양식(cid 보냄) | 기록함 | 기록함, cid 포함 |
| 비밀번호, 데스크톱(`/auth/reganam`, cid 없음) | **기록 안 함** | 기록함, cid는 null |
| X.509 증명서 | **기록 안 함** | 기록함, cid는 null |
| 1회용 번호 | **기록 안 함** | 기록함, cid는 null |
| MIK 카드 | 기록함 | 기록함, cid 포함 |
| 토큰 갱신 | 기록 안 함 | **여전히 기록 안 함** — 토큰 갱신은 로그인이 아니고, 그것을 세면 창을 열어 둔 회원이 영원히 활동 중으로 보입니다 |
| 가입 | 기록 안 함 | **여전히 기록 안 함** — 가입은 로그인이 아니고, 한 번도 로그인하지 않은 고객은 규칙이 이미 가입일부터 셉니다 |

`cid` 칸은 null을 허용하므로 카드 번호가 없는 로그인은 null로 기록됩니다. 전화 관련 칸들은 NOT NULL이라 빈 문자열로 씁니다. 단말 기종을 모를 때 공급사 자신의 로그인이 쓰는 값과 같게 한 것이며, 자료처럼 보이는 임의의 대체값을 넣지 않았습니다.

**끌 수 있습니다.** `LIFECYCLE_RECORD_WEB_LOGINS=false`로 하면 `crystal-backend`가 플랫폼 기록부에 쓰는 것을 완전히 멈춥니다. 기본값은 **켜짐**입니다. 끄면 새 상점을 쓰는 모든 사람에 대해 보고서가 조용히 틀리기 때문입니다. 플랫폼 소유자가 우리 로그인을 자기 기록부에 넣기를 원하지 않을 때에만 끄고, 그때는 이 상태값들이 공급사 자신의 앱만 측정한다고 보아야 합니다.

## 아무도 로그인하지 않을 때 일어나는 일

로그인에 의해 움직이는 설계가 흔히 틀리는 쪽이 이 절반이므로, 전용 작업을 따로 두었습니다. `lifecycle_deadlines`는 매시 5분에 돌면서 다른 질문을 합니다. **시간이 지났기 때문에 지금쯤 상태가 바뀌어야 하는 사람은 누구인가?**

`lifecycle_customer_current.next_transition_at`에는 고객마다, 아무것도 하지 않으면 상태가 바뀌는 시각이 들어 있습니다. 이 작업은 그 시각이 지난 고객을 골라 다시 만듭니다. 그래서 이렇게 됩니다.

- 30일 전에 로그인한 고객은 아무것도 하지 않아도 DORMANT가 됩니다.
- 90일 전에 로그인한 고객은 CHURNED가 됩니다.
- **한 번도** 로그인하지 않은 고객에게도 역사가 생깁니다. 가입부터 30일간 NEW, 그다음 DORMANT, 90일째에 CHURNED로, 로그인 기록이 전혀 없는 상태에서.

해당 날짜들의 일별 집계도 같은 실행에서 다시 계산되므로, 아무도 어디에서도 로그인하지 않아도 그림표는 움직입니다.

## 왜 끌어오기(poll)이고 걸이(hook)가 아닌가

원천이 바뀐 사실을 우리에게 알려 줄 수 없기 때문입니다. `user_login_log`에는 확정 시각 칸이 없고, 우리가 방아쇠(trigger)를 더할 수도 없으며, `TABLE_PK`는 트랜잭션 확정 **전에** 순차값에서 배정됩니다. 그래서 이미 지나온 수위 아래에 행이 나타날 수 있습니다.

세 가지가 따라옵니다.

1. **겹침 구간.** 끌어오기마다 최고 수위 아래 `LIFECYCLE_PK_OVERLAP`(1만) 개의 키를 다시 읽습니다. 흔한 늦은 확정을 값싸게 잡아냅니다.
2. **대조.** 04:30에 한 작업이 원천 키 공간 **전체**를 기록부와 비교하고 빠진 것을 반입합니다. 완전성을 희망이 아니라 사실로 만드는 것은 이것뿐이며, 그래서 관리 상태 탭은 실시간이라고 주장하지 않고 "마지막 대조 시점까지 완전함"이라고 말합니다.
3. **정직한 한계.** 공급사 앱이 애초에 쓰지 않은 행은 이 모든 것으로도 복구할 수 없습니다. 손실 없는 대안들 — 확정 시각 칸, 같은 트랜잭션에 쓰는 아웃박스 표, 논리적 복제/CDC — 은 모두 플랫폼 소유자가 무언가를 바꿔 주어야 합니다. 그래서 이 구현은 끌어오고 대조합니다.

## 화면의 숫자는 각각 어디서 오는가

| 화면 | 읽는 곳 | 숫자의 종류 |
|---|---|---|
| 개요 카드 다섯 개 | 그 날짜의 `lifecycle_kpi_daily`, 아직 집계가 없으면 구간들 | 재고(stock) |
| 누적 그림표와 그 아래 표 | `lifecycle_kpi_daily`, 묶음마다 한 칸 | 재고 — 묶음끼리 절대 더하지 않음 |
| "Registered (flow)" 칸 | `lifecycle_kpi_daily.registered_count`, 묶음 전체를 합산 | 흐름(flow) — 더할 수 있음 |
| 상태변화 행렬과 목록 | `previous_status IS NOT NULL`인 `lifecycle_customer_period` | 흐름 |
| 한 고객의 생애주기 | 그 고객의 구간들, 그리고 제한된 수의 로그인 목록 | 역사 |
| 사건 영향: 경계 | 세 시점에서의 구간 포함 관계 | 재고 |
| 사건 영향: 흐름 | 각 반쪽 구간 안의 구간들 | 흐름 |
| 사건 영향: 동일집단 | 고객당 한 쌍, 양 끝에서 같은 모집단 | 둘 다 아님 — 고객당 한 행 |
| 작업 상태 | `lifecycle_sync_checkpoint`, `lifecycle_job_run`, `lifecycle_exception`, 연결 풀 | 운영 지표 |

재고·흐름·동일집단은 서로 다른 질문에 답하므로 섞어서는 안 됩니다. 이 자료에서 3일 묶음 다섯 개의 재고를 더하면 152,157명이 나오는데, 실제 모집단은 30,551명입니다. 모든 API 응답은 어느 종류인지 `metricType`으로 밝히고, 화면이 이들을 서로 다른 탭에 두는 이유도 같습니다.

## X를 보이게 하려면 — 무엇이 일어나야 하는가

| 원하는 것 | 참이어야 하는 것 |
|---|---|
| 새 로그인이 세어지는 것 | 그 로그인이 `bs_prhnid.user_login_log`에 행을 썼고(이제 모든 경로가 씁니다), 끌어오기가 돌았을 것 — 10분 안 |
| 새로 가입한 고객이 나타나는 것 | 프로필 작업이 돌았을 것(매일 02:50), 또는 `npm run lifecycle:backfill -- --step profiles` |
| 로그인 없이 상태가 내려가는 것 | 기한 작업이 돌았을 것 — 한 시간 안 |
| 오늘 그림표에 방금 한 시간이 들어가는 것 | 끌어오기나 기한 작업이 오늘의 집계를 고쳤을 것. 둘 다 자기가 건드린 날짜에 대해 자동으로 합니다 |
| 숫자가 단지 최신이 아니라 *완전*한 것 | 그 사건 이후로 대조가 돌았을 것(매일 04:30, 또는 WRITE 권한으로 **Reconcile now** 단추) |
| 지난 몇 달이 아예 존재하는 것 | 채워넣기를 한 번 돌렸을 것 — 운영 지침서를 보십시오 |
| 운영자에게 무엇이든 보이는 것 | 그 역할에 `/admin/crm/lifecycle` 권한이 부여되었을 것. 기본적으로 어느 역할도 갖고 있지 않습니다 |
