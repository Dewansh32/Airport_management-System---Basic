-- ============================================================================
-- DESTRUCTIVE demo/reset script.
--
-- This DROPS every application table and recreates them with fresh sample
-- data. It permanently deletes all registered users, bookings, and any
-- flights you added or edited through the admin panel.
--
-- Do NOT run this against a database you care about. It exists only to
-- give graders/reviewers/you a clean, known-good demo state quickly.
--
-- Usage (run both commands, in order, from the project root):
--   mysql -u root -p airportdb < sql/demo_reset.sql
--   mysql -u root -p airportdb < sql/schema.sql
-- Or: npm run setup-db  (after the drop step below)
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS ticket1;
DROP TABLE IF EXISTS passenger3;
DROP TABLE IF EXISTS passenger2;
DROP TABLE IF EXISTS passenger1;
DROP TABLE IF EXISTS flight;
DROP TABLE IF EXISTS contains;
DROP TABLE IF EXISTS airline;
DROP TABLE IF EXISTS airport;
DROP TABLE IF EXISTS city;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- After running this file, re-create tables and seed data by also running
-- sql/schema.sql (see the commands above).
