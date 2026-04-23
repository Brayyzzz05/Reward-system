import Database from "better-sqlite3";

const db = new Database("data.db");

db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  discord_id TEXT PRIMARY KEY,
  mc_username TEXT,
  messages INTEGER DEFAULT 0,
  last_message INTEGER DEFAULT 0
)
`).run();

export default db;