import db from "../core/database.js";
import { runCommand } from "../core/rconHandler.js";
import crypto from "crypto";

function hash(id, cmd) {
  return crypto.createHash("sha256").update(id + cmd).digest("hex");
}

export async function deliverReward(discordId, mcName, cmd) {
  const finalCmd = cmd.replace("{player}", mcName);
  const rewardHash = hash(discordId, finalCmd);

  const exists = await db.query(
    "SELECT 1 FROM delivered_rewards WHERE reward_hash=$1",
    [rewardHash]
  );

  if (exists.rows.length) return;

  try {
    await runCommand(finalCmd);

    await db.query(
      "INSERT INTO delivered_rewards (reward_hash) VALUES ($1)",
      [rewardHash]
    );

    console.log("⚡ Delivered:", finalCmd);
  } catch {
    await db.query(
      `INSERT INTO reward_queue 
      (discord_id, minecraft_name, command, status, reward_hash, created_at)
      VALUES ($1,$2,$3,'pending',$4,$5)`,
      [discordId, mcName, finalCmd, rewardHash, Date.now()]
    );

    console.log("📦 Queued:", finalCmd);
  }
}
