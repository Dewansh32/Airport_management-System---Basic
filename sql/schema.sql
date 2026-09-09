-- ============================================================================
-- Airport Management System - MySQL schema (idempotent)
-- ============================================================================
-- Safe to run against:
--   1) a brand new empty database, or
--   2) the existing development database (it will NOT drop tables or delete
--      existing rows - it only creates what's missing and adds columns that
--      the application code requires but an older copy of this schema may
--      be missing).
--
-- Run it with:
--   npm run setup-db
-- or manually with the MySQL client:
--   mysql -u root -p airportdb < sql/schema.sql
--
-- For a destructive full reset with fresh demo data, see sql/demo_reset.sql
-- instead - do NOT use that one on a database you care about.
-- ============================================================================

CREATE TABLE IF NOT EXISTS city (
  CNAME   VARCHAR(15) NOT NULL,
  STATE   VARCHAR(15),
  COUNTRY VARCHAR(30),
  PRIMARY KEY (CNAME)
);

CREATE TABLE IF NOT EXISTS airport (
  AP_NAME VARCHAR(100) NOT NULL,
  STATE   VARCHAR(15),
  COUNTRY VARCHAR(30),
  CNAME   VARCHAR(15),
  PRIMARY KEY (AP_NAME),
  KEY idx_airport_cname (CNAME),
  CONSTRAINT airport_ibfk_1 FOREIGN KEY (CNAME) REFERENCES city (CNAME) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS airline (
  AIRLINEID        VARCHAR(3) NOT NULL,
  AL_NAME          VARCHAR(50),
  THREE_DIGIT_CODE VARCHAR(3),
  PRIMARY KEY (AIRLINEID)
);

CREATE TABLE IF NOT EXISTS contains (
  AIRLINEID VARCHAR(3) NOT NULL,
  AP_NAME   VARCHAR(100) NOT NULL,
  PRIMARY KEY (AIRLINEID, AP_NAME),
  KEY idx_contains_ap_name (AP_NAME),
  CONSTRAINT contains_ibfk_1 FOREIGN KEY (AIRLINEID) REFERENCES airline (AIRLINEID) ON DELETE CASCADE,
  CONSTRAINT contains_ibfk_2 FOREIGN KEY (AP_NAME) REFERENCES airport (AP_NAME) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS flight (
  FLIGHT_CODE     VARCHAR(10) NOT NULL,
  SOURCE          VARCHAR(3),
  DESTINATION     VARCHAR(3),
  ARRIVAL         VARCHAR(10),
  DEPARTURE       VARCHAR(10),
  STATUS          VARCHAR(10),
  DURATION        VARCHAR(30),
  FLIGHTTYPE      VARCHAR(10),
  LAYOVER_TIME    VARCHAR(30),
  NO_OF_STOPS     INT,
  AIRLINEID       VARCHAR(3),
  AVAILABLE_SEATS INT NOT NULL DEFAULT 100,
  PRIMARY KEY (FLIGHT_CODE),
  KEY idx_flight_airlineid (AIRLINEID),
  CONSTRAINT flight_ibfk_1 FOREIGN KEY (AIRLINEID) REFERENCES airline (AIRLINEID) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS passenger1 (
  PID        INT NOT NULL,
  PASSPORTNO VARCHAR(10) NOT NULL,
  PRIMARY KEY (PID, PASSPORTNO)
);

CREATE TABLE IF NOT EXISTS passenger2 (
  PASSPORTNO VARCHAR(10) NOT NULL,
  FNAME      VARCHAR(20),
  M          VARCHAR(1),
  LNAME      VARCHAR(20),
  ADDRESS    VARCHAR(100),
  PHONE      VARCHAR(20),
  AGE        INT,
  SEX        VARCHAR(1),
  PRIMARY KEY (PASSPORTNO)
);

CREATE TABLE IF NOT EXISTS passenger3 (
  PID         INT NOT NULL,
  FLIGHT_CODE VARCHAR(10),
  PRIMARY KEY (PID),
  KEY idx_passenger3_flight_code (FLIGHT_CODE),
  CONSTRAINT passenger3_ibfk_1 FOREIGN KEY (FLIGHT_CODE) REFERENCES flight (FLIGHT_CODE) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ticket1 (
  TICKET_NUMBER         BIGINT NOT NULL,
  FLIGHT_CODE           VARCHAR(10),
  SOURCE                VARCHAR(3),
  DESTINATION           VARCHAR(3),
  DATE_OF_BOOKING       DATE,
  DATE_OF_TRAVEL        DATE,
  SEATNO                VARCHAR(5),
  CLASS                 VARCHAR(15),
  DATE_OF_CANCELLATION  DATE,
  PID                   INT,
  PASSPORTNO            VARCHAR(10),
  PRIMARY KEY (TICKET_NUMBER),
  KEY idx_ticket1_pid_passportno (PID, PASSPORTNO),
  KEY idx_ticket1_flight_code (FLIGHT_CODE),
  CONSTRAINT ticket1_ibfk_1 FOREIGN KEY (PID, PASSPORTNO) REFERENCES passenger1 (PID, PASSPORTNO) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(10) NOT NULL DEFAULT 'user'
);

-- ----------------------------------------------------------------------------
-- Repair block: patches columns that the application needs but that an older
-- copy of this database (created before this script existed) might be
-- missing. All statements below are safe to re-run.
-- ----------------------------------------------------------------------------

-- MySQL's ALTER TABLE has no "ADD COLUMN/INDEX/CONSTRAINT IF NOT EXISTS"
-- clause (unlike MariaDB), so each repair below checks information_schema
-- first and only runs the ALTER via dynamic SQL when it's actually needed.
-- This makes the whole script safe to run repeatedly.

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'airport' AND COLUMN_NAME = 'IATA_CODE'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE airport ADD COLUMN IATA_CODE VARCHAR(3) NULL',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'flight' AND COLUMN_NAME = 'AVAILABLE_SEATS'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE flight ADD COLUMN AVAILABLE_SEATS INT NOT NULL DEFAULT 100',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket1' AND COLUMN_NAME = 'FLIGHT_CODE'
);
SET @ddl := IF(@col_exists = 0,
  'ALTER TABLE ticket1 ADD COLUMN FLIGHT_CODE VARCHAR(10) NULL',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ticket1' AND INDEX_NAME = 'idx_ticket1_flight_code'
);
SET @ddl := IF(@idx_exists = 0,
  'ALTER TABLE ticket1 ADD INDEX idx_ticket1_flight_code (FLIGHT_CODE)',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE passenger2 MODIFY COLUMN PHONE VARCHAR(20);

-- Add the ticket1 -> flight foreign key only if it doesn't already exist.
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ticket1'
    AND CONSTRAINT_NAME = 'ticket1_flight_fk'
);
SET @ddl := IF(@fk_exists = 0,
  'ALTER TABLE ticket1 ADD CONSTRAINT ticket1_flight_fk FOREIGN KEY (FLIGHT_CODE) REFERENCES flight (FLIGHT_CODE) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------------------
-- Seed data. INSERT IGNORE is used everywhere so re-running this script never
-- overwrites or duplicates rows that already exist (e.g. real bookings made
-- through the running app).
-- ----------------------------------------------------------------------------

INSERT IGNORE INTO city (CNAME, STATE, COUNTRY) VALUES
  ('Louisville','Kentucky','United States'),
  ('Chandigarh','Chandigarh','India'),
  ('Fort Worth','Texas','United States'),
  ('Delhi','Delhi','India'),
  ('Mumbai','Maharashtra','India'),
  ('San Francisco','California','United States'),
  ('Frankfurt','Hesse','Germany'),
  ('Houston','Texas','United States'),
  ('New York City','New York','United States'),
  ('Tampa','Florida','United States');

INSERT IGNORE INTO airport (AP_NAME, STATE, COUNTRY, CNAME, IATA_CODE) VALUES
  ('Louisville International Airport','Kentucky','United States','Louisville','SDF'),
  ('Chandigarh International Airport','Chandigarh','India','Chandigarh','IXC'),
  ('Dallas/Fort Worth International Airport','Texas','United States','Fort Worth','DFW'),
  ('Indira GandhiInternational Airport','Delhi','India','Delhi','DEL'),
  ('Chhatrapati Shivaji International Airport','Maharashtra','India','Mumbai','BOM'),
  ('San Francisco International Airport','California','United States','San Francisco','SFO'),
  ('Frankfurt Airport','Hesse','Germany','Frankfurt','FRA'),
  ('George Bush Intercontinental Airport','Texas','United States','Houston','IAH'),
  ('John F. Kennedy International Airport','New York','United States','New York City','JFK'),
  ('Tampa International Airport','Florida','United States','Tampa','TPA');

INSERT IGNORE INTO airline (AIRLINEID, AL_NAME, THREE_DIGIT_CODE) VALUES
  ('AA','American Airlines','001'),
  ('AI','Air India Limited','098'),
  ('LH','Lufthansa','220'),
  ('BA','British Airways','125'),
  ('QR','Qatar Airways','157'),
  ('9W','Jet Airways','589'),
  ('EK','Emirates','176'),
  ('EY','Ethiad Airways','607');

INSERT IGNORE INTO contains (AIRLINEID, AP_NAME) VALUES
  ('AA','Louisville International Airport'),
  ('AA','John F. Kennedy International Airport'),
  ('AA','George Bush Intercontinental Airport'),
  ('AA','San Francisco International Airport'),
  ('AA','Tampa International Airport'),
  ('AI','Chandigarh International Airport'),
  ('AI','Dallas/Fort Worth International Airport'),
  ('AI','Indira GandhiInternational Airport'),
  ('AI','Chhatrapati Shivaji International Airport'),
  ('AI','George Bush Intercontinental Airport'),
  ('LH','Chhatrapati Shivaji International Airport'),
  ('LH','Frankfurt Airport'),
  ('LH','John F. Kennedy International Airport'),
  ('LH','San Francisco International Airport'),
  ('LH','Dallas/Fort Worth International Airport'),
  ('BA','John F. Kennedy International Airport'),
  ('BA','Chhatrapati Shivaji International Airport'),
  ('BA','Chandigarh International Airport'),
  ('BA','Frankfurt Airport'),
  ('BA','San Francisco International Airport'),
  ('QR','Chhatrapati Shivaji International Airport'),
  ('QR','Dallas/Fort Worth International Airport'),
  ('QR','John F. Kennedy International Airport'),
  ('QR','Tampa International Airport'),
  ('QR','Louisville International Airport');

INSERT IGNORE INTO flight (FLIGHT_CODE, SOURCE, DESTINATION, ARRIVAL, DEPARTURE, STATUS, DURATION, FLIGHTTYPE, LAYOVER_TIME, NO_OF_STOPS, AIRLINEID, AVAILABLE_SEATS) VALUES
  ('AI2014','BOM','DFW','02:10','03:15','On-time','24hr','Connecting','3',1,'AI',100),
  ('QR2305','BOM','DFW','13:00','13:55','Delayed','21hr','Non-stop','0',0,'QR',100),
  ('EY1234','JFK','TPA','19:20','20:05','On-time','16hrs','Connecting','5',2,'EY',100),
  ('LH9876','JFK','BOM','05:50','06:35','On-time','18hrs','Non-stop','0',0,'LH',100),
  ('BA1689','FRA','DEL','10:20','10:55','On-time','14hrs','Non-stop','0',0,'BA',100),
  ('AA4367','SFO','FRA','18:10','18:55','On-time','21hrs','Non-stop','0',0,'AA',100),
  ('QR1902','IXC','IAH','22:00','22:50','Delayed','28hrs','Non-stop','5',1,'QR',100),
  ('BA3056','BOM','DFW','02:15','02:55','On-time','29hrs','Connecting','3',1,'BA',100),
  ('EK3456','BOM','SFO','18:50','19:40','On-time','30hrs','Non-stop','0',0,'EK',100),
  ('9W2334','IAH','DEL','23:00','13:45','On-time','23hrs','Direct','0',0,'9W',100);

-- passenger1 / passenger2 / passenger3 / ticket1 are intentionally NOT
-- seeded here. The running app populates them itself as real users book
-- flights (PASSENGER1.PID is the same integer as users.id). Seeding
-- fixed small PID values like 1-15 would collide with real users' ids as
-- they register, making demo bookings appear to belong to whichever real
-- account happens to get that id - so those tables start empty on a fresh
-- install. See sql/legacy_full_design_reference.sql if you want the
-- original standalone sample passenger/ticket data for reference.
