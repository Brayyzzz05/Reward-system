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
// POOL (CLOUD SAFE)
// =====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // IMPORTANT for Railway / Render / Neon / Supabase
  ssl: {
    rejectUnauthorized: false
  },

  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// =====================
// TEST CONNECTION (NON-FATAL)
// =====================
pool.connect()
  .then(client => {
    console.log("✅ Database connected");
    client.release();
  })
  .catch(err => {
    console.log("⚠️ DB not ready yet:", err.message);
  });

// =====================
// RETRY WRAPPER (ANTI CRASH)
// =====================
async function query(text, params = []) {
  let lastError;

  for (let i = 0; i < 3; i++) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      lastError = err;
      console.log(`⚠️ DB retry ${i + 1}/3:`, err.message);

      // exponential backoff
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }

  console.error("❌ DB failed after retries:", lastError.message);
  throw lastError;
}

// =====================
// SAFE INIT TABLES (AUTO FIX MISSING TABLES)
// =====================
export async function initDatabase() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        discord_id TEXT PRIMARY KEY,
        minecraft_name TEXT,
        spins INTEGER DEFAULT 0,
        luck INTEGER DEFAULT 0,
        messages INTEGER DEFAULT 0
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS delivered_rewards (
        reward_hash TEXT PRIMARY KEY,
        created_at BIGINT
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS reward_queue (
        id SERIAL PRIMARY KEY,
        discord_id TEXT,
        minecraft_name TEXT,
        command TEXT,
        status TEXT DEFAULT 'pending',
        reward_hash TEXT,
        created_at BIGINT
      )
    `);

    console.log("📦 Database tables ready");
  } catch (err) {
    console.error("❌ DB init failed:", err.message);
  }
}

// =====================
// EXPORT
// =====================
export default {
  query
};
