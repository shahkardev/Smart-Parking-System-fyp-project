// src/controllers/auth.controller.js
const db = require('../config/database');
const {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  buildSessionCookie,
  buildExpiredSessionCookie,
} = require('../services/auth.service');
const { sendJSON } = require('../utils/http');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function register(req, res, body) {
  const { fullName, username, email, password, confirmPassword } = body || {};
  let { userType } = body || {};

  if (!fullName || !username || !email || !password) {
    return sendJSON(res, 400, { ok: false, error: 'Sab fields required hain.' });
  }
  if (!EMAIL_RE.test(email)) {
    return sendJSON(res, 400, { ok: false, error: 'Email valid nahi hai.' });
  }
  if (password.length < 6) {
    return sendJSON(res, 400, { ok: false, error: 'Password kam az kam 6 characters ka ho.' });
  }
  if (confirmPassword !== undefined && password !== confirmPassword) {
    return sendJSON(res, 400, { ok: false, error: 'Password match nahi karta.' });
  }
  if (!['student', 'faculty', 'staff'].includes(userType)) {
    userType = 'student';
  }

  try {
    const existing = await db.getOne(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );
    if (existing) {
      return sendJSON(res, 409, { ok: false, error: 'Username ya email pehle se registered hai.' });
    }

    const { hash, salt } = hashPassword(password);

    // Every account created through registration is a normal 'user'.
    // Admin access comes only from the fixed admin account the server
    // seeds on startup (see src/config/database.js) — no more "first
    // registered account becomes admin" bootstrap rule.
    const role = 'user';

    const result = await db.run(
      'INSERT INTO users (fullName, username, email, passwordHash, salt, role, userType) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [fullName, username, email, hash, salt, role, userType]
    );

    const { token, expiresAt } = await createSession(result.insertId);

    res.setHeader('Set-Cookie', buildSessionCookie(token, expiresAt));
    sendJSON(res, 201, { ok: true, user: { fullName, username, email, role, userType } });
  } catch (err) {
    console.error('register error:', err);
    sendJSON(res, 500, { ok: false, error: 'Database error. MySQL (XAMPP) chal raha hai check karein.' });
  }
}

async function login(req, res, body) {
  const { username, password } = body || {};
  if (!username || !password) {
    return sendJSON(res, 400, { ok: false, error: 'Username aur password required hain.' });
  }

  try {
    const user = await db.getOne(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, username]
    );

    if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
      return sendJSON(res, 401, { ok: false, error: 'Username ya password ghalat hai.' });
    }
    if (user.status === 'suspended') {
      return sendJSON(res, 403, { ok: false, error: 'Yeh account suspend kar diya gaya hai. Admin se rabta karein.' });
    }
    if (user.blockedUntil && new Date(user.blockedUntil) > new Date()) {
      return sendJSON(res, 403, { ok: false, error: 'No-show strikes ki wajah se account 1 hafta ke liye blocked hai.' });
    }

    const { token, expiresAt } = await createSession(user.id);
    res.setHeader('Set-Cookie', buildSessionCookie(token, expiresAt));
    sendJSON(res, 200, {
      ok: true,
      user: {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        phone: user.phone || '',
        department: user.department || '',
        role: user.role,
        userType: user.userType,
        status: user.status,
        createdAt: user.createdAt,
        profilePicUrl: user.profilePicUrl || null,
      },
    });
  } catch (err) {
    console.error('login error:', err);
    sendJSON(res, 500, { ok: false, error: 'Database error. MySQL (XAMPP) chal raha hai check karein.' });
  }
}

async function logout(req, res, token) {
  try {
    await destroySession(token);
  } catch (err) {
    console.error('logout error:', err);
  }
  res.setHeader('Set-Cookie', buildExpiredSessionCookie());
  sendJSON(res, 200, { ok: true });
}

async function me(req, res, currentUser) {
  if (!currentUser) return sendJSON(res, 401, { ok: false, error: 'Not logged in.' });
  sendJSON(res, 200, { ok: true, user: currentUser });
}

// PATCH /api/account — lets the LOGGED-IN user edit their own profile
// (used by the "My Account" modal on both dashboards). Only touches the
// caller's own row — there's no :id in the URL on purpose, so nobody can
// edit someone else's account through this endpoint. Persists straight
// to the `users` table in MySQL, so changes survive a refresh/restart.
//
// Email is intentionally NOT editable here, on purpose: it's the
// account's fixed identity (same idea as a Google account email) and
// changing it later causes exactly the kind of mix-ups/confusion this
// endpoint is meant to avoid. Even if a client sends `email`, it's
// ignored — enforced here, not just hidden in the UI.
async function updateProfile(req, res, body, currentUser) {
  if (!currentUser) return sendJSON(res, 401, { ok: false, error: 'Login required.' });

  const fields = [];
  const values = [];

  if (typeof body.fullName === 'string') {
    const fullName = body.fullName.trim();
    if (!fullName) return sendJSON(res, 400, { ok: false, error: 'Full name cannot be empty.' });
    fields.push('fullName = ?');
    values.push(fullName);
  }

  if (typeof body.phone === 'string') {
    fields.push('phone = ?');
    values.push(body.phone.trim());
  }

  if (typeof body.department === 'string') {
    fields.push('department = ?');
    values.push(body.department.trim());
  }

  if (!fields.length) {
    return sendJSON(res, 400, { ok: false, error: 'No valid fields to update.' });
  }

  try {
    values.push(currentUser.id);
    await db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    const updated = await db.getOne(
      'SELECT id, fullName, username, email, phone, department, role, userType, status, noShowCount, blockedUntil, createdAt, profilePicUrl FROM users WHERE id = ?',
      [currentUser.id]
    );
    sendJSON(res, 200, { ok: true, user: updated });
  } catch (err) {
    console.error('updateProfile error:', err);
    sendJSON(res, 500, { ok: false, error: 'Database error.' });
  }
}

// PATCH /api/account/avatar — accepts a data URL (base64) from the file
// picker, saves it as a real file under public/uploads/avatars/, and
// stores only the resulting PUBLIC PATH in the users table. This is the
// key difference from the old approach: the image itself lives on the
// server (reachable by every device), and the database just points to
// it -- so logging in from a phone shows the exact same picture as the
// laptop, instead of each browser's own separate localStorage copy.
const fs = require('fs');
const path = require('path');

const AVATAR_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'avatars');
const ALLOWED_MIME_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const MAX_AVATAR_BYTES = 4 * 1024 * 1024; // 4MB decoded

async function uploadAvatar(req, res, body, currentUser) {
  if (!currentUser) return sendJSON(res, 401, { ok: false, error: 'Login required.' });

  const dataUrl = body && body.imageData;
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return sendJSON(res, 400, { ok: false, error: 'No image data received.' });
  }

  const match = dataUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
  if (!match) {
    return sendJSON(res, 400, { ok: false, error: 'Image format not recognized.' });
  }
  const [, mimeType, base64Data] = match;
  const ext = ALLOWED_MIME_EXT[mimeType];
  if (!ext) {
    return sendJSON(res, 400, { ok: false, error: 'Only PNG, JPEG, WEBP, or GIF images are allowed.' });
  }

  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length > MAX_AVATAR_BYTES) {
    return sendJSON(res, 400, { ok: false, error: 'Image too large (max 4MB).' });
  }

  try {
    fs.mkdirSync(AVATAR_DIR, { recursive: true });

    // Remove any previous avatar file for this user (could be a
    // different extension than the new upload) so old files don't pile
    // up on disk.
    for (const oldExt of Object.values(ALLOWED_MIME_EXT)) {
      const oldPath = path.join(AVATAR_DIR, `user_${currentUser.id}${oldExt}`);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const fileName = `user_${currentUser.id}${ext}`;
    fs.writeFileSync(path.join(AVATAR_DIR, fileName), buffer);

    // Cache-busting query param so browsers immediately show the new
    // picture instead of a stale cached one at the same URL.
    const publicUrl = `/uploads/avatars/${fileName}?v=${Date.now()}`;

    await db.run('UPDATE users SET profilePicUrl = ? WHERE id = ?', [publicUrl, currentUser.id]);

    sendJSON(res, 200, { ok: true, profilePicUrl: publicUrl });
  } catch (err) {
    console.error('uploadAvatar error:', err);
    sendJSON(res, 500, { ok: false, error: 'Could not save image.' });
  }
}

module.exports = { register, login, logout, me, updateProfile, uploadAvatar };