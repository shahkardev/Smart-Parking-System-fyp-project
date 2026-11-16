// src/utils/http.js
function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      // 8MB guard -- most requests are tiny JSON, but a base64-encoded
      // profile picture (up to 4MB raw image) needs the extra room:
      // base64 inflates size by ~33%, so 4MB -> ~5.4MB of text.
      if (data.length > 8e6) req.destroy();
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

module.exports = { sendJSON, readBody };