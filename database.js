import Database from "better-sqlite3";

const db = new Database("database.db");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  discord_id TEXT PRIMARY KEY,
  mc_username TEXT,
  spins INTEGER DEFAULT 0,
  messages INTEGER DEFAULT 0,
  last_message INTEGER DEFAULT 0,
  luck_multi REAL DEFAULT 1
);
`);

export default db;