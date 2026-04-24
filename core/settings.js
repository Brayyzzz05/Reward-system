import db from "./database.js";

// SET value (create or update)
export async function setSetting(key, value) {
  await db.query(
    `INSERT INTO settings(key, value)
     VALUES($1,$2)
     ON CONFLICT (key) DO UPDATE SET value=$2`,
    [key, value]
  );
}

// GET value
export async function getSetting(key, fallback = null) {
  const res = await db.query(
    "SELECT value FROM settings WHERE key=$1",
    [key]
  );

  return res.rows[0]?.value ?? fallback;
}
