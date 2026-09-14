-- premium services
CREATE SEQUENCE "PREMIUM_SERVICES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 100000 NOCACHE;

CREATE TABLE premium_services (
  service_pk NUMBER PRIMARY KEY,
  service_name VARCHAR2(255) NOT NULL,
  service_description VARCHAR2(4000),
  publish_num VARCHAR2(24),
  lottery_start_date DATE,
  lottery_end_date DATE,
  follow_start_date DATE,
  follow_end_date DATE,
  service_disp_date DATE,
  service_type NUMBER(1) DEFAULT 0,
  image_url VARCHAR2(255),
  image_ratio NUMBER(7, 4) DEFAULT 0,
  image_status NUMBER(1) DEFAULT 0,
  service_note VARCHAR2(4000),
  goods_description VARCHAR2(4000),
  is_deleted NUMBER(1) DEFAULT 0,
  is_test NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON COLUMN "PREMIUM_SERVICES"."SERVICE_NAME" IS 'premium service name';
COMMENT ON COLUMN "PREMIUM_SERVICES"."SERVICE_DESCRIPTION" IS 'premium service description to be shown for user';
COMMENT ON COLUMN "PREMIUM_SERVICES"."PUBLISH_NUM" IS 'publish approve number';
COMMENT ON COLUMN "PREMIUM_SERVICES"."LOTTERY_START_DATE" IS 'start date of lottery';
COMMENT ON COLUMN "PREMIUM_SERVICES"."LOTTERY_END_DATE" IS 'end date of lottery';
COMMENT ON COLUMN "PREMIUM_SERVICES"."FOLLOW_START_DATE" IS 'start date of setting delivery address for followings';
COMMENT ON COLUMN "PREMIUM_SERVICES"."FOLLOW_END_DATE" IS 'end date of setting delivery address for followings';
COMMENT ON COLUMN "PREMIUM_SERVICES"."SERVICE_DISP_DATE" IS 'display date of service';
COMMENT ON COLUMN "PREMIUM_SERVICES"."SERVICE_TYPE" IS '0: 2025 yearend service, 1: lottery, 2: 2026.3.8 service, 3: puzzle';
COMMENT ON COLUMN "PREMIUM_SERVICES"."IMAGE_URL" IS 'image that shown on premium service page';
COMMENT ON COLUMN "PREMIUM_SERVICES"."IMAGE_RATIO" IS 'Aspect ratio of image width : height';
COMMENT ON COLUMN "PREMIUM_SERVICES"."IMAGE_STATUS" IS '0: pending, 1: approved';
COMMENT ON COLUMN "PREMIUM_SERVICES"."SERVICE_NOTE" IS 'premium service note';
COMMENT ON COLUMN "PREMIUM_SERVICES"."GOODS_DESCRIPTION" IS 'premium goods description with publish accept code';
COMMENT ON COLUMN "PREMIUM_SERVICES"."IS_DELETED" IS '1: deleted, 0: none';
COMMENT ON COLUMN "PREMIUM_SERVICES"."IS_TEST" IS 'test flag, 1: for test';

CREATE OR REPLACE TRIGGER premium_service_pk_trigger
BEFORE INSERT ON premium_services
FOR EACH ROW
BEGIN
  IF :NEW.service_pk IS NULL THEN
    SELECT "PREMIUM_SERVICES_S".NEXTVAL
    INTO :NEW.service_pk
    FROM dual;
  END IF;
END;
/

-- premium goods
CREATE SEQUENCE "PREMIUM_GOODS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 100000 NOCACHE;

CREATE TABLE premium_goods (
  goods_pk NUMBER PRIMARY KEY,
  service_pk NUMBER NOT NULL,
  goods_name VARCHAR2(255) NOT NULL,
  goods_type NUMBER(2) DEFAULT 0 NOT NULL,
  price NUMBER(8, 2) DEFAULT 0,
  points NUMBER(11, 2) DEFAULT 0,
  related_pk NUMBER,
  class_pk NUMBER,
  real_count NUMBER(4) DEFAULT 0,
  fake_count NUMBER(4) DEFAULT 0,
  goods_note VARCHAR2(4000),
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_premium_goods_service_pk FOREIGN KEY (service_pk) REFERENCES premium_services(service_pk),
  CONSTRAINT fk_premium_goods_class_pk FOREIGN KEY (class_pk) REFERENCES premium_user_class(class_pk),
  CONSTRAINT uq_premium_service_goods UNIQUE (service_pk, class_pk, goods_name)
);

COMMENT ON COLUMN "PREMIUM_GOODS"."SERVICE_PK" IS 'premium_services.service_pk';
COMMENT ON COLUMN "PREMIUM_GOODS"."GOODS_NAME" IS 'goods name';
COMMENT ON COLUMN "PREMIUM_GOODS"."GOODS_TYPE" IS 'goods type, 1: deliverable material goods, 2: non-deliverable material goods, 3: e-product reserve coupon, 4: immaterial points, 5: immaterial commerce points, 6: immaterial soft points, 7: immaterial activity points, 8: immaterial free app, 9: immaterial e-product guarantee, 10: phone free repair coupon';
COMMENT ON COLUMN "PREMIUM_GOODS"."PRICE" IS 'goods price, can be used for sort';
COMMENT ON COLUMN "PREMIUM_GOODS"."POINTS" IS 'immaterial points including commerce/soft/activity points';
COMMENT ON COLUMN "PREMIUM_GOODS"."RELATED_PK" IS 'related pk for certain material goods, can be eshop.goods_pk, products.product_pk';
COMMENT ON COLUMN "PREMIUM_GOODS"."CLASS_PK" IS 'premium_user_class.class_pk';
COMMENT ON COLUMN "PREMIUM_GOODS"."REAL_COUNT" IS 'real count';
COMMENT ON COLUMN "PREMIUM_GOODS"."FAKE_COUNT" IS 'fake count';
COMMENT ON COLUMN "PREMIUM_GOODS"."GOODS_NOTE" IS 'goods note';
COMMENT ON COLUMN "PREMIUM_GOODS"."IS_DELETED" IS '1: deleted, 0: none';

CREATE OR REPLACE TRIGGER premium_goods_pk_trigger
BEFORE INSERT ON premium_goods
FOR EACH ROW
BEGIN
  IF :NEW.goods_pk IS NULL THEN
    SELECT "PREMIUM_GOODS_S".NEXTVAL
    INTO :NEW.goods_pk
    FROM dual;
  END IF;
END;
/

-- lottery numbers (for 2025 yearend premium)
CREATE SEQUENCE "LOTTERY_NUMBERS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 100000 NOCACHE;

CREATE TABLE lottery_numbers (
  lottery_pk NUMBER PRIMARY KEY,
  service_pk NUMBER NOT NULL,
  user_pk NUMBER NOT NULL,
  lottery_number NUMBER(8) DEFAULT 0 NOT NULL,
  goods_pk NUMBER,
  lottery_at DATE,
  award_at DATE,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lottery_number_service_pk FOREIGN KEY (service_pk) REFERENCES premium_services(service_pk),
  CONSTRAINT fk_lottery_number_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_lottery_number_goods_pk FOREIGN KEY (goods_pk) REFERENCES premium_goods(goods_pk),
  CONSTRAINT uq_lottery_service_user_no UNIQUE (service_pk, lottery_number)
);

COMMENT ON COLUMN "LOTTERY_NUMBERS"."SERVICE_PK" IS 'premium_services.service_pk';
COMMENT ON COLUMN "LOTTERY_NUMBERS"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "LOTTERY_NUMBERS"."LOTTERY_NUMBER" IS 'lottery number';
COMMENT ON COLUMN "LOTTERY_NUMBERS"."GOODS_PK" IS 'premium_goods.goods_pk, elected by manager before starting lottery';
COMMENT ON COLUMN "LOTTERY_NUMBERS"."LOTTERY_AT" IS 'lottery number selection time by user';
COMMENT ON COLUMN "LOTTERY_NUMBERS"."AWARD_AT" IS 'award time by manager or user';
COMMENT ON COLUMN "LOTTERY_NUMBERS"."IS_DELETED" IS '1: deleted, 0: none';

CREATE OR REPLACE TRIGGER lottery_number_pk_trigger
BEFORE INSERT ON lottery_numbers
FOR EACH ROW
BEGIN
  IF :NEW.lottery_pk IS NULL THEN
    SELECT "LOTTERY_NUMBERS_S".NEXTVAL
    INTO :NEW.lottery_pk
    FROM dual;
  END IF;
END;
/

-- lottery remain numbers
CREATE SEQUENCE "LOTTERY_REMAINS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 100000 NOCACHE;

CREATE TABLE lottery_remains (
  table_pk NUMBER PRIMARY KEY,
  service_pk NUMBER NOT NULL,
  lottery_number NUMBER(8) DEFAULT 0 NOT NULL,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lottery_remain_service_pk FOREIGN KEY (service_pk) REFERENCES premium_services(service_pk),
  CONSTRAINT uq_lottery_service_number UNIQUE (service_pk, lottery_number)
);

COMMENT ON COLUMN "LOTTERY_REMAINS"."SERVICE_PK" IS 'premium_services.service_pk';
COMMENT ON COLUMN "LOTTERY_REMAINS"."LOTTERY_NUMBER" IS 'lottery number';

CREATE OR REPLACE TRIGGER lottery_remain_pk_trigger
BEFORE INSERT ON lottery_remains
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "LOTTERY_REMAINS_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- lottery candidates
CREATE SEQUENCE "LOTTERY_CANDIDATES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 100000 NOCACHE;

CREATE TABLE lottery_candidates (
  table_pk NUMBER PRIMARY KEY,
  service_pk NUMBER NOT NULL,
  user_pk NUMBER NOT NULL,
  class_pk NUMBER,
  lottery_count NUMBER(1) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lottery_cand_service_pk FOREIGN KEY (service_pk) REFERENCES premium_services(service_pk),
  CONSTRAINT fk_lottery_cand_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_lottery_cand_class_pk FOREIGN KEY (class_pk) REFERENCES premium_user_class(class_pk),
  CONSTRAINT uq_lottery_candidates UNIQUE (service_pk, user_pk, class_pk)
);

COMMENT ON COLUMN "LOTTERY_CANDIDATES"."SERVICE_PK" IS 'premium_services.service_pk';
COMMENT ON COLUMN "LOTTERY_CANDIDATES"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "LOTTERY_CANDIDATES"."CLASS_PK" IS 'premium_user_class.class_pk';
COMMENT ON COLUMN "LOTTERY_CANDIDATES"."LOTTERY_COUNT" IS 'available lottery count';
COMMENT ON COLUMN "LOTTERY_CANDIDATES"."IS_DELETED" IS '1: deleted, 0: none';

CREATE OR REPLACE TRIGGER lottery_candidate_pk_trigger
BEFORE INSERT ON lottery_candidates
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "LOTTERY_CANDIDATES_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- lottery numbers
CREATE SEQUENCE "LOTTERY_SUBMITS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 100000 NOCACHE;

CREATE TABLE lottery_submits (
  lottery_pk NUMBER PRIMARY KEY,
  service_pk NUMBER NOT NULL,
  user_pk NUMBER NOT NULL,
  class_pk NUMBER NOT NULL,
  lottery_number NUMBER(8) DEFAULT 0 NOT NULL,
  goods_pk NUMBER,
  lottery_at DATE,
  award_at DATE,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lottery_submit_service_pk FOREIGN KEY (service_pk) REFERENCES premium_services(service_pk),
  CONSTRAINT fk_lottery_submit_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_lottery_submit_class_pk FOREIGN KEY (class_pk) REFERENCES premium_user_class(class_pk),
  CONSTRAINT fk_lottery_submit_goods_pk FOREIGN KEY (goods_pk) REFERENCES premium_goods(goods_pk),
  CONSTRAINT uq_lottery_submits UNIQUE (service_pk, lottery_number)
);

COMMENT ON COLUMN "LOTTERY_SUBMITS"."SERVICE_PK" IS 'premium_services.service_pk';
COMMENT ON COLUMN "LOTTERY_SUBMITS"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "LOTTERY_SUBMITS"."CLASS_PK" IS 'premium_user_class.class_pk';
COMMENT ON COLUMN "LOTTERY_SUBMITS"."LOTTERY_NUMBER" IS 'lottery number';
COMMENT ON COLUMN "LOTTERY_SUBMITS"."GOODS_PK" IS 'premium_goods.goods_pk, elected by manager';
COMMENT ON COLUMN "LOTTERY_SUBMITS"."LOTTERY_AT" IS 'lottery number selection time by user';
COMMENT ON COLUMN "LOTTERY_SUBMITS"."AWARD_AT" IS 'award time by manager or user';
COMMENT ON COLUMN "LOTTERY_SUBMITS"."IS_DELETED" IS '1: deleted, 0: none';

CREATE OR REPLACE TRIGGER lottery_submit_pk_trigger
BEFORE INSERT ON lottery_submits
FOR EACH ROW
BEGIN
  IF :NEW.lottery_pk IS NULL THEN
    SELECT "LOTTERY_SUBMITS_S".NEXTVAL
    INTO :NEW.lottery_pk
    FROM dual;
  END IF;
END;
/

-- premium point awards
CREATE SEQUENCE "PREMIUM_POINT_AWARDS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 100000 NOCACHE;

CREATE TABLE premium_point_awards (
  table_pk NUMBER PRIMARY KEY,
  lottery_pk NUMBER NOT NULL UNIQUE,
  goods_pk NUMBER NOT NULL,
  points NUMBER(8, 2) DEFAULT 0,
  target_id VARCHAR2(64) NOT NULL,
  related_pk NUMBER,
  status NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_premium_point_lottery_pk FOREIGN KEY (lottery_pk) REFERENCES lottery_numbers(lottery_pk),
  CONSTRAINT fk_premium_point_goods_pk FOREIGN KEY (goods_pk) REFERENCES premium_goods(goods_pk)
);

COMMENT ON COLUMN "PREMIUM_POINT_AWARDS"."LOTTERY_PK" IS 'lottery_numbers.lottery_pk';
COMMENT ON COLUMN "PREMIUM_POINT_AWARDS"."GOODS_PK" IS 'premium_goods.goods_pk';
COMMENT ON COLUMN "PREMIUM_POINT_AWARDS"."POINTS" IS 'immaterial points specified by premium_goods.points';
COMMENT ON COLUMN "PREMIUM_POINT_AWARDS"."TARGET_ID" IS 'target id to be charged, can be eshop card number, appstore id, pid';
COMMENT ON COLUMN "PREMIUM_POINT_AWARDS"."RELATED_PK" IS 'transaction pk of each system after charged';
COMMENT ON COLUMN "PREMIUM_POINT_AWARDS"."STATUS" IS '0: pending, 1: success, 2: fail';

CREATE OR REPLACE TRIGGER premium_point_award_pk_trigger
BEFORE INSERT ON premium_point_awards
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "PREMIUM_POINT_AWARDS_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- premium user values
CREATE SEQUENCE "PREMIUM_USER_VALUES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 100000 NOCACHE;

CREATE TABLE premium_user_values (
  table_pk NUMBER PRIMARY KEY,
  service_pk NUMBER NOT NULL,
  user_pk NUMBER NOT NULL,
  user_value NUMBER(11, 3) DEFAULT 0 NOT NULL,
  commerce_value NUMBER(11, 2) DEFAULT 0 NOT NULL,
  exp_value NUMBER(11, 2) DEFAULT 0 NOT NULL,
  soft_points NUMBER(11, 3) DEFAULT 0 NOT NULL,
  phone_reg_points NUMBER(11, 1) DEFAULT 0 NOT NULL,
  eprod_reg_points NUMBER(11, 1) DEFAULT 0 NOT NULL,
  activity_points NUMBER(11, 1) DEFAULT 0 NOT NULL,
  class_name VARCHAR2(64) NOT NULL,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_premium_val_service_pk FOREIGN KEY (service_pk) REFERENCES premium_services(service_pk),
  CONSTRAINT fk_premium_val_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  CONSTRAINT uq_premium_service_user_pk UNIQUE (service_pk, user_pk)
);

COMMENT ON COLUMN "PREMIUM_USER_VALUES"."SERVICE_PK" IS 'premium_services.service_pk';
COMMENT ON COLUMN "PREMIUM_USER_VALUES"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "PREMIUM_USER_VALUES"."USER_VALUE" IS 'integrated value calculated by service formula (specified on note)';
COMMENT ON COLUMN "PREMIUM_USER_VALUES"."COMMERCE_VALUE" IS 'accumulated commerce value of eshop';
COMMENT ON COLUMN "PREMIUM_USER_VALUES"."EXP_VALUE" IS 'accumulated experience value of eshop';
COMMENT ON COLUMN "PREMIUM_USER_VALUES"."SOFT_POINTS" IS 'accumulated soft points (= appstore point + bmedia point + karaoke point)';
COMMENT ON COLUMN "PREMIUM_USER_VALUES"."PHONE_REG_POINTS" IS 'accumulated phone register points';
COMMENT ON COLUMN "PREMIUM_USER_VALUES"."EPROD_REG_POINTS" IS 'accumulated eprod register points';
COMMENT ON COLUMN "PREMIUM_USER_VALUES"."ACTIVITY_POINTS" IS 'accumulated activity points';
COMMENT ON COLUMN "PREMIUM_USER_VALUES"."CLASS_NAME" IS 'premium_user_class.class_name, for avoid loading speed by joining';

CREATE OR REPLACE TRIGGER premium_user_value_pk_trigger
BEFORE INSERT ON premium_user_values
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "PREMIUM_USER_VALUES_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- premium user class
CREATE SEQUENCE "PREMIUM_USER_CLASS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 100000 NOCACHE;

CREATE TABLE premium_user_class (
  class_pk NUMBER PRIMARY KEY,
  service_pk NUMBER NOT NULL,
  class_name VARCHAR2(64) NOT NULL,
  start_value NUMBER(11, 3) DEFAULT 0 NOT NULL,
  end_value NUMBER(11, 3) DEFAULT 0,
  lottery_min_num NUMBER(8) DEFAULT 0,
  lottery_max_num NUMBER(8) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_premium_class_service_pk FOREIGN KEY (service_pk) REFERENCES premium_services(service_pk),
  CONSTRAINT uq_premium_class_service_name UNIQUE (service_pk, class_name)
);

COMMENT ON COLUMN "PREMIUM_USER_CLASS"."SERVICE_PK" IS 'premium_services.service_pk';
COMMENT ON COLUMN "PREMIUM_USER_CLASS"."CLASS_NAME" IS 'user class name';
COMMENT ON COLUMN "PREMIUM_USER_CLASS"."START_VALUE" IS 'min value for this class';
COMMENT ON COLUMN "PREMIUM_USER_CLASS"."END_VALUE" IS 'max value for this class (not included), if NULL, no end limit';
COMMENT ON COLUMN "PREMIUM_USER_CLASS"."LOTTERY_MIN_NUM" IS 'min lottery number for this class';
COMMENT ON COLUMN "PREMIUM_USER_CLASS"."LOTTERY_MAX_NUM" IS 'max lottery number for this class (included)';
COMMENT ON COLUMN "PREMIUM_USER_CLASS"."IS_DELETED" IS '1: deleted, 0: none';

CREATE OR REPLACE TRIGGER premium_user_class_pk_trigger
BEFORE INSERT ON premium_user_class
FOR EACH ROW
BEGIN
  IF :NEW.class_pk IS NULL THEN
    SELECT "PREMIUM_USER_CLASS_S".NEXTVAL
    INTO :NEW.class_pk
    FROM dual;
  END IF;
END;
/

-- user delivery address
CREATE SEQUENCE "USER_DELIVERY_ADDRESS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 100000 NOCACHE;

CREATE TABLE user_delivery_address (
  delivery_pk NUMBER PRIMARY KEY,
  service_pk NUMBER NOT NULL,
  user_pk NUMBER NOT NULL,
  receptionist VARCHAR2(64),
  location_pk NUMBER NOT NULL,
  location_more VARCHAR2(255),
  location_environs VARCHAR2(255),
  phone_numbers VARCHAR2(128) NOT NULL,
  id_card VARCHAR2(50),
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_delivery_service_pk FOREIGN KEY (service_pk) REFERENCES premium_services(service_pk),
  CONSTRAINT fk_user_delivery_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_user_delivery_location_pk FOREIGN KEY (location_pk) REFERENCES locations(location_pk),
  CONSTRAINT uq_user_delivery_svc_user_pk UNIQUE (service_pk, user_pk)
);


CREATE OR REPLACE TRIGGER user_delivery_addr_pk_trigger
BEFORE INSERT ON user_delivery_address
FOR EACH ROW
BEGIN
  IF :NEW.delivery_pk IS NULL THEN
    SELECT "USER_DELIVERY_ADDRESS_S".NEXTVAL
    INTO :NEW.delivery_pk
    FROM dual;
  END IF;
END;
/

-- premium material deliveries
CREATE SEQUENCE "PREMIUM_MATERIAL_DELIVERIES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 100000 NOCACHE;

CREATE TABLE premium_material_deliveries (
  table_pk NUMBER PRIMARY KEY,
  service_pk NUMBER NOT NULL,
  user_pk NUMBER NOT NULL,
  lottery_number NUMBER(8) DEFAULT 0 NOT NULL,
  goods_pk NUMBER NOT NULL,
  delivery_pk NUMBER NOT NULL,
  status NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_material_deliver_service_pk FOREIGN KEY (service_pk) REFERENCES premium_services(service_pk),
  CONSTRAINT fk_material_deliver_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_material_deliver_goods_pk FOREIGN KEY (goods_pk) REFERENCES premium_goods(goods_pk),
  CONSTRAINT fk_material_deliver_addr_pk FOREIGN KEY (delivery_pk) REFERENCES user_delivery_address(delivery_pk),
  CONSTRAINT uq_mat_deliver_svc_user_pk UNIQUE (service_pk, user_pk),
  CONSTRAINT uq_mat_deliver_svc_number UNIQUE (service_pk, lottery_number)
);

COMMENT ON COLUMN "PREMIUM_MATERIAL_DELIVERIES"."SERVICE_PK" IS 'premium_services.service_pk';
COMMENT ON COLUMN "PREMIUM_MATERIAL_DELIVERIES"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "PREMIUM_MATERIAL_DELIVERIES"."LOTTERY_NUMBER" IS 'lottery_numbers.lottery_number';
COMMENT ON COLUMN "PREMIUM_MATERIAL_DELIVERIES"."GOODS_PK" IS 'premium_goods.goods_pk';
COMMENT ON COLUMN "PREMIUM_MATERIAL_DELIVERIES"."DELIVERY_PK" IS 'user_delivery_address.delivery_pk';
COMMENT ON COLUMN "PREMIUM_MATERIAL_DELIVERIES"."STATUS" IS '0: pending, 1: delivered, 2: delivering';

CREATE OR REPLACE TRIGGER premium_mat_deliver_pk_trigger
BEFORE INSERT ON premium_material_deliveries
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "PREMIUM_MATERIAL_DELIVERIES_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- premium material agencies
CREATE SEQUENCE "PREMIUM_MATERIAL_AGENCIES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 100000 NOCACHE;

CREATE TABLE premium_material_agencies (
  table_pk NUMBER PRIMARY KEY,
  service_pk NUMBER NOT NULL,
  user_pk NUMBER NOT NULL,
  lottery_number NUMBER(8) DEFAULT 0 NOT NULL,
  goods_pk NUMBER NOT NULL,
  id_name VARCHAR2(36),
  id_card VARCHAR2(36),
  phone_number VARCHAR2(12) NOT NULL,
  agency_pk NUMBER,
  status NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_material_agency_service_pk FOREIGN KEY (service_pk) REFERENCES premium_services(service_pk),
  CONSTRAINT fk_material_agency_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_material_agency_goods_pk FOREIGN KEY (goods_pk) REFERENCES premium_goods(goods_pk),
  CONSTRAINT uq_mat_agency_svc_user_pk UNIQUE (service_pk, user_pk),
  CONSTRAINT uq_mat_agency_svc_number UNIQUE (service_pk, lottery_number)
);

COMMENT ON COLUMN "PREMIUM_MATERIAL_AGENCIES"."SERVICE_PK" IS 'premium_services.service_pk';
COMMENT ON COLUMN "PREMIUM_MATERIAL_AGENCIES"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "PREMIUM_MATERIAL_AGENCIES"."LOTTERY_NUMBER" IS 'lottery_numbers.lottery_number';
COMMENT ON COLUMN "PREMIUM_MATERIAL_AGENCIES"."GOODS_PK" IS 'premium_goods.goods_pk';
COMMENT ON COLUMN "PREMIUM_MATERIAL_AGENCIES"."ID_NAME" IS 'name on id card for verification';
COMMENT ON COLUMN "PREMIUM_MATERIAL_AGENCIES"."ID_CARD" IS 'number on id card for verification';
COMMENT ON COLUMN "PREMIUM_MATERIAL_AGENCIES"."PHONE_NUMBER" IS 'phone number for verification';
COMMENT ON COLUMN "PREMIUM_MATERIAL_AGENCIES"."AGENCY_PK" IS '';
COMMENT ON COLUMN "PREMIUM_MATERIAL_AGENCIES"."STATUS" IS '0: pending, 1: delivered';

CREATE OR REPLACE TRIGGER premium_mat_agency_pk_trigger
BEFORE INSERT ON premium_material_agencies
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "PREMIUM_MATERIAL_AGENCIES_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- integrated user class
CREATE SEQUENCE "INTEGRATED_USER_CLASS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 100000 NOCACHE;

CREATE TABLE integrated_user_class (
  class_pk NUMBER PRIMARY KEY,
  class_level NUMBER(1) DEFAULT 0 NOT NULL UNIQUE,
  class_name VARCHAR2(64) NOT NULL UNIQUE,
  start_value NUMBER(11, 3) DEFAULT 0 NOT NULL,
  end_value NUMBER(11, 3) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON COLUMN "INTEGRATED_USER_CLASS"."CLASS_LEVEL" IS 'user class level (0, 1, 2, 3)';
COMMENT ON COLUMN "INTEGRATED_USER_CLASS"."CLASS_NAME" IS 'user class name';
COMMENT ON COLUMN "INTEGRATED_USER_CLASS"."START_VALUE" IS 'min value for this class';
COMMENT ON COLUMN "INTEGRATED_USER_CLASS"."END_VALUE" IS 'max value for this class (not included), if NULL, no end limit';
COMMENT ON COLUMN "INTEGRATED_USER_CLASS"."IS_DELETED" IS '1: deleted, 0: none';

CREATE OR REPLACE TRIGGER integrat_user_class_pk_trigger
BEFORE INSERT ON integrated_user_class
FOR EACH ROW
BEGIN
  IF :NEW.class_pk IS NULL THEN
    SELECT "INTEGRATED_USER_CLASS_S".NEXTVAL
    INTO :NEW.class_pk
    FROM dual;
  END IF;
END;
/

-- integrated user values
CREATE SEQUENCE "INTEGRATED_USER_VALUES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 100000 NOCACHE;

CREATE TABLE integrated_user_values (
  table_pk NUMBER PRIMARY KEY,
  user_pk NUMBER NOT NULL UNIQUE,
  user_value NUMBER(11, 3) DEFAULT 0 NOT NULL,
  commerce_value NUMBER(11, 2) DEFAULT 0 NOT NULL,
  exp_value NUMBER(11, 2) DEFAULT 0 NOT NULL,
  soft_points NUMBER(11, 3) DEFAULT 0 NOT NULL,
  phone_reg_points NUMBER(11, 1) DEFAULT 0 NOT NULL,
  eprod_reg_points NUMBER(11, 1) DEFAULT 0 NOT NULL,
  activity_points NUMBER(11, 1) DEFAULT 0 NOT NULL,
  class_name VARCHAR2(64) NOT NULL,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_integrated_val_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk)
);

COMMENT ON COLUMN "INTEGRATED_USER_VALUES"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "INTEGRATED_USER_VALUES"."USER_VALUE" IS 'integrated value calculated by integrate formula';
COMMENT ON COLUMN "INTEGRATED_USER_VALUES"."COMMERCE_VALUE" IS 'accumulated commerce value of eshop';
COMMENT ON COLUMN "INTEGRATED_USER_VALUES"."EXP_VALUE" IS 'accumulated experience value of eshop';
COMMENT ON COLUMN "INTEGRATED_USER_VALUES"."SOFT_POINTS" IS 'accumulated soft points (= appstore point + bmedia point + karaoke point)';
COMMENT ON COLUMN "INTEGRATED_USER_VALUES"."PHONE_REG_POINTS" IS 'accumulated phone register points';
COMMENT ON COLUMN "INTEGRATED_USER_VALUES"."EPROD_REG_POINTS" IS 'accumulated eprod register points';
COMMENT ON COLUMN "INTEGRATED_USER_VALUES"."ACTIVITY_POINTS" IS 'accumulated activity points';
COMMENT ON COLUMN "INTEGRATED_USER_VALUES"."CLASS_NAME" IS 'integrated_user_class.class_name, for avoid loading speed by joining';

CREATE OR REPLACE TRIGGER integrat_user_value_pk_trigger
BEFORE INSERT ON integrated_user_values
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "INTEGRATED_USER_VALUES_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- premium discussions
CREATE SEQUENCE "PREMIUM_DISCUSS_AWARDS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 100000 NOCACHE;

CREATE TABLE premium_discuss_awards (
  award_pk NUMBER PRIMARY KEY,
  service_pk NUMBER NOT NULL,
  user_pk NUMBER NOT NULL,
  class_pk NUMBER NOT NULL,
  goods_pk NUMBER NOT NULL,
  award_at DATE,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_by NUMBER,
  CONSTRAINT fk_discuss_award_service_pk FOREIGN KEY (service_pk) REFERENCES premium_services(service_pk),
  CONSTRAINT fk_discuss_award_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_discuss_award_class_pk FOREIGN KEY (class_pk) REFERENCES premium_user_class(class_pk),
  CONSTRAINT fk_discuss_award_goods_pk FOREIGN KEY (goods_pk) REFERENCES premium_goods(goods_pk),
  CONSTRAINT fk_discuss_award_admin_pk FOREIGN KEY (updated_by) REFERENCES managers(manager_pk)
);

COMMENT ON COLUMN "PREMIUM_DISCUSS_AWARDS"."SERVICE_PK" IS 'premium_services.service_pk';
COMMENT ON COLUMN "PREMIUM_DISCUSS_AWARDS"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "PREMIUM_DISCUSS_AWARDS"."CLASS_PK" IS 'premium_user_class.class_pk';
COMMENT ON COLUMN "PREMIUM_DISCUSS_AWARDS"."GOODS_PK" IS 'premium_goods.goods_pk';
COMMENT ON COLUMN "PREMIUM_DISCUSS_AWARDS"."AWARD_AT" IS 'award time by manager or user';
COMMENT ON COLUMN "PREMIUM_DISCUSS_AWARDS"."IS_DELETED" IS '1: deleted, 0: none';

CREATE OR REPLACE TRIGGER premium_diss_award_pk_trigger
BEFORE INSERT ON premium_discuss_awards
FOR EACH ROW
BEGIN
  IF :NEW.award_pk IS NULL THEN
    SELECT "PREMIUM_DISCUSS_AWARDS_S".NEXTVAL
    INTO :NEW.award_pk
    FROM dual;
  END IF;
END;
/

-- premium receptions
CREATE SEQUENCE "PREMIUM_RECEPTIONS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 100000 NOCACHE;

CREATE TABLE premium_receptions (
  table_pk NUMBER PRIMARY KEY,
  service_pk NUMBER NOT NULL,
  user_pk NUMBER NOT NULL,
  related_pk NUMBER,
  receptionist VARCHAR2(64) NOT NULL,
  location_pk NUMBER,
  location_more VARCHAR2(255),
  location_environs VARCHAR2(255),
  phone_numbers VARCHAR2(128) NOT NULL,
  id_card VARCHAR2(50),
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_premium_recepts_service_pk FOREIGN KEY (service_pk) REFERENCES premium_services(service_pk),
  CONSTRAINT fk_premium_recepts_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_premium_recepts_location_pk FOREIGN KEY (location_pk) REFERENCES locations(location_pk),
  CONSTRAINT uq_premium_recepts_fields UNIQUE (service_pk, user_pk, related_pk)
);

CREATE OR REPLACE TRIGGER premium_receptions_pk_trigger
BEFORE INSERT ON premium_receptions
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "PREMIUM_RECEPTIONS_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- womens day premium service by surveys
CREATE TABLE premium_women_survey_stats (
  choice_pk NUMBER PRIMARY KEY,
  question_pk NUMBER NOT NULL,
  count NUMBER DEFAULT 0 NOT NULL,
  points NUMBER(4, 1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_women_survey_choice_pk FOREIGN KEY (choice_pk) REFERENCES survey_choices(choice_pk),
  CONSTRAINT fk_women_survey_question_pk FOREIGN KEY (question_pk) REFERENCES survey_questions(question_pk)
);

COMMENT ON COLUMN "PREMIUM_WOMEN_SURVEY_STATS"."CHOICE_PK" IS 'survey_choices.choice_pk';
COMMENT ON COLUMN "PREMIUM_WOMEN_SURVEY_STATS"."QUESTION_PK" IS 'survey_questions.question_pk';
COMMENT ON COLUMN "PREMIUM_WOMEN_SURVEY_STATS"."COUNT" IS 'survey response stats count';
COMMENT ON COLUMN "PREMIUM_WOMEN_SURVEY_STATS"."POINTS" IS 'survey response points for womens day';

-- puzzle questions
CREATE SEQUENCE "PUZZLE_QUESTIONS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE puzzle_questions (
  question_pk NUMBER PRIMARY KEY,
  service_pk NUMBER NOT NULL,
  question_text VARCHAR2(1024) NOT NULL,
  question_type NUMBER(1) DEFAULT 0,
  position NUMBER(2) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  publish_num VARCHAR2(24),
  notice_at DATE,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_puzz_quz_service_pk FOREIGN KEY (service_pk) REFERENCES premium_services(service_pk)
);

COMMENT ON COLUMN "PUZZLE_QUESTIONS"."SERVICE_PK" IS 'premium_services.service_pk';
COMMENT ON COLUMN "PUZZLE_QUESTIONS"."QUESTION_TEXT" IS 'text of the puzzle question';
COMMENT ON COLUMN "PUZZLE_QUESTIONS"."QUESTION_TYPE" IS '0: single-choice, only single-choice for puzzle';
COMMENT ON COLUMN "PUZZLE_QUESTIONS"."POSITION" IS 'sort order';
COMMENT ON COLUMN "PUZZLE_QUESTIONS"."PUBLISH_NUM" IS 'publish approve number';
COMMENT ON COLUMN "PUZZLE_QUESTIONS"."NOTICE_AT" IS 'question display time';

CREATE OR REPLACE TRIGGER puzz_quz_pk_trigger
BEFORE INSERT ON puzzle_questions
FOR EACH ROW
BEGIN
  IF :NEW.question_pk IS NULL THEN
    SELECT "PUZZLE_QUESTIONS_S".NEXTVAL
    INTO :NEW.question_pk
    FROM dual;
  END IF;
END;
/

-- puzzle choices
CREATE SEQUENCE "PUZZLE_CHOICES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE puzzle_choices (
  choice_pk NUMBER PRIMARY KEY,
  question_pk NUMBER NOT NULL,
  choice_text VARCHAR2(255) NOT NULL,
  position NUMBER(2) DEFAULT 0,
  is_correct NUMBER(1) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_puzz_c_quz_pk FOREIGN KEY (question_pk) REFERENCES puzzle_questions(question_pk)
);

COMMENT ON COLUMN "PUZZLE_CHOICES"."QUESTION_PK" IS 'puzzle_questions.question_pk';
COMMENT ON COLUMN "PUZZLE_CHOICES"."CHOICE_TEXT" IS 'choice text';
COMMENT ON COLUMN "PUZZLE_CHOICES"."POSITION" IS 'sort order';
COMMENT ON COLUMN "PUZZLE_CHOICES"."IS_CORRECT" IS '1: correct choice';

CREATE OR REPLACE TRIGGER puzz_choice_pk_trigger
BEFORE INSERT ON puzzle_choices
FOR EACH ROW
BEGIN
  IF :NEW.choice_pk IS NULL THEN
    SELECT "PUZZLE_CHOICES_S".NEXTVAL
    INTO :NEW.choice_pk
    FROM dual;
  END IF;
END;
/

-- puzzle responses
CREATE SEQUENCE "PUZZLE_RESPONSES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE puzzle_responses (
  response_pk NUMBER PRIMARY KEY,
  user_pk NUMBER NOT NULL,
  question_pk NUMBER NOT NULL,
  choice_pk NUMBER NOT NULL,
  action_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_puzz_resp_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_puzz_resp_quz_pk FOREIGN KEY (question_pk) REFERENCES puzzle_questions(question_pk),
  CONSTRAINT fk_puzz_resp_choice FOREIGN KEY (choice_pk) REFERENCES puzzle_choices(choice_pk),
  CONSTRAINT uq_puzz_q_c_user UNIQUE (user_pk, question_pk, choice_pk)
);

COMMENT ON COLUMN "PUZZLE_RESPONSES"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "PUZZLE_RESPONSES"."QUESTION_PK" IS 'puzzle_questions.question_pk';
COMMENT ON COLUMN "PUZZLE_RESPONSES"."CHOICE_PK" IS 'puzzle_choices.choice_pk';
COMMENT ON COLUMN "PUZZLE_RESPONSES"."ACTION_AT" IS 'response time';

CREATE OR REPLACE TRIGGER puzz_resp_pk_trigger
BEFORE INSERT ON puzzle_responses
FOR EACH ROW
BEGIN
  IF :NEW.response_pk IS NULL THEN
    SELECT "PUZZLE_RESPONSES_S".NEXTVAL
    INTO :NEW.response_pk
    FROM dual;
  END IF;
END;
/

-- puzzle awards
CREATE SEQUENCE "PUZZLE_AWARDS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 100000 NOCACHE;

CREATE TABLE puzzle_awards (
  award_pk NUMBER PRIMARY KEY,
  service_pk NUMBER NOT NULL,
  user_pk NUMBER NOT NULL,
  class_pk NUMBER NOT NULL,
  goods_pk NUMBER,
  award_at DATE,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_by NUMBER,
  CONSTRAINT fk_puzz_award_service_pk FOREIGN KEY (service_pk) REFERENCES premium_services(service_pk),
  CONSTRAINT fk_puzz_award_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_puzz_award_class_pk FOREIGN KEY (class_pk) REFERENCES premium_user_class(class_pk),
  CONSTRAINT fk_puzz_award_goods_pk FOREIGN KEY (goods_pk) REFERENCES premium_goods(goods_pk),
  CONSTRAINT fk_puzz_award_admin_pk FOREIGN KEY (updated_by) REFERENCES managers(manager_pk),
  CONSTRAINT uq_puzz_awards UNIQUE (service_pk, user_pk, class_pk)
);

COMMENT ON COLUMN "PUZZLE_AWARDS"."SERVICE_PK" IS 'premium_services.service_pk';
COMMENT ON COLUMN "PUZZLE_AWARDS"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "PUZZLE_AWARDS"."CLASS_PK" IS 'premium_user_class.class_pk';
COMMENT ON COLUMN "PUZZLE_AWARDS"."GOODS_PK" IS 'premium_goods.goods_pk, elected by manager';
COMMENT ON COLUMN "PUZZLE_AWARDS"."AWARD_AT" IS 'award time by manager or user';
COMMENT ON COLUMN "PUZZLE_AWARDS"."IS_DELETED" IS '1: deleted, 0: none';

CREATE OR REPLACE TRIGGER puzz_award_pk_trigger
BEFORE INSERT ON puzzle_awards
FOR EACH ROW
BEGIN
  IF :NEW.award_pk IS NULL THEN
    SELECT "PUZZLE_AWARDS_S".NEXTVAL
    INTO :NEW.award_pk
    FROM dual;
  END IF;
END;
/

CREATE SEQUENCE "PUZZLE_BONUS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 100000 NOCACHE;

CREATE TABLE puzzle_bonus (
  table_pk NUMBER PRIMARY KEY,
  service_pk NUMBER NOT NULL,
  user_pk NUMBER NOT NULL,
  points NUMBER(8, 3) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_by NUMBER,
  CONSTRAINT fk_puzz_bonus_service_pk FOREIGN KEY (service_pk) REFERENCES premium_services(service_pk),
  CONSTRAINT fk_puzz_bonus_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_puzz_bonus_admin_pk FOREIGN KEY (updated_by) REFERENCES managers(manager_pk),
  CONSTRAINT uq_puzz_bonus UNIQUE (service_pk, user_pk)
);

COMMENT ON COLUMN "PUZZLE_BONUS"."SERVICE_PK" IS 'premium_services.service_pk';
COMMENT ON COLUMN "PUZZLE_BONUS"."USER_PK" IS 'users.user_pk';

CREATE OR REPLACE TRIGGER puzz_bonus_pk_trigger
BEFORE INSERT ON puzzle_bonus
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "PUZZLE_BONUS_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/
