import crypto from "crypto";
import pool from "./database.js";
import { runCommand } from "./rconHandler.js";

// =====================
// HASH (REAL ANTI-DUPE FIX)
// =====================
function makeHash(discordId, cmd) {
  return crypto
    .createHash("sha256")
    .update(discordId + "|" + cmd)
    .digest("hex");
}

// =====================
// MAIN DELIVERY FUNCTION
// =====================
export async function deliverReward(discordId, mcName, cmd) {
  const finalCmd = cmd.replace("{player}", mcName);
  const hash = makeHash(discordId, finalCmd);

  try {
    // CHECK DUPLICATE
    const check = await pool.query(
      "SELECT 1 FROM delivered_rewards WHERE reward_hash=$1",
      [hash]
    );

    if (check.rows.length > 0) {
      return false; // already given
    }

    // TRY GIVE IN GAME
    await runCommand(finalCmd);

    // SAVE AS DELIVERED
    await pool.query(
      "INSERT INTO delivered_rewards (reward_hash) VALUES ($1)",
      [hash]
    );

    console.log("⚡ DELIVERED:", finalCmd);
    return true;

  } catch (e) {
    // IF SERVER OFFLINE → QUEUE IT
    await pool.query(
      `INSERT INTO reward_queue
      (discord_id, minecraft_name, command, status, reward_hash, created_at)
      VALUES ($1,$2,$3,'pending',$4,$5)`,
      [discordId, mcName, finalCmd, hash, Date.now()]
    );

    console.log("📦 QUEUED:", finalCmd);
    return false;
  }
}

// =====================
// SAFE WORKER (NO CRASH LOOP)
// =====================
export function startRewardWorker() {
  setInterval(async () => {
    try {
      const res = await pool.query(
        `SELECT * FROM reward_queue
         WHERE status='pending'
         ORDER BY created_at ASC
         LIMIT 20`
      );

      for (const row of res.rows) {
        try {
          await runCommand(row.command);

          await pool.query(
            "UPDATE reward_queue SET status='delivered' WHERE id=$1",
            [row.id]
          );

          console.log("🎁 SENT QUEUED:", row.command);

        } catch (e) {
          // still offline → keep pending
          console.log("⏳ RETRY LATER:", row.command);
        }
      }

    } catch (err) {
      console.error("WORKER ERROR:", err.message);
    }

  }, 5000);
}