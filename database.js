import Database from "better-sqlite3";

const db = new Database("database.db");

// AUTO CREATE + AUTO FIX (Railway safe)
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT UNIQUE,
  mc_username TEXT DEFAULT '',
  spins INTEGER DEFAULT 0,
  messages INTEGER DEFAULT 0,
  last_message INTEGER DEFAULT 0,
  luck_mode INTEGER DEFAULT 0
);
`);

export default db;