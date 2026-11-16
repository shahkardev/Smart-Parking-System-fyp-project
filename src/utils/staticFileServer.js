// src/utils/staticFileServer.js
const fs = require('fs');
const path = require('path');
const MIME = require('../config/mimeTypes');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, decodeURIComponent(pathname));
  if (pathname === '/') filePath = path.join(PUBLIC_DIR, 'index.html');

  // Prevent path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

module.exports = { serveStatic, PUBLIC_DIR };
