-- feedback_threads
CREATE SEQUENCE "FEEDBACK_THREADS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE feedback_threads (
  thread_pk NUMBER PRIMARY KEY,
  user_pk NUMBER NOT NULL,
  title VARCHAR2(512) NOT NULL,
  category NUMBER(2) DEFAULT 0 NOT NULL,
  thread_source NUMBER(1) DEFAULT 0,
  last_message VARCHAR2(4000),
  last_type NUMBER(1) DEFAULT 0,
  status NUMBER(1) DEFAULT 0,
  is_read NUMBER(1) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  session_by NUMBER,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_feedback_thread_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_feedback_thread_manager_pk FOREIGN KEY (session_by) REFERENCES managers(manager_pk)
);

CREATE OR REPLACE TRIGGER feedback_thread_pk_trigger
BEFORE INSERT ON feedback_threads
FOR EACH ROW
BEGIN
  IF :NEW.thread_pk IS NULL THEN
    SELECT "FEEDBACK_THREADS_S".NEXTVAL
    INTO :NEW.thread_pk
    FROM dual;
  END IF;
END;
/

-- feedback_messages
CREATE SEQUENCE "FEEDBACK_MESSAGES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE feedback_messages (
  message_pk NUMBER PRIMARY KEY,
  thread_pk NUMBER NOT NULL,
  message VARCHAR2(4000) NOT NULL,
  action_type NUMBER(1) DEFAULT 0 NOT NULL,
  action_by NUMBER NOT NULL,
  action_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_feedback_msg_thread_pk FOREIGN KEY (thread_pk) REFERENCES feedback_threads(thread_pk)
);

COMMENT ON COLUMN "FEEDBACK_MESSAGES"."THREAD_PK" IS 'feedback_threads.thread_pk';
COMMENT ON COLUMN "FEEDBACK_MESSAGES"."MESSAGE" IS 'message';
COMMENT ON COLUMN "FEEDBACK_MESSAGES"."ACTION_TYPE" IS '0: user feedback, 1: manager reply';
COMMENT ON COLUMN "FEEDBACK_MESSAGES"."ACTION_BY" IS 'when action_type is 0, its users.user_pk, when 1 managers.manager_pk';

CREATE OR REPLACE TRIGGER feedback_message_pk_trigger
BEFORE INSERT ON feedback_messages
FOR EACH ROW
BEGIN
  IF :NEW.message_pk IS NULL THEN
    SELECT "FEEDBACK_MESSAGES_S".NEXTVAL
    INTO :NEW.message_pk
    FROM dual;
  END IF;
END;
/

-- feedback category log
CREATE SEQUENCE "FEEDBACK_CATEGORY_LOG_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE feedback_category_log (
  table_pk NUMBER PRIMARY KEY,
  thread_pk NUMBER NOT NULL,
  category NUMBER(2) DEFAULT 0 NOT NULL,
  action_at DATE DEFAULT CURRENT_TIMESTAMP,
  action_by NUMBER NOT NULL,
  CONSTRAINT fk_fb_category_log_thread_pk FOREIGN KEY (thread_pk) REFERENCES feedback_threads(thread_pk),
  CONSTRAINT fk_fb_category_log_action_by FOREIGN KEY (action_by) REFERENCES managers(manager_pk)
);

COMMENT ON COLUMN "FEEDBACK_CATEGORY_LOG"."THREAD_PK" IS 'feedback_threads.thread_pk';
COMMENT ON COLUMN "FEEDBACK_CATEGORY_LOG"."CATEGORY" IS 'feedback_threads.category';
COMMENT ON COLUMN "FEEDBACK_CATEGORY_LOG"."ACTION_BY" IS 'managers.manager_pk';

CREATE OR REPLACE TRIGGER feedback_cat_log_pk_trigger
BEFORE INSERT ON feedback_category_log
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "FEEDBACK_CATEGORY_LOG_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- feedback status log
CREATE SEQUENCE "FEEDBACK_STATUS_LOG_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE feedback_status_log (
  table_pk NUMBER PRIMARY KEY,
  thread_pk NUMBER NOT NULL,
  status NUMBER(1) DEFAULT 0,
  note VARCHAR2(128),
  action_at DATE DEFAULT CURRENT_TIMESTAMP,
  action_type NUMBER(1) DEFAULT 0 NOT NULL,
  action_by NUMBER NOT NULL,
  CONSTRAINT fk_fb_status_log_thread_pk FOREIGN KEY (thread_pk) REFERENCES feedback_threads(thread_pk)
);

COMMENT ON COLUMN "FEEDBACK_STATUS_LOG"."THREAD_PK" IS 'feedback_threads.thread_pk';
COMMENT ON COLUMN "FEEDBACK_STATUS_LOG"."STATUS" IS '0: discussing, 1: resolved, 2: finished';
COMMENT ON COLUMN "FEEDBACK_STATUS_LOG"."NOTE" IS 'note when resolve by manager';
COMMENT ON COLUMN "FEEDBACK_STATUS_LOG"."ACTION_TYPE" IS '0: by user, 1: by manager';
COMMENT ON COLUMN "FEEDBACK_STATUS_LOG"."ACTION_BY" IS 'users.user_pk or managers.manager_pk';

CREATE OR REPLACE TRIGGER feedback_status_log_pk_trigger
BEFORE INSERT ON feedback_status_log
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "FEEDBACK_STATUS_LOG_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- feedback forward log
CREATE SEQUENCE "FEEDBACK_FORWARD_LOG_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE feedback_forward_log (
  table_pk NUMBER PRIMARY KEY,
  message_pk NUMBER UNIQUE NOT NULL,
  thread_pk NUMBER NOT NULL,
  qc_level NUMBER(1) DEFAULT 0,
  action_at DATE DEFAULT CURRENT_TIMESTAMP,
  action_by NUMBER NOT NULL,
  CONSTRAINT fk_fb_qc_log_msg_pk FOREIGN KEY (message_pk) REFERENCES feedback_messages(message_pk),
  CONSTRAINT fk_fb_qc_log_thread_pk FOREIGN KEY (thread_pk) REFERENCES feedback_threads(thread_pk),
  CONSTRAINT fk_fb_qc_log_action_by FOREIGN KEY (action_by) REFERENCES managers(manager_pk)
);

COMMENT ON COLUMN "FEEDBACK_FORWARD_LOG"."MESSAGE_PK" IS 'feedback_messages.message_pk';
COMMENT ON COLUMN "FEEDBACK_FORWARD_LOG"."THREAD_PK" IS 'feedback_messages.thread_pk';
COMMENT ON COLUMN "FEEDBACK_FORWARD_LOG"."ACTION_BY" IS 'managers.manager_pk';

CREATE OR REPLACE TRIGGER feedback_qc_log_pk_trigger
BEFORE INSERT ON feedback_forward_log
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "FEEDBACK_FORWARD_LOG_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- broadcasts
CREATE SEQUENCE "BROADCAST_CONTENTS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE broadcast_contents (
  broadcast_pk NUMBER PRIMARY KEY,
  title VARCHAR2(255) NOT NULL,
  content VARCHAR2(4000) NOT NULL,
  to_all NUMBER(1) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  created_by NUMBER NOT NULL,
  updated_by NUMBER,
  CONSTRAINT fk_broadcasts_created_by FOREIGN KEY (created_by) REFERENCES managers(manager_pk),
  CONSTRAINT fk_broadcasts_updated_by FOREIGN KEY (updated_by) REFERENCES managers(manager_pk)
);

COMMENT ON COLUMN "BROADCAST_CONTENTS"."TITLE" IS 'Title of the broadcast message';
COMMENT ON COLUMN "BROADCAST_CONTENTS"."CONTENT" IS 'Content of the broadcast message';
COMMENT ON COLUMN "BROADCAST_CONTENTS"."TO_ALL" IS 'broadcast to all users';
COMMENT ON COLUMN "BROADCAST_CONTENTS"."IS_DELETED" IS '0: Active, 1: Deleted';

CREATE OR REPLACE TRIGGER broadcast_pk_trigger
BEFORE INSERT ON broadcast_contents
FOR EACH ROW
BEGIN
  IF :NEW.broadcast_pk IS NULL THEN
    SELECT "BROADCAST_CONTENTS_S".NEXTVAL
    INTO :NEW.broadcast_pk
    FROM dual;
  END IF;
END;
/

CREATE SEQUENCE "BROADCAST_USERS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE broadcast_users (
  table_pk NUMBER PRIMARY KEY,
  broadcast_pk NUMBER NOT NULL,
  user_pk NUMBER NOT NULL,
  is_read NUMBER(1) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  created_by NUMBER NOT NULL,
  CONSTRAINT fk_broaduser_broadcast_pk FOREIGN KEY (broadcast_pk) REFERENCES broadcast_contents(broadcast_pk),
  CONSTRAINT fk_broaduser_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_broaduser_created_by FOREIGN KEY (created_by) REFERENCES managers(manager_pk)
);

COMMENT ON COLUMN "BROADCAST_USERS"."BROADCAST_PK" IS 'broadcast_contents.broadcast_pk';
COMMENT ON COLUMN "BROADCAST_USERS"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "BROADCAST_USERS"."IS_READ" IS '0: none, 1: read';
COMMENT ON COLUMN "BROADCAST_USERS"."IS_DELETED" IS '0: Not deleted, 1: Deleted';

CREATE OR REPLACE TRIGGER broaduser_table_pk_trigger
BEFORE INSERT ON broadcast_users
FOR EACH ROW
BEGIN
  IF :NEW.table_pk IS NULL THEN
    SELECT "BROADCAST_USERS_S".NEXTVAL
    INTO :NEW.table_pk
    FROM dual;
  END IF;
END;
/

-- notifications
CREATE SEQUENCE "NOTIFICATIONS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE notifications (
  notification_pk NUMBER PRIMARY KEY,
  title VARCHAR2(255) NOT NULL,
  content NCLOB NOT NULL,
  cleaned_content VARCHAR2(4000) NOT NULL,
  image_url VARCHAR2(255),
  status NUMBER(1) DEFAULT 0,
  category NUMBER(1) DEFAULT 0,
  goto VARCHAR2(1000),
  is_popular NUMBER(1) DEFAULT 0,
  start_date DATE,
  end_date DATE,
  position NUMBER(3) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  created_by NUMBER NOT NULL,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_by NUMBER,
  CONSTRAINT fk_notifications_created_by FOREIGN KEY (created_by) REFERENCES managers(manager_pk),
  CONSTRAINT fk_notifications_updated_by FOREIGN KEY (updated_by) REFERENCES managers(manager_pk),
  CONSTRAINT chk_notifications_period CHECK (end_date >= start_date)
);

COMMENT ON COLUMN "NOTIFICATIONS"."TITLE" IS 'notification title';
COMMENT ON COLUMN "NOTIFICATIONS"."CONTENT" IS 'notification content (including HTML)';
COMMENT ON COLUMN "NOTIFICATIONS"."CLEANED_CONTENT" IS 'notification content (HTML stripped)';
COMMENT ON COLUMN "NOTIFICATIONS"."IMAGE_URL" IS 'image path';
COMMENT ON COLUMN "NOTIFICATIONS"."STATUS" IS '0: pending, 1: draft, 2: show';
COMMENT ON COLUMN "NOTIFICATIONS"."CATEGORY" IS '0: PRHN, 1: other';
COMMENT ON COLUMN "NOTIFICATIONS"."GOTO" IS 'action, it can be activity for app, url for web';
COMMENT ON COLUMN "NOTIFICATIONS"."IS_POPULAR" IS '1: popular, 0: none';
COMMENT ON COLUMN "NOTIFICATIONS"."START_DATE" IS 'start date';
COMMENT ON COLUMN "NOTIFICATIONS"."END_DATE" IS 'end date';
COMMENT ON COLUMN "NOTIFICATIONS"."POSITION" IS 'sort order';
COMMENT ON COLUMN "NOTIFICATIONS"."IS_DELETED" IS 'soft delete flag';

CREATE OR REPLACE TRIGGER notification_pk_trigger
BEFORE INSERT ON notifications
FOR EACH ROW
BEGIN
  IF :NEW.notification_pk IS NULL THEN
    SELECT "NOTIFICATIONS_S".NEXTVAL
    INTO :NEW.notification_pk
    FROM dual;
  END IF;
END;
/

-- faqs
CREATE SEQUENCE "FAQS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE faqs (
  faq_pk NUMBER PRIMARY KEY,
  question VARCHAR2(500) NOT NULL,
  answer CLOB NOT NULL,
  category NUMBER(2) DEFAULT 0,
  position NUMBER(3) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  created_by NUMBER NOT NULL,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_by NUMBER,
  CONSTRAINT fk_faqs_created_by FOREIGN KEY (created_by) REFERENCES managers(manager_pk),
  CONSTRAINT fk_faqs_updated_by FOREIGN KEY (updated_by) REFERENCES managers(manager_pk)
);

COMMENT ON COLUMN "FAQS"."QUESTION" IS 'question';
COMMENT ON COLUMN "FAQS"."ANSWER" IS 'answer';
COMMENT ON COLUMN "FAQS"."CATEGORY" IS '0: pid, 1: phone, 2: TV, 3: STB, 4: PC, 5: camera, 6: etc, 7: appstore';
COMMENT ON COLUMN "FAQS"."POSITION" IS 'sort order';
COMMENT ON COLUMN "FAQS"."IS_DELETED" IS 'soft delete flag';

CREATE OR REPLACE TRIGGER faq_pk_trigger
BEFORE INSERT ON faqs
FOR EACH ROW
BEGIN
  IF :NEW.faq_pk IS NULL THEN
    SELECT "FAQS_S".NEXTVAL
    INTO :NEW.faq_pk
    FROM dual;
  END IF;
END;
/
