# CRM: API reference

Every HTTP endpoint of the Crystal CRM: the console API under `/api/admin/crm` and the department integration API
under `/api/integration/crm`. For what the CRM is and the rules behind each screen read
[crm-logic.md](crm-logic.md); every table and column is described in [crm-database.md](crm-database.md).

Everything here was read from the code: `src/routes/crm.routes.js`, `src/routes/crmIntegration.routes.js`,
`src/controllers/crm.controller.js`, the generic CRUD stack (`src/routes/crud.routes.js` and the controller, service
and repository behind it) and `src/services/crm/*`. When the code changes, this file has to be changed with it.

## Contents

| # | Area | Endpoints |
|---|---|---|
| 1 | [Conventions](#1-conventions) | Base URL, authentication, permissions, X-Lang, envelope, paging, errors |
| 2 | [Shared lookups](#2-shared-lookups) | `GET /meta`, `GET /parties/lookup`, `GET /instances/lookup`, `GET /catalog/lookup`, `GET /sites/options`, `GET /segments/options`, `GET /segments/fields`, `GET /events/options`, `GET /campaigns/options` |
| 3 | [Overview and imports](#3-overview-and-imports) | `GET /overview`, `POST /import`, `POST /recalculate`, `POST /import/vendor` |
| 4 | [Analysis](#4-analysis) | `GET /analysis/summary`, `GET /analysis/snapshots`, `GET /analysis/metrics`, `GET /analysis/model`, `POST /analysis/run` |
| 5 | [Transactions](#5-transactions) | `GET /transactions`, `GET /transactions/:id` |
| 6 | [Memberships](#6-memberships) | `GET /memberships`, `GET /memberships/distribution`, `GET /memberships/:id/history`, `POST /memberships/:id/tier`, `POST /memberships/:id/status` |
| 7 | [Internal departments](#7-internal-departments) | `GET /departments/staff`, `GET /departments/roles`, `PUT /departments/staff/:managerId`, `PUT /departments/roles/:roleId` |
| 8 | [Customers (parties)](#8-customers-parties) | `GET /parties`, `POST /parties`, `GET /parties/similar`, `GET /parties/:id`, `PUT /parties/:id`, `POST /parties/:id/status`, `PUT /parties/:id/grade`, `POST /parties/:id/checked`, `POST /parties/:id/contacts`, `PUT /parties/:id/contacts/:contactId`, `POST /parties/:id/accounts`, `POST /parties/:id/accounts/:accountId/unlink`, `PUT /parties/:id/consents`, `POST /parties/:id/merge` |
| 9 | [Customer import (Excel)](#9-customer-import-excel) | `GET /parties/import/template`, `POST /parties/import`, `GET /import-errors`, `POST /import-errors/:id/dismiss` |
| 10 | [Duplicates](#10-duplicates) | `GET /duplicates`, `POST /duplicates/scan`, `POST /duplicates/:id/accept`, `POST /duplicates/:id/reject` |
| 11 | [Organizations](#11-organizations) | `POST /parties/:id/org-types`, `POST /parties/:id/org-types/:assignmentId/end`, `PUT /parties/:id/industries`, `DELETE /parties/:id/industries/:industryId`, `POST /parties/:id/people`, `POST /parties/:id/people/:relationshipId/end` |
| 12 | [Identity intakes (registration review)](#12-identity-intakes-registration-review) | `GET /identity-intakes`, `GET /identity-intakes/:id`, `POST /identity-intakes/:id/decide`, `GET /parties/:id/unverified-accounts`, `POST /parties/:id/unverified-accounts/decide` |
| 13 | [Customer 360 and engagement](#13-customer-360-and-engagement) | `GET /search`, `GET /parties/:id/360`, `POST /parties/:id/relationships`, `POST /parties/:id/relationships/:relationshipId/end`, `POST /parties/:id/tags`, `DELETE /parties/:id/tags/:tagId`, `GET /parties/:id/notes`, `POST /parties/:id/notes`, `PUT /parties/:id/notes/:noteId`, `DELETE /parties/:id/notes/:noteId`, `GET /parties/:id/files`, `POST /parties/:id/files`, `GET /parties/:id/files/:fileId/download`, `DELETE /parties/:id/files/:fileId`, `GET /parties/:id/interactions`, `POST /parties/:id/interactions`, `POST /parties/:id/messages`, `GET /parties/:id/team`, `POST /parties/:id/team`, `POST /parties/:id/team/:teamMemberId/end`, `GET /parties/:id/agreements`, `POST /parties/:id/agreements`, `PUT /parties/:id/agreements/:agreementId` |
| 14 | [Product instances and registrations](#14-product-instances-and-registrations) | `GET /instances`, `GET /instances/:id`, `PUT /instances/:id`, `GET /registrations`, `POST /registrations`, `POST /registrations/:id/end` |
| 15 | [Transfers](#15-transfers) | `GET /transfers`, `POST /transfers`, `POST /transfers/:id/status` |
| 16 | [Service cases](#16-service-cases) | `GET /cases`, `POST /cases`, `GET /cases/:id`, `PUT /cases/:id`, `PUT /cases/:id/classification` |
| 17 | [Reward points](#17-reward-points) | `GET /point-accounts`, `GET /point-events`, `GET /point-drift`, `POST /point-adjustments` |
| 18 | [Activity events](#18-activity-events) | `GET /events`, `POST /events`, `GET /events/:id`, `PUT /events/:id`, `POST /events/:id/status`, `POST /events/:id/tiers`, `PUT /events/:id/tiers/:tierId`, `DELETE /events/:id/tiers/:tierId`, `POST /events/:id/locations`, `DELETE /events/:id/locations/:rowId`, `POST /events/:id/quotas`, `PUT /events/:id/quotas/:quotaId`, `DELETE /events/:id/quotas/:quotaId`, `POST /events/:id/rewards`, `PUT /events/:id/rewards/:rewardId`, `DELETE /events/:id/rewards/:rewardId`, `GET /events/:id/targets`, `POST /events/:id/targets`, `POST /events/:id/targets/build`, `POST /events/:id/targets/:targetId/revoke`, `GET /events/:id/reservations`, `POST /events/:id/reservations`, `GET /reservations/:reservationId/events`, `POST /reservations/:reservationId/status`, `GET /events/:id/awards`, `POST /events/:id/awards`, `POST /awards/:awardId/status` |
| 19 | [Sites (service centres)](#19-sites-service-centres) | `GET /sites`, `POST /sites`, `GET /sites/:id`, `PUT /sites/:id`, `POST /sites/:id/capabilities`, `POST /sites/:id/capabilities/:capabilityId/end` |
| 20 | [Site activity](#20-site-activity) | `GET /site-activities`, `POST /site-activities`, `POST /site-activities/:id/reverse`, `GET /site-events`, `POST /site-events`, `PUT /site-events/:id`, `GET /site-targets`, `POST /site-targets`, `PUT /site-targets/:id`, `DELETE /site-targets/:id` |
| 21 | [Segments](#21-segments) | `GET /segments`, `POST /segments`, `POST /segments/preview`, `GET /segments/:id`, `PUT /segments/:id`, `GET /segments/:id/members`, `POST /segments/:id/versions`, `POST /segments/:id/evaluate` |
| 22 | [Campaigns](#22-campaigns) | `GET /campaigns`, `POST /campaigns`, `GET /campaigns/:id`, `PUT /campaigns/:id`, `POST /campaigns/:id/status`, `POST /campaigns/:id/audiences`, `POST /campaigns/:id/actions`, `PUT /campaigns/:id/actions/:actionId`, `POST /campaigns/:id/actions/:actionId/prepare`, `POST /campaigns/:id/actions/:actionId/status`, `GET /campaigns/:id/actions/:actionId/recipients`, `POST /campaigns/:id/costs`, `DELETE /campaigns/:id/costs/:costId` |
| 23 | [Master-table endpoints (catalogue, point rules, settings lists)](#23-master-table-endpoints-catalogue-point-rules-settings-lists) | Nine CRUD endpoints each for `/catalog`, `/point-rules` and 32 `/settings/<list>` paths; `POST /settings/locations/refresh`, `GET /settings/status-map`, `PUT /settings/status-map`, `DELETE /settings/status-map/:projectId/:code`, `GET /settings/api-keys`, `POST /settings/api-keys`, `POST /settings/api-keys/:id/revoke` |
| 24 | [Integration API (department systems)](#24-integration-api-department-systems) | `POST /registrations`, `GET /accounts/:externalAccountId`, `GET /identity-resolutions`, `POST /identity-resolutions/:id/acknowledge` |

Paths in the Endpoints column are relative to `/api/admin/crm`, except in "Integration API", where they are relative to `/api/integration/crm`.

## 1. Conventions

### Base URL

The API prefix is `API_PREFIX` (default `/api`, `src/config/index.js`); the server listens on `PORT` (default `5100`).

| Audience | Prefix | Mounted in |
|---|---|---|
| The admin console | `/api/admin/crm` | `src/routes/index.js` -> `/admin` (`admin.routes.js`) -> `/crm` (`crm.routes.js`) |
| Department systems (e-shop, appstore, ...) | `/api/integration/crm` | `src/routes/index.js` -> `/integration/crm` (`crmIntegration.routes.js`) |

All paths in this file are written in full, for example `GET /api/admin/crm/parties`. Request bodies are JSON
(`Content-Type: application/json`, at most 5 MB) except the two file uploads, which are `multipart/form-data`.

### Authentication

**Console endpoints** (`/api/admin/crm/...`) sit behind `authenticate` and `attachActor` in `admin.routes.js`:

- Send the administrator's access token as `Authorization: Bearer <token>`. The token comes from the console sign-in
  under `/api/admin/auth`.
- The token is verified and the manager row is re-read on every request.

| Status | Message key | When |
|---|---|---|
| 401 | `auth.administratorSignInRequired` | No bearer token, or the manager no longer exists. |
| 401 | `token.tokenExpired` | The access token has expired (refresh it through `/api/admin/auth`). |
| 401 | `common.invalidToken` | The token is malformed, signed with another secret, or is not an admin access token. |
| 403 | `auth.thisAdministratorAccountIs` | The manager's status is not `ACTIVE`. |

**Integration endpoints** (`/api/integration/crm/...`) do not use the admin token. They take a project API key; see
[Integration API](#24-integration-api-department-systems).

### Permissions

Each console screen is a page in the permission grid (`manager_pages`), and each role has a level per page:
`0` none, `1` READ, `2` WRITE, `3` SUPER. Every CRM route is guarded by one of:

| Guard | Meaning |
|---|---|
| READ on `<page>` | `requirePermission(page, LEVEL.READ)`: the role's level on that page is at least 1. |
| WRITE on `<page>` | `requirePermission(page, LEVEL.WRITE)`: level at least 2. |
| SUPER on `<page>` | Level 3. Only the generic CRUD's permanent delete uses it. |
| Any CRM page | `anyCrm`: READ or better on at least one page whose URL starts with `/admin/crm/`. Used by the shared pickers, which return names and codes only. |

The pages:

| Page | Screen |
|---|---|
| `/admin/crm/overview` | Overview and imports |
| `/admin/crm/customers` | Customers, Customer 360, Excel import, duplicates, identity intakes |
| `/admin/crm/products` | Product instances, registrations, catalogue |
| `/admin/crm/transfers` | Transfers |
| `/admin/crm/service-cases` | Service cases |
| `/admin/crm/points` | Reward points and point rules |
| `/admin/crm/events` | Activity events, reservations, awards |
| `/admin/crm/sites` | Sites (service centres) |
| `/admin/crm/site-activity` | Site activity, site events, site targets |
| `/admin/crm/segments` | Segments |
| `/admin/crm/campaigns` | Campaigns |
| `/admin/crm/settings` | Settings lists, status map, internal departments |
| `/admin/crm/transactions` | Transactions |
| `/admin/crm/memberships` | Memberships |
| `/admin/crm/analysis` | Analysis |

| Status | Message key | When |
|---|---|---|
| 403 | `common.permissionDenied` | The role's level on the page is too low (or, for `anyCrm`, it has no CRM page at all). |
| 500 | `permission.pageNotRegisteredIn` | The route names a page that is not in `manager_pages` (a deployment mistake, not a permission decision). |

### Language: `X-Lang`

Every reply's `message` is a sentence in the reader's language. The locale is chosen per request
(`src/i18n/index.js`):

1. the `X-Lang` header (`en`, `zh` or `ru`; `zh-CN` and `ZH` both mean `zh`), then
2. the first `Accept-Language` entry that names one of those three, then
3. `DEFAULT_LOCALE` from the environment (default `en`).

The code throws and replies with a dotted *message key* such as `crm.customers.thisContactIsAlready`; the key is
translated at the last moment from `src/i18n/{en,zh,ru}.js`, falling back to English and then to the key itself.
A message that is not a dotted key (it contains a space, or no dot) is sent as written; some rows stored before the
messages became keys (old import errors, old candidate reasons) still hold English sentences and read as written.
Messages may carry `{name}` placeholders, filled from the error's parameters.


This file names the message **key**; the client sees its translation.

### Response envelope

Every JSON reply has the same envelope (`src/utils/response.js`):

```json
{ "success": true, "message": "ok", "data": { } }
```

| Field | Type | Notes |
|---|---|---|
| `success` | boolean | `true` for 2xx replies. |
| `message` | string | Translated text of the key the handler passed (default `common.ok`; writes usually send `common.created`, `common.updated` or `common.deleted`). |
| `data` | any | The payload; `null` when there is none. |

Success is always HTTP `200`, including creates. The two endpoints that return a file
(`GET /api/admin/crm/parties/import/template` and `GET /api/admin/crm/parties/:id/files/:fileId/download`) send the
file instead of the envelope.

### Lists and paging

Paged lists reply with `data` shaped as:

```json
{ "rows": [ ], "total": 0, "page": 1, "limit": 20, "summary": null }
```

| Field | Type | Notes |
|---|---|---|
| `rows` | array | The page of rows. |
| `total` | integer | Rows matching the filters, across all pages. |
| `page` | integer | The page returned. |
| `limit` | integer | Rows per page used. |
| `summary` | object or null | Totals for the whole filtered set when the service computes them, otherwise `null`. |

Paging is read by `readPaging` (`src/utils/query.js`) from the query string:

| Parameter | Default | Rules |
|---|---|---|
| `page` | 1 | At least 1. |
| `limit` | 20 | Clamped to 1..200. |
| `sort` | per endpoint | Accepted only if it is in the endpoint's list of sortable fields, otherwise the default. Many CRM services use a fixed order and ignore `sort`; each endpoint says what really happens. |
| `dir` | `desc` for CRM lists, `asc` for the generic CRUD lists | `desc` means descending; any other value means ascending. |

Some endpoints return a plain array instead (pickers, small lists); each says so.

### Identifiers and value types

- `bigint` columns (`party_pk`, `product_instance_id`, most CRM ids) come back from PostgreSQL as **strings**;
  `int`/`smallint` columns come back as numbers. `numeric` columns (amounts, points, scores) come back as strings.
- `timestamptz` values are ISO-8601 strings in UTC (`"2026-05-02T08:14:11.201Z"`); `date` values are plain
  `"YYYY-MM-DD"` strings (a type parser in `src/db/knexfile.js` keeps them from being shifted by the time zone).
- Path ids are passed to the database as given. A non-numeric id usually ends as `400 common.isNotAValue` or
  `404 common.notFound`, depending on the endpoint.

### Errors

Failures have their own envelope:

```json
{ "success": false, "message": "this contact is already on this customer", "detail": null }
```

| Field | Type | Notes |
|---|---|---|
| `success` | boolean | Always `false`. |
| `message` | string | Translated text of the error's key (see Language). |
| `detail` | any | Extra data the code attached (for example the blockers of a delete, or the problems of a failed check); `null` otherwise. Never the database's own detail line. |

The most common `detail` is a list of field problems, `[{ field, message }]`, sent with `400 crm.common.checkTheDetails`
by the customer checks (`personRules.js`). The code builds each item as `{ field, message, params? }` with `message`
a key; the error handler translates every item whose `message` is a key into the reader's language, fills in its
`params` (a `label` param that is itself a key, such as `crm.fields.dateOfBirth`, is translated too) and drops
`params`. Any other `detail` (a list of blockers, missing sheet headers) is sent as it was.

Services throw `HttpError(status, key, detail, params)`. Database errors that escape a service are mapped by
`src/middleware/error.js`:

| SQLSTATE | Status | Message key |
|---|---|---|
| 23505 unique violation | 409 | The constraint's own key from the `UNIQUE` map when listed (CRM ones: `uq_crm_contact` -> `crm.customers.thisContactIsAlready`, `uq_crm_project_account` -> `crm.customers.thatAccountIsAlreadyLinked`, `uq_crm_reg_one_owner` -> `crm.products.someoneElseHoldsThisProduct`, ...), else `common.duplicatedValue`. |
| 23503 foreign key | 409 | `common.referencedRecordIsMissing` |
| 23514 check | 400 | `common.valueFailedAValidation` |
| 23502 not null | 400 | `common.isRequired` (params `{column}`) or `common.aRequiredValueIs` |
| 22P02 bad value | 400 | `common.isNotAValue` (params `{value, type}`) |
| P0001 trigger guard | 400 | `common.valueFailedAValidation` |
| anything else | 500 | `common.internalServerError` |

Two more apply only under `/api/admin/crm` (an error handler at the end of `crm.routes.js`):

| Condition | Status | Message key |
|---|---|---|
| SQLSTATE 22001, value too long for its column | 400 | `crm.settings.aValueIsTooLong` (params `{column}`) |
| Unique violation on a constraint named `crm_<...>_code_key` | 409 | `crm.settings.thatCodeIsTaken` |

An unknown URL is `404 error.endpointNotFound`.

The per-endpoint error tables below list what the service itself throws; the generic errors above (401, 403, database
mapping) apply everywhere and are not repeated.

## 2. Shared lookups

These reads feed the pickers and drop-downs that several CRM screens share. They are guarded by "any CRM page": the caller's role needs READ on at least one page whose URL starts with `/admin/crm/`. If it has none, the reply is `403 common.permissionDenied`. None of them is paged: `data` is a plain array, or for `/meta` an object.

### GET /api/admin/crm/meta

Every CRM vocabulary in one read, so a screen can fill all its drop-downs from one call when it first loads. The lists are not cached: each call reads the tables again.

**Permission:** any CRM page.

**Path parameters:** None.
**Query parameters:** None.
**Request body:** None.

**Response** `200`: `data` is an object with one key per list. Each value is an array of rows. Unless the table says otherwise, a row has every column of its table (`SELECT *`, columns as in `sql/schema.sql`), and inactive rows are included.

| key | source | order | row columns |
|---|---|---|---|
| `projects` | `crm_project` | `project_id` | project_id, project_code, project_name, project_type_code, source_system_code, legal_entity_code, status (`ACTIVE`/`INACTIVE`), identity_role (`ESHOP`/`USER_MANAGEMENT`/null), created_at, updated_at |
| `currencies` | `crm_currency` | `currency_code` | currency_code, currency_name, decimal_places, is_reporting, is_active |
| `product_classes` | `crm_product_class` | product_domain, rank_no desc, class_code | product_class_id, class_code, class_name, parent_product_class_id, product_domain, rank_no, legacy_column, description, is_active |
| `relationship_types` | `crm_product_relationship_type` | id | relationship_type_id, relationship_code, relationship_name, is_exclusive, awards_registration_points |
| `acquisition_types` | `crm_acquisition_type` | id | acquisition_type_id, acquisition_code, acquisition_name, is_active |
| `purchase_purposes` | `crm_purchase_purpose` | id | purchase_purpose_id, purpose_code, purpose_name, is_active |
| `usage_types` | `crm_product_usage_type` | id | usage_type_id, usage_code, usage_name, is_active |
| `point_types` | `crm_point_type` | id | point_type_id, point_type_code, point_type_name, owner_project_id, is_dream_managed, decimal_places, expires_after_days, is_active |
| `point_event_types` | `crm_point_event_type` | id | point_event_type_id, event_code, display_name, direction (-1/0/1) |
| `case_types` | `crm_service_case_type` | id | case_type_id, case_type_code, display_name |
| `service_statuses` | `crm_service_status` | sequence_no | service_status_id, status_code, display_name, sequence_no, is_terminal |
| `priorities` | `crm_service_priority` | rank_no | service_priority_id, priority_code, priority_name, rank_no |
| `issue_categories` | `crm_issue_category` | display_name | issue_category_id, parent_issue_category_id, project_id, category_code, display_name, is_active |
| `fault_categories` | `crm_fault_category` | display_name | fault_category_id, parent_fault_category_id, project_id, fault_code, display_name, crystal_symptom_id, is_active |
| `root_causes` | `crm_root_cause` | display_name | root_cause_id, project_id, root_cause_code, display_name, is_active |
| `resolution_categories` | `crm_resolution_category` | display_name | resolution_category_id, project_id, resolution_code, display_name, is_active |
| `activity_types` | `crm_service_center_activity_type` | id | activity_type_id, activity_code, activity_name, activity_group, required_capability_code, counts_quantity, counts_amount, is_active |
| `project_tiers` | `crm_project_tier` | project_id, rank_no | project_tier_id, project_id, tier_code, tier_name, rank_no, tier_kind (`LEVEL`/`GRADE`/`CARD_CLASS`), source_code, min_value (string), is_active |
| `corporate_grades` | `crm_corporate_grade` | rank_no | corporate_grade_id, grade_code, grade_name, rank_no, min_score, max_score (strings), is_active |
| `channels` | `crm_communication_channel` | id | channel_id, channel_code, channel_name, required_contact_type, is_active |
| `communication_purposes` | `crm_communication_purpose` | id | purpose_id, purpose_code, purpose_name, requires_opt_in, description |
| `organization_types` | `crm_organization_type` | id | organization_type_id, type_code, type_name |
| `contact_roles` | `crm_org_contact_role` | id | contact_role_id, role_code, role_name |
| `departments` | `crm_department` | department_name | department_id, department_code, department_name, is_active, created_at, updated_at |
| `industries` | `crm_industry` | industry_name | industry_id, industry_code, industry_name, parent_industry_id, is_active |
| `metric_definitions` | `crm_metric_definition` | metric_code | metric_definition_id (string), metric_code, metric_name, value_type, unit_code, description, is_active |
| `areas` | `crm_location`, via `services/crm/locations.js` `all()` | full_name (JavaScript `localeCompare`) | location_pk (string), location_id (same value, kept for pickers), location_name, location_code, parent_code, position, full_name ("Province / City / District"), level (0 province, 1 city, 2 district) |
| `tags` | `crm_tag`, **active only** | tag_name | tag_id, tag_code, tag_name, color_scheme, description, is_active, created_at |
| `party_relationship_types` | `crm_party_relationship_type`, **active only** | sort_order | relationship_type_code, relationship_name, inverse_code, applies_to, is_hierarchy, sort_order, is_active |
| `staff` | `managers` where `is_deleted = false` and `status = 'ACTIVE'` | name | manager_id, name (no other columns) |
| `job_titles` | `crm_job_title` | sort_order, job_name | job_title_id, job_code, job_name, sort_order, is_active |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "projects": [{ "project_id": 2, "project_code": "CRYSTAL", "project_name": "Crystal", "project_type_code": null, "source_system_code": null, "legal_entity_code": null, "status": "ACTIVE", "identity_role": null, "created_at": "2026-09-01T00:00:00.000Z", "updated_at": "2026-09-01T00:00:00.000Z" }],
    "currencies": [{ "currency_code": "USD", "currency_name": "US dollar", "decimal_places": 2, "is_reporting": true, "is_active": true }],
    "corporate_grades": [{ "corporate_grade_id": 1, "grade_code": "BRONZE", "grade_name": "Bronze", "rank_no": 1, "min_score": "0.0000", "max_score": "40.0000", "is_active": true }],
    "areas": [{ "location_pk": "11", "location_id": "11", "location_name": "Central", "location_code": "01", "parent_code": "0", "position": 1, "full_name": "Central", "level": 0 }],
    "staff": [{ "manager_id": 3, "name": "Ana Lee" }],
    "...": "the other 26 keys, same pattern"
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 403 | `common.permissionDenied` | role has READ on no `/admin/crm/*` page |

### GET /api/admin/crm/parties/lookup

Finds customers for a picker. It searches by name, contact, account number, birthday or `party_pk`. With `ids`, it instead returns the customers an edit form already holds.

**Permission:** any CRM page.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `ids` | string | no | none | Comma-separated `party_pk` values. Each value is trimmed, and any value that is not `^[1-9][0-9]*$` is dropped. If at least one id is left, the endpoint returns exactly those parties (`WHERE party_pk IN (...)`). In this mode there is no status filter, so MERGED and DELETED parties are returned too, there is no row limit, the order is unspecified, and `q` is ignored. |
| `q` | string | no | none | Trimmed. A party matches if **any** of these holds: (1) `party_pk` equals the term exactly, after `%` is removed and a leading `#` is stripped, and only when the term is all digits; (2) `display_name ILIKE %term%`; (3) the term's digits, with `+` removed and at least 4 digits, appear as a substring of an ACTIVE or inactive contact point's `normalized_value`; (4) when the term contains `@` or a letter, its lower-cased form appears as a substring of `normalized_value`; (5) the term parses as a birth date (`1990-05-03`, `1990.05.03`, `1990/5/3`, `19900503`, `03.05.1990`, `03/05/1990`; day first unless the middle part cannot be a month), and it equals `crm_person.birth_date`; (6) it equals a linked account's `external_account_id` exactly, or `external_login` case-insensitively. |

In search mode (no usable `ids`), only `ACTIVE` and `INACTIVE` parties are returned. The order is `party_pk DESC` and the limit is 20 rows. If `q` is empty, the 20 newest parties come back.

**Response** `200`: `data` is an array.

| field | type | notes |
|---|---|---|
| party_pk | string | bigint |
| party_type | string | `PERSON` / `ORGANIZATION` |
| party_status | string | `ACTIVE` / `INACTIVE` (any status in `ids` mode) |
| display_name | string \| null | |
| address_line | string \| null | `crm_person.address_line`; null for organizations |
| home_place | string \| null | full name of `crm_person.home_location_pk`, as "Province / City / District" |
| phones | array of string | every ACTIVE `MOBILE` and `PHONE` contact value, primary first |
| mobile | string \| null | first ACTIVE `MOBILE`, primary first |

```json
{
  "success": true,
  "message": "ok",
  "data": [
    { "party_pk": "1042", "party_type": "PERSON", "party_status": "ACTIVE", "display_name": "Bat-Erdene D.", "address_line": "Building 12, apt 4", "home_place": "Central / Zuunmod", "phones": ["+97699112233", "70112233"], "mobile": "+97699112233" }
  ]
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 403 | `common.permissionDenied` | no CRM page |

### GET /api/admin/crm/instances/lookup

Finds product instances (devices, licences, entitlements) for a picker. It uses the same query as the Products list, fixed at 20 rows.

**Permission:** any CRM page.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `q` | string | no | none | Trimmed. `ILIKE %q%` on `external_product_instance_id`, `serial_number`, `imei` or catalogue `product_name`. |
| `project_id` | integer | no | none | exact `instance.project_id` |
| `instance_kind` | string | no | none | exact; `DEVICE`, `LICENCE`, `ENTITLEMENT` |
| `status` | string | no | none | exact; `ACTIVE`, `LOST`, `STOLEN`, `SCRAPPED`, `VOID`, `EXPIRED` |
| `product_class_id` | integer | no | none | exact catalogue `product_class_id` (no roll-up to child classes) |

`page`, `limit`, `sort` and `dir` are ignored. The handler always uses page 1, limit 20, and `product_instance_id` **ascending**, so the oldest 20 matches come back. It also runs a count query whose result it discards.

**Response** `200`: `data` is an array of instance rows.

| field | type | notes |
|---|---|---|
| all `crm_product_instance` columns | | product_instance_id, product_id (strings), project_id, external_product_instance_id, instance_kind, serial_number, imei, license_key_hash, bound_instance_id, provider_party_pk, valid_until, manufactured_at (date), batch_code, activated_at, status, created_at, updated_at |
| product_name, product_code | string | from the catalogue |
| project_code | string | |
| class_code, class_name | string \| null | the catalogue's product class |
| holder_name | string \| null | display name of one current OWNER or LICENSEE (`valid_to IS NULL`) |
| registration_cnt | integer | every registration ever, including ended ones |

```json
{
  "success": true,
  "message": "ok",
  "data": [
    { "product_instance_id": "881", "product_id": "14", "project_id": 2, "external_product_instance_id": "IMEI-356789104512345", "instance_kind": "DEVICE", "serial_number": null, "imei": "356789104512345", "license_key_hash": null, "bound_instance_id": null, "provider_party_pk": null, "valid_until": null, "manufactured_at": null, "batch_code": null, "activated_at": "2026-03-02T08:10:00.000Z", "status": "ACTIVE", "created_at": "2026-09-01T10:00:00.000Z", "updated_at": "2026-09-01T10:00:00.000Z", "product_name": "Dream X9", "product_code": "X9", "project_code": "CRYSTAL", "class_code": "SMARTPHONE", "class_name": "Smartphone", "holder_name": "Bat-Erdene D.", "registration_cnt": 1 }
  ]
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `common.isNotAValue` | a non-numeric `project_id` or `product_class_id`, or an `instance_kind`/`status` outside the CHECK list (CHECK lists do not raise 22P02, so a bad enum word simply matches nothing) |
| 403 | `common.permissionDenied` | no CRM page |

### GET /api/admin/crm/catalog/lookup

Catalogue products for a picker. The query is written in the controller, not in a service.

**Permission:** any CRM page.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `project_id` | integer | no | none | exact `catalog.project_id` |

Rows with status `DISCONTINUED` are left out. The order is `product_name`, with at most 1000 rows. There is no text search.

**Response** `200`: `data` is an array.

| field | type | notes |
|---|---|---|
| product_id | string | bigint |
| product_code | string | |
| product_name | string | |
| product_kind | string | `DEVICE`, `LICENCE`, `SOFTWARE`, `SUBSCRIPTION`, `GOODS`, `SERVICE` |
| project_id | integer | |
| project_code | string | |

```json
{ "success": true, "message": "ok", "data": [ { "product_id": "14", "product_code": "X9", "product_name": "Dream X9", "product_kind": "DEVICE", "project_id": 2, "project_code": "CRYSTAL" } ] }
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `common.isNotAValue` | non-numeric `project_id` |
| 403 | `common.permissionDenied` | no CRM page |

### GET /api/admin/crm/sites/options

Sites (service centres, agencies, collection points and the like) for a picker.

**Permission:** any CRM page.

**Query parameters:** None. Sites with status `CLOSED` are left out. The order is `service_center_name`, with at most 2000 rows.

**Response** `200`: `data` is an array.

| field | type | notes |
|---|---|---|
| service_center_id | string | bigint |
| service_center_code | string | |
| service_center_name | string | |
| service_center_kind | string | `SERVICE_CENTER`, `SALES_AGENCY`, `COLLECTION_POINT`, `PARTNER_SHOP`, `OFFICE`, `EVENT_VENUE` |

```json
{ "success": true, "message": "ok", "data": [ { "service_center_id": "7", "service_center_code": "AG-7", "service_center_name": "Central Service Centre", "service_center_kind": "SERVICE_CENTER" } ] }
```

**Errors:** `403 common.permissionDenied` (no CRM page).

### GET /api/admin/crm/segments/options

Segments for a picker.

**Permission:** any CRM page.

**Query parameters:** None. Segments with status `ARCHIVED` are left out. The order is `segment_name`, and there is no limit.

**Response** `200`: `data` is an array.

| field | type | notes |
|---|---|---|
| segment_id | string | bigint |
| segment_code | string | |
| segment_name | string | |
| member_count | integer \| null | as of the last evaluation |

```json
{ "success": true, "message": "ok", "data": [ { "segment_id": "3", "segment_code": "X9_OWNERS", "segment_name": "Owners of a class 9 phone", "member_count": 412 } ] }
```

**Errors:** `403 common.permissionDenied`.

### GET /api/admin/crm/segments/fields

The rule vocabulary for the segment editor: every condition the rule compiler understands. The data comes from code (`marketing.service.js` `CONDITIONS`), not from the database.

**Permission:** any CRM page.

**Query parameters:** None.

**Response** `200`: `data` is an array with one entry per condition. The conditions are, in order: `party_type`, `project_member`, `tier`, `owns_class`, `owns_no_class`, `points_balance`, `service_cases`, `no_service_cases`, `site_visits`, `registered_within`, `corporate_grade`, `has_contact`, `snapshot`, `activity_status`, `metric`, `bought_in_project`, `consented`.

| field | type | notes |
|---|---|---|
| field | string | the condition name used in a rule |
| params | array of string | the parameters the condition reads, for example `["class", "min"]` |
| optional | array of string | Which params may be left out. Set explicitly only for `snapshot` (`["op", "project"]`), `metric` (`["op"]`) and `bought_in_project` (`["days"]`). Every other condition gets the generic default `["min", "days", "activity"]`, even if it has none of those params. |
| measures | array of string | **only on `snapshot`**: purchase_amount_12m, purchase_amount_lifetime, transaction_count_12m, transaction_count_lifetime, active_purchase_days_12m, average_transaction_amount_12m, service_case_count_12m, complaint_count_12m, corporate_score, registered_device_count, points_earned_12m, location_visit_count_12m. The key is absent on the other conditions. |
| operators | array of string | **only on `snapshot` and `metric`**: `>=`, `<=`, `>`, `<`, `=`. The key is absent on the other conditions. |

```json
{
  "success": true,
  "message": "ok",
  "data": [
    { "field": "owns_class", "params": ["class", "min"], "optional": ["min", "days", "activity"] },
    { "field": "snapshot", "params": ["measure", "op", "value", "project"], "optional": ["op", "project"], "measures": ["purchase_amount_12m", "..."], "operators": [">=", "<=", ">", "<", "="] }
  ]
}
```

**Errors:** `403 common.permissionDenied`.

### GET /api/admin/crm/events/options

Activity events, as in lotteries and reservations (`crm_event`), for a picker. The query is written in the controller.

**Permission:** any CRM page.

**Query parameters:** None. All statuses are included, CANCELLED too. The order is `event_id DESC`, with at most 500 rows.

**Response** `200`: `data` is an array.

| field | type | notes |
|---|---|---|
| event_id | string | bigint |
| event_code | string | |
| event_name | string | |
| status | string | `DRAFT`, `APPROVED`, `TARGETS_FROZEN`, `OPEN`, `CLOSED`, `FULFILLED`, `CANCELLED` |

```json
{ "success": true, "message": "ok", "data": [ { "event_id": "12", "event_code": "SPRING-LOTTERY", "event_name": "Spring lottery", "status": "OPEN" } ] }
```

**Errors:** `403 common.permissionDenied`.

### GET /api/admin/crm/campaigns/options

Campaigns for a picker.

**Permission:** any CRM page.

**Query parameters:** None. Campaigns whose `campaign_status` is `CANCELLED` are left out. The order is `campaign_id DESC`, with at most 500 rows.

**Response** `200`: `data` is an array.

| field | type | notes |
|---|---|---|
| campaign_id | string | bigint |
| campaign_code | string | |
| campaign_name | string | |

```json
{ "success": true, "message": "ok", "data": [ { "campaign_id": "5", "campaign_code": "WINBACK-26", "campaign_name": "Win-back autumn 2026" } ] }
```

**Errors:** `403 common.permissionDenied`.

## 3. Overview and imports

### GET /api/admin/crm/overview

The CRM front page. It reads headline counts across customers, holdings, service cases, points, events, sites and marketing, then breaks customers down by project and holdings down by top-level product class. Every figure is computed live when the endpoint is called.

**Permission:** READ on `/admin/crm/overview`.

**Query parameters:** None.

**Response** `200`: `data` object.

| field | type | notes |
|---|---|---|
| parties.active | integer | `party_status = 'ACTIVE'` |
| parties.persons / parties.organizations | integer | ACTIVE parties of each type |
| parties.merged | integer | `MERGED` |
| parties.new_30d | integer | created in the last 30 days, any status |
| parties.duplicates | integer | `crm_identity_match_candidate` with `match_status = 'PENDING'` |
| holdings.current | integer | registrations with `valid_to IS NULL` |
| holdings.new_30d | integer | registered in the last 30 days |
| holdings.open_transfers | integer | transfers `REQUESTED` or `ACCEPTED` |
| cases.open | integer | case status not terminal |
| cases.overdue | integer | open and `due_at < now()` |
| cases.new_30d | integer | received in the last 30 days |
| cases.csat_90d | string \| null | average `satisfaction_rating` of cases received in the last 90 days, rounded to 2 places (numeric) |
| points.outstanding | string | sum of every `crm_point_account.balance`, all currencies together |
| points.earned_30d / points.spent_30d | string | positive and negative `points_delta` over the last 30 days (spent reported as positive) |
| points.drifted | integer | rows in `v_crm_point_account_drift` |
| events.running | integer | `crm_event` `TARGETS_FROZEN` or `OPEN` |
| events.preparing | integer | `DRAFT` or `APPROVED` |
| events.reservations_open | integer | reservations `RESERVED` or `PAID` |
| events.awards_open | integer | awards `PENDING`, `READY` or `DISPATCHED` |
| sites.active | integer | sites with status `ACTIVE` |
| sites.activities_30d | integer | COMPLETED site activities in the last 30 days |
| sites.events_ahead | integer | site events `PLANNED` or `CONFIRMED` that start from now on |
| marketing.segments | integer | ACTIVE segments |
| marketing.campaigns_live | integer | campaigns `APPROVED` or `ACTIVE` |
| by_project | array | every project, ordered by project_id: `{ project_code, project_name, parties }`, where `parties` is the number of distinct parties with a linked (not unlinked) account |
| by_class | array | top-level product classes only (`parent_product_class_id IS NULL`), ordered by id: `{ class_code, class_name, product_domain, owned, owners }`. `owned` is the sum of `active_owned_count`; `owners` is the number of parties with `active_owned_count > 0`. Both read `crm_party_product_class_stat`, so they are only as fresh as the last recalculation. |
| recent_activity | array | Top 8 site activity types by COMPLETED count over the last 30 days: `{ activity_code, activity_name, cnt }`, ordered by `cnt` desc. |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "parties": { "active": 18234, "persons": 18011, "organizations": 223, "merged": 41, "new_30d": 512, "duplicates": 9 },
    "holdings": { "current": 20877, "new_30d": 640, "open_transfers": 3 },
    "cases": { "open": 57, "overdue": 6, "new_30d": 188, "csat_90d": "4.32" },
    "points": { "outstanding": "1250430.000", "earned_30d": "48210.000", "spent_30d": "12005.000", "drifted": 0 },
    "events": { "running": 1, "preparing": 2, "reservations_open": 34, "awards_open": 5 },
    "sites": { "active": 46, "activities_30d": 930, "events_ahead": 2 },
    "marketing": { "segments": 7, "campaigns_live": 1 },
    "by_project": [ { "project_code": "PLATFORM", "project_name": "Vendor platform", "parties": 17020 }, { "project_code": "CRYSTAL", "project_name": "Crystal", "parties": 17020 } ],
    "by_class": [ { "class_code": "SMARTPHONE", "class_name": "Smartphone", "product_domain": "SMARTPHONE", "owned": 15012, "owners": 13877 } ],
    "recent_activity": [ { "activity_code": "REPAIR_INTAKE", "activity_name": "Repair intake", "cnt": 402 } ]
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 403 | `common.permissionDenied` | no READ on the Overview page |

### POST /api/admin/crm/import

Runs the Crystal adapter. It copies Crystal's own data into the CRM: the vendor location list, agencies as sites, symptoms as fault categories, products as catalogue entries, members as parties, registered products, point logs, repair tickets as service cases, and wallet, repair and licence payments as transactions. It then rebuilds the per-class holding counts. The import is idempotent: every row it creates carries its Crystal key, so a second run updates rows instead of duplicating them. Crystal's tables are only read, never written.

The call is **synchronous and long-running**. The reply arrives only after every step has finished: the steps are `locations`, `sites`, `faults`, `catalogue`, `members`, `registrations`, `points`, `cases` and `transactions`, run in that order, followed by the class-stat rebuild. Work is done row by row, and many steps open one transaction per row. There is no job id and no progress reporting. A successful run is written to the audit log as an IMPORT of `crm_party`, with the summary attached.

**What it reads:**
- Crystal's tables in the main Postgres database: `agencies`, `agency_services`, `symptom_catalog`, `products`, `product_categories`, `users`, `registered_products`, `point_logs`, `wallets`, `repair_tickets`, `wallet_transactions` and `licenses`.
- The CRM vocabularies.
- The vendor location list through the legacy handle (`config/legacy.js`): `<LEGACY_PID_SCHEMA>.locations`, where `LEGACY_PID_SCHEMA` defaults to `ora_pid`. `LEGACY_DRIVER` selects `postgres` (the default) or `oracle`.

The import requires a `CRYSTAL` row in `crm_project`. New members go through identity resolution, which may link a member to an existing party, create a new one, or queue the member for review.

**Permission:** WRITE on `/admin/crm/overview`.

**Request body:** None. Nothing is read from the body.

**Response** `200`, message `crm.common.importFinished` ("import finished"): `data` is the run summary, with one object per step.

| field | type | notes |
|---|---|---|
| locations | `{ added, updated }` | vendor locations upserted into `crm_location` |
| sites | `{ added, updated }` | agencies to `crm_service_center` (capabilities follow along) |
| faults | `{ added }` | new fault categories from `symptom_catalog` |
| catalogue | `{ added }` | new catalogue products. Products that already existed are updated but not counted. |
| members | `{ added, updated, outcomes }` | `outcomes` maps each identity-resolution outcome (`CREATED`, `EXISTING`, `MERGED`, `QUEUED`, ...) to a count. Queued members get no party yet. |
| registrations | `{ added }` | |
| points | `{ added }` | `{ added: 0 }` if the CRYSTAL point type is missing |
| cases | `{ added, updated }` | |
| transactions | `{ added, updated, unmatched_refunds }` | `unmatched_refunds` counts wallet refunds that no earlier purchase could cover; they are not imported |
| class_stats | `{ rows }` | rows written to `crm_party_product_class_stat` by the rebuild |

All counts are integers.

```json
{
  "success": true,
  "message": "import finished",
  "data": {
    "locations": { "added": 0, "updated": 341 },
    "sites": { "added": 1, "updated": 45 },
    "faults": { "added": 0 },
    "catalogue": { "added": 2 },
    "members": { "added": 37, "updated": 16980, "outcomes": { "EXISTING": 16980, "CREATED": 37, "QUEUED": 3 } },
    "registrations": { "added": 52 },
    "points": { "added": 410 },
    "cases": { "added": 12, "updated": 88 },
    "transactions": { "added": 140, "updated": 9120, "unmatched_refunds": 1 },
    "class_stats": { "rows": 31877 }
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 403 | `common.permissionDenied` | no WRITE on Overview |
| 500 | `common.internalServerError` | Any step fails, the CRYSTAL project is missing, or the legacy database cannot be reached. The step name is added to the server-side log message, not to the reply. The run stops at that step, and whatever earlier steps and earlier rows already wrote stays in place. |
| 400 | `crm.settings.aValueIsTooLong` | a Crystal value is longer than its CRM column (SQLSTATE 22001, mapped by the CRM router's own error handler). The run stops at that step, as above. |

### POST /api/admin/crm/recalculate

Rebuilds `crm_party_product_class_stat` from the registrations: for every party and every product class, how many products it holds now and how many it has ever registered. Each class is also counted under all of its parent classes. Only `OWNER` and `LICENSEE` registrations that are not `CANCELLED` count, and only for `ACTIVE` or `INACTIVE` parties. The whole table is deleted and refilled in one transaction. The call is synchronous.

**Permission:** WRITE on `/admin/crm/overview`.

**Request body:** None.

**Response** `200`, message `crm.settings.recalculated` ("figures recalculated").

| field | type | notes |
|---|---|---|
| class_stats.rows | integer | rows inserted |

```json
{ "success": true, "message": "figures recalculated", "data": { "class_stats": { "rows": 31877 } } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 403 | `common.permissionDenied` | no WRITE on Overview |

### POST /api/admin/crm/import/vendor

Runs the Eshop and Appstore adapters for every Crystal member the CRM already knows. A member qualifies if they have a linked, not-unlinked CRYSTAL account, an `ACTIVE` or `INACTIVE` party, and a `users` row. For each member the adapter asks the vendor platform for the member's Eshop and Appstore keys, then pulls the following.

- **Eshop:** the account (through identity resolution); the membership, with the card level mapped to a tier through `crm_project_tier.source_code` of the project whose `identity_role = 'ESHOP'`, and tier changes appended to the tier history; every order as a `SALE` with its lines, the goods becoming catalogue products; and every refunded order as an extra `REFUND` row.
- **Appstore:** the account; every purchase as an `APP_PURCHASE`; and each completed app purchase as an `ENTITLEMENT` instance with a `LICENSEE` registration.

The call is **synchronous and long-running**. Members are processed one after another, with several HTTP calls each: card info, orders (first page of 200), one order-detail call per order, and purchases (first page of 200). Run it after `POST /import`, because it starts from the members that import created. A member whose lookup or remote calls fail is counted in `unavailable` and skipped, and the run continues. A successful run is written to the audit log as an IMPORT of `crm_transaction`.

**What it reads:**
- The vendor merge table `<LEGACY_PID_SCHEMA>.user_merge_ids` through the legacy handle. As a fallback, it reads the legacy customer record in `ora_old_db.customers`.
- The remote services in `config/remote.js`: `ESHOP_SERVER_URL` and `APPSTORE_SERVER_URL`. With `REMOTE_MOCK=true`, which is the default, an in-process mock answers instead.
- The `system_settings` key `company.native_currency_rate`, used to convert native-currency and coin amounts into the reporting currency.
- The reporting currency (`crm_currency.is_reporting`; `USD` if none is set).

The import requires `ESHOP` and `APPSTORE` rows in `crm_project`.

**Permission:** WRITE on `/admin/crm/overview`.

**Request body:** None.

**Response** `200`, message `crm.common.importFinished` ("import finished").

| field | type | notes |
|---|---|---|
| members | integer | Crystal members examined |
| accounts | integer | Eshop or Appstore accounts newly linked (resolution outcome other than `EXISTING`) |
| memberships | integer | Eshop memberships created |
| tier_changes | integer | tier changes recorded on existing Eshop memberships |
| transactions | integer | transaction rows created; refreshed rows are not counted |
| entitlements | integer | Appstore LICENSEE registrations created |
| unavailable | integer | members skipped because the platform lookup or a remote call failed |
| not_on_platform | integer | members with neither an Eshop nor an Appstore key |
| pending | integer | **present only when non-zero**: accounts queued for identity review instead of being linked |

```json
{
  "success": true,
  "message": "import finished",
  "data": { "members": 17020, "accounts": 214, "memberships": 180, "tier_changes": 12, "transactions": 2310, "entitlements": 96, "unavailable": 4, "not_on_platform": 15020, "pending": 6 }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 403 | `common.permissionDenied` | no WRITE on Overview |
| 500 | `common.internalServerError` | the ESHOP or APPSTORE project is missing, or the members query itself fails (failures for a single member do not stop the run) |

## 4. Analysis

The analysis run writes one snapshot per party, per scope and per reference date. A scope is either one project (`project_id` set) or Dream-wide (`project_id` null). The read endpoints default to the latest reference date that has any snapshot.

### GET /api/admin/crm/analysis/summary

The Dream-wide picture on one reference date: how many customers fall in each grade band, the activity mix, spend by project, and the totals.

**Permission:** READ on `/admin/crm/analysis`.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `reference_date` | string `YYYY-MM-DD` | no | latest `reference_date` in `crm_party_analysis_snapshot` | the date to summarise. Not validated; a malformed date fails in the database (500). |

**Response** `200`: `data` object. If there are no snapshots at all, it is `{ reference_date: null, grades: [], activity: [], projects: [], totals: {}, dates: [] }`.

| field | type | notes |
|---|---|---|
| reference_date | string | the date used |
| grades | array | Every **active** corporate grade, ordered by `rank_no` desc: `{ corporate_grade_id, grade_code, grade_name, rank_no, min_score, max_score, parties, spend_12m }`. `parties` (integer) counts Dream-wide snapshots on this date in the grade. `spend_12m` (string) sums their `purchase_amount_12m`. Grades with no customers show 0. |
| activity | array | `{ activity_status, parties }` for Dream-wide snapshots, ordered by count desc. `activity_status` is one of `NEW`, `ACTIVE`, `AT_RISK`, `LAPSED`, `NEVER_BOUGHT`. |
| projects | array | Project-scope snapshots on this date, grouped by project and ordered by spend desc: `{ project_id, project_code, project_name, parties, spend_12m (string), transactions_12m, cases_12m }` |
| totals | object | Dream-wide on this date: `{ parties, spend_12m (string), transactions_12m, average_score (string, 2 places, or null), at_risk (AT_RISK + LAPSED), calculated_at (latest), model_version (max) }` |
| dates | array of string | up to 60 distinct reference dates, newest first |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "reference_date": "2026-10-10",
    "grades": [ { "corporate_grade_id": 4, "grade_code": "PLATINUM", "grade_name": "Platinum", "rank_no": 4, "min_score": "80.0000", "max_score": null, "parties": 312, "spend_12m": "402118.5000" } ],
    "activity": [ { "activity_status": "ACTIVE", "parties": 9120 }, { "activity_status": "NEVER_BOUGHT", "parties": 6005 } ],
    "projects": [ { "project_id": 4, "project_code": "ESHOP", "project_name": "Eshop", "parties": 3120, "spend_12m": "880412.2000", "transactions_12m": 9204, "cases_12m": 0 } ],
    "totals": { "parties": 17996, "spend_12m": "1490233.7000", "transactions_12m": 15880, "average_score": "31.48", "at_risk": 2210, "calculated_at": "2026-10-10T02:00:11.512Z", "model_version": "dream-v1" },
    "dates": ["2026-10-10", "2026-10-03"]
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 403 | `common.permissionDenied` | no READ on Analysis |
| 500 | `common.internalServerError` | malformed `reference_date` |

### GET /api/admin/crm/analysis/snapshots

A paged list of snapshots on one reference date. By default these are the Dream-wide rows; with `scope=project`, they are the project rows.

**Permission:** READ on `/admin/crm/analysis`.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `page`, `limit` | integer | no | 1, 20 | standard paging (limit 1..200) |
| `dir` | string | no | `desc` | `asc` for ascending; anything else gives descending |
| `sort` | string | no | n/a | **Ignored.** The controller allows no sort fields, so the order is always `corporate_score` in `dir`, NULLS LAST. The service lists other sort columns, but no query value can reach them. Project rows have a null score, so their order is unspecified. |
| `reference_date` | string `YYYY-MM-DD` | no | latest snapshot date | exact `reference_date` |
| `scope` | string | no | Dream-wide | `project` gives project rows (`project_id IS NOT NULL`); any other value gives Dream-wide rows (`project_id IS NULL`) |
| `project_id` | integer | no | none | only with `scope=project`: exact project |
| `party_pk` | string of digits | no | none | One customer's rows. Must match `^\d{1,18}$`. Note that sending it empty (`?party_pk=`) is also an error. |
| `corporate_grade_id` | integer | no | none | exact `snapshot.corporate_grade_id`. Hand-assigned grades are not considered. |
| `activity_status` | string | no | none | exact; `NEW`, `ACTIVE`, `AT_RISK`, `LAPSED`, `NEVER_BOUGHT` |
| `q` | string | no | none | `party.display_name ILIKE %q%`, or `party_pk` equal to `q` when `q` is all digits (a leading `#` is allowed) |

**Response** `200`: a list envelope. `summary` is `{ reference_date }`, the date actually used. If no snapshots exist at all, the reply is `rows: []`, `total: 0`, `summary: { reference_date: null }`.

| field | type | notes |
|---|---|---|
| analysis_snapshot_id | string | |
| party_pk | string | |
| project_id | integer \| null | null = Dream-wide |
| reference_date | string | `YYYY-MM-DD` |
| calculated_at, created_at | string | timestamps |
| reporting_currency_code | string \| null | |
| first_transaction_at, last_transaction_at | string \| null | |
| purchase_amount_lifetime, purchase_amount_12m, average_transaction_amount_12m | string \| null | numeric |
| transaction_count_lifetime, transaction_count_12m, active_purchase_days_12m, service_case_count_12m, complaint_count_12m, registered_device_count, location_visit_count_12m | integer \| null | |
| points_earned_12m | string \| null | numeric |
| score_components | object \| null | Dream-wide rows only: `{ model, projects_active_12m, value, frequency, recency, breadth, ownership, care }` |
| activity_status | string \| null | |
| corporate_score | string \| null | Dream-wide rows only |
| corporate_grade_id | integer \| null | Dream-wide rows only |
| model_version | string \| null | |
| party_name | string \| null | `party.display_name` |
| party_type | string | |
| project_code | string \| null | |
| grade_code, grade_name | string \| null | the computed grade, not a hand-assigned one |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      { "analysis_snapshot_id": "90311", "party_pk": "1042", "project_id": null, "reference_date": "2026-10-10", "calculated_at": "2026-10-10T02:00:11.512Z", "reporting_currency_code": "USD", "first_transaction_at": "2024-02-11T06:20:00.000Z", "last_transaction_at": "2026-09-28T11:02:00.000Z", "purchase_amount_lifetime": "4210.5000", "purchase_amount_12m": "1180.0000", "transaction_count_lifetime": 19, "transaction_count_12m": 6, "active_purchase_days_12m": 5, "average_transaction_amount_12m": "196.6700", "service_case_count_12m": 1, "complaint_count_12m": 0, "registered_device_count": 2, "points_earned_12m": "350.000", "location_visit_count_12m": 3, "score_components": { "model": "dream-v1", "projects_active_12m": 3, "value": 31.2, "frequency": 11.4, "recency": 14.56, "breadth": 15, "ownership": 5, "care": 5 }, "activity_status": "ACTIVE", "corporate_score": "82.1600", "corporate_grade_id": 4, "model_version": "dream-v1", "created_at": "2026-10-10T02:00:11.512Z", "party_name": "Bat-Erdene D.", "party_type": "PERSON", "project_code": null, "grade_code": "PLATINUM", "grade_name": "Platinum" }
    ],
    "total": 17996, "page": 1, "limit": 20,
    "summary": { "reference_date": "2026-10-10" }
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `crm.common.checkTheDetails` ("some details are not valid") | `party_pk` present but not 1 to 18 digits. `detail` is `[{ field: "party_pk", message: "party_pk must be a number" }]`. |
| 400 | `common.isNotAValue` | non-numeric `project_id` or `corporate_grade_id` |
| 403 | `common.permissionDenied` | no READ on Analysis |
| 500 | `common.internalServerError` | malformed `reference_date` |

### GET /api/admin/crm/analysis/metrics

A paged list of party metric values, by default on the latest metric date.

**Permission:** READ on `/admin/crm/analysis`.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `page`, `limit` | integer | no | 1, 20 | standard paging |
| `dir` | string | no | `desc` | ordering is always `numeric_value` in `dir` NULLS LAST, then `party_pk`. `sort` is ignored. |
| `metric_definition_id` | integer | no | none | One metric. Without it, every metric is mixed in one list. |
| `reference_date` | string `YYYY-MM-DD` | no | latest `reference_date` in `crm_party_metric_value` | exact date. The default is the latest date across **all** metrics, not per metric. |
| `q` | string | no | none | `party.display_name ILIKE %q%`, or `party_pk` equal to an all-digit `q` |

**Response** `200`: a list envelope with `summary: null`.

| field | type | notes |
|---|---|---|
| party_metric_value_id | string | |
| party_pk | string | |
| project_id | integer \| null | The run writes only Dream-wide values, so this is null. |
| metric_definition_id | string | |
| reference_date | string | |
| numeric_value | string \| null | numeric(30,10). Exactly one of the four `*_value` fields is set. |
| text_value | string \| null | |
| boolean_value | boolean \| null | |
| date_value | string \| null | `YYYY-MM-DD` |
| calculated_at | string | |
| model_version | string \| null | |
| party_name | string \| null | |
| metric_code, metric_name, value_type, unit_code | string | from `crm_metric_definition`; `value_type` is `NUMBER`, `TEXT`, `BOOLEAN` or `DATE` |

The metrics the run computes, when a definition with the matching code exists and is active, are `DAYS_SINCE_LAST_PURCHASE`, `CROSS_PROJECT_COUNT`, `PRODUCT_OWNERSHIP_COUNT`, `CHURN_RISK`, `POINTS_BALANCE`, `IS_MULTI_PROJECT` (boolean) and `LAST_SERVICE_DATE` (date).

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      { "party_metric_value_id": "551204", "party_pk": "1042", "project_id": null, "metric_definition_id": "4", "reference_date": "2026-10-10", "numeric_value": "0.1830000000", "text_value": null, "boolean_value": null, "date_value": null, "calculated_at": "2026-10-10T02:00:11.512Z", "model_version": "dream-v1", "party_name": "Bat-Erdene D.", "metric_code": "CHURN_RISK", "metric_name": "Churn risk", "value_type": "NUMBER", "unit_code": null }
    ],
    "total": 17020, "page": 1, "limit": 20, "summary": null
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `common.isNotAValue` | non-numeric `metric_definition_id` |
| 403 | `common.permissionDenied` | no READ on Analysis |
| 500 | `common.internalServerError` | malformed `reference_date` |

### GET /api/admin/crm/analysis/model

The corporate-score model as the code defines it, so the screen can explain how a score was reached. The values are constants in `analysisRun.service.js`.

**Permission:** READ on `/admin/crm/analysis`.

**Query parameters:** None.

**Response** `200`

| field | type | notes |
|---|---|---|
| version | string | `dream-v1` |
| parts.value | object | `{ weight: 40 }`: percentile rank of 12-month spend among customers who bought anything |
| parts.frequency | object | `{ weight: 15 }`: percentile rank of distinct purchase days in 12 months |
| parts.recency | object | `{ weight: 15, freshDays: 30, goneDays: 365 }`: full marks up to 30 days since the last purchase, falling to 0 at 365 |
| parts.breadth | object | `{ weight: 15, perProject: 5 }`: 5 per project active in 12 months, capped at 15 |
| parts.ownership | object | `{ weight: 10, perProduct: 2.5 }`: 2.5 per product held now, capped at 10 |
| parts.care | object | `{ weight: 5, perComplaint: 2.5 }`: starts at 5 and loses 2.5 per complaint in 12 months |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "version": "dream-v1",
    "parts": {
      "value": { "weight": 40 }, "frequency": { "weight": 15 },
      "recency": { "weight": 15, "freshDays": 30, "goneDays": 365 },
      "breadth": { "weight": 15, "perProject": 5 }, "ownership": { "weight": 10, "perProduct": 2.5 },
      "care": { "weight": 5, "perComplaint": 2.5 }
    }
  }
}
```

**Errors:** `403 common.permissionDenied`.

### POST /api/admin/crm/analysis/run

Runs the analysis for one reference date. It loads every fact up to the end of that date: counted transactions where the party is BUYER, service cases, current OWNER and LICENSEE holdings, points earned, and completed site visits. From these it writes a snapshot per party and project, a Dream-wide snapshot per party carrying the corporate score and grade, and metric values.

Only parties with at least one such fact get rows, and the run does not filter on party status. PLATFORM-project rows are left out. The grade is the active `crm_corporate_grade` band with `min_score <= score < max_score`, where a null bound is open. Activity status is derived as follows: `NEVER_BOUGHT` with no purchase; `NEW` if the first purchase was 90 days or less before the date; otherwise `ACTIVE` if the last purchase was 180 days or less before it, `AT_RISK` if 365 days or less, and `LAPSED` beyond that.

The call is synchronous. All the writes happen in one transaction. First it deletes **every** snapshot for that reference date, whatever its model version, and every metric value for that date with model `dream-v1`. Then it inserts the new rows in batches of 500. Running it twice for the same date therefore gives the same result once. A run is written to the audit log as an IMPORT of `crm_party_analysis_snapshot`.

**Permission:** WRITE on `/admin/crm/analysis`.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| reference_date | string `YYYY-MM-DD` | no | Defaults to today's UTC date. Not validated: a malformed value fails in the database (500). |

**Response** `200`, message `crm.analysis.analysisFinished` ("analysis finished").

| field | type | notes |
|---|---|---|
| reference_date | string | the date analysed |
| snapshots | integer | snapshot rows written (project and Dream-wide) |
| graded | integer | Dream-wide rows that received a grade |
| metric_values | integer | metric rows written |
| model | string | `dream-v1` |

```json
{ "success": true, "message": "analysis finished", "data": { "reference_date": "2026-10-11", "snapshots": 41230, "graded": 17996, "metric_values": 98114, "model": "dream-v1" } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 403 | `common.permissionDenied` | no WRITE on Analysis |
| 500 | `common.internalServerError` | malformed `reference_date`, or any database failure. The delete and inserts are rolled back together. |

## 5. Transactions

A transaction is a business fact recorded by a project adapter. A refund, return or reversal is its own row, with a negative amount and pointing at the original. Only these statuses count towards spend: `COMPLETED`, `PAID`, `DELIVERED`, `FINISHED`, `ACCEPTED`, `DELIVERING`, `REFUNDED`, `SUCCESS`.

### GET /api/admin/crm/transactions

A paged list of transactions, each shown with its BUYER, plus a summary of the counted amount.

**Permission:** READ on `/admin/crm/transactions`.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `page`, `limit` | integer | no | 1, 20 | standard paging |
| `sort` | string | no | `transaction_at` | `transaction_at`, `net_amount` or `reporting_net_amount`; anything else falls back to `transaction_at` |
| `dir` | string | no | `desc` | `asc` or descending. Nulls follow Postgres defaults: last for asc, first for desc. |
| `project_id` | integer | no | none | exact |
| `transaction_type_code` | string | no | none | exact; `SALE`, `LICENCE_PURCHASE`, `APP_PURCHASE`, `SERVICE_PAYMENT`, `RESERVATION_PAYMENT`, `REFUND`, `RETURN`, `REVERSAL` |
| `party_pk` | integer | no | none | transactions where this party is the BUYER |
| `from` | string (date or timestamp) | no | none | `transaction_at >= from`. A bare date means midnight in the database session's time zone. |
| `to` | string `YYYY-MM-DD` | no | none | `transaction_at < to + 1 day`, so the whole `to` day is included |
| `counted` | string | no | none | `1` keeps only the counted statuses listed above; any other value is ignored |
| `q` | string | no | none | Trimmed. `external_transaction_id ILIKE %q%`, or buyer `display_name ILIKE %q%`, or buyer `party_pk` equal to an all-digit `q` |

**Response** `200`: a list envelope. `total` counts distinct transactions. `summary` is `{ reporting_net: string, counted: integer }`: the sum of `reporting_net_amount` and the number of rows, over the matching transactions that have a counted status. If a transaction has more than one BUYER, it appears once per buyer in `rows` and in `summary`; `total` is not affected.

| field | type | notes |
|---|---|---|
| transaction_id | string | |
| project_id | integer | |
| external_transaction_id | string | the source system's id |
| original_transaction_id | string \| null | for refunds, returns and reversals |
| transaction_type_code | string | |
| transaction_status | string | free text from the source (e.g. `COMPLETED`, `PENDING`, `REFUNDED`) |
| currency_code | string | |
| gross_amount, discount_amount, net_amount | string \| null | numeric(20,4); negative for refund-type rows |
| reporting_currency_code | string \| null | |
| reporting_net_amount | string \| null | null when the amount could not be converted |
| points_used | string \| null | numeric |
| sales_channel_code | string \| null | e.g. `WALLET`, `ESHOP`, `APPSTORE`, `SERVICE_CENTRE`, `WEB` |
| service_center_id | string \| null | |
| transaction_at, source_created_at, source_updated_at, ingested_at, created_at, updated_at | string \| null | timestamps |
| project_code | string | |
| party_pk | string \| null | the BUYER |
| party_name | string \| null | the buyer's `display_name` |
| service_center_name | string \| null | |
| is_counted | boolean | status is in the counted list |
| item_cnt | integer | lines |
| refund_cnt | integer | rows that point at this one as their original |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      { "transaction_id": "30211", "project_id": 4, "external_transaction_id": "E20260928-0042", "original_transaction_id": null, "transaction_type_code": "SALE", "transaction_status": "COMPLETED", "currency_code": "USD", "gross_amount": "120.0000", "discount_amount": "0.0000", "net_amount": "120.0000", "reporting_currency_code": "USD", "reporting_net_amount": "120.0000", "points_used": null, "sales_channel_code": "ESHOP", "service_center_id": null, "transaction_at": "2026-09-28T11:02:00.000Z", "source_created_at": "2026-09-28T11:02:00.000Z", "source_updated_at": null, "ingested_at": "2026-10-01T03:00:00.000Z", "created_at": "2026-10-01T03:00:00.000Z", "updated_at": "2026-10-01T03:00:00.000Z", "project_code": "ESHOP", "party_pk": "1042", "party_name": "Bat-Erdene D.", "service_center_name": null, "is_counted": true, "item_cnt": 2, "refund_cnt": 0 }
    ],
    "total": 15880, "page": 1, "limit": 20,
    "summary": { "reporting_net": "1490233.7000", "counted": 15511 }
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `common.isNotAValue` | non-numeric `project_id` or `party_pk`, or an unparsable `from`/`to` (only when it is a 22P02 error; other bad dates give 500) |
| 403 | `common.permissionDenied` | no READ on Transactions |

### GET /api/admin/crm/transactions/:id

One transaction with its parties, lines, refunds, linked service cases and point events.

**Permission:** READ on `/admin/crm/transactions`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | integer | `transaction_id` |

**Response** `200`: `data` object.

| field | type | notes |
|---|---|---|
| transaction | object | every `crm_transaction` column (as in the list), plus `project_code`, `project_name`, `service_center_name` and `original_external_id` (the original's `external_transaction_id`, or null) |
| parties | array | `{ transaction_party_id, transaction_id, party_pk, party_role_code, created_at, party_name }`. `party_role_code` is `BUYER`, `PAYER`, `RECEIVER`, `SELLER` or `AGENT`. |
| items | array | Ordered by line id: `{ transaction_item_id, transaction_id, product_id, product_instance_id, external_item_id, quantity, unit_price, gross_amount, discount_amount, net_amount, created_at, product_name, product_code, external_product_instance_id }`. Ids are strings; amounts and `quantity` are numeric strings. |
| refunds | array | Transactions whose `original_transaction_id` is this one, ordered by time: `{ transaction_id, external_transaction_id, transaction_type_code, transaction_status, net_amount, currency_code, transaction_at }` |
| cases | array | Service cases with `related_transaction_id` = this one: `{ case_id, external_case_id, received_at }` |
| points | array | Point events with `related_transaction_id` = this one: `{ point_event_id, points_delta (string), occurred_at, event_code }` |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "transaction": { "transaction_id": "30211", "project_id": 4, "external_transaction_id": "E20260928-0042", "transaction_type_code": "SALE", "transaction_status": "COMPLETED", "currency_code": "USD", "net_amount": "120.0000", "reporting_net_amount": "120.0000", "transaction_at": "2026-09-28T11:02:00.000Z", "project_code": "ESHOP", "project_name": "Eshop", "service_center_name": null, "original_external_id": null, "...": "other crm_transaction columns" },
    "parties": [ { "transaction_party_id": "40112", "transaction_id": "30211", "party_pk": "1042", "party_role_code": "BUYER", "created_at": "2026-10-01T03:00:00.000Z", "party_name": "Bat-Erdene D." } ],
    "items": [ { "transaction_item_id": "70001", "transaction_id": "30211", "product_id": "301", "product_instance_id": null, "external_item_id": "E20260928-0042:0", "quantity": "1.0000", "unit_price": "120.0000", "gross_amount": "120.0000", "discount_amount": "0.0000", "net_amount": "120.0000", "created_at": "2026-10-01T03:00:00.000Z", "product_name": "Wireless earbuds", "product_code": "goods:5521", "external_product_instance_id": null } ],
    "refunds": [],
    "cases": [],
    "points": []
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `common.isNotAValue` | `id` is not a number |
| 403 | `common.permissionDenied` | no READ on Transactions |
| 404 | `common.notFound` ("not found") | no such transaction |

## 6. Memberships

A membership is a party's current state in one project. A project owns its own tiers, and a membership can only point at a tier of its own project.

### GET /api/admin/crm/memberships

A paged list of memberships, with party, project and tier names.

**Permission:** READ on `/admin/crm/memberships`.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `page`, `limit` | integer | no | 1, 20 | standard paging |
| `sort` | string | no | `membership_id` | `tier_value`, `joined_at` or `available_reward_points`; anything else gives `membership_id` |
| `dir` | string | no | `desc` | `asc` or descending, NULLS LAST either way |
| `project_id` | integer | no | none | exact |
| `current_tier_id` | integer | no | none | exact |
| `membership_status` | string | no | none | exact; `ACTIVE`, `INACTIVE`, `SUSPENDED`, `LEFT` |
| `party_pk` | integer | no | none | exact |
| `q` | string | no | none | Trimmed. `party.display_name ILIKE %q%`, or `party_pk` equal to an all-digit `q`, or `external_member_id ILIKE %q%` |

**Response** `200`: a list envelope with `summary: null`.

| field | type | notes |
|---|---|---|
| membership_id | string | |
| party_pk | string | |
| project_id | integer | |
| external_member_id | string \| null | the member number in the project |
| current_tier_id | integer \| null | |
| tier_value | string \| null | numeric; for the Eshop this is the accumulated value |
| available_reward_points | string \| null | numeric |
| membership_status | string | |
| source_payload | object \| null | the raw record the project sent, for example the Eshop card |
| joined_at, left_at, synced_at, created_at, updated_at | string \| null | |
| party_name | string \| null | |
| project_code, project_name | string | |
| tier_code, tier_name | string \| null | |
| tier_rank | integer \| null | the tier's `rank_no` |
| change_cnt | integer | number of tier-history rows |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      { "membership_id": "8120", "party_pk": "1042", "project_id": 4, "external_member_id": "VIP000123", "current_tier_id": 9, "tier_value": "1520.0000", "available_reward_points": "300.0000", "membership_status": "ACTIVE", "source_payload": { "card_level": 2, "vip_no": "VIP000123" }, "joined_at": "2024-02-11T06:20:00.000Z", "left_at": null, "synced_at": "2026-10-01T03:00:00.000Z", "created_at": "2026-09-01T00:00:00.000Z", "updated_at": "2026-10-01T03:00:00.000Z", "party_name": "Bat-Erdene D.", "project_code": "ESHOP", "project_name": "Eshop", "tier_code": "GOLD", "tier_name": "Gold card", "tier_rank": 2, "change_cnt": 1 }
    ],
    "total": 3120, "page": 1, "limit": 20, "summary": null
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `common.isNotAValue` | non-numeric `project_id`, `current_tier_id` or `party_pk` |
| 403 | `common.permissionDenied` | no READ on Memberships |

### GET /api/admin/crm/memberships/distribution

The number of ACTIVE members on each tier of each project, i.e. each project's own ladder.

**Permission:** READ on `/admin/crm/memberships`.

**Query parameters:** None. Only active tiers (`crm_project_tier.is_active`) are listed. A tier with no ACTIVE members shows `members: 0`. The order is project_id, then `rank_no`.

**Response** `200`: `data` is an array.

| field | type | notes |
|---|---|---|
| project_id | integer | |
| project_code | string | |
| project_tier_id | integer | |
| tier_code, tier_name | string | |
| rank_no | integer \| null | |
| members | integer | ACTIVE memberships currently on this tier |

```json
{ "success": true, "message": "ok", "data": [ { "project_id": 4, "project_code": "ESHOP", "project_tier_id": 8, "tier_code": "SILVER", "tier_name": "Silver card", "rank_no": 1, "members": 2210 }, { "project_id": 4, "project_code": "ESHOP", "project_tier_id": 9, "tier_code": "GOLD", "tier_name": "Gold card", "rank_no": 2, "members": 640 } ] }
```

**Errors:** `403 common.permissionDenied`.

### GET /api/admin/crm/memberships/:id/history

The tier changes of one membership, newest first.

**Permission:** READ on `/admin/crm/memberships`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | integer | `membership_id`. An unknown id returns `[]`, not 404. |

**Response** `200`: `data` is an array.

| field | type | notes |
|---|---|---|
| membership_tier_history_id | string | |
| membership_id | string | |
| old_tier_id | integer \| null | null for the first tier |
| new_tier_id | integer | |
| change_reason | string \| null | e.g. a manager's reason, `Eshop card level reported as 2`, or `First seen by the CRM` |
| changed_at | string | |
| old_tier_name | string \| null | |
| new_tier_name | string | |

```json
{ "success": true, "message": "ok", "data": [ { "membership_tier_history_id": "512", "membership_id": "8120", "old_tier_id": 8, "new_tier_id": 9, "change_reason": "Eshop card level reported as 2", "changed_at": "2026-10-01T03:00:00.000Z", "old_tier_name": "Silver card", "new_tier_name": "Gold card" } ] }
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `common.isNotAValue` | `id` is not a number |
| 403 | `common.permissionDenied` | no READ on Memberships |

### POST /api/admin/crm/memberships/:id/tier

A manager's correction of a member's tier. In one transaction, the change is appended to the tier history and the current tier is set. The membership row is locked while this happens. The change is audited.

**Permission:** WRITE on `/admin/crm/memberships`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | integer | `membership_id` |

**Request body**

| field | type | required | rules |
|---|---|---|---|
| tier_id | integer | yes | A `project_tier_id` of the **same project** as the membership. Whether the tier is active is not checked. If the field is missing, the call fails with 500, because the service runs `where(project_tier_id = undefined)`. |
| reason | string | yes | Must not be blank after trimming. Stored trimmed and cut to 250 characters as the history row's `change_reason`. |

**Response** `200`, message `common.updated` ("updated"): `data` is the updated `crm_membership` row, with the same columns as the list minus the joined names and counts.

```json
{ "success": true, "message": "updated", "data": { "membership_id": "8120", "party_pk": "1042", "project_id": 4, "external_member_id": "VIP000123", "current_tier_id": 10, "tier_value": "1520.0000", "available_reward_points": "300.0000", "membership_status": "ACTIVE", "source_payload": { "card_level": 2 }, "joined_at": "2024-02-11T06:20:00.000Z", "left_at": null, "synced_at": "2026-10-01T03:00:00.000Z", "created_at": "2026-09-01T00:00:00.000Z", "updated_at": "2026-10-11T09:14:02.000Z" } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `crm.common.aReasonIsRequired` ("a reason is required") | `reason` is missing or blank (checked first) |
| 400 | `common.isNotAValue` | `id` or `tier_id` is not a number |
| 403 | `common.permissionDenied` | no WRITE on Memberships |
| 404 | `common.notFound` | no such membership |
| 409 | `crm.memberships.thatTierBelongsToAnotherProject` ("that tier belongs to another project") | the tier does not exist, or belongs to another project |
| 409 | `crm.memberships.alreadyOnThatTier` ("the member is already on that tier") | the tier is already the current one |
| 500 | `common.internalServerError` | `tier_id` missing |

### POST /api/admin/crm/memberships/:id/status

Sets a membership's status. Setting `LEFT` stamps `left_at` with the current time. Any other status clears `left_at` to null. No history row is written, but the change is audited.

**Permission:** WRITE on `/admin/crm/memberships`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | integer | `membership_id` |

**Request body**

| field | type | required | rules |
|---|---|---|---|
| membership_status | string | yes | one of `ACTIVE`, `INACTIVE`, `SUSPENDED`, `LEFT` (exact, case-sensitive) |

**Response** `200`, message `common.updated`: `data` is the updated `crm_membership` row, in the same shape as for `/tier`.

```json
{ "success": true, "message": "updated", "data": { "membership_id": "8120", "party_pk": "1042", "project_id": 4, "membership_status": "LEFT", "left_at": "2026-10-11T09:20:00.000Z", "...": "other crm_membership columns" } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `crm.common.notAStatusYouCanSet` ("not a status that can be set here") | missing or not one of the four |
| 400 | `common.isNotAValue` | `id` is not a number |
| 400 | `common.valueFailedAValidation` | `LEFT` on a membership whose `joined_at` is later than now (CHECK `left_at >= joined_at`) |
| 403 | `common.permissionDenied` | no WRITE on Memberships |
| 404 | `common.notFound` | no such membership |

## 7. Internal departments

A department records where a console manager works. It grants no permissions; roles do that. A role can be marked as meant for one department, and assigning a manager to a different department is then refused. These endpoints sit under the CRM Settings page.

### GET /api/admin/crm/departments/staff

Every console manager that is not deleted, with their role, their department, and the department their role is meant for.

**Permission:** READ on `/admin/crm/settings`.

**Query parameters:** None. The order is `managers.name`, and there is no paging.

**Response** `200`: `data` is an array.

| field | type | notes |
|---|---|---|
| manager_id | integer | `managers.id` |
| username | string | |
| name | string | |
| status | string | `ACTIVE` / `INACTIVE` |
| role_id | integer | |
| role_code, role_name | string | |
| department_id | integer \| null | the manager's department |
| department_code, department_name | string \| null | |
| role_department_id | integer \| null | the department the role is meant for |
| role_department_name | string \| null | |

```json
{ "success": true, "message": "ok", "data": [ { "manager_id": 3, "username": "ana", "name": "Ana Lee", "status": "ACTIVE", "role_id": 5, "role_code": "CRM_SALES", "role_name": "Sales", "department_id": 2, "department_code": "SALES", "department_name": "Sales", "role_department_id": 2, "role_department_name": "Sales" } ] }
```

**Errors:** `403 common.permissionDenied` (no READ on Settings).

### GET /api/admin/crm/departments/roles

Every console role, with the department it is meant for and how many managers hold it.

**Permission:** READ on `/admin/crm/settings`.

**Query parameters:** None. The order is `role_name`.

**Response** `200`: `data` is an array.

| field | type | notes |
|---|---|---|
| role_id | integer | |
| role_code, role_name | string | |
| department_id | integer \| null | |
| department_name | string \| null | |
| manager_cnt | integer | managers with this role, **deleted managers included** |

```json
{ "success": true, "message": "ok", "data": [ { "role_id": 5, "role_code": "CRM_SALES", "role_name": "Sales", "department_id": 2, "department_name": "Sales", "manager_cnt": 4 } ] }
```

**Errors:** `403 common.permissionDenied`.

### PUT /api/admin/crm/departments/staff/:managerId

Puts a manager in a department, or removes them from one. The change is audited.

**Permission:** WRITE on `/admin/crm/settings`.

**Path parameters**

| name | type | notes |
|---|---|---|
| managerId | integer | `managers.id`. Deleted managers are not excluded. |

**Request body**

| field | type | required | rules |
|---|---|---|---|
| department_id | integer \| null | no | A truthy value assigns the manager: an upsert that also sets `assigned_at = now()` and `assigned_by_manager_id` to the caller. Missing, null, `0` or `""` removes the assignment. If the manager's role is marked for a department, the value must equal that department. |

**Response** `200`, message `common.updated`.

| field | type | notes |
|---|---|---|
| manager_id | integer | `Number(managerId)` |
| department_id | integer \| string \| null | echoed back exactly as sent (a string stays a string), or null when cleared |

```json
{ "success": true, "message": "updated", "data": { "manager_id": 3, "department_id": 2 } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `common.isNotAValue` | `managerId` or `department_id` is not a number |
| 403 | `common.permissionDenied` | no WRITE on Settings |
| 404 | `common.notFound` | no such manager |
| 409 | `crm.settings.thatRoleIsForAnotherDepartment` ("the role of that manager is meant for another department") | the manager's role is marked for a different department |
| 409 | `common.referencedRecordIsMissing` | `department_id` does not exist (foreign key) |

### PUT /api/admin/crm/departments/roles/:roleId

Marks the department a role is meant for, or clears the mark. Managers who already hold the role in another department are not checked or changed. The change is audited.

**Permission:** WRITE on `/admin/crm/settings`.

**Path parameters**

| name | type | notes |
|---|---|---|
| roleId | integer | `manager_roles.id` |

**Request body**

| field | type | required | rules |
|---|---|---|---|
| department_id | integer \| null | no | A truthy value sets the mark (upsert). Missing, null, `0` or `""` clears it. |

**Response** `200`, message `common.updated`.

| field | type | notes |
|---|---|---|
| role_id | integer | `Number(roleId)` |
| department_id | integer \| string \| null | echoed back as sent, or null |

```json
{ "success": true, "message": "updated", "data": { "role_id": 5, "department_id": 2 } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `common.isNotAValue` | `roleId` or `department_id` is not a number |
| 403 | `common.permissionDenied` | no WRITE on Settings |
| 404 | `common.notFound` | no such role |
| 409 | `common.referencedRecordIsMissing` | `department_id` does not exist |

## 8. Customers (parties)

A customer is a **party**: one `crm_party` row, plus a `crm_person` row (party_type `PERSON`) or a `crm_organization` row (party_type `ORGANIZATION`). Everything below is under `/api/admin/crm` and guarded by the Customers page, `/admin/crm/customers`.

**Notes for this section.** Ids typed as string below are bigint (returned as strings); `numeric` scores and amounts are strings. Most `:id` routes do not validate the id: a non-numeric id gives `400 common.isNotAValue`, an unknown one `404 common.notFound`. Where a field has a "database" length limit, a longer value is refused by the CRM router's error handler as `400 crm.settings.aValueIsTooLong`.

**Validation problems.** The person/organization checks (`src/services/crm/personRules.js`) collect every problem, not only the first, and throw `400 crm.common.checkTheDetails` ("some details are not valid"). `detail` is then an array of `{ field, message }`. Each problem is built as a key under `crm.problems` (or `crm.customers.*`) with optional params, and the error handler sends it as a sentence in the reader's language (see Errors in Conventions). Example as sent once the keys are in the catalog: `[{ "field": "mobile", "message": "Mobile \"12ab\" is not a phone number" }]`.

**Duplicate scoring.** Several endpoints score how alike two people are (`src/services/crm/personDuplicates.js`). Points are added when a value is present on both sides and equal:

| Evidence | Points | How it is compared |
|---|---|---|
| `phone` | 40 | Any MOBILE/PHONE number shared, compared as digits only (`mobile`, `phone` and the active MOBILE/PHONE contact points) |
| `name` | 25 | `full_name` (or `display_name`): trimmed, inner spaces collapsed, lower-cased, then equal |
| `birth_date` | 25 | Same `YYYY-MM-DD` |
| `location` | 15 | Same `home_location_pk` (the street text `address_line` is not used) |
| `occupation` | 5 | Same `job_title_id` (or `occupation`) |
| `same_user_pk` | the gap to 70 | Excel import only: the same user-management `user_pk` lifts the score to exactly 70 |

The maximum is 110. A score of **70 or more** is decision `MERGE` (the same person). **50 to 69** is `REVIEW` (an administrator decides). **Below 50** is `NEW`, and that match is dropped. Only ACTIVE or INACTIVE persons are candidates. Organizations are never scored.

A scored match (a "candidate") has this shape wherever it is returned:

| field | type | notes |
|---|---|---|
| party_pk | string | The existing customer (absent when the match is a pending registration) |
| intake_id | string | Present instead of `party_pk` when the match is a pending registration intake |
| display_name, full_name | string\|null | |
| gender_code, birth_date, address_line | string\|null | Person fields (customer candidates only) |
| home_location_pk | string\|null | |
| job_title_id | integer\|null | |
| user_pks | array of string | The customer's user-management account ids: linked accounts, plus ids an earlier import listed for them |
| mobile | string\|null | The first active MOBILE/PHONE value, **masked**: first 3 and last 4 characters kept (`"+86*******8000"`) |
| score | integer | Sum of the points |
| evidence | array | `[{ "field": "phone", "points": 40 }, ...]` |
| rule_code | string | Always `WEIGHTED_PERSON` |
| reason | string | Evidence as text, e.g. `"phone +40, name +25"` |
| decision | string | `MERGE`, `REVIEW` (or `NEW`, which is filtered out) |

### GET /api/admin/crm/parties

The customer list: one row per party with its first mobile and email, its projects, counts, and figures from its latest Dream-wide analysis snapshot. Paged.

**Permission:** READ on `/admin/crm/customers`.

**Path parameters:** None.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| page | integer | no | 1 | Page number, at least 1 |
| limit | integer | no | 20 | Rows per page, clamped to 1..200 |
| sort | string | no | `party_pk` | One of `party_pk`, `display_name`, `last_seen_at`, `created_at`, `corporate_score`, `purchase_amount_12m`. Any other value falls back to `party_pk`. Always sorted `NULLS LAST`. There is no secondary sort key. |
| dir | string | no | `desc` | `desc` gives descending. Any other value given gives ascending. |
| q | string | no | | Free-text search, trimmed. See the table below. |
| party_status | string | no | ACTIVE and INACTIVE | Exact status: `ACTIVE`, `INACTIVE`, `MERGED` or `DELETED`. When omitted, merged and deleted parties are hidden. An unknown value returns no rows. |
| party_type | string | no | | `PERSON` or `ORGANIZATION` (exact) |
| corporate_grade_id | integer | no | | The effective grade: the grade set by hand (`assigned_grade_id`) if there is one, otherwise the grade on the latest Dream-wide snapshot |
| activity_status | string | no | | Exact match on the latest snapshot: `NEW`, `ACTIVE`, `AT_RISK`, `LAPSED`, `NEVER_BOUGHT` |
| is_checked_manually | string | no | | `1`: people a manager has marked as checked. `0`: people not yet checked. Any other value is ignored. When set, it matches only persons (organizations have no `crm_person` row). |
| project_id | integer | no | | Only parties with a **linked** account (`unlinked_at IS NULL`) in that project |

How `q` matches. The alternatives below are combined with OR, so a party matches if any of them is true:

| Alternative | Rule |
|---|---|
| Customer number | `party_pk` equals the term exactly, after `%` is removed, surrounding spaces are trimmed and one leading `#` is dropped (`#123` finds party 123). Applies only when the result is a positive integer. |
| Name | `display_name ILIKE '%term%'`. `%` and `_` in the term are not escaped, so they act as wildcards. |
| Phone digits | If the term has 4 or more digits: every non-digit is removed (`"138 0013-8000"` becomes `"13800138000"`), and the result is matched as a substring of any contact point's `normalized_value` (`LIKE '%digits%'`). |
| Text / email | If the lower-cased term contains `@` or a letter: matched as a substring of any contact point's `normalized_value` (`LIKE`, case-sensitive). Emails are stored lower-cased. Other contact types (WeChat id and so on) are stored only trimmed, so for them the case must match. |
| Birthday | Three forms (`services/crm/birthday.js`). **A whole date** from 1900, typed as `1990-05-03`, `1990.5.3`, `1990/05/03`, `19900503`, `03.05.1990` or `03/05/1990` (day first, unless the second part is over 12, as in `05/23/1990`): `crm_person.birth_date` equals it. **A year alone**, `1990` (1900 to this year): `crm_person.birth_year` or the year of `birth_date` equals it, so people known only by their year are found. **A month and day alone**, `05-03`, `03.05` or `5/3`: `birth_date` falls on that day in any year; when both parts could be the month, both readings (3 May and 5 March) are searched. Anything else, or an impossible date, is not treated as a birthday. |
| Account | Any `crm_project_account` where `external_account_id` equals the term exactly (case-sensitive), or `external_login ILIKE term` (whole value, any case). Unlinked accounts are included. |

The contact-point alternatives look at every contact the party has, including INVALID and RETIRED ones.

**Request body:** None.

**Response** `200`: `data` = `{ rows, total, page, limit, summary }`. `summary` is always `null`. Each row:

| field | type | notes |
|---|---|---|
| party_pk | string | |
| party_type | string | `PERSON` or `ORGANIZATION` |
| party_status | string | |
| display_name | string\|null | |
| origin_project_id | integer\|null | |
| origin_project_code | string\|null | |
| first_seen_at, last_seen_at, created_at | string\|null | ISO timestamps |
| mobile | string\|null | First ACTIVE MOBILE contact (primary first, then lowest id), as typed |
| email | string\|null | First ACTIVE EMAIL contact, same rule |
| projects | string\|null | Comma-separated distinct codes of projects with a linked account, e.g. `"ESHOP,PLATFORM"` |
| holding_cnt | integer | Current product registrations (`valid_to IS NULL`) |
| case_cnt | integer | All service cases |
| corporate_score | string\|null | Latest Dream-wide snapshot (numeric) |
| purchase_amount_12m | string\|null | Latest snapshot (numeric) |
| activity_status | string\|null | Latest snapshot |
| transaction_count_12m | integer\|null | Latest snapshot |
| grade_code | string\|null | Code of the effective grade (the grade set by hand, otherwise the computed one) |
| grade_assigned | boolean | true when a grade was set by hand |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      {
        "party_pk": "1042",
        "party_type": "PERSON",
        "party_status": "ACTIVE",
        "display_name": "Li Wei",
        "origin_project_id": 3,
        "origin_project_code": "ESHOP",
        "first_seen_at": "2025-03-14T08:21:00.000Z",
        "last_seen_at": "2026-09-30T11:02:41.000Z",
        "created_at": "2026-02-01T09:00:00.000Z",
        "mobile": "+86 138 0013 8000",
        "email": "li.wei@example.com",
        "projects": "ESHOP,PLATFORM",
        "holding_cnt": 2,
        "case_cnt": 1,
        "corporate_score": "73.5000",
        "purchase_amount_12m": "12890.0000",
        "activity_status": "ACTIVE",
        "transaction_count_12m": 6,
        "grade_code": "GOLD",
        "grade_assigned": false
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "summary": null
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | common.isNotAValue | `corporate_grade_id` or `project_id` is not a number (Postgres `22P02`) |
| 403 | common.permissionDenied | The role cannot read the Customers page |

### POST /api/admin/crm/parties

Registers a new customer from the console. The request goes through the same identity gate as project registrations and imports (`registrationIntake.submit`). Depending on what is already on file, the result is a new customer, the existing customer it matched, or a pending registration that an administrator must resolve.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| party_type | string | no | `PERSON` (default) or `ORGANIZATION`. Any other non-empty value is a problem. |
| origin_project_id | integer | yes | Must be an **ACTIVE** project. If it is missing, `detail` has `{ field: "origin_project_id", message: "crm.customers.chooseTheOriginProject" }`. A project that does not exist adds "Project does not exist". |
| display_name | string | one name required | At least one of `display_name`, `full_name`, `legal_name`, `trading_name` must be non-blank (`crm.problems.nameIsRequired`). Each is at most 250 characters (checked after trimming). The stored name is `display_name`; otherwise `full_name` for a person, or `trading_name`, then `legal_name`, for an organization. It is cut to 250 characters. |
| full_name | string | no | Person. Defaults to the stored name. |
| mobile | string | no | 7 to 15 digits once non-digits are removed, and no letters. Stored as a MOBILE contact point (primary) with `source_project_id` = the origin project. |
| email | string | no | Must look like `a@b.c`. Stored as an EMAIL contact point (primary). |
| gender_code | string | no | Person: `M`, `F`, `OTHER` or `UNKNOWN`. The problem key is `crm.problems.genderMustBeMOrF` even though four values are accepted. |
| birth_date | string | no | Person: `YYYY-MM-DD`, a real day, from 1900 to today. Sets `birth_year` from it. |
| birth_year | integer | no | Person: 1900 to the current year. Overwritten when `birth_date` is given. |
| job_title_id | integer | no | Person: must be on the job title list and active |
| home_location_pk | integer | no | Person: must be on the location list |
| address_line | string | no | Person: at most 255 characters |
| legal_name, trading_name | string | no | Organization: at most 250 characters |
| registration_number | string | no | Organization: at most 100 characters |
| website_url | string | no | Organization: must start with `http://` or `https://` and contain a dot |
| founded_date | string | no | Organization: same date rule as `birth_date` |
| employee_count_band | string | no | Organization: `1-10`, `11-50`, `51-200`, `201-1000`, `1001-5000` or `5001+` |
| organization_status, local_name, description, headquarters_address | string | no | Organization: stored as given (`headquarters_address` column max 255) |
| location_pk | integer | no | Organization: validated against the location list, **but not saved**. The saved column list names `location_id`, which the table no longer has (it is `location_pk`). |
| location_id | any | no | Organization: appears to cause a database error (500), because the column does not exist |

An empty string in a stored field is saved as `null`.

**What happens.** Organizations are always created. For a person, every customer and pending person registration scoring 50 or more is a candidate (see the scoring table above):

| Candidates | Result `outcome` | Effect |
|---|---|---|
| None | `CREATED` | A new party is created with its person row and contacts |
| Exactly one scores 70 or more, and it is a customer (not a pending registration) | `MERGED` | No new party. Person fields that are empty on the existing customer are filled from the form, new phone/email contacts are added, and that customer is returned. |
| Anything else | `QUEUED` | Nothing is created. A pending registration intake holds the form and its candidates for review under identity intakes. |

Every console submission gets a random source id, so sending the same form twice registers twice.

**Response** `200`, message `common.created`. `data` is one of the following.

For `CREATED` or `MERGED`: the `crm_party` row (without `party_id`) plus `intake_id` and `outcome`.

| field | type | notes |
|---|---|---|
| party_pk | string | The new customer, or the matched one |
| party_type, party_status, display_name | string | |
| origin_project_id | integer\|null | |
| merged_into_party_pk | string\|null | |
| first_seen_at, last_seen_at, deleted_at, created_at, updated_at | string\|null | |
| assigned_grade_id | integer\|null | |
| assigned_grade_reason, assigned_grade_at | string\|null | |
| assigned_grade_by_manager_id | integer\|null | |
| intake_id | string | The registration intake that recorded this submission |
| outcome | string | `CREATED` or `MERGED` |

For `QUEUED`: `{ intake_id, party_pk: null, outcome: "QUEUED", candidates: [candidate, ...] }`. The candidates are sorted by score, highest first.

```json
{
  "success": true,
  "message": "created",
  "data": {
    "party_pk": "1043",
    "party_type": "PERSON",
    "party_status": "ACTIVE",
    "display_name": "Wang Fang",
    "origin_project_id": 3,
    "merged_into_party_pk": null,
    "first_seen_at": "2026-10-11T07:15:02.113Z",
    "last_seen_at": null,
    "deleted_at": null,
    "created_at": "2026-10-11T07:15:02.113Z",
    "updated_at": "2026-10-11T07:15:02.113Z",
    "assigned_grade_id": null,
    "assigned_grade_reason": null,
    "assigned_grade_at": null,
    "assigned_grade_by_manager_id": null,
    "intake_id": "88",
    "outcome": "CREATED"
  }
}
```

```json
{
  "success": true,
  "message": "created",
  "data": {
    "intake_id": "89",
    "party_pk": null,
    "outcome": "QUEUED",
    "candidates": [
      {
        "party_pk": "1042", "display_name": "Li Wei", "full_name": "Li Wei", "gender_code": "M",
        "birth_date": "1988-05-17", "address_line": "18 Tianhe Road", "home_location_pk": "4401",
        "job_title_id": 2, "user_pks": ["500245"], "mobile": "+86*******8000",
        "score": 65, "evidence": [{ "field": "phone", "points": 40 }, { "field": "name", "points": 25 }],
        "rule_code": "WEIGHTED_PERSON", "reason": "phone +40, name +25", "decision": "REVIEW"
      }
    ]
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | crm.common.checkTheDetails | Any validation problem, including a missing or inactive origin project. `detail` lists `{ field, message }`. |
| 400 | crm.customers.contactValueIsRequired | The mobile/email normalises to nothing |
| 403 | common.permissionDenied | No write access |

### GET /api/admin/crm/parties/similar

Customers already on file who look like the person being typed into the "new customer" form. It writes nothing.

**Permission:** READ on `/admin/crm/customers`.

**Path parameters:** None.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| full_name | string | no | | Compared for `name` (trimmed, spaces collapsed, any case, exact) |
| display_name | string | no | | Used for the name when `full_name` is absent |
| birth_date | string | no | | `YYYY-MM-DD`, exact |
| mobile | string | no | | Digits compared |
| phone | string | no | | Digits compared |
| home_location_pk | integer | no | | Equal location id |
| job_title_id | integer | no | | Equal job title (`occupation` is accepted instead) |
| user_pk | string | no | | Only used for finding candidates. Without the Excel rule it adds no points. |
| exclude_party_pk | string | no | | Leave this party out (for an edit form) |

Candidates are fetched by exact (normalised) name, birthday, phone digits or user_pk, and then scored. If none of name, birthday, phone or user_pk is given, the result is an empty array.

**Request body:** None.

**Response** `200`: `data` is an array of candidates (shape above) with a score of 50 or more. It is sorted by score (highest first), then by `party_pk` compared as text. It is not paged and has no cap.

```json
{
  "success": true,
  "message": "ok",
  "data": [
    {
      "party_pk": "1042", "display_name": "Li Wei", "full_name": "Li Wei", "gender_code": "M",
      "birth_date": "1988-05-17", "address_line": "18 Tianhe Road", "home_location_pk": "4401",
      "job_title_id": 2, "user_pks": [], "mobile": "+86*******8000",
      "score": 90, "evidence": [{ "field": "phone", "points": 40 }, { "field": "name", "points": 25 }, { "field": "birth_date", "points": 25 }],
      "rule_code": "WEIGHTED_PERSON", "reason": "phone +40, name +25, birth_date +25", "decision": "MERGE"
    }
  ]
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 403 | common.permissionDenied | No read access |

### GET /api/admin/crm/parties/:id

Everything about one customer, for the customer record. Merged and deleted parties are returned too; there is no status filter.

**Permission:** READ on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | string | `party_pk` |

**Query parameters:** None.

**Request body:** None.

**Response** `200`: `data` is an object. Lists are capped as noted.

| field | type | notes |
|---|---|---|
| party | object | `crm_party.*` without `party_id`, plus `origin_project_code` and `origin_project_name` |
| person | object\|null | `crm_person.*` (`full_name`, `gender_code`, `birth_date`, `birth_year`, `job_title_id`, `home_location_pk`, `address_line`, `is_checked_manually`, timestamps) plus `home_location_name` ("Province / City / District") and `job_title_name` |
| organization | object\|null | `crm_organization.*` plus `location_name` and `location_full_name` |
| contacts | array | Every contact point (`contact_point_id`, `contact_type`, `contact_value`, `normalized_value`, `label`, `is_verified`, `is_primary`, `status`, `source_project_id`, `valid_from`, `valid_to`, timestamps), plus `source_project_code`. Sorted by status, type, then primary first. |
| accounts | array | `crm_project_account.*` plus `project_code` and `project_name`, including unlinked accounts |
| memberships | array | `crm_membership.*` plus `project_code`, `tier_code`, `tier_name` |
| holdings | array | Up to 100 product registrations, current ones first, with product, serial, IMEI, class and relationship names |
| transfers | array | Up to 50 product transfers from or to the party, with `from_name` and `to_name` |
| cases | array | Up to 50 service cases, newest first, with type, status and centre names |
| point_accounts | array | Point balances per point type |
| point_events | array | Last 30 point events |
| targets | array | Up to 50 event entries |
| reservations | array | Up to 50 event reservations |
| awards | array | Up to 50 event awards |
| activities | array | Last 30 service-centre activities |
| consents | array | One row per **enabled** communication option of every project. The consent fields (`party_communication_consent_id`, `consent_status`, `captured_at`, `captured_via`, `contact_point_id`, `contact_value`) are null where the customer has not answered. Also `project_communication_option_id`, `consent_required`, `project_code`, `purpose_code`, `purpose_name`, `channel_code`, `channel_name`. |
| segments | array | Current segment memberships (`segment_id`, `segment_code`, `segment_name`, `matched_at`) |
| class_stats | array | Per product class statistics |
| merges | array | Merge history where the party survived or was merged |
| snapshot | object\|null | Latest Dream-wide analysis snapshot plus `grade_code` and `grade_name` |
| analysis | object | `{ history, latest, metrics }`. `history`: up to 24 Dream-wide snapshots. `latest`: the newest snapshot per scope (Dream-wide and each project). `metrics`: the newest value of each metric per scope. |
| organization_links | object | `{ types, industries, people, employers }` (see Organizations) |
| transactions | array | Up to 50 transactions where the party is BUYER, newest first |
| tier_history | array | Up to 30 membership tier changes |
| audit | array | Up to 50 audit entries for this party, its contacts, accounts, memberships and consents (`id`, `manager_name`, `entity`, `entity_pk`, `action`, `changed`, `created_at`) |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "party": { "party_pk": "1042", "party_type": "PERSON", "party_status": "ACTIVE", "display_name": "Li Wei", "origin_project_id": 3, "origin_project_code": "ESHOP", "origin_project_name": "E-shop", "merged_into_party_pk": null, "assigned_grade_id": null, "created_at": "2026-02-01T09:00:00.000Z" },
    "person": { "party_pk": "1042", "full_name": "Li Wei", "gender_code": "M", "birth_date": "1988-05-17", "birth_year": 1988, "job_title_id": 2, "home_location_pk": "4401", "address_line": "18 Tianhe Road", "is_checked_manually": false, "home_location_name": "Guangdong / Guangzhou / Tianhe", "job_title_name": "Engineer" },
    "organization": null,
    "contacts": [{ "contact_point_id": "5310", "contact_type": "MOBILE", "contact_value": "+86 138 0013 8000", "normalized_value": "+8613800138000", "is_primary": true, "status": "ACTIVE", "source_project_code": "ESHOP" }],
    "accounts": [], "memberships": [], "holdings": [], "transfers": [], "cases": [],
    "point_accounts": [], "point_events": [], "targets": [], "reservations": [], "awards": [], "activities": [],
    "consents": [], "segments": [], "class_stats": [], "merges": [], "snapshot": null,
    "analysis": { "history": [], "latest": [], "metrics": [] },
    "organization_links": { "types": [], "industries": [], "people": [], "employers": [] },
    "transactions": [], "tier_history": [], "audit": []
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | common.isNotAValue | `id` is not a number |
| 404 | common.notFound | No such party |

### PUT /api/admin/crm/parties/:id

Edits a customer's name and person or organization fields. Only the fields that are sent are checked and changed.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | string | `party_pk` |

**Query parameters:** None.

**Request body.** The same fields and rules as POST /parties, in update mode:

| field | type | required | rules |
|---|---|---|---|
| display_name | string | no | If sent, it cannot be blank. At most 250 characters. Written to `crm_party.display_name`. It does not change `full_name`. |
| full_name, gender_code, birth_date, birth_year, job_title_id, home_location_pk, address_line | | no | Person only, same rules as on create. A job title that has since been switched off may be kept if it is the person's current one. `birth_date` also sets `birth_year`. |
| legal_name, trading_name, registration_number, website_url, founded_date, organization_status, local_name, description, employee_count_band, headquarters_address | | no | Organization only, same rules as on create |
| location_pk / location_id | | no | Organization: same caveat as on create (`location_pk` is validated but not saved; `location_id` appears to give a 500) |

Fields that belong to the other party type are ignored. `''` is stored as `null`.

**Response** `200`, message `common.updated`. `data` is the updated `crm_party` row: the same fields as in the POST /parties result, plus `party_id` (always null in phase 1), and no `intake_id` or `outcome`.

```json
{ "success": true, "message": "updated", "data": { "party_pk": "1042", "party_id": null, "party_type": "PERSON", "party_status": "ACTIVE", "display_name": "Li Wei", "origin_project_id": 3, "merged_into_party_pk": null, "updated_at": "2026-02-01T09:00:00.000Z" } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | crm.common.checkTheDetails | Validation problems, listed in `detail` |
| 404 | common.notFound | No such party |
| 409 | crm.common.thisPartyWasMerged | The party is MERGED ("this customer was merged into another one") |

### POST /api/admin/crm/parties/:id/status

Sets a customer ACTIVE or INACTIVE.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | string | `party_pk` |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| party_status | string | yes | `ACTIVE` or `INACTIVE` |

**Response** `200`, message `common.updated`. `data` is the updated `crm_party` row (without `party_id`).

```json
{ "success": true, "message": "updated", "data": { "party_pk": "1042", "party_type": "PERSON", "party_status": "INACTIVE", "display_name": "Li Wei" } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | crm.common.notAStatusYouCanSet | Any other status |
| 404 | common.notFound | No such party |
| 409 | crm.common.thisPartyWasMerged | The party is MERGED |

### PUT /api/admin/crm/parties/:id/grade

Gives the customer a corporate grade by hand, or clears it. While it is set, this grade is used in place of the computed one by the record, the list (`grade_code`, the `corporate_grade_id` filter), segments and event eligibility.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | string | `party_pk` |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| corporate_grade_id | integer\|null | no | Must be an active grade. `null`, `''` or absent clears the grade (and its reason, time and manager). |
| reason | string | no | Trimmed and cut to 500 characters. Empty becomes null. Ignored when clearing. |

**Response** `200`, message `common.updated`. `data` is the updated `crm_party` row (without `party_id`), with `assigned_grade_id`, `assigned_grade_reason`, `assigned_grade_at` and `assigned_grade_by_manager_id` set.

```json
{ "success": true, "message": "updated", "data": { "party_pk": "1042", "party_status": "ACTIVE", "assigned_grade_id": 2, "assigned_grade_reason": "Key account agreed with sales", "assigned_grade_at": "2026-10-11T07:20:00.000Z", "assigned_grade_by_manager_id": 7 } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | crm.customers.chooseAGrade | The grade does not exist or is inactive ("choose one of the active corporate grades") |
| 404 | common.notFound | No such party |
| 409 | crm.common.thisPartyWasMerged | The party is MERGED |

### POST /api/admin/crm/parties/:id/checked

Marks a person as reviewed by hand by a manager, or takes the mark back. Who did it and when is recorded only in the audit log.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | string | `party_pk` of a person |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| is_checked_manually | boolean | no | Only the JSON value `false` clears the mark. Anything else, including an absent field, sets it. |

**Response** `200`, message `common.updated`. `data` is the updated `crm_person` row.

```json
{ "success": true, "message": "updated", "data": { "party_pk": "1042", "full_name": "Li Wei", "gender_code": "M", "birth_date": "1988-05-17", "birth_year": 1988, "job_title_id": 2, "home_location_pk": "4401", "address_line": "18 Tianhe Road", "is_checked_manually": true } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | common.notFound | No person with that id (organizations have no person row) |

### POST /api/admin/crm/parties/:id/contacts

Adds a contact point to a customer.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | string | `party_pk` |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| contact_type | string | yes | `EMAIL`, `MOBILE`, `PHONE`, `SIM_CID`, `WECHAT_ID`, `WHATSAPP` or `PUSH_TOKEN` (any case) |
| contact_value | string | yes | At most 500 characters. EMAIL must look like `a@b.c`. MOBILE and PHONE need 7 to 15 digits and no letters. Stored trimmed. `normalized_value` keeps only the digits (plus a leading `+`) for MOBILE, PHONE and SIM_CID, is lower-cased for EMAIL, and is trimmed for other types. |
| label | string | no | At most 50 characters (database limit) |
| is_verified | boolean | no | Default false |
| is_primary | boolean | no | When true, the other contacts of the same type stop being primary |
| source_project_id | integer | no | Not checked here. A missing project gives a foreign-key error. |

The party's status is not checked, so a merged party can still be given a contact.

**Response** `200`, message `common.created`. `data` is the new `crm_contact_point` row.

| field | type | notes |
|---|---|---|
| contact_point_id, party_pk | string | |
| contact_type, contact_value, normalized_value | string | |
| label | string\|null | |
| is_verified, is_primary | boolean | |
| status | string | `ACTIVE` |
| source_project_id | integer\|null | |
| valid_from, valid_to, created_at, updated_at | string\|null | |

```json
{ "success": true, "message": "created", "data": { "contact_point_id": "5311", "party_pk": "1042", "contact_type": "EMAIL", "contact_value": "Li.Wei@Example.com", "normalized_value": "li.wei@example.com", "label": null, "is_verified": false, "is_primary": true, "status": "ACTIVE", "source_project_id": null, "valid_from": "2026-10-11T07:22:00.000Z", "valid_to": null, "created_at": "2026-10-11T07:22:00.000Z", "updated_at": "2026-10-11T07:22:00.000Z" } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | crm.common.checkTheDetails | The type or value is invalid. `detail` is `[{ field: "contact_value", message }]`. |
| 404 | common.notFound | No such party |
| 409 | crm.customers.thisContactIsAlready | The party already has this type and normalised value. When `is_primary` was true, the other contacts of that type have already lost their primary flag by this point; that change is not rolled back. |
| 409 | common.referencedRecordIsMissing | `source_project_id` does not exist |

### PUT /api/admin/crm/parties/:id/contacts/:contactId

Edits one contact point of the customer. The contact type cannot be changed.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | string | `party_pk` |
| contactId | string | `contact_point_id`. It must belong to this party. |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| contact_value | string | no | Validated for the contact's existing type, as on add. It is re-normalised. |
| label | string | no | Empty becomes null |
| is_verified | boolean | no | |
| status | string | no | `ACTIVE`, `INVALID` or `RETIRED`. A status other than ACTIVE also clears `is_primary` and sets `valid_to` to now. |
| is_primary | boolean | no | `true`: this contact becomes the only primary of its type. `false`: it is no longer primary. |

**Response** `200`, message `common.updated`. `data` is the updated contact row (same shape as above).

```json
{ "success": true, "message": "updated", "data": { "contact_point_id": "5311", "party_pk": "1042", "contact_type": "EMAIL", "contact_value": "li.wei@example.com", "normalized_value": "li.wei@example.com", "is_primary": false, "status": "RETIRED", "valid_to": "2026-10-11T07:25:00.000Z" } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | crm.common.checkTheDetails | The new value is invalid (`detail` names `contact_value`) |
| 400 | crm.customers.contactValueIsRequired | The value normalises to nothing |
| 400 | crm.common.notAStatusYouCanSet | Unknown status |
| 404 | common.notFound | The contact does not exist on this party |
| 409 | crm.customers.thisContactIsAlready | The new value duplicates another contact of the same type on the party (unique constraint) |

### POST /api/admin/crm/parties/:id/accounts

Links the customer to an account id issued by a project, by hand (`link_method` `MANUAL`).

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | string | `party_pk` |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| project_id | integer | yes | Must exist (foreign key) |
| external_account_id | string | yes | Trimmed. Max 250 characters (database). |
| external_login | string | no | Max 100 characters (database) |
| external_account_type | string | no | Max 50 characters (database) |
| account_status | string | no | Max 30 characters (database) |
| is_primary | boolean | no | Stored as given. Other accounts are not changed. |

**Response** `200`, message `common.created`. `data` is the new `crm_project_account` row.

| field | type | notes |
|---|---|---|
| project_account_id, party_pk | string | |
| project_id | integer | |
| external_account_id | string | |
| external_login, external_account_type, account_status | string\|null | |
| crystal_user_id | integer\|null | |
| is_primary | boolean | |
| link_method | string | `MANUAL` |
| link_confidence | string\|null | numeric |
| linked_at, unlinked_at, source_created_at, source_updated_at, created_at, updated_at | string\|null | |

```json
{ "success": true, "message": "created", "data": { "project_account_id": "731", "party_pk": "1042", "project_id": 3, "external_account_id": "100245", "external_login": "liwei88", "external_account_type": "ESHOP_CUSTOMER", "crystal_user_id": null, "account_status": null, "is_primary": false, "link_method": "MANUAL", "link_confidence": null, "linked_at": "2026-10-11T07:30:00.000Z", "unlinked_at": null } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | crm.customers.projectAndAccountAreRequired | `project_id` or `external_account_id` is missing |
| 404 | common.notFound | No such party |
| 409 | crm.customers.thatAccountIsAlreadyLinked | That project and account id are already linked (to any party) |
| 409 | common.referencedRecordIsMissing | Unknown `project_id` |

### POST /api/admin/crm/parties/:id/accounts/:accountId/unlink

Unlinks an account (sets `unlinked_at`). The row is kept.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | string | `party_pk` |
| accountId | string | `project_account_id`. It must belong to this party. |

**Query parameters:** None.

**Request body:** None.

**Response** `200`, message `common.updated`. `data` is the updated account row, with `unlinked_at` set.

```json
{ "success": true, "message": "updated", "data": { "project_account_id": "731", "party_pk": "1042", "project_id": 3, "external_account_id": "100245", "link_method": "MANUAL", "unlinked_at": "2026-10-11T07:31:00.000Z" } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | common.notFound | The account is not on this party |
| 409 | crm.customers.alreadyUnlinked | The account is already unlinked |

### PUT /api/admin/crm/parties/:id/consents

Records a customer's consent for one project communication option, entered by a manager. The current state is one row per party and option. Every change also writes a `crm_consent_event` with the old and new status, the manager and the reason.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | string | `party_pk` |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| project_communication_option_id | integer | yes | Must exist |
| consent_status | string | yes | `GRANTED`, `DENIED`, `WITHDRAWN` or `NOT_REQUIRED` |
| reason | string | yes | Must not be blank. Trimmed and cut to 255 characters (stored on the event). |
| contact_point_id | string\|null | no | The contact to use. On an update, leaving it out keeps the current one and `null`/`''` clears it. It is not checked to belong to the party. |

**Response** `200`, message `common.updated`. `data` is the `crm_party_communication_consent` row.

| field | type | notes |
|---|---|---|
| party_communication_consent_id, party_pk | string | |
| project_communication_option_id | integer | |
| contact_point_id | string\|null | |
| consent_status | string | |
| is_preferred | boolean | |
| frequency_code | string\|null | |
| captured_via | string | `CONSOLE` |
| captured_at, effective_from, effective_to, created_at, updated_at | string\|null | |

```json
{ "success": true, "message": "updated", "data": { "party_communication_consent_id": "220", "party_pk": "1042", "project_communication_option_id": 5, "contact_point_id": "5310", "consent_status": "WITHDRAWN", "is_preferred": false, "frequency_code": null, "captured_via": "CONSOLE", "captured_at": "2026-10-11T07:35:00.000Z", "effective_from": "2026-10-11T07:35:00.000Z", "effective_to": null } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | crm.customers.notAConsentStatus | Unknown `consent_status` |
| 400 | crm.common.aReasonIsRequired | `reason` is missing or blank |
| 404 | common.notFound | No such party, or no such option |
| 409 | common.referencedRecordIsMissing | `contact_point_id` does not exist |

### POST /api/admin/crm/parties/:id/merge

Merges another party into this one. `:id` is the **survivor**: it keeps its id. The other party is marked `MERGED` with `merged_into_party_pk` set to the survivor. It is not deleted.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | string | `party_pk` of the survivor |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| merged_party_pk | string | yes | The party to merge away. Must differ from `:id`. |
| merge_reason | string | no | Cut to 250 characters |

What moves to the survivor:

- Accounts move and stop being primary.
- Contacts move unless the survivor already has the same type and value.
- Consents move unless the survivor already answered that option.
- Product registrations move. Where both hold the same device the same way, the merged party's copy is ended. Transfers and cases also move.
- Service-centre activities, transactions (unless already on the survivor in the same role), and memberships (unless the survivor is already a member of that project) move.
- Point accounts move. Where the survivor already has an account in that currency, the balance is carried over as two `MERGE_CARRY_OVER` events instead.
- Event entries, reservations and awards move. So do organization-person relationships.
- Empty person fields on the survivor are filled from the merged person.
- Segment memberships of the merged party are ended, and its class statistics are deleted and then recalculated for the survivor.
- Pending duplicate pairs between the two are marked ACCEPTED.
- Registration intakes, pending e-shop proposals and identity resolutions are re-pointed to the survivor.
- `first_seen_at` and `last_seen_at` are widened to cover both parties.

**Response** `200`, message `crm.customers.merged` ("customers merged"). `data` is the `crm_party_merge_history` row.

| field | type | notes |
|---|---|---|
| merge_id, surviving_party_pk, merged_party_pk | string | |
| merge_reason | string\|null | |
| merge_method | string | `MANUAL` |
| match_score | string\|null | Always null here |
| moved_rows | object | Count of rows moved per table, e.g. `{ "crm_contact_point": 1, "crm_point_event": 2 }` |
| platform_merge_log_pk | string\|null | |
| merged_by_manager_id | integer | |
| merged_at | string | |
| merge_metadata | object\|null | |

```json
{ "success": true, "message": "customers merged", "data": { "merge_id": "41", "surviving_party_pk": "1042", "merged_party_pk": "1077", "merge_reason": "Same person, two sign-ups", "merge_method": "MANUAL", "match_score": null, "moved_rows": { "crm_project_account": 1, "crm_contact_point": 1, "crm_party_communication_consent": 0, "crm_product_registration": 1 }, "platform_merge_log_pk": null, "merged_by_manager_id": 7, "merged_at": "2026-10-11T07:40:00.000Z", "merge_metadata": null } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | crm.customers.chooseAnotherPartyToMerge | `merged_party_pk` is missing or equals `:id` |
| 404 | common.notFound | Either party does not exist |
| 409 | crm.common.thisPartyWasMerged | Either party is already MERGED |
| 409 | crm.customers.onlyPartiesOfOneType | A person and an organization |

## 9. Customer import (Excel)

People can be loaded from an Excel sheet. The sheet is read in memory and never stored. Phase 1 loads only complete people who already have an e-shop account and a user-management account. The e-shop and user-management ids in the sheet are **not** linked as accounts. They are kept with the registration and, once the person is resolved, staged as unverified identifiers for an administrator to verify (see identity intakes / unverified accounts). Every valid row goes through the same registration gate as POST /parties. Rows that fail the file check do not stop the others; they are stored in `crm_person_import_error` until they are dismissed.

### GET /api/admin/crm/parties/import/template

Downloads the import template. This is **not** a JSON envelope. The reply is the file itself: `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="crm-customers-template.xlsx"`.

**Permission:** READ on `/admin/crm/customers`.

**Path parameters:** None. **Query parameters:** None. **Request body:** None.

**Response** `200`: an `.xlsx` workbook with four sheets.

1. **Customers**: header row (bold, frozen), two example rows (Li Wei, Wang Fang) that use the first job titles and locations on the lists, and dropdowns on rows 2 to 1001 for Gender (`M,F`), Location ID, Job title ID and Origin project. Required headers end in ` *`. Some headers carry a cell note.
2. **Job titles**: `ID`, `Job title` (active job titles only).
3. **Locations**: `ID` (location_pk), `Location` (full name "Province / City / District"), `Code`.
4. **Projects**: `Code`, `ID`, `Project` (ACTIVE projects).

The columns of the Customers sheet, which are also the headers the import accepts:

| Template header | Required | Accepted header aliases | Content |
|---|---|---|---|
| E-shop PK | yes | `eshop pk`, `eshop user pk` | The e-shop user_pk: a whole number of 1 to 18 digits, not starting with 0 |
| E-shop ID | yes | `eshop id`, `eshop login`, `eshop user id` | E-shop login, at most 100 characters |
| User PK | yes | `user_pk`, `platform pk`, `platform user pk` | User-management user_pk: same rule as E-shop PK |
| User ID | yes | `user_id`, `platform id`, `platform user id`, `platform login` | User-management login, at most 100 characters |
| Full name | yes | `name` | Inner spaces collapsed. At most 250 characters. |
| Gender | yes | | `M`, `MALE`, `男` or `F`, `FEMALE`, `女` (any case) |
| Birthday | yes | `birth date`, `date of birth` | An Excel date, or text `YYYY-M-D` with `-`, `/` or `.`. A real day from 1900 to today. A year alone is refused. |
| Mobile | yes | `phone`, `phone number`, `mobile number` | 7 to 15 digits, no letters |
| Location ID | yes | `location_pk`, `home_location_pk` | A number from the Locations sheet |
| Address | yes | `address line`, `home address` | Inner spaces collapsed. At most 255 characters. |
| Job title ID | no | | A number from the Job titles sheet (an active job title) |
| Origin project | no | `origin project id`, `origin project code`, `origin_project_id`, `project` | An ACTIVE project's ID or code (any case). If empty, the project chosen on the import screen is used. |

Header matching ignores case, whitespace, `_`, `*` and `-`, so `"E-shop PK *"`, `"eshop_pk"` and `"ESHOP PK"` all match. Only the **first** worksheet and its **first** row are read. If two headers match the same column, the first one wins. Other columns are ignored.

**Errors**

| status | message key | when |
|---|---|---|
| 403 | common.permissionDenied | No read access |

### POST /api/admin/crm/parties/import

Uploads a filled-in sheet. With `dry_run` it only reports what would happen and writes nothing. Without it, it runs the import.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters:** None.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| dry_run | string | no | | `1` or `true` gives a preview only. Anything else runs the import. |
| origin_project_id | integer | no | | The default origin project for rows whose Origin project cell is empty. It can also be sent as a form field, which is used first. It must be the **ID** (not the code) of an ACTIVE project. |

**Request body:** `multipart/form-data`.

| field | type | required | rules |
|---|---|---|---|
| file | file | yes | Exactly one file, in the field named `file`. The file name must end in `.xlsx` (only the name is checked). Size limit `config.storage.maxUploadBytes`: env `MAX_UPLOAD_MB`, default **20 MB**. |
| origin_project_id | string | no | As the query parameter |

The sheet must have at least one non-blank row below the header (a row is blank when every known column is empty) and at most **2000** such rows.

**Per-row reasons.** A row can have several reasons, listed in `errors` as sentences in the reader's language. Each reason is stored as a key (or `{ message, params }`) and translated when the rows are sent (`translateRows` /
`translateErrors`); the column names in them are the sheet's own header words and are not translated. The English
sentences below show the meaning; the keys are `crm.customerImport.isRequired` `{column}`,
`crm.customerImport.mustBeAWholeNumber` `{column, value}`, `crm.customerImport.isLongerThan` `{column, max}`,
`crm.customerImport.mustBeANumberFromItsList` `{column, value}`, `crm.customerImport.locationIdIsNotOnTheList` `{id}`,
`crm.customerImport.jobTitleIdIsNotOnTheList` `{id}`, `crm.customerImport.originProjectIsNotActive` `{value}`,
`crm.customerImport.originProjectIsRequired`, `crm.customerImport.birthdayIsRequired`,
`crm.customerImport.alsoOnAnotherRow` `{column, value, row, idColumn}`, and from `personRules.js`
`crm.problems.genderMustBeMOrF`, `crm.problems.birthYearIsOutOfRange`, `crm.problems.mustBeADate`,
`crm.problems.notARealDate`, `crm.problems.isBefore1900`, `crm.problems.isInTheFuture` (each `{label}`) and
`crm.problems.notAPhoneNumber`, `crm.problems.tooManyDigits`, `crm.problems.containsLetters` (each `{label, value}`).

- `E-shop PK is required` / `E-shop PK "x" must be a whole number`
- `E-shop ID is required` / `E-shop ID is longer than 100 characters`
- `User PK is required` / `User PK "x" must be a whole number`
- `User ID is required` / `User ID is longer than 100 characters`
- `Full name is required` / `Full name is longer than 250 characters`
- `Mobile is required` / `Mobile "x" is not a phone number` (fewer than 7 digits) / `... has too many digits` (more than 15) / `... contains letters`
- `Gender must be M or F` / `Gender is required`
- `Birthday must be YYYY-MM-DD` / `Birthday is not a real date` / `Birthday is out of range` / `Birthday year is out of range` / `Birthday is not a date` / `Birthday is required as YYYY-MM-DD` (empty, or a year alone)
- `Location ID "x" must be a number from its list` / `Location ID is required` / `Location ID N is not on the location list`
- `Job title ID "x" must be a number from its list` / `Job title ID N is not on the job list` (inactive job titles count as not on the list)
- `Address is required` / `Address is longer than 255 characters`
- `Origin project "x" is not an active project code or ID` / `Origin project is required: fill the Origin project column or choose a project on the import screen`
- `E-shop PK N is also on row R for a different person or E-shop ID`, and the same with `User PK`. This is added when an otherwise valid row repeats the PK of an earlier valid row, and either its ID differs or the two rows score below 70. A shared User PK by itself scores 70, so for User PK this effectively means the User ID differs.

`values` (on every row of both replies) holds the cleaned values of the fields that passed: `eshop_pk`, `eshop_id`, `user_pk`, `user_id` (strings), `full_name`, `mobile`, `address_line` (always present, possibly `""`), `gender_code`, `birth_date`, `birth_year`, `home_location_pk` (string), `location_label`, `job_title_id`, `job_name`, `origin_project_id`, `origin_project_code`.

`cells` is every column of the row as text, keyed by `eshop_pk`, `eshop_id`, `user_pk`, `user_id`, `full_name`, `gender`, `birth_date`, `mobile`, `location_id`, `address`, `job_title_id`, `origin_project`.

**Response, dry run** `200`, message `common.ok`. `data` is `{ summary, rows }`:

| field | type | notes |
|---|---|---|
| summary.total | integer | Non-blank rows |
| summary.new, .duplicate, .review, .error | integer | Count of each status |
| rows[].row_number | integer | The sheet's own row number (the header is row 1) |
| rows[].status | string | `NEW`, `DUPLICATE`, `REVIEW` or `ERROR` |
| rows[].values | object | See above |
| rows[].errors | array of string | ERROR rows only |
| rows[].cells | object | ERROR rows only |
| rows[].similar | array | Non-error rows: candidates scoring 50 or more, highest first. These are customers on file and pending person registrations (shape above, scored with the Excel user_pk rule), plus earlier rows of the same file as `{ row_number, pending, score, evidence, rule_code, reason, decision }`. An earlier row that matched a customer on file appears as that customer (`party_pk`, `display_name`). |
| rows[].duplicate_of_row | integer | Present when the best match is an earlier row of the file |

How the status is chosen. Each row is compared with what is on file and with the earlier rows as the import would leave them:

- `DUPLICATE`: exactly one match scores 70 or more, and it is a customer on file or an earlier NEW/DUPLICATE row. The row would be merged into it (its phone and user_pk are added).
- `REVIEW`: there is some match, but it is not that single strong match. That covers several strong matches, a strong match with a pending registration or with a row going to review, or only 50 to 69 matches. The row would become a pending registration.
- `NEW`: no match. The row would create a customer.

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "summary": { "total": 3, "new": 1, "duplicate": 1, "review": 0, "error": 1 },
    "rows": [
      { "row_number": 2, "status": "NEW", "similar": [],
        "values": { "eshop_pk": "100245", "eshop_id": "liwei88", "user_pk": "500245", "user_id": "liwei88", "full_name": "Li Wei", "mobile": "+86 138 0013 8000", "gender_code": "M", "birth_date": "1988-05-17", "birth_year": 1988, "home_location_pk": "4401", "location_label": "Guangdong / Guangzhou / Tianhe", "address_line": "18 Tianhe Road", "origin_project_id": 3, "origin_project_code": "ESHOP" } },
      { "row_number": 3, "status": "DUPLICATE", "duplicate_of_row": 2,
        "similar": [{ "row_number": 2, "pending": false, "score": 90, "evidence": [{ "field": "name", "points": 25 }, { "field": "birth_date", "points": 25 }, { "field": "location", "points": 15 }, { "field": "same_user_pk", "points": 25 }], "rule_code": "WEIGHTED_PERSON", "reason": "name +25, birth_date +25, location +15, same_user_pk +25", "decision": "MERGE" }],
        "values": { "eshop_pk": "100246", "user_pk": "500245", "full_name": "Li Wei", "mobile": "13900139001" } },
      { "row_number": 4, "status": "ERROR",
        "errors": ["Gender must be M or F", "Location ID 99999 is not on the location list"],
        "cells": { "eshop_pk": "100391", "eshop_id": "wangfang", "user_pk": "500391", "user_id": "wang.fang", "full_name": "Wang Fang", "gender": "X", "birth_date": "1995-11-03", "mobile": "13900139000", "location_id": "99999", "address": "7 Zhongshan Avenue", "job_title_id": "", "origin_project": "" },
        "values": { "full_name": "Wang Fang", "mobile": "13900139000", "address_line": "7 Zhongshan Avenue" } }
    ]
  }
}
```

**Response, import** `200`, message `common.imported`. `data` is `{ summary, rows }`. The import runs in one transaction under the registration lock, so the duplicate check is redone against the live data and the dry-run verdicts are not reused. Each valid row is submitted as a PERSON registration with its Mobile as a MOBILE contact. Its source id is `excel:<sha256 of the file>:<row number>`, so importing the **same file again** returns the earlier result for each row instead of registering it twice. Failed rows are inserted into `crm_person_import_error`, at most once per file hash and row number.

| field | type | notes |
|---|---|---|
| summary.total | integer | Non-blank rows |
| summary.created | integer | Rows with status `CREATED` |
| summary.duplicate | integer | Rows with status `MERGED` |
| summary.review | integer | Rows with status `REVIEW` |
| summary.error | integer | Rows with status `ERROR` |
| rows[].row_number | integer | |
| rows[].status | string | `CREATED` (new customer), `MERGED` (added to the customer it matched), `REVIEW` (queued as a pending registration) or `ERROR`. When the same file is run again, a row whose earlier registration was decided returns that decision's status, which can be `REJECTED` or `ASSIGNED`. Those statuses are not counted in `summary`. |
| rows[].values | object | See above |
| rows[].errors | array of string | Empty for valid rows |
| rows[].cells | object | Present on every row |
| rows[].party_pk | string\|null | Valid rows: the created or matched customer. `null` for REVIEW. |
| rows[].intake_id | string | Valid rows: the registration intake |
| rows[].similar | array | REVIEW rows: the candidates the registration was queued with |

```json
{
  "success": true,
  "message": "imported",
  "data": {
    "summary": { "total": 3, "created": 1, "duplicate": 1, "review": 0, "error": 1 },
    "rows": [
      { "row_number": 2, "status": "CREATED", "party_pk": "1101", "intake_id": "301", "errors": [], "values": { "full_name": "Li Wei", "user_pk": "500245" }, "cells": { "full_name": "Li Wei", "user_pk": "500245" } },
      { "row_number": 3, "status": "MERGED", "party_pk": "1101", "intake_id": "302", "errors": [], "values": { "full_name": "Li Wei", "user_pk": "500245" }, "cells": { "full_name": "Li Wei", "user_pk": "500245" } },
      { "row_number": 4, "status": "ERROR", "errors": ["Gender must be M or F"], "values": { "full_name": "Wang Fang" }, "cells": { "full_name": "Wang Fang", "gender": "X" } }
    ]
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | crm.common.chooseAFile | No file in the `file` field ("choose a file") |
| 400 | crm.common.thisIsNotAnExcelFile | The file name does not end in `.xlsx`, or the content cannot be read as a workbook |
| 400 | crm.customerImport.theFileHasNoSheet | The workbook has no worksheet |
| 400 | crm.customerImport.requiredColumnsAreMissing | Required headers were not found. `detail` is the array of missing template headers, e.g. `["E-shop PK", "User ID"]`. |
| 400 | crm.customerImport.theFileHasNoRows | No non-blank rows below the header |
| 400 | crm.customerImport.tooManyRows | More than 2000 rows ("a sheet can hold at most 2000 people") |
| 400 | crm.customerImport.chooseAnActiveOriginProject | `origin_project_id` is given but is not the ID of an ACTIVE project |
| 409 | crm.customerImport.noEshopProject | Import only (not dry run): no project has the `ESHOP` identity role |
| 409 | crm.customerImport.noUserManagementProject | Import only: no project has the `USER_MANAGEMENT` identity role |
| 500 | common.internalServerError | The upload breaks a multer limit: file larger than the size limit, more than one file, or a file in a field other than `file`. These errors are not mapped to a 4xx. |

### GET /api/admin/crm/import-errors

The rows of earlier customer imports that failed the file check, with the cells as they were written and every reason.

**Permission:** READ on `/admin/crm/customers`.

**Path parameters:** None.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| status | string | no | `OPEN` | `DISMISSED` lists dismissed rows. Any other value lists open rows. |
| q | string | no | | Trimmed. Matches `file_name ILIKE %q%`, or the text of any cell or reason (`ILIKE %q%`). If `q` is a birthday in one of the forms of GET /parties (a whole date, a year, or a month and day), the Birthday cell (`cells.birth_date`) is also matched against it, year first with `-`, `/` or `.` and optional leading zeros. |
| page | integer | no | 1 | |
| limit | integer | no | 20 | Clamped to 1..**100** |

Sorted by `created_at` descending, then `row_number`. This handler does not use the shared paging helper, so there are no `sort`/`dir` parameters, and the reply has no `summary`.

**Request body:** None.

**Response** `200`: `data` = `{ rows, total, page, limit }`. Each row:

| field | type | notes |
|---|---|---|
| import_error_id | string | |
| batch_hash | string | SHA-256 of the file (64 hex characters) |
| file_name | string\|null | The uploaded file's name |
| row_number | integer | The sheet's row number |
| cells | object | Cell text keyed by column key (as `cells` above) |
| errors | array of string | The reasons |
| status | string | `OPEN` or `DISMISSED` |
| imported_by_manager_id, dismissed_by_manager_id | integer\|null | |
| imported_by | string\|null | Name of the manager who ran the import |
| dismissed_at, created_at | string\|null | |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      { "import_error_id": "57", "batch_hash": "9f2c...e1", "file_name": "october-customers.xlsx", "row_number": 4,
        "cells": { "eshop_pk": "100391", "full_name": "Wang Fang", "gender": "X", "location_id": "99999" },
        "errors": ["Gender must be M or F", "Location ID 99999 is not on the location list"],
        "status": "OPEN", "imported_by_manager_id": 7, "dismissed_by_manager_id": null, "dismissed_at": null,
        "created_at": "2026-10-11T07:50:00.000Z", "imported_by": "Zhang Min" }
    ],
    "total": 1,
    "page": 1,
    "limit": 20
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 403 | common.permissionDenied | No read access |

### POST /api/admin/crm/import-errors/:id/dismiss

Sets a failed import row aside, either because it was fixed and imported again or because it is not wanted.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | string | `import_error_id`. Must be a positive integer. |

**Query parameters:** None. **Request body:** None.

**Response** `200`, message `common.ok`.

```json
{ "success": true, "message": "ok", "data": { "import_error_id": "57", "status": "DISMISSED" } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | common.notFound | The id is not a positive integer, does not exist, or is already dismissed |

## 10. Duplicates

Pairs of existing customers that look like the same person wait in `crm_identity_match_candidate` with status `PENDING`. The scan creates the pairs; accepting a pair merges it.

### GET /api/admin/crm/duplicates

The pending duplicate pairs, newest first.

**Permission:** READ on `/admin/crm/customers`.

**Path parameters:** None.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| page | integer | no | 1 | |
| limit | integer | no | 20 | Clamped to 1..200 |
| q | string | no | | Trimmed. Matches if either party's `party_pk` equals `q` exactly, either party's `display_name ILIKE %q%`, or, when `q` is a birthday in one of the forms of GET /parties (a whole date, a year, or a month and day), either party's date of birth matches it. |

The order is always `created_at` descending; `sort` and `dir` are ignored. Only `PENDING` pairs are listed.

`total` counts all pending pairs that match `q`. The rows themselves need both parties and the incoming project to exist. A pair without an `incoming_party_pk` (not produced by the scan) would be counted but not listed.

**Request body:** None.

**Response** `200`: `data` = `{ rows, total, page, limit, summary: null }`. Each row:

| field | type | notes |
|---|---|---|
| match_candidate_id | string | |
| incoming_project_id | integer | The newer party's origin project (or the PLATFORM project) |
| incoming_external_record_id | string | For scanned pairs, the newer party's `party_pk` |
| incoming_party_pk | string | The newer party. A merge removes this one. |
| candidate_party_pk | string | The older party. It survives an accept. |
| match_rule_code | string | `WEIGHTED_PERSON` |
| match_score | string | numeric, e.g. `"65"` |
| match_status | string | `PENDING` |
| explanation_json | object | `{ "reason": "phone +40, name +25" }` |
| created_at | string | |
| reviewed_at | string\|null | |
| reviewed_by_manager_id | integer\|null | |
| incoming_project_code | string | |
| incoming_name, candidate_name | string\|null | Display names |
| incoming_status, candidate_status | string | Party statuses |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      { "match_candidate_id": "912", "incoming_project_id": 3, "incoming_external_record_id": "1077", "incoming_party_pk": "1077",
        "candidate_party_pk": "1042", "match_rule_code": "WEIGHTED_PERSON", "match_score": "65", "match_status": "PENDING",
        "explanation_json": { "reason": "phone +40, name +25" }, "created_at": "2026-10-10T22:00:00.000Z",
        "reviewed_at": null, "reviewed_by_manager_id": null, "incoming_project_code": "ESHOP",
        "incoming_name": "Li Wei", "incoming_status": "ACTIVE", "candidate_name": "Li  Wei", "candidate_status": "ACTIVE" }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "summary": null
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 403 | common.permissionDenied | No read access |

### POST /api/admin/crm/duplicates/scan

Compares every ACTIVE or INACTIVE person with the people on file and records each pair scoring 50 or more as a pending duplicate. It never merges anything itself, even at 70 or more. Each pair is stored once, with the **older** party (lower `party_pk`) as the candidate and the newer one as incoming. A pair that already exists in any status, including REJECTED, is skipped, so a rejected pair is not proposed again. The whole scan runs in one transaction and can take a while on a large base.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters:** None. **Query parameters:** None. **Request body:** None.

**Response** `200`, message `common.ok`. `data` = `{ found }`, the number of new pairs inserted.

```json
{ "success": true, "message": "ok", "data": { "found": 12 } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 403 | common.permissionDenied | No write access |

### POST /api/admin/crm/duplicates/:id/accept

Accepts a pending pair. The incoming (newer) party is merged into the candidate (older) party, with method `REVIEWED_MATCH` and reason `"Duplicate by WEIGHTED_PERSON"`; everything described under POST /parties/:id/merge applies. The pair is then marked ACCEPTED.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | string | `match_candidate_id` |

**Query parameters:** None. **Request body:** None.

**Response** `200`, message `crm.customers.merged`. `data` is the updated pair row (the `crm_identity_match_candidate` columns only, with `match_status` `ACCEPTED`, `reviewed_at` and `reviewed_by_manager_id`).

```json
{ "success": true, "message": "customers merged", "data": { "match_candidate_id": "912", "incoming_party_pk": "1077", "candidate_party_pk": "1042", "match_rule_code": "WEIGHTED_PERSON", "match_score": "65", "match_status": "ACCEPTED", "explanation_json": { "reason": "phone +40, name +25" }, "reviewed_at": "2026-10-11T08:00:00.000Z", "reviewed_by_manager_id": 7 } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | common.notFound | No such pair, or one of the parties is gone |
| 409 | crm.common.alreadyDecided | The pair is no longer PENDING ("this match has already been decided") |
| 409 | crm.customers.nothingToMerge | The pair has no incoming party |
| 409 | crm.common.thisPartyWasMerged | Either party is already MERGED |
| 409 | crm.customers.onlyPartiesOfOneType | The parties are of different types |

### POST /api/admin/crm/duplicates/:id/reject

Rejects a pending pair: the two customers stay separate. Because the pair row is kept, later scans do not propose it again.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | string | `match_candidate_id` |

**Query parameters:** None. **Request body:** None.

**Response** `200`, message `common.updated`. `data` is the updated pair row, with `match_status` `REJECTED`.

```json
{ "success": true, "message": "updated", "data": { "match_candidate_id": "913", "incoming_party_pk": "1080", "candidate_party_pk": "1050", "match_status": "REJECTED", "reviewed_at": "2026-10-11T08:01:00.000Z", "reviewed_by_manager_id": 7 } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | common.notFound | No such pair |
| 409 | crm.common.alreadyDecided | The pair is no longer PENDING |

## 11. Organizations

An organization is a party with `party_type` `ORGANIZATION`. These endpoints give it types (sales agency, service-centre operator and so on), industries, and people who act for it. They are read back on the customer record under `organization_links`:

- `types`: assignment rows plus `type_code`, `type_name`, `project_code`.
- `industries`: rows plus `industry_code`, `industry_name`.
- `people` and `employers`: relationship rows plus `organization_name`, `person_name`, `project_code` and `roles`, an array of `{ role_code, role_name, department_name, is_primary }` holding the roles that are still current. `people` lists relationships where this party is the organization; `employers` lists them where it is the person.

### POST /api/admin/crm/parties/:id/org-types

Gives an organization a type, Dream-wide or for one project.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | string | `party_pk` of an organization |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| organization_type_id | integer | yes | Not validated in code. A missing value is refused by the database (NOT NULL); an unknown one gives a foreign-key error. |
| project_id | integer | no | Omit or send a falsy value for Dream-wide |

**Response** `200`, message `common.created`. `data` is the new `crm_organization_type_assignment` row.

| field | type | notes |
|---|---|---|
| organization_type_assignment_id, organization_party_pk | string | |
| organization_type_id | integer | |
| project_id | integer\|null | |
| status | string | `ACTIVE` |
| assigned_at | string | |
| ended_at | string\|null | |

```json
{ "success": true, "message": "created", "data": { "organization_type_assignment_id": "18", "organization_party_pk": "2001", "organization_type_id": 2, "project_id": null, "status": "ACTIVE", "assigned_at": "2026-10-11T08:10:00.000Z", "ended_at": null } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | common.isRequired | `organization_type_id` is missing |
| 404 | common.notFound | No such party |
| 409 | crm.customers.onlyForOrganizations | The party is a person ("only an organization can have that") |
| 409 | common.duplicatedValue | The organization already has this type for this project (or Dream-wide). This includes an assignment that was **ended**, so an ended type cannot be assigned again. |
| 409 | common.referencedRecordIsMissing | Unknown type or project |

### POST /api/admin/crm/parties/:id/org-types/:assignmentId/end

Ends a type assignment (status `ENDED`, `ended_at` set to now). Calling it again on an ended assignment moves `ended_at` to the current time. The party's type is not checked.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | string | `party_pk` of the organization |
| assignmentId | string | `organization_type_assignment_id`. It must belong to this organization. |

**Query parameters:** None. **Request body:** None.

**Response** `200`, message `common.updated`. `data` is the updated assignment row.

```json
{ "success": true, "message": "updated", "data": { "organization_type_assignment_id": "18", "organization_party_pk": "2001", "organization_type_id": 2, "project_id": null, "status": "ENDED", "assigned_at": "2026-10-11T08:10:00.000Z", "ended_at": "2026-10-11T08:15:00.000Z" } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | common.notFound | No such assignment on this organization |

### PUT /api/admin/crm/parties/:id/industries

Adds an industry to an organization, or updates it if it is already there (upsert). On insert, `valid_from` is today. On update, `is_primary` is replaced and `valid_to` is cleared.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | string | `party_pk` of an organization |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| industry_id | integer | yes | Not validated in code. It must exist (foreign key). |
| is_primary | boolean | no | When true, every other industry of the organization stops being primary |

**Response** `200`, message `common.updated`. `data` is the `crm_organization_industry` row.

| field | type | notes |
|---|---|---|
| organization_party_pk | string | |
| industry_id | integer | |
| is_primary | boolean | |
| valid_from, valid_to | string\|null | `YYYY-MM-DD` |

```json
{ "success": true, "message": "updated", "data": { "organization_party_pk": "2001", "industry_id": 4, "is_primary": true, "valid_from": "2026-10-11", "valid_to": null } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | common.isRequired | `industry_id` is missing |
| 404 | common.notFound | No such party |
| 409 | crm.customers.onlyForOrganizations | The party is a person |
| 409 | common.referencedRecordIsMissing | Unknown industry |

### DELETE /api/admin/crm/parties/:id/industries/:industryId

Removes an industry from an organization. The row is deleted.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | string | `party_pk` of the organization |
| industryId | integer | `industry_id` |

**Query parameters:** None. **Request body:** None.

**Response** `200`, message `common.deleted`, `data` `null`.

```json
{ "success": true, "message": "deleted", "data": null }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | common.notFound | The organization does not have that industry |

### POST /api/admin/crm/parties/:id/people

Records a person acting for an organization, optionally with roles.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | string | `party_pk` of the organization |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| person_party_pk | string | yes | Must be a PERSON party. It is not checked for presence: leaving it out causes a query-building error (500). |
| contact_role_ids | array of integer, or integer | no | Roles to give (`crm_org_contact_role`). A single value is accepted. The **first** becomes the primary role. Unknown ids give a foreign-key error. |
| department_name | string | no | Stored on every role, max 100 characters |
| project_id | integer | no | Omit for Dream-wide |
| valid_from | string | no | `YYYY-MM-DD`. Default today. Also used as the roles' `valid_from`. |

Adding the same person twice creates a second relationship; there is no uniqueness check.

**Response** `200`, message `common.created`. `data` is the new `crm_organization_person_relationship` row (the roles are not included).

| field | type | notes |
|---|---|---|
| org_person_relationship_id, organization_party_pk, person_party_pk | string | |
| project_id | integer\|null | |
| relationship_status | string | `ACTIVE` |
| valid_from, valid_to | string\|null | `YYYY-MM-DD` |
| created_at, updated_at | string | |

```json
{ "success": true, "message": "created", "data": { "org_person_relationship_id": "64", "organization_party_pk": "2001", "person_party_pk": "1042", "project_id": null, "relationship_status": "ACTIVE", "valid_from": "2026-10-11", "valid_to": null, "created_at": "2026-10-11T08:20:00.000Z", "updated_at": "2026-10-11T08:20:00.000Z" } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | common.notFound | The organization or the person does not exist |
| 409 | crm.customers.onlyForOrganizations | `:id` is a person |
| 409 | crm.customers.onlyForPeople | `person_party_pk` is an organization ("only a person can be added there") |
| 409 | common.referencedRecordIsMissing | Unknown role or project |

### POST /api/admin/crm/parties/:id/people/:relationshipId/end

Ends a relationship: status `ENDED`, `valid_to` today. Its roles that are still open get `valid_to` today as well. `:id` can be either the organization or the person.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | string | `party_pk` of the organization or of the person in the relationship |
| relationshipId | string | `org_person_relationship_id` |

**Query parameters:** None. **Request body:** None.

**Response** `200`, message `common.updated`. `data` is the updated relationship row.

```json
{ "success": true, "message": "updated", "data": { "org_person_relationship_id": "64", "organization_party_pk": "2001", "person_party_pk": "1042", "project_id": null, "relationship_status": "ENDED", "valid_from": "2026-10-11", "valid_to": "2026-10-11" } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | common.notFound | No such relationship involving `:id` |

## 12. Identity intakes (registration review)

Every way a person reaches the CRM (the console's "new customer" form, the Excel import, and a department system calling the Integration API) goes through one gate: `registrationIntake.submit`. It writes a row to `crm_registration_intake` and runs the weighted duplicate check (`personDuplicates.score`) against existing customers and against other still-pending registrations:

| Evidence (exact match) | Points |
|---|---|
| Shares a phone number (digits only, across `mobile`, `phone` and MOBILE/PHONE contacts) | 40 |
| Same name (trimmed, inner spaces collapsed, lower case) | 25 |
| Same date of birth | 25 |
| Same `home_location_pk` | 15 |
| Same `job_title_id` | 5 |
| Excel import only: same user-management `user_pk` (tops the score up to 70) | to 70 |

A total of 70 or more is a match (`MERGE_FROM`), 50-69 needs review (`REVIEW_FROM`), below 50 is ignored. The registration is then:

- **MERGED** when exactly one existing customer scores 70+ (the customer gets the new evidence and the account);
- **QUEUED** (status `PENDING`) when there is any candidate of 50+ that is not a single 70+ customer: several 70+ customers, a 50-69 customer, or a pending registration that scores 50+;
- **CREATED** when there is no candidate at all.

All submissions take one Postgres advisory lock (`pg_advisory_xact_lock(hashtext('crm_identity_registration'))`), so registrations are matched one at a time.

Intake statuses (CHECK on `crm_registration_intake.status`):

| Status | Meaning |
|---|---|
| `PENDING` | Waiting for an administrator. |
| `MERGED` | Linked to a customer who already existed (automatically, or by an administrator). |
| `CREATED` | Became a new customer (automatically, or by an administrator choosing NEW). |
| `ASSIGNED` | Category `ESHOP` only: the department account was linked to a customer. |
| `REJECTED` | Category `ESHOP` only: the proposed assignment was refused. |

Categories: `PERSON` (a person registration) and `ESHOP` (an "assignment review": a department account identifier proposed for one specific customer, staged either from an Excel import's unverified identifiers or by a legacy e-shop link). The pair (`source_project_id`, `source_record_id`, `category`) is unique, so the same account submitted twice returns the first intake.

Whenever an intake is resolved to a customer (MERGED, CREATED or ASSIGNED, automatic or by hand), a row is added to `crm_identity_resolution` for the source project; that is the feed the Integration API exposes (see below).

These routes are inline in `src/routes/crm.routes.js` and reply with `response.ok` directly (not `page()`), so lists have no `summary` key. All ids below are Postgres `bigint` and come back as strings (node-postgres default; the only custom type parser in `src/db/knexfile.js` is for `date`, which is returned as the plain `YYYY-MM-DD` string). `int` columns (`project_id`, `job_title_id`, `reviewed_by_manager_id`) come back as numbers; `timestamptz` columns as ISO strings.

### GET /api/admin/crm/identity-intakes

Lists staged registrations: by default the ones waiting for a decision, or the ones that were merged into an existing customer.

**Permission:** READ on `/admin/crm/customers`.

**Path parameters:** None.

**Query parameters**

| Name | Type | Required | Default | Meaning |
|---|---|---|---|---|
| `status` | string | no | (PENDING) | `RESOLVED` lists intakes with status `MERGED` only. Any other value, or none, lists `PENDING`. CREATED, ASSIGNED and REJECTED intakes are never listed here. |
| `category` | string | no | all | Exact match on `category` (`PERSON` or `ESHOP`). Not validated: another value just returns no rows. |
| `q` | string | no | | Trimmed. Matches if any of: `intake_id` equals q (as text); `party_pk` equals q; `source_record_id` ILIKE `%q%`; the source project's `project_name` ILIKE `%q%`; the whole `payload` JSON as text ILIKE `%q%` (name, phones, emails, address, identifiers...); the `candidates` JSON as text ILIKE `%q%`. If q also reads as a birthday in one of the forms of GET /parties (a whole date, a year alone such as `1990`, or a month and day alone such as `05-03`), it additionally matches `payload.party.birth_date` (and, for a year, `payload.party.birth_year`), or the resolved customer's date of birth. `%` and `_` in q are not escaped. |
| `page` | integer | no | 1 | At least 1. |
| `limit` | integer | no | 20 | Clamped to 1..100 (this route's own paging, not `readPaging`). |

Ordering is fixed: `created_at` descending. There is no `sort`/`dir`.

**Request body:** None.

**Response** `200`: `data` = `{ rows, total, page, limit }`.

| Field | Type | Notes |
|---|---|---|
| `rows[].intake_id` | string | |
| `rows[].source_project_id` | string or null | Project the registration came from. |
| `rows[].source_record_id` | string or null | The department's account id; a random 32-hex string for console/import registrations with no record id. |
| `rows[].category` | string | `PERSON` or `ESHOP`. |
| `rows[].status` | string | `PENDING` or `MERGED` (see filter). |
| `rows[].payload` | object | `{ party, account, unverified_accounts }` exactly as submitted: `party` holds the person fields and `contacts`; `account` is the department account (or null); `unverified_accounts` the identifiers an import listed. |
| `rows[].candidates` | array | Matches found at submission time. A customer candidate carries `party_pk`, `display_name`, `full_name`, `gender_code`, `birth_date`, `address_line`, `home_location_pk`, `job_title_id`, `user_pks`, `mobile` (masked, e.g. `138****8000`), `score`, `evidence` (`[{field, points}]`), `rule_code` (`WEIGHTED_PERSON`), `reason` (e.g. `"phone +40, name +25"`), `decision` (`MERGE`/`REVIEW`/`NEW`). A pending-registration candidate carries `intake_id`, `display_name`, `score`, `evidence`, `rule_code`, `reason`, `decision`. An ESHOP review's candidate is `{ party_pk, display_name, reason }`. |
| `rows[].party_pk` | string or null | Customer it resolved to; null while PENDING. |
| `rows[].reviewed_by_manager_id` | integer or null | Null for automatic resolutions. |
| `rows[].reviewed_at` | string or null | |
| `rows[].created_at` | string | |
| `rows[].project_name` | string or null | Name of the source project. |
| `total` | integer | |
| `page`, `limit` | integer | As applied. |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      {
        "intake_id": "412",
        "source_project_id": "3",
        "source_record_id": "U-88213",
        "category": "PERSON",
        "status": "PENDING",
        "payload": {
          "party": { "party_type": "PERSON", "origin_project_id": 3, "full_name": "Wang Li", "mobile": "13800138000", "birth_date": "1990-05-03", "birth_year": 1990,
                     "contacts": [{ "contact_type": "MOBILE", "contact_value": "13800138000", "source_project_id": 3 }] },
          "account": { "project_id": 3, "external_account_id": "U-88213", "external_login": "wangli" },
          "unverified_accounts": []
        },
        "candidates": [
          { "party_pk": "1031", "display_name": "Wang Li", "full_name": "Wang Li", "birth_date": "1991-02-11", "mobile": "138****8000",
            "score": 65, "evidence": [{ "field": "phone", "points": 40 }, { "field": "name", "points": 25 }],
            "rule_code": "WEIGHTED_PERSON", "reason": "phone +40, name +25", "decision": "REVIEW" }
        ],
        "party_pk": null,
        "reviewed_by_manager_id": null,
        "reviewed_at": null,
        "created_at": "2026-10-10T08:15:02.114Z",
        "project_name": "App Store"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20
  }
}
```

**Errors:** None specific (403 `common.permissionDenied` as for every guarded route).

### GET /api/admin/crm/identity-intakes/:id

Everything a reviewer compares for one staged registration: the incoming person and identifiers, and the same for every candidate (a customer, with its linked accounts and unverified identifiers, or another pending registration).

**Permission:** READ on `/admin/crm/customers`.

**Path parameters**

| Name | Type | Notes |
|---|---|---|
| `id` | string | `intake_id`; must match `^[1-9][0-9]*$`, otherwise 404. |

**Query parameters:** None.

**Request body:** None.

**Response** `200`: `data` is one object.

| Field | Type | Notes |
|---|---|---|
| `intake_id` | string | |
| `category` | string | `PERSON` / `ESHOP`. |
| `status` | string | Any intake status. |
| `created_at` | string | |
| `party_pk` | string or null | |
| `source_project_name` | string or null | |
| `source_record_id` | string or null | |
| `incoming` | object | `{ person, identifiers }` built from the payload (below). |
| `candidates` | array | One entry per stored candidate, in stored order (score descending). |
| `candidates[].party_pk` | string or null | Set for a customer candidate. |
| `candidates[].intake_id` | string or null | Set for a pending-registration candidate. |
| `candidates[].score` | integer | Absent for ESHOP review candidates. |
| `candidates[].reason` | string | Why the candidate was offered, in the reader's language (`registrationIntake.translateCandidates` -> `personDuplicates.reasonOf`). A scored match is spelled out from its `evidence` as `<field> +<points>` joined by commas, the field word translated from `crm.matching.<field>` (falling back to the raw field name, e.g. `phone +40, name +25`, while those keys are missing from the catalog); any other reason is a key such as `crm.registrations.unverifiedProjectAssignment` or `crm.registrations.listedInAnImportedSheet`. The same translation is applied to the candidates in GET /identity-intakes. |
| `candidates[].evidence` | array | `[{ field, points }]`, `[]` if none. |
| `candidates[].display_name` | string or null | |
| `candidates[].party_status` | string or null | Customer candidates only. |
| `candidates[].person` | object or null | Same shape as `incoming.person`; null if the other registration no longer exists. |
| `candidates[].identifiers` | array | For a customer: its linked project accounts (`kind: "LINKED"`), then the unverified identifiers an import listed for it that are not yet linked (`kind: "CANDIDATE"`, plus `review_status`: `PENDING`, `REJECTED`, `ASSIGNED`, `ASSIGNED_ELSEWHERE` or null). For a pending registration: as for `incoming`. |

`person` object (same for incoming and candidates):

| Field | Type | Notes |
|---|---|---|
| `full_name` | string or null | Falls back to `display_name`. |
| `gender_code` | string or null | |
| `birth_date` | string or null | `YYYY-MM-DD`. |
| `birth_year` | integer or null | |
| `phones` | array of string | Distinct. Incoming: `mobile` plus MOBILE/PHONE contacts in the payload. Customer: ACTIVE MOBILE/PHONE contact points, primary first. Unmasked. |
| `emails` | array of string | Same rules for EMAIL. |
| `location_id` | string or null | `home_location_pk` (string from DB; as sent for incoming). |
| `location_name` | string or null | Full place name, e.g. `"Province / City / District"`. |
| `address_line` | string or null | |
| `job_title_name` | string or null | |
| `origin_project_name` | string or null | Incoming: the payload's `origin_project_id`, else the intake's source project. |

`identifiers[]` item: `{ project_id, project_name, account_pk, account_id, kind }` where `account_pk` = `external_account_id`, `account_id` = `external_login` (or null), and `kind` is `INCOMING` (the payload's account), `CANDIDATE` (an unverified identifier) or `LINKED`.

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "intake_id": "412",
    "category": "PERSON",
    "status": "PENDING",
    "created_at": "2026-10-10T08:15:02.114Z",
    "party_pk": null,
    "source_project_name": "App Store",
    "source_record_id": "U-88213",
    "incoming": {
      "person": { "full_name": "Wang Li", "gender_code": null, "birth_date": "1990-05-03", "birth_year": 1990,
                  "phones": ["13800138000"], "emails": [], "location_id": null, "location_name": null,
                  "address_line": null, "job_title_name": null, "origin_project_name": "App Store" },
      "identifiers": [{ "project_id": 3, "project_name": "App Store", "account_pk": "U-88213", "account_id": "wangli", "kind": "INCOMING" }]
    },
    "candidates": [
      {
        "party_pk": "1031", "intake_id": null, "score": 65, "reason": "phone +40, name +25",
        "evidence": [{ "field": "phone", "points": 40 }, { "field": "name", "points": 25 }],
        "display_name": "Wang Li", "party_status": "ACTIVE",
        "person": { "full_name": "Wang Li", "gender_code": "F", "birth_date": "1991-02-11", "birth_year": 1991,
                    "phones": ["13800138000"], "emails": ["li@example.com"], "location_id": "110105",
                    "location_name": "Beijing / Beijing / Chaoyang", "address_line": null, "job_title_name": "Teacher",
                    "origin_project_name": "E-shop" },
        "identifiers": [{ "project_id": 1, "project_name": "E-shop", "account_pk": "7781", "account_id": "li.w", "kind": "LINKED" }]
      }
    ]
  }
}
```

**Errors**

| Status | Message key | When |
|---|---|---|
| 404 | `common.notFound` | `id` not a positive integer, or no such intake. |

### POST /api/admin/crm/identity-intakes/:id/decide

An administrator resolves a PENDING intake: merge it into a customer, register it as a new customer, or (for an ESHOP assignment review) assign or reject it.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| Name | Type | Notes |
|---|---|---|
| `id` | string | `intake_id`. Not format-checked here: a non-numeric id reaches Postgres and fails as 400 `common.isNotAValue`. |

**Query parameters:** None.

**Request body**

| Field | Type | Required | Rules |
|---|---|---|---|
| `action` | string | yes | `MERGE`, `ASSIGN`, `NEW` or `REJECT`. `NEW` is accepted only for a `PERSON` intake; `REJECT` only for an `ESHOP` intake. `MERGE` and `ASSIGN` are interchangeable and work for both categories. Anything else is 400. |
| `party_pk` | string or integer | for MERGE/ASSIGN, unless `candidate_intake_id` is given | Must match `^[1-9][0-9]*$`; must be an ACTIVE or INACTIVE party of type PERSON. |
| `candidate_intake_id` | string or integer | no | MERGE/ASSIGN into whatever customer another intake (typically a pending-registration candidate) has since resolved to. Overrides `party_pk`. That intake must exist and have a `party_pk`. |

What each decision does (all in one transaction, under the registration lock):

| Intake category + action | Resulting status / `outcome` | Effect |
|---|---|---|
| PERSON + `NEW` | `CREATED` | New customer from `payload.party` (party, person row, contacts with the first of each type primary). |
| PERSON + `MERGE`/`ASSIGN` | `MERGED` | Chosen customer. |
| ESHOP + `MERGE`/`ASSIGN` | `ASSIGNED` | Chosen customer. |
| ESHOP + `REJECT` | `REJECTED` | Nothing else; no resolution row. |

For CREATED / MERGED / ASSIGNED the customer then receives: blank person fields filled from the payload (`full_name`, `birth_date`, `birth_year`, `gender_code`, `address_line`, `home_location_pk`, `job_title_id`; existing values are never overwritten); any payload phone/contact the customer does not already have (same type and normalised value); the payload's department account linked in `crm_project_account` with `link_method` `REVIEWED` (primary if the customer has no other active account in that project); each of the payload's unverified identifiers staged as an ESHOP assignment review for this customer. The intake gets `status`, `party_pk`, `reviewed_at`, `reviewed_by_manager_id`, and a `crm_identity_resolution` row is written for the source project. The change is audited against `crm_registration_intake`.

**Response** `200`

For REJECT: `data` = `{ "intake_id": <id as given in the path>, "outcome": "REJECTED" }`.

Otherwise `data` is the customer's `crm_party` row (without `party_id`) plus `intake_id` and `outcome`:

| Field | Type | Notes |
|---|---|---|
| `party_pk` | string | |
| `party_type` | string | `PERSON`. |
| `party_status` | string | |
| `display_name` | string or null | |
| `origin_project_id` | integer or null | |
| `merged_into_party_pk` | string or null | |
| `first_seen_at`, `last_seen_at`, `deleted_at`, `created_at`, `updated_at` | string or null | |
| `intake_id` | string | |
| `outcome` | string | `CREATED`, `MERGED` or `ASSIGNED`. |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "party_pk": "1031", "party_type": "PERSON", "party_status": "ACTIVE", "display_name": "Wang Li",
    "origin_project_id": 1, "merged_into_party_pk": null, "first_seen_at": "2025-03-02T10:00:00.000Z",
    "last_seen_at": null, "deleted_at": null, "created_at": "2025-03-02T10:00:00.000Z", "updated_at": "2026-09-30T04:11:19.507Z",
    "intake_id": "412", "outcome": "MERGED"
  }
}
```

**Errors**

| Status | Message key | When |
|---|---|---|
| 404 | `common.notFound` | No such intake; or the chosen customer does not exist or is MERGED/DELETED. |
| 409 | `crm.common.alreadyDecided` ("this match has already been decided") | Intake is not PENDING. |
| 409 | `crm.registrations.resolveTheMatchingPendingFirst` | `candidate_intake_id` names an intake that does not exist or has no customer yet. |
| 400 | `crm.common.chooseACustomer` | MERGE/ASSIGN with no valid `party_pk`. |
| 400 | `crm.registrations.chooseAPerson` | Chosen customer is an organization. |
| 400 | `crm.registrations.chooseMergeNewOrAssign` | Any other `action`, NEW on an ESHOP intake, or REJECT on a PERSON intake. |
| 409 | `crm.customers.thatAccountIsAlreadyLinked` | The intake's department account is already actively linked to a different customer. |
| 400 | `crm.customers.unknownContactType` / `crm.customers.contactValueIsRequired` | A payload contact cannot be stored. |
| 400 | `common.isNotAValue` | Non-numeric `id`. |

The plain-English messages above are passed through `translate` unchanged (it only looks up dotted keys without spaces).

### GET /api/admin/crm/parties/:id/unverified-accounts

The department identifiers an Excel import listed for this customer but which were not committed as project accounts, each with where its assignment review stands. Shown on the customer record.

**Permission:** READ on `/admin/crm/customers`.

**Path parameters**

| Name | Type | Notes |
|---|---|---|
| `id` | string | `party_pk`; must match `^[1-9][0-9]*$`, otherwise 400 `common.notFound`. The customer's existence is not checked: an unknown id returns `[]`. |

**Query parameters:** None.

**Request body:** None.

Collected from every PERSON intake resolved to this customer whose payload has `unverified_accounts`, oldest intake first; the same project + identifier is listed once (first recorded). Its review is the ESHOP intake with the same project and `source_record_id`, if any.

**Response** `200`: `data` is an array (no paging).

| Field | Type | Notes |
|---|---|---|
| `project_id` | integer or string | As stored in the import payload. |
| `project_name` | string or null | |
| `external_account_id` | string | As stored in the payload. |
| `external_login` | string or null | |
| `recorded_at` | string | `created_at` of the intake that listed it. |
| `registration_intake_id` | string | That intake. |
| `review_intake_id` | string or null | The ESHOP assignment review, if one has been staged. |
| `review_status` | string or null | `PENDING`, `REJECTED`, `ASSIGNED` (to this customer), `ASSIGNED_ELSEWHERE` (assigned to another customer), or null when never staged. |

```json
{
  "success": true,
  "message": "ok",
  "data": [
    { "project_id": 1, "project_name": "E-shop", "external_account_id": "7781", "external_login": "li.w",
      "recorded_at": "2026-09-14T02:00:11.032Z", "registration_intake_id": "388", "review_intake_id": "390", "review_status": "PENDING" }
  ]
}
```

**Errors**

| Status | Message key | When |
|---|---|---|
| 400 | `common.notFound` | `id` is not a positive integer (note: 400, not 404). |

### POST /api/admin/crm/parties/:id/unverified-accounts/decide

Links or rejects one of those identifiers from the customer record. It goes through the same ESHOP assignment review as the intake list: if no review was staged yet, one is staged first, then decided.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| Name | Type | Notes |
|---|---|---|
| `id` | string | `party_pk`; must match `^[1-9][0-9]*$`, otherwise 400 `common.notFound`. |

**Query parameters:** None.

**Request body**

| Field | Type | Required | Rules |
|---|---|---|---|
| `action` | string | yes | `LINK` or `REJECT` (exact, upper case). |
| `project_id` | integer or string | yes | Compared as text with the listed identifier's project. |
| `external_account_id` | string | yes | Compared as text with the listed identifier. |

`LINK` runs the intake decision `{ action: "ASSIGN", party_pk: <id> }`; `REJECT` runs `{ action: "REJECT" }` (see the decide endpoint above for effects). If the review has not been staged and the identifier turns out to be already linked to this customer, nothing is staged and the call fails with 409.

**Response** `200`: same as POST `/identity-intakes/:id/decide`. LINK returns the customer row plus `intake_id` (the review intake) and `outcome: "ASSIGNED"`; REJECT returns `{ intake_id, outcome: "REJECTED" }`.

```json
{
  "success": true,
  "message": "ok",
  "data": { "intake_id": "390", "outcome": "REJECTED" }
}
```

**Errors**

| Status | Message key | When |
|---|---|---|
| 400 | `common.notFound` | `id` is not a positive integer. |
| 400 | `crm.registrations.chooseLinkOrReject` | `action` is neither LINK nor REJECT. |
| 404 | `common.notFound` | The identifier is not among this customer's unverified identifiers. |
| 409 | `crm.common.alreadyDecided` | The review is no longer PENDING (REJECTED, ASSIGNED, ASSIGNED_ELSEWHERE), or the identifier is already linked to this customer. |
| 409 | `crm.customers.thatAccountIsAlreadyLinked` | On LINK, the account is actively linked to a different customer. |

## 13. Customer 360 and engagement

These endpoints sit behind the customer record. They return the figures and cards at the top of the record (the 360 overview), and they handle what staff do with one customer: relate them to other customers, tag them, write notes, keep files, log contacts, send a message, name an account team and keep agreements. A global search box is also here. All of them are guarded by the `/admin/crm/customers` page.

The handlers are `crmController.customer360.*` in `src/controllers/crm.controller.js`. The services are in `src/services/crm/`: `customer360.service.js` (overview), `relationships.service.js` (relationships and tags), `engagement.service.js` (notes, files, interactions, messages), `accountTeam.service.js` (team and agreements) and `search.service.js`.

Rules that apply to every endpoint in this section:

- **Types.** As in the introduction: bigint ids and numeric amounts are strings, `date` columns are `"YYYY-MM-DD"`.
- **Ids in the path.** `:id` is a `crm_party.party_pk`. The code does not check its format, so a non-numeric id fails in Postgres with 22P02 and returns `400 common.isNotAValue`. The same applies to `:noteId`, `:fileId`, `:relationshipId`, `:teamMemberId` and `:agreementId`.
- **Party existence.** Write endpoints check the party first and answer `404 common.notFound` ("not found") if it does not exist. The read lists (notes, files, interactions, team, agreements) do **not** check it: an unknown party gets an empty list. Deleted or merged parties are not refused, except by `GET /search` (which leaves out `DELETED` parties) and `POST /parties/:id/messages` (which needs an `ACTIVE` party).
- **Audit.** Every write records an audit entry against page `/admin/crm/customers`.

### GET /api/admin/crm/search

The single search box for the CRM. It returns up to 5 matches of each kind: customers, orders, products, service cases and campaigns. Every hit except a campaign carries the party it belongs to, so the console can open that customer.

**Permission:** READ on `/admin/crm/customers`.

**Path parameters:** None.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `q` | string | no | `""` | The search term, trimmed. If it is shorter than 2 characters, the reply is five empty arrays and no query runs. `%`, `_` and `\` are escaped, and the term is matched as a substring (`%term%`, case-insensitive). |

What each bucket matches. Each bucket is capped at 5 rows.

| bucket | matches | order |
|---|---|---|
| `customers` | Parties whose `party_status` is not `DELETED`, where any of these is true: `display_name` ILIKE term; `party_pk` equals the term exactly, when the term (after stripping a leading `#`) is a positive integer; any of the party's contact points (any status) has `contact_value` ILIKE term; or, when the term has 4 or more digits, `normalized_value` LIKE `%<digits only>%`. | `ACTIVE` parties first, then `display_name` |
| `orders` | `crm_transaction.external_transaction_id` ILIKE term. The party is the transaction's `BUYER`, which may be null. | `transaction_at` desc |
| `products` | `crm_product_instance` whose `serial_number`, `imei` or `external_product_instance_id` ILIKE term. The party is the current registration holder (`valid_to IS NULL`), which may be null. | not specified |
| `cases` | `crm_service_case` whose `external_case_id` or `title` ILIKE term. | `received_at` desc |
| `campaigns` | `crm_campaign` whose `campaign_name` or `campaign_code` ILIKE term. | `campaign_id` desc |

**Request body:** None.

**Response** `200`. `data` is an object with five arrays. It is not a paged list.

| field | item fields |
|---|---|
| `customers[]` | `party_pk` (string), `display_name`, `party_type` (`PERSON`/`ORGANIZATION`), `party_status` |
| `orders[]` | `transaction_id` (string), `external_transaction_id`, `transaction_at`, `net_amount` (string), `currency_code`, `project_code`, `party_pk` (string or null), `party_name` (string or null) |
| `products[]` | `product_instance_id` (string), `serial_number`, `imei`, `external_product_instance_id`, `product_name`, `party_pk`, `party_name` |
| `cases[]` | `case_id` (string), `external_case_id`, `title`, `received_at`, `party_pk`, `party_name` |
| `campaigns[]` | `campaign_id` (string), `campaign_code`, `campaign_name`, `campaign_status` |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "customers": [{ "party_pk": "1042", "display_name": "Mary Chen", "party_type": "PERSON", "party_status": "ACTIVE" }],
    "orders": [],
    "products": [{ "product_instance_id": "77", "serial_number": "SN-CHEN-0091", "imei": null,
                   "external_product_instance_id": "P-0091", "product_name": "Crystal X2", "party_pk": "1042", "party_name": "Mary Chen" }],
    "cases": [],
    "campaigns": []
  }
}
```

**Errors:** Only the common ones (401/403).

### GET /api/admin/crm/parties/:id/360

The customer record's overview. It returns the header figures, value and RFM, service figures, how the customer can be reached, project accounts, recent activity, people and labels. Organizations get extra blocks: group hierarchy, key contacts, industries and types. All amounts are in the reporting currency (`crm_transaction.reporting_net_amount`).

**Permission:** READ on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string (bigint) | `party_pk` |

**Query parameters:** None.

**Request body:** None.

Terms used in the tables below:

- **Counted transactions** are those whose `transaction_status` is one of `COMPLETED, PAID, DELIVERED, FINISHED, ACCEPTED, DELIVERING, REFUNDED, SUCCESS`, where the party is the `BUYER`.
- **Spend** sums `reporting_net_amount` over counted transactions. A refund's amount lowers spend.
- An **order** is a counted transaction whose type is not `REFUND`, `RETURN` or `REVERSAL`.
- The **snapshot** is the latest project-less row (`project_id IS NULL`) in `crm_party_analysis_snapshot`. The code reads the latest 60 of these rows.

**Response** `200`. `data` top-level keys:

| key | type | notes |
|---|---|---|
| `party_pk` | string | |
| `party_type` | string | `PERSON` or `ORGANIZATION` |
| `profile` | object or null | Person: every `crm_person` column (`party_pk, full_name, gender_code, birth_date, birth_year, job_title_id, home_location_pk, address_line, is_checked_manually, created_at, updated_at`), plus `home_location_name`, `home_full_name` (location path joined with `" / "`) and `job_title_name`. Organization: every `crm_organization` column (`legal_name, trading_name, local_name, registration_number, website_url, founded_date, organization_status, employee_count_band, description, location_pk, headquarters_address, created_at, updated_at`), plus `location_name` and `location_full_name`. Null if the subtype row is missing. |
| `header` | object | The figures across the top. See below. |
| `value` | object | Lifetime value and trends. See below. |
| `rfm` | object or null | Null when there is no snapshot or it has no `score_components`. |
| `service` | object | Service case figures. See below. |
| `reach` | object | Contacts and consent. See below. |
| `accounts` | array | One or more rows per active project. See below. |
| `recent_orders` | array | Last 5 orders. See below. |
| `products` | array | Up to 6 current registrations. |
| `interactions` | array | Last 5 interactions. |
| `campaigns` | array | Last 8 campaign deliveries. |
| `segments` | array | Active segment memberships. |
| `tags` | array | Tags on the customer. |
| `relationships` | array | Relationships seen from this party (plus employers, for a person). |
| `notes` | array | Top 3 notes. |
| `team` | array | Current account team. |
| `agreement` | object or null | The agreement in force. |
| `score_history` | array | Up to 24 snapshots, oldest first. |
| `hierarchy` | object | Organizations only. |
| `key_contacts` | array | Organizations only. |
| `industries` | array | Organizations only. |
| `organization_types` | array | Organizations only. |
| `projects_active` | integer | Organizations only. The number of `accounts` rows with `last_activity_at` within the last 365 days. |
| `projects_total` | integer | Organizations only. The number of `accounts` rows. |

**`header`**

| field | type | notes |
|---|---|---|
| `grade_code`, `grade_name` | string or null | The manually assigned grade if there is one (`crm_party.assigned_grade_id`), otherwise the snapshot's grade. |
| `grade_since` | string or null | Assigned grade: `crm_party.assigned_grade_at` (timestamp). Computed grade: the `reference_date` of the oldest snapshot in the unbroken run of recent snapshots with the same grade (date). |
| `grade_assigned` | boolean | True when a manual grade applies. |
| `assigned_grade_id` | integer or null | |
| `assigned_grade_reason` | string or null | |
| `assigned_grade_by` | string or null | Name of the manager who assigned the grade. |
| `computed_grade_code`, `computed_grade_name` | string or null | From the snapshot, even when a manual grade overrides it. |
| `corporate_score` | string or null | numeric(12,4), from the snapshot. |
| `activity_status` | string or null | From the snapshot. |
| `reference_date` | string or null | The snapshot's date. |
| `lifetime_spend` | number | Rounded to 2 decimals. |
| `orders_total`, `orders_12m`, `orders_24m` | integer | Order counts: all time, last 12 months, last 24 months. |
| `products_registered` | integer | Current registrations (`valid_to IS NULL`). |
| `open_cases`, `total_cases` | integer | Same values as in `service`. |

**`value`**

| field | type | notes |
|---|---|---|
| `lifetime_value` | number | The same value as `header.lifetime_spend`. |
| `spend_12m` | number | Spend over the last 12 months. |
| `spend_trend_pct` | number or null | Percent change of the last 12 months against the 12 months before, to 1 decimal. If the earlier figure is 0, the value is `null` when the current figure is non-zero and `0` when both are 0. The other `*_trend_pct` fields follow the same rule. |
| `average_order_value` | number or null | Lifetime spend divided by `orders_total`. |
| `average_order_trend_pct` | number or null | Average order over the last 12 months against the 12 months before. |
| `purchase_frequency_per_year` | number or null | `orders_total` divided by the years since the first counted transaction (minimum 1 year), to 1 decimal. Null if there has never been a transaction. |
| `frequency_trend_pct` | number or null | `orders_12m` against the 12 months before. |
| `orders_24m` | integer | |
| `orders_24m_trend_pct` | number or null | The last 24 months against months 25 to 48. |
| `last_order_at` | string or null | The latest order's `transaction_at`. |
| `monthly` | array | Always 12 items, oldest first: `{ month: "YYYY-MM", amount: number }`. |
| `yearly` | array | Organizations: 5 items for the current year and the 4 before, `{ year: integer, amount: number }`. Persons: `[]`. |

**`rfm`**

`recency` = `score_components.recency / 15 × 100`, `frequency` = `score_components.frequency / 15 × 100`, `monetary` = `score_components.value / 40 × 100`, each rounded. `score` is the rounded mean of the three. All four are integers.

**`service`**

| field | type | notes |
|---|---|---|
| `total_cases` | integer | All of the party's cases. |
| `open_cases` | integer | Cases whose status is not terminal. |
| `resolved_cases` | integer | Cases with status code `CLOSED`. |
| `total_interactions` | integer | The `crm_party_interaction` row count plus `total_cases`. |
| `avg_response_hours` | number or null | `first_response_at − received_at`, to 1 decimal. |
| `avg_resolution_days` | number or null | `closed_at − received_at`, to 1 decimal. |
| `csat` | number or null | The average `satisfaction_rating`, to 1 decimal. |
| `csat_responses` | integer | |
| `monthly` | array | 6 items, oldest first: `{ month, opened, resolved }`. `resolved` counts cases received that month that have since closed. |
| `recent_cases` | array | The latest 5 by `received_at`: `case_id, external_case_id, title, received_at, closed_at, reception_channel_code, case_type_name, status_code, status_name, is_terminal, service_center_name`. |

**`reach`**

| field | type | notes |
|---|---|---|
| `email` | object or null | The first active `EMAIL` contact point (primary first, then by id). It is the full `crm_contact_point` row. |
| `phone` | object or null | The first active `MOBILE` or `PHONE` contact point. |
| `phones`, `emails` | array | Every active contact point of those types, as full rows. |
| `preferred_channel` | string or null | The channel code of a GRANTED consent marked `is_preferred`. Failing that, the most recently captured GRANTED consent. |
| `consent_by_channel` | array | One item per active channel: `{ channel_code, channel_name, asked: boolean, granted: boolean }`. `asked` is true if any consent row exists for that channel, in any project or for any purpose. `granted` is true if any of those rows is GRANTED. |

**`accounts[]`**

There is at least one row per `ACTIVE` project except `PLATFORM`, ordered by `project_id`.

| field | type | notes |
|---|---|---|
| `project_id`, `project_code`, `project_name` | | |
| `account_status` | string | `PRIMARY`, `LINKED`, `UNLINKED` or `NOT_LINKED`. A project with several live accounts produces one row per account. A project with only unlinked accounts shows the most recently unlinked one. |
| `project_account_id`, `external_account_id`, `external_login` | | Missing on `NOT_LINKED` rows. |
| `first_used_at` | string | `source_created_at`, or `linked_at` if that is empty. Missing on `NOT_LINKED` rows. |
| `last_activity_at` | string or null | The latest transaction (any role, any status) or case received in that project. |

**Other arrays**

| key | item fields | selection and order |
|---|---|---|
| `recent_orders` | `transaction_id, external_transaction_id, transaction_at, transaction_status, transaction_type_code, net_amount, currency_code, reporting_net_amount, project_code, project_name, refunded` (boolean: true if any transaction points to it as `original_transaction_id`) | BUYER and not REFUND/RETURN/REVERSAL. **Any status**: unlike the figures, this list can include cancelled orders. Latest 5. |
| `products` | `product_registration_id, valid_from, product_instance_id, external_product_instance_id, serial_number, imei, instance_status, product_name, class_code, product_domain, project_code, project_name` | Current registrations, `valid_from` desc, at most 6. |
| `interactions` | every `crm_party_interaction` column, plus `agent_name` and `external_case_id` | `occurred_at` desc, at most 5. |
| `campaigns` | `recipient_id, campaign_id, campaign_name, channel_code, channel_name, at, recipient_status, skip_reason_code, converted, clicked, opened, outcome` | `at` = delivered, else sent, else created time. Latest 8. `outcome` is `SKIPPED`, `FAILED`, `NOT_SENT` (ELIGIBLE/QUEUED), `PURCHASED`, `CLICKED`, `OPENED` or `NOT_OPENED`, checked in that order. |
| `segments` | `segment_id, segment_name, matched_at` | Current memberships (`unmatched_at IS NULL`) of `ACTIVE` segments, `matched_at` desc. |
| `tags` | `tag_id, tag_code, tag_name, color_scheme, tagged_at` | `tagged_at` asc. |
| `relationships` | `party_relationship_id, status, valid_from, valid_to, note, other_party_pk, type_code, side, relationship_name, other_name, other_party_type` | Both directions. On a row where this party is the related party, `type_code` is the type's inverse and `side` is `INVERSE`; otherwise `side` is `OWN`. ACTIVE rows come first; ended rows are included. For a person, active employers are added at the end as `{ party_relationship_id: "employer-<id>", status: "ACTIVE", other_party_pk, other_name, other_party_type: "ORGANIZATION", type_code: "EMPLOYER", relationship_name: "Employer", side: "EMPLOYMENT" }`. |
| `notes` | `note_id, note_text, is_pinned, created_at, author_name` | Not deleted. Pinned first, then newest. At most 3. |
| `team` | `team_member_id, team_role, manager_id, manager_name` | Current members only (`ended_at IS NULL`). No defined order. |
| `score_history` | `reference_date, corporate_score, grade_code` | The latest 24 project-less snapshots, oldest first. |

**`agreement`**: one full `crm_party_agreement` row, or null. The code picks `ACTIVE` first, then `DRAFT`, then any other status, and within each the latest `start_date`. If the customer has no active or draft agreement, an expired or terminated one can appear here.

**Organization-only blocks**

| key | shape |
|---|---|
| `hierarchy` | `{ root_party_pk, nodes[], affiliates[] }`. The code follows active parent links upward to the top of the group (at most 10 levels), then lists the whole tree below that top: `nodes[]` = `{ party_pk, parent_id, depth, display_name }`, ordered by depth then name. An organization with no links gets just itself (`depth` 0). `affiliates[]` = `{ party_pk, display_name }` for active `AFFILIATE` relationships in either direction. A parent link is either (child, parent, `PARENT_COMPANY`) or (parent, child, `SUBSIDIARY`). |
| `key_contacts` | Active people of the organization: `org_person_relationship_id, person_party_pk, party_pk, display_name, job_title_name, roles[] ({role_code, role_name}, current roles only), is_primary, department_name, email, phone` (first active contact of each kind). Primary contacts first. |
| `industries` | `{ industry_id, industry_name, is_primary }`, current only, primary first. |
| `organization_types` | `{ type_code, type_name }`, active assignments only. |

Example: a person, with arrays shortened.

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "party_pk": "1042",
    "party_type": "PERSON",
    "profile": { "party_pk": "1042", "full_name": "Mary Chen", "gender_code": "F", "birth_date": "1988-03-14", "birth_year": 1988,
                 "job_title_id": 3, "home_location_pk": "210", "address_line": null, "is_checked_manually": false,
                 "created_at": "2025-02-01T03:10:00.000Z", "updated_at": "2026-09-30T08:00:00.000Z",
                 "home_location_name": "Chaoyang", "home_full_name": "Beijing / Chaoyang", "job_title_name": "Engineer" },
    "header": { "grade_code": "GOLD", "grade_name": "Gold", "grade_since": "2026-06-01", "grade_assigned": false,
                "assigned_grade_id": null, "assigned_grade_reason": null, "assigned_grade_by": null,
                "computed_grade_code": "GOLD", "computed_grade_name": "Gold", "corporate_score": "71.5000",
                "activity_status": "ACTIVE", "reference_date": "2026-10-01", "lifetime_spend": 4820.5,
                "orders_total": 7, "orders_12m": 2, "orders_24m": 4, "products_registered": 2, "open_cases": 1, "total_cases": 3 },
    "value": { "lifetime_value": 4820.5, "spend_12m": 1299, "spend_trend_pct": -12.4, "average_order_value": 688.64,
               "average_order_trend_pct": 5.1, "purchase_frequency_per_year": 2.3, "frequency_trend_pct": 0,
               "orders_24m": 4, "orders_24m_trend_pct": 33.3, "last_order_at": "2026-08-19T06:21:00.000Z",
               "monthly": [{ "month": "2025-11", "amount": 0 }, { "month": "2026-08", "amount": 1299 }], "yearly": [] },
    "rfm": { "score": 64, "recency": 80, "frequency": 47, "monetary": 65 },
    "service": { "total_cases": 3, "open_cases": 1, "resolved_cases": 2, "total_interactions": 9, "avg_response_hours": 3.2,
                 "avg_resolution_days": 4.5, "csat": 4.5, "csat_responses": 2,
                 "monthly": [{ "month": "2026-10", "opened": 1, "resolved": 0 }], "recent_cases": [] },
    "reach": { "email": null, "phone": { "contact_point_id": "5531", "contact_type": "MOBILE", "contact_value": "+86 138 0000 1234", "is_primary": true, "status": "ACTIVE" },
               "phones": [], "emails": [], "preferred_channel": "SMS",
               "consent_by_channel": [{ "channel_code": "SMS", "channel_name": "SMS", "asked": true, "granted": true }] },
    "accounts": [{ "project_id": 2, "project_code": "MALL", "project_name": "Online mall", "project_account_id": "88",
                   "external_account_id": "u-55120", "external_login": "mary.c", "account_status": "PRIMARY",
                   "first_used_at": "2024-05-02T00:00:00.000Z", "last_activity_at": "2026-08-19T06:21:00.000Z" }],
    "recent_orders": [], "products": [], "interactions": [], "campaigns": [], "segments": [],
    "tags": [{ "tag_id": 4, "tag_code": "VIP", "tag_name": "VIP", "color_scheme": "purple", "tagged_at": "2026-01-10T02:00:00.000Z" }],
    "relationships": [{ "party_relationship_id": "12", "status": "ACTIVE", "valid_from": "2025-06-01", "valid_to": null, "note": null,
                        "other_party_pk": "1043", "type_code": "SPOUSE", "side": "OWN", "relationship_name": "Spouse",
                        "other_name": "John Chen", "other_party_type": "PERSON" }],
    "notes": [], "team": [], "agreement": null,
    "score_history": [{ "reference_date": "2026-10-01", "corporate_score": "71.5000", "grade_code": "GOLD" }]
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | No party with that `party_pk`. |
| 400 | `common.isNotAValue` | `:id` is not a number. |

### POST /api/admin/crm/parties/:id/relationships

Records that another customer is related to this one. The stored row (A, B, T) reads "B is the T of A". Each type has an inverse, so the same row also reads correctly from B's record.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string (bigint) | The party the relationship is entered from (A). |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `related_party_pk` | string/integer | yes | Must be an existing party (B) and must not be `:id`. |
| `relationship_type_code` | string | yes | An active `crm_party_relationship_type`. Seeded codes: `SPOUSE`, `PARENT`, `CHILD`, `SIBLING`, `RELATIVE` (PERSON only), `REFERRER`, `REFERRAL` (ANY), `PARENT_COMPANY`, `SUBSIDIARY`, `AFFILIATE`, `PARTNER` (ORGANIZATION only). Unless the type is `ANY`, **both** parties must be of the type's `applies_to` kind. |
| `valid_from` | string (date) | no | Defaults to today (`CURRENT_DATE`). The code does not validate it; a bad date fails in Postgres (400). |
| `note` | string | no | Cut to 255 characters. |

Further checks:

- `PARENT_COMPANY` makes B the parent of A, and `SUBSIDIARY` makes A the parent of B. Either is refused if it would make a company its own ancestor. The check walks active parent links up to 20 levels.
- The request is refused if the same fact is already ACTIVE: either (A, B, T), or (B, A, inverse of T).

**Response** `200`, message `common.created` ("created"). `data` is the inserted `crm_party_relationship` row:

| field | type | notes |
|---|---|---|
| `party_relationship_id` | string | |
| `party_pk`, `related_party_pk` | string | |
| `relationship_type_code` | string | |
| `status` | string | `ACTIVE` |
| `valid_from`, `valid_to` | string (date) or null | |
| `note` | string or null | |
| `created_by_manager_id` | integer | |
| `created_at`, `updated_at` | string | |

```json
{
  "success": true,
  "message": "created",
  "data": { "party_relationship_id": "12", "party_pk": "1042", "related_party_pk": "1043", "relationship_type_code": "SPOUSE",
            "status": "ACTIVE", "valid_from": "2026-10-11", "valid_to": null, "note": null, "created_by_manager_id": 7,
            "created_at": "2026-10-11T04:00:00.000Z", "updated_at": "2026-10-11T04:00:00.000Z" }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | `:id`, or `related_party_pk` when given, does not exist. |
| 400 | `crm.customers.chooseTheRelatedCustomer` ("choose the related customer") | `related_party_pk` is missing. |
| 409 | `crm.customers.aCustomerCannotBeRelatedToThemselves` | The related party is the same party. |
| 400 | `crm.customers.chooseARelationship` ("choose a relationship") | The type is unknown or inactive. |
| 409 | `crm.customers.thatRelationshipIsNotForThem` (`"{relationship}" does not apply to these two customers`) | The parties do not match the type's `applies_to`. |
| 409 | `crm.customers.thatWouldMakeACircle` ("that would make a company its own parent") | The hierarchy would loop. |
| 409 | `crm.customers.theyAreAlreadyRelatedThatWay` | The relationship is already active, from either end. |

### POST /api/admin/crm/parties/:id/relationships/:relationshipId/end

Ends an active relationship. `:id` may be either end of the relationship.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string (bigint) | Must be either `party_pk` or `related_party_pk` of the relationship. |
| `relationshipId` | string (bigint) | `party_relationship_id` |

**Query parameters:** None.

**Request body:** None.

**Response** `200`, message `common.updated` ("updated"). `data` is the updated row, with the same fields as above. `status` is set to `ENDED`, and `valid_to` is set to the later of today and `valid_from`.

```json
{ "success": true, "message": "updated",
  "data": { "party_relationship_id": "12", "party_pk": "1042", "related_party_pk": "1043", "relationship_type_code": "SPOUSE",
            "status": "ENDED", "valid_from": "2025-06-01", "valid_to": "2026-10-11", "note": null, "created_by_manager_id": 7,
            "created_at": "2025-06-01T04:00:00.000Z", "updated_at": "2026-10-11T05:00:00.000Z" } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | No such relationship involving this party. |
| 409 | `crm.customers.thatRelationshipHasEnded` ("that relationship has already ended") | `status` is already `ENDED`. |

### POST /api/admin/crm/parties/:id/tags

Puts a tag from the CRM basic data list onto the customer. Repeating it is harmless: if the tag is already there, nothing changes (`ON CONFLICT DO NOTHING`), and the reply is still 200 with an audit entry written.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string (bigint) | `party_pk` |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `tag_id` | integer | yes | Must be an active `crm_tag`. |

**Response** `200`, message `common.created`. `data` is the **tag** (the `crm_tag` row), not the link row:

| field | type | notes |
|---|---|---|
| `tag_id` | integer | |
| `tag_code`, `tag_name` | string | |
| `color_scheme` | string | `gray, green, blue, purple, pink, orange, red, teal, yellow, cyan` |
| `description` | string or null | |
| `is_active` | boolean | |
| `created_at` | string | |

```json
{ "success": true, "message": "created",
  "data": { "tag_id": 4, "tag_code": "VIP", "tag_name": "VIP", "color_scheme": "purple", "description": null,
            "is_active": true, "created_at": "2025-01-01T00:00:00.000Z" } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | The party does not exist. |
| 400 | `crm.customers.chooseATag` ("choose a tag") | `tag_id` is missing, unknown or inactive. |
| 400 | `common.isNotAValue` | `tag_id` is not an integer. |

### DELETE /api/admin/crm/parties/:id/tags/:tagId

Takes a tag off the customer.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string (bigint) | `party_pk` |
| `tagId` | integer | `tag_id` |

**Query parameters:** None.

**Request body:** None.

**Response** `200`, message `common.deleted` ("deleted"), `data` is `null`.

```json
{ "success": true, "message": "deleted", "data": null }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | The customer does not have that tag, or the party does not exist. |

### GET /api/admin/crm/parties/:id/notes

The customer's notes, paged. Deleted notes are left out.

**Permission:** READ on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string (bigint) | `party_pk` |

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `page` | integer | no | 1 | |
| `limit` | integer | no | 20 | Clamped to 1..200. |

`sort` and `dir` are ignored. The order is always pinned notes first, then newest `created_at` first.

**Request body:** None.

**Response** `200`. `data` = `{ rows, total, page, limit, summary: null }`. Each row has every `crm_party_note` column plus `author_name`:

| field | type | notes |
|---|---|---|
| `note_id` | string | |
| `party_pk` | string | |
| `note_text` | string | |
| `is_pinned` | boolean | |
| `created_by_manager_id` | integer or null | |
| `created_at`, `updated_at` | string | |
| `deleted_at` | null | Always null in this list. |
| `author_name` | string or null | The manager's name. |

```json
{ "success": true, "message": "ok",
  "data": { "rows": [{ "note_id": "301", "party_pk": "1042", "note_text": "Prefers calls after 6pm.", "is_pinned": true,
                       "created_by_manager_id": 7, "created_at": "2026-09-02T10:00:00.000Z", "updated_at": "2026-09-02T10:00:00.000Z",
                       "deleted_at": null, "author_name": "Li Wei" }],
            "total": 1, "page": 1, "limit": 20, "summary": null } }
```

**Errors:** None specific. An unknown party returns an empty list.

### POST /api/admin/crm/parties/:id/notes

Adds a note.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string (bigint) | `party_pk` |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `note_text` | string | yes | Trimmed; must not be empty; cut to 5000 characters. |
| `is_pinned` | boolean | no | Coerced with `!!`. Defaults to false. |

**Response** `200`, message `common.created`. `data` is the inserted `crm_party_note` row: the fields above without `author_name`.

```json
{ "success": true, "message": "created",
  "data": { "note_id": "302", "party_pk": "1042", "note_text": "Asked about trade-in.", "is_pinned": false,
            "created_by_manager_id": 7, "created_at": "2026-10-11T04:00:00.000Z", "updated_at": "2026-10-11T04:00:00.000Z", "deleted_at": null } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | The party does not exist. |
| 400 | `crm.customer360.writeTheNote` ("write the note") | `note_text` is empty after trimming. |

### PUT /api/admin/crm/parties/:id/notes/:noteId

Edits a note's text or pin. Fields that are not sent stay as they are.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string (bigint) | `party_pk` |
| `noteId` | string (bigint) | `note_id`. The note must belong to `:id` and not be deleted. |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `note_text` | string | no | If sent: trimmed, must not be empty, cut to 5000 characters. |
| `is_pinned` | boolean | no | If sent: coerced with `!!`. |

`updated_at` is always set to now.

**Response** `200`, message `common.updated`. `data` is the updated note row, with the same shape as on create.

```json
{ "success": true, "message": "updated",
  "data": { "note_id": "302", "party_pk": "1042", "note_text": "Asked about trade-in.", "is_pinned": true,
            "created_by_manager_id": 7, "created_at": "2026-10-11T04:00:00.000Z", "updated_at": "2026-10-11T04:30:00.000Z", "deleted_at": null } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | The note does not exist, belongs to another party, or is deleted. |
| 400 | `crm.customer360.writeTheNote` | `note_text` was sent but is empty after trimming. |

### DELETE /api/admin/crm/parties/:id/notes/:noteId

Removes a note. This is a soft delete: `deleted_at` is set and the row is kept for the audit.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string (bigint) | `party_pk` |
| `noteId` | string (bigint) | `note_id` |

**Query parameters:** None.

**Request body:** None.

**Response** `200`, message `common.deleted`, `data` is `null`.

```json
{ "success": true, "message": "deleted", "data": null }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | The note does not exist, belongs to another party, or is already deleted. |

### GET /api/admin/crm/parties/:id/files

Lists the documents kept with the customer, newest first. Deleted files are left out. The list is not paged.

**Permission:** READ on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string (bigint) | `party_pk` |

**Query parameters:** None.

**Request body:** None.

**Response** `200`. `data` is an array. `storage_key` is never returned.

| field | type | notes |
|---|---|---|
| `file_id` | string | |
| `file_name` | string | The original file name, at most 255 characters. |
| `content_type` | string | The MIME type the uploader declared. |
| `byte_size` | string | bigint |
| `description` | string or null | |
| `created_at` | string | |
| `uploaded_by_name` | string or null | |

```json
{ "success": true, "message": "ok",
  "data": [{ "file_id": "55", "file_name": "contract-2026.pdf", "content_type": "application/pdf", "byte_size": "184233",
             "description": "Signed service contract", "created_at": "2026-10-01T02:00:00.000Z", "uploaded_by_name": "Li Wei" }] }
```

**Errors:** None specific.

### POST /api/admin/crm/parties/:id/files

Uploads one document for the customer, as `multipart/form-data`.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string (bigint) | `party_pk` |

**Query parameters:** None.

**Request body** (multipart)

| field | type | required | rules |
|---|---|---|---|
| `file` | file | yes | Exactly one file, in field `file`. multer (1.4.2) holds it in memory, so nothing is written to disk until the checks below pass. Size limit: `config.storage.maxUploadBytes` = `MAX_UPLOAD_MB` (default **20**) × 1024 × 1024 bytes. |
| `description` | string | no | Cut to 255 characters. |

Type check: the file's declared MIME type (`file.mimetype`, as the client sent it) must be one of `application/pdf`, `image/jpeg`, `image/png`, `image/webp` or `image/gif`. This list is `config.storage.allowedDocumentTypes` plus the image types except `image/svg+xml`. **There is no extension check and no content sniffing.** The extension is used only to build the storage name: it is lower-cased, stripped to `[.a-z0-9]` and cut to 10 characters.

Storage: the file is written to a private folder, not the public `/uploads`:

- `CRM_FILE_DIR` (resolved to an absolute path) when that environment variable is set;
- otherwise a folder named `crm-private` next to the upload directory. With the default `UPLOAD_DIR=uploads`, that is `<project root>/crm-private`.

The folder is created if it is missing. The file is stored as `<Date.now() base36>-<16 hex chars><extension>`, and that name is saved in `crm_party_file.storage_key`. If the database insert fails, the written file is deleted.

**Response** `200`, message `common.created`. `data` is the inserted `crm_party_file` row. Unlike the list, it **includes** `storage_key`.

| field | type | notes |
|---|---|---|
| `file_id`, `party_pk` | string | |
| `file_name` | string | `originalname` cut to 255 characters. |
| `storage_key` | string | |
| `content_type` | string | |
| `byte_size` | string | |
| `description` | string or null | |
| `uploaded_by_manager_id` | integer | |
| `created_at` | string | |
| `deleted_at` | null | |

```json
{ "success": true, "message": "created",
  "data": { "file_id": "56", "party_pk": "1042", "file_name": "damage-photo.jpg", "storage_key": "mg3k2x1a-9f2c4e1b7a3d5c60.jpg",
            "content_type": "image/jpeg", "byte_size": "912004", "description": null, "uploaded_by_manager_id": 7,
            "created_at": "2026-10-11T04:00:00.000Z", "deleted_at": null } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | The party does not exist. |
| 400 | `crm.common.chooseAFile` ("choose a file") | No file in field `file`. |
| 400 | `crm.customer360.thatKindOfFileIsNotAccepted` ("that kind of file is not accepted - send a PDF or a picture") | The declared MIME type is not in the list. |
| 500 | `common.internalServerError` | multer rejected the upload: the file is too large, there is more than one file, or a file came in a field other than `file`. Neither the CRM router's error handler (22001 and `crm_*_code_key` only) nor `middleware/error.js` handles `MulterError`, so these surface as 500. |

### GET /api/admin/crm/parties/:id/files/:fileId/download

Sends the file's bytes as an attachment for the browser to save, not as a page for it to render. This is not a JSON reply.

**Permission:** READ on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string (bigint) | `party_pk` |
| `fileId` | string (bigint) | `file_id`. Must belong to `:id` and not be deleted. |

**Query parameters:** None.

**Request body:** None.

**Response** `200` with the binary body, sent by Express `res.download(path, file_name)`. Headers:

| header | value |
|---|---|
| `Content-Disposition` | `attachment; filename="<file_name>"` (Express adds the encoded `filename*` form when the name needs it) |
| `Content-Type` | Chosen by Express from the **stored file's extension**, not from the saved `content_type`. |
| `X-Content-Type-Options` | `nosniff` |
| `Content-Security-Policy` | `default-src 'none'` |

The path is built from `path.basename(storage_key)` inside the private folder, so a request cannot steer it elsewhere.

**Errors** (JSON envelope)

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | No such file for this party, the file is deleted, or its bytes are missing from disk. |

### DELETE /api/admin/crm/parties/:id/files/:fileId

Removes a file. The row is soft-deleted (`deleted_at` set) and the bytes are deleted from disk if they are there.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string (bigint) | `party_pk` |
| `fileId` | string (bigint) | `file_id` |

**Query parameters:** None.

**Request body:** None.

**Response** `200`, message `common.deleted`, `data` is `null`.

```json
{ "success": true, "message": "deleted", "data": null }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | No such file for this party, or it is already deleted. |

### GET /api/admin/crm/parties/:id/interactions

Contacts with the customer outside campaigns, paged: calls, emails and chats logged by staff, plus messages sent from the record.

**Permission:** READ on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string (bigint) | `party_pk` |

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `channel_code` | string | no | | Exact match. Values: `EMAIL, PHONE, SMS, CHAT, IN_PERSON, APP, WEB, LETTER, PUSH`. |
| `direction` | string | no | | Exact match: `INBOUND` or `OUTBOUND`. |
| `page` | integer | no | 1 | |
| `limit` | integer | no | 20 | Clamped to 1..200. |

`sort` and `dir` are ignored. The order is always `occurred_at` desc.

**Request body:** None.

**Response** `200`. `data` = `{ rows, total, page, limit, summary: null }`. Each row:

| field | type | notes |
|---|---|---|
| `interaction_id`, `party_pk` | string | |
| `project_id` | integer or null | |
| `direction` | string | `INBOUND` / `OUTBOUND` |
| `channel_code` | string | See the filter above. |
| `interaction_type` | string | `GENERAL_INQUIRY, PRODUCT_SUPPORT, ORDER_INQUIRY, COMPLAINT, FEEDBACK, SALES, SERVICE_NOTICE, MARKETING, FOLLOW_UP` |
| `purpose_id` | integer or null | Set on sent messages. |
| `subject` | string | |
| `body` | string or null | |
| `case_id` | string or null | |
| `contact_point_id` | string or null | Set on sent messages. |
| `destination_snapshot` | string or null | The address the message went to. |
| `manager_id` | integer or null | |
| `outcome_code` | string | `ANSWERED, FOLLOW_UP, RESOLVED, CLOSED, NO_ANSWER, QUEUED, SENT, FAILED` |
| `occurred_at`, `created_at` | string | |
| `duration_seconds` | integer or null | |
| `agent_name` | string or null | |
| `external_case_id` | string or null | |
| `project_code` | string or null | |

```json
{ "success": true, "message": "ok",
  "data": { "rows": [{ "interaction_id": "900", "party_pk": "1042", "project_id": 2, "direction": "INBOUND", "channel_code": "PHONE",
                       "interaction_type": "PRODUCT_SUPPORT", "purpose_id": null, "subject": "Screen flicker", "body": null, "case_id": "4410",
                       "contact_point_id": null, "destination_snapshot": null, "manager_id": 7, "outcome_code": "FOLLOW_UP",
                       "occurred_at": "2026-10-10T07:15:00.000Z", "duration_seconds": 420, "created_at": "2026-10-10T07:30:00.000Z",
                       "agent_name": "Li Wei", "external_case_id": "SC-2026-4410", "project_code": "MALL" }],
            "total": 1, "page": 1, "limit": 20, "summary": null } }
```

**Errors:** None specific. An unknown party returns an empty list.

### POST /api/admin/crm/parties/:id/interactions

Logs a contact that has already happened (a call taken, an email answered, a chat). The signed-in manager is recorded as the agent.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string (bigint) | `party_pk` |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `channel_code` | string | yes | `EMAIL, PHONE, SMS, CHAT, IN_PERSON, APP, WEB, LETTER, PUSH` |
| `interaction_type` | string | yes | `GENERAL_INQUIRY, PRODUCT_SUPPORT, ORDER_INQUIRY, COMPLAINT, FEEDBACK, SALES, SERVICE_NOTICE, MARKETING, FOLLOW_UP` |
| `outcome_code` | string | yes | `ANSWERED, FOLLOW_UP, RESOLVED, CLOSED, NO_ANSWER`. `QUEUED`, `SENT` and `FAILED` are not accepted here. |
| `subject` | string | yes | Trimmed; must not be empty; cut to 250 characters. |
| `direction` | string | no | `OUTBOUND` if exactly that value is sent; anything else becomes `INBOUND`. |
| `body` | string | no | Stored as sent. A falsy value is stored as null. |
| `case_id` | string/integer | no | Must be a service case of **this** party. |
| `project_id` | integer | no | Not checked by the service. An unknown id fails on the foreign key (409 `common.referencedRecordIsMissing`). |
| `occurred_at` | string (timestamp) | no | Defaults to now. |
| `duration_minutes` | number | no | Stored as `duration_seconds = round(minutes × 60)`. A negative value fails the CHECK (400 `common.valueFailedAValidation`). |

**Response** `200`, message `common.created`. `data` is the inserted `crm_party_interaction` row: the list row fields without `agent_name`, `external_case_id` or `project_code`.

```json
{ "success": true, "message": "created",
  "data": { "interaction_id": "901", "party_pk": "1042", "project_id": null, "direction": "INBOUND", "channel_code": "PHONE",
            "interaction_type": "ORDER_INQUIRY", "purpose_id": null, "subject": "Where is my order", "body": null, "case_id": null,
            "contact_point_id": null, "destination_snapshot": null, "manager_id": 7, "outcome_code": "ANSWERED",
            "occurred_at": "2026-10-11T04:00:00.000Z", "duration_seconds": 300, "created_at": "2026-10-11T04:00:00.000Z" } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | The party does not exist. |
| 400 | `crm.common.chooseAChannel` ("choose a channel") | `channel_code` is not in the list. |
| 400 | `crm.customer360.chooseWhatItWasAbout` | `interaction_type` is not in the list. |
| 400 | `crm.customer360.chooseHowItEnded` | `outcome_code` is not in the list. |
| 400 | `crm.customer360.giveASummary` ("give a short summary") | `subject` is empty. |
| 409 | `crm.customer360.thatCaseIsAnotherCustomers` | `case_id` does not belong to this party. |
| 409 | `common.referencedRecordIsMissing` | `project_id` does not exist. |

### POST /api/admin/crm/parties/:id/messages

Sends a message to the customer from the record. It is checked against the same rules a campaign uses, then recorded as an outbound interaction with `outcome_code: "QUEUED"`. This endpoint only writes that row. Nothing in this codebase was found that later picks up `QUEUED` interactions and delivers them.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string (bigint) | `party_pk`. The party must be `ACTIVE`. |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `channel_id` | integer | yes | An active `crm_communication_channel` whose code is `EMAIL`, `SMS`, `PUSH` or `IN_APP`. `PHONE_CALL` is refused. |
| `purpose_id` | integer | yes | A `crm_communication_purpose`. Seeded: `TRANSACTIONAL`, `SERVICE_NOTICE`, `EVENT_NOTICE`, `MARKETING` and `SURVEY` (the last two require opt-in). |
| `project_id` | integer | yes in practice | The project must have an enabled `crm_project_communication_option` for this purpose and channel. |
| `subject` | string | yes | Trimmed; must not be empty; cut to 250 characters. |
| `body` | string | yes | Trimmed; must not be empty. |

The checks run in this order:

1. The party is `ACTIVE`.
2. The channel is valid.
3. The purpose is valid.
4. The subject and body are not empty.
5. The project offers this purpose on this channel (option exists and `is_enabled`).
6. The customer's consent for that option is not `WITHDRAWN` or `DENIED`.
7. If the option has `consent_required` or the purpose has `requires_opt_in`, a GRANTED consent must be in force (inside `effective_from` and `effective_to`).
8. If the channel has a `required_contact_type` (`EMAIL` needs EMAIL, `SMS` needs MOBILE, `PUSH` needs PUSH_TOKEN), the customer needs an active contact of that type. The contact named on the consent is used when there is one; otherwise primary first, then verified, then lowest id. `IN_APP` needs no contact.

What is stored:

| column | value |
|---|---|
| `direction` | `OUTBOUND` |
| `channel_code` | Mapped from the channel: `EMAIL`→`EMAIL`, `SMS`→`SMS`, `PUSH`→`PUSH`, `IN_APP`→`APP`. |
| `interaction_type` | `MARKETING` for purpose `MARKETING`, `SERVICE_NOTICE` for purpose `SERVICE_NOTICE`, otherwise `FOLLOW_UP`. |
| `contact_point_id`, `destination_snapshot` | The chosen contact and its value at send time. |
| `outcome_code` | `QUEUED` |

**Response** `200`, message `crm.customer360.messageQueued` ("message queued for sending"). `data` is the inserted `crm_party_interaction` row, with the same shape as on `POST .../interactions`.

```json
{ "success": true, "message": "message queued for sending",
  "data": { "interaction_id": "902", "party_pk": "1042", "project_id": 2, "direction": "OUTBOUND", "channel_code": "SMS",
            "interaction_type": "SERVICE_NOTICE", "purpose_id": 2, "subject": "Your repair is ready", "body": "Please collect it at ...",
            "case_id": null, "contact_point_id": "5531", "destination_snapshot": "+86 138 0000 1234", "manager_id": 7,
            "outcome_code": "QUEUED", "occurred_at": "2026-10-11T04:00:00.000Z", "duration_seconds": null, "created_at": "2026-10-11T04:00:00.000Z" } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | The party does not exist. |
| 409 | `crm.common.chooseAnActiveCustomer` ("choose an active customer") | The party is not `ACTIVE`. |
| 400 | `crm.customer360.chooseAChannelThatCarriesMessages` ("choose email, SMS, app push or the member inbox") | The channel is missing, inactive, or not one of the four message channels. |
| 400 | `crm.customer360.chooseWhatTheMessageIsFor` | The purpose is unknown. |
| 400 | `crm.customer360.writeTheMessage` ("write a subject and a message") | `subject` or `body` is empty. |
| 409 | `crm.customer360.thatProjectDoesNotSendThat` | There is no enabled option for the project, purpose and channel (including when `project_id` is missing). |
| 409 | `crm.customer360.theCustomerSaidNoToThat` | The consent is `WITHDRAWN` or `DENIED`. |
| 409 | `crm.customer360.thereIsNoConsentForThat` | Opt-in is required and no GRANTED consent is in force. |
| 409 | `crm.customer360.theCustomerHasNoContactForThatChannel` | There is no active contact of the type the channel needs. |

### GET /api/admin/crm/parties/:id/team

The customer's account team, past and present. The list is not paged.

**Permission:** READ on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string (bigint) | `party_pk` |

**Query parameters:** None.

**Request body:** None.

**Response** `200`. `data` is an array ordered by `ended_at` desc, then `assigned_at` desc. Postgres puts NULLs first in a descending sort, so current members come first.

| field | type | notes |
|---|---|---|
| `team_member_id`, `party_pk` | string | |
| `manager_id` | integer | |
| `team_role` | string | `ACCOUNT_MANAGER`, `SALES_REP`, `SUPPORT_MANAGER` |
| `assigned_at` | string | |
| `ended_at` | string or null | Null while the member is current. |
| `assigned_by_manager_id` | integer or null | |
| `manager_name`, `username` | string | The team member. |
| `assigned_by_name` | string or null | |

```json
{ "success": true, "message": "ok",
  "data": [{ "team_member_id": "21", "party_pk": "1042", "manager_id": 12, "team_role": "ACCOUNT_MANAGER",
             "assigned_at": "2026-03-01T02:00:00.000Z", "ended_at": null, "assigned_by_manager_id": 7,
             "manager_name": "Zhang Min", "username": "zmin", "assigned_by_name": "Li Wei" }] }
```

**Errors:** None specific.

### POST /api/admin/crm/parties/:id/team

Names a staff member for a role in the customer's account team. Each role has one current holder. If someone else holds the role, their turn is ended (`ended_at` = now) and a new row is inserted, in one transaction.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string (bigint) | `party_pk` |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `team_role` | string | yes | `ACCOUNT_MANAGER`, `SALES_REP` or `SUPPORT_MANAGER` |
| `manager_id` | integer | yes | A `managers` row with `is_deleted = false`. The manager's `status` is not checked. |

**Response** `200`, message `common.updated`. `data` is the inserted `crm_party_team_member` row: the list fields without the three names.

```json
{ "success": true, "message": "updated",
  "data": { "team_member_id": "22", "party_pk": "1042", "manager_id": 15, "team_role": "ACCOUNT_MANAGER",
            "assigned_at": "2026-10-11T04:00:00.000Z", "ended_at": null, "assigned_by_manager_id": 7 } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | The party does not exist. |
| 400 | `crm.customers.chooseATeamRole` | `team_role` is not in the list. |
| 400 | `crm.customers.chooseAStaffMember` ("choose a staff member") | The manager is missing or deleted. |
| 409 | `crm.customers.theyAlreadyHaveThatRole` | The same manager already holds that role for this customer. |
| 409 | `common.duplicatedValue` | A concurrent request won the race on `uq_crm_team_role_current`. That constraint is not in the friendly-message map. |

### POST /api/admin/crm/parties/:id/team/:teamMemberId/end

Ends a current team member's turn.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string (bigint) | `party_pk` |
| `teamMemberId` | string (bigint) | `team_member_id`. Must belong to `:id` and still be current. |

**Query parameters:** None.

**Request body:** None.

**Response** `200`, message `common.updated`. `data` is the updated row, with `ended_at` set to now.

```json
{ "success": true, "message": "updated",
  "data": { "team_member_id": "22", "party_pk": "1042", "manager_id": 15, "team_role": "ACCOUNT_MANAGER",
            "assigned_at": "2026-10-11T04:00:00.000Z", "ended_at": "2026-10-11T06:00:00.000Z", "assigned_by_manager_id": 7 } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | No current team member with that id for this party, or it has already ended. |

### GET /api/admin/crm/parties/:id/agreements

All the customer's agreements, newest `start_date` first. The list is not paged.

**Permission:** READ on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string (bigint) | `party_pk` |

**Query parameters:** None.

**Request body:** None.

**Response** `200`. `data` is an array:

| field | type | notes |
|---|---|---|
| `agreement_id`, `party_pk` | string | |
| `agreement_no` | string or null | Up to 60 characters. |
| `agreement_type` | string | `ENTERPRISE, RESELLER, DISTRIBUTION, SERVICE_LEVEL, PURCHASE, PARTNERSHIP` |
| `title` | string or null | Up to 200 characters. |
| `start_date` | string (date) | |
| `end_date`, `renewal_date` | string (date) or null | |
| `status` | string | `DRAFT, ACTIVE, EXPIRED, TERMINATED` |
| `annual_value` | string or null | numeric(20,4) |
| `currency_code` | string or null | |
| `note` | string or null | |
| `created_by_manager_id` | integer or null | |
| `created_at`, `updated_at` | string | |
| `created_by_name` | string or null | |

```json
{ "success": true, "message": "ok",
  "data": [{ "agreement_id": "8", "party_pk": "2001", "agreement_no": "EA-2026-008", "agreement_type": "ENTERPRISE",
             "title": "Enterprise supply 2026", "start_date": "2026-01-01", "end_date": "2026-12-31", "renewal_date": "2026-11-30",
             "status": "ACTIVE", "annual_value": "120000.0000", "currency_code": "USD", "note": null, "created_by_manager_id": 7,
             "created_at": "2025-12-20T02:00:00.000Z", "updated_at": "2025-12-20T02:00:00.000Z", "created_by_name": "Li Wei" }] }
```

**Errors:** None specific.

### POST /api/admin/crm/parties/:id/agreements

Creates an agreement.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string (bigint) | `party_pk` |

**Query parameters:** None.

**Request body**

Only these fields are read. An empty string `""` is stored as null.

| field | type | required | rules |
|---|---|---|---|
| `agreement_type` | string | yes | `ENTERPRISE, RESELLER, DISTRIBUTION, SERVICE_LEVEL, PURCHASE, PARTNERSHIP` |
| `start_date` | string (date) | yes | |
| `end_date` | string (date) | no | Must not be before `start_date`. |
| `renewal_date` | string (date) | no | |
| `status` | string | no | `DRAFT, ACTIVE, EXPIRED, TERMINATED`. The database default is `ACTIVE`. |
| `agreement_no` | string | no | Up to 60 characters; longer is refused with 400 `crm.settings.aValueIsTooLong`. |
| `title` | string | no | Up to 200 characters; longer is refused with 400 `crm.settings.aValueIsTooLong`. |
| `annual_value` | number | no | Must be >= 0 (CHECK). |
| `currency_code` | string | no | Must exist in `crm_currency`. When `annual_value` is given without a currency, it is set to `USD`. |
| `note` | string | no | |

**Response** `200`, message `common.created`. `data` is the inserted row: the list fields without `created_by_name`.

```json
{ "success": true, "message": "created",
  "data": { "agreement_id": "9", "party_pk": "2001", "agreement_no": null, "agreement_type": "SERVICE_LEVEL", "title": "Priority support",
            "start_date": "2026-11-01", "end_date": null, "renewal_date": null, "status": "DRAFT", "annual_value": "5000.0000",
            "currency_code": "USD", "note": null, "created_by_manager_id": 7, "created_at": "2026-10-11T04:00:00.000Z", "updated_at": "2026-10-11T04:00:00.000Z" } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | The party does not exist. |
| 400 | `crm.customers.chooseAnAgreementType` | `agreement_type` is not in the list. |
| 400 | `crm.common.notAStatusYouCanSet` ("not a status that can be set here") | `status` is not in the list. |
| 400 | `crm.customers.typeAndStartAreRequired` ("the type and the start date are required") | `agreement_type` or `start_date` is missing. |
| 400 | `crm.customers.itCannotEndBeforeItStarts` | `end_date` is before `start_date`. |
| 409 | `common.referencedRecordIsMissing` | `currency_code` is unknown. |
| 400 | `common.isNotAValue` / `common.valueFailedAValidation` | A malformed date or number, or a negative `annual_value`. |
| 400 | `crm.settings.aValueIsTooLong` | `agreement_no` over 60 or `title` over 200 characters (SQLSTATE 22001, mapped by the CRM router's own error handler). |

### PUT /api/admin/crm/parties/:id/agreements/:agreementId

Updates an agreement. Only the fields sent are changed.

**Permission:** WRITE on `/admin/crm/customers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string (bigint) | `party_pk` |
| `agreementId` | string (bigint) | `agreement_id`. Must belong to `:id`. |

**Query parameters:** None.

**Request body:** the same fields as on create, all optional. These rules apply:

- `agreement_type` and `status`, when sent, must be in their lists. Sending `""` for `agreement_type` becomes null and is refused with `chooseAnAgreementType`.
- The end-before-start check runs against the merged record (stored values plus the changes).
- Sending `annual_value` without `currency_code` sets `currency_code` to `USD`, **replacing a currency already stored**. Send `currency_code` along with `annual_value` to keep it.
- Sending `start_date: ""` stores null and fails the NOT NULL constraint (`400 common.isRequired`).
- `updated_at` is set to now.

**Response** `200`, message `common.updated`. `data` is the updated row, with the same shape as on create.

```json
{ "success": true, "message": "updated",
  "data": { "agreement_id": "9", "party_pk": "2001", "agreement_no": "SLA-2026-01", "agreement_type": "SERVICE_LEVEL", "title": "Priority support",
            "start_date": "2026-11-01", "end_date": "2027-10-31", "renewal_date": null, "status": "ACTIVE", "annual_value": "5000.0000",
            "currency_code": "USD", "note": null, "created_by_manager_id": 7, "created_at": "2026-10-11T04:00:00.000Z", "updated_at": "2026-10-11T05:00:00.000Z" } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | The party does not exist, or the agreement does not belong to it. |
| 400 | `crm.customers.chooseAnAgreementType` | `agreement_type` was sent and is not in the list. |
| 400 | `crm.common.notAStatusYouCanSet` | `status` was sent and is not in the list. |
| 400 | `crm.customers.itCannotEndBeforeItStarts` | The merged `end_date` is before the merged `start_date`. |
| 400 | `common.isRequired` | `start_date` was cleared. |
| 409 | `common.referencedRecordIsMissing` | `currency_code` is unknown. |
| 400 | `crm.settings.aValueIsTooLong` | `agreement_no` over 60 or `title` over 200 characters. |

## 14. Product instances and registrations

An **instance** (`crm_product_instance`) is one concrete thing: a phone by IMEI, a device by serial number, a licence by its key. A **registration** (`crm_product_registration`) is one party's relationship to an instance for a period: `OWNER`, `USER` (assigned user), `REGISTERED_USER`, `LESSEE` or `LICENSEE` (the seeded relationship types). `valid_to = null` means the relationship holds now. A change of holder never edits a registration into someone else's name: it ends one row and starts another, so the history stays readable.

Notes on the list filters in this file (all four areas):

- Text search (`q`) is `ILIKE '%term%'` on the trimmed term. `%` and `_` typed by the user are not escaped, so they act as wildcards. Where `q` also matches a party id, the term (with a leading `#` and any `%` removed) must be all digits and is compared to `party_pk` **exactly**; a non-numeric term never matches an id.
- Boolean-style filters (`current`, `open`, `overdue`, `unclassified`, `nonzero`) only take effect when the value is exactly `1`. Any other value (`true`, `yes`, `0`) is ignored.

### GET /api/admin/crm/instances

Lists product instances with their product, project, class, current owner name and number of registrations.

**Permission:** READ on `/admin/crm/products`.

**Path parameters** None.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `page` | integer | no | 1 | Page number, minimum 1. |
| `limit` | integer | no | 20 | Rows per page, clamped to 1..200. |
| `sort` | string | no | `product_instance_id` | Allowed: `product_instance_id`, `created_at`. `created_at` orders by `instance.created_at`; anything else orders by `instance.product_instance_id`. |
| `dir` | string | no | `desc` | `desc`, or anything else for ascending. |
| `q` | string | no | | ILIKE contains-match on `external_product_instance_id`, `serial_number`, `imei` or the catalogue `product_name`. |
| `project_id` | integer | no | | Exact match on the instance's project. |
| `instance_kind` | string | no | | Exact match: `DEVICE`, `LICENCE` or `ENTITLEMENT`. |
| `status` | string | no | | Exact match: `ACTIVE`, `LOST`, `STOLEN`, `SCRAPPED`, `VOID`, `EXPIRED`. |
| `product_class_id` | integer | no | | Exact match on the catalogue product's class. Sub-classes are **not** included. |

**Request body** None.

**Response** `200` - `data` is `{ rows, total, page, limit, summary: null }`. Each row:

| field | type | notes |
|---|---|---|
| `product_instance_id` | string | bigint id. |
| `product_id` | string | Catalogue product. |
| `project_id` | integer | |
| `external_product_instance_id` | string | The serial/IMEI/key reference, unique per project. |
| `instance_kind` | string | `DEVICE`, `LICENCE`, `ENTITLEMENT`. |
| `serial_number` | string or null | |
| `imei` | string or null | |
| `license_key_hash` | string or null | SHA-256 hex of the licence key (the key itself is never stored). |
| `bound_instance_id` | string or null | For a licence: the device it unlocks. |
| `provider_party_pk` | string or null | |
| `valid_until` | string or null | timestamptz. |
| `manufactured_at` | string or null | date, `YYYY-MM-DD`. |
| `batch_code` | string or null | |
| `activated_at` | string or null | timestamptz. |
| `status` | string | `ACTIVE`, `LOST`, `STOLEN`, `SCRAPPED`, `VOID`, `EXPIRED`. |
| `created_at`, `updated_at` | string | timestamptz. |
| `product_name`, `product_code` | string | From the catalogue. |
| `project_code` | string | |
| `class_code`, `class_name` | string or null | Null when the product has no class. |
| `holder_name` | string or null | Display name of one current `OWNER` or `LICENSEE` registration, if any. |
| `registration_cnt` | integer | Number of registrations ever made for the instance (current and ended). |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      {
        "product_instance_id": "5012",
        "product_id": "88",
        "project_id": 1,
        "external_product_instance_id": "356789104455671",
        "instance_kind": "DEVICE",
        "serial_number": "356789104455671",
        "imei": "356789104455671",
        "license_key_hash": null,
        "bound_instance_id": null,
        "provider_party_pk": null,
        "valid_until": "2027-03-01T00:00:00.000Z",
        "manufactured_at": "2025-11-20",
        "batch_code": "B2511",
        "activated_at": "2026-03-01T09:12:00.000Z",
        "status": "ACTIVE",
        "created_at": "2026-03-01T09:12:00.000Z",
        "updated_at": "2026-03-01T09:12:00.000Z",
        "product_name": "Crystal X5 128GB",
        "product_code": "X5-128",
        "project_code": "CRYSTAL",
        "class_code": "PHONE",
        "class_name": "Phones",
        "holder_name": "Li Wei",
        "registration_cnt": 1
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "summary": null
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `common.isNotAValue` | A numeric filter (`project_id`, `product_class_id`) is not a number. |
| 403 | `common.permissionDenied` | Role lacks READ on the page. |

### GET /api/admin/crm/instances/:id

One instance with its full holding history, the transfer requests against it, its service cases and the licences bound to it.

**Permission:** READ on `/admin/crm/products`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | integer | `product_instance_id`. |

**Query parameters** None.

**Request body** None.

**Response** `200` - `data` is an object:

| field | type | notes |
|---|---|---|
| `instance` | object | Every instance column (as in the list row) plus `product_name`, `product_code`, `project_code`, `class_code`, `class_name`, and `bound_external_id` (the `external_product_instance_id` of the bound device, or null). No `holder_name`/`registration_cnt`. |
| `registrations` | array | Every registration of this instance, newest `valid_from` first. Same row shape as `GET /registrations`. |
| `transfers` | array | Every transfer request for this instance, newest `requested_at` first. Same row shape as `GET /transfers`. |
| `cases` | array | Up to 50 service cases whose `related_product_instance_id` is this instance, newest `received_at` first. Each: `case_id` (string), `external_case_id`, `received_at`, `closed_at`, `status_name`, `is_terminal` (boolean), `case_type_name`. |
| `licences` | array | Instances whose `bound_instance_id` is this one. Each: `product_instance_id`, `external_product_instance_id`, `status`, `valid_until`, `product_name`. |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "instance": {
      "product_instance_id": "5012",
      "product_id": "88",
      "project_id": 1,
      "external_product_instance_id": "356789104455671",
      "instance_kind": "DEVICE",
      "serial_number": "356789104455671",
      "imei": "356789104455671",
      "license_key_hash": null,
      "bound_instance_id": null,
      "provider_party_pk": null,
      "valid_until": null,
      "manufactured_at": null,
      "batch_code": null,
      "activated_at": null,
      "status": "ACTIVE",
      "created_at": "2026-03-01T09:12:00.000Z",
      "updated_at": "2026-03-01T09:12:00.000Z",
      "product_name": "Crystal X5 128GB",
      "product_code": "X5-128",
      "project_code": "CRYSTAL",
      "class_code": "PHONE",
      "class_name": "Phones",
      "bound_external_id": null
    },
    "registrations": [
      { "product_registration_id": "9001", "party_pk": "1042", "party_name": "Li Wei", "relationship_code": "OWNER",
        "registration_status": "ACTIVE", "valid_from": "2026-03-01T09:12:00.000Z", "valid_to": null }
    ],
    "transfers": [],
    "cases": [
      { "case_id": "301", "external_case_id": "RT-2026-0441", "received_at": "2026-06-02T03:00:00.000Z",
        "closed_at": null, "status_name": "In repair", "is_terminal": false, "case_type_name": "Repair" }
    ],
    "licences": []
  }
}
```

(The registration row above is shortened; the real rows carry every column listed under `GET /registrations`.)

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `common.isNotAValue` | `id` is not a number. |
| 403 | `common.permissionDenied` | Role lacks READ on the page. |
| 404 | `common.notFound` | No such instance. |

### PUT /api/admin/crm/instances/:id

Changes an instance's status or its descriptive fields. Only the fields present in the body are written. The change is audited.

**Permission:** WRITE on `/admin/crm/products`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | integer | `product_instance_id`. |

**Query parameters** None.

**Request body** (at least one field)

| field | type | required | rules |
|---|---|---|---|
| `status` | string | no | One of `ACTIVE`, `LOST`, `STOLEN`, `SCRAPPED`, `VOID`, `EXPIRED`; anything else is refused. |
| `serial_number` | string or null | no | `""` stores null. Max 100 characters (database). |
| `imei` | string or null | no | `""` stores null. Max 20 characters (database). |
| `batch_code` | string or null | no | `""` stores null. Max 40 characters (database). |
| `manufactured_at` | string or null | no | Date. `""` stores null. |
| `valid_until` | string or null | no | Timestamp. `""` stores null. |
| `activated_at` | string or null | no | Timestamp. `""` stores null. |

Other fields (`external_product_instance_id`, `product_id`, `bound_instance_id`, ...) are ignored. No other validation is done in code; values are passed to Postgres as they are.

**Response** `200` (message `common.updated`) - `data` is the updated `crm_product_instance` row (all its columns, as in the list row but without the joined names).

```json
{
  "success": true,
  "message": "updated",
  "data": {
    "product_instance_id": "5012",
    "product_id": "88",
    "project_id": 1,
    "external_product_instance_id": "356789104455671",
    "instance_kind": "DEVICE",
    "serial_number": "356789104455671",
    "imei": "356789104455671",
    "license_key_hash": null,
    "bound_instance_id": null,
    "provider_party_pk": null,
    "valid_until": null,
    "manufactured_at": null,
    "batch_code": null,
    "activated_at": null,
    "status": "LOST",
    "created_at": "2026-03-01T09:12:00.000Z",
    "updated_at": "2026-10-11T02:30:00.000Z"
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `crm.common.notAStatusYouCanSet` | `status` is not one of the six values. |
| 400 | `common.nothingToUpdate` | None of the accepted fields is present. |
| 400 | `common.isNotAValue` | `id` is not a number. |
| 400 | `crm.settings.aValueIsTooLong` | `serial_number`, `imei` or `batch_code` longer than its column (SQLSTATE 22001, CRM router handler). |
| 403 | `common.permissionDenied` | Role lacks WRITE on the page. |
| 404 | `common.notFound` | No such instance. |
| 500 | `common.internalServerError` | A date or timestamp the database cannot parse (that SQLSTATE is not mapped). |

### GET /api/admin/crm/registrations

Lists product registrations (who holds which instance, how, and when) across all customers.

**Permission:** READ on `/admin/crm/products`.

**Path parameters** None.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `page` | integer | no | 1 | |
| `limit` | integer | no | 20 | Clamped 1..200. |
| `sort` | string | no | `registered_at` | Allowed and honoured: `registered_at`, `valid_from`, `valid_to` (each on the registration). |
| `dir` | string | no | `desc` | `desc`, or anything else for ascending. |
| `q` | string | no | | ILIKE contains-match on instance `external_product_instance_id`, `serial_number`, `imei`, the party's `display_name`, the catalogue `product_name`; or exact party id (digits only, optional `#`). |
| `project_id` | integer | no | | Exact match on the registration's project. |
| `relationship_code` | string | no | | Exact match, e.g. `OWNER`, `USER`, `REGISTERED_USER`, `LESSEE`, `LICENSEE`. |
| `registration_status` | string | no | | Exact match: `ACTIVE`, `ENDED`, `CANCELLED`. |
| `product_class_id` | integer | no | | Exact match on the product's class (no sub-classes). |
| `party_pk` | integer | no | | Exact match on the holder. |
| `current` | string | no | | `1` keeps only registrations with `valid_to` null (holding now). |

**Request body** None.

**Response** `200` - `data` is `{ rows, total, page, limit, summary: null }`. Each row:

| field | type | notes |
|---|---|---|
| `product_registration_id` | string | |
| `party_pk` | string | The holder. |
| `product_instance_id` | string | |
| `relationship_type_id` | integer | |
| `relationship_code` | string | |
| `project_id` | integer | |
| `registration_channel` | string or null | `APP`, `WEB`, `AGENCY`, `CONSOLE`, `IMPORT`, `TRANSFER`. |
| `registered_at_service_center_id` | string or null | |
| `purchase_purpose_id`, `usage_type_id`, `acquisition_type_id` | integer or null | Vocabulary ids. |
| `previous_owner_party_pk` | string or null | |
| `related_transaction_id`, `transfer_id` | string or null | |
| `purchase_date` | string or null | `YYYY-MM-DD`. |
| `purchase_place` | string or null | |
| `sim_cid` | string or null | |
| `registration_status` | string | `ACTIVE`, `ENDED`, `CANCELLED`. |
| `end_reason_code` | string or null | Set when ended. |
| `registered_at`, `valid_from` | string | timestamptz. |
| `valid_to` | string or null | Null = current. |
| `source_record_id` | string or null | Import reference. |
| `crystal_registered_product_id` | integer or null | Link to Crystal's `registered_products`. |
| `created_at`, `updated_at` | string | |
| `party_name` | string | Holder's display name. |
| `external_product_instance_id`, `serial_number`, `imei`, `instance_kind` | string / null | From the instance. |
| `product_name`, `product_code` | string | |
| `class_code`, `class_name` | string or null | |
| `project_code` | string | |
| `relationship_name` | string | |
| `registered_at_location_name` | string or null | Service centre name. |
| `previous_owner_name` | string or null | |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      {
        "product_registration_id": "9001",
        "party_pk": "1042",
        "product_instance_id": "5012",
        "relationship_type_id": 1,
        "relationship_code": "OWNER",
        "project_id": 1,
        "registration_channel": "CONSOLE",
        "registered_at_service_center_id": null,
        "purchase_purpose_id": 1,
        "usage_type_id": null,
        "acquisition_type_id": null,
        "previous_owner_party_pk": null,
        "related_transaction_id": null,
        "transfer_id": null,
        "purchase_date": "2026-02-27",
        "purchase_place": "Main street store",
        "sim_cid": null,
        "registration_status": "ACTIVE",
        "end_reason_code": null,
        "registered_at": "2026-03-01T09:12:00.000Z",
        "valid_from": "2026-03-01T09:12:00.000Z",
        "valid_to": null,
        "source_record_id": null,
        "crystal_registered_product_id": null,
        "created_at": "2026-03-01T09:12:00.000Z",
        "updated_at": "2026-03-01T09:12:00.000Z",
        "party_name": "Li Wei",
        "external_product_instance_id": "356789104455671",
        "serial_number": "356789104455671",
        "imei": "356789104455671",
        "instance_kind": "DEVICE",
        "product_name": "Crystal X5 128GB",
        "product_code": "X5-128",
        "class_code": "PHONE",
        "class_name": "Phones",
        "project_code": "CRYSTAL",
        "relationship_name": "Owner",
        "registered_at_location_name": null,
        "previous_owner_name": null
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "summary": null
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `common.isNotAValue` | A numeric filter is not a number. |
| 403 | `common.permissionDenied` | Role lacks READ on the page. |

### POST /api/admin/crm/registrations

Registers a party against a product instance. If no `product_instance_id` is given, the instance is found by its serial/IMEI within the product's project, or created from the catalogue. May pay registration points and may log site activity. All of it runs in one transaction.

**Permission:** WRITE on `/admin/crm/products`.

**Path parameters** None.

**Query parameters** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `party_pk` | integer | yes | Must exist, and its `party_status` must be `ACTIVE` or `INACTIVE` (a merged party is refused). |
| `relationship_code` | string | no | Default `OWNER`. Must be a row of `crm_product_relationship_type` (seeded: `OWNER`, `USER`, `REGISTERED_USER`, `LESSEE`, `LICENSEE`). |
| `registration_channel` | string | no | Default `CONSOLE`. One of `APP`, `WEB`, `AGENCY`, `CONSOLE`, `IMPORT`, `TRANSFER`. |
| `product_instance_id` | integer | one of this or `product_id` | An existing instance (row is locked). When given, the fields below for creating an instance are ignored. |
| `product_id` | integer | when no `product_instance_id` | Catalogue product; must exist. |
| `external_product_instance_id` | string | when no `product_instance_id` | The instance reference. If absent, `serial_number`, then `imei` is used. Trimmed; must not be empty. |
| `serial_number` | string | no | Used for a new instance. For a new `DEVICE` without it, the external id is used as the serial. |
| `imei` | string | no | Used for a new instance. |
| `license_key` | string | no | For a new instance: stored only as a SHA-256 hash. |
| `bound_instance_id` | integer | no | For a new instance (a licence's device). |
| `valid_until`, `activated_at` | string | no | For a new instance. |
| `project_id` | integer | no | Registration's project. Default: the instance's project. |
| `registered_at_service_center_id` | integer | no | Where it was registered. |
| `purchase_purpose_id`, `usage_type_id`, `acquisition_type_id` | integer | no | Vocabulary ids. |
| `previous_owner_party_pk` | integer | no | Must differ from `party_pk` (database CHECK). |
| `transfer_id` | integer | no | |
| `purchase_date` | string | no | Date. |
| `purchase_place` | string | no | Max 255 (database). |
| `sim_cid` | string | no | Max 12 (database). |
| `registered_at` | string | no | Default: database `now()`. |
| `valid_from` | string | no | Default: `registered_at`, else `now()`. |
| `source_record_id` | string | no | Import reference; unique per project when set. |
| `crystal_registered_product_id` | integer | no | |

Empty-string values for optional fields are stored as null (the code uses `value || null`).

How a new instance is made: the instance kind is `LICENCE` for a `LICENCE` catalogue product, `ENTITLEMENT` for `SOFTWARE` or `SUBSCRIPTION`, otherwise `DEVICE`. If an instance with the same `external_product_instance_id` already exists in the product's project it is reused, provided it belongs to the same product.

Rules checked in order: the instance must not be `VOID` or `SCRAPPED`; if the requested relationship is exclusive (`OWNER`, `LICENSEE`), no current `OWNER` or `LICENSEE` registration may exist on the instance.

Side effects:

- **Points.** Only when the relationship type has `awards_registration_points` (seeded: `OWNER` only). The narrowest active `PRODUCT_REGISTRATION` point rule wins: one for this exact product, then the product's class or the nearest parent class, then a project-wide rule, then a rule with no project. A rule pays only **once per instance**: if any earlier registration of the same instance was already paid by that rule, nothing is paid. Payment is an `EARN` event through the ledger (see Reward points).
- **Site activity.** When the channel is `AGENCY` and `registered_at_service_center_id` is set, a `REGISTRATION_ASSIST` activity is recorded for that centre.
- The holder's class statistics are recalculated after commit, and the creation is audited.

**Response** `200` (message `common.created`) - `data`:

| field | type | notes |
|---|---|---|
| `registration` | object | The inserted `crm_product_registration` row (its own columns only; no joined names). |
| `instance` | object | The instance row used or created. |
| `point_event` | object or null | The `crm_point_event` row if points were paid, else null. |

```json
{
  "success": true,
  "message": "created",
  "data": {
    "registration": {
      "product_registration_id": "9001",
      "party_pk": "1042",
      "product_instance_id": "5012",
      "relationship_type_id": 1,
      "relationship_code": "OWNER",
      "project_id": 1,
      "registration_channel": "CONSOLE",
      "registration_status": "ACTIVE",
      "registered_at": "2026-10-11T02:30:00.000Z",
      "valid_from": "2026-10-11T02:30:00.000Z",
      "valid_to": null,
      "end_reason_code": null
    },
    "instance": {
      "product_instance_id": "5012",
      "product_id": "88",
      "project_id": 1,
      "external_product_instance_id": "356789104455671",
      "instance_kind": "DEVICE",
      "status": "ACTIVE"
    },
    "point_event": {
      "point_event_id": "77120",
      "point_account_id": "3301",
      "point_event_type_id": 1,
      "point_rule_id": 4,
      "project_id": 1,
      "points_delta": "200.000",
      "points_balance_after": "1450.000",
      "related_product_registration_id": "9001",
      "description": "Register a phone",
      "occurred_at": "2026-10-11T02:30:00.000Z"
    }
  }
}
```

(Rows shortened; each object carries all columns of its table.)

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `crm.common.chooseACustomer` | `party_pk` missing. |
| 400 | `crm.products.unknownRelationship` | `relationship_code` is not a known relationship type. |
| 400 | `crm.common.unknownChannel` | `registration_channel` is not one of the six. |
| 400 | `crm.products.chooseAProduct` | No `product_instance_id`, and `product_id` missing or unknown. |
| 400 | `crm.products.aSerialOrImeiIsRequired` | No `product_instance_id` and no external id / serial / IMEI. |
| 400 | `crm.settings.aValueIsTooLong` | A text field (serial, IMEI, `purchase_place`, `sim_cid`, ...) is longer than its column (SQLSTATE 22001). |
| 400 | `common.valueFailedAValidation` | A database CHECK failed, e.g. `previous_owner_party_pk` equals `party_pk`, or `valid_from` later than an existing `valid_to`. |
| 403 | `common.permissionDenied` | Role lacks WRITE on the page. |
| 404 | `common.notFound` | `party_pk` or `product_instance_id` does not exist. |
| 409 | `crm.common.thisPartyWasMerged` | The party is not `ACTIVE`/`INACTIVE`. |
| 409 | `crm.products.thisProductIsOutOfService` | Instance status is `VOID` or `SCRAPPED`. |
| 409 | `crm.products.thisProductAlreadyHasAnOwner` | Exclusive relationship requested and someone holds `OWNER`/`LICENSEE` now. Text names the holder: "this product already belongs to {holder}". |
| 409 | `crm.products.thatSerialBelongsToAnotherProduct` | The external id is already used in that project by a different product. |
| 409 | `crm.products.someoneElseHoldsThisProduct` | Race: the unique index `uq_crm_reg_one_owner` caught a second current owner. |
| 409 | `crm.products.thisCustomerAlreadyHoldsItThatWay` | This party already has a current registration of this relationship type on the instance (`uq_crm_reg_current`). |
| 409 | `crm.products.thatSerialIsAlreadyKnown` | Race on `uq_crm_instance_ext` while creating the instance. |
| 409 | `common.referencedRecordIsMissing` | A referenced id (service centre, vocabulary id, previous owner, ...) does not exist. |
| 409 | `crm.points.*` | Points could not be paid (e.g. `pointTypeIsInactive`, `pointTypeNeedsAProject`); the whole registration is rolled back. See `POST /point-adjustments`. |

### POST /api/admin/crm/registrations/:id/end

Ends a current registration now (`valid_to` = database `now()`), with a reason.

**Permission:** WRITE on `/admin/crm/products`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | integer | `product_registration_id`. |

**Query parameters** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `end_reason_code` | string | yes | One of `TRANSFER`, `ASSIGNMENT_END`, `CANCELLED`, `LOST`, `SCRAPPED`, `RETURNED`, `EXPIRED`, `MERGE`. |

`registration_status` becomes `CANCELLED` when the reason is `CANCELLED`, otherwise `ENDED`. The instance's own status is not changed (ending with `LOST` does not mark the instance lost). The holder's class statistics are recalculated and the change is audited.

**Response** `200` (message `common.updated`) - `data` is the updated `crm_product_registration` row (own columns only).

```json
{
  "success": true,
  "message": "updated",
  "data": {
    "product_registration_id": "9001",
    "party_pk": "1042",
    "product_instance_id": "5012",
    "relationship_code": "OWNER",
    "registration_status": "ENDED",
    "end_reason_code": "LOST",
    "valid_from": "2026-03-01T09:12:00.000Z",
    "valid_to": "2026-10-11T02:30:00.000Z"
  }
}
```

(Shortened; the row carries every registration column.)

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `crm.products.chooseAnEndReason` | `end_reason_code` missing or not one of the eight. |
| 403 | `common.permissionDenied` | Role lacks WRITE on the page. |
| 404 | `common.notFound` | No such registration. |
| 409 | `crm.products.thisRegistrationHasEnded` | `valid_to` is already set. |

## 15. Transfers

A transfer (`crm_product_transfer`) is a **request** to change who holds an instance. Nothing changes hands when it is created; completing it does, in one transaction.

What each `transfer_kind` does on completion:

| transfer_kind | closes (current registration of) | close reason | opens (new registration for `to_party_pk`) | default acquisition type | `to_party_pk` |
|---|---|---|---|---|---|
| `OWNERSHIP_TRANSFER` | `OWNER` | `TRANSFER` | `OWNER` (with `previous_owner_party_pk` = from party) | `TRANSFER` | required |
| `ASSIGN_USER` | nothing | | `USER` | `COMPANY_ASSIGNED` | required |
| `END_ASSIGNMENT` | `USER` | `ASSIGNMENT_END` | nothing | | not needed |
| `RETURN_TO_OWNER` | `USER` | `RETURNED` | nothing | | not needed |
| `LEASE_START` | nothing | | `LESSEE` | none | required |
| `LEASE_END` | `LESSEE` | `ASSIGNMENT_END` | nothing | | not needed |
| `LICENCE_REBIND` | nothing | | nothing; instead the licence's `bound_instance_id` is set to `to_instance_id` | | not needed |

A registration opened by a transfer has channel `TRANSFER`, `transfer_id` set, the transfer's service centre as `registered_at_service_center_id`, and the transfer's `acquisition_type_id` if given, else the default above. It does **not** pay registration points.

**Transfer state machine**

```
             +--> ACCEPTED --+--> COMPLETED
             |               +--> CANCELLED
             |               +--> EXPIRED
REQUESTED ---+--> REJECTED
             +--> CANCELLED
             +--> COMPLETED
             +--> EXPIRED
```

| from | allowed to |
|---|---|
| `REQUESTED` | `ACCEPTED`, `REJECTED`, `CANCELLED`, `COMPLETED`, `EXPIRED` |
| `ACCEPTED` | `COMPLETED`, `CANCELLED`, `EXPIRED` |
| `REJECTED`, `CANCELLED`, `COMPLETED`, `EXPIRED` | nothing (terminal) |

- `REQUESTED` can go straight to `COMPLETED`; acceptance is optional.
- Moving to `ACCEPTED` or `REJECTED` stamps `responded_at`. Moving to `COMPLETED` stamps `completed_at` and performs the effect above.
- `EXPIRED` is only ever set by this endpoint. Nothing in this code expires a request automatically when `expires_at` passes.
- Only one **open** (`REQUESTED` or `ACCEPTED`) request per instance and kind may exist (unique index `uq_crm_transfer_open`).

### GET /api/admin/crm/transfers

Lists transfer requests.

**Permission:** READ on `/admin/crm/transfers`.

**Path parameters** None.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `page` | integer | no | 1 | |
| `limit` | integer | no | 20 | Clamped 1..200. |
| `sort` | string | no | `requested_at` | Allowed: `requested_at`, `completed_at`. `completed_at` orders by `transfer.completed_at`; anything else by `transfer.requested_at`. |
| `dir` | string | no | `desc` | `desc`, or anything else for ascending. |
| `q` | string | no | | ILIKE contains-match on instance `external_product_instance_id`, `serial_number`, from-party `display_name`, to-party `display_name`; or exact from/to party id (digits only, optional `#`). |
| `status` | string | no | | Exact match: `REQUESTED`, `ACCEPTED`, `REJECTED`, `CANCELLED`, `COMPLETED`, `EXPIRED`. |
| `transfer_kind` | string | no | | Exact match on one of the seven kinds. |
| `open` | string | no | | `1` keeps only `REQUESTED` and `ACCEPTED`. Combined with `status` by AND. |

**Request body** None.

**Response** `200` - `data` is `{ rows, total, page, limit, summary: null }`. Each row:

| field | type | notes |
|---|---|---|
| `product_transfer_id` | string | |
| `product_instance_id` | string | |
| `transfer_kind` | string | |
| `from_party_pk`, `to_party_pk` | string or null | |
| `to_instance_id` | string or null | For `LICENCE_REBIND`. |
| `acquisition_type_id` | integer or null | |
| `requested_by_type` | string | Console requests are always `MANAGER`. |
| `requested_by_party_pk` | string or null | |
| `requested_by_manager_id` | integer or null | |
| `handled_at_service_center_id` | string or null | |
| `related_transaction_id` | string or null | |
| `status` | string | |
| `reason` | string or null | Up to 500 characters. |
| `requested_at` | string | |
| `expires_at`, `responded_at`, `completed_at` | string or null | |
| `closed_registration_id`, `created_registration_id` | string or null | Set on completion. |
| `created_at`, `updated_at` | string | |
| `external_product_instance_id`, `serial_number`, `instance_kind` | string / null | From the instance. |
| `product_name` | string | |
| `from_name`, `to_name` | string or null | Party display names. |
| `to_instance_external_id` | string or null | |
| `handled_at_location_name` | string or null | Service centre name. |
| `requested_by_manager_name` | string or null | |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      {
        "product_transfer_id": "140",
        "product_instance_id": "5012",
        "transfer_kind": "OWNERSHIP_TRANSFER",
        "from_party_pk": "1042",
        "to_party_pk": "2210",
        "to_instance_id": null,
        "acquisition_type_id": null,
        "requested_by_type": "MANAGER",
        "requested_by_party_pk": null,
        "requested_by_manager_id": 7,
        "handled_at_service_center_id": "12",
        "related_transaction_id": null,
        "status": "REQUESTED",
        "reason": "Sold to a relative",
        "requested_at": "2026-10-10T06:00:00.000Z",
        "expires_at": null,
        "responded_at": null,
        "completed_at": null,
        "closed_registration_id": null,
        "created_registration_id": null,
        "created_at": "2026-10-10T06:00:00.000Z",
        "updated_at": "2026-10-10T06:00:00.000Z",
        "external_product_instance_id": "356789104455671",
        "serial_number": "356789104455671",
        "instance_kind": "DEVICE",
        "product_name": "Crystal X5 128GB",
        "from_name": "Li Wei",
        "to_name": "Li Na",
        "to_instance_external_id": null,
        "handled_at_location_name": "Downtown Service Centre",
        "requested_by_manager_name": "Zhang Min"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "summary": null
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 403 | `common.permissionDenied` | Role lacks READ on the page. |

### POST /api/admin/crm/transfers

Records a transfer request in status `REQUESTED`. The "from" party is worked out from the current registrations, so a request can only move a product away from whoever actually holds it.

**Permission:** WRITE on `/admin/crm/transfers`.

**Path parameters** None.

**Query parameters** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `transfer_kind` | string | yes | One of `OWNERSHIP_TRANSFER`, `ASSIGN_USER`, `END_ASSIGNMENT`, `RETURN_TO_OWNER`, `LEASE_START`, `LEASE_END`, `LICENCE_REBIND`. |
| `product_instance_id` | integer | yes | Must exist. |
| `to_party_pk` | integer | for `OWNERSHIP_TRANSFER`, `ASSIGN_USER`, `LEASE_START` | Must differ from the from party (database CHECK). |
| `from_party_pk` | integer | no | See below. |
| `to_instance_id` | integer | for `LICENCE_REBIND` | The device the licence moves to. |
| `acquisition_type_id` | integer | no | Overrides the kind's default acquisition type on completion. |
| `handled_at_service_center_id` | integer | no | |
| `reason` | string | no | Cut to 500 characters. |
| `expires_at` | string | no | Timestamp; informational only. |

How `from_party_pk` is decided:

- Kinds that close a relationship (`OWNERSHIP_TRANSFER`, `END_ASSIGNMENT`, `RETURN_TO_OWNER`, `LEASE_END`): the current registration of that relationship (`OWNER`, `USER`, `USER`, `LESSEE`) is looked up, newest `valid_from` first. If `from_party_pk` is sent, the lookup is limited to that party. If none is found the request is refused. The stored `from_party_pk` is the holder found.
- `ASSIGN_USER` and `LEASE_START`: the stored `from_party_pk` is the current `OWNER`, or null if there is none. A `from_party_pk` in the body is ignored.
- `LICENCE_REBIND`: `from_party_pk` from the body is stored as is (or null). The instance must be a `LICENCE`.

`requested_by_type` is always `MANAGER` and `requested_by_manager_id` is the signed-in manager. The creation is audited.

**Response** `200` (message `common.created`) - `data` is the inserted `crm_product_transfer` row (own columns only, as in the list row without the joined names).

```json
{
  "success": true,
  "message": "created",
  "data": {
    "product_transfer_id": "141",
    "product_instance_id": "5012",
    "transfer_kind": "OWNERSHIP_TRANSFER",
    "from_party_pk": "1042",
    "to_party_pk": "2210",
    "to_instance_id": null,
    "acquisition_type_id": null,
    "requested_by_type": "MANAGER",
    "requested_by_party_pk": null,
    "requested_by_manager_id": 7,
    "handled_at_service_center_id": null,
    "related_transaction_id": null,
    "status": "REQUESTED",
    "reason": "Sold to a relative",
    "requested_at": "2026-10-11T02:30:00.000Z",
    "expires_at": null,
    "responded_at": null,
    "completed_at": null,
    "closed_registration_id": null,
    "created_registration_id": null,
    "created_at": "2026-10-11T02:30:00.000Z",
    "updated_at": "2026-10-11T02:30:00.000Z"
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `crm.products.chooseWhatShouldHappen` | `transfer_kind` missing or unknown. |
| 400 | `crm.products.chooseTheNewDevice` | `LICENCE_REBIND` without `to_instance_id`. |
| 400 | `crm.products.chooseWhoReceivesIt` | Kind opens a relationship and `to_party_pk` is missing. |
| 400 | `common.valueFailedAValidation` | `from_party_pk` equals `to_party_pk` (CHECK `chk_crm_transfer_parties`). |
| 403 | `common.permissionDenied` | Role lacks WRITE on the page. |
| 404 | `common.notFound` | No such instance. |
| 409 | `crm.products.nobodyHoldsItThatWay` | Closing kind, and nobody (or not the given `from_party_pk`) currently holds the instance that way. |
| 409 | `crm.products.onlyALicenceCanBeRebound` | `LICENCE_REBIND` on an instance that is not a `LICENCE`. |
| 409 | `crm.products.aRequestIsAlreadyOpen` | An open request of the same kind already exists for this instance. |
| 409 | `common.referencedRecordIsMissing` | `to_party_pk`, `to_instance_id`, service centre or acquisition type does not exist. |

### POST /api/admin/crm/transfers/:id/status

Moves a transfer request to a new status, following the state machine above. Completing it ends and/or starts registrations in the same transaction.

**Permission:** WRITE on `/admin/crm/transfers`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | integer | `product_transfer_id`. |

**Query parameters** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `status` | string | yes | Must be an allowed next status from the current one (see the table). Anything else, including an unknown value or the same status, is refused. |
| `reason` | string | no | If non-empty, **replaces** the stored `reason` (cut to 500 characters). |

On `COMPLETED`:

1. If the kind closes a relationship, the current registration of that relationship (limited to the transfer's `from_party_pk` when set) is locked and ended with the kind's close reason. Its id goes into `closed_registration_id`. If none exists any more, the whole move is refused.
2. If the kind opens a relationship, a new registration is inserted for `to_party_pk` (see the table at the top of this area). Its id goes into `created_registration_id`.
3. For `LICENCE_REBIND`, the licence instance's `bound_instance_id` is set to `to_instance_id`.
4. After commit, class statistics are recalculated for the from and to parties.

Every move is audited.

**Response** `200` (message `common.updated`) - `data` is the updated `crm_product_transfer` row (own columns only).

```json
{
  "success": true,
  "message": "updated",
  "data": {
    "product_transfer_id": "141",
    "product_instance_id": "5012",
    "transfer_kind": "OWNERSHIP_TRANSFER",
    "from_party_pk": "1042",
    "to_party_pk": "2210",
    "status": "COMPLETED",
    "reason": "Sold to a relative",
    "requested_at": "2026-10-11T02:30:00.000Z",
    "responded_at": null,
    "completed_at": "2026-10-11T03:05:00.000Z",
    "closed_registration_id": "9001",
    "created_registration_id": "9044"
  }
}
```

(Shortened; the row carries every transfer column.)

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `common.valueFailedAValidation` | A database CHECK failed while opening the new registration (e.g. previous owner equals new owner). |
| 403 | `common.permissionDenied` | Role lacks WRITE on the page. |
| 404 | `common.notFound` | No such transfer. |
| 409 | `crm.common.cannotMoveFromTo` | The move is not allowed. Text: "cannot move from {from} to {to}". |
| 409 | `crm.products.nobodyHoldsItThatWay` | Completing a closing kind, but the relationship is no longer held. |
| 409 | `crm.products.someoneElseHoldsThisProduct` | Completing would create a second current `OWNER` (for example the old owner's registration was already ended and someone else registered meanwhile). |
| 409 | `crm.products.thisCustomerAlreadyHoldsItThatWay` | The receiving party already holds the instance with that relationship. |

## 16. Service cases

A service case (`crm_service_case`) is the CRM's summary of one service event: who, what for, where, how long, how it ended. Cases imported from a Crystal repair ticket (`crystal_repair_ticket_id` set) are read-only here apart from their classification. Statuses are rows of `crm_service_status` (seeded in order: `RECEIVED`, `DIAGNOSING`, `WAITING_PARTS`, `WAITING_APPROVAL`, `IN_REPAIR`, `QUALITY_CHECK`, `READY`, then terminal `CLOSED` and `CANCELLED`).

### GET /api/admin/crm/cases

Lists service cases with names for the party, type, status, priority, centre and product.

**Permission:** READ on `/admin/crm/service-cases`.

**Path parameters** None.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `page` | integer | no | 1 | |
| `limit` | integer | no | 20 | Clamped 1..200. |
| `sort` | string | no | `received_at` | Allowed and honoured: `received_at`, `due_at`, `closed_at`. |
| `dir` | string | no | `desc` | `desc`, or anything else for ascending. Nulls (e.g. open cases with no `closed_at`) follow Postgres defaults: last ascending, first descending. |
| `q` | string | no | | ILIKE contains-match on `external_case_id`, `title`, the party's `display_name`, the linked instance's `serial_number`; or exact party id (digits only, optional `#`). |
| `project_id` | integer | no | | Exact match. |
| `case_type_id` | integer | no | | Exact match. |
| `service_status_id` | integer | no | | Exact match. |
| `service_center_id` | integer | no | | Exact match. |
| `party_pk` | integer | no | | Exact match. |
| `open` | string | no | | `1`: only cases whose status is not terminal. |
| `overdue` | string | no | | `1`: not terminal and `due_at` earlier than now. |
| `unclassified` | string | no | | `1`: only cases with no classification row. |

**Request body** None.

**Response** `200` - `data` is `{ rows, total, page, limit, summary: null }`. Each row:

| field | type | notes |
|---|---|---|
| `case_id` | string | |
| `party_pk` | string | |
| `project_id` | integer | |
| `external_case_id` | string or null | |
| `crystal_repair_ticket_id` | integer or null | Set when the case mirrors a Crystal repair ticket. |
| `title` | string or null | |
| `received_at` | string | |
| `due_at`, `completed_at`, `closed_at` | string or null | |
| `is_warranty` | boolean or null | |
| `satisfaction_rating` | integer or null | 1..5. |
| `total_cost`, `customer_paid_amount` | string or null | numeric(20,4). |
| `currency_code` | string or null | |
| `reception_channel_code` | string or null | |
| `service_center_id` | string or null | |
| `case_type_id`, `service_status_id` | integer | |
| `service_priority_id` | integer or null | |
| `party_name` | string | |
| `project_code` | string | |
| `case_type_code`, `case_type_name` | string | |
| `status_code`, `status_name` | string | |
| `is_terminal` | boolean | |
| `priority_code`, `priority_name` | string or null | |
| `service_center_name` | string or null | |
| `external_product_instance_id`, `product_name` | string or null | From the related instance. |
| `is_classified` | boolean | Whether a classification row exists. |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      {
        "case_id": "301",
        "party_pk": "1042",
        "project_id": 1,
        "external_case_id": null,
        "crystal_repair_ticket_id": null,
        "title": "Screen flickers after update",
        "received_at": "2026-10-09T02:00:00.000Z",
        "due_at": "2026-10-16T02:00:00.000Z",
        "completed_at": null,
        "closed_at": null,
        "is_warranty": true,
        "satisfaction_rating": null,
        "total_cost": null,
        "customer_paid_amount": null,
        "currency_code": null,
        "reception_channel_code": "WALK_IN",
        "service_center_id": "12",
        "case_type_id": 1,
        "service_status_id": 2,
        "service_priority_id": 2,
        "party_name": "Li Wei",
        "project_code": "CRYSTAL",
        "case_type_code": "REPAIR",
        "case_type_name": "Repair",
        "status_code": "DIAGNOSING",
        "status_name": "Diagnosing",
        "is_terminal": false,
        "priority_code": "NORMAL",
        "priority_name": "Normal",
        "service_center_name": "Downtown Service Centre",
        "external_product_instance_id": "356789104455671",
        "product_name": "Crystal X5 128GB",
        "is_classified": false
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "summary": null
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `common.isNotAValue` | A numeric filter is not a number. |
| 403 | `common.permissionDenied` | Role lacks READ on the page. |

### POST /api/admin/crm/cases

Opens a service case directly in the CRM (a complaint, an enquiry, another project's case).

**Permission:** WRITE on `/admin/crm/service-cases`.

**Path parameters** None.

**Query parameters** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `party_pk` | integer | yes | Must exist. |
| `case_type_id` | integer | yes | Must exist. |
| `project_id` | integer | yes | |
| `service_status_id` | integer | no | Default: the status with the lowest `sequence_no` (seeded: `RECEIVED`). See note below. |
| `received_at` | string | no | Default: now. |
| `external_case_id` | string | no | Unique per project when set. |
| `service_center_id` | integer | no | |
| `service_priority_id` | integer | no | |
| `reception_channel_code` | string | no | One of `WALK_IN`, `MAIL_IN`, `ON_SITE`, `COURIER`, `PHONE`, `APP`, `WEB`, `AGENCY`. |
| `related_product_instance_id` | integer | no | |
| `is_warranty` | boolean | no | |
| `title` | string | no | Max 250 (database). |
| `description` | string | no | |
| `due_at` | string | no | |
| `total_cost`, `customer_paid_amount` | number | no | |
| `currency_code` | string | no | Must exist in `crm_currency`. |
| `satisfaction_rating` | integer | no | 1..5 (database CHECK). |
| `first_response_at` | string | no | |

Optional fields sent as `""` are skipped. Choosing a terminal status here does **not** set `closed_at`. If `service_status_id` is given but does not exist, the code does not check it and the request fails with a 500 (the status lookup returns nothing and is dereferenced).

**Response** `200` (message `common.created`) - `data` is the inserted `crm_service_case` row (all its own columns: those in the list row before `party_name`, plus `service_provider_party_pk`, `related_transaction_id`, `reopened_from_case_id`, `description`, `first_response_at`, `source_created_at`, `source_updated_at`, `ingested_at`, `created_at`, `updated_at`).

```json
{
  "success": true,
  "message": "created",
  "data": {
    "case_id": "302",
    "party_pk": "1042",
    "project_id": 1,
    "external_case_id": null,
    "crystal_repair_ticket_id": null,
    "service_provider_party_pk": null,
    "service_center_id": null,
    "case_type_id": 3,
    "service_status_id": 1,
    "service_priority_id": null,
    "reception_channel_code": "PHONE",
    "related_transaction_id": null,
    "related_product_instance_id": null,
    "reopened_from_case_id": null,
    "is_warranty": null,
    "title": "Asks about warranty length",
    "description": null,
    "received_at": "2026-10-11T02:30:00.000Z",
    "first_response_at": null,
    "due_at": null,
    "completed_at": null,
    "closed_at": null,
    "total_cost": null,
    "customer_paid_amount": null,
    "currency_code": null,
    "satisfaction_rating": null,
    "source_created_at": null,
    "source_updated_at": null,
    "ingested_at": null,
    "created_at": "2026-10-11T02:30:00.000Z",
    "updated_at": "2026-10-11T02:30:00.000Z"
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `crm.serviceCases.customerAndCaseTypeAreRequired` | `party_pk` or `case_type_id` missing. |
| 400 | `crm.common.unknownChannel` | `reception_channel_code` not one of the eight. |
| 400 | `crm.serviceCases.chooseAProject` | `project_id` missing. |
| 400 | `crm.settings.aValueIsTooLong` | `title`, `external_case_id` or another text field is longer than its column (SQLSTATE 22001). |
| 400 | `common.valueFailedAValidation` | A CHECK failed, e.g. `satisfaction_rating` outside 1..5. |
| 403 | `common.permissionDenied` | Role lacks WRITE on the page. |
| 409 | `common.referencedRecordIsMissing` | A referenced id (party, project, case type, centre, priority, instance, currency) does not exist. |
| 409 | `common.duplicatedValue` | `external_case_id` already used in this project (`uq_crm_case_ext` has no specific message). |
| 500 | `common.internalServerError` | `service_status_id` given but unknown (see note). |

### GET /api/admin/crm/cases/:id

One case with its classification and the site activities linked to it.

**Permission:** READ on `/admin/crm/service-cases`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | integer | `case_id`. |

**Query parameters** None.

**Request body** None.

**Response** `200` - `data`:

| field | type | notes |
|---|---|---|
| `case` | object | Every field of a list row, plus `description`, `first_response_at`, `reopened_from_case_id`, `related_product_instance_id`, `related_transaction_id`, `source_created_at`, `source_updated_at`, `ingested_at`, `created_at`, `updated_at`. |
| `classification` | object or null | The `crm_service_case_classification` row (`service_case_classification_id`, `case_id`, `issue_category_id`, `fault_category_id`, `root_cause_id`, `resolution_category_id`, `resolution_text`, `classified_at`, `classified_by_manager_id`) plus `issue_name`, `fault_name`, `root_cause_name`, `resolution_name`, `classified_by_name`. Null if never classified. |
| `activities` | array | Site activities with `related_service_case_id` = this case, oldest first. Each: `service_center_activity_id`, `occurred_at`, `status`, `activity_name`, `service_center_name`. |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "case": {
      "case_id": "301",
      "party_pk": "1042",
      "project_id": 1,
      "title": "Screen flickers after update",
      "status_code": "DIAGNOSING",
      "status_name": "Diagnosing",
      "is_terminal": false,
      "is_classified": true,
      "description": "Flicker at low brightness",
      "first_response_at": "2026-10-09T03:10:00.000Z",
      "related_product_instance_id": "5012",
      "created_at": "2026-10-09T02:00:00.000Z",
      "updated_at": "2026-10-09T03:10:00.000Z"
    },
    "classification": {
      "service_case_classification_id": "88",
      "case_id": "301",
      "issue_category_id": 4,
      "fault_category_id": 9,
      "root_cause_id": null,
      "resolution_category_id": null,
      "resolution_text": null,
      "classified_at": "2026-10-09T03:15:00.000Z",
      "classified_by_manager_id": 7,
      "issue_name": "Display",
      "fault_name": "Firmware",
      "root_cause_name": null,
      "resolution_name": null,
      "classified_by_name": "Zhang Min"
    },
    "activities": [
      { "service_center_activity_id": "6001", "occurred_at": "2026-10-09T02:00:00.000Z", "status": "DONE",
        "activity_name": "Repair intake", "service_center_name": "Downtown Service Centre" }
    ]
  }
}
```

(`case` shortened.)

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `common.isNotAValue` | `id` is not a number. |
| 403 | `common.permissionDenied` | Role lacks READ on the page. |
| 404 | `common.notFound` | No such case. |

### PUT /api/admin/crm/cases/:id

Updates the status and details of a case opened in the CRM. Cases that mirror a Crystal repair ticket are refused.

**Permission:** WRITE on `/admin/crm/service-cases`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | integer | `case_id`. |

**Query parameters** None.

**Request body** (at least one change)

| field | type | required | rules |
|---|---|---|---|
| `service_status_id` | integer | no | Only acted on when it differs from the current status; must exist. |
| `service_center_id`, `service_priority_id`, `reception_channel_code`, `related_product_instance_id`, `is_warranty`, `title`, `description`, `due_at`, `total_cost`, `customer_paid_amount`, `currency_code`, `satisfaction_rating`, `first_response_at` | as in POST | no | Written when present; `""` stores null. `reception_channel_code` is **not** checked against the channel list here (only the database CHECK applies). |

Other fields (`party_pk`, `project_id`, `case_type_id`, `received_at`, `external_case_id`) cannot be changed.

When the status changes:

- to a terminal status: `closed_at` = now; if the new status code is `CLOSED` and `completed_at` is empty, `completed_at` = now too (`CANCELLED` does not set it);
- to a non-terminal status: `closed_at` is cleared (re-opening);
- if the case has no `first_response_at` yet, it is set to now, overriding any `first_response_at` sent in the same body.

**Response** `200` (message `common.updated`) - `data` is the updated `crm_service_case` row (own columns, as in POST).

```json
{
  "success": true,
  "message": "updated",
  "data": {
    "case_id": "302",
    "service_status_id": 8,
    "first_response_at": "2026-10-11T03:00:00.000Z",
    "completed_at": "2026-10-11T03:00:00.000Z",
    "closed_at": "2026-10-11T03:00:00.000Z",
    "satisfaction_rating": 5,
    "updated_at": "2026-10-11T03:00:00.000Z"
  }
}
```

(Shortened; the row carries every case column.)

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `crm.serviceCases.unknownStatus` | `service_status_id` differs from the current one and does not exist. |
| 400 | `crm.settings.aValueIsTooLong` | `title` or another text field is longer than its column (SQLSTATE 22001). |
| 400 | `common.nothingToUpdate` | No editable field present and no status change. |
| 400 | `common.valueFailedAValidation` | A CHECK failed (rating, channel, `closed_at` before `received_at`). |
| 403 | `common.permissionDenied` | Role lacks WRITE on the page. |
| 404 | `common.notFound` | No such case. |
| 409 | `crm.serviceCases.thisCaseFollowsARepairTicket` | The case has a `crystal_repair_ticket_id`; it must be changed on the ticket. |
| 409 | `common.referencedRecordIsMissing` | A referenced id does not exist. |

### PUT /api/admin/crm/cases/:id/classification

Sets the CRM's own classification of a case (issue, fault, root cause, resolution). Allowed on every case, including those that mirror a repair ticket. The whole classification is replaced: a field left out is stored as null.

**Permission:** WRITE on `/admin/crm/service-cases`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | integer | `case_id`. |

**Query parameters** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `issue_category_id` | integer | no | Missing or falsy stores null. |
| `fault_category_id` | integer | no | Same. |
| `root_cause_id` | integer | no | Same. |
| `resolution_category_id` | integer | no | Same. |
| `resolution_text` | string | no | Same. |

`classified_at` is set to now and `classified_by_manager_id` to the signed-in manager. The row is inserted the first time, updated afterwards (one per case). Audited.

**Response** `200` (message `common.updated`) - `data` is the classification row (columns as listed under `GET /cases/:id`, without the joined names).

```json
{
  "success": true,
  "message": "updated",
  "data": {
    "service_case_classification_id": "88",
    "case_id": "301",
    "issue_category_id": 4,
    "fault_category_id": 9,
    "root_cause_id": 2,
    "resolution_category_id": 5,
    "resolution_text": "Firmware reflashed",
    "classified_at": "2026-10-11T03:20:00.000Z",
    "classified_by_manager_id": 7
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 403 | `common.permissionDenied` | Role lacks WRITE on the page. |
| 404 | `common.notFound` | No such case. |
| 409 | `common.referencedRecordIsMissing` | A category / cause / resolution id does not exist. |

## 17. Reward points

Points live in one ledger, `crm_point_event`, but each **point type** is its own currency: a party has one `crm_point_account` per point type, and balances of different types are never added together. `crm_point_account.balance` is a cached total kept in step by `src/services/crm/ledger.js`, the only code path that moves points. For every movement the ledger:

- rounds `points_delta` to 3 decimals (the column scale) and refuses a result of 0;
- requires the event type code to exist, the point type to exist and be active;
- assigns the event to the given project, else the point type's `owner_project_id`, else the `PLATFORM` project, else refuses;
- creates the account on first use and locks it;
- refuses a movement that would make the balance negative;
- inserts the event with `points_balance_after`, then updates `balance`, `lifetime_earned` (positive deltas) and `lifetime_spent` (negative deltas, as a positive number) and `last_event_at`.

A database trigger also requires the sign of `points_delta` to match the event type's direction (`EARN` +, `REDEEM` -, `ADJUST` either).

### GET /api/admin/crm/point-accounts

Lists point accounts (one per party per point type), with totals over all matching accounts.

**Permission:** READ on `/admin/crm/points`.

**Path parameters** None.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `page` | integer | no | 1 | |
| `limit` | integer | no | 20 | Clamped 1..200. |
| `sort` | string | no | `balance` | Allowed and honoured: `balance`, `lifetime_earned`, `last_event_at`. |
| `dir` | string | no | `desc` | `desc`, or anything else for ascending. Default ordering is therefore highest balance first. |
| `q` | string | no | | ILIKE contains-match on the party's `display_name`, or exact party id (digits only, optional `#`). |
| `point_type_id` | integer | no | | Exact match. |
| `party_pk` | integer | no | | Exact match. |
| `nonzero` | string | no | | `1`: only accounts whose balance is not 0. |

**Request body** None.

**Response** `200` - `data` is `{ rows, total, page, limit, summary }`. Each row:

| field | type | notes |
|---|---|---|
| `point_account_id` | string | |
| `party_pk` | string | |
| `point_type_id` | integer | |
| `membership_id` | string or null | |
| `balance`, `lifetime_earned`, `lifetime_spent` | string | numeric(14,3). `balance = lifetime_earned - lifetime_spent`. |
| `last_event_at` | string or null | |
| `updated_at` | string | |
| `party_name` | string | |
| `party_status` | string | |
| `point_type_code`, `point_type_name` | string | |
| `decimal_places` | integer | Display precision of the point type. |

`summary` covers **all** rows matching the filters (not just the page):

| field | type | notes |
|---|---|---|
| `balance` | string | Sum of balances. Note it adds different point types together when no `point_type_id` filter is given. |
| `earned` | string | Sum of `lifetime_earned`. |
| `spent` | string | Sum of `lifetime_spent`. |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      {
        "point_account_id": "3301",
        "party_pk": "1042",
        "point_type_id": 1,
        "membership_id": null,
        "balance": "1450.000",
        "lifetime_earned": "1650.000",
        "lifetime_spent": "200.000",
        "last_event_at": "2026-10-11T02:30:00.000Z",
        "updated_at": "2026-10-11T02:30:00.000Z",
        "party_name": "Li Wei",
        "party_status": "ACTIVE",
        "point_type_code": "CRYSTAL",
        "point_type_name": "Crystal points",
        "decimal_places": 0
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "summary": { "balance": "1450.000", "earned": "1650.000", "spent": "200.000" }
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `common.isNotAValue` | A numeric filter is not a number. |
| 403 | `common.permissionDenied` | Role lacks READ on the page. |

### GET /api/admin/crm/point-events

Lists ledger movements, newest first by default.

**Permission:** READ on `/admin/crm/points`.

**Path parameters** None.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `page` | integer | no | 1 | |
| `limit` | integer | no | 20 | Clamped 1..200. |
| `sort` | string | no | | **Ignored.** Rows are always ordered by `occurred_at`, then `point_event_id`. |
| `dir` | string | no | `desc` | Direction for both order columns: `desc`, or anything else for ascending. |
| `q` | string | no | | ILIKE contains-match on the party's `display_name` or the event `description`, or exact party id (digits only, optional `#`). |
| `point_account_id` | integer | no | | Exact match. |
| `point_type_id` | integer | no | | Exact match on the account's point type. |
| `point_event_type_id` | integer | no | | Exact match. |
| `project_id` | integer | no | | Exact match on the event's project. |

There is no `party_pk` filter here; use `q` with the party id, or `point_account_id`.

**Request body** None.

**Response** `200` - `data` is `{ rows, total, page, limit, summary: null }`. Each row:

| field | type | notes |
|---|---|---|
| `point_event_id` | string | |
| `point_account_id` | string | |
| `point_event_type_id` | integer | |
| `point_rule_id` | integer or null | |
| `project_id` | integer | |
| `points_delta` | string | numeric(14,3), signed. |
| `pay_amount` | string or null | |
| `points_balance_after` | string | Account balance after this movement. |
| `related_transaction_id`, `related_product_registration_id`, `related_reservation_id`, `related_award_id`, `related_service_center_activity_id` | string or null | |
| `performed_by_service_center_id` | string or null | |
| `performed_by_manager_id` | integer or null | |
| `description` | string or null | |
| `device_ref`, `source_table_code`, `external_event_id` | string or null | Import bookkeeping. |
| `ip_address` | string or null | |
| `occurred_at`, `created_at` | string | |
| `party_pk`, `party_name` | string | |
| `point_type_code`, `point_type_name` | string | |
| `event_code`, `event_name` | string | e.g. `EARN` / "Earned". |
| `project_code` | string | |
| `rule_code`, `rule_name` | string or null | |
| `manager_name` | string or null | |
| `service_center_name` | string or null | |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      {
        "point_event_id": "77121",
        "point_account_id": "3301",
        "point_event_type_id": 4,
        "point_rule_id": null,
        "project_id": 1,
        "points_delta": "-50.000",
        "pay_amount": null,
        "points_balance_after": "1400.000",
        "related_transaction_id": null,
        "related_product_registration_id": null,
        "related_reservation_id": null,
        "related_award_id": null,
        "related_service_center_activity_id": null,
        "performed_by_service_center_id": null,
        "performed_by_manager_id": 7,
        "description": "Duplicate award corrected",
        "device_ref": null,
        "source_table_code": null,
        "external_event_id": null,
        "ip_address": "10.0.0.15",
        "occurred_at": "2026-10-11T03:30:00.000Z",
        "created_at": "2026-10-11T03:30:00.000Z",
        "party_pk": "1042",
        "party_name": "Li Wei",
        "point_type_code": "CRYSTAL",
        "point_type_name": "Crystal points",
        "event_code": "ADJUST",
        "event_name": "Manual adjustment",
        "project_code": "CRYSTAL",
        "rule_code": null,
        "rule_name": null,
        "manager_name": "Zhang Min",
        "service_center_name": null
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "summary": null
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `common.isNotAValue` | A numeric filter is not a number. |
| 403 | `common.permissionDenied` | Role lacks READ on the page. |

### GET /api/admin/crm/point-drift

Accounts whose cached balance no longer equals the sum of their ledger events (view `v_crm_point_account_drift`). Should normally be empty. Not paged.

**Permission:** READ on `/admin/crm/points`.

**Path parameters** None.

**Query parameters** None (any are ignored).

**Request body** None.

**Response** `200` - `data` is an array (no paging envelope). Each item:

| field | type | notes |
|---|---|---|
| `point_account_id` | string | |
| `party_pk` | string | |
| `point_type_id` | integer | |
| `balance` | string | The cached balance. |
| `ledger_balance` | string | `SUM(points_delta)` of the account's events (0 if none). |
| `party_name` | string | |
| `point_type_code` | string | |

```json
{
  "success": true,
  "message": "ok",
  "data": [
    {
      "point_account_id": "3307",
      "party_pk": "1188",
      "point_type_id": 1,
      "balance": "500.000",
      "ledger_balance": "450.000",
      "party_name": "Wang Fang",
      "point_type_code": "CRYSTAL"
    }
  ]
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 403 | `common.permissionDenied` | Role lacks READ on the page. |

### POST /api/admin/crm/point-adjustments

Posts a manual adjustment (event type `ADJUST`) to a party's account for one point type. This is the only way to move a balance by hand: balances are never edited and events never deleted, so an error is corrected by a further adjustment.

**Permission:** WRITE on `/admin/crm/points`.

**Path parameters** None.

**Query parameters** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `party_pk` | integer | yes | Must exist (else 409 from the foreign key). |
| `point_type_id` | integer | yes | Must exist and be active. |
| `points_delta` | number | yes | Finite and non-zero, positive or negative. Rounded to 3 decimals; if that rounds to 0 it is refused. A negative value may not take the balance below 0. |
| `description` | string | yes | The reason. Trimmed, must not be empty; stored up to 500 characters. |
| `project_id` | integer | no | Default: the point type's owner project, else the `PLATFORM` project. |

The event records the signed-in manager as `performed_by_manager_id` and the request IP as `ip_address`. The account is created if the party had none for this point type. Audited.

**Response** `200` (message `common.created`) - `data` is the inserted `crm_point_event` row (its own columns, as in the `GET /point-events` row without the joined names).

```json
{
  "success": true,
  "message": "created",
  "data": {
    "point_event_id": "77121",
    "point_account_id": "3301",
    "point_event_type_id": 4,
    "point_rule_id": null,
    "project_id": 1,
    "points_delta": "-50.000",
    "pay_amount": null,
    "points_balance_after": "1400.000",
    "related_transaction_id": null,
    "related_product_registration_id": null,
    "related_reservation_id": null,
    "related_award_id": null,
    "related_service_center_activity_id": null,
    "performed_by_service_center_id": null,
    "performed_by_manager_id": 7,
    "description": "Duplicate award corrected",
    "device_ref": null,
    "source_table_code": null,
    "external_event_id": null,
    "ip_address": "10.0.0.15",
    "occurred_at": "2026-10-11T03:30:00.000Z",
    "created_at": "2026-10-11T03:30:00.000Z"
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `crm.points.customerAndPointTypeAreRequired` | `party_pk` or `point_type_id` missing. |
| 400 | `crm.common.aReasonIsRequired` | `description` missing or blank. |
| 400 | `crm.points.pointsMustNotBeZero` | `points_delta` missing, not a number, 0, or rounds to 0. |
| 400 | `crm.points.unknownPointType` | `point_type_id` does not exist. |
| 400 | `crm.points.unknownPointEvent` | The `ADJUST` event type is missing from the vocabulary (configuration problem). |
| 403 | `common.permissionDenied` | Role lacks WRITE on the page. |
| 409 | `crm.points.pointTypeIsInactive` | The point type is not active. |
| 409 | `crm.points.pointTypeNeedsAProject` | No `project_id`, the point type has no owner project, and there is no `PLATFORM` project. |
| 409 | `crm.points.notEnoughPoints` | The adjustment would make the balance negative. Text: "not enough points: the balance is {balance}, {needed} are needed". |
| 409 | `common.referencedRecordIsMissing` | `party_pk` or `project_id` does not exist. |

## 18. Activity events

Console page: `/admin/crm/events`. Routes: `src/routes/crm.routes.js` (activity events block), handlers `crmController.events.*` in `src/controllers/crm.controller.js`, logic in `src/services/crm/events.service.js`. Points move only through `src/services/crm/ledger.js` (`ledger.post`). `locations.js` is not used by this area.

One event (`crm_event`) covers reservations, lotteries, prize services, puzzles, survey rewards and attendance events. Around it sit:

- **Tiers** (`crm_event_tier`): bands of a qualifying value; decide entries per target and number ranges.
- **Locations** (`crm_event_service_center`): the sites taking part, each with a role.
- **Quotas** (`crm_event_quota`): how many entries exist, per entry type and optionally per tier and/or site.
- **Rewards** (`crm_activity_reward`): what the event hands out, with stock.
- **Targets** (`crm_activity_target`): who may take part and how many entries each may take.
- **Reservations** (`crm_activity_reservation`): the numbered entries; history in `crm_activity_reservation_event`.
- **Awards** (`crm_activity_award`): one reward given to one customer.

### Conventions used in this section

**Types.** The only custom pg type parser is for `date` (returned as `YYYY-MM-DD` text). So `bigint` ids (`event_id`, `party_pk`, `reservation_id`, ...) and all `numeric` columns (`cost_points`, `min_value`, `qualification_value`, `points`, ...) come back as **strings**; `int`/`smallint` columns (`project_id`, `rank_no`, `quota_count`, `used_count`, manager ids, point type ids) come back as numbers; `timestamptz` columns come back as ISO 8601 strings. Counts cast with `::int` in SQL are numbers.

**Every write is audited** (`audit.created/updated/deleted/imported`, page `/admin/crm/events`); this has no effect on the reply.

**Database errors that apply to most writes here** (from `src/middleware/error.js`):

| status | message key | when |
|---|---|---|
| 400 | `common.isRequired` ("{column} is required") | a NOT NULL column was left out on insert |
| 400 | `common.valueFailedAValidation` | a CHECK constraint failed (enum value not in the list, ranges, stock below what is used, and so on) |
| 400 | `common.isNotAValue` | a value of the wrong type, e.g. a non-numeric id in the URL or body |
| 409 | `common.referencedRecordIsMissing` | a referenced row (site, product, point type, tier of this event, customer) does not exist |
| 409 | `common.duplicatedValue` | a unique constraint without a mapped message was hit |

Values longer than a `varchar` column are not checked by the service; Postgres rejects them (SQLSTATE 22001) and the CRM router's own error handler answers `400 crm.settings.aValueIsTooLong`. A clash on a plain unique code column named `crm_<...>_code_key` (such as `event_code`) is `409 crm.settings.thatCodeIsTaken`.

#### Event state machine (`POST /events/:id/status`)

| from | allowed to | extra rule |
|---|---|---|
| `DRAFT` | `APPROVED`, `CANCELLED` | `APPROVED`: the approving manager must not be the creator (409 `crm.common.anotherManagerMustApprove`); records `approved_by_manager_id`, `approved_at` |
| `APPROVED` | `DRAFT`, `TARGETS_FROZEN`, `CANCELLED` | back to `DRAFT` clears `approved_by_manager_id` and `approved_at`. `TARGETS_FROZEN`: unless `eligibility_basis` is `OPEN`, at least one non-revoked target must exist (409 `crm.events.addTargetsBeforeFreezing`) |
| `TARGETS_FROZEN` | `OPEN`, `CANCELLED` | |
| `OPEN` | `CLOSED`, `CANCELLED` | |
| `CLOSED` | `FULFILLED` | no reservation may still be `PENDING`, `RESERVED` or `PAID` (409 `crm.events.reservationsAreStillOpen`, param `n`) |
| `FULFILLED` | none | |
| `CANCELLED` | none | |

Moving to `CANCELLED` first cancels every `PENDING`/`RESERVED`/`PAID` reservation of the event (note "Event cancelled"), in the same transaction, with the same side effects as cancelling them one by one (entries and quota room returned, point cost refunded).

What each event status allows elsewhere:

| action | allowed while the event is |
|---|---|
| edit any field (`PUT /events/:id`) | `DRAFT` |
| edit only `description`, `summary`, `display_at`, `fulfilment_ends_at`, `is_private`, `campaign_id` | `APPROVED`, `TARGETS_FROZEN`, `OPEN`, `CLOSED` |
| add / edit / delete tiers; add targets; build targets | `DRAFT`, `APPROVED` |
| add / remove locations; add / edit quotas | `DRAFT`, `APPROVED`, `TARGETS_FROZEN`, `OPEN` |
| add / edit rewards | `DRAFT`, `APPROVED`, `TARGETS_FROZEN`, `OPEN`, `CLOSED` |
| take a reservation | `OPEN`, and inside `starts_at` .. `ends_at` when set |
| give an award | `OPEN`, `CLOSED` |
| delete a quota or reward; revoke a target; move a reservation or award | any status (not checked) |

#### Reservation state machine (`POST /reservations/:reservationId/status`)

`POST /events/:id/reservations` always creates a reservation directly in `RESERVED`; nothing in this API creates `PENDING` (it exists for imported data).

| from | allowed to | side effects |
|---|---|---|
| `PENDING` | `RESERVED`, `CANCELLED`, `FAILED`, `EXPIRED` | |
| `RESERVED` | `PAID`, `FULFILLED`, `CANCELLED`, `EXPIRED` | |
| `PAID` | `FULFILLED`, `CANCELLED` | |
| `FULFILLED`, `CANCELLED`, `EXPIRED`, `FAILED` | none | |

- `PAID`: sets `paid_at`, and `related_transaction_id` if given.
- `FULFILLED`: sets `fulfilled_at`; stores `product_instance_id` and the site if given. When a site is known (body or the reservation's own), and the activity type `RESERVATION_PICKUP` exists in the vocabulary, a `crm_service_center_activity` row is written for that site.
- `CANCELLED`, `EXPIRED`, `FAILED` release the entry: the target's `used_count` goes down by one (an `EXHAUSTED` target becomes `ELIGIBLE` again) and every matching quota's `used_count` goes down by one. `CANCELLED` and `FAILED` also refund the point cost (a `REFUND` ledger event equal to the `RESERVATION_COST`, once only, allowed even if the point type is now inactive). `EXPIRED` does **not** refund. `CANCELLED` sets `cancelled_at` and `cancel_reason` (the note, first 255 characters).
- Every move writes a history row to `crm_activity_reservation_event`.

#### Award state machine (`POST /awards/:awardId/status`)

A new award starts `PENDING`, except a `POINTS` reward, which is paid at once and stored as `CREDITED`.

| from | allowed to | extra rule |
|---|---|---|
| `PENDING` | `READY`, `DISPATCHED`, `CREDITED`, `FAILED`, `CANCELLED` | |
| `READY` | `PICKED_UP`, `DISPATCHED`, `FAILED`, `CANCELLED` | |
| `DISPATCHED` | `DELIVERED`, `FAILED` | |
| `FAILED` | `PENDING`, `CANCELLED` | |
| `DELIVERED`, `PICKED_UP`, `CREDITED`, `CANCELLED` | none | |

- `CREDITED` only for `fulfilment_method = WALLET` (409 `crm.events.onlyWalletCreditsAreCredited`) and needs `external_credit_ref` (400 `crm.events.giveTheWalletReference`).
- `DISPATCHED` needs a delivery address, already stored or in the body (400 `crm.events.anAddressIsRequired`).
- `DELIVERED`, `PICKED_UP`, `CREDITED` set `fulfilled_at`.
- `CANCELLED` gives one unit of stock back to the reward (`quantity_awarded - 1`). `FAILED` does not.
- `PICKED_UP` with a pickup site, when the activity type `PRIZE_HANDOVER` exists, writes a `crm_service_center_activity` row for that site.
- A `POINTS` award is `CREDITED` from the start, which is terminal: it cannot be cancelled here and its points are not reversed by this API.

#### Event object

What `crm_event` rows look like wherever an event row is returned (`POST /events`, `PUT /events/:id`, `POST /events/:id/status`, and `data.event` in the detail).

| field | type | notes |
|---|---|---|
| event_id | string | bigint |
| event_code | string | max 50, unique |
| event_name | string | max 250 |
| event_type | string | `RESERVATION`, `LOTTERY`, `PRIZE_SERVICE`, `PUZZLE`, `SURVEY_REWARD`, `EVENT_ATTENDANCE` |
| project_id | integer or null | |
| description | string or null | |
| summary | string or null | max 120 |
| approval_no | string or null | max 40 |
| reserved_product_id | string or null | product catalog id |
| eligibility_basis | string | `SEGMENT`, `POINT_RANKING`, `CORPORATE_GRADE`, `PRODUCT_REGISTRATION`, `SERVICE_CENTER_ACTIVITY`, `MANUAL`, `IMPORT`, `OPEN` |
| eligibility_segment_id | string or null | |
| eligibility_rule | object or null | jsonb; keys used by target building are listed under `POST /events/:id/targets/build` |
| ranking_point_type_id | integer or null | |
| ranking_cutoff_at | string or null | timestamp |
| ranking_top_n | integer or null | |
| cost_point_type_id | integer or null | |
| cost_points | string or null | numeric(14,3); points one reservation costs |
| number_prefix, number_suffix | string or null | max 10 each |
| number_start, number_end | integer or null | |
| display_at, starts_at, ends_at, fulfilment_ends_at | string or null | timestamps |
| is_private | boolean | |
| status | string | see the event state machine |
| campaign_id | string or null | |
| external_system_code | string or null | |
| is_test | boolean | |
| created_by_manager_id, approved_by_manager_id | integer or null | |
| approved_at | string or null | |
| legacy_table_code, legacy_key | string or null | set only by imports |
| created_at, updated_at | string | `updated_at` kept by a trigger |

---

### GET /api/admin/crm/events

Lists events, with live counts of targets, reservations and awards for each.

**Permission:** READ on `/admin/crm/events`.

**Path parameters:** None.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| q | string | no | | trimmed; `ILIKE %q%` over `event_code` or `event_name` |
| status | string | no | | exact match on `status` |
| event_type | string | no | | exact match on `event_type` |
| page | integer | no | 1 | |
| limit | integer | no | 20 | clamped 1..200 |
| sort | string | no | `created_at` | `starts_at`, `event_code` or `created_at`; anything else falls back to `created_at` |
| dir | string | no | `desc` | `desc`, anything else is ascending |

**Request body:** None.

**Response** `200` - `data` is `{ rows, total, page, limit, summary: null }`. Each row is every column of the event (see Event object) plus:

| field | type | notes |
|---|---|---|
| project_code | string or null | from `crm_project` |
| target_cnt | integer | targets not `REVOKED` |
| reservation_cnt | integer | reservations not `CANCELLED`, `EXPIRED` or `FAILED` |
| award_cnt | integer | awards not `CANCELLED` |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      {
        "event_id": "12",
        "event_code": "NEWPHONE-2026Q4",
        "event_name": "New phone launch reservations",
        "event_type": "RESERVATION",
        "project_id": 1,
        "eligibility_basis": "POINT_RANKING",
        "cost_point_type_id": 1,
        "cost_points": "100.000",
        "starts_at": "2026-10-20T01:00:00.000Z",
        "ends_at": "2026-10-31T15:00:00.000Z",
        "is_private": false,
        "status": "OPEN",
        "created_by_manager_id": 3,
        "approved_by_manager_id": 5,
        "approved_at": "2026-10-10T08:12:44.000Z",
        "created_at": "2026-10-09T02:00:00.000Z",
        "updated_at": "2026-10-10T08:12:44.000Z",
        "project_code": "CRYSTAL",
        "target_cnt": 500,
        "reservation_cnt": 212,
        "award_cnt": 0
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "summary": null
  }
}
```
(Row shortened; every event column is present.)

**Errors**

| status | message key | when |
|---|---|---|
| 403 | `common.permissionDenied` | role lacks READ on the page |

### POST /api/admin/crm/events

Creates an event in `DRAFT`, owned by the calling manager.

**Permission:** WRITE on `/admin/crm/events`.

**Path parameters:** None.

**Query parameters:** None.

**Request body.** Only the fields below are read; anything else is ignored. An empty string is stored as null.

| field | type | required | rules |
|---|---|---|---|
| event_code | string | yes | max 50; must be unique (duplicate: 409 `common.duplicatedValue`) |
| event_name | string | yes | max 250 |
| event_type | string | yes | one of `RESERVATION`, `LOTTERY`, `PRIZE_SERVICE`, `PUZZLE`, `SURVEY_REWARD`, `EVENT_ATTENDANCE` |
| eligibility_basis | string | yes | one of `SEGMENT`, `POINT_RANKING`, `CORPORATE_GRADE`, `PRODUCT_REGISTRATION`, `SERVICE_CENTER_ACTIVITY`, `MANUAL`, `IMPORT`, `OPEN` |
| eligibility_segment_id | string/integer | when basis is `SEGMENT` | enforced by a CHECK (400 `common.valueFailedAValidation`) |
| eligibility_rule | object or JSON string | no | a string is parsed as JSON (bad JSON: 400 `crm.common.theRuleIsNotValidJson`) |
| ranking_point_type_id | integer | when basis is `POINT_RANKING` | CHECK, together with `ranking_cutoff_at` |
| ranking_cutoff_at | string (timestamp) | when basis is `POINT_RANKING` | |
| ranking_top_n | integer | no | > 0 |
| cost_point_type_id | integer | no | must be given together with `cost_points`, or neither (CHECK) |
| cost_points | number | no | > 0 |
| number_prefix, number_suffix | string | no | max 10 |
| number_start | integer | no | >= 0 |
| number_end | integer | no | >= `number_start` |
| display_at, starts_at, ends_at, fulfilment_ends_at | string (timestamp) | no | `ends_at` >= `starts_at` (CHECK) |
| project_id, description, summary, approval_no, reserved_product_id, is_private, campaign_id, external_system_code, is_test | | no | stored as given; `summary` max 120, `approval_no` max 40 |

`status`, `approved_*` and `created_by_manager_id` cannot be set: status is always `DRAFT` and the creator is the caller.

**Response** `200` (message `common.created`) - `data` is the new event row (see Event object).

```json
{
  "success": true,
  "message": "created",
  "data": {
    "event_id": "13",
    "event_code": "YEAREND-2026",
    "event_name": "Year-end prize service",
    "event_type": "PRIZE_SERVICE",
    "project_id": null,
    "eligibility_basis": "CORPORATE_GRADE",
    "eligibility_rule": { "min_grade_rank": 3 },
    "cost_point_type_id": null,
    "cost_points": null,
    "is_private": false,
    "status": "DRAFT",
    "is_test": false,
    "created_by_manager_id": 3,
    "approved_by_manager_id": null,
    "approved_at": null,
    "created_at": "2026-10-11T09:00:00.000Z",
    "updated_at": "2026-10-11T09:00:00.000Z"
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `crm.common.theRuleIsNotValidJson` | `eligibility_rule` is a string that is not JSON |
| 400 | `crm.common.codeAndNameAreRequired` | `event_code` or `event_name` missing or empty |
| 400 | `crm.common.chooseAnEventType` | `event_type` missing or not in the list |
| 400 | `crm.events.chooseWhoMayTakePart` | `eligibility_basis` missing or not in the list |
| 400 | `common.valueFailedAValidation` | a table CHECK failed (basis-specific fields missing, cost pair incomplete, window or number range reversed) |
| 409 | `common.duplicatedValue` | `event_code` already used |
| 409 | `common.referencedRecordIsMissing` | a referenced project, product, segment or point type does not exist |
| 403 | `common.permissionDenied` | role lacks WRITE |

### GET /api/admin/crm/events/:id

Returns one event with its joined names, tiers, locations, quotas, rewards and summary counts.

**Permission:** READ on `/admin/crm/events`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | integer | `event_id` |

**Query parameters:** None.

**Request body:** None.

**Response** `200` - `data`:

| field | type | notes |
|---|---|---|
| event | object | every event column, plus `project_code`, `segment_name`, `ranking_point_type_code`, `cost_point_type_code`, `reserved_product_name`, `created_by_name`, `approved_by_name` (manager names); each joined value may be null |
| tiers | array | every `crm_event_tier` column, ordered by `rank_no` |
| locations | array | every `crm_event_service_center` column plus `service_center_code`, `service_center_name`; ordered by site name |
| quotas | array | every `crm_event_quota` column plus `tier_name`, `service_center_name` (null when the quota is not limited to one); ordered by `event_quota_id` |
| rewards | array | every `crm_activity_reward` column plus `tier_name`, `point_type_code`, `product_name`; ordered by `sort_order` |
| counts | object | `targets` (not revoked), `entries_allowed` (sum of `allowed_count` over non-revoked targets), `reservations_open` (`RESERVED` or `PAID`), `reservations_fulfilled`, `reservations_released` (`CANCELLED`, `EXPIRED`, `FAILED`), `awards` (not `CANCELLED` or `FAILED`); all integers |

Tier row: `event_tier_id` (string), `event_id` (string), `tier_code`, `tier_name`, `rank_no` (integer), `min_value` (string), `max_value` (string or null), `entries_per_target` (integer), `number_range_start`, `number_range_end` (integer or null).
Location row: `event_service_center_id`, `event_id`, `service_center_id` (strings), `service_center_role` (`PICKUP`, `SALE`, `EVENT_VENUE`, `DELIVERY_HUB`).
Quota row: `event_quota_id`, `event_id` (strings), `entry_type` (`NORMAL`/`REWARD`), `event_tier_id`, `service_center_id` (string or null), `quota_count`, `used_count` (integers), `created_at`, `updated_at`.
Reward row: `reward_id`, `event_id`, `event_tier_id`, `product_id` (strings or null), `reward_name`, `reward_type` (`DELIVERABLE_GOODS`, `PICKUP_GOODS`, `PRODUCT_COUPON`, `POINTS`, `WALLET_CREDIT`), `point_type_id` (integer or null), `points`, `unit_value` (string or null), `currency_code`, `quantity_total`, `quantity_awarded`, `sort_order` (integers), `note`, `created_at`, `updated_at`.

Note that `counts.awards` excludes `FAILED` awards while the list's `award_cnt` does not.

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "event": {
      "event_id": "12",
      "event_code": "NEWPHONE-2026Q4",
      "event_name": "New phone launch reservations",
      "event_type": "RESERVATION",
      "status": "OPEN",
      "project_code": "CRYSTAL",
      "segment_name": null,
      "ranking_point_type_code": "CRYSTAL",
      "cost_point_type_code": "CRYSTAL",
      "reserved_product_name": "Crystal X2",
      "created_by_name": "Ana Li",
      "approved_by_name": "Ben Wu"
    },
    "tiers": [
      { "event_tier_id": "4", "event_id": "12", "tier_code": "GOLD", "tier_name": "Gold", "rank_no": 2, "min_value": "5000.0000", "max_value": null, "entries_per_target": 2, "number_range_start": 1, "number_range_end": 999 }
    ],
    "locations": [
      { "event_service_center_id": "7", "event_id": "12", "service_center_id": "3", "service_center_role": "PICKUP", "service_center_code": "SC-003", "service_center_name": "Downtown" }
    ],
    "quotas": [
      { "event_quota_id": "9", "event_id": "12", "entry_type": "NORMAL", "event_tier_id": null, "service_center_id": "3", "quota_count": 300, "used_count": 212, "created_at": "2026-10-09T02:10:00.000Z", "updated_at": "2026-10-11T07:00:00.000Z", "tier_name": null, "service_center_name": "Downtown" }
    ],
    "rewards": [],
    "counts": { "targets": 500, "entries_allowed": 640, "reservations_open": 200, "reservations_fulfilled": 12, "reservations_released": 5, "awards": 0 }
  }
}
```
(`event` shortened.)

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | no event with that id |
| 400 | `common.isNotAValue` | `id` is not a number |

### PUT /api/admin/crm/events/:id

Edits an event. In `DRAFT` every creatable field may change; after approval only a few presentation fields may.

**Permission:** WRITE on `/admin/crm/events`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | integer | `event_id` |

**Query parameters:** None.

**Request body.** Partial: only fields present are changed; empty string becomes null.

| field | type | required | rules |
|---|---|---|---|
| (any field listed for `POST /events`) | | no | accepted only while the event is `DRAFT`. No check of `event_type` / `eligibility_basis` values here beyond the table CHECKs; `event_code` / `event_name` can be set but not to empty (NOT NULL: 400 `common.isRequired`) |
| description, summary, display_at, fulfilment_ends_at, is_private, campaign_id | | no | the only fields accepted when the event is `APPROVED`, `TARGETS_FROZEN`, `OPEN` or `CLOSED`; other fields are silently ignored |

`status` is never accepted here; use the status endpoint.

**Response** `200` (message `common.updated`) - `data` is the updated event row (see Event object).

```json
{ "success": true, "message": "updated", "data": { "event_id": "12", "summary": "Pick up from 1 Nov", "status": "OPEN", "updated_at": "2026-10-11T09:30:00.000Z" } }
```
(Row shortened.)

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | no such event |
| 409 | `crm.events.notWhileTheEventIs` ("not while the event is {status}") | event is `FULFILLED` or `CANCELLED` |
| 400 | `crm.common.theRuleIsNotValidJson` | bad `eligibility_rule` string (DRAFT only) |
| 400 | `common.nothingToUpdate` | no accepted field in the body for the current status |
| 400 / 409 | database errors | as for create |

### POST /api/admin/crm/events/:id/status

Moves an event to a new status. See the event state machine above for the allowed moves and their checks. Runs in one transaction with the event row locked.

**Permission:** WRITE on `/admin/crm/events`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | integer | `event_id` |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| status | string | yes | target status; must be allowed from the current one |

**Response** `200` (message `common.updated`) - `data` is the updated event row.

```json
{ "success": true, "message": "updated", "data": { "event_id": "13", "status": "APPROVED", "created_by_manager_id": 3, "approved_by_manager_id": 5, "approved_at": "2026-10-11T10:00:00.000Z" } }
```
(Row shortened.)

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | no such event |
| 409 | `crm.common.cannotMoveFromTo` ("cannot move from {from} to {to}") | move not in the table, including a missing or unknown `status` |
| 409 | `crm.common.anotherManagerMustApprove` | approving an event you created |
| 409 | `crm.events.addTargetsBeforeFreezing` | freezing with no non-revoked targets, basis not `OPEN` |
| 409 | `crm.events.reservationsAreStillOpen` ("{n} reservations are still open") | `FULFILLED` while reservations are `PENDING`/`RESERVED`/`PAID` |
| 400 / 409 | ledger errors (`crm.points.*`) | cancelling the event refunds points; a refund can fail as described under the reservation status endpoint |

### POST /api/admin/crm/events/:id/tiers

### PUT /api/admin/crm/events/:id/tiers/:tierId

Creates (POST) or edits (PUT) a tier of the event. Both run the same service function; with `tierId` it updates, without it inserts. Only while the event is `DRAFT` or `APPROVED`.

**Permission:** WRITE on `/admin/crm/events`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | integer | `event_id` |
| tierId | integer | PUT only; must belong to this event |

**Query parameters:** None.

**Request body.** Only these fields are read; empty string becomes null. No validation in the service beyond what the table enforces.

| field | type | required | rules |
|---|---|---|---|
| tier_code | string | yes on create | max 30; unique within the event (409 `crm.settings.thatCodeIsTaken`) |
| tier_name | string | yes on create | max 100 |
| rank_no | integer | yes on create | a higher rank wins when value bands overlap |
| min_value | number | no | default 0 |
| max_value | number | no | null = no upper bound; must be > `min_value` |
| entries_per_target | integer | no | default 1; > 0 |
| number_range_start, number_range_end | integer | no | end >= start; reservations in this tier are numbered inside this range |

A PUT with none of these fields reaches knex as an empty update, which knex refuses; the reply is a 500.

**Response** `200` (message `common.updated` for both create and edit) - `data` is the tier row (fields listed under the event detail).

```json
{ "success": true, "message": "updated", "data": { "event_tier_id": "5", "event_id": "13", "tier_code": "SILVER", "tier_name": "Silver", "rank_no": 1, "min_value": "1000.0000", "max_value": "5000.0000", "entries_per_target": 1, "number_range_start": 1000, "number_range_end": 1999 } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | no such event, or (PUT) no such tier on this event |
| 409 | `crm.events.tiersAreFixedOnceTargetsAreFrozen` | event is not `DRAFT` or `APPROVED` |
| 400 | `common.isRequired` | create without `tier_code`, `tier_name` or `rank_no` |
| 400 | `common.valueFailedAValidation` | band or range reversed, `entries_per_target` <= 0 |
| 409 | `crm.settings.thatCodeIsTaken` | duplicate `tier_code` in the event |

### DELETE /api/admin/crm/events/:id/tiers/:tierId

Deletes a tier. Only while the event is `DRAFT` or `APPROVED`.

**Permission:** WRITE on `/admin/crm/events`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | integer | `event_id` |
| tierId | integer | tier of this event |

**Query parameters:** None. **Request body:** None.

**Response** `200` (message `common.deleted`) - `data` is `null`.

```json
{ "success": true, "message": "deleted", "data": null }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | no such event, or no such tier on this event |
| 409 | `crm.events.tiersAreFixedOnceTargetsAreFrozen` | event is past `APPROVED` |
| 409 | `common.referencedRecordIsMissing` | a quota, target, reservation or reward still points at the tier |

### POST /api/admin/crm/events/:id/locations

Adds a site to the event in a role. Allowed while the event is `DRAFT`, `APPROVED`, `TARGETS_FROZEN` or `OPEN`.

When an event has locations, reservations may only name one of those sites, and `SERVICE_CENTER_ACTIVITY` target building only counts activity at those sites.

**Permission:** WRITE on `/admin/crm/events`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | integer | `event_id` |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| service_center_id | string/integer | yes | must exist (409 `common.referencedRecordIsMissing`); missing: 400 `common.isRequired` |
| service_center_role | string | no | `PICKUP` (default), `SALE`, `EVENT_VENUE`, `DELIVERY_HUB` |

**Response** `200` (message `common.created`) - `data` is the new row: `event_service_center_id`, `event_id`, `service_center_id` (strings), `service_center_role`.

```json
{ "success": true, "message": "created", "data": { "event_service_center_id": "8", "event_id": "12", "service_center_id": "4", "service_center_role": "PICKUP" } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | no such event |
| 409 | `crm.events.notWhileTheEventIs` | event is `CLOSED`, `FULFILLED` or `CANCELLED` |
| 409 | `crm.events.thatSiteIsAlreadyInTheEvent` | same site and role already on the event |
| 400 | `common.valueFailedAValidation` | role not in the list |

### DELETE /api/admin/crm/events/:id/locations/:rowId

Removes a site row from the event. Same status rule as adding.

**Permission:** WRITE on `/admin/crm/events`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | integer | `event_id` |
| rowId | integer | `event_service_center_id` (the row id, not the site id) |

**Query parameters:** None. **Request body:** None.

**Response** `200` (message `common.deleted`) - `data` is `null`.

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | no such event, or no such row on this event |
| 409 | `crm.events.notWhileTheEventIs` | event is `CLOSED`, `FULFILLED` or `CANCELLED` |

### POST /api/admin/crm/events/:id/quotas

### PUT /api/admin/crm/events/:id/quotas/:quotaId

Creates (POST) or edits (PUT) a quota. Allowed while the event is `DRAFT`, `APPROVED`, `TARGETS_FROZEN` or `OPEN`.

A reservation counts against every quota of its entry type whose tier is null or the reservation's tier, and whose site is null or the reservation's site. So an event can have an overall cap, per-tier caps and per-site caps at once; the entry is refused if any one of them is full.

**Permission:** WRITE on `/admin/crm/events`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | integer | `event_id` |
| quotaId | integer | PUT only; must belong to this event |

**Query parameters:** None.

**Request body.** Only these fields; empty string becomes null.

| field | type | required | rules |
|---|---|---|---|
| entry_type | string | no | `NORMAL` (default) or `REWARD` |
| event_tier_id | string/integer | no | must be a tier of this event (composite FK: 409 `common.referencedRecordIsMissing`); null = any tier |
| service_center_id | string/integer | no | null = any site. The service does not check the site is one of the event's locations |
| quota_count | integer | yes on create | >= 0, and not below the current `used_count` (CHECK) |

`used_count` cannot be set here; it moves with reservations. A PUT with no accepted field ends in a 500 (empty knex update).

**Response** `200` (message `common.updated` for both) - `data` is the quota row.

```json
{ "success": true, "message": "updated", "data": { "event_quota_id": "10", "event_id": "12", "entry_type": "NORMAL", "event_tier_id": "4", "service_center_id": null, "quota_count": 100, "used_count": 0, "created_at": "2026-10-11T10:05:00.000Z", "updated_at": "2026-10-11T10:05:00.000Z" } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | no such event, or (PUT) no such quota on this event |
| 409 | `crm.events.notWhileTheEventIs` | event is `CLOSED`, `FULFILLED` or `CANCELLED` |
| 409 | `crm.events.thatQuotaAlreadyExists` | a quota for the same entry type, tier and site already exists |
| 400 | `common.isRequired` | create without `quota_count` |
| 400 | `common.valueFailedAValidation` | negative count, count below `used_count`, bad `entry_type` |

### DELETE /api/admin/crm/events/:id/quotas/:quotaId

Deletes a quota that no entry has used yet. The event status is not checked.

**Permission:** WRITE on `/admin/crm/events`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | integer | `event_id` |
| quotaId | integer | quota of this event |

**Query parameters:** None. **Request body:** None.

**Response** `200` (message `common.deleted`) - `data` is `null`.

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | no such quota on this event |
| 409 | `crm.events.thisQuotaIsInUse` | `used_count` > 0 |

### POST /api/admin/crm/events/:id/rewards

### PUT /api/admin/crm/events/:id/rewards/:rewardId

Creates (POST) or edits (PUT) a reward the event can hand out. Allowed while the event is `DRAFT`, `APPROVED`, `TARGETS_FROZEN`, `OPEN` or `CLOSED`.

**Permission:** WRITE on `/admin/crm/events`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | integer | `event_id` |
| rewardId | integer | PUT only; must belong to this event |

**Query parameters:** None.

**Request body.** Only these fields; empty string becomes null.

| field | type | required | rules |
|---|---|---|---|
| reward_name | string | yes on create | max 255 |
| reward_type | string | yes on create | `DELIVERABLE_GOODS`, `PICKUP_GOODS`, `PRODUCT_COUPON`, `POINTS`, `WALLET_CREDIT` |
| quantity_total | integer | yes on create | >= 0, not below `quantity_awarded` |
| point_type_id | integer | when type is `POINTS` | CHECK: `POINTS` needs `point_type_id` and `points` > 0 |
| points | number | when type is `POINTS` | |
| event_tier_id | string/integer | no | tier of this event; stored for display, not enforced when awarding |
| product_id | string/integer | no | product catalog id |
| unit_value | number | no | |
| currency_code | string | no | 3 letters; must exist in `crm_currency` |
| sort_order | integer | no | default 0 |
| note | string | no | |

`quantity_awarded` cannot be set here. A PUT with no accepted field ends in a 500 (empty knex update).

**Response** `200` (message `common.updated` for both) - `data` is the reward row.

```json
{ "success": true, "message": "updated", "data": { "reward_id": "21", "event_id": "13", "event_tier_id": null, "reward_name": "500 bonus points", "reward_type": "POINTS", "product_id": null, "point_type_id": 1, "points": "500.000", "unit_value": null, "currency_code": null, "quantity_total": 200, "quantity_awarded": 0, "sort_order": 0, "note": null, "created_at": "2026-10-11T10:10:00.000Z", "updated_at": "2026-10-11T10:10:00.000Z" } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | no such event, or (PUT) no such reward on this event |
| 409 | `crm.events.notWhileTheEventIs` | event is `FULFILLED` or `CANCELLED` |
| 400 | `common.isRequired` | create without `reward_name`, `reward_type` or `quantity_total` |
| 400 | `common.valueFailedAValidation` | bad `reward_type`, `POINTS` without point type or positive points, stock below awarded |
| 409 | `common.referencedRecordIsMissing` | unknown tier (of this event), product, point type or currency |

### DELETE /api/admin/crm/events/:id/rewards/:rewardId

Deletes a reward that has never been awarded. The event status is not checked.

**Permission:** WRITE on `/admin/crm/events`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | integer | `event_id` |
| rewardId | integer | reward of this event |

**Query parameters:** None. **Request body:** None.

**Response** `200` (message `common.deleted`) - `data` is `null`.

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | no such reward on this event |
| 409 | `crm.events.thisRewardHasBeenAwarded` | `quantity_awarded` > 0 |
| 409 | `common.referencedRecordIsMissing` | a cancelled award still points at it (cancelled awards lower `quantity_awarded` but the rows stay) |

### GET /api/admin/crm/events/:id/targets

Lists the event's targets (who may take part). The event's existence is not checked; an unknown id gives an empty list.

**Permission:** READ on `/admin/crm/events`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | integer | `event_id` |

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| status | string | no | | exact: `ELIGIBLE`, `NOTIFIED`, `EXHAUSTED`, `REVOKED` |
| entry_type | string | no | | exact: `NORMAL` or `REWARD` |
| q | string | no | | trimmed; `ILIKE %q%` on the customer's `display_name`, OR the customer id: if `q` (with a leading `#` removed) is all digits it matches `party_pk` exactly |
| page | integer | no | 1 | |
| limit | integer | no | 20 | 1..200 |

`sort` and `dir` are ignored: rows are ordered by `qualification_rank` (nulls last), then `activity_target_id`.

**Request body:** None.

**Response** `200` - `data` is `{ rows, total, page, limit, summary: null }`. Each row:

| field | type | notes |
|---|---|---|
| activity_target_id | string | |
| event_id, party_pk | string | |
| event_tier_id | string or null | |
| entry_type | string | `NORMAL` / `REWARD` |
| allowed_count, used_count | integer | entries allowed and taken |
| qualification_value | string or null | numeric: points sum, score, owned count or visit count, by basis |
| qualification_rank | integer or null | set by `POINT_RANKING` only |
| qualification_reason | object or null | built: `{ basis, rule }`; manual: `{ note, by }` (`by` = manager login) |
| source | string | `SEGMENT`, `RANKING`, `GRADE`, `REGISTRATION`, `SERVICE_CENTER`, `MANUAL`, `IMPORT` |
| source_segment_membership_id | string or null | |
| status | string | `ELIGIBLE`, `NOTIFIED`, `EXHAUSTED`, `REVOKED` |
| added_by_manager_id | integer or null | |
| created_at, updated_at | string | |
| party_name | string | customer `display_name` |
| tier_code, tier_name | string or null | |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      { "activity_target_id": "880", "event_id": "12", "party_pk": "10452", "event_tier_id": "4", "entry_type": "NORMAL", "allowed_count": 2, "used_count": 1, "qualification_value": "7350.0000", "qualification_rank": 1, "qualification_reason": { "basis": "POINT_RANKING", "rule": {} }, "source": "RANKING", "source_segment_membership_id": null, "status": "ELIGIBLE", "added_by_manager_id": 3, "created_at": "2026-10-10T09:00:00.000Z", "updated_at": "2026-10-11T07:00:00.000Z", "party_name": "Chen Mei", "tier_code": "GOLD", "tier_name": "Gold" }
    ],
    "total": 500, "page": 1, "limit": 20, "summary": null
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `common.isNotAValue` | `id` is not a number |

### POST /api/admin/crm/events/:id/targets

Adds one customer as a target by hand (`source = MANUAL`). Only while the event is `DRAFT` or `APPROVED`.

**Permission:** WRITE on `/admin/crm/events`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | integer | `event_id` |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| party_pk | string/integer | yes | customer id; must exist (409 `common.referencedRecordIsMissing`). Whether the customer is active is not checked here |
| event_tier_id | string/integer | no | if given and it is a tier of this event, that tier is used; if it is not one of the event's tiers, the target gets **no** tier (silently). If absent, the tier is chosen from `qualification_value` (see below) |
| qualification_value | number | no | used to pick the tier: the highest `rank_no` tier with `min_value` <= value < `max_value`; no value means the lowest-ranked tier; no fit means no tier |
| entry_type | string | no | `NORMAL` (default) or `REWARD` |
| allowed_count | integer | no | default: the tier's `entries_per_target`, else 1. A 0 is treated as absent |
| note | string | no | stored in `qualification_reason.note` |

**Response** `200` (message `common.created`) - `data` is the new target row (columns as in the list, without `party_name`, `tier_code`, `tier_name`).

```json
{ "success": true, "message": "created", "data": { "activity_target_id": "1201", "event_id": "13", "party_pk": "10452", "event_tier_id": null, "entry_type": "NORMAL", "allowed_count": 1, "used_count": 0, "qualification_value": null, "qualification_rank": null, "qualification_reason": { "note": "VIP request", "by": "ana" }, "source": "MANUAL", "source_segment_membership_id": null, "status": "ELIGIBLE", "added_by_manager_id": 3, "created_at": "2026-10-11T10:20:00.000Z", "updated_at": "2026-10-11T10:20:00.000Z" } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | no such event |
| 409 | `crm.events.targetsAreFrozen` | event is not `DRAFT` or `APPROVED` |
| 400 | `crm.common.chooseACustomer` | `party_pk` missing |
| 409 | `crm.events.alreadyATarget` | the customer is already a target for this entry type (including a revoked one) |
| 400 | `common.valueFailedAValidation` | bad `entry_type` or negative `allowed_count` |

### POST /api/admin/crm/events/:id/targets/build

Builds the target list from the event's `eligibility_basis` and `eligibility_rule`. Adds every qualifying active customer not yet on the list (for entry type `NORMAL`); never removes or changes existing targets. Only while the event is `DRAFT` or `APPROVED`.

**Permission:** WRITE on `/admin/crm/events`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | integer | `event_id` |

**Query parameters:** None. **Request body:** None (everything comes from the event).

How each basis qualifies people (only customers with `party_status = ACTIVE`):

| basis | target `source` | who qualifies | qualification_value | `eligibility_rule` keys |
|---|---|---|---|---|
| `SEGMENT` | `SEGMENT` | current members (`unmatched_at` null) of `eligibility_segment_id` | null (so the lowest-ranked tier, if any) | none |
| `POINT_RANKING` | `RANKING` | sum of `points_delta` of point type `ranking_point_type_id` up to `ranking_cutoff_at`, sum > 0; ordered by sum, cut to `ranking_top_n` rows when set (ties at the cut are split arbitrarily) | the sum; `qualification_rank` = SQL `RANK()` | none |
| `CORPORATE_GRADE` | `GRADE` | grade = the hand-assigned grade, else the grade of the latest platform-wide analysis snapshot; grade `rank_no` >= `min_grade_rank` | latest `corporate_score` | `min_grade_rank` (default 1) |
| `PRODUCT_REGISTRATION` | `REGISTRATION` | `active_owned_count` of the product class >= `min_count` | owned count | `product_class_code` or `product_class_id` (one required), `min_count` (default 1) |
| `SERVICE_CENTER_ACTIVITY` | `SERVICE_CENTER` | at least `min_count` `COMPLETED` activities of type `activity_code` in the last `since_days` days; if the event has locations, only activity at those sites counts | activity count | `activity_code` (required), `since_days` (default 365), `min_count` (default 1) |
| `MANUAL`, `IMPORT`, `OPEN` | | nothing to build | | |

Each candidate gets a tier by its value (highest `rank_no` band that contains it). If the event has tiers and the value fits none, the candidate is **skipped**. `allowed_count` is the tier's `entries_per_target`, or 1 with no tier. `qualification_reason` is `{ basis, rule }`. Inserts are `ON CONFLICT (event_id, party_pk, entry_type) DO NOTHING`, all in one transaction.

**Response** `200` (message `crm.events.targetsBuilt`, "targets added") - `data`:

| field | type | notes |
|---|---|---|
| qualified | integer | candidates found (before tier skipping and duplicates) |
| added | integer | rows actually inserted |

```json
{ "success": true, "message": "targets added", "data": { "qualified": 512, "added": 498 } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | no such event |
| 409 | `crm.events.targetsAreFrozen` | event is not `DRAFT` or `APPROVED` |
| 409 | `crm.events.theRuleNeedsAProductClass` | `PRODUCT_REGISTRATION` without a resolvable product class |
| 409 | `crm.events.theRuleNeedsAnActivity` | `SERVICE_CENTER_ACTIVITY` without a known `activity_code` |
| 409 | `crm.events.thisBasisHasNothingToBuild` | basis is `MANUAL`, `IMPORT` or `OPEN` |

### POST /api/admin/crm/events/:id/targets/:targetId/revoke

Revokes one target: status becomes `REVOKED`. The event status is not checked, so this works after the list is frozen. Reservations already taken by the target are not touched; a revoked target cannot take new ones.

**Permission:** WRITE on `/admin/crm/events`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | integer | `event_id` |
| targetId | integer | `activity_target_id` of this event |

**Query parameters:** None. **Request body:** None.

**Response** `200` (message `common.updated`) - `data` is the updated target row.

```json
{ "success": true, "message": "updated", "data": { "activity_target_id": "1201", "event_id": "13", "party_pk": "10452", "status": "REVOKED", "allowed_count": 1, "used_count": 0 } }
```
(Row shortened.)

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | no such target on this event |
| 409 | `crm.events.alreadyRevoked` | target is already `REVOKED` |

### GET /api/admin/crm/events/:id/reservations

Lists the event's reservations. The event's existence is not checked.

**Permission:** READ on `/admin/crm/events`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | integer | `event_id` |

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| status | string | no | | exact reservation status |
| service_center_id | integer | no | | exact site |
| q | string | no | | trimmed; `ILIKE %q%` on `reservation_code`, customer `display_name` or `holder_name`, OR exact `party_pk` when `q` (without a leading `#`) is all digits |
| page | integer | no | 1 | |
| limit | integer | no | 20 | 1..200 |
| dir | string | no | `desc` | order of `reservation_no`; `desc`, anything else ascending |

`sort` is ignored: always ordered by `reservation_no`.

**Request body:** None.

**Response** `200` - `data` is `{ rows, total, page, limit, summary: null }`. Each row:

| field | type | notes |
|---|---|---|
| reservation_id, event_id, party_pk | string | |
| activity_target_id, event_tier_id | string or null | null for an `OPEN` event |
| entry_type | string | |
| reservation_no | integer | |
| reservation_code | string | prefix + zero-padded number + suffix |
| holder_name, holder_phone | string or null | |
| holder_id_card_hash | string or null | SHA-256 hex of the card number (spaces removed, upper-cased); returned as stored |
| holder_id_card_masked | string or null | first 2 and last 2 characters visible |
| service_center_id, product_instance_id, related_transaction_id | string or null | |
| status | string | see the reservation state machine |
| external_booking_ref | string or null | |
| reserved_at, paid_at, fulfilled_at, cancelled_at | string or null | |
| cancel_reason | string or null | |
| legacy_key | string or null | |
| created_at, updated_at | string | |
| party_name | string | customer `display_name` |
| tier_name, service_center_name | string or null | |
| external_product_instance_id | string or null | serial of the linked product instance |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      { "reservation_id": "3310", "event_id": "12", "activity_target_id": "880", "party_pk": "10452", "event_tier_id": "4", "entry_type": "NORMAL", "reservation_no": 17, "reservation_code": "NEWPHONE-2026Q-017", "holder_name": "Chen Mei", "holder_id_card_hash": "9f2c...e1", "holder_id_card_masked": "A1******89", "holder_phone": "0912345678", "service_center_id": "3", "product_instance_id": null, "related_transaction_id": null, "status": "RESERVED", "external_booking_ref": null, "reserved_at": "2026-10-20T02:03:00.000Z", "paid_at": null, "fulfilled_at": null, "cancelled_at": null, "cancel_reason": null, "legacy_key": null, "created_at": "2026-10-20T02:03:00.000Z", "updated_at": "2026-10-20T02:03:00.000Z", "party_name": "Chen Mei", "tier_name": "Gold", "service_center_name": "Downtown", "external_product_instance_id": null }
    ],
    "total": 212, "page": 1, "limit": 20, "summary": null
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `common.isNotAValue` | `id` or `service_center_id` not a number |

### POST /api/admin/crm/events/:id/reservations

Takes one numbered entry for a customer. Runs in one transaction, locking the event row first (so numbering is safe), then the target, the matching quotas and the customer's point account.

Checks, in order: event `OPEN` and inside its window; customer active; (unless basis is `OPEN`) customer is a non-revoked target for this entry type with entries left; site belongs to the event (if the event has locations and a site is given); every matching quota has room; the ID card has no live entry in this event; enough points for the cost.

Numbering: the next number after the highest already used in the range. The range is the tier's `number_range_start`..`number_range_end` when the target's tier has them, else the event's `number_start` (default 1)..`number_end` (no upper bound when null). Code = `number_prefix` (default: first 14 characters of `event_code` + `-`) + number zero-padded to the width of the range end (or of max(number, 9999) with no end) + `number_suffix`.

Effects: inserts the reservation as `RESERVED` with `reserved_at` now; if the event has `cost_point_type_id` and `cost_points` > 0, posts a `RESERVATION_COST` ledger event of `-cost_points`; increments the target's `used_count` (status becomes `EXHAUSTED` when it reaches `allowed_count`); increments every matching quota's `used_count`; writes the first history row (`old_status` null, `new_status` `RESERVED`, actor `MANAGER`).

**Permission:** WRITE on `/admin/crm/events`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | integer | `event_id` |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| party_pk | string/integer | yes | must be an `ACTIVE` customer. A missing value is not checked by the service and fails inside knex (500) |
| entry_type | string | no | `NORMAL` (default) or `REWARD` |
| service_center_id | string/integer | no | must be one of the event's sites when the event has any |
| holder_name | string | no | default the customer's `display_name`; max 100 |
| holder_id_card | string | no | hashed and masked; the raw value is not stored |
| holder_phone | string | no | max 32 |
| note | string | no | stored on the history row (max 500, not truncated here) |

**Response** `200` (message `common.created`) - `data` is the new reservation row (columns as in the list, without the joined names).

```json
{ "success": true, "message": "created", "data": { "reservation_id": "3311", "event_id": "12", "activity_target_id": "880", "party_pk": "10452", "event_tier_id": "4", "entry_type": "NORMAL", "reservation_no": 18, "reservation_code": "NEWPHONE-2026Q-018", "holder_name": "Chen Mei", "holder_id_card_hash": null, "holder_id_card_masked": null, "holder_phone": null, "service_center_id": "3", "product_instance_id": null, "related_transaction_id": null, "status": "RESERVED", "external_booking_ref": null, "reserved_at": "2026-10-20T02:05:00.000Z", "paid_at": null, "fulfilled_at": null, "cancelled_at": null, "cancel_reason": null, "legacy_key": null, "created_at": "2026-10-20T02:05:00.000Z", "updated_at": "2026-10-20T02:05:00.000Z" } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | no such event |
| 409 | `crm.events.theEventIsNotOpen` | event status is not `OPEN` |
| 409 | `crm.events.theEventHasNotStarted` | before `starts_at` |
| 409 | `crm.events.theEventHasEnded` | after `ends_at` |
| 409 | `crm.common.chooseAnActiveCustomer` | customer missing or not `ACTIVE` |
| 409 | `crm.events.thisCustomerIsNotATarget` | no target row for this entry type, or it is revoked |
| 409 | `crm.events.noEntriesLeft` | target's `used_count` >= `allowed_count` |
| 409 | `crm.events.thatSiteIsNotInThisEvent` | site not among the event's locations |
| 409 | `crm.events.theQuotaIsFull` | a matching quota is used up |
| 409 | `crm.events.thisIdCardHasAnEntry` | the ID card has a live entry in this event (also from the unique index on a race) |
| 409 | `crm.events.noNumbersLeft` | next number is past the range end |
| 409 | `crm.points.notEnoughPoints` ("not enough points: the balance is {balance}, {needed} are needed") | balance too low for the cost |
| 409 | `crm.points.pointTypeIsInactive` | the cost point type is inactive |
| 409 | `crm.points.pointTypeNeedsAProject` | no project to book the cost under |
| 409 | `common.duplicatedValue` | reservation number or code collision (should not happen under the lock) |

### GET /api/admin/crm/reservations/:reservationId/events

Returns the status history of one reservation, oldest first. Not paged. An unknown reservation gives an empty array (no 404).

**Permission:** READ on `/admin/crm/events`.

**Path parameters**

| name | type | notes |
|---|---|---|
| reservationId | integer | `reservation_id` |

**Query parameters:** None. **Request body:** None.

**Response** `200` - `data` is an array ordered by `occurred_at`:

| field | type | notes |
|---|---|---|
| reservation_event_id, reservation_id | string | |
| old_status | string or null | null on the first row |
| new_status | string | |
| actor_type | string | `MANAGER` or `SYSTEM` from this API (`PARTY`, `LOCATION` exist for other sources) |
| actor_manager_id | integer or null | |
| actor_service_center_id | string or null | |
| note | string or null | |
| occurred_at | string | |
| manager_name | string or null | |
| service_center_name | string or null | |

```json
{
  "success": true,
  "message": "ok",
  "data": [
    { "reservation_event_id": "5001", "reservation_id": "3310", "old_status": null, "new_status": "RESERVED", "actor_type": "MANAGER", "actor_manager_id": 3, "actor_service_center_id": "3", "note": null, "occurred_at": "2026-10-20T02:03:00.000Z", "manager_name": "Ana Li", "service_center_name": "Downtown" },
    { "reservation_event_id": "5122", "reservation_id": "3310", "old_status": "RESERVED", "new_status": "FULFILLED", "actor_type": "MANAGER", "actor_manager_id": 7, "actor_service_center_id": "3", "note": "Picked up", "occurred_at": "2026-11-01T03:00:00.000Z", "manager_name": "Dan Ho", "service_center_name": "Downtown" }
  ]
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `common.isNotAValue` | `reservationId` not a number |

### POST /api/admin/crm/reservations/:reservationId/status

Moves one reservation to a new status. See the reservation state machine above for allowed moves and side effects. One transaction with the reservation row locked. The event's own status is not checked.

**Permission:** WRITE on `/admin/crm/events`.

**Path parameters**

| name | type | notes |
|---|---|---|
| reservationId | integer | `reservation_id` |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| status | string | yes | target status |
| note | string | no | history note (first 500 characters); on `CANCELLED` also `cancel_reason` (first 255) |
| service_center_id | string/integer | no | site doing the step; defaults to the reservation's site. Stored on the reservation on `FULFILLED`, recorded on the history row always |
| related_transaction_id | string/integer | no | used on `PAID` |
| product_instance_id | string/integer | no | used on `FULFILLED` (the device handed over) |

**Response** `200` (message `common.updated`) - `data` is the updated reservation row.

```json
{ "success": true, "message": "updated", "data": { "reservation_id": "3310", "event_id": "12", "status": "FULFILLED", "fulfilled_at": "2026-11-01T03:00:00.000Z", "product_instance_id": "77120", "service_center_id": "3" } }
```
(Row shortened.)

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | no such reservation |
| 409 | `crm.common.cannotMoveFromTo` | move not allowed, including a missing or unknown `status` |
| 409 | `common.referencedRecordIsMissing` | unknown `related_transaction_id`, `product_instance_id` or site |
| 400 / 409 | `crm.points.*` | the refund could not be posted (for example `crm.points.pointTypeNeedsAProject`) |

### GET /api/admin/crm/events/:id/awards

Lists the awards given in an event. The event's existence is not checked.

**Permission:** READ on `/admin/crm/events`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | integer | `event_id` |

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| status | string | no | | exact award status |
| q | string | no | | trimmed; `ILIKE %q%` on customer `display_name`, OR exact `party_pk` when `q` (without a leading `#`) is all digits |
| page | integer | no | 1 | |
| limit | integer | no | 20 | 1..200 |
| dir | string | no | `desc` | order of `awarded_at`; `desc`, anything else ascending |

`sort` is ignored: always ordered by `awarded_at`.

**Request body:** None.

**Response** `200` - `data` is `{ rows, total, page, limit, summary: null }`. Each row:

| field | type | notes |
|---|---|---|
| award_id, event_id, reward_id, party_pk | string | |
| activity_target_id, reservation_id | string or null | |
| fulfilment_method | string | `DELIVERY`, `PICKUP`, `POINTS`, `WALLET` |
| status | string | see the award state machine |
| recipient_name, recipient_phone | string or null | |
| recipient_id_card_hash | string or null | not set by this API |
| delivery_location_pk | string or null | |
| delivery_address | string or null | |
| pickup_service_center_id | string or null | |
| point_event_id | string or null | the ledger event of a points award |
| external_credit_ref | string or null | wallet reference |
| awarded_at | string | |
| fulfilled_at | string or null | |
| handled_by_manager_id | integer or null | last manager to touch it |
| created_at, updated_at | string | |
| party_name | string | |
| reward_name, reward_type | string | |
| reservation_code | string or null | |
| pickup_location_name | string or null | name of the pickup site |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      { "award_id": "640", "event_id": "13", "reward_id": "22", "party_pk": "10452", "activity_target_id": "1201", "reservation_id": null, "fulfilment_method": "PICKUP", "status": "READY", "recipient_name": null, "recipient_phone": null, "recipient_id_card_hash": null, "delivery_location_pk": null, "delivery_address": null, "pickup_service_center_id": "3", "point_event_id": null, "external_credit_ref": null, "awarded_at": "2026-12-20T05:00:00.000Z", "fulfilled_at": null, "handled_by_manager_id": 3, "created_at": "2026-12-20T05:00:00.000Z", "updated_at": "2026-12-21T01:00:00.000Z", "party_name": "Chen Mei", "reward_name": "Gift box", "reward_type": "PICKUP_GOODS", "reservation_code": null, "pickup_location_name": "Downtown" }
    ],
    "total": 1, "page": 1, "limit": 20, "summary": null
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `common.isNotAValue` | `id` not a number |

### POST /api/admin/crm/events/:id/awards

Gives one unit of a reward to one customer. Only while the event is `OPEN` or `CLOSED`. One transaction; the reward row is locked while its stock is taken.

The fulfilment method is forced by the reward type: `POINTS` rewards use `POINTS`, `WALLET_CREDIT` rewards use `WALLET`; any other type uses the body's `fulfilment_method`, default `PICKUP`. A `POINTS` award is paid at once (`EVENT_AWARD` ledger event of `+points`) and returned as `CREDITED` with `point_event_id` and `fulfilled_at` set. Every other award starts `PENDING`. The award is linked to the customer's target in this event if one exists (any status, the first by entry type); being a target is not required.

**Permission:** WRITE on `/admin/crm/events`.

**Path parameters**

| name | type | notes |
|---|---|---|
| id | integer | `event_id` |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| reward_id | string/integer | yes | reward of this event. A missing value is not checked by the service and fails inside knex (500) |
| reservation_id | string/integer | one of these two | reservation of this event; the customer is taken from it. One award per reservation (409 `common.duplicatedValue`) |
| party_pk | string/integer | one of these two | used when no `reservation_id`. Customer status is not checked |
| fulfilment_method | string | no | `DELIVERY` or `PICKUP` (default) for goods and coupons; ignored for `POINTS` / `WALLET_CREDIT` rewards |
| pickup_service_center_id | string/integer | when method is `PICKUP` | |
| delivery_address | string | no | max 255; needed later to dispatch |
| delivery_location_pk | string/integer | no | an address record |
| recipient_name | string | no | max 100 |
| recipient_phone | string | no | max 64 |

**Response** `200` (message `common.created`) - `data` is the award row (columns as in the list, without the joined names).

```json
{ "success": true, "message": "created", "data": { "award_id": "641", "event_id": "13", "reward_id": "21", "party_pk": "10452", "activity_target_id": "1201", "reservation_id": null, "fulfilment_method": "POINTS", "status": "CREDITED", "recipient_name": null, "recipient_phone": null, "recipient_id_card_hash": null, "delivery_location_pk": null, "delivery_address": null, "pickup_service_center_id": null, "point_event_id": "99812", "external_credit_ref": null, "awarded_at": "2026-12-20T05:10:00.000Z", "fulfilled_at": "2026-12-20T05:10:00.000Z", "handled_by_manager_id": 3, "created_at": "2026-12-20T05:10:00.000Z", "updated_at": "2026-12-20T05:10:00.000Z" } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | no such event, no such reward on this event, or `reservation_id` not in this event |
| 409 | `crm.events.awardsNeedAnOpenEvent` | event is not `OPEN` or `CLOSED` |
| 409 | `crm.events.thisRewardIsAllGone` | `quantity_awarded` >= `quantity_total` |
| 400 | `crm.common.chooseACustomer` | neither `reservation_id` nor `party_pk` |
| 400 | `crm.events.chooseWhereItIsCollected` | method `PICKUP` without `pickup_service_center_id` |
| 400 | `common.valueFailedAValidation` | `fulfilment_method` not in the list |
| 409 | `common.duplicatedValue` | the reservation already has an award |
| 409 | `crm.points.pointTypeIsInactive`, `crm.points.pointTypeNeedsAProject` | points reward could not be posted |

### POST /api/admin/crm/awards/:awardId/status

Moves one award to a new status. See the award state machine above for allowed moves and checks. One transaction with the award row locked. The event's status is not checked.

**Permission:** WRITE on `/admin/crm/events`.

**Path parameters**

| name | type | notes |
|---|---|---|
| awardId | integer | `award_id` |

**Query parameters:** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| status | string | yes | target status |
| delivery_address | string | for `DISPATCHED` if none stored | stored when given (any move) |
| external_credit_ref | string | for `CREDITED` | stored when given; max 100 |

The caller becomes `handled_by_manager_id`.

**Response** `200` (message `common.updated`) - `data` is the updated award row.

```json
{ "success": true, "message": "updated", "data": { "award_id": "640", "status": "PICKED_UP", "fulfilled_at": "2026-12-22T02:00:00.000Z", "handled_by_manager_id": 7 } }
```
(Row shortened.)

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | no such award |
| 409 | `crm.common.cannotMoveFromTo` | move not allowed, including a missing or unknown `status` |
| 409 | `crm.events.onlyWalletCreditsAreCredited` | `CREDITED` for a method other than `WALLET` |
| 400 | `crm.events.giveTheWalletReference` | `CREDITED` without `external_credit_ref` |
| 400 | `crm.events.anAddressIsRequired` | `DISPATCHED` with no address stored or given |
| 400 | `common.valueFailedAValidation` | a `DELIVERY` award moved to `READY` (or another non-pending status) with no address (table CHECK) |

## 19. Sites (service centres)

A site is one physical place, whoever runs it: a Crystal service centre, a vendor sales agency, a collection point, a partner shop, an office or an event venue (table `crm_service_center`). Each site holds capabilities (`crm_service_center_capability`) that say what it may do; recording an activity that needs a capability the site does not hold is refused (see `POST /site-activities`).

Handlers: `crmController.sites.*` -> `src/services/crm/sites.service.js`. The service queries the database directly (no repository layer).

For every endpoint in this section, text longer than its column (maximum lengths are given below) gets 400 `crm.settings.aValueIsTooLong` from the CRM router's error handler. The error tables below leave it out.

Types: the bigint ids (`service_center_id`, `capability_id`, `party_pk`, `operator_party_pk`, `location_pk`) and `rating` (numeric) are strings. `project_id` and `source_project_id` are numbers.

### GET /api/admin/crm/sites

Lists sites with their area, operator, active capabilities and a 30-day activity count.

**Permission:** READ on `/admin/crm/sites`.

**Path parameters** None.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `q` | string | no | - | Trimmed, then `ILIKE '%q%'` over `service_center_code`, `service_center_name`, `address_line`. |
| `service_center_kind` | string | no | - | Exact match. One of `SERVICE_CENTER`, `SALES_AGENCY`, `COLLECTION_POINT`, `PARTNER_SHOP`, `OFFICE`, `EVENT_VENUE` (not validated; another value just matches nothing). |
| `status` | string | no | - | Exact match: `ACTIVE`, `SUSPENDED`, `CLOSED`. |
| `location_pk` | string | no | - | Exact match on the site's location (`crm_location.location_pk`). |
| `page` | integer | no | 1 | Page number. |
| `limit` | integer | no | 20 | Rows per page, clamped 1..200. |
| `sort` | string | no | `service_center_name` | Honoured: `service_center_code`, `service_center_name`, `rating`. Anything else falls back to the name. |
| `dir` | string | no | `asc` | This list defaults to ascending; `desc` reverses. |

**Request body** None.

**Response** `200` - `data` is the standard list shape `{ rows, total, page, limit, summary: null }`. Each row:

| field | type | notes |
|---|---|---|
| `service_center_id` | string | bigint id. |
| `service_center_code` | string | Unique, max 40. |
| `service_center_name` | string | Max 200. |
| `service_center_kind` | string | See kinds above. |
| `operator_party_pk` | string \| null | Organization running the site. |
| `location_pk` | string \| null | Area on the location tree. |
| `address_line`, `landmark` | string \| null | Max 255. |
| `map_position` | string \| null | Max 64, free text. |
| `crystal_agency_id` | integer \| null | Link to Crystal `agencies.id`. |
| `source_project_id` | integer \| null | Project the row was imported from. |
| `source_service_center_key`, `source_table_code` | string \| null | Import keys. |
| `rating` | string \| null | numeric(5,2), e.g. `"4.50"`. |
| `status` | string | `ACTIVE`, `SUSPENDED`, `CLOSED`. |
| `opened_on`, `closed_on` | string \| null | `YYYY-MM-DD`. |
| `created_at`, `updated_at` | string | ISO timestamps. |
| `area_name` | string \| null | `crm_location.location_name` of `location_pk` (the single name, not the full path). |
| `operator_name` | string \| null | Operator party's `display_name`. |
| `source_project_code` | string \| null | Code of `source_project_id`. |
| `capabilities` | string \| null | Comma-joined distinct codes of the site's **active** capabilities, e.g. `"DEVICE_SALE,REPAIR"`; null when none. |
| `activity_30d` | integer | Count of `COMPLETED` activities at the site in the last 30 days. |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      {
        "service_center_id": "12",
        "service_center_code": "SC-PY-001",
        "service_center_name": "Pyongyang Central Service Centre",
        "service_center_kind": "SERVICE_CENTER",
        "operator_party_pk": "50211",
        "location_pk": "3",
        "address_line": "12 Main Street",
        "landmark": "Opposite the post office",
        "map_position": "39.0194,125.7381",
        "crystal_agency_id": 4,
        "source_project_id": 2,
        "source_service_center_key": "4",
        "source_table_code": "agencies",
        "rating": "4.50",
        "status": "ACTIVE",
        "opened_on": "2024-03-01",
        "closed_on": null,
        "created_at": "2026-09-01T02:10:00.000Z",
        "updated_at": "2026-09-01T02:10:00.000Z",
        "area_name": "Central District",
        "operator_name": "Crystal Service Co.",
        "source_project_code": "CRYSTAL",
        "capabilities": "DEVICE_SALE,REPAIR",
        "activity_30d": 87
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "summary": null
  }
}
```

**Errors** None specific beyond permission (403 `common.permissionDenied`).

### POST /api/admin/crm/sites

Creates a site.

**Permission:** WRITE on `/admin/crm/sites`.

**Path parameters** None.

**Query parameters** None.

**Request body** Only the fields below are read; any other key is ignored. An empty string is stored as `null`. Values are not trimmed.

| field | type | required | rules |
|---|---|---|---|
| `service_center_code` | string | yes | Max 40 (DB). Unique across all sites. |
| `service_center_name` | string | yes | Max 200 (DB). |
| `service_center_kind` | string | yes | One of `SERVICE_CENTER`, `SALES_AGENCY`, `COLLECTION_POINT`, `PARTNER_SHOP`, `OFFICE`, `EVENT_VENUE`. |
| `operator_party_pk` | string \| integer | no | Must be an organization (`crm_organization.party_pk`). |
| `location_pk` | string \| integer | no | Must exist in `crm_location`. |
| `address_line` | string | no | Max 255. |
| `landmark` | string | no | Max 255. |
| `map_position` | string | no | Max 64. |
| `rating` | number | no | numeric(5,2). |
| `status` | string | no | `ACTIVE` (default), `SUSPENDED`, `CLOSED`. Checked by the DB only. |
| `opened_on` | string | no | `YYYY-MM-DD`. |
| `closed_on` | string | no | `YYYY-MM-DD`; must be on or after `opened_on` (DB check). |

`crystal_agency_id` and the `source_*` columns cannot be set through this endpoint.

**Response** `200`, message `created` - `data` is the inserted `crm_service_center` row (same columns as a list row, without the joined/computed fields `area_name`, `operator_name`, `source_project_code`, `capabilities`, `activity_30d`).

```json
{
  "success": true,
  "message": "created",
  "data": {
    "service_center_id": "41",
    "service_center_code": "CP-WS-007",
    "service_center_name": "West Station Collection Point",
    "service_center_kind": "COLLECTION_POINT",
    "operator_party_pk": null,
    "location_pk": "18",
    "address_line": "West Station, hall B",
    "landmark": null,
    "map_position": null,
    "crystal_agency_id": null,
    "source_project_id": null,
    "source_service_center_key": null,
    "source_table_code": null,
    "rating": null,
    "status": "ACTIVE",
    "opened_on": "2026-10-01",
    "closed_on": null,
    "created_at": "2026-10-11T03:00:00.000Z",
    "updated_at": "2026-10-11T03:00:00.000Z"
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `crm.sites.chooseASiteKind` ("choose what kind of site this is") | `service_center_kind` given but not in the list. |
| 400 | `crm.sites.codeNameAndKindAreRequired` ("a code, a name and a kind are required") | Any of code, name, kind missing or empty. |
| 409 | `crm.settings.thatCodeIsTaken` ("that code is already in use") | `service_center_code` already used (constraint `crm_service_center_service_center_code_key`, caught by the CRM router's error handler). |
| 409 | `common.referencedRecordIsMissing` | `operator_party_pk` is not an organization, or `location_pk` does not exist. |
| 400 | `common.valueFailedAValidation` | DB check failed: bad `status`, or `closed_on` before `opened_on`. |

### GET /api/admin/crm/sites/:id

One site with all its capabilities (active and ended) and up to 20 CRM events it takes part in.

**Permission:** READ on `/admin/crm/sites`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string | `service_center_id`. |

**Query parameters** None.

**Request body** None.

**Response** `200` - `data`:

| field | type | notes |
|---|---|---|
| `site` | object | The `crm_service_center` row plus `area_name`, `operator_name`, `source_project_code` (no `capabilities` / `activity_30d`). |
| `capabilities` | array | Every capability row of the site, active first, then by `capability_code`. Each: `capability_id` (string), `service_center_id` (string), `project_id` (integer\|null), `capability_code` (string), `crystal_section` (string\|null), `valid_from`, `valid_to` (`YYYY-MM-DD`\|null), `is_active` (boolean), `created_at`, plus `project_code` (string\|null). |
| `events` | array | Up to 20 `crm_event` rows linked to the site through `crm_event_service_center`, newest `event_id` first. Each: `event_id` (string), `event_code`, `event_name`, `status`, `service_center_role` (`PICKUP`, `SALE`, `EVENT_VENUE`, `DELIVERY_HUB`). |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "site": {
      "service_center_id": "12",
      "service_center_code": "SC-PY-001",
      "service_center_name": "Pyongyang Central Service Centre",
      "service_center_kind": "SERVICE_CENTER",
      "status": "ACTIVE",
      "rating": "4.50",
      "location_pk": "3",
      "area_name": "Central District",
      "operator_name": "Crystal Service Co.",
      "source_project_code": "CRYSTAL"
    },
    "capabilities": [
      {
        "capability_id": "77",
        "service_center_id": "12",
        "project_id": 2,
        "capability_code": "REPAIR",
        "crystal_section": "phone",
        "valid_from": "2024-03-01",
        "valid_to": null,
        "is_active": true,
        "created_at": "2026-09-01T02:10:00.000Z",
        "project_code": "CRYSTAL"
      }
    ],
    "events": [
      { "event_id": "9", "event_code": "RSV-2026-Z9", "event_name": "Z9 pre-order", "status": "OPEN", "service_center_role": "PICKUP" }
    ]
  }
}
```

(The `site` object in the example is abbreviated; all columns of the row are returned.)

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | No site with that id. |
| 400 | `common.isNotAValue` | `id` is not an integer (22P02). |

### PUT /api/admin/crm/sites/:id

Updates a site. Partial: only the keys present in the body are changed.

**Permission:** WRITE on `/admin/crm/sites`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string | `service_center_id`. |

**Query parameters** None.

**Request body** Same fields and rules as `POST /sites`, all optional. `""` sets the column to `null`. The kind is validated only when given non-empty; sending `service_center_kind: ""` (or empty code/name) reaches the NOT NULL constraint instead.

**Response** `200`, message `updated` - `data` is the updated `crm_service_center` row (same shape as the create response).

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `crm.sites.chooseASiteKind` | Kind not in the list. |
| 404 | `common.notFound` | No site with that id. |
| 400 | `common.nothingToUpdate` | Body contains none of the accepted fields. |
| 400 | `common.isRequired` | Code, name or kind set to `""`/null (NOT NULL). |
| 409 | `crm.settings.thatCodeIsTaken` | Code already used by another site. |
| 409 | `common.referencedRecordIsMissing` | Bad `operator_party_pk` / `location_pk`. |
| 400 | `common.valueFailedAValidation` | Bad `status`, or `closed_on` before `opened_on`. |

### POST /api/admin/crm/sites/:id/capabilities

Gives a site a capability (what it may do, optionally per project and with validity dates).

**Permission:** WRITE on `/admin/crm/sites`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string | `service_center_id`. Not checked up front; an unknown id fails on the foreign key. |

**Query parameters** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `capability_code` | string | yes | Trimmed and upper-cased before saving. Max 40. Free text, but activity types match on it (seeded codes used by activity types: `REPAIR`, `DEVICE_SALE`, `APP_INSTALL`, `LICENCE_ISSUE`, `REGISTRATION_ASSIST`, `RESERVATION_PICKUP`, `PRIZE_PICKUP`). |
| `project_id` | integer | no | Falsy -> null (capability for any project). |
| `crystal_section` | string | no | Max 20. Falsy -> null. |
| `valid_from` | string | no | `YYYY-MM-DD`. |
| `valid_to` | string | no | `YYYY-MM-DD`, on or after `valid_from` (DB check). |

New rows are `is_active = true`.

**Response** `200`, message `created` - `data` is the inserted capability row: `capability_id` (string), `service_center_id` (string), `project_id`, `capability_code`, `crystal_section`, `valid_from`, `valid_to`, `is_active`, `created_at`.

```json
{
  "success": true,
  "message": "created",
  "data": {
    "capability_id": "102",
    "service_center_id": "41",
    "project_id": null,
    "capability_code": "RESERVATION_PICKUP",
    "crystal_section": null,
    "valid_from": "2026-10-01",
    "valid_to": null,
    "is_active": true,
    "created_at": "2026-10-11T03:05:00.000Z"
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `crm.sites.aCapabilityIsRequired` ("name the capability") | `capability_code` missing or empty. |
| 409 | `crm.sites.theSiteAlreadyHasThat` ("the site already has that capability") | An active capability with the same site, project (null counts as one value) and code exists (`uq_crm_capability`). |
| 409 | `common.referencedRecordIsMissing` | Site or project does not exist. |
| 400 | `common.valueFailedAValidation` | `valid_to` before `valid_from`. |

### POST /api/admin/crm/sites/:id/capabilities/:capabilityId/end

Ends a capability: sets `is_active = false` and, if `valid_to` is empty, sets it to today. The row is kept.

**Permission:** WRITE on `/admin/crm/sites`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string | `service_center_id`. |
| `capabilityId` | string | `capability_id`; must belong to the site. |

**Query parameters** None.

**Request body** None.

**Response** `200`, message `updated` - `data` is the updated capability row (same shape as above, `is_active: false`). Ending an already-ended capability is accepted and leaves `valid_to` as it was.

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | No capability with that id on that site. |

## 20. Site activity

The activity log (`crm_service_center_activity`) is the fact table of things done at a site. Rows recorded in error are reversed (status `REVERSED`), never deleted. Site events (`crm_service_center_event`) are planned on-site happenings (promotion day, roadshow, ...). Targets (`crm_service_center_activity_target`) set an expected quantity and/or amount per site, activity type and period, and are read against the log by the view `v_crm_service_center_activity_progress` (only `COMPLETED` activities, `occurred_at` from `period_start` up to the end of `period_end`).

Seeded activity types (`crm_service_center_activity_type`): `REPAIR_INTAKE`, `REPAIR_DELIVERY` (need `REPAIR`), `DEVICE_SALE`, `EPROD_SALE` (need `DEVICE_SALE`, count amount), `APP_INSTALL`, `LICENCE_ISSUE` (need the same-named capability, count amount), `REGISTRATION_ASSIST` (needs `REGISTRATION_ASSIST`), `RESERVATION_PICKUP` (needs `RESERVATION_PICKUP`, counts amount), `PRIZE_HANDOVER` (needs `PRIZE_PICKUP`), `PROMOTION_EVENT`, `TRAINING`, `INSPECTION`, `CUSTOMER_VISIT` (no capability needed). `activity_type_id` is a smallint and comes back as a number.

Types: `service_center_activity_id`, `service_center_event_id`, `service_center_activity_target_id`, `service_center_id`, `party_pk`, `event_id`, `campaign_id`, the `related_*` ids are bigint -> strings. `quantity`, `amount`, `target_quantity`, `target_amount` and the computed progress figures are numeric -> strings (e.g. `"1.000"`, `"250.0000"`).

### GET /api/admin/crm/site-activities

Lists activity log rows.

**Permission:** READ on `/admin/crm/site-activity`.

**Path parameters** None.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `service_center_id` | string | no | - | Exact site. |
| `activity_type_id` | integer | no | - | Exact activity type. |
| `status` | string | no | - | Exact: `COMPLETED`, `CANCELLED`, `REVERSED`. |
| `from` | string | no | - | `occurred_at >= from` (a date or timestamp; a bare date means midnight server time zone). |
| `to` | string | no | - | `occurred_at < to::date + 1`, so the whole `to` day is included. |
| `q` | string | no | - | Trimmed, `ILIKE '%q%'` over site name, customer `display_name`, and `note`. |
| `page`, `limit` | integer | no | 1, 20 | Paging (limit 1..200). |
| `dir` | string | no | `desc` | Applied to the fixed order `occurred_at`, then `service_center_activity_id`. `sort` is ignored. |

An unparseable `from`/`to` is not validated and fails in Postgres (500).

**Request body** None.

**Response** `200` - list shape. Each row is every column of `crm_service_center_activity` plus joined names:

| field | type | notes |
|---|---|---|
| `service_center_activity_id` | string | |
| `service_center_id` | string | |
| `activity_type_id` | integer | |
| `project_id` | integer \| null | |
| `service_center_event_id` | string \| null | Site event it happened at. |
| `occurred_at` | string | ISO timestamp. |
| `party_pk` | string \| null | Customer served. |
| `performed_by_party_pk` | string \| null | |
| `performed_by_manager_id` | integer \| null | Console manager who recorded it. |
| `quantity` | string | numeric(12,3). |
| `amount` | string \| null | numeric(20,4). |
| `currency_code` | string \| null | |
| `status` | string | `COMPLETED`, `CANCELLED`, `REVERSED`. |
| `related_service_case_id`, `related_transaction_id`, `related_product_instance_id`, `related_reservation_id`, `related_award_id` | string \| null | Set by the CRM's own writers (import, reservations, awards). |
| `external_activity_id` | string \| null | Import key. |
| `note` | string \| null | Max 500. |
| `created_at` | string | |
| `activity_code`, `activity_name`, `activity_group` | string | From the activity type. |
| `service_center_code`, `service_center_name` | string | |
| `party_name` | string \| null | Customer `display_name`. |
| `project_code` | string \| null | |
| `manager_name` | string \| null | Name of `performed_by_manager_id`. |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      {
        "service_center_activity_id": "5521",
        "service_center_id": "12",
        "activity_type_id": 3,
        "project_id": null,
        "service_center_event_id": null,
        "occurred_at": "2026-10-10T05:30:00.000Z",
        "party_pk": "100245",
        "performed_by_party_pk": null,
        "performed_by_manager_id": 7,
        "quantity": "1.000",
        "amount": "320.0000",
        "currency_code": "USD",
        "status": "COMPLETED",
        "related_service_case_id": null,
        "related_transaction_id": null,
        "related_product_instance_id": null,
        "related_reservation_id": null,
        "related_award_id": null,
        "external_activity_id": null,
        "note": "Paid cash",
        "created_at": "2026-10-10T05:31:12.000Z",
        "activity_code": "DEVICE_SALE",
        "activity_name": "Phone sold",
        "activity_group": "SALES",
        "service_center_code": "SC-PY-001",
        "service_center_name": "Pyongyang Central Service Centre",
        "party_name": "Kim Chol",
        "project_code": null,
        "manager_name": "Ri Song"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "summary": null
  }
}
```

**Errors** None specific.

### POST /api/admin/crm/site-activities

Records something done at a site. If the activity type names a required capability, the site must hold it as an active capability (any project).

**Permission:** WRITE on `/admin/crm/site-activity`.

**Path parameters** None.

**Query parameters** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `service_center_id` | string \| integer | yes | Site. |
| `activity_type_id` | integer | yes | Must exist and be `is_active`. |
| `project_id` | integer | no | Falsy -> null. |
| `service_center_event_id` | string \| integer | no | Site event. Falsy -> null. |
| `occurred_at` | string | no | ISO timestamp; defaults to now. |
| `party_pk` | string \| integer | no | Customer. Falsy -> null. |
| `quantity` | number | no | Defaults to 1 when absent or `""`. Must be >= 0 (DB). |
| `amount` | number | no | Stored only when the activity type has `counts_amount = true`; otherwise forced to null. `""` -> null. |
| `currency_code` | string | no | Only kept when an amount is stored; then defaults to `USD`. Must exist in `crm_currency`. |
| `related_product_instance_id` | string \| integer | no | Falsy -> null. |
| `note` | string | no | Cut to 500 characters. |

Set by the server: `performed_by_manager_id` = the caller's manager id; `status` = `COMPLETED` (DB default). Other `related_*` columns cannot be set here.

**Response** `200`, message `created` - `data` is the inserted activity row (the `crm_service_center_activity` columns only, without the joined names of the list).

```json
{
  "success": true,
  "message": "created",
  "data": {
    "service_center_activity_id": "5530",
    "service_center_id": "12",
    "activity_type_id": 1,
    "project_id": null,
    "service_center_event_id": null,
    "occurred_at": "2026-10-11T03:10:00.000Z",
    "party_pk": "100245",
    "performed_by_party_pk": null,
    "performed_by_manager_id": 7,
    "quantity": "1.000",
    "amount": null,
    "currency_code": null,
    "status": "COMPLETED",
    "related_service_case_id": null,
    "related_transaction_id": null,
    "related_product_instance_id": null,
    "related_reservation_id": null,
    "related_award_id": null,
    "external_activity_id": null,
    "note": null,
    "created_at": "2026-10-11T03:10:00.000Z"
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `crm.sites.siteAndActivityAreRequired` ("a site and an activity are required") | `service_center_id` or `activity_type_id` missing. |
| 400 | `crm.sites.unknownActivity` ("unknown activity type") | Type does not exist or is inactive. |
| 409 | `crm.sites.thisSiteCannotDoThat` ("this site does not have the {capability} capability") | Type needs a capability the site does not actively hold. |
| 409 | `common.referencedRecordIsMissing` | Unknown site, project, site event, customer or currency. |
| 400 | `common.valueFailedAValidation` | Negative quantity. |

### POST /api/admin/crm/site-activities/:id/reverse

Marks a `COMPLETED` activity as `REVERSED` (so it stops counting toward targets and segment rules). Optionally appends a note.

**Permission:** WRITE on `/admin/crm/site-activity`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string | `service_center_activity_id`. |

**Query parameters** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `note` | string | no | Appended to the existing note as `"<old> \| <new>"`; the result is cut to 500 characters. |

**Response** `200`, message `updated` - `data` is the updated activity row (`status: "REVERSED"`).

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | No such activity. |
| 409 | `crm.sites.alreadyReversed` ("this activity has already been reversed") | Status is not `COMPLETED` (also returned for a `CANCELLED` row). |

### GET /api/admin/crm/site-events

Lists planned on-site events.

**Permission:** READ on `/admin/crm/site-activity`.

**Path parameters** None.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `service_center_id` | string | no | - | Exact site. |
| `status` | string | no | - | Exact: `PLANNED`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`. |
| `upcoming` | string | no | - | `1` keeps events whose `planned_end_at >= now()`. Any other value is ignored. |
| `q` | string | no | - | Trimmed, `ILIKE '%q%'` over event `title` and site name. |
| `page`, `limit` | integer | no | 1, 20 | Paging. |
| `dir` | string | no | `desc` | Applied to `planned_start_at` (the only order). `sort` is ignored. |

**Request body** None.

**Response** `200` - list shape. Each row: all `crm_service_center_event` columns plus:

| field | type | notes |
|---|---|---|
| `service_center_event_id` | string | |
| `service_center_id` | string | |
| `event_type_code` | string | `PROMOTION_DAY`, `PRODUCT_LAUNCH`, `ROADSHOW`, `TRAINING`, `INSPECTION`, `EVENT_PICKUP_DAY`, `COMMUNITY_EVENT`. |
| `title` | string | Max 200. |
| `description` | string \| null | |
| `project_id` | integer \| null | |
| `event_id` | string \| null | Linked CRM event. |
| `campaign_id` | string \| null | Linked campaign. |
| `planned_start_at`, `planned_end_at` | string | ISO timestamps. |
| `actual_start_at`, `actual_end_at` | string \| null | |
| `capacity`, `attendee_count` | integer \| null | |
| `status` | string | |
| `owner_manager_id` | integer \| null | |
| `outcome_note` | string \| null | |
| `created_at`, `updated_at` | string | |
| `service_center_name` | string | |
| `event_name` | string \| null | Linked CRM event name. |
| `campaign_name` | string \| null | |
| `owner_name` | string \| null | |
| `activity_cnt` | integer | `COMPLETED` activities recorded against this site event. |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      {
        "service_center_event_id": "31",
        "service_center_id": "12",
        "event_type_code": "PROMOTION_DAY",
        "title": "Autumn promotion day",
        "description": null,
        "project_id": null,
        "event_id": null,
        "campaign_id": "4",
        "planned_start_at": "2026-10-18T00:00:00.000Z",
        "planned_end_at": "2026-10-18T09:00:00.000Z",
        "actual_start_at": null,
        "actual_end_at": null,
        "capacity": 200,
        "attendee_count": null,
        "status": "CONFIRMED",
        "owner_manager_id": 7,
        "outcome_note": null,
        "created_at": "2026-10-02T01:00:00.000Z",
        "updated_at": "2026-10-02T01:00:00.000Z",
        "service_center_name": "Pyongyang Central Service Centre",
        "event_name": null,
        "campaign_name": "Autumn upgrade",
        "owner_name": "Ri Song",
        "activity_cnt": 0
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "summary": null
  }
}
```

**Errors** None specific.

### POST /api/admin/crm/site-events

Creates a site event.

**Permission:** WRITE on `/admin/crm/site-activity`.

**Path parameters** None.

**Query parameters** None.

**Request body** Only these keys are read; `""` becomes null. The service checks only the two enums; required fields are enforced by the database.

| field | type | required | rules |
|---|---|---|---|
| `service_center_id` | string \| integer | yes (DB) | Site. |
| `event_type_code` | string | yes (DB) | One of `PROMOTION_DAY`, `PRODUCT_LAUNCH`, `ROADSHOW`, `TRAINING`, `INSPECTION`, `EVENT_PICKUP_DAY`, `COMMUNITY_EVENT`. |
| `title` | string | yes (DB) | Max 200. |
| `planned_start_at` | string | yes (DB) | ISO timestamp. |
| `planned_end_at` | string | yes (DB) | Not before `planned_start_at`. |
| `description` | string | no | |
| `project_id` | integer | no | |
| `event_id` | string \| integer | no | CRM event. |
| `campaign_id` | string \| integer | no | Campaign. |
| `actual_start_at`, `actual_end_at` | string | no | End not before start. |
| `capacity`, `attendee_count` | integer | no | >= 0. |
| `status` | string | no | `PLANNED` (DB default), `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`. Any value in the list may be set; there is no transition check. |
| `owner_manager_id` | integer | no | Defaults to the caller. |
| `outcome_note` | string | no | |

**Response** `200`, message `created` - `data` is the inserted `crm_service_center_event` row (no joined names, no `activity_cnt`).

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `crm.common.chooseAnEventType` ("choose an event type") | `event_type_code` given but not in the list. |
| 400 | `crm.common.notAStatusYouCanSet` ("not a status that can be set here") | `status` given but not in the list. |
| 400 | `common.isRequired` ("{column} is required") | A NOT NULL field (site, type, title, planned start/end) missing. |
| 400 | `common.valueFailedAValidation` | End before start, negative capacity/attendees. |
| 409 | `common.referencedRecordIsMissing` | Unknown site, project, event, campaign or manager. |

### PUT /api/admin/crm/site-events/:id

Updates a site event. Partial: only keys present are changed.

**Permission:** WRITE on `/admin/crm/site-activity`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string | `service_center_event_id`. |

**Query parameters** None.

**Request body** Same fields and rules as the create, all optional. `owner_manager_id` is not defaulted on update.

**Response** `200`, message `updated` - `data` is the updated row.

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `crm.common.chooseAnEventType` | Bad type. |
| 400 | `crm.common.notAStatusYouCanSet` | Bad status. |
| 404 | `common.notFound` | No such site event. |
| 400 / 409 | DB errors as for create | Constraint failures. |
| 500 | `common.internalServerError` | Body contains none of the accepted keys (knex refuses an empty update; there is no `nothingToUpdate` check here). |

### GET /api/admin/crm/site-targets

Lists targets with their progress (from `v_crm_service_center_activity_progress`).

**Permission:** READ on `/admin/crm/site-activity`.

**Path parameters** None.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `service_center_id` | string | no | - | Exact site. |
| `activity_type_id` | integer | no | - | Exact activity type. |
| `current` | string | no | - | `1` keeps targets whose period contains today (`period_start <= CURRENT_DATE <= period_end`). |
| `q` | string | no | - | Trimmed, `ILIKE '%q%'` over the site name. |
| `page`, `limit` | integer | no | 1, 20 | Paging. |

The order is fixed: `period_start` descending, then site name. `sort` and `dir` are ignored.

**Request body** None.

**Response** `200` - list shape. Each row:

| field | type | notes |
|---|---|---|
| `service_center_activity_target_id` | string | |
| `service_center_id` | string | |
| `service_center_name` | string | |
| `activity_type_id` | integer | |
| `activity_code` | string | |
| `period_start`, `period_end` | string | `YYYY-MM-DD`. |
| `target_quantity` | string \| null | numeric. |
| `actual_quantity` | string | Sum of `quantity` of `COMPLETED` activities of that site and type in the period; `"0"` when none. |
| `target_amount` | string \| null | numeric. |
| `actual_amount` | string | Sum of `amount` likewise. Note: amounts are summed regardless of currency. |
| `quantity_pct` | string \| null | `actual_quantity / target_quantity * 100`, 1 decimal; null when no positive quantity target. |
| `activity_name` | string | |
| `note` | string \| null | Target note. |
| `currency_code` | string \| null | Target currency. |
| `amount_pct` | string \| null | `actual_amount / target_amount * 100`, 1 decimal; null when no positive amount target. |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      {
        "service_center_activity_target_id": "8",
        "service_center_id": "12",
        "service_center_name": "Pyongyang Central Service Centre",
        "activity_type_id": 3,
        "activity_code": "DEVICE_SALE",
        "period_start": "2026-10-01",
        "period_end": "2026-10-31",
        "target_quantity": "25.000",
        "actual_quantity": "11.000",
        "target_amount": "8000.0000",
        "actual_amount": "3520.0000",
        "quantity_pct": "44.0",
        "activity_name": "Phone sold",
        "note": null,
        "currency_code": "USD",
        "amount_pct": "44.0"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "summary": null
  }
}
```

**Errors** None specific.

### POST /api/admin/crm/site-targets

Sets a target for one site, activity type and period.

**Permission:** WRITE on `/admin/crm/site-activity`.

**Path parameters** None.

**Query parameters** None.

**Request body** `""` becomes null. Only the database validates these.

| field | type | required | rules |
|---|---|---|---|
| `service_center_id` | string \| integer | yes (DB) | |
| `activity_type_id` | integer | yes (DB) | |
| `period_start` | string | yes (DB) | `YYYY-MM-DD`. |
| `period_end` | string | yes (DB) | `YYYY-MM-DD`, not before `period_start`. |
| `target_quantity` | number | one of the two | >= 0. |
| `target_amount` | number | one of the two | >= 0. At least one of quantity/amount must be non-null. |
| `currency_code` | string | no | Defaults to `USD` when `target_amount` is given non-null and no currency is sent. |
| `note` | string | no | Max 255. |

`set_by_manager_id` is set to the caller. Only one target may exist per site, activity type and `period_start`.

**Response** `200`, message `created` - `data` is the inserted `crm_service_center_activity_target` row: `service_center_activity_target_id`, `service_center_id`, `activity_type_id`, `period_start`, `period_end`, `target_quantity`, `target_amount`, `currency_code`, `set_by_manager_id`, `note`, `created_at`, `updated_at` (no progress figures).

**Errors**

| status | message key | when |
|---|---|---|
| 409 | `crm.sites.thatTargetAlreadyExists` ("a target for that site, activity and period already exists") | Same site, type and `period_start` (`uq_crm_loc_target`). |
| 400 | `common.isRequired` | Site, type or period dates missing. |
| 400 | `common.valueFailedAValidation` | Neither quantity nor amount, negative values, or end before start. |
| 409 | `common.referencedRecordIsMissing` | Unknown site, activity type or currency. |

### PUT /api/admin/crm/site-targets/:id

Updates a target. Partial: only keys present are changed (same fields as the create).

**Permission:** WRITE on `/admin/crm/site-activity`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string | `service_center_activity_target_id`. |

**Query parameters** None.

**Request body** Same fields as `POST /site-targets`, all optional. The `USD` default applies when `target_amount` is sent non-null without `currency_code` (it overwrites a stored currency in that case).

**Response** `200`, message `updated` - `data` is the updated target row.

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | No such target. |
| 409 | `crm.sites.thatTargetAlreadyExists` | Change collides with another target. |
| 400 / 409 | DB errors as for create | |
| 500 | `common.internalServerError` | Body contains none of the accepted keys (empty knex update). |

### DELETE /api/admin/crm/site-targets/:id

Deletes a target (hard delete; it holds no history of its own, progress is recomputed from the log).

**Permission:** WRITE on `/admin/crm/site-activity`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string | `service_center_activity_target_id`. |

**Query parameters** None.

**Request body** None.

**Response** `200`, message `deleted`, `data: null`.

```json
{ "success": true, "message": "deleted", "data": null }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | No such target. |

## 21. Segments

A segment is a named rule (`crm_segment`). The rule itself lives in versions (`crm_segment_version.rule_expression`, jsonb): editing the rule creates a new version and closes the old one. Membership (`crm_segment_membership`) is materialised only when the segment is evaluated; members who stop matching get `unmatched_at` set rather than being deleted.

Handlers: `crmController.segments.*` -> `src/services/crm/marketing.service.js`. Types: `segment_id`, `segment_version_id`, `current_version_id`, `segment_membership_id`, `party_pk` are bigint -> strings; `project_id`, `version_no`, `member_count`, `created_by_manager_id` are numbers. `rule_expression` comes back as a parsed JSON object.

### Rule definition format

A rule is JSON (an object, or a string holding JSON). It is compiled into SQL against `crm_party` from a fixed list of conditions; every value is a bound parameter. Only parties with `party_status = 'ACTIVE'` can ever match.

**Groups (combinators).** A node is either a group or a condition.

| node | shape | meaning |
|---|---|---|
| all | `{ "all": [ node, ... ] }` | Every child matches (AND). |
| any | `{ "any": [ node, ... ] }` | At least one child matches (OR). |
| condition | `{ "field": "<name>", ...params }` | One of the fields below. |

- If an object has both `all` and `any`, only `all` is used.
- The array must be non-empty, otherwise `crm.marketing.theRuleIsEmpty`.
- Groups nest. The top node is depth 0; a node at depth 5 or deeper is refused (`crm.marketing.theRuleIsTooDeep`), so at most five levels of nodes.
- There is no NOT combinator; negation exists only through the `owns_no_class` and `no_service_cases` fields.

**Conditions** (`fields()` reports the same list; "optional" below is what the compiler treats as optional). A required parameter that is missing or `""` gives `crm.marketing.theRuleNeedsAValue` with `{field, value: <param>}`. An unknown `field` gives `crm.marketing.unknownRuleField`.

| field | params (required **bold**) | matches a party that ... |
|---|---|---|
| `party_type` | **`value`** | has `party_type = value` (`PERSON` or `ORGANIZATION`). |
| `project_member` | **`project`** | has a linked (not unlinked) account in the project with that `project_code`. |
| `tier` | **`project`**, **`tier`** | has an `ACTIVE` membership in that project whose current tier has `tier_code = tier`. |
| `owns_class` | **`class`**, `min` (default 1) | owns at least `min` active products of product class `class_code = class` (from `crm_party_product_class_stat.active_owned_count`). |
| `owns_no_class` | **`class`** | owns no active product of that class. |
| `points_balance` | **`point_type`**, `min` (default 0) | has a point account of that `point_type_code` with `balance >= min`. |
| `service_cases` | `days` (default 365), `min` (default 1) | has at least `min` service cases received in the last `days` days. |
| `no_service_cases` | `days` (default 365) | has no service case received in the last `days` days. |
| `site_visits` | `days` (default 365), `min` (default 1; 0 also becomes 1), `activity` | has at least `min` `COMPLETED` site activities in the last `days` days, optionally only of `activity_code = activity`. |
| `registered_within` | `days` (default 30) | has a product registration in the last `days` days. |
| `corporate_grade` | **`min_rank`** | has a corporate grade with `rank_no >= min_rank`. A grade assigned by hand on the party wins; otherwise the grade of the latest Dream-wide analysis snapshot. |
| `has_contact` | **`type`** | has an `ACTIVE` contact point of `contact_type = type` (`EMAIL`, `MOBILE`, `PHONE`, `SIM_CID`, `WECHAT_ID`, `WHATSAPP`, `PUSH_TOKEN`). |
| `snapshot` | **`measure`**, **`value`**, `op` (default `>=`), `project` | the chosen measure of the party's latest analysis snapshot compares to `value` with `op`. Without `project` the Dream-wide snapshot (`project_id IS NULL`); with `project` (a project code) that project's snapshot. |
| `activity_status` | **`value`** | the latest Dream-wide snapshot has `activity_status = value` (`NEW`, `ACTIVE`, `AT_RISK`, `LAPSED`, `NEVER_BOUGHT`). |
| `metric` | **`metric`**, **`value`**, `op` (default `>=`) | the latest Dream-wide value of the metric with `metric_code = metric` compares to `value` with `op`. |
| `bought_in_project` | **`project`**, `days` (default 365) | was the `BUYER` on a transaction in that project in the last `days` days, ignoring `REFUND`, `RETURN`, `REVERSAL` types. |
| `consented` | **`project`**, **`purpose`**, **`channel`** | has a `GRANTED` consent for that project code, purpose code and channel code. |

For `snapshot`, `measure` must be one of: `purchase_amount_12m`, `purchase_amount_lifetime`, `transaction_count_12m`, `transaction_count_lifetime`, `active_purchase_days_12m`, `average_transaction_amount_12m`, `service_case_count_12m`, `complaint_count_12m`, `corporate_score`, `registered_device_count`, `points_earned_12m`, `location_visit_count_12m`; anything else gives `crm.marketing.unknownRuleField`.

**Operators** (`op`, only for `snapshot` and `metric`): `>=`, `<=`, `>`, `<`, `=`. Any other value gives `crm.marketing.unknownRuleField` with the operator as `{field}`. A party with no snapshot/metric value never matches (the comparison is NULL).

Numeric parameters (`min`, `days`, `value`, `min_rank`) are passed through `Number()`; codes (`project`, `class`, `tier`, ...) are compared exactly. A non-numeric `days` reaches Postgres as an invalid interval and fails with 500.

Example:

```json
{
  "all": [
    { "field": "owns_class", "class": "SMARTPHONE" },
    { "field": "no_service_cases", "days": 365 },
    { "any": [
      { "field": "snapshot", "measure": "purchase_amount_12m", "op": ">", "value": 1000 },
      { "field": "tier", "project": "CRYSTAL", "tier": "GOLD" }
    ] },
    { "field": "consented", "project": "PLATFORM", "purpose": "MARKETING", "channel": "SMS" }
  ]
}
```

### GET /api/admin/crm/segments

Lists segments with their current rule.

**Permission:** READ on `/admin/crm/segments`.

**Path parameters** None.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `status` | string | no | - | Exact: `DRAFT`, `ACTIVE`, `PAUSED`, `ARCHIVED`. |
| `q` | string | no | - | Trimmed, `ILIKE '%q%'` over `segment_code`, `segment_name`. |
| `page`, `limit` | integer | no | 1, 20 | Paging. |
| `dir` | string | no | `desc` | Applied to `segment_id` (the only order). `sort` is ignored. |

**Request body** None.

**Response** `200` - list shape. Each row:

| field | type | notes |
|---|---|---|
| `segment_id` | string | |
| `project_id` | integer \| null | |
| `segment_code` | string | Max 50; unique per project. |
| `segment_name` | string | Max 150. |
| `segment_description` | string \| null | |
| `current_version_id` | string \| null | |
| `calculation_frequency` | string \| null | `REALTIME`, `DAILY`, `WEEKLY`, `ON_DEMAND` (stored only; nothing schedules evaluation from it in this service). |
| `status` | string | |
| `member_count` | integer \| null | Members at the last evaluation; null before the first. |
| `last_evaluated_at` | string \| null | |
| `created_by_manager_id` | integer \| null | |
| `created_at`, `updated_at` | string | |
| `project_code` | string \| null | |
| `version_no` | integer \| null | Of the current version. |
| `rule_expression` | object \| null | Current rule. |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      {
        "segment_id": "6",
        "project_id": null,
        "segment_code": "PHONE_NO_SERVICE",
        "segment_name": "Phone owners without a service visit this year",
        "segment_description": null,
        "current_version_id": "11",
        "calculation_frequency": "ON_DEMAND",
        "status": "ACTIVE",
        "member_count": 4210,
        "last_evaluated_at": "2026-10-09T06:00:00.000Z",
        "created_by_manager_id": 7,
        "created_at": "2026-09-20T02:00:00.000Z",
        "updated_at": "2026-09-20T02:00:00.000Z",
        "project_code": null,
        "version_no": 2,
        "rule_expression": { "all": [ { "field": "owns_class", "class": "SMARTPHONE" }, { "field": "no_service_cases", "days": 365 } ] }
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "summary": null
  }
}
```

**Errors** None specific.

### POST /api/admin/crm/segments

Creates a segment with version 1 of its rule. Membership is not computed; call `evaluate` afterwards.

**Permission:** WRITE on `/admin/crm/segments`.

**Path parameters** None.

**Query parameters** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `segment_code` | string | yes | Max 50. Unique per project (null project counts as one). Not trimmed. |
| `segment_name` | string | yes | Max 150. |
| `rule_expression` | object \| string | yes | A rule (see format above). Compiled and validated before saving; not run. |
| `project_id` | integer | no | Falsy -> null. |
| `segment_description` | string | no | |
| `calculation_frequency` | string | no | Default `ON_DEMAND`; DB allows `REALTIME`, `DAILY`, `WEEKLY`, `ON_DEMAND`. |

`status` is always `ACTIVE` on create; `created_by_manager_id` is the caller.

**Response** `200`, message `created` - `data` is the `crm_segment` row after `current_version_id` is set (same columns as a list row, without `project_code`, `version_no`, `rule_expression`).

```json
{
  "success": true,
  "message": "created",
  "data": {
    "segment_id": "7",
    "project_id": null,
    "segment_code": "BIG_SPENDERS",
    "segment_name": "Spent over 1,000 in 12 months",
    "segment_description": null,
    "current_version_id": "12",
    "calculation_frequency": "ON_DEMAND",
    "status": "ACTIVE",
    "member_count": null,
    "last_evaluated_at": null,
    "created_by_manager_id": 7,
    "created_at": "2026-10-11T03:20:00.000Z",
    "updated_at": "2026-10-11T03:20:00.000Z"
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `crm.common.codeAndNameAreRequired` ("a code and a name are required") | Code or name missing. |
| 400 | `crm.marketing.theRuleIsEmpty` ("the rule is empty") | No rule, not an object, or an empty `all`/`any`. |
| 400 | `crm.common.theRuleIsNotValidJson` ("the rule is not valid JSON") | String rule that does not parse. |
| 400 | `crm.marketing.theRuleIsTooDeep` ("the rule is nested too deeply") | Nesting beyond five levels. |
| 400 | `crm.marketing.unknownRuleField` ("the rule cannot use \"{field}\"") | Unknown field, measure or operator. |
| 400 | `crm.marketing.theRuleNeedsAValue` ("the condition \"{field}\" needs a value for {value}") | Required parameter missing. |
| 409 | `crm.settings.thatCodeIsTaken` ("that code is already in use") | Code taken in that project (`uq_crm_segment_code`). |
| 400 | `common.valueFailedAValidation` | Bad `calculation_frequency`. |

### POST /api/admin/crm/segments/preview

Counts how many active parties a rule would match right now, without saving anything. It is a POST only to carry the rule in the body; it needs READ, not WRITE.

**Permission:** READ on `/admin/crm/segments`.

**Path parameters** None.

**Query parameters** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `rule_expression` | object \| string | yes | A rule (see format above). |

**Response** `200` - `data`:

| field | type | notes |
|---|---|---|
| `members` | integer | Number of `ACTIVE` parties the rule matches now. |

```json
{ "success": true, "message": "ok", "data": { "members": 1873 } }
```

**Errors** The rule errors listed under `POST /segments` (`theRuleIsEmpty`, `theRuleIsNotValidJson`, `theRuleIsTooDeep`, `unknownRuleField`, `theRuleNeedsAValue`), all 400.

### GET /api/admin/crm/segments/:id

One segment with all its rule versions.

**Permission:** READ on `/admin/crm/segments`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string | `segment_id`. |

**Query parameters** None.

**Request body** None.

**Response** `200` - `data`:

| field | type | notes |
|---|---|---|
| `segment` | object | The `crm_segment` row plus `project_code`. |
| `versions` | array | All versions, newest `version_no` first. Each: `segment_version_id` (string), `segment_id` (string), `version_no` (integer), `rule_expression` (object), `effective_from` (string), `effective_to` (string\|null; null on the current one), `created_by_manager_id` (integer\|null), `created_at`, `created_by_name` (string\|null). |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "segment": {
      "segment_id": "6",
      "project_id": null,
      "segment_code": "PHONE_NO_SERVICE",
      "segment_name": "Phone owners without a service visit this year",
      "segment_description": null,
      "current_version_id": "11",
      "calculation_frequency": "ON_DEMAND",
      "status": "ACTIVE",
      "member_count": 4210,
      "last_evaluated_at": "2026-10-09T06:00:00.000Z",
      "created_by_manager_id": 7,
      "created_at": "2026-09-20T02:00:00.000Z",
      "updated_at": "2026-09-20T02:00:00.000Z",
      "project_code": null
    },
    "versions": [
      {
        "segment_version_id": "11",
        "segment_id": "6",
        "version_no": 2,
        "rule_expression": { "all": [ { "field": "owns_class", "class": "SMARTPHONE" }, { "field": "no_service_cases", "days": 365 } ] },
        "effective_from": "2026-10-01T01:00:00.000Z",
        "effective_to": null,
        "created_by_manager_id": 7,
        "created_at": "2026-10-01T01:00:00.000Z",
        "created_by_name": "Ri Song"
      }
    ]
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | No such segment. |

### PUT /api/admin/crm/segments/:id

Updates a segment's header fields. The rule cannot be changed here (use `POST /segments/:id/versions`), nor can the code or project.

**Permission:** WRITE on `/admin/crm/segments`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string | `segment_id`. |

**Query parameters** None.

**Request body** Partial; `""` becomes null.

| field | type | required | rules |
|---|---|---|---|
| `segment_name` | string | no | Max 150; cannot be null. |
| `segment_description` | string | no | |
| `calculation_frequency` | string | no | `REALTIME`, `DAILY`, `WEEKLY`, `ON_DEMAND`, or null. |
| `status` | string | no | `DRAFT`, `ACTIVE`, `PAUSED`, `ARCHIVED`. No transition rules: any value may follow any other. An `ARCHIVED` segment cannot be evaluated. |

**Response** `200`, message `updated` - `data` is the updated `crm_segment` row.

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | No such segment. |
| 400 | `common.nothingToUpdate` | None of the four fields present. |
| 400 | `common.isRequired` | `segment_name` set to `""`/null. |
| 400 | `common.valueFailedAValidation` | Bad `status` or `calculation_frequency`. |

### GET /api/admin/crm/segments/:id/members

Lists current (or past) members from the last evaluation.

**Permission:** READ on `/admin/crm/segments`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string | `segment_id`. Not checked; an unknown id returns an empty list. |

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `past` | string | no | - | `1` lists former members (`unmatched_at` set); otherwise current members (`unmatched_at` null). |
| `q` | string | no | - | Trimmed; `display_name ILIKE '%q%'`, or, when `q` is a positive integer (optionally prefixed with `#`), an exact `party_pk` match. |
| `page`, `limit` | integer | no | 1, 20 | Paging. |

Order is fixed: `matched_at` descending. `sort`/`dir` are ignored.

**Request body** None.

**Response** `200` - list shape. Each row:

| field | type | notes |
|---|---|---|
| `segment_membership_id` | string | |
| `segment_id` | string | |
| `segment_version_id` | string | Version that matched them. |
| `party_pk` | string | |
| `matched_at` | string | When they entered. |
| `unmatched_at` | string \| null | When they left. |
| `evaluation_reference_date` | string \| null | `YYYY-MM-DD` of the evaluation that added them. |
| `explanation_json` | object \| null | Not written by this service (always null from evaluate). |
| `party_name` | string | `display_name`. |
| `party_type` | string | `PERSON` / `ORGANIZATION`. |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      {
        "segment_membership_id": "90311",
        "segment_id": "6",
        "segment_version_id": "11",
        "party_pk": "100245",
        "matched_at": "2026-10-09T06:00:00.000Z",
        "unmatched_at": null,
        "evaluation_reference_date": "2026-10-09",
        "explanation_json": null,
        "party_name": "Kim Chol",
        "party_type": "PERSON"
      }
    ],
    "total": 4210,
    "page": 1,
    "limit": 20,
    "summary": null
  }
}
```

**Errors** None specific.

### POST /api/admin/crm/segments/:id/versions

Replaces the segment's rule with a new version. The previous open version gets `effective_to = now()`; the new one gets `version_no = max + 1` and becomes `current_version_id`. Membership is not recomputed until the next evaluate.

**Permission:** WRITE on `/admin/crm/segments`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string | `segment_id`. |

**Query parameters** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `rule_expression` | object \| string | yes | A rule (see format above); compiled before anything is written. |

**Response** `200`, message `created` - `data` is the new `crm_segment_version` row (same fields as a `versions` item in the detail, without `created_by_name`).

```json
{
  "success": true,
  "message": "created",
  "data": {
    "segment_version_id": "13",
    "segment_id": "6",
    "version_no": 3,
    "rule_expression": { "all": [ { "field": "owns_class", "class": "SMARTPHONE" }, { "field": "no_service_cases", "days": 180 } ] },
    "effective_from": "2026-10-11T03:25:00.000Z",
    "effective_to": null,
    "created_by_manager_id": 7,
    "created_at": "2026-10-11T03:25:00.000Z"
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | rule errors | As under `POST /segments` (checked before the segment lookup, so a bad rule on an unknown id is a 400). |
| 404 | `common.notFound` | No such segment. |

### POST /api/admin/crm/segments/:id/evaluate

Runs the current rule now and updates membership: new matches get a membership row (tagged with the current version), parties who no longer match get `unmatched_at = now()`. Sets `member_count` and `last_evaluated_at` on the segment. Runs in one transaction with the segment row locked.

**Permission:** WRITE on `/admin/crm/segments`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string | `segment_id`. |

**Query parameters** None.

**Request body** None.

**Response** `200`, message `segment evaluated` (`crm.marketing.evaluated`) - `data`:

| field | type | notes |
|---|---|---|
| `members` | integer | Parties matching now. |
| `joined` | integer | New members added by this run. |
| `left` | integer | Members closed by this run. |

```json
{ "success": true, "message": "segment evaluated", "data": { "members": 4188, "joined": 35, "left": 57 } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | No such segment. |
| 409 | `crm.marketing.thisSegmentIsArchived` ("this segment is archived") | Status `ARCHIVED`. `DRAFT` and `PAUSED` segments can still be evaluated. |
| 400 | rule errors | If the stored rule no longer compiles. |

## 22. Campaigns

A campaign (`crm_campaign`) freezes one or more audiences (`crm_campaign_audience` + `crm_campaign_audience_member`), then defines actions (`crm_campaign_action`, one message per channel and purpose to one audience, with its content in `crm_campaign_content`). Preparing an action decides per frozen member whether they may be contacted and writes `crm_campaign_recipient` rows. **Nothing is sent by this API**: there is no message gateway; the prepared recipients are what a sender would read. Costs (`crm_campaign_cost`) are recorded for ROI.

Handlers: `crmController.campaigns.*` -> `src/services/crm/marketing.service.js`. Types: `campaign_id`, `audience_id`, `action_id`, `content_id`, `recipient_id`, `audience_member_id`, `campaign_cost_id`, `party_pk`, `source_segment_id`, `source_event_id`, `contact_point_id` are bigint -> strings; `project_id`, `channel_id`, `purpose_id`, manager ids, `member_count`, `execution_order`, `attribution_window_days` are numbers; `amount` and money sums are numeric -> strings.

**Campaign state machine** (`POST /campaigns/:id/status`):

| from | allowed to |
|---|---|
| `DRAFT` | `APPROVED`, `CANCELLED` |
| `APPROVED` | `DRAFT`, `ACTIVE`, `CANCELLED` |
| `ACTIVE` | `COMPLETED`, `CANCELLED` |
| `COMPLETED` | (none) |
| `CANCELLED` | (none) |

Side effects: to `APPROVED` the caller must not be the creator (four-eyes; also a DB check) and `approved_by_manager_id` / `approved_at` are set; back to `DRAFT` clears them; to `COMPLETED` sets `completed_at`; to `CANCELLED` sets every action not `COMPLETE`/`CANCELLED` to `CANCELLED`. A `COMPLETED` or `CANCELLED` campaign is "finished": it cannot be edited and no audience or action can be added, changed or prepared. Actions can be prepared only while the campaign is `APPROVED` or `ACTIVE`.

**Action state machine:**

| from | to | how |
|---|---|---|
| `DRAFT` | `READY` | `POST .../actions/:actionId/prepare` only (campaign must be `APPROVED`/`ACTIVE`). |
| `DRAFT` | `CANCELLED` | `POST .../status` |
| `READY` | `RUNNING`, `CANCELLED` | `POST .../status` |
| `RUNNING` | `COMPLETE`, `CANCELLED` | `POST .../status` |
| `COMPLETE`, `CANCELLED` | (none) | |

Only a `DRAFT` action can be edited. Status changes through `POST .../status` do not look at the campaign's status and do not change recipient rows.

**Recipient decision** (prepare), first reason that applies wins:

| skip_reason_code | when |
|---|---|
| `PROJECT_OPTION_DISABLED` | The campaign's project (or `PLATFORM` when the campaign has none) has no communication option for this purpose and channel, or the option is disabled. |
| `WITHDRAWN` | The member's consent for that option is `WITHDRAWN`. |
| `DENIED` | The consent is `DENIED`. |
| `NO_CONSENT` | Opt-in is needed (option `consent_required` or purpose `requires_opt_in`) and there is no `GRANTED` consent in force (within `effective_from`/`effective_to`). |
| `INVALID_CONTACT` | The channel needs a contact type and the contact chosen on the consent is retired/out of date, or the member has contacts of that type but none is `ACTIVE` and within its validity. |
| `NO_CONTACT` | The member has no contact of the channel's type at all. |

Otherwise `ELIGIBLE`, with `contact_point_id` and `destination_snapshot` (the address value) copied onto the row. The contact used is the one named on the consent if it is live, otherwise the best live one (primary first, then verified, then lowest id). Channel contact types (seed): `EMAIL` -> `EMAIL`, `SMS` -> `MOBILE`, `PUSH` -> `PUSH_TOKEN`, `PHONE_CALL` -> `MOBILE`, `IN_APP` -> none needed.

### GET /api/admin/crm/campaigns

Lists campaigns.

**Permission:** READ on `/admin/crm/campaigns`.

**Path parameters** None.

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `campaign_status` | string | no | - | Exact: `DRAFT`, `APPROVED`, `ACTIVE`, `COMPLETED`, `CANCELLED`. |
| `campaign_type` | string | no | - | Exact: `PROMOTION`, `RETENTION`, `WIN_BACK`, `PRODUCT_LAUNCH`, `SERVICE`, `EVENT_NOTICE`, `SURVEY`. |
| `q` | string | no | - | Trimmed, `ILIKE '%q%'` over `campaign_code`, `campaign_name`. |
| `page`, `limit` | integer | no | 1, 20 | Paging. |
| `dir` | string | no | `desc` | Applied to `campaign_id` (the only order). `sort` is ignored. |

**Request body** None.

**Response** `200` - list shape. Each row: all `crm_campaign` columns plus:

| field | type | notes |
|---|---|---|
| `campaign_id` | string | |
| `project_id` | integer \| null | |
| `campaign_code` | string | Max 50, unique per project. |
| `campaign_name` | string | Max 250. |
| `campaign_type` | string | |
| `description` | string \| null | |
| `campaign_status` | string | |
| `start_at`, `end_at` | string \| null | |
| `completed_at` | string \| null | |
| `owner_manager_id`, `created_by_manager_id`, `approved_by_manager_id` | integer \| null | |
| `approved_at` | string \| null | |
| `created_at`, `updated_at` | string | |
| `project_code` | string \| null | |
| `owner_name` | string \| null | |
| `audience_cnt` | integer | Sum of `member_count` over the campaign's audiences (a party in two audiences counts twice). |
| `cost_total` | string | Sum of cost amounts (all currencies added together), e.g. `"0"`. |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      {
        "campaign_id": "4",
        "project_id": 1,
        "campaign_code": "AUT-UPG-2026",
        "campaign_name": "Autumn upgrade",
        "campaign_type": "PROMOTION",
        "description": null,
        "campaign_status": "APPROVED",
        "start_at": "2026-10-15T00:00:00.000Z",
        "end_at": "2026-11-15T00:00:00.000Z",
        "completed_at": null,
        "owner_manager_id": 7,
        "created_by_manager_id": 7,
        "approved_by_manager_id": 3,
        "approved_at": "2026-10-10T08:00:00.000Z",
        "created_at": "2026-10-05T02:00:00.000Z",
        "updated_at": "2026-10-10T08:00:00.000Z",
        "project_code": "PLATFORM",
        "owner_name": "Ri Song",
        "audience_cnt": 4188,
        "cost_total": "150.0000"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "summary": null
  }
}
```

**Errors** None specific.

### POST /api/admin/crm/campaigns

Creates a campaign in `DRAFT`.

**Permission:** WRITE on `/admin/crm/campaigns`.

**Path parameters** None.

**Query parameters** None.

**Request body** Only these keys are read; `""` becomes null.

| field | type | required | rules |
|---|---|---|---|
| `campaign_code` | string | yes | Max 50; unique per project (null project counts as one). |
| `campaign_name` | string | yes | Max 250. |
| `campaign_type` | string | yes | `PROMOTION`, `RETENTION`, `WIN_BACK`, `PRODUCT_LAUNCH`, `SERVICE`, `EVENT_NOTICE`, `SURVEY`. |
| `project_id` | integer | no | Decides which communication options apply at prepare time; without it `PLATFORM` is used. |
| `description` | string | no | |
| `start_at`, `end_at` | string | no | ISO timestamps; end not before start (DB). |
| `owner_manager_id` | integer | no | Defaults to the caller. |

Set by the server: `campaign_status = DRAFT`, `created_by_manager_id` = caller.

**Response** `200`, message `created` - `data` is the inserted `crm_campaign` row (list-row columns without the joined/computed ones).

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `crm.marketing.chooseACampaignType` ("choose a campaign type") | Type given but not in the list. |
| 400 | `crm.marketing.codeNameAndTypeAreRequired` ("a code, a name and a type are required") | Code, name or type missing. |
| 409 | `crm.settings.thatCodeIsTaken` | Code taken in that project (`uq_crm_campaign_code`). |
| 400 | `common.valueFailedAValidation` | `end_at` before `start_at`. |
| 409 | `common.referencedRecordIsMissing` | Unknown project or manager. |

### GET /api/admin/crm/campaigns/:id

One campaign with its audiences, actions (with content and recipient counts), costs and a funnel.

**Permission:** READ on `/admin/crm/campaigns`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string | `campaign_id`. |

**Query parameters** None.

**Request body** None.

**Response** `200` - `data`:

| field | type | notes |
|---|---|---|
| `campaign` | object | The `crm_campaign` row plus `project_code`, `owner_name`, `created_by_name`, `approved_by_name`. |
| `audiences` | array | By `audience_id`. Each: `audience_id`, `campaign_id`, `audience_name`, `audience_type` (`SEGMENT`, `RULE`, `MANUAL`, `EVENT_TARGETS`), `source_segment_id`, `source_event_id`, `rule_expression` (object\|null), `snapshot_at`, `member_count`, `created_at`, `updated_at`, plus `segment_name`, `event_name`. |
| `actions` | array | Ordered by `execution_order` (nulls last), then `action_id`. Each: all `crm_campaign_action` columns (`action_id`, `campaign_id`, `audience_id`, `action_name`, `action_type`, `channel_id`, `purpose_id`, `content_id`, `execution_order`, `scheduled_at`, `action_status`, `attribution_window_days`, `created_at`, `updated_at`) plus `channel_code`, `channel_name`, `purpose_code`, `purpose_name`, `audience_name`, `content_title`, `content_body`, `content_type`, `locked_at` (content locked at prepare), `recipients` (object `{status: count}` or null before prepare), `skipped` (object `{skip_reason_code: count}` or null). |
| `costs` | array | Newest `occurred_at` first. Each: `campaign_cost_id`, `campaign_id`, `action_id`, `cost_type`, `amount` (string), `currency_code`, `occurred_at`, `created_by_manager_id`, `created_at`, `created_by_name`. |
| `funnel` | object | `audience` (integer, sum of audience member counts), `reachable` (integer, recipients `ELIGIBLE`/`QUEUED`/`SENT`/`DELIVERED`), `sent` (integer, `SENT`/`DELIVERED`), `interactions` (integer), `conversions` (integer), `conversion_value` (string), `cost` (string). Recipient counts are across all actions. |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "campaign": {
      "campaign_id": "4",
      "campaign_code": "AUT-UPG-2026",
      "campaign_name": "Autumn upgrade",
      "campaign_type": "PROMOTION",
      "campaign_status": "APPROVED",
      "project_id": 1,
      "project_code": "PLATFORM",
      "owner_name": "Ri Song",
      "created_by_name": "Ri Song",
      "approved_by_name": "Pak Mi"
    },
    "audiences": [
      {
        "audience_id": "5",
        "campaign_id": "4",
        "audience_name": "Phone owners, no service",
        "audience_type": "SEGMENT",
        "source_segment_id": "6",
        "source_event_id": null,
        "rule_expression": null,
        "snapshot_at": "2026-10-10T08:10:00.000Z",
        "member_count": 4188,
        "created_at": "2026-10-10T08:10:00.000Z",
        "updated_at": "2026-10-10T08:10:00.000Z",
        "segment_name": "Phone owners without a service visit this year",
        "event_name": null
      }
    ],
    "actions": [
      {
        "action_id": "9",
        "campaign_id": "4",
        "audience_id": "5",
        "action_name": "SMS invite",
        "action_type": "SEND_MESSAGE",
        "channel_id": 2,
        "purpose_id": 4,
        "content_id": "9",
        "execution_order": 1,
        "scheduled_at": "2026-10-15T01:00:00.000Z",
        "action_status": "READY",
        "attribution_window_days": 14,
        "created_at": "2026-10-10T08:20:00.000Z",
        "updated_at": "2026-10-10T08:30:00.000Z",
        "channel_code": "SMS",
        "channel_name": "SMS",
        "purpose_code": "MARKETING",
        "purpose_name": "Marketing",
        "audience_name": "Phone owners, no service",
        "content_title": null,
        "content_body": "Upgrade your phone this autumn at any Crystal centre.",
        "content_type": "SMS",
        "locked_at": "2026-10-10T08:30:00.000Z",
        "recipients": { "ELIGIBLE": 2950, "SKIPPED": 1238 },
        "skipped": { "NO_CONSENT": 1100, "NO_CONTACT": 138 }
      }
    ],
    "costs": [
      {
        "campaign_cost_id": "2",
        "campaign_id": "4",
        "action_id": "9",
        "cost_type": "SMS",
        "amount": "150.0000",
        "currency_code": "USD",
        "occurred_at": "2026-10-10T09:00:00.000Z",
        "created_by_manager_id": 7,
        "created_at": "2026-10-10T09:00:00.000Z",
        "created_by_name": "Ri Song"
      }
    ],
    "funnel": {
      "audience": 4188,
      "reachable": 2950,
      "sent": 0,
      "interactions": 0,
      "conversions": 0,
      "conversion_value": "0",
      "cost": "150.0000"
    }
  }
}
```

(The `campaign` object is abbreviated in the example; all columns are returned.)

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | No such campaign. |

### PUT /api/admin/crm/campaigns/:id

Updates a campaign's header. Partial: keys present are changed. Allowed in any status except `COMPLETED`/`CANCELLED` (including `APPROVED` and `ACTIVE`; it does not send an approved campaign back to draft). Status cannot be changed here.

**Permission:** WRITE on `/admin/crm/campaigns`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string | `campaign_id`. |

**Query parameters** None.

**Request body** Same fields as `POST /campaigns` (`project_id`, `campaign_code`, `campaign_name`, `campaign_type`, `description`, `start_at`, `end_at`, `owner_manager_id`), all optional; `""` becomes null.

**Response** `200`, message `updated` - `data` is the updated `crm_campaign` row.

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `crm.marketing.chooseACampaignType` | Bad type. |
| 404 | `common.notFound` | No such campaign. |
| 409 | `crm.marketing.thisCampaignIsFinished` ("this campaign is finished") | Status `COMPLETED` or `CANCELLED`. |
| 409 | `crm.settings.thatCodeIsTaken` | Code collides. |
| 400 | `common.isRequired` | Code, name or type set to `""`/null. |
| 500 | `common.internalServerError` | Body contains none of the accepted keys (empty knex update; no `nothingToUpdate` check). |

### POST /api/admin/crm/campaigns/:id/status

Moves a campaign along its state machine (see the table at the top of this area).

**Permission:** WRITE on `/admin/crm/campaigns`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string | `campaign_id`. |

**Query parameters** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `status` | string | yes | Target status; must be allowed from the current one. |

**Response** `200`, message `updated` - `data` is the updated `crm_campaign` row.

```json
{
  "success": true,
  "message": "updated",
  "data": {
    "campaign_id": "4",
    "campaign_status": "APPROVED",
    "approved_by_manager_id": 3,
    "approved_at": "2026-10-10T08:00:00.000Z",
    "created_by_manager_id": 7
  }
}
```

(Abbreviated; the whole row is returned.)

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | No such campaign. |
| 409 | `crm.common.cannotMoveFromTo` ("cannot move from {from} to {to}") | Transition not allowed, including a missing `status`. |
| 409 | `crm.common.anotherManagerMustApprove` ("another manager has to approve what you created") | Approving a campaign you created. |

### POST /api/admin/crm/campaigns/:id/audiences

Freezes an audience: resolves its members now and stores them, one row per party (duplicates removed, only `ACTIVE` parties kept). Later changes to the source do not change it.

**Permission:** WRITE on `/admin/crm/campaigns`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string | `campaign_id`. |

**Query parameters** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `audience_type` | string | yes | `SEGMENT`, `RULE`, `MANUAL`, `EVENT_TARGETS`. |
| `audience_name` | string | yes | Max 150. |
| `source_segment_id` | string \| integer | for `SEGMENT` | Takes the segment's **current** members as of its last evaluation (no re-evaluation). |
| `source_event_id` | string \| integer | for `EVENT_TARGETS` | Takes the event's targets (`crm_activity_target`) whose status is not `REVOKED`. |
| `rule_expression` | object \| string | for `RULE` | A segment rule (see Segments), run now; stored on the audience. |
| `party_pks` | array \| string | for `MANUAL` | Array of ids, or one string split on whitespace and commas. Entries that are not positive integers are dropped silently; ids that do not exist or are not `ACTIVE` are dropped too. |

**Response** `200`, message `created` - `data` is the inserted `crm_campaign_audience` row: `audience_id`, `campaign_id`, `audience_name`, `audience_type`, `source_segment_id`, `source_event_id`, `rule_expression`, `snapshot_at`, `member_count`, `created_at`, `updated_at`.

```json
{
  "success": true,
  "message": "created",
  "data": {
    "audience_id": "6",
    "campaign_id": "4",
    "audience_name": "VIP list",
    "audience_type": "MANUAL",
    "source_segment_id": null,
    "source_event_id": null,
    "rule_expression": null,
    "snapshot_at": "2026-10-11T03:30:00.000Z",
    "member_count": 3,
    "created_at": "2026-10-11T03:30:00.000Z",
    "updated_at": "2026-10-11T03:30:00.000Z"
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `crm.marketing.chooseAnAudienceType` ("choose where the audience comes from") | Bad or missing `audience_type`. |
| 400 | `crm.marketing.nameTheAudience` ("name the audience") | Missing name. |
| 404 | `common.notFound` | No such campaign. |
| 409 | `crm.marketing.thisCampaignIsFinished` | Campaign `COMPLETED`/`CANCELLED`. |
| 400 | `crm.marketing.chooseASegment` ("choose a segment") | `SEGMENT` without `source_segment_id`. |
| 400 | `crm.marketing.chooseAnEvent` ("choose an event") | `EVENT_TARGETS` without `source_event_id`. |
| 400 | rule errors | `RULE` with a bad rule (as under `POST /segments`). |
| 400 | `crm.marketing.chooseAtLeastOneCustomer` ("choose at least one customer") | `MANUAL` with no well-formed id. (Well-formed ids that match no active party give an audience with `member_count: 0`.) |
| 409 | `common.referencedRecordIsMissing` | Unknown segment or event id. |

### POST /api/admin/crm/campaigns/:id/actions

Adds an action (one message on one channel for one purpose to one audience) with its content. New actions are `DRAFT`.

**Permission:** WRITE on `/admin/crm/campaigns`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string | `campaign_id`. |

**Query parameters** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `channel_id` | integer | yes | Must exist in `crm_communication_channel` (seed: `EMAIL`, `SMS`, `PUSH`, `IN_APP`, `PHONE_CALL`). |
| `audience_id` | string \| integer | yes | Must be an audience of this campaign. |
| `purpose_id` | integer | yes | `crm_communication_purpose` (seed: `TRANSACTIONAL`, `SERVICE_NOTICE`, `EVENT_NOTICE`, `MARKETING`, `SURVEY`). |
| `action_name` | string | no | Max 150. Also used as the content name. |
| `action_type` | string | no | `SEND_MESSAGE`, `CALL`, `PUSH`, `IN_APP` (DB check). Default from the channel: `PHONE_CALL` -> `CALL`, `PUSH` -> `PUSH`, `IN_APP` -> `IN_APP`, otherwise `SEND_MESSAGE`. |
| `content_title` | string | no | Max 250. |
| `content_body` | string | no | |
| `landing_page_url` | string | no | |
| `language_code` | string | no | Max 20. |
| `execution_order` | integer | no | `""`, 0 or absent -> null. |
| `scheduled_at` | string | no | ISO timestamp. Stored only; nothing runs it. |
| `attribution_window_days` | integer | no | Default 14 (0 also becomes 14). DB allows 0..180. |

A `crm_campaign_content` row is created with `content_type` from the channel code (`EMAIL`, `SMS`, `PUSH`, `IN_APP`; any other channel, e.g. `PHONE_CALL`, gives `IN_APP`).

**Response** `200`, message `created` - `data` is the inserted `crm_campaign_action` row (columns listed under the detail's `actions`, without the joined fields).

```json
{
  "success": true,
  "message": "created",
  "data": {
    "action_id": "10",
    "campaign_id": "4",
    "audience_id": "6",
    "action_name": "Email invite",
    "action_type": "SEND_MESSAGE",
    "channel_id": 1,
    "purpose_id": 4,
    "content_id": "10",
    "execution_order": 2,
    "scheduled_at": null,
    "action_status": "DRAFT",
    "attribution_window_days": 14,
    "created_at": "2026-10-11T03:35:00.000Z",
    "updated_at": "2026-10-11T03:35:00.000Z"
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | No such campaign. |
| 409 | `crm.marketing.thisCampaignIsFinished` | Campaign `COMPLETED`/`CANCELLED`. |
| 400 | `crm.common.chooseAChannel` ("choose a channel") | Missing or unknown `channel_id`. |
| 400 | `crm.marketing.audienceAndPurposeAreRequired` ("an audience and a purpose are required") | Missing `audience_id` or `purpose_id`. |
| 409 | `common.referencedRecordIsMissing` | Audience not in this campaign, or unknown purpose. |
| 400 | `common.valueFailedAValidation` | Bad `action_type` or `attribution_window_days` out of range. |

The content row is inserted before the audience/purpose check but inside the same transaction, so a failure leaves nothing behind.

### PUT /api/admin/crm/campaigns/:id/actions/:actionId

Edits a `DRAFT` action and its content.

**Permission:** WRITE on `/admin/crm/campaigns`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string | `campaign_id`. |
| `actionId` | string | `action_id`; must belong to the campaign. |

**Query parameters** None.

**Request body** Same fields as the create. This is close to a full replace: `channel_id`, `audience_id` and `purpose_id` fall back to the stored values when absent, but `action_name`, `content_title`, `content_body`, `landing_page_url`, `language_code`, `execution_order` and `scheduled_at` become null, `attribution_window_days` returns to 14, and `action_type` is re-derived from the channel, when not sent. Send the whole action.

**Response** `200`, message `updated` - `data` is the updated `crm_campaign_action` row.

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | No such campaign, or no such action in it. |
| 409 | `crm.marketing.thisCampaignIsFinished` | Campaign `COMPLETED`/`CANCELLED`. |
| 409 | `crm.marketing.onlyADraftActionCanChange` ("only a draft action can be changed") | Action is not `DRAFT`. |
| 400 | `crm.common.chooseAChannel` | Unknown `channel_id`. |
| 409 | `common.referencedRecordIsMissing` | Audience not in this campaign, or unknown purpose. |

### POST /api/admin/crm/campaigns/:id/actions/:actionId/prepare

Decides, for every frozen member of the action's audience, whether they may be contacted on this channel for this purpose, and writes one `crm_campaign_recipient` row each (`ELIGIBLE` or `SKIPPED` with a reason; see "Recipient decision" above). Locks the content (`locked_at = now()`) and moves the action to `READY`. All in one transaction.

**Permission:** WRITE on `/admin/crm/campaigns`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string | `campaign_id`. |
| `actionId` | string | `action_id`; must belong to the campaign. |

**Query parameters** None.

**Request body** None.

**Response** `200`, message `recipients prepared` (`crm.marketing.prepared`) - `data` is a tally object: keys are `ELIGIBLE` and the skip reason codes that occurred, values are counts. Keys with zero are absent; an empty audience gives `{}`.

```json
{ "success": true, "message": "recipients prepared", "data": { "ELIGIBLE": 2950, "NO_CONSENT": 1100, "NO_CONTACT": 138 } }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | No such campaign, or no such action in it. |
| 409 | `crm.marketing.thisCampaignIsFinished` | Campaign `COMPLETED`/`CANCELLED`. |
| 409 | `crm.marketing.approveTheCampaignFirst` ("approve the campaign before preparing its actions") | Campaign is `DRAFT`. |
| 409 | `crm.marketing.thisActionIsAlreadyPrepared` ("this action has already been prepared") | Action is not `DRAFT`. |
| 409 | `crm.marketing.campaignNeedsAProject` | Campaign has no project and no `PLATFORM` project exists. |

### POST /api/admin/crm/campaigns/:id/actions/:actionId/status

Moves an action along its state machine (see the table at the top of this area). `READY` cannot be reached here; use `prepare`.

**Permission:** WRITE on `/admin/crm/campaigns`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string | `campaign_id`. |
| `actionId` | string | `action_id`; must belong to the campaign. |

**Query parameters** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `status` | string | yes | `DRAFT` -> `CANCELLED`; `READY` -> `RUNNING`/`CANCELLED`; `RUNNING` -> `COMPLETE`/`CANCELLED`. |

**Response** `200`, message `updated` - `data` is the updated `crm_campaign_action` row.

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | No such action in that campaign. |
| 409 | `crm.common.cannotMoveFromTo` | Transition not allowed (including a missing `status`). |

### GET /api/admin/crm/campaigns/:id/actions/:actionId/recipients

Lists the prepared recipients of an action.

**Permission:** READ on `/admin/crm/campaigns`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string | `campaign_id`. |
| `actionId` | string | `action_id`. Neither id is checked; unknown ids give an empty list. |

**Query parameters**

| name | type | required | default | meaning |
|---|---|---|---|---|
| `recipient_status` | string | no | - | Exact: `ELIGIBLE`, `SKIPPED`, `QUEUED`, `SENT`, `DELIVERED`, `FAILED`. |
| `page`, `limit` | integer | no | 1, 20 | Paging. |

Order is fixed: `recipient_id` ascending. `sort`/`dir` are ignored.

**Request body** None.

**Response** `200` - list shape. Each row:

| field | type | notes |
|---|---|---|
| `recipient_id` | string | |
| `action_id`, `campaign_id`, `audience_member_id` | string | |
| `party_pk` | string | |
| `contact_point_id` | string \| null | Contact chosen for an eligible recipient. |
| `party_communication_consent_id` | string \| null | Consent row the decision used, if any. |
| `destination_snapshot` | string \| null | Address/number copied at prepare time. |
| `recipient_status` | string | |
| `skip_reason_code` | string \| null | Set exactly when `SKIPPED`. |
| `provider_message_id` | string \| null | Never set by this API. |
| `queued_at`, `sent_at`, `delivered_at`, `failed_at` | string \| null | Never set by this API. |
| `created_at` | string | |
| `party_name` | string | Customer `display_name`. |

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      {
        "recipient_id": "70001",
        "action_id": "9",
        "campaign_id": "4",
        "audience_member_id": "33012",
        "party_pk": "100245",
        "contact_point_id": "88120",
        "party_communication_consent_id": "4410",
        "destination_snapshot": "+850191234567",
        "recipient_status": "ELIGIBLE",
        "skip_reason_code": null,
        "provider_message_id": null,
        "queued_at": null,
        "sent_at": null,
        "delivered_at": null,
        "failed_at": null,
        "created_at": "2026-10-10T08:30:00.000Z",
        "party_name": "Kim Chol"
      }
    ],
    "total": 4188,
    "page": 1,
    "limit": 20,
    "summary": null
  }
}
```

**Errors** None specific.

### POST /api/admin/crm/campaigns/:id/costs

Records a cost against a campaign (optionally against one of its actions). Allowed in any campaign status, including finished ones.

**Permission:** WRITE on `/admin/crm/campaigns`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string | `campaign_id`. |

**Query parameters** None.

**Request body**

| field | type | required | rules |
|---|---|---|---|
| `cost_type` | string | yes | `MEDIA`, `SMS`, `EMAIL_PROVIDER`, `COUPON`, `AGENCY`, `PRIZE`, `OTHER`. |
| `amount` | number | yes (DB) | numeric(20,4), >= 0. |
| `currency_code` | string | no | Default `USD`; must exist in `crm_currency`. |
| `action_id` | string \| integer | no | Must be an action of this campaign. |
| `occurred_at` | string | no | ISO timestamp; default now. |

`created_by_manager_id` is the caller.

**Response** `200`, message `created` - `data` is the inserted `crm_campaign_cost` row: `campaign_cost_id`, `campaign_id`, `action_id`, `cost_type`, `amount` (string), `currency_code`, `occurred_at`, `created_by_manager_id`, `created_at`.

```json
{
  "success": true,
  "message": "created",
  "data": {
    "campaign_cost_id": "3",
    "campaign_id": "4",
    "action_id": null,
    "cost_type": "MEDIA",
    "amount": "500.0000",
    "currency_code": "USD",
    "occurred_at": "2026-10-11T03:40:00.000Z",
    "created_by_manager_id": 7,
    "created_at": "2026-10-11T03:40:00.000Z"
  }
}
```

**Errors**

| status | message key | when |
|---|---|---|
| 400 | `crm.marketing.chooseACostType` ("choose a cost type") | Bad or missing `cost_type`. |
| 404 | `common.notFound` | No such campaign. |
| 400 | `common.isRequired` | `amount` missing. |
| 400 | `common.valueFailedAValidation` | Negative amount. |
| 409 | `common.referencedRecordIsMissing` | Action not in this campaign, or unknown currency. |

### DELETE /api/admin/crm/campaigns/:id/costs/:costId

Deletes a cost row (hard delete). Allowed in any campaign status.

**Permission:** WRITE on `/admin/crm/campaigns`.

**Path parameters**

| name | type | notes |
|---|---|---|
| `id` | string | `campaign_id`. |
| `costId` | string | `campaign_cost_id`; must belong to the campaign. |

**Query parameters** None.

**Request body** None.

**Response** `200`, message `deleted`, `data: null`.

```json
{ "success": true, "message": "deleted", "data": null }
```

**Errors**

| status | message key | when |
|---|---|---|
| 404 | `common.notFound` | No such cost on that campaign. |

## 23. Master-table endpoints (catalogue, point rules, settings lists)

The product catalogue, the point rules and every basic list on the Settings screen are plain master tables. They are
not served by `crm.controller.js` but by the generic CRUD factory (`src/routes/crud.routes.js` ->
`src/controllers/crud.controller.js` -> `src/services/crud.service.js` -> `src/repositories/crud.repository.js`), the
same one the rest of the console uses. Every table mounted this way gets the same nine endpoints, described once here;
the tables and their columns follow.

### The nine CRUD endpoints

`<base>` is the table's mount path, for example `/api/admin/crm/catalog` or `/api/admin/crm/settings/projects`.
`<page>` is the permission page of that table (see the tables below).

| Method and path | Permission | What it does |
|---|---|---|
| `GET <base>` | READ on `<page>` | Paged, searchable list. |
| `GET <base>/options` | READ on `<page>` | Every row (at most 1000), unpaged, for a select box. |
| `GET <base>/:id` | READ on `<page>` | One row by primary key. |
| `POST <base>` | WRITE on `<page>` | Create a row. |
| `PUT <base>/:id` | WRITE on `<page>` | Update a row (only the columns sent). |
| `DELETE <base>/:id` | WRITE on `<page>` | Delete the row. These tables have no recycle bin (`softDelete: false`), so this is a real `DELETE`. |
| `POST <base>/:id/restore` | WRITE on `<page>` | Always fails with `400 crud.thisResourceIsNot` ("this resource is not soft deleted"), because none of these tables is soft-deleted. Present only because the factory declares it. |
| `GET <base>/:id/dependents` | WRITE on `<page>` | What references this row, so the console can explain before deleting. |
| `DELETE <base>/:id/permanent` | **SUPER** (level 3) on `<page>` | Delete permanently, refused while a blocking reference exists. |

None of the CRM tables declares `excel`, so the factory's `/export` and `/import` spreadsheet endpoints are **not**
mounted for them.

#### `GET <base>` - list

**Query parameters**

| Name | Type | Required | Default | Meaning |
|---|---|---|---|---|
| `q` | string | no | - | Case-insensitive substring search: `CAST(col AS TEXT) ILIKE '%q%'` OR-ed over the table's *searchable* columns (listed per table below). The term is not escaped, so `%` and `_` in it act as wildcards. Ignored when the table has no searchable columns. |
| `page` | integer | no | 1 | Page number, at least 1. |
| `limit` | integer | no | 20 | Rows per page, clamped to 1..200. |
| `sort` | string | no | table's default sort | Must be one of the table's *sortable* columns; anything else falls back to the default sort. |
| `dir` | string | no | `asc` | `desc` for descending; any other value means ascending. (Unlike the CRM's own lists, the factory defaults to ascending.) |
| *filter columns* | string | no | - | Exact match on each *filterable* column the table declares (e.g. `?project_id=3`). Empty values are ignored; undeclared columns are ignored. |
| `deleted` | flag | no | - | Accepted but has no effect on these tables (no recycle bin). |

**Response** `200` - `data` is `{ rows, total, page, limit, summary }`: `rows` are the table's rows (all columns,
`SELECT table.*`, plus the extra joined columns listed for the catalogue, point rules and communication options),
`total` is the count matching the same search and filters, `summary` is always `null`.

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "rows": [
      { "tag_id": 4, "tag_code": "VIP", "tag_name": "VIP customer", "color_scheme": "purple",
        "description": null, "is_active": true, "created_at": "2026-05-02T08:14:11.201Z" }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "summary": null
  }
}
```

#### `GET <base>/options`

All rows of the table (`SELECT table.*`, **without** the joined extras), ordered by the default sort ascending, at
most 1000. `data` is a plain array.

#### `GET <base>/:id`

`data` is the row (`SELECT table.*`, without the joined extras). `404 common.notFound` if there is no such row.

#### `POST <base>` and `PUT <base>/:id`

**Request body**: any of the table's *writable columns* (listed per table). Keys that are not writable columns are
silently dropped. An empty string is stored as `NULL`. No other validation happens in Node: required columns, lengths,
`CHECK` lists and foreign keys are enforced by PostgreSQL and come back through the error map (below).

`PUT` updates only the columns present in the body; a body with none of the writable columns is
`400 common.nothingToUpdate`.

**Response** `200` - `data` is the whole row as stored (`RETURNING *`). Message `common.created` / `common.updated`.
Both are written to the audit trail against the signed-in manager.

#### `DELETE <base>/:id`

`data` is `null`, message `common.deleted`. `404 common.notFound` when nothing was deleted. A row still referenced by
another table is refused by its foreign key: `409 common.referencedRecordIsMissing` ("referenced record is missing or
still in use").

#### `GET <base>/:id/dependents`

**Response** `200`:

| Field | Type | Notes |
|---|---|---|
| `dependents` | array | One entry per referencing foreign key that has rows: `{ count, table, column, references, effect }`. `effect` is `BLOCKS` (NO ACTION / RESTRICT), `CASCADES` or `DETACHES` (SET NULL / SET DEFAULT). |
| `blockers` | array | The `dependents` whose `effect` is `BLOCKS`. |
| `can_purge` | boolean | `true` when there are no blockers. |

```json
{ "success": true, "message": "ok",
  "data": { "dependents": [ { "count": 12, "table": "crm_product_instance", "column": "product_id", "references": "product_id", "effect": "BLOCKS" } ],
            "blockers": [ { "count": 12, "table": "crm_product_instance", "column": "product_id", "references": "product_id", "effect": "BLOCKS" } ],
            "can_purge": false } }
```

`404 common.notFound` if the row does not exist.

#### `DELETE <base>/:id/permanent`

Requires SUPER on the page. Deletes the row when nothing blocks. `data` is `null`, message `common.deleted`.

| Status | Message key | When |
|---|---|---|
| 404 | `common.notFound` | No such row. |
| 409 | `common.otherRecordsStillRefer` | Blocking references exist; `detail` is an array of strings such as `"12 in crm_product_instance"`. |

#### Errors common to all CRUD endpoints

| Status | Message key | When |
|---|---|---|
| 403 | `common.permissionDenied` | The role lacks the level the endpoint needs. |
| 400 | `crm.settings.aValueIsTooLong` | A value is longer than its column allows (SQLSTATE 22001); params `{column}`. Scoped to the CRM router. |
| 409 | `crm.settings.thatCodeIsTaken` | A plain `UNIQUE` code column clashed (constraint named `crm_<...>_code_key`). Scoped to the CRM router. |
| 409 | named constraint key or `common.duplicatedValue` | Any other unique violation (see the UNIQUE map in `src/middleware/error.js`, e.g. `uq_crm_product_code` -> `crm.settings.thatCodeIsTaken`, `uq_crm_comm_option` -> `crm.settings.thatOptionAlreadyExists`, `uq_crm_tier_code` -> `crm.settings.thatCodeIsTaken`). |
| 409 | `common.referencedRecordIsMissing` | A foreign key points at a row that does not exist, or a delete is blocked by a referencing row. |
| 400 | `common.isRequired` | A `NOT NULL` column was left empty; params `{column}`. |
| 400 | `common.valueFailedAValidation` | A `CHECK` constraint failed (for example a value outside an allowed list). |
| 400 | `common.isNotAValue` | A value of the wrong type (text where a number or date is expected). |

### Product catalogue - `/api/admin/crm/catalog`

Page: `/admin/crm/products`. Table `crm_product_catalog`, primary key `product_id` (bigint, returned as a string).

Note: `GET /api/admin/crm/catalog/lookup` is a separate shared picker (see Shared lookups); it is declared before this
mount, so `lookup` is never treated as an `:id`.

| Option | Value |
|---|---|
| Writable columns | `project_id` (int, required), `product_code` (varchar 100, required), `product_name` (varchar 250, required), `parent_product_id` (bigint), `product_type` (varchar 50), `product_kind` (`DEVICE`, `LICENCE`, `SOFTWARE`, `SUBSCRIPTION`, `GOODS`, `SERVICE`; default `DEVICE`), `product_class_id` (int), `crystal_product_id` (int, a Crystal `products.id`), `model_code` (varchar 60), `list_price` (numeric(20,4), returned as a string), `currency_code` (3 letters, must exist in currencies), `is_reservable` (boolean, default false), `status` (`ACTIVE`, `INACTIVE`, `DISCONTINUED`; default `ACTIVE`) |
| Not writable here | `imei_prefixes`, `created_at`, `updated_at` |
| Searchable (`q`) | `product_code`, `product_name`, `model_code` |
| Sortable | `product_id`, `product_code`, `product_name`, `status` |
| Filterable | `project_id`, `product_class_id`, `product_kind`, `status` |
| Default sort | `product_name` |
| Extra list columns | `project_code`, `class_code`, `class_name` (from `crm_product_class`), `crystal_product_name` (Crystal product name), `instance_cnt` (integer: number of `crm_product_instance` rows of this product) |
| Unique | `(project_id, product_code)` -> `409 crm.settings.thatCodeIsTaken` |

Example list row:

```json
{ "product_id": "118", "project_id": 1, "product_code": "SM-X200", "product_name": "Crystal X200",
  "parent_product_id": null, "product_type": null, "product_kind": "DEVICE", "product_class_id": 1,
  "crystal_product_id": 42, "model_code": "X200", "imei_prefixes": ["35847211"], "list_price": "299.0000",
  "currency_code": "USD", "is_reservable": false, "status": "ACTIVE",
  "created_at": "2026-03-01T10:00:00.000Z", "updated_at": "2026-03-01T10:00:00.000Z",
  "project_code": "CRYSTAL", "class_code": "SMARTPHONE", "class_name": "Smartphone",
  "crystal_product_name": "Crystal X200", "instance_cnt": 1520 }
```

### Point rules - `/api/admin/crm/point-rules`

Page: `/admin/crm/points` (the Reward points screen, not Settings). Table `crm_point_rule`, primary key `point_rule_id`.

| Option | Value |
|---|---|
| Writable columns | `rule_code` (varchar 60, required, unique), `rule_name` (varchar 200, required), `point_type_id` (smallint, required), `project_id` (int), `trigger_code` (required; one of `PRODUCT_REGISTRATION`, `DAILY_LOGIN`, `DUTY`, `PURCHASE`, `LICENCE_PURCHASE`, `APP_PURCHASE`, `REPAIR`, `SURVEY`, `BLOG`, `MANUAL`, `EVENT_AWARD`), `main_type` (varchar 100), `sub_type` (varchar 100), `product_class_id` (int), `product_id` (bigint), `points` (numeric(12,3), required; returned as a string), `daily_cap_count` (smallint > 0), `valid_from`, `valid_to` (timestamptz; `valid_to >= valid_from`), `source_rule_key` (varchar 40), `is_active` (boolean, default true) |
| Searchable (`q`) | `rule_code`, `rule_name` |
| Sortable | `point_rule_id`, `rule_code`, `rule_name`, `points`, `trigger_code` |
| Filterable | `point_type_id`, `trigger_code`, `is_active` |
| Default sort | `rule_code` |
| Extra list columns | `point_type_code`, `project_code`, `class_code`, `product_name` (catalogue), `event_cnt` (integer: point events written by this rule) |

Note that the list query uses an inner join on `crm_point_type`, so a rule always has its point type.

### Settings lists - `/api/admin/crm/settings/<path>`

Page: `/admin/crm/settings` for all of them. For each list:

- *Searchable* (`q`) = the code column plus every column whose name ends in `_name`, or is `display_name` or
  `question_label`.
- *Sortable* = the primary key plus every writable column.
- *Default sort* = the primary key unless stated.
- *Filterable* = none unless stated.

| Path | Table | Primary key | Code column | Writable columns (type) | Notes |
|---|---|---|---|---|---|
| `projects` | `crm_project` | `project_id` | `project_code` | `project_code` (varchar 30, unique), `project_name` (varchar 150), `project_type_code` (varchar 30), `source_system_code` (varchar 40), `legal_entity_code` (varchar 50), `status` (`ACTIVE`/`INACTIVE`), `identity_role` (`ESHOP`, `USER_MANAGEMENT` or null; one project per role, `409 crm.settings.anotherProjectHasThatRole`) | **In-use guard**, see below. |
| `product-classes` | `crm_product_class` | `product_class_id` | `class_code` | `class_code` (varchar 40), `class_name` (varchar 120), `parent_product_class_id` (int), `product_domain` (`SMARTPHONE`, `EPRODUCT`, `SOFTWARE`, `LICENCE`, `GOODS`, `SERVICE`; required), `rank_no` (smallint), `legacy_column` (varchar 40), `description` (text), `is_active` (boolean) | System codes: `SMARTPHONE`, `EPRODUCT`, `SOFTWARE`, `STB`, `PC`, `CAMERA`, `KARAOKE_LICENCE`, `MEDIA_LICENCE`. |
| `project-tiers` | `crm_project_tier` | `project_tier_id` | `tier_code` | `project_id` (int, required), `tier_code` (varchar 30), `tier_name` (varchar 100), `rank_no` (smallint), `tier_kind` (`LEVEL`, `GRADE`, `CARD_CLASS`; default `LEVEL`), `source_code` (varchar 60), `min_value` (numeric), `is_active` | Filterable: `project_id`. Unique `(project_id, tier_kind, tier_code)`. |
| `point-types` | `crm_point_type` | `point_type_id` | `point_type_code` | `point_type_code` (varchar 30), `point_type_name` (varchar 100), `owner_project_id` (int), `is_dream_managed` (boolean), `decimal_places` (smallint, default 3), `expires_after_days` (int > 0), `is_active` | System code: `CRYSTAL`. |
| `activity-types` | `crm_service_center_activity_type` | `activity_type_id` | `activity_code` | `activity_code` (varchar 40), `activity_name` (varchar 120), `activity_group` (`SERVICE`, `SALES`, `SOFTWARE`, `EVENT`, `MARKETING`, `OPERATIONS`; required), `required_capability_code` (varchar 40), `counts_quantity` (boolean), `counts_amount` (boolean), `is_active` | System codes: `REPAIR_INTAKE`, `REPAIR_DELIVERY`, `RESERVATION_PICKUP`, `PRIZE_HANDOVER`, `REGISTRATION_ASSIST`. |
| `case-types` | `crm_service_case_type` | `case_type_id` | `case_type_code` | `case_type_code` (varchar 40), `display_name` (varchar 120) | System codes: `REPAIR`, `WARRANTY_REPAIR`. |
| `service-statuses` | `crm_service_status` | `service_status_id` | `status_code` | `status_code` (varchar 30), `display_name` (varchar 100), `sequence_no` (smallint), `is_terminal` (boolean) | System codes: `CLOSED`, `CANCELLED`. |
| `priorities` | `crm_service_priority` | `service_priority_id` | `priority_code` | `priority_code` (varchar 20), `priority_name` (varchar 80), `rank_no` (smallint) | System codes: `LOW`, `NORMAL`, `HIGH`. |
| `issue-categories` | `crm_issue_category` | `issue_category_id` | `category_code` | `parent_issue_category_id` (int), `project_id` (int), `category_code` (varchar 50), `display_name` (varchar 150), `is_active` | |
| `fault-categories` | `crm_fault_category` | `fault_category_id` | `fault_code` | `parent_fault_category_id` (int), `project_id` (int), `fault_code` (varchar 50), `display_name` (varchar 150), `is_active` | `crystal_symptom_id` is in the table but not writable here. |
| `root-causes` | `crm_root_cause` | `root_cause_id` | `root_cause_code` | `project_id`, `root_cause_code` (varchar 50), `display_name` (varchar 150), `is_active` | |
| `resolution-categories` | `crm_resolution_category` | `resolution_category_id` | `resolution_code` | `project_id`, `resolution_code` (varchar 50), `display_name` (varchar 150), `is_active` | |
| `corporate-grades` | `crm_corporate_grade` | `corporate_grade_id` | `grade_code` | `grade_code` (varchar 20), `grade_name` (varchar 100), `rank_no` (smallint, unique, required), `min_score`, `max_score` (numeric(12,4); `max_score > min_score` when both set), `is_active` | Default sort `rank_no`. |
| `relationship-types` | `crm_product_relationship_type` | `relationship_type_id` | `relationship_code` | `relationship_code` (varchar 30), `relationship_name` (varchar 100), `is_exclusive` (boolean), `awards_registration_points` (boolean) | Product holding types. System codes: `OWNER`, `USER`, `REGISTERED_USER`, `LESSEE`, `LICENSEE`. |
| `purchase-purposes` | `crm_purchase_purpose` | `purchase_purpose_id` | `purpose_code` | `purpose_code` (varchar 30), `purpose_name` (varchar 100), `is_active` | |
| `usage-types` | `crm_product_usage_type` | `usage_type_id` | `usage_code` | `usage_code` (varchar 30), `usage_name` (varchar 100), `is_active` | |
| `acquisition-types` | `crm_acquisition_type` | `acquisition_type_id` | `acquisition_code` | `acquisition_code` (varchar 30), `acquisition_name` (varchar 100), `is_active` | System codes: `PURCHASED`, `TRANSFER`, `COMPANY_ASSIGNED`. |
| `channels` | `crm_communication_channel` | `channel_id` | `channel_code` | `channel_code` (varchar 30), `channel_name` (varchar 100), `required_contact_type` (varchar 30), `is_active` | |
| `communication-purposes` | `crm_communication_purpose` | `purpose_id` | `purpose_code` | `purpose_code` (varchar 40), `purpose_name` (varchar 120), `requires_opt_in` (boolean, default true), `description` (text) | |
| `communication-options` | `crm_project_communication_option` | `project_communication_option_id` | *(none)* | `project_id`, `purpose_id`, `channel_id` (all required), `consent_required` (boolean), `is_enabled` (boolean) | No code column, so `q` searches nothing. Filterable: `project_id`. List rows add `project_code`, `purpose_code`, `channel_code` (inner joins). Unique `(project_id, purpose_id, channel_id)` -> `409 crm.settings.thatOptionAlreadyExists`. |
| `organization-types` | `crm_organization_type` | `organization_type_id` | `type_code` | `type_code` (varchar 50), `type_name` (varchar 150) | |
| `contact-roles` | `crm_org_contact_role` | `contact_role_id` | `role_code` | `role_code` (varchar 50), `role_name` (varchar 150) | |
| `currencies` | `crm_currency` | `currency_code` | `currency_code` | `currency_code` (varchar 3), `currency_name` (varchar 80), `decimal_places` (smallint, default 2), `is_reporting` (boolean), `is_active` | The key is the code itself (`/settings/currencies/USD`). System code: `USD`. |
| `job-titles` | `crm_job_title` | `job_title_id` | `job_code` | `job_code` (varchar 30), `job_name` (varchar 100, unique), `sort_order` (smallint), `is_active` | Default sort `sort_order`. |
| `departments` | `crm_department` | `department_id` | `department_code` | `department_code` (varchar 30), `department_name` (varchar 100), `is_active` | Internal departments (see Internal departments for assigning staff). |
| `industries` | `crm_industry` | `industry_id` | `industry_code` | `industry_code` (varchar 50), `industry_name` (varchar 150), `parent_industry_id` (int), `is_active` | |
| `locations` | `crm_location` | `location_pk` | `location_code` | `location_pk` (bigint, **writable**: it is the vendor's key, not generated), `location_name` (varchar 100), `location_code` (varchar 8, unique), `parent_code` (varchar 8), `position` (smallint) | The vendor's list: edits are overwritten by the next refresh or Crystal import. Filterable: `parent_code`. Default sort `position`. |
| `metric-definitions` | `crm_metric_definition` | `metric_definition_id` | `metric_code` | `metric_code` (varchar 80), `metric_name` (varchar 150), `value_type` (`NUMBER`, `TEXT`, `BOOLEAN`, `DATE`; required), `unit_code` (varchar 30), `description` (text), `is_active` | System codes: `DAYS_SINCE_LAST_PURCHASE`, `CROSS_PROJECT_COUNT`, `PRODUCT_OWNERSHIP_COUNT`, `CHURN_RISK`, `POINTS_BALANCE`, `IS_MULTI_PROJECT`, `LAST_SERVICE_DATE`. |
| `point-event-types` | `crm_point_event_type` | `point_event_type_id` | `event_code` | `event_code` (varchar 30), `display_name` (varchar 100), `direction` (smallint: -1, 0 or 1) | System codes: `EARN`, `REDEEM`, `EXPIRE`, `ADJUST`, `REFUND`, `RESERVATION_COST`, `EVENT_AWARD`, `MERGE_CARRY_OVER`. |
| `tags` | `crm_tag` | `tag_id` | `tag_code` | `tag_code` (varchar 50), `tag_name` (varchar 100), `color_scheme` (`gray`, `green`, `blue`, `purple`, `pink`, `orange`, `red`, `teal`, `yellow`, `cyan`; default `gray`), `description` (varchar 255), `is_active` | |
| `party-relationship-types` | `crm_party_relationship_type` | `relationship_type_code` | `relationship_type_code` | `relationship_type_code` (varchar 40), `relationship_name` (varchar 100), `inverse_code` (varchar 40, required), `applies_to` (`PERSON`, `ORGANIZATION`, `ANY`; required), `is_hierarchy` (boolean), `sort_order` (smallint), `is_active` | The key is the code itself. Default sort `sort_order`. System codes: `SPOUSE`, `PARENT`, `CHILD`, `SIBLING`, `RELATIVE`, `REFERRER`, `REFERRAL`, `PARENT_COMPANY`, `SUBSIDIARY`, `AFFILIATE`, `PARTNER`. |
| `registration-questions` | `crm_registration_question` | `question_id` | `question_code` | `project_id`, `product_class_id`, `question_code` (varchar 60), `question_label` (varchar 255), `answer_type` (`SINGLE`, `MULTIPLE`, `TEXT`, `NUMBER`, `RATING`; required), `is_required` (boolean), `sort_order` (int), `is_active` | Default sort `sort_order`. |

Types above come from `sql/schema.sql`; `int`/`smallint` keys come back as JSON numbers, `bigint` and `numeric` as
strings, `timestamptz` as ISO strings.

#### System codes

Lists marked "System codes" are wrapped in a guard (`protectCodes` in `crm.routes.js`) because the code looks those rows
up by code. For a row whose current code is one of the system codes:

- `DELETE <base>/:id` and `DELETE <base>/:id/permanent` are refused.
- `PUT <base>/:id` is refused when the body changes the code column to a different value. Name, order and flags stay
  editable.

| Status | Message key | Params |
|---|---|---|
| 409 | `crm.settings.thisCodeIsUsedByTheSystem` | `{code}` |

The guard runs before the permission check of the CRUD route, so a caller without WRITE can receive this 409 instead of
a 403 for a protected row.

#### Projects: the in-use guard

`projects` is wrapped in `guardInUse` instead. It finds every table with a single-column foreign key to `crm_project`
(read from `pg_constraint`) and checks whether any row references the project. While anything does:

- `DELETE <base>/:id` and `DELETE <base>/:id/permanent` -> `409 crm.settings.inUseCannotDelete`, params `{code, tables}`.
- `PUT <base>/:id` that changes `project_code` -> `409 crm.settings.inUseCannotChangeCode`, params `{code, tables}`.

`tables` is a comma-separated list of the referencing tables. Like the system-code guard, it runs before the permission
check.

### POST /api/admin/crm/settings/locations/refresh

Copies the vendor's location list again from the legacy database (`legacy.pid('locations')`), in one transaction: new
locations are inserted, existing ones (matched by `location_pk`) have `location_name`, `location_code`, `parent_code` and
`position` overwritten. Nothing is removed. Audited as an update of `crm_location`.

**Permission:** WRITE on `/admin/crm/settings`.

**Request body:** None.

**Response** `200`

| Field | Type | Notes |
|---|---|---|
| `added` | integer | Rows inserted. |
| `updated` | integer | Rows that already existed and were overwritten (counted even if nothing changed). |

```json
{ "success": true, "message": "ok", "data": { "added": 3, "updated": 412 } }
```

**Errors:** a failure to reach the legacy database surfaces as `500 common.internalServerError`.

### GET /api/admin/crm/settings/status-map

How each project's own service status codes map to CRM service statuses. Not paged, not filtered.

**Permission:** READ on `/admin/crm/settings`.

**Response** `200` - `data` is an array ordered by `project_id`, then `source_status_code`:

| Field | Type | Notes |
|---|---|---|
| `project_id` | integer | |
| `source_status_code` | string | The project's own status code. |
| `service_status_id` | integer | The CRM status it maps to. |
| `source_status_label` | string or null | |
| `project_code` | string | |
| `status_code` | string | CRM status code. |
| `display_name` | string | CRM status name. |

```json
{ "success": true, "message": "ok",
  "data": [ { "project_id": 1, "source_status_code": "R3", "service_status_id": 4, "source_status_label": "Repaired",
              "project_code": "CRYSTAL", "status_code": "REPAIRED", "display_name": "Repaired" } ] }
```

### PUT /api/admin/crm/settings/status-map

Adds or replaces one mapping (`INSERT ... ON CONFLICT (project_id, source_status_code) DO UPDATE`). Audited.

**Permission:** WRITE on `/admin/crm/settings`.

**Request body**

| Field | Type | Required | Rules |
|---|---|---|---|
| `project_id` | integer | yes | Must exist (else `409 common.referencedRecordIsMissing`). |
| `source_status_code` | string | yes | Trimmed; at most 30 characters. |
| `service_status_id` | integer | yes | Must exist. |
| `source_status_label` | string | no | At most 100 characters; empty means null. |

**Response** `200` - `data` is `null`, message `common.updated`.

**Errors**

| Status | Message key | When |
|---|---|---|
| 400 | `crm.settings.projectCodeAndStatusAreRequired` | One of the three required fields is missing or falsy. |
| 400 | `crm.settings.aValueIsTooLong` | Code or label too long. |
| 409 | `common.referencedRecordIsMissing` | Unknown project or status. |

### DELETE /api/admin/crm/settings/status-map/:projectId/:code

Removes one mapping.

**Permission:** WRITE on `/admin/crm/settings`.

**Path parameters**

| Name | Type | Notes |
|---|---|---|
| `projectId` | integer | |
| `code` | string | The `source_status_code`, matched exactly (not trimmed). |

**Response** `200` - `data` is `null`, message `common.deleted`.

**Errors:** `404 common.notFound` when no mapping matched. Unlike the PUT, the delete is not written to the audit trail.

### GET /api/admin/crm/settings/api-keys

Every department API key (see section 24), active ones first, newest first. Never the secret or its hash.

**Permission:** READ on `/admin/crm/settings`. **Query parameters:** none.

**Response** `200` - `data` is an array:

| Field | Type | Notes |
|---|---|---|
| `api_key_id` | string | bigint |
| `project_id` | integer | |
| `project_code`, `project_name` | string | |
| `key_prefix` | string | 12 hex characters; the key reads `crmk_<key_prefix>_...` |
| `label` | string | |
| `last_used_at` | string\|null | ISO timestamp of the last accepted request |
| `revoked_at` | string\|null | Set once revoked |
| `created_at` | string | |

```json
{ "success": true, "message": "ok", "data": [
  { "api_key_id": "3", "project_id": 3, "project_code": "ESHOP", "project_name": "E-shop", "key_prefix": "a1b2c3d4e5f6",
    "label": "E-shop production", "last_used_at": "2026-10-11T08:12:40.000Z", "revoked_at": null, "created_at": "2026-10-01T09:00:00.000Z" }
] }
```

### POST /api/admin/crm/settings/api-keys

Issues a key for one project. **The reply is the only place the full key ever appears**: only its SHA-256 is stored.

**Permission:** WRITE on `/admin/crm/settings`. Written to the audit trail (project, prefix, label; never the key).

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `project_id` | integer | yes | An ACTIVE project |
| `label` | string | no | Trimmed, at most 100 characters kept; defaults to the project code |

**Response** `200`, message `crm.settings.apiKeyIssued`:

```json
{ "success": true, "message": "API key issued: copy it now, it will not be shown again", "data": {
  "api_key_id": "4", "project_id": 3, "project_code": "ESHOP", "key_prefix": "0f1e2d3c4b5a", "label": "E-shop staging",
  "created_at": "2026-10-11T09:30:00.000Z", "key": "crmk_0f1e2d3c4b5a_<48 hex characters>" } }
```

| Status | Message key | When |
|---|---|---|
| 400 | `crm.serviceCases.chooseAProject` | `project_id` missing or not a positive integer |
| 404 | `common.notFound` | No such project |
| 409 | `crm.integration.thisProjectIsInactive` | The project is INACTIVE (its keys would be refused anyway) |

### POST /api/admin/crm/settings/api-keys/:id/revoke

Revokes an active key at once; the department using it gets `401` from then on. It cannot be undone.

**Permission:** WRITE on `/admin/crm/settings`. Written to the audit trail.

**Response** `200` - `data` is `{ "api_key_id": "<id>" }`, message `crm.settings.apiKeyRevoked`.

**Errors:** `404 common.notFound` when the id is not a positive integer, does not exist, or is already revoked.

## 24. Integration API (department systems)

`src/routes/crmIntegration.routes.js`, mounted at `/api/integration/crm`. Used by department systems (the e-shop, the app store, ...) to register their accounts as CRM customers and to learn which customer each account belongs to. These routes are **not** behind the admin token or the permission grid; every route is behind `projectApiKeys.authenticate`, and the key decides the project, so a caller can only submit and read data for its own project.

Replies use the same envelope (`{ success, message, data }` / `{ success: false, message, detail }`). Error messages on these routes are keys under `crm.integration` and the shared CRM sections, translated like every other reply (see Language). Ids are Postgres `bigint` and are returned as strings.

### Authentication

| Item | Detail |
|---|---|
| Key format | `crmk_<prefix>_<secret>`: `prefix` is 12 lowercase hex characters, `secret` 48 lowercase hex characters (regex `^crmk_([0-9a-f]{12})_([0-9a-f]{48})$`). |
| How to send it | `Authorization: Bearer <key>` (the word `Bearer` is case-insensitive), or `X-API-Key: <key>`. If an `Authorization: Bearer ...` header is present it is used and `X-API-Key` is ignored. |
| Storage | `crm_project_api_key`: the prefix (unique) finds the row; only the SHA-256 hex of the secret is stored, compared in constant time. A revoked key (`revoked_at` set) is not found. |
| Project | The key's project must have `status = 'ACTIVE'`. On success the request carries `{ project_id, project_code, api_key_id }`, and `last_used_at` is updated in the background. |

| Status | Message | When |
|---|---|---|
| 401 | `crm.integration.aValidApiKeyIsRequired` | No key, wrong format, unknown or revoked prefix, or wrong secret. |
| 403 | `crm.integration.thisProjectIsInactive` | The key is valid but its project is INACTIVE. |

**Issuing keys.** In the admin console: CRM → Settings → **API keys** (the three `/settings/api-keys` endpoints in section 23). They can also be managed from the command line with `scripts/crm-api-key.js` (`npm run crm:api-key`), which calls the same `projectApiKeys.service`:

```
npm run crm:api-key -- issue <PROJECT_CODE> [label]   # e.g. issue ESHOP "Eshop production"
npm run crm:api-key -- list
npm run crm:api-key -- revoke <api_key_id>
```

`issue` looks the project up by `project_code` (fails with "No project with code ..." if absent), generates a random prefix and secret, stores the hash with `label` (default the project code, max 100 characters), and prints the full key once; it cannot be shown again. `list` prints every key (id, project code, prefix, label, last used, revoked, created; never the secret). `revoke` sets `revoked_at` on an active key. A project may hold several active keys. (`scripts/check-crm-integration.js` also issues and revokes throwaway keys for its own test run.)

### POST /api/integration/crm/registrations

Registers one of the caller's accounts. The CRM either links it to the customer it already belongs to, matches it to an existing customer, creates a new customer, or stages it for an administrator.

**Authentication:** department API key.

**Path parameters:** None.

**Query parameters:** None.

**Request body**

| Field | Type | Required | Rules |
|---|---|---|---|
| `external_account_id` | string | yes | The account's id in the department system. Converted to text and trimmed; 1..250 characters. |
| `external_login` | string | no | At most 100 characters (checked before conversion). Stored as text. |
| `external_account_type` | string | no | Converted to text and silently cut to 50 characters. |
| `party` | object | yes | The person. Only the keys below are read; keys sent as `""` are dropped. Values are not trimmed before storage. |
| `party.full_name` | string | yes | Must be present (400 otherwise); at most 250 characters (after trim); all-blank fails with `crm.problems.nameIsRequired`. |
| `party.gender_code` | string | no | One of `M`, `F`, `OTHER`, `UNKNOWN`. |
| `party.birth_date` | string | no | `YYYY-MM-DD` (first 10 characters checked), a real calendar day, not before 1900-01-01, not in the future. `birth_year` is then derived from its first four characters. |
| `party.mobile` | string | no | 7 to 15 digits once spaces, dashes and other non-digits are removed (a leading `+` is not counted); no letters. Also stored as a MOBILE contact. |
| `party.email` | string | no | Must look like `x@y.z`. Also stored as an EMAIL contact. |
| `party.address_line` | string | no | At most 255 characters. |
| `party.home_location_pk` | integer | no | Must exist in `crm_location`. |
| `party.job_title_id` | integer | no | Must exist in `crm_job_title` and be active. |

Validation is `personRules.check(..., 'create', 'PERSON')`, the same checks as the console's new-customer form and the Excel import. Every problem is collected and returned together in `detail` as `[{ field, message }]`.

**What happens** (`identity.resolveAccount`, one transaction under the registration lock):

| `outcome` | When | Effect |
|---|---|---|
| `EXISTING` | This project already has an active (`unlinked_at` null) account with this `external_account_id`. | `external_login` / `external_account_type` on the account are updated if sent. The customer's blank person fields are filled from `party` (never overwritten) and a mobile/email it does not have is added. No intake, no resolution row. `intake_id` is null. |
| `MERGED` | No such account; exactly one existing customer scores 70+ against the person. | Evidence added to that customer as above, account linked (`link_method` `MATCHED`, primary if the customer has no other active account in this project), intake stored with status MERGED, resolution row written. |
| `CREATED` | No candidate scoring 50+ (customer or pending registration). | New customer (`display_name` = `full_name`, `origin_project_id` = caller's project, mobile/email as primary contacts with `source_project_id` = caller's project), account linked as above, intake CREATED, resolution row written. |
| `QUEUED` | Any other result: a 50-69 match, two or more 70+ matches, or a pending registration scoring 50+. | Intake stored as PENDING with its candidates; nothing is linked. `party_pk` is null. The result arrives later through the resolution feed. |

If the same `external_account_id` was submitted before and is not (or no longer) linked, the earlier intake is returned as is and the new body is ignored: `QUEUED` with the same `intake_id` while it is still PENDING, otherwise the stored status (`MERGED` or `CREATED`) with its `party_pk`. In that last case (an account unlinked since) the account is not linked again.

Notes: the code also knows an outcome `PLATFORM` and an ESHOP-category route, but both depend on inputs (`resolved_party_pk`, `known_party_pk`) this endpoint never passes, so this endpoint returns only the four outcomes above.

**Response** `200`

| Field | Type | Notes |
|---|---|---|
| `outcome` | string | `EXISTING`, `MERGED`, `CREATED` or `QUEUED`. |
| `party_pk` | string or null | The customer; null when QUEUED. Save it against the account. |
| `intake_id` | string or null | The staged registration; null for EXISTING. |

```json
{
  "success": true,
  "message": "ok",
  "data": { "outcome": "QUEUED", "party_pk": null, "intake_id": "412" }
}
```

**Errors**

| Status | Message | When |
|---|---|---|
| 400 | `crm.integration.externalAccountIdIsRequired` (params `{max: 250}`) | Missing, blank, or longer than 250 characters. |
| 400 | `crm.integration.externalLoginIsTooLong` (params `{max: 100}`) | |
| 400 | `crm.integration.fullNameIsRequired` | `party` or `party.full_name` missing or `""`. |
| 400 | `crm.common.checkTheDetails` ("some details are not valid") | `personRules.check` found problems; `detail` = `[{ field, message }]` with each message translated from its key, e.g. `crm.problems.notAPhoneNumber` on `mobile`, `crm.problems.isInTheFuture` on `birth_date`, `crm.problems.genderMustBeMOrF` on `gender_code`, `crm.problems.jobTitleIsSwitchedOff` / `crm.problems.jobTitleIsNotOnTheList` on `job_title_id`, `crm.problems.locationIsNotOnTheList` on `home_location_pk`. |
| 401 / 403 | see Authentication | |

### GET /api/integration/crm/accounts/:externalAccountId

Which customer one of the caller's accounts belongs to, or where its registration stands.

**Authentication:** department API key.

**Path parameters**

| Name | Type | Notes |
|---|---|---|
| `externalAccountId` | string | URL-encoded account id; trimmed; 1..250 characters. |

**Query parameters:** None.

**Request body:** None.

Looks first for an active account link in the caller's project; if none, the most recent intake (highest `intake_id`, any category) from the caller's project with this `source_record_id`.

**Response** `200`

| Field | Type | Notes |
|---|---|---|
| `status` | string | `LINKED` when an active account link exists; otherwise the intake's status: `PENDING`, `MERGED`, `CREATED` (seen only if the account was unlinked since), or `ASSIGNED` / `REJECTED` for an ESHOP assignment review of this account. |
| `party_pk` | string or null | The customer; null while PENDING or after REJECTED. |
| `intake_id` | string | Only when `status` is not `LINKED`. |

```json
{ "success": true, "message": "ok", "data": { "status": "LINKED", "party_pk": "1031" } }
```
```json
{ "success": true, "message": "ok", "data": { "status": "PENDING", "intake_id": "412", "party_pk": null } }
```

**Errors**

| Status | Message | When |
|---|---|---|
| 400 | `crm.integration.externalAccountIdIsRequired` (params `{max: 250}`) | Blank or longer than 250 characters. |
| 404 | `common.notFound` | Neither a link nor an intake exists for this account. |

### GET /api/integration/crm/identity-resolutions

The resolution feed: every registration from the caller's project that has been resolved to a customer and not yet acknowledged.

**Authentication:** department API key.

**Path parameters:** None.

**Query parameters:** None.

**Request body:** None.

A row is written to `crm_identity_resolution` each time an intake whose `source_project_id` is this project is resolved to a customer: immediately for registrations that came back `MERGED` or `CREATED`, and later when an administrator decides a `QUEUED` one. Rows from other entry paths whose source project is this project also appear (for example a customer created in the console or by the Excel import with this project as its origin; their `source_record_id` is then a random 32-hex string, not an account id). EXISTING registrations and REJECTED reviews write no row. Ordered by `resolution_id` ascending, at most 500 per call; call again after acknowledging to get the next batch.

**Response** `200`: `data` is an array.

| Field | Type | Notes |
|---|---|---|
| `resolution_id` | string | Pass to acknowledge. |
| `intake_id` | string | The registration (equals the `intake_id` returned by POST /registrations). |
| `source_project_id` | string | The caller's project. |
| `source_record_id` | string or null | The caller's `external_account_id`. |
| `party_pk` | string | The customer to save against the account. |
| `outcome` | string | `MERGED`, `CREATED` or `ASSIGNED`. |
| `acknowledged_at` | null | Always null here. |
| `created_at` | string | When it was resolved. |

```json
{
  "success": true,
  "message": "ok",
  "data": [
    { "resolution_id": "57", "intake_id": "412", "source_project_id": "3", "source_record_id": "U-88213",
      "party_pk": "1031", "outcome": "MERGED", "acknowledged_at": null, "created_at": "2026-10-11T02:40:09.880Z" }
  ]
}
```

**Errors**

| Status | Message | When |
|---|---|---|
| 400 | `crm.serviceCases.chooseAProject` | Defensive check on the key's project id; not expected after authentication. |

### POST /api/integration/crm/identity-resolutions/:id/acknowledge

Marks one resolution as received, after the caller has saved `party_pk` on its account, so it leaves the feed.

**Authentication:** department API key.

**Path parameters**

| Name | Type | Notes |
|---|---|---|
| `id` | string | `resolution_id`; must match `^[1-9][0-9]*$`, otherwise 404. |

**Query parameters:** None.

**Request body:** None.

Sets `acknowledged_at = now()` on the row if it belongs to the caller's project. It does not check whether the row was already acknowledged: acknowledging again succeeds and moves `acknowledged_at` forward. Acknowledging is the only way a row leaves the feed.

**Response** `200`: `data` is the acknowledged `resolution_id` as a string (knex 0.21 returns the bare column value for a single-column `returning`).

```json
{ "success": true, "message": "ok", "data": "57" }
```

**Errors**

| Status | Message | When |
|---|---|---|
| 404 | `common.notFound` | `id` not a positive integer, no such resolution, or it belongs to another project. |
