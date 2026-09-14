-- managers = admins
CREATE SEQUENCE "MANAGERS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE managers (
  manager_pk NUMBER PRIMARY KEY,
  manager_id VARCHAR2(50) UNIQUE NOT NULL,
  manager_name VARCHAR2(100) NOT NULL,
  password VARCHAR2(255) NOT NULL,
  role_pk NUMBER,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON COLUMN "MANAGERS"."MANAGER_ID" IS 'manager id';
COMMENT ON COLUMN "MANAGERS"."MANAGER_NAME" IS 'manager name';
COMMENT ON COLUMN "MANAGERS"."ROLE_PK" IS 'manager_roles.role_pk';

CREATE OR REPLACE TRIGGER manager_pk_trigger
BEFORE INSERT ON managers
FOR EACH ROW
BEGIN
  IF :NEW.manager_pk IS NULL THEN
    SELECT "MANAGERS_S".NEXTVAL
    INTO :NEW.manager_pk
    FROM dual;
  END IF;
END;
/

-- NOTE: You SHOULD set role_pk as foreign key after creating manager_roles table

-- manager_roles table
CREATE SEQUENCE "MANAGER_ROLES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE manager_roles (
  role_pk NUMBER PRIMARY KEY,
  role_name VARCHAR2(128) UNIQUE NOT NULL,
  default_page VARCHAR2(255),
  department VARCHAR2(10) DEFAULT '00000' NOT NULL,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  created_by NUMBER,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_by NUMBER,
  CONSTRAINT fk_manager_role_created_by FOREIGN KEY (created_by) REFERENCES managers(manager_pk),
  CONSTRAINT fk_manager_role_updated_by FOREIGN KEY (updated_by) REFERENCES managers(manager_pk)
);

COMMENT ON COLUMN "MANAGER_ROLES"."ROLE_NAME" IS 'role name';
COMMENT ON COLUMN "MANAGER_ROLES"."DEFAULT_PAGE" IS 'default page after login as this manager';
COMMENT ON COLUMN "MANAGER_ROLES"."DEPARTMENT" IS 'permission for departments';

CREATE OR REPLACE TRIGGER manager_role_pk_trigger
BEFORE INSERT ON manager_roles
FOR EACH ROW
BEGIN
  IF :NEW.role_pk IS NULL THEN
    SELECT "MANAGER_ROLES_S".NEXTVAL
    INTO :NEW.role_pk
    FROM dual;
  END IF;
END;
/

-- NOW set foreign key of role_pk for managers table
-- ALTER TABLE managers ADD CONSTRAINT fk_manager_role_pk FOREIGN KEY (role_pk) REFERENCES manager_roles(role_pk);

-- manager pages table (these pages representing specific role have permission to certain page)
CREATE SEQUENCE "MANAGER_PAGES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE manager_pages (
  page_pk NUMBER PRIMARY KEY,
  page_url VARCHAR2(255) NOT NULL,
  page_name VARCHAR2(255) NOT NULL,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  created_by NUMBER,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_by NUMBER,
  CONSTRAINT fk_manager_page_created_by FOREIGN KEY (created_by) REFERENCES managers(manager_pk),
  CONSTRAINT fk_manager_page_updated_by FOREIGN KEY (updated_by) REFERENCES managers(manager_pk)
);

CREATE OR REPLACE TRIGGER manager_page_pk_trigger
BEFORE INSERT ON manager_pages
FOR EACH ROW
BEGIN
  IF :NEW.page_pk IS NULL THEN
    SELECT "MANAGER_PAGES_S".NEXTVAL
    INTO :NEW.page_pk
    FROM dual;
  END IF;
END;
/

-- permissions between manager role and pages
CREATE SEQUENCE "MANAGER_PERMISSIONS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE manager_permissions (
  table_pk NUMBER PRIMARY KEY,
  role_pk NUMBER NOT NULL,
  page_pk NUMBER NOT NULL,
  permission NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  created_by NUMBER,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_by NUMBER,
  CONSTRAINT fk_manager_perm_role_pk FOREIGN KEY (role_pk) REFERENCES manager_roles(role_pk),
  CONSTRAINT fk_manager_perm_page_pk FOREIGN KEY (page_pk) REFERENCES manager_pages(page_pk),
  CONSTRAINT fk_manager_perm_created_by FOREIGN KEY (created_by) REFERENCES managers(manager_pk),
  CONSTRAINT fk_manager_perm_updated_by FOREIGN KEY (updated_by) REFERENCES managers(manager_pk),
  CONSTRAINT ck_manager_perm_permission CHECK (permission IN (0, 1, 2, 3)),
  CONSTRAINT uq_role_page UNIQUE (role_pk, page_pk)
);

COMMENT ON COLUMN manager_permissions.permission IS '0: none, 1: read, 2: write, 3: super';

CREATE OR REPLACE TRIGGER manager_permission_pk_trigger
BEFORE INSERT ON manager_permissions
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "MANAGER_PERMISSIONS_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

INSERT INTO manager_permissions (role_pk, page_pk, permission)
VALUES (1, 1, 2);
INSERT INTO manager_permissions (role_pk, page_pk, permission)
VALUES (1, 2, 2);
INSERT INTO manager_permissions (role_pk, page_pk, permission)
VALUES (1, 3, 2);

-- user_admins
CREATE SEQUENCE "USER_ADMINS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE user_admins (
  table_pk NUMBER PRIMARY KEY,
  user_pk NUMBER UNIQUE NOT NULL,
  manager_pk NUMBER NOT NULL,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_admin_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_admin_manager_pk FOREIGN KEY (manager_pk) REFERENCES managers(manager_pk)
);

COMMENT ON COLUMN "USER_ADMINS"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "USER_ADMINS"."MANAGER_PK" IS 'managers.manager_pk';

CREATE OR REPLACE TRIGGER user_admin_pk_trigger
BEFORE INSERT ON user_admins
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "USER_ADMINS_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/
