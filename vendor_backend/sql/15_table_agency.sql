-- phone agencies
CREATE SEQUENCE "PHONE_AGENCIES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE phone_agencies (
  agency_pk NUMBER PRIMARY KEY,
  agency_name VARCHAR2(255) NOT NULL,
  phone_numbers VARCHAR2(128) NOT NULL,
  business VARCHAR2(8),
  location_pk NUMBER,
  location_more VARCHAR2(255),
  location_environs VARCHAR2(255),
  shmap_pos VARCHAR2(64),
  agency_rating NUMBER(5, 2) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_p_agency_location_pk FOREIGN KEY (location_pk) REFERENCES locations(location_pk)
);

CREATE OR REPLACE TRIGGER phone_agency_pk_trigger
BEFORE INSERT ON phone_agencies
FOR EACH ROW
BEGIN
  IF :NEW.agency_pk IS NULL THEN
    SELECT "PHONE_AGENCIES_S".NEXTVAL
    INTO :NEW.agency_pk
    FROM dual;
  END IF;
END;
/

-- eprod agencies
CREATE SEQUENCE "EPROD_AGENCIES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE eprod_agencies (
  agency_pk NUMBER PRIMARY KEY,
  agency_name VARCHAR2(255) NOT NULL,
  phone_numbers VARCHAR2(128) NOT NULL,
  business VARCHAR2(8),
  location_pk NUMBER,
  location_more VARCHAR2(255),
  location_environs VARCHAR2(255),
  shmap_pos VARCHAR2(64),
  agency_rating NUMBER(5, 2) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_e_agency_location_pk FOREIGN KEY (location_pk) REFERENCES locations(location_pk)
);

CREATE OR REPLACE TRIGGER eprod_agency_pk_trigger
BEFORE INSERT ON eprod_agencies
FOR EACH ROW
BEGIN
  IF :NEW.agency_pk IS NULL THEN
    SELECT "EPROD_AGENCIES_S".NEXTVAL
    INTO :NEW.agency_pk
    FROM dual;
  END IF;
END;
/

-- phone sale agencies (for phone book)
CREATE TABLE phone_sale_agencies (
  agency_id NUMBER UNIQUE NOT NULL,
  agency_name VARCHAR2(255) NOT NULL,
  agency_superior VARCHAR2(128),
  location_name VARCHAR2(255),
  location_detail VARCHAR2(255),
  status NUMBER(1) DEFAULT 1,
  is_deleted NUMBER(1) DEFAULT 0,
  position NUMBER(3) DEFAULT 0,
  created_at DATE,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP
);

