// src/services/auth.service.js
const crypto = require('crypto');
const db = require('../config/database');
const { hashPassword, verifyPassword } = require('../utils/password');

const SESSION_COOKIE_NAME = 'sp_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// MySQL DATETIME format: 'YYYY-MM-DD HH:MM:SS'
function toMySQLDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAtDate = new Date(Date.now() + SESSION_TTL_MS);
  await db.run(
    'INSERT INTO sessions (token, userId, expiresAt) VALUES (?, ?, ?)',
    [token, userId, toMySQLDateTime(expiresAtDate)]
  );
  return { token, expiresAt: expiresAtDate.toISOString() };
}

async function getUserBySession(token) {
  if (!token) return null;
  const session = await db.getOne('SELECT * FROM sessions WHERE token = ?', [token]);
  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) {
    await db.run('DELETE FROM sessions WHERE token = ?', [token]);
    return null;
  }
  const user = await db.getOne(
    'SELECT id, fullName, username, email, phone, department, role, userType, status, noShowCount, blockedUntil, createdAt, profilePicUrl FROM users WHERE id = ?',
    [session.userId]
  );
  return user || null;
}

async function destroySession(token) {
  if (!token) return;
  await db.run('DELETE FROM sessions WHERE token = ?', [token]);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function buildSessionCookie(token, expiresAt) {
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}`;
}

function buildExpiredSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

module.exports = {
  SESSION_COOKIE_NAME,
  hashPassword,
  verifyPassword,
  createSession,
  getUserBySession,
  destroySession,
  parseCookies,
  buildSessionCookie,
  buildExpiredSessionCookie,
};