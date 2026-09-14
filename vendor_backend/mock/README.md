# Mock data and mock API

There are two independent switches, and the account pages need to be
told apart by which one covers them.

| | `USE_MOCK=true` | `USE_MOCK_API=true` |
|---|---|---|
| Replaces | all of `/vendor/api` | only the three outbound HTTP clients |
| Needs a database | no | yes |
| Use it for | running with nothing installed | developing against real data |

Roughly half the account area never reads a table. The eshop, appstore
and licence-keygen pages proxy separate services through `api/eshopApi.js`,
`api/appstoreApi.js` and `api/webApi.js`. With `ESHOP_SERVER_URL` and
friends unset those requests fail and the controller returns a 500, so
seeding Postgres does nothing for them — that half needs `USE_MOCK_API`.
The other half (points, activity, feedback, blog) reads the database and
needs the seed. See **Account pages** below for the full split.

Runs the vendor site with no Oracle or Postgres instance attached.

```
cd vendor_backend
USE_MOCK=true npm start          # or: USE_MOCK=true node app.js
```

`app.js` mounts `mock/mockVendorRoutes.js` at `/vendor/api` in place of
`routes/vendorRoutes.js`, and skips the boot-time cache warm that would
otherwise query the database before the first request arrives. Everything
else — `/pid/api/*`, `/polestar/api` — is untouched and still expects a real
database, so only the vendor site runs in this mode.

The client needs no change if the backend is on its usual port:

```
cd vendor_client
npm start                        # REACT_APP_API_URL already points at :5000
```

## What is mocked, and what is not

| | |
|---|---|
| **Mocked** | Every data endpoint under `/vendor/api` — catalogue, agencies, FAQs, blog, and the whole account area. |
| **Not mocked** | Authentication. Login, session check, logout and refresh run through the real `controllers/authController`, and protected routes sit behind the real `verifyWebToken`. |

Only the *user lookup* in login is swapped for the fixture table. Token
signing, cookie names, claim contents, expiry and the refresh rotation are
the production code path — so the mock is a way to exercise the JWT flow,
not a way to bypass it.

## Accounts

Passwords below are what you type; the client MD5s them before posting.

| user_id | password | notes |
|---|---|---|
| `demo` | `1234` | PID user, the fullest account history |
| `tester` | `123456` | PID user, a separate data set |
| `fixed01` | `1234` | fixed-line customer |

In development the header's sign-in control routes to the password form at
`/vendor/auth/reganam`; the smart-card path is production-only.

## Test-only endpoints

Two endpoints exist purely to make the token flow drivable. They are
defined in `mockVendorRoutes.js` and do not exist in `vendorRoutes.js`.

| Endpoint | Purpose |
|---|---|
| `GET /vendor/api/auth/mock_expire_access` | Clears the access-token cookie and leaves the refresh cookie, so the 401 → refresh → retry path can be triggered on demand instead of waiting out the token lifetime. |
| `GET /vendor/api/auth/mock_whoami` | Returns the claims the server decoded, which is how "the refreshed token still identifies the same user" is asserted. |

## Tests

Start the server on port 5099 first:

```
USE_MOCK=true PORT=5099 node app.js
```

then, from `vendor_backend`:

```
bash mock/tests/auth_refresh_test.sh    # 25 checks on the JWT/refresh flow
bash mock/tests/api_smoke_test.sh       # 50 checks across every endpoint
```

`mock/tests/account_db_test.sh` is the odd one out: it runs against the
*database* configuration (`USE_MOCK=false`, `USE_MOCK_API=true`) on the
usual port 5000, not against a mock-mode server. See **Account pages**.

Both accept `BASE_URL` if the server is elsewhere:

```
BASE_URL=http://localhost:5000/vendor/api bash mock/tests/api_smoke_test.sh
```

The client-side half of the refresh flow — single-flight behaviour, retry
routing — is covered by `vendor_client/src/api/__tests__/axios.test.js`.

## The fixtures

`mock/fixtures.js` generates every row from a fixed seed (mulberry32) and a
fixed "now", so two runs produce identical data. Field names mirror the
columns the real models select, which is what lets a page render against
either source without noticing.

Writes (`blog_add`, `blog_update`, `blog_delete`, feedback messages) mutate
the in-memory fixtures, so a create → list round trip shows the new row.
They reset on restart.

## Account pages

An account page is empty or shows an error strip for one of three
reasons, and they have three different fixes.

| Page group | Reads | Fix |
|---|---|---|
| Software points, activity points, feedback, my articles/drafts | `ora_pid` | `seed_mock_account.sql` |
| Karaoke / B-media *old* logs, activity *old* log | `ora_license`, `ora_media`, `ora_old_db` | `91_mock_satellite_schemas.sql` then the seed |
| Eshop, appstore, eprod register, all three keygen logs | an outbound HTTP service | `USE_MOCK_API=true` |

Set-up, once:

```
psql -d vendor -f sql_pg/00_compat.sql                  # NVL/NVL2 shims
psql -d vendor -f sql_pg/91_mock_satellite_schemas.sql  # ora_blog, ora_license, ora_media
psql -d vendor -f sql_pg/seed_mock_account.sql          # the rows
```

then set `USE_MOCK_API=true` in `.env` and restart.

`00_compat.sql` is easy to skip and the failure is confusing: `models/`
call `NVL` in 86 places, and without the shim the Activity points page is
a bare 500 with the reason buried in the server log.

`seed_mock_account.sql` loops over `ora_pid.users` rather than naming
fixed pks, so it covers whatever account you log in with — add a user,
re-run it, and that user has a history too. It is re-runnable: every row
it writes has a pk at or above 9e11 and it deletes exactly that range
first, so it will not disturb real rows.

`mock/mockExternalApi.js` holds the outbound-service half. Each function
returns what its **real** counterpart in `api/` returns, not what the
upstream service returns — the `api/` layer reshapes the payload, and
the controllers and pages are written against the reshaped form. Data is
derived from the account id, so a reload does not reshuffle the table.

To check the whole area at once:

```
bash mock/tests/account_db_test.sh    # 39 checks, database + mocked services
```

## Seeding a real database

The same fixtures generate a Postgres seed:

```
node mock/generate_seed_sql.js       # writes sql_pg/seed_mock_data.sql
psql -d vendor -f sql_pg/seed_mock_data.sql
```

Run `sql_pg/00_compat.sql` and the numbered schema files first — the seed
only inserts rows. It is re-runnable: each insert is preceded by a delete
of the pk range it owns.

Generating rather than hand-writing the seed is what keeps the database and
the mock API serving the same data. If you change a fixture, regenerate.

Two things to check against your deployment:

- **Schema.** `models/` qualify every table as `ora_pid.<table>`, so the
  tables must live in a schema named `ora_pid`. The seed sets
  `search_path TO ora_pid, public`.
- **The root category name.** `productModel.findProductPhonesForWeb` matches
  `category_name` against the `PRODUCT_CATEGORY_PHONE` string in
  `lang/en.js` (`'Smart Phone'`). Change one without the other and the
  product list goes empty with no error anywhere.

The seed has been generated and checked for well-formedness, but it has not
been executed against a live Postgres instance — none was available here.
Run it against a scratch database before pointing it at anything shared.
