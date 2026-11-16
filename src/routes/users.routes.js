// src/routes/users.routes.js
const usersController = require('../controllers/users.controller');
const { sendJSON } = require('../utils/http');

// Handles /api/admin/users (GET), /api/admin/users/:id (PATCH/DELETE),
// and /api/admin/users/:id/reset-password (POST).
// Returns true if the request was handled, false otherwise.
async function handleUsersRoutes(req, res, { pathname, body, currentUser }) {
  if (pathname === '/api/admin/users' && req.method === 'GET') {
    await usersController.listUsers(req, res, currentUser);
    return true;
  }

  const resetMatch = pathname.match(/^\/api\/admin\/users\/(\d+)\/reset-password$/);
  if (resetMatch) {
    const id = Number(resetMatch[1]);
    if (req.method === 'POST') {
      await usersController.resetPassword(req, res, id, body, currentUser);
      return true;
    }
    sendJSON(res, 405, { ok: false, error: 'Method not allowed.' });
    return true;
  }

  const match = pathname.match(/^\/api\/admin\/users\/(\d+)$/);
  if (match) {
    const id = Number(match[1]);
    if (req.method === 'PATCH') {
      await usersController.updateUser(req, res, id, body, currentUser);
      return true;
    }
    if (req.method === 'DELETE') {
      await usersController.deleteUser(req, res, id, currentUser);
      return true;
    }
    sendJSON(res, 405, { ok: false, error: 'Method not allowed.' });
    return true;
  }

  return false;
}

module.exports = { handleUsersRoutes };
