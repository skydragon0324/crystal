-- activity point types with predefined pks
CREATE TABLE activity_point_types (
  type_pk NUMBER(6) PRIMARY KEY,
  main_type VARCHAR2(100) NOT NULL,
  sub_type VARCHAR2(100),
  note VARCHAR2(255),
  points NUMBER(8, 1) DEFAULT 0 NOT NULL,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  created_by NUMBER,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_by NUMBER,
  CONSTRAINT fk_act_point_type_created_by FOREIGN KEY (created_by) REFERENCES managers(manager_pk),
  CONSTRAINT fk_act_point_type_updated_by FOREIGN KEY (updated_by) REFERENCES managers(manager_pk)
);

COMMENT ON COLUMN "ACTIVITY_POINT_TYPES"."TYPE_PK" IS '6-length predefined type, first 2 for main type, second 2 for sub type, last 2 for everyday';
COMMENT ON COLUMN "ACTIVITY_POINT_TYPES"."MAIN_TYPE" IS 'main type';
COMMENT ON COLUMN "ACTIVITY_POINT_TYPES"."SUB_TYPE" IS 'sub type';
COMMENT ON COLUMN "ACTIVITY_POINT_TYPES"."NOTE" IS 'comment for point type';
COMMENT ON COLUMN "ACTIVITY_POINT_TYPES"."POINTS" IS 'point to be achieved';

-- activity point log
CREATE SEQUENCE "ACTIVITY_POINT_LOG_S" MINVALUE 10000000 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 10000000 CACHE 20;

CREATE TABLE activity_point_log (
  table_pk NUMBER PRIMARY KEY,
  user_pk NUMBER NOT NULL,
  type_pk NUMBER(6) NOT NULL,
  points NUMBER(8, 1) DEFAULT 0 NOT NULL,
  reason VARCHAR(255),
  related_pk NUMBER,
  everyday_cnt NUMBER(1),
  ip_address VARCHAR2(45),
  action_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_point_log_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk)
);

COMMENT ON COLUMN "ACTIVITY_POINT_LOG"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "ACTIVITY_POINT_LOG"."TYPE_PK" IS 'activity_point_types.type_pk';
COMMENT ON COLUMN "ACTIVITY_POINT_LOG"."POINTS" IS 'point achieved';
COMMENT ON COLUMN "ACTIVITY_POINT_LOG"."REASON" IS 'description of action, can be null, only available for add/delete points by manager';
COMMENT ON COLUMN "ACTIVITY_POINT_LOG"."RELATED_PK" IS 'foreign key to the relevant table (for ora_blog, achievement), -1 activity point when merge fixed id';
COMMENT ON COLUMN "ACTIVITY_POINT_LOG"."EVERYDAY_CNT" IS 'everyday login count when merge fixed_id';
COMMENT ON COLUMN "ACTIVITY_POINT_LOG"."IP_ADDRESS" IS 'ip address when point achieved by using fixed network';

CREATE OR REPLACE TRIGGER activity_point_pk_trigger
BEFORE INSERT ON activity_point_log
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "ACTIVITY_POINT_LOG_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- activity point stats
CREATE SEQUENCE "ACTIVITY_POINT_STATS_S" MINVALUE 10000000 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 10000000 CACHE 20;

CREATE TABLE activity_point_stats (
  table_pk NUMBER PRIMARY KEY,
  user_pk NUMBER UNIQUE NOT NULL,
  total_points NUMBER(8, 1) DEFAULT 0,
  limit_points NUMBER(8, 1) DEFAULT 0,
  minus_points NUMBER(8, 1) DEFAULT 0,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_point_stats_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk)
);

COMMENT ON COLUMN "ACTIVITY_POINT_STATS"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "ACTIVITY_POINT_STATS"."TOTAL_POINTS" IS 'total point achieved';
COMMENT ON COLUMN "ACTIVITY_POINT_STATS"."LIMIT_POINTS" IS 'points archieved until activity limit date';
COMMENT ON COLUMN "ACTIVITY_POINT_STATS"."MINUS_POINTS" IS 'total minus points by phone book';

CREATE OR REPLACE TRIGGER activity_stats_pk_trigger
BEFORE INSERT ON activity_point_stats
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "ACTIVITY_POINT_STATS_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- activity limits to represent summarizing points of limit date
CREATE SEQUENCE "ACTIVITY_LIMITS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE activity_limits (
  table_pk NUMBER PRIMARY KEY,
  activity_source NUMBER(1) UNIQUE NOT NULL,
  limit_time DATE,
  status NUMBER(1) DEFAULT 0,
  target_rank NUMBER(4) DEFAULT 0,
  top_count NUMBER(2) DEFAULT 0,
  surroundings NUMBER(2) DEFAULT 0,
  description VARCHAR2(1024),
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON COLUMN "ACTIVITY_LIMITS"."ACTIVITY_SOURCE" IS '0: activity_point, 1: soft point, 2: register point';
COMMENT ON COLUMN "ACTIVITY_LIMITS"."LIMIT_TIME" IS 'activity limit time';
COMMENT ON COLUMN "ACTIVITY_LIMITS"."STATUS" IS '0: inactive, 1: active';
COMMENT ON COLUMN "ACTIVITY_LIMITS"."TARGET_RANK" IS 'target rank';
COMMENT ON COLUMN "ACTIVITY_LIMITS"."TOP_COUNT" IS 'top count to be displayed';
COMMENT ON COLUMN "ACTIVITY_LIMITS"."SURROUNDINGS" IS 'surroundings to be displayed';
COMMENT ON COLUMN "ACTIVITY_LIMITS"."DESCRIPTION" IS 'description';

CREATE OR REPLACE TRIGGER activity_limit_pk_trigger
BEFORE INSERT ON activity_limits
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "ACTIVITY_LIMITS_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- appstore point log
CREATE SEQUENCE "APPSTORE_POINT_LOG_S" MINVALUE 10000000 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 10000000 CACHE 20;

CREATE TABLE appstore_point_log (
  table_pk NUMBER PRIMARY KEY,
  user_pk NUMBER NOT NULL,
  status NUMBER(1) DEFAULT 0 NOT NULL,
  reason VARCHAR(255),
  equ_num VARCHAR(64),
  pay_points NUMBER(10, 3) DEFAULT 0,
  soft_points NUMBER(8, 3) DEFAULT 0 NOT NULL,
  related_pk VARCHAR2(48),
  is_agency NUMBER(1) DEFAULT 0,
  action_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_appstore_point_log_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk)
);

COMMENT ON COLUMN "APPSTORE_POINT_LOG"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "APPSTORE_POINT_LOG"."STATUS" IS '0: plus, 1: minus, 2: refund';
COMMENT ON COLUMN "APPSTORE_POINT_LOG"."REASON" IS 'appstore: app name';
COMMENT ON COLUMN "APPSTORE_POINT_LOG"."EQU_NUM" IS 'device number';
COMMENT ON COLUMN "APPSTORE_POINT_LOG"."PAY_POINTS" IS 'pay points, exactly won';
COMMENT ON COLUMN "APPSTORE_POINT_LOG"."SOFT_POINTS" IS 'soft points';
COMMENT ON COLUMN "APPSTORE_POINT_LOG"."RELATED_PK" IS 'foreign key to the relevant table of appstore, -1 appstore point when merge appstore id';
COMMENT ON COLUMN "APPSTORE_POINT_LOG"."IS_AGENCY" IS '0: user, 1: agency';

CREATE OR REPLACE TRIGGER appstore_point_pk_trigger
BEFORE INSERT ON appstore_point_log
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "APPSTORE_POINT_LOG_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- appstore point stats
CREATE SEQUENCE "APPSTORE_POINT_STATS_S" MINVALUE 10000000 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 10000000 CACHE 20;

CREATE TABLE appstore_point_stats (
  table_pk NUMBER PRIMARY KEY,
  user_pk NUMBER UNIQUE NOT NULL,
  total_points NUMBER(8, 3) DEFAULT 0,
  limit_points NUMBER(8, 3) DEFAULT 0,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_app_point_stats_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk)
);

COMMENT ON COLUMN "APPSTORE_POINT_STATS"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "APPSTORE_POINT_STATS"."TOTAL_POINTS" IS 'total point achieved';
COMMENT ON COLUMN "APPSTORE_POINT_STATS"."LIMIT_POINTS" IS 'points archieved until activity limit date';

CREATE OR REPLACE TRIGGER app_point_stats_pk_trigger
BEFORE INSERT ON appstore_point_stats
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "APPSTORE_POINT_STATS_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- karaoke point log
CREATE SEQUENCE "KARAOKE_POINT_LOG_S" MINVALUE 10000000 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 10000000 CACHE 20;

CREATE TABLE karaoke_point_log (
  table_pk NUMBER PRIMARY KEY,
  user_pk NUMBER NOT NULL,
  status NUMBER(1) DEFAULT 0 NOT NULL,
  reason VARCHAR(255),
  equ_num VARCHAR(64),
  pay_points NUMBER(10, 3) DEFAULT 0,
  soft_points NUMBER(8, 3) DEFAULT 0 NOT NULL,
  related_pk VARCHAR2(48),
  is_agency NUMBER(1) DEFAULT 0,
  action_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_karaoke_point_log_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk)
);

COMMENT ON COLUMN "KARAOKE_POINT_LOG"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "KARAOKE_POINT_LOG"."STATUS" IS '0: plus, 1: minus, 2: refund';
COMMENT ON COLUMN "KARAOKE_POINT_LOG"."REASON" IS 'karaoke, or other reason';
COMMENT ON COLUMN "KARAOKE_POINT_LOG"."EQU_NUM" IS 'device number';
COMMENT ON COLUMN "KARAOKE_POINT_LOG"."PAY_POINTS" IS 'pay points, exactly won';
COMMENT ON COLUMN "KARAOKE_POINT_LOG"."SOFT_POINTS" IS 'soft points';
COMMENT ON COLUMN "KARAOKE_POINT_LOG"."RELATED_PK" IS 'foreign key to the relevant table, -2 karaoke point when merge fixed id';
COMMENT ON COLUMN "KARAOKE_POINT_LOG"."IS_AGENCY" IS '0: user, 1: agency';

CREATE OR REPLACE TRIGGER karaoke_point_pk_trigger
BEFORE INSERT ON karaoke_point_log
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "KARAOKE_POINT_LOG_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- karaoke point stats
CREATE SEQUENCE "KARAOKE_POINT_STATS_S" MINVALUE 10000000 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 10000000 CACHE 20;

CREATE TABLE karaoke_point_stats (
  table_pk NUMBER PRIMARY KEY,
  user_pk NUMBER UNIQUE NOT NULL,
  total_points NUMBER(8, 3) DEFAULT 0,
  limit_points NUMBER(8, 3) DEFAULT 0,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_kara_point_stats_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk)
);

COMMENT ON COLUMN "KARAOKE_POINT_STATS"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "KARAOKE_POINT_STATS"."TOTAL_POINTS" IS 'total point achieved';
COMMENT ON COLUMN "KARAOKE_POINT_STATS"."LIMIT_POINTS" IS 'points archieved until activity limit date';

CREATE OR REPLACE TRIGGER kara_point_stats_pk_trigger
BEFORE INSERT ON karaoke_point_stats
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "KARAOKE_POINT_STATS_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- bmedia point log
CREATE SEQUENCE "BMEDIA_POINT_LOG_S" MINVALUE 10000000 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 10000000 CACHE 20;

CREATE TABLE bmedia_point_log (
  table_pk NUMBER PRIMARY KEY,
  user_pk NUMBER NOT NULL,
  status NUMBER(1) DEFAULT 0 NOT NULL,
  reason VARCHAR(255),
  equ_num VARCHAR(64),
  pay_points NUMBER(10, 3) DEFAULT 0,
  soft_points NUMBER(8, 3) DEFAULT 0 NOT NULL,
  related_pk VARCHAR2(48),
  is_agency NUMBER(1) DEFAULT 0,
  action_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bmedia_point_log_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk)
);

COMMENT ON COLUMN "BMEDIA_POINT_LOG"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "BMEDIA_POINT_LOG"."STATUS" IS '0: plus, 1: minus, 2: refund';
COMMENT ON COLUMN "BMEDIA_POINT_LOG"."REASON" IS 'source of media';
COMMENT ON COLUMN "BMEDIA_POINT_LOG"."EQU_NUM" IS 'device number';
COMMENT ON COLUMN "BMEDIA_POINT_LOG"."PAY_POINTS" IS 'pay points, exactly won';
COMMENT ON COLUMN "BMEDIA_POINT_LOG"."SOFT_POINTS" IS 'soft points';
COMMENT ON COLUMN "BMEDIA_POINT_LOG"."RELATED_PK" IS 'foreign key to the relevant table, -3 bmedia point when merge fixed id';
COMMENT ON COLUMN "BMEDIA_POINT_LOG"."IS_AGENCY" IS '0: user, 1: agency';

CREATE OR REPLACE TRIGGER bmedia_point_pk_trigger
BEFORE INSERT ON bmedia_point_log
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "BMEDIA_POINT_LOG_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- bmedia point stats
CREATE SEQUENCE "BMEDIA_POINT_STATS_S" MINVALUE 10000000 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 10000000 CACHE 20;

CREATE TABLE bmedia_point_stats (
  table_pk NUMBER PRIMARY KEY,
  user_pk NUMBER UNIQUE NOT NULL,
  total_points NUMBER(8, 3) DEFAULT 0,
  limit_points NUMBER(8, 3) DEFAULT 0,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_media_point_stats_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk)
);

COMMENT ON COLUMN "BMEDIA_POINT_STATS"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "BMEDIA_POINT_STATS"."TOTAL_POINTS" IS 'total point achieved';
COMMENT ON COLUMN "BMEDIA_POINT_STATS"."LIMIT_POINTS" IS 'points archieved until activity limit date';

CREATE OR REPLACE TRIGGER bmedia_point_stats_pk_trigger
BEFORE INSERT ON bmedia_point_stats
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "BMEDIA_POINT_STATS_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- soft point log
CREATE SEQUENCE "SOFT_POINT_LOG_S" MINVALUE 10000000 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 10000000 CACHE 20;

CREATE TABLE soft_point_log (
  table_pk NUMBER PRIMARY KEY,
  user_pk NUMBER NOT NULL,
  point_type NUMBER(1) DEFAULT 0 NOT NULL,
  status NUMBER(1) DEFAULT 0 NOT NULL,
  reason VARCHAR(255),
  equ_num VARCHAR(64),
  pay_points NUMBER(10, 3) DEFAULT 0,
  soft_points NUMBER(8, 3) DEFAULT 0 NOT NULL,
  related_pk VARCHAR2(48),
  is_agency NUMBER(1) DEFAULT 0,
  action_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_soft_point_log_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk)
);

COMMENT ON COLUMN "SOFT_POINT_LOG"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "SOFT_POINT_LOG"."POINT_TYPE" IS '0: appstore, 1: karaoke, 2: bmedia, 3: manager';
COMMENT ON COLUMN "SOFT_POINT_LOG"."STATUS" IS '0: plus, 1: minus, 2: refund';
COMMENT ON COLUMN "SOFT_POINT_LOG"."REASON" IS 'appstore: app name, karaoke: karaoke, bmedia: source of media';
COMMENT ON COLUMN "SOFT_POINT_LOG"."EQU_NUM" IS 'device number';
COMMENT ON COLUMN "SOFT_POINT_LOG"."PAY_POINTS" IS 'pay points, exactly won';
COMMENT ON COLUMN "SOFT_POINT_LOG"."SOFT_POINTS" IS 'soft points';
COMMENT ON COLUMN "SOFT_POINT_LOG"."RELATED_PK" IS 'foreign key to the relevant table (for bmedia, appstore), -1 appstore point when merge appstore id, -2 karaoke point when merge fixed id, -3 bmedia point when merge fixed id';
COMMENT ON COLUMN "SOFT_POINT_LOG"."IS_AGENCY" IS '0: user, 1: agency';

CREATE OR REPLACE TRIGGER soft_point_pk_trigger
BEFORE INSERT ON soft_point_log
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "SOFT_POINT_LOG_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- soft point stats
CREATE SEQUENCE "SOFT_POINT_STATS_S" MINVALUE 10000000 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 10000000 CACHE 20;

CREATE TABLE soft_point_stats (
  table_pk NUMBER PRIMARY KEY,
  user_pk NUMBER UNIQUE NOT NULL,
  total_points NUMBER(8, 3) DEFAULT 0,
  limit_points NUMBER(8, 3) DEFAULT 0,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_soft_point_stats_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk)
);

COMMENT ON COLUMN "SOFT_POINT_STATS"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "SOFT_POINT_STATS"."TOTAL_POINTS" IS 'total point achieved';
COMMENT ON COLUMN "SOFT_POINT_STATS"."LIMIT_POINTS" IS 'points archieved until activity limit date';

CREATE OR REPLACE TRIGGER soft_point_stats_pk_trigger
BEFORE INSERT ON soft_point_stats
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "SOFT_POINT_STATS_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- register point log
CREATE SEQUENCE "REGISTER_POINT_LOG_S" MINVALUE 10000000 MAXVALUE 9999999999999999999 INCREMENT BY 10 START WITH 10000000 CACHE 20;

CREATE TABLE register_point_log (
  table_pk NUMBER PRIMARY KEY,
  user_pk NUMBER NOT NULL,
  point_type NUMBER(1) DEFAULT 0 NOT NULL,
  status NUMBER(1) DEFAULT 0 NOT NULL,
  product_pk NUMBER,
  product_name VARCHAR2(128),
  equ_num VARCHAR(64),
  reason VARCHAR(255),
  points NUMBER(8, 1) DEFAULT 0 NOT NULL,
  action_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_register_point_log_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk)
);

COMMENT ON COLUMN "REGISTER_POINT_LOG"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "REGISTER_POINT_LOG"."POINT_TYPE" IS '0: phone, 1: eprod, 2: manager';
COMMENT ON COLUMN "REGISTER_POINT_LOG"."STATUS" IS '0: plus, 1: minus, 2: refund';
COMMENT ON COLUMN "REGISTER_POINT_LOG"."PRODUCT_PK" IS 'products.product_pk, NULL when point_type is manager';
COMMENT ON COLUMN "REGISTER_POINT_LOG"."PRODUCT_NAME" IS 'product name';
COMMENT ON COLUMN "REGISTER_POINT_LOG"."EQU_NUM" IS 'device number, phone: IMEI, eprod: SN';
COMMENT ON COLUMN "REGISTER_POINT_LOG"."REASON" IS 'only available for add/delete points by manager';
COMMENT ON COLUMN "REGISTER_POINT_LOG"."POINTS" IS 'register points';

CREATE OR REPLACE TRIGGER register_point_pk_trigger
BEFORE INSERT ON register_point_log
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "REGISTER_POINT_LOG_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- recalc activity points to stats
update ACTIVITY_POINT_STATS
set total_points=(
  select T1.calc_points from 
  (SELECT user_pk, SUM(points) calc_points FROM "ACTIVITY_POINT_LOG"
  GROUP BY user_pk) T1
  where T1.user_pk=ACTIVITY_POINT_STATS.user_pk
)

update activity_point_stats
set total_points=0
where total_points IS NULL

-- limit points
update ACTIVITY_POINT_STATS
set limit_points=(
  select T1.calc_points from 
  (SELECT user_pk, SUM(points) calc_points FROM "ACTIVITY_POINT_LOG"
  WHERE TO_CHAR(ACTION_AT, 'YYYY-MM-DD') <= '2025-07-09'
  GROUP BY user_pk) T1
  where T1.user_pk=ACTIVITY_POINT_STATS.user_pk
)

update activity_point_stats
set limit_points=0
where limit_points IS NULL
