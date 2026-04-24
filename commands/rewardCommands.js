import { deliverReward } from "../systems/rewardSystem.js";

export function registerRewardCommands(client) {
  client.on("messageCreate", async (msg) => {
    if (!msg.content.startsWith("!reward")) return;

    const mc = msg.content.split(" ")[1];

    await deliverReward(msg.author.id, mc, "give {player} bread 3");

    msg.reply("🎁 Reward processing...");
  });
}
