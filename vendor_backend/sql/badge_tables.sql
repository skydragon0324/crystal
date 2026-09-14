CREATE SEQUENCE badge_categories_seq START WITH 1 INCREMENT BY 1 NOCACHE;

CREATE TABLE badge_categories (
  category_pk NUMBER DEFAULT badge_categories_seq.NEXTVAL PRIMARY KEY,  -- Primary key with auto-increment
  category_name VARCHAR2(255) NOT NULL,  -- Name of the category
  is_deleted NUMBER(1) DEFAULT 0 CHECK (is_deleted IN (0, 1)),  -- Flag to indicate if the category is deleted (0: not deleted, 1: deleted)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Timestamp when the category was created
  created_by NUMBER NOT NULL,  -- Foreign key to the manager who created the category
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,  -- Timestamp for the last update
  updated_by NUMBER,  -- Foreign key to the manager who last updated the category
  CONSTRAINT fk_created_by FOREIGN KEY (created_by) REFERENCES managers(manager_pk),  -- Foreign key constraint for created_by
  CONSTRAINT fk_updated_by FOREIGN KEY (updated_by) REFERENCES managers(manager_pk)  -- Foreign key constraint for updated_by
);


CREATE SEQUENCE badges_seq START WITH 1 INCREMENT BY 1 NOCACHE;

CREATE TABLE badges (
  badge_pk NUMBER DEFAULT badges_seq.NEXTVAL PRIMARY KEY,  -- Primary key with auto-increment
  badge_title VARCHAR2(255) NOT NULL,  -- Title of the badge
  description VARCHAR2(500),  -- Description of the badge
  icon_active_title VARCHAR2(255),  -- Title of the active icon
  icon_active_url VARCHAR2(500),  -- URL of the active icon
  icon_disable_title VARCHAR2(255),  -- Title of the disabled icon
  icon_disable_url VARCHAR2(500),  -- URL of the disabled icon
  category_pk NUMBER NOT NULL,  -- Category of the badge
  position NUMBER NOT NULL,  -- Position of the badge (for ordering)
  is_deleted NUMBER(1) DEFAULT 0 CHECK (is_deleted IN (0, 1)),  -- Flag to indicate if the badge is deleted (0: not deleted, 1: deleted)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Timestamp when the badge was created
  created_by NUMBER NOT NULL,  -- Foreign key to the manager who created the badge
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,  -- Timestamp for when the badge was last updated
  updated_by NUMBER,  -- Foreign key to the manager who last updated the badge
  CONSTRAINT fk_category_pk FOREIGN KEY (category_pk) REFERENCES badge_categories(category_pk),  -- Foreign key constraint for category_pk
  CONSTRAINT fk_created_by FOREIGN KEY (created_by) REFERENCES managers(manager_pk),  -- Foreign key constraint for created_by
  CONSTRAINT fk_updated_by FOREIGN KEY (updated_by) REFERENCES managers(manager_pk)  -- Foreign key constraint for updated_by
);

CREATE SEQUENCE user_badges_seq START WITH 1 INCREMENT BY 1 NOCACHE;

CREATE TABLE user_badges (
  table_pk NUMBER DEFAULT user_badges_seq.NEXTVAL PRIMARY KEY,  -- Primary key with auto-increment
  user_pk NUMBER NOT NULL,  -- Foreign key to the Users table (the user who earned the badge)
  badge_pk NUMBER NOT NULL,  -- Foreign key to the Badges table (the earned badge)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Timestamp when the user badge was created
  created_by NUMBER NOT NULL,  -- Foreign key to the manager who awarded the badge
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,  -- Timestamp for the last update
  updated_by NUMBER,  -- Foreign key to the manager who last updated the user badge
  CONSTRAINT fk_user_pk FOREIGN KEY (user_pk) REFERENCES users(user_pk),  -- Foreign key constraint to Users table
  CONSTRAINT fk_badge_pk FOREIGN KEY (badge_pk) REFERENCES badges(badge_pk),  -- Foreign key constraint to Badges table
  CONSTRAINT fk_created_by FOREIGN KEY (created_by) REFERENCES managers(manager_pk),  -- Foreign key constraint for created_by
  CONSTRAINT fk_updated_by FOREIGN KEY (updated_by) REFERENCES managers(manager_pk)  -- Foreign key constraint for updated_by
);

