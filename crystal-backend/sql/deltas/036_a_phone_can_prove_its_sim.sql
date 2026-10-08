-- 036  A phone can PROVE its SIM, instead of typing its number
--
-- The sign-in page already asks a phone for the SIM's cid beside the user ID
-- and the password, and the server has always RECORDED it and never checked
-- it (services/memberAuth.service.js, "THE cid IS RECORDED AND NEVER
-- CHECKED").  It could not check it: a number typed into a form is a claim,
-- and the only thing a claim proves is that somebody knew the number.
--
-- The customised mobile browser can do better.  It reaches the SIM's MIK
-- certificate and will sign a string with the private key that never leaves
-- the card, so the cid stops being a claim and becomes possession of a key.
-- These two tables are what that needs.
--
-- WHY A TABLE OF DEVICES RATHER THAN A COLUMN ON users.
--
-- ora_pid.users.cid is the vendor's, it belongs to the vendor's own mobile
-- application, and its meaning there is "the one SIM this account is locked
-- to" (ora_pid.users.locked is literally 'allow only registered cid for
-- login').  The browser's cid is a different idea with the same name: it
-- identifies a CARD, not an account, and one card may sign any member in -
-- see the note in the service.  Putting the second idea in the first idea's
-- column would make both unreadable, and would edit a column Crystal does
-- not own.
--
-- WHY THE CHALLENGES ARE A TABLE, which the X.509 desktop login's are not.
--
-- That one keeps its challenges in one process's memory and says so:
-- "Behind a load balancer with more than one API process, the two steps of
-- one sign-in must reach the same process (sticky sessions) or this moves to
-- the database."  This IS that move, done at the start rather than after the
-- second API process is added and sign-ins begin failing for one visitor in
-- two.  The guarantee is the same and it is the important one: a challenge is
-- issued once, used once, and expires - so a signature captured from a log or
-- a shared machine cannot be replayed into a session.
--
-- NO user_pk HERE, deliberately.  A device identity is a card, and the rule
-- this is built to (see the service) is that a valid card may sign in any
-- account whose user ID and password are correct, even one whose stored cid
-- is a different card.  A foreign key to users would state the opposite.
--
-- Idempotent: every object is created only when it is absent.

CREATE TABLE IF NOT EXISTS browser_device_identities (
    id               serial        PRIMARY KEY,

    /*
     * TWELVE, NOT TEN. ora_pid.users.cid and ora_pid.devices.cid are both
     * VARCHAR2(12), and memberAuth.service.js caps what it records at 12 for
     * that reason. A ten digit rule here would refuse cards the rest of the
     * platform accepts.
     */
    cid              varchar(12)   NOT NULL UNIQUE,

    /* The card's MIK certificate, PEM, as it was presented and verified. */
    mik_certificate  text          NOT NULL,
    /* Its public key, pulled out of that certificate - never sent by a client. */
    public_key       text          NOT NULL,

    /*
     * What the certificate said this card is, kept for the audit trail: a
     * certificate is replaced when a card is reissued, and the subject is how
     * somebody reading the table later can tell the two apart.
     */
    subject          varchar(255)  NULL,
    serial_number    varchar(64)   NULL,
    not_after        timestamptz   NULL,

    status           record_status NOT NULL DEFAULT 'ACTIVE',
    is_deleted       boolean       NOT NULL DEFAULT false,

    last_login_at    timestamptz   NULL,
    created_at       timestamptz   NOT NULL DEFAULT now(),
    updated_at       timestamptz   NOT NULL DEFAULT now(),

    /* Digits only, and no wider than the platform's column. */
    CONSTRAINT chk_browser_device_cid CHECK (cid ~ '^[0-9]{1,12}$')
);

COMMENT ON TABLE browser_device_identities IS
  'A SIM card the customised mobile browser can sign with. Identifies a card, never an account - see sql/deltas/036';
COMMENT ON COLUMN browser_device_identities.cid IS 'SIM CID, as ora_pid.users.cid and ora_pid.devices.cid hold it';
COMMENT ON COLUMN browser_device_identities.public_key IS 'PEM, read out of the certificate by the server';

CREATE TABLE IF NOT EXISTS login_challenges (
    id           serial       PRIMARY KEY,

    device_id    integer      NOT NULL
                 REFERENCES browser_device_identities(id) ON DELETE CASCADE,

    /* What the card is asked to sign. Unique, so one can never be reissued. */
    challenge    varchar(64)  NOT NULL UNIQUE,

    expires_at   timestamptz  NOT NULL,
    /* Set the moment it is spent; a second use finds it already stamped. */
    used_at      timestamptz  NULL,

    created_at   timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE login_challenges IS
  'Issued once, used once, expires - the replay guard for MIK sign-in; see sql/deltas/036';

CREATE INDEX IF NOT EXISTS idx_login_challenges_device
    ON login_challenges(device_id);

/*
 * The sweep reads this: everything already spent or out of time. Partial, so
 * it stays the size of the backlog rather than the size of the history.
 */
CREATE INDEX IF NOT EXISTS idx_login_challenges_live
    ON login_challenges(expires_at)
 WHERE used_at IS NULL;

DROP TRIGGER IF EXISTS trg_browser_device_identities_updated ON browser_device_identities;
CREATE TRIGGER trg_browser_device_identities_updated
    BEFORE UPDATE ON browser_device_identities
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
