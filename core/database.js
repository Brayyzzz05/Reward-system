import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export async function initDatabase() {
  const client = await pool.connect();
  console.log("📦 Database connected");
  client.release();
}

export default {
  query: (text, params) => pool.query(text, params)
};
