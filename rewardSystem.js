import crypto from "crypto";
import pool from "./database.js";
import { runCommand } from "./rconHandler.js";

// =====================
// HASH (ANTI DUPE)
// =====================
function makeHash(discordId, cmd) {
  return crypto
    .createHash("sha256")
    .update(discordId + cmd)
    .digest("hex");
}

// =====================
// GIVE OR QUEUE
// =====================
export async function deliverReward(discordId, mcName, cmd) {
  const finalCmd = cmd.replace("{player}", mcName);
  const hash = makeHash(discordId, finalCmd);

  // anti-dupe check
  const check = await pool.query(
    "SELECT 1 FROM delivered_rewards WHERE reward_hash=$1",
    [hash]
  );

  if (check.rows.length > 0) return;

  try {
    await runCommand(finalCmd);

    await pool.query(
      "INSERT INTO delivered_rewards (reward_hash) VALUES ($1)",
      [hash]
    );

    console.log("⚡ Delivered:", finalCmd);
  } catch (err) {
    // =====================
    // QUEUE IF OFFLINE
    // =====================
    await pool.query(
      `INSERT INTO reward_queue
       (discord_id, minecraft_name, command, status, reward_hash, created_at)
       VALUES ($1,$2,$3,'pending',$4,$5)`,
      [discordId, mcName, finalCmd, hash, Date.now()]
    );

    console.log("📦 Queued (RCON offline):", finalCmd);
  }
}

// =====================
// BACKGROUND WORKER
// =====================
export function startRewardWorker() {
  setInterval(async () => {
    try {
      const res = await pool.query(
        "SELECT * FROM reward_queue WHERE status='pending' LIMIT 20"
      );

      for (const row of res.rows) {
        try {
          await runCommand(row.command);

          await pool.query(
            "UPDATE reward_queue SET status='delivered' WHERE id=$1",
            [row.id]
          );

          console.log("🔁 Sent queued reward:", row.command);
        } catch (e) {
          // still offline → ignore
        }
      }
    } catch (err) {
      console.log("⚠️ Worker DB error (ignored)");
    }
  }, 5000);
}
