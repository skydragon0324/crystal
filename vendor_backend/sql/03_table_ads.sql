-- predefined layouts
CREATE TABLE predef_layouts (
  predef_id VARCHAR2(255) PRIMARY KEY,
  predef_name VARCHAR2(255) UNIQUE NOT NULL,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO predef_layouts(predef_id, predef_name) VALUES ('t_1x1', '1x1 table');
INSERT INTO predef_layouts(predef_id, predef_name) VALUES ('t_1x2', '1x2 table');
INSERT INTO predef_layouts(predef_id, predef_name) VALUES ('t_1x3', '1x3 table');
INSERT INTO predef_layouts(predef_id, predef_name) VALUES ('t_1x4', '1x4 table');
INSERT INTO predef_layouts(predef_id, predef_name) VALUES ('t_1xn', '1xn table');
INSERT INTO predef_layouts(predef_id, predef_name) VALUES ('t_2x2', '2x2 table');
INSERT INTO predef_layouts(predef_id, predef_name) VALUES ('t_2xn', '2xn table');
INSERT INTO predef_layouts(predef_id, predef_name) VALUES ('g_2x2_21_11_11', 'grid 2x2 with right 2 pieces');
INSERT INTO predef_layouts(predef_id, predef_name) VALUES ('g_2x2_11_11_21', 'grid 2x2 with left 2 pieces');
INSERT INTO predef_layouts(predef_id, predef_name) VALUES ('g_2x3_21_12_12', 'grid 2x3 with right 2 pieces');
INSERT INTO predef_layouts(predef_id, predef_name) VALUES ('g_2x3_12_12_21', 'grid 2x3 with left 2 pieces');
INSERT INTO predef_layouts(predef_id, predef_name) VALUES ('g_2x3_12_11_11_21', 'grid 2x3 but 2 pieces in left-bottom');
INSERT INTO predef_layouts(predef_id, predef_name) VALUES ('g_2x3_21_12_11_11', 'grid 2x3 but 2 pieces in right-bottom');
INSERT INTO predef_layouts(predef_id, predef_name) VALUES ('g_2x3_21_11_11_12', 'grid 2x3 but 2 pieces in right-top');
INSERT INTO predef_layouts(predef_id, predef_name) VALUES ('g_2x3_11_11_12_21', 'grid 2x3 but 2 pieces in left-top');

-- advertisements
CREATE SEQUENCE "ADVERTISEMENTS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE advertisements (
  ad_pk NUMBER PRIMARY KEY,
  title VARCHAR2(255) NOT NULL,
  content CLOB,
  image_url VARCHAR2(255),
  image_ratio NUMBER(7, 4),
  image_sync NUMBER(1) DEFAULT 0,
  content_url VARCHAR2(255),
  content_sync NUMBER(1) DEFAULT 0,
  phone_number VARCHAR2(20),
  ad_action VARCHAR2(255),
  duty_action NUMBER(3),
  note VARCHAR2(255),
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  created_by NUMBER NOT NULL,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_by NUMBER,
  CONSTRAINT fk_ad_created_by FOREIGN KEY (created_by) REFERENCES managers(manager_pk),
  CONSTRAINT fk_ad_updated_by FOREIGN KEY (updated_by) REFERENCES managers(manager_pk)
);

COMMENT ON COLUMN "ADVERTISEMENTS"."TITLE" IS 'Title of advertisement';
COMMENT ON COLUMN "ADVERTISEMENTS"."CONTENT" IS 'Content of advertisement';
COMMENT ON COLUMN "ADVERTISEMENTS"."IMAGE_URL" IS 'Uploaded Image';
COMMENT ON COLUMN "ADVERTISEMENTS"."IMAGE_RATIO" IS 'Aspect ratio of image width : height';
COMMENT ON COLUMN "ADVERTISEMENTS"."IMAGE_SYNC" IS 'image sync status with mobile server, 0: pending, 1: approved';
COMMENT ON COLUMN "ADVERTISEMENTS"."CONTENT_URL" IS 'Content Image';
COMMENT ON COLUMN "ADVERTISEMENTS"."CONTENT_SYNC" IS 'content image sync status with mobile server, 0: pending, 1: approved';
COMMENT ON COLUMN "ADVERTISEMENTS"."PHONE_NUMBER" IS 'Related phone number';
COMMENT ON COLUMN "ADVERTISEMENTS"."AD_ACTION" IS 'advertise action when it is clicked';
COMMENT ON COLUMN "ADVERTISEMENTS"."DUTY_ACTION" IS 'duties.action';
COMMENT ON COLUMN "ADVERTISEMENTS"."NOTE" IS 'Comment for this ad';

CREATE OR REPLACE TRIGGER ad_pk_trigger
BEFORE INSERT ON advertisements
FOR EACH ROW
BEGIN
  IF :NEW.ad_pk IS NULL THEN
    SELECT "ADVERTISEMENTS_S".NEXTVAL
    INTO :NEW.ad_pk
    FROM dual;
  END IF;
END;
/

-- layouts
CREATE SEQUENCE "LAYOUTS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE layouts (
  layout_pk NUMBER PRIMARY KEY,
  predef_id VARCHAR2(255) NOT NULL,
  layout_name VARCHAR2(255) NOT NULL,
  autoplay NUMBER(1) DEFAULT 1,
  show_name NUMBER(1) DEFAULT 0,
  show_more NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  created_by NUMBER NOT NULL,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_by NUMBER,
  CONSTRAINT fk_layout_predef_id FOREIGN KEY (predef_id) REFERENCES predef_layouts(predef_id),
  CONSTRAINT fk_layout_created_by FOREIGN KEY (created_by) REFERENCES managers(manager_pk),
  CONSTRAINT fk_layout_updated_by FOREIGN KEY (updated_by) REFERENCES managers(manager_pk),
  CONSTRAINT ck_layout_autoplay CHECK (autoplay IN (0, 1)),
  CONSTRAINT ck_layout_show_name CHECK (show_name IN (0, 1)),
  CONSTRAINT ck_layout_show_more CHECK (show_more IN (0, 1))
);

COMMENT ON COLUMN "LAYOUTS"."PREDEF_ID" IS 'predef_layouts.layout_id';
COMMENT ON COLUMN "LAYOUTS"."LAYOUT_NAME" IS 'layout name, can be shown on display by show_name flag';
COMMENT ON COLUMN "LAYOUTS"."AUTOPLAY" IS 'autoplay carousel';
COMMENT ON COLUMN "LAYOUTS"."SHOW_NAME" IS 'show layout name on phone';
COMMENT ON COLUMN "LAYOUTS"."SHOW_MORE" IS 'chevron right icon right to the layout name to navigate more';

CREATE OR REPLACE TRIGGER layout_pk_trigger
BEFORE INSERT ON layouts
FOR EACH ROW
BEGIN
  IF :NEW.layout_pk IS NULL THEN
    SELECT "LAYOUTS_S".NEXTVAL
    INTO :NEW.layout_pk
    FROM dual;
  END IF;
END;
/


-- layout vs advertisements
CREATE SEQUENCE "LAYOUT_ADS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE layout_ads (
  table_pk NUMBER PRIMARY KEY,
  layout_pk NUMBER NOT NULL,
  pre_index NUMBER(2) NOT NULL,
  ad_pk NUMBER NOT NULL,
  position NUMBER(2) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  created_by NUMBER NOT NULL,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_by NUMBER NOT NULL,
  CONSTRAINT fk_layout_ads_layout FOREIGN KEY (layout_pk) REFERENCES layouts(layout_pk),
  CONSTRAINT fk_layout_ads_ad FOREIGN KEY (ad_pk) REFERENCES advertisements(ad_pk),
  CONSTRAINT fk_layout_ads_created_by FOREIGN KEY (created_by) REFERENCES managers(manager_pk),
  CONSTRAINT fk_layout_ads_updated_by FOREIGN KEY (updated_by) REFERENCES managers(manager_pk)
);

COMMENT ON COLUMN "LAYOUT_ADS"."LAYOUT_PK" IS 'layouts.layout_pk';
COMMENT ON COLUMN "LAYOUT_ADS"."PRE_INDEX" IS 'predefined index of layout';
COMMENT ON COLUMN "LAYOUT_ADS"."AD_PK" IS 'advertisements.ad_pk';
COMMENT ON COLUMN "LAYOUT_ADS"."POSITION" IS 'display order';

CREATE OR REPLACE TRIGGER layout_ad_table_pk_trigger
BEFORE INSERT ON layout_ads
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "LAYOUT_ADS_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- homepage configs
CREATE SEQUENCE "HOME_CONFIGS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE home_configs (
  table_pk NUMBER PRIMARY KEY,
  config_name VARCHAR2(255) NOT NULL,
  layout_pk NUMBER,
  section_name VARCHAR2(255),
  position NUMBER(2) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  is_test NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  created_by NUMBER NOT NULL,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_by NUMBER NOT NULL,
  CONSTRAINT fk_home_configs_layout FOREIGN KEY (layout_pk) REFERENCES layouts(layout_pk),
  CONSTRAINT fk_home_configs_created_by FOREIGN KEY (created_by) REFERENCES managers(manager_pk),
  CONSTRAINT fk_home_configs_updated_by FOREIGN KEY (updated_by) REFERENCES managers(manager_pk),
  CONSTRAINT chk_layout_or_section CHECK (
    (layout_pk IS NOT NULL AND section_name IS NULL) OR
    (layout_pk IS NULL AND section_name IS NOT NULL)
  )
);

COMMENT ON COLUMN "HOME_CONFIGS"."CONFIG_NAME" IS 'config name to distinguish layout or section';
COMMENT ON COLUMN "HOME_CONFIGS"."LAYOUT_PK" IS 'layouts.layout_pk';
COMMENT ON COLUMN "HOME_CONFIGS"."POSITION" IS 'display order';
COMMENT ON COLUMN "HOME_CONFIGS"."SECTION_NAME" IS 'predefined name with app to show section that is not layout';
COMMENT ON COLUMN "HOME_CONFIGS"."IS_DELETED" IS 'soft delete flag';
COMMENT ON COLUMN "HOME_CONFIGS"."IS_TEST" IS 'flag to indicate it is used for test';

CREATE OR REPLACE TRIGGER home_configs_table_pk_trigger
BEFORE INSERT ON home_configs
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "HOME_CONFIGS_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- home_menus
CREATE SEQUENCE "HOME_MENUS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE home_menus (
  menu_pk NUMBER PRIMARY KEY,
  icon_name VARCHAR2(255),
  icon_url VARCHAR2(255),
  menu_name VARCHAR2(255) NOT NULL,
  menu_action VARCHAR2(255),
  message VARCHAR2(255),
  position NUMBER(2) DEFAULT 0,
  note VARCHAR2(255),
  is_deleted NUMBER(1) DEFAULT 0,
  is_test NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  created_by NUMBER NOT NULL,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_by NUMBER NOT NULL,
  CONSTRAINT fk_home_menus_created_by FOREIGN KEY (created_by) REFERENCES managers(manager_pk),
  CONSTRAINT fk_home_menus_updated_by FOREIGN KEY (updated_by) REFERENCES managers(manager_pk),
  CONSTRAINT chk_action_or_message CHECK (
    (menu_action IS NOT NULL) OR
    (menu_action IS NULL AND message IS NOT NULL)
  )
);

COMMENT ON COLUMN "HOME_MENUS"."ICON_NAME" IS 'name of the icon, used for pre-allocated icon files';
COMMENT ON COLUMN "HOME_MENUS"."ICON_URL" IS 'url of the icon, used for dynamic icon loading';
COMMENT ON COLUMN "HOME_MENUS"."MENU_NAME" IS 'name of the menu item';
COMMENT ON COLUMN "HOME_MENUS"."MENU_ACTION" IS 'action to perform when then menu is clicked (can be NULL)';
COMMENT ON COLUMN "HOME_MENUS"."MESSAGE" IS 'toast message to show when menu_action is NULL';
COMMENT ON COLUMN "HOME_MENUS"."NOTE" IS 'note (action can be activity, and if you temporally clear action, please backup to here)';
COMMENT ON COLUMN "HOME_MENUS"."POSITION" IS 'sort order';
COMMENT ON COLUMN "HOME_MENUS"."IS_DELETED" IS 'soft delete flag';
COMMENT ON COLUMN "HOME_MENUS"."IS_TEST" IS 'test flag, 1: for test';

CREATE OR REPLACE TRIGGER home_menu_pk_trigger
BEFORE INSERT ON home_menus
FOR EACH ROW
BEGIN
  IF :NEW.menu_pk IS NULL THEN
    SELECT "HOME_MENUS_S".NEXTVAL
    INTO :NEW.menu_pk
    FROM dual;
  END IF;
END;
/

-- home popups
CREATE SEQUENCE "HOME_POPUPS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE home_popups (
  table_pk NUMBER PRIMARY KEY,
  image_url VARCHAR2(255),
  image_sync NUMBER(1) DEFAULT 0,
  position NUMBER(2) DEFAULT 0,
  start_date DATE,
  end_date DATE,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  created_by NUMBER NOT NULL,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_by NUMBER,
  CONSTRAINT fk_home_popup_created_by FOREIGN KEY (created_by) REFERENCES managers(manager_pk),
  CONSTRAINT fk_home_popup_updated_by FOREIGN KEY (updated_by) REFERENCES managers(manager_pk)
);

COMMENT ON COLUMN "HOME_POPUPS"."IMAGE_URL" IS 'URL of the image';
COMMENT ON COLUMN "HOME_POPUPS"."IMAGE_STATUS" IS 'sync status with mobile server, 0: pending, 1: approved';
COMMENT ON COLUMN "HOME_POPUPS"."POSITION" IS 'sort order';

CREATE OR REPLACE TRIGGER home_popup_table_pk_trigger
BEFORE INSERT ON home_popups
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "HOME_POPUPS_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- page banners
CREATE SEQUENCE "PAGE_BANNERS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE page_banners (
  table_pk NUMBER PRIMARY KEY,
  image_url VARCHAR2(255),
  image_ratio NUMBER(7, 4),
  page_type NUMBER(1) DEFAULT 0,
  position NUMBER(2) DEFAULT 0,
  action VARCHAR2(255),
  status NUMBER(1) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON COLUMN "PAGE_BANNERS"."IMAGE_URL" IS 'URL of the banner image';
COMMENT ON COLUMN "PAGE_BANNERS"."IMAGE_RATIO" IS 'Aspect ratio of image width : height';
COMMENT ON COLUMN "PAGE_BANNERS"."PAGE_TYPE" IS '0: experience, 1: products';
COMMENT ON COLUMN "PAGE_BANNERS"."ACTION" IS 'action';
COMMENT ON COLUMN "PAGE_BANNERS"."STATUS" IS '0: pending, 1: approved';
COMMENT ON COLUMN "PAGE_BANNERS"."POSITION" IS 'sort order';

CREATE OR REPLACE TRIGGER page_banner_table_pk_trigger
BEFORE INSERT ON page_banners
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "PAGE_BANNERS_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/
