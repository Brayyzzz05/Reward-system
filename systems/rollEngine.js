import config from "../config.js";

export async function rollReward(userId, mcName) {
  const pool = config.reward.pool;

  const total = pool.reduce((a, b) => a + b.chance, 0);

  let roll = Math.random() * total;

  for (const r of pool) {
    roll -= r.chance;

    if (roll <= 0) {
      return {
        cmd: r.cmd.replaceAll("{player}", mcName)
      };
    }
  }

  return {
    cmd: pool[0].cmd.replaceAll("{player}", mcName)
  };
}