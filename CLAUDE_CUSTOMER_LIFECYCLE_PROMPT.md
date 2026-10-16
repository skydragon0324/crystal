# Claude Code — implementation prompt

I have three existing projects:

- `vendor_backend`: existing application/web logic that inserts login records into Oracle `USER_LOGIN_LOG`.
- `crystal_backend`: existing Node.js backend that already connects to Oracle and PostgreSQL.
- `crystal_admin`: existing admin interface; inspect the repository to determine its actual frontend framework and reusable components.

I want you to implement a complete **Customer Lifecycle KPI and Transition Analytics** feature in `crystal_backend` and `crystal_admin`, using **Oracle as the source of truth** and **PostgreSQL as the analytics database**.

**Read the entire attached `CUSTOMER_LIFECYCLE_KPI_REQUIREMENTS.md` as the authoritative specification before making changes.**

## Working rules

1. First inspect the real projects and explain their folder structure, existing Oracle/PostgreSQL connection handling, backend routing/service conventions, migration system, scheduled-job framework, authentication/permissions, frontend UI framework, chart and table components, and test/build commands. Do not assume a framework or invent files.
2. Map the requirements onto existing architecture. Reuse current dependencies and styling. Avoid creating an unnecessary new microservice or analytics framework.
3. Do not change `vendor_backend`, the Oracle source schema, or operational login behavior unless I separately approve. Begin with a PostgreSQL reporting implementation and safe, idempotent source synchronization. Explicitly identify the completeness limits of Oracle polling using `TABLE_PK` or `ACTION_AT` and implement periodic reconciliation as specified.
4. Implement the four mutually exclusive states NEW, ACTIVE, DORMANT, CHURNED; use rolling 30/90 elapsed days and NEW priority as documented. Treat `USERS.STATUS` as a separate operational account flag. Detect automatic inactivity transitions even with no login events.
5. Write versioned PostgreSQL migrations, a minimal synchronized login journal, customer profile, current status table, historical status periods, KPI daily snapshots, business events and synchronization audit tables according to the specification.
6. Implement initial historical backfill, incremental synchronization, idempotent replay, scheduled inactivity deadlines, historical repairs after late login events, daily KPI snapshots and their recomputation, data freshness/health endpoints, and suitable error handling.
7. Implement the protected APIs and admin UI: overview cards, date filters, daily/weekly/custom N-day charts, stock-versus-flow distinctions, transition matrix, paginated customer transition list, customer timeline, event-before/after comparison and health page.
8. Do not use mocked KPI data in the finished application. Use real database queries, proper SQL parameterization, pagination, access control and existing API response conventions.
9. Write automated tests for each exact fixture and metric invariant in the specification; then run lint, tests, builds and migrations where the project environment allows. Report concrete test results and limitations.
10. Provide a final summary of every modified/created file, configuration options, database commands, backfill instructions, scheduler setup, deployment/rollback steps, and any features deferred with explanations.

## Execution approach

Start by auditing the repositories and presenting a brief implementation plan with file-level changes. Then work in this order: (1) migrations and backend domain logic, (2) sync/backfill/deadlines/snapshots, (3) API tests, (4) admin UI, (5) end-to-end checks and operational documentation. When details are missing, inspect the actual code and choose the smallest safe solution that fits its conventions; ask before destructive or production-impacting changes.

**Definition of done:** An admin can select any date window and daily/weekly/custom interval, see correct four-status stock counts and charts, filter transitions such as Dormant → Active and Dormant → Churned, open accurate customer details and timelines, compare states around a business event, and view sync freshness. Results remain correct after duplicate imports, time-based status changes without logins, and late-event reconciliation.
