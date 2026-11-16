// src/config/database.js
// MySQL connection pool (works with XAMPP's MySQL/MariaDB out of the box)
// + automatic schema creation, so `npm start` "just works" the same way
// the old SQLite version did — as long as XAMPP's MySQL is running.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { hashPassword } = require('../utils/password');

// Fixed, seeded admin account — created fresh on every server start since
// there's no more "first registered user becomes admin" bootstrap rule.
// Override via .env if you don't want the defaults.
const DEFAULT_ADMIN = {
  fullName: process.env.ADMIN_FULL_NAME || 'System Admin',
  username: process.env.ADMIN_USERNAME || 'admin',
  email: process.env.ADMIN_EMAIL || 'admin@parking.edu',
  password: process.env.ADMIN_PASSWORD || 'admin123',
  phone: process.env.ADMIN_PHONE || '',
  department: process.env.ADMIN_DEPARTMENT || 'Facilities & Transport Office',
};

// --- tiny built-in .env loader (no extra "dotenv" package needed) ---
(function loadEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
})();

// XAMPP defaults: host=localhost, user=root, password='' (empty), port=3306
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'university_parking';

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true, // DATE/DATETIME columns come back as plain strings (easier JS date comparisons)
});

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fullName VARCHAR(255) NOT NULL,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(30) NULL,
    department VARCHAR(150) NULL,
    passwordHash VARCHAR(255) NOT NULL,
    salt VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    userType VARCHAR(20) NOT NULL DEFAULT 'student',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    noShowCount INT NOT NULL DEFAULT 0,
    blockedUntil DATETIME NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS sessions (
    token VARCHAR(64) PRIMARY KEY,
    userId INT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expiresAt DATETIME NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // The real, live parking slot map (Admin "Manage Parking Slots" +
  // the lot view on both dashboards). id is the slot code shown in
  // the UI (e.g. 'A-01'), so it doubles as a natural key. vehicleType
  // is set by the camera (vehicle_detection.py) when it detects a
  // vehicle (Car/Truck/Bus/Motorcycle); NULL when the slot is empty.
  `CREATE TABLE IF NOT EXISTS parking_slots (
    id VARCHAR(20) PRIMARY KEY,
    block VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'available',
    vehicleType VARCHAR(30) NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Reservation requests: a student requests a slot, an admin
  // approves/rejects/completes it. One row per request, its own
  // table instead of a JSON blob, with real foreign keys into
  // users and parking_slots. userId is the real identity match (the
  // no-show/strike/duplicate-booking logic keys off this, NOT the
  // display name — two accounts can share a full name, but never a
  // userId); userFullName stays purely for display.
  `CREATE TABLE IF NOT EXISTS reservation_requests (
    id VARCHAR(60) PRIMARY KEY,
    userId INT NULL,
    userFullName VARCHAR(150) NOT NULL,
    slotId VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    createdAt BIGINT NOT NULL,
    decidedAt BIGINT NULL,
    checkInDeadline BIGINT NULL,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Issues reported by students ("Report an Issue"), reviewed by admin.
  // Same userId-for-identity / userFullName-for-display split as above.
  `CREATE TABLE IF NOT EXISTS issues (
    id VARCHAR(60) PRIMARY KEY,
    userId INT NULL,
    userFullName VARCHAR(150) NOT NULL,
    type VARCHAR(50),
    spot VARCHAR(50),
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    createdAt BIGINT NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Announcements posted by the admin, shown on the student dashboard.
  `CREATE TABLE IF NOT EXISTS announcements (
    id VARCHAR(60) PRIMARY KEY,
    message TEXT NOT NULL,
    type VARCHAR(30),
    recipient VARCHAR(100),
    recipientId INT NULL,
    timeLabel VARCHAR(100),
    createdAt BIGINT NOT NULL,
    FOREIGN KEY (recipientId) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Vehicle Entry/Exit log (Admin "Vehicle Entry / Exit Logs" tab). Was
  // previously only an in-memory JS array on the dashboard page -- lost
  // on every refresh/login. Now a real table, same as slots/requests/
  // issues, so camera-detected AND manually-logged entries survive.
  // No FK to parking_slots on purpose: a log entry must stay readable
  // even if its slot is later removed from "Manage Parking Slots".
  `CREATE TABLE IF NOT EXISTS vehicle_logs (
    id VARCHAR(60) PRIMARY KEY,
    vehicleType VARCHAR(30),
    slotId VARCHAR(20) NOT NULL,
    entryTime VARCHAR(20),
    exitTime VARCHAR(20),
    duration VARCHAR(20),
    status VARCHAR(20) NOT NULL DEFAULT 'checkedin',
    source VARCHAR(20) NOT NULL DEFAULT 'manual',
    createdAt BIGINT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];


// Tables ko sirf tab banata hai jab woh exist na karein (CREATE TABLE IF
// NOT EXISTS) -- pehle se maujood data (slots, requests, vehicle logs,
// waghera) ko kabhi nahi chhorta. Pehli dafa (khaali database) par sab
// tables ban jayenge; agli baar `npm start` par kuch nahi hoga.
async function ensureSchema() {
  for (const statement of SCHEMA_STATEMENTS) {
    await pool.query(statement);
  }
}

// Columns jo baad mein (feature update ke sath) kisi maujooda table mein
// add hue hon -- CREATE TABLE IF NOT EXISTS unhe nahi banata agar table
// pehle se (purane schema ke sath) exist karta ho. Isliye har column ko
// yahan alag se, apne "ALTER TABLE ... ADD COLUMN" ke sath list karte
// hain, aur "Duplicate column name" error ko chup-chaap ignore karte hain
// (matlab already applied hai) -- taake `npm start` chalate hi purani
// database bhi khud-ba-khud up to date ho jaye, koi manual SQL na chalani
// pare.
const COLUMN_MIGRATIONS = [
  { table: 'parking_slots', column: 'vehicleType', definition: 'VARCHAR(30) NULL' },
  // Profile picture: we store only the public URL/path here (e.g.
  // '/uploads/avatars/user_5.png'), never the image bytes themselves --
  // the actual file lives on disk under public/uploads/avatars/. This
  // way the picture is tied to the ACCOUNT (survives login from any
  // device/browser) instead of being stuck in one browser's
  // localStorage like before.
  { table: 'users', column: 'profilePicUrl', definition: 'VARCHAR(500) NULL' },
];

async function ensureColumns() {
  for (const { table, column, definition } of COLUMN_MIGRATIONS) {
    try {
      await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      console.log(`[db] Added missing column ${table}.${column}`);
    } catch (err) {
      if (err && err.code === 'ER_DUP_FIELDNAME') continue; // already applied, fine
      console.error(`[db] Could not ensure column ${table}.${column}:`, err.message);
    }
  }
}

// Columns that used to exist but have since been removed from the
// product (e.g. vehicle_logs.plate — the dashboard no longer collects
// or displays license plate numbers). Mirrors COLUMN_MIGRATIONS above,
// but drops instead of adds; safe to re-run since "column doesn't
// exist" errors are silently ignored (already applied).
const COLUMN_DROPS = [
  { table: 'vehicle_logs', column: 'plate' },
];

async function ensureColumnsDropped() {
  for (const { table, column } of COLUMN_DROPS) {
    try {
      await pool.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
      console.log(`[db] Dropped removed column ${table}.${column}`);
    } catch (err) {
      if (err && (err.code === 'ER_CANT_DROP_FIELD_OR_KEY' || err.code === 'ER_BAD_FIELD_ERROR')) continue; // already applied, fine
      console.error(`[db] Could not drop column ${table}.${column}:`, err.message);
    }
  }
}

// Seeds the one fixed admin account, lekin SIRF agar wo pehle se exist
// nahi karta -- taake har `npm start` par admin ka password/duplicate
// wagera error na aaye aur purana data bhi na uchay.
async function seedDefaultAdmin() {
  const existing = await getOne('SELECT id FROM users WHERE username = ?', [DEFAULT_ADMIN.username]);
  if (existing) return; // already seeded in a previous run -- kuch na karein

  const { hash, salt } = hashPassword(DEFAULT_ADMIN.password);
  await pool.query(
    `INSERT INTO users (fullName, username, email, phone, department, passwordHash, salt, role, userType)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'admin', 'staff')`,
    [
      DEFAULT_ADMIN.fullName,
      DEFAULT_ADMIN.username,
      DEFAULT_ADMIN.email,
      DEFAULT_ADMIN.phone || null,
      DEFAULT_ADMIN.department || null,
      hash,
      salt,
    ]
  );
}

// Database create karta hai (agar missing ho), tables banata hai (agar
// missing hon -- **maujooda data ko kabhi delete nahi karta**), aur
// admin account seed karta hai (sirf agar wo already na ho). Har
// `npm start` par chalta hai, lekin ab yeh safe/idempotent hai.
async function initDb() {
  const rootConn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
  });
  await rootConn.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await rootConn.end();

  await ensureSchema();
  await ensureColumns();
  await ensureColumnsDropped();
  await seedDefaultAdmin();
}

// --- small async helpers mirroring the old synchronous db.prepare() API ---
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function getOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function run(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return result; // has .insertId, .affectedRows, etc.
}

module.exports = { pool, initDb, query, getOne, run, DEFAULT_ADMIN };