-- customer
CREATE SEQUENCE "CUSTOMERS_S" MINVALUE 10000000 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 10000000 CACHE 2;

CREATE TABLE customers (
  ecid NUMBER PRIMARY KEY,
  user_name VARCHAR2(50),
  gender CHAR(1) default 'M',
  birth_year VARCHAR2(16),
  job VARCHAR2(30),
  address VARCHAR2(255),
  phone_number VARCHAR2(64),
  source NUMBER(1) DEFAULT 0,
  status NUMBER(1) DEFAULT 1,
  pvendor_pk NUMBER UNIQUE,
  pvendor_id VARCHAR2(50),
  target_id NUMBER,
  note VARCHAR2(511),
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_customer_gender CHECK (gender IN ('M', 'F'))
);

CREATE OR REPLACE TRIGGER customer_pk_trigger
BEFORE INSERT ON customers
FOR EACH ROW
BEGIN
  IF :NEW.ecid IS NULL THEN
    SELECT "CUSTOMERS_S".NEXTVAL
    INTO :NEW.ecid
    FROM dual;
  END IF;
END;
/

-- CRM product categories
CREATE SEQUENCE "CRM_PROD_CATEGORIES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 2 START WITH 1 NOCACHE;

CREATE TABLE crm_prod_categories (
  category_pk NUMBER PRIMARY KEY,
  category_name VARCHAR2(64),
  parent_pk NUMBER,
  position NUMBER(2) DEFAULT 0,
  is_leaf NUMBER(1) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  template_xls VARCHAR2(255),
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER crm_prod_category_pk
BEFORE INSERT ON crm_prod_categories
FOR EACH ROW
BEGIN
  IF :NEW.category_pk IS NULL THEN
    SELECT "CRM_PROD_CATEGORIES_S".NEXTVAL
    INTO :NEW.category_pk
    FROM dual;
  END IF;
END;
/

-- crm products
CREATE SEQUENCE "CRM_PRODUCTS_S" MINVALUE 100 MAXVALUE 9999999999999999999 INCREMENT BY 2 START WITH 100 NOCACHE;

CREATE TABLE crm_products (
  product_pk NUMBER PRIMARY KEY,
  product_name VARCHAR2(128),
  simple_name VARCHAR2(64),
  category_pk NUMBER NOT NULL,
  root_pk NUMBER NOT NULL,
  position NUMBER(3) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_crm_prod_cat_pk FOREIGN KEY (category_pk) REFERENCES crm_prod_categories(category_pk),
  CONSTRAINT fk_crm_prod_root_pk FOREIGN KEY (root_pk) REFERENCES crm_prod_categories(category_pk)
);

CREATE OR REPLACE TRIGGER crm_products_pk_trigger
BEFORE INSERT ON crm_products
FOR EACH ROW
BEGIN
  IF :NEW.product_pk IS NULL THEN
    SELECT "CRM_PRODUCTS_S".NEXTVAL
    INTO :NEW.product_pk
    FROM dual;
  END IF;
END;
/

-- crm product spec keys
CREATE SEQUENCE "CRM_PROD_SPEC_KEYS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE crm_prod_spec_keys (
  spec_pk NUMBER PRIMARY KEY,
  spec_key VARCHAR2(64) NOT NULL UNIQUE,
  spec_name VARCHAR2(128),
  spec_type NUMBER(1) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER crm_prod_spec_key_pk
BEFORE INSERT ON crm_prod_spec_keys
FOR EACH ROW
BEGIN
  IF :NEW.spec_pk IS NULL THEN
    SELECT "CRM_PROD_SPEC_KEYS_S".NEXTVAL
    INTO :NEW.spec_pk
    FROM dual;
  END IF;
END;
/

-- crm product spec values
CREATE SEQUENCE "CRM_PROD_SPEC_VALUES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE crm_prod_spec_values (
  value_pk NUMBER PRIMARY KEY,
  root_pk NUMBER NOT NULL,
  spec_pk NUMBER NOT NULL,
  spec_value VARCHAR2(255) NOT NULL,
  position NUMBER(2) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_crm_prod_val_root_pk FOREIGN KEY (root_pk) REFERENCES crm_prod_categories(category_pk),
  CONSTRAINT fk_crm_prod_val_spec_pk FOREIGN KEY (spec_pk) REFERENCES crm_prod_spec_keys(spec_pk)
);

CREATE OR REPLACE TRIGGER crm_prod_spec_val_pk
BEFORE INSERT ON crm_prod_spec_values
FOR EACH ROW
BEGIN
  IF :NEW.value_pk IS NULL THEN
    SELECT "CRM_PROD_SPEC_VALUES_S".NEXTVAL
    INTO :NEW.value_pk
    FROM dual;
  END IF;
END;
/

-- crm product spec orders
CREATE SEQUENCE "CRM_PROD_SPEC_ORDERS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE crm_prod_spec_orders (
  table_pk NUMBER PRIMARY KEY,
  root_pk NUMBER NOT NULL,
  spec_pk NUMBER NOT NULL,
  position NUMBER(2) DEFAULT 0,
  is_required NUMBER(1) DEFAULT 0,
  spec_label VARCHAR2(255),
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_crm_spec_order_root_pk FOREIGN KEY (root_pk) REFERENCES crm_prod_categories(category_pk),
  CONSTRAINT fk_crm_spec_order_spec_pk FOREIGN KEY (spec_pk) REFERENCES crm_prod_spec_keys(spec_pk)
);

CREATE OR REPLACE TRIGGER crm_prod_spec_order_pk
BEFORE INSERT ON crm_prod_spec_orders
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "CRM_PROD_SPEC_ORDERS_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- crm product survey options
CREATE SEQUENCE "CRM_PROD_SURVEY_OPTIONS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE crm_prod_survey_options (
  option_pk NUMBER PRIMARY KEY,
  root_pk NUMBER NOT NULL,
  option_name VARCHAR2(255) NOT NULL,
  position NUMBER(2) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_crm_prd_svy_opt_root_pk FOREIGN KEY (root_pk) REFERENCES crm_prod_categories(category_pk)
);

CREATE OR REPLACE TRIGGER crm_prod_survey_option_pk
BEFORE INSERT ON crm_prod_survey_options
FOR EACH ROW
BEGIN
  IF :NEW.option_pk IS NULL THEN
    SELECT "CRM_PROD_SURVEY_OPTIONS_S".NEXTVAL
    INTO :NEW.option_pk
    FROM dual;
  END IF;
END;
/

-- crm product survey responses
CREATE SEQUENCE "CRM_PROD_SURVEY_RESPONSES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE crm_prod_survey_responses (
  resp_pk NUMBER PRIMARY KEY,
  ecid NUMBER NOT NULL,
  serial_no VARCHAR2(25),
  option_pk NUMBER NOT NULL,
  option_name VARCHAR2(255),
  rating NUMBER DEFAULT 1,
  action_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_crm_prd_svy_rsp_ecid FOREIGN KEY (ecid) REFERENCES customers(ecid),
  CONSTRAINT fk_crm_prd_svy_rsp_option FOREIGN KEY (option_pk) REFERENCES crm_prod_survey_options(option_pk)
);

CREATE OR REPLACE TRIGGER crm_prod_survey_resp_pk
BEFORE INSERT ON crm_prod_survey_responses
FOR EACH ROW
BEGIN
  IF :NEW.resp_pk IS NULL THEN
    SELECT "CRM_PROD_SURVEY_RESPONSES_S".NEXTVAL
    INTO :NEW.resp_pk
    FROM dual;
  END IF;
END;
/

-- crm eprod sale
CREATE SEQUENCE "CRM_EPROD_SALES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE crm_eprod_sales (
  table_pk NUMBER PRIMARY KEY,
  ecid NUMBER NOT NULL,
  pvendor_pk NUMBER,
  pvendor_id VARCHAR2(50),
  user_name VARCHAR2(50),
  gender CHAR(1) default 'M',
  birth_year VARCHAR2(16),
  job VARCHAR2(12),
  address VARCHAR2(255),
  phone_number VARCHAR2(32),
  serial_no VARCHAR2(25) NOT NULL UNIQUE,
  equip_no VARCHAR2(25),
  root_pk NUMBER,
  category_name VARCHAR2(64),
  product_pk NUMBER,
  product_name VARCHAR2(128),
  simple_name VARCHAR2(64),
  purchase_place VARCHAR2(255),
  purchase_date VARCHAR2(32),
  reg_date VARCHAR2(32),
  serious_views VARCHAR2(255),
  purchase_motives VARCHAR2(255),
  old_prod_name VARCHAR2(255),
  survey_up VARCHAR2(511),
  survey_down VARCHAR2(511),
  feedback_msg VARCHAR2(1024),
  outlook VARCHAR2(255),
  led_type VARCHAR2(64),
  has_tv_mount VARCHAR2(32),
  is_kara_user VARCHAR2(32),
  use_bmedia VARCHAR2(32),
  hour_usage VARCHAR2(32),
  computer_usage VARCHAR2(128),
  install_loc VARCHAR2(64),
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_crm_eprod_sales_ecid FOREIGN KEY (ecid) REFERENCES customers(ecid),
  CONSTRAINT fk_crm_eprod_sales_user_pk FOREIGN KEY (pvendor_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_crm_eprod_sales_user_id FOREIGN KEY (pvendor_id) REFERENCES users(user_id),
  CONSTRAINT fk_crm_eprod_sales_root_pk FOREIGN KEY (root_pk) REFERENCES crm_prod_categories(category_pk),
  CONSTRAINT fk_crm_eprod_sales_prod_pk FOREIGN KEY (product_pk) REFERENCES crm_products(product_pk)
);

CREATE OR REPLACE TRIGGER crm_eprod_sales_pk
BEFORE INSERT ON crm_eprod_sales
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "CRM_EPROD_SALES_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- crm eprod transfer log
CREATE SEQUENCE "CRM_EPROD_TRANS_LOG_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE crm_eprod_trans_log (
  log_pk NUMBER PRIMARY KEY,
  table_pk NUMBER,
  ecid NUMBER NOT NULL,
  pvendor_pk NUMBER,
  target_id NUMBER,
  target_pk NUMBER,
  user_name VARCHAR2(50),
  gender CHAR(1) default 'M',
  birth_year VARCHAR2(16),
  job VARCHAR2(12),
  address VARCHAR2(255),
  phone_number VARCHAR2(32),
  serial_no VARCHAR2(25) NOT NULL,
  equip_no VARCHAR2(25),
  root_pk NUMBER,
  category_name VARCHAR2(64),
  product_name VARCHAR2(128),
  purchase_place VARCHAR2(255),
  purchase_date VARCHAR2(32),
  reg_date VARCHAR2(32),
  serious_views VARCHAR2(255),
  purchase_motives VARCHAR2(255),
  old_prod_name VARCHAR2(255),
  survey_up VARCHAR2(511),
  survey_down VARCHAR2(511),
  feedback_msg VARCHAR2(1024),
  outlook VARCHAR2(255),
  led_type VARCHAR2(64),
  has_tv_mount VARCHAR2(32),
  is_kara_user VARCHAR2(32),
  use_bmedia VARCHAR2(32),
  hour_usage VARCHAR2(32),
  computer_usage VARCHAR2(128),
  install_loc VARCHAR2(64),
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  transfered_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_crm_eprod_trans_ecid FOREIGN KEY (ecid) REFERENCES customers(ecid),
  CONSTRAINT fk_crm_eprod_trans_prhn_pk FOREIGN KEY (pvendor_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_crm_eprod_trans_target_id FOREIGN KEY (target_id) REFERENCES customers(ecid),
  CONSTRAINT fk_crm_eprod_trans_target_pk FOREIGN KEY (target_pk) REFERENCES users(user_pk)
);

CREATE OR REPLACE TRIGGER crm_eprod_trans_log_pk
BEFORE INSERT ON crm_eprod_trans_log
FOR EACH ROW
BEGIN
  IF :NEW.log_pk IS NULL THEN
    SELECT "CRM_EPROD_TRANS_LOG_S".NEXTVAL
    INTO :NEW.log_pk
    FROM dual;
  END IF;
END;
/

-- crm product spec value chosen
CREATE SEQUENCE "CRM_EPROD_CHOSEN_SPECS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE crm_eprod_chosen_specs (
  table_pk NUMBER PRIMARY KEY,
  ecid NUMBER NOT NULL,
  serial_no VARCHAR2(25),
  product_pk NUMBER,
  value_pk NUMBER,
  spec_value VARCHAR2(255),
  position NUMBER(2) DEFAULT 0,
  action_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_crm_eprod_chosen_ecid FOREIGN KEY (ecid) REFERENCES customers(ecid),
  CONSTRAINT fk_crm_eprod_chosen_prod_pk FOREIGN KEY (product_pk) REFERENCES crm_products(product_pk),
  CONSTRAINT fk_crm_eprod_chosen_val_pk FOREIGN KEY (value_pk) REFERENCES crm_prod_spec_values(value_pk)
);

CREATE OR REPLACE TRIGGER crm_eprod_chosen_specs_pk
BEFORE INSERT ON crm_eprod_chosen_specs
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "CRM_EPROD_CHOSEN_SPECS_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- crm eprod after service
CREATE SEQUENCE "CRM_EPROD_AS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE crm_eprod_as (
  table_pk NUMBER PRIMARY KEY,
  ecid NUMBER NOT NULL,
  pvendor_pk NUMBER,
  pvendor_id VARCHAR2(50),
  user_name VARCHAR2(50),
  gender CHAR(1) default 'M',
  birth_year VARCHAR2(16),
  job VARCHAR2(12),
  address VARCHAR2(255),
  phone_number VARCHAR2(32),
  serial_no VARCHAR2(25) NOT NULL,
  root_pk NUMBER,
  category_name VARCHAR2(64),
  product_pk NUMBER,
  product_name VARCHAR2(128),
  simple_name VARCHAR2(64),
  damages VARCHAR2(1024),
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_crm_eprod_as_ecid FOREIGN KEY (ecid) REFERENCES customers(ecid),
  CONSTRAINT fk_crm_eprod_as_user_pk FOREIGN KEY (pvendor_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_crm_eprod_as_user_id FOREIGN KEY (pvendor_id) REFERENCES users(user_id),
  CONSTRAINT fk_crm_eprod_as_root_pk FOREIGN KEY (root_pk) REFERENCES crm_prod_categories(category_pk),
  CONSTRAINT fk_crm_eprod_as_prod_pk FOREIGN KEY (product_pk) REFERENCES crm_products(product_pk)
);

CREATE OR REPLACE TRIGGER crm_eprod_as_pk
BEFORE INSERT ON crm_eprod_as
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "CRM_EPROD_AS_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- crm mars cards
CREATE TABLE crm_mars_cards (
  card_pk NUMBER PRIMARY KEY,
  ecid NUMBER,
  pvendor_pk NUMBER,
  pvendor_id VARCHAR2(50),
  prhn_name VARCHAR2(50),
  eshop_pk VARCHAR2(64),
  eshop_id VARCHAR2(50),
  accum_card VARCHAR2(12) NOT NULL,
  wallet_card VARCHAR2(12),
  card_name VARCHAR2(50),
  phone_number VARCHAR2(120),
  birthday VARCHAR2(10),
  crm_level VARCHAR2(50),
  vip_level1 VARCHAR2(50),
  vip_level2 VARCHAR2(50),
  vip_level3 VARCHAR2(50),
  crm_class VARCHAR2(50),
  max_cnt_product VARCHAR2(255),
  all_months NUMBER(4) DEFAULT 0,
  buy_months NUMBER(4) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_crm_mars_card_ecid FOREIGN KEY (ecid) REFERENCES customers(ecid),
  CONSTRAINT fk_crm_mars_card_user_pk FOREIGN KEY (pvendor_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_crm_mars_card_user_id FOREIGN KEY (pvendor_id) REFERENCES users(user_id)
);

-- crm eshop info
CREATE TABLE crm_eshop_info (
  eshop_pk VARCHAR2(64) PRIMARY KEY,
  eshop_id VARCHAR2(50),
  eshop_name VARCHAR2(50),
  ecid NUMBER,
  pvendor_pk NUMBER,
  pvendor_id VARCHAR2(50),
  prhn_name VARCHAR2(50),
  phone_number VARCHAR2(120),
  eshop_gender CHAR(1) default 'M',
  eshop_job VARCHAR2(120),
  eshop_cid VARCHAR2(12),
  crm_level NUMBER(1),
  crm_grade NUMBER(1),
  crm_level_desc VARCHAR2(120),
  crm_grade_desc VARCHAR2(120),
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_crm_eshop_info_ecid FOREIGN KEY (ecid) REFERENCES customers(ecid),
  CONSTRAINT fk_crm_eshop_info_user_pk FOREIGN KEY (pvendor_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_crm_eshop_info_user_id FOREIGN KEY (pvendor_id) REFERENCES users(user_id)
);
