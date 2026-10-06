-- =====================================================================
-- 042 - crm_party gets an internal party_pk; party_id becomes the public id.
--
--   crm_party.party_pk   bigint, the old number, kept as the internal row key
--   crm_party.party_id   varchar(32), a random 12-character code (or the User
--                        ID of an imported customer) - what URLs, screens and
--                        every other table use
--
-- Every column that points at a customer (*_party_id, 50 of them) turns from
-- the old number into the new code, so all the links stay the same links:
--
--   1. the foreign keys over those columns are written down and dropped
--      (and the two views that read them);
--   2. crm_party.party_id is renamed party_pk, and a new party_id is filled
--      with a code for every customer;
--   3. each *_party_id column becomes varchar holding the old number as text,
--      then is rewritten to the code of the party with that party_pk;
--   4. the foreign keys go back exactly as they were - they still name
--      crm_party(party_id), which is now the code.
--
-- User triggers (updated_at, subtype checks) are off while the rows are
-- rewritten: the customers did not change, only how they are keyed.
-- =====================================================================

CREATE OR REPLACE FUNCTION crm_new_party_id() RETURNS varchar AS $$
DECLARE
    alphabet     constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    random_bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    byte_index   int;
    code         text := '';
BEGIN
    FOREACH byte_index IN ARRAY ARRAY[0, 1, 2, 3, 4, 5, 10, 11, 12, 13, 14, 15] LOOP
        code := code || substr(alphabet, get_byte(random_bytes, byte_index) % length(alphabet) + 1, 1);
    END LOOP;
    RETURN code;
END;
$$ LANGUAGE plpgsql VOLATILE;

/* The columns that point at a customer: every *_party_id of a CRM table but the
   transaction_party row key, and crm_party.party_id itself (renamed below). */
CREATE TEMP TABLE party_column ON COMMIT DROP AS
SELECT table_name::text AS table_name, column_name::text AS column_name
  FROM information_schema.columns
 WHERE table_schema = current_schema() AND table_name LIKE 'crm\_%' AND column_name LIKE '%party_id'
   AND data_type = 'bigint' AND column_name <> 'transaction_party_id'
   AND NOT (table_name = 'crm_party' AND column_name = 'party_id');

/* Every foreign key over one of them, or onto crm_party / crm_person / crm_organization. */
CREATE TEMP TABLE party_constraint ON COMMIT DROP AS
SELECT constraint_row.conrelid::regclass::text AS table_name, constraint_row.conname::text AS constraint_name,
       pg_get_constraintdef(constraint_row.oid) AS definition
  FROM pg_constraint constraint_row
 WHERE constraint_row.contype = 'f' AND constraint_row.connamespace = current_schema()::regnamespace
   AND (constraint_row.confrelid IN ('crm_party'::regclass, 'crm_person'::regclass, 'crm_organization'::regclass)
        OR EXISTS (SELECT 1 FROM pg_attribute attribute JOIN party_column ON party_column.column_name = attribute.attname
                    WHERE attribute.attrelid = constraint_row.conrelid AND attribute.attnum = ANY(constraint_row.conkey)
                      AND party_column.table_name = constraint_row.conrelid::regclass::text));

DROP VIEW IF EXISTS v_crm_current_holding;
DROP VIEW IF EXISTS v_crm_point_account_drift;

DO $$
DECLARE
    dropped record;
BEGIN
    FOR dropped IN SELECT * FROM party_constraint LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', dropped.table_name, dropped.constraint_name);
    END LOOP;
END $$;

ALTER TABLE crm_party DROP CONSTRAINT chk_crm_party_not_self;

/* 2. the old number is the internal key; a code is the id */
ALTER TABLE crm_party RENAME COLUMN party_id TO party_pk;
ALTER TABLE crm_party ADD COLUMN party_id varchar(32);
ALTER TABLE crm_party DISABLE TRIGGER USER;
UPDATE crm_party SET party_id = crm_new_party_id();
ALTER TABLE crm_party ENABLE TRIGGER USER;
ALTER TABLE crm_party ALTER COLUMN party_id SET NOT NULL;
ALTER TABLE crm_party ALTER COLUMN party_id SET DEFAULT crm_new_party_id();
ALTER TABLE crm_party ADD CONSTRAINT crm_party_party_id_key UNIQUE (party_id);
ALTER TABLE crm_party ADD CONSTRAINT crm_party_party_id_check CHECK (party_id ~ '^[A-Za-z0-9_-]{1,32}$');

/* 3. each pointer: the number as text, then the code of that party */
DO $$
DECLARE
    pointer_table record;
    pointer record;
BEGIN
    FOR pointer_table IN SELECT table_name, string_agg(format('ALTER COLUMN %I TYPE varchar(32) USING %I::text', column_name, column_name), ', ') AS changes
                           FROM party_column GROUP BY table_name LOOP
        EXECUTE format('ALTER TABLE %I %s', pointer_table.table_name, pointer_table.changes);
        EXECUTE format('ALTER TABLE %I DISABLE TRIGGER USER', pointer_table.table_name);
    END LOOP;

    FOR pointer IN SELECT table_name, column_name FROM party_column LOOP
        EXECUTE format('UPDATE %I target SET %I = party.party_id FROM crm_party party WHERE party.party_pk::text = target.%I',
                       pointer.table_name, pointer.column_name, pointer.column_name);
    END LOOP;

    FOR pointer_table IN SELECT DISTINCT table_name FROM party_column LOOP
        EXECUTE format('ALTER TABLE %I ENABLE TRIGGER USER', pointer_table.table_name);
    END LOOP;
END $$;

/* Console look-alikes carried the party's number as their incoming record id. */
UPDATE crm_identity_match_candidate candidate
   SET incoming_external_record_id = party.party_id
  FROM crm_party party
 WHERE candidate.incoming_party_id = party.party_id
   AND candidate.incoming_external_record_id = party.party_pk::text;

/* 4. the links back, as they were */
ALTER TABLE crm_party ADD CONSTRAINT chk_crm_party_not_self CHECK (merged_into_party_id IS NULL OR merged_into_party_id <> party_id);

DO $$
DECLARE
    restored record;
BEGIN
    FOR restored IN SELECT * FROM party_constraint LOOP
        EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', restored.table_name, restored.constraint_name, restored.definition);
    END LOOP;
END $$;

COMMENT ON COLUMN crm_party.party_pk IS 'Internal row key. Never shown, never in a URL, never referenced by another table.';
COMMENT ON COLUMN crm_party.party_id IS 'The customer''s id: in URLs, on screens, and in every table that points at a customer. Generated (crm_new_party_id) or imported (the User ID of the customer sheet).';

CREATE VIEW v_crm_point_account_drift AS
SELECT pa.point_account_id, pa.party_id, pa.point_type_id, pa.balance,
       COALESCE(SUM(pe.points_delta), 0) AS ledger_balance
FROM crm_point_account pa
LEFT JOIN crm_point_event pe ON pe.point_account_id = pa.point_account_id
GROUP BY pa.point_account_id
HAVING pa.balance <> COALESCE(SUM(pe.points_delta), 0);

CREATE VIEW v_crm_current_holding AS
SELECT registration.product_instance_id, instance.project_id, instance.external_product_instance_id, instance.instance_kind,
       product.product_id, product.product_name, product.product_class_id,
       registration.party_id, registration.relationship_code, registration.valid_from, registration.product_registration_id
FROM crm_product_registration registration
JOIN crm_product_instance instance ON instance.product_instance_id = registration.product_instance_id
JOIN crm_product_catalog  product ON product.product_id = instance.product_id
WHERE registration.valid_to IS NULL;
