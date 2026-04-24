import pg from "pg";
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// CREATE TABLE (safe, runs every deploy but does NOT reset data)
await pool.query(`
CREATE TABLE IF NOT EXISTS users (
  discord_id TEXT PRIMARY KEY,
  mc_username TEXT,
  spins INT DEFAULT 0,
  messages INT DEFAULT 0,
  luck_multi REAL DEFAULT 1,
  last_daily BIGINT DEFAULT 0,
  last_message BIGINT DEFAULT 0
)
`);

export default pool;