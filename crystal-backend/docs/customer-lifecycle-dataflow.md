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
