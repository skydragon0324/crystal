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
| Console screens | `crystal-admin/src/pages/crm/<feature>/*` | One folder per area of the **CRM** menu (overview, customers, transactions, memberships, points, products, service, events, marketing, analysis, settings); the customer record and its tabs are under `customers/detail/`, its live project sections under `customers/detail/projects/`, and pieces several screens use under `shared/`. |
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
| Reward points | The points each linked business-system account holds in its own system (one row per account), weighted by project into a company-wide score that is never stored. The CRM's own ledger (one balance per point currency) is kept but not part of that score. | `crm_reward_points`, `crm_point_*` |
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
| Overview | Headline figures, trends, work waiting and data-feed health. | `analysis.service.js` |
| Customers | Customer list, Customer 360 record, Excel import, review tabs (pending registrations, e-shop assignments, duplicates). | `parties.service.js`, `customer360.service.js`, `registrationIntake.service.js` |
| Products | Catalogue, product instances, registrations. | `products.service.js` |
| Transfers | Requests to hand a product to someone else. | `products.service.js` |
| Transactions | Sales, purchases and refunds from every project. | `transactions.service.js` |
| Memberships | Each customer's status and tier per project. | `memberships.service.js` |
| Reward points | One line per customer with their company-wide points, opening to the rows behind them; Excel template and import. The CRM ledger's tabs (balances, the ledger, manual adjustments, point rules) are hidden for now. | `rewardPoints.service.js` (`ledger.js`, `points.service.js` for the hidden ledger) |
| Service cases | Repairs, complaints and enquiries from every project. | `cases.service.js` |
| Sites / Service center activity | Physical places, what they may do, what happened there, targets. | `sites.service.js` |
| Events | Customer activity events with targets, quotas, reservations and awards. | `events.service.js` |
| Segments / Campaigns | Customer groups and outreach. | `marketing.service.js` |
| Analysis | Analysis runs, snapshots, score model, grade bands. | `analysisRun.service.js`, `analysis.service.js` |
| Settings | Every basic list (projects, grades, statuses, categories, ...). | `crm.routes.js` (vocabularies), `vocabulary.repository.js` |

## 4. Projects

Screen: **Settings > Projects**. Codes and names are the administrator's own. The Excel import and the User ID rule
find their projects by **identity role**, never by code. No code looks a project up by its code, and none is created on install:
whatever needs a project and has none is refused with a message saying which one to set - a point type without an owner
project, a campaign without a project, a customer without an origin project.

| Change | Allowed when | Notes |
|---|---|---|
| Name, kind (`project_type_code`), source system, legal entity, status | Always | The kind is a free label (PLATFORM, COMMERCE, CRM, ...). |
| Identity role (`identity_role`) | Always; one project per role | **E-shop**: the project of the Excel import's E-shop PK / ID columns. **User management**: the project of its User PK / User ID columns, whose user_id merges rows. The import refuses to run until both roles are given. |
| Code (`project_code`) | Only while no row in any other table references the project | The check reads the foreign keys from the database, so it covers every table. When blocked, the message names the tables that use the project. |
| Delete | Only while no row references the project | Same check. A project in use can be set INACTIVE instead. |

Identity roles can be moved between projects at any time.

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
| **Account ID** | `external_account_id` | The id the customer signs in with. **The account's key**: required, and unique per project while linked. | `eshop_id` |
| **Account PK** | `external_account_pk` | The project's internal key for the account. Optional. | `eshop_pk` |

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

- **Excel imports only:** the same **User ID** (user-management `user_id`) is the same person whatever the phone, because
  a sheet lists one row per phone number. Such rows are merged automatically (scored 70) and every phone is kept on
  the one customer; the account is staged once. This also matches a customer who already carries that User ID - a
  linked user-management account, or a candidate ID from an earlier import. Without it, the score table decides.
- *Source record* on the review tabs is the key the registration has in the system it came from: the Account ID for a
  department API registration, the identifier's Account ID for an account assignment, "Excel row N" for a spreadsheet row (stored
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
details to the customer. The reviewer may choose to take the registration's name, birthday, gender, address or job
title instead of the customer's; phones are never a choice - the customer always keeps every number, theirs and the
registration's. Merging two existing customers moves their accounts, contacts (every phone and email; a value
both had is kept once), products, cases and points (CRM ledger balances; an account's reward points follow the
account) to the survivor, re-proposes pending account assignments to the
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
| E-shop ID | yes | Becomes the Account ID (the key) of the e-shop identifier (the project with the **E-shop** identity role). |
| E-shop PK | no | Becomes its Account PK. |
| User ID | yes | The customer's user_id (login) in the user management system (the project with the **User management** identity role). Becomes the Account ID (the key) of that identifier. |
| User PK | no | The customer's user_pk there. Becomes its Account PK. |
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
  rows with the same E-shop ID (or the same User ID) must be the same person (70+) with the same E-shop PK (or User
  PK), otherwise it is an error. IDs and PKs are at most 250 characters.
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
| `POST /registrations` | Register a person with `{ external_account_id, external_account_pk?, party: { full_name, gender_code, birth_date, mobile, email, address_line, home_location_pk, job_title_id } }`. Runs the duplicate check. |
| `GET /accounts/:external_account_id` | Which customer an account (by its Account ID) belongs to, or the status of its registration. |
| `GET /identity-resolutions` | The results feed: decided registrations and merges the department has not acknowledged yet. |
| `POST /identity-resolutions/:id/acknowledge` | Mark a result as stored by the department. |
| `POST /reward-points` | Send the points each of the project's accounts holds there, one figure per account: `{ accounts: [{ external_account_id, points, as_of? }] }` (section 9). |

| Registration result | Meaning |
|---|---|
| `EXISTING` | An account with this Account ID is already linked in the project; its `party_pk` is returned. |
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
| Header | Name, gender, birthday, address (shown once), **every phone and email**, grade (section 12.3), lifetime spend, orders, products held, open cases, **company-wide points** (section 9; "N business systems not counted (no weight)" when a project has no weight). |
| Overview | Value and RFM, service summary, contact points (one line per phone and email), consent, relationships, tags and segments, key cards with "View all". Order, product and case rows open their details over the record. |
| Accounts tab | Accounts in each project (Account PK, Account ID, status, first use, last activity; unlink), a *Reward points* card (the company-wide total, opening to one row per account: business system, Account ID, points, weight, company-wide points, note; administrators add, edit and remove rows), previously linked identifiers (link or reject), memberships, tier changes. The CRM ledger's point balances and recent points are hidden for now. |
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

Screens: **Memberships**, **Reward points**. Code: `rewardPoints.service.js`; the CRM ledger: `ledger.js`, `points.service.js`.

- A membership is a customer's status in one project (tier, member number); tier changes are kept in history.
- **Each business system runs its own reward points** by its own rules, and the CRM does not re-create them or follow
  their movements. It keeps one figure per business-system account linked to a customer - the points that account
  holds there - in `crm_reward_points` (a customer with two accounts in one system has two rows), with when it was
  true, how it arrived and a note. No history is kept: a new figure replaces the old one.
- **Company-wide points** are never stored. `v_crm_party_company_points` works them out every time: each row's points
  times its project's *Point weight* (Settings > Projects), summed per customer. A project whose weight is empty is
  shown but not counted (no 1:1 rate is assumed), and the total says how many business systems were left out. It is
  for ranking and analysis only; nothing is spent from it.
- **The CRM's own ledger** (`crm_point_event`, one balance per currency in `crm_point_account`; earning rules, event
  costs and awards) is not part of the company-wide score. Its screens are hidden for now; its tables and code are
  unchanged. Currencies are not interchangeable (karaoke points cannot buy an app).

| Reward points rule | How it is enforced |
|---|---|
| Three ways in | An administrator adds, edits or removes a row on the customer's Accounts tab (*Reward points* card; source `MANUAL`); the business system sends them (`POST /api/integration/crm/reward-points`; source `API`); a manager uploads a sheet (Reward points > import: Project code, Account ID, Points, optional As of; source `IMPORT`). |
| One row per account | `project_account_id` is unique: a second row for the same account is refused (409); edit the row instead. Only the customer's linked accounts can be given a row. |
| An older figure never overwrites a newer one | A sent or imported figure whose `as_of` is older than the stored one is ignored as STALE. A figure entered by hand is as of the date given (empty = now) and always replaces the row. |
| Every line is answered | Unknown or unlinked accounts are UNKNOWN_ACCOUNT, bad numbers or times INVALID; nothing fails a push or a sheet as a whole. At most 5,000 lines per push or sheet. |
| The points belong to the account | The customer and the system come from `crm_project_account`, so a row follows its account on merge and unmerge, is neither shown nor counted once the account is unlinked, and is deleted with the account. |
| Audit | Pushes are not written to the audit log (each row keeps its source and time); manual and imported changes are. |

| CRM ledger rule | How it is enforced |
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
no new column. `POINTS_BALANCE` (*Company-wide points*) reads `v_crm_party_company_points` (section 9).

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

There are none. Customers arrive through the Excel import (Customers > Import from Excel), the console's own forms and
the department API (`/api/integration/crm`), which each take the project from the user or from the API key.

## 14. Settings and internal organization

**Settings** edits the basic lists: projects, currencies, product classes, project tiers, point types and point event
types, service center activity types, case types, service statuses and the status map, priorities, issue, fault, root-cause and
resolution categories, corporate grades, ways to hold a product, relationships between customers, purchase purposes,
usage and acquisition types, registration questions, channels, communication purposes and options, organization
types, contact roles, industries, tags, job titles, **locations** (*Refresh from vendor* copies the vendor's list
again: new ones added, changed ones updated, none removed), metric definitions and departments. Projects carry a
*Point weight* (section 9).

| Rule | Applies to |
|---|---|
| A value in use cannot be deleted | Every list (the foreign keys refuse it). |
| A code the system depends on cannot be renamed or deleted | e.g. activity RESERVATION_PICKUP, case type REPAIR. Names, order and flags stay editable. |
| Code change and delete only while unused | Projects (section 4). |

**Starting from an empty CRM**, enter the basic data first. Codes are free except these, which the program looks up:

| List | Codes the program uses |
|---|---|
| Projects | Identity roles **E-shop** and **User management** on two projects (needed by the Excel import); no project codes |
| Currencies | `USD`, one currency marked as the reporting currency |
| Point types / point event types | none / `EARN`, `REDEEM`, `EXPIRE`, `ADJUST`, `REFUND`, `RESERVATION_COST`, `EVENT_AWARD`, `MERGE_CARRY_OVER` |
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

---

# CRM: 론리와 기능

위 영문 문서의 한국어 번역입니다. 코드 경로·표 이름·칸 이름·API 경로·코드값·식별자는 원문 그대로 두었고, 콘솔의 화면 이름과 단추 이름도 화면에 보이는 대로 영문으로 두었습니다. 기술 용어는 처음 나올 때 영문을 함께 적었습니다.

크리스탈 CRM이 어떻게 동작하는가. 각 부분이 무엇을 위한 것이고, 어떤 규칙을 지키게 하며, 코드가 어디에 있는가. 모든 표와 칸은 [crm-database.md](crm-database.md)에 설명되어 있고, 1단계 신원 전개에 대한 기록은 [phase1-identity.md](phase1-identity.md)에 있습니다.

> 이 파일과 데이터베이스 참고서의 Word 사본은 `npm run crm:docs`가 만듭니다
> (`crm-logic.docx`, `crm-database.docx`). 이 markdown 파일을 고친 다음 다시 만드십시오.

## 1. 무엇이 어디에 있는가

| 부분 | 위치 | 비고 |
|---|---|---|
| 업무 론리 | `crystal-backend/src/services/crm/*` | 영역별로 봉사 하나(고객, 상품, 점수, 행사, ...). |
| 콘솔 API | `src/routes/crm.routes.js` | `/api/admin/crm`에 걸려 있고, 모든 경로가 해당 화면의 READ 또는 WRITE 권한을 점검한다. |
| 부문 API | `src/routes/crmIntegration.routes.js` | `/api/integration/crm`에 걸려 있고, 프로젝트 API 키로 인증한다. |
| 콘솔 화면 | `crystal-admin/src/pages/crm/<feature>/*` | **CRM** 메뉴의 영역별로 폴더 하나(overview, customers, transactions, memberships, points, products, service, events, marketing, analysis, settings). 고객 기록과 그 탭들은 `customers/detail/` 아래, 그 안의 프로젝트별 구역은 `customers/detail/projects/` 아래, 여러 화면이 함께 쓰는 조각은 `shared/` 아래에 있다. |
| 구조(schema) | `sql/schema.sql` | 진실의 근원. 모든 변경은 `sql/deltas`의 번호 붙은 델타이기도 하며, `src/db/migrations`의 이행이 그것을 돌린다. |
| 콘솔 번역 | `crystal-admin/src/i18n/crm.js` | 화면마다 한 구역, 이름은 그 파일을 따른다: `crm.customers`, `crm.customerImport`, `crm.registrationReview`, `crm.customer360`(`customer360Tabs`, `customer360Cards` 포함), `crm.events`, ... 여러 화면이 함께 쓰는 문장은 `crm.common`, 공유 선택기와 표는 `crm.components`. 영어 단어로 맞추는 말(칸 이름표, 코드, 자료 이름)은 `vocabulary.crm.<screen>`과 `codes`, `common`, `data`. 새 문자열은 자기 화면의 구역에, 세 언어 모두에 넣는다. |
| API 전언 | `crystal-backend/src/i18n/{en,zh,ru}.js` | `crm.<area>.<key>`, 영역마다 한 구역이며 이름은 그것을 던지는 봉사를 따른다(`crm.customers`, `crm.products`, `crm.events`, `crm.marketing`, `crm.settings`, ...). 여럿이 함께 쓰면 `crm.common`. |

## 2. 한 페이지로 본 모형

| 개념 | 무엇인가 | 주요 표 |
|---|---|---|
| 프로젝트(Project) | Dream 업무 체계 하나. 관리자가 Settings > Projects에서 정의한다(코드, 이름, 종류, 신원 역할). 모든 외부 번호는 자기 프로젝트 범위 안에 있다. | `crm_project` |
| 당사자(Party, 고객) | CRM이 아는 모든 상대: 사람 또는 조직. 현실의 고객 한 명당 `party_pk` 하나. | `crm_party`, `crm_person`, `crm_organization` |
| 프로젝트 계정 | "프로젝트 P의 계정 X는 고객 C의 것이다." 프로젝트를 넘나드는 신원 대응표. | `crm_project_account` |
| 등록 접수 | 들어온 사람 또는 식별자. 중복 점검을 통과해야 고객이 되거나 기존 고객에 합쳐진다. | `crm_registration_intake` |
| 상품(Product) | 목록의 품목, 구체적인 개체(IMEI, 번호, 라이선스), 그리고 시간에 따라 그것을 누가 가지고 있는가. | `crm_product_*` |
| 거래(Transaction) | 어느 프로젝트에서든 일어난 판매·구매·환불과 그 세부 줄. | `crm_transaction*` |
| 적립점수(Reward points) | 연결된 각 업무 체계 계정이 자기 체계에서 가진 점수(계정당 한 행). 프로젝트별 가중치를 매겨 전사 점수로 만들며, 그 전사 점수는 결코 저장하지 않는다. CRM 자신의 원장(점수 종류별 잔고 하나)은 유지하지만 그 전사 점수의 일부가 아니다. | `crm_reward_points`, `crm_point_*` |
| 봉사 사건(Service case) | 모든 봉사 접촉(수리, 신고, 문의)의 요약. | `crm_service_case*` |
| 접촉(Interaction) | 이미 일어난 고객 접촉(통화, 전자우편, 대화, 방문)을 직원이 적어 둔 것. | `crm_party_interaction` |
| 장소(Site) | 물리적 장소: 봉사소, 대리점, 수집소, 상점. 거기서 일어난 일을 기록한다. | `crm_service_center*` |
| 행사(Event) | 자리 수가 제한된 고객 활동: 예약, 추첨, 경품 봉사, 수수께끼, 설문 보상, 참가. (이전 이름은 "program".) | `crm_event*`, `crm_activity_*` |
| 세그먼트 / 캠페인 | 고객을 묶는, 판(version)이 있는 규칙 / 대상을 얼려 놓고 연락하는 대외 활동. | `crm_segment*`, `crm_campaign*` |
| 분석(Analysis) | 주기적인 고객별 수치, 전사 점수와 등급. | `crm_party_analysis_snapshot`, `crm_corporate_grade` |

모든 곳을 관통하는 규칙:

| 규칙 | 뜻 |
|---|---|
| `party_pk`가 고객 키다 | CRM의 모든 외래키와 부문 기록이 그것을 쓴다. `crm_party.party_id`는 이후 단계를 위해 비워 둔 것이다. 1단계에서는 아무것도 그것을 만들거나 읽지 않으므로 비어 있다. |
| 역사는 덮어쓰지 않고 닫는다 | 보유, 관계, 세그먼트 소속, 계정 연결은 `valid_to` / `unlinked_at`으로 끝난다. 원장(점수, 동의)은 덧붙이기만 한다. |
| 모든 반입은 다시 돌릴 수 있다 | 행마다 원천 키(`source_record_id`, `external_*`, `crystal_*`)를 지니므로, 두 번째 실행은 중복을 만들지 않고 고친다. |
| 권한은 화면 단위다 | 각 콘솔 화면은 권한 표의 한 페이지이며 READ 또는 WRITE를 갖는다. 공유 선택기(고객 찾기, 장소 찾기, 상품 찾기)는 아무 CRM 페이지에나 READ가 있으면 되고 이름만 돌려준다. |

## 3. 화면

| 화면 | 무엇을 위한 것인가 | 주요 코드 |
|---|---|---|
| Overview | 대표 수치, 추이, 기다리는 일, 자료 공급의 건강 상태. | `analysis.service.js` |
| Customers | 고객 목록, Customer 360 기록, 엑셀 반입, 심사 탭(대기 중 등록, 전자상점 배정, 중복). | `parties.service.js`, `customer360.service.js`, `registrationIntake.service.js` |
| Products | 상품 목록, 상품 개체, 보유 등록. | `products.service.js` |
| Transfers | 상품을 다른 사람에게 넘기는 요청. | `products.service.js` |
| Transactions | 모든 프로젝트의 판매·구매·환불. | `transactions.service.js` |
| Memberships | 프로젝트별 각 고객의 상태와 급(tier). | `memberships.service.js` |
| Reward points | 고객당 한 줄로 전사 점수를 보이고, 그 뒤의 행들을 펼쳐 볼 수 있다. 엑셀 서식과 반입도 있다. CRM 원장의 탭들(잔고, 원장, 손 조정, 점수 규칙)은 지금은 숨겨 두었다. | `rewardPoints.service.js` (숨겨 둔 원장은 `ledger.js`, `points.service.js`) |
| Service cases | 모든 프로젝트의 수리·신고·문의. | `cases.service.js` |
| Sites / Service center activity | 물리적 장소, 그곳이 할 수 있는 일, 거기서 일어난 일, 목표. | `sites.service.js` |
| Events | 목표·정원·예약·시상이 있는 고객 활동 행사. | `events.service.js` |
| Segments / Campaigns | 고객 묶음과 대외 활동. | `marketing.service.js` |
| Analysis | 분석 실행, 집계, 점수 모형, 등급 구간. | `analysisRun.service.js`, `analysis.service.js` |
| Settings | 모든 기초 목록(프로젝트, 등급, 상태, 분류, ...). | `crm.routes.js`(어휘), `vocabulary.repository.js` |

## 4. 프로젝트

화면: **Settings > Projects**. 코드와 이름은 관리자가 정합니다. 엑셀 반입과 User ID 규칙은 자기 프로젝트를 **신원 역할(identity role)**로 찾으며, 코드로는 결코 찾지 않습니다. 어느 코드도 프로젝트를 코드로 조회하지 않고, 설치 때 만들어지는 프로젝트도 없습니다. 프로젝트가 필요한데 없는 것은 어느 것을 설정해야 하는지 말하는 전언과 함께 거부됩니다 — 소유 프로젝트가 없는 점수 종류, 프로젝트 없는 캠페인, 출신 프로젝트 없는 고객.

| 변경 | 허용되는 때 | 비고 |
|---|---|---|
| 이름, 종류(`project_type_code`), 원천 체계, 법인, 상태 | 언제나 | 종류는 자유로운 이름표다(PLATFORM, COMMERCE, CRM, ...). |
| 신원 역할(`identity_role`) | 언제나, 역할당 프로젝트 하나 | **E-shop**: 엑셀 반입의 E-shop PK / ID 칸이 가리키는 프로젝트. **User management**: User PK / User ID 칸이 가리키는 프로젝트이며, 그 user_id로 행을 합친다. 두 역할이 다 주어질 때까지 반입은 돌기를 거부한다. |
| 코드(`project_code`) | 다른 어떤 표에도 그 프로젝트를 참조하는 행이 없을 때만 | 점검은 데이터베이스에서 외래키를 읽으므로 모든 표를 포함한다. 막힐 때는 그 프로젝트를 쓰는 표들을 전언이 이름으로 말해 준다. |
| 삭제 | 그 프로젝트를 참조하는 행이 없을 때만 | 같은 점검. 쓰이고 있는 프로젝트는 대신 INACTIVE로 둘 수 있다. |

신원 역할은 언제든 프로젝트 사이에서 옮길 수 있습니다.

## 5. 고객과 신원

### 5.1 당사자

- 고객은 `crm_party` 행 하나(PERSON 또는 ORGANIZATION)에 `crm_person` 또는 `crm_organization` 세부가 붙은 것입니다. 조직에 사람 세부를, 사람에 조직 세부를 붙이는 것은 방아쇠(trigger)가 거부합니다.
- 사람은 이름 전체, 성별, 생년월일(또는 해만), 직업(`crm_job_title`), 거주지(`crm_location`, 공급사의 지역 목록), 글로 쓴 주소(`address_line`, 검색을 위해 자유 글로 보관), 그리고 `is_checked_manually`(책임자가 손으로 확인했을 때 세워짐)를 가집니다.
- 주소는 한 번만 보입니다. 글로 쓴 주소가 있으면 그것을, 없으면 지역 이름을 보입니다.
- 고객이 어느 프로젝트에서 왔는지(`origin_project_id`)는 늘 선택하는 것이며 — 새 고객 양식에서, 또는 엑셀 행마다 — 결코 짐작하지 않습니다.
- **전화번호와 그 외 연락처**는 `crm_contact_point`의 행이고 값마다 한 행이므로, 한 고객이 전화를 몇 개든 가질 수 있습니다. `normalized_value`(전화는 숫자만)가 대조와 검색에 쓰입니다. 병합은 전화를 하나도 버리지 않으며(5.4절), 고객 기록은 그 전부를 보여 줍니다.

| 상태 | 뜻 |
|---|---|
| ACTIVE | 쓸 수 있는 고객. |
| INACTIVE | 보관하되, 새 세그먼트·행사·캠페인에서 제외한다. |
| MERGED | 다른 고객에 병합됨. `merged_into_party_pk`가 살아남은 쪽을 가리킨다. |
| DELETED | 역사를 위해서만 보관한다. |

### 5.2 프로젝트 계정과 그 번호

프로젝트 계정은 고객과, 프로젝트가 발급한 계정을 잇습니다(`crm_project_account`). 계정마다 번호가 둘 있고, 콘솔 어디서나 같은 이름으로 부릅니다.

| 콘솔 이름표 | 칸 | 무엇인가 | 보기(전자상점) |
|---|---|---|---|
| **Account ID** | `external_account_id` | 고객이 그것으로 로그인하는 번호. **계정의 키**이며 필수이고, 연결된 동안 프로젝트 안에서 유일하다. | `eshop_id` |
| **Account PK** | `external_account_pk` | 그 계정에 대한 프로젝트 내부 키. 선택 사항. | `eshop_pk` |

데이터베이스와 부문 API는 위의 칸 이름을 그대로 씁니다. 바뀐 것은 콘솔의 이름표뿐입니다.

### 5.3 중복 점검(가중 대조)

사람이 CRM에 들어오는 **모든** 길이 이것을 씁니다. 콘솔 양식, 엑셀 반입, 부문 API, 프로젝트 반입(`personDuplicates.js`, `registrationIntake.service.js`).

| 근거(값이 같을 때만. 값이 없으면 결코 맞은 것으로 보지 않는다) | 점수 |
|---|---:|
| 같은 전화(그 사람의 전화 중 어느 것이든. 기호는 무시하고 국가 번호는 유지) | 40 |
| 같은 이름(대소문자와 거듭된 빈칸 무시) | 25 |
| 같은 생년월일 전체(해만 같으면 0점) | 25 |
| 같은 거주지(공급사 목록의 Location ID. 글로 쓴 주소는 비교하지 않는다) | 15 |
| 같은 직업 | 5 |

| 점수 | 결과 |
|---|---|
| 50 미만 | 다른 사람: 새 고객을 만든다. |
| 50-69 | 불확실: 그 사람을 `crm_registration_intake`에 **올려 두고**, 관리자가 결정할 때까지 **고객을 만들지 않는다**. |
| 70-110 | 같은 사람: 강한 일치가 **정확히 하나**이고 그것 자체가 대기 중 접수가 아니라면 그 고객에 병합한다. 강한 일치가 여럿이거나 대기 중 접수와 맞으면 역시 심사로 간다. |

- **엑셀 반입에서만:** 같은 **User ID**(user-management의 `user_id`)는 전화가 무엇이든 같은 사람입니다. 표는 전화번호마다 한 행을 적기 때문입니다. 그런 행은 자동으로 병합되고(점수 70) 모든 전화가 한 고객에게 남으며, 계정은 한 번만 올려 둡니다. 이것은 이미 그 User ID를 지닌 고객 — 연결된 user-management 계정이거나, 이전 반입이 적어 둔 후보 번호 — 과도 맞습니다. 그것이 없으면 점수 표가 결정합니다.
- 심사 탭의 *Source record*는 그 등록이 온 체계에서 가지고 있던 키입니다. 부문 API 등록이면 Account ID, 계정 배정이면 그 식별자의 Account ID, 표 한 행이면 "Excel row N"(`excel:<file hash>:<row>`로 저장), 콘솔 입력이면 줄표입니다.
- 모든 심사 탭(과 Existing duplicate records, Import errors)에는 검색칸이 있습니다. 이름, 전화, 생일, 전자상점이나 사용자 식별자, 등록 번호나 고객 번호, 또는 출처로 찾습니다.
- 엑셀 파일 점검은 행을 반입이 다룰 방식 그대로 다룹니다. 병합될 행은 자기가 맞춘 고객의 일부가 되고, 심사로 갈 행은 대기 중 등록이 됩니다 — 그래서 *Add new users* 이전의 탭들이 결과와 일치합니다.
- 대조는 대기 중 접수와도 비교하므로, 한 사람의 불확실한 사본 둘이 동시에 빠져나갈 수 없습니다.
- 모든 등록은 데이터베이스 권고 잠금 하나를 잡으므로, 같은 사람을 동시에 두 번 제출해도 둘 다 고객을 만들 수는 없습니다.
- 병합은 빠진 세부(예: 생년월일)를 기존 고객에게 더하며, 뒤에 오는 행들은 그 새 근거를 보게 됩니다.

### 5.4 심사(Customers 탭)

| 탭 | 무엇을 심사하는가 | 결정 |
|---|---|---|
| Pending registrations | 올려 둔 사람들과 그 후보, 점수, 근거. 하나를 열면 들어온 사람의 기본 정보(이름, 성별, 생일, 모든 전화, 지역, 주소, 직업, 출신 프로젝트)를 함께 온 프로젝트와 식별자(Account PK / ID)와 같이 보여 주고, 후보마다 같은 것을 보여 준다. 그 후보에 연결된 프로젝트 계정과, 엑셀 반입이 그 후보에 대해 적어 둔 후보 번호들까지. | *Merge into selected*(고객, 또는 먼저 해결한 대기 중 등록) 또는 *Register as new*. |
| Account assignments | 확인을 기다리는 전자상점·user-management 식별자. | *Assign identifier*는 그 계정을 고른 고객에 연결한다(연결 방식 REVIEWED). *Reject assignment*은 버린다. |
| Resolved registrations | 결정의 역사. 각각은 그것을 보낸 부문이 가져갈 수 있다. | - |
| Existing duplicate records | 기존 고객들 사이의 짝(`crm_identity_match_candidate`). *Look for duplicates*로 찾는다. | 병합하거나, 따로 둔다. |
| Import errors | 파일 점검을 통과하지 못한 고객 엑셀 반입의 행들(`crm_person_import_error`). 칸은 적힌 그대로, 이유는 전부 보인다. | 고쳐서 다시 반입한 다음 *Dismiss*. |

**병합은 전화를 하나도 버리지 않습니다.** 심사를 거친 병합(*Merge into selected*)은 들어온 사람의 전화들과 빠진 세부를 고객에게 더합니다. 심사자는 고객의 것 대신 등록의 이름·생일·성별·주소·직업을 택할 수 있지만, 전화는 선택 대상이 아닙니다 — 고객은 자기 번호와 등록의 번호를 언제나 모두 지닙니다. 기존 고객 둘을 병합하면 계정, 연락처(모든 전화와 전자우편. 양쪽에 다 있던 값은 하나만 남습니다), 상품, 사건, 점수(CRM 원장 잔고. 계정의 적립점수는 계정을 따라갑니다)가 살아남은 쪽으로 옮겨지고, 대기 중인 계정 배정은 살아남은 쪽에 다시 제안되며, 그 이동이 `crm_party_merge_history`에 기록되고(그래서 잘못된 병합은 다시 쪼갤 수 있습니다), 부문에 돌려줄 결과도 살아남은 쪽을 가리키게 됩니다.

### 5.5 이전에 연결된 식별자

반입한 표가 어떤 사람에 대해 적어 둔 식별자(예를 들어 오래된 전자상점 계정)는 곧바로 연결할 만큼 **믿지 않습니다**. 그 사람이 만들어지거나 병합된 뒤, 각 식별자는 그 고객을 후보로 하는 전자상점 배정으로 올려집니다. 고객의 **Accounts** 탭이 그것들을 *Previously linked identifiers (unverified)* 아래에 보여 주므로, 신원 문의를 받은 사람이 전화를 걸어온 쪽의 말과 그 사람이 전에 쓰던 것을 맞춰 볼 수 있습니다.

Customers에 WRITE가 있는 책임자는 Account assignments 탭으로 가지 않고 **고객 기록에서 바로** 각각을 결정할 수 있습니다(`POST /parties/:id/unverified-accounts/decide`).

| 동작 | 결과 |
|---|---|
| Link to this customer | 그 식별자가 이 고객의 프로젝트 계정이 된다(연결 방식 REVIEWED). *Assign identifier*와 똑같다. 그 계정이 이미 다른 고객에 연결되어 있으면 거부된다. |
| Reject | 그 배정 심사가 REJECTED로 닫힌다. 심사는 식별자 단위이므로, 다른 고객에 대해 제안된 것까지 함께 닫힌다. |

심사에 올라 있지 않던 식별자는 먼저 올려진 다음 결정됩니다. 이미 결정된 행(Verified, Verified for another customer, Rejected)은 그 상태를 보이고 단추는 없습니다.

### 5.6 엑셀 반입(1단계 초기 적재)

화면: **Customers > Import from Excel**. 코드: `personImport.service.js`. 서식: *Download template*(보기: `docs/samples/crm-customers-sample.xlsx`, `npm run crm:sample`이 다시 만듭니다).

| 칸 | 필수 | 비고 |
|---|:---:|---|
| E-shop ID | 예 | 전자상점 식별자(**E-shop** 신원 역할을 가진 프로젝트)의 Account ID(키)가 된다. |
| E-shop PK | 아니오 | 그것의 Account PK가 된다. |
| User ID | 예 | user management 체계(**User management** 신원 역할을 가진 프로젝트)에서의 고객 user_id(로그인). 그 식별자의 Account ID(키)가 된다. |
| User PK | 아니오 | 거기서의 고객 user_pk. 그것의 Account PK가 된다. |
| Full name, Gender (M/F), Birthday (YYYY-MM-DD), Mobile | 예 | 중복 점검이 쓴다. |
| Location ID, Address | 예 | Location ID는 서식의 Locations 장에서 온다. 중복 점검은 Location ID를 비교한다. Address 글은 검색과 표시를 위해 보관한다. |
| Origin project | 아니오 | 서식의 Projects 장에 있는 프로젝트 코드나 번호. 빈 칸은 **반입 화면에서 고른 출신 프로젝트**를 따르며, 둘 다 없으면 그 행은 오류다. |
| Job title ID | 아니오 | 직업 번호는 서식의 Job titles 장에서 온다. |

- 1단계는 **전자상점 계정과 user-management 계정을 이미 가진**, **완전한** 사람만 적재합니다.
- *Check the file*은 아무것도 쓰지 않습니다. 모든 행을 탭으로 가릅니다. **New customers**, **Review customers**, **Already customers**(기존 고객과 70점 이상으로 유일하게 맞은 경우. 하나일 때만 보입니다), **Errors**(모든 이유와 함께, 칸은 적힌 그대로).
- *Add new users*는 유효한 행이 하나라도 있으면 바로 쓸 수 있습니다. 오류가 그것을 막지 않습니다. 새 행은 새 `party_pk`를 가진 고객이 되고, 심사 행은 *Pending registrations* 아래에서 기다리며, 맞은 것은 병합되고, 오류 행은 `crm_person_import_error`에 보관되어 버릴 때까지 **Customers > Import errors**에 나열됩니다. 단추를 누르기 전에는 아무것도 저장되지 않습니다.
- 행은 파일 자신, 기존 고객, 대기 중 등록과 같은 점수법으로 맞춰 봅니다. 같은 E-shop ID(또는 같은 User ID)를 가진 두 행은 같은 E-shop PK(또는 User PK)를 가진 같은 사람(70점 이상)이어야 하고, 그렇지 않으면 오류입니다. 번호와 PK는 250자 이하입니다.
- 같은 파일을 다시 반입해도 안전합니다. 각 행의 접수는 파일의 해시와 행 번호로 키를 삼습니다.
- 두 식별자 — 전자상점과 user management — 는 모두 *Previously linked identifiers*(5.5절)가 되어 **Account assignments** 아래에서 기다립니다. 어느 것도 곧바로 연결되지 않습니다.

### 5.7 부문 API(다른 체계로부터의 등록과 조회)

코드: `crmIntegration.routes.js`, `projectApiKeys.service.js`, `identity.service.js`.

부문은 자기 프로젝트에 발급된 키로 인증합니다. `npm run crm:api-key -- issue <PROJECT_CODE> "Eshop production"`이 키를 한 번만 인쇄합니다(`Authorization: Bearer crmk_...`). 저장되는 것은 그 해시뿐이며, `list`와 `revoke`로 키를 관리합니다. 프로젝트는 언제나 키에서 오고, 요청에서 오지 않습니다.

| 끝점 | 용도 |
|---|---|
| `POST /registrations` | `{ external_account_id, external_account_pk?, party: { full_name, gender_code, birth_date, mobile, email, address_line, home_location_pk, job_title_id } }`로 사람을 등록한다. 중복 점검을 돌린다. |
| `GET /accounts/:external_account_id` | 그 계정(Account ID로)이 어느 고객의 것인가, 또는 그 등록의 상태. |
| `GET /identity-resolutions` | 결과 흐름(feed): 부문이 아직 수신 확인하지 않은, 결정된 등록과 병합. |
| `POST /identity-resolutions/:id/acknowledge` | 결과를 부문이 저장했다고 표시한다. |
| `POST /reward-points` | 그 프로젝트의 각 계정이 거기서 가진 점수를 계정당 한 수치로 보낸다: `{ accounts: [{ external_account_id, points, as_of? }] }`(9절). |

| 등록 결과 | 뜻 |
|---|---|
| `EXISTING` | 이 Account ID를 가진 계정이 그 프로젝트에 이미 연결되어 있다. 그 `party_pk`를 돌려준다. |
| `MERGED` | 고객 하나와 맞았다(70점 이상). 계정을 그 고객에 연결했다. |
| `CREATED` | 50점 이상인 일치가 없다. 그 계정과 함께 새 고객을 만들었다. |
| `QUEUED` | 50-69점이거나 일치가 서로 엇갈린다. 관리자가 결정한 다음 계정을 연결한다. |

이것은 끌어가는(pull) 연동입니다. QUEUED 등록이 결정되거나 고객이 병합된 뒤, 부문이 결과 흐름에서 고객 키를 읽어 저장하고 수신 확인합니다. 웹훅(webhook)은 보내지 않습니다. 전자상점도 같은 규칙을 쓰며, 공급사 자료에서 읽은 기존 전자상점 연결(E-shop 신원 역할을 가진 프로젝트에서)만 계정 배정으로 갑니다.

### 5.8 Customer 360 기록

코드: `customer360.service.js`, `engagement.service.js`. 머리 부분과 개요 카드는 `/parties/:id/360`에서 오고, 탭들은 `/parties/:id`에서 기록 전체를 읽습니다.

| 부분 | 무엇을 보이거나 하는가 |
|---|---|
| 머리 | 이름, 성별, 생일, 주소(한 번만), **모든 전화와 전자우편**, 등급(12.3절), 평생 지출, 주문 수, 보유 상품 수, 미해결 사건 수, **전사 점수**(9절. 가중치 없는 프로젝트가 있으면 "N business systems not counted (no weight)"). |
| Overview | 가치와 RFM, 봉사 요약, 연락처(전화와 전자우편마다 한 줄), 동의, 관계, 태그와 세그먼트, 그리고 "View all"이 붙은 주요 카드들. 주문·상품·사건 행은 기록 위에 자기 세부를 띄운다. |
| Accounts 탭 | 프로젝트별 계정(Account PK, Account ID, 상태, 첫 사용, 마지막 활동. 연결 해제 가능), *Reward points* 카드(전사 합계. 계정당 한 행으로 펼침: 업무 체계, Account ID, 점수, 가중치, 전사 점수, 비고. 관리자가 행을 더하고 고치고 지운다), 이전에 연결된 식별자(연결 또는 거부), 회원 자격, 급 변경. CRM 원장의 점수 잔고와 최근 점수는 지금은 숨겨 두었다. |
| Orders 탭 | 최근 주문 50건. 검색칸과 거르개(프로젝트, 종류, 상태)로 목록을 좁히고, 행을 누르면 기록 위에 그 주문의 세부가 열린다. |
| Products 탭 | 지금 가진 상품과 전에 가졌던 상품(검색과 거르개. 누르면 기록 위에 세부가 열린다), 분류별 수, 이관. |
| Service 탭 | 봉사 요약, 접촉 기록(페이지로 나뉨), 그리고 최근 봉사 사건 50건을 검색과 거르개와 함께. 사건을 누르면 기록 위에 열리고 거기서 분류할 수 있으며, 닫으면 기록이 다시 읽힌다. |
| Campaigns 탭 | 그 고객에게 닿은 캠페인, 세그먼트, 뽑힌 행사, 예약, 시상. |
| Consent 탭 | **연락처**: 모든 전화·전자우편·그 외 연락처를 종류, 대표 여부, 확인 여부, 상태, 추가 날짜와 함께(*Add*로 더 넣는다). 통로별 동의를 한눈에 보이고, 프로젝트·목적·통로별 동의를 보인다. |
| 비고와 파일 | 비고(하나를 고정할 수 있다)와 파일. 파일은 비공개 폴더에 보관되며 CRM을 통해서만 내릴 수 있다. *Recent activity*(주문, 환불, 사건, 등록, 방문, 급 변경, 참가)는 정해진 높이 안에서 굴러가고, 그 안의 주문·사건·상품은 기록 위에 열린다. |
| 조직에만 | 종류(판매 대리점, 봉사소 운영자, 공급자, ...), 업종, 그룹 나무(모회사), 역할과 함께 적은 주요 담당자, 담당 조, 협정. |

금액은 보고 통화로 보이므로 서로 다른 프로젝트의 지출을 더할 수 있습니다. 환불은 지출을 줄이고, 취소된 주문은 세지 않습니다.

**Log interaction**(동작 메뉴, 또는 Service 탭의 Interactions 카드)은 이미 일어난 접촉을 적습니다. 방향(수신 또는 발신), 통로, 종류, 결과, 요약과 세부, 그리고 선택적으로 관련 봉사 사건과 프로젝트, 소요 시간. `crm_party_interaction`에 그것을 적은 책임자와 함께 저장되고, Interactions 목록과 시간선, 봉사 요약 수치에 반영됩니다. 아무것도 보내지 않습니다. 고객에게 연락하는 동작은 *Send message*입니다.

## 6. 전달과 동의

- 무엇을 보낼 수 있는지는 **프로젝트 × 목적 × 통로**로 정합니다(`crm_project_communication_option`). 목적에 따라 명시적 동의를 요구할 수 있습니다.
- 선택지별 고객 동의는 `crm_party_communication_consent`이고, 모든 변경은 누가 바꿨는지와 근거와 함께 `crm_consent_event`에 덧붙여집니다.
- 고객 기록에서 보내는 전언과 모든 캠페인 발송은 같은 점검을 지킵니다.

| 점검 | 실패하는 때 |
|---|---|
| 선택지가 존재하는가 | 그 프로젝트가 그 통로로 그 목적을 제공하지 않을 때. |
| 동의 | 동의가 필요한데 유효하지 않을 때. |
| 쓸 수 있는 연락처 | 그 통로 종류의 살아 있는 연락처가 고객에게 없을 때. |

막힌 접촉은 이유와 함께 기록됩니다. 전언은 공급자에게 보낼 QUEUED로 기록되며, 콘솔에는 전언 관문이 없습니다.

## 7. 상품, 보유 등록, 이관

화면: **Products**, **Transfers**. 코드: `products.service.js`.

| 층 | 무엇인가 |
|---|---|
| 목록 상품 | 프로젝트가 판매하는 상품(프로젝트별). |
| 개체 | 구체적인 물건 하나: IMEI로 식별되는 전화, 번호로 식별되는 TV, 장치에 묶인 키 해시로 식별되는 라이선스, 앱 사용권. |
| 보유 등록 | 한 고객과 한 개체의 일정 기간의 관계: OWNER, USER, REGISTERED_USER, LESSEE, LICENSEE. `valid_to IS NULL`이면 현재다. |

- 배타적 관계(OWNER)는 현재 보유자가 하나뿐일 수 있습니다. 두 번째 소유자는 현재 소유자의 키와 함께 거부됩니다. 소유자로 등록하면 점수 규칙에 따라 점수를 줄 수 있으며, 같은 장치를 다시 등록해도 두 번 주지 않습니다.
- 등록 때의 답(구매 목적, 용도, 취득 방식, 분류별 추가 질문)은 그 등록과 함께 저장됩니다.
- 고객별·분류별 상품 수(`crm_party_product_class_stat`)는 더해 올리는 것이 아니라 다시 만들며, 상위 분류로 합쳐집니다(PHONE_9은 SMARTPHONE이기도 합니다).

**이관**(소유권 이관, 사용자 지정, 지정 종료, 소유자 반환, 임대, 라이선스 재결합)은 아래 상태들을 지나갑니다. 완료는 한 트랜잭션 안에서 한 등록을 끝내고 다음을 시작하므로, "3월에 이 전화를 누가 가지고 있었는가"에 계속 답할 수 있습니다.

| 에서 | 으로 |
|---|---|
| REQUESTED | ACCEPTED, REJECTED, CANCELLED, COMPLETED, EXPIRED |
| ACCEPTED | COMPLETED, CANCELLED, EXPIRED |
| COMPLETED, REJECTED, CANCELLED, EXPIRED | - (끝) |

## 8. 거래

화면: **Transactions**. 모든 프로젝트의 판매, 라이선스와 앱 구매, 봉사와 예약 결제, 환불, 반품, 취소.

- 환불은 원래 거래를 가리키는 자기 자신의 행입니다.
- `reporting_net_amount`은 보고 통화로 환산한 값입니다(고유 통화와 회사 주화를 체계 설정의 환율로).
- 점수와 다이아는 `points_used`로 기록하며, 결코 돈으로 기록하지 않습니다.

## 9. 회원 자격과 점수

화면: **Memberships**, **Reward points**. 코드: `rewardPoints.service.js`. CRM 원장: `ledger.js`, `points.service.js`.

- 회원 자격은 한 프로젝트에서의 고객 상태입니다(급, 회원 번호). 급 변경은 역사로 보관합니다.
- **업무 체계마다 자기 적립점수를 자기 규칙으로 운영하며**, CRM은 그것을 다시 만들거나 그 움직임을 따라가지 않습니다. 고객에게 연결된 업무 체계 계정마다 수치 하나 — 그 계정이 거기서 가진 점수 — 를 `crm_reward_points`에 둡니다(한 체계에 계정이 둘인 고객은 행이 둘입니다). 그것이 언제 참이었는지, 어떻게 들어왔는지, 비고와 함께. 역사는 두지 않습니다. 새 수치가 이전 것을 대신합니다.
- **전사 점수는 결코 저장하지 않습니다.** `v_crm_party_company_points`가 그때그때 계산합니다. 각 행의 점수에 그 프로젝트의 *Point weight*(Settings > Projects)를 곱해 고객별로 더합니다. 가중치가 비어 있는 프로젝트는 보이지만 세지 않으며(1:1 환산을 가정하지 않습니다), 합계는 업무 체계 몇 개가 빠졌는지 함께 말해 줍니다. 이것은 순위와 분석만을 위한 것이고, 거기서 무엇을 쓰지는 않습니다.
- **CRM 자신의 원장**(`crm_point_event`, 통화별 잔고 하나를 담은 `crm_point_account`. 적립 규칙, 행사 비용, 시상)은 전사 점수의 일부가 아닙니다. 그 화면들은 지금 숨겨져 있고, 표와 코드는 그대로입니다. 통화는 서로 바꿔 쓸 수 없습니다(노래방 점수로 앱을 살 수 없습니다).

| 적립점수 규칙 | 어떻게 지키게 하는가 |
|---|---|
| 들어오는 길 셋 | 관리자가 고객의 Accounts 탭에서 행을 더하거나 고치거나 지운다(*Reward points* 카드. 출처 `MANUAL`). 업무 체계가 보낸다(`POST /api/integration/crm/reward-points`. 출처 `API`). 책임자가 표를 올린다(Reward points > import: Project code, Account ID, Points, 선택적 As of. 출처 `IMPORT`). |
| 계정당 한 행 | `project_account_id`가 유일하다. 같은 계정에 두 번째 행은 거부된다(409). 대신 그 행을 고쳐라. 행을 줄 수 있는 것은 그 고객에 연결된 계정뿐이다. |
| 오래된 수치가 새 수치를 덮지 않는다 | 보내거나 반입한 수치의 `as_of`가 저장된 것보다 오래되면 STALE로 무시한다. 손으로 넣은 수치는 적어 준 날짜 기준이며(비어 있으면 지금), 늘 그 행을 대신한다. |
| 모든 줄에 답한다 | 모르는 계정이나 연결되지 않은 계정은 UNKNOWN_ACCOUNT, 잘못된 수나 시각은 INVALID다. 무엇도 전송이나 표 전체를 실패시키지 않는다. 전송 한 번, 표 하나에 5,000줄까지. |
| 점수는 계정에 속한다 | 고객과 체계는 `crm_project_account`에서 오므로, 행은 병합·병합 해제 때 자기 계정을 따라가고, 계정 연결이 풀리면 보이지도 세지도 않으며, 계정과 함께 지워진다. |
| 감사 | 전송은 감사 기록에 쓰지 않는다(행마다 출처와 시각을 지닌다). 손으로 한 변경과 반입은 쓴다. |

| CRM 원장 규칙 | 어떻게 지키게 하는가 |
|---|---|
| 모든 움직임은 `ledger.post`를 지나간다 | 계정을 먼저 잠근다. |
| 잔고는 결코 0 미만이 되지 않는다 | 거부된다. 반입을 비추는 경우만 예외. |
| `balance = lifetime_earned - lifetime_spent` | 표 제약이다. |
| 각 항목은 자기가 남긴 잔고를 적는다 | `points_balance_after`. |
| 부호가 항목 종류와 맞는다 | EARN은 음수가 될 수 없다. |
| 잔고를 고쳐 쓰지 않는다 | 잘못은 이유를 요구하는 손 조정으로 바로잡으며, 두 항목이 다 남는다. |
| 캐시가 원장과 맞는다 | `v_crm_point_account_drift`는 잔고가 자기 원장과 다른 계정을 나열한다(비어 있어야 한다). |

**점수 규칙**(`crm_point_rule`)은 무엇이 점수를 주는지 정합니다. 상품 등록(상품별 또는 분류별), 매일 로그인, 임무, 구매, 수리, 설문, 블로그 글, 손 입력, 행사 시상. 하루 상한을 둘 수도 있습니다.

## 10. 봉사 사건

화면: **Service cases**(고객의 Service 탭에서 그 자리에 열 수도 있습니다). 코드: `cases.service.js`.

- 어느 프로젝트에서 온 것이든 봉사 접촉마다 요약 하나입니다. 크리스탈 수리는 자기 작업 흐름 전체를 `repair_tickets`에 두고, 반입은 요약만 여기로 가져오면서 각 프로젝트의 상태 코드를 `crm_service_status_map`을 통해 CRM 상태로 대응시킵니다.
- 접수표에서 온 사건은 여기서 고치지 않습니다(다음 반입이 덮어쓸 것입니다). 다만 그 분류는 CRM 자신의 것입니다.
- 신고, 문의, 다른 프로젝트의 사건은 곧바로 열 수 있습니다.
- 분류: 신고된 문제, 발견된 고장, 근본 원인, 해결(Settings에서 목록을 설정합니다).

## 11. 장소, 행사, 세그먼트, 캠페인

### 11.1 장소와 봉사소 활동

화면: **Sites**, **Service center activity**(이전 이름은 "Location activity"). 코드: `sites.service.js`.

| 부분 | 무엇인가 |
|---|---|
| 장소 | 물리적 장소(봉사소, 판매 대리점, 수집소, 협력 상점, 사무실, 행사장). 운영 조직, 지역, 그리고 프로젝트별 **할 수 있는 일**을 유효 기간과 함께 가진다. |
| 활동 기록 | `crm_service_center_activity`, 사실 표다. 받아들인 수리, 판매한 장치, 설치한 앱, 찾아간 예약, 건네준 경품. 일부 행은 CRM 자신이 쓰고(수령, 시상, 창구 등록, 크리스탈 반입), 나머지는 그 장소가 쓴다. 잘못된 행은 지우지 않고 되돌린다. |
| 목표 | 장소·활동·기간별로 두고, 기록과 맞춰 읽는다(`v_crm_service_center_activity_progress`). |
| 현장 행사 | `crm_service_center_event`: 판촉일, 출시, 순회 전시, 강습, 검열, 수령일. |

### 11.2 행사(이전 이름은 "program")

화면: **Events**. 코드: `events.service.js`. 행사는 참가가 제한된 고객 활동입니다. 판촉 대외 활동(그것은 캠페인입니다)도, 활동 역사도 아닙니다.

| 부분 | 무엇인가 |
|---|---|
| 목표 | 누가 참가할 수 있고 각자 몇 번 참가할 수 있는가. 자격 근거에서 만든다: 세그먼트, 점수 순위(기준일의 잔고 상위 N), 전사 등급(유효 등급, 12.3절), 등록된 상품, 봉사소 활동(`SERVICE_CENTER_ACTIVITY`), 손으로 만든 목록, 반입, 또는 모두에게 열기. 목표마다 왜 자격이 되는지 적어 둔다. |
| 급 | 행사 안의 등급이며 자격 수치로 가른다. 각각 목표별 참가 수와 자기 번호 범위를 가진다. |
| 정원 | 전체로, 참가 종류별(NORMAL / REWARD)로, 급별 또는 장소별로 참가가 몇 개 있는가. 정원은 결코 넘길 수 없다. |
| 예약 | 번호 붙은 참가(앞자리 + 번호 + 뒷자리)이며 보유자의 이름, 전화, 공민증 번호의 해시를 가진다(증 하나에 참가 하나). PENDING / RESERVED에서 PAID로, 수령 장소에서 FULFILLED로 간다. 참가에 점수가 들 수 있고, 취소하면 돌려준다. |
| 보상과 시상 | 행사가 무엇을 누구에게 주는가(물건, 상품권, 점수, 지갑 충전). 점수 시상은 원장을 통해 지급한다. |

| 생애 단계 | 뜻 |
|---|---|
| DRAFT | 준비 중. |
| APPROVED | **두 번째** 책임자가 승인함. 만든 사람의 승인은 데이터베이스가 거부한다. |
| TARGETS_FROZEN | 참가자 목록이 더 바뀌지 않는다. |
| OPEN | 참가를 받을 수 있다. |
| CLOSED | 더 받지 않는다. |
| FULFILLED | 모두 건네주었다. |
| CANCELLED | 끝나지 않은 어느 단계에서든 가능하다. 열린 참가를 풀고 그 점수를 돌려준다. |

### 11.3 세그먼트와 캠페인

화면: **Segments**, **Campaigns**. 코드: `marketing.service.js`.

- **세그먼트**는 이름 붙은 규칙입니다("9급 전화를 가지고 있고 올해 봉사소에 오지 않았다"). 규칙은 정해진 조건 목록에서 엮은 JSON이며, 날 SQL이 아닙니다. 규칙을 고치면 새 판이 시작됩니다. 평가는 새로 들어온 사람을 더하고 더 이상 맞지 않는 사람의 소속을 닫으므로, 과거의 소속을 계속 따라갈 수 있습니다. "전사 등급 이상" 조건은 유효 등급(12.3절)을 씁니다.
- **캠페인**은 무엇을 하기 전에 **대상(audience)**을 얼립니다(세그먼트에서, 행사 목표에서, 규칙에서, 또는 목록에서).

| 캠페인의 부분 | 무엇인가 |
|---|---|
| 동작 | 전언 보내기, 통화, 밀어보내기(push), 앱 안 알림. 동작을 준비할 때 구성원마다 연락해도 되는지(동의와 쓸 수 있는 연락처)를 판단하고, 안 되면 그 이유를 적는다. |
| 내용 | 보내는 것. 한 번 쓰이면 잠긴다. |
| 반응 | 열어 본 것과 누른 것. |
| 전환 | 정해진 구간 안에서 귀속된 구매, 등록, 참가. |
| 비용 | 지출. 캠페인의 ROI를 위해. |

## 12. 분석과 등급

화면: **Analysis**. 코드: `analysisRun.service.js`, `analysisRead.service.js`, `analysis.service.js`.

### 12.1 분석 실행

분석 실행은 하나의 기준일과 모든 유효 고객에 대해, 프로젝트별 집계 하나와 Dream 전체 집계 하나를 씁니다. Dream 전체 집계는 프로젝트 행을 더한 것이 아니라 사실로부터 다시 계산한 것입니다. 지출과 구매 횟수(평생과 12개월), 구매가 있었던 날수, 평균 구매액, 봉사 사건, 신고, 보유 장치, 받은 점수, 장소 방문, 그리고 활동 상태(NEW, ACTIVE, AT_RISK, LAPSED, NEVER_BOUGHT). 같은 날짜로 두 번 돌리면 같은 결과가 나옵니다.

맞춤 지표는 정의와 값으로 되어 있어(`crm_metric_definition`, `crm_party_metric_value`) 새 지표에 새 칸이 필요하지 않습니다. `POINTS_BALANCE`(*Company-wide points*)는 `v_crm_party_company_points`를 읽습니다(9절).

### 12.2 계산된 점수와 등급

**전사 점수**(0-100, 상한이 있는 여섯 부분. 가치와 빈도는 최근 구매자들 사이의 백분위 순위로 점수를 줍니다)는 Dream 전체 집계에 있고, 그 부분들을 `score_components`에 보관하므로 등급을 언제나 설명할 수 있습니다. **계산된 등급**은 그 점수가 떨어지는 `crm_corporate_grade` 구간입니다. 구간은 **Settings > Corporate grades**에서 고치며, 경계를 옮기면 다음 실행에서 고객들의 등급이 다시 매겨집니다. 한 번도 실행을 거치지 않은 고객에게는 계산된 등급이 없습니다.

### 12.3 손으로 정한 등급(유효 등급)

Customers에 WRITE가 있는 책임자는 고객에게 손으로 등급을 줄 수 있습니다. 기록 머리의 *Customer grade* 옆 연필, 또는 동작 메뉴의 *Set grade*이며, 이유를 적을 수 있습니다(`PUT /parties/:id/grade`). 그것은 고객에 저장되고(`crm_party.assigned_grade_*`) 감사 기록에 남습니다.

| 등급이 쓰이는 곳 | 어느 등급 |
|---|---|
| Customer 360 머리 | 손으로 정한 등급이 있으면 그것("Set by <manager> on <date>". 풍선말이 이유와 계산된 등급을 보인다), 없으면 계산된 것("Since <date>"). |
| 고객 목록(칸과 등급 거르개) | 유효 등급: 손으로 정한 것이 먼저, 없으면 계산된 것. 손으로 정한 등급에는 작은 손 그림이 붙는다. |
| 세그먼트 조건 "전사 등급 이상" | 유효 등급. |
| 행사 자격 근거 CORPORATE_GRADE | 유효 등급. |
| Analysis 화면(분포, 집계) | 계산된 등급만. 손으로 정한 등급 아래에서도 실행은 계속 계산한다. |

동작 메뉴의 *Use the computed grade*는 손으로 정한 등급을 지웁니다. 등급은 유효한 구간 중 하나여야 합니다.

## 13. 다른 체계로부터의 반입

없습니다. 고객은 엑셀 반입(Customers > Import from Excel), 콘솔 자신의 양식, 그리고 부문 API(`/api/integration/crm`)로 들어오며, 이들은 각각 프로젝트를 사용자에게서 또는 API 키에서 받습니다.

## 14. 설정과 내부 조직

**Settings**는 기초 목록을 고칩니다. 프로젝트, 통화, 상품 분류, 프로젝트 급, 점수 종류와 점수 사건 종류, 봉사소 활동 종류, 사건 종류, 봉사 상태와 상태 대응표, 우선순위, 문제·고장·근본 원인·해결 분류, 전사 등급, 상품을 가지는 방식, 고객 사이의 관계, 구매 목적, 용도와 취득 종류, 등록 질문, 통로, 전달 목적과 선택지, 조직 종류, 담당자 역할, 업종, 태그, 직업, **지역**(*Refresh from vendor*는 공급사 목록을 다시 복사합니다. 새 것은 더하고 바뀐 것은 고치며, 지우는 것은 없습니다), 지표 정의, 부서. 프로젝트는 *Point weight*(9절)를 지닙니다.

| 규칙 | 적용 대상 |
|---|---|
| 쓰이고 있는 값은 지울 수 없다 | 모든 목록(외래키가 거부한다). |
| 체계가 의지하는 코드는 이름을 바꾸거나 지울 수 없다 | 예: 활동 RESERVATION_PICKUP, 사건 종류 REPAIR. 이름, 순서, 표식은 고칠 수 있다. |
| 코드 변경과 삭제는 쓰이지 않을 때만 | 프로젝트(4절). |

**빈 CRM에서 시작할 때**는 기초 자료를 먼저 넣으십시오. 코드는 자유이지만, 프로그람이 직접 찾는 아래 것들은 예외입니다.

| 목록 | 프로그람이 쓰는 코드 |
|---|---|
| 프로젝트 | 두 프로젝트에 신원 역할 **E-shop**과 **User management**(엑셀 반입이 필요로 함). 프로젝트 코드는 아님 |
| 통화 | `USD`, 그리고 보고 통화로 표시된 통화 하나 |
| 점수 종류 / 점수 사건 종류 | 없음 / `EARN`, `REDEEM`, `EXPIRE`, `ADJUST`, `REFUND`, `RESERVATION_COST`, `EVENT_AWARD`, `MERGE_CARRY_OVER` |
| 상품 분류 | `SMARTPHONE`, `EPRODUCT`, `SOFTWARE`, `STB`, `PC`, `CAMERA`, `KARAOKE_LICENCE`, `MEDIA_LICENCE` |
| 상품을 가지는 방식 | `OWNER`, `USER`, `REGISTERED_USER`, `LESSEE`, `LICENSEE` |
| 취득 종류 | `PURCHASED`, `TRANSFER`, `COMPANY_ASSIGNED` |
| 봉사소 활동 종류 | `REPAIR_INTAKE`, `REPAIR_DELIVERY`, `RESERVATION_PICKUP`, `PRIZE_HANDOVER`, `REGISTRATION_ASSIST` |
| 사건 종류 / 봉사 상태 / 우선순위 | `REPAIR`, `WARRANTY_REPAIR` / `CLOSED`, `CANCELLED`(끝 상태) / `LOW`, `NORMAL`, `HIGH` |
| 고객 사이의 관계 | `SPOUSE`, `PARENT`, `CHILD`, `SIBLING`, `RELATIVE`, `REFERRER`, `REFERRAL`, `PARENT_COMPANY`, `SUBSIDIARY`, `AFFILIATE`, `PARTNER` |
| 지표 정의 | `DAYS_SINCE_LAST_PURCHASE`, `CROSS_PROJECT_COUNT`, `PRODUCT_OWNERSHIP_COUNT`, `CHURN_RISK`, `POINTS_BALANCE`, `IS_MULTI_PROJECT`, `LAST_SERVICE_DATE` |
| 지역, 직업 | 아무것이나. 엑셀 반입이 자기 Location ID와 Job title ID 칸을 그것들과 맞춰 본다 |

부서(`crm_department`)는 내부 조직을 적습니다. 책임자는 각각 하나에 속하고, 역할을 한 부서에만 쓰도록 둘 수 있습니다. 권한 자체는 언제나 역할에서 옵니다.

## 15. 시험, 검증, 문서

| 명령 | 하는 일 | 필요한 것 |
|---|---|---|
| `npm run test:identity` | 대조 점수, 접수/병합/심사 흐름, 엑셀 해석과 반입, 전자상점 올려 두기, 부문 API 규칙(기억기 안에서). | 없음 |
| `node scripts/check-crm.js <url>` | 콘솔 API를 통한 끝에서 끝까지 점검: 권한, 고객, 엑셀 반입과 전자상점 올려 두기, 상품과 이관, 점수, 행사, 세그먼트, 캠페인, 장소. | 개발 데이터베이스에서 도는 API |
| `PG_SCHEMA=<schema> node scripts/check-crm-integration.js <url>` | 부문 API(키, CREATED/MERGED/EXISTING/QUEUED, 결과 흐름, 수신 확인, 검증, 전자상점)와 프로젝트 편집 규칙. | 개발 데이터베이스에서 도는 API |
| `node scripts/verify-migrations.js` | 버릴 구조 안에 이행 사슬 전체를 세우고 `schema.sql`과 비교한다. | 개발 데이터베이스 |
| `npm run crm:docs` | `crm-database.md`를 다시 만들고(설명이 없는 칸이 하나라도 있으면 거부) 두 문서의 Word 사본을 쓴다. | 개발 데이터베이스 |
| `npm run crm:mock-import` | `docs/samples/crm-customers-test-import.xlsx`를 쓴다. 260행 남짓이며, 새 고객, 여러 행에 걸친 한 사람(전화마다 한 행), 똑같은 사본, 같은 사람의 두 번째 계정, 심사 경우(50점과 65점), 심사 중인 행의 사본, 닮았지만 다른 사람, 그리고 모든 종류의 오류를 담는다. *Test cases* 장이 각 행이 무엇이 되어야 하는지 말해 준다. 번호는 데이터베이스 자신의 목록에서 읽는다. | 개발 데이터베이스 |
| `node scripts/crm-docs-word.js` | markdown을 있는 그대로 하여 Word 사본만 쓴다. | 없음 |

점검 스크립트는 시험 자료를 씁니다(실행 번호를 붙여서). 개발이나 준운영 데이터베이스를 상대로 돌리고, 운영 데이터베이스에서는 결코 돌리지 마십시오.
