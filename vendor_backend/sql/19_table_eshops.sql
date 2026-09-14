-- eshop cards
CREATE TABLE eshop_cards (
  card_pk NUMBER PRIMARY KEY,
  accum_card NUMBER NOT NULL UNIQUE,
  accum_level VARCHAR2(64),
  wallet_card NUMBER,
  wallet_type VARCHAR2(64),
  username VARCHAR2(64),
  phone_number VARCHAR2(64),
  eshop_pk NUMBER,
  eshop_id VARCHAR2(64),
  wallet_balance NUMBER(9, 3),
  prize_balance NUMBER(9, 3),
  accum_value NUMBER(9, 3),
  commerce_value NUMBER(9, 3),
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON COLUMN "ESHOP_CARDS"."CARD_PK" IS 'card pk';

-- eshop combine log
CREATE TABLE eshop_combine_log (
  id NUMBER PRIMARY KEY,
  org_user_pk NUMBER,
  org_userid VARCHAR(64),
  target_user_pk NUMBER NOT NULL,
  target_userid VARCHAR(64),
  combine_type NUMBER(1) DEFAULT 0,
  action_type NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON COLUMN "ESHOP_COMBINE_LOG"."ORG_USER_PK" IS 'orignal user pk';
COMMENT ON COLUMN "ESHOP_COMBINE_LOG"."ORG_USERID" IS 'orignal user id';
COMMENT ON COLUMN "ESHOP_COMBINE_LOG"."TARGET_USER_PK" IS 'target user pk';
COMMENT ON COLUMN "ESHOP_COMBINE_LOG"."TARGET_USERID" IS 'target user id';
COMMENT ON COLUMN "ESHOP_COMBINE_LOG"."COMBINE_TYPE" IS '0: merge id, 1: merge card (mobile), 2: merge card (fixed)';
COMMENT ON COLUMN "ESHOP_COMBINE_LOG"."ACTION_TYPE" IS 'merge action by, 0: user, 1: manager';

-- eshop point stats
CREATE TABLE eshop_point_stats (
  accum_card NUMBER PRIMARY KEY,
  accum_level VARCHAR2(64),
  wallet_card NUMBER,
  wallet_type VARCHAR2(64),
  username VARCHAR2(64),
  phone_number VARCHAR2(64),
  eshop_pk NUMBER,
  eshop_id VARCHAR2(64),
  wallet_balance NUMBER(9, 3),
  prize_balance NUMBER(9, 3),
  accum_value NUMBER(9, 3),
  commerce_value NUMBER(9, 3),
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP
);

