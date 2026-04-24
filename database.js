import pg from "pg";
const { Pool } = pg;

// =====================
// ENV CHECK
// =====================
if (!process.env.DATABASE_URL) {
  console.error("❌ Missing DATABASE_URL in environment variables");
  process.exit(1);
}

// =====================
// POOL CONFIG (SAFE FOR RAILWAY / CLOUD HOSTING)
// =====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

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
    console.log("🗄️ Database connected successfully");
    client.release();
  })
  .catch(err => {
    console.error("❌ Database connection failed:", err.message);
  });

// =====================
// SAFE QUERY WRAPPER (ANTI CRASH + AUTO RETRY)
// =====================
async function query(text, params) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      console.warn(`⚠️ DB retry ${attempt}/3 failed:`, err.message);

      // wait before retrying
      await new Promise(res => setTimeout(res, 1000 * attempt));
    }
  }

  throw new Error("❌ Database query failed after 3 retries");
}

// =====================
// OPTIONAL HELPERS (USED BY YOUR BOT)
// =====================

// Create user safely (used in verify / commands)
async function createUserIfNotExists(discordId) {
  return query(
    `INSERT INTO users (discord_id)
     VALUES ($1)
     ON CONFLICT (discord_id) DO NOTHING`,
    [discordId]
  );
}

// Get user safely
async function getUser(discordId) {
  const res = await query(
    `SELECT * FROM users WHERE discord_id=$1`,
    [discordId]
  );

  return res.rows[0] || null;
}

// Update user field safely
async function updateUserField(discordId, field, value) {
  return query(
    `UPDATE users SET ${field}=$1 WHERE discord_id=$2`,
    [value, discordId]
  );
}

// =====================
// EXPORT
// =====================
export default {
  query,
  createUserIfNotExists,
  getUser,
  updateUserField
};