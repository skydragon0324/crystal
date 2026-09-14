-- surveys
CREATE SEQUENCE "SURVEYS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE surveys (
  survey_pk NUMBER PRIMARY KEY,
  survey_category NUMBER(1) DEFAULT 0,
  survey_name VARCHAR2(255) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  position NUMBER(2) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_by NUMBER NOT NULL,
  updated_by NUMBER,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_surveys_created_by FOREIGN KEY (created_by) REFERENCES managers(manager_pk),
  CONSTRAINT fk_surveys_updated_by FOREIGN KEY (updated_by) REFERENCES managers(manager_pk),
  CONSTRAINT chk_surveys_period CHECK (end_date >= start_date)
);

COMMENT ON COLUMN "SURVEYS"."SURVEY_NAME" IS 'Name of the survey';
COMMENT ON COLUMN "SURVEYS"."POSITION" IS 'sort order';

CREATE OR REPLACE TRIGGER survey_pk_trigger
BEFORE INSERT ON surveys
FOR EACH ROW
BEGIN
  IF :NEW.survey_pk IS NULL THEN
    SELECT "SURVEYS_S".NEXTVAL
    INTO :NEW.survey_pk
    FROM dual;
  END IF;
END;
/

-- survey questions
CREATE SEQUENCE "SURVEY_QUESTIONS_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE survey_questions (
  question_pk NUMBER PRIMARY KEY,
  survey_pk NUMBER NOT NULL,
  question_text VARCHAR2(1024) NOT NULL,
  question_type NUMBER(1) DEFAULT 0,
  position NUMBER(2) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  publish_num VARCHAR2(24),
  created_by NUMBER NOT NULL,
  updated_by NUMBER,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_survey_q_survey_pk FOREIGN KEY (survey_pk) REFERENCES surveys(survey_pk),
  CONSTRAINT fk_survey_q_created_by FOREIGN KEY (created_by) REFERENCES managers(manager_pk),
  CONSTRAINT fk_surveys_q_updated_by FOREIGN KEY (updated_by) REFERENCES managers(manager_pk)
);

COMMENT ON COLUMN "SURVEY_QUESTIONS"."SURVEY_PK" IS 'surveys.survey_pk';
COMMENT ON COLUMN "SURVEY_QUESTIONS"."QUESTION_TEXT" IS 'text of the survey question';
COMMENT ON COLUMN "SURVEY_QUESTIONS"."QUESTION_TYPE" IS '0: single choice, 1: multiple choice, 2: text';
COMMENT ON COLUMN "SURVEY_QUESTIONS"."POSITION" IS 'sort order';
COMMENT ON COLUMN "SURVEY_QUESTIONS"."PUBLISH_NUM" IS 'publish approve number';

CREATE OR REPLACE TRIGGER question_pk_trigger
BEFORE INSERT ON survey_questions
FOR EACH ROW
BEGIN
  IF :NEW.question_pk IS NULL THEN
    SELECT "SURVEY_QUESTIONS_S".NEXTVAL
    INTO :NEW.question_pk
    FROM dual;
  END IF;
END;
/

-- survey choices
CREATE SEQUENCE "SURVEY_CHOICES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE survey_choices (
  choice_pk NUMBER PRIMARY KEY,
  question_pk NUMBER NOT NULL,
  choice_text VARCHAR2(255) NOT NULL,
  position NUMBER(2) DEFAULT 0,
  is_deleted NUMBER(1) DEFAULT 0,
  created_at DATE DEFAULT CURRENT_TIMESTAMP,
  updated_at DATE DEFAULT CURRENT_TIMESTAMP,
  created_by NUMBER NOT NULL,
  updated_by NUMBER,
  CONSTRAINT fk_survey_c_question_pk FOREIGN KEY (question_pk) REFERENCES survey_questions(question_pk),
  CONSTRAINT fk_survey_c_created_by FOREIGN KEY (created_by) REFERENCES managers(manager_pk),
  CONSTRAINT fk_surveys_c_updated_by FOREIGN KEY (updated_by) REFERENCES managers(manager_pk)
);

COMMENT ON COLUMN "SURVEY_CHOICES"."QUESTION_PK" IS 'survey_questions.question_pk';
COMMENT ON COLUMN "SURVEY_CHOICES"."CHOICE_TEXT" IS 'choice text';
COMMENT ON COLUMN "SURVEY_CHOICES"."POSITION" IS 'sort order';

CREATE OR REPLACE TRIGGER choice_pk_trigger
BEFORE INSERT ON survey_choices
FOR EACH ROW
BEGIN
  IF :NEW.choice_pk IS NULL THEN
    SELECT "SURVEY_CHOICES_S".NEXTVAL
    INTO :NEW.choice_pk
    FROM dual;
  END IF;
END;
/

-- survey responses
CREATE SEQUENCE "SURVEY_RESPONSES_S" MINVALUE 1 MAXVALUE 9999999999999999999 INCREMENT BY 1 START WITH 1 NOCACHE;

CREATE TABLE survey_responses (
  response_pk NUMBER PRIMARY KEY,
  user_pk NUMBER NOT NULL,
  question_pk NUMBER NOT NULL,
  choice_pk NUMBER,
  response_text VARCHAR2(1000),
  action_at DATE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_survey_r_user FOREIGN KEY (user_pk) REFERENCES users(user_pk),
  CONSTRAINT fk_survey_r_question FOREIGN KEY (question_pk) REFERENCES survey_questions(question_pk),
  CONSTRAINT fk_survey_r_choice FOREIGN KEY (choice_pk) REFERENCES survey_choices(choice_pk),
  CONSTRAINT uq_survey_c_q_user UNIQUE (user_pk, question_pk, choice_pk)
);

COMMENT ON COLUMN "SURVEY_RESPONSES"."USER_PK" IS 'users.user_pk';
COMMENT ON COLUMN "SURVEY_RESPONSES"."QUESTION_PK" IS 'survey_questions.question_pk';
COMMENT ON COLUMN "SURVEY_RESPONSES"."CHOICE_PK" IS 'survey_choices.choice_pk, can be NULL for text reponses';
COMMENT ON COLUMN "SURVEY_RESPONSES"."RESPONSE_TEXT" IS 'text response when choice_pk is NULL';

CREATE OR REPLACE TRIGGER reponse_pk_trigger
BEFORE INSERT ON survey_responses
FOR EACH ROW
BEGIN
  IF :NEW.response_pk IS NULL THEN
    SELECT "SURVEY_RESPONSES_S".NEXTVAL
    INTO :NEW.response_pk
    FROM dual;
  END IF;
END;
/
