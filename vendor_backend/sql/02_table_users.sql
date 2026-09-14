-- Address (locations)
CREATE TABLE locations (
  location_pk NUMBER PRIMARY KEY,
  location_name VARCHAR2(100) NOT NULL,
  location_code VARCHAR2(8) NOT NULL,
  parent_code VARCHAR2(8),
  position NUMBER(4) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON COLUMN "LOCATIONS"."LOCATION_NAME" IS 'Location Name';
COMMENT ON COLUMN "LOCATIONS"."PARENT_CODE" IS 'Parent(locations.location_code), If 0 or NULL, its province';
COMMENT ON COLUMN "LOCATIONS"."LOCATION_CODE" IS 'location code reverse direction of location_pk';


-- User
CREATE SEQUENCE "USERS_S" MINVALUE 10000000 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 10000000 CACHE 20;

CREATE TABLE users (
  user_pk NUMBER PRIMARY KEY,
  user_id VARCHAR2(50) UNIQUE NOT NULL,
  password VARCHAR2(255) NOT NULL,
  user_name VARCHAR2(50) NOT NULL,
  user_alias VARCHAR2(50),
  user_avatar VARCHAR2(255),
  gender CHAR(1),
  birthday DATE,
  job NUMBER(2),
  location_pk NUMBER,
  id_card VARCHAR2(50),
  cid VARCHAR2(12) UNIQUE,
  status NUMBER(1) DEFAULT 1,
  locked NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_location_fk FOREIGN KEY (location_pk) REFERENCES locations(location_pk),
  CONSTRAINT ck_user_gender CHECK (gender IN ('M', 'F'))
);

COMMENT ON COLUMN "USERS"."GENDER" IS 'Gender (M, F)';
COMMENT ON COLUMN "USERS"."LOCATION_PK" IS 'Address Location';
COMMENT ON COLUMN "USERS"."ID_CARD" IS 'Citizen No';
COMMENT ON COLUMN "USERS"."CID" IS 'CID';
COMMENT ON COLUMN "USERS"."STATUS" IS 'user status (0: inactive, 1: active)';
COMMENT ON COLUMN "USERS"."LOCKED" IS 'allow only registered cid for login';

CREATE OR REPLACE TRIGGER user_pk_trigger
BEFORE INSERT ON users
FOR EACH ROW
BEGIN
  IF :NEW.user_pk IS NULL THEN
    SELECT "USERS_S".NEXTVAL
    INTO :NEW.user_pk
    FROM dual;
  END IF;
END;
/

CREATE INDEX idx_users_cid ON users (cid);

-- User Phones (User can directly input his phone number or we can reference phone number sent with feedbacks)
CREATE SEQUENCE "USER_PHONE_NUMBERS_S" MINVALUE 10000000 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 10000000 CACHE 20;

CREATE TABLE user_phone_numbers (
  phone_pk NUMBER PRIMARY KEY,
  user_pk NUMBER NOT NULL,
  phone_number VARCHAR2(20) NOT NULL,
  phone_type NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_phone_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  CONSTRAINT uq_user_phone_type UNIQUE (user_pk, phone_type, phone_number)
);

COMMENT ON COLUMN "USER_PHONE_NUMBERS"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "USER_PHONE_NUMBERS"."PHONE_NUMBER" IS 'phone number';
COMMENT ON COLUMN "USER_PHONE_NUMBERS"."PHONE_TYPE" IS '0: User input, 1: By report, 2: by feedback, 3: by manager, 4: eprod register';

CREATE OR REPLACE TRIGGER user_phone_pk_trigger
BEFORE INSERT ON user_phone_numbers
FOR EACH ROW
BEGIN
  IF :NEW.phone_pk IS NULL THEN
    SELECT "USER_PHONE_NUMBERS_S".NEXTVAL
    INTO :NEW.phone_pk
    FROM dual;
  END IF;
END;
/

-- user verify codes and status
CREATE SEQUENCE "USER_VERIFY_CODES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE user_verify_codes (
  table_pk NUMBER PRIMARY KEY,
  user_pk NUMBER NOT NULL,
  cid VARCHAR2(12),
  status NUMBER(1) DEFAULT 0,
  verify_code NUMBER(6) NOT NULL,
  expire_at DATE NOT NULL,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_verify_code_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk)
);

COMMENT ON COLUMN "USER_VERIFY_CODES"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "USER_VERIFY_CODES"."CID" IS 'CID or mirae SIM';
COMMENT ON COLUMN "USER_VERIFY_CODES"."STATUS" IS 'verify status (0: none, 1: verified)';
COMMENT ON COLUMN "USER_VERIFY_CODES"."VERIFY_CODE" IS 'verify code (100000 ~ 999999)';
COMMENT ON COLUMN "USER_VERIFY_CODES"."EXPIRE_AT" IS 'expire_at (duration 5 mins)';

CREATE OR REPLACE TRIGGER user_verify_code_pk_trigger
BEFORE INSERT ON user_verify_codes
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "USER_VERIFY_CODES_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- user merge ids
CREATE TABLE user_merge_ids (
  pvendor_pk NUMBER PRIMARY KEY,
  pvendor_id VARCHAR2(50) UNIQUE NOT NULL,
  fixed_pk NUMBER,
  fixed_id VARCHAR2(50),
  fixed_status NUMBER(1) DEFAULT 0,
  appstore_pk VARCHAR2(36),
  appstore_id VARCHAR2(50),
  eshop_pk NUMBER,
  eshop_id VARCHAR2(50),
  mass_pk VARCHAR2(36),
  mass_id VARCHAR2(50),
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_id_user_pk FOREIGN KEY (pvendor_pk) REFERENCES users(user_pk)
);

-- merge log
CREATE SEQUENCE "USER_MERGE_LOG_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE user_merge_log (
  table_pk NUMBER PRIMARY KEY,
  pvendor_pk NUMBER NOT NULL,
  pvendor_id VARCHAR2(50) NOT NULL,
  id_type NUMBER(1) NOT NULL,
  merge_id VARCHAR2(50),
  merge_type NUMBER(1) DEFAULT 0 NOT NULL,
  action_at DATE DEFAULT CURRENT_TIMESTAMP,
  action_type NUMBER(1) DEFAULT 0 NOT NULL,
  action_by NUMBER NOT NULL,
  CONSTRAINT fk_merge_log_prhn_pk FOREIGN KEY (pvendor_pk) REFERENCES users(user_pk)
);

CREATE OR REPLACE TRIGGER user_merge_log_pk_trigger
BEFORE INSERT ON user_merge_log
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "USER_MERGE_LOG_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- special data (for 923)
CREATE TABLE special_923 (
  table_pk NUMBER PRIMARY KEY,
  user_name VARCHAR2(50) NOT NULL,
  gender CHAR(1),
  birth_year NUMBER(4)
);

-- user edit log
CREATE SEQUENCE "USER_EDIT_LOG_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE user_edit_log (
  table_pk NUMBER PRIMARY KEY,
  user_pk NUMBER NOT NULL,
  property_type NUMBER(1) NOT NULL,
  old_value VARCHAR2(50),
  new_value VARCHAR2(50),
  action_at DATE DEFAULT CURRENT_TIMESTAMP,
  action_type NUMBER(1) DEFAULT 0 NOT NULL,
  action_by NUMBER NOT NULL,
  CONSTRAINT fk_user_edit_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk)
);

COMMENT ON COLUMN "USER_EDIT_LOG"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "USER_EDIT_LOG"."PROPERTY_TYPE" IS '0: user_name, 1: birthday, 2: id_card, 3: cid, 4: job, 5: location, 6: gender';
COMMENT ON COLUMN "USER_EDIT_LOG"."OLD_VALUE" IS 'property type old value';
COMMENT ON COLUMN "USER_EDIT_LOG"."NEW_VALUE" IS 'property type new value';
COMMENT ON COLUMN "USER_EDIT_LOG"."ACTION_TYPE" IS '0: by user, 1: by manager';
COMMENT ON COLUMN "USER_EDIT_LOG"."ACTION_BY" IS 'users.user_pk or managers.manager_pk';

CREATE OR REPLACE TRIGGER user_edit_log_pk_trigger
BEFORE INSERT ON user_edit_log
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "USER_EDIT_LOG_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- user change password log (its neccessary because pvendor_id and prhn_pwd is also used for eshop, appstore, os_4)
CREATE SEQUENCE "USER_PASSWORD_LOG_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE user_password_log (
  table_pk NUMBER PRIMARY KEY,
  user_pk NUMBER NOT NULL,
  user_id VARCHAR2(50) NOT NULL,
  password VARCHAR2(255) NOT NULL,
  app_type NUMBER(1) NOT NULL,
  status NUMBER(1) NOT NULL,
  action_type NUMBER(1) DEFAULT 0 NOT NULL,
  action_by NUMBER NOT NULL,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_pwd_log_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk)
);

COMMENT ON COLUMN "USER_PASSWORD_LOG"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "USER_PASSWORD_LOG"."USER_ID" IS 'users.user_id';
COMMENT ON COLUMN "USER_PASSWORD_LOG"."PASSWORD" IS 'users.password';
COMMENT ON COLUMN "USER_PASSWORD_LOG"."APP_TYPE" IS '1: appstore, 2: eshop, 3: mass (os_4)';
COMMENT ON COLUMN "USER_PASSWORD_LOG"."STATUS" IS '0: pending, 1: success, 2: ignored';
COMMENT ON COLUMN "USER_PASSWORD_LOG"."ACTION_TYPE" IS '0: by user, 1: by manager';
COMMENT ON COLUMN "USER_PASSWORD_LOG"."ACTION_BY" IS 'users.user_pk or managers.manager_pk';

CREATE OR REPLACE TRIGGER user_password_log_pk_trigger
BEFORE INSERT ON user_password_log
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "USER_PASSWORD_LOG_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- user register log (user should be registered for eshop, appstore, os_4)
CREATE SEQUENCE "USER_REGISTER_LOG_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE user_register_log (
  table_pk NUMBER PRIMARY KEY,
  user_pk NUMBER NOT NULL,
  cid VARCHAR2(12),
  iccid VARCHAR2(64),
  app_type NUMBER(1) NOT NULL,
  status NUMBER(1) NOT NULL,
  action_type NUMBER(1) DEFAULT 0 NOT NULL,
  action_by NUMBER NOT NULL,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_reg_log_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk)
);

COMMENT ON COLUMN "USER_REGISTER_LOG"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "USER_REGISTER_LOG"."CID" IS 'cid';
COMMENT ON COLUMN "USER_REGISTER_LOG"."ICCID" IS 'iccid';
COMMENT ON COLUMN "USER_REGISTER_LOG"."APP_TYPE" IS '1: appstore, 2: eshop, 3: mass (os_4)';
COMMENT ON COLUMN "USER_REGISTER_LOG"."STATUS" IS '0: pending, 1: success, 2: ignored';
COMMENT ON COLUMN "USER_REGISTER_LOG"."ACTION_TYPE" IS '0: by user, 1: by manager';
COMMENT ON COLUMN "USER_REGISTER_LOG"."ACTION_BY" IS 'users.user_pk or managers.manager_pk';

CREATE OR REPLACE TRIGGER user_register_log_pk_trigger
BEFORE INSERT ON user_register_log
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "USER_REGISTER_LOG_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- user fixed log (merge fixed id fail log)
CREATE SEQUENCE "USER_FIXED_LOG_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE user_fixed_log (
  table_pk NUMBER PRIMARY KEY,
  user_pk NUMBER NOT NULL,
  user_id VARCHAR2(50) NOT NULL,
  fixed_id VARCHAR2(50) NOT NULL,
  func_type NUMBER(1) NOT NULL,
  status NUMBER(1) NOT NULL,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_fixed_log_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk)
);

COMMENT ON COLUMN "USER_FIXED_LOG"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "USER_FIXED_LOG"."USER_ID" IS 'previous users.user_id, for mobile, should be updated to fixed_id';
COMMENT ON COLUMN "USER_FIXED_LOG"."FIXED_ID" IS 'customers.user_userid';
COMMENT ON COLUMN "USER_FIXED_LOG"."FUNC_TYPE" IS '1: appstore, 2: eprod soft point, 3: eprod reg point';
COMMENT ON COLUMN "USER_FIXED_LOG"."STATUS" IS '0: pending, 1: success, 2: ignored';

CREATE OR REPLACE TRIGGER user_fixed_log_pk_trigger
BEFORE INSERT ON user_fixed_log
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "USER_FIXED_LOG_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- user login log
CREATE SEQUENCE "USER_LOGIN_LOG_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE user_login_log (
  table_pk NUMBER PRIMARY KEY,
  user_pk NUMBER NOT NULL,
  cid VARCHAR2(12),
  phone_brand VARCHAR2(100) NOT NULL,
  phone_model VARCHAR2(100) NOT NULL,
  phone_imei VARCHAR2(20) NOT NULL,
  action_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_login_log_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk)
);

COMMENT ON COLUMN "USER_LOGIN_LOG"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "USER_LOGIN_LOG"."CID" IS 'cid';
COMMENT ON COLUMN "USER_LOGIN_LOG"."CID" IS 'SIM CID';
COMMENT ON COLUMN "USER_LOGIN_LOG"."PHONE_BRAND" IS 'phone brand';
COMMENT ON COLUMN "USER_LOGIN_LOG"."PHONE_MODEL" IS 'phone model';
COMMENT ON COLUMN "USER_LOGIN_LOG"."PHONE_IMEI" IS 'phone imei';

CREATE OR REPLACE TRIGGER user_login_log_pk_trigger
BEFORE INSERT ON user_login_log
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "USER_LOGIN_LOG_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- user block log
CREATE SEQUENCE "USER_BLOCK_LOG_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE user_block_log (
  table_pk NUMBER PRIMARY KEY,
  user_pk NUMBER NOT NULL,
  reason VARCHAR2(255) NOT NULL,
  status NUMBER(1) DEFAULT 0 NOT NULL,
  action_by NUMBER NOT NULL,
  action_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_block_log_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_user_block_log_action_by FOREIGN KEY (action_by) REFERENCES managers(manager_pk)
);

COMMENT ON COLUMN "USER_BLOCK_LOG"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "USER_BLOCK_LOG"."REASON" IS 'block reason';
COMMENT ON COLUMN "USER_BLOCK_LOG"."STATUS" IS '0: active, 1: blocked';
COMMENT ON COLUMN "USER_BLOCK_LOG"."ACTION_BY" IS 'managers.manager_pk';

CREATE OR REPLACE TRIGGER user_block_log_pk_trigger
BEFORE INSERT ON user_block_log
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "USER_BLOCK_LOG_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- user white list
CREATE SEQUENCE "USER_WHITE_LIST_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE user_white_list (
  table_pk NUMBER PRIMARY KEY,
  user_name VARCHAR2(50) NOT NULL,
  cid VARCHAR2(12) UNIQUE NOT NULL,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON COLUMN "USER_WHITE_LIST"."USER_NAME" IS 'user name';
COMMENT ON COLUMN "USER_WHITE_LIST"."CID" IS 'CID';

CREATE OR REPLACE TRIGGER user_white_list_pk_trigger
BEFORE INSERT ON user_white_list
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "USER_WHITE_LIST_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- user cid lock list
CREATE SEQUENCE "USER_CID_LOCK_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE user_cid_lock (
  table_pk NUMBER PRIMARY KEY,
  user_pk NUMBER NOT NULL,
  cid VARCHAR2(12) NOT NULL,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_cid_lock_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  CONSTRAINT uq_user_cid_lock UNIQUE (user_pk, cid)
);

COMMENT ON COLUMN "USER_CID_LOCK"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "USER_CID_LOCK"."CID" IS 'CID to be allowed';

CREATE OR REPLACE TRIGGER user_cid_lock_pk_trigger
BEFORE INSERT ON user_cid_lock
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "USER_CID_LOCK_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- export locations
SELECT location_pk, location_name, location_code, parent_code, TO_CHAR(updated_at, 'YYYY-MM-DD HH24:MI:SS') updated_at 
FROM locations
order by updated_at desc
