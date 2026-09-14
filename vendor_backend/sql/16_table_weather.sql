-- weather stations
CREATE TABLE weather_stations (
  area_code NUMBER PRIMARY KEY,
  area_name VARCHAR2(64) NOT NULL,
  current_order NUMBER(3) DEFAULT 999,
  short_order NUMBER(3) DEFAULT 999,
  middle_order NUMBER(3) DEFAULT 999,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP
);

-- weather current
CREATE TABLE weather_current (
  id NUMBER PRIMARY KEY,
  area_code NUMBER NOT NULL,
  temperature NUMBER(3, 1) DEFAULT 0,
  humidity NUMBER(3, 1) DEFAULT 0,
  wind VARCHAR2(128),
  cloud VARCHAR2(256),
  symbol NUMBER(4) DEFAULT 0,
  symbol_ NUMBER(4) DEFAULT 0,
  pressure NUMBER(6) DEFAULT 0,
  sunshine NUMBER(5, 1) DEFAULT 0,
  visidist VARCHAR2(50),
  updatetime DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_weather_current_area_code FOREIGN KEY (area_code) REFERENCES weather_stations(area_code)
);

CREATE INDEX idx_weather_current_area_code ON weather_current (area_code);

-- weather short
CREATE TABLE weather_short (
  id NUMBER PRIMARY KEY,
  area_code NUMBER NOT NULL,
  wind1 VARCHAR2(128),
  cloud1 VARCHAR2(256),
  symbol1 NUMBER(4) DEFAULT 0,
  symbol_night1 NUMBER(4) DEFAULT 0,
  symbol1_ NUMBER(4) DEFAULT 0,
  symbol_night1_ NUMBER(4) DEFAULT 0,
  templ1 NUMBER(3, 0) DEFAULT 0,
  temph1 NUMBER(3, 0) DEFAULT 0,
  wind2 VARCHAR2(128),
  cloud2 VARCHAR2(256),
  symbol2 NUMBER(4) DEFAULT 0,
  symbol_night2 NUMBER(4) DEFAULT 0,
  symbol2_ NUMBER(4) DEFAULT 0,
  symbol_night2_ NUMBER(4) DEFAULT 0,
  templ2 NUMBER(3, 0) DEFAULT 0,
  temph2 NUMBER(3, 0) DEFAULT 0,
  othernote VARCHAR2(256),
  enabled VARCHAR2(1) default 'Y',
  updatetime DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_weather_short_area_code FOREIGN KEY (area_code) REFERENCES weather_stations(area_code),
  CONSTRAINT ck_weather_short_enabled CHECK (enabled IN ('Y', 'N'))
);

CREATE INDEX idx_weather_short_area_code ON weather_short (area_code);
