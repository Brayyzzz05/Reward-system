import pg from "pg";
const { Pool } = pg;

// =====================
// ENV CHECK (IMPORTANT)
// =====================
if (!process.env.DATABASE_URL) {
  console.error("❌ Missing DATABASE_URL in env");
  process.exit(1);
}

// =====================
// POOL CONFIG (RAILWAY SAFE)
// =====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // Railway / Render / Supabase fix
  ssl: {
    rejectUnauthorized: false
  },

  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// =====================
// CONNECTION TEST
// =====================
pool.connect()
  .then(client => {
    console.log("✅ Database connected successfully");
    client.release();

    // 🔥 AUTO SAFE TABLE INIT (IMPORTANT FOR YOUR BOT)
    initTables();
  })
  .catch(err => {
    console.error("❌ Database connection failed:", err.message);
  });

// =====================
// AUTO TABLE CREATION (SAFE)
// =====================
async function initTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        discord_id TEXT PRIMARY KEY,
        minecraft_name TEXT,
        messages INTEGER DEFAULT 0,
        spins INTEGER DEFAULT 0,
        luck_multi INTEGER DEFAULT 0,
        last_daily BIGINT DEFAULT 0
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS reward_queue (
        id SERIAL PRIMARY KEY,
        discord_id TEXT,
        minecraft_name TEXT,
        command TEXT,
        status TEXT DEFAULT 'pending',
        reward_hash TEXT UNIQUE,
        created_at BIGINT
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS delivered_rewards (
        reward_hash TEXT PRIMARY KEY
      )
    `);

    console.log("🧱 Tables ready");
  } catch (e) {
    console.error("❌ Table init failed:", e.message);
  }
}

// =====================
// SELF-HEAL QUERY WRAPPER
// =====================
async function query(text, params) {
  for (let i = 0; i < 3; i++) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      console.warn(`⚠️ DB retry ${i + 1}:`, err.message);

      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }

  throw new Error("❌ Database failed after retries");
}

// =====================
// EXPORT
// =====================
export default {
  query
};