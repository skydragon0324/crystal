-- app_updates
CREATE TABLE app_updates (
  table_pk NUMBER PRIMARY KEY,
  type NUMBER(1) NOT NULL,
  version_code NUMBER(3) NOT NULL,
  last_time DATE,
  db_file_time DATE,
  status NUMBER(1) NOT NULL,
  file_url VARCHAR2(255),
  note VARCHAR2(255),
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON COLUMN "APP_UPDATES"."TYPE" IS 'update type (0: none - no need to update, 1: patch for same version, 2: apk update, 3: patch test)';
COMMENT ON COLUMN "APP_UPDATES"."VERSION_CODE" IS 'release apk version code';
COMMENT ON COLUMN "APP_UPDATES"."LAST_TIME" IS 'last update time';
COMMENT ON COLUMN "APP_UPDATES"."DB_FILE_TIME" IS 'last db file update time';
COMMENT ON COLUMN "APP_UPDATES"."STATUS" IS '0: inactive, 1: active';
COMMENT ON COLUMN "APP_UPDATES"."NOTE" IS 'message shown on update confirm dialog';

-- testers
CREATE SEQUENCE "TESTERS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE testers (
  tester_pk NUMBER PRIMARY KEY,
  tester_name VARCHAR2(64) NOT NULL,
  phone_imei VARCHAR2(20) UNIQUE NOT NULL,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON COLUMN "TESTERS"."TESTER_NAME" IS 'tester name';
COMMENT ON COLUMN "TESTERS"."PHONE_IMEI" IS 'IMEI of the device';

CREATE OR REPLACE TRIGGER tester_pk_trigger
BEFORE INSERT ON testers
FOR EACH ROW
BEGIN
  IF :NEW.tester_pk IS NULL THEN
    SELECT "TESTERS_S".NEXTVAL
    INTO :NEW.tester_pk
    FROM dual;
  END IF;
END;
/