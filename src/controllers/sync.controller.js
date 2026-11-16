// src/controllers/sync.controller.js
// Backs the Admin & Student dashboards' shared state (parking slot map,
// reservation requests, announcements, reported issues). Each of these
// now lives in its own dedicated MySQL table with real, named columns —
// parking_slots, reservation_requests, announcements, issues — instead
// of being dumped as JSON blobs into one generic "sync_store" table.
// The frontend still talks to the same /api/sync/:key endpoints, so
// this file's job is to translate each key into proper rows in its
// own table.
const db = require('../config/database');
const { sendJSON } = require('../utils/http');

const ALLOWED_KEYS = ['slots', 'requests', 'announcements', 'issues', 'vehicleLog'];

// --- per-key table definitions: table name + JS object <-> DB row mapping ---
const TABLES = {
  slots: {
    table: 'parking_slots',
    columns: ['id', 'block', 'status', 'vehicleType'],
    orderBy: 'id',
    orderDir: 'ASC',
    toRow: (s) => [s.id, s.block, s.status, s.vehicleType || null],
    fromRow: (r) => ({ id: r.id, block: r.block, status: r.status, vehicleType: r.vehicleType || null }),
  },
  requests: {
    table: 'reservation_requests',
    columns: ['id', 'userId', 'userFullName', 'slotId', 'status', 'createdAt', 'decidedAt', 'checkInDeadline'],
    orderBy: 'createdAt',
    orderDir: 'DESC',
    toRow: (r) => [r.id, r.userId != null ? r.userId : null, r.user, r.slot, r.status, r.createdAt || Date.now(), r.decidedAt || null, r.checkInDeadline || null],
    fromRow: (r) => ({
      id: r.id,
      userId: r.userId != null ? Number(r.userId) : null,
      user: r.userFullName,
      slot: r.slotId,
      status: r.status,
      createdAt: Number(r.createdAt),
      decidedAt: r.decidedAt != null ? Number(r.decidedAt) : undefined,
      checkInDeadline: r.checkInDeadline != null ? Number(r.checkInDeadline) : undefined,
    }),
  },
  issues: {
    table: 'issues',
    columns: ['id', 'userId', 'userFullName', 'type', 'spot', 'description', 'status', 'createdAt'],
    orderBy: 'createdAt',
    orderDir: 'DESC',
    toRow: (i) => [i.id, i.userId != null ? i.userId : null, i.user, i.type || null, i.spot || null, i.description, i.status, i.createdAt || Date.now()],
    fromRow: (r) => ({
      id: r.id,
      userId: r.userId != null ? Number(r.userId) : null,
      user: r.userFullName,
      type: r.type,
      spot: r.spot,
      description: r.description,
      status: r.status,
      createdAt: Number(r.createdAt),
    }),
  },
  announcements: {
    table: 'announcements',
    columns: ['id', 'message', 'type', 'recipient', 'recipientId', 'timeLabel', 'createdAt'],
    orderBy: 'createdAt',
    orderDir: 'DESC',
    toRow: (a) => [a.id, a.message, a.type || null, a.recipient || null, a.recipientId || null, a.time || null, a.createdAt || Date.now()],
    fromRow: (r) => ({
      id: r.id,
      message: r.message,
      type: r.type,
      recipient: r.recipient,
      recipientId: r.recipientId,
      time: r.timeLabel,
      createdAt: Number(r.createdAt),
    }),
  },
  // Vehicle Entry/Exit Logs. Dashboard object shape: {id, type, slot,
  // time, exit, duration, status, source}. "type" and "slot" are renamed
  // to vehicleType/slotId as real columns since "type" reads ambiguously
  // as a DB column name across this file's other tables.
  vehicleLog: {
    table: 'vehicle_logs',
    columns: ['id', 'vehicleType', 'slotId', 'entryTime', 'exitTime', 'duration', 'status', 'source', 'createdAt'],
    orderBy: 'createdAt',
    orderDir: 'DESC',
    toRow: (v) => [
      v.id, v.type || null, v.slot,
      v.time || null, v.exit || null, v.duration || null,
      v.status, v.source || 'manual', v.createdAt || Date.now(),
    ],
    fromRow: (r) => ({
      id: r.id,
      type: r.vehicleType,
      slot: r.slotId,
      time: r.entryTime,
      exit: r.exitTime,
      duration: r.duration,
      status: r.status,
      source: r.source,
      createdAt: Number(r.createdAt),
    }),
  },
};

async function readValue(key) {
  const def = TABLES[key];
  const rows = await db.query(`SELECT * FROM \`${def.table}\` ORDER BY \`${def.orderBy}\` ${def.orderDir}`);
  return rows.map(def.fromRow);
}

// Whole-list replace: the dashboards always send the full, current
// array for a key, so each write clears that key's table and
// re-inserts it in one transaction — keeping the table an exact,
// unambiguous mirror of what the dashboards think is true.
async function writeValue(key, value) {
  const def = TABLES[key];
  const list = Array.isArray(value) ? value : [];
  const conn = await db.pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM \`${def.table}\``);
    if (list.length) {
      const placeholders = list.map(() => `(${def.columns.map(() => '?').join(', ')})`).join(', ');
      const params = list.flatMap(def.toRow);
      await conn.query(
        `INSERT INTO \`${def.table}\` (${def.columns.map((c) => `\`${c}\``).join(', ')}) VALUES ${placeholders}`,
        params
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function getSync(req, res, key, currentUser) {
  if (!currentUser) return sendJSON(res, 401, { ok: false, error: 'Login required.' });
  if (!ALLOWED_KEYS.includes(key)) return sendJSON(res, 404, { ok: false, error: 'Unknown sync key.' });
  try {
    const value = await readValue(key);
    sendJSON(res, 200, { ok: true, key, value });
  } catch (err) {
    console.error('getSync error:', err);
    sendJSON(res, 500, { ok: false, error: 'Database error.' });
  }
}

async function setSync(req, res, key, body, currentUser) {
  if (!currentUser) return sendJSON(res, 401, { ok: false, error: 'Login required.' });
  if (!ALLOWED_KEYS.includes(key)) return sendJSON(res, 404, { ok: false, error: 'Unknown sync key.' });
  try {
    const value = body && Object.prototype.hasOwnProperty.call(body, 'value') ? body.value : body;
    await writeValue(key, value);
    sendJSON(res, 200, { ok: true, key });
  } catch (err) {
    console.error('setSync error:', err);
    sendJSON(res, 500, { ok: false, error: 'Database error.' });
  }
}

// One round trip that a dashboard page needs on load: who's logged in
// (and their role) plus every shared collection it might need to seed
// from. Used by the blocking auth-guard script at the top of each
// dashboard so the page never flashes stale/wrong content before
// redirecting an unauthenticated visitor to the login page.
async function bootstrap(req, res, currentUser) {
  if (!currentUser) return sendJSON(res, 401, { ok: false, error: 'Not logged in.' });
  try {
    const data = { ok: true, user: currentUser };
    for (const key of ALLOWED_KEYS) {
      const list = await readValue(key);
      data[key] = list.length ? list : null;
    }
    sendJSON(res, 200, data);
  } catch (err) {
    console.error('bootstrap error:', err);
    sendJSON(res, 500, { ok: false, error: 'Database error.' });
  }
}

module.exports = { getSync, setSync, bootstrap, ALLOWED_KEYS };
