# Crystal Unified Identity & Customer Management System

Enterprise architecture proposal | October 2026

## 1. Executive recommendation

Crystal should establish a Crystal Identity Platform (CIP) that manages customer identities centrally while allowing its existing information systems to continue operating independently.

The goal is not to merge all existing databases into one. Instead, it is to establish one authoritative identity for each verified customer, with multiple application accounts, authentication methods, and independently managed business records linked to that identity.

I recommend the following architectural decisions:

| Design question            | Recommendation                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| Common customer identifier | Permanent, system-generated UUIDv7                                                                   |
| Customer-facing identifier | Optional `Crystal ID` or changeable username                                                         |
| Number of identities       | One canonical identity per verified customer, with multiple linked login methods and legacy accounts |
| Central identity service   | Dedicated Crystal Identity Service                                                                   |
| Central database           | PostgreSQL, accessible only to authorized central services                                           |
| Authentication             | OpenID Connect / OAuth 2.0, preserving X.509 and SIM-based methods through adapters                  |
| Synchronization            | Transactional Outbox + reliable messaging + local databases                                          |
| Disconnected systems       | Local operation, durable synchronization queues, eventual reconciliation                             |
| Profile updates            | Central ownership of shared fields, version-controlled updates                                       |
| Existing customer accounts | Gradual linking and migration, not immediate deletion                                                |
| Customer points            | Separate auditable ledgers; controlled consolidation after verification                              |
| Health management          | Separate sensitive-data domain, not a general shared customer profile                                |

The most important principle is:

Centralize identity ownership, not every database operation.

Crystal's websites, membership app, e-shop app, app store app, planned CMS, and health app should use the same identity framework without being required to connect to a single central database for every transaction.

## 2. Recommended system architecture

Crystal customers

One customer experience across multiple products

Websites

Membership

E-shop

App Store

Health

CMS

Authentication, account linking, and synchronization

Crystal Identity Platform

Shared enterprise services

Identity & account linking

Authentication / SSO

Customer profile master

Event delivery / sync

Consent & audit

Loyalty coordination

Central PostgreSQL

Authoritative identity records and event outbox

Reliable API / message delivery

Web DB

Member DB

E-shop DB

Store DB

Health DB

CMS DB

Each application retains its local data, operational autonomy, and legacy primary keys.

The central platform would provide identity, authentication, account-linking, profile-management, and synchronization capabilities. The e-shop would still own its orders and shipping transactions. The app store would retain download and purchase histories. The membership system would retain its membership transactions.

This separation is especially important for Crystal because some existing systems are hosted on physically separate servers and communication may be unreliable.

## 3. What format should the common customer identifier use?

Do not use a name, date of birth, telephone number, certificate number, or SIM identifier as the permanent customer ID.

There are three different identifiers that Crystal should distinguish.

| Identifier            | Example              | Purpose                                |
| --------------------- | -------------------- | -------------------------------------- |
| Internal canonical ID | `0199a4c2-5a8d-7...` | Permanent database identity            |
| Public Crystal ID     | `CR-0087325164`      | Customer service and account reference |
| Login username        | `zhaoliu123`         | Optional, user-friendly sign-in alias  |

The examples are illustrative.

### Why UUIDv7?

UUIDv7 is defined by [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562.html?utm_source=chatgpt.com) and offers globally distributed generation with time-ordered values, making it suitable for database indexing and systems generating IDs independently.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.rfc-editor.org\&sz=32)

rfc-editor.org



It is especially appropriate for Crystal because separate systems may need to create provisional records when they cannot contact the central platform.

The canonical ID should:

- Remain unchanged throughout the customer identity's lifetime.
- Never be reassigned to another customer.
- Be unrelated to personal attributes.
- Have a unique database constraint.
- Continue to exist even when legacy account IDs are migrated.
- Be treated as an identifier, not a password or security credential.

Names, dates of birth, and telephone numbers can change, be duplicated, or be exposed. They also create privacy concerns when embedded in identifiers.

My preferred model: UUIDv7 internally, a separate user-friendly Crystal ID for customer service, and optional usernames for login.

For extra privacy, applications do not necessarily need to receive the same global UUID in their login tokens. OpenID Connect also supports pairwise subject identifiers, which prevent unrelated applications from automatically correlating customer activity.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.openid.net\&sz=32)

openid.net



For Crystal, a central mapping service can translate those application-scoped identifiers back to the canonical identity when authorized.

## 4. Should a customer have one account or multiple accounts?

Crystal should distinguish four concepts:

1. Person identity: The canonical customer record.
2. Login credentials: Password, passkey, certificate, SIM-related authentication, etc.
3. Application accounts: Membership account, e-shop account, app store account, etc.
4. Business relationships: Membership level, customer category, company affiliation, loyalty enrollment, and permissions.

For example:

One canonical Crystal identity

Internal customer UUID: 0199a4c2-...

Login methods

Username

Phone / SIM

X.509 certificate

Passkey

Existing accounts

Membership: 10528

E-shop: 88312

App Store: 72954

Website: 52890

The values are examples. Legacy accounts retain their original records but are linked to one canonical identity.

A customer can have several usernames, verified phone numbers, certificates, or existing application accounts without necessarily having several distinct people records.

However, Crystal should not automatically merge accounts merely because they share a name, telephone number, or birthday.

Allow users to request account linking, require suitable proof of control, and apply stronger review when financial value, points, or sensitive personal information is involved.

For customers who intentionally maintain separate identities, Crystal can permit a policy-controlled separate-account arrangement. The system should not assume that every account can or should be forcibly merged. A person may also act for several companies, which requires separate organization membership and authorization records, rather than creating duplicate person identities.

## 5. How should the unified customer database be shared?

Your proposal to create a dedicated registration service and notify each system is fundamentally sound.

However, I would enhance it with a Transactional Outbox and Inbox synchronization architecture rather than relying exclusively on API calls and cron-based retries.

### 5.1 Why direct database sharing is not ideal

Suppose a customer opens the e-shop:

```
Customer opens e-shop
        ↓
E-shop requests customer from central DB
        ↓
Network connection fails
        ↓
Customer profile cannot be loaded
        ↓
Checkout may fail
```

Even if network connectivity is reliable, having every system query the central database introduces unnecessary dependencies and potential performance bottlenecks.

Instead, each application should maintain a local projection containing only the customer information it actually needs.

For example:

| System     | Customer data stored locally                                                      |
| ---------- | --------------------------------------------------------------------------------- |
| Membership | Local user ID, canonical identity reference, membership level                     |
| E-shop     | Local user ID, identity reference, required contact data, shipping addresses      |
| App Store  | Local user ID, identity reference, app licenses, purchases                        |
| CMS        | Local user ID, identity reference, content permissions                            |
| Health     | Separate patient identifier, restricted identity link, necessary demographic data |

Orders, purchases, and business records remain local. Shared identity fields are synchronized from the central system.

### 5.2 How reliable synchronization should work

1\. Registration or profile update

Crystal Identity API

2\. Single PostgreSQL transaction

Save customer change + event in outbox

3\. Reliable delivery worker

Queue / broker / secure synchronization API

Automatic retry, replay, delivery tracking

Membership

Applied

App Store

Applied

E-shop

Retry pending

4\. E-shop reconnects

Missed events are replayed, validated, applied locally, and acknowledged

Here is the important difference from a simple notification system:

When a customer is registered, the central system must commit both the customer record and a corresponding event in the same PostgreSQL transaction.

Otherwise, a crash could occur after saving the customer but before recording the notification, causing permanent synchronization loss.

This is precisely the problem addressed by the [Transactional Outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html?utm_source=chatgpt.com).&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.aws.amazon.com\&sz=32)

AWS Prescriptive Guidance



### 5.3 Example event

```
{
  "event_id": "evt-10002831",
  "event_type": "customer.profile.updated",
  "schema_version": 1,
  "customer_id": "0199a4c2-...",
  "customer_version": 18,
  "source_system": "crystal-identity",
  "occurred_at": "2026-10-17T10:00:00Z",
  "changes": {
    "display_name": "Zhao Liu"
  }
}
```

An actual implementation would use a valid UUID for `customer_id`, a stable event ID, and a validated event schema. The event contains only the fields the receiving application is authorized to obtain.

The important fields are:

- `event_id`: detects duplicate deliveries.
- `customer_id`: identifies the central customer.
- `customer_version`: detects stale or out-of-order updates.
- `source_system`: identifies who originated the change.
- `schema_version`: supports future changes to event structure.

Each receiving application should record successfully processed event IDs in a local inbox table, in the same database transaction as the profile update.

That way, if an event is delivered twice, it is applied only once.

Delivery should be designed as at-least-once, with idempotent processing, rather than assuming that every API notification happens exactly once.

### 5.4 Is a cron job enough?

For a small number of systems, a cron job or persistent background worker can be perfectly acceptable.

The crucial requirements are more important than the tool:

| Requirement                  | Why it matters                                                  |
| ---------------------------- | --------------------------------------------------------------- |
| Persistent outbox            | Events survive restarts and crashes                             |
| Per-system delivery tracking | One failed e-shop must not block successful membership delivery |
| Retries with backoff         | Avoid overwhelming disconnected servers                         |
| Duplicate detection          | Prevent duplicate profile operations                            |
| Per-customer ordering        | Prevent an old update overwriting a new one                     |
| Failed-event queue           | Allows investigation of permanently failing messages            |
| Reconciliation process       | Repairs missing data even if normal delivery fails              |
| Full snapshot recovery       | Allows reconstruction of local projections                      |
| Monitoring                   | Detects increasing synchronization delay                        |

A single Boolean `notification_failed` column is insufficient for the long term.

Crystal needs delivery state per destination, such as `last_applied_version`, `retry_count`, `next_retry_at`, and `last_error`.

For an initial version, I would use PostgreSQL outbox tables and Node.js workers. A message broker such as RabbitMQ can be introduced when throughput, routing, or operational requirements justify it; a broker alone does not remove the need for durable database-to-message coordination.

## 6. What happens when the e-shop is physically disconnected?

This is one of the most important requirements in your situation.

I recommend three distinct operating modes.

| Situation                             | Recommended behavior                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| Network available and secure          | Register centrally and synchronize normally                                            |
| Network temporarily unavailable       | Continue permitted local activities; queue changes                                     |
| No approved secure communication path | No direct data exchange; use an approved secure transfer mechanism or defer federation |

### Example: new customer while offline

1. The customer registers in the e-shop.
2. The e-shop generates a provisional UUIDv7 and saves the account locally.
3. The registration is marked `PENDING_CENTRAL_LINK`.
4. The e-shop stores a durable synchronization request.
5. When connectivity returns, the request is sent to Crystal Identity.
6. The identity service searches for legitimate existing accounts, evaluates account-linking evidence, and either links the account or creates a new canonical identity.
7. The e-shop stores the resulting canonical ID and changes the status to `LINKED`.

The existing local user ID does not need to change.

There is an unavoidable limitation here:

An offline e-shop cannot guarantee that a customer is not already registered in another disconnected system.

UUIDv7 can provide distinct technical record identifiers without central coordination, but it cannot prove that two account records represent different human beings.

Account uniqueness at the person level must therefore be reconciled after connectivity is restored.

Likewise, an isolated e-shop cannot provide real-time global SSO or immediate cross-system account revocation without an independent trusted communication path.

### Recommended network model

For physically separated infrastructure, prefer an outbound synchronization agent at each remote system. It connects to a central HTTPS endpoint, authenticates the remote system, requests changes since its last acknowledged version, and submits its locally queued changes.

This avoids requiring Crystal to open inbound access to every application database.

Where permitted, use TLS, mutual service authentication, least-privilege credentials, network allowlisting, and appropriate encryption and message integrity checks.

If no secure network path can be established, synchronization should not send personal data over an untrusted channel. An approved offline process using encrypted, authenticated, signed transfer packages may be necessary.

## 7. How should profile changes propagate?

A shared customer profile requires a clear decision about which system owns each field.

Without this, the following can happen:

```
Membership changes name to "Zhao Liu"
          ↓
E-shop changes name to "Liu Zhao"
          ↓
Both systems send profile updates
          ↓
Continuous overwriting or inconsistent results
```

I recommend a field-ownership policy.

| Data field                      | Authoritative owner        | Synchronization              |
| ------------------------------- | -------------------------- | ---------------------------- |
| Canonical customer ID           | Identity Platform          | To authorized systems        |
| Verified mobile number          | Identity Platform          | Only where necessary         |
| Primary display name            | Customer Profile Service   | To relevant systems          |
| Login credentials               | Identity Platform          | Never replicate secrets      |
| E-shop shipping address         | E-shop                     | Local by default             |
| Membership tier                 | Membership Service         | Published when authorized    |
| App Store purchases             | App Store                  | Remain within App Store      |
| Medical information             | Health Service             | Restricted; not general sync |
| Shared notification preferences | Consent/Preference Service | Per project and channel      |

For fields owned centrally, an application sends a change request to the central service rather than independently becoming the master.

When a local customer edits a shared field while disconnected, the UI should indicate that the update is pending synchronization. It should not claim the change has propagated everywhere.

Use optimistic concurrency, such as an `expected_version` property, so conflicting changes can be rejected and explicitly reconciled.

A standardized approach worth considering is SCIM 2.0, which defines user provisioning and profile operations, including PATCH and resource versioning.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.rfc-editor.org\&sz=32)

RFC Editor

+1



For Crystal, SCIM can be used at system integration boundaries, while internal services may use simpler domain-specific REST APIs and events.

The best achievable consistency depends on the operation:

- Display name changes can be eventually consistent.
- A new verified telephone number requires stronger verification and controlled activation.
- Account suspension and authorization revocation may require online validation or fail-closed behavior in sensitive systems.
- Financial redemptions require stronger guarantees than profile synchronization.

Reconciliation jobs should periodically compare customer IDs, versions, counts, and checksums, then repair differences using authoritative snapshots or event replay.

## 8. How should existing X.509 and SIM authentication work?

Crystal should preserve these methods but separate authentication from customer identification.

An X.509 certificate answers a question such as:

Does the user possess the private key corresponding to a trusted certificate?

SIM-based authentication may answer:

Can this user prove control of a particular mobile subscription?

Neither necessarily proves the identity of a unique human being.

### Recommended design

Desktop

X.509 certificate authentication

Mobile / Web

SIM-based or other supported authentication

Crystal Identity Provider

Validate credential and resolve the linked account

Canonical customer identity

Same underlying customer, regardless of authentication method

Application-scoped login session

OIDC identity token / API access token

For instance, after a certificate login, the identity provider validates its trust chain, certificate purpose, and revocation status, then looks up the bound credential and canonical customer. It should not automatically equate a certificate with a customer merely because their names match.

For SIM-related authentication, the precise implementation matters. Carrier-backed authentication, SMS verification, and simply reading a SIM identifier are not equivalent security mechanisms.

SMS or voice authentication over the public telephone network is considered restricted by NIST because of risks including SIM swapping, number porting, and interception.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://pages.nist.gov\&sz=32)

pages.nist.gov



Use verified mobile authentication as one supported method, but provide stronger alternatives such as passkeys for sensitive actions.

### Should Crystal adopt an ID from an existing system?

I would not.

Adopting the membership system's existing customer ID, for example, introduces several problems:

- Another system may already use the same numeric ID for a different customer.
- Existing IDs may be generated by database sequences and cannot be safely coordinated across independent databases.
- The chosen system becomes the historical authority for every other application.
- Future applications inherit constraints from a design that was not originally intended for enterprise-wide identity.

Instead, introduce a new `crystal_customer_id` and map every existing account to it.

The existing membership, website, e-shop, and app store primary keys should remain intact.

### Authentication standard

I recommend OpenID Connect for centralized login and OAuth 2.0 for API authorization, using Authorization Code with PKCE for supported native and browser flows.

For Android, the standard approach uses an external browser or system browser tab rather than embedding credentials in a WebView. This is supported by [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html?utm_source=chatgpt.com) and the newer OAuth security best practices in [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html?utm_source=chatgpt.com).&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.rfc-editor.org\&sz=32)

RFC Editor

+1



Each backend should validate token signature, issuer, audience, expiry, and authorization claims. Locally verified short-lived tokens can limit central-service requests, but sensitive revocation checks may still need an online decision.

A common Crystal login experience does not mean all business permissions are shared. An administrator in the CMS should not automatically obtain administrative access to the e-shop.

## 9. How should multiple existing customer accounts be merged?

Consider a customer with the following legacy accounts:

| System     | Local ID | Points |
| ---------- | -------- | ------ |
| Membership | `M10025` | 500    |
| E-shop     | `E20441` | 300    |
| App Store  | `A07812` | 200    |

After account linking:

```
Crystal customer ID: 0199a4c2-...

    Membership M10025
    E-shop     E20441
    App Store  A07812
```

All three local accounts are associated with one canonical identity, but their original transaction histories are preserved.

### Account-linking process

1. Discover candidate accounts. Identify possible matches using normalized contact information, existing IDs, and other appropriate evidence. This produces candidates, not automatic merges.
2. Verify ownership. Require the customer to authenticate independently to the accounts being linked. For accounts containing significant value, add stronger verification or review.
3. Check fraud and security restrictions. Reject or hold ambiguous links, accounts under investigation, or attempts to combine unrelated people.
4. Create an audited link. Record each system's existing ID, the canonical ID, proof method, time, operator, and link status.
5. Notify connected systems. Publish an account-linked event and update their local identity mappings.
6. Reconcile business entitlements. Evaluate points, memberships, licenses, and rewards separately according to each system's policies.

Account linking and account merging should be reversible at the relationship level when a mistake is discovered. Do not destructively rewrite historical order, payment, points, or login records.

Also preserve a link history so an account previously associated with an incorrect identity can be investigated and recovered.

## 10. How should customer points be consolidated?

This problem is substantially more sensitive than profile synchronization.

There are two possible business models.

Option A — Separate points programs

Each system keeps its own points balance, but the Crystal membership app displays them together.

Recommended first

Membership

# 500

E-shop

# 300

App Store

# 200

Combined displayed balance

## 1,000

Illustrative balances only; these points remain subject to their respective program rules and are not automatically interchangeable.

Option B — Unified Crystal Points

All eligible points become part of a single program, allowing customers to earn and redeem them across multiple applications.

Option B creates a more attractive customer experience but requires a more sophisticated financial-style transaction architecture.

For the initial implementation, I recommend Option A, with a gradual introduction of Option B only when Crystal establishes common valuation, expiration, transfer, refund, and anti-fraud rules.

### 10.1 Why simply adding balances is dangerous

Assume a customer has 500 membership points and 300 e-shop points.

Suppose the same original purchase was rewarded in both systems. If those entries represent duplicate rewards rather than separate legitimate benefits, an automatic sum could give the customer more points than intended.

Other issues include:

- Expired or promotional points.
- Points already reserved for redemption.
- Points related to refunded or disputed purchases.
- Negative balances and chargebacks.
- Fraudulent referral bonuses.
- Repeated new-customer rewards.
- Different monetary conversion values between programs.

Therefore, do not aggregate solely from a `points_balance` field.

### 10.2 Use a points transaction ledger

Every points operation should be represented by an auditable transaction.

| Transaction | Account | Points | Type                |
| ----------- | ------- | ------ | ------------------- |
| T001        | M10025  | +500   | Purchase reward     |
| T002        | E20441  | +300   | E-shop promotion    |
| T003        | E20441  | −100   | Redemption          |
| T004        | A07812  | +200   | App purchase reward |

The available balance must be derived from authoritative ledger state, including applicable holds, expiry, reversals, and adjustments.

If Crystal introduces a central points wallet, each transfer into it should have a unique source transaction reference and corresponding debit or reservation in the original program.

That prevents the same points from remaining spendable in both places.

### 10.3 How to prevent malicious consolidation

Introduce the following security controls:

| Risk                                                    | Control                                                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| One user repeatedly creates accounts for signup bonuses | Award bonuses under a verified eligibility policy, not just per local account                     |
| Fraudster links somebody else's account                 | Proof of control of both accounts; stronger verification for high-value accounts                  |
| Same points imported twice                              | Unique source system + source transaction reference                                               |
| Referral farming                                        | Detect related accounts and referral loops                                                        |
| Points spent while offline and again centrally          | Central authorization for shared redemptions, or strictly bounded preallocated offline allowances |
| Fraudulent balance adjustments                          | Restricted permissions, review, immutable audit trail                                             |
| Incorrect account merge                                 | Hold valuable transfers pending verification and support audited unlink/reversal                  |

For substantial point balances, apply configurable review thresholds and delayed activation rather than transferring all value immediately.

An important rule is that identity merging must not automatically create a financial transfer.

The identity system confirms which accounts are linked. The loyalty system independently determines what financial or promotional entitlements may be combined.

### 10.4 A key limitation with disconnected systems

When a central wallet and remote e-shop are disconnected, Crystal cannot guarantee that the same global balance is never spent twice if both independently allow unlimited redemption.

The simplest safe policy is:

- Earn points locally and synchronize them later.
- Let the customer see a clearly labeled pending balance.
- Require online authorization for cross-system redemption.
- Where offline redemption is essential, preallocate a limited, uniquely tracked spending allowance.

That is a business policy as much as a software architecture decision.

## 11. Suggested PostgreSQL database design

For Crystal, I would separate the central schema into these main groups.

| Table                    | Responsibility                                  |
| ------------------------ | ----------------------------------------------- |
| `crystal_customer`       | Canonical customer identities                   |
| `customer_profile`       | Authoritative shared profile                    |
| `customer_contact`       | Verified email and telephone records            |
| `customer_auth_identity` | Credential and external identity bindings       |
| `customer_account_link`  | Links to existing system-specific IDs           |
| `customer_link_audit`    | History of linking, merging, and unlinking      |
| `customer_consent`       | Per-project and per-channel consent             |
| `identity_outbox`        | Durable changes awaiting publication            |
| `identity_sync_delivery` | Per-destination synchronization state           |
| `identity_sync_inbox`    | Duplicate-event prevention where applicable     |
| `customer_merge_case`    | Review and approval of identity merges          |
| `customer_loyalty_link`  | Links to independently managed loyalty programs |

For example, the central tables could start with:

```

CREATE TABLE crystal_customer (
    customer_id UUID PRIMARY KEY DEFAULT uuidv7(),
    public_id VARCHAR(32) NOT NULL UNIQUE,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    profile_version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_account_link (
    link_id UUID PRIMARY KEY DEFAULT uuidv7(),
    customer_id UUID NOT NULL
        REFERENCES crystal_customer(customer_id),
    source_system VARCHAR(50) NOT NULL,
    local_account_id VARCHAR(128) NOT NULL,
    link_status VARCHAR(30) NOT NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_system, local_account_id)
);

CREATE INDEX idx_account_link_customer
    ON customer_account_link(customer_id);

CREATE TABLE identity_outbox (
    event_id UUID PRIMARY KEY DEFAULT uuidv7(),
    customer_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    customer_version BIGINT NOT NULL,
    payload JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

```

This sample uses PostgreSQL 18's built-in `uuidv7()` function.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.postgresql.org\&sz=32)

PostgreSQL



It is only a starting schema, not a complete production migration. Production implementation should add constraints, indexes, concurrency controls, partitioning where justified, authorization policies, retention rules, and operational auditing.

A crucial point: `customer_account_link` does not contain the actual e-shop purchase records. It only maintains the relationship between the e-shop's existing ID and the canonical Crystal ID.

## 12. Recommended service and API design

Given Crystal's existing Node.js, Oracle, and PostgreSQL environment, I recommend implementing the enterprise customer synchronization and account-linking layer with Node.js and PostgreSQL, while retaining existing Java and other application backends.

Use a dedicated identity provider for the authentication protocols rather than building the entire OAuth/OIDC security implementation from scratch.

Suggested components:

| Component          | Primary responsibility                                                  |
| ------------------ | ----------------------------------------------------------------------- |
| `crystal-identity` | Registration, canonical identity, account linking                       |
| `crystal-auth`     | Authentication and SSO                                                  |
| `crystal-profile`  | Central profile ownership and updates                                   |
| `crystal-sync`     | Outbox processing, event dispatch, retry, reconciliation                |
| `crystal-loyalty`  | Points aggregation and transfer policy                                  |
| `crystal-admin`    | Customer search, merge review, fraud review, synchronization monitoring |

Illustrative REST endpoints:

```

POST   /api/v1/customers/register
GET    /api/v1/customers/{customerId}
PATCH  /api/v1/customers/{customerId}/profile

POST   /api/v1/account-links
GET    /api/v1/account-links
DELETE /api/v1/account-links/{linkId}

GET    /api/v1/sync/events?after={cursor}
POST   /api/v1/sync/acknowledgements

GET    /api/v1/loyalty/summary
POST   /api/v1/loyalty/transfers

```

These endpoints require service-specific authentication and authorization; the example is a conceptual contract, not permission to expose all customer records to every service.

## 13. Implementation roadmap without disrupting existing systems

I would implement the migration in six phases.

| Phase                         | Main work                                                    | Effect on existing services                                  |
| ----------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| 1. Identity foundation        | Deploy central identity database, API, event outbox          | None                                                         |
| 2. Legacy account inventory   | Import identity references and build mapping tables          | Read-only integration                                        |
| 3. Registration integration   | Route supported new registrations through Crystal Identity   | Existing registration retained as fallback where appropriate |
| 4. Profile synchronization    | Add local projections, outbox/inbox delivery, reconciliation | Existing databases remain active                             |
| 5. Authentication integration | Introduce common login and credential linking                | Gradual migration of users                                   |
| 6. Loyalty consolidation      | Introduce shared reporting, then controlled point transfers  | Financial rules preserved until approved                     |

The sequence is important.

Do not begin by changing every application's primary key to the new Crystal ID. That would introduce unnecessary risk to orders, transactions, foreign keys, and application code.

Instead, add the central identifier as a nullable or separately linked field, backfill it in batches, verify mappings, then gradually require it for appropriate new workflows.

Before production rollout, test network partitions, duplicate registration requests, database crashes between write and publication, out-of-order events, repeated acknowledgements, incorrect merges, credential revocation, and simultaneous loyalty redemption.

## 14. Special architectural requirements for the planned health app

The health management app requires an additional trust boundary.

Crystal Identity can provide common authentication, but medical records should remain in a separate protected health-data domain with its own authorization, patient identifiers, access auditing, and applicable privacy controls.

In particular, health diagnoses, prescriptions, medical history, and similar records should not be included in ordinary customer-profile synchronization events.

The CMS, e-shop, or app store must not gain access to medical information merely because all applications belong to Crystal.

## 15. Final architectural decisions

Identity

Use a new, permanent Crystal UUIDv7 identity. Preserve existing application IDs through mapping records. Allow multiple authentication methods and verified account links.

Data

Keep independent application databases and business transactions. Centralize only the identity and shared data requiring common authority.

Synchronization

Use transactional outbox, durable retries, idempotent consumers, and reconciliation. Allow controlled offline operation without pretending to guarantee immediate global consistency.

Authentication and security

Federate certificate-based and mobile authentication through a common identity provider. Keep application permissions, consent, and sensitive data boundaries separate.

Loyalty

Preserve program-specific ledgers initially. Require verified linking, eligibility rules, fraud checks, and idempotent transfer records before consolidating balances.

The fundamental distinction for Crystal is that unified identity, unified authentication, unified customer profiles, and unified loyalty are four related but separate engineering responsibilities.

They should be designed to work together, but they should not be implemented as one enormous shared database.

This approach can give customers a unified Crystal experience while preserving the independence, reliability, and security boundaries of the existing systems.


---

# 크리스탈 통합 신원 및 고객관리 체계

기업 구조 제안서 | 2026년 10월

> 위 영문 문서의 한국어 번역입니다. 표·코드·API 경로·데이터베이스 식별자는 원문 그대로 두었고, 기술 용어는 처음 나올 때 영문을 함께 적었습니다.

## 1. 핵심 권고

크리스탈은 기존 정보체계들을 각각 독립적으로 계속 운영하면서도, 고객 신원은 중앙에서 관리하는 **크리스탈 신원 플랫폼(Crystal Identity Platform, CIP)** 을 구축해야 합니다.

목표는 기존 데이터베이스를 하나로 합치는 것이 **아닙니다**. 확인된 고객 한 사람마다 권위 있는 신원을 하나 세우고, 여러 개의 응용 계정과 인증 수단, 그리고 각기 독립적으로 관리되는 업무 기록을 그 신원에 연결하는 것입니다.

권고하는 구조적 결정은 다음과 같습니다.

| 설계 과제         | 권고안                                                            |
| ----------------- | ----------------------------------------------------------------- |
| 공통 고객 식별자  | 체계가 생성하는 영구 UUIDv7                                       |
| 고객에게 보이는 번호 | 선택적인 `Crystal ID` 또는 변경 가능한 사용자명                  |
| 신원의 개수       | 확인된 고객당 표준 신원 하나, 거기에 여러 인증 수단과 기존 계정을 연결 |
| 중앙 신원 서비스  | 전용 Crystal Identity Service                                     |
| 중앙 데이터베이스 | PostgreSQL, 권한을 받은 중앙 서비스만 접근                        |
| 인증              | OpenID Connect / OAuth 2.0, X.509과 SIM 기반 방식은 어댑터로 보존 |
| 동기화            | 트랜잭션 아웃박스(Transactional Outbox) + 신뢰성 있는 전달 + 로컬 데이터베이스 |
| 통신이 끊긴 체계  | 로컬 운영, 소실되지 않는 동기화 대기열, 복구 후 대조              |
| 프로필 수정       | 공유 항목은 중앙이 소유, 변경은 판본(version) 관리                |
| 기존 고객 계정    | 즉시 삭제가 아니라 점진적 연결과 이관                             |
| 고객 포인트       | 감사 가능한 원장을 체계별로 분리, 검증 후 통제된 통합             |
| 건강관리          | 일반 고객 프로필이 아닌 별도의 민감정보 영역                      |

가장 중요한 원칙은 다음과 같습니다.

**모든 데이터베이스 작업이 아니라, 신원의 소유권을 중앙화하십시오.**

크리스탈의 웹사이트, 멤버십 앱, 전자상점 앱, 앱스토어 앱, 계획 중인 CMS, 건강관리 앱은 모두 같은 신원 체계를 사용해야 하지만, 거래 하나하나마다 단일 중앙 데이터베이스에 접속할 필요는 없어야 합니다.

## 2. 권고하는 체계 구조

크리스탈 고객

여러 제품에 걸친 하나의 고객 경험

웹사이트

멤버십

전자상점

앱스토어

건강관리

CMS

인증, 계정 연결, 동기화

크리스탈 신원 플랫폼

공통 기업 서비스

신원 및 계정 연결

인증 / SSO

고객 프로필 원본

사건 전달 / 동기화

동의 및 감사

로열티 조정

중앙 PostgreSQL

권위 있는 신원 기록과 사건 아웃박스

신뢰성 있는 API / 메시지 전달

Web DB

Member DB

E-shop DB

Store DB

Health DB

CMS DB

각 응용체계는 자기 로컬 데이터와 운영 자율성, 그리고 기존 주키(primary key)를 그대로 유지합니다.

중앙 플랫폼은 신원, 인증, 계정 연결, 프로필 관리, 동기화 기능을 제공합니다. 주문과 배송 거래는 여전히 전자상점이 소유하고, 내리기·구매 내역은 앱스토어가, 멤버십 거래는 멤버십 체계가 각각 보유합니다.

크리스탈의 경우 일부 기존 체계가 물리적으로 분리된 봉사기에 있고 통신이 불안정할 수 있으므로, 이러한 분리는 특히 중요합니다.

## 3. 공통 고객 식별자는 어떤 형식이어야 하는가

이름, 생년월일, 전화번호, 증명서 번호, SIM 식별자를 영구 고객 번호로 쓰지 **마십시오**.

크리스탈이 구별해야 할 식별자는 세 가지입니다.

| 식별자            | 보기                 | 용도                        |
| ----------------- | -------------------- | --------------------------- |
| 내부 표준 식별자  | `0199a4c2-5a8d-7...` | 영구적인 데이터베이스 신원  |
| 공개 Crystal ID   | `CR-0087325164`      | 고객 상담과 계정 조회       |
| 로그인 사용자명   | `zhaoliu123`         | 선택 사항, 기억하기 쉬운 별칭 |

위 값은 예시입니다.

### 왜 UUIDv7인가

UUIDv7은 [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562.html)가 규정한 형식으로, 분산된 여러 곳에서 독립적으로 생성하면서도 시간 순서를 유지합니다. 그래서 데이터베이스 색인에 적합하고, 각자 식별자를 만들어야 하는 체계에도 알맞습니다.

크리스탈에 특히 적합한 이유는, 중앙 플랫폼과 연결되지 않은 상태에서도 개별 체계가 임시 기록을 만들어야 할 수 있기 때문입니다.

표준 식별자는 다음 조건을 지켜야 합니다.

- 고객 신원이 존재하는 동안 절대 바뀌지 않는다.
- 다른 고객에게 다시 배정되지 않는다.
- 개인 속성과 아무 관련이 없다.
- 데이터베이스에서 유일성 제약을 갖는다.
- 기존 계정 번호를 이관한 뒤에도 계속 존재한다.
- 비밀번호나 보안 자격이 아니라 식별자로만 취급된다.

이름, 생년월일, 전화번호는 바뀌고, 중복되고, 외부에 드러날 수 있습니다. 식별자 안에 끼워 넣으면 개인정보 문제도 생깁니다.

권고 모형은 이렇습니다. 내부에는 UUIDv7, 고객 상담에는 읽기 쉬운 별도의 Crystal ID, 로그인에는 선택적 사용자명.

개인정보 보호를 더 높이려면, 응용체계들이 로그인 토큰에서 같은 전역 UUID를 받을 필요도 없습니다. OpenID Connect는 **쌍별 주체 식별자(pairwise subject identifier)** 를 지원하므로, 서로 무관한 응용체계가 고객 활동을 자동으로 연결해 보는 것을 막을 수 있습니다.

크리스탈에서는 중앙 대응(mapping) 서비스가 권한이 있을 때에만 그 응용체계별 식별자를 표준 신원으로 되돌려 해석하면 됩니다.

## 4. 고객은 계정을 하나 가져야 하는가, 여러 개 가져야 하는가

크리스탈은 네 가지 개념을 구별해야 합니다.

1. **사람의 신원**: 표준 고객 기록.
2. **로그인 자격**: 비밀번호, 패스키, 증명서, SIM 기반 인증 등.
3. **응용 계정**: 멤버십 계정, 전자상점 계정, 앱스토어 계정 등.
4. **업무 관계**: 멤버십 등급, 고객 분류, 기관 소속, 로열티 가입, 권한.

예를 들면 다음과 같습니다.

하나의 표준 크리스탈 신원

내부 고객 UUID: 0199a4c2-...

로그인 수단

사용자명

전화 / SIM

X.509 증명서

패스키

기존 계정

멤버십: 10528

전자상점: 88312

앱스토어: 72954

웹사이트: 52890

위 값은 예시입니다. 기존 계정은 원래 기록을 그대로 유지하면서 하나의 표준 신원에 연결됩니다.

한 고객이 사용자명 여러 개, 확인된 전화번호 여러 개, 증명서 여러 개, 기존 응용 계정 여러 개를 가질 수 있지만, 그것이 사람 기록이 여러 개여야 한다는 뜻은 아닙니다.

다만 이름이나 전화번호, 생일이 같다는 이유만으로 계정을 **자동으로 합쳐서는 안 됩니다**.

계정 연결은 사용자가 요청하게 하고, 통제권을 입증할 적절한 증거를 요구하며, 금전적 가치나 포인트, 민감한 개인정보가 걸려 있을 때에는 더 엄격히 심사하십시오.

의도적으로 신원을 분리해 쓰는 고객을 위해, 정책으로 통제되는 계정 분리 운영도 허용할 수 있습니다. 모든 계정을 강제로 합칠 수 있다거나 합쳐야 한다고 전제하지 마십시오. 한 사람이 여러 기관을 대표할 수도 있는데, 그때 필요한 것은 사람 신원을 중복으로 만드는 것이 아니라 기관 소속과 권한 기록을 따로 두는 것입니다.

## 5. 통합 고객 데이터베이스는 어떻게 공유해야 하는가

전용 등록 서비스를 만들어 각 체계에 통보하자는 제안은 기본적으로 타당합니다.

다만 API 호출과 cron 재시도에만 의존하지 말고, **트랜잭션 아웃박스와 인박스** 동기화 구조를 더하기를 권고합니다.

### 5.1 데이터베이스를 직접 공유하는 것이 좋지 않은 이유

고객이 전자상점을 여는 경우를 생각해 봅시다.

```
고객이 전자상점을 연다
        ↓
전자상점이 중앙 DB에 고객을 요청한다
        ↓
망 연결이 끊긴다
        ↓
고객 프로필을 불러올 수 없다
        ↓
결제가 실패할 수 있다
```

망이 안정적이라 해도, 모든 체계가 중앙 데이터베이스를 조회하게 만들면 불필요한 의존과 성능 병목이 생깁니다.

대신 각 응용체계는 자기가 실제로 필요한 고객 정보만 담은 **로컬 사본(projection)** 을 유지해야 합니다.

예를 들면 다음과 같습니다.

| 체계      | 로컬에 두는 고객 자료                                        |
| --------- | ------------------------------------------------------------ |
| 멤버십    | 로컬 사용자 번호, 표준 신원 참조, 멤버십 등급                |
| 전자상점  | 로컬 사용자 번호, 신원 참조, 필요한 연락처, 배송 주소        |
| 앱스토어  | 로컬 사용자 번호, 신원 참조, 앱 사용권, 구매 내역            |
| CMS       | 로컬 사용자 번호, 신원 참조, 콘텐츠 권한                     |
| 건강관리  | 별도의 환자 식별자, 제한된 신원 연결, 필요한 인구통계 자료   |

주문, 구매, 업무 기록은 로컬에 남습니다. 공유되는 신원 항목만 중앙에서 동기화됩니다.

### 5.2 신뢰성 있는 동기화는 이렇게 동작해야 한다

1\. 등록 또는 프로필 수정

Crystal Identity API

2\. 하나의 PostgreSQL 트랜잭션

고객 변경 + 아웃박스 사건을 함께 저장

3\. 전달 작업자(worker)

대기열 / 브로커 / 보안 동기화 API

자동 재시도, 재전송, 전달 추적

멤버십

적용됨

앱스토어

적용됨

전자상점

재시도 대기

4\. 전자상점이 다시 연결됨

놓친 사건을 재생하고, 검증하고, 로컬에 적용하고, 수신을 확인

단순한 통보 체계와의 결정적인 차이는 이것입니다.

고객이 등록될 때 중앙 체계는 고객 기록과 그에 해당하는 사건을 **같은 PostgreSQL 트랜잭션에서** 확정해야 합니다.

그러지 않으면 고객을 저장한 뒤 통보를 기록하기 전에 장애가 날 수 있고, 그 동기화는 영구히 사라집니다.

이것이 바로 [트랜잭션 아웃박스 패턴](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)이 해결하는 문제입니다.

### 5.3 사건 보기

```
{
  "event_id": "evt-10002831",
  "event_type": "customer.profile.updated",
  "schema_version": 1,
  "customer_id": "0199a4c2-...",
  "customer_version": 18,
  "source_system": "crystal-identity",
  "occurred_at": "2026-10-17T10:00:00Z",
  "changes": {
    "display_name": "Zhao Liu"
  }
}
```

실제 구현에서는 `customer_id`에 올바른 UUID를, 사건에는 안정적인 식별자를, 그리고 검증된 사건 구조(schema)를 써야 합니다. 사건에는 받는 응용체계가 가질 권한이 있는 항목만 담깁니다.

중요한 항목은 다음과 같습니다.

- `event_id`: 중복 전달을 가려냅니다.
- `customer_id`: 중앙 고객을 지목합니다.
- `customer_version`: 뒤늦거나 순서가 뒤바뀐 수정을 가려냅니다.
- `source_system`: 변경을 일으킨 쪽을 밝힙니다.
- `schema_version`: 사건 구조가 앞으로 바뀔 수 있게 합니다.

받는 응용체계는 처리에 성공한 사건 식별자를 **프로필 수정과 같은 트랜잭션에서** 로컬 인박스 표에 기록해야 합니다.

그러면 같은 사건이 두 번 전달되어도 한 번만 적용됩니다.

전달은 "정확히 한 번"을 가정하지 말고, **최소 한 번 전달 + 멱등(idempotent) 처리** 로 설계해야 합니다.

### 5.4 cron 작업만으로 충분한가

체계 수가 적다면 cron 작업이나 상주 배경 작업자로도 충분히 받아들일 만합니다.

도구보다 중요한 것은 다음 요구들입니다.

| 요구 조건              | 왜 중요한가                                               |
| ---------------------- | --------------------------------------------------------- |
| 소실되지 않는 아웃박스 | 재기동과 장애를 넘어 사건이 살아남는다                    |
| 체계별 전달 상태 추적  | 전자상점 하나의 실패가 멤버십 전달을 막지 않는다          |
| 백오프를 둔 재시도     | 끊긴 봉사기를 과부하로 몰지 않는다                        |
| 중복 검출              | 프로필 작업이 두 번 적용되는 것을 막는다                  |
| 고객별 순서 보장       | 오래된 수정이 새 수정을 덮어쓰지 못하게 한다              |
| 실패 사건 대기열       | 끝내 실패하는 메시지를 조사할 수 있게 한다                |
| 대조(reconciliation)   | 정상 전달이 실패해도 빠진 자료를 복구한다                 |
| 전체 사본 복원         | 로컬 사본을 처음부터 다시 구성할 수 있게 한다             |
| 감시                   | 동기화 지연이 커지는 것을 알아챈다                        |

`notification_failed` 같은 참/거짓 칸 하나로는 오래 버틸 수 없습니다.

크리스탈에는 목적지별 전달 상태가 필요합니다. `last_applied_version`, `retry_count`, `next_retry_at`, `last_error` 같은 것들입니다.

첫 판은 PostgreSQL 아웃박스 표와 Node.js 작업자로 구현하기를 권고합니다. RabbitMQ 같은 메시지 브로커는 처리량·경로 설정·운영 요구가 그것을 정당화할 때 도입하면 됩니다. 브로커를 쓴다고 해서 데이터베이스와 메시지 사이의 확실한 연계가 필요 없어지는 것은 아닙니다.

## 6. 전자상점이 물리적으로 끊기면 어떻게 되는가

이것은 지금 상황에서 가장 중요한 요구 중 하나입니다.

세 가지 운영 방식을 구분하기를 권고합니다.

| 상황                        | 권고 동작                                                        |
| --------------------------- | ---------------------------------------------------------------- |
| 망이 있고 안전함            | 중앙에 등록하고 정상적으로 동기화한다                            |
| 망이 일시적으로 없음        | 허용된 로컬 작업을 계속하고, 변경은 대기열에 쌓는다              |
| 승인된 보안 통신로가 없음   | 직접 자료 교환을 하지 않는다. 승인된 안전 전달 방식을 쓰거나 연합을 보류한다 |

### 보기: 연결이 끊긴 상태에서 새 고객이 등록할 때

1. 고객이 전자상점에서 등록한다.
2. 전자상점이 임시 UUIDv7을 만들고 계정을 로컬에 저장한다.
3. 그 등록을 `PENDING_CENTRAL_LINK`로 표시한다.
4. 전자상점이 소실되지 않는 동기화 요청을 저장한다.
5. 연결이 돌아오면 그 요청을 Crystal Identity에 보낸다.
6. 신원 서비스가 정당한 기존 계정을 찾고 연결 증거를 평가해, 계정을 연결하거나 새 표준 신원을 만든다.
7. 전자상점이 받은 표준 식별자를 저장하고 상태를 `LINKED`로 바꾼다.

기존 로컬 사용자 번호는 바꿀 필요가 없습니다.

여기에는 피할 수 없는 한계가 있습니다.

**연결이 끊긴 전자상점은, 그 고객이 다른 끊긴 체계에 이미 등록되어 있지 않다는 것을 보장할 수 없습니다.**

UUIDv7은 중앙 조정 없이도 서로 다른 기술적 기록 식별자를 줄 수 있지만, 두 계정 기록이 서로 다른 사람이라는 것을 증명하지는 못합니다.

따라서 사람 수준의 계정 유일성은 연결이 복구된 뒤에 대조로 맞춰야 합니다.

같은 이유로, 독립된 신뢰 통신로가 없는 고립된 전자상점은 실시간 전역 SSO나 즉각적인 계정 정지 전파를 제공할 수 없습니다.

### 권고하는 망 구성

물리적으로 분리된 기반 설비라면, 각 원격 체계에 **바깥으로 나가는 동기화 대리자(agent)** 를 두는 편이 낫습니다. 그 대리자가 중앙 HTTPS 끝점에 접속해 자기를 인증하고, 마지막으로 확인한 판본 이후의 변경을 요청하고, 로컬에 쌓인 변경을 올려보냅니다.

이렇게 하면 크리스탈이 모든 응용 데이터베이스에 들어오는 접속을 열어 줄 필요가 없습니다.

허용되는 범위에서 TLS, 상호 서비스 인증, 최소 권한 자격, 망 허용목록, 적절한 암호화와 메시지 무결성 검사를 쓰십시오.

안전한 망 경로를 확보할 수 없다면, 신뢰할 수 없는 통로로 개인정보를 보내서는 안 됩니다. 암호화·인증·서명된 전달 꾸러미를 쓰는 승인된 오프라인 절차가 필요할 수 있습니다.

## 7. 프로필 변경은 어떻게 전파해야 하는가

고객 프로필을 공유하려면 **어느 체계가 어느 항목을 소유하는지** 분명히 정해야 합니다.

정하지 않으면 이런 일이 생깁니다.

```
멤버십이 이름을 "Zhao Liu"로 바꾼다
          ↓
전자상점이 이름을 "Liu Zhao"로 바꾼다
          ↓
두 체계가 모두 프로필 수정을 보낸다
          ↓
서로 계속 덮어쓰거나 결과가 어긋난다
```

항목 소유권 정책을 권고합니다.

| 자료 항목              | 권위 있는 소유자          | 동기화                        |
| ---------------------- | ------------------------- | ----------------------------- |
| 표준 고객 식별자       | 신원 플랫폼               | 권한 있는 체계에              |
| 확인된 이동전화 번호   | 신원 플랫폼               | 필요한 곳에만                 |
| 주 표시 이름           | 고객 프로필 서비스        | 관련 체계에                   |
| 로그인 자격            | 신원 플랫폼               | 비밀은 절대 복제하지 않음     |
| 전자상점 배송 주소     | 전자상점                  | 기본적으로 로컬               |
| 멤버십 등급            | 멤버십 서비스             | 권한이 있을 때 공표           |
| 앱스토어 구매          | 앱스토어                  | 앱스토어 안에 머무름          |
| 의료 정보              | 건강관리 서비스           | 제한, 일반 동기화 대상 아님   |
| 공유 통보 설정         | 동의/설정 서비스          | 사업별·통로별                 |

중앙이 소유하는 항목에 대해서는, 응용체계가 스스로 원본이 되지 말고 중앙 서비스에 변경을 요청해야 합니다.

연결이 끊긴 상태에서 로컬 고객이 공유 항목을 고쳤다면, 화면은 그 수정이 **동기화 대기 중**임을 알려야 합니다. 어디에나 반영되었다고 말해서는 안 됩니다.

`expected_version` 같은 낙관적 동시성 제어를 써서, 충돌하는 변경을 거절하고 명시적으로 조정할 수 있게 하십시오.

함께 검토할 만한 표준으로 **SCIM 2.0** 이 있습니다. 사용자 공급(provisioning)과 프로필 조작, PATCH, 자원 판본 관리를 규정합니다.

크리스탈에서는 체계 간 경계에 SCIM을 쓰고, 내부 서비스끼리는 더 단순한 영역별 REST API와 사건을 쓰면 됩니다.

달성할 수 있는 일관성 수준은 작업에 따라 다릅니다.

- 표시 이름 변경은 최종 일관성으로 충분합니다.
- 새로 확인된 전화번호는 더 강한 검증과 통제된 활성화가 필요합니다.
- 계정 정지와 권한 회수는 민감한 체계에서 온라인 확인이나 "실패 시 차단" 동작이 필요할 수 있습니다.
- 금전 사용(교환)은 프로필 동기화보다 훨씬 강한 보장이 필요합니다.

대조 작업은 주기적으로 고객 식별자, 판본, 건수, 검사합(checksum)을 비교하고, 권위 있는 사본이나 사건 재생으로 차이를 복구해야 합니다.

## 8. 기존 X.509과 SIM 인증은 어떻게 다루어야 하는가

크리스탈은 이 방식들을 보존하되, **인증과 고객 식별을 분리** 해야 합니다.

X.509 증명서가 답하는 질문은 이런 것입니다.

> 이 사용자가 신뢰된 증명서에 대응하는 비밀열쇠를 가지고 있는가?

SIM 기반 인증이 답하는 질문은 이런 것일 수 있습니다.

> 이 사용자가 특정 이동통신 가입에 대한 통제권을 입증할 수 있는가?

둘 다 어떤 한 사람의 신원을 증명하는 것은 아닙니다.

### 권고 설계

데스크톱

X.509 증명서 인증

모바일 / 웹

SIM 기반 또는 그 외 지원되는 인증

Crystal Identity Provider

자격을 검증하고 연결된 계정을 찾는다

표준 고객 신원

인증 방식과 무관하게 같은 고객

응용체계 범위의 로그인 세션

OIDC 신원 토큰 / API 접근 토큰

예를 들어 증명서 로그인 뒤에는, 신원 공급자가 신뢰 사슬과 증명서 용도, 폐기 여부를 검증한 다음 묶인 자격과 표준 고객을 찾습니다. 이름이 같다는 이유만으로 증명서를 고객과 동일시해서는 안 됩니다.

SIM 관련 인증에서는 구현 방식이 중요합니다. 통신사가 보증하는 인증, SMS 확인, 그리고 단순히 SIM 식별자를 읽는 것은 보안 수준이 전혀 같지 않습니다.

공중전화망을 통한 SMS·음성 인증은 SIM 스와핑, 번호 이동, 도청 위험 때문에 NIST가 **제한적(restricted)** 으로 분류합니다.

확인된 이동전화 인증은 지원 수단 중 하나로 쓰되, 민감한 작업에는 패스키 같은 더 강한 대안을 제공하십시오.

### 기존 체계의 식별자를 그대로 가져다 써야 하는가

권고하지 않습니다.

예컨대 멤버십 체계의 기존 고객 번호를 채택하면 여러 문제가 생깁니다.

- 다른 체계가 이미 같은 숫자를 다른 고객에게 쓰고 있을 수 있습니다.
- 기존 번호는 데이터베이스 순차값으로 만들어졌을 수 있어, 독립된 데이터베이스들 사이에서 안전하게 조정할 수 없습니다.
- 선택된 체계가 다른 모든 응용체계의 역사적 권위가 되어 버립니다.
- 앞으로 만들 응용체계가, 애초에 전사 신원을 위해 설계되지 않은 구조의 제약을 물려받습니다.

대신 새 `crystal_customer_id`를 도입하고 기존 계정 전부를 그것에 대응시키십시오.

기존 멤버십, 웹사이트, 전자상점, 앱스토어의 주키는 그대로 두어야 합니다.

### 인증 표준

중앙 로그인에는 OpenID Connect, API 권한 부여에는 OAuth 2.0을 권고하며, 지원되는 네이티브·브라우저 흐름에는 PKCE를 쓴 Authorization Code 방식을 씁니다.

안드로이드에서는 WebView에 자격을 넣지 말고 외부 브라우저나 체계 브라우저 탭을 쓰는 것이 표준입니다. [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html)와 더 최근의 OAuth 보안 권고인 [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)이 이를 뒷받침합니다.

각 백엔드는 토큰의 서명, 발급자, 대상(audience), 만료, 권한 주장을 검증해야 합니다. 로컬에서 검증하는 짧은 수명의 토큰은 중앙 서비스 요청을 줄여 주지만, 민감한 폐기 확인은 여전히 온라인 판단이 필요할 수 있습니다.

크리스탈의 공통 로그인 경험은 모든 업무 권한을 공유한다는 뜻이 아닙니다. CMS 관리자가 자동으로 전자상점 관리 권한을 얻어서는 안 됩니다.

## 9. 기존의 여러 고객 계정은 어떻게 합쳐야 하는가

다음과 같은 기존 계정을 가진 고객을 생각해 봅시다.

| 체계      | 로컬 번호 | 포인트 |
| --------- | --------- | ------ |
| 멤버십    | `M10025`  | 500    |
| 전자상점  | `E20441`  | 300    |
| 앱스토어  | `A07812`  | 200    |

계정 연결 뒤에는 이렇게 됩니다.

```
Crystal customer ID: 0199a4c2-...

    Membership M10025
    E-shop     E20441
    App Store  A07812
```

세 로컬 계정이 하나의 표준 신원에 결합되지만, 각자의 거래 역사는 그대로 보존됩니다.

### 계정 연결 절차

1. **후보 계정 찾기.** 정규화한 연락처, 기존 번호, 그 밖의 적절한 증거로 가능한 일치를 찾습니다. 이것은 후보일 뿐, 자동 병합이 아닙니다.
2. **소유 확인.** 연결하려는 계정 각각에 대해 고객이 독립적으로 인증하게 합니다. 가치가 큰 계정에는 더 강한 검증이나 심사를 더합니다.
3. **부정과 보안 제약 점검.** 모호한 연결, 조사 중인 계정, 서로 무관한 사람을 합치려는 시도는 거절하거나 보류합니다.
4. **감사 가능한 연결 생성.** 각 체계의 기존 번호, 표준 식별자, 증명 방법, 시각, 처리자, 연결 상태를 기록합니다.
5. **연결된 체계에 통보.** 계정 연결 사건을 공표하고 각 체계의 로컬 신원 대응표를 갱신합니다.
6. **업무 권리 조정.** 포인트, 멤버십, 사용권, 보상은 각 체계의 정책에 따라 **따로** 평가합니다.

계정 연결과 병합은 잘못이 발견되었을 때 관계 수준에서 되돌릴 수 있어야 합니다. 주문, 결제, 포인트, 로그인 기록을 파괴적으로 다시 쓰지 마십시오.

또한 연결 역사를 보존해, 잘못된 신원에 결합되었던 계정을 조사하고 복구할 수 있게 하십시오.

## 10. 고객 포인트는 어떻게 통합해야 하는가

이 문제는 프로필 동기화보다 훨씬 민감합니다.

업무 모형은 두 가지가 가능합니다.

**가 안 — 포인트 제도를 분리해 두기**

각 체계가 자기 포인트 잔고를 유지하고, 멤버십 앱이 그것들을 한자리에 보여 줍니다.

*먼저 권고하는 안*

멤버십

# 500

전자상점

# 300

앱스토어

# 200

합쳐서 보여 주는 잔고

## 1,000

예시 잔고입니다. 이 포인트들은 각 제도의 규정을 그대로 따르며 자동으로 교환되지 않습니다.

**나 안 — 통합 크리스탈 포인트**

자격이 되는 모든 포인트를 하나의 제도로 합쳐, 고객이 여러 응용체계에서 쌓고 쓸 수 있게 합니다.

나 안이 고객에게 더 매력적이지만, 금융에 가까운 거래 구조가 필요합니다.

첫 구현에는 **가 안**을 권고하고, 공통 가치 환산·소멸·이전·환불·부정방지 규칙이 갖추어진 뒤에 나 안을 점진적으로 도입하십시오.

### 10.1 잔고를 그냥 더하는 것이 위험한 이유

고객이 멤버십 포인트 500점, 전자상점 포인트 300점을 가졌다고 해 봅시다.

같은 구매에 대해 두 체계가 각각 보상했을 수 있습니다. 그 기록이 별개의 정당한 혜택이 아니라 **중복 보상**이라면, 자동으로 더하면 의도보다 많은 포인트를 주게 됩니다.

그 밖의 문제도 있습니다.

- 소멸된 포인트, 판촉용 포인트.
- 교환을 위해 이미 잡아 둔 포인트.
- 환불·분쟁 중인 구매에 딸린 포인트.
- 음수 잔고와 결제 취소.
- 부정한 소개 보상.
- 반복된 신규가입 보상.
- 제도마다 다른 금전 환산 가치.

따라서 `points_balance` 칸만 보고 합산하지 마십시오.

### 10.2 포인트 거래 원장을 쓰십시오

포인트 조작 하나하나가 감사 가능한 거래로 남아야 합니다.

| 거래  | 계정   | 포인트 | 종류             |
| ----- | ------ | ------ | ---------------- |
| T001  | M10025 | +500   | 구매 보상        |
| T002  | E20441 | +300   | 전자상점 판촉    |
| T003  | E20441 | −100   | 교환             |
| T004  | A07812 | +200   | 앱 구매 보상     |

사용 가능 잔고는 보류, 소멸, 취소, 조정을 모두 반영한 권위 있는 원장 상태에서 **계산되어야** 합니다.

중앙 포인트 지갑을 도입한다면, 그 안으로 옮기는 각 이전에는 유일한 원천 거래 참조가 있어야 하고, 원래 제도에서 그만큼 차감이나 예약이 일어나야 합니다.

그래야 같은 포인트가 두 곳에서 동시에 쓸 수 있는 상태로 남지 않습니다.

### 10.3 악의적 통합을 막는 방법

다음 보안 통제를 두십시오.

| 위험                                       | 통제                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------- |
| 가입 보상을 노려 계정을 반복 생성          | 로컬 계정 단위가 아니라 확인된 자격 정책에 따라 보상                 |
| 남의 계정을 가로채 연결                    | 양쪽 계정의 통제권 입증, 고액 계정에는 더 강한 검증                  |
| 같은 포인트를 두 번 반입                   | 원천 체계 + 원천 거래 참조를 유일하게                                |
| 소개 보상 농사                             | 연관 계정과 소개 고리를 검출                                         |
| 오프라인에서 쓴 포인트를 중앙에서 또 사용  | 체계 간 교환은 중앙 승인, 또는 엄격히 한정된 선배정 한도만 허용      |
| 부정한 잔고 조정                           | 권한 제한, 심사, 변경 불가능한 감사 기록                             |
| 잘못된 계정 병합                           | 가치 있는 이전은 검증까지 보류하고, 감사되는 연결 해제·되돌림을 지원 |

잔고가 큰 경우에는 모든 가치를 즉시 옮기지 말고, 설정 가능한 심사 기준과 지연 활성화를 적용하십시오.

중요한 규칙은 이것입니다. **신원 병합이 자동으로 금전 이전을 만들어서는 안 됩니다.**

신원 체계는 어떤 계정들이 연결되었는지 확인해 줍니다. 어떤 금전적·판촉적 권리를 합칠 수 있는지는 로열티 체계가 독립적으로 판단합니다.

### 10.4 끊긴 체계에서의 핵심 한계

중앙 지갑과 원격 전자상점이 끊겼을 때, 양쪽이 각자 무제한 교환을 허용한다면 같은 전역 잔고가 두 번 쓰이지 않는다고 보장할 수 없습니다.

가장 단순하고 안전한 정책은 이렇습니다.

- 포인트는 로컬에서 쌓고 나중에 동기화한다.
- 고객에게는 **대기 중 잔고**임을 분명히 표시해 보여 준다.
- 체계 간 교환은 온라인 승인을 요구한다.
- 오프라인 교환이 꼭 필요하면, 한도가 정해지고 유일하게 추적되는 선배정 한도를 준다.

이것은 소프트웨어 구조만의 문제가 아니라 업무 정책의 문제이기도 합니다.

## 11. 권고하는 PostgreSQL 데이터베이스 설계

크리스탈의 중앙 구조(schema)는 다음 묶음으로 나누기를 권고합니다.

| 표                       | 책임                                        |
| ------------------------ | ------------------------------------------- |
| `crystal_customer`       | 표준 고객 신원                              |
| `customer_profile`       | 권위 있는 공유 프로필                       |
| `customer_contact`       | 확인된 전자우편·전화 기록                   |
| `customer_auth_identity` | 자격과 외부 신원의 결합                     |
| `customer_account_link`  | 기존 체계별 번호와의 연결                   |
| `customer_link_audit`    | 연결·병합·해제의 역사                       |
| `customer_consent`       | 사업별·통로별 동의                          |
| `identity_outbox`        | 공표를 기다리는, 소실되지 않는 변경         |
| `identity_sync_delivery` | 목적지별 동기화 상태                        |
| `identity_sync_inbox`    | 해당되는 곳에서의 중복 사건 방지            |
| `customer_merge_case`    | 신원 병합의 심사와 승인                     |
| `customer_loyalty_link`  | 독립적으로 관리되는 로열티 제도와의 연결    |

예를 들어 중앙 표들은 이렇게 시작할 수 있습니다.

```

CREATE TABLE crystal_customer (
    customer_id UUID PRIMARY KEY DEFAULT uuidv7(),
    public_id VARCHAR(32) NOT NULL UNIQUE,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    profile_version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_account_link (
    link_id UUID PRIMARY KEY DEFAULT uuidv7(),
    customer_id UUID NOT NULL
        REFERENCES crystal_customer(customer_id),
    source_system VARCHAR(50) NOT NULL,
    local_account_id VARCHAR(128) NOT NULL,
    link_status VARCHAR(30) NOT NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_system, local_account_id)
);

CREATE INDEX idx_account_link_customer
    ON customer_account_link(customer_id);

CREATE TABLE identity_outbox (
    event_id UUID PRIMARY KEY DEFAULT uuidv7(),
    customer_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    customer_version BIGINT NOT NULL,
    payload JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

```

위 보기는 PostgreSQL 18에 내장된 `uuidv7()` 함수를 씁니다.

이것은 출발점이 되는 구조일 뿐, 완성된 운영 이관본이 아닙니다. 실제 구현에서는 제약, 색인, 동시성 제어, 필요한 경우의 분할(partitioning), 접근 권한 정책, 보존 규칙, 운영 감사를 더해야 합니다.

핵심은 이것입니다. `customer_account_link`에는 전자상점의 실제 구매 기록이 들어 있지 **않습니다**. 전자상점의 기존 번호와 표준 크리스탈 식별자 사이의 관계만 유지합니다.

## 12. 권고하는 서비스와 API 설계

크리스탈이 이미 Node.js, Oracle, PostgreSQL을 쓰고 있으므로, 전사 고객 동기화와 계정 연결 계층은 Node.js와 PostgreSQL로 구현하고, 기존 Java 및 그 외 응용 백엔드는 그대로 두기를 권고합니다.

인증 프로토콜은 전용 신원 공급자를 쓰고, OAuth/OIDC 보안 구현 전체를 처음부터 만들지는 마십시오.

권고 구성 요소:

| 구성 요소          | 주 책임                                                  |
| ------------------ | -------------------------------------------------------- |
| `crystal-identity` | 등록, 표준 신원, 계정 연결                               |
| `crystal-auth`     | 인증과 SSO                                               |
| `crystal-profile`  | 중앙 프로필 소유와 수정                                  |
| `crystal-sync`     | 아웃박스 처리, 사건 발송, 재시도, 대조                   |
| `crystal-loyalty`  | 포인트 집계와 이전 정책                                  |
| `crystal-admin`    | 고객 검색, 병합 심사, 부정 심사, 동기화 감시             |

예시 REST 끝점:

```

POST   /api/v1/customers/register
GET    /api/v1/customers/{customerId}
PATCH  /api/v1/customers/{customerId}/profile

POST   /api/v1/account-links
GET    /api/v1/account-links
DELETE /api/v1/account-links/{linkId}

GET    /api/v1/sync/events?after={cursor}
POST   /api/v1/sync/acknowledgements

GET    /api/v1/loyalty/summary
POST   /api/v1/loyalty/transfers

```

이 끝점들은 서비스별 인증과 권한 부여를 요구합니다. 위 목록은 개념적인 계약일 뿐, 모든 서비스에 모든 고객 기록을 열어 주라는 뜻이 아닙니다.

## 13. 기존 체계를 중단시키지 않는 이행 계획

이관은 여섯 단계로 진행하기를 권고합니다.

| 단계                | 주요 작업                                                      | 기존 서비스에 주는 영향                           |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| 1. 신원 기반 구축   | 중앙 신원 데이터베이스·API·사건 아웃박스 배치                  | 없음                                              |
| 2. 기존 계정 조사   | 신원 참조를 반입하고 대응표를 만든다                           | 읽기 전용 연동                                    |
| 3. 등록 연동        | 지원되는 신규 등록을 Crystal Identity로 보낸다                 | 필요한 곳에서는 기존 등록을 대비책으로 남겨 둠    |
| 4. 프로필 동기화    | 로컬 사본, 아웃박스/인박스 전달, 대조를 더한다                 | 기존 데이터베이스는 계속 운영                     |
| 5. 인증 연동        | 공통 로그인과 자격 연결을 도입한다                             | 사용자를 점진적으로 이관                          |
| 6. 로열티 통합      | 먼저 통합 보고, 그다음 통제된 포인트 이전                      | 승인될 때까지 금전 규칙은 그대로 유지             |

순서가 중요합니다.

**모든 응용체계의 주키를 새 크리스탈 식별자로 바꾸는 것부터 시작하지 마십시오.** 주문, 거래, 외래키, 응용 코드에 불필요한 위험을 들이는 일입니다.

대신 중앙 식별자를 널 허용 칸이나 별도 연결 항목으로 더하고, 묶음 단위로 채워 넣고, 대응을 검증한 다음, 적절한 새 업무 흐름에서부터 점차 필수로 만드십시오.

운영 배치 전에는 망 분단, 중복 등록 요청, 쓰기와 공표 사이의 데이터베이스 장애, 순서가 뒤바뀐 사건, 반복된 수신 확인, 잘못된 병합, 자격 폐기, 동시 포인트 교환을 모두 시험하십시오.

## 14. 계획 중인 건강관리 앱의 특별 요구

건강관리 앱에는 신뢰 경계가 하나 더 필요합니다.

Crystal Identity가 공통 인증은 제공할 수 있지만, 의료 기록은 자체 권한 관리, 환자 식별자, 접근 감사, 해당 개인정보 통제를 갖춘 **별도의 보호된 건강자료 영역**에 남아 있어야 합니다.

특히 진단, 처방, 병력 같은 기록은 일반 고객 프로필 동기화 사건에 포함되어서는 안 됩니다.

모든 응용체계가 크리스탈에 속한다는 이유만으로 CMS나 전자상점, 앱스토어가 의료 정보에 접근할 수 있게 되어서는 안 됩니다.

## 15. 최종 구조 결정

**신원**

새롭고 영구적인 크리스탈 UUIDv7 신원을 쓴다. 기존 응용 식별자는 대응 기록으로 보존한다. 여러 인증 수단과 확인된 계정 연결을 허용한다.

**자료**

응용별 데이터베이스와 업무 거래는 독립적으로 유지한다. 공통 권위가 필요한 신원과 공유 자료만 중앙화한다.

**동기화**

트랜잭션 아웃박스, 소실되지 않는 재시도, 멱등 소비자, 대조를 쓴다. 통제된 오프라인 운영을 허용하되, 전역 일관성이 즉시 보장되는 것처럼 꾸미지 않는다.

**인증과 보안**

증명서 기반 인증과 이동전화 인증을 공통 신원 공급자로 연합한다. 응용 권한, 동의, 민감자료 경계는 서로 분리해 둔다.

**로열티**

처음에는 제도별 원장을 보존한다. 잔고를 합치기 전에 확인된 연결, 자격 규칙, 부정 점검, 멱등한 이전 기록을 요구한다.

크리스탈에게 근본적인 구분은 이것입니다. **통합 신원, 통합 인증, 통합 고객 프로필, 통합 로열티는 서로 관련되어 있지만 서로 다른 네 가지 공학적 책임입니다.**

이들은 함께 작동하도록 설계되어야 하지만, 하나의 거대한 공유 데이터베이스로 구현되어서는 안 됩니다.

이렇게 하면 기존 체계들의 독립성과 신뢰성, 보안 경계를 지키면서도 고객에게는 하나로 이어진 크리스탈 경험을 줄 수 있습니다.
