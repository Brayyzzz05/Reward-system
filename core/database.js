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
// CONNECT TEST
// =====================
pool.connect()
  .then(() => console.log("🟢 Database connected"))
  .catch(err => console.error("🔴 DB connection error:", err));

// =====================
// AUTO CREATE TABLES (IMPORTANT FIX)
// =====================
async function initDB() {
  try {
    // =====================
    // VERIFIED USERS
    // =====================
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mc_verifications (
        discord_id TEXT PRIMARY KEY,
        minecraft_username TEXT NOT NULL
      );
    `);

    // =====================
    // REWARD LOGS
    // =====================
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reward_logs (
        id SERIAL PRIMARY KEY,
        discord_id TEXT,
        minecraft_username TEXT,
        reward TEXT,
        time TIMESTAMP DEFAULT NOW()
      );
    `);

    // =====================
    // SHOP TRANSACTIONS
    // =====================
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shop_transactions (
        id SERIAL PRIMARY KEY,
        discord_id TEXT,
        item TEXT,
        amount INT,
        time TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("🟢 Database tables ready");

  } catch (err) {
    console.error("🔴 DB init error:", err);
  }
}

initDB();

// =====================
// VERIFY SYSTEM
// =====================

// Save MC name
export async function verifyMC(discordId, mcName) {
  await pool.query(
    `INSERT INTO mc_verifications (discord_id, minecraft_username)
     VALUES ($1, $2)
     ON CONFLICT (discord_id)
     DO UPDATE SET minecraft_username = EXCLUDED.minecraft_username`,
    [discordId, mcName]
  );
}

// Get MC name
export async function getMCName(discordId) {
  const res = await pool.query(
    `SELECT minecraft_username FROM mc_verifications WHERE discord_id=$1`,
    [discordId]
  );

  return res.rows[0]?.minecraft_username || null;
}

// =====================
// REWARD LOGGING
// =====================
export async function logReward(discordId, mcName, reward) {
  await pool.query(
    `INSERT INTO reward_logs (discord_id, minecraft_username, reward, time)
     VALUES ($1, $2, $3, NOW())`,
    [discordId, mcName, reward]
  );
}

// =====================
// SHOP LOGGING (NEW)
// =====================
export async function logShop(discordId, item, amount) {
  await pool.query(
    `INSERT INTO shop_transactions (discord_id, item, amount, time)
     VALUES ($1, $2, $3, NOW())`,
    [discordId, item, amount]
  );
}

export default pool;