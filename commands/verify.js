import { db } from "../index.js";

// =====================
// GET MC NAME
// =====================
export async function getMCName(discordId) {
  try {
    const res = await db.query(
      "SELECT minecraft_username FROM mc_verifications WHERE discord_id = $1",
      [discordId]
    );

    return res.rows[0]?.minecraft_username || null;

  } catch (err) {
    console.error("VERIFY SYSTEM ERROR:", err);
    return null;
  }
}

// =====================
// LINK ACCOUNT
// =====================
export async function linkMC(discordId, mcName) {
  try {
    await db.query(
      `INSERT INTO mc_verifications (discord_id, minecraft_username)
       VALUES ($1, $2)
       ON CONFLICT (discord_id)
       DO UPDATE SET minecraft_username = EXCLUDED.minecraft_username`,
      [discordId, mcName]
    );

    return true;

  } catch (err) {
    console.error("LINK ERROR:", err);
    return false;
  }
}