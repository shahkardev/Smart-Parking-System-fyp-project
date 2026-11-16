// src/controllers/users.controller.js
// Admin-only "Manage Users" endpoints. Backs the Admin Dashboard's user
// table with the REAL `users` table in MySQL — every account here is
// someone who actually registered through /api/register, not hardcoded
// demo data.
const db = require('../config/database');
const { sendJSON } = require('../utils/http');
const { hashPassword } = require('../utils/password');

const SAFE_COLUMNS =
  'id, fullName, username, email, role, userType, status, noShowCount, blockedUntil, createdAt';

function isAdmin(currentUser) {
  return !!currentUser && currentUser.role === 'admin';
}

// GET /api/admin/users — every registered account except the seeded
// admin itself (nothing to "manage" about the fixed admin account here).
async function listUsers(req, res, currentUser) {
  if (!currentUser) return sendJSON(res, 401, { ok: false, error: 'Login required.' });
  if (!isAdmin(currentUser)) return sendJSON(res, 403, { ok: false, error: 'Admins only.' });

  try {
    const users = await db.query(
      `SELECT ${SAFE_COLUMNS} FROM users WHERE role != 'admin' ORDER BY createdAt DESC`
    );
    sendJSON(res, 200, { ok: true, users });
  } catch (err) {
    console.error('listUsers error:', err);
    sendJSON(res, 500, { ok: false, error: 'Database error.' });
  }
}

// PATCH /api/admin/users/:id — partial update. Accepts any of:
// fullName, userType, status, noShowCount, blockedUntil (null clears it).
// Used for suspend/activate, edit, reset-strikes, and no-show strikes.
async function updateUser(req, res, id, body, currentUser) {
  if (!currentUser) return sendJSON(res, 401, { ok: false, error: 'Login required.' });
  if (!isAdmin(currentUser)) return sendJSON(res, 403, { ok: false, error: 'Admins only.' });

  const target = await db.getOne('SELECT id, role FROM users WHERE id = ?', [id]);
  if (!target) return sendJSON(res, 404, { ok: false, error: 'User not found.' });
  if (target.role === 'admin') {
    return sendJSON(res, 400, { ok: false, error: 'Admin account cannot be edited here.' });
  }

  const fields = [];
  const values = [];

  if (typeof body.fullName === 'string' && body.fullName.trim()) {
    fields.push('fullName = ?');
    values.push(body.fullName.trim());
  }
  if (['student', 'faculty', 'staff'].includes(body.userType)) {
    fields.push('userType = ?');
    values.push(body.userType);
  }
  if (['active', 'suspended'].includes(body.status)) {
    fields.push('status = ?');
    values.push(body.status);
  }
  if (Number.isInteger(body.noShowCount)) {
    fields.push('noShowCount = ?');
    values.push(body.noShowCount);
  }
  if (body.blockedUntil === null) {
    fields.push('blockedUntil = NULL');
  } else if (typeof body.blockedUntil === 'string' && body.blockedUntil) {
    fields.push('blockedUntil = ?');
    values.push(body.blockedUntil.slice(0, 19).replace('T', ' '));
  }

  if (!fields.length) {
    return sendJSON(res, 400, { ok: false, error: 'No valid fields to update.' });
  }

  try {
    values.push(id);
    await db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    const updated = await db.getOne(`SELECT ${SAFE_COLUMNS} FROM users WHERE id = ?`, [id]);
    sendJSON(res, 200, { ok: true, user: updated });
  } catch (err) {
    console.error('updateUser error:', err);
    sendJSON(res, 500, { ok: false, error: 'Database error.' });
  }
}

// POST /api/admin/users/:id/reset-password — admin sets a brand-new
// password for a user directly (this app has no email/SMS setup, so
// there's no self-service "forgot password" flow; only the admin can
// reset an account's password, from Manage Users).
async function resetPassword(req, res, id, body, currentUser) {
  if (!currentUser) return sendJSON(res, 401, { ok: false, error: 'Login required.' });
  if (!isAdmin(currentUser)) return sendJSON(res, 403, { ok: false, error: 'Admins only.' });

  const target = await db.getOne('SELECT id, role FROM users WHERE id = ?', [id]);
  if (!target) return sendJSON(res, 404, { ok: false, error: 'User not found.' });
  if (target.role === 'admin') {
    return sendJSON(res, 400, { ok: false, error: 'Admin account cannot be reset here.' });
  }

  const newPassword = body && body.newPassword;
  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    return sendJSON(res, 400, { ok: false, error: 'Password kam az kam 6 characters ka ho.' });
  }

  try {
    const { hash, salt } = hashPassword(newPassword);
    await db.run('UPDATE users SET passwordHash = ?, salt = ? WHERE id = ?', [hash, salt, id]);
    // Log the user out of every existing session on this account so the
    // old password can't keep an already-open session alive elsewhere.
    await db.run('DELETE FROM sessions WHERE userId = ?', [id]);
    sendJSON(res, 200, { ok: true });
  } catch (err) {
    console.error('resetPassword error:', err);
    sendJSON(res, 500, { ok: false, error: 'Database error.' });
  }
}

// DELETE /api/admin/users/:id
async function deleteUser(req, res, id, currentUser) {
  if (!currentUser) return sendJSON(res, 401, { ok: false, error: 'Login required.' });
  if (!isAdmin(currentUser)) return sendJSON(res, 403, { ok: false, error: 'Admins only.' });

  const target = await db.getOne('SELECT id, role FROM users WHERE id = ?', [id]);
  if (!target) return sendJSON(res, 404, { ok: false, error: 'User not found.' });
  if (target.role === 'admin') {
    return sendJSON(res, 400, { ok: false, error: 'Admin account cannot be removed.' });
  }

  try {
    await db.run('DELETE FROM users WHERE id = ?', [id]);
    sendJSON(res, 200, { ok: true });
  } catch (err) {
    console.error('deleteUser error:', err);
    sendJSON(res, 500, { ok: false, error: 'Database error.' });
  }
}

module.exports = { listUsers, updateUser, deleteUser, resetPassword };
