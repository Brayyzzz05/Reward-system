import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";

import { initDatabase } from "./core/database.js";
import { connectRcon } from "./core/rconHandler.js";
import { startRewardWorker } from "./systems/rewardQueueWorker.js";

import { registerAdminCommands } from "./commands/adminCommands.js";
import { registerRewardCommands } from "./commands/rewardCommands.js";
import { registerShopCommands } from "./commands/shopCommands.js";

console.log("🚀 Starting bot...");

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// INIT SYSTEMS
await initDatabase();
await connectRcon();
startRewardWorker();

// COMMANDS
registerAdminCommands(client);
registerRewardCommands(client);
registerShopCommands(client);

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(process.env.TOKEN);
