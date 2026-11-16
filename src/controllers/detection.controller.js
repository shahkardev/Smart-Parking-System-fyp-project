// src/controllers/detection.controller.js
// Camera "Connect" hote hi vehicle_detection.py ki apni window khud khul
// jaye — is ke liye ye controller start-detection.bat ko ek naya cmd
// window mein launch karta hai (Windows). Node server aur
// vehicle-detection folder isi PC par honay chahiye.
const { spawn } = require('child_process');
const path = require('path');
const { sendJSON } = require('../utils/http');

const DETECTION_DIR = path.join(__dirname, '..', '..', 'vehicle-detection');

// Bar bar "Connect" click hone par baar baar naya window na khule, is
// liye chand seconds ka cooldown rakha hai (asal python process ka
// handle "start" command ki wajah se hamare paas nahi hota, is liye
// hum ye track nahi kar sakte ke window abhi tak khuli hai ya band ho
// chuki).
const COOLDOWN_MS = 15000;
let lastStartedAt = 0;

function startDetection(req, res) {
  const now = Date.now();
  if (now - lastStartedAt < COOLDOWN_MS) {
    console.log('[detection] /api/detection/start called, still in cooldown — window nahi khola.');
    return sendJSON(res, 200, {
      ok: true,
      alreadyRunning: true,
      message: 'Vehicle detection window pehle se chal rahi hogi (abhi dubara nahi khola).',
    });
  }

  if (process.platform !== 'win32') {
    return sendJSON(res, 200, {
      ok: false,
      error: 'Auto-start sirf Windows par kaam karta hai. Is PC par vehicle-detection/start-detection.bat khud chalayein.',
    });
  }

  try {
    console.log('[detection] Launching start-detection.bat in', DETECTION_DIR);
    // "start" ek naya, alag cmd window kholta hai jisme start-detection.bat
    // (aur is ke andar python vehicle_detection.py) chalti hai.
    // NOTE: start ka pehla quoted argument window ka TITLE hota hai. Agar
    // title khali "" na diya jaye to Windows kabhi kabhi title/command mix
    // kar deta hai (isi wajah se pehle "Windows cannot find 'Detection\'"
    // error aata tha) — is liye yahan title jaan-boojh kar khali rakha hai.
    const child = spawn(
      'cmd.exe',
      ['/c', 'start', '""', 'start-detection.bat'],
      { cwd: DETECTION_DIR, detached: true, stdio: 'ignore', windowsHide: false }
    );
    child.on('error', err => console.error('[detection] spawn error:', err.message));
    child.unref();
    lastStartedAt = now;

    sendJSON(res, 200, { ok: true, alreadyRunning: false, message: 'Vehicle detection window shuru ho gayi.' });
  } catch (err) {
    console.error('[detection] start failed:', err.message);
    sendJSON(res, 500, { ok: false, error: 'Detection window start nahi ho saki: ' + err.message });
  }
}

module.exports = { startDetection };
