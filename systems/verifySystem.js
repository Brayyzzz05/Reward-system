import db from "../core/database.js";

// =====================
// LINK MC ACCOUNT
// =====================
export async function verifyMC(discordId, mcName) {
  await db.query(
    `INSERT INTO mc_verifications(discord_id, mc_name, verified_at)
     VALUES($1,$2,$3)
     ON CONFLICT (discord_id)
     DO UPDATE SET mc_name=$2, verified_at=$3`,
    [discordId, mcName, Date.now()]
  );
}

// =====================
// GET MC NAME
// =====================
export async function getMCName(discordId) {
  const res = await db.query(
    "SELECT mc_name FROM mc_verifications WHERE discord_id=$1",
    [discordId]
  );

  return res.rows[0]?.mc_name || null;
}

// =====================
// CHECK IF VERIFIED
// =====================
export async function isVerified(discordId) {
  const res = await db.query(
    "SELECT 1 FROM mc_verifications WHERE discord_id=$1",
    [discordId]
  );

  return res.rows.length > 0;
}
