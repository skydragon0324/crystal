-- ---------------------------------------------------------------------
-- Delta 007 - feedback becomes a CONVERSATION.
--
-- It was one row: a title, a body, one reply, and a status. That shape can
-- hold exactly one exchange, so a member who needed to add a detail had to
-- open a second enquiry, and a manager who needed to ask a question had
-- nowhere to put it.
--
-- The replacement is the shape the business already had on Oracle: a THREAD
-- that carries the subject and the state, and a chain of MESSAGES underneath
-- it. Both sides post into the same chain, which is what makes it read like a
-- conversation rather than a form and a footnote.
--
-- The old rows are carried across, not dropped: an enquiry becomes a thread,
-- its body becomes the first message, and its reply - where there was one -
-- becomes the second.
--
-- sql/schema.sql is the source of truth and already says all of this; this
-- file brings an existing database up to it, and it is safe to run twice.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS feedback_threads (
    id            serial        PRIMARY KEY,
    user_id       integer       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         varchar(512)  NOT NULL,
    category      varchar(40)   NOT NULL DEFAULT 'GENERAL',

    /*
     * WHERE THE ENQUIRY CAME FROM, which is not the same as what it is about.
     *
     * The same question reaches support from the smartphone site, the eproduct
     * site, the Eshop, the Appstore, a registration flow or the Crystal app -
     * and they are answered by different teams. Routing needs the origin.
     */
    thread_source varchar(30)   NOT NULL DEFAULT 'SMARTPHONE',

    /*
     * PENDING   the member has written and nobody has answered
     * REPLIED   a manager has answered and it is back with the member
     * RESOLVED  either side says the problem is fixed
     * FINISHED  nobody resolved it and it aged out - see the housekeeping job
     */
    status        varchar(20)   NOT NULL DEFAULT 'PENDING'
                                CHECK (status IN ('PENDING','REPLIED','RESOLVED','FINISHED')),

    /*
     * The last message and who wrote it, denormalised onto the thread.
     *
     * A list of threads shows a preview of each, and reading it from the
     * message chain means a correlated subquery per row. This is written on
     * every post, in the same transaction, so it cannot drift.
     */
    last_message  varchar(4000) NULL,
    last_type     varchar(10)   NULL CHECK (last_type IN ('MEMBER','MANAGER')),

    -- Whether the side that did NOT write last has seen it.
    is_read       boolean       NOT NULL DEFAULT false,

    -- The manager who picked it up, so a thread has an owner rather than
    -- being answered by whoever happens to be looking.
    session_by    integer       NULL REFERENCES admins(id) ON DELETE SET NULL,

    is_deleted    boolean       NOT NULL DEFAULT false,
    created_at    timestamptz   NOT NULL DEFAULT now(),
    updated_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_threads_user
    ON feedback_threads(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_threads_state
    ON feedback_threads(status, thread_source, updated_at DESC);

DO $$
BEGIN
    CREATE TRIGGER trg_feedback_threads_updated
        BEFORE UPDATE ON feedback_threads
        FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


CREATE TABLE IF NOT EXISTS feedback_messages (
    id          serial        PRIMARY KEY,
    thread_id   integer       NOT NULL REFERENCES feedback_threads(id) ON DELETE CASCADE,
    message     text          NOT NULL,

    /*
     * WHO WROTE IT, and what `action_by` therefore points at.
     *
     * MEMBER  -> action_by is a users.id
     * MANAGER -> action_by is an managers.id
     *
     * No foreign key, deliberately: one column cannot point at two tables, and
     * the alternative - two nullable columns - makes every read a two-way
     * COALESCE for a value that is never ambiguous once action_type is known.
     */
    action_type varchar(10)   NOT NULL CHECK (action_type IN ('MEMBER','MANAGER')),
    action_by   integer       NOT NULL,
    action_at   timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_messages_thread
    ON feedback_messages(thread_id, action_at);


-- =====================================================================
-- Carry the old enquiries across.
--
-- Guarded on the old table still existing AND on the new one being empty, so
-- a second run moves nothing and a database built from schema.sql skips it.
-- =====================================================================

DO $$
DECLARE
    has_old boolean;
    has_new_rows boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_name = 'feedback' AND table_schema = current_schema()
    ) INTO has_old;

    SELECT EXISTS (SELECT 1 FROM feedback_threads) INTO has_new_rows;

    IF has_old AND NOT has_new_rows THEN
        INSERT INTO feedback_threads
            (id, user_id, title, category, thread_source, status,
             last_message, last_type, is_read, session_by, is_deleted,
             created_at, updated_at)
        SELECT
            f.id, f.user_id, f.title, f.category,
            'SMARTPHONE',
            CASE f.status
                WHEN 'ANSWERED' THEN 'REPLIED'
                WHEN 'CLOSED'   THEN 'RESOLVED'
                ELSE 'PENDING'
            END,
            COALESCE(f.reply, f.content),
            CASE WHEN f.reply IS NULL THEN 'MEMBER' ELSE 'MANAGER' END,
            f.reply IS NOT NULL,
            f.replied_by,
            f.is_deleted,
            f.created_at, f.updated_at
        FROM feedback f;

        -- The enquiry itself is the first message.
        INSERT INTO feedback_messages (thread_id, message, action_type, action_by, action_at)
        SELECT f.id, f.content, 'MEMBER', f.user_id, f.created_at
        FROM feedback f;

        -- And the reply, where there was one, is the second.
        INSERT INTO feedback_messages (thread_id, message, action_type, action_by, action_at)
        SELECT f.id, f.reply, 'MANAGER', COALESCE(f.replied_by, 1),
               COALESCE(f.replied_at, f.updated_at)
        FROM feedback f
        WHERE f.reply IS NOT NULL;

        PERFORM setval(
            pg_get_serial_sequence('feedback_threads', 'id'),
            GREATEST((SELECT COALESCE(MAX(id), 1) FROM feedback_threads), 1)
        );
    END IF;
END $$;

DROP TABLE IF EXISTS feedback CASCADE;
