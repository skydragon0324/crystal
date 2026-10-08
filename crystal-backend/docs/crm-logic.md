# CRM: logic and features

How the Crystal CRM works: what each part is for, the rules it enforces, and where the code is. Every table and
field is described in [crm-database.md](crm-database.md); the phase-1 identity rollout notes are in
[phase1-identity.md](phase1-identity.md).

> A Word copy of this file and of the database reference is written by `npm run crm:docs`
> (`crm-logic.docx`, `crm-database.docx`). Edit this markdown file, then regenerate.

## 1. Where things are

| Part | Location | Notes |
|---|---|---|
| Business logic | `crystal-backend/src/services/crm/*` | One service per area (customers, products, points, events, ...). |
| Console API | `src/routes/crm.routes.js` | Mounted at `/api/admin/crm`; every route checks the screen's READ or WRITE permission. |
| Department API | `src/routes/crmIntegration.routes.js` | Mounted at `/api/integration/crm`; authenticated by a project API key. |
| Console screens | `crystal-admin/src/pages/crm/*` | One screen per entry under **CRM** in the menu. |
| Schema | `sql/schema.sql` | The source of truth. Each change is also a numbered delta in `sql/deltas`, run by a migration in `src/db/migrations`. |
| Console translations | `crystal-admin/src/i18n/crm.js` | One section per screen, named after its file: `crm.customers`, `crm.customerImport`, `crm.registrationReview`, `crm.customer360` (with `customer360Tabs`, `customer360Cards`), `crm.events`, ...; `crm.common` for sentences several screens use, `crm.components` for the shared pickers and tables. Words matched by their English (column labels, codes, data names) are `vocabulary.crm.<screen>`, plus `codes`, `common` and `data`. A new string goes in its screen's section, in all three languages. |
| API messages | `crystal-backend/src/i18n/{en,zh,ru}.js` | `crm.<area>.<key>`, one section per area, named after the service that throws it (`crm.customers`, `crm.products`, `crm.events`, `crm.marketing`, `crm.settings`, ...); `crm.common` when several do. |

## 2. The model in one page

| Concept | What it is | Main tables |
|---|---|---|
| Project | One Dream business system, defined by the administrator in Settings > Projects (code, name, kind, identity role). Every external id is scoped to its project. | `crm_project` |
| Party (customer) | Anyone the CRM knows: a person or an organization. One `party_pk` per real-world customer. | `crm_party`, `crm_person`, `crm_organization` |
| Project account | "Account X in project P belongs to customer C." The cross-project identity map. | `crm_project_account` |
| Registration intake | An incoming person or identifier that must pass the duplicate check before it becomes (or joins) a customer. | `crm_registration_intake` |
| Product | A catalogue item, a concrete instance (IMEI, serial, licence), and who holds it over time. | `crm_product_*` |
| Transaction | A sale, purchase or refund from any project, with its lines. | `crm_transaction*` |
| Points | One ledger for every point currency, one balance per currency. | `crm_point_*` |
| Service case | A summary of every service contact (repair, complaint, enquiry). | `crm_service_case*` |
| Interaction | A contact with the customer that already happened (call, email, chat, visit), written down by staff. | `crm_party_interaction` |
| Site | A physical place: service centre, agency, collection point, shop. What happens there is logged. | `crm_service_center*` |
| Event | A customer activity with limited places: reservation, lottery, prize service, puzzle, survey reward, attendance. (Formerly "program".) | `crm_event*`, `crm_activity_*` |
| Segment / campaign | A versioned rule that groups customers / an outreach that freezes an audience and contacts it. | `crm_segment*`, `crm_campaign*` |
| Analysis | Periodic per-customer figures, a corporate score and a grade. | `crm_party_analysis_snapshot`, `crm_corporate_grade` |

Rules that run through everything:

| Rule | What it means |
|---|---|
| `party_pk` is the customer key | All CRM foreign keys and department records use it. `crm_party.party_id` is reserved for a later phase: nothing generates or reads it in phase 1, so it is empty. |
| History is closed, not overwritten | Holdings, relationships, segment memberships and account links end with `valid_to` / `unlinked_at`. Ledgers (points, consent) are append-only. |
| Every import can be re-run | Rows keep their source key (`source_record_id`, `external_*`, `crystal_*`), so a second run updates instead of duplicating. |
| Permissions are per screen | Each console screen is a page in the permission grid with READ or WRITE. Shared pickers (find a customer, a site, a product) need READ on any CRM page and return names only. |

## 3. Screens

| Screen | What it is for | Main code |
|---|---|---|
| Overview | Headline figures, grade distribution, imports from other systems. | `analysisRead.service.js`, `crystalImport.service.js`, `vendorImport.service.js` |
| Customers | Customer list, Customer 360 record, Excel import, review tabs (pending registrations, e-shop assignments, duplicates). | `parties.service.js`, `customer360.service.js`, `registrationIntake.service.js` |
| Products | Catalogue, product instances, registrations. | `products.service.js` |
| Transfers | Requests to hand a product to someone else. | `products.service.js` |
| Transactions | Sales, purchases and refunds from every project. | `transactions.service.js` |
| Memberships | Each customer's status and tier per project. | `memberships.service.js` |
| Reward points | Point balances, the ledger, manual adjustments, point rules. | `ledger.js`, `points.service.js` |
| Service cases | Repairs, complaints and enquiries from every project. | `cases.service.js` |
| Sites / Service center activity | Physical places, what they may do, what happened there, targets. | `sites.service.js` |
| Events | Customer activity events with targets, quotas, reservations and awards. | `events.service.js` |
| Segments / Campaigns | Customer groups and outreach. | `marketing.service.js` |
| Analysis | Analysis runs, snapshots, score model, grade bands. | `analysisRun.service.js`, `analysis.service.js` |
| Settings | Every basic list (projects, grades, statuses, categories, ...). | `crm.routes.js` (vocabularies), `vocabulary.repository.js` |

## 4. Projects

Screen: **Settings > Projects**. Codes and names are the administrator's own. The Excel import and the User PK rule
find their projects by **identity role**, never by code. Only the imports from the old systems look projects up by
code: the Crystal import needs a project coded `CRYSTAL`, and platform-account links, point types without an owner
project and campaigns without a project fall back to `PLATFORM` when one exists.

| Change | Allowed when | Notes |
|---|---|---|
| Name, kind (`project_type_code`), source system, legal entity, status | Always | The kind is a free label (PLATFORM, COMMERCE, CRM, ...). |
| Identity role (`identity_role`) | Always; one project per role | **E-shop**: the project of the Excel import's E-shop PK / ID columns. **User management**: the project of its User PK / User ID columns, whose user_pk merges rows. The import refuses to run until both roles are given. |
| Code (`project_code`) | Only while no row in any other table references the project | The check reads the foreign keys from the database, so it covers every table. When blocked, the message names the tables that use the project. |
| Delete | Only while no row references the project | Same check. A project in use can be set INACTIVE instead. |

Renaming a code the old-system imports look up (`CRYSTAL`, `PLATFORM`) means those imports no longer find the project;
do that only deliberately. Identity roles can be moved between projects at any time.

## 5. Customers and identity

### 5.1 Parties

- A customer is a `crm_party` row (PERSON or ORGANIZATION) plus `crm_person` or `crm_organization` details. A
  trigger refuses person details on an organization and vice versa.
- A person has a full name, gender, birth date (or year only), job title (`crm_job_title`), home location
  (`crm_location`, the vendor location list), a written address (`address_line`, free text kept for search), and
  `is_checked_manually` (set when a manager has reviewed the person by hand).
- The address is shown once: the written address when there is one, otherwise the location name.
- The project a customer came from (`origin_project_id`) is always chosen - on the New customer form, or per Excel
  row - and never assumed.
- **Phone numbers and other contacts** are rows of `crm_contact_point`, one per value, so a customer can have any
  number of phones. `normalized_value` (digits only for phones) is used for matching and search. Merging keeps every
  phone (section 5.4), and the customer record shows all of them.

| Status | Meaning |
|---|---|
| ACTIVE | A usable customer. |
| INACTIVE | Kept, but left out of new segments, events and campaigns. |
| MERGED | Merged into another customer; `merged_into_party_pk` points at the survivor. |
| DELETED | Kept for history only. |

### 5.2 Project accounts and their ids

A project account links a customer to the account a project issued (`crm_project_account`). Each account has two ids,
named the same way everywhere in the console:

| Console label | Field | What it is | Example (e-shop) |
|---|---|---|---|
| **Account PK** | `external_account_id` | The project's internal key for the account. Unique per project while linked. | `eshop_pk` |
| **Account ID** | `external_login` | The id the customer signs in with. | `eshop_id` |

The database and the department API keep the field names above; only the console labels changed.

### 5.3 The duplicate check (weighted matching)

Used by **every** way a person enters the CRM: the console form, the Excel import, the department API and the
project imports (`personDuplicates.js`, `registrationIntake.service.js`).

| Evidence (equal values only; a missing value never matches) | Points |
|---|---:|
| Same phone (any of the person's phones; punctuation ignored, country prefix kept) | 40 |
| Same name (case and repeated spaces ignored) | 25 |
| Same full birth date (a year alone earns nothing) | 25 |
| Same home location (the Location ID on the vendor list; the written address text is not compared) | 15 |
| Same occupation (job title) | 5 |

| Score | Outcome |
|---|---|
| below 50 | Different person: a new customer is created. |
| 50-69 | Uncertain: the person is **staged** in `crm_registration_intake` and **no customer is created** until an administrator decides. |
| 70-110 | Same person: merged into that customer, **if exactly one** strong match exists and it is not itself a pending intake. Several strong matches, or a match to a pending intake, also go to review. |

- **Excel imports only:** the same **User PK** (with the same User ID) is the same person whatever the phone, because
  a sheet lists one row per phone number. Such rows are merged automatically (scored 70) and every phone is kept on
  the one customer; the account is staged once. This also matches a customer who already carries that User PK - a
  linked user-management account, or a candidate ID from an earlier import. Without it, the score table decides.
- *Source record* on the review tabs is the key the registration has in the system it came from: the account id for a
  department API registration, the identifier for an account assignment, "Excel row N" for a spreadsheet row (stored
  as `excel:<file hash>:<row>`), and a dash for a console entry.
- Every review tab (and Existing duplicate records, Import errors) has a search box: name, phone, birthday, an e-shop
  or user identifier, the registration or customer number, or the source.
- The Excel file check treats rows the way the import will: a merged row becomes part of the customer it matched, a row
  going to review becomes a pending registration - so the tabs before *Add new users* match the result.
- Matching also compares against pending intakes, so two uncertain copies of one person cannot both slip through.
- All registrations take one database advisory lock, so two simultaneous submissions of the same person cannot both
  create a customer.
- Merging adds missing details (e.g. a birth date) to the existing customer, and later rows see that new evidence.

### 5.4 Review (Customers tabs)

| Tab | What is reviewed | Decisions |
|---|---|---|
| Pending registrations | Staged people with their candidates, scores and evidence. Opening one shows the incoming person's basic information (name, gender, birthday, every phone, location, address, job, origin project) with the project and identifiers (Account PK / ID) it came with, and the same for every candidate: its linked project accounts and the candidate IDs an Excel import listed for it. | *Merge into selected* (a customer, or a pending registration resolved first) or *Register as new*. |
| Account assignments | E-shop and user-management identifiers waiting to be confirmed. | *Assign identifier* links the account to the chosen customer (link method REVIEWED); *Reject assignment* discards it. |
| Resolved registrations | History of decisions; each is available to the originating department. | - |
| Existing duplicate records | Pairs among existing customers (`crm_identity_match_candidate`), found by *Look for duplicates*. | Merge, or keep apart. |
| Import errors | Rows of customer Excel imports that failed the file check (`crm_person_import_error`), with the cells as written and every reason. | Correct and import again, then *Dismiss*. |

**Merging keeps every phone.** A reviewed merge (*Merge into selected*) adds the incoming person's phones and missing
details to the customer. Merging two existing customers moves their accounts, contacts (every phone and email; a value
both had is kept once), products, cases and points to the survivor, re-proposes pending account assignments to the
survivor, records the move in `crm_party_merge_history` (so a wrong merge can be split again), and repoints department
results to the survivor.

### 5.5 Previously linked identifiers

Identifiers an imported spreadsheet listed for a person (for example an old e-shop account) are **not trusted** enough
to link directly. Once the person is created or merged, each one is staged as an e-shop assignment with that customer
as the candidate. The customer's **Accounts** tab lists them under *Previously linked identifiers (unverified)*, so
whoever handles an identity inquiry can compare what the caller says with what the person used before.

A manager with WRITE on Customers can decide each one **on the customer record itself**, without going to the
Account assignments tab (`POST /parties/:id/unverified-accounts/decide`):

| Action | Effect |
|---|---|
| Link to this customer | The identifier becomes a project account of this customer (link method REVIEWED), exactly as *Assign identifier* would. Refused if the account is already linked to another customer. |
| Reject | The assignment review is closed as REJECTED. The review is per identifier, so this also closes it for any other customer it was proposed for. |

An identifier that was never staged for review is staged first, then decided. Rows already decided (Verified,
Verified for another customer, Rejected) show their state and no buttons.

### 5.6 Excel import (phase-1 initial load)

Screen: **Customers > Import from Excel**. Code: `personImport.service.js`. Template: *Download template* (sample:
`docs/samples/crm-customers-sample.xlsx`, regenerated by `npm run crm:sample`).

| Column | Required | Notes |
|---|:---:|---|
| E-shop PK | yes | Becomes the Account PK of the e-shop identifier (the project with the **E-shop** identity role). |
| E-shop ID | yes | Becomes the Account ID. |
| User PK | yes | The customer's user_pk in the user management system (the project with the **User management** identity role). Becomes the Account PK of that identifier. |
| User ID | yes | The customer's user_id (login) there. Becomes the Account ID. |
| Full name, Gender (M/F), Birthday (YYYY-MM-DD), Mobile | yes | Used by the duplicate check. |
| Location ID, Address | yes | Location IDs come from the template's Locations sheet; the duplicate check compares the Location ID. The Address text is kept for search and display. |
| Origin project | no | A project code or ID from the template's Projects sheet. Empty cells take the **origin project chosen on the import screen**; with neither, the row is an error. |
| Job title ID | no | Job title IDs come from the template's Job titles sheet. |

- Phase 1 loads only **complete** people who **already have an e-shop account and a user-management account**.
- *Check the file* writes nothing. It sorts every row into tabs: **New customers**, **Review customers**, **Already
  customers** (a unique 70+ match with someone on file, shown only when there is one) and **Errors** (every reason,
  with the cells as written).
- *Add new users* is offered as soon as any row is valid; errors do not block it. New rows become customers with a new
  `party_pk`, review rows wait under *Pending registrations*, matches are merged, and error rows are kept in
  `crm_person_import_error` and listed under **Customers > Import errors** until dismissed. Nothing is saved before
  the button is clicked.
- Rows are checked against the file itself, existing customers and pending registrations, with the same scoring. Two
  rows with the same E-shop PK (or the same User PK) must be the same person (70+) with the same E-shop ID (or User
  ID), otherwise it is an error.
- Re-importing the same file is safe: each row's intake is keyed by the file's hash and row number.
- Both identifiers - e-shop and user management - become *Previously linked identifiers* (section 5.5) and wait under
  **Account assignments**; neither is linked directly.

### 5.7 Department API (registration and lookup from other systems)

Code: `crmIntegration.routes.js`, `projectApiKeys.service.js`, `identity.service.js`.

A department authenticates with a key issued to its project: `npm run crm:api-key -- issue <PROJECT_CODE> "Eshop production"`
prints the key once (`Authorization: Bearer crmk_...`). Only its hash is stored; `list` and `revoke` manage keys. The
project always comes from the key, never from the request.

| Endpoint | Purpose |
|---|---|
| `POST /registrations` | Register a person with `{ external_account_id, external_login?, party: { full_name, gender_code, birth_date, mobile, email, address_line, home_location_pk, job_title_id } }`. Runs the duplicate check. |
| `GET /accounts/:external_account_id` | Which customer an account belongs to, or the status of its registration. |
| `GET /identity-resolutions` | The results feed: decided registrations and merges the department has not acknowledged yet. |
| `POST /identity-resolutions/:id/acknowledge` | Mark a result as stored by the department. |

| Registration result | Meaning |
|---|---|
| `EXISTING` | This account is already linked; its `party_pk` is returned. |
| `MERGED` | Matched one customer (70+); the account is linked to it. |
| `CREATED` | No match of 50 or more; a new customer is created with the account. |
| `QUEUED` | 50-69 or conflicting matches; an administrator decides, then the account is linked. |

This is a pull integration: after a QUEUED registration is decided (or a customer is merged) the department reads the
customer key from the feed, stores it and acknowledges. No webhook is sent. The e-shop uses the same rules; only legacy
e-shop links read from vendor data (on the project with the E-shop identity role) go to account assignment.

### 5.8 Customer 360 record

Code: `customer360.service.js`, `engagement.service.js`. The header and overview cards come from `/parties/:id/360`;
the tabs read the full record from `/parties/:id`.

| Part | What it shows or does |
|---|---|
| Header | Name, gender, birthday, address (shown once), **every phone and email**, grade (section 12.3), lifetime spend, orders, products held, open cases. |
| Overview | Value and RFM, service summary, contact points (one line per phone and email), consent, relationships, tags and segments, key cards with "View all". Order, product and case rows open their details over the record. |
| Accounts tab | Accounts in each project (Account PK, Account ID, status, first use, last activity; unlink), previously linked identifiers (link or reject), memberships, point balances, tier changes, recent points. |
| Orders tab | The latest 50 orders. A search box and filters (project, type, status) narrow the list; clicking a row opens the order's details over the record. |
| Products tab | Products held now and before (search and filters; clicking one opens its details over the record), counts per class, transfers. |
| Service tab | Service summary, interactions (paged), and the latest 50 service cases with search and filters. Clicking a case opens it over the record, where it can be classified; the record reloads when it closes. |
| Campaigns tab | Campaigns that reached the customer, segments, events they were chosen for, reservations, awards. |
| Consent tab | **Contact points**: every phone, email and other contact with type, primary, verified, status and date added (*Add* for another); channel consent at a glance; consent per project, purpose and channel. |
| Notes and files | Notes (one can be pinned) and files, stored in a private folder and only downloadable through the CRM. *Recent activity* (orders, refunds, cases, registrations, visits, tier changes, entries) scrolls in a fixed height; an order, case or product in it opens over the record. |
| Organizations only | Types (sales agency, service-centre operator, supplier, ...), industries, group tree (parent companies), key contacts with their roles, account team, agreements. |

Amounts are in the reporting currency so spend from different projects adds up; refunds reduce spend and cancelled
orders do not count.

**Log interaction** (actions menu, or the Interactions card on the Service tab) records a contact that has already
happened: direction (inbound or outbound), channel, type, outcome, a summary and details, optionally the service case
and project it was about and its duration. It is stored in `crm_party_interaction` with the manager who logged it and
feeds the Interactions list, the timeline and the service summary counts. It sends nothing; *Send message* is the
action that contacts the customer.

## 6. Communication and consent

- What may be sent is defined per **project x purpose x channel** (`crm_project_communication_option`); a purpose may
  require explicit opt-in.
- A customer's consent per option is `crm_party_communication_consent`; every change is appended to
  `crm_consent_event` with who changed it and the evidence.
- A message from the customer record and every campaign send obey the same checks:

| Check | Fails when |
|---|---|
| The option exists | The project does not offer that purpose on that channel. |
| Consent | Opt-in is required and not in force. |
| A usable contact | The customer has no live contact of the channel's type. |

A blocked contact is recorded with the reason. Messages are recorded as QUEUED for a provider; the console has no
message gateway.

## 7. Products, registrations and transfers

Screens: **Products**, **Transfers**. Code: `products.service.js`.

| Level | What it is |
|---|---|
| Catalogue product | A product a project sells (per project). |
| Instance | One concrete item: a phone by IMEI, a TV by serial, a licence by key hash bound to a device, an app entitlement. |
| Registration | One customer's relationship to an instance for a period: OWNER, USER, REGISTERED_USER, LESSEE, LICENSEE. `valid_to IS NULL` means current. |

- An exclusive relationship (OWNER) can have only one current holder; a second owner is refused with the current
  owner's key. Registering as owner can pay points by point rule; re-registering the same device does not pay twice.
- Registration answers (purchase purpose, usage, acquisition, extra questions per class) are stored with the
  registration.
- Per-customer product counts per class (`crm_party_product_class_stat`) are rebuilt, never incremented, and roll up
  to parent classes (a PHONE_9 is also a SMARTPHONE).

A **transfer** (ownership transfer, assign user, end assignment, return to owner, lease, licence rebind) moves through
these states; completing it ends one registration and starts the next in one transaction, so "who had this phone in
March" stays answerable:

| From | To |
|---|---|
| REQUESTED | ACCEPTED, REJECTED, CANCELLED, COMPLETED, EXPIRED |
| ACCEPTED | COMPLETED, CANCELLED, EXPIRED |
| COMPLETED, REJECTED, CANCELLED, EXPIRED | - (final) |

## 8. Transactions

Screen: **Transactions**. Sales, licence and app purchases, service and reservation payments, refunds, returns and
reversals from every project.

- A refund is its own row pointing at the original.
- `reporting_net_amount` converts to the reporting currency (native currency and company coins at the rate in system
  settings).
- Points and diamonds are recorded as `points_used`, never as money.

## 9. Memberships and points

Screens: **Memberships**, **Reward points**. Code: `ledger.js`, `points.service.js`.

- A membership is a customer's status in one project (tier, member number); tier changes are kept in history.
- **Points** have one ledger (`crm_point_event`) for every currency but one balance per currency
  (`crm_point_account`). Currencies are not interchangeable (karaoke points cannot buy an app).

| Ledger rule | How it is enforced |
|---|---|
| Every movement goes through `ledger.post` | The account is locked first. |
| A balance never goes below zero | Refused, except when mirroring an import. |
| `balance = lifetime_earned - lifetime_spent` | A table constraint. |
| Each entry records the balance it left | `points_balance_after`. |
| The sign matches the entry type | An EARN cannot be negative. |
| No editing a balance | A mistake is corrected by a manual adjustment that requires a reason; both entries stay. |
| Cache matches ledger | `v_crm_point_account_drift` lists any account whose balance differs from its ledger (should be empty). |

**Point rules** (`crm_point_rule`) define what earns points: product registration (by product or class), daily login,
duties, purchases, repairs, surveys, blog posts, manual, event awards; optionally capped per day.

## 10. Service cases

Screen: **Service cases** (also opened in place from a customer's Service tab). Code: `cases.service.js`.

- One summary per service contact from any project. Crystal repairs keep their full workflow in `repair_tickets`; the
  import brings a summary here, mapping each project's status codes to CRM statuses through `crm_service_status_map`.
- A case that came from a ticket is not edited here (the next import would overwrite it), but its classification is
  the CRM's own.
- Complaints, enquiries and other projects' cases can be opened directly.
- Classification: issue reported, fault found, root cause, resolution (configurable lists in Settings).

## 11. Sites, events, segments and campaigns

### 11.1 Sites and service center activity

Screens: **Sites**, **Service center activity** (formerly "Location activity"). Code: `sites.service.js`.

| Part | What it is |
|---|---|
| Site | A physical place (service centre, sales agency, collection point, partner shop, office, event venue) with an operator organization, a location and **capabilities** per project, with validity dates. |
| Activity log | `crm_service_center_activity`, the fact table: a repair taken in, a device sold, an app installed, a reservation picked up, a prize handed over. Some rows are written by the CRM itself (pickups, awards, counter registrations, the Crystal import); the rest by the site. A wrong row is reversed, not deleted. |
| Targets | Per site, activity and period, read against the log (`v_crm_service_center_activity_progress`). |
| On-site events | `crm_service_center_event`: promotion days, launches, roadshows, training, inspections, pickup days. |

### 11.2 Events (formerly "programs")

Screen: **Events**. Code: `events.service.js`. An event is a customer activity with limited participation. It is not
marketing outreach (that is a campaign) and not activity history.

| Part | What it is |
|---|---|
| Targets | Who may take part and how many entries each may take, built from the eligibility basis: a segment, a points ranking (top N by balance at a cutoff date), a corporate grade (the effective grade, section 12.3), products registered, service center activity (`SERVICE_CENTER_ACTIVITY`), a manual list, an import, or open to everyone. Each target records why it qualified. |
| Tiers | Classes inside an event by qualifying value, each with entries per target and its own number range. |
| Quotas | How many entries exist overall, per entry type (NORMAL / REWARD), per tier or per site. A quota can never be overbooked. |
| Reservations | Numbered entries (prefix + number + suffix) with the holder's name, phone and a hash of their ID card (one card, one entry), from PENDING / RESERVED to PAID and FULFILLED at a pickup site. An entry may cost points; cancelling refunds them. |
| Rewards and awards | What the event hands out (goods, coupons, points, wallet credit) and to whom. A points award is paid through the ledger. |

| Lifecycle step | Meaning |
|---|---|
| DRAFT | Being prepared. |
| APPROVED | Approved by a **second** manager; the database refuses approval by the creator. |
| TARGETS_FROZEN | The participant list stops changing. |
| OPEN | Entries can be taken. |
| CLOSED | No more entries. |
| FULFILLED | Everything handed out. |
| CANCELLED | Possible from any unfinished step; releases open entries and refunds their points. |

### 11.3 Segments and campaigns

Screens: **Segments**, **Campaigns**. Code: `marketing.service.js`.

- A **segment** is a named rule ("owns a class 9 phone and has not visited a service centre this year"). Rules are
  JSON compiled from a fixed list of conditions, never raw SQL. Editing a rule starts a new version; evaluation adds
  newcomers and closes the membership of those who no longer match, so past membership stays traceable. The
  "corporate grade at least" condition uses the effective grade (section 12.3).
- A **campaign** freezes an **audience** before doing anything (from a segment, an event's targets, a rule or a list).

| Campaign part | What it is |
|---|---|
| Actions | Send message, call, push, in-app. Preparing an action decides per member whether they may be contacted (consent and a usable contact) and records the reason when not. |
| Content | What is sent; locked once used. |
| Interactions | Opens and clicks. |
| Conversions | Purchases, registrations and entries attributed within the window. |
| Costs | Spend, for the campaign's ROI. |

## 12. Analysis and grades

Screen: **Analysis**. Code: `analysisRun.service.js`, `analysisRead.service.js`, `analysis.service.js`.

### 12.1 Analysis runs

An analysis run writes, for one reference date and every active customer, a snapshot per project and one Dream-wide
snapshot recalculated from the facts (not summed from project rows): spend and purchases (lifetime and 12 months),
active purchase days, average purchase, service cases, complaints, devices held, points earned, site visits, and
activity status (NEW, ACTIVE, AT_RISK, LAPSED, NEVER_BOUGHT). Running twice for the same date gives the same result.

Custom metrics are definitions plus values (`crm_metric_definition`, `crm_party_metric_value`), so a new metric needs
no new column.

### 12.2 Computed score and grade

The **corporate score** (0-100, six capped parts; value and frequency scored by percentile rank among recent buyers)
is on the Dream-wide snapshot, with the parts kept in `score_components` so a grade can always be explained. The
**computed grade** is the `crm_corporate_grade` band the score falls in; the bands are edited in **Settings >
Corporate grades**, and moving a boundary regrades customers on the next run. A customer that has never been through
a run has no computed grade.

### 12.3 Grade set by hand (effective grade)

A manager with WRITE on Customers can give a customer a grade by hand: the pencil next to *Customer grade* in the
record's header, or *Set grade* in the actions menu, with an optional reason (`PUT /parties/:id/grade`). It is stored
on the customer (`crm_party.assigned_grade_*`) and recorded in the audit log.

| Where the grade is used | Which grade |
|---|---|
| Customer 360 header | The hand-set grade if any ("Set by <manager> on <date>"; the tooltip shows the reason and the computed grade), otherwise the computed one ("Since <date>"). |
| Customers list (column and grade filter) | The effective grade: hand-set first, otherwise computed. Hand-set grades carry a small hand icon. |
| Segment condition "corporate grade at least" | The effective grade. |
| Event eligibility basis CORPORATE_GRADE | The effective grade. |
| Analysis screen (distribution, snapshots) | The computed grade only. Runs keep computing it underneath a hand-set grade. |

*Use the computed grade* in the actions menu clears the hand-set grade. A grade must be one of the active bands.

## 13. Imports from other systems

Screen: **Overview > Import**. Every import only reads its source and can be re-run.

| Import | Code | What it brings |
|---|---|---|
| Crystal | `crystalImport.service.js` | Locations (the vendor list), service centres and their services, members (through the same identity resolution, plus their platform account), registered devices, point logs, repair tickets. Each step is its own transaction, in dependency order. |
| Eshop and Appstore | `vendorImport.service.js` | Accounts (which account belongs to which member comes from the vendor platform's merge table), memberships and card levels, orders as sales and refunds, app purchases as purchases plus entitlements. |

## 14. Settings and internal organization

**Settings** edits the basic lists: projects, currencies, product classes, project tiers, point types and point event
types, service center activity types, case types, service statuses and the status map, priorities, issue, fault, root-cause and
resolution categories, corporate grades, ways to hold a product, relationships between customers, purchase purposes,
usage and acquisition types, registration questions, channels, communication purposes and options, organization
types, contact roles, industries, tags, job titles, **locations** (*Refresh from vendor* copies the vendor's list
again: new ones added, changed ones updated, none removed), metric definitions and departments.

| Rule | Applies to |
|---|---|
| A value in use cannot be deleted | Every list (the foreign keys refuse it). |
| A code the system depends on cannot be renamed or deleted | e.g. point type CRYSTAL, activity RESERVATION_PICKUP, case type REPAIR. Names, order and flags stay editable. |
| Code change and delete only while unused | Projects (section 4). |

**Starting from an empty CRM**, enter the basic data first. Codes are free except these, which the program looks up:

| List | Codes the program uses |
|---|---|
| Projects | Identity roles **E-shop** and **User management** on two projects (needed by the Excel import); `CRYSTAL` only for the Crystal import |
| Currencies | `USD`, one currency marked as the reporting currency |
| Point types / point event types | `CRYSTAL` / `EARN`, `REDEEM`, `EXPIRE`, `ADJUST`, `REFUND`, `RESERVATION_COST`, `EVENT_AWARD`, `MERGE_CARRY_OVER` |
| Product classes | `SMARTPHONE`, `EPRODUCT`, `SOFTWARE`, `STB`, `PC`, `CAMERA`, `KARAOKE_LICENCE`, `MEDIA_LICENCE` |
| Ways to hold a product | `OWNER`, `USER`, `REGISTERED_USER`, `LESSEE`, `LICENSEE` |
| Acquisition types | `PURCHASED`, `TRANSFER`, `COMPANY_ASSIGNED` |
| Service center activity types | `REPAIR_INTAKE`, `REPAIR_DELIVERY`, `RESERVATION_PICKUP`, `PRIZE_HANDOVER`, `REGISTRATION_ASSIST` |
| Case types / service statuses / priorities | `REPAIR`, `WARRANTY_REPAIR` / `CLOSED`, `CANCELLED` (final) / `LOW`, `NORMAL`, `HIGH` |
| Relationships between customers | `SPOUSE`, `PARENT`, `CHILD`, `SIBLING`, `RELATIVE`, `REFERRER`, `REFERRAL`, `PARENT_COMPANY`, `SUBSIDIARY`, `AFFILIATE`, `PARTNER` |
| Metric definitions | `DAYS_SINCE_LAST_PURCHASE`, `CROSS_PROJECT_COUNT`, `PRODUCT_OWNERSHIP_COUNT`, `CHURN_RISK`, `POINTS_BALANCE`, `IS_MULTI_PROJECT`, `LAST_SERVICE_DATE` |
| Locations, job titles | Any; the Excel import checks its Location ID and Job title ID columns against them |

Departments (`crm_department`) describe the internal organization: each manager belongs to one, and a role can be
reserved for a department. Permissions themselves always come from roles.

## 15. Testing, verification and documentation

| Command | What it does | Needs |
|---|---|---|
| `npm run test:identity` | Matching scores, intake/merge/review workflow, Excel parsing and import, e-shop staging, department API rules (in memory). | nothing |
| `node scripts/check-crm.js <url>` | End-to-end checks through the console API: permissions, customers, Excel import and e-shop staging, products and transfers, points, events, segments, campaigns, sites. | running API on a dev database |
| `PG_SCHEMA=<schema> node scripts/check-crm-integration.js <url>` | Department API (keys, CREATED/MERGED/EXISTING/QUEUED, feed, acknowledge, validation, e-shop) and project editing rules. | running API on a dev database |
| `node scripts/verify-migrations.js` | Builds the full migration chain in a throwaway schema and compares it with `schema.sql`. | dev database |
| `npm run crm:docs` | Regenerates `crm-database.md` (refuses while any field is undocumented) and writes the Word copies of both documents. | dev database |
| `npm run crm:mock-import` | Writes `docs/samples/crm-customers-test-import.xlsx`: 260+ rows covering new customers, one person on several rows (one per phone), exact copies, a second account for the same person, review cases (50 and 65 points), copies of rows under review, look-alikes that are different people, and every kind of error. Its *Test cases* sheet says what each row should become. IDs are read from the database's own lists. | dev database |
| `node scripts/crm-docs-word.js` | Writes only the Word copies, from the markdown as it is. | nothing |

The check scripts write test data (coded with the run id). Run them against a development or staging database, never
production.
