# Phase 1 identity registration

How a person becomes a CRM customer in phase 1, and how department systems and
the Excel import take part. The wider CRM is described in
[crm-logic.md](crm-logic.md); every table and field in
[crm-database.md](crm-database.md).

## Customer key

All CRM foreign keys and API customer references use `party_pk` (including
`incoming_party_pk`, `related_party_pk` and other role-specific keys). Treat
these bigint keys as strings in clients. `crm_party.party_id` is reserved for a
later phase: nothing generates or reads it in phase 1, so it is empty
(delta 048). The unrelated `crm_transaction_party.transaction_party_id` remains
that table's row key.

## Matching and review

The same matcher (`personDuplicates.js`) serves console registration, the Excel
import, the department API and the project imports:

| Evidence (equal values only) | Points |
| --- | ---: |
| Same phone (any of the person's phones) | 40 |
| Same name | 25 |
| Same full birthday | 25 |
| Same home location (Location ID) | 15 |
| Same occupation (job title) | 5 |

Missing values never match. Names ignore case and repeated whitespace. Phone
punctuation is ignored; country prefixes are preserved. The home location is
compared by its ID on the vendor location list; the written address text is
kept for search and display and is not compared. A birth year alone earns no
birthday points. Email does not add points.

| Score | Outcome |
| --- | --- |
| below 50 | A new customer is created. |
| 50-69 | The input is staged in `crm_registration_intake`; no customer is created until an administrator decides. |
| 70-110 | Merged into the match, if it is the only strong match and not itself a pending registration. Several strong matches, or a strong match with a pending registration, stay staged for review. |

**Excel import only:** the same **User PK** (with the same User ID) is the same
person whatever the phone, because a sheet lists one row per phone number. Such
rows are merged automatically (scored 70) and every phone is kept. A customer
who already carries that User PK - a linked user-management account, or a
candidate ID from an earlier import - matches the same way.

`crm_registration_intake` keeps the input, the candidates with their evidence,
the source record, the outcome and the reviewer. Matching also checks pending
registrations. A transaction-scoped advisory lock serializes imports, console
and project registration, review decisions and party merges.

**Merging keeps every phone.** A reviewed merge adds the incoming person's
phones (and other missing details) to the customer; merging two existing
customers moves every contact point of the merged one to the survivor, keeping a
number both had once. The customer record shows all of them.

## Review in the console

Customers has tabs for pending registrations, account assignments, resolved
registrations, existing duplicate records and import errors, each with a search
box. Opening a registration (`GET /api/admin/crm/identity-intakes/:id`) shows
the incoming person's basic information with the project and identifiers it
came with, and the same for every candidate: its linked accounts and the
candidate IDs an Excel import listed for it.

Decisions go to `POST /api/admin/crm/identity-intakes/:id/decide`:

| Body | Effect |
| --- | --- |
| `{ action: "MERGE", party_pk }` | Merge the person into that customer. |
| `{ action: "MERGE", candidate_intake_id }` | Merge into a pending registration that was resolved first. |
| `{ action: "NEW" }` | Register as a new customer. |
| `{ action: "ASSIGN", party_pk }` | Account assignment: link the identifier to that customer (link method `REVIEWED`). |
| `{ action: "REJECT" }` | Account assignment: reject it. |

An identifier listed for a customer can also be linked or rejected from the
customer record (`POST /api/admin/crm/parties/:id/unverified-accounts/decide`).

## Identity roles of projects

Projects are free: codes and names are chosen in Settings > Projects. Two of
them play a part in identity, set by **Identity role** (one project per role,
`crm_project.identity_role`, delta 050):

| Role | Used for |
| --- | --- |
| E-shop (`ESHOP`) | The Excel import's E-shop PK / ID columns; legacy e-shop links from the department API go to account assignment. |
| User management (`USER_MANAGEMENT`) | The Excel import's User PK / User ID columns, and the User PK merge rule. |

The Excel import refuses to run until both roles are given.

## Excel import (phase 1 initial load)

Phase 1 loads people with complete data who already have an e-shop account and
a user-management account.

| Column | Required |
| --- | :---: |
| E-shop PK, E-shop ID, User PK, User ID | yes |
| Full name, Gender (M/F), Birthday (YYYY-MM-DD), Mobile | yes |
| Location ID, Address | yes |
| Job title ID | no |
| Origin project (code or ID) | no - empty cells take the project chosen on the import screen |

- *Check the file* writes nothing and sorts the rows into New customers, Review
  customers, Already customers and Errors. It treats rows the way the import
  will: a merged row becomes part of the customer it matched, a row going to
  review becomes a pending registration.
- *Add new users* imports every valid row - errors do not block it - and keeps
  the failed rows, with their cells and reasons, in `crm_person_import_error`
  (Customers > Import errors) until they are dismissed.
- Two rows with the same E-shop PK (or User PK) must be the same person with the
  same E-shop ID (or User ID); otherwise the later row is an error.
- A re-run of the same file adds nothing twice: each row's registration is keyed
  by the file's hash and row number.

The sheet's identifiers are **not** written to `crm_project_account`. They are
kept on the person's registration (`payload.unverified_accounts`) and, once the
person is created or merged, each is staged as an account assignment with that
customer as the candidate. The customer's Accounts tab lists them under
"Previously linked identifiers (unverified)" with their review state
(`GET /api/admin/crm/parties/:party_pk/unverified-accounts`).

## Department integration

Department systems call `/api/integration/crm` with a key issued to their
project, sent as `Authorization: Bearer crmk_...` (or `X-Api-Key`). The project
always comes from the key; a request cannot act for another project. Only the
SHA-256 of a key is stored (`crm_project_api_key`).

    npm run crm:api-key -- issue <PROJECT_CODE> "Eshop production"   # prints the key once
    npm run crm:api-key -- list
    npm run crm:api-key -- revoke <api_key_id>

- `POST /registrations`: `{ external_account_id, external_login?,
  external_account_type?, party: { full_name, gender_code, birth_date, mobile,
  email, address_line, home_location_pk, job_title_id } }`. Runs the duplicate
  check, then returns `{ outcome, party_pk, intake_id }`:
  - account already linked: `EXISTING` with its `party_pk`;
  - one match of 70+: `MERGED`, account added to that customer;
  - nothing of 50 or more: `CREATED`, new customer with the account;
  - 50-69 or conflicting strong matches: `QUEUED` with `party_pk: null`; the
    account is added when an administrator decides.

  Only legacy e-shop links taken from vendor data (a `known_party_pk` hint on
  the E-shop project) are queued as account assignments.
- `GET /accounts/:external_account_id`: `{ status: "LINKED", party_pk }`, or the
  registration's status and `intake_id`; 404 when unknown.
- `GET /identity-resolutions`: up to 500 unacknowledged results for the caller's
  project, each with source record, `party_pk`, outcome and resolution ID.
- `POST /identity-resolutions/:id/acknowledge`, after the department saves the key.

Repeated submissions for one project and account reuse the registration or the
linked account. Full party merges repoint existing resolution records and clear
their acknowledgement, so departments retrieve the surviving key again.
Department consumers must upsert by source record and acknowledge only after
persisting the key. This is a pull integration; no webhook is sent.

## Deployment and verification

The phase-1 identity changes are deltas 043-050 in `sql/deltas`, each run by a
migration in `src/db/migrations`:

| Delta | Change |
| --- | --- |
| 043 | Registration intake, identity resolutions. |
| 044 | Free project types; department API keys. |
| 045 | "Program" renamed to "event" everywhere. |
| 046 | Corporate grade set by hand. |
| 047 | Import error rows. |
| 048 | `party_id` no longer generated. |
| 049 | "Location activity" renamed to "service center activity". |
| 050 | Project identity roles. |

Run `npm run migrate` from the backend before starting the updated API. None of
the deltas can be rolled back automatically, so take a backup first.

| Check | What it covers |
| --- | --- |
| `npm run test:identity` | Matching scores, intake/merge/review workflow, Excel parsing and import (in memory, no database). |
| `npm run crm:mock-import` | Writes a 260+ row test file with every import case and its expected result. |
| `npm run schema:verify`, `npm run migrate:verify` | The schema and the migration chain against a development database. |
