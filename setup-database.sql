-- ============================================================
-- University Parking System — MySQL schema (XAMPP / phpMyAdmin)
-- ============================================================
-- NOTE: Aap ye file chalayen ya na chalayen, koi farq nahi padta —
-- "npm start" khud hi database aur tables bana leta hai.
-- Ye file sirf un logon ke liye hai jo phpMyAdmin se manually
-- import karna chahte hain.
--
-- phpMyAdmin mein use karne ka tareeqa:
--   1. XAMPP Control Panel mein Apache + MySQL "Start" karein.
--   2. Browser mein http://localhost/phpmyadmin kholein.
--   3. "Import" tab par jayen aur ye file select karein, phir "Go".
--
-- Har feature ka apna, saaf table hai — koi generic JSON "sync_store"
-- nahi. Jo dashboard par dikhta hai, wahi table mein seedha stored hai:
--   users               -> accounts (student/faculty/staff/admin)
--   sessions            -> login tokens
--   parking_slots       -> live slot map (A-01, B-06, ... status)
--   reservation_requests-> student ne jo slot request kiya, uska record
--   issues              -> "Report an Issue" se aaye reports
--   announcements       -> admin ke announcements
-- ============================================================

CREATE DATABASE IF NOT EXISTS `university_parking`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `university_parking`;

-- Accounts: students, faculty, staff, and the admin.
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fullName VARCHAR(255) NOT NULL,
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(30) NULL,
  department VARCHAR(150) NULL,
  passwordHash VARCHAR(255) NOT NULL,
  salt VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user',        -- 'user' or 'admin'
  userType VARCHAR(20) NOT NULL DEFAULT 'student',  -- 'student' | 'faculty' | 'staff'
  status VARCHAR(20) NOT NULL DEFAULT 'active',     -- 'active' or 'suspended'
  noShowCount INT NOT NULL DEFAULT 0,
  blockedUntil DATETIME NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Login sessions (one token per logged-in browser).
CREATE TABLE IF NOT EXISTS sessions (
  token VARCHAR(64) PRIMARY KEY,
  userId INT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiresAt DATETIME NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- The live parking slot map shown on both dashboards. `id` is the slot
-- code visible in the UI (e.g. 'A-01', 'B-06').
CREATE TABLE IF NOT EXISTS parking_slots (
  id VARCHAR(20) PRIMARY KEY,
  block VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'available',  -- available, occupied, reserved, disabled
  vehicleType VARCHAR(30) NULL  -- Car/Truck/Bus/Motorcycle, set by the camera when it detects a vehicle; NULL when available
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A student's request to reserve a slot, and the admin's decision on it.
-- userId is the real identity used for no-show/strike/duplicate-booking
-- checks (two accounts can share a full name, never a userId);
-- userFullName is kept purely for display.
CREATE TABLE IF NOT EXISTS reservation_requests (
  id VARCHAR(60) PRIMARY KEY,
  userId INT NULL,
  userFullName VARCHAR(150) NOT NULL,
  slotId VARCHAR(20) NOT NULL,
  timeSlot VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',   -- pending, approved, rejected, completed, noshow
  createdAt BIGINT NOT NULL,
  decidedAt BIGINT NULL,
  checkInDeadline BIGINT NULL,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Problems students report via "Report an Issue".
CREATE TABLE IF NOT EXISTS issues (
  id VARCHAR(60) PRIMARY KEY,
  userId INT NULL,
  userFullName VARCHAR(150) NOT NULL,
  type VARCHAR(50),
  spot VARCHAR(50),
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',      -- open, resolved
  createdAt BIGINT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Announcements the admin posts for students.
CREATE TABLE IF NOT EXISTS announcements (
  id VARCHAR(60) PRIMARY KEY,
  message TEXT NOT NULL,
  type VARCHAR(30),
  recipient VARCHAR(100),
  timeLabel VARCHAR(100),
  createdAt BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Vehicle Entry/Exit log (Admin "Vehicle Entry / Exit Logs" tab): every
-- camera-detected or manually-logged parking event. No FK to
-- parking_slots on purpose -- a log entry must stay readable even if
-- its slot is later removed.
CREATE TABLE IF NOT EXISTS vehicle_logs (
  id VARCHAR(60) PRIMARY KEY,
  vehicleType VARCHAR(30),
  slotId VARCHAR(20) NOT NULL,
  entryTime VARCHAR(20),
  exitTime VARCHAR(20),
  duration VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'checkedin',
  source VARCHAR(20) NOT NULL DEFAULT 'manual',
  createdAt BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- MIGRATION for databases that were already set up before the
-- vehicleType column existed on parking_slots (so the camera can
-- report Car/Truck/Bus/Motorcycle instead of the slot only ever
-- knowing "occupied"/"available"). Safe to re-run: it errors with
-- "Duplicate column name" (harmless, ignore it) if already applied.
-- ============================================================
ALTER TABLE parking_slots ADD COLUMN vehicleType VARCHAR(30) NULL;

-- MIGRATION: profile picture URL (e.g. '/uploads/avatars/user_5.png').
-- Only the path is stored here; the actual image file lives on disk
-- under public/uploads/avatars/. Safe to re-run (ignore the duplicate
-- column error if already applied).
ALTER TABLE users ADD COLUMN profilePicUrl VARCHAR(500) NULL;

-- MIGRATION: drop the plate/license-plate column -- the admin dashboard
-- no longer collects or displays vehicle plate numbers. Safe to re-run:
-- it errors with "check that column/key exists" (harmless, ignore it)
-- if already applied.
ALTER TABLE vehicle_logs DROP COLUMN plate;