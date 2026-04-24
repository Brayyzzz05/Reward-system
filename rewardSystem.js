import crypto from "crypto";
import pool from "./database.js";
import { runCommand } from "./rconHandler.js";

// =====================
// HASH
// =====================
function hash(id, cmd) {
  return crypto.createHash("sha256").update(id + cmd).digest("hex");
}

// =====================
// GIVE REWARD
// =====================
export async function deliverReward(discordId, mcName, cmd) {
  const final = cmd.replace("{player}", mcName);
  const h = hash(discordId, final);

  try {
    const check = await pool.query(
      "SELECT 1 FROM delivered_rewards WHERE reward_hash=$1",
      [h]
    );

    if (check.rows.length) return;

    await runCommand(final);

    await pool.query(
      "INSERT INTO delivered_rewards (reward_hash) VALUES ($1)",
      [h]
    );

  } catch {
    await pool.query(
      `INSERT INTO reward_queue
      (discord_id, minecraft_name, command, status, reward_hash, created_at)
      VALUES ($1,$2,$3,'pending',$4,$5)`,
      [discordId, mcName, final, h, Date.now()]
    );
  }
}

// =====================
// WORKER
// =====================
export function startRewardWorker() {
  setInterval(async () => {
    try {
      const res = await pool.query(
        "SELECT * FROM reward_queue WHERE status='pending' LIMIT 20"
      );

      for (const r of res.rows) {
        try {
          await runCommand(r.command);

          await pool.query(
            "UPDATE reward_queue SET status='delivered' WHERE id=$1",
            [r.id]
          );

        } catch {}
      }

    } catch (err) {
      console.error("Worker error:", err);
    }
  }, 5000);
}