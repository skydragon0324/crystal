CREATE TABLE activity_points (
  point_pk NUMBER,
  user_pk NUMBER,
  points NUMBER,
  reason VARCHAR2(255),
  activity_timestamp TIMESTAMP
)
PARTITION BY RANGE (activity_timestamp) (
  PARTITION activity_points_2021 VALUES LESS THAN (TO_DATE('2022-01-01', 'YYYY-MM-DD')),
  PARTITION activity_points_2022 VALUES LESS THAN (TO_DATE('2023-01-01', 'YYYY-MM-DD')),
  PARTITION activity_points_2023 VALUES LESS THAN (TO_DATE('2024-01-01', 'YYYY-MM-DD'))
);


-- This allows you to drop old partitions (e.g., for 2021) easily when they are no longer needed:
ALTER TABLE activity_points DROP PARTITION activity_points_2021;
