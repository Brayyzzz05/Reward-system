import { deliverReward } from "../systems/rewardSystem.js";

export function registerAdminCommands(client) {
  client.on("messageCreate", async (msg) => {
    if (!msg.content.startsWith("!admin")) return;

    const args = msg.content.split(" ");

    if (args[1] === "give") {
      await deliverReward(args[2], args[3], args.slice(4).join(" "));
      msg.reply("✅ Sent");
    }
  });
}
