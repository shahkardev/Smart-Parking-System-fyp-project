// src/routes/auth.routes.js
const authController = require('../controllers/auth.controller');

// Handles every request under /api/*.
// Returns true if the request was handled, false otherwise.
async function handleAuthRoutes(req, res, { pathname, body, cookies, currentUser }) {
  if (pathname === '/api/register' && req.method === 'POST') {
    await authController.register(req, res, body);
    return true;
  }
  if (pathname === '/api/login' && req.method === 'POST') {
    await authController.login(req, res, body);
    return true;
  }
  if (pathname === '/api/logout' && req.method === 'POST') {
    await authController.logout(req, res, cookies.sp_session);
    return true;
  }
  if (pathname === '/api/me' && req.method === 'GET') {
    await authController.me(req, res, currentUser);
    return true;
  }
  if (pathname === '/api/account' && req.method === 'PATCH') {
    await authController.updateProfile(req, res, body, currentUser);
    return true;
  }
  if (pathname === '/api/account/avatar' && req.method === 'PATCH') {
    await authController.uploadAvatar(req, res, body, currentUser);
    return true;
  }

  return false;
}

module.exports = { handleAuthRoutes };