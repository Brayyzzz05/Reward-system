import { db } from "../index.js";
import { logError } from "../utils/logger.js";

// =====================
// BUY SYSTEM
// =====================
export async function buyItem(userId, item, amount = 1) {
  try {
    const res = await db.query(
      `SELECT * FROM user_stats WHERE discord_id=$1`,
      [userId]
    );

    const user = res.rows[0];

    if (!user) {
      return "❌ No stats found";
    }

    const costMap = {
      spin: 20,
      spin5: 80,
      luck1: 100,
      luck5: 400
    };

    const totalCost = costMap[item] * amount;

    if (!totalCost) {
      return "❌ Invalid item";
    }

    if (user.messages < totalCost) {
      return `❌ Not enough messages. Need ${totalCost}`;
    }

    // =====================
    // APPLY PURCHASE
    // =====================
    let updateQuery = "";

    switch (item) {
      case "spin":
        updateQuery = `spins = spins + ${amount}`;
        break;

      case "spin5":
        updateQuery = `spins = spins + ${5 * amount}`;
        break;

      case "luck1":
        updateQuery = `luck = luck + ${amount}`;
        break;

      case "luck5":
        updateQuery = `luck = luck + ${5 * amount}`;
        break;

      default:
        return "❌ Unknown item";
    }

    await db.query(
      `UPDATE user_stats
       SET messages = messages - $1,
           ${updateQuery}
       WHERE discord_id = $2`,
      [totalCost, userId]
    );

    return `✅ Purchased ${item} x${amount}`;

  } catch (err) {
    logError("buyItem()", err);
    return "❌ Shop error";
  }
}

// =====================
// STATS SYSTEM
// =====================
export async function getStats(userId) {
  try {
    const res = await db.query(
      `SELECT * FROM user_stats WHERE discord_id=$1`,
      [userId]
    );

    const u = res.rows[0];

    if (!u) return null;

    return u;

  } catch (err) {
    logError("getStats()", err);
    return null;
  }
}