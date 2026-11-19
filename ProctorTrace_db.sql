CREATE DATABASE IF NOT EXISTS proctortrace_db;

USE proctortrace_db;

USE proctortrace_db;

-- =========================================
-- 1. USERS TABLE
-- =========================================

CREATE TABLE USERS (
    UserID INT AUTO_INCREMENT PRIMARY KEY,
    FullName VARCHAR(100) NOT NULL,
    Email VARCHAR(150) NOT NULL UNIQUE,
    PasswordHash VARCHAR(255) NOT NULL,
    Role VARCHAR(20) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_user_role
    CHECK (Role IN ('ADMIN', 'PROCTOR', 'STUDENT'))
);


-- =========================================
-- 2. EXAMS TABLE
-- =========================================

CREATE TABLE EXAMS (
    ExamID INT AUTO_INCREMENT PRIMARY KEY,
    Title VARCHAR(150) NOT NULL,
    Description TEXT,
    DurationMinutes INT NOT NULL,
    StartTime DATETIME NOT NULL,
    EndTime DATETIME NOT NULL,
    CreatedBy INT NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT chk_exam_duration
    CHECK (DurationMinutes > 0),

    CONSTRAINT chk_exam_time
    CHECK (EndTime > StartTime),

    CONSTRAINT chk_exam_status
    CHECK (Status IN ('DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED')),

    CONSTRAINT fk_exam_creator
    FOREIGN KEY (CreatedBy)
    REFERENCES USERS(UserID)
);


-- =========================================
-- 3. QUESTIONS TABLE
-- =========================================

CREATE TABLE QUESTIONS (
    QuestionID INT AUTO_INCREMENT PRIMARY KEY,
    ExamID INT NOT NULL,
    QuestionText TEXT NOT NULL,
    OptionA VARCHAR(500) NOT NULL,
    OptionB VARCHAR(500) NOT NULL,
    OptionC VARCHAR(500) NOT NULL,
    OptionD VARCHAR(500) NOT NULL,
    CorrectOption CHAR(1) NOT NULL,
    Marks INT NOT NULL,

    CONSTRAINT chk_correct_option
    CHECK (CorrectOption IN ('A', 'B', 'C', 'D')),

    CONSTRAINT chk_question_marks
    CHECK (Marks > 0),

    CONSTRAINT fk_question_exam
    FOREIGN KEY (ExamID)
    REFERENCES EXAMS(ExamID)
);


-- =========================================
-- 4. ATTEMPTS TABLE
-- =========================================

CREATE TABLE ATTEMPTS (
    AttemptID INT AUTO_INCREMENT PRIMARY KEY,
    UserID INT NOT NULL,
    ExamID INT NOT NULL,
    StartTime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    EndTime DATETIME,
    Status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
    Score DECIMAL(8,2) DEFAULT 0,

    CONSTRAINT uq_student_exam
    UNIQUE (UserID, ExamID),

    CONSTRAINT chk_attempt_status
    CHECK (Status IN ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'ABANDONED')),

    CONSTRAINT chk_attempt_score
    CHECK (Score >= 0),

    CONSTRAINT chk_attempt_time
    CHECK (EndTime IS NULL OR EndTime >= StartTime),

    CONSTRAINT fk_attempt_user
    FOREIGN KEY (UserID)
    REFERENCES USERS(UserID),

    CONSTRAINT fk_attempt_exam
    FOREIGN KEY (ExamID)
    REFERENCES EXAMS(ExamID)
);


-- =========================================
-- 5. ANSWERS TABLE
-- =========================================

CREATE TABLE ANSWERS (
    AnswerID INT AUTO_INCREMENT PRIMARY KEY,
    AttemptID INT NOT NULL,
    QuestionID INT NOT NULL,
    Response CHAR(1),
    MarksAwarded DECIMAL(8,2) NOT NULL DEFAULT 0,

    CONSTRAINT uq_attempt_question
    UNIQUE (AttemptID, QuestionID),

    CONSTRAINT chk_answer_response
    CHECK (Response IS NULL OR Response IN ('A', 'B', 'C', 'D')),

    CONSTRAINT chk_marks_awarded
    CHECK (MarksAwarded >= 0),

    CONSTRAINT fk_answer_attempt
    FOREIGN KEY (AttemptID)
    REFERENCES ATTEMPTS(AttemptID),

    CONSTRAINT fk_answer_question
    FOREIGN KEY (QuestionID)
    REFERENCES QUESTIONS(QuestionID)
);


-- =========================================
-- 6. ANOMALY_REPORTS TABLE
-- =========================================

CREATE TABLE ANOMALY_REPORTS (
    ReportID INT AUTO_INCREMENT PRIMARY KEY,
    AttemptID INT NOT NULL,
    AnomalyType VARCHAR(100) NOT NULL,
    EventCount INT NOT NULL DEFAULT 0,
    Severity VARCHAR(20) NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    ReviewedBy INT NULL,
    ReviewNotes TEXT,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_event_count
    CHECK (EventCount >= 0),

    CONSTRAINT chk_anomaly_severity
    CHECK (Severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),

    CONSTRAINT chk_anomaly_status
    CHECK (Status IN ('PENDING', 'REVIEWED', 'DISMISSED')),

    CONSTRAINT fk_report_attempt
    FOREIGN KEY (AttemptID)
    REFERENCES ATTEMPTS(AttemptID),

    CONSTRAINT fk_report_reviewer
    FOREIGN KEY (ReviewedBy)
    REFERENCES USERS(UserID)
    ON DELETE SET NULL
);
USE proctortrace_db;

SHOW TABLES;
DESCRIBE USERS;
DESCRIBE EXAMS;
DESCRIBE QUESTIONS;
DESCRIBE ATTEMPTS;
DESCRIBE ANSWERS;
DESCRIBE ANOMALY_REPORTS;

USE proctortrace_db;

CREATE INDEX idx_exam_status
ON EXAMS(Status);

CREATE INDEX idx_exam_creator
ON EXAMS(CreatedBy);

CREATE INDEX idx_question_exam
ON QUESTIONS(ExamID);

CREATE INDEX idx_attempt_status
ON ATTEMPTS(Status);

CREATE INDEX idx_attempt_exam
ON ATTEMPTS(ExamID);

CREATE INDEX idx_report_severity
ON ANOMALY_REPORTS(Severity);

CREATE INDEX idx_report_status
ON ANOMALY_REPORTS(Status);
SHOW INDEX FROM ATTEMPTS;
SHOW INDEX FROM ANOMALY_REPORTS;

USE proctortrace_db;

SELECT UserID, FullName, Email, Role, CreatedAt
FROM USERS;


USE proctortrace_db;

UPDATE USERS
SET Role = 'ADMIN'
WHERE Email = 'student1@example.com';


UPDATE EXAMS
SET
    StartTime = DATE_SUB(NOW(), INTERVAL 5 MINUTE),
    EndTime = DATE_ADD(NOW(), INTERVAL 2 HOUR),
    Status = 'SCHEDULED'
WHERE ExamID = 1;

SELECT
    QuestionID,
    ExamID,
    QuestionText
FROM QUESTIONS
WHERE ExamID = 1;

SELECT *
FROM ATTEMPTS
WHERE UserID = 2 AND ExamID = 1;

SELECT QuestionID, ExamID, QuestionText, Marks
FROM QUESTIONS;

SELECT
    a.AttemptID,
    u.FullName,
    e.Title,
    a.Status,
    a.Score,
    ans.QuestionID,
    ans.Response,
    ans.MarksAwarded
FROM ATTEMPTS a
JOIN USERS u ON a.UserID = u.UserID
JOIN EXAMS e ON a.ExamID = e.ExamID
LEFT JOIN ANSWERS ans ON a.AttemptID = ans.AttemptID
ORDER BY a.AttemptID, ans.QuestionID;


SELECT ExamID, Title, Status, StartTime, EndTime
FROM EXAMS
WHERE ExamID = 1;
SELECT
    ExamID,
    Status,
    NOW() AS DatabaseTime,
    StartTime,
    EndTime,
    CASE
        WHEN NOW() BETWEEN StartTime AND EndTime
             AND Status = 'SCHEDULED'
        THEN 'READY'
        ELSE 'NOT READY'
    END AS ExamAvailability
FROM EXAMS
WHERE ExamID = 1;



SELECT *
FROM ANOMALY_REPORTS
ORDER BY ReportID DESC;

SELECT
    ReportID,
    AttemptID,
    AnomalyType,
    EventCount,
    Severity,
    Status,
    CreatedAt
FROM ANOMALY_REPORTS
ORDER BY ReportID DESC
LIMIT 5;
SELECT UserID, FullName, Email, Role
FROM USERS;
UPDATE USERS
SET Role = 'PROCTOR'
WHERE Email = 'your-proctor-email@example.com';

INSERT INTO USERS (FullName, Email, PasswordHash, Role)
VALUES (
    'Demo Proctor',
    'proctor@example.com',
    '$2b$12$JLKM.fxmvvgxTEvQHo7lieyY6kxwXMxp8LI3u7P3CugFNatk2.MAG',
    'PROCTOR'
);
UPDATE USERS
SET PasswordHash = '$2b$12$ueogCyyZrlIAaEDOPeYXqeIP.vnarXGaqzrpWBoRqeyKPoxszsX.e',
    Role = 'PROCTOR'
WHERE Email = 'proctor@example.com';
SELECT UserID, FullName, Email, Role
FROM USERS
WHERE Email = 'proctor@example.com';
UPDATE USERS
SET PasswordHash = '$2b$12$fsGzHTRxIjW.//Dd0VA3oODwIvwT0FoJ45DdAZBFg7k1koioed5F'
WHERE Email = 'student1@example.com';

SELECT UserID, FullName, Email, Role
FROM USERS
WHERE Email = 'student2@example.com';
SELECT ExamID, Title, StartTime, EndTime, Status
FROM EXAMS;
UPDATE EXAMS
SET Status = 'SCHEDULED',
    StartTime = DATE_ADD(NOW(), INTERVAL 10 MINUTE),
    EndTime = DATE_ADD(NOW(), INTERVAL 2 HOUR)
WHERE ExamID = 1;
SELECT ExamID, Title, StartTime, EndTime, Status
FROM EXAMS
WHERE ExamID = 1;
SELECT
    ExamID,
    Status,
    NOW() AS CurrentTime,
    StartTime,
    EndTime
FROM EXAMS
WHERE ExamID = 1;
SELECT ExamID, Title, Status
FROM EXAMS;
INSERT INTO QUESTIONS
(ExamID, QuestionText, OptionA, OptionB, OptionC, OptionD, CorrectOption, Marks)
VALUES
(2, 'Which SQL command is used to retrieve data from a table?',
'INSERT', 'UPDATE', 'SELECT', 'DELETE', 'C', 5),

(2, 'Which key uniquely identifies each record in a table?',
'Foreign Key', 'Primary Key', 'Candidate Key', 'Alternate Key', 'B', 5);

SELECT *
FROM ANOMALY_REPORTS
ORDER BY ReportID DESC;
USE proctortrace_db;

CREATE OR REPLACE VIEW VW_STUDENT_EXAM_RESULTS AS
SELECT
    u.UserID,
    u.FullName,
    u.Email,
    e.ExamID,
    e.Title AS ExamTitle,
    a.AttemptID,
    a.StartTime,
    a.EndTime,
    a.Status AS AttemptStatus,
    a.Score
FROM USERS u
JOIN ATTEMPTS a ON u.UserID = a.UserID
JOIN EXAMS e ON a.ExamID = e.ExamID;

-- =====
-- funct
-- ======
USE proctortrace_db;

DELIMITER //

CREATE PROCEDURE SP_GET_STUDENT_RESULTS(
    IN p_UserID INT
)
BEGIN
    SELECT
        u.FullName,
        e.Title AS ExamTitle,
        a.AttemptID,
        a.Status AS AttemptStatus,
        a.Score,
        a.StartTime,
        a.EndTime
    FROM USERS u
    JOIN ATTEMPTS a ON u.UserID = a.UserID
    JOIN EXAMS e ON a.ExamID = e.ExamID
    WHERE u.UserID = p_UserID
    ORDER BY a.StartTime DESC;
END //

DELIMITER ;
CALL SP_GET_STUDENT_RESULTS(2);
SELECT
    e.ExamID,
    e.Title AS ExamTitle,
    COUNT(a.AttemptID) AS TotalAttempts,
    AVG(a.Score) AS AverageScore,
    MAX(a.Score) AS HighestScore,
    MIN(a.Score) AS LowestScore
FROM EXAMS e
LEFT JOIN ATTEMPTS a ON e.ExamID = a.ExamID
GROUP BY e.ExamID, e.Title
HAVING COUNT(a.AttemptID) > 0
ORDER BY AverageScore DESC;
SELECT
    UserID,
    FullName,
    Email
FROM USERS
WHERE UserID IN (
    SELECT DISTINCT UserID
    FROM ATTEMPTS
    WHERE Score > (
        SELECT AVG(Score)
        FROM ATTEMPTS
    )
);

USE proctortrace_db;

DELIMITER //

CREATE TRIGGER TRG_ATTEMPT_END_TIME
BEFORE UPDATE ON ATTEMPTS
FOR EACH ROW
BEGIN
    IF OLD.Status = 'IN_PROGRESS'
       AND NEW.Status IN ('SUBMITTED', 'AUTO_SUBMITTED') THEN
        SET NEW.EndTime = CURRENT_TIMESTAMP;
    END IF;
END //

DELIMITER ;

SHOW TRIGGERS
WHERE `Trigger` = 'TRG_ATTEMPT_END_TIME';

USE proctortrace_db;

SELECT
    TABLE_NAME,
    CONSTRAINT_NAME,
    CONSTRAINT_TYPE
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = 'proctortrace_db'
ORDER BY TABLE_NAME, CONSTRAINT_TYPE;
SELECT
    TABLE_NAME,
    INDEX_NAME,
    COLUMN_NAME,
    NON_UNIQUE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'proctortrace_db'
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

USE proctortrace_db;

SELECT
    ExamID,
    QuestionID,
    QuestionText,
    OptionA,
    OptionB,
    OptionC,
    OptionD,
    CorrectOption,
    Marks
FROM QUESTIONS
ORDER BY QuestionID DESC;

USE proctortrace_db;

SELECT
    ReportID,
    AttemptID,
    Severity,
    Status,
    ReviewedBy,
    ReviewNotes
FROM ANOMALY_REPORTS
ORDER BY ReportID DESC;


USE proctortrace_db;

DELIMITER //

CREATE FUNCTION FN_GET_ATTEMPT_PERCENTAGE(
    p_AttemptID INT
)
RETURNS DECIMAL(5,2)
DETERMINISTIC
READS SQL DATA

USE ProctorTrace_db;

BEGIN
    DECLARE v_Score DECIMAL(10,2);
    DECLARE v_TotalMarks DECIMAL(10,2);

    SELECT
        a.Score,
        SUM(q.Marks)
    INTO
        v_Score,
        v_TotalMarks
    FROM ATTEMPTS a
    JOIN ANSWERS ans ON a.AttemptID = ans.AttemptID
    JOIN QUESTIONS q ON ans.QuestionID = q.QuestionID
    WHERE a.AttemptID = p_AttemptID
    GROUP BY a.AttemptID, a.Score;

    RETURN CASE
        WHEN v_TotalMarks IS NULL OR v_TotalMarks = 0 THEN 0
        ELSE (v_Score / v_TotalMarks) * 100
    END;
END //

DELIMITER ;

SHOW FUNCTION STATUS
WHERE Db = 'proctortrace_db';


USE proctortrace_db;

WITH ExamAverages AS (
    SELECT
        ExamID,
        AVG(Score) AS AverageScore
    FROM ATTEMPTS
    WHERE Score IS NOT NULL
    GROUP BY ExamID
)
SELECT
    u.FullName,
    e.Title AS ExamTitle,
    a.Score,
    ea.AverageScore
FROM ATTEMPTS a
JOIN ExamAverages ea ON a.ExamID = ea.ExamID
JOIN USERS u ON a.UserID = u.UserID
JOIN EXAMS e ON a.ExamID = e.ExamID
WHERE a.Score > ea.AverageScore;

WITH RECURSIVE NumberSequence AS (
    SELECT 1 AS Number
    UNION ALL
    SELECT Number + 1
    FROM NumberSequence
    WHERE Number < 5
)
SELECT Number
FROM NumberSequence;
USE proctortrace_db;

SELECT
    u.FullName,
    e.Title AS ExamTitle,
    a.Score
FROM ATTEMPTS a
JOIN USERS u ON a.UserID = u.UserID
JOIN EXAMS e ON a.ExamID = e.ExamID
WHERE a.Score > (
    SELECT AVG(a2.Score)
    FROM ATTEMPTS a2
    WHERE a2.ExamID = a.ExamID
);

USE proctortrace_db;

DROP FUNCTION IF EXISTS FN_GET_ATTEMPT_PERCENTAGE;

DELIMITER //

CREATE FUNCTION FN_GET_ATTEMPT_PERCENTAGE(
    p_AttemptID INT
)
RETURNS DECIMAL(5,2)
NOT DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE v_Score DECIMAL(10,2);
    DECLARE v_TotalMarks DECIMAL(10,2);

    SELECT
        a.Score,
        SUM(q.Marks)
    INTO
        v_Score,
        v_TotalMarks
    FROM ATTEMPTS a
    JOIN ANSWERS ans
        ON a.AttemptID = ans.AttemptID
    JOIN QUESTIONS q
        ON ans.QuestionID = q.QuestionID
    WHERE a.AttemptID = p_AttemptID
    GROUP BY a.AttemptID, a.Score;

    RETURN CASE
        WHEN v_TotalMarks IS NULL OR v_TotalMarks = 0 THEN 0
        ELSE (v_Score / v_TotalMarks) * 100
    END;
END //

DELIMITER ;
SHOW FUNCTION STATUS
WHERE Db = 'proctortrace_db';
SELECT FN_GET_ATTEMPT_PERCENTAGE(4);