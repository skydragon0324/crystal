-- ---------------------------------------------------------------------
-- Delta 012 - opening a feedback thread stops re-ordering the queue.
--
-- The console's queue is sorted by `updated_at DESC`, which is right: the
-- thread somebody wrote in most recently is the one to answer next.
--
-- Marking a thread READ is an UPDATE on that thread, and `set_updated_at`
-- fires on every UPDATE. So opening a thread to read it stamped it as the
-- most recent activity in the queue and jumped it to the top - which meant
-- the list reordered itself under the manager the moment they clicked a row,
-- and working down a page of eleven threads shuffled it eleven times.
--
-- The fix is to say what `updated_at` on this table actually means: the last
-- time somebody WROTE in the thread. Reading it is not writing in it.
--
-- The trigger function is a variant rather than a change to set_updated_at,
-- which forty other tables share and where "any update is activity" is the
-- correct rule.
--
-- sql/schema.sql is the source of truth and already says this; this file
-- brings an existing database up to it, and it is safe to run twice.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at_unless_read() RETURNS trigger AS $$
BEGIN
    /*
     * The comparison is over the WHOLE ROW minus the two columns in question,
     * rather than a list of the ones that matter. A list would have to be
     * revisited every time the table grew a column, and the failure would be
     * silent: a new column changing without touching updated_at.
     */
    IF NEW.is_read IS DISTINCT FROM OLD.is_read
       AND (to_jsonb(NEW) - 'is_read' - 'updated_at')
         = (to_jsonb(OLD) - 'is_read' - 'updated_at')
    THEN
        NEW.updated_at = OLD.updated_at;
        RETURN NEW;
    END IF;

    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_updated_at_unless_read() IS
  'set_updated_at, except that flipping is_read on its own leaves updated_at
   alone - reading a thread is not activity on it, and the queue is ordered by
   activity';

DROP TRIGGER IF EXISTS trg_feedback_threads_updated ON feedback_threads;

CREATE TRIGGER trg_feedback_threads_updated
    BEFORE UPDATE ON feedback_threads
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at_unless_read();
