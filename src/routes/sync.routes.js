// src/routes/sync.routes.js
const syncController = require('../controllers/sync.controller');
const { sendJSON } = require('../utils/http');

// Handles /api/sync/:key (GET/PUT) and /api/bootstrap (GET).
// Returns true if the request was handled, false otherwise.
async function handleSyncRoutes(req, res, { pathname, body, currentUser }) {
  if (pathname === '/api/bootstrap' && req.method === 'GET') {
    await syncController.bootstrap(req, res, currentUser);
    return true;
  }

  const match = pathname.match(/^\/api\/sync\/([a-zA-Z0-9_]+)$/);
  if (match) {
    const key = match[1];
    if (req.method === 'GET') {
      await syncController.getSync(req, res, key, currentUser);
      return true;
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      await syncController.setSync(req, res, key, body, currentUser);
      return true;
    }
    sendJSON(res, 405, { ok: false, error: 'Method not allowed.' });
    return true;
  }

  return false;
}

module.exports = { handleSyncRoutes };
