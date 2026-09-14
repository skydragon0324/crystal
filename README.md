# Crystal Platform

Three projects implementing the Crystal platform specification v1.0, plus the
after-sales service operation the specification stops short of.

```
crystal/
├── crystal-backend    Express + Knex + PostgreSQL API
├── crystal-admin      React 16 + Chakra UI operations console
└── crystal-web        React 16 + Chakra UI customer website
```

All three are JavaScript (no TypeScript), target Node 12.22 / Chrome 72, and
use the locked dependency sets from the supplied `package.json` templates - no
upgrades.

---

## What this is

Crystal sells smartphones, televisions, set-top boxes, computers and cameras.
The specification describes the catalogue, the member centre and the customer
website, and stops there.

Everything after the sale is where an electronics company actually keeps or
loses its customers, so that is what section 8 of the schema adds: a device
comes in, somebody works out what is wrong with it, parts come off a shelf,
the bill is either the customer's or Crystal's depending on a warranty, and
the centre that did the work claims the covered half back.

That gives the console something to be about rather than a set of forms:

| | |
| --- | --- |
| **Repair tickets** | The spine. An enforced workflow, a per-line bill, a timeline, and a warranty decision made once at intake and then stored. |
| **Parts ledger** | Reserving a part and issuing it are different moments. The cached shelf and the movement ledger are written together, under a row lock, or not at all. |
| **Warranties** | A policy is the offer; a warranty is one device's copy of it, taken at the moment it was sold. Repricing a policy never rewrites what somebody already holds. |
| **Settlement** | An in-warranty repair is free to the customer and not free to anybody else. Claims batch a month of them, built from the tickets rather than typed. |
| **The scoreboard** | Four SQL views. A service centre is scored 0-100 on five weighted signals; a defect watch counts product x symptom per thousand devices registered, against the previous quarter. |

---

## Running it

Three terminals, in this order.

### 1. Backend

```bash
cd crystal-backend
cp .env.example .env       # then set PG_* for your machine
npm install
npm run migrate            # creates PG_SCHEMA, then executes sql/schema.sql
npm run seed               # 10 seed files
npm run mock:images        # SVG placeholders for every image the DB references
npm run legacy:install     # the vendor database stand-in - see below
npm run serve              # http://localhost:5100/api
```

`npm run db:reset` does the whole rollback → migrate → seed → images → legacy cycle.

#### Feedback and the blog live in a different database

Those two domains are NOT in Crystal's PostgreSQL. They are read and written in
the vendor's Oracle instance, which Crystal is a guest in: it may read and write
the rows, and must not touch the schema.

One handle serves both environments, and the query code is identical on each,
because every table is addressed schema-qualified:

| | `LEGACY_DRIVER` | what `ora_pid.feedback_threads` resolves to |
| --- | --- | --- |
| deployment | `oracle` | a schema in the vendor's Oracle instance |
| development | `postgres` | a schema in the same PostgreSQL database, same credentials |

Switching a deployment over is `LEGACY_DRIVER=oracle` plus the three
`LEGACY_ORACLE_*` values. Nothing else changes — not a query, not a controller,
not either frontend. `GET /health` reports which driver is live, so a server
that was never switched says so rather than serving an empty inbox.

`npm run legacy:install` builds the development side. It creates `ora_pid` and
`ora_blog` if they are absent, gives Crystal's seeded members and admins
matching rows so the threads table's two foreign keys can be satisfied, and
mirrors Crystal's own seeded threads and articles into them **keeping their
ids** — so `media_assets`, which stays in Crystal's database and points at
articles by id, still lines up. It is additive and never truncates, because on
a shared database those schemas may already hold the vendor's real data, and it
refuses to run when `LEGACY_DRIVER=oracle`.

The PostgreSQL `feedback_threads`, `feedback_messages` and `articles` tables are
still in `sql/schema.sql`, still seeded, and unused at runtime. They are kept
deliberately: they are where this data lands when it is migrated back, and
`src/repositories/feedback.repository.js` and `articles.repository.js` are the
dormant implementations that read them.

Two things the vendor's schema does not have, and how each is answered:

- **no slug.** The storefront routes on `/blog/:slug`, so the slug is derived —
  the title, slugified, with the id on the end — and read back by taking the id
  off again. Two articles cannot collide however they are titled, and a link
  written before a retitle still resolves.
- **no `is_deleted`.** There is `state`, which already carries a publishing
  workflow, so the recycle bin is `PUB_CANCEL` and a restore is `PUB_TEMP`.

Every code in that schema — statuses, sides, article states, subjects — is
translated in exactly one file, `src/repositories/legacy/codes.js`. The one
translation worth reading is the status: Crystal's four states are Oracle's
three crossed with `last_type`, because PENDING and REPLIED are the same open
thread told apart by who wrote last.

**Verify it:** `npm run check` runs the end-to-end checks against a running API
- the permission grid, the repair workflow, the stock ledger reconciling
against its own cache, the compare matrix, the member centre, the FAQ filed by
system, the day's notices, and the reply envelope in both languages. It prints
its own total; the number is not repeated here, because a README is exactly
where a count like that goes quietly out of date.

Two more need no running API, and both build in throwaway schemas that are
dropped either way:

- **`npm run schema:verify`** builds `sql/schema.sql` on its own. Nothing else
  executes that file once a database exists, so without it a broken source of
  truth passes every other test in the project.
- **`npm run migrate:verify`** builds the whole MIGRATION CHAIN from empty,
  seeds it, and compares the result column by column against what schema.sql
  builds. Those are different things: the init migration executes the CURRENT
  schema.sql and then replays every historical delta on top of it, so a delta
  that names a VALUE - inserting `'MAIN'` as text, or remapping a category from
  `'ORDER'` - stops parsing the day a later delta turns that column into an
  enum. Both failures were invisible on every existing database and meant a
  fresh install could not be migrated at all.

### 2. Operations console

```bash
cd crystal-admin
npm install
npm start                  # http://localhost:3001
```

| Sign in as | Password | Sees |
| --- | --- | --- |
| `admin` | `crystal1234` | everything |
| `ops` | `crystal1234` | operations; approves claims; read-only on the catalogue |
| `branch` | `crystal1234` | the repair bench - tickets, stock, technicians; builds a claim but cannot approve it |
| `editor` | `crystal1234` | the catalogue, the blog and the FAQ; no member data at all |

The four are not ranks. Sign in as `branch` and then as `editor` and the
sidebar, the buttons and the API's answers all change together - which is the
point of the permission grid being a table rather than a constant.

**An account is a username, a password and a role, and nothing else.** It used
to carry an `agency_id` that pinned it to one service centre, and eight
controllers narrowed their reads through it, so `branch` saw one centre's work
and nobody else's. That column is gone: what an account may do is the
permission grid's answer alone, and every role that can open a screen sees the
whole estate on it. There is no `email` column either - sign-in has always
matched the username, so the address was a unique nullable field no query read.

### 3. Customer website

```bash
cd crystal-web
npm install
npm start                  # http://localhost:3000
```

Sign in as `demo@crystal.example` / `crystal1234` on a desktop, or with the
phone number `+8613800000001` on a mobile device - see *Device-aware auth*
below.

Both frontends build clean under `CI=true npx craco build`, which treats
warnings as errors.

---

## Deploying behind nginx

All three run on one machine, with each frontend under its own URL prefix:

| | |
| --- | --- |
| `/crystal_web/` | the customer website |
| `/crystal_admin/` | the operations console |
| `/api/` | the backend |
| `/uploads/` | files the backend wrote, served by nginx rather than proxied |

The server block is [deploy/nginx.conf](deploy/nginx.conf), commented with what
each part is for. **Three things have to agree**, and getting any one wrong
produces a different confusing symptom:

- **`PUBLIC_URL`** — where the assets are. CRA bakes it into `index.html`, so a
  build made without it loads a white screen with 404s for its own bundle.
- **the router's `basename`** — read from that same `PUBLIC_URL` in each
  project's `src/App.js`. Miss it and the bundle loads fine and then matches no
  route: the browser is at `/crystal_admin/admin` and the Switch is looking for
  `/admin`.
- **`REACT_APP_API_URL`** — a *path*, `/api`, not a host. The browser then calls
  the origin it loaded from, so there is no CORS, no preflight, and nothing to
  change when the hostname does. Both projects derive the `/uploads` base by
  stripping `/api` off it.

Both are read at BUILD time:

```bash
cd crystal-web   && PUBLIC_URL=/crystal_web   REACT_APP_API_URL=/api npm run build
cd crystal-admin && PUBLIC_URL=/crystal_admin REACT_APP_API_URL=/api npm run build
```

Not in Git Bash without `MSYS_NO_PATHCONV=1` — it rewrites the leading slash
into a Windows path and the built HTML asks for its bundle from
`C:/Program Files/Git/...`. PowerShell is fine.

On the backend, set `PUBLIC_URL` to the browser-facing origin rather than the
port node listens on, and leave `CORS_ORIGINS` empty: same-origin requests need
no CORS header, and listing an origin that never appears grants a permission
for nothing. `trust proxy` is already on, so `X-Forwarded-For` reaches the rate
limiter and the audit log.

## Architecture

```
Request → Route → Controller → Service → Repository → Knex → PostgreSQL
                                                    └→ Knex → Oracle
```

- **routes** declare paths and which permission each one sits behind;
- **controllers** read the request and send one envelope. Nothing else;
- **services** own the rules. A table with no rules does not get one - it goes
  through the CRUD factory instead, which is why twenty master tables cost
  twenty column lists rather than twenty folders;
- **repositories** own the database. Knex lives here and nowhere above;
- **`sql/schema.sql` is the source of truth.** The init migration executes it,
  so `knex migrate:latest` and the raw file cannot drift apart. A change is an
  edit to that file plus a numbered delta beside it - never a schema-builder
  call, which would give the project two descriptions of the same tables and no
  way to tell which is right.

The reply envelope is `{ success, message, data }` / `{ success, message,
detail }`, unwrapped by a single axios interceptor in each frontend. Messages
are written in English at the throw site and translated in the error handler,
once the request's locale is known.

**Every language is a catalog, English included.** The key is the English text
exactly as it is written at the throw site - or at the `t(...)` call in a
frontend - so a message with no entry falls through as a sentence rather than
as a token, and it is safe to pass text that came out of PostgreSQL through the
same function. English used to have no catalog, on the grounds that the source
language needs no translation of itself; the cost was that rewording one reply
meant editing the throw site, which moved the key and silently orphaned its
Chinese. Now `src/i18n/en.js`, and the `en` object in each frontend's
`dictionaries.js`, hold the English wording. **Copy is changed there and
nowhere else.** The two catalogs in each project carry the same keys, and that
is asserted - by `npm run check` for the API, by `npm test` for both frontends
- because drift between them is invisible at runtime in both directions.

### Things worth knowing before changing something

**The permission grid is a table.** `admin_pages` × `admin_roles` at levels
0-3. A route whose page row is missing is refused with a 500 that says so,
deliberately - answering 403 would send somebody asking for a permission that
does not exist. The console builds its sidebar from the same rows, so the menu
cannot offer a screen the API will refuse.

**Whether a repair is covered is decided once, at intake, and stored.** It is
not recomputed on read. A warranty that expires next Tuesday must not
retroactively make last week's free repair chargeable, and a device taken in on
the last day of cover stays covered even if the repair takes three weeks.

**Reading a feedback thread is not activity on it.** The console's queue is
ordered by `updated_at DESC` - the thread somebody wrote in most recently is
the one to answer next - and marking a thread read is an UPDATE. With the
ordinary `set_updated_at` trigger, opening a thread stamped it as the newest
activity and sent it to the top, so the queue reshuffled under the manager the
moment they clicked a row, and working down a page of eleven reordered it
eleven times. `feedback_threads` has its own trigger,
`set_updated_at_unless_read`, which leaves `updated_at` alone when `is_read` is
the only column that moved - compared over the whole row minus those two, so a
column added later cannot slip through as "just a read". The screen also stopped
refetching the page for it and patches the one row whose dot went out.

**The feedback queue is cards, and the member's is a drawer.** In the console a
table gave one clipped line of the message, which is the column somebody
triaging actually reads - and the ellipsis landed in the middle of the sentence
that said what was wrong. Each row now carries the subject, the member, a
coloured origin badge, the state, and the whole message in a fixed-height box
that scrolls inside the row: every row is the same height, so the list is still
scannable, and a long enquiry is readable without opening it. **The exchange is
a right-hand drawer in both projects.** The console had it beside the queue,
which is the right shape for a mail client with a window to itself and the
wrong one inside a console already spending its width on a sidebar and a
navbar - half of what was left was a 300px reading column. The storefront had
it as a row that grew in place, which reflowed the list, pushed the rows under
it off the screen, and put the reply box wherever the conversation happened to
end. One drawer, one size whatever thread is in it, and the list exactly where
it was when it closes. A member can also remove a thread of their own - a soft
delete, behind a confirmation, and a 404 on anybody else's.

**The About page is content, not code.** The company introduction was a React
file - six timeline entries, four values and two paragraphs, none of which
could be changed without a release. It is ten chapters now, every word and
every picture of it edited in the console, and the storefront reads all ten in
one request rather than making ten. **Three tables, not fifteen:** the split is
by SHAPE rather than by chapter - `about_sections` for a chapter's own heading
and artwork, `about_items` for every list inside one with its kind on the row,
and `about_certificates`, which is genuinely a different shape and appears in
two chapters. Ten near-identical tables of a title, a description, two images,
an order and a switch would have meant ten routes and ten screens, and an
eleventh chapter next year would have meant eleven of each. The ten console
screens are configurations of two components for the same reason.

**A device that comes back is a new ticket pointing at the old one.** Never an
edit of it - overwriting would destroy exactly the evidence that says the first
repair did not work, which is the number the whole quality half of the
scoreboard is built from.

**Reserving a part and issuing it are different moments.** Adding a line to a
bill reserves stock; issuing it consumes stock. A quote the customer then
refuses must not have silently emptied the shelf in between, and a ticket
cannot be closed while any part on it is still only reserved.

**Both ledgers reconcile.** `part_stock.on_hand` is a cache of
`part_movements`, and `wallets.point_balance` is a cache of `point_logs`. The
check script proves both, and the seed writes its opening balances through the
ledger for that reason.

**The connection is pinned to UTC.** Dates in this codebase are 'YYYY-MM-DD'
strings from `toISOString()`; PostgreSQL evaluates `CURRENT_DATE` in the
server's timezone. On a server in `America/Los_Angeles` the two disagree by a
whole day, and it lands on exactly the comparison that decides whether a repair
was inside its warranty. `src/db/knexfile.js` sets it, which covers migrations,
seeds and the API together.

**Device-aware auth (spec 5).** Desktop signs in with email + password; mobile
with phone + OTP; a tablet may use either. The rule is enforced against the
*detected* User-Agent, not against the `X-Crystal-Device` header a client can
set - that header only chooses which artwork is served.

**Specifications are a dictionary, not columns.** A group holds definitions and
a product supplies values. That is what makes the compare matrix possible, and
the matrix is pivoted server-side so both frontends render the same table
without either re-implementing the alignment.

**Comparing is a smartphone feature, and lives on smartphone pages.** The
matrix is pivoted from the smartphone specification groups, the tray only ever
holds handsets, and "Add to comparison" is only offered on smartphone products.
It used to be reachable from an icon in the site header, which offered it on
the Eproducts index, the blog and the about page - none of which can compare
anything, and all of which it navigated a visitor away from. The header now
carries a notification bell instead; the way in to comparing is a button beside
the handsets, and the tray hides itself outside `/smartphones`. It does not
*empty* outside it: somebody who wandered to the blog and back should find
their comparison where they left it, which is why it is in Redux and mirrored
to storage.

**Every closed word list is a native enum type.** Twenty-nine of them, declared
in section 0 of `sql/schema.sql` and used by name across forty-three columns.
They were `varchar` with a CHECK per column, which wrote the same list out
again at every column that needed it - `warranty_policies.kind` and
`warranties.kind` were two copies of the same four words with nothing keeping
them in step, and `faqs.status` was a third case where the table defaulted to
`PUBLISHED` while the import sheet offered `ACTIVE`, and neither knew about the
other. A lookup table was the alternative and would have bought a join on every
read of a product, a ticket or a shelf movement to turn an id back into the
word it always was. **The declaration order is the sort order** - Postgres
sorts an enum by declaration, not alphabetically - so the values are written in
the order they happen in and `ORDER BY status` is the lifecycle. Adding a value
is `ALTER TYPE x ADD VALUE` in a numbered delta. The ORDERED code lists - a
repair's workflow, a claim's - stay smallint, because `status < 7` is
arithmetic.

**One centre, two counters, two pages, and they live with the products.** The
same building repairs a handset and a set-top box; to the people who run them
they are two businesses with different managers and different service
vocabularies, and `agency_services.section` is what carries that. The
storefront locator was one page over both, defaulting to neither - so somebody
with a television read a card offering Crystal OS installs and insurance. The
section is part of the address now: `/support/centres/smartphones` and
`/support/centres/eproducts`, each reached from its own product menu rather
than from a submenu under Support, because somebody with a broken handset is
already in the Smartphones menu. **Neither page can switch to the other**: a
pair of tabs made it one page about both again in all but the query, and let a
visitor flip networks without noticing the page had changed under them. There
is still ONE `agencies` row behind both lists, so a centre that moves has one
address to change.

**The FAQ is filed by system, not by topic.** `faqs.category` is one of
`SMARTPHONE | EPRODUCT | ESHOP | APPSTORE | CRYSTAL_APP` - the same vocabulary
`feedback_threads.thread_source` is routed by, so a question and an enquiry
about the same thing are not filed under two different words. It used to be
warranty / repair / account / OS / order: a real axis, but not the one a
visitor arrives on, and it put a chip reading "os" in front of a customer. The
topic survives in the wording of the question, which is where it was already
being read. `src/utils/systems.js` holds the list; the check constraint, the
import sheet and the storefront's chip order all come off it.

**More than one notice can be live at once.** `site_notices` used to be read
with `.first()` - two live notices meant the higher `sort_order` won and the
runner-up waited for the first to expire, so a second thing worth saying on a
given day was not said to anybody. That rule was protecting something real, but
it is a rule about the DIALOG rather than about what there is to say: a stack
of modals on arrival is an obstacle, not a greeting. The API answers the whole
live set, and `/notifications` - reached from the bell in the header - lists
them all. This is also what makes "do not remind me today" safe to offer,
because there is now somewhere to read a notice that was put down.

**The greeting is one dialog, as an accordion, drawn on a tri-fold handset.**
It paged first - Next, Next, Got it - which is a worse shape than it looks: a
reader cannot tell how much is left, cannot skip the one they do not care
about, and every notice costs a click before the site appears. An accordion
says how many there are the moment it opens, the first one is open, and it
closes once. One notice with `dismissible` off locks the whole dialog, because
an accordion has no "current" notice to take that rule from - and for the same
reason **"do not remind me today" is one tick for the greeting**, in the
footer, rather than one per notice: the question is "stop greeting me today",
which is one decision about the dialog, not six about its contents. Per notice
it could only be ticked on the ones somebody had already opened.

It has two shapes, one per screen size, because the same content wants a
different arrangement at each. On a desktop it is a wide master-detail: titles,
origins and dates down the left, the selected notice read on the right, the
whole day visible at once. On a phone it is the accordion, because two columns
at 360px is a 160px list beside a 160px body and helps nobody.

**A notice's origin is a table, not a string.** `notice_origins` gives each one
a name and a badge colour, because a reader looking for the service desk finds
the amber ones before they have read a label. It is a lookup rather than a
typed word for the usual reason: the same team typed by hand is "Service
network", "Service Network" and "service centres" within a month, and the badge
that was meant to group things stops grouping anything. `ON DELETE SET NULL`,
so retiring an origin does not take its notices with it.

**Oracle is optional.** Serial lookups try the warehouse when
`ORACLE_ENABLED=true` and fall back to the local `oracle_serials` mirror
otherwise - including when a configured Oracle is unreachable, so a warehouse
outage degrades rather than blocking a member registering a device they
physically hold.

---

## The scoreboard

Four views in `sql/schema.sql`, which is where the arithmetic lives so that the
dashboard, an export and somebody checking by hand in psql all get the same
number.

| View | Answers |
| --- | --- |
| `v_part_balance` | What is on the shelf, and what is about to not be. `available` rather than `on_hand` is what can be promised. |
| `v_repair_monthly_stats` | The month, per centre. Cancelled tickets are excluded - a repair that never happened is not a fast repair. |
| `v_agency_health` | Which centre to open first. Five weighted signals → 0-100, plus a health status that says *what* is wrong rather than how badly. |
| `v_defect_watch` | Product × symptom over 90 days against the 90 before. Sorted by repairs per thousand devices registered, because a raw count always names the best selling product as the worst built one. |

The seeded estate is deliberately uneven, so the board discriminates rather
than producing twelve identical rows: two centres are genuinely starved of
parts and stall on their own, and quality and speed are separate per centre
because in practice they are - a fast centre that rushes produces repeat
repairs, and a careful slow one produces breached promises and satisfied
customers.

---

## Database

53 tables, 4 views and 32 enum types, in one file. Seed data: a service centre in every city
of 23 provinces, 19 products, 5 categories, 8 series, ~300 specification values, 45
finishes and 102 boxed accessories across those products, 133 parts with
per-centre stock, 44 technicians, 14 warranty policies, 20 symptoms, 61
members, 266 registered devices with the warranties their registration issued,
and roughly 480 repair tickets over six months - with their bills, their
timelines and the stock movements they actually consumed.

Seeds 07 and 08 fill the published and the settled sides of that: 5 Crystal OS
releases and which device got which build, 14 blog posts, 225 media assets, 26
feedback threads, 7 notice origins and 10 site notices, a money ledger for
every wallet, the monthly warranty claims the closed repairs add up to, and 36
replenishment orders - the received ones moving real stock through the parts
ledger.

Eight of those ten notices are live today and two deliberately are not - one
written for next month, one whose window has closed. Three rows were enough
when only the top one was ever shown; they prove nothing about a list, the
paging in the arrival dialog, or the notification page.

Every table carries data except `otp_codes`, which is a runtime table of
short-lived login codes and is correctly empty on a fresh database.

The seeds are DERIVED from one another rather than written side by side, because
most of these tables are ledgers with a cached total somewhere else: a claim is
the repairs it settles, `wallets.balance` is the sum of the wallet transactions
behind it, and a shelf is the sum of its movements. `npm run check` asserts
those reconciliations, so seed data that merely looks right fails them.

`npm run mock:images` derives an SVG placeholder for every `/uploads/...` path
the database references. Existing files are never overwritten without
`--force`.

---

## The console's look, and where it departs from the spec

Specification 12 asks for **Horizon UI style**. The console is drawn in the
**Apex** style instead - flat neutral surfaces separated by a one pixel border
rather than tinted cards floating on a soft blue shadow, 8-10px radii instead
of 20px, Inter instead of DM Sans, and a charcoal sidebar that stays charcoal
in both colour modes. This was asked for deliberately after the spec was
written; it is recorded here because a reader comparing the two would
otherwise assume the spec had simply not been followed.

What did not change is the identity: the brand ramp is still Crystal orange,
and it is the only saturated colour in the chrome.

The ramp NAMES in `crystal-admin/src/theme/index.js` are historical. `navy`
is now the neutral dark ramp and `secondaryGray` a slate one; re-pointing the
existing names at the new palette restyled thirty-six screens at once, where
renaming the tokens would have meant editing every file to achieve the same
pixels.

### What the console gained with it

- **A command palette.** Ctrl+K anywhere. It searches the menu in the browser
  and the data - products, tickets, members, centres, parts, articles -
  through `/admin/search`, and both halves are filtered by the same
  permission grid the sidebar is built from, so a role can never read a member
  name out of a search box it could not have opened a screen for.
- **A bell that counts real work**, not messages: repairs past their promised
  date, claims waiting for approval, parts at or below reorder level, member
  feedback with no reply. Every item is a live query, so it disappears when
  the thing is dealt with - there is nothing to mark as read.
- **Spreadsheets.** Export matches whatever filter is on screen; import is
  matched on a natural key (a model code, a part number, a centre code) so an
  edited sheet updates the rows it came from. An import is **all or nothing**
  and reports every bad row at once, by row number, in words - "Component is
  required", not the INSERT statement.
- **A searchable select, a real date picker, resizable and freezable table
  columns, expandable detail rows, a rich text editor** for article bodies,
  and an **idle timeout** with a countdown before the session is dropped.

## Chrome 72

Both frontends target `chrome >= 72` (spec 2), and the syntax side of that was
always handled - CRA's preset-env plus `core-js`. The CSS side was not.

**Flexbox `gap` did not ship until Chrome 84.** A property a browser does not
know is dropped in silence, so on Chrome 72 every toolbar, badge row and button
group loses its spacing and the contents run together - with no error anywhere
and nothing to see on a modern machine.

So every `<Flex gap="...">` carries a `data-gap="N"` in pixels, and
`src/styles/app.css` rebuilds the same spacing out of margins - half the gap
negative on the container, half positive on each child, which is the one
emulation that survives wrapping, both directions and a variable number of
children. `src/boot.js` feature-tests `gap` before the first paint and only
marks the document when it is missing, so a modern browser runs the native
property and never sees those rules.

Two things are deliberately left alone: **grid** gap, which has worked since
Chrome 66, so `SimpleGrid` and `Grid` are not tagged; and Chakra's `Stack`
`spacing`, which is implemented with margin selectors rather than gap.

A responsive gap - `gap={{ base: 6, md: 12 }}` - is tagged with its **base**
value, because a margin fallback cannot vary by breakpoint. Chrome 72 gets the
base spacing at every width rather than none at any.

`npm test` in either frontend fails if a flex gap is missing its `data-gap`,
or if a tagged pixel value has no rule in the stylesheet. That guard exists
because this is the exact class of breakage that no build catches, no reviewer
notices, and only one browser shows.

## The three outside systems, and switching them to live

The member centre's **Eshop** (Card, Orders, Transactions, Experience,
Commerce Values), **Appstore** (Purchases, Comments, Favourites, Coins) and
**Eproduct** (Registration Log and the Karaoke, Manbang and Media keygen logs)
branches read three services Crystal does not run. Section 1.1 of the
specification lists both as *external*, and the database specification defines
no tables for orders, purchases, comments or favourites - so there is nothing
local to read, and nothing here writes to either.

They are reached over HTTP, the same four endpoints and the same parameter
names the vendor's own `eshopApi.js` uses. That file is the specification for
what these services return - there is no schema to read - so the mapping in
`src/repositories/remote/` is copied from it rather than reinterpreted.

### Mock is a transport, not a fixture

No development machine can reach either service, so `REMOTE_MOCK` defaults to
**on** and the request is answered in-process by
`src/repositories/remote/mock.js`.

What comes back is **the service's own wire format**, awkwardness included:
`rsp_code`, a `lists` field that is a JSON *string* rather than an array,
money as a float that has to be fixed to two places, `mData` and
`iTotalRecords` on the Appstore. None of that is tidied up.

That is the point. A mock that returned the clean shape the pages want would
leave every line of mapping in `src/repositories/remote/` as dead code in
development, to run for the first time in production - which is exactly where
you do not want a `JSON.parse` to run for the first time. This way the mock
exercises the real parser, and turning it off changes the transport and
nothing else.

Three more properties worth knowing:

- **Deterministic, not random.** Everything is derived from the member's own
  key, so a member sees the same orders on every load. A mock that reshuffles
  makes paging look broken and makes any bug impossible to reproduce.
- **The mock content is English, and none of it is translated.** Product
  names, remarks and cancellation reasons are the *shop's* data, not
  Crystal's labels: in a deployment they arrive from the real service in
  whatever language it holds them in, and Crystal passes them through
  untouched. Inventing three translations of data that has none would make
  the mock behave in a way the real thing never will. The words *around*
  them - column headers, tender names, fill types - are Crystal's own and are
  translated in the frontend catalogues, which is why `fill_type` is a code
  and `remark` is prose.
- **Delivery addresses are Chinese**, because the shop delivers in China. An
  address is a place rather than prose in a language, and a column laid out
  against a romanised one discovers on the day it goes live that real
  addresses are a different width and do not wrap on spaces.
- **The eproduct site disagrees with itself about `code`.** On its
  registration log `code: 0` means SUCCESS; on its three keygen logs a truthy
  `code` means FAILURE, and a success carries no code at all. Reading either
  the wrong way round does not error — it turns every good response into an
  empty list, which reads to a member as "you have never licensed anything".
  The two tests are written separately in `web.api.js` for that reason, and
  the checks below are what catch a change to either.
- **Some of it is GET, not POST.** The eproduct site is entirely GET-based,
  and the Appstore wallet's member-facing statement — `/api/v3/histories`,
  the one of its two that the member page reads — is too, taking a query
  string rather than a body. Sending either as a POST is not a near-miss: the
  service answers with every parameter missing, which reads as "this member
  has nothing". Worth knowing if a proxy in front of them only allows POST.

Two of the vendor's Appstore pages are **deliberately not built**: the coin
charge screen and the coin transfer form. Both are stubs in the vendor's own
code - their buttons call empty handlers - and `appstoreApi.js` has no
endpoint behind either of them. There is nothing to transcribe, and a form
that took a password and a recipient and then did nothing would be worse than
no form at all.

Its **point log** is not here either, and that one is not missing: it reads
Crystal's own points ledger rather than the store's, and is the Points section
of the member menu, filtered to `APPSTORE`.

### Switching to the live services

One flag and the URLs. Nothing in the application code changes, and nothing
needs rebuilding.

In `crystal-backend/.env`:

```ini
REMOTE_MOCK=false

ESHOP_SERVER_URL=http://<eshop-host>
ESHOP_WALLET_URL=http://<eshop-wallet-host>
APPSTORE_SERVER_URL=http://<appstore-host>
APPSTORE_WALLET_URL=http://<appstore-wallet-host>
WEB_SERVER_URL=http://<eproduct-host>

# Optional. 15000 by default; raise it if a service is slow rather than
# letting the member's page hang on it.
REMOTE_TIMEOUT_MS=15000
```

Then restart the API and check it took:

```bash
curl -s http://localhost:5400/api/health
```

`data.engines.storefronts` answers one of three things:

| value | meaning |
| --- | --- |
| `mock` | `REMOTE_MOCK` is on; nothing leaves the process |
| `live` | the flag is off and all five URLs are set |
| `unconfigured: eshopWallet, appstore` | the flag is off but those URLs are blank |

That third answer is the one to look for. **Switch all five together** - the
flag is global, so clearing it with two URLs filled in does not half-mock
anything, it simply sends the other two services requests with no base URL.
The field names which, so a half-switched deployment says so instead of
looking completely healthy from the outside.

**One service being down is not an outage.** Each call is wrapped so a
failure degrades that section to "the store did not answer" with a retry, and
leaves the rest of the account area intact - see
`services/storefronts.service.js`. A whole account page going dark because a
third party hiccupped is worse than a section that admits it.

**Pictures need the host.** The Eshop's product images and product pages live
on its own host, so `image_url` and `goods_url` on an order line are `null`
until `ESHOP_SERVER_URL` is set, and the drawer draws a placeholder tile
instead. That is deliberate: a half-built URL is a broken image on every
order.

### Checking it after the switch

`node scripts/check.js http://localhost:5400` includes twenty-seven account
checks that run against whatever transport is configured. Most are about the
data rather than the plumbing, and those are the ones worth watching on a
first live run.

On the Eshop:

- an order's three tender totals equal the sum of its own lines
- no order carries a single total across three units
- a cancelled order names who cancelled it, and a live one does not
- every log row's fill type is in the known set, moving in the right direction
- experience and commerce value come back whole, not fractional
- an order line carries the variant that was bought, and its discount flag
  agrees with its own prices

On the Appstore:

- a purchase says what it was for - the store sells apps, diamonds, avatars,
  event items and nicknames, and each names itself in a different field
- a licence is offered only where there is one, and the state on the row
  agrees with what the licence call says
- favourites carry only the fields the store actually returns
- a comment says whether the store has approved it
- a coin movement is named, and moves the way its name says
- the coin statement filters by type on the server, not in the browser

On the eproduct site:

- all four of its lists come back with rows, which is the check that catches
  the `code` inversion below
- a registration carries the serial it is for and a state from the known set
- a keying says whether it worked, both outcomes occur, and a failed keying
  never carries a licence file
- a media licence keeps the charge and the rebate as two figures, and the
  rebate is never larger than the charge

A failure there is the live service disagreeing with the vendor's mapping
code, which is worth knowing on the day of the switch rather than from a
member.

## What you did before: the three "old log" pages

Three more member pages read the systems that ran **before** this platform —
the karaoke keygen service, the broadcast media service, and the customer
database that predates both. A member's history did not begin when Crystal
did, and leaving these out tells somebody with years of it that they have
none.

These are **database reads, not HTTP.** They are the one part of the account
area that is neither Crystal's own tables nor an outside web service: three
satellite schemas — `ora_license`, `ora_media`, `ora_old_db` — alongside the
`ora_pid` and `ora_blog` ones the feedback and blog pages already use. Crystal
reads them and writes nothing at all.

`npm run legacy:install` creates them as ordinary PostgreSQL schemas and fills
them, the same way it does for the other two. A deployment pointing at the
real Oracle sets `LEGACY_LICENSE_SCHEMA`, `LEGACY_MEDIA_SCHEMA` and
`LEGACY_OLD_SCHEMA`; the queries qualify every table, so nothing else changes.

### The filtering is the interesting part

Every condition in `repositories/legacy/oldlogs.repository.js` **excludes rows
a member would otherwise see**, so dropping any of them is a visible change to
somebody's history rather than a tidy-up:

- **An agency keying is not your own.** A shop that keyed a licence on your
  behalf is recorded against you, and the old page never showed it.
- **Only what worked** — and the two services spell success with opposite
  numbers: `resultlog = 0` on karaoke, `result = 1` on media.
- **Not what was reversed.** `error_status = 2` is the code for a keying that
  was undone; anything else in that table is a note, and no row at all is
  simply fine.
- **Nothing before the cutover**, which is the day both services began keeping
  a readable log.
- **Nothing after the merge**, which is the one that matters most.

### The merge cap

When an account was merged into the platform, everything the old system
recorded *after that instant* belongs to the new account and is on the
ordinary pages already. Showing it here too counts every movement twice and
neither total adds up against anything.

The cap comes from `ora_pid.user_merge_log` — a different table from
`user_merge_ids`, and the only one that records *when*. Two numbers in it read
backwards at a glance: `merge_type` **0** is a merge and 1 is a split, and
`id_type` **0** means the row is keyed by the fixed id the platform issues.

The installer merges exactly one seeded member for this reason. Without one,
`limitFor` answers null on every request and the whole cap is dead code that
has never run.

### The row that is not a licence

The media log ends with the balance the member brought in from before the
service kept a log. It lives in a different table, it is appended to the
**last page only**, and its figure is stored in fifteenths of a point. It is
flagged in the page, because a row with no equipment against it otherwise
reads as data that failed to load.
