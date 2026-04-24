import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

// =====================
// DATABASE CONNECTION
// =====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// =====================
// TEST CONNECTION
// =====================
pool.connect()
  .then(() => console.log("🟢 Database connected"))
  .catch(err => console.error("🔴 DB connection error:", err));

// =====================
// VERIFY SYSTEM
// =====================

// Save MC name
export async function verifyMC(discordId, mcName) {
  await pool.query(
    `INSERT INTO verified_users (discord_id, mc_name)
     VALUES ($1, $2)
     ON CONFLICT (discord_id)
     DO UPDATE SET mc_name = EXCLUDED.mc_name`,
    [discordId, mcName]
  );
}

// Get MC name
export async function getMCName(discordId) {
  const res = await pool.query(
    `SELECT mc_name FROM verified_users WHERE discord_id=$1`,
    [discordId]
  );

  return res.rows[0]?.mc_name || null;
}

// =====================
// REWARD LOGGING
// =====================
export async function logReward(discordId, mcName, reward) {
  await pool.query(
    `INSERT INTO reward_logs (discord_id, mc_name, reward, time)
     VALUES ($1, $2, $3, NOW())`,
    [discordId, mcName, reward]
  );
}

export default pool;
