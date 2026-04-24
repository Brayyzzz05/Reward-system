import db from "../core/database.js";
import { deliverReward } from "./rewardSystem.js";

export const shopItems = {
  diamond: { price: 100, command: "give {player} diamond 1" },
  netherite: { price: 500, command: "give {player} netherite_ingot 1" },
  elytra: { price: 2000, command: "give {player} elytra 1" }
};

export async function buyItem(discordId, mcName, item) {
  const shop = shopItems[item];
  if (!shop) return "❌ Item not found";

  const user = await db.query(
    "SELECT coins FROM users WHERE discord_id=$1",
    [discordId]
  );

  const coins = user.rows[0]?.coins || 0;

  if (coins < shop.price) return "❌ Not enough coins";

  await db.query(
    "UPDATE users SET coins = coins - $1 WHERE discord_id=$2",
    [shop.price, discordId]
  );

  await deliverReward(discordId, mcName, shop.command);

  return `✅ Bought ${item}`;
}
