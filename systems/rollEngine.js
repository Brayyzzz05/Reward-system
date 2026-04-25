import config from "../config.js";
import { logError } from "../utils/logger.js";

// =====================
// WEIGHTED ROLL
// =====================
export async function rollReward(userId, mcName) {
  try {
    const pool = config.reward.pool;

    const totalWeight = pool.reduce((sum, r) => sum + r.chance, 0);

    let roll = Math.random() * totalWeight;

    for (const reward of pool) {
      roll -= reward.chance;

      if (roll <= 0) {
        return {
          cmd: reward.cmd.replaceAll("{player}", mcName)
        };
      }
    }

    // fallback (should never hit)
    return {
      cmd: pool[0].cmd.replaceAll("{player}", mcName)
    };

  } catch (err) {
    logError("rollReward()", err);
    throw err;
  }
}