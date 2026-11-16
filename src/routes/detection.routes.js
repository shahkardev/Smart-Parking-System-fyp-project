// src/routes/detection.routes.js
const detectionController = require('../controllers/detection.controller');
const { sendJSON } = require('../utils/http');

// Handles /api/detection/start (POST) — launches the vehicle detection
// python window. Returns true if the request was handled, false otherwise.
async function handleDetectionRoutes(req, res, { pathname }) {
  if (pathname === '/api/detection/start') {
    if (req.method !== 'POST') {
      sendJSON(res, 405, { ok: false, error: 'Method not allowed.' });
      return true;
    }
    detectionController.startDetection(req, res);
    return true;
  }

  return false;
}

module.exports = { handleDetectionRoutes };
