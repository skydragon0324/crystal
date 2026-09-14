-- Create Archive Table
CREATE TABLE activity_points_archive (
  point_pk NUMBER,
  user_pk NUMBER,
  points NUMBER,
  reason VARCHAR2(255),
  activity_timestamp TIMESTAMP,
  PRIMARY KEY (point_pk)
);


-- Move Data to Archive
BEGIN
  -- Move data older than 1 year to the archive table
  INSERT INTO activity_points_archive
  SELECT * FROM activity_points
  WHERE activity_timestamp < (SYSDATE - INTERVAL '1' YEAR);

  -- Delete the moved data from the main table
  DELETE FROM activity_points
  WHERE activity_timestamp < (SYSDATE - INTERVAL '1' YEAR);
  
  COMMIT;
END;

 -- Schedule Periodic Cleanup
 BEGIN
  DBMS_SCHEDULER.create_job (
    job_name        => 'cleanup_activity_points',
    job_type        => 'PLSQL_BLOCK',
    job_action      => 'BEGIN
                          INSERT INTO activity_points_archive
                          SELECT * FROM activity_points
                          WHERE activity_timestamp < (SYSDATE - INTERVAL ''1'' YEAR);
                          DELETE FROM activity_points
                          WHERE activity_timestamp < (SYSDATE - INTERVAL ''1'' YEAR);
                          COMMIT;
                        END;',
    start_date      => SYSTIMESTAMP,
    repeat_interval => 'FREQ=MONTHLY; BYDAY=1',
    enabled         => TRUE
  );
END;


-- Create a View to Combine Active and Archived Data
CREATE OR REPLACE VIEW user_activity_points AS
SELECT point_pk, user_pk, points, reason, activity_timestamp
FROM activity_points
UNION ALL
SELECT point_pk, user_pk, points, reason, activity_timestamp
FROM activity_points_archive;

-- Calculating Total Activity Points Using the View
SELECT user_pk, SUM(points) AS total_activity_points
FROM user_activity_points
WHERE user_pk = <user_id>
GROUP BY user_pk;

-- Optimizing Performance with Indexing
CREATE INDEX idx_activity_points_user ON activity_points (user_pk);
CREATE INDEX idx_activity_points_archive_user ON activity_points_archive (user_pk);


---------------------------------
--- NEW way to use summary table that precalculated activity_point
-- Active Table Structure (Summary Table):
CREATE TABLE activity_points_summary (
  user_pk NUMBER PRIMARY KEY,  -- User identifier
  total_activity_points NUMBER DEFAULT 0,  -- Precomputed total points for the user
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP  -- Timestamp when total points were last updated
);

-- Updating the Active Table after Archiving
BEGIN
  -- Move old activity points to the archive table (e.g., points older than 1 year)
  INSERT INTO activity_points_archive
  SELECT * FROM activity_points
  WHERE activity_timestamp < (SYSDATE - INTERVAL '1' YEAR);

  -- Delete the moved data from the active table
  DELETE FROM activity_points
  WHERE activity_timestamp < (SYSDATE - INTERVAL '1' YEAR);

  -- Update the total points in the summary table by summing points for each user from the archive
  FOR user IN (SELECT user_pk FROM activity_points_archive GROUP BY user_pk) LOOP
    UPDATE activity_points_summary
    SET total_activity_points = (
      SELECT SUM(points)
      FROM activity_points_archive
      WHERE user_pk = user.user_pk
    )
    WHERE user_pk = user.user_pk;
  END LOOP;

  COMMIT;
END;

-- Trigger on Insertion
CREATE OR REPLACE TRIGGER update_total_activity_points
AFTER INSERT ON activity_points
FOR EACH ROW
BEGIN
  UPDATE activity_points_summary
  SET total_activity_points = total_activity_points + :NEW.points
  WHERE user_pk = :NEW.user_pk;
END;

