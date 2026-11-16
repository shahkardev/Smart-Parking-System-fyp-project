// src/server.js
// Entry point — starts the HTTP server. Run with: node src/server.js
const { createApp } = require('./app');
const db = require('./config/database');

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await db.initDb();
    console.log('MySQL database connected & ready ✅ (database: university_parking)');
    console.log('🔄 Fresh start — database was reset (all previous data cleared).');
    console.log('👤 Default admin login:');
    console.log(`   username: ${db.DEFAULT_ADMIN.username}`);
    console.log(`   password: ${db.DEFAULT_ADMIN.password}`);
  } catch (err) {
    console.error('❌ MySQL se connect nahi ho saka:', err.message);
    console.error('   1) XAMPP Control Panel kholein aur MySQL "Start" karein.');
    console.error('   2) .env file check karein (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME).');
    process.exit(1);
  }

  const app = createApp();
  app.listen(PORT, () => {
    console.log(`University Parking backend running: http://localhost:${PORT}`);
  });
}

start();
