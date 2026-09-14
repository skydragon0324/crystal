-- 022  The database's own errors get translated too
--
-- Five guards in this schema RAISE EXCEPTION, and every one of them reached
-- the user as the English sentence written here.  There was no way to
-- translate them: P0001 is the code PostgreSQL gives every unqualified
-- RAISE, so the handler could tell that a guard had fired but not WHICH one,
-- and the only thing it could do with the message was pass it through.
--
-- Each guard now raises its own SQLSTATE, and carries the values that belong
-- in the sentence as JSON in DETAIL.  The English MESSAGE stays exactly as it
-- was, because it is what a psql session and the server log will show.
--
-- 'CR' is not a class PostgreSQL uses, so nothing here can collide with a
-- code the server itself raises.
--
--   CR001  a covered repair named no warranty
--   CR002  the warranty does not exist
--   CR003  the warranty covers a different device
--   CR004  the warranty has been voided
--   CR005  the device arrived outside the cover

CREATE OR REPLACE FUNCTION check_ticket_warranty() RETURNS trigger AS $$
DECLARE
    w RECORD;
BEGIN
    IF NEW.is_warranty IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    IF NEW.warranty_id IS NULL THEN
        RAISE EXCEPTION 'a covered repair must name the warranty covering it'
            USING ERRCODE = 'CR001';
    END IF;

    SELECT serial_number, start_date, end_date, status
      INTO w
      FROM warranties
     WHERE id = NEW.warranty_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'warranty % does not exist', NEW.warranty_id
            USING ERRCODE = 'CR002',
                  DETAIL  = json_build_object('id', NEW.warranty_id)::text;
    END IF;

    IF w.serial_number <> NEW.serial_number THEN
        RAISE EXCEPTION 'warranty % covers device %, not %',
              NEW.warranty_id, w.serial_number, NEW.serial_number
            USING ERRCODE = 'CR003',
                  DETAIL  = json_build_object(
                              'id', NEW.warranty_id,
                              'covers', w.serial_number,
                              'given', NEW.serial_number
                            )::text;
    END IF;

    IF w.status = 'VOID' THEN
        RAISE EXCEPTION 'warranty % has been voided', NEW.warranty_id
            USING ERRCODE = 'CR004',
                  DETAIL  = json_build_object('id', NEW.warranty_id)::text;
    END IF;

    -- Against the day the device arrived, not against today: a repair that
    -- ran past the expiry date was still taken in under cover.
    IF NEW.received_at::date < w.start_date OR NEW.received_at::date > w.end_date THEN
        RAISE EXCEPTION 'warranty % ran from % to % and the device arrived on %',
              NEW.warranty_id, w.start_date, w.end_date, NEW.received_at::date
            USING ERRCODE = 'CR005',
                  DETAIL  = json_build_object(
                              'id', NEW.warranty_id,
                              'from', w.start_date,
                              'to', w.end_date,
                              'arrived', NEW.received_at::date
                            )::text;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
