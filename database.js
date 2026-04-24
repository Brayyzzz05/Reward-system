import pg from "pg";
const { Pool } = pg;

// =====================
// ENV CHECK
// =====================
if (!process.env.DATABASE_URL) {
  console.error("❌ Missing DATABASE_URL");
  process.exit(1);
}

// =====================
// POOL
// =====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// =====================
// CONNECT TEST
// =====================
pool.connect()
  .then(c => {
    console.log("✅ Database connected successfully");
    c.release();
  })
  .catch(err => {
    console.error("❌ DB connection failed:", err.message);
  });

// =====================
// SELF-HEAL QUERY
// =====================
async function query(text, params) {
  for (let i = 0; i < 3; i++) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      console.warn(`DB retry ${i + 1}:`, err.message);
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error("Database failed after retries");
}

// =====================
// AUTO TABLE SETUP
// =====================
async function init() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      discord_id TEXT PRIMARY KEY,
      minecraft_name TEXT,
      messages INT DEFAULT 0,
      spins INT DEFAULT 0,
      luck_multi INT DEFAULT 0,
      last_daily BIGINT DEFAULT 0
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS reward_queue (
      id SERIAL PRIMARY KEY,
      discord_id TEXT,
      minecraft_name TEXT,
      command TEXT,
      reward_hash TEXT UNIQUE,
      status TEXT DEFAULT 'pending',
      created_at BIGINT
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS delivered_rewards (
      reward_hash TEXT PRIMARY KEY
    )
  `);

  console.log("🧱 Tables ready");
}

init();

export default { query };