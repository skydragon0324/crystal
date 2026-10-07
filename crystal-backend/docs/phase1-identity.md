# Phase 1 identity registration

All CRM foreign keys and API customer references use `party_pk` (including
`incoming_party_pk`, `related_party_pk`, and other role-specific keys). Treat
bigint keys as strings in clients. `crm_party.party_id` is retained as a reserved
public identifier, but phase 1 does not use it for relationships. The unrelated
`crm_transaction_party.transaction_party_id` remains that table's row key.

## Matching and review

The same matcher serves console registration, Excel, and project adapters:

| Evidence | Points |
| --- | ---: |
| Same phone | 40 |
| Same name | 25 |
| Same full birthday | 25 |
| Same home location (Location ID) | 15 |
| Same occupation/job title | 5 |

Missing values never match. Names ignore case and repeated whitespace. Phone
punctuation is ignored; country prefixes are preserved. The home location is
compared by its ID on the vendor location list; the written address text is
kept for search and display and is not compared. A birth year alone earns no
birthday points.

- below 50: create a party.
- 50–69: stage the input without creating a party.
- 70–110: merge into a unique strong existing match. Multiple strong matches,
  or a match to an unresolved intake, remain staged for review.

The requested ranges overlapped at 40; phase 1 follows the explicit rule that
40 creates a new party. Email and external user IDs do not add matching points.

`crm_registration_intake` retains input, evidence, source record, outcome, and
reviewer. Matching also checks pending intakes. A transaction-scoped advisory
lock serializes imports, console/project registration, review decisions, and
party merges. Excel import repeats matching inside the transaction and uses a
file hash plus row number for retry idempotency. The optional spreadsheet User
ID is stored as source provenance, never assigned as the CRM primary key.

Customers has separate tabs for pending registrations, e-shop assignments,
resolved registrations, and existing duplicate records. Administrators can
merge a pending person into a selected party (or a resolved matching intake),
or explicitly register a new party. E-shop assignments can be approved for a
selected customer or rejected. Existing e-shop links are migrated to candidates
and deactivated until review; historical memberships and transactions remain
historical data. Vendor imports resume associated data synchronization on the
next run after resolution. Platform suggestions from other projects are also
review candidates. Only the internal PLATFORM alias of an already resolved
Crystal person is attached directly.

## Excel import (phase 1 initial load)

Phase 1 loads only people with complete data who already have an e-shop
account. Required columns: E-shop PK, E-shop ID, Full name, Gender, Birthday
(full YYYY-MM-DD), Mobile, Location ID, Address. Job title ID and Email are
optional. A row missing any required value is an error and the file is not
imported. Two rows with the same E-shop PK must be the same person (score 70+)
with the same E-shop ID; otherwise the later row is reported as an error.

The sheet's e-shop identifiers are **not** written to `crm_project_account`.
They are kept on the person's registration intake (`payload.unverified_accounts`)
and, once that person is created or merged (immediately, or after review), each
is staged as an ESHOP intake with that customer as the candidate. An
administrator verifies it under Customers > E-shop assignments (`ASSIGN` commits
the account with link method `REVIEWED`) or rejects it. The customer's Accounts
tab lists these identifiers under "Previously linked identifiers (unverified)"
with their review state, for identity checks during manual inquiries
(`GET /api/admin/crm/parties/:party_pk/unverified-accounts`).

## Department integration

Department systems call `/api/integration/crm` with a key issued to their
project, sent as `Authorization: Bearer crmk_...` (or `X-Api-Key`). The project
always comes from the key; a request cannot act for another project. Only the
SHA-256 of a key is stored.

    npm run crm:api-key -- issue ESHOP "Eshop production"   # prints the key once
    npm run crm:api-key -- list
    npm run crm:api-key -- revoke <api_key_id>

- `POST /registrations`: `{ external_account_id, external_login?,
  external_account_type?, party: { full_name, gender_code, birth_date, mobile,
  email, address_line, home_location_pk, job_title_id } }`. Runs the weighted
  duplicate check, then returns `{ outcome, party_pk, intake_id }`:
  - account already linked: `EXISTING` with its `party_pk`;
  - one match of 70+: `MERGED`, account added to that customer;
  - nothing of 50 or more: `CREATED`, new customer with the account;
  - 50–69 or conflicting strong matches: `QUEUED` with `party_pk: null`; the
    account is added when an administrator decides.

  This applies to the e-shop too. Only legacy e-shop links taken from vendor
  data (a `known_party_pk` hint) are queued as e-shop assignments.
- `GET /accounts/:external_account_id`: `{ status: "LINKED", party_pk }`, or the
  registration's status and `intake_id`; 404 when unknown.
- `GET /identity-resolutions`: up to 500 unacknowledged results for the caller's
  project, each with source record, `party_pk`, outcome and resolution ID.
- `POST /identity-resolutions/:id/acknowledge`, after the department saves the key.

Review in the console uses `GET /api/admin/crm/identity-intakes` and
`POST /api/admin/crm/identity-intakes/:id/decide` with `{ action: "MERGE", party_pk }`,
`{ action: "MERGE", candidate_intake_id }` or `{ action: "NEW" }`, and for e-shop
assignments `{ action: "ASSIGN", party_pk }` or `{ action: "REJECT" }`. (These were
under `/registrations`, which collided with the product registration routes.)

Resolution records are committed with the decision. Repeated submissions for
one project/account reuse the intake or active account. Full party merges
repoint existing resolution records and clear acknowledgements so departments
can retrieve the surviving key again. Department consumers must upsert by
source record and acknowledge only after persisting the key. This is a pull
integration; no outbound department webhook has been configured.

## Deployment and verification

Deploy the backend and admin together with migrations
`20261005090000_phase1_identity_intake.js` (`043_phase1_identity_intake.sql`) and
`20261006090000_free_project_types_and_department_keys.js` (`044_...sql`: the
`crm_project.project_type_code` CHECK dropped, `crm_project_api_key` added) and
`20261006100000_programs_are_events.js` (`045_programs_are_events.sql`: every
"program" table, column, constraint and code value renamed to "event", and the
console page moved to `/admin/crm/events` keeping its permissions).
Department clients that used `/api/admin/crm/registrations` move to
`/api/integration/crm/registrations` with an issued key.
Existing API clients must change their party reference fields and URLs to
numeric `party_pk`. Run `npm run migrate` from the backend before starting the
updated API. The migration preserves existing links by mapping public IDs back
to their current numeric keys. It does not provide a destructive reverse
migration; restore a backup if rollback is needed.

`npm run test:identity` runs matching/query-compilation tests and in-memory
workflow tests, including real Excel parsing. These do not connect to a database.
`npm run schema:verify` and `npm run migrate:verify` are the repository's database
checks and should be run against an authorized development database before
rollout. PostgreSQL migration execution was not verified in this change session.
