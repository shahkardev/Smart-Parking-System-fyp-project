// set-admin-password.js
//
// Ye script admin ka password SEEDHA database mein set/change karta hai —
// same "scrypt" hashing use karta hai jo app khud use karta hai, isliye
// naya password login page se turant kaam karega.
//
// USAGE (project ke root folder mein, jahan package.json hai):
//
//   node set-admin-password.js <naya-password>
//
// Example:
//
//   node set-admin-password.js MeraNayaPassword123
//
// Agar aapka XAMPP MySQL "root" user par password laga hua hai, to
// neeche DB_PASSWORD line mein wo password daal dein (default XAMPP
// mein empty hota hai).

const mysql = require('mysql2/promise');
const crypto = require('crypto');

// --- XAMPP defaults: inhein apni setup ke mutabiq badal sakte hain ---
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'university_parking';

// admin ka username jiska password change karna hai
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

async function main() {
  const newPassword = process.argv[2];

  if (!newPassword) {
    console.error('\nGhalat istemaal. Sahi tareeqa:\n');
    console.error('  node set-admin-password.js <naya-password>\n');
    process.exit(1);
  }

  if (newPassword.length < 6) {
    console.error('\nPassword kam az kam 6 characters ka hona chahiye.\n');
    process.exit(1);
  }

  const pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  });

  try {
    const [rows] = await pool.query(
      'SELECT id, username FROM users WHERE username = ? AND role = ?',
      [ADMIN_USERNAME, 'admin']
    );

    if (!rows.length) {
      console.error(`\nAdmin account "${ADMIN_USERNAME}" nahi mila. Pehle server ek dafa\nchala kar admin ko seed hone dein (npm start), phir dobara try karein.\n`);
      process.exit(1);
    }

    const admin = rows[0];
    const { hash, salt } = hashPassword(newPassword);

    await pool.query('UPDATE users SET passwordHash = ?, salt = ? WHERE id = ?', [
      hash,
      salt,
      admin.id,
    ]);

    // Purani sessions ko bhi logout kar dein taake old password wala
    // koi session zinda na rahe.
    await pool.query('DELETE FROM sessions WHERE userId = ?', [admin.id]);

    console.log(`\n✅ Admin "${ADMIN_USERNAME}" ka password successfully change ho gaya.`);
    console.log('Ab isi naye password se login karein.\n');
  } catch (err) {
    console.error('\n❌ Error:', err.message, '\n');
  } finally {
    await pool.end();
  }
}

main();
