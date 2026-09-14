-- product categories
CREATE SEQUENCE "PRODUCT_CATEGORIES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 2 START WITH 1 NOCACHE;

CREATE TABLE product_categories (
  category_pk NUMBER PRIMARY KEY,
  category_name VARCHAR2(64),
  node_value VARCHAR2(64),
  parent_pk NUMBER,
  position NUMBER(2) DEFAULT 0,
  is_leaf NUMBER(1) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON COLUMN "PRODUCT_CATEGORIES"."CATEGORY_NAME" IS 'category name';
COMMENT ON COLUMN "PRODUCT_CATEGORIES"."NODE_VALUE" IS 'unique value representing node by reverse 2-chars';
COMMENT ON COLUMN "PRODUCT_CATEGORIES"."PARENT_PK" IS 'product_categories.category_pk';
COMMENT ON COLUMN "PRODUCT_CATEGORIES"."POSITION" IS 'sort order';
COMMENT ON COLUMN "PRODUCT_CATEGORIES"."IS_LEAF" IS '0: not leaf, 1: leaf';

CREATE OR REPLACE TRIGGER product_category_pk_trigger
BEFORE INSERT ON product_categories
FOR EACH ROW
BEGIN
  IF :NEW.category_pk IS NULL THEN
    SELECT "PRODUCT_CATEGORIES_S".NEXTVAL
    INTO :NEW.category_pk
    FROM dual;
  END IF;
END;
/

-- products
CREATE SEQUENCE "PRODUCTS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 3 START WITH 1 NOCACHE;

CREATE TABLE products (
  product_pk NUMBER PRIMARY KEY,
  product_name VARCHAR2(128),
  simple_name VARCHAR2(64),
  category_pk NUMBER NOT NULL,
  root_pk NUMBER NOT NULL,
  image_url VARCHAR2(255),
  price NUMBER(8, 1) DEFAULT 0,
  position NUMBER(2) DEFAULT 0,
  is_new NUMBER(1) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  status NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_product_category_pk FOREIGN KEY (category_pk) REFERENCES product_categories(category_pk),
  CONSTRAINT fk_product_root_pk FOREIGN KEY (root_pk) REFERENCES product_categories(category_pk)
);

COMMENT ON COLUMN "PRODUCTS"."PRODUCT_NAME" IS 'product name';
COMMENT ON COLUMN "PRODUCTS"."SIMPLE_NAME" IS 'product simple name';
COMMENT ON COLUMN "PRODUCTS"."CATEGORY_PK" IS 'product_categories.category_pk';
COMMENT ON COLUMN "PRODUCTS"."ROOT_PK" IS 'product_categories.category_pk, whose parent_pk is 0';
COMMENT ON COLUMN "PRODUCTS"."IMAGE_URL" IS 'image that shown on product list';
COMMENT ON COLUMN "PRODUCTS"."PRICE" IS 'price';
COMMENT ON COLUMN "PRODUCTS"."IS_NEW" IS '0: not new, 1: new';
COMMENT ON COLUMN "PRODUCTS"."STATUS" IS '0: pending, 1: approved';

CREATE OR REPLACE TRIGGER products_pk_trigger
BEFORE INSERT ON products
FOR EACH ROW
BEGIN
  IF :NEW.product_pk IS NULL THEN
    SELECT "PRODUCTS_S".NEXTVAL
    INTO :NEW.product_pk
    FROM dual;
  END IF;
END;
/

-- product images
CREATE SEQUENCE "PRODUCT_IMAGES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE product_images (
  table_pk NUMBER PRIMARY KEY,
  product_pk NUMBER NOT NULL,
  image_type NUMBER(1),
  image_url VARCHAR2(255),
  image_ratio NUMBER(7, 4),
  position NUMBER(2) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  status NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_product_img_product_pk FOREIGN KEY (product_pk) REFERENCES products(product_pk)
);

COMMENT ON COLUMN "PRODUCT_IMAGES"."PRODUCT_PK" IS 'products.product_pk';
COMMENT ON COLUMN "PRODUCT_IMAGES"."IMAGE_TYPE" IS '0: main, 1: intro';
COMMENT ON COLUMN "PRODUCT_IMAGES"."IMAGE_URL" IS 'image that shown on product list';
COMMENT ON COLUMN "PRODUCT_IMAGES"."IMAGE_RATIO" IS 'Aspect ratio of image width : height';
COMMENT ON COLUMN "PRODUCT_IMAGES"."STATUS" IS '0: pending, 1: approved';

CREATE OR REPLACE TRIGGER product_images_pk_trigger
BEFORE INSERT ON product_images
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "PRODUCT_IMAGES_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- product spec keys
CREATE SEQUENCE "PRODUCT_SPEC_KEYS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE product_spec_keys (
  spec_pk NUMBER PRIMARY KEY,
  spec_name VARCHAR2(64),
  spec_type NUMBER(1) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON COLUMN "PRODUCT_SPEC_KEYS"."SPEC_NAME" IS 'spec name';
COMMENT ON COLUMN "PRODUCT_SPEC_KEYS"."SPEC_TYPE" IS '0: string, 1: textarea, 2: number';

CREATE OR REPLACE TRIGGER product_spec_key_pk_trigger
BEFORE INSERT ON product_spec_keys
FOR EACH ROW
BEGIN
  IF :NEW.spec_pk IS NULL THEN
    SELECT "PRODUCT_SPEC_KEYS_S".NEXTVAL
    INTO :NEW.spec_pk
    FROM dual;
  END IF;
END;
/

-- product spec values
CREATE SEQUENCE "PRODUCT_SPEC_VALUES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE product_spec_values (
  table_pk NUMBER PRIMARY KEY,
  product_pk NUMBER,
  spec_pk NUMBER,
  spec_value VARCHAR2(255),
  position NUMBER(2) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_prod_spec_val_product_pk FOREIGN KEY (product_pk) REFERENCES products(product_pk),
  CONSTRAINT fk_prod_spec_val_spec_pk FOREIGN KEY (spec_pk) REFERENCES product_spec_keys(spec_pk),
  CONSTRAINT uq_product_spec_value UNIQUE (product_pk, spec_pk)
);

COMMENT ON COLUMN "PRODUCT_SPEC_VALUES"."PRODUCT_PK" IS 'products.product_pk';
COMMENT ON COLUMN "PRODUCT_SPEC_VALUES"."SPEC_PK" IS 'product_spec_keys.spec_pk';
COMMENT ON COLUMN "PRODUCT_SPEC_VALUES"."SPEC_VALUE" IS 'spec value';

CREATE OR REPLACE TRIGGER product_spec_val_pk_trigger
BEFORE INSERT ON product_spec_values
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "PRODUCT_SPEC_VALUES_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- product spec orders
CREATE SEQUENCE "PRODUCT_SPEC_ORDERS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE product_spec_orders (
  table_pk NUMBER PRIMARY KEY,
  root_pk NUMBER NOT NULL,
  spec_pk NUMBER NOT NULL,
  position NUMBER(2) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_prod_spec_order_root_pk FOREIGN KEY (root_pk) REFERENCES product_categories(category_pk),
  CONSTRAINT fk_prod_spec_order_spec_pk FOREIGN KEY (spec_pk) REFERENCES product_spec_keys(spec_pk)
);

COMMENT ON COLUMN "PRODUCT_SPEC_ORDERS"."ROOT_PK" IS 'product_categories.category_pk';
COMMENT ON COLUMN "PRODUCT_SPEC_ORDERS"."SPEC_PK" IS 'product_spec_keys.spec_pk';

CREATE OR REPLACE TRIGGER product_spec_order_pk_trigger
BEFORE INSERT ON product_spec_orders
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "PRODUCT_SPEC_ORDERS_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- product models
CREATE SEQUENCE "PRODUCT_MODELS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE product_models (
  model_pk NUMBER PRIMARY KEY,
  product_pk NUMBER UNIQUE NOT NULL,
  model_name VARCHAR2(128) NOT NULL,
  reservable NUMBER(1) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  created_by NUMBER,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_by NUMBER,
  CONSTRAINT fk_prod_model_product_pk FOREIGN KEY (product_pk) REFERENCES products(product_pk),
  CONSTRAINT fk_prod_model_created_by FOREIGN KEY (created_by) REFERENCES managers(manager_pk),
  CONSTRAINT fk_prod_model_updated_by FOREIGN KEY (updated_by) REFERENCES managers(manager_pk)
);

COMMENT ON COLUMN "PRODUCT_MODELS"."PRODUCT_PK" IS 'products.product_pk';
COMMENT ON COLUMN "PRODUCT_MODELS"."MODEL_NAME" IS 'product model name';
COMMENT ON COLUMN "PRODUCT_MODELS"."RESERVABLE" IS '1: reservable new phone by registering this phone model';
COMMENT ON COLUMN "PRODUCT_MODELS"."IS_DELETED" IS '0: not deleted, 1: deleted';

CREATE OR REPLACE TRIGGER product_model_pk_trigger
BEFORE INSERT ON product_models
FOR EACH ROW
BEGIN
  IF :NEW.model_pk IS NULL THEN
    SELECT "PRODUCT_MODELS_S".NEXTVAL
    INTO :NEW.model_pk
    FROM dual;
  END IF;
END;
/

-- register_point_types
CREATE SEQUENCE "REGISTER_POINT_TYPES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 2 START WITH 1 NOCACHE;

CREATE TABLE register_point_types (
  type_pk NUMBER PRIMARY KEY,
  product_pk NUMBER UNIQUE NOT NULL,
  points NUMBER(8, 1) DEFAULT 0 NOT NULL,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  created_by NUMBER,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_by NUMBER,
  CONSTRAINT fk_reg_point_product_pk FOREIGN KEY (product_pk) REFERENCES products(product_pk),
  CONSTRAINT fk_reg_point_created_by FOREIGN KEY (created_by) REFERENCES managers(manager_pk),
  CONSTRAINT fk_reg_point_updated_by FOREIGN KEY (updated_by) REFERENCES managers(manager_pk)
);

COMMENT ON COLUMN "REGISTER_POINT_TYPES"."PRODUCT_PK" IS 'products.product_pk';
COMMENT ON COLUMN "REGISTER_POINT_TYPES"."POINTS" IS 'point to be achieved';

CREATE OR REPLACE TRIGGER register_point_type_pk_trigger
BEFORE INSERT ON register_point_types
FOR EACH ROW
BEGIN
  IF :NEW.type_pk IS NULL THEN
    SELECT "REGISTER_POINT_TYPES_S".NEXTVAL
    INTO :NEW.type_pk
    FROM dual;
  END IF;
END;
/

-- register_phone_log
CREATE SEQUENCE "REGISTER_PHONE_LOG_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 2 START WITH 1 NOCACHE;

CREATE TABLE register_phone_log (
  table_pk NUMBER PRIMARY KEY,
  user_pk NUMBER NOT NULL,
  product_pk NUMBER NOT NULL,
  points NUMBER(8, 1) DEFAULT 0 NOT NULL,
  phone_imei VARCHAR2(20) NOT NULL,
  cid VARCHAR2(12) NOT NULL,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reg_phone_product_pk FOREIGN KEY (product_pk) REFERENCES products(product_pk)
);

COMMENT ON COLUMN "REGISTER_PHONE_LOG"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "REGISTER_PHONE_LOG"."PRODUCT_PK" IS 'products.product_pk';
COMMENT ON COLUMN "REGISTER_PHONE_LOG"."POINTS" IS 'point to be achieved';
COMMENT ON COLUMN "REGISTER_PHONE_LOG"."PHONE_IMEI" IS 'phone imei';
COMMENT ON COLUMN "REGISTER_PHONE_LOG"."CID" IS 'SIM CID';
COMMENT ON COLUMN "REGISTER_PHONE_LOG"."IS_DELETED" IS '1: deleted';

CREATE OR REPLACE TRIGGER register_phone_pk_trigger
BEFORE INSERT ON register_phone_log
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "REGISTER_PHONE_LOG_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- phone imei prefix
CREATE SEQUENCE "PHONE_IMEI_PREFIX_S" MINVALUE 1000 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 1000 NOCACHE;

CREATE TABLE phone_imei_prefix (
  prefix_pk NUMBER PRIMARY KEY,
  product_pk NUMBER NOT NULL,
  prefix_str VARCHAR2(15) NOT NULL,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_phone_imei_product_pk FOREIGN KEY (product_pk) REFERENCES products(product_pk)
);

COMMENT ON COLUMN "PHONE_IMEI_PREFIX"."PRODUCT_PK" IS 'products.product_pk';
COMMENT ON COLUMN "PHONE_IMEI_PREFIX"."PREFIX_STR" IS 'IMEI prefix';

CREATE OR REPLACE TRIGGER phone_imei_prefix_pk_trigger
BEFORE INSERT ON phone_imei_prefix
FOR EACH ROW
BEGIN
  IF :NEW.prefix_pk IS NULL THEN
    SELECT "PHONE_IMEI_PREFIX_S".NEXTVAL
    INTO :NEW.prefix_pk
    FROM dual;
  END IF;
END;
/

-- phone accessories
CREATE SEQUENCE "PHONE_ACCESSORIES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 2 START WITH 1 NOCACHE;

CREATE TABLE phone_accessories (
  accessory_pk NUMBER PRIMARY KEY,
  product_pk NUMBER NOT NULL,
  product_name VARCHAR2(128),
  accessory_name VARCHAR2(128),
  resource_price NUMBER(6, 2) DEFAULT 0,
  service_price NUMBER(6, 2) DEFAULT 0,
  allow_num VARCHAR2(32),
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_phone_acc_product_pk FOREIGN KEY (product_pk) REFERENCES products(product_pk),
  CONSTRAINT uq_phone_acc_prod_name UNIQUE (product_pk, accessory_name)
);

COMMENT ON COLUMN "PHONE_ACCESSORIES"."PRODUCT_PK" IS 'products.product_pk';
COMMENT ON COLUMN "PHONE_ACCESSORIES"."PRODUCT_NAME" IS 'products.simple_name';
COMMENT ON COLUMN "PHONE_ACCESSORIES"."ACCESSORY_NAME" IS 'accessory name';
COMMENT ON COLUMN "PHONE_ACCESSORIES"."RESOURCE_PRICE" IS 'resource price';
COMMENT ON COLUMN "PHONE_ACCESSORIES"."SERVICE_PRICE" IS 'service price';
COMMENT ON COLUMN "PHONE_ACCESSORIES"."ALLOW_NUM" IS 'price allow number';
COMMENT ON COLUMN "PHONE_ACCESSORIES"."IS_DELETED" IS '1: deleted';

CREATE OR REPLACE TRIGGER phone_accessories_pk
BEFORE INSERT ON phone_accessories
FOR EACH ROW
BEGIN
  IF :NEW.accessory_pk IS NULL THEN
    SELECT "PHONE_ACCESSORIES_S".NEXTVAL
    INTO :NEW.accessory_pk
    FROM dual;
  END IF;
END;
/

-- phone changelog
CREATE SEQUENCE "PHONE_CHANGELOG_S" MINVALUE 1000 MAXVALUE 9999999999999999999 INCREMENT BY 2 START WITH 1000 NOCACHE;

CREATE TABLE phone_changelog (
  table_pk NUMBER PRIMARY KEY,
  product_pk NUMBER NOT NULL,
  product_name VARCHAR2(128),
  title VARCHAR2(512),
  content NCLOB,
  publish_num VARCHAR2(128),
  position NUMBER(3) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_phone_log_product_pk FOREIGN KEY (product_pk) REFERENCES products(product_pk)
);

COMMENT ON COLUMN "PHONE_CHANGELOG"."PRODUCT_PK" IS 'products.product_pk';
COMMENT ON COLUMN "PHONE_CHANGELOG"."PRODUCT_NAME" IS 'products.simple_name';
COMMENT ON COLUMN "PHONE_CHANGELOG"."TITLE" IS 'title';
COMMENT ON COLUMN "PHONE_CHANGELOG"."CONTENT" IS 'content';
COMMENT ON COLUMN "PHONE_CHANGELOG"."PUBLISH_NUM" IS 'publish accept number';
COMMENT ON COLUMN "PHONE_CHANGELOG"."POSITION" IS 'position';
COMMENT ON COLUMN "PHONE_CHANGELOG"."IS_DELETED" IS '1: deleted';

CREATE OR REPLACE TRIGGER phone_changelog_pk
BEFORE INSERT ON phone_changelog
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "PHONE_CHANGELOG_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/
