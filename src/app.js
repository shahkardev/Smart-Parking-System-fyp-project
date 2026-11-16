// src/app.js
// Builds the HTTP request listener: API routing + static frontend serving.
const http = require('http');
const { URL } = require('url');

const { parseCookies, getUserBySession, SESSION_COOKIE_NAME } = require('./services/auth.service');
const { handleAuthRoutes } = require('./routes/auth.routes');
const { handleSyncRoutes } = require('./routes/sync.routes');
const { handleUsersRoutes } = require('./routes/users.routes');
const { handleDetectionRoutes } = require('./routes/detection.routes');
const { serveStatic } = require('./utils/staticFileServer');
const { readBody, sendJSON } = require('./utils/http');

function createApp() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = url;

    const cookies = parseCookies(req);

    let currentUser = null;
    try {
      currentUser = await getUserBySession(cookies[SESSION_COOKIE_NAME]);
    } catch (err) {
      console.error('Session lookup failed (MySQL/XAMPP chal raha hai check karein):', err.message);
      return sendJSON(res, 500, { ok: false, error: 'Database connection error. XAMPP MySQL check karein.' });
    }

    // --- API routes ---
    if (pathname.startsWith('/api/')) {
      let body = {};
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        try {
          body = await readBody(req);
        } catch {
          return sendJSON(res, 400, { ok: false, error: 'Invalid request body.' });
        }
      }

      const context = { pathname, body, cookies, currentUser };
      if (await handleAuthRoutes(req, res, context)) return;
      if (await handleSyncRoutes(req, res, context)) return;
      if (await handleUsersRoutes(req, res, context)) return;
      if (await handleDetectionRoutes(req, res, context)) return;

      return sendJSON(res, 404, { ok: false, error: 'API route not found.' });
    }

    // --- Static frontend files ---
    return serveStatic(req, res, pathname);
  });
}

module.exports = { createApp };
