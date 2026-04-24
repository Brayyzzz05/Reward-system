import config from "../config.js";
import { deliverReward } from "./rewardSystem.js";

// =====================
// MAIN ROLL ENGINE
// =====================
export async function rollReward(discordId, mcName) {
  const pool = config.reward.pool;

  // 1. total weight
  const totalWeight = pool.reduce((sum, item) => sum + item.chance, 0);

  // 2. random roll
  let roll = Math.random() * totalWeight;

  let selected = pool[0];

  // 3. weighted selection
  for (const item of pool) {
    if (roll < item.chance) {
      selected = item;
      break;
    }
    roll -= item.chance;
  }

  // 4. handle multi-command or single command
  const commands = Array.isArray(selected.cmd)
    ? selected.cmd
    : [selected.cmd];

  for (const cmd of commands) {
    const finalCmd = cmd.replace("{player}", mcName);
    await deliverReward(discordId, mcName, finalCmd);
  }

  return selected;
}
