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

