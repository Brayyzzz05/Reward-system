import { buyItem } from "../systems/shopSystem.js";

export function registerShopCommands(client) {
  client.on("messageCreate", async (msg) => {
    if (!msg.content.startsWith("!shop")) return;

    const args = msg.content.split(" ");

    if (args[1] === "buy") {
      const res = await buyItem(msg.author.id, args[3], args[2]);
      msg.reply(res);
    }

    if (args[1] === "list") {
      msg.reply("🛒 diamond (100), netherite (500), elytra (2000)");
    }
  });
}
