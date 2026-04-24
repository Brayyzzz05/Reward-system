import Database from "better-sqlite3";

// creates file automatically on Railway
const db = new Database("database.db");

// =====================
// AUTO TABLE SETUP (SAFE)
// =====================
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  discord_id TEXT PRIMARY KEY,
  mc_username TEXT,
  spins INTEGER DEFAULT 0,
  messages INTEGER DEFAULT 0,
  last_message INTEGER DEFAULT 0,
  guaranteed_tier TEXT DEFAULT NULL,
  luck_mode INTEGER DEFAULT 0
);
`);

// =====================
// OPTIONAL SAFETY PATCH (adds missing columns if older DB exists)
// =====================
try {
  db.prepare("ALTER TABLE users ADD COLUMN guaranteed_tier TEXT").run();
} catch {}

try {
  db.prepare("ALTER TABLE users ADD COLUMN luck_mode INTEGER DEFAULT 0").run();
} catch {}

// =====================
// EXPORT
// =====================
export default db;