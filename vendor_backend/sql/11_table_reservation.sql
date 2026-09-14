-- prefix
CREATE SEQUENCE "RESERVE_PREFIX_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE reserve_prefix (
  prefix_pk NUMBER PRIMARY KEY,
  prefix_str VARCHAR2(6) NOT NULL,
  suffix_str VARCHAR2(4),
  start_no NUMBER(4) DEFAULT 0 NOT NULL,
  end_no NUMBER(4) DEFAULT 0 NOT NULL,
  reserve_source NUMBER(2) DEFAULT 0 NOT NULL,
  product_name VARCHAR2(128) NOT NULL,
  description VARCHAR2(4000),
  publish_num VARCHAR2(24),
  normal_cnt NUMBER(4) DEFAULT 0,
  reward_cnt NUMBER(2) DEFAULT 0,
  start_date DATE,
  end_date DATE,
  disp_date DATE,
  note VARCHAR2(4000),
  summary VARCHAR2(64),
  agency_ids VARCHAR2(255),
  phone_pk NUMBER,
  mars_str VARCHAR2(64),
  is_minus NUMBER(1) DEFAULT 1,
  is_private NUMBER(1) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  created_by NUMBER NOT NULL,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_by NUMBER,
  CONSTRAINT fk_reserve_prefix_phone_pk FOREIGN KEY (phone_pk) REFERENCES products(product_pk),
  CONSTRAINT chk_reserve_no_interval CHECK (end_no >= start_no),
  CONSTRAINT chk_reserve_prefix_period CHECK (end_date >= start_date)
);

COMMENT ON COLUMN "RESERVE_PREFIX"."PREFIX_STR" IS 'prefix string';
COMMENT ON COLUMN "RESERVE_PREFIX"."SUFFIX_STR" IS 'suffix string';
COMMENT ON COLUMN "RESERVE_PREFIX"."START_NO" IS 'reservation start no';
COMMENT ON COLUMN "RESERVE_PREFIX"."END_NO" IS 'reservation end no';
COMMENT ON COLUMN "RESERVE_PREFIX"."RESERVE_SOURCE" IS 'reserve source (0: eshop, 1: soft, 2: eprod register, 3: bonus, 4: credit, 5: lottery, 6: phone register, 7: agency soft appstore, 8: agency soft eprod, 9: agency sale eprod, 10: agency as eprod, 11: agency as phone)';
COMMENT ON COLUMN "RESERVE_PREFIX"."PRODUCT_NAME" IS 'product name to reserve';
COMMENT ON COLUMN "RESERVE_PREFIX"."DESCRIPTION" IS 'description';
COMMENT ON COLUMN "RESERVE_PREFIX"."PUBLISH_NUM" IS 'publish approve number';
COMMENT ON COLUMN "RESERVE_PREFIX"."NORMAL_CNT" IS 'normal reserve count';
COMMENT ON COLUMN "RESERVE_PREFIX"."REWARD_CNT" IS 'reward reserve count';
COMMENT ON COLUMN "RESERVE_PREFIX"."START_DATE" IS 'start date of reservation';
COMMENT ON COLUMN "RESERVE_PREFIX"."END_DATE" IS 'end date of reservation';
COMMENT ON COLUMN "RESERVE_PREFIX"."DISP_DATE" IS 'display date of reservation';
COMMENT ON COLUMN "RESERVE_PREFIX"."NOTE" IS 'comment';
COMMENT ON COLUMN "RESERVE_PREFIX"."SUMMARY" IS 'short summary';
COMMENT ON COLUMN "RESERVE_PREFIX"."AGENCY_IDS" IS 'comma separated phone_sale_agencies.agency_id';
COMMENT ON COLUMN "RESERVE_PREFIX"."PHONE_PK" IS 'when reserve source is 6, products.product_pk';
COMMENT ON COLUMN "RESERVE_PREFIX"."MARS_STR" IS 'when reserve source is 0, matched string with mars';
COMMENT ON COLUMN "RESERVE_PREFIX"."IS_MINUS" IS '0: dont apply minus point (lottery), 1: apply minus points';
COMMENT ON COLUMN "RESERVE_PREFIX"."IS_PRIVATE" IS '0: public, 1: private';

CREATE OR REPLACE TRIGGER reserve_prefix_pk_trigger
BEFORE INSERT ON reserve_prefix
FOR EACH ROW
BEGIN
  IF :NEW.prefix_pk IS NULL THEN
    SELECT "RESERVE_PREFIX_S".NEXTVAL
    INTO :NEW.prefix_pk
    FROM dual;
  END IF;
END;
/

-- reserve users
CREATE SEQUENCE "RESERVE_USERS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE reserve_users (
  table_pk NUMBER PRIMARY KEY,
  prefix_pk NUMBER NOT NULL,
  user_pk NUMBER NOT NULL,
  reserve_cnt NUMBER(2) DEFAULT 0,
  reserve_type NUMBER(1) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  created_by NUMBER NOT NULL,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_by NUMBER,
  CONSTRAINT fk_reserve_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  CONSTRAINT uq_reserve_user_prefix_user UNIQUE (prefix_pk, user_pk)
);

COMMENT ON COLUMN "RESERVE_USERS"."PREFIX_PK" IS 'reserve_prefix.prefix_pk';
COMMENT ON COLUMN "RESERVE_USERS"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "RESERVE_USERS"."RESERVE_CNT" IS 'reserve avaliable count';
COMMENT ON COLUMN "RESERVE_USERS"."RESERVE_TYPE" IS '0: normal, 1: reward';
COMMENT ON COLUMN "RESERVE_USERS"."IS_DELETED" IS 'soft delete flag';

CREATE OR REPLACE TRIGGER reserve_users_pk_trigger
BEFORE INSERT ON reserve_users
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "RESERVE_USERS_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- reserve log
CREATE SEQUENCE "RESERVE_LOG_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE reserve_log (
  table_pk NUMBER PRIMARY KEY,
  prefix_pk NUMBER NOT NULL,
  user_pk NUMBER NOT NULL,
  reserve_name VARCHAR2(50),
  id_card VARCHAR2(50),
  phone_number VARCHAR2(12),
  reserve_no NUMBER(4),
  reserve_type NUMBER(1) DEFAULT 0,
  status NUMBER(1) DEFAULT 0,
  agency_id NUMBER,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reserve_log_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_reserve_log_agency_id FOREIGN KEY (agency_id) REFERENCES phone_sale_agencies(agency_id),
  CONSTRAINT uq_reserve_log_prefix_no UNIQUE (prefix_pk, reserve_no)
);

COMMENT ON COLUMN "RESERVE_LOG"."PREFIX_PK" IS 'reserve_prefix.prefix_pk';
COMMENT ON COLUMN "RESERVE_LOG"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "RESERVE_LOG"."RESERVE_NAME" IS 'reserved user name';
COMMENT ON COLUMN "RESERVE_LOG"."ID_CARD" IS 'reserved id card';
COMMENT ON COLUMN "RESERVE_LOG"."PHONE_NUMBER" IS 'reserved phone number';
COMMENT ON COLUMN "RESERVE_LOG"."RESERVE_NO" IS 'auto-generated reserve number (0 - 9999)';
COMMENT ON COLUMN "RESERVE_LOG"."RESERVE_TYPE" IS '0: normal, 1: reward';
COMMENT ON COLUMN "RESERVE_LOG"."STATUS" IS '0: pending, 1: reserved, 2: paid, 3: saled, 4: eshop error';
COMMENT ON COLUMN "RESERVE_LOG"."AGENCY_ID" IS 'phone_sale_agencies.agency_id';

CREATE OR REPLACE TRIGGER reserve_log_pk_trigger
BEFORE INSERT ON reserve_log
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "RESERVE_LOG_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- reserve sms log
CREATE SEQUENCE "RESERVE_SMS_LOG_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE reserve_sms_log (
  table_pk NUMBER PRIMARY KEY,
  product_pk NUMBER NOT NULL,
  phone_imei VARCHAR2(15) NOT NULL UNIQUE,
  reserve_name VARCHAR2(50),
  id_card VARCHAR2(50),
  phone_number VARCHAR2(12),
  province_name VARCHAR2(48),
  agency_id NUMBER,
  product_name VARCHAR2(128) NOT NULL,
  status NUMBER(1) DEFAULT 0,
  reserve_code VARCHAR2(17) UNIQUE,
  user_pk NUMBER,
  created_at DATE,
  CONSTRAINT fk_reserve_sms_product_pk FOREIGN KEY (product_pk) REFERENCES products(product_pk),
  CONSTRAINT fk_reserve_sms_agency_id FOREIGN KEY (agency_id) REFERENCES phone_sale_agencies(agency_id),
  CONSTRAINT fk_reserve_sms_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk)
);

COMMENT ON COLUMN "RESERVE_SMS_LOG"."PRODUCT_PK" IS 'products.product_pk';
COMMENT ON COLUMN "RESERVE_SMS_LOG"."PHONE_IMEI" IS 'phone imei';
COMMENT ON COLUMN "RESERVE_SMS_LOG"."RESERVE_NAME" IS 'reserve name';
COMMENT ON COLUMN "RESERVE_SMS_LOG"."ID_CARD" IS 'id card';
COMMENT ON COLUMN "RESERVE_SMS_LOG"."PHONE_NUMBER" IS 'phone number';
COMMENT ON COLUMN "RESERVE_SMS_LOG"."PROVINCE_NAME" IS 'province name';
COMMENT ON COLUMN "RESERVE_SMS_LOG"."AGENCY_ID" IS 'phone_sale_agencies.agency_id';
COMMENT ON COLUMN "RESERVE_SMS_LOG"."PRODUCT_NAME" IS 'reserve phone name';
COMMENT ON COLUMN "RESERVE_SMS_LOG"."STATUS" IS '0: sms accept, 1: reserve pending, 2: sale finish';
COMMENT ON COLUMN "RESERVE_SMS_LOG"."RESERVE_CODE" IS 'reservation code';
COMMENT ON COLUMN "RESERVE_SMS_LOG"."USER_PK" IS 'users.user_pk';

CREATE OR REPLACE TRIGGER reserve_sms_log_pk_trigger
BEFORE INSERT ON reserve_sms_log
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "RESERVE_SMS_LOG_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- reward log
CREATE SEQUENCE "REWARD_LOG_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE reward_log (
  table_pk NUMBER PRIMARY KEY,
  prefix_pk NUMBER NOT NULL,
  user_pk NUMBER NOT NULL,
  money_value NUMBER(10),
  order_number NUMBER NOT NULL,
  qr_path VARCHAR2(255),
  request_at DATE DEFAULT CURRENT_TIMESTAMP,
  confirm_at DATE
);

COMMENT ON COLUMN "REWARD_LOG"."PREFIX_PK" IS 'reserve_prefix.prefix_pk';
COMMENT ON COLUMN "REWARD_LOG"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "REWARD_LOG"."MONEY_VALUE" IS 'reward money value used for reservation';
COMMENT ON COLUMN "REWARD_LOG"."ORDER_NUMBER" IS 'order number from wallet server';
COMMENT ON COLUMN "REWARD_LOG"."QR_PATH" IS 'url of generated QR';
COMMENT ON COLUMN "REWARD_LOG"."REQUEST_AT" IS 'request pay at';
COMMENT ON COLUMN "REWARD_LOG"."CONFIRM_AT" IS 'confirm pay at';

CREATE OR REPLACE TRIGGER reward_log_pk_trigger
BEFORE INSERT ON reward_log
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "REWARD_LOG_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/
