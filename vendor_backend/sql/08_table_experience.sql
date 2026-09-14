-- duties
CREATE SEQUENCE "DUTIES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE duties (
  duty_pk NUMBER PRIMARY KEY,
  duty_title VARCHAR2(255) NOT NULL,
  icon_name VARCHAR2(255),
  icon_url VARCHAR2(255),
  point_type NUMBER(6) DEFAULT 0 NOT NULL,
  action NUMBER(3),
  content CLOB,
  image_url VARCHAR2(255),
  duty_type NUMBER(1) DEFAULT 0 NOT NULL,
  start_date DATE,
  end_date DATE,
  disp_date DATE,
  position NUMBER(2) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  created_by NUMBER,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_by NUMBER,
  CONSTRAINT fk_duties_created_by FOREIGN KEY (created_by) REFERENCES managers(manager_pk),
  CONSTRAINT fk_duties_updated_by FOREIGN KEY (updated_by) REFERENCES managers(manager_pk)
);

COMMENT ON COLUMN "DUTIES"."DUTY_TITLE" IS 'title of the duty';
COMMENT ON COLUMN "DUTIES"."ICON_NAME" IS 'name of the duty icon';
COMMENT ON COLUMN "DUTIES"."ICON_URL" IS 'url of the duty icon';
COMMENT ON COLUMN "DUTIES"."POINT_TYPE" IS 'activity_point_types.type_pk, if 4-length, it can be prefix';
COMMENT ON COLUMN "DUTIES"."ACTION" IS 'predefined action related to the duty';
COMMENT ON COLUMN "DUTIES"."CONTENT" IS 'content of the duty (html)';
COMMENT ON COLUMN "DUTIES"."IMAGE_URL" IS 'url for the image related to the duty';
COMMENT ON COLUMN "DUTIES"."DUTY_TYPE" IS '0: daily, 1: periodically';
COMMENT ON COLUMN "DUTIES"."START_DATE" IS 'start date (only for periodically duties)';
COMMENT ON COLUMN "DUTIES"."END_DATE" IS 'end date (only for periodically duties)';
COMMENT ON COLUMN "DUTIES"."DISP_DATE" IS 'display date (only for periodically duties)';

CREATE OR REPLACE TRIGGER duty_pk_trigger
BEFORE INSERT ON duties
FOR EACH ROW
BEGIN
  IF :NEW.duty_pk IS NULL THEN
    SELECT "DUTIES_S".NEXTVAL
    INTO :NEW.duty_pk
    FROM dual;
  END IF;
END;
/

-- achievements
CREATE SEQUENCE "ACHIEVEMENTS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE achievements (
  table_pk NUMBER PRIMARY KEY,
  user_pk NUMBER NOT NULL,
  duty_pk NUMBER NOT NULL,
  point_type NUMBER(6) DEFAULT 0 NOT NULL,
  points NUMBER(8, 1) DEFAULT 0 NOT NULL,
  action_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_achieve_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_achieve_duty_pk FOREIGN KEY (duty_pk) REFERENCES duties(duty_pk)
);

COMMENT ON COLUMN "ACHIEVEMENTS"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "ACHIEVEMENTS"."DUTY_PK" IS 'duties.duty_pk';
COMMENT ON COLUMN "ACHIEVEMENTS"."POINT_TYPE" IS 'activity_point_types.type_pk';
COMMENT ON COLUMN "ACHIEVEMENTS"."POINTS" IS 'point achieved, once duty point is changed, it can be used for logging';

CREATE OR REPLACE TRIGGER achieve_table_pk_trigger
BEFORE INSERT ON achievements
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "ACHIEVEMENTS_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/
