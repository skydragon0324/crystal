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
| Same home address | 15 |
| Same occupation/job title | 5 |

Missing values never match. Names and addresses ignore case and repeated
whitespace. Phone punctuation is ignored; country prefixes are preserved.
An address includes its location when supplied; a location alone is not an
address. A birth year alone earns no birthday points.

- 0–40: create a party.
- 41–69: stage the input without creating a party.
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

## Department integration

These endpoints use existing Customers read/write permissions under
`/api/admin/crm`:

- `POST /registrations`: `{ project_id, external_account_id, party: {
  full_name, mobile, birth_date, address_line, home_location_pk, job_title_id,
  email } }`. Returns `party_pk` when resolved, otherwise
  `{ outcome: "QUEUED", intake_id, party_pk: null }`.
- `GET /registrations?category=PERSON` (or `ESHOP`), with `status=RESOLVED` for
  history, lists intakes using the standard paged response.
- `POST /registrations/:id/decide`: `{ action: "MERGE", party_pk }`,
  `{ action: "MERGE", candidate_intake_id }`, or `{ action: "NEW" }`.
  E-shop decisions use `ASSIGN` with `party_pk`, or `REJECT`.
- `GET /identity-resolutions?project_id=...`: up to 500 unacknowledged results,
  each carrying source record, `party_pk`, outcome, and resolution ID.
- `POST /identity-resolutions/:id/acknowledge`: `{ project_id }`, after the
  department saves the key in its source record.

Resolution records are committed with the decision. Repeated submissions for
one project/account reuse the intake or active account. Full party merges
repoint existing resolution records and clear acknowledgements so departments
can retrieve the surviving key again. Department consumers must upsert by
source record and acknowledge only after persisting the key. This is a pull
integration; no outbound department webhook has been configured.

## Deployment and verification

Deploy the backend and admin together with migration
`20261005090000_phase1_identity_intake.js` (`043_phase1_identity_intake.sql`).
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
