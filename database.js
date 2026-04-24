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
// POOL CONFIG (SAFE FOR RAILWAY)
// =====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // IMPORTANT: fixes Railway + cloud DB issues
  ssl: {
    rejectUnauthorized: false
  },

  max: 10,              // connection limit
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// =====================
// AUTO CONNECT TEST
// =====================
pool.connect()
  .then(client => {
    console.log("✅ Database connected successfully");
    client.release();
  })
  .catch(err => {
    console.error("❌ Database connection failed:", err.message);
  });

// =====================
// SELF-HEAL QUERY WRAPPER
// =====================
async function query(text, params) {
  for (let i = 0; i < 3; i++) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      console.warn(`DB retry ${i + 1}:`, err.message);

      // wait before retry
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }

  throw new Error("Database failed after retries");
}

// =====================
// EXPORT
// =====================
export default {
  query
};